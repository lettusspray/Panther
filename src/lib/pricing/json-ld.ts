/**
 * JSON-LD schema generators for pricing pages.
 * Per constitution: hardcoded JSON-LD is forbidden.
 * Schema must be generated dynamically from Pricing Engine output.
 */

import type { PricingPageData } from "./types";

interface JsonLdSchema {
  "@context": string;
  "@type": string;
  [key: string]: unknown;
}

export function generatePricingJsonLd(data: PricingPageData): JsonLdSchema[] {
  const { cohort, result, effectiveTimestamp } = data;
  const title = `${cohort.modelYear} ${cohort.make} ${cohort.model} ${cohort.trim}`;

  // Product schema with price range
  const productSchema: JsonLdSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${title} Landed Cost in Nigeria`,
    description: `Estimated landed cost range for a ${cohort.modelYear} ${cohort.make} ${cohort.model} ${cohort.trim} imported into Nigeria. Includes all statutory charges (import duty, NAC levy, CISS, ETLS, VAT) and non-statutory costs (port handling, clearing agent, documentation).`,
    brand: {
      "@type": "Brand",
      name: cohort.make,
    },
    model: cohort.model,
    offers: {
      "@type": "AggregateOffer",
      lowPrice: result.floorNgn,
      highPrice: result.ceilingNgn,
      priceCurrency: "NGN",
      availability: "https://schema.org/InStock",
    },
    dateModified: effectiveTimestamp.toISOString(),
  };

  // FAQPage schema for AEO
  const faqSchema: JsonLdSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: `What is the landed cost of a ${cohort.modelYear} ${cohort.make} ${cohort.model} ${cohort.trim} in Nigeria?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `The estimated landed cost for a ${cohort.modelYear} ${cohort.make} ${cohort.model} ${cohort.trim} ranges from ₦${result.floorNgn.toLocaleString()} to ₦${result.ceilingNgn.toLocaleString()}, inclusive of all statutory charges (import duty at 20%, NAC levy at 5%, CISS, ETLS, and VAT at 7.5%) and non-statutory costs (port handling, clearing agent fees, documentation). This estimate uses cohort-level wholesale FOB pricing and live NCS customs exchange rates.`,
        },
      },
      {
        "@type": "Question",
        name: `How is the import duty calculated for a ${cohort.modelYear} ${cohort.make} ${cohort.model}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `Import duty for standard passenger cars in Nigeria is 20% of the CIF (Cost, Insurance & Freight) value converted to Naira using the live NCS customs exchange rate. The NCS rate is distinct from the CBN retail rate and is updated regularly via official channels.`,
        },
      },
    ],
  };

  // HowTo schema for the formula breakdown
  const howToSchema: JsonLdSchema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: `How to Calculate the Landed Cost of a ${cohort.modelYear} ${cohort.make} ${cohort.model} ${cohort.trim}`,
    step: result.steps.map((s) => ({
      "@type": "HowToStep",
      position: s.step,
      name: s.name,
      text: `${s.name}: ${s.formula}. Value range: ₦${s.valueLow.toLocaleString()} – ₦${s.valueHigh.toLocaleString()}.`,
    })),
  };

  return [productSchema, faqSchema, howToSchema];
}
