import type { APIRoute } from "astro";
import { decodeVin } from "../../../lib/data/nhtsa-enrichment";
import { findOrCreateGvoTrim } from "../../../lib/gvo/create-on-the-fly";

export const POST: APIRoute = async ({ request }) => {
  let body: { vin?: string; domain?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const vin = body?.vin?.trim().toUpperCase();
  if (!vin || vin.length < 11) {
    return new Response(JSON.stringify({ error: "Valid VIN required (11-17 characters)" }), { status: 400 });
  }

  const decoded = await decodeVin(vin);
  if (!decoded || !decoded.make || !decoded.model) {
    return new Response(JSON.stringify({ error: "Could not decode VIN. Verify the VIN and try again." }), { status: 422 });
  }

  const domain = body?.domain || "car";
  let trimId: string | null = null;
  const gvoMakeName = decoded.make;
  const gvoModelName = decoded.model;

  if (decoded.trim) {
    try {
      trimId = await findOrCreateGvoTrim(domain, gvoMakeName, gvoModelName, decoded.trim, domain);
    } catch {
      // GVO creation failed — return decoded data without trimId
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    vin,
    make: decoded.make,
    model: decoded.model,
    year: decoded.year,
    trim: decoded.trim || null,
    trimId,
    specs: {
      engine: decoded.displacementL ? `${decoded.displacementL}L` : null,
      engineCC: decoded.displacementCC,
      cylinders: decoded.engineCylinders,
      engineHP: decoded.engineHP,
      fuelType: decoded.fuelTypePrimary || null,
      transmission: decoded.transmissionType || null,
      driveType: decoded.driveType || null,
      bodyClass: decoded.bodyClass || null,
      doors: decoded.doors,
      plantCountry: decoded.plantCountry || null,
    },
  }), { status: 200 });
};
