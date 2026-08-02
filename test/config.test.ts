import { vi, describe, it, expect, beforeEach, afterEach, type Mock } from "vitest";

const { db } = vi.hoisted(() => ({ db: { select: vi.fn() } }));

vi.mock("../src/lib/db", () => ({
  db: (globalThis as Record<string, unknown>).__CONFIG_DB_MOCK__,
}));

vi.hoisted(() => {
  (globalThis as Record<string, unknown>).__CONFIG_DB_MOCK__ = db;
});

vi.mock("../src/lib/db/schema", () => ({
  systemConfig: { key: "key", value: "value", effectiveTimestamp: "effectiveTimestamp", source: "source" },
}));

function chainDbResult(rows: unknown[]) {
  const chain: Record<string, Mock> = {};
  chain.select = vi.fn(() => chain);
  chain.from = vi.fn(() => chain);
  chain.then = vi.fn((resolve: (v: unknown) => void) => Promise.resolve(rows).then(resolve));
  return chain;
}

import {
  checkDataFreshness,
  getRequiredConfig,
  getNcsRate,
  getNacLevyRate,
  PRICING_RATE_KEYS,
} from "../src/lib/config";

const BASE = new Date("2026-06-01T00:00:00Z");
const HOUR = 3600_000;

function row(key: string, value: string, ageHours: number, source = "test") {
  return {
    key,
    value,
    effectiveTimestamp: new Date(BASE.getTime() - ageHours * HOUR),
    source,
  };
}

// advance the module cache beyond its 5-minute TTL so each test repopulates
let clockOffset = 0;

beforeEach(() => {
  vi.useFakeTimers();
  clockOffset += 30 * 60_000;
  vi.setSystemTime(new Date(BASE.getTime() + clockOffset));
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("checkDataFreshness", () => {
  it("reports ok when all keys are fresh", async () => {
    db.select.mockReturnValue(chainDbResult([
      row("ncs_customs_rate", "1500", 1),
      row("vat_rate", "0.075", 2),
    ]));
    const result = await checkDataFreshness(["ncs_customs_rate", "vat_rate"]);
    expect(result.ok).toBe(true);
    expect(result.staleFields).toEqual([]);
  });

  it("flags a key whose effective_timestamp is older than 24h", async () => {
    db.select.mockReturnValue(chainDbResult([
      row("ncs_customs_rate", "1500", 30),
    ]));
    const result = await checkDataFreshness(["ncs_customs_rate"]);
    expect(result.ok).toBe(false);
    expect(result.staleFields).toEqual(["ncs_customs_rate"]);
  });

  it("flags a key that is missing from System_Config entirely", async () => {
    db.select.mockReturnValue(chainDbResult([
      row("ncs_customs_rate", "1500", 1),
    ]));
    const result = await checkDataFreshness(["ncs_customs_rate", "vat_rate"]);
    expect(result.ok).toBe(false);
    expect(result.staleFields).toEqual(["vat_rate"]);
  });

  it("flags multiple stale keys together", async () => {
    db.select.mockReturnValue(chainDbResult([
      row("ncs_customs_rate", "1500", 40),
      row("import_duty_rate", "0.2", 1),
      row("nac_levy_rate", "0.05", 1),
      row("vat_rate", "0.075", 40),
      row("surcharge_rate", "0.07", 1),
      row("ciss_rate", "0.01", 1),
      row("etls_rate", "0.005", 1),
      row("insurance_rate", "0.0075", 1),
    ]));
    const result = await checkDataFreshness(PRICING_RATE_KEYS);
    expect(result.ok).toBe(false);
    expect(result.staleFields.sort()).toEqual(["ncs_customs_rate", "vat_rate"].sort());
  });

  it("a single stale field makes the whole check fail (silence is safer than a lie)", async () => {
    db.select.mockReturnValue(chainDbResult([
      row("ncs_customs_rate", "1500", 1),
      row("import_duty_rate", "0.2", 1),
      row("nac_levy_rate", "0.05", 1),
      row("vat_rate", "0.075", 60),
    ]));
    const result = await checkDataFreshness(PRICING_RATE_KEYS);
    expect(result.ok).toBe(false);
    expect(result.staleFields).toContain("vat_rate");
  });
});

describe("getRequiredConfig", () => {
  it("returns the stored value, timestamp and source", async () => {
    db.select.mockReturnValue(chainDbResult([row("ncs_customs_rate", "1500", 1, "ncs-official")]));
    const config = await getRequiredConfig("ncs_customs_rate");
    expect(config.value).toBe("1500");
    expect(config.source).toBe("ncs-official");
    expect(config.effectiveTimestamp).toBeInstanceOf(Date);
  });

  it("throws when the key is missing", async () => {
    db.select.mockReturnValue(chainDbResult([]));
    await expect(getRequiredConfig("import_duty_rate")).rejects.toThrow(/Missing required system config/);
  });
});

describe("rate getters", () => {
  it("parses the stored value to a number", async () => {
    db.select.mockReturnValue(chainDbResult([row("ncs_customs_rate", "1500.5", 1)]));
    await expect(getNcsRate()).resolves.toBe(1500.5);
  });

  it("NAC levy reads 0.05 (corrected May 2026, not 0.15)", async () => {
    db.select.mockReturnValue(chainDbResult([row("nac_levy_rate", "0.05", 1)]));
    await expect(getNacLevyRate()).resolves.toBe(0.05);
  });
});
