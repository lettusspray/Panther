import type { APIRoute } from "astro";
import { searchNhtsaMakeModel } from "../../../lib/data/nhtsa-lookup";
import { findOrCreateGvoTrim } from "../../../lib/gvo/create-on-the-fly";

export const POST: APIRoute = async ({ request }) => {
  let body: { domain?: string; makeName?: string; modelName?: string; trimName?: string; vehicleType?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const { domain, makeName, modelName, trimName, vehicleType } = body;
  if (!domain || !makeName || !modelName) {
    return new Response(JSON.stringify({ error: "domain, makeName, and modelName required" }), { status: 400 });
  }

  const nhtsaResult = await searchNhtsaMakeModel(makeName, modelName);
  if (nhtsaResult) {
    try {
      const trimId = await findOrCreateGvoTrim(
        domain,
        nhtsaResult.makeName,
        nhtsaResult.modelName,
        trimName || nhtsaResult.modelName,
        vehicleType || "car",
      );
      return new Response(JSON.stringify({
        found: true,
        trimId,
        makeName: nhtsaResult.makeName,
        modelName: nhtsaResult.modelName,
      }), { status: 200 });
    } catch {
      // GVO creation failed, fall through to not-found
    }
  }

  return new Response(JSON.stringify({
    found: false,
    makeName,
    modelName,
    trimName: trimName || null,
  }), { status: 200 });
};
