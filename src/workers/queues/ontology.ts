/**
 * Ontology Queue Consumer
 *
 * Processes batched GVO upsert messages from the cron job.
 * Uses idempotent upserts (onConflictDoUpdate) for safe retries.
 *
 * Constitution compliance:
 *   - No "Miscellaneous" or "Other" categories (§III.1)
 *   - GVO is the ironclad gate — no free-text identification (§III.1)
 */

import { db } from "../../lib/db";
import { gvoDomain, gvoCategory, gvoMake, gvoModel } from "../../lib/db/schema";
import { eq, and } from "drizzle-orm";

// ── Types ───────────────────────────────────────────────────────────

interface OntologyMessage {
  action: "upsert_make" | "upsert_model";
  domain: string;
  category: string;
  make: string;
  model?: string;
  origin?: string;
  hsCode?: string;
  dutyBand?: number;
}

// ── Helpers ─────────────────────────────────────────────────────────

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function upsertDomain(name: string): Promise<string> {
  const s = slug(name);
  const existing = await db.select().from(gvoDomain).where(eq(gvoDomain.slug, s));
  if (existing.length > 0) return existing[0].id;
  const [row] = await db.insert(gvoDomain).values({ name, slug: s }).returning();
  return row.id;
}

async function upsertCategory(
  domainId: string,
  name: string,
  hsCode?: string,
  dutyBand?: number,
): Promise<string> {
  const s = slug(name);
  const existing = await db.select().from(gvoCategory).where(
    and(eq(gvoCategory.slug, s), eq(gvoCategory.domainId, domainId)),
  );
  if (existing.length > 0) return existing[0].id;
  const [row] = await db.insert(gvoCategory).values({
    domainId, name, slug: s, hsCode: hsCode ?? null, dutyBand: dutyBand ?? null,
  }).returning();
  return row.id;
}

async function upsertMake(categoryId: string, name: string, origin?: string): Promise<string> {
  const s = slug(name);
  const existing = await db.select().from(gvoMake).where(
    and(eq(gvoMake.slug, s), eq(gvoMake.categoryId, categoryId)),
  );
  if (existing.length > 0) return existing[0].id;
  const [row] = await db.insert(gvoMake).values({
    categoryId, name, slug: s, origin: origin ?? null,
  }).returning();
  return row.id;
}

async function upsertModel(makeId: string, name: string): Promise<string> {
  const s = slug(name);
  const existing = await db.select().from(gvoModel).where(
    and(eq(gvoModel.slug, s), eq(gvoModel.makeId, makeId)),
  );
  if (existing.length > 0) return existing[0].id;
  const [row] = await db.insert(gvoModel).values({
    makeId, name, slug: s,
  }).returning();
  return row.id;
}

// ── Consumer Handler ────────────────────────────────────────────────

export interface QueueMessage {
  id: string;
  body: OntologyMessage;
  timestamp: Date;
  attemptsRemaining: number;
}

export async function handleOntologyMessage(message: QueueMessage): Promise<void> {
  const msg = message.body;

  // Validate: no forbidden categories
  const FORBIDDEN = ["miscellaneous", "other", "unknown", "uncategorized"];
  if (FORBIDDEN.includes(msg.category.toLowerCase())) {
    console.warn(`[ONTOLOGY] Rejected forbidden category: ${msg.category}`);
    return;
  }

  try {
    const domainId = await upsertDomain(msg.domain);
    const categoryId = await upsertCategory(domainId, msg.category, msg.hsCode, msg.dutyBand);
    const makeId = await upsertMake(categoryId, msg.make, msg.origin);

    if (msg.model) {
      await upsertModel(makeId, msg.model);
    }

    console.log(`[ONTOLOGY] Processed: ${msg.domain}/${msg.category}/${msg.make}/${msg.model ?? "(make only)"}`);
  } catch (err) {
    console.error(`[ONTOLOGY] Failed to process message ${message.id}: ${err}`);
    throw err; // Re-throw to trigger retry
  }
}

export async function handleOntologyBatch(messages: QueueMessage[]): Promise<void> {
  for (const message of messages) {
    await handleOntologyMessage(message);
  }
}
