export type SeoInput = {
  title: string;
  description: string;
  path?: string;
  image?: string;
  noindex?: boolean;
};

const SITE_URL = (import.meta.env.PUBLIC_SITE_URL ?? "https://panther.ng").replace(/\/$/, "");

export function absoluteUrl(path = "/") {
  return new URL(path, `${SITE_URL}/`).toString();
}

export function buildSeo(input: SeoInput) {
  const canonical = absoluteUrl(input.path ?? "/");
  return {
    title: input.title,
    description: input.description,
    canonical,
    image: input.image ? absoluteUrl(input.image) : undefined,
    noindex: input.noindex ?? false,
  };
}

export function vehicleJsonLd(input: {
  name: string;
  description: string;
  url: string;
  image?: string;
  price?: string;
  currency?: string;
  sellerName?: string;
  year?: number;
  mileageKm?: number | null;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.name,
    description: input.description,
    url: absoluteUrl(input.url),
    ...(input.image ? { image: [absoluteUrl(input.image)] } : {}),
    ...(input.year ? { vehicleModelDate: String(input.year) } : {}),
    ...(input.mileageKm != null ? { mileageFromOdometer: { "@type": "QuantitativeValue", value: input.mileageKm, unitCode: "KMT" } } : {}),
    ...(input.price ? { offers: { "@type": "Offer", price: input.price, priceCurrency: input.currency ?? "NGN", url: absoluteUrl(input.url), availability: "https://schema.org/InStock" } } : {}),
    ...(input.sellerName ? { seller: { "@type": "Organization", name: input.sellerName } } : {}),
  };
}

export function dealerJsonLd(input: {
  name: string;
  url: string;
  phone?: string;
  city?: string;
  state?: string;
  description?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "AutomotiveBusiness",
    name: input.name,
    url: absoluteUrl(input.url),
    ...(input.phone ? { telephone: input.phone } : {}),
    ...(input.description ? { description: input.description } : {}),
    ...(input.city || input.state ? { address: { "@type": "PostalAddress", addressLocality: input.city, addressRegion: input.state, addressCountry: "NG" } } : {}),
  };
}

export function breadcrumbJsonLd(items: Array<{ name: string; url: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.url),
    })),
  };
}
