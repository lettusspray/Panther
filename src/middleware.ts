import { defineMiddleware } from "astro:middleware";
import { auth } from "./lib/auth";
import { getDealerBySubdomain } from "./lib/dealer";
import { extractSubdomain, PANTHER_DOMAIN } from "./lib/dealer/subdomain";

const PUBLIC_PATHS = ["/", "/pricing", "/api/health", "/auth/sign-in", "/auth/sign-up"];

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);
  const path = url.pathname;
  const host = url.hostname;

  // Wildcard subdomain routing: *.panther.ng → dealer storefront
  // Requires Cloudflare wildcard DNS record: *.panther.ng → this worker
  // NOTE: context.rewrite() re-runs this middleware with the same host, so
  // every branch below must detect its own rewrite target and render instead
  // of re-rewriting — otherwise the request loops ("Loop Detected").
  const subdomain = extractSubdomain(host);
  if (subdomain) {
    context.locals.subdomainHost = host;
    if (path.startsWith("/dealers/")) return next(); // already rewrote → render
    let dealerProfile = null;
    try {
      dealerProfile = await getDealerBySubdomain(subdomain);
    } catch {
      // DB unavailable — treat as no dealer; render 404, never 500
    }
    if (dealerProfile) {
      return context.rewrite(`/dealers/${dealerProfile.slug}`);
    }
    // Subdomain not found — render 404 (guarded against the rewrite loop)
    if (path === "/404") return next();
    return context.rewrite("/404");
  }

  // Allow the canonical host, workers.dev/pages.dev previews, and local dev
  const isAllowedHost =
    host === PANTHER_DOMAIN ||
    host.endsWith(".workers.dev") ||
    host.endsWith(".pages.dev") ||
    host === "localhost" ||
    host.startsWith("127.0.0.1") ||
    host.startsWith("0.0.0.0");
  if (!isAllowedHost) {
    // Unknown host — render 404 (guarded against the rewrite loop)
    if (path === "/404") return next();
    return context.rewrite("/404");
  }

  // Auth API routes and webhooks — pass through, never redirect
  // Webhooks are called by PSPs (Paystack) without session cookies
  if (
    path.startsWith("/api/auth/") ||
    path.startsWith("/api/webhooks/") ||
    path.startsWith("/_") ||
    path.includes(".")
  ) {
    return next();
  }

  // Public marketing/catalog paths — no auth and no DB session check.
  // The homepage, pricing, vehicles, and listings-browse pages must never
  // depend on the DB, otherwise a slow database takes the whole site down.
  const isOrUnder = (p: string) => path === p || path.startsWith(p + "/");
  const isPublicStatic =
    path === "/404" ||
    PUBLIC_PATHS.some((p) => path === p) ||
    isOrUnder("/pricing") ||
    isOrUnder("/vehicles") ||
    path === "/listings";
  if (isPublicStatic) {
    return next();
  }

  // Public pages that DO need to know the visitor (listing detail shows the
  // escrow CTA to signed-in buyers; dealer storefronts show review state).
  const needsUser =
    isOrUnder("/dealers") ||
    (isOrUnder("/listings") && path !== "/listings" && path !== "/listings/new");

  // Resolve the session where the logged-in user matters.
  let session = null;
  try {
    session = await auth.api.getSession({
      headers: context.request.headers,
    });
  } catch {
    // Session check failed — treat as unauthenticated
  }
  context.locals.user = session?.user ?? null;
  context.locals.session = session?.session ?? null;

  // Public-but-needs-user pages render with the user state attached.
  if (needsUser) {
    return next();
  }

  // Protected routes — redirect to sign-in with return URL
  if (!session) {
    const returnTo = encodeURIComponent(path + url.search);
    return context.redirect(`/auth/sign-in?returnTo=${returnTo}`);
  }

  return next();
});
