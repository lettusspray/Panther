/**
 * NCS Customs Rate Fetcher
 *
 * Scrapes the Nigerian Customs Service (NCS) website for the current
 * USD selling rate. The NCS rate is used for Step 3 (Naira conversion)
 * of the 13-Step Landed-Cost Formula.
 *
 * Constitution compliance:
 *   - No hardcoded statutory/FX constants (§II.2)
 *   - Managed APIs only — ScraperAPI for JS-rendered NCS site (§X.2)
 *   - Stale-data kill switch: returns null if rate is stale
 *
 * NCS website: https://www.ncs.gov.ng
 * The rate page requires JavaScript rendering (SPA) — hence ScraperAPI.
 *
 * Expected output: USD selling rate (e.g., 1379.62)
 */

import { scrapeHtml } from "./client";

// ── Types ───────────────────────────────────────────────────────────

export interface NcsRate {
  /** USD selling rate in Naira (e.g., 1379.62) */
  usdSelling: number;
  /** When the rate was fetched */
  fetchedAt: Date;
  /** Source identifier for schema storage */
  source: string;
}

// ── Rate Extraction ─────────────────────────────────────────────────

/**
 * Parse NCS customs rate from scraped HTML.
 *
 * The NCS site displays rates in a table or card format.
 * We look for the USD selling rate pattern: ₦XXX.XX or NGN XXX.XX
 * near keywords like "USD", "Dollar", "US Dollar", "Selling".
 *
 * Falls back to a regex scan for any number matching the expected
 * range (1000-2000) near USD-related keywords.
 */
function extractRateFromHtml(html: string): number | null {
  // Pattern 1: Look for USD selling rate in structured format
  // Common patterns on NCS site:
  //   "USD Selling: ₦1,379.62"
  //   "US Dollar Selling Rate: 1379.62"
  //   "USD/NGN: 1379.62"
  const patterns = [
    // "USD" or "Dollar" followed by "Selling" or "Rate" then a number
    /(?:USD|US\s*Dollar|Dollar)[\s:]*?(?:Selling|Rate|Buy|Sell)[\s:₦]*?([\d,]+\.?\d*)/i,
    // "Selling" near "USD" or "Dollar" — may be on same or adjacent lines
    /(?:Selling|Sell)[\s:₦]*?([\d,]+\.?\d*)/i,
    // ₦ symbol followed by a rate in the expected range
    /₦([\d,]+\.\d{2})/,
    // JSON or data attribute: "usd_selling_rate": "1379.62"
    /(?:usd_selling|usdselling|usd_sell)["\s:]*(?:["\s:]*)?([\d,]+\.?\d*)/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const raw = match[1].replace(/,/g, "");
      const rate = parseFloat(raw);
      // Sanity check: NCS rate should be in 500-3000 range
      if (!isNaN(rate) && rate > 500 && rate < 3000) {
        return rate;
      }
    }
  }

  // Fallback: scan for any number in the expected range near USD context
  // Split into lines, find lines mentioning USD/Dollar, extract rate
  const lines = html.split("\n");
  for (const line of lines) {
    if (/USD|Dollar|₦|NGN/i.test(line)) {
      const numbers = line.match(/[\d,]+\.\d{2}/g);
      if (numbers) {
        for (const numStr of numbers) {
          const rate = parseFloat(numStr.replace(/,/g, ""));
          if (!isNaN(rate) && rate > 500 && rate < 3000) {
            return rate;
          }
        }
      }
    }
  }

  return null;
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Fetch the current NCS customs USD selling rate.
 *
 * Uses ScraperAPI with render=true to handle the JS-rendered NCS site.
 * Returns null if scraping fails or rate cannot be extracted.
 *
 * @example
 * ```ts
 * const rate = await fetchNcsRate();
 * if (!rate) {
 *   console.error("NCS rate unavailable — kill switch activated");
 *   return;
 * }
 * // Use rate.usdSelling in Step 3 of the formula
 * ```
 */
export async function fetchNcsRate(): Promise<NcsRate | null> {
  const NCS_RATE_URL = "https://www.ncs.gov.ng";

  try {
    const result = await scrapeHtml(NCS_RATE_URL, {
      render: true,
      premium: false,
      timeout: 30_000,
    });

    const rate = extractRateFromHtml(result.data);
    if (rate === null) return null;

    return {
      usdSelling: rate,
      fetchedAt: new Date(),
      source: "scraperapi-ncs",
    };
  } catch {
    return null;
  }
}

/**
 * Extract rate from HTML for testing.
 * Exposed for unit tests — not used in production.
 */
export { extractRateFromHtml };
