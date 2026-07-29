/**
 * Cron Trigger Entry Point
 *
 * Runs nightly at 02:00 UTC via Cloudflare Cron Triggers.
 * Dispatches to four ingestion pipelines in parallel:
 *   1. Ontology (NHTSA vPIC + auto.dev → GVO)
 *   2. Pricing (auto.dev + FX → cohort_pricing + system_config)
 *   3. Knowledge (Groq ETL → knowledge_entry)
 *   4. Crawl4AI (ev-database.org + auto-data.net → knowledge_entry)
 *
 * Constitution compliance:
 *   - Silent failures are structurally banned (§V.1)
 *   - Failed jobs push to dead-letter queue (§V.1)
 *   - Each pipeline is isolated — one failure doesn't block others
 */

import { ingestOntology } from "./ingestion/ontology";
import { ingestPricing } from "./ingestion/pricing";
import { processKnowledgeBatch } from "./ingestion/knowledge";
import { runCrawl4AiEnrichment } from "./ingestion/crawl4ai";

// ── Types (Cloudflare Worker scheduled event) ───────────────────────

interface ScheduledEvent {
  scheduledTime: number;
  cron: string;
}

interface Env {
  ONTOLOGY_QUEUE: Queue;
  PRICING_QUEUE: Queue;
  KNOWLEDGE_QUEUE: Queue;
  DEAD_LETTER_QUEUE: Queue;
}

interface Queue {
  send(message: unknown): Promise<void>;
  sendBatch(messages: { body: unknown }[]): Promise<void>;
}

// ── Cron Handler ────────────────────────────────────────────────────

export default {
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    const startTime = Date.now();
    const results = {
      ontology: { ok: false, error: "" },
      pricing: { ok: false, error: "" },
      knowledge: { ok: false, error: "" },
      crawl4ai: { ok: false, error: "" },
    };

    console.log(`[CRON] Starting nightly ingestion at ${new Date(event.scheduledTime).toISOString()}`);

    // Run ontology + pricing in parallel (knowledge depends on ontology)
    const [ontologyResult, pricingResult] = await Promise.allSettled([
      runOntologyIngestion(),
      runPricingIngestion(),
    ]);

    if (ontologyResult.status === "fulfilled") {
      results.ontology.ok = true;
      console.log(`[CRON] Ontology: ${ontologyResult.value.makesAdded} makes, ${ontologyResult.value.modelsAdded} models`);
    } else {
      results.ontology.error = String(ontologyResult.reason);
      console.error(`[CRON] Ontology failed: ${results.ontology.error}`);
      await pushToDeadLetter(env, "ontology", results.ontology.error);
    }

    if (pricingResult.status === "fulfilled") {
      results.pricing.ok = true;
      console.log(`[CRON] Pricing: ${pricingResult.value.cohortsUpdated} cohorts updated`);
    } else {
      results.pricing.error = String(pricingResult.reason);
      console.error(`[CRON] Pricing failed: ${results.pricing.error}`);
      await pushToDeadLetter(env, "pricing", results.pricing.error);
    }

    // Knowledge ETL + Crawl4AI run after ontology/pricing (may depend on new trims)
    const [knowledgeResult, crawl4aiResult] = await Promise.allSettled([
      runKnowledgeEtl(),
      runCrawl4AiEnrichment(),
    ]);

    if (knowledgeResult.status === "fulfilled") {
      results.knowledge.ok = true;
      console.log(`[CRON] Knowledge: ${knowledgeResult.value.entriesProcessed} entries`);
    } else {
      results.knowledge.error = String(knowledgeResult.reason);
      console.error(`[CRON] Knowledge ETL failed: ${results.knowledge.error}`);
      await pushToDeadLetter(env, "knowledge", results.knowledge.error);
    }

    if (crawl4aiResult.status === "fulfilled") {
      results.crawl4ai.ok = true;
      console.log(`[CRON] Crawl4AI: ${crawl4aiResult.value.knowledgeEntriesUpserted} entries`);
    } else {
      results.crawl4ai.error = String(crawl4aiResult.reason);
      console.error(`[CRON] Crawl4AI enrichment failed: ${results.crawl4ai.error}`);
      await pushToDeadLetter(env, "crawl4ai", results.crawl4ai.error);
    }

    const elapsed = Date.now() - startTime;
    console.log(`[CRON] Completed in ${elapsed}ms`, results);

    // If ALL pipelines failed, throw to trigger Cloudflare's retry mechanism
    if (!results.ontology.ok && !results.pricing.ok && !results.knowledge.ok && !results.crawl4ai.ok) {
      throw new Error(`All cron pipelines failed: ${JSON.stringify(results)}`);
    }
  },
};

// ── Pipeline Runners ────────────────────────────────────────────────

async function runOntologyIngestion() {
  return await ingestOntology();
}

async function runPricingIngestion() {
  return await ingestPricing();
}

async function runKnowledgeEtl() {
  return await processKnowledgeBatch();
}

async function pushToDeadLetter(env: Env, pipeline: string, error: string): Promise<void> {
  try {
    await env.DEAD_LETTER_QUEUE.send({
      pipeline,
      error,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[CRON] Failed to push to dead-letter queue: ${err}`);
  }
}
