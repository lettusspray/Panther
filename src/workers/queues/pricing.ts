/**
 * Pricing Queue Consumer
 *
 * Processes batched cohort pricing updates from the cron job.
 * Each message contains pricing data for a specific trim+year cohort.
 *
 * Constitution compliance:
 *   - No VIN-level pricing — cohort-level only (§III.2)
 *   - effectiveTimestamp set on all updates for staleness tracking (§II.2)
 */

import { db } from "../../lib/db";
import { cohortPricing } from "../../lib/db/schema";
import { eq, and } from "drizzle-orm";

// ── Types ───────────────────────────────────────────────────────────

interface PricingMessage {
  trimId: string;
  modelYear: number;
  fobLowUsd: number;
  fobHighUsd: number;
  source: string;
}

// ── Consumer Handler ────────────────────────────────────────────────

export interface QueueMessage {
  id: string;
  body: PricingMessage;
  timestamp: Date;
  attemptsRemaining: number;
}

async function upsertCohortPricing(
  trimId: string,
  modelYear: number,
  fobLowUsd: number,
  fobHighUsd: number,
  source: string,
): Promise<void> {
  const existing = await db
    .select()
    .from(cohortPricing)
    .where(
      and(
        eq(cohortPricing.trimId, trimId),
        eq(cohortPricing.modelYear, modelYear),
      ),
    );

  if (existing.length > 0) {
    await db.update(cohortPricing)
      .set({
        fobLowUsd: String(fobLowUsd),
        fobHighUsd: String(fobHighUsd),
        source,
        fetchedAt: new Date(),
      })
      .where(
        and(
          eq(cohortPricing.trimId, trimId),
          eq(cohortPricing.modelYear, modelYear),
        ),
      );
  } else {
    await db.insert(cohortPricing).values({
      trimId,
      modelYear,
      fobLowUsd: String(fobLowUsd),
      fobHighUsd: String(fobHighUsd),
      source,
      fetchedAt: new Date(),
    });
  }
}

export async function handlePricingMessage(message: QueueMessage): Promise<void> {
  const msg = message.body;

  // Validate FOB ranges
  if (msg.fobLowUsd < 0 || msg.fobHighUsd < 0) {
    console.warn(`[PRICING] Rejected negative FOB values for trim ${msg.trimId} year ${msg.modelYear}`);
    return;
  }

  if (msg.fobLowUsd > msg.fobHighUsd) {
    console.warn(`[PRICING] FOB low > high for trim ${msg.trimId} year ${msg.modelYear}, swapping`);
    [msg.fobLowUsd, msg.fobHighUsd] = [msg.fobHighUsd, msg.fobLowUsd];
  }

  try {
    await upsertCohortPricing(
      msg.trimId,
      msg.modelYear,
      msg.fobLowUsd,
      msg.fobHighUsd,
      msg.source,
    );

    console.log(`[PRICING] Updated: trim=${msg.trimId} year=${msg.modelYear} FOB=$${msg.fobLowUsd}-$${msg.fobHighUsd}`);
  } catch (err) {
    console.error(`[PRICING] Failed to process message ${message.id}: ${err}`);
    throw err;
  }
}

export async function handlePricingBatch(messages: QueueMessage[]): Promise<void> {
  for (const message of messages) {
    await handlePricingMessage(message);
  }
}
