import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractRateFromHtml, fetchNcsRate } from "../src/lib/scraper/ncs";
import * as client from "../src/lib/scraper/client";

describe("NCS Customs Rate Fetcher", () => {
  describe("extractRateFromHtml", () => {
    it("extracts rate from USD Selling pattern", () => {
      const html = '<div>USD Selling: ₦1,379.62</div>';
      expect(extractRateFromHtml(html)).toBe(1379.62);
    });

    it("extracts rate from Dollar Selling Rate pattern", () => {
      const html = '<td>US Dollar Selling Rate: 1350.00</td>';
      expect(extractRateFromHtml(html)).toBe(1350.0);
    });

    it("extracts rate from ₦ symbol pattern", () => {
      const html = '<span>Rate: ₦1,420.50</span>';
      expect(extractRateFromHtml(html)).toBe(1420.5);
    });

    it("extracts rate from USD/NGN pattern", () => {
      const html = "USD/NGN: 1385.75";
      expect(extractRateFromHtml(html)).toBe(1385.75);
    });

    it("extracts rate from JSON data attribute", () => {
      const html = '"usd_selling_rate": "1390.25"';
      expect(extractRateFromHtml(html)).toBe(1390.25);
    });

    it("extracts rate from fallback line scan", () => {
      const html = `
        <tr>
          <td>US Dollar</td>
          <td>Buying: 1370.00</td>
          <td>Selling: 1385.50</td>
        </tr>
      `;
      expect(extractRateFromHtml(html)).toBe(1385.5);
    });

    it("returns null for empty HTML", () => {
      expect(extractRateFromHtml("")).toBeNull();
    });

    it("returns null for HTML with no rate", () => {
      expect(extractRateFromHtml("<html><body>No rate here</body></html>")).toBeNull();
    });

    it("rejects rates outside valid range", () => {
      const html = "USD: ₦100.00";
      expect(extractRateFromHtml(html)).toBeNull();
    });

    it("rejects rates above 3000", () => {
      const html = "USD: ₦5000.00";
      expect(extractRateFromHtml(html)).toBeNull();
    });

    it("handles rates without decimals", () => {
      const html = "USD Selling: ₦1380";
      expect(extractRateFromHtml(html)).toBe(1380);
    });
  });

  describe("fetchNcsRate", () => {
    beforeEach(() => {
      vi.unstubAllGlobals();
    });

    it("returns NcsRate on success", async () => {
      // Mock scrapeHtml to return HTML with a rate
      vi.spyOn(client, "scrapeHtml").mockResolvedValue({
        data: '<div>USD Selling: ₦1,379.62</div>',
        statusCode: 200,
        keyIndex: 0,
        creditsUsed: 0,
      });

      const result = await fetchNcsRate();
      expect(result).not.toBeNull();
      expect(result!.usdSelling).toBe(1379.62);
      expect(result!.source).toBe("scraperapi-ncs");
    });

    it("returns null when rate cannot be extracted", async () => {
      vi.spyOn(client, "scrapeHtml").mockResolvedValue({
        data: "<html>No rate data</html>",
        statusCode: 200,
        keyIndex: 0,
        creditsUsed: 0,
      });

      const result = await fetchNcsRate();
      expect(result).toBeNull();
    });

    it("returns null on fetch failure", async () => {
      vi.spyOn(client, "scrapeHtml").mockRejectedValue(new Error("Network error"));

      const result = await fetchNcsRate();
      expect(result).toBeNull();
    });
  });
});
