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
  if (host !== PANTHER_DOMAIN) {
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

  // Public paths — no auth required
  if (PUBLIC_PATHS.some((p) => path === p) || path.startsWith("/pricing/")) {
    return next();
  }

  // Vehicles, listings browse, and dealer storefronts are public
  if (
    path.startsWith("/vehicles/") ||
    path.startsWith("/dealers/") ||
    (path.startsWith("/listings/") && path !== "/listings/new")
  ) {
    return next();
  }

  // Check session for all other routes
  let session = null;
  try {
    session = await auth.api.getSession({
      headers: context.request.headers,
    });
  } catch {
    // Session check failed — treat as unauthenticated
  }

  // Attach session to context for downstream use
  context.locals.user = session?.user ?? null;
  context.locals.session = session?.session ?? null;

  // Protected routes — redirect to sign-in with return URL
  if (!session) {
    const returnTo = encodeURIComponent(path + url.search);
    return context.redirect(`/auth/sign-in?returnTo=${returnTo}`);
  }

  return next();
});
