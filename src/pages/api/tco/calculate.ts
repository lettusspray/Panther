import type { APIRoute } from "astro";
import { calculateTco, type TcoInput } from "../../../lib/tco";

export const POST: APIRoute = async ({ request }) => {
  let body: TcoInput;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
    });
  }

  if (!body.state || typeof body.state !== "string") {
    return new Response(JSON.stringify({ error: "State is required" }), {
      status: 400,
    });
  }

  const annualMileageKm = body.annualMileageKm || 15000;
  const landedCostNgn = body.landedCostNgn || 0;
  const fuelConsumptionLitresPer100km = body.fuelConsumptionLitresPer100km || 10;

  const result = calculateTco({
    state: body.state,
    annualMileageKm,
    fuelConsumptionLitresPer100km,
    landedCostNgn,
    makeName: body.makeName,
    fuelType: body.fuelType,
    transmissionType: body.transmissionType,
  });

  return new Response(JSON.stringify(result), { status: 200 });
};
