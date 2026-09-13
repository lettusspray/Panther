export type SlackEvent = {
  type:
    | "order.created"
    | "payment.received"
    | "payment.exception"
    | "settlement.completed"
    | "settlement.exception"
    | "listing.created"
    | "signup.created"
    | "build.status"
    | "reconciliation.digest";
  title: string;
  summary: string;
  fields?: Array<{ label: string; value: string }>;
  url?: string;
};

const API = "https://slack.com/api/chat.postMessage";
const BOT_TOKEN = import.meta.env.SLACK_BOT_TOKEN;
const CHANNEL_ID = import.meta.env.SLACK_ADMIN_CHANNEL_ID;
const SITE = (import.meta.env.PUBLIC_SITE_URL ?? "https://panther.ng").replace(/\/$/, "");

export async function notifySlack(event: SlackEvent): Promise<void> {
  if (!BOT_TOKEN || !CHANNEL_ID) return;

  const fields = (event.fields ?? []).slice(0, 10).map((field) => ({
    type: "mrkdwn",
    text: `*${field.label}*\n${field.value}`,
  }));
  const actions = event.url
    ? [{ type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Open Panther" }, url: event.url, action_id: "open_panther" }] }]
    : [];

  const body = {
    channel: CHANNEL_ID,
    text: `${event.title}: ${event.summary}`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: event.title.slice(0, 150) } },
      { type: "section", text: { type: "mrkdwn", text: event.summary.slice(0, 3000) } },
      ...(fields.length ? [{ type: "section", fields }] : []),
      { type: "context", elements: [{ type: "mrkdwn", text: `Panther Ops • ${new Date().toISOString()} • ${SITE}` }] },
      ...actions,
    ],
  };

  try {
    const response = await fetch(API, {
      method: "POST",
      headers: { Authorization: `Bearer ${BOT_TOKEN}`, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
    });
    if (!response.ok) console.error(`[SLACK] HTTP ${response.status}`);
    const result = (await response.json()) as { ok?: boolean; error?: string };
    if (!result.ok) console.error(`[SLACK] ${result.error ?? "unknown error"}`);
  } catch (error) {
    console.error("[SLACK] Notification failed", error);
  }
}
