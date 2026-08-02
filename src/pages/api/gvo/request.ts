import type { APIRoute } from "astro";
import { db } from "../../../lib/db";
import { gvoRequest } from "../../../lib/db/schema";

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;

  let body: {
    domain?: string;
    makeName?: string;
    modelName?: string;
    trimName?: string;
    notes?: string;
  };

  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
    });
  }

  const validDomains = ["car", "motorcycle", "tricycle", "commercial"];
  if (!body.domain || !validDomains.includes(body.domain)) {
    return new Response(
      JSON.stringify({ error: "Valid domain is required: car, motorcycle, tricycle, or commercial" }),
      { status: 400 },
    );
  }

  if (!body.makeName || typeof body.makeName !== "string" || body.makeName.trim().length === 0) {
    return new Response(JSON.stringify({ error: "Make name is required" }), {
      status: 400,
    });
  }

  if (!body.modelName || typeof body.modelName !== "string" || body.modelName.trim().length === 0) {
    return new Response(JSON.stringify({ error: "Model name is required" }), {
      status: 400,
    });
  }

  await db.insert(gvoRequest).values({
    requesterId: (user?.id as string | undefined) ?? null,
    domain: body.domain.trim().toLowerCase(),
    makeName: body.makeName.trim(),
    modelName: body.modelName.trim(),
    trimName: body.trimName?.trim() ?? null,
    notes: body.notes?.trim() ?? null,
    status: "pending",
  });

  return new Response(JSON.stringify({ ok: true }), { status: 201 });
};
