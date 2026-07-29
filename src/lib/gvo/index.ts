import { eq, and } from "drizzle-orm";
import { db } from "../db";
import {
  gvoDomain,
  gvoCategory,
  gvoMake,
  gvoModel,
  gvoTrim,
} from "../db/schema";

// ── Read queries (cascading selectors) ─────────────────────────────

export async function getDomains() {
  return db.select().from(gvoDomain).orderBy(gvoDomain.name);
}

export async function getCategoriesByDomain(domainId: string) {
  return db
    .select()
    .from(gvoCategory)
    .where(eq(gvoCategory.domainId, domainId))
    .orderBy(gvoCategory.name);
}

export async function getMakesByCategory(categoryId: string) {
  return db
    .select()
    .from(gvoMake)
    .where(eq(gvoMake.categoryId, categoryId))
    .orderBy(gvoMake.name);
}

export async function getModelsByMake(makeId: string) {
  return db
    .select()
    .from(gvoModel)
    .where(eq(gvoModel.makeId, makeId))
    .orderBy(gvoModel.name);
}

export async function getTrimsByModel(modelId: string) {
  return db
    .select()
    .from(gvoTrim)
    .where(eq(gvoTrim.modelId, modelId))
    .orderBy(gvoTrim.name);
}

// ── Full path resolver ─────────────────────────────────────────────

export interface GvoPath {
  domain: { id: string; name: string; slug: string };
  category: { id: string; name: string; slug: string; hsCode: string | null; dutyBand: number | null };
  make: { id: string; name: string; slug: string; origin: string | null };
  model: { id: string; name: string; slug: string; firstModelYear: number | null; lastModelYear: number | null };
  trim: { id: string; name: string; slug: string; engine: string | null; transmission: string | null };
}

export async function resolveTrimPath(trimId: string): Promise<GvoPath | null> {
  const rows = await db
    .select({
      domainId: gvoDomain.id,
      domainName: gvoDomain.name,
      domainSlug: gvoDomain.slug,
      categoryId: gvoCategory.id,
      categoryName: gvoCategory.name,
      categorySlug: gvoCategory.slug,
      hsCode: gvoCategory.hsCode,
      dutyBand: gvoCategory.dutyBand,
      makeId: gvoMake.id,
      makeName: gvoMake.name,
      makeSlug: gvoMake.slug,
      makeOrigin: gvoMake.origin,
      modelId: gvoModel.id,
      modelName: gvoModel.name,
      modelSlug: gvoModel.slug,
      firstModelYear: gvoModel.firstModelYear,
      lastModelYear: gvoModel.lastModelYear,
      trimId: gvoTrim.id,
      trimName: gvoTrim.name,
      trimSlug: gvoTrim.slug,
      engine: gvoTrim.engine,
      transmission: gvoTrim.transmission,
    })
    .from(gvoTrim)
    .innerJoin(gvoModel, eq(gvoTrim.modelId, gvoModel.id))
    .innerJoin(gvoMake, eq(gvoModel.makeId, gvoMake.id))
    .innerJoin(gvoCategory, eq(gvoMake.categoryId, gvoCategory.id))
    .innerJoin(gvoDomain, eq(gvoCategory.domainId, gvoDomain.id))
    .where(eq(gvoTrim.id, trimId))
    .limit(1);

  if (rows.length === 0) return null;

  const r = rows[0];
  return {
    domain: { id: r.domainId, name: r.domainName, slug: r.domainSlug },
    category: { id: r.categoryId, name: r.categoryName, slug: r.categorySlug, hsCode: r.hsCode, dutyBand: r.dutyBand },
    make: { id: r.makeId, name: r.makeName, slug: r.makeSlug, origin: r.makeOrigin },
    model: { id: r.modelId, name: r.modelName, slug: r.modelSlug, firstModelYear: r.firstModelYear, lastModelYear: r.lastModelYear },
    trim: { id: r.trimId, name: r.trimName, slug: r.trimSlug, engine: r.engine, transmission: r.transmission },
  };
}

// ── Slug-based resolver (for SEO-friendly URLs) ────────────────────

export async function resolveTrimBySlugs(params: {
  domain: string;
  category?: string;
  make: string;
  model: string;
  trim: string;
}): Promise<(GvoPath & { trimId: string }) | null> {
  const conditions = [
    eq(gvoDomain.slug, params.domain),
    eq(gvoMake.slug, params.make),
    eq(gvoModel.slug, params.model),
    eq(gvoTrim.slug, params.trim),
  ];

  if (params.category) {
    conditions.push(eq(gvoCategory.slug, params.category));
  }

  const rows = await db
    .select({
      trimId: gvoTrim.id,
      domainId: gvoDomain.id,
      domainName: gvoDomain.name,
      domainSlug: gvoDomain.slug,
      categoryId: gvoCategory.id,
      categoryName: gvoCategory.name,
      categorySlug: gvoCategory.slug,
      hsCode: gvoCategory.hsCode,
      dutyBand: gvoCategory.dutyBand,
      makeId: gvoMake.id,
      makeName: gvoMake.name,
      makeSlug: gvoMake.slug,
      makeOrigin: gvoMake.origin,
      modelId: gvoModel.id,
      modelName: gvoModel.name,
      modelSlug: gvoModel.slug,
      firstModelYear: gvoModel.firstModelYear,
      lastModelYear: gvoModel.lastModelYear,
      trimName: gvoTrim.name,
      trimSlug: gvoTrim.slug,
      engine: gvoTrim.engine,
      transmission: gvoTrim.transmission,
    })
    .from(gvoTrim)
    .innerJoin(gvoModel, eq(gvoTrim.modelId, gvoModel.id))
    .innerJoin(gvoMake, eq(gvoModel.makeId, gvoMake.id))
    .innerJoin(gvoCategory, eq(gvoMake.categoryId, gvoCategory.id))
    .innerJoin(gvoDomain, eq(gvoCategory.domainId, gvoDomain.id))
    .where(and(...conditions))
    .limit(1);

  if (rows.length === 0) return null;

  const r = rows[0];
  return {
    trimId: r.trimId,
    domain: { id: r.domainId, name: r.domainName, slug: r.domainSlug },
    category: { id: r.categoryId, name: r.categoryName, slug: r.categorySlug, hsCode: r.hsCode, dutyBand: r.dutyBand },
    make: { id: r.makeId, name: r.makeName, slug: r.makeSlug, origin: r.makeOrigin },
    model: { id: r.modelId, name: r.modelName, slug: r.modelSlug, firstModelYear: r.firstModelYear, lastModelYear: r.lastModelYear },
    trim: { id: r.trimId, name: r.trimName, slug: r.trimSlug, engine: r.engine, transmission: r.transmission },
  };
}
