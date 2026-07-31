import type { APIRoute } from "astro";
import { upsertDealerProfile, slugExists, subdomainExists, getDealerByUserId } from "../../../lib/dealer";
import { normalizeSubdomain } from "../../../lib/dealer/subdomain";

function resolveSubdomain(input: unknown, fallback: string | null): { error?: string; value: string | null } {
  const result = normalizeSubdomain(input);
  if (result.ok) return { value: result.value };
  if (result.reason === "invalid") return { error: result.error, value: null };
  return { value: fallback };
}

export const POST: APIRoute = async ({ request, locals }) => {
  const user = (locals as { user: Record<string, unknown> | null }).user;
  if (!user?.id) {
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { businessName, slug, subdomain, about, city, state, contactPhone, whatsappNumber, naddcRegistrationId, googleBusinessUrl, inspectionAvailable, deliveryAvailable } = body;

  if (!businessName || typeof businessName !== "string") {
    return new Response(JSON.stringify({ error: "businessName is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!slug || typeof slug !== "string" || !/^[a-z0-9-]+$/.test(slug)) {
    return new Response(JSON.stringify({ error: "slug must be lowercase alphanumeric with hyphens" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const exists = await slugExists(slug, user.id as string);
  if (exists) {
    return new Response(JSON.stringify({ error: "This slug is already taken" }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sub = resolveSubdomain(subdomain, null);
  if (sub.error) {
    return new Response(JSON.stringify({ error: sub.error }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (sub.value) {
    const subTaken = await subdomainExists(sub.value, user.id as string);
    if (subTaken) {
      return new Response(JSON.stringify({ error: "This subdomain is already taken" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const result = await upsertDealerProfile(user.id as string, {
    businessName: businessName as string,
    slug: slug as string,
    subdomain: sub.value ?? undefined,
    about: about as string | undefined,
    city: city as string | undefined,
    state: state as string | undefined,
    contactPhone: contactPhone as string | undefined,
    whatsappNumber: whatsappNumber as string | undefined,
    naddcRegistrationId: naddcRegistrationId as string | undefined,
    googleBusinessUrl: googleBusinessUrl as string | undefined,
    inspectionAvailable: Boolean(inspectionAvailable),
    deliveryAvailable: Boolean(deliveryAvailable),
  });

  return new Response(JSON.stringify({ ok: true, ...result }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  const user = (locals as { user: Record<string, unknown> | null }).user;
  if (!user?.id) {
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const existing = await getDealerByUserId(user.id as string);
  if (!existing) {
    return new Response(JSON.stringify({ error: "No dealer profile found. Create one first." }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const slug = (body.slug as string) ?? existing.slug;
  if (slug !== existing.slug) {
    const taken = await slugExists(slug, user.id as string);
    if (taken) {
      return new Response(JSON.stringify({ error: "This slug is already taken" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const sub = body.subdomain !== undefined ? resolveSubdomain(body.subdomain, null) : { value: existing.subdomain };
  if (sub.error) {
    return new Response(JSON.stringify({ error: sub.error }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (sub.value && sub.value !== existing.subdomain) {
    const subTaken = await subdomainExists(sub.value, user.id as string);
    if (subTaken) {
      return new Response(JSON.stringify({ error: "This subdomain is already taken" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const result = await upsertDealerProfile(user.id as string, {
    businessName: (body.businessName as string) ?? existing.businessName,
    slug,
    subdomain: sub.value ?? undefined,
    about: body.about as string | undefined,
    city: body.city as string | undefined,
    state: body.state as string | undefined,
    contactPhone: body.contactPhone as string | undefined,
    whatsappNumber: body.whatsappNumber as string | undefined,
    naddcRegistrationId: body.naddcRegistrationId as string | undefined,
    googleBusinessUrl: body.googleBusinessUrl as string | undefined,
    inspectionAvailable: body.inspectionAvailable !== undefined ? Boolean(body.inspectionAvailable) : existing.inspectionAvailable,
    deliveryAvailable: body.deliveryAvailable !== undefined ? Boolean(body.deliveryAvailable) : existing.deliveryAvailable,
  });

  return new Response(JSON.stringify({ ok: true, ...result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
