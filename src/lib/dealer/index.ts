import { eq, and, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { dealer, dealerReview, dealerCommitment, vehicleCareEvent, vehicleCareEventTypeEnum, listing, listingStatusEnum, order, orderItem, orderSettlement, user } from "../db/schema";

type ListingStatus = (typeof listingStatusEnum.enumValues)[number];

export async function getDealerBySlug(slug: string) {
  const rows = await db
    .select({
      id: dealer.id,
      userId: dealer.userId,
      businessName: dealer.businessName,
      slug: dealer.slug,
      logo: dealer.logo,
      bannerImage: dealer.bannerImage,
      about: dealer.about,
      city: dealer.city,
      state: dealer.state,
      contactPhone: dealer.contactPhone,
      whatsappNumber: dealer.whatsappNumber,
      naddcRegistrationId: dealer.naddcRegistrationId,
      isVerified: dealer.isVerified,
      inspectionAvailable: dealer.inspectionAvailable,
      deliveryAvailable: dealer.deliveryAvailable,
      googleBusinessUrl: dealer.googleBusinessUrl,
      createdAt: dealer.createdAt,
      memberName: user.name,
      memberImage: user.image,
      memberSince: user.createdAt,
    })
    .from(dealer)
    .innerJoin(user, eq(dealer.userId, user.id))
    .where(eq(dealer.slug, slug))
    .limit(1);

  if (rows.length === 0) return null;
  return rows[0];
}

export async function getDealerByUserId(userId: string) {
  const rows = await db
    .select()
    .from(dealer)
    .where(eq(dealer.userId, userId))
    .limit(1);

  if (rows.length === 0) return null;
  return rows[0];
}

export async function getDealerListings(dealerId: string, status?: string | string[]) {
  const conditions = [eq(listing.sellerId, dealerId)];
  if (status) {
    if (Array.isArray(status)) {
      conditions.push(inArray(listing.status, status as ListingStatus[]));
    } else {
      conditions.push(eq(listing.status, status as "active"));
    }
  }

  return db
    .select({
      id: listing.id,
      modelYear: listing.modelYear,
      mileageKm: listing.mileageKm,
      askingPriceNgn: listing.askingPriceNgn,
      status: listing.status,
      images: listing.images,
      createdAt: listing.createdAt,
    })
    .from(listing)
    .where(and(...conditions))
    .orderBy(listing.createdAt);
}

export async function getDealerReviews(dealerId: string) {
  return db
    .select({
      id: dealerReview.id,
      rating: dealerReview.rating,
      title: dealerReview.title,
      body: dealerReview.body,
      createdAt: dealerReview.createdAt,
      buyerName: user.name,
    })
    .from(dealerReview)
    .innerJoin(user, eq(dealerReview.buyerId, user.id))
    .where(eq(dealerReview.dealerId, dealerId))
    .orderBy(dealerReview.createdAt);
}

export async function getDealerStats(dealerId: string) {
  const rows = await db
    .select({
      total: sql<number>`count(*)`,
      active: sql<number>`count(*) filter (where ${listing.status} = 'active')`,
      sold: sql<number>`count(*) filter (where ${listing.status} = 'sold')`,
    })
    .from(listing)
    .where(eq(listing.sellerId, dealerId));

  const stats = rows[0] ?? { total: 0, active: 0, sold: 0 };

  const reviewRows = await db
    .select({
      avg: sql<string | null>`round(avg(${dealerReview.rating}), 1)`,
      count: sql<number>`count(*)`,
    })
    .from(dealerReview)
    .where(eq(dealerReview.dealerId, dealerId));

  const reviewStats = reviewRows[0] ?? { avg: null, count: 0 };

  return {
    ...stats,
    avgRating: reviewStats.avg ? Number(reviewStats.avg) : null,
    reviewCount: reviewStats.count,
  };
}

export async function upsertDealerProfile(
  userId: string,
  data: {
    businessName: string;
    slug: string;
    subdomain?: string;
    about?: string;
    city?: string;
    state?: string;
    contactPhone?: string;
    whatsappNumber?: string;
    naddcRegistrationId?: string;
    googleBusinessUrl?: string;
    inspectionAvailable?: boolean;
    deliveryAvailable?: boolean;
  },
) {
  const existing = await getDealerByUserId(userId);

  if (existing) {
    const updated = await db
      .update(dealer)
      .set({
        businessName: data.businessName,
        slug: data.slug,
        subdomain: data.subdomain ?? null,
        about: data.about,
        city: data.city,
        state: data.state,
        contactPhone: data.contactPhone,
        whatsappNumber: data.whatsappNumber,
        naddcRegistrationId: data.naddcRegistrationId,
        googleBusinessUrl: data.googleBusinessUrl,
        inspectionAvailable: data.inspectionAvailable,
        deliveryAvailable: data.deliveryAvailable,
        updatedAt: new Date(),
      })
      .where(eq(dealer.id, existing.id))
      .returning({ id: dealer.id, slug: dealer.slug, subdomain: dealer.subdomain });

    return updated[0];
  }

  const [created] = await db
    .insert(dealer)
    .values({
      userId,
      businessName: data.businessName,
      slug: data.slug,
      subdomain: data.subdomain ?? null,
      about: data.about,
      city: data.city,
      state: data.state,
      contactPhone: data.contactPhone,
      whatsappNumber: data.whatsappNumber,
      naddcRegistrationId: data.naddcRegistrationId,
      googleBusinessUrl: data.googleBusinessUrl,
      inspectionAvailable: data.inspectionAvailable,
      deliveryAvailable: data.deliveryAvailable,
    })
    .returning({ id: dealer.id, slug: dealer.slug, subdomain: dealer.subdomain });

  return created;
}

export async function getDealerBySubdomain(subdomain: string) {
  const rows = await db
    .select({
      id: dealer.id,
      userId: dealer.userId,
      businessName: dealer.businessName,
      slug: dealer.slug,
      subdomain: dealer.subdomain,
      logo: dealer.logo,
      bannerImage: dealer.bannerImage,
      about: dealer.about,
      city: dealer.city,
      state: dealer.state,
      contactPhone: dealer.contactPhone,
      whatsappNumber: dealer.whatsappNumber,
      naddcRegistrationId: dealer.naddcRegistrationId,
      isVerified: dealer.isVerified,
      inspectionAvailable: dealer.inspectionAvailable,
      deliveryAvailable: dealer.deliveryAvailable,
      googleBusinessUrl: dealer.googleBusinessUrl,
      memberName: user.name,
      memberImage: user.image,
      memberSince: user.createdAt,
    })
    .from(dealer)
    .innerJoin(user, eq(dealer.userId, user.id))
    .where(eq(dealer.subdomain, subdomain))
    .limit(1);

  if (rows.length === 0) return null;
  return rows[0];
}

export async function subdomainExists(subdomain: string, excludeUserId?: string): Promise<boolean> {
  const rows = await db
    .select({ id: dealer.id })
    .from(dealer)
    .where(eq(dealer.subdomain, subdomain))
    .limit(1);

  if (rows.length === 0) return false;
  if (excludeUserId) {
    const d = await getDealerByUserId(excludeUserId);
    return d?.subdomain !== subdomain;
  }
  return true;
}

export async function slugExists(slug: string, excludeUserId?: string): Promise<boolean> {
  const rows = await db
    .select({ id: dealer.id })
    .from(dealer)
    .where(eq(dealer.slug, slug))
    .limit(1);

  if (rows.length === 0) return false;
  if (excludeUserId) {
    const d = await getDealerByUserId(excludeUserId);
    return d?.slug !== slug;
  }
  return true;
}


export async function getDealerCommitment(dealerId: string) {
  const rows = await db.select().from(dealerCommitment).where(eq(dealerCommitment.dealerId, dealerId)).limit(1);
  return rows[0] ?? null;
}

export async function upsertDealerCommitment(dealerId: string, data: {
  warrantyMonths?: number;
  warrantyMileageKm?: number | null;
  complimentaryServiceMonths?: number;
  annualInspectionIncluded?: boolean;
  importDocumentationAvailable?: boolean;
  bulkSalesAvailable?: boolean;
  serviceNotes?: string | null;
}) {
  const existing = await getDealerCommitment(dealerId);
  if (existing) {
    const [updated] = await db.update(dealerCommitment).set({ ...data, updatedAt: new Date() }).where(eq(dealerCommitment.dealerId, dealerId)).returning();
    return updated;
  }
  const [created] = await db.insert(dealerCommitment).values({ dealerId, ...data }).returning();
  return created;
}

export async function getDealerInventoryQuality(dealerUserId: string) {
  const rows = await db.select({
    id: listing.id,
    mileageKm: listing.mileageKm,
    askingPriceNgn: listing.askingPriceNgn,
    conditionReport: listing.conditionReport,
    images: listing.images,
  }).from(listing).where(and(eq(listing.sellerId, dealerUserId), eq(listing.status, "active")));
  const checks = rows.map((row) => {
    let complete = 0;
    if (row.askingPriceNgn && Number(row.askingPriceNgn) > 0) complete++;
    if (row.mileageKm != null) complete++;
    if (Array.isArray(row.images) && row.images.length > 0) complete++;
    if (row.conditionReport && typeof row.conditionReport === "object") complete++;
    return { id: row.id, score: Math.round((complete / 4) * 100), needs: [
      !(row.askingPriceNgn && Number(row.askingPriceNgn) > 0) ? "price" : null,
      row.mileageKm == null ? "mileage" : null,
      !(Array.isArray(row.images) && row.images.length > 0) ? "photos" : null,
      !(row.conditionReport && typeof row.conditionReport === "object") ? "condition report" : null,
    ].filter(Boolean) as string[] };
  });
  const average = rows.length ? Math.round(rows.reduce((n, row) => {
    const bits = [
      !!(row.askingPriceNgn && Number(row.askingPriceNgn) > 0),
      row.mileageKm != null,
      Array.isArray(row.images) && row.images.length > 0,
      !!(row.conditionReport && typeof row.conditionReport === "object"),
    ].filter(Boolean).length;
    return n + (bits / 4) * 100;
  }, 0) / rows.length) : 0;
  return { averageScore: average, listings: checks };
}

export async function getDealerReliability(dealerUserId: string) {
  const rows = await db.select({
    orders: sql<number>`count(distinct ${order.id})`,
    settled: sql<number>`count(distinct case when ${orderSettlement.status} = 'settled' then ${order.id} end)`,
  }).from(orderItem)
    .innerJoin(order, eq(orderItem.orderId, order.id))
    .leftJoin(orderSettlement, eq(orderSettlement.orderItemId, orderItem.id))
    .where(eq(orderItem.sellerId, dealerUserId));
  const row = rows[0];
  const orders = Number(row?.orders ?? 0);
  const settled = Number(row?.settled ?? 0);
  return { completedOrders: settled, trackedOrders: orders, settlementRate: orders ? Math.round((settled / orders) * 100) : null };
}

export async function getDealerCareEvents(dealerId: string, limit = 20) {
  return db.select().from(vehicleCareEvent).where(and(eq(vehicleCareEvent.dealerId, dealerId), eq(vehicleCareEvent.isPublic, true))).orderBy(sql`${vehicleCareEvent.eventDate} desc`).limit(limit);
}

export async function getVehicleCareEvents(listingId: string, includePrivate = false) {
  const conditions = includePrivate ? eq(vehicleCareEvent.listingId, listingId) : and(eq(vehicleCareEvent.listingId, listingId), eq(vehicleCareEvent.isPublic, true));
  return db.select().from(vehicleCareEvent).where(conditions).orderBy(sql`${vehicleCareEvent.eventDate} desc`);
}

export async function getUpcomingDealerCareEvents(dealerId: string, limit = 10) {
  return db.select().from(vehicleCareEvent)
    .where(and(eq(vehicleCareEvent.dealerId, dealerId), sql`${vehicleCareEvent.nextDueAt} is not null`))
    .orderBy(vehicleCareEvent.nextDueAt)
    .limit(limit);
}

export async function createDealerCareEvent(userId: string, data: {
  listingId: string;
  type: (typeof vehicleCareEventTypeEnum.enumValues)[number];
  eventDate: Date;
  title: string;
  notes?: string;
  provider?: string;
  location?: string;
  mileageKm?: number;
  nextDueAt?: Date;
  nextDueMileageKm?: number;
  evidenceUrl?: string;
  isPublic?: boolean;
}) {
  const owned = await db.select({ id: dealer.id }).from(dealer).where(eq(dealer.userId, userId)).limit(1);
  if (!owned[0]) throw new Error("Dealer profile required");
  const vehicle = await db.select({ id: listing.id }).from(listing).where(and(eq(listing.id, data.listingId), eq(listing.sellerId, userId))).limit(1);
  if (!vehicle[0]) throw new Error("Vehicle is not owned by this dealer");
  const [created] = await db.insert(vehicleCareEvent).values({ ...data, dealerId: owned[0].id, createdBy: userId }).returning();
  return created;
}
