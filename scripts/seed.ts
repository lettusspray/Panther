/**
 * Seed script — populates the GVO hierarchy and initial System_Config rates.
 *
 * Usage:  pnpm db:seed          (requires DATABASE_URL in .env)
 * Idempotent — safe to run multiple times (uses upsert via onConflictDoUpdate).
 *
 * Constitution compliance:
 *   - No "Miscellaneous" or "Other" categories (§III.1)
 *   - No Lagos defaults (§VI.1)
 *   - No hardcoded statutory constants — seeds initial values only (§II.2)
 *   - All rates marked source="seed" so the kill switch catches staleness
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import {
  gvoDomain,
  gvoCategory,
  gvoMake,
  gvoModel,
  gvoTrim,
  systemConfig,
} from "../src/lib/db/schema";
import { eq } from "drizzle-orm";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

// ── Helpers ─────────────────────────────────────────────────────────

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function upsertDomain(name: string): Promise<string> {
  const s = slug(name);
  const existing = await db.select().from(gvoDomain).where(eq(gvoDomain.slug, s));
  if (existing.length > 0) return existing[0].id;

  const [row] = await db.insert(gvoDomain).values({ name, slug: s }).returning();
  return row.id;
}

async function upsertCategory(
  domainId: string,
  name: string,
  hsCode?: string,
  dutyBand?: number,
): Promise<string> {
  const s = slug(name);
  const existing = await db
    .select()
    .from(gvoCategory)
    .where(eq(gvoCategory.slug, s));
  if (existing.length > 0) return existing[0].id;

  const [row] = await db
    .insert(gvoCategory)
    .values({ domainId, name, slug: s, hsCode: hsCode ?? null, dutyBand: dutyBand ?? null })
    .returning();
  return row.id;
}

async function upsertMake(
  categoryId: string,
  name: string,
  origin?: string,
): Promise<string> {
  const s = slug(name);
  const existing = await db.select().from(gvoMake).where(eq(gvoMake.slug, s));
  if (existing.length > 0) return existing[0].id;

  const [row] = await db
    .insert(gvoMake)
    .values({ categoryId, name, slug: s, origin: origin ?? null })
    .returning();
  return row.id;
}

async function upsertModel(
  makeId: string,
  name: string,
  firstYear?: number,
  lastYear?: number,
): Promise<string> {
  const s = slug(name);
  const existing = await db
    .select()
    .from(gvoModel)
    .where(eq(gvoModel.slug, s));
  if (existing.length > 0) return existing[0].id;

  const [row] = await db
    .insert(gvoModel)
    .values({
      makeId,
      name,
      slug: s,
      firstModelYear: firstYear ?? null,
      lastModelYear: lastYear ?? null,
    })
    .returning();
  return row.id;
}

async function upsertTrim(
  modelId: string,
  name: string,
  engine?: string,
  transmission?: string,
): Promise<string> {
  const s = slug(name);
  const existing = await db.select().from(gvoTrim).where(eq(gvoTrim.slug, s));
  if (existing.length > 0) return existing[0].id;

  const [row] = await db
    .insert(gvoTrim)
    .values({
      modelId,
      name,
      slug: s,
      engine: engine ?? null,
      transmission: transmission ?? null,
    })
    .returning();
  return row.id;
}

// ── GVO Data ────────────────────────────────────────────────────────

interface TrimDef {
  name: string;
  engine?: string;
  transmission?: string;
}

interface ModelDef {
  name: string;
  firstYear?: number;
  lastYear?: number;
  trims: TrimDef[];
}

interface MakeDef {
  name: string;
  origin?: string;
  models: ModelDef[];
}

interface CategoryDef {
  name: string;
  hsCode?: string;
  dutyBand?: number;
  makes: MakeDef[];
}

interface DomainDef {
  name: string;
  categories: CategoryDef[];
}

const GVO_DATA: DomainDef[] = [
  {
    name: "car",
    categories: [
      {
        name: "Sedan",
        hsCode: "8703",
        dutyBand: 3,
        makes: [
          {
            name: "Toyota",
            origin: "Japan",
            models: [
              {
                name: "Camry",
                firstYear: 1997,
                lastYear: 2025,
                trims: [
                  { name: "LE", engine: "2.5L 4-Cyl", transmission: "Automatic" },
                  { name: "SE", engine: "2.5L 4-Cyl", transmission: "Automatic" },
                  { name: "XLE", engine: "2.5L 4-Cyl", transmission: "Automatic" },
                ],
              },
              {
                name: "Corolla",
                firstYear: 1997,
                lastYear: 2025,
                trims: [
                  { name: "L", engine: "1.8L 4-Cyl", transmission: "Automatic" },
                  { name: "LE", engine: "1.8L 4-Cyl", transmission: "Automatic" },
                  { name: "XLE", engine: "2.0L 4-Cyl", transmission: "Automatic" },
                ],
              },
            ],
          },
          {
            name: "Honda",
            origin: "Japan",
            models: [
              {
                name: "Civic",
                firstYear: 2001,
                lastYear: 2025,
                trims: [
                  { name: "LX", engine: "2.0L 4-Cyl", transmission: "Automatic" },
                  { name: "EX", engine: "1.5L Turbo", transmission: "CVT" },
                  { name: "Touring", engine: "1.5L Turbo", transmission: "CVT" },
                ],
              },
              {
                name: "Accord",
                firstYear: 1998,
                lastYear: 2025,
                trims: [
                  { name: "LX", engine: "1.5L Turbo", transmission: "CVT" },
                  { name: "Sport", engine: "1.5L Turbo", transmission: "CVT" },
                  { name: "Touring", engine: "2.0L Turbo", transmission: "Automatic" },
                ],
              },
            ],
          },
          {
            name: "Hyundai",
            origin: "South Korea",
            models: [
              {
                name: "Elantra",
                firstYear: 2001,
                lastYear: 2025,
                trims: [
                  { name: "SE", engine: "2.0L 4-Cyl", transmission: "CVT" },
                  { name: "SEL", engine: "2.0L 4-Cyl", transmission: "CVT" },
                  { name: "Limited", engine: "1.6L Turbo", transmission: "Automatic" },
                ],
              },
              {
                name: "Sonata",
                firstYear: 2002,
                lastYear: 2025,
                trims: [
                  { name: "SE", engine: "2.5L 4-Cyl", transmission: "Automatic" },
                  { name: "SEL", engine: "2.5L 4-Cyl", transmission: "Automatic" },
                  { name: "Limited", engine: "1.6L Turbo", transmission: "Automatic" },
                ],
              },
            ],
          },
          {
            name: "Kia",
            origin: "South Korea",
            models: [
              {
                name: "Optima",
                firstYear: 2001,
                lastYear: 2020,
                trims: [
                  { name: "LX", engine: "2.4L 4-Cyl", transmission: "Automatic" },
                  { name: "EX", engine: "1.6L Turbo", transmission: "Automatic" },
                  { name: "SX Turbo", engine: "2.0L Turbo", transmission: "Automatic" },
                ],
              },
              {
                name: "Rio",
                firstYear: 2001,
                lastYear: 2023,
                trims: [
                  { name: "LX", engine: "1.6L 4-Cyl", transmission: "CVT" },
                  { name: "EX", engine: "1.6L 4-Cyl", transmission: "CVT" },
                ],
              },
            ],
          },
          {
            name: "Nissan",
            origin: "Japan",
            models: [
              {
                name: "Altima",
                firstYear: 1998,
                lastYear: 2025,
                trims: [
                  { name: "S", engine: "2.5L 4-Cyl", transmission: "CVT" },
                  { name: "SV", engine: "2.5L 4-Cyl", transmission: "CVT" },
                  { name: "SR", engine: "2.0L Turbo", transmission: "CVT" },
                ],
              },
              {
                name: "Sentra",
                firstYear: 1998,
                lastYear: 2025,
                trims: [
                  { name: "S", engine: "2.0L 4-Cyl", transmission: "CVT" },
                  { name: "SV", engine: "2.0L 4-Cyl", transmission: "CVT" },
                  { name: "SR", engine: "2.0L 4-Cyl", transmission: "CVT" },
                ],
              },
            ],
          },
          {
            name: "Lexus",
            origin: "Japan",
            models: [
              {
                name: "ES",
                firstYear: 1997,
                lastYear: 2025,
                trims: [
                  { name: "250", engine: "2.5L 4-Cyl", transmission: "Automatic" },
                  { name: "350", engine: "3.5L V6", transmission: "Automatic" },
                  { name: "300h", engine: "2.5L Hybrid", transmission: "CVT" },
                ],
              },
              {
                name: "RX",
                firstYear: 1999,
                lastYear: 2025,
                trims: [
                  { name: "350", engine: "3.5L V6", transmission: "Automatic" },
                  { name: "450h", engine: "3.5L V6 Hybrid", transmission: "CVT" },
                ],
              },
            ],
          },
          {
            name: "Mercedes-Benz",
            origin: "Germany",
            models: [
              {
                name: "C-Class",
                firstYear: 1997,
                lastYear: 2025,
                trims: [
                  { name: "C300", engine: "2.0L Turbo", transmission: "Automatic" },
                  { name: "AMG C43", engine: "3.0L V6 Biturbo", transmission: "Automatic" },
                ],
              },
              {
                name: "E-Class",
                firstYear: 1995,
                lastYear: 2025,
                trims: [
                  { name: "E350", engine: "3.5L V6", transmission: "Automatic" },
                  { name: "E300", engine: "2.0L Turbo", transmission: "Automatic" },
                ],
              },
            ],
          },
          {
            name: "BMW",
            origin: "Germany",
            models: [
              {
                name: "3 Series",
                firstYear: 1999,
                lastYear: 2025,
                trims: [
                  { name: "320i", engine: "2.0L Turbo", transmission: "Automatic" },
                  { name: "330i", engine: "2.0L Turbo", transmission: "Automatic" },
                  { name: "M340i", engine: "3.0L Turbo I6", transmission: "Automatic" },
                ],
              },
              {
                name: "5 Series",
                firstYear: 1997,
                lastYear: 2025,
                trims: [
                  { name: "530i", engine: "2.0L Turbo", transmission: "Automatic" },
                  { name: "540i", engine: "3.0L Turbo I6", transmission: "Automatic" },
                ],
              },
            ],
          },
          {
            name: "Audi",
            origin: "Germany",
            models: [
              {
                name: "A4",
                firstYear: 1996,
                lastYear: 2025,
                trims: [
                  { name: "40 TFSI", engine: "2.0L Turbo", transmission: "Automatic" },
                  { name: "45 TFSI", engine: "2.0L Turbo", transmission: "Automatic" },
                ],
              },
            ],
          },
          {
            name: "Chevrolet",
            origin: "USA",
            models: [
              {
                name: "Malibu",
                firstYear: 1997,
                lastYear: 2024,
                trims: [
                  { name: "LS", engine: "1.5L Turbo", transmission: "CVT" },
                  { name: "RS", engine: "1.5L Turbo", transmission: "CVT" },
                  { name: "Premier", engine: "2.0L Turbo", transmission: "9-Speed Auto" },
                ],
              },
            ],
          },
          {
            name: "Ford",
            origin: "USA",
            models: [
              {
                name: "Fusion",
                firstYear: 2006,
                lastYear: 2020,
                trims: [
                  { name: "S", engine: "2.5L 4-Cyl", transmission: "6-Speed Auto" },
                  { name: "SE", engine: "1.5L Turbo", transmission: "6-Speed Auto" },
                  { name: "Titanium", engine: "2.0L Turbo", transmission: "6-Speed Auto" },
                ],
              },
            ],
          },
          {
            name: "Volkswagen",
            origin: "Germany",
            models: [
              {
                name: "Jetta",
                firstYear: 2000,
                lastYear: 2025,
                trims: [
                  { name: "S", engine: "1.4L Turbo", transmission: "Automatic" },
                  { name: "SE", engine: "1.4L Turbo", transmission: "Automatic" },
                  { name: "GLI", engine: "2.0L Turbo", transmission: "Automatic" },
                ],
              },
            ],
          },
          {
            name: "Mazda",
            origin: "Japan",
            models: [
              {
                name: "3",
                firstYear: 2004,
                lastYear: 2025,
                trims: [
                  { name: "Select", engine: "2.5L 4-Cyl", transmission: "Automatic" },
                  { name: "Preferred", engine: "2.5L 4-Cyl", transmission: "Automatic" },
                ],
              },
              {
                name: "CX-5",
                firstYear: 2013,
                lastYear: 2025,
                trims: [
                  { name: "S", engine: "2.5L 4-Cyl", transmission: "Automatic" },
                  { name: "Turbo", engine: "2.5L Turbo", transmission: "Automatic" },
                ],
              },
            ],
          },
          {
            name: "Subaru",
            origin: "Japan",
            models: [
              {
                name: "Outback",
                firstYear: 2000,
                lastYear: 2025,
                trims: [
                  { name: "Base", engine: "2.5L Flat-4", transmission: "CVT" },
                  { name: "Touring", engine: "2.5L Flat-4", transmission: "CVT" },
                ],
              },
            ],
          },
          {
            name: "Mitsubishi",
            origin: "Japan",
            models: [
              {
                name: "Lancer",
                firstYear: 2002,
                lastYear: 2017,
                trims: [
                  { name: "ES", engine: "2.0L 4-Cyl", transmission: "CVT" },
                  { name: "SE", engine: "2.4L 4-Cyl", transmission: "CVT" },
                ],
              },
              {
                name: "Outlander",
                firstYear: 2003,
                lastYear: 2025,
                trims: [
                  { name: "ES", engine: "2.5L 4-Cyl", transmission: "CVT" },
                  { name: "SE", engine: "2.5L 4-Cyl", transmission: "CVT" },
                ],
              },
            ],
          },
          {
            name: "Infiniti",
            origin: "Japan",
            models: [
              {
                name: "G35",
                firstYear: 2003,
                lastYear: 2008,
                trims: [
                  { name: "Base", engine: "3.5L V6", transmission: "5-Speed Auto" },
                ],
              },
              {
                name: "Q50",
                firstYear: 2014,
                lastYear: 2024,
                trims: [
                  { name: "2.0t", engine: "2.0L Turbo", transmission: "7-Speed Auto" },
                  { name: "3.0t", engine: "3.0L V6 Twin-Turbo", transmission: "7-Speed Auto" },
                ],
              },
            ],
          },
          {
            name: "Acura",
            origin: "Japan",
            models: [
              {
                name: "TLX",
                firstYear: 2015,
                lastYear: 2025,
                trims: [
                  { name: "2.4L", engine: "2.4L 4-Cyl", transmission: "8-Speed DCT" },
                  { name: "3.5L", engine: "3.5L V6", transmission: "9-Speed Auto" },
                ],
              },
            ],
          },
          {
            name: "Buick",
            origin: "USA",
            models: [
              {
                name: "LaCrosse",
                firstYear: 2005,
                lastYear: 2019,
                trims: [
                  { name: "1SV", engine: "2.4L 4-Cyl", transmission: "6-Speed Auto" },
                  { name: "Essence", engine: "3.6L V6", transmission: "6-Speed Auto" },
                ],
              },
            ],
          },
          {
            name: "Jeep",
            origin: "USA",
            models: [
              {
                name: "Grand Cherokee",
                firstYear: 1999,
                lastYear: 2025,
                trims: [
                  { name: "Laredo", engine: "3.6L V6", transmission: "8-Speed Auto" },
                  { name: "Limited", engine: "3.6L V6", transmission: "8-Speed Auto" },
                  { name: "Overland", engine: "5.7L V8", transmission: "8-Speed Auto" },
                ],
              },
              {
                name: "Cherokee",
                firstYear: 2014,
                lastYear: 2023,
                trims: [
                  { name: "Sport", engine: "2.4L 4-Cyl", transmission: "9-Speed Auto" },
                  { name: "Limited", engine: "3.2L V6", transmission: "9-Speed Auto" },
                ],
              },
            ],
          },
          {
            name: "Land Rover",
            origin: "UK",
            models: [
              {
                name: "Range Rover Sport",
                firstYear: 2006,
                lastYear: 2025,
                trims: [
                  { name: "SE", engine: "3.0L V6 Supercharged", transmission: "8-Speed Auto" },
                  { name: "HSE", engine: "3.0L V6 Supercharged", transmission: "8-Speed Auto" },
                ],
              },
              {
                name: "Discovery",
                firstYear: 1995,
                lastYear: 2025,
                trims: [
                  { name: "S", engine: "3.0L V6 Supercharged", transmission: "8-Speed Auto" },
                  { name: "HSE", engine: "3.0L V6 Supercharged", transmission: "8-Speed Auto" },
                ],
              },
            ],
          },
        ],
      },
      {
        name: "SUV",
        hsCode: "8703",
        dutyBand: 3,
        makes: [
          {
            name: "Toyota",
            origin: "Japan",
            models: [
              {
                name: "RAV4",
                firstYear: 2004,
                lastYear: 2025,
                trims: [
                  { name: "LE", engine: "2.5L 4-Cyl", transmission: "Automatic" },
                  { name: "XLE", engine: "2.5L 4-Cyl", transmission: "Automatic" },
                  { name: "Limited", engine: "2.5L 4-Cyl", transmission: "Automatic" },
                ],
              },
              {
                name: "Highlander",
                firstYear: 2007,
                lastYear: 2025,
                trims: [
                  { name: "LE", engine: "2.4L Turbo", transmission: "Automatic" },
                  { name: "XLE", engine: "2.4L Turbo", transmission: "Automatic" },
                  { name: "Limited", engine: "2.4L Turbo", transmission: "Automatic" },
                ],
              },
            ],
          },
          {
            name: "Honda",
            origin: "Japan",
            models: [
              {
                name: "CR-V",
                firstYear: 2003,
                lastYear: 2025,
                trims: [
                  { name: "LX", engine: "1.5L Turbo", transmission: "CVT" },
                  { name: "EX", engine: "1.5L Turbo", transmission: "CVT" },
                  { name: "Touring", engine: "1.5L Turbo", transmission: "CVT" },
                ],
              },
              {
                name: "Pilot",
                firstYear: 2009,
                lastYear: 2025,
                trims: [
                  { name: "LX", engine: "3.5L V6", transmission: "Automatic" },
                  { name: "EX-L", engine: "3.5L V6", transmission: "Automatic" },
                  { name: "Touring", engine: "3.5L V6", transmission: "Automatic" },
                ],
              },
            ],
          },
          {
            name: "Mercedes-Benz",
            origin: "Germany",
            models: [
              {
                name: "GLC",
                firstYear: 2016,
                lastYear: 2025,
                trims: [
                  { name: "GLC 300", engine: "2.0L Turbo", transmission: "Automatic" },
                  { name: "AMG GLC 43", engine: "3.0L V6 Biturbo", transmission: "Automatic" },
                ],
              },
            ],
          },
        ],
      },
      {
        name: "Hatchback",
        hsCode: "8703",
        dutyBand: 3,
        makes: [
          {
            name: "Volkswagen",
            origin: "Germany",
            models: [
              {
                name: "Golf",
                firstYear: 2010,
                lastYear: 2024,
                trims: [
                  { name: "S", engine: "1.4L Turbo", transmission: "Automatic" },
                  { name: "SE", engine: "1.4L Turbo", transmission: "Automatic" },
                  { name: "GTI", engine: "2.0L Turbo", transmission: "Automatic" },
                ],
              },
            ],
          },
        ],
      },
      {
        name: "Pickup Truck",
        hsCode: "8703",
        dutyBand: 3,
        makes: [
          {
            name: "Toyota",
            origin: "Japan",
            models: [
              {
                name: "Hilux",
                firstYear: 2005,
                lastYear: 2025,
                trims: [
                  { name: "Workmate", engine: "2.4L Diesel", transmission: "Manual" },
                  { name: "SR5", engine: "2.8L Diesel", transmission: "Automatic" },
                ],
              },
            ],
          },
          {
            name: "Ford",
            origin: "USA",
            models: [
              {
                name: "Ranger",
                firstYear: 2012,
                lastYear: 2025,
                trims: [
                  { name: "XL", engine: "2.2L Diesel", transmission: "Manual" },
                  { name: "XLT", engine: "2.0L Biturbo Diesel", transmission: "Automatic" },
                  { name: "Wildtrak", engine: "2.0L Biturbo Diesel", transmission: "Automatic" },
                ],
              },
            ],
          },
        ],
      },
      {
        name: "Chinese EV SUV",
        hsCode: "8703",
        dutyBand: 3,
        makes: [
          {
            name: "BYD",
            origin: "China",
            models: [
              {
                name: "Atto 3",
                firstYear: 2022,
                lastYear: 2025,
                trims: [
                  { name: "Standard", engine: "Electric 60.5kWh", transmission: "Single Speed" },
                  { name: "Extended", engine: "Electric 82kWh", transmission: "Single Speed" },
                ],
              },
              {
                name: "Seal",
                firstYear: 2023,
                lastYear: 2025,
                trims: [
                  { name: "Dynamic", engine: "Electric 61.4kWh", transmission: "Single Speed" },
                  { name: "Design", engine: "Electric 82.5kWh", transmission: "Single Speed" },
                ],
              },
              {
                name: "Tang",
                firstYear: 2022,
                lastYear: 2025,
                trims: [
                  { name: "Design", engine: "Electric 86.4kWh", transmission: "Single Speed" },
                ],
              },
            ],
          },
          {
            name: "Chery",
            origin: "China",
            models: [
              {
                name: "Tiggo 8",
                firstYear: 2020,
                lastYear: 2025,
                trims: [
                  { name: "Comfort", engine: "1.5L Turbo", transmission: "CVT" },
                  { name: "Premium", engine: "1.6L Turbo", transmission: "7-Speed DCT" },
                ],
              },
              {
                name: "Omoda 5",
                firstYear: 2023,
                lastYear: 2025,
                trims: [
                  { name: "Comfort", engine: "1.5L Turbo", transmission: "CVT" },
                  { name: "Premium", engine: "1.5L Turbo", transmission: "CVT" },
                ],
              },
            ],
          },
          {
            name: "Geely",
            origin: "China",
            models: [
              {
                name: "Coolray",
                firstYear: 2020,
                lastYear: 2025,
                trims: [
                  { name: "Comfort", engine: "1.5L Turbo", transmission: "7-Speed DCT" },
                  { name: "Premium", engine: "1.5L Turbo", transmission: "7-Speed DCT" },
                ],
              },
              {
                name: "Emgrand",
                firstYear: 2021,
                lastYear: 2025,
                trims: [
                  { name: "Comfort", engine: "1.5L NA", transmission: "CVT" },
                  { name: "Premium", engine: "1.5L NA", transmission: "CVT" },
                ],
              },
            ],
          },
          {
            name: "MG",
            origin: "China",
            models: [
              {
                name: "ZS",
                firstYear: 2020,
                lastYear: 2025,
                trims: [
                  { name: "Compose", engine: "1.5L NA", transmission: "CVT" },
                  { name: "Exclusive", engine: "1.0L Turbo", transmission: "6-Speed Auto" },
                ],
              },
              {
                name: "HS",
                firstYear: 2021,
                lastYear: 2025,
                trims: [
                  { name: "Compose", engine: "1.5L Turbo", transmission: "7-Speed DCT" },
                  { name: "Exclusive", engine: "2.0L Turbo", transmission: "6-Speed Auto" },
                ],
              },
              {
                name: "MG5",
                firstYear: 2022,
                lastYear: 2025,
                trims: [
                  { name: "Compose", engine: "1.5L NA", transmission: "CVT" },
                  { name: "Exclusive", engine: "1.5L Turbo", transmission: "7-Speed DCT" },
                ],
              },
            ],
          },
          {
            name: "GAC",
            origin: "China",
            models: [
              {
                name: "GS3",
                firstYear: 2021,
                lastYear: 2025,
                trims: [
                  { name: "Comfort", engine: "1.5L Turbo", transmission: "7-Speed DCT" },
                ],
              },
            ],
          },
          {
            name: "Changan",
            origin: "China",
            models: [
              {
                name: "CS35 Plus",
                firstYear: 2020,
                lastYear: 2025,
                trims: [
                  { name: "Luxury", engine: "1.4L Turbo", transmission: "7-Speed DCT" },
                ],
              },
              {
                name: "Alsvin",
                firstYear: 2021,
                lastYear: 2025,
                trims: [
                  { name: "Comfort", engine: "1.5L NA", transmission: "5-Speed Manual" },
                  { name: "Luxury", engine: "1.5L NA", transmission: "5-Speed DCT" },
                ],
              },
            ],
          },
          {
            name: "Haval",
            origin: "China",
            models: [
              {
                name: "Jolion",
                firstYear: 2021,
                lastYear: 2025,
                trims: [
                  { name: "Tech", engine: "1.5L Turbo", transmission: "7-Speed DCT" },
                  { name: "Premium", engine: "1.5L Turbo", transmission: "7-Speed DCT" },
                ],
              },
              {
                name: "F7",
                firstYear: 2020,
                lastYear: 2025,
                 trims: [
                  { name: "City", engine: "1.5L Turbo", transmission: "7-Speed DCT" },
                  { name: "Premium", engine: "2.0L Turbo", transmission: "7-Speed DCT" },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    name: "motorcycle",
    categories: [
      {
        name: "Sport",
        makes: [
          {
            name: "Honda",
            origin: "Japan",
            models: [
              {
                name: "CBR600RR",
                firstYear: 2021,
                lastYear: 2025,
                trims: [
                  { name: "Standard", engine: "599cc Inline-4", transmission: "6-Speed Manual" },
                ],
              },
            ],
          },
          {
            name: "Yamaha",
            origin: "Japan",
            models: [
              {
                name: "R15",
                firstYear: 2018,
                lastYear: 2025,
                trims: [
                  { name: "Standard", engine: "155cc Single", transmission: "6-Speed Manual" },
                ],
              },
              {
                name: "R3",
                firstYear: 2015,
                lastYear: 2025,
                trims: [
                  { name: "Standard", engine: "321cc Parallel-Twin", transmission: "6-Speed Manual" },
                ],
              },
            ],
          },
          {
            name: "Kawasaki",
            origin: "Japan",
            models: [
              {
                name: "Ninja 400",
                firstYear: 2018,
                lastYear: 2025,
                trims: [
                  { name: "Standard", engine: "399cc Parallel-Twin", transmission: "6-Speed Manual" },
                ],
              },
            ],
          },
          {
            name: "Bajaj",
            origin: "India",
            models: [
              {
                name: "Pulsar NS200",
                firstYear: 2018,
                lastYear: 2025,
                trims: [
                  { name: "Standard", engine: "199.5cc Single", transmission: "6-Speed Manual" },
                ],
              },
            ],
          },
          {
            name: "TVS",
            origin: "India",
            models: [
              {
                name: "Apache RTR 200",
                firstYear: 2019,
                lastYear: 2025,
                trims: [
                  { name: "Standard", engine: "197.75cc Single", transmission: "5-Speed Manual" },
                ],
              },
            ],
          },
          {
            name: "Suzuki",
            origin: "Japan",
            models: [
              {
                name: "GSX-R150",
                firstYear: 2017,
                lastYear: 2025,
                trims: [
                  { name: "Standard", engine: "147.3cc Single", transmission: "6-Speed Manual" },
                ],
              },
            ],
          },
        ],
      },
      {
        name: "Cruiser",
        makes: [
          {
            name: "Honda",
            origin: "Japan",
            models: [
              {
                name: "CB750 Hornet",
                firstYear: 2023,
                lastYear: 2025,
                trims: [
                  { name: "Standard", engine: "755cc Parallel-Twin", transmission: "6-Speed Manual" },
                ],
              },
            ],
          },
          {
            name: "Yamaha",
            origin: "Japan",
            models: [
              {
                name: "Bolt",
                firstYear: 2014,
                lastYear: 2024,
                trims: [
                  { name: "Standard", engine: "942cc V-Twin", transmission: "5-Speed Manual" },
                ],
              },
            ],
          },
        ],
      },
      {
        name: "Standard",
        makes: [
          {
            name: "TVS",
            origin: "India",
            models: [
              {
                name: "Apache RTR 200",
                firstYear: 2019,
                lastYear: 2025,
                trims: [
                  { name: "Standard", engine: "197.75cc Single", transmission: "5-Speed Manual" },
                ],
              },
            ],
          },
          {
            name: "Bajaj",
            origin: "India",
            models: [
              {
                name: "Boxer 150",
                firstYear: 2015,
                lastYear: 2025,
                trims: [
                  { name: "Standard", engine: "149cc Single", transmission: "5-Speed Manual" },
                ],
              },
              {
                name: "Discover 125",
                firstYear: 2014,
                lastYear: 2025,
                trims: [
                  { name: "Standard", engine: "124.5cc Single", transmission: "5-Speed Manual" },
                ],
              },
            ],
          },
          {
            name: "Honda",
            origin: "Japan",
            models: [
              {
                name: "CG 125",
                firstYear: 2000,
                lastYear: 2025,
                trims: [
                  { name: "Standard", engine: "124.7cc Single", transmission: "5-Speed Manual" },
                ],
              },
            ],
          },
          {
            name: "Yamaha",
            origin: "Japan",
            models: [
              {
                name: "YBR 125",
                firstYear: 2005,
                lastYear: 2025,
                trims: [
                  { name: "Standard", engine: "123cc Single", transmission: "5-Speed Manual" },
                ],
              },
            ],
          },
        ],
      },
      {
        name: "Scooter",
        makes: [
          {
            name: "Honda",
            origin: "Japan",
            models: [
              {
                name: "Activa 6G",
                firstYear: 2020,
                lastYear: 2025,
                trims: [
                  { name: "Standard", engine: "109.5cc Single", transmission: "CVT" },
                ],
              },
            ],
          },
          {
            name: "TVS",
            origin: "India",
            models: [
              {
                name: "Jupiter",
                firstYear: 2015,
                lastYear: 2025,
                trims: [
                  { name: "Standard", engine: "109.7cc Single", transmission: "CVT" },
                ],
              },
            ],
          },
          {
            name: "Bajaj",
            origin: "India",
            models: [
              {
                name: "Chetak",
                firstYear: 2020,
                lastYear: 2025,
                trims: [
                  { name: "Standard", engine: "Electric 2.9kWh", transmission: "Single Speed" },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    name: "tricycle",
    categories: [
      {
        name: "Cargo",
        makes: [
          {
            name: "Bajaj",
            origin: "India",
            models: [
              {
                name: "RE Maxima",
                firstYear: 2018,
                lastYear: 2025,
                trims: [
                  { name: "Standard", engine: "236cc Single", transmission: "4-Speed Manual" },
                  { name: "CARGO XL", engine: "236cc Single", transmission: "4-Speed Manual" },
                ],
              },
            ],
          },
          {
            name: "TVS",
            origin: "India",
            models: [
              {
                name: "King",
                firstYear: 2016,
                lastYear: 2025,
                trims: [
                  { name: "Standard", engine: "199.3cc Single", transmission: "4-Speed Manual" },
                ],
              },
            ],
          },
          {
            name: "Piaggio",
            origin: "Italy",
            models: [
              {
                name: "Ape",
                firstYear: 2010,
                lastYear: 2025,
                trims: [
                  { name: "Classic", engine: "200cc Single", transmission: "4-Speed Manual" },
                  { name: "City", engine: "200cc Single", transmission: "4-Speed Manual" },
                ],
              },
            ],
          },
        ],
      },
      {
        name: "Passenger",
        makes: [
          {
            name: "Bajaj",
            origin: "India",
            models: [
              {
                name: "RE Compact",
                firstYear: 2017,
                lastYear: 2025,
                trims: [
                  { name: "Standard", engine: "198.9cc Single", transmission: "4-Speed Manual" },
                ],
              },
            ],
          },
          {
            name: "Piaggio",
            origin: "Italy",
            models: [
              {
                name: "Ape Passenger",
                firstYear: 2012,
                lastYear: 2025,
                trims: [
                  { name: "Standard", engine: "200cc Single", transmission: "4-Speed Manual" },
                ],
              },
            ],
          },
          {
            name: "TVS",
            origin: "India",
            models: [
              {
                name: "King Deluxe",
                firstYear: 2018,
                lastYear: 2025,
                trims: [
                  { name: "Standard", engine: "199.3cc Single", transmission: "4-Speed Manual" },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    name: "commercial",
    categories: [
      {
        name: "Truck",
        hsCode: "8704",
        dutyBand: 1,
        makes: [
          {
            name: "Mercedes-Benz",
            origin: "Germany",
            models: [
              {
                name: "Actros",
                firstYear: 2010,
                lastYear: 2025,
                trims: [
                  { name: "1840", engine: "12.8L Inline-6 Diesel", transmission: "12-Speed Automated" },
                  { name: "2545", engine: "12.8L Inline-6 Diesel", transmission: "12-Speed Automated" },
                ],
              },
            ],
          },
          {
            name: "MAN",
            origin: "Germany",
            models: [
              {
                name: "TGX",
                firstYear: 2012,
                lastYear: 2025,
                trims: [
                  { name: "18.440", engine: "12.4L Inline-6 Diesel", transmission: "12-Speed Automated" },
                ],
              },
            ],
          },
          {
            name: "Sinotruk",
            origin: "China",
            models: [
              {
                name: "Howo",
                firstYear: 2015,
                lastYear: 2025,
                trims: [
                  { name: "371", engine: "9.7L Diesel", transmission: "10-Speed Manual" },
                ],
              },
            ],
          },
        ],
      },
      {
        name: "Bus",
        hsCode: "8702",
        dutyBand: 0,
        makes: [
          {
            name: "Yutong",
            origin: "China",
            models: [
              {
                name: "Aero Express",
                firstYear: 2018,
                lastYear: 2025,
                trims: [
                  { name: "Standard", engine: "7.7L Diesel", transmission: "6-Speed Manual" },
                ],
              },
            ],
          },
          {
            name: "King Long",
            origin: "China",
            models: [
              {
                name: "XMQ6600",
                firstYear: 2018,
                lastYear: 2025,
                trims: [
                  { name: "Standard", engine: "2.7L Diesel", transmission: "5-Speed Manual" },
                ],
              },
            ],
          },
          {
            name: "Zhongtong",
            origin: "China",
            models: [
              {
                name: "LCK6600",
                firstYear: 2019,
                lastYear: 2025,
                trims: [
                  { name: "Standard", engine: "3.0L Diesel", transmission: "6-Speed Manual" },
                ],
              },
            ],
          },
        ],
      },
      {
        name: "Mini Bus",
        hsCode: "8702",
        dutyBand: 0,
        makes: [
          {
            name: "Toyota",
            origin: "Japan",
            models: [
              {
                name: "Coaster",
                firstYear: 2000,
                lastYear: 2025,
                trims: [
                  { name: "Standard", engine: "4.0L Diesel", transmission: "5-Speed Manual" },
                  { name: "Deluxe", engine: "4.0L Diesel", transmission: "Automatic" },
                ],
              },
            ],
          },
          {
            name: "Hyundai",
            origin: "South Korea",
            models: [
              {
                name: "County",
                firstYear: 2005,
                lastYear: 2025,
                trims: [
                  { name: "Standard", engine: "3.9L Diesel", transmission: "5-Speed Manual" },
                ],
              },
            ],
          },
          {
            name: "Mitsubishi",
            origin: "Japan",
            models: [
              {
                name: "Canter Rosa",
                firstYear: 2000,
                lastYear: 2025,
                trims: [
                  { name: "Standard", engine: "3.9L Diesel", transmission: "5-Speed Manual" },
                ],
              },
            ],
          },
        ],
      },
      {
        name: "Van",
        hsCode: "8703",
        dutyBand: 3,
        makes: [
          {
            name: "Toyota",
            origin: "Japan",
            models: [
              {
                name: "HiAce",
                firstYear: 2005,
                lastYear: 2025,
                trims: [
                  { name: "Commuter", engine: "2.8L Diesel", transmission: "Automatic" },
                  { name: "Cargo", engine: "2.8L Diesel", transmission: "Manual" },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
];

// ── System Config Data ──────────────────────────────────────────────
// Constitution §II.2: These are seed values only. The kill switch will
// catch staleness if the cron workers don't update them within 24 hours.

const SYSTEM_CONFIG_SEED: { key: string; value: string; source: string }[] = [
  { key: "ncs_customs_rate", value: "1380", source: "seed" },
  { key: "exchange_rate_usd_ngn", value: "1380", source: "seed" },
  { key: "vat_rate", value: "0.075", source: "seed" },
  { key: "import_duty_rate", value: "0.20", source: "seed" },
  { key: "nac_levy_rate", value: "0.05", source: "seed" },
  { key: "surcharge_rate", value: "0.07", source: "seed" },
  { key: "ciss_rate", value: "0.01", source: "seed" },
  { key: "etls_rate", value: "0.005", source: "seed" },
  { key: "insurance_rate", value: "0.0075", source: "seed" },
  // FOB source ports — primary origins for Nigerian used vehicle imports
  { key: "fob_ports", value: "US:Houston,US:Newark,US:Jacksonville,UAE:Dubai,UK:Southampton,Japan:Yokohama,Japan:Tokyo,China:Guangzhou,China:Shenzhen", source: "seed" },
];

// ── Main ────────────────────────────────────────────────────────────

async function seedGvo(): Promise<void> {
  let domainCount = 0;
  let categoryCount = 0;
  let makeCount = 0;
  let modelCount = 0;
  let trimCount = 0;

  for (const domain of GVO_DATA) {
    const domainId = await upsertDomain(domain.name);
    domainCount++;

    for (const category of domain.categories) {
      const categoryId = await upsertCategory(
        domainId,
        category.name,
        category.hsCode,
        category.dutyBand,
      );
      categoryCount++;

      for (const make of category.makes) {
        const makeId = await upsertMake(categoryId, make.name, make.origin);
        makeCount++;

        for (const model of make.models) {
          const modelId = await upsertModel(
            makeId,
            model.name,
            model.firstYear,
            model.lastYear,
          );
          modelCount++;

          for (const trim of model.trims) {
            await upsertTrim(modelId, trim.name, trim.engine, trim.transmission);
            trimCount++;
          }
        }
      }
    }
  }

  console.log(
    `GVO seeded: ${domainCount} domains, ${categoryCount} categories, ` +
    `${makeCount} makes, ${modelCount} models, ${trimCount} trims`,
  );
}

async function seedSystemConfig(): Promise<void> {
  let count = 0;
  for (const cfg of SYSTEM_CONFIG_SEED) {
    const existing = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, cfg.key));
    if (existing.length === 0) {
      await db.insert(systemConfig).values({
        key: cfg.key,
        value: cfg.value,
        effectiveTimestamp: new Date(),
        source: cfg.source,
      });
      count++;
    }
  }
  console.log(`System config seeded: ${count} new rows (${SYSTEM_CONFIG_SEED.length} total)`);
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required. Copy .env.example to .env and configure.");
    process.exit(1);
  }

  console.log("Seeding GVO hierarchy...");
  await seedGvo();

  console.log("Seeding system config...");
  await seedSystemConfig();

  console.log("Seed complete.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
