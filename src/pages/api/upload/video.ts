import type { APIRoute } from "astro";
import { createVideoUploadUrl } from "../../../lib/upload";

/**
 * POST /api/upload/video
 *
 * Returns a presigned URL for uploading a video to R2.
 * Body: { filename, contentType }
 *
 * The client uploads directly to `uploadUrl`, then stores the returned `publicUrl`.
 *
 * Response: { uploadUrl, key, publicUrl }
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const user = (locals as { user: Record<string, unknown> | null }).user;
  if (!user?.id) {
    return new Response(
      JSON.stringify({ error: "Authentication required" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: { filename?: string; contentType?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!body.filename || !body.contentType) {
    return new Response(
      JSON.stringify({ error: "filename and contentType are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const result = await createVideoUploadUrl(body.filename, body.contentType);
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
