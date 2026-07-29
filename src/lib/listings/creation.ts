import { db } from "../db";
import { listing } from "../db/schema";
import { resolveTrimPath } from "../gvo";
import { getConditionFields, type ToggleValue } from "./condition-reports";

export interface CreateListingInput {
  sellerId: string;
  trimId?: string;
  modelYear: number;
  mileageKm: number;
  askingPriceNgn: number;
  conditionReport: Record<string, unknown>;
  images?: Array<{ tag: string; url: string }>;
  videos?: Array<{ tag: string; url: string }>;
  customMake?: string;
  customModel?: string;
  customTrim?: string;
}

export interface CreateListingResult {
  ok: boolean;
  listingId?: string;
  error?: string;
}

const VALID_TOGGLE_VALUES: ToggleValue[] = ["good", "fair", "poor", "absent"];

/**
 * Validate condition report against the domain-specific schema.
 * Returns null if valid, or an error message.
 */
function validateConditionReport(
  domain: string,
  report: Record<string, unknown>,
): string | null {
  const fields = getConditionFields(domain);

  for (const field of fields) {
    if (!field.required) continue;

    const value = report[field.key];
    if (value === undefined || value === null || value === "") {
      return `Missing required condition field: "${field.label}"`;
    }

    if (field.type === "toggle") {
      if (!VALID_TOGGLE_VALUES.includes(value as ToggleValue)) {
        return `Invalid value for "${field.label}": must be one of ${VALID_TOGGLE_VALUES.join(", ")}`;
      }
    }

    if (field.type === "select" && field.options) {
      if (!field.options.includes(String(value))) {
        return `Invalid value for "${field.label}": must be one of ${field.options.join(", ")}`;
      }
    }

    if (field.type === "hours" || field.type === "mileage") {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        return `Invalid value for "${field.label}": must be a non-negative number`;
      }
    }
  }

  return null;
}

/**
 * Create a new listing. Validates:
 * 1. trimId resolves to a valid GVO path
 * 2. modelYear is within the trim's valid range
 * 3. askingPriceNgn > 0 and finite
 * 4. mileageKm >= 0 and finite
 * 5. All required condition report fields are filled with valid values
 */
export async function createListing(
  input: CreateListingInput,
): Promise<CreateListingResult> {
  if (!Number.isFinite(input.askingPriceNgn) || input.askingPriceNgn <= 0) {
    return { ok: false, error: "Asking price must be a positive number." };
  }

  if (!Number.isFinite(input.mileageKm) || input.mileageKm < 0) {
    return { ok: false, error: "Mileage must be a non-negative number." };
  }

  if (!Number.isFinite(input.modelYear) || input.modelYear < 1900) {
    return { ok: false, error: "Invalid model year." };
  }

  let domain = "car";
  if (input.trimId) {
    const gvoPath = await resolveTrimPath(input.trimId);
    if (!gvoPath) {
      return { ok: false, error: "Invalid vehicle trim. Please re-select from the ontology." };
    }

    if (
      gvoPath.model.firstModelYear &&
      input.modelYear < gvoPath.model.firstModelYear
    ) {
      return {
        ok: false,
        error: `Model year ${input.modelYear} is before the first model year (${gvoPath.model.firstModelYear}) for this vehicle.`,
      };
    }

    if (
      gvoPath.model.lastModelYear &&
      input.modelYear > gvoPath.model.lastModelYear
    ) {
      return {
        ok: false,
        error: `Model year ${input.modelYear} is after the last model year (${gvoPath.model.lastModelYear}) for this vehicle.`,
      };
    }

    domain = gvoPath.domain.name;
  } else if (!input.customMake || !input.customModel) {
    return { ok: false, error: "Either select a vehicle from GVO or provide custom make/model." };
  }

  const conditionError = validateConditionReport(domain, input.conditionReport);
  if (conditionError) {
    return { ok: false, error: conditionError };
  }

  const [created] = await db
    .insert(listing)
    .values({
      sellerId: input.sellerId,
      trimId: input.trimId ?? null,
      modelYear: input.modelYear,
      customMake: input.customMake ?? null,
      customModel: input.customModel ?? null,
      customTrim: input.customTrim ?? null,
      mileageKm: input.mileageKm,
      askingPriceNgn: String(input.askingPriceNgn),
      conditionReport: input.conditionReport,
      images: input.images ?? [],
      videos: input.videos ?? [],
      status: "draft",
    })
    .returning({ id: listing.id });

  return { ok: true, listingId: created.id };
}
