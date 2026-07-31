export const PANTHER_DOMAIN = "panther.ng";

export function extractSubdomain(hostname: string): string | null {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (host === PANTHER_DOMAIN) return null;
  if (host.endsWith("." + PANTHER_DOMAIN)) {
    const sub = host.slice(0, -("." + PANTHER_DOMAIN).length);
    return sub.length > 0 ? sub : null;
  }
  return null;
}

export type SubdomainValidation =
  | { ok: true; value: string }
  | { ok: false; reason: "empty" }
  | { ok: false; reason: "invalid"; error: string };

export function normalizeSubdomain(input: unknown): SubdomainValidation {
  if (input === undefined || input === null) return { ok: false, reason: "empty" };
  if (typeof input !== "string") {
    return { ok: false, reason: "invalid", error: "Subdomain must be a string" };
  }
  const trimmed = input.trim();
  if (trimmed === "") return { ok: false, reason: "empty" };
  if (!/^[a-z0-9-]+$/.test(trimmed)) {
    return {
      ok: false,
      reason: "invalid",
      error: "Subdomain must be lowercase alphanumeric with hyphens",
    };
  }
  return { ok: true, value: trimmed };
}

export function getDealerCanonicalUrl(subdomainHost: string | null, slug: string): string {
  if (subdomainHost) return `https://${subdomainHost}`;
  return `https://${PANTHER_DOMAIN}/dealers/${slug}`;
}
