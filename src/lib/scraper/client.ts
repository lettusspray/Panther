/**
 * ScraperAPI Client — Multi-Key Rotation
 *
 * Manages comma-separated ScraperAPI keys with automatic rotation on
 * rate limits and failures. Used for NCS customs rate scraping
 * (JS-rendered, bot-protected site).
 *
 * Constitution compliance:
 *   - Managed APIs only — no custom scrapers (§X.2)
 *   - Multi-key rotation for reliability (§X.2 directive)
 *
 * Key format: SCRAPER_API_KEYS=key1,key2,key3
 * First key = permanent 1K free credits; additional keys = extra quota
 */

// ── Types ───────────────────────────────────────────────────────────

export interface ScrapeOptions {
  /** Render JavaScript (default: true for NCS) */
  render?: boolean;
  /** Use premium proxies ($0.015/request) */
  premium?: boolean;
  /** Use ultra premium proxies ($0.03/request) */
  ultraPremium?: boolean;
  /** Custom headers */
  headers?: Record<string, string>;
  /** Response format: 'text' (default) or 'json' */
  format?: "text" | "json";
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
}

export interface ScrapeResult<T = string> {
  data: T;
  statusCode: number;
  keyIndex: number;
  creditsUsed: number;
}

// ── Key Management ──────────────────────────────────────────────────

let keys: string[] = [];
let currentIndex = 0;

/**
 * Parse keys from comma-separated env var.
 * Called once on module load; re-call if env changes.
 */
function loadKeys(): string[] {
  const raw = import.meta.env.SCRAPER_API_KEYS ?? "";
  return raw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

function getKeys(): string[] {
  if (keys.length === 0) {
    keys = loadKeys();
  }
  return keys;
}

function currentKey(): string {
  const k = getKeys();
  if (k.length === 0) throw new Error("No ScraperAPI keys configured. Set SCRAPER_API_KEYS env var.");
  return k[currentIndex % k.length];
}

function rotateKey(): void {
  const k = getKeys();
  currentIndex = (currentIndex + 1) % k.length;
}

/**
 * Get the number of configured keys.
 * Useful for logging/monitoring key rotation health.
 */
export function keyCount(): number {
  return getKeys().length;
}

/**
 * Get current key index (0-based).
 * Useful for testing.
 */
export function getCurrentIndex(): number {
  return currentIndex;
}

/**
 * Reset key index to 0 (for testing).
 */
export function resetKeyIndex(): void {
  currentIndex = 0;
}

// ── ScraperAPI Client ───────────────────────────────────────────────

const SCRAPER_API_BASE = "https://api.scraperapi.com";

/**
 * Fetch a URL through ScraperAPI with automatic key rotation.
 *
 * @param url - The URL to scrape
 * @param options - ScraperAPI options
 * @returns Parsed response (string or JSON)
 *
 * @example
 * ```ts
 * const html = await scrapeUrl("https://www.ncs.gov.ng/rates", {
 *   render: true,
 *   format: "text",
 * });
 * ```
 */
export async function scrapeUrl<T = string>(
  url: string,
  options: ScrapeOptions = {},
): Promise<ScrapeResult<T>> {
  const {
    render = true,
    premium = false,
    ultraPremium = false,
    format = "text",
    timeout = 30_000,
  } = options;

  const maxRetries = Math.min(3, getKeys().length);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const apiKey = currentKey();

    const params = new URLSearchParams({
      api_key: apiKey,
      url,
      render: String(render),
    });

    if (ultraPremium) {
      params.set("ultra_premium", "true");
    } else if (premium) {
      params.set("premium", "true");
    }

    const requestUrl = `${SCRAPER_API_BASE}?${params.toString()}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const res = await fetch(requestUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.status === 429) {
        // Rate limited — rotate key and retry
        rotateKey();
        const retryAfter = res.headers.get("Retry-After");
        if (retryAfter) {
          const waitMs = parseInt(retryAfter, 10) * 1000;
          if (!isNaN(waitMs) && waitMs > 0 && waitMs < 60_000) {
            await new Promise((r) => setTimeout(r, Math.min(waitMs, 5000)));
          }
        }
        lastError = new Error(`ScraperAPI 429: Rate limited on key ${attempt}`);
        rotateKey();
        continue;
      }

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        lastError = new Error(`ScraperAPI ${res.status}: ${body.slice(0, 200)}`);
        rotateKey();
        continue;
      }

      // Parse response
      let data: T;
      if (format === "json") {
        data = (await res.json()) as T;
      } else {
        data = (await res.text()) as T;
      }

      // Extract credits used from headers (if available)
      const creditsHeader = res.headers.get("X-ScraperAPI-Credits");
      const creditsUsed = creditsHeader ? parseInt(creditsHeader, 10) || 0 : 0;

      return {
        data,
        statusCode: res.status,
        keyIndex: currentIndex,
        creditsUsed,
      };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        lastError = new Error(`ScraperAPI timeout after ${timeout}ms`);
      } else {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
      rotateKey();
    }
  }

  throw lastError ?? new Error("ScraperAPI: All retries exhausted");
}

/**
 * Fetch JSON directly through ScraperAPI.
 * Convenience wrapper around scrapeUrl with format="json".
 */
export async function scrapeJson<T = unknown>(
  url: string,
  options: Omit<ScrapeOptions, "format"> = {},
): Promise<ScrapeResult<T>> {
  return scrapeUrl<T>(url, { ...options, format: "json" });
}

/**
 * Fetch text/HTML through ScraperAPI.
 * Convenience wrapper around scrapeUrl with format="text".
 */
export async function scrapeHtml(
  url: string,
  options: Omit<ScrapeOptions, "format"> = {},
): Promise<ScrapeResult<string>> {
  return scrapeUrl<string>(url, { ...options, format: "text" });
}
