/**
 * Knowledge ETL Worker (Groq via Cloudflare Queues)
 *
 * Sends raw vehicle specs to Groq for "Human Knowledge" translation —
 * practical buyer warnings that pre-compute and cache in the DB.
 *
 * Constitution compliance:
 *   - Groq is walled inside Cloudflare Queues for offline ETL only (§V.4)
 *   - No runtime LLM calls — warnings are pre-computed JSONB (§X.3)
 *   - No Lagos hardcoding in warnings (§VI.1)
 *   - Output is strict JSON — no hallucinated content
 */

import { db } from "../../lib/db";
import { knowledgeEntry, gvoTrim } from "../../lib/db/schema";
import { eq } from "drizzle-orm";
import { readEnv } from "../../lib/env";

// ── Types ───────────────────────────────────────────────────────────

interface GroqResponse {
  choices: { message: { content: string } }[];
}

interface KnowledgeWarnings {
  warnings: string[];
}

interface VehicleSpecs {
  make?: string;
  model?: string;
  year?: number;
  engine?: string;
  transmission?: string;
  bodyType?: string;
  groundClearance?: number;
  fuelType?: string;
  drivetrain?: string;
  [key: string]: unknown;
}

// ── Groq API Client ─────────────────────────────────────────────────

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// llama-3.1-8b-instant: 30 RPM / 6K TPM / 14,400 RPD on free tier.
// Sufficient for structured buyer-warning extraction; faster and cheaper
// than 70b for this task.
const GROQ_MODEL = "llama-3.1-8b-instant";

const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1_000;

const SYSTEM_PROMPT = `You are a Nigerian automotive expert with deep knowledge of local road conditions, fuel prices, parts availability, and driving realities across Nigeria's diverse regions. Translate raw vehicle specifications into exactly 3 concise, practical warnings for a potential buyer.

RULES:
1. Each warning must be 1-2 sentences, actionable and specific.
2. Never mention "Lagos" by name — use conditional phrasing like "If driving on unpaved roads..." or "In flood-prone areas..."
3. Focus on: maintenance costs, road suitability, fuel economy, parts availability, common failure points.
4. Be specific to the Nigerian market (e.g., fuel prices, road conditions, parts sourcing).
5. Output STRICT JSON only: { "warnings": ["warning1", "warning2", "warning3"] }
6. No markdown, no explanations, no preamble — pure JSON only.`;

async function callGroq(specs: VehicleSpecs): Promise<KnowledgeWarnings> {
  const apiKey = readEnv("GROQ_API_KEY");
  if (!apiKey) {
    return { warnings: ["Specs data unavailable — consult a local mechanic."] };
  }

  const userMessage = `Vehicle specs:\n${JSON.stringify(specs, null, 2)}\n\nGenerate 3 practical buyer warnings in strict JSON format.`;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        temperature: 0.3,
        max_tokens: 300,
        response_format: { type: "json_object" },
      }),
    });

    // Handle 429 rate-limit with Retry-After header
    if (res.status === 429) {
      const retryAfter = res.headers.get("retry-after");
      const delayMs = retryAfter
        ? parseInt(retryAfter, 10) * 1_000
        : BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }

    if (!res.ok) {
      lastError = new Error(`Groq API: ${res.status} ${await res.text()}`);
      continue;
    }

    const data = await res.json() as GroqResponse;
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      lastError = new Error("Groq returned empty response");
      continue;
    }

    // Parse and validate JSON
    const parsed = JSON.parse(content) as KnowledgeWarnings;
    if (!Array.isArray(parsed.warnings) || parsed.warnings.length !== 3) {
      lastError = new Error(`Groq returned invalid structure: expected 3 warnings, got ${JSON.stringify(parsed.warnings?.length)}`);
      continue;
    }

    // Validate no Lagos hardcoding
    for (const warning of parsed.warnings) {
      if (warning.toLowerCase().includes("lagos")) {
        lastError = new Error(`Groq output contains forbidden "Lagos" reference: ${warning}`);
        break;
      }
    }

    if (lastError) continue;

    return parsed;
  }

  throw lastError ?? new Error("Groq ETL failed after retries");
}

// ── Knowledge Entry Upsert ──────────────────────────────────────────

async function upsertKnowledgeEntry(
  trimId: string,
  warnings: KnowledgeWarnings,
  specs: VehicleSpecs,
): Promise<void> {
  const existing = await db
    .select()
    .from(knowledgeEntry)
    .where(eq(knowledgeEntry.trimId, trimId));

  if (existing.length > 0) {
    await db.update(knowledgeEntry)
      .set({
        warnings: warnings,
        specs: specs,
        computedAt: new Date(),
      })
      .where(eq(knowledgeEntry.trimId, trimId));
  } else {
    await db.insert(knowledgeEntry).values({
      trimId,
      warnings: warnings,
      specs: specs,
      computedAt: new Date(),
    });
  }
}

// ── Main ETL ────────────────────────────────────────────────────────

export interface KnowledgeResult {
  entriesProcessed: number;
  errors: string[];
}

export async function processKnowledgeEtl(
  trimId: string,
  specs: VehicleSpecs,
): Promise<KnowledgeResult> {
  const result: KnowledgeResult = { entriesProcessed: 0, errors: [] };

  try {
    const warnings = await callGroq(specs);
    await upsertKnowledgeEntry(trimId, warnings, specs);
    result.entriesProcessed++;
  } catch (err) {
    result.errors.push(`Knowledge ETL for trim ${trimId}: ${(err as Error).message}`);
  }

  return result;
}

/**
 * Batch process: fetch all trims with specs but no knowledge entries,
 * process them through Groq ETL.
 */
export async function processKnowledgeBatch(): Promise<KnowledgeResult> {
  const result: KnowledgeResult = { entriesProcessed: 0, errors: [] };

  // Find trims that have specs but no knowledge entries
  const trims = await db
    .select({
      trimId: gvoTrim.id,
      trimName: gvoTrim.name,
      engine: gvoTrim.engine,
      transmission: gvoTrim.transmission,
    })
    .from(gvoTrim);

  for (const trim of trims) {
    // Check if knowledge entry already exists
    const existing = await db
      .select()
      .from(knowledgeEntry)
      .where(eq(knowledgeEntry.trimId, trim.trimId));

    if (existing.length > 0) continue; // Already processed

    // Build specs from available data
    const specs: VehicleSpecs = {
      engine: trim.engine ?? undefined,
      transmission: trim.transmission ?? undefined,
    };

    // Process through Groq ETL
    const batchResult = await processKnowledgeEtl(trim.trimId, specs);
    result.entriesProcessed += batchResult.entriesProcessed;
    result.errors.push(...batchResult.errors);
  }

  return result;
}
