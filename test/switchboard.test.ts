import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";

const { db } = vi.hoisted(() => {
  const db = {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
  };
  return { db };
});

vi.mock("../src/lib/db", () => ({
  db: (globalThis as Record<string, unknown>).__SWITCHBOARD_DB_MOCK__,
}));

vi.hoisted(() => {
  (globalThis as Record<string, unknown>).__SWITCHBOARD_DB_MOCK__ = db;
});

vi.mock("../src/lib/db/schema", () => ({
  switchboardTransaction: {
    id: "id",
    status: "status",
    listingId: "listingId",
    buyerId: "buyerId",
    sellerId: "sellerId",
    agreedPriceNgn: "agreedPriceNgn",
    platformFeeNgn: "platformFeeNgn",
    feePayer: "feePayer",
    initiatedAt: "initiatedAt",
    completedAt: "completedAt",
  },
  listing: { id: "id", trimId: "trimId", modelYear: "modelYear" },
  user: { id: "id", name: "name", email: "email" },
  gvoTrim: { id: "id", modelId: "modelId", name: "name" },
  gvoModel: { id: "id", makeId: "makeId", name: "name" },
  gvoMake: { id: "id", name: "name" },
}));

function chainDbResult(returnData: unknown) {
  const chain: Record<string, Mock> = {};
  chain.select = vi.fn(() => chain);
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.insert = vi.fn(() => chain);
  chain.values = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.set = vi.fn(() => chain);
  chain.returning = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.innerJoin = vi.fn(() => chain);
  chain.then = vi.fn((resolve: (v: unknown) => void) =>
    Promise.resolve(returnData).then(resolve),
  );
  return chain;
}

import {
  calculatePlatformFee,
  calculateSellerProceeds,
  canTransition,
  refundTransaction,
  initiateTransaction,
  transitionTransaction,
  getTransactionById,
  getTransactionWithDetails,
  getTransactionsByBuyer,
  getTransactionsBySeller,
} from "../src/lib/trust/switchboard";
import type { SwitchboardStatus } from "../src/lib/trust/switchboard";

const mockTx = {
  id: "tx-1",
  status: "initiated",
  listingId: "listing-1",
  buyerId: "buyer-1",
  sellerId: "seller-1",
  agreedPriceNgn: "1000000",
  platformFeeNgn: "25000",
  feePayer: "seller",
  initiatedAt: new Date(),
  completedAt: null,
};

const refundedTx = {
  ...mockTx,
  status: "refunded",
  platformFeeNgn: "0",
  completedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ── calculatePlatformFee ─────────────────────────────────────────

describe("calculatePlatformFee", () => {
  it("charges 2.5% of agreed price with default rate", () => {
    expect(calculatePlatformFee(1_000_000)).toBe(25_000);
  });

  it("rounds to 2 decimal places (kobo-accurate)", () => {
    expect(calculatePlatformFee(1_000_001)).toBe(25_000.03);
  });

  it("handles small amounts without floating-point drift", () => {
    expect(calculatePlatformFee(100)).toBe(2.5);
  });

  it("returns 0 for a price of 0", () => {
    expect(calculatePlatformFee(0)).toBe(0);
  });

  it("accepts a custom fee rate override", () => {
    expect(calculatePlatformFee(1_000_000, 0.05)).toBe(50_000);
  });

  it("handles 0% fee rate", () => {
    expect(calculatePlatformFee(1_000_000, 0)).toBe(0);
  });

  it("rounds correctly at boundary — 333,333 at 2.5%", () => {
    expect(calculatePlatformFee(333_333)).toBe(8_333.33);
  });
});

// ── calculateSellerProceeds ──────────────────────────────────────

describe("calculateSellerProceeds", () => {
  it("deducts 2.5% fee from agreed price", () => {
    const result = calculateSellerProceeds(1_000_000);
    expect(result.feeNgn).toBe(25_000);
    expect(result.sellerReceivesNgn).toBe(975_000);
  });

  it("is kobo-accurate — fee + proceeds = agreed price", () => {
    const price = 1_234_567;
    const result = calculateSellerProceeds(price);
    expect(result.feeNgn + result.sellerReceivesNgn).toBeCloseTo(price, 2);
  });

  it("returns 0 proceeds when price is 0", () => {
    const result = calculateSellerProceeds(0);
    expect(result.feeNgn).toBe(0);
    expect(result.sellerReceivesNgn).toBe(0);
  });

  it("handles custom fee rate", () => {
    const result = calculateSellerProceeds(2_000_000, 0.05);
    expect(result.feeNgn).toBe(100_000);
    expect(result.sellerReceivesNgn).toBe(1_900_000);
  });

  it("never gives seller more than the agreed price", () => {
    for (const price of [1, 100, 999_999, 10_000_000]) {
      const result = calculateSellerProceeds(price);
      expect(result.sellerReceivesNgn).toBeLessThanOrEqual(price);
      expect(result.sellerReceivesNgn).toBeGreaterThanOrEqual(0);
    }
  });
});

// ── canTransition ────────────────────────────────────────────────

describe("canTransition", () => {
  const VALID_TRANSITIONS: [SwitchboardStatus, SwitchboardStatus][] = [
    ["initiated", "funds_held"],
    ["initiated", "refunded"],
    ["funds_held", "inspection_window"],
    ["funds_held", "refunded"],
    ["inspection_window", "buyer_confirmed"],
    ["inspection_window", "disputed"],
    ["inspection_window", "refunded"],
    ["buyer_confirmed", "seller_confirmed"],
    ["buyer_confirmed", "disputed"],
    ["buyer_confirmed", "refunded"],
    ["seller_confirmed", "released"],
    ["seller_confirmed", "disputed"],
    ["disputed", "released"],
    ["disputed", "refunded"],
  ];

  describe("valid transitions", () => {
    it.each(VALID_TRANSITIONS)(
      "allows %s → %s",
      (from, to) => {
        const result = canTransition(from, to);
        expect(result.ok).toBe(true);
        expect(result.newStatus).toBe(to);
      },
    );
  });

  const INVALID_TRANSITIONS: [SwitchboardStatus, SwitchboardStatus][] = [
    // Skipping steps
    ["initiated", "released"],
    ["initiated", "disputed"],
    ["initiated", "inspection_window"],
    ["initiated", "buyer_confirmed"],
    ["initiated", "seller_confirmed"],
    ["funds_held", "released"],
    ["funds_held", "disputed"],
    ["funds_held", "buyer_confirmed"],
    ["funds_held", "seller_confirmed"],
    ["funds_held", "initiated"],
    ["inspection_window", "released"],
    ["inspection_window", "initiated"],
    ["inspection_window", "funds_held"],
    ["buyer_confirmed", "released"],
    ["buyer_confirmed", "initiated"],
    ["buyer_confirmed", "funds_held"],
    ["buyer_confirmed", "inspection_window"],
    ["seller_confirmed", "refunded"],
    ["seller_confirmed", "initiated"],
    ["seller_confirmed", "funds_held"],
    ["seller_confirmed", "inspection_window"],
    ["seller_confirmed", "buyer_confirmed"],
    ["disputed", "initiated"],
    ["disputed", "funds_held"],
    ["disputed", "inspection_window"],
    ["disputed", "buyer_confirmed"],
    ["disputed", "seller_confirmed"],
    // Terminal states — no transitions out
    ["released", "initiated"],
    ["released", "funds_held"],
    ["released", "inspection_window"],
    ["released", "buyer_confirmed"],
    ["released", "seller_confirmed"],
    ["released", "disputed"],
    ["released", "refunded"],
    ["refunded", "initiated"],
    ["refunded", "funds_held"],
    ["refunded", "inspection_window"],
    ["refunded", "buyer_confirmed"],
    ["refunded", "seller_confirmed"],
    ["refunded", "disputed"],
    ["refunded", "released"],
  ];

  describe("invalid transitions", () => {
    it.each(INVALID_TRANSITIONS)(
      "rejects %s → %s",
      (from, to) => {
        const result = canTransition(from, to);
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.newStatus).toBeUndefined();
      },
    );
  });

  describe("terminal states", () => {
    const ALL_TARGETS: SwitchboardStatus[] = [
      "initiated", "funds_held", "inspection_window",
      "buyer_confirmed", "seller_confirmed", "disputed",
      "released", "refunded",
    ];

    it("released has no valid transitions", () => {
      for (const target of ALL_TARGETS) {
        const result = canTransition("released", target);
        expect(result.ok).toBe(false);
      }
    });

    it("refunded has no valid transitions", () => {
      for (const target of ALL_TARGETS) {
        const result = canTransition("refunded", target);
        expect(result.ok).toBe(false);
      }
    });
  });

  describe("error messages", () => {
    it("includes current → target in error for invalid transition", () => {
      const result = canTransition("initiated", "released");
      expect(result.error).toContain("initiated → released");
    });

    it("reports allowed targets in error", () => {
      const result = canTransition("initiated", "released");
      expect(result.error).toContain("funds_held");
      expect(result.error).toContain("refunded");
    });
  });

  describe("anti-coercion — all pre-release stages allow refund", () => {
    const PRE_RELEASE_STATUSES: SwitchboardStatus[] = [
      "initiated",
      "funds_held",
      "inspection_window",
      "buyer_confirmed",
    ];

    it.each(PRE_RELEASE_STATUSES)(
      "allows refund from %s (no cancellation fee)",
      (status) => {
        const result = canTransition(status, "refunded");
        expect(result.ok).toBe(true);
        expect(result.newStatus).toBe("refunded");
      },
    );
  });
});

// ── refundTransaction — no cancellation fee ──────────────────────

describe("refundTransaction", () => {
  it("transitions to refunded", async () => {
    db.select.mockReturnValue(chainDbResult([mockTx]));
    db.update.mockReturnValue(chainDbResult([refundedTx]));

    const result = await refundTransaction("tx-1");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.transaction.status).toBe("refunded");
    }
  });

  it("sets platformFeeNgn to 0 on refund — no cancellation fee", async () => {
    db.select.mockReturnValue(chainDbResult([mockTx]));
    db.update.mockReturnValue(chainDbResult([refundedTx]));

    const result = await refundTransaction("tx-1");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Number(result.transaction.platformFeeNgn)).toBe(0);
    }
  });

  it("sets completedAt timestamp on refund", async () => {
    db.select.mockReturnValue(chainDbResult([mockTx]));
    db.update.mockReturnValue(chainDbResult([refundedTx]));

    const result = await refundTransaction("tx-1");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.transaction.completedAt).toBeInstanceOf(Date);
    }
  });

  it("refund uses db.update, not db.insert — no fee record created", async () => {
    db.select.mockReturnValue(chainDbResult([mockTx]));
    db.update.mockReturnValue(chainDbResult([refundedTx]));

    await refundTransaction("tx-1");

    expect(db.update).toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("returns error for nonexistent transaction", async () => {
    db.select.mockReturnValue(chainDbResult([]));

    const result = await refundTransaction("nonexistent");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Transaction not found");
    }
  });
});

// ── Integration: fee + proceeds consistency ──────────────────────

describe("fee/proceeds invariant", () => {
  const PRICES = [1, 500, 50_000, 333_333, 1_000_000, 15_500_000];
  const RATES = [0, 0.01, 0.025, 0.05, 0.1];

  it.each(
    PRICES.flatMap((p) => RATES.map((r) => [p, r] as const)),
  )(
    "price=%s rate=%s: fee + proceeds = price (within kobo)",
    (price, rate) => {
      const { feeNgn, sellerReceivesNgn } = calculateSellerProceeds(price, rate);
      expect(feeNgn + sellerReceivesNgn).toBeCloseTo(price, 2);
      expect(feeNgn).toBeGreaterThanOrEqual(0);
      expect(sellerReceivesNgn).toBeGreaterThanOrEqual(0);
    },
  );
});

// ── initiateTransaction ──────────────────────────────────────────

describe("initiateTransaction", () => {
  it("creates a transaction with status=initiated and feePayer=seller", async () => {
    const created = { ...mockTx, id: "new-tx" };
    chainDbResult([created]);
    db.insert.mockReturnValue(chainDbResult([created]));

    const result = await initiateTransaction({
      listingId: "listing-1",
      buyerId: "buyer-1",
      sellerId: "seller-1",
      agreedPriceNgn: 1_000_000,
    });

    expect(result.id).toBe("new-tx");
    expect(result.status).toBe("initiated");
    expect(result.feePayer).toBe("seller");
  });

  it("calculates and stores platform fee on creation", async () => {
    const created = { ...mockTx, id: "tx-2", platformFeeNgn: "25000" };
    db.insert.mockReturnValue(chainDbResult([created]));

    const result = await initiateTransaction({
      listingId: "listing-1",
      buyerId: "buyer-1",
      sellerId: "seller-1",
      agreedPriceNgn: 1_000_000,
    });

    expect(Number(result.platformFeeNgn)).toBe(25_000);
  });

  it("accepts custom fee rate override", async () => {
    const created = { ...mockTx, id: "tx-3", platformFeeNgn: "50000" };
    db.insert.mockReturnValue(chainDbResult([created]));

    const result = await initiateTransaction({
      listingId: "listing-1",
      buyerId: "buyer-1",
      sellerId: "seller-1",
      agreedPriceNgn: 1_000_000,
      feeRate: 0.05,
    });

    expect(Number(result.platformFeeNgn)).toBe(50_000);
  });
});

// ── transitionTransaction ────────────────────────────────────────

describe("transitionTransaction", () => {
  it("transitions from initiated to funds_held", async () => {
    const updated = { ...mockTx, status: "funds_held" };
    db.select.mockReturnValue(chainDbResult([mockTx]));
    db.update.mockReturnValue(chainDbResult([updated]));

    const result = await transitionTransaction("tx-1", "funds_held");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.transaction.status).toBe("funds_held");
    }
  });

  it("returns error for nonexistent transaction", async () => {
    db.select.mockReturnValue(chainDbResult([]));

    const result = await transitionTransaction("nonexistent", "funds_held");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Transaction not found");
    }
  });

  it("returns error for invalid transition", async () => {
    db.select.mockReturnValue(chainDbResult([mockTx]));

    const result = await transitionTransaction("tx-1", "released");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Invalid transition");
      expect(result.error).toContain("initiated → released");
    }
  });

  it("sets completedAt when transitioning to released", async () => {
    const initiated = { ...mockTx, status: "seller_confirmed" };
    const released = { ...mockTx, status: "released", completedAt: new Date() };
    db.select.mockReturnValue(chainDbResult([initiated]));
    db.update.mockReturnValue(chainDbResult([released]));

    const result = await transitionTransaction("tx-1", "released");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.transaction.completedAt).toBeInstanceOf(Date);
    }
  });

  it("sets completedAt when transitioning to refunded", async () => {
    const refunded = { ...mockTx, status: "refunded", completedAt: new Date(), platformFeeNgn: "0" };
    db.select.mockReturnValue(chainDbResult([mockTx]));
    db.update.mockReturnValue(chainDbResult([refunded]));

    const result = await transitionTransaction("tx-1", "refunded");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.transaction.completedAt).toBeInstanceOf(Date);
    }
  });

  it("does not set completedAt for non-terminal transitions", async () => {
    const held = { ...mockTx, status: "funds_held" };
    db.select.mockReturnValue(chainDbResult([mockTx]));
    db.update.mockReturnValue(chainDbResult([held]));

    const result = await transitionTransaction("tx-1", "funds_held");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.transaction.completedAt).toBeNull();
    }
  });
});

// ── getTransactionById ───────────────────────────────────────────

describe("getTransactionById", () => {
  it("returns the transaction when found", async () => {
    db.select.mockReturnValue(chainDbResult([mockTx]));

    const result = await getTransactionById("tx-1");

    expect(result).not.toBeNull();
    expect(result!.id).toBe("tx-1");
    expect(result!.status).toBe("initiated");
  });

  it("returns null when transaction does not exist", async () => {
    db.select.mockReturnValue(chainDbResult([]));

    const result = await getTransactionById("nonexistent");

    expect(result).toBeNull();
  });
});

// ── getTransactionWithDetails ────────────────────────────────────

describe("getTransactionWithDetails", () => {
  const detailedTx = {
    id: "tx-1",
    status: "initiated",
    agreedPriceNgn: "1000000",
    platformFeeNgn: "25000",
    feePayer: "seller",
    initiatedAt: new Date(),
    completedAt: null,
    buyerName: "Test Buyer",
    buyerEmail: "buyer@test.com",
    listingModelYear: 2022,
    trimName: "LE",
    modelName: "Camry",
    makeName: "Toyota",
  };

  it("returns transaction with joined details", async () => {
    db.select.mockReturnValue(chainDbResult([detailedTx]));

    const result = await getTransactionWithDetails("tx-1");

    expect(result).not.toBeNull();
    expect(result!.buyerName).toBe("Test Buyer");
    expect(result!.makeName).toBe("Toyota");
    expect(result!.modelName).toBe("Camry");
    expect(result!.trimName).toBe("LE");
    expect(result!.listingModelYear).toBe(2022);
  });

  it("returns null when transaction does not exist", async () => {
    db.select.mockReturnValue(chainDbResult([]));

    const result = await getTransactionWithDetails("nonexistent");

    expect(result).toBeNull();
  });
});

// ── getTransactionsByBuyer ───────────────────────────────────────

describe("getTransactionsByBuyer", () => {
  it("returns transactions for given buyer", async () => {
    const txs = [mockTx, { ...mockTx, id: "tx-2", status: "funds_held" }];
    db.select.mockReturnValue(chainDbResult(txs));

    const result = await getTransactionsByBuyer("buyer-1");

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("tx-1");
    expect(result[1].id).toBe("tx-2");
  });

  it("returns empty array when buyer has no transactions", async () => {
    db.select.mockReturnValue(chainDbResult([]));

    const result = await getTransactionsByBuyer("no-tx-buyer");

    expect(result).toHaveLength(0);
  });
});

// ── getTransactionsBySeller ──────────────────────────────────────

describe("getTransactionsBySeller", () => {
  it("returns transactions for given seller", async () => {
    const txs = [mockTx];
    db.select.mockReturnValue(chainDbResult(txs));

    const result = await getTransactionsBySeller("seller-1");

    expect(result).toHaveLength(1);
    expect(result[0].sellerId).toBe("seller-1");
  });

  it("returns empty array when seller has no transactions", async () => {
    db.select.mockReturnValue(chainDbResult([]));

    const result = await getTransactionsBySeller("no-tx-seller");

    expect(result).toHaveLength(0);
  });
});
