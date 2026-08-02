/**
 * Batch Crawler for trucksbuses.com — Indian 3-Wheelers
 *
 * Fetches overview + specs pages via Crawl4AI (Cloudflare bypass).
 * Slow and respectful: 2 concurrent, 3s delay between batches.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/batch-trucksbuses.ts [start] [end]
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, and, ilike } from "drizzle-orm";
import { gvoMake, gvoModel, gvoTrim, knowledgeEntry } from "../src/lib/db/schema";
import { loadUrls, fetchBatch } from "../src/lib/data/trucksbuses";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function findMake(brand: string) {
  const s = slug(brand);
  const exact = await db.select({ id: gvoMake.id, categoryId: gvoMake.categoryId }).from(gvoMake).where(eq(gvoMake.slug, s)).limit(1);
  if (exact.length > 0) return exact[0];
  const fuzzy = await db.select({ id: gvoMake.id, categoryId: gvoMake.categoryId }).from(gvoMake).where(ilike(gvoMake.name, `%${brand}%`)).limit(1);
  return fuzzy.length > 0 ? fuzzy[0] : null;
}

async function findOrCreateModel(makeId: string, modelName: string) {
  const s = slug(modelName);
  const existing = await db.select({ id: gvoModel.id }).from(gvoModel).where(and(eq(gvoModel.slug, s), eq(gvoModel.makeId, makeId))).limit(1);
  if (existing.length > 0) return existing[0].id;
  const [row] = await db.insert(gvoModel).values({ makeId, name: modelName, slug: s }).returning();
  return row.id;
}

async function findOrCreateTrim(modelId: string, trimName: string) {
  const s = slug(trimName);
  const existing = await db.select({ id: gvoTrim.id }).from(gvoTrim).where(and(eq(gvoTrim.slug, s), eq(gvoTrim.modelId, modelId))).limit(1);
  if (existing.length > 0) return existing[0].id;
  const [row] = await db.insert(gvoTrim).values({ modelId, name: trimName, slug: s }).returning();
  return row.id;
}

async function upsertKnowledge(trimId: string, specs: Record<string, unknown>) {
  const existing = await db.select().from(knowledgeEntry).where(eq(knowledgeEntry.trimId, trimId)).limit(1);
  const merged = { ...(existing[0]?.specs as Record<string, unknown> ?? {}), ...specs, _source: "trucksbuses.com", _lastEnriched: new Date().toISOString() };
  if (existing.length > 0) {
    await db.update(knowledgeEntry).set({ specs: merged, computedAt: new Date() }).where(eq(knowledgeEntry.trimId, trimId));
  } else {
    await db.insert(knowledgeEntry).values({ trimId, warnings: [], specs: merged });
  }
}

async function main() {
  const allUrls = loadUrls("/tmp/trucksbuses-3w-urls.txt");
  const startIdx = parseInt(process.argv[2] ?? "0", 10);
  const endIdx = parseInt(process.argv[3] ?? Math.min(allUrls.length, 50).toString(), 10);
  const urls = allUrls.slice(startIdx, endIdx);
  console.log(`=== trucksbuses.com 3-Wheeler Crawler ===`);
  console.log(`Total pool: ${allUrls.length} | Batch: ${startIdx}–${endIdx - 1}\n`);

  const CONCURRENCY = 2;
  const DELAY_MS = 3000;
  let created = 0, errors = 0;

  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const batch = urls.slice(i, i + CONCURRENCY);
    const results = await fetchBatch(batch, 1, 0);

    for (const r of results) {
      if (!r.specs) { errors++; continue; }
      try {
        const s = r.specs;
        let makeInfo = await findMake(s.brand);
        if (!makeInfo) {
          // Use tricycle/passenger category for new brands
          const tricycleCat = await sql`SELECT id FROM gvo_category WHERE slug = 'passenger' AND domain_id = (SELECT id FROM gvo_domain WHERE slug = 'tricycle') LIMIT 1`;
          const catId = tricycleCat[0]?.id;
          if (!catId) { errors++; continue; }
          const [row] = await db.insert(gvoMake).values({ categoryId: catId, name: s.brand, slug: slug(s.brand), origin: "India" }).returning();
          makeInfo = { id: row.id, categoryId: catId };
        }
        const modelId = await findOrCreateModel(makeInfo.id, s.model_name);
        const trimName = s.fuel_type ? `${s.fuel_type} ${s.vehicle_type}` : s.vehicle_type;
        const trimId = await findOrCreateTrim(modelId, trimName);
        await upsertKnowledge(trimId, s as unknown as Record<string, unknown>);
        created++;
        if (created % 10 === 0) console.log(`  ✓ ${created} created/updated...`);
      } catch (err) {
        errors++;
        console.error(`  ✗ ${r.url}: ${(err as Error).message.slice(0, 80)}`);
      }
    }
    if (i + CONCURRENCY < urls.length) await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  const totalKe = await db.select().from(knowledgeEntry);
  console.log(`\n=== Summary ===`);
  console.log(`${created} created/updated, ${errors} errors`);
  console.log(`Total knowledge entries: ${totalKe.length}`);
}

main().catch(console.error);
