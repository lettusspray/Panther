import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  configure,
  healthCheck,
  crawlHtml,
  crawlMarkdown,
  crawlBatch,
  extractTables,
  tableToKeyValue,
  parseNumeric,
  stripHtml,
} from "../src/lib/data/crawl4ai";

describe("Crawl4AI Client", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    configure({ apiUrl: "", apiKey: "" });
  });

  describe("configuration", () => {
    it("throws when apiUrl is missing", () => {
      configure({ apiUrl: "", apiKey: "key" });
      expect(() => healthCheck()).rejects.toThrow("CRAWL4AI_API_URL not configured");
    });

    it("throws when apiKey is missing", () => {
      configure({ apiUrl: "https://example.com", apiKey: "" });
      expect(() => healthCheck()).rejects.toThrow("CRAWL4AI_API_KEY not configured");
    });
  });

  describe("healthCheck", () => {
    it("returns status on success", async () => {
      configure({ apiUrl: "https://crawl4ai.test", apiKey: "test-key" });
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ status: "ok", version: "0.9.2" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await healthCheck();
      expect(result.status).toBe("ok");
      expect(result.version).toBe("0.9.2");
      expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe("Bearer test-key");
    });

    it("throws on non-200 response", async () => {
      configure({ apiUrl: "https://crawl4ai.test", apiKey: "test-key" });
      const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
      vi.stubGlobal("fetch", mockFetch);

      await expect(healthCheck()).rejects.toThrow("health check failed: 500");
    });
  });

  describe("crawlHtml", () => {
    it("sends urls array in POST body", async () => {
      configure({ apiUrl: "https://crawl4ai.test", apiKey: "test-key" });
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          results: [{ url: "https://example.com", html: "<html>test</html>", success: true }],
        }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const results = await crawlHtml({ urls: ["https://example.com"] });
      expect(results).toHaveLength(1);
      expect(results[0].html).toBe("<html>test</html>");

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.urls).toEqual(["https://example.com"]);
      expect(body.light_mode).toBe(true);
    });

    it("handles multiple URLs", async () => {
      configure({ apiUrl: "https://crawl4ai.test", apiKey: "test-key" });
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          results: [
            { url: "https://a.com", html: "a", success: true },
            { url: "https://b.com", html: "b", success: true },
          ],
        }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const results = await crawlHtml({ urls: ["https://a.com", "https://b.com"] });
      expect(results).toHaveLength(2);
    });

    it("falls back to direct fetch on Crawl4AI 5xx error", async () => {
      configure({ apiUrl: "https://crawl4ai.test", apiKey: "test-key" });
      // Crawl4AI returns 500 (overloaded), then direct fetch succeeds
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return { ok: false, status: 500, text: vi.fn().mockResolvedValue("Internal Server Error") };
        }
        return { ok: true, text: vi.fn().mockResolvedValue("<html><table></table></html>"), headers: { get: () => null } };
      });
      vi.stubGlobal("fetch", mockFetch);

      const results = await crawlHtml({ urls: ["https://example.com"] });
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
    });
  });

  describe("crawlMarkdown", () => {
    it("sends url in POST body", async () => {
      configure({ apiUrl: "https://crawl4ai.test", apiKey: "test-key" });
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ markdown: "# Hello", success: true }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await crawlMarkdown({ url: "https://example.com" });
      expect(result.markdown).toBe("# Hello");
      expect(result.success).toBe(true);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.url).toBe("https://example.com");
      expect(body.f).toBe("fit");
    });
  });

  describe("crawlBatch", () => {
    it("splits large batches into chunks of 50", async () => {
      configure({ apiUrl: "https://crawl4ai.test", apiKey: "test-key" });
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          results: [{ url: "https://x.com", html: "x", success: true }],
        }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const urls = Array.from({ length: 75 }, (_, i) => `https://${i}.com`);
      const results = await crawlBatch(urls);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});

describe("HTML Utilities", () => {
  describe("extractTables", () => {
    it("extracts table rows from HTML", () => {
      const html = `
        <table>
          <tr><td>Brand</td><td>Toyota</td></tr>
          <tr><td>Model</td><td>Camry</td></tr>
        </table>
      `;
      const tables = extractTables(html);
      expect(tables).toHaveLength(1);
      expect(tables[0]).toEqual([["Brand", "Toyota"], ["Model", "Camry"]]);
    });

    it("handles multiple tables", () => {
      const html = `
        <table><tr><td>A</td><td>1</td></tr></table>
        <table><tr><td>B</td><td>2</td></tr></table>
      `;
      const tables = extractTables(html);
      expect(tables).toHaveLength(2);
    });

    it("strips HTML tags from cells", () => {
      const html = `
        <table>
          <tr><td><strong>Bold</strong></td><td><a href="#">Link</a></td></tr>
        </table>
      `;
      const tables = extractTables(html);
      expect(tables[0][0]).toEqual(["Bold", "Link"]);
    });

    it("decodes HTML entities", () => {
      const html = `
        <table>
          <tr><td>A &amp; B</td><td>&lt;100&gt;</td></tr>
        </table>
      `;
      const tables = extractTables(html);
      expect(tables[0][0]).toEqual(["A & B", "<100>"]);
    });

    it("returns empty array for no tables", () => {
      expect(extractTables("<div>no tables</div>")).toEqual([]);
    });
  });

  describe("tableToKeyValue", () => {
    it("converts 2-column rows to key-value pairs", () => {
      const rows = [["Power", "208 kW"], ["Torque", "420 Nm"]];
      const kv = tableToKeyValue(rows);
      expect(kv).toEqual({ Power: "208 kW", Torque: "420 Nm" });
    });

    it("skips No Data values", () => {
      const rows = [["Power", "208 kW"], ["Notes", "No Data"]];
      const kv = tableToKeyValue(rows);
      expect(kv).toEqual({ Power: "208 kW" });
    });

    it("skips empty keys", () => {
      const rows = [["", "value"], ["Key", "val"]];
      const kv = tableToKeyValue(rows);
      expect(kv).toEqual({ Key: "val" });
    });

    it("joins multi-value cells", () => {
      const rows = [["Power", "208 kW", "(283 PS)"]];
      const kv = tableToKeyValue(rows);
      expect(kv.Power).toBe("208 kW (283 PS)");
    });
  });

  describe("parseNumeric", () => {
    it("parses simple numbers", () => {
      expect(parseNumeric("208")).toBe(208);
      expect(parseNumeric("6.2")).toBe(6.2);
    });

    it("parses numbers with units", () => {
      expect(parseNumeric("208 kW")).toBe(208);
      expect(parseNumeric("6.2 sec")).toBe(6.2);
      expect(parseNumeric("1847 kg")).toBe(1847);
    });

    it("handles comma-separated numbers", () => {
      expect(parseNumeric("160,000 km")).toBe(160000);
    });

    it("returns null for No Data", () => {
      expect(parseNumeric("No Data")).toBeNull();
      expect(parseNumeric("-")).toBeNull();
      expect(parseNumeric("")).toBeNull();
    });
  });

  describe("stripHtml", () => {
    it("removes tags and normalizes whitespace", () => {
      expect(stripHtml("<p>Hello <strong>world</strong></p>")).toBe("Hello world");
    });

    it("decodes entities", () => {
      expect(stripHtml("A &amp; B &lt; C")).toBe("A & B < C");
    });

    it("removes script and style tags", () => {
      const html = "<p>text</p><script>alert('xss')</script><style>.x{}</style>";
      expect(stripHtml(html)).toBe("text");
    });
  });
});
