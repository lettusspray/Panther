import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/lib/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  },
}));

import { db } from "../src/lib/db";
import { activateListing } from "../src/lib/listings/activation";

function mockDbSelect(row: Record<string, unknown> | null) {
  const limitFn = vi.fn().mockResolvedValue(row ? [row] : []);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: fromFn });
}

function mockDbUpdate() {
  const whereFn = vi.fn().mockResolvedValue(undefined);
  const setFn = vi.fn().mockReturnValue({ where: whereFn });
  (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: setFn });
  return { setFn, whereFn };
}

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "listing-1",
    sellerId: "seller-1",
    status: "draft",
    images: [
      { tag: "front", url: "https://example.com/front.jpg" },
      { tag: "rear", url: "https://example.com/rear.jpg" },
      { tag: "side", url: "https://example.com/side.jpg" },
      { tag: "interior", url: "https://example.com/interior.jpg" },
    ],
    askingPriceNgn: "5000000",
    conditionReport: { exterior_body: "good", paint_quality: "fair" },
    trimId: "trim-1",
    modelYear: 2020,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("activateListing", () => {
  it("returns error when listing not found", async () => {
    mockDbSelect(null);
    const result = await activateListing("nonexistent", "seller-1");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it("rejects when user is not the seller", async () => {
    mockDbSelect(baseRow({ sellerId: "seller-1" }));
    const result = await activateListing("listing-1", "other-user");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/own listings/i);
  });

  it("rejects when listing is already active", async () => {
    mockDbSelect(baseRow({ status: "active" }));
    const result = await activateListing("listing-1", "seller-1");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/already active/i);
  });

  it("rejects when listing is sold", async () => {
    mockDbSelect(baseRow({ status: "sold" }));
    const result = await activateListing("listing-1", "seller-1");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/already sold/i);
  });

  it("rejects when fewer than 4 images", async () => {
    mockDbSelect(baseRow({ images: [{ tag: "front", url: "https://example.com/front.jpg" }, { tag: "rear", url: "https://example.com/rear.jpg" }] }));
    const result = await activateListing("listing-1", "seller-1");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/at least 4/i);
  });

  it("rejects when images array is empty", async () => {
    mockDbSelect(baseRow({ images: [] }));
    const result = await activateListing("listing-1", "seller-1");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/at least 4/i);
  });

  it("rejects when images is null", async () => {
    mockDbSelect(baseRow({ images: null }));
    const result = await activateListing("listing-1", "seller-1");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/at least 4/i);
  });

  it("rejects when an image has an invalid tag", async () => {
    mockDbSelect(baseRow({
      images: [
        { tag: "front", url: "https://example.com/f.jpg" },
        { tag: "rear", url: "https://example.com/r.jpg" },
        { tag: "side", url: "https://example.com/s.jpg" },
        { tag: "banana", url: "https://example.com/b.jpg" },
      ],
    }));
    const result = await activateListing("listing-1", "seller-1");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/tagged/i);
  });

  it("rejects when an image is missing a tag", async () => {
    mockDbSelect(baseRow({
      images: [
        { tag: "front", url: "https://example.com/f.jpg" },
        { tag: "rear", url: "https://example.com/r.jpg" },
        { tag: "side", url: "https://example.com/s.jpg" },
        { tag: "", url: "https://example.com/x.jpg" },
      ],
    }));
    const result = await activateListing("listing-1", "seller-1");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/tagged/i);
  });

  it("rejects when no asking price", async () => {
    mockDbSelect(baseRow({ askingPriceNgn: null }));
    const result = await activateListing("listing-1", "seller-1");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/asking price/i);
  });

  it("rejects when asking price is zero", async () => {
    mockDbSelect(baseRow({ askingPriceNgn: "0" }));
    const result = await activateListing("listing-1", "seller-1");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/asking price/i);
  });

  it("rejects when no condition report", async () => {
    mockDbSelect(baseRow({ conditionReport: null }));
    const result = await activateListing("listing-1", "seller-1");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/condition report/i);
  });

  it("rejects when condition report is empty", async () => {
    mockDbSelect(baseRow({ conditionReport: {} }));
    const result = await activateListing("listing-1", "seller-1");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/condition report/i);
  });

  it("rejects when no trimId", async () => {
    mockDbSelect(baseRow({ trimId: null }));
    const result = await activateListing("listing-1", "seller-1");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/incomplete/i);
  });

  it("rejects when no modelYear", async () => {
    mockDbSelect(baseRow({ modelYear: null }));
    const result = await activateListing("listing-1", "seller-1");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/incomplete/i);
  });

  it("activates a valid draft listing with ≥4 tagged images", async () => {
    mockDbSelect(baseRow());
    mockDbUpdate();
    const result = await activateListing("listing-1", "seller-1");
    expect(result.ok).toBe(true);
    expect(result.listingId).toBe("listing-1");
    expect(db.update).toHaveBeenCalled();
  });

  it("sets status to active and updates updatedAt", async () => {
    mockDbSelect(baseRow());
    const { setFn } = mockDbUpdate();
    await activateListing("listing-1", "seller-1");
    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active" }),
    );
    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({ updatedAt: expect.any(Date) }),
    );
  });

  it("accepts 4 images all with valid tags", async () => {
    mockDbSelect(baseRow({
      images: [
        { tag: "front", url: "https://example.com/f.jpg" },
        { tag: "rear", url: "https://example.com/r.jpg" },
        { tag: "side", url: "https://example.com/s.jpg" },
        { tag: "dashboard", url: "https://example.com/d.jpg" },
      ],
    }));
    mockDbUpdate();
    const result = await activateListing("listing-1", "seller-1");
    expect(result.ok).toBe(true);
  });

  it("accepts engine_bay tag as valid", async () => {
    mockDbSelect(baseRow({
      images: [
        { tag: "front", url: "https://example.com/f.jpg" },
        { tag: "rear", url: "https://example.com/r.jpg" },
        { tag: "side", url: "https://example.com/s.jpg" },
        { tag: "engine_bay", url: "https://example.com/e.jpg" },
      ],
    }));
    mockDbUpdate();
    const result = await activateListing("listing-1", "seller-1");
    expect(result.ok).toBe(true);
  });
});
