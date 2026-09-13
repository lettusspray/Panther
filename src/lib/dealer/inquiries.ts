import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { dealer, listing } from "../db/schema";

export type DealerInquiryChannel = "whatsapp" | "phone" | "platform";
export type DealerInquiryStatus = "new" | "responded";

export type DealerInquiry = {
  id: string;
  listingId: string | null;
  channel: DealerInquiryChannel;
  status: DealerInquiryStatus;
  createdAt: Date;
  firstResponseAt: Date | null;
};

async function getDealerBySlug(slug: string) {
  const rows = await db
    .select({ id: dealer.id, userId: dealer.userId })
    .from(dealer)
    .where(eq(dealer.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}

export async function createDealerInquiry(params: {
  dealerSlug: string;
  channel: DealerInquiryChannel;
  listingId?: string | null;
  buyerId?: string | null;
}) {
  const dealerRecord = await getDealerBySlug(params.dealerSlug);
  if (!dealerRecord) return null;

  if (params.listingId) {
    const listingRows = await db.select({ id: listing.id }).from(listing).where(and(eq(listing.id, params.listingId), eq(listing.sellerId, dealerRecord.userId))).limit(1);
    if (!listingRows[0]) return null;
  }
  if (params.buyerId && params.buyerId === dealerRecord.userId) return null;

  const rows = await db.execute(sql`
    insert into dealer_inquiry (dealer_id, listing_id, buyer_id, channel)
    values (${dealerRecord.id}, ${params.listingId ?? null}, ${params.buyerId ?? null}, ${params.channel})
    returning id, dealer_id as "dealerId", listing_id as "listingId", buyer_id as "buyerId", channel, status,
      created_at as "createdAt", first_response_at as "firstResponseAt"
  `);
  return rows.rows[0] ?? null;
}

export async function getDealerInquirySummary(dealerId: string) {
  const rows = await db.execute(sql`
    select
      count(*)::int as "trackedInquiries",
      count(*) filter (where status = 'responded')::int as "respondedInquiries",
      round(
        100.0 * count(*) filter (where status = 'responded') / nullif(count(*), 0),
        1
      ) as "responseRate"
    from dealer_inquiry
    where dealer_id = ${dealerId}
  `);
  const row = rows.rows[0] as Record<string, unknown> | undefined;
  return {
    trackedInquiries: Number(row?.trackedInquiries ?? 0),
    respondedInquiries: Number(row?.respondedInquiries ?? 0),
    responseRate: row?.responseRate === null || row?.responseRate === undefined ? null : Number(row.responseRate),
  };
}

export async function getDealerInquiries(dealerId: string, limit = 20): Promise<DealerInquiry[]> {
  const safeLimit = Math.max(1, Math.min(limit, 50));
  const rows = await db.execute(sql`
    select
      id,
      listing_id as "listingId",
      channel,
      status,
      created_at as "createdAt",
      first_response_at as "firstResponseAt"
    from dealer_inquiry
    where dealer_id = ${dealerId}
    order by created_at desc
    limit ${safeLimit}
  `);
  return rows.rows as DealerInquiry[];
}

export async function markDealerInquiryResponded(userId: string, inquiryId: string) {
  const owned = await db
    .select({ id: dealer.id })
    .from(dealer)
    .where(eq(dealer.userId, userId))
    .limit(1);
  const dealerId = owned[0]?.id;
  if (!dealerId) return null;

  const rows = await db.execute(sql`
    update dealer_inquiry
    set status = 'responded', first_response_at = coalesce(first_response_at, now())
    where id = ${inquiryId} and dealer_id = ${dealerId}
    returning id, status, first_response_at as "firstResponseAt"
  `);
  return rows.rows[0] ?? null;
}
