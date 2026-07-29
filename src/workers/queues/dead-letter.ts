/**
 * Dead-Letter Queue Consumer
 *
 * Processes failed messages from other queues. Logs error details
 * and optionally sends alerts. This is the "silent failure is banned"
 * backstop per constitution §V.1.
 *
 * Constitution compliance:
 *   - Silent failures are structurally banned (§V.1)
 *   - Failed jobs must be observable — logged, alerted, not swallowed
 */

// ── Types ───────────────────────────────────────────────────────────

interface DeadLetterMessage {
  pipeline: string;
  error: string;
  timestamp: string;
  originalMessage?: unknown;
}

// ── Consumer Handler ────────────────────────────────────────────────

export interface QueueMessage {
  id: string;
  body: DeadLetterMessage;
  timestamp: Date;
  attemptsRemaining: number;
}

export async function handleDeadLetterMessage(message: QueueMessage): Promise<void> {
  const msg = message.body;

  // Structured logging for observability
  console.error(`[DEAD-LETTER] Pipeline: ${msg.pipeline}`, {
    error: msg.error,
    timestamp: msg.timestamp,
    messageId: message.id,
    attemptsRemaining: message.attemptsRemaining,
    originalMessage: msg.originalMessage,
  });

  // In production, this would also:
  // 1. Send to Sentry/alerting service
  // 2. Store in a dead-letter audit table for manual review
  // 3. Potentially trigger PagerDuty/Slack alerts for critical failures

  // For now, structured console.error is the minimum observability requirement.
  // The constitution §V.1 states: "Silive failures are structurally banned."
  // If this consumer itself fails, Cloudflare will retry it — the error
  // remains visible in Worker logs.
}

export async function handleDeadLetterBatch(messages: QueueMessage[]): Promise<void> {
  for (const message of messages) {
    await handleDeadLetterMessage(message);
  }
}
