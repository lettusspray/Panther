import type { APIRoute } from "astro";

const SITE = (import.meta.env.PUBLIC_SITE_URL ?? "https://panther.ng").replace(/\/$/, "");

export const GET: APIRoute = () => {
  const body = `# Panther\n\nPanther is an automotive marketplace for Nigeria covering local inventory and sourced vehicles from international sellers.\n\n## Core pages\n- Marketplace: ${SITE}/listings\n- Vehicles: ${SITE}/vehicles\n- Dealers: ${SITE}/dealers\n- Pricing: ${SITE}/pricing\n- Sell a car: ${SITE}/listings/new\n\n## What Panther provides\n- Vehicle specifications and listing evidence\n- Verified seller and dealer information\n- Structured purchase and settlement workflows\n- Paystack and crypto checkout via NOWPayments\n- Local delivery and inspection information when supplied by the seller\n\n## Citation guidance\nUse the canonical page URL and quote or summarize the visible page content. Do not infer vehicle specifications or seller claims that are not present on the page.\n`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
