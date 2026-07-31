import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";

const db = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
}));

vi.mock("../src/lib/db", () => ({
  db,
}));

vi.mock("../src/lib/db/schema", () => ({
  user: { id: "id", disclosureTier: "disclosure_tier", updatedAt: "updated_at" },
  listing: { id: "id", sellerId: "seller_id", status: "status", updatedAt: "updated_at" },
}));

function chainDbResult(returnData: unknown) {
  const chain: Record<string, Mock> = {};
  chain.select = vi.fn(() => chain);
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.set = vi.fn(() => chain);
  chain.then = vi.fn((resolve: (v: unknown) => void) =>
    Promise.resolve(returnData).then(resolve),
  );
  return chain;
}

import {
  getDisclosureTier,
  getEnforcementStatus,
  applySanction,
  checkCanUseSwitchboard,
  checkCanCreateListing,
} from "../src/lib/trust/enforcement";

beforeEach(() => {
  vi.clearAllMocks();
});

// ── getDisclosureTier ────────────────────────────────────────────

describe("getDisclosureTier", () => {
  it("returns 'none' for a user with default tier", async () => {
    db.select.mockReturnValue(chainDbResult([{ tier: "none" }]));

    const result = await getDisclosureTier("user-1");
    expect(result).toBe("none");
  });

  it("returns 'warning' when user has warning tier", async () => {
    db.select.mockReturnValue(chainDbResult([{ tier: "warning" }]));

    const result = await getDisclosureTier("user-1");
    expect(result).toBe("warning");
  });

  it("returns 'suspended' when user has suspended tier", async () => {
    db.select.mockReturnValue(chainDbResult([{ tier: "suspended" }]));

    const result = await getDisclosureTier("user-1");
    expect(result).toBe("suspended");
  });

  it("returns 'deactivated' when user has deactivated tier", async () => {
    db.select.mockReturnValue(chainDbResult([{ tier: "deactivated" }]));

    const result = await getDisclosureTier("user-1");
    expect(result).toBe("deactivated");
  });

  it("returns 'none' when user does not exist", async () => {
    db.select.mockReturnValue(chainDbResult([]));

    const result = await getDisclosureTier("nonexistent");
    expect(result).toBe("none");
  });
});

// ── getEnforcementStatus ─────────────────────────────────────────

describe("getEnforcementStatus", () => {
  it("returns full privileges for 'none' tier", async () => {
    db.select.mockReturnValue(chainDbResult([{ tier: "none" }]));

    const result = await getEnforcementStatus("user-1");
    expect(result.tier).toBe("none");
    expect(result.canCreateListing).toBe(true);
    expect(result.canUseSwitchboard).toBe(true);
    expect(result.canActivateListing).toBe(true);
    expect(result.reason).toBeNull();
  });

  it("blocks listing activation for 'warning' tier", async () => {
    db.select.mockReturnValue(chainDbResult([{ tier: "warning" }]));

    const result = await getEnforcementStatus("user-1");
    expect(result.tier).toBe("warning");
    expect(result.canCreateListing).toBe(true);
    expect(result.canUseSwitchboard).toBe(true);
    expect(result.canActivateListing).toBe(false);
    expect(result.reason).toContain("disclosure issue");
  });

  it("blocks switchboard and activation for 'suspended' tier", async () => {
    db.select.mockReturnValue(chainDbResult([{ tier: "suspended" }]));

    const result = await getEnforcementStatus("user-1");
    expect(result.tier).toBe("suspended");
    expect(result.canCreateListing).toBe(true);
    expect(result.canUseSwitchboard).toBe(false);
    expect(result.canActivateListing).toBe(false);
    expect(result.reason).toContain("Switchboard privileges revoked");
  });

  it("blocks everything for 'deactivated' tier", async () => {
    db.select.mockReturnValue(chainDbResult([{ tier: "deactivated" }]));

    const result = await getEnforcementStatus("user-1");
    expect(result.tier).toBe("deactivated");
    expect(result.canCreateListing).toBe(false);
    expect(result.canUseSwitchboard).toBe(false);
    expect(result.canActivateListing).toBe(false);
    expect(result.reason).toContain("Account deactivated");
  });
});

// ── applySanction ────────────────────────────────────────────────

describe("applySanction", () => {
  it("updates user disclosure tier", async () => {
    db.update.mockReturnValue(chainDbResult([]));

    await applySanction("user-1", "suspended");

    expect(db.update).toHaveBeenCalled();
  });

  it("downgrades all listings to draft when sanction is 'warning'", async () => {
    db.update.mockReturnValue(chainDbResult([]));

    await applySanction("user-1", "warning");

    // First call: update user tier. Second call: downgrade listings.
    expect(db.update).toHaveBeenCalledTimes(2);
  });

  it("downgrades all listings to draft when sanction is 'suspended'", async () => {
    db.update.mockReturnValue(chainDbResult([]));

    await applySanction("user-1", "suspended");

    expect(db.update).toHaveBeenCalledTimes(2);
  });

  it("does not downgrade listings for 'deactivated' sanction", async () => {
    db.update.mockReturnValue(chainDbResult([]));

    await applySanction("user-1", "deactivated");

    // Only the user tier update — no listing downgrade
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("does not downgrade listings for 'none' sanction (clearing)", async () => {
    db.update.mockReturnValue(chainDbResult([]));

    await applySanction("user-1", "none");

    expect(db.update).toHaveBeenCalledTimes(1);
  });
});

// ── checkCanUseSwitchboard ───────────────────────────────────────

describe("checkCanUseSwitchboard", () => {
  it("returns ok for 'none' tier", async () => {
    db.select.mockReturnValue(chainDbResult([{ tier: "none" }]));

    const result = await checkCanUseSwitchboard("user-1");

    expect(result.ok).toBe(true);
  });

  it("returns ok for 'warning' tier", async () => {
    db.select.mockReturnValue(chainDbResult([{ tier: "warning" }]));

    const result = await checkCanUseSwitchboard("user-1");

    expect(result.ok).toBe(true);
  });

  it("returns error for 'suspended' tier", async () => {
    db.select.mockReturnValue(chainDbResult([{ tier: "suspended" }]));

    const result = await checkCanUseSwitchboard("user-1");

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("returns error for 'deactivated' tier", async () => {
    db.select.mockReturnValue(chainDbResult([{ tier: "deactivated" }]));

    const result = await checkCanUseSwitchboard("user-1");

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ── checkCanCreateListing ────────────────────────────────────────

describe("checkCanCreateListing", () => {
  it("returns ok for 'none' tier", async () => {
    db.select.mockReturnValue(chainDbResult([{ tier: "none" }]));

    const result = await checkCanCreateListing("user-1");

    expect(result.ok).toBe(true);
  });

  it("returns ok for 'warning' tier", async () => {
    db.select.mockReturnValue(chainDbResult([{ tier: "warning" }]));

    const result = await checkCanCreateListing("user-1");

    expect(result.ok).toBe(true);
  });

  it("returns ok for 'suspended' tier", async () => {
    db.select.mockReturnValue(chainDbResult([{ tier: "suspended" }]));

    const result = await checkCanCreateListing("user-1");

    expect(result.ok).toBe(true);
  });

  it("returns error for 'deactivated' tier", async () => {
    db.select.mockReturnValue(chainDbResult([{ tier: "deactivated" }]));

    const result = await checkCanCreateListing("user-1");

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });
});
