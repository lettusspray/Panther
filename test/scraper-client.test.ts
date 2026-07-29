import { describe, it, expect, vi, beforeEach } from "vitest";
import { keyCount, getCurrentIndex, resetKeyIndex, scrapeUrl } from "../src/lib/scraper/client";

describe("ScraperAPI Client", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    resetKeyIndex();
  });

  describe("key management", () => {
    it("starts at index 0", () => {
      resetKeyIndex();
      expect(getCurrentIndex()).toBe(0);
    });

    it("keyCount returns count from env", () => {
      // test/setup.ts stubs SCRAPER_API_KEYS with "test-key-1,test-key-2"
      expect(keyCount()).toBe(2);
    });
  });

  describe("scrapeUrl", () => {
    it("makes request with correct ScraperAPI URL format", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue("<html>test</html>"),
        headers: new Map(),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await scrapeUrl("https://example.com");
      expect(result.data).toBe("<html>test</html>");
      expect(result.statusCode).toBe(200);
      expect(result.keyIndex).toBe(0);

      // Verify the URL was constructed correctly
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain("api.scraperapi.com");
      expect(calledUrl).toContain("api_key=test-key-1");
      expect(calledUrl).toContain("render=true");
    });

    it("returns JSON when format is json", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ key: "value" }),
        headers: new Map(),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await scrapeUrl<{ key: string }>("https://example.com", { format: "json" });
      expect(result.data).toEqual({ key: "value" });
    });

    it("retries on network error and rotates keys", async () => {
      const mockFetch = vi.fn()
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: vi.fn().mockResolvedValue("recovered"),
          headers: new Map(),
        });
      vi.stubGlobal("fetch", mockFetch);

      const result = await scrapeUrl("https://example.com");
      expect(result.data).toBe("recovered");
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Key should have rotated
      const secondUrl = mockFetch.mock.calls[1][0] as string;
      expect(secondUrl).toContain("api_key=test-key-2");
    });

    it("throws after exhausting retries", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Persistent failure"));
      vi.stubGlobal("fetch", mockFetch);

      await expect(scrapeUrl("https://example.com")).rejects.toThrow("Persistent failure");
    });

    it("passes premium flag in URL", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue("ok"),
        headers: new Map(),
      });
      vi.stubGlobal("fetch", mockFetch);

      await scrapeUrl("https://example.com", { premium: true });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain("premium=true");
    });

    it("passes ultra_premium flag in URL", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue("ok"),
        headers: new Map(),
      });
      vi.stubGlobal("fetch", mockFetch);

      await scrapeUrl("https://example.com", { ultraPremium: true });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain("ultra_premium=true");
    });
  });
});
