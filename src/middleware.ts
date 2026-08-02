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
  const subdomain = extractSubdomain(host);
  if (subdomain) {
    const dealerProfile = await getDealerBySubdomain(subdomain);
    if (dealerProfile) {
      context.locals.subdomainHost = host;
      return context.rewrite(`/dealers/${dealerProfile.slug}`);
    }
    // Subdomain not found — render 404
    return context.rewrite("/404");
  }

  // Allow the canonical host, local dev, and Cloudflare Pages previews
  const isAllowedHost =
    host === PANTHER_DOMAIN ||
    host.endsWith(".pages.dev") ||
    host === "localhost" ||
    host.startsWith("127.0.0.1") ||
    host.startsWith("0.0.0.0");
  if (!isAllowedHost) {
    // Unknown host — render 404
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

  // Resolve the session for every non-API request so public pages (e.g.
  // listing detail) know whether the visitor is signed in.
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

  // Public paths — no auth required
  const isPublic =
    PUBLIC_PATHS.some((p) => path === p) ||
    path.startsWith("/pricing/") ||
    path.startsWith("/vehicles/") ||
    path.startsWith("/dealers/") ||
    (path.startsWith("/listings/") && path !== "/listings/new");
  if (isPublic) {
    return next();
  }

  // Protected routes — redirect to sign-in with return URL
  if (!session) {
    const returnTo = encodeURIComponent(path + url.search);
    return context.redirect(`/auth/sign-in?returnTo=${returnTo}`);
  }

  return next();
});
