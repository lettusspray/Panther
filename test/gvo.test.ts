import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";

const { db } = vi.hoisted(() => {
  return { db: { select: vi.fn(), insert: vi.fn() } };
});

vi.mock("../src/lib/db", () => ({
  db: (globalThis as Record<string, unknown>).__GVO_DB_MOCK__,
}));

vi.hoisted(() => {
  (globalThis as Record<string, unknown>).__GVO_DB_MOCK__ = db;
});

vi.mock("../src/lib/db/schema", () => ({
  gvoDomain: { id: "id", name: "name", slug: "slug" },
  gvoCategory: {
    id: "id",
    name: "name",
    slug: "slug",
    domainId: "domainId",
    hsCode: "hsCode",
    dutyBand: "dutyBand",
  },
  gvoMake: {
    id: "id",
    name: "name",
    slug: "slug",
    categoryId: "categoryId",
    origin: "origin",
  },
  gvoModel: {
    id: "id",
    name: "name",
    slug: "slug",
    makeId: "makeId",
    firstModelYear: "firstModelYear",
    lastModelYear: "lastModelYear",
  },
  gvoTrim: {
    id: "id",
    name: "name",
    slug: "slug",
    modelId: "modelId",
    engine: "engine",
    transmission: "transmission",
  },
}));

function chainDbResult(returnData: unknown) {
  const chain: Record<string, Mock> = {};
  chain.select = vi.fn(() => chain);
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.innerJoin = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.values = vi.fn(() => chain);
  chain.returning = vi.fn(() => chain);
  chain.and = vi.fn(() => chain);
  chain.then = vi.fn((resolve: (v: unknown) => void) =>
    Promise.resolve(returnData).then(resolve),
  );
  return chain;
}

import {
  resolveModelPageData,
  resolveTrimBySlugs,
  resolveTrimPath,
} from "../src/lib/gvo";
import { findOrCreateGvoTrim } from "../src/lib/gvo/create-on-the-fly";

beforeEach(() => {
  vi.clearAllMocks();
});

// ── resolveModelPageData ────────────────────────────────────────

describe("resolveModelPageData", () => {
  const domain = { id: "dom-1", name: "Cars", slug: "cars" };
  const category = { id: "cat-1", name: "Sedan", slug: "sedan", domainId: "dom-1" };
  const make = { id: "make-1", name: "Toyota", slug: "toyota", categoryId: "cat-1", origin: "Japan" };
  const model = {
    id: "model-1",
    name: "Camry",
    slug: "camry",
    makeId: "make-1",
    firstModelYear: 2015,
    lastModelYear: 2024,
  };
  const trim = {
    id: "trim-1",
    name: "XLE",
    slug: "xle",
    modelId: "model-1",
    engine: "2.5L",
    transmission: "automatic",
  };

  function queue(...results: unknown[]) {
    const queueCopy = [...results];
    db.select.mockImplementation(() => chainDbResult(queueCopy.shift()));
  }

  it("resolves the full domain → make → model path with year range", async () => {
    queue([domain], [category], [make], [model], [trim]);
    const result = await resolveModelPageData("cars", "toyota", "camry");
    expect(result).not.toBeNull();
    expect(result!.make.name).toBe("Toyota");
    expect(result!.category.slug).toBe("sedan");
    expect(result!.modelYearRange).toBe("2015–2024");
    expect(result!.trims).toHaveLength(1);
    expect(result!.trims[0].name).toBe("XLE");
  });

  it("formats 'since YYYY' when only firstModelYear exists", async () => {
    queue([domain], [category], [make], [{ ...model, lastModelYear: null }], []);
    const result = await resolveModelPageData("cars", "toyota", "camry");
    expect(result!.modelYearRange).toBe("since 2015");
  });

  it("returns empty string range when no years exist", async () => {
    queue([domain], [category], [make], [{ ...model, firstModelYear: null, lastModelYear: null }], []);
    const result = await resolveModelPageData("cars", "toyota", "camry");
    expect(result!.modelYearRange).toBe("");
  });

  it("returns null when the domain slug is unknown", async () => {
    queue([]);
    const result = await resolveModelPageData("nope", "toyota", "camry");
    expect(result).toBeNull();
  });

  it("returns null when the make slug is not under any category", async () => {
    queue([domain], [category], []);
    const result = await resolveModelPageData("cars", "ghost", "camry");
    expect(result).toBeNull();
  });

  it("returns null when the model slug is unknown", async () => {
    queue([domain], [category], [make], []);
    const result = await resolveModelPageData("cars", "toyota", "ghost");
    expect(result).toBeNull();
  });
});

// ── resolveTrimPath / resolveTrimBySlugs ────────────────────────

describe("resolveTrimPath", () => {
  const row = {
    domainId: "dom-1", domainName: "Cars", domainSlug: "cars",
    categoryId: "cat-1", categoryName: "Sedan", categorySlug: "sedan", hsCode: "8703.23", dutyBand: 0.2,
    makeId: "make-1", makeName: "Toyota", makeSlug: "toyota", makeOrigin: "Japan",
    modelId: "model-1", modelName: "Camry", modelSlug: "camry", firstModelYear: 2015, lastModelYear: 2024,
    trimId: "trim-1", trimName: "XLE", trimSlug: "xle", engine: "2.5L", transmission: "automatic",
  };

  it("resolves a trim id to its full GVO path", async () => {
    db.select.mockReturnValue(chainDbResult([row]));
    const result = await resolveTrimPath("trim-1");
    expect(result).not.toBeNull();
    expect(result!.trim.name).toBe("XLE");
    expect(result!.make.origin).toBe("Japan");
    expect(result!.category.hsCode).toBe("8703.23");
    expect(result!.category.dutyBand).toBe(0.2);
  });

  it("returns null when the trim id has no row", async () => {
    db.select.mockReturnValue(chainDbResult([]));
    const result = await resolveTrimPath("missing");
    expect(result).toBeNull();
  });
});

describe("resolveTrimBySlugs", () => {
  const row = {
    trimId: "trim-1",
    domainId: "dom-1", domainName: "Cars", domainSlug: "cars",
    categoryId: "cat-1", categoryName: "Sedan", categorySlug: "sedan", hsCode: "8703.23", dutyBand: 0.2,
    makeId: "make-1", makeName: "Toyota", makeSlug: "toyota", makeOrigin: "Japan",
    modelId: "model-1", modelName: "Camry", modelSlug: "camry", firstModelYear: 2015, lastModelYear: 2024,
    trimName: "XLE", trimSlug: "xle", engine: "2.5L", transmission: "automatic",
  };

  const params = { domain: "cars", make: "toyota", model: "camry", trim: "xle" };

  it("resolves the canonical slug path", async () => {
    db.select.mockReturnValue(chainDbResult([row]));
    const result = await resolveTrimBySlugs(params);
    expect(result).not.toBeNull();
    expect(result!.trimId).toBe("trim-1");
    expect(result!.model.name).toBe("Camry");
  });

  it("accepts an optional category slug in the path", async () => {
    db.select.mockReturnValue(chainDbResult([row]));
    const result = await resolveTrimBySlugs({ ...params, category: "sedan" });
    expect(result).not.toBeNull();
  });

  it("returns null when no row matches", async () => {
    db.select.mockReturnValue(chainDbResult([]));
    const result = await resolveTrimBySlugs(params);
    expect(result).toBeNull();
  });
});

// ── findOrCreateGvoTrim ─────────────────────────────────────────

describe("findOrCreateGvoTrim", () => {
  const domain = { id: "dom-1", name: "Cars", slug: "cars" };
  const category = { id: "cat-1", name: "Sedan", slug: "sedan", domainId: "dom-1" };
  const makeRow = { id: "make-1", name: "Toyota", slug: "toyota", categoryId: "cat-1" };
  const modelRow = { id: "model-1", name: "Camry", slug: "camry", makeId: "make-1" };
  const trimRow = { id: "trim-1", name: "XLE", slug: "xle", modelId: "model-1" };

  function queue(...results: unknown[]) {
    const q = [...results];
    db.select.mockImplementation(() => chainDbResult(q.shift()));
    db.insert.mockImplementation(() => chainDbResult(q.shift()));
  }

  it("throws when the domain slug is unknown", async () => {
    queue([]);
    await expect(
      findOrCreateGvoTrim("cars", "Toyota", "Camry", "XLE", "Sedan"),
    ).rejects.toThrow(/Domain not found/);
  });

  it("creates the full domain→trim chain on the fly", async () => {
    queue(
      [domain],
      [],               // category select → miss
      [category],       // category insert → returning
      [],               // make select → miss
      [makeRow],        // make insert
      [],               // model select → miss
      [modelRow],       // model insert
      [],               // trim select → miss
      [trimRow],        // trim insert
    );
    const id = await findOrCreateGvoTrim("cars", "Toyota", "Camry", "XLE", "Sedan");
    expect(id).toBe("trim-1");
    expect(db.insert).toHaveBeenCalledTimes(4);
  });

  it("slugifies the vehicle type when inserting a new category", async () => {
    queue(
      [domain],
      [],               // category select → miss
      [category],       // category insert
      [],               // make select → miss
      [makeRow],        // make insert
      [],               // model select → miss
      [modelRow],       // model insert
      [],               // trim select → miss
      [trimRow],        // trim insert
    );
    const id = await findOrCreateGvoTrim("cars", "Toyota", "Camry", "XLE", "Pickup Truck");
    expect(id).toBe("trim-1");
    const valuesArg = (db.insert.mock.results[0].value as { values: Mock }).values.mock.calls[0][0];
    expect(valuesArg).toMatchObject({ slug: "pickup-truck", name: "Pickup Truck" });
  });

  it("reuses existing rows without inserting", async () => {
    queue(
      [domain],
      [category],
      [makeRow],
      [modelRow],
      [trimRow],
    );
    const id = await findOrCreateGvoTrim("cars", "Toyota", "Camry", "XLE", "Sedan");
    expect(id).toBe("trim-1");
    expect(db.insert).not.toHaveBeenCalled();
  });
});
