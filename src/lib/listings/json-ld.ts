interface JsonLdSchema {
  "@context": string;
  "@type": string | string[];
  [key: string]: unknown;
}

export function generateListingJsonLd(params: {
  id: string;
  modelYear: number;
  make: string;
  model: string;
  trim: string | null;
  mileageKm: number | null;
  askingPriceNgn: number;
  engine: string | null;
  transmission: string | null;
  images: Array<{ tag: string; url: string }> | null;
  createdAt: Date | null;
  condition: Record<string, string> | null;
}): JsonLdSchema[] {
  const title = params.trim
    ? `${params.modelYear} ${params.make} ${params.model} ${params.trim}`
    : `${params.modelYear} ${params.make} ${params.model}`;

  const schemas: JsonLdSchema[] = [];

  // Product (Vehicle) schema
  const productSchema: JsonLdSchema = {
    "@context": "https://schema.org",
    "@type": ["Product", "Vehicle"],
    name: `${title} for Sale in Nigeria`,
    description: `Used ${title} with ${params.mileageKm?.toLocaleString() ?? "unknown"} km. Full condition report with ${params.condition ? Object.keys(params.condition).length + " checked categories" : "verified inspection"}. Priced at ₦${params.askingPriceNgn.toLocaleString()}.`,
    brand: { "@type": "Brand", name: params.make },
    model: params.model,
    vehicleModelDate: String(params.modelYear),
    mileageFromOdometer: params.mileageKm
      ? { "@type": "QuantitativeValue", value: params.mileageKm, unitCode: "KMT" }
      : undefined,
    offers: {
      "@type": "Offer",
      price: params.askingPriceNgn,
      priceCurrency: "NGN",
      availability: "https://schema.org/InStock",
    },
    image: params.images?.length ? params.images[0].url : undefined,
    datePosted: params.createdAt?.toISOString(),
  };

  // Add vehicle-specific properties when available
  if (params.engine) productSchema.vehicleEngine = params.engine;
  if (params.transmission) productSchema.vehicleTransmission = params.transmission;

  // Extract paint/color from condition report if present
  if (params.condition?.paint_quality) {
    productSchema.color = params.condition.paint_quality === "good" ? "Good Condition" : params.condition.paint_quality;
  }

  schemas.push(productSchema);

  // BreadcrumbList
  const breadcrumbSchema: JsonLdSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Listings", item: "https://panther.ng/listings" },
      { "@type": "ListItem", position: 2, name: `${params.modelYear} ${params.make} ${params.model}`, item: `https://panther.ng/listings/${params.id}` },
    ],
  };
  schemas.push(breadcrumbSchema);

  // FAQPage for AEO
  const faqSchema: JsonLdSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: `What is the asking price for this ${params.modelYear} ${params.make} ${params.model}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `The asking price for this ${title} is ₦${params.askingPriceNgn.toLocaleString()}. This is the seller's listed price and may be negotiable. Use Panther's Switchboard escrow — the seller only receives funds after you confirm the vehicle.`,
        },
      },
      {
        "@type": "Question",
        name: `What is the condition of this ${params.modelYear} ${params.make} ${params.model}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `This vehicle has a structured condition report with ${params.condition ? Object.values(params.condition).filter((v) => v === "good").length + " good, " + Object.values(params.condition).filter((v) => v === "fair").length + " fair" : "verified"} ratings across inspected categories. Panther rates each category with fixed options, so a buyer knows exactly what they're getting.`,
        },
      },
    ],
  };
  schemas.push(faqSchema);

  return schemas;
}
