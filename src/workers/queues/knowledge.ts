/**
 * Knowledge Queue Consumer (Groq ETL)
 *
 * Processes batched knowledge ETL messages — sends vehicle specs to Groq,
 * caches the "Human Knowledge" warnings as JSONB in the database.
 *
 * Constitution compliance:
 *   - Groq is walled inside Cloudflare Queues for offline ETL only (§V.4)
 *   - No runtime LLM calls — warnings are pre-computed (§X.3)
 *   - No Lagos hardcoding in warnings (§VI.1)
 *   - Output is strict JSON — no hallucinated content
 */

import { db } from "../../lib/db";
import { knowledgeEntry } from "../../lib/db/schema";
import { eq } from "drizzle-orm";

// ── Types ───────────────────────────────────────────────────────────

interface KnowledgeMessage {
  trimId: string;
  specs: Record<string, unknown>;
}

interface GroqResponse {
  choices: { message: { content: string } }[];
}

interface KnowledgeWarnings {
  warnings: string[];
}

// ── Groq API Client ─────────────────────────────────────────────────

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

const SYSTEM_PROMPT = `You are a Nigerian automotive expert with deep knowledge of local road conditions, fuel prices, parts availability, and driving realities across Nigeria's diverse regions. Translate raw vehicle specifications into exactly 3 concise, practical warnings for a potential buyer.

RULES:
1. Each warning must be 1-2 sentences, actionable and specific.
2. Never mention "Lagos" by name — use conditional phrasing like "If driving on unpaved roads..." or "In flood-prone areas..."
3. Focus on: maintenance costs, road suitability, fuel economy, parts availability, common failure points.
4. Be specific to the Nigerian market (e.g., fuel prices, road conditions, parts sourcing).
5. Output STRICT JSON only: { "warnings": ["warning1", "warning2", "warning3"] }
6. No markdown, no explanations, no preamble — pure JSON only.`;

async function callGroq(specs: Record<string, unknown>): Promise<KnowledgeWarnings> {
  const apiKey = import.meta.env.GROQ_API_KEY;
  if (!apiKey) {
    return { warnings: ["Specs data unavailable — consult a local mechanic."] };
  }

  const userMessage = `Vehicle specs:\n${JSON.stringify(specs, null, 2)}\n\nGenerate 3 practical buyer warnings in strict JSON format.`;

  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 300,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    throw new Error(`Groq API: ${res.status} ${await res.text()}`);
  }

  const data = await res.json() as GroqResponse;
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Groq returned empty response");
  }

  const parsed = JSON.parse(content) as KnowledgeWarnings;
  if (!Array.isArray(parsed.warnings) || parsed.warnings.length !== 3) {
    throw new Error(`Groq returned invalid structure: expected 3 warnings, got ${JSON.stringify(parsed.warnings?.length)}`);
  }

  // Validate no Lagos hardcoding (constitution §VI.1)
  for (const warning of parsed.warnings) {
    if (warning.toLowerCase().includes("lagos")) {
      throw new Error(`Groq output contains forbidden "Lagos" reference: ${warning}`);
    }
  }

  return parsed;
}

// ── Knowledge Entry Upsert ──────────────────────────────────────────

async function upsertKnowledgeEntry(
  trimId: string,
  warnings: KnowledgeWarnings,
  specs: Record<string, unknown>,
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

// ── Consumer Handler ────────────────────────────────────────────────

export interface QueueMessage {
  id: string;
  body: KnowledgeMessage;
  timestamp: Date;
  attemptsRemaining: number;
}

export async function handleKnowledgeMessage(message: QueueMessage): Promise<void> {
  const msg = message.body;

  try {
    const warnings = await callGroq(msg.specs);
    await upsertKnowledgeEntry(msg.trimId, warnings, msg.specs);
    console.log(`[KNOWLEDGE] Processed: trim=${msg.trimId} warnings=${warnings.warnings.length}`);
  } catch (err) {
    console.error(`[KNOWLEDGE] Failed to process message ${message.id}: ${err}`);
    throw err;
  }
}

export async function handleKnowledgeBatch(messages: QueueMessage[]): Promise<void> {
  for (const message of messages) {
    await handleKnowledgeMessage(message);
  }
}
