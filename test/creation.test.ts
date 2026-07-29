import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/lib/db", () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "test-id" }]),
      }),
    }),
  },
}));

vi.mock("../src/lib/gvo", () => ({
  resolveTrimPath: vi.fn(),
}));

import { db } from "../src/lib/db";
import { resolveTrimPath } from "../src/lib/gvo";
import { createListing, type CreateListingInput } from "../src/lib/listings/creation";
import { CAR_CONDITION_FIELDS } from "../src/lib/listings/condition-reports";

function buildValidInput(overrides: Partial<CreateListingInput> = {}): CreateListingInput {
  const conditionReport: Record<string, string> = {};
  for (const field of CAR_CONDITION_FIELDS) {
    if (field.required) {
      conditionReport[field.key] = field.type === "select" ? field.options![0] : "good";
    }
  }
  return {
    sellerId: "seller-1",
    trimId: "trim-1",
    modelYear: 2020,
    mileageKm: 50000,
    askingPriceNgn: 5_000_000,
    conditionReport,
    ...overrides,
  };
}

function mockValidGvoPath() {
  (resolveTrimPath as ReturnType<typeof vi.fn>).mockResolvedValue({
    domain: { name: "car" },
    model: { firstModelYear: 2010, lastModelYear: 2025 },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createListing", () => {
  describe("invalid askingPriceNgn", () => {
    it("rejects NaN", async () => {
      const result = await createListing(buildValidInput({ askingPriceNgn: NaN }));
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/price/i);
    });

    it("rejects Infinity", async () => {
      const result = await createListing(buildValidInput({ askingPriceNgn: Infinity }));
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/price/i);
    });

    it("rejects zero", async () => {
      const result = await createListing(buildValidInput({ askingPriceNgn: 0 }));
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/price/i);
    });

    it("rejects negative", async () => {
      const result = await createListing(buildValidInput({ askingPriceNgn: -100 }));
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/price/i);
    });
  });

  describe("invalid mileageKm", () => {
    it("rejects NaN", async () => {
      mockValidGvoPath();
      const result = await createListing(buildValidInput({ mileageKm: NaN }));
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/mileage/i);
    });

    it("rejects negative", async () => {
      mockValidGvoPath();
      const result = await createListing(buildValidInput({ mileageKm: -1 }));
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/mileage/i);
    });
  });

  describe("valid inputs with valid GVO", () => {
    it("creates listing successfully", async () => {
      mockValidGvoPath();
      const result = await createListing(buildValidInput());
      expect(result.ok).toBe(true);
      expect(result.listingId).toBe("test-id");
      expect(db.insert).toHaveBeenCalled();
    });
  });
});
