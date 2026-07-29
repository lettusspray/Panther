import { db } from "../db";
import { gvoDomain, gvoCategory, gvoMake, gvoModel, gvoTrim } from "../db/schema";
import { eq, and } from "drizzle-orm";

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function findOrCreateGvoTrim(
  domainSlug: string,
  makeName: string,
  modelName: string,
  trimName: string,
  vehicleType: string,
): Promise<string> {
  const [domain] = await db
    .select()
    .from(gvoDomain)
    .where(eq(gvoDomain.slug, domainSlug))
    .limit(1);

  if (!domain) throw new Error(`Domain not found: ${domainSlug}`);

  const catSlug = slugify(vehicleType);
  let [category] = await db
    .select()
    .from(gvoCategory)
    .where(and(eq(gvoCategory.domainId, domain.id), eq(gvoCategory.slug, catSlug)))
    .limit(1);

  if (!category) {
    const [c] = await db
      .insert(gvoCategory)
      .values({
        domainId: domain.id,
        name: vehicleType.charAt(0).toUpperCase() + vehicleType.slice(1),
        slug: catSlug,
      })
      .returning();
    category = c;
  }

  const makeSlug = slugify(makeName);
  let [makeRow] = await db
    .select()
    .from(gvoMake)
    .where(and(eq(gvoMake.categoryId, category.id), eq(gvoMake.slug, makeSlug)))
    .limit(1);

  if (!makeRow) {
    const [m] = await db
      .insert(gvoMake)
      .values({
        categoryId: category.id,
        name: makeName,
        slug: makeSlug,
      })
      .returning();
    makeRow = m;
  }

  const modelSlug = slugify(modelName);
  let [modelRow] = await db
    .select()
    .from(gvoModel)
    .where(and(eq(gvoModel.makeId, makeRow.id), eq(gvoModel.slug, modelSlug)))
    .limit(1);

  if (!modelRow) {
    const [m] = await db
      .insert(gvoModel)
      .values({
        makeId: makeRow.id,
        name: modelName,
        slug: modelSlug,
      })
      .returning();
    modelRow = m;
  }

  const trimSlug = slugify(trimName);
  let [trimRow] = await db
    .select()
    .from(gvoTrim)
    .where(and(eq(gvoTrim.modelId, modelRow.id), eq(gvoTrim.slug, trimSlug)))
    .limit(1);

  if (!trimRow) {
    const [t] = await db
      .insert(gvoTrim)
      .values({
        modelId: modelRow.id,
        name: trimName,
        slug: trimSlug,
      })
      .returning();
    trimRow = t;
  }

  return trimRow.id;
}
