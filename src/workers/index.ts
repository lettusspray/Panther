/**
 * Pipeline Worker entry point — deployable to Cloudflare Workers.
 *
 * Exports `scheduled` (nightly cron: ontology/pricing/knowledge/crawl4ai),
 * `queue` (consumers for the four queues), and a `fetch` health probe.
 *
 * Env hydration: Cloudflare passes bindings via `env`; this worker copies
 * them onto globalThis.__WORKER_ENV__ (before any pipeline runs) so the
 * shared `readEnv()` helper in src/lib/env.ts can resolve them. Hyperdrive
 * is exposed as `env.HYPERDRIVE.connectionString` and re-exposed as
 * HYPERDRIVE_CONNECTION_STRING for the shared DB layer.
 *
 * Deploy:  npx wrangler deploy -c wrangler.workers.toml
 */

import cron from "./cron";
import { handleOntologyBatch } from "./queues/ontology";
import { handlePricingBatch } from "./queues/pricing";
import { handleKnowledgeBatch } from "./queues/knowledge";
import { handleDeadLetterBatch } from "./queues/dead-letter";

type QueueMessage = {
  id: string;
  body: unknown;
  timestamp: Date;
  attemptsRemaining: number;
};

function hydrate(env: Record<string, unknown>): void {
  const hydrated: Record<string, unknown> = { ...env };
  const hyperdrive = env.HYPERDRIVE as { connectionString?: string } | undefined;
  if (hyperdrive?.connectionString) {
    hydrated.HYPERDRIVE_CONNECTION_STRING = hyperdrive.connectionString;
  }
  (globalThis as { __WORKER_ENV__?: Record<string, unknown> }).__WORKER_ENV__ = hydrated;
}

export default {
  async scheduled(event: unknown, env: Record<string, unknown>): Promise<void> {
    hydrate(env);
    await (cron as { scheduled: (e: unknown, env: unknown) => Promise<void> }).scheduled(event, env);
  },

  async queue(
    batch: { queue: string; messages: QueueMessage[] },
    env: Record<string, unknown>,
  ): Promise<void> {
    hydrate(env);
    const messages = batch.messages;
    switch (batch.queue) {
      case "ingestion-ontology":
        await handleOntologyBatch(messages as never);
        break;
      case "ingestion-pricing":
        await handlePricingBatch(messages as never);
        break;
      case "etl-knowledge":
        await handleKnowledgeBatch(messages as never);
        break;
      case "dead-letter":
        await handleDeadLetterBatch(messages as never);
        break;
      default:
        console.error(`[WORKER] Unknown queue: ${batch.queue}`);
    }
  },

  async fetch(): Promise<Response> {
    return new Response("panther-pipeline-ok", { status: 200 });
  },
};
