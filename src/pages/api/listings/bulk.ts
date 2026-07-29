import type { APIRoute } from "astro";
import { createListing } from "../../../lib/listings/creation";
import { checkCanCreateListing } from "../../../lib/trust/enforcement";
import { decodeVin } from "../../../lib/data/nhtsa-enrichment";
import { searchNhtsaMakeModel } from "../../../lib/data/nhtsa-lookup";
import { findOrCreateGvoTrim } from "../../../lib/gvo/create-on-the-fly";

export const POST: APIRoute = async ({ request, locals }) => {
  const user = (locals as { user: Record<string, unknown> | null }).user;
  if (!user?.id) {
    return json({ error: "Authentication required" }, 401);
  }

  const enforcement = await checkCanCreateListing(user.id as string);
  if (!enforcement.ok) {
    return json({ error: enforcement.error ?? "Cannot create listings" }, 403);
  }

  let body: { rows?: Record<string, string>[] };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const rows = body.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    return json({ error: "rows must be a non-empty array" }, 400);
  }

  if (rows.length > 100) {
    return json({ error: "Maximum 100 listings per bulk upload" }, 400);
  }

  const sellerId = user.id as string;
  let created = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const result = await processRow(sellerId, row);
      if (result.ok) {
        created++;
      } else {
        failed++;
        if (result.error) errors.push(result.error);
      }
    } catch (err) {
      failed++;
      errors.push(`Unexpected error: ${(err as Error).message}`);
    }
  }

  return json({ ok: true, created, failed, errors: errors.slice(0, 5) }, 201);
};

async function processRow(
  sellerId: string,
  row: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  const vin = row.vin || "";
  const makeName = row.make || "";
  const modelName = row.model || "";
  const modelYear = parseInt(row.model_year || row.year || "0", 10) || new Date().getFullYear();
  const mileageKm = parseInt(row.mileage_km || row.mileage || "0", 10) || 0;
  const askingPriceNgn = parseFloat(row.asking_price_ngn || row.price || "0") || 0;
  const domain = row.domain || "car";
  const customTrim = row.trim || "";

  // Try VIN decode first
  if (vin) {
    const decoded = await decodeVin(vin);
    if (decoded?.make && decoded?.model) {
      const trimName = decoded.trim || customTrim || decoded.model;
      try {
        const trimId = await findOrCreateGvoTrim(domain, decoded.make, decoded.model, trimName, domain);
        return await createListingViaApi(sellerId, trimId, decoded.year || modelYear, mileageKm, askingPriceNgn, row);
      } catch (err) {
        return { ok: false, error: `VIN ${vin.slice(0, 8)}… GVO error: ${(err as Error).message}` };
      }
    }
  }

  // Fallback: try lookup by make+model
  if (makeName && modelName) {
    const nhtsa = await searchNhtsaMakeModel(makeName, modelName);
    if (nhtsa) {
      const trimName = customTrim || nhtsa.modelName;
      try {
        const trimId = await findOrCreateGvoTrim(domain, nhtsa.makeName, nhtsa.modelName, trimName, domain);
        return await createListingViaApi(sellerId, trimId, modelYear, mileageKm, askingPriceNgn, row);
      } catch (err) {
        return { ok: false, error: `Lookup ${makeName} ${modelName}: GVO error: ${(err as Error).message}` };
      }
    }

    // Absolute fallback: custom entry
    return await createCustomListing(sellerId, makeName, modelName, customTrim, modelYear, mileageKm, askingPriceNgn);
  }

  if (vin) {
    return { ok: false, error: `VIN ${vin.slice(0, 8)}… could not be decoded` };
  }
  return { ok: false, error: "Row must have 'vin' or 'make'+'model'" };
}

async function createListingViaApi(
  sellerId: string,
  trimId: string,
  modelYear: number,
  mileageKm: number,
  askingPriceNgn: number,
  row: Record<string, string>,
) {
  const conditionReport = extractConditionFields(row);
  return await createListing({
    sellerId,
    trimId,
    modelYear,
    mileageKm,
    askingPriceNgn,
    conditionReport,
  });
}

async function createCustomListing(
  sellerId: string,
  makeName: string,
  modelName: string,
  trimName: string,
  modelYear: number,
  mileageKm: number,
  askingPriceNgn: number,
) {
  return await createListing({
    sellerId,
    modelYear,
    mileageKm,
    askingPriceNgn,
    conditionReport: {},
    customMake: makeName,
    customModel: modelName,
    customTrim: trimName || undefined,
  });
}

function extractConditionFields(row: Record<string, string>): Record<string, string> {
  const report: Record<string, string> = {};
  for (const [key, val] of Object.entries(row)) {
    if (key.startsWith("condition_") || key.startsWith("cond_")) {
      const fieldKey = key.replace(/^condition_/, "").replace(/^cond_/, "");
      report[fieldKey] = val;
    }
  }
  return report;
}

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
