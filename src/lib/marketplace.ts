import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "./db";
import { dealer, gvoMake, gvoModel, gvoTrim, listing } from "./db/schema";

function mapRow(row:any) {
  return { ...row, images: Array.isArray(row.images) ? row.images : [], dealerVerified: Boolean(row.dealerVerified), isVerified: Boolean(row.dealerVerified) };
}

export async function getMarketplaceListings(input: { q?: string; make?: string; minPrice?: number; maxPrice?: number; limit?: number } = {}) {
  const filters:any[] = [eq(listing.status, "active")];
  if (input.q) { const q = `%${input.q}%`; filters.push(or(ilike(gvoMake.name, q), ilike(gvoModel.name, q), ilike(gvoTrim.name, q), ilike(listing.customMake, q), ilike(listing.customModel, q))); }
  if (input.make) filters.push(ilike(gvoMake.name, input.make));
  if (input.minPrice != null) filters.push(sqlPriceGte(input.minPrice));
  if (input.maxPrice != null) filters.push(sqlPriceLte(input.maxPrice));
  const rows = await db.select({ id: listing.id, modelYear: listing.modelYear, mileageKm: listing.mileageKm, askingPriceNgn: listing.askingPriceNgn, images: listing.images, customMake: listing.customMake, customModel: listing.customModel, customTrim: listing.customTrim, make: gvoMake.name, model: gvoModel.name, trim: gvoTrim.name, businessName: dealer.businessName, dealerVerified: dealer.isVerified }).from(listing).leftJoin(gvoTrim, eq(listing.trimId, gvoTrim.id)).leftJoin(gvoModel, eq(gvoTrim.modelId, gvoModel.id)).leftJoin(gvoMake, eq(gvoModel.makeId, gvoMake.id)).leftJoin(dealer, eq(listing.sellerId, dealer.userId)).where(and(...filters)).orderBy(desc(listing.createdAt)).limit(Math.min(input.limit ?? 24, 48));
  return rows.map(mapRow);
}

function sqlPriceGte(value:number) { return (listing.askingPriceNgn as any) >= String(value); }
function sqlPriceLte(value:number) { return (listing.askingPriceNgn as any) <= String(value); }

export async function getListing(id:string) {
  const rows = await db.select({ id: listing.id, sellerId: listing.sellerId, modelYear: listing.modelYear, mileageKm: listing.mileageKm, askingPriceNgn: listing.askingPriceNgn, images: listing.images, videos: listing.videos, conditionReport: listing.conditionReport, status: listing.status, customMake: listing.customMake, customModel: listing.customModel, customTrim: listing.customTrim, make: gvoMake.name, model: gvoModel.name, trim: gvoTrim.name, engine: gvoTrim.engine, transmission: gvoTrim.transmission, dealerId: dealer.id, businessName: dealer.businessName, dealerSlug: dealer.slug, dealerVerified: dealer.isVerified, city: dealer.city, state: dealer.state, inspectionAvailable: dealer.inspectionAvailable, deliveryAvailable: dealer.deliveryAvailable }).from(listing).leftJoin(gvoTrim, eq(listing.trimId, gvoTrim.id)).leftJoin(gvoModel, eq(gvoTrim.modelId, gvoModel.id)).leftJoin(gvoMake, eq(gvoModel.makeId, gvoMake.id)).leftJoin(dealer, eq(listing.sellerId, dealer.userId)).where(eq(listing.id, id)).limit(1);
  return rows[0] ? mapRow(rows[0]) : null;
}
