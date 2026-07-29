/**
 * Crawl4AI Client — TypeScript
 *
 * Talks to a self-hosted Crawl4AI v0.9.x instance (Railway) for scraping
 * JS-rendered vehicle data sites. Returns raw HTML or markdown; structured
 * parsing happens in the site-specific crawlers.
 *
 * Architecture: Constitution-compliant TypeScript worker that talks
 * to Crawl4AI API, writes to Neon via Drizzle+Hyperdrive.
 *
 * Constitution compliance:
 *   - Managed APIs only — Crawl4AI is the managed scraping service (§X.2)
 *   - All DB traffic through Hyperdrive (§X.2)
 *   - No custom Puppeteer/Playwright scripts (§X.2)
 */

// ── Types ───────────────────────────────────────────────────────────

export interface Crawl4AiConfig {
  apiUrl: string;
  apiKey: string;
}

export interface CrawlRequest {
  urls: string[];
  lightMode?: boolean;
  pageTimeout?: number;
}

export interface CrawlResult {
  url: string;
  html: string;
  success: boolean;
  error?: string;
}

export interface MarkdownRequest {
  url: string;
  filter?: "fit" | "raw" | "bm25" | "llm";
  query?: string;
}

export interface MarkdownResult {
  url: string;
  markdown: string;
  success: boolean;
}

// ── Client ──────────────────────────────────────────────────────────

const CRAWL4AI_URL = "https://crawl4ai-production-e503.up.railway.app";
const CRAWL4AI_KEY = "850da107bea2ec98bcf7dae7346aef1dd34e335b4e1c5eb02f4be1c06865dfc3";

let config: Crawl4AiConfig | null = null;

export function configure(cfg: Crawl4AiConfig): void {
  config = cfg;
}

function getConfig(): Crawl4AiConfig {
  if (!config) {
    config = {
      apiUrl: (import.meta as any).env?.CRAWL4AI_API_URL ?? process.env.CRAWL4AI_API_URL ?? CRAWL4AI_URL,
      apiKey: (import.meta as any).env?.CRAWL4AI_API_KEY ?? process.env.CRAWL4AI_API_KEY ?? CRAWL4AI_KEY,
    };
  }
  if (!config.apiUrl) throw new Error("CRAWL4AI_API_URL not configured");
  if (!config.apiKey) throw new Error("CRAWL4AI_API_KEY not configured");
  return config;
}

function headers(): Record<string, string> {
  const cfg = getConfig();
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${cfg.apiKey}`,
  };
}

// ── Health Check ────────────────────────────────────────────────────

export async function healthCheck(): Promise<{ status: string; version: string }> {
  const cfg = getConfig();
  const res = await fetch(`${cfg.apiUrl}/health`, { headers: headers() });
  if (!res.ok) throw new Error(`Crawl4AI health check failed: ${res.status}`);
  return res.json() as Promise<{ status: string; version: string }>;
}

// ── Direct Fetch (Fallback) ─────────────────────────────────────────

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// iRoyal residential proxy — bypasses rate-limit on ev-database.org etc.
// Web Unlocker (unblocker.iproyal.com) is reserved for total block scenarios.
const IROYAL_PROXY_URL =
  process.env.IROYAL_PROXY_URL ??
  "http://14a07991fe1df:b53ce5ae33@174.140.207.69:12323";

// Domains that require proxy (rate-limited or bot-blocked on direct fetch)
const PROXY_DOMAINS = ["ev-database.org"];

function needsProxy(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return PROXY_DOMAINS.some((d) => host.includes(d));
  } catch {
    return false;
  }
}

/**
 * Fetch via iRoyal Web Unlocker proxy using undici.
 * Handles self-signed certs in the proxy chain.
 */
async function fetchViaProxy(
  url: string,
  timeout: number,
): Promise<{ status: number; html: string }> {
  // Dynamic import to avoid hard dep — undici is a transitive dep via miniflare
  const { ProxyAgent, fetch: undiciFetch } = await import("undici");

  // Disable TLS verification for proxy's self-signed cert
  const prevReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  try {
    const dispatcher = new ProxyAgent({ uri: IROYAL_PROXY_URL });
    const res = await undiciFetch(url, {
      dispatcher,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(timeout),
    });
    const html = await res.text();
    return { status: res.status, html };
  } finally {
    // Restore original TLS setting
    if (prevReject === undefined) {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    } else {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = prevReject;
    }
  }
}

/**
 * Fetch a single URL directly via HTTP (no Crawl4AI).
 * Uses iRoyal Web Unlocker proxy for rate-limited domains (ev-database.org).
 * Falls back to direct fetch for all other domains.
 * Reads HTML even on 429/rate-limit responses (SSR sites return full HTML).
 * Retries up to 3 times with exponential backoff on network/timeout errors.
 */
export async function fetchDirect(
  url: string,
  opts: { timeout?: number; retries?: number } = {},
): Promise<CrawlResult> {
  const retries = opts.retries ?? 3;
  const timeout = opts.timeout ?? 30_000;
  const useProxy = needsProxy(url);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      let status: number;
      let html: string;

      if (useProxy) {
        const proxyRes = await fetchViaProxy(url, timeout);
        status = proxyRes.status;
        html = proxyRes.html;
      } else {
        const res = await fetch(url, {
          headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
          signal: AbortSignal.timeout(timeout),
          redirect: "follow",
        });
        status = res.status;
        html = await res.text();
      }

      // SSR sites return full HTML even on 429 — use it if it has tables
      if (html.length > 1000 && html.includes("<table")) {
        return { url, html, success: true };
      }
      if (status === 429) {
        throw new Error("429 Too Many Requests");
      }
      if (status < 200 || status >= 300) {
        throw new Error(`HTTP ${status} (no usable HTML)`);
      }
      return { url, html, success: true };
    } catch (err) {
      if (attempt === retries) {
        return { url, html: "", success: false, error: (err as Error).message };
      }
      // Longer backoff for rate limits
      const delay = (err as Error).message.includes("429")
        ? 5000 * 2 ** attempt
        : 1000 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return { url, html: "", success: false, error: "unreachable" };
}

/**
 * Fetch multiple URLs directly via HTTP.
 * Returns all results; caller handles failures.
 */
export async function fetchDirectBatch(
  urls: string[],
  opts: { timeout?: number; concurrency?: number } = {},
): Promise<CrawlResult[]> {
  const concurrency = opts.concurrency ?? 2;
  const results: CrawlResult[] = [];

  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((url) => fetchDirect(url, opts)),
    );
    results.push(...batchResults);
    // Polite delay between batches
    if (i + concurrency < urls.length) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  return results;
}

// ── Raw HTML Crawl ──────────────────────────────────────────────────

/**
 * Crawl one or more URLs, returning raw HTML.
 * Uses POST /crawl with urls array.
 * Falls back to direct HTTP fetch if Crawl4AI is unreachable.
 */
export async function crawlHtml(request: CrawlRequest): Promise<CrawlResult[]> {
  // Try Crawl4AI first, fall back to direct fetch only on network errors
  try {
    const cfg = getConfig();

    const payload = {
      urls: request.urls,
      light_mode: request.lightMode ?? true,
      page_timeout: request.pageTimeout ?? 60000,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);

    const res = await fetch(`${cfg.apiUrl}/crawl`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const body = await res.text();
      // On server errors (5xx), try direct fetch — Crawl4AI may be overloaded
      if (res.status >= 500) {
        console.warn(`[crawl4ai] Crawl4AI server error ${res.status}, falling back to direct fetch`);
        return fetchDirectBatch(request.urls);
      }
      throw new Error(`Crawl4AI crawl failed (${res.status}): ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      success: boolean;
      results: Array<{ url: string; html: string; success: boolean; error?: string }>;
    };

    return data.results.map((r) => ({
      url: r.url,
      html: r.html ?? "",
      success: r.success,
      error: r.error,
    }));
  } catch (err) {
    // Only fall back on network/timeout errors, not on HTTP errors
    if (err instanceof Error && (err.name === "AbortError" || err.name === "TypeError" || err.message.includes("fetch failed") || err.message.includes("timeout"))) {
      console.warn("[crawl4ai] Crawl4AI unreachable, falling back to direct fetch");
      return fetchDirectBatch(request.urls);
    }
    throw err;
  }
}

// ── Markdown Crawl ──────────────────────────────────────────────────

/**
 * Get markdown content from a single URL.
 * Uses POST /md. Does NOT require auth token (public endpoint).
 */
export async function crawlMarkdown(request: MarkdownRequest): Promise<MarkdownResult> {
  const cfg = getConfig();

  const payload = {
    url: request.url,
    f: request.filter ?? "fit",
    q: request.query ?? null,
  };

  const res = await fetch(`${cfg.apiUrl}/md`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Crawl4AI markdown failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as { markdown: string; success: boolean };

  return {
    url: request.url,
    markdown: data.markdown ?? "",
    success: data.success ?? false,
  };
}

// ── Batch HTML Crawl ────────────────────────────────────────────────

/**
 * Crawl multiple URLs in a single batch (max 100 per API spec).
 * Returns all results; caller handles failures.
 */
export async function crawlBatch(
  urls: string[],
  options: { lightMode?: boolean; pageTimeout?: number } = {},
): Promise<CrawlResult[]> {
  // API limit: max 100 URLs per batch
  const BATCH_SIZE = 50;
  const allResults: CrawlResult[] = [];

  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const batch = urls.slice(i, i + BATCH_SIZE);
    const results = await crawlHtml({
      urls: batch,
      lightMode: options.lightMode,
      pageTimeout: options.pageTimeout,
    });
    allResults.push(...results);
  }

  return allResults;
}

// ── HTML Utilities ──────────────────────────────────────────────────

/**
 * Strip HTML tags and decode entities for text extraction.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract all table data from HTML as array of row arrays.
 */
export function extractTables(html: string): string[][][] {
  const tables: string[][][] = [];
  const tableRegex = /<table[\s\S]*?<\/table>/gi;
  let match;

  while ((match = tableRegex.exec(html)) !== null) {
    const tableHtml = match[0];
    const rows: string[][] = [];
    const rowRegex = /<tr[\s\S]*?<\/tr>/gi;
    let rowMatch;

    while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
      const cells: string[] = [];
      const cellRegex = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
      let cellMatch;

      while ((cellMatch = cellRegex.exec(rowMatch[0])) !== null) {
        const text = cellMatch[1]
          .replace(/<[^>]+>/g, "")
          .replace(/&amp;/g, "&")
          .replace(/&gt;/g, ">")
          .replace(/&lt;/g, "<")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .trim();
        cells.push(text);
      }

      if (cells.length > 0 && cells.some((c) => c.length > 0)) {
        rows.push(cells);
      }
    }

    if (rows.length > 0) {
      tables.push(rows);
    }
  }

  return tables;
}

/**
 * Convert table rows to key-value pairs (for 2-column spec tables).
 */
export function tableToKeyValue(rows: string[][]): Record<string, string> {
  const result: Record<string, string> = {};

  for (const row of rows) {
    if (row.length >= 2) {
      const key = row[0].trim().replace(/\t+/g, " ").replace(/\s+/g, " ");
      const value = row.slice(1).join(" ").trim();
      if (key && value && value !== "No Data" && !/^\d+$/.test(key)) {
        result[key] = value;
      }
    }
  }

  return result;
}

/**
 * Parse numeric value from string, stripping units.
 * "208 kW (283 PS)" → 208, "6.2 sec" → 6.2, "1847 kg" → 1847
 */
export function parseNumeric(value: string): number | null {
  if (!value || value === "No Data" || value === "-") return null;
  const match = value.match(/([\d,.]+)/);
  if (!match) return null;
  const num = parseFloat(match[1].replace(/,/g, ""));
  return isNaN(num) ? null : num;
}

/**
 * Extract units from a value string. "208 kW" → "kW", "6.2 sec" → "sec"
 */
export function extractUnit(value: string): string {
  const match = value.match(/[\d,.]+\s*([a-zA-Z°/%]+)/);
  return match?.[1]?.trim() ?? "";
}
