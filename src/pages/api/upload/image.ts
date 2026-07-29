import type { APIRoute } from "astro";
import { createImageUploadUrl } from "../../../lib/upload";

/**
 * POST /api/upload/image
 *
 * Returns a one-time Cloudflare Images Direct Creator Upload URL.
 * The client uploads directly to `uploadUrl`, then stores the returned `deliveryUrl`.
 *
 * Body (optional): { filename?: string }
 * Response: { uploadUrl, imageId, deliveryUrl }
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const user = (locals as { user: Record<string, unknown> | null }).user;
  if (!user?.id) {
    return new Response(
      JSON.stringify({ error: "Authentication required" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  let filename: string | undefined;
  try {
    const body = await request.json() as unknown;
    if (typeof body === "object" && body !== null && "filename" in body) {
      const f = (body as Record<string, unknown>).filename;
      if (typeof f === "string") filename = f;
    }
  } catch {
    // no body — proceed without filename
  }

  try {
    const result = await createImageUploadUrl(filename);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Upload failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
