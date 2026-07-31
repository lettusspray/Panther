interface JsonLdSchema {
  "@context": string;
  "@type": string | string[];
  [key: string]: unknown;
}

export function generateDealerJsonLd(params: {
  businessName: string;
  slug: string;
  subdomainUrl?: string;
  about: string | null;
  city: string | null;
  state: string | null;
  contactPhone: string | null;
  whatsappNumber: string | null;
  logo: string | null;
  avgRating: number | null;
  reviewCount: number;
  activeCount: number;
  soldCount: number;
  googleBusinessUrl?: string | null;
}): JsonLdSchema[] {
  const BASE = "https://panther.ng";
  const dealerUrl = params.subdomainUrl ?? `${BASE}/dealers/${params.slug}`;

  const schemas: JsonLdSchema[] = [];

  const address: Record<string, string> = {};
  if (params.city) address.addressLocality = params.city;
  if (params.state) address.addressRegion = params.state;
  address.addressCountry = "NG";

  const sameAs: string[] = [];
  if (params.whatsappNumber) {
    sameAs.push(`https://wa.me/${params.whatsappNumber.replace(/[^0-9]/g, "")}`);
  }
  if (params.googleBusinessUrl) {
    sameAs.push(params.googleBusinessUrl);
  }

  const mapsUrl = (() => {
    const q = [params.businessName, params.city, params.state, "Nigeria"]
      .filter(Boolean)
      .join("+");
    return `https://www.google.com/maps/search/${encodeURIComponent(q)}`;
  })();

  const localBusiness: JsonLdSchema = {
    "@context": "https://schema.org",
    "@type": ["AutoDealer", "LocalBusiness"],
    name: params.businessName,
    url: params.googleBusinessUrl ?? dealerUrl,
    description: params.about ?? `${params.businessName} — Vehicle dealer on Panther.`,
    image: params.logo ?? undefined,
    address: Object.keys(address).length > 0 ? { "@type": "PostalAddress", ...address } : undefined,
    telephone: params.contactPhone ?? undefined,
    sameAs: sameAs.length > 0 ? sameAs : undefined,
    hasMap: mapsUrl,
    openingHoursSpecification: [
      { "@type": "OpeningHoursSpecification", dayOfWeek: "Monday", opens: "09:00", closes: "18:00" },
      { "@type": "OpeningHoursSpecification", dayOfWeek: "Tuesday", opens: "09:00", closes: "18:00" },
      { "@type": "OpeningHoursSpecification", dayOfWeek: "Wednesday", opens: "09:00", closes: "18:00" },
      { "@type": "OpeningHoursSpecification", dayOfWeek: "Thursday", opens: "09:00", closes: "18:00" },
      { "@type": "OpeningHoursSpecification", dayOfWeek: "Friday", opens: "09:00", closes: "18:00" },
      { "@type": "OpeningHoursSpecification", dayOfWeek: "Saturday", opens: "09:00", closes: "17:00" },
    ],
    priceRange: "₦₦",
    areaServed: { "@type": "Country", name: "Nigeria" },
  };

  if (params.avgRating && params.reviewCount > 0) {
    localBusiness.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: params.avgRating,
      bestRating: 5,
      worstRating: 1,
      ratingCount: params.reviewCount,
    };
  }

  schemas.push(localBusiness);

  const breadcrumb: JsonLdSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Listings", item: `${BASE}/listings` },
      { "@type": "ListItem", position: 2, name: params.businessName, item: dealerUrl },
    ],
  };
  schemas.push(breadcrumb);

  return schemas;
}
