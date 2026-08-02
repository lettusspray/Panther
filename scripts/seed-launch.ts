/**
 * Launch seed — demo marketplace inventory.
 *
 * Creates one demo dealer ("Panther Demo Lot") and ~24 fully-activated
 * listings across the catalog so the marketplace renders real content at
 * launch and the cold-start is broken.
 *
 * Usage:  DATABASE_URL=... npx tsx scripts/seed-launch.ts
 *
 * Constitution compliance:
 *   - Nationally neutral (demo dealer in Abuja/FCT, not Lagos)
 *   - No magic statutory constants (demo asking prices are showcase values)
 *   - Demo listings are clearly attributed to the Demo Lot
 *   - Idempotent: exits early if the demo user already exists
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import {
  user,
  dealer,
  listing,
  gvoDomain,
  gvoCategory,
  gvoMake,
  gvoModel,
  gvoTrim,
} from "../src/lib/db/schema";
import { getConditionFields } from "../src/lib/listings/condition-reports";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

const DEMO_EMAIL = "demo@panther.ng";
const DEMO_DEALER = {
  businessName: "Panther Demo Lot",
  slug: "panther-demo-lot",
  about:
    "Panther's launch showcase. Sample inventory across the country to show how the marketplace works. Real dealer listings start when sellers go live.",
  city: "Abuja",
  state: "FCT",
  contactPhone: "08000000000",
  whatsappNumber: "2348000000000",
  subdomain: "demo",
};

// Launch lot: make, model, year, asking price (NGN), mileage (km)
const LAUNCH_LOT: Array<[string, string, number, number, number]> = [
  ["Toyota", "Camry", 2020, 28000000, 42000],
  ["Toyota", "Corolla", 2019, 18500000, 55000],
  ["Toyota", "RAV4", 2021, 35000000, 30000],
  ["Toyota", "Hilux", 2022, 42000000, 25000],
  ["Honda", "Civic", 2018, 16000000, 60000],
  ["Honda", "Accord", 2020, 24000000, 48000],
  ["Kia", "Sportage", 2021, 22000000, 38000],
  ["Hyundai", "Tucson", 2019, 17500000, 52000],
  ["Mercedes-Benz", "C-Class", 2019, 29000000, 50000],
  ["BMW", "3 Series", 2020, 32000000, 45000],
  ["BYD", "Atto 3", 2023, 38000000, 15000],
  ["Lexus", "RX 350", 2019, 30000000, 58000],
  ["Nissan", "Qashqai", 2021, 21000000, 40000],
  ["Mazda", "CX-5", 2020, 19500000, 46000],
  ["Bajaj", "Boxer", 2023, 1800000, 8000],
  ["Honda", "CG125", 2022, 1200000, 6000],
  ["Kawasaki", "Ninja", 2020, 3500000, 9000],
  ["Suzuki", "GSX", 2021, 2800000, 7000],
  ["Bajaj", "RE", 2023, 2400000, 12000],
  ["Toyota", "Hiace", 2020, 15000000, 95000],
  ["MAN", "TGS", 2019, 68000000, 120000],
  ["Mercedes-Benz", "Sprinter", 2018, 16500000, 88000],
  ["Volkswagen", "Golf", 2021, 19500000, 37000],
  ["Ford", "Ranger", 2020, 26500000, 41000],
];

const PHOTO_TAGS = ["front", "rear", "side", "interior", "dashboard", "engine_bay"];

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function buildConditionReport(domain: string): Record<string, string> {
  const report: Record<string, string> = {};
  for (const field of getConditionFields(domain)) {
    if (field.type === "toggle") {
      report[field.key] = "good";
    } else if (field.type === "select") {
      report[field.key] = field.options?.[0] ?? "none";
    } else {
      report[field.key] = "15000";
    }
  }
  return report;
}

async function fetchVehicleImages(
  make: string,
  model: string,
  year: number,
): Promise<Array<{ tag: string; url: string }>> {
  const query = `${year} ${make} ${model}`;
  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
  const pexelsKey = process.env.PEXELS_API_KEY;

  try {
    if (unsplashKey) {
      const res = await fetch(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=6&client_id=${unsplashKey}`,
      );
      if (res.ok) {
        const data = (await res.json()) as { results: Array<{ urls: { medium: string } }> };
        const urls = data.results.slice(0, 6).map((r) => r.urls.medium);
        if (urls.length > 0) return urls.map((url, i) => ({ tag: PHOTO_TAGS[i] ?? "front", url }));
      }
    }
  } catch {
    // fall through
  }

  try {
    if (pexelsKey) {
      const res = await fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=6`,
        { headers: { Authorization: pexelsKey } },
      );
      if (res.ok) {
        const data = (await res.json()) as { photos: Array<{ src: { medium: string } }> };
        const urls = data.photos.slice(0, 6).map((p) => p.src.medium);
        if (urls.length > 0) return urls.map((url, i) => ({ tag: PHOTO_TAGS[i] ?? "front", url }));
      }
    }
  } catch {
    // fall through
  }

  // Neutral placeholder fallback so demo listings always render an image.
  return Array.from({ length: 4 }, (_, i) => ({
    tag: PHOTO_TAGS[i] ?? "front",
    url: `https://placehold.co/1200x800/EEE/333?text=${encodeURIComponent(`${year} ${make} ${model}`)}`,
  }));
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }

  const existing = await db.select({ id: user.id }).from(user).where(eq(user.email, DEMO_EMAIL));
  if (existing.length > 0) {
    console.log("Demo user already exists — launch seed already applied. Exiting.");
    return;
  }

  console.log("Creating demo user + dealer...");
  const [demoUser] = await db
    .insert(user)
    .values({ name: "Panther Demo Lot", email: DEMO_EMAIL })
    .returning({ id: user.id });

  await db
    .insert(dealer)
    .values({ userId: demoUser.id, ...DEMO_DEALER })
    .returning({ id: dealer.id });

  console.log(`Demo dealer created: ${DEMO_DEALER.slug} (demo.panther.ng)`);

  console.log("Loading GVO trims...");
  const trims = await db
    .select({
      trimId: gvoTrim.id,
      modelName: gvoModel.name,
      makeName: gvoMake.name,
      domainSlug: gvoDomain.slug,
    })
    .from(gvoTrim)
    .innerJoin(gvoModel, eq(gvoTrim.modelId, gvoModel.id))
    .innerJoin(gvoMake, eq(gvoModel.makeId, gvoMake.id))
    .innerJoin(gvoCategory, eq(gvoMake.categoryId, gvoCategory.id))
    .innerJoin(gvoDomain, eq(gvoCategory.domainId, gvoDomain.id));

  const byMakeModel = new Map<string, typeof trims[number]>();
  for (const t of trims) {
    const key = `${slug(t.makeName)}|${slug(t.modelName)}`;
    if (!byMakeModel.has(key)) byMakeModel.set(key, t);
  }

  let created = 0;
  let skipped = 0;

  for (const [make, model, year, price, mileage] of LAUNCH_LOT) {
    const key = `${slug(make)}|${slug(model)}`;
    const gvo = byMakeModel.get(key);
    if (!gvo) {
      console.warn(`  skip: ${make} ${model} not in GVO catalog`);
      skipped++;
      continue;
    }

    const images = await fetchVehicleImages(make, model, year);

    await db.insert(listing).values({
      sellerId: demoUser.id,
      trimId: gvo.trimId,
      modelYear: year,
      mileageKm: mileage,
      status: "active",
      askingPriceNgn: String(price),
      conditionReport: buildConditionReport(gvo.domainSlug),
      images,
    });

    created++;
    console.log(`  + ${year} ${make} ${model} (${gvo.domainSlug}) — ₦${price.toLocaleString()}`);
  }

  console.log(`\nLaunch seed complete: ${created} listings created, ${skipped} skipped (not in GVO).`);
  console.log(`Demo dealer: /dealers/${DEMO_DEALER.slug} · demo.panther.ng`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
