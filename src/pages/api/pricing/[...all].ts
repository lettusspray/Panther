import { Hono } from "hono";
import { cors } from "hono/cors";
import type { APIRoute } from "astro";
import { getTrimPricingData } from "../../../lib/pricing/get-trim-pricing";

const pricing = new Hono();

pricing.use("/*", cors());

pricing.get("/:domain/:make/:model/:trim", async (c) => {
  const { domain, make, model, trim } = c.req.param();
  const year = c.req.query("year");

  const data = await getTrimPricingData(domain, make, model, trim, year);

  if ("error" in data) {
    return c.json({ error: data.error }, data.status as 404 | 503);
  }

  return c.json({
    vehicle: data.vehicle,
    cohorts: data.cohorts,
    jsonLd: data.jsonLd,
  });
});

pricing.get("/gvo/domains", async (c) => {
  const { getDomains } = await import("../../../lib/gvo");
  const domains = await getDomains();
  return c.json(domains);
});

pricing.get("/gvo/categories/:domainId", async (c) => {
  const { getCategoriesByDomain } = await import("../../../lib/gvo");
  const categories = await getCategoriesByDomain(c.req.param("domainId"));
  return c.json(categories);
});

pricing.get("/gvo/makes/:categoryId", async (c) => {
  const { getMakesByCategory } = await import("../../../lib/gvo");
  const makes = await getMakesByCategory(c.req.param("categoryId"));
  return c.json(makes);
});

pricing.get("/gvo/models/:makeId", async (c) => {
  const { getModelsByMake } = await import("../../../lib/gvo");
  const models = await getModelsByMake(c.req.param("makeId"));
  return c.json(models);
});

pricing.get("/gvo/trims/:modelId", async (c) => {
  const { getTrimsByModel } = await import("../../../lib/gvo");
  const trims = await getTrimsByModel(c.req.param("modelId"));
  return c.json(trims);
});

export const ALL: APIRoute = ({ request }) => pricing.fetch(request);
