import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "../db";
import {
  listing,
  order,
  orderItem,
  orderPayment,
  orderSettlement,
  ledgerEntry,
  systemConfig,
  user,
} from "../db/schema";
import { calculatePlatformFee } from "../trust/switchboard";
import { createNowPayment, getNowPaymentCurrencies } from "../payments/nowpayments";
import { getPaymentProvider } from "../payments";

const ORDER_PAYMENT_TTL_MS = 30 * 60 * 1000;
const ACTIVE_ORDER_STATUSES = [
  "pending_payment",
  "paid",
  "verification",
  "ready_for_settlement",
  "partially_settled",
  "settled",
  "disputed",
] as const;

export type OrderPaymentMethod = "paystack" | "nowpayments";

export async function createMarketplaceOrder(params: {
  buyerId: string;
  buyerEmail: string;
  listingIds: string[];
  paymentMethod: OrderPaymentMethod;
  payCurrency?: string;
  idempotencyKey: string;
  callbackBaseUrl: string;
}) {
  const listingIds = [...new Set(params.listingIds.filter(Boolean))];
  if (listingIds.length === 0 || listingIds.length > 100) {
    throw new Error("An order must contain between 1 and 100 vehicles.");
  }

  const existing = await db.select().from(order).where(eq(order.idempotencyKey, params.idempotencyKey)).limit(1);
  if (existing[0]) return { order: existing[0], reused: true };

  const result = await db.transaction(async (tx) => {
    const rows = await tx.select().from(listing).where(inArray(listing.id, listingIds));
    if (rows.length !== listingIds.length) throw new Error("One or more listings could not be found.");

    const byId = new Map(rows.map((row) => [row.id, row]));
    const ordered = listingIds.map((id) => byId.get(id)!);

    // Serialize competing checkouts for each listing without holding a DB row lock across a PSP call.
    for (const row of ordered) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${row.id}))`);
      const [conflict] = await tx
        .select({ id: orderItem.id, status: order.status, expiresAt: order.expiresAt })
        .from(orderItem)
        .innerJoin(order, eq(order.id, orderItem.orderId))
        .where(and(eq(orderItem.listingId, row.id), inArray(order.status, [...ACTIVE_ORDER_STATUSES])))
        .limit(1);
      if (conflict && !(conflict.status === "pending_payment" && conflict.expiresAt < new Date())) {
        throw new Error(`Vehicle ${row.id} is already reserved in another order.`);
      }
    }

    for (const row of ordered) {
      if (row.status !== "active") throw new Error(`Vehicle ${row.id} is no longer available.`);
      if (row.sellerId === params.buyerId) throw new Error("A buyer cannot purchase their own listing.");
      if (!row.askingPriceNgn || Number(row.askingPriceNgn) <= 0) {
        throw new Error(`Vehicle ${row.id} does not have a valid purchase price.`);
      }
    }

    let totalNgn = 0;
    let platformFeeNgn = 0;
    const items = ordered.map((row) => {
      const price = roundMoney(Number(row.askingPriceNgn));
      const fee = calculatePlatformFee(price);
      totalNgn += price;
      platformFeeNgn += fee;
      return {
        listing: row,
        price,
        fee,
        sellerReceivable: roundMoney(price - fee),
      };
    });

    let paymentCurrency = "NGN";
    let paymentAmount = totalNgn;
    let fxRate = 1;
    if (params.paymentMethod === "nowpayments") {
      const currency = "USD";
      const [fxRow] = await tx.select().from(systemConfig).where(eq(systemConfig.key, "usd_ngn_rate")).limit(1);
      fxRate = Number(fxRow?.value ?? 0);
      if (!Number.isFinite(fxRate) || fxRate <= 0) {
        throw new Error("Crypto checkout is temporarily unavailable: no current usd_ngn_rate is configured.");
      }
      paymentCurrency = currency;
      paymentAmount = roundMoney(totalNgn / fxRate);
      if (paymentAmount <= 0) throw new Error("Crypto checkout produced an invalid amount.");
      if (!params.payCurrency || !/^[a-z0-9._-]{2,32}$/i.test(params.payCurrency)) {
        throw new Error("A supported crypto payment currency is required.");
      }
    } else if (!params.buyerEmail) {
      throw new Error("A buyer email is required for Paystack checkout.");
    }

    const expiresAt = new Date(Date.now() + ORDER_PAYMENT_TTL_MS);
    const [created] = await tx
      .insert(order)
      .values({
        buyerId: params.buyerId,
        status: "pending_payment",
        paymentMethod: params.paymentMethod,
        totalNgn: totalNgn.toFixed(2),
        platformFeeNgn: platformFeeNgn.toFixed(2),
        paymentCurrency,
        paymentAmount: paymentAmount.toFixed(8),
        fxRateNgnPerUnit: fxRate.toFixed(8),
        idempotencyKey: params.idempotencyKey,
        expiresAt,
      })
      .returning();

    await tx.insert(orderItem).values(items.map((item) => ({
      orderId: created.id,
      listingId: item.listing.id,
      sellerId: item.listing.sellerId,
      agreedPriceNgn: item.price.toFixed(2),
      platformFeeNgn: item.fee.toFixed(2),
      sellerReceivableNgn: item.sellerReceivable.toFixed(2),
      listingSnapshot: {
        modelYear: item.listing.modelYear,
        mileageKm: item.listing.mileageKm,
        askingPriceNgn: item.listing.askingPriceNgn,
        customMake: item.listing.customMake,
        customModel: item.listing.customModel,
        customTrim: item.listing.customTrim,
      },
    })));

    const itemRows = await tx.select({ id: orderItem.id, sellerId: orderItem.sellerId, sellerReceivableNgn: orderItem.sellerReceivableNgn })
      .from(orderItem).where(eq(orderItem.orderId, created.id));
    await tx.insert(orderSettlement).values(itemRows.map((item) => ({
      orderId: created.id,
      orderItemId: item.id,
      sellerId: item.sellerId,
      amountNgn: item.sellerReceivableNgn,
      status: "pending" as const,
      method: "manual_fiat" as const,
    })));

    return created;
  });

  try {
    const paymentReference = `${result.paymentMethod === "paystack" ? "ptx" : "npx"}_${result.id}`;
    let paymentDetails: Record<string, unknown>;
    if (result.paymentMethod === "paystack") {
      const provider = getPaymentProvider();
      const checkout = await provider.initializeTransaction({
        orderId: result.id,
        amountKobo: Math.round(Number(result.totalNgn) * 100),
        currency: "NGN",
        email: params.buyerEmail,
        reference: paymentReference,
        callbackUrl: `${params.callbackBaseUrl}/dashboard?order=${result.id}`,
      });
      paymentDetails = { authorizationUrl: checkout.authorizationUrl, reference: checkout.reference };
    } else {
      const payment = await createNowPayment({
        priceAmount: Number(result.paymentAmount),
        priceCurrency: result.paymentCurrency,
        payCurrency: params.payCurrency!,
        orderId: result.id,
        orderDescription: `Panther vehicle order ${result.id}`,
        ipnCallbackUrl: `${params.callbackBaseUrl}/api/webhooks/nowpayments`,
        successUrl: `${params.callbackBaseUrl}/dashboard?order=${result.id}`,
        cancelUrl: `${params.callbackBaseUrl}/dashboard?order=${result.id}`,
      });
      paymentDetails = {
        providerPaymentId: String(payment.payment_id),
        payAddress: payment.pay_address,
        payAmount: payment.pay_amount,
        payCurrency: payment.pay_currency,
      };
    }

    const providerRef = paymentReference;
    await db.transaction(async (tx) => {
      await tx.insert(orderPayment).values({
        orderId: result.id,
        method: result.paymentMethod,
        status: "pending",
        providerRef,
        providerPaymentId: result.paymentMethod === "nowpayments" ? String(paymentDetails.providerPaymentId) : null,
        priceAmount: String(result.paymentAmount),
        priceCurrency: result.paymentCurrency,
        payAmount: paymentDetails.payAmount ? String(paymentDetails.payAmount) : null,
        payCurrency: paymentDetails.payCurrency ? String(paymentDetails.payCurrency) : null,
        expiresAt: result.expiresAt,
        providerMetadata: paymentDetails,
      });
    });

    return { order: result, payment: paymentDetails, providerRef, reused: false };
  } catch (error) {
    await db.update(order).set({ status: "cancelled", updatedAt: new Date() }).where(eq(order.id, result.id));
    throw error;
  }
}

export async function markOrderPaymentStatus(params: {
  paymentId: string;
  status: "pending" | "confirming" | "paid" | "partially_paid" | "failed" | "refunded" | "expired";
  metadata?: Record<string, unknown>;
  providerPaymentId?: string;
  payAmount?: number;
  payCurrency?: string;
  actuallyPaidAmount?: number;
  outcomeAmount?: number;
  outcomeCurrency?: string;
  externalReference?: string;
}) {
  return db.transaction(async (tx) => {
    const [payment] = await tx.select().from(orderPayment).where(eq(orderPayment.id, params.paymentId)).limit(1);
    if (!payment) return { ok: false as const, reason: "payment_not_found" };

    const updateValues: Record<string, unknown> = {
      status: params.status,
      updatedAt: new Date(),
      providerMetadata: params.metadata ?? payment.providerMetadata,
    };
    if (params.providerPaymentId) updateValues.providerPaymentId = params.providerPaymentId;
    if (params.payAmount !== undefined) updateValues.payAmount = String(params.payAmount);
    if (params.payCurrency) updateValues.payCurrency = params.payCurrency;
    if (params.actuallyPaidAmount !== undefined) updateValues.actuallyPaidAmount = String(params.actuallyPaidAmount);
    if (params.outcomeAmount !== undefined) updateValues.outcomeAmount = String(params.outcomeAmount);
    if (params.outcomeCurrency) updateValues.outcomeCurrency = params.outcomeCurrency;
    if (params.status === "paid") updateValues.paidAt = new Date();

    await tx.update(orderPayment).set(updateValues).where(eq(orderPayment.id, payment.id));

    if (params.status !== "paid") return { ok: true as const, orderId: payment.orderId };

    const [existingCollection] = await tx.select({ id: ledgerEntry.id }).from(ledgerEntry)
      .where(eq(ledgerEntry.idempotencyKey, `order:${payment.orderId}:collection`)).limit(1);
    if (existingCollection) return { ok: true as const, orderId: payment.orderId, alreadyApplied: true };

    const [ord] = await tx.select().from(order).where(eq(order.id, payment.orderId)).limit(1);
    if (!ord) return { ok: false as const, reason: "order_not_found" };

    // Collection is recorded in the provider billing currency; seller obligations stay in NGN.
    const receivedAmount = payment.outcomeAmount ?? payment.actuallyPaidAmount ?? payment.priceAmount;
    const receivedCurrency = payment.outcomeCurrency ?? payment.payCurrency ?? payment.priceCurrency;
    await tx.insert(ledgerEntry).values({
      orderId: ord.id,
      type: "collection",
      direction: "credit",
      currency: receivedCurrency,
      amount: receivedAmount,
      idempotencyKey: `order:${ord.id}:collection`,
      externalReference: params.externalReference ?? payment.providerPaymentId ?? payment.providerRef,
      metadata: { ...params.metadata, quotedAmount: payment.priceAmount, quotedCurrency: payment.priceCurrency },
    });
    await tx.insert(ledgerEntry).values({
      orderId: ord.id,
      type: "platform_fee",
      direction: "credit",
      currency: "NGN",
      amount: ord.platformFeeNgn,
      idempotencyKey: `order:${ord.id}:platform-fee`,
      externalReference: payment.providerRef,
    });

    const items = await tx.select().from(orderItem).where(eq(orderItem.orderId, ord.id));
    for (const item of items) {
      await tx.insert(ledgerEntry).values({
        orderId: ord.id,
        orderItemId: item.id,
        type: "seller_payable",
        direction: "credit",
        currency: "NGN",
        amount: item.sellerReceivableNgn,
        idempotencyKey: `order:${ord.id}:seller-payable:${item.id}`,
        externalReference: item.sellerId,
      });
    }
    await tx.update(listing)
      .set({ status: "reserved", updatedAt: new Date() })
      .where(inArray(listing.id, items.map((item) => item.listingId)));
    await tx.update(order).set({ status: "paid", paidAt: new Date(), updatedAt: new Date() }).where(eq(order.id, ord.id));
    return { ok: true as const, orderId: ord.id, alreadyApplied: false };
  });
}

export async function settleOrderItemManually(params: {
  settlementId: string;
  adminUserId: string;
  fiatReference: string;
  amountNgn: number;
  notes?: string;
}) {
  return db.transaction(async (tx) => {
    const [settlement] = await tx.select().from(orderSettlement).where(eq(orderSettlement.id, params.settlementId)).limit(1);
    if (!settlement) throw new Error("Settlement not found.");
    if (settlement.status === "settled") throw new Error("Settlement is already marked settled.");
    const expected = Number(settlement.amountNgn);
    if (Math.abs(params.amountNgn - expected) > 0.01) throw new Error("Settlement amount must exactly match the recorded seller receivable.");

    await tx.update(orderSettlement).set({
      status: "settled",
      method: "manual_fiat",
      manualFiatReference: params.fiatReference.trim(),
      manualSettledAt: new Date(),
      manualSettledBy: params.adminUserId,
      evidence: params.notes ? { notes: params.notes } : undefined,
      updatedAt: new Date(),
    }).where(eq(orderSettlement.id, settlement.id));

    await tx.insert(ledgerEntry).values({
      orderId: settlement.orderId,
      orderItemId: settlement.orderItemId,
      type: "manual_settlement",
      direction: "debit",
      currency: "NGN",
      amount: settlement.amountNgn,
      idempotencyKey: `settlement:${settlement.id}:manual-fiat`,
      externalReference: params.fiatReference.trim(),
      createdBy: params.adminUserId,
      metadata: { notes: params.notes ?? null },
    }).onConflictDoNothing({ target: ledgerEntry.idempotencyKey });

    const remaining = await tx.select({ status: orderSettlement.status }).from(orderSettlement).where(eq(orderSettlement.orderId, settlement.orderId));
    const nextStatus = remaining.every((row) => row.status === "settled") ? "settled" : "partially_settled";
    await tx.update(order).set({ status: nextStatus, updatedAt: new Date() }).where(eq(order.id, settlement.orderId));
    return { settlementId: settlement.id, orderId: settlement.orderId, status: nextStatus };
  });
}

export async function getPendingSettlementQueue(limit = 100) {
  return db
    .select({
      settlementId: orderSettlement.id,
      orderId: orderSettlement.orderId,
      orderItemId: orderSettlement.orderItemId,
      sellerId: orderSettlement.sellerId,
      amountNgn: orderSettlement.amountNgn,
      status: orderSettlement.status,
      method: orderSettlement.method,
      createdAt: orderSettlement.createdAt,
      buyerId: order.buyerId,
      orderStatus: order.status,
    })
    .from(orderSettlement)
    .innerJoin(order, eq(order.id, orderSettlement.orderId))
    .where(and(
      ne(orderSettlement.status, "settled"),
      inArray(order.status, ["paid", "verification", "ready_for_settlement", "partially_settled"]),
    ))
    .orderBy(orderSettlement.createdAt)
    .limit(limit);
}

export async function getOrderForBuyer(orderId: string, buyerId: string) {
  const [ord] = await db.select().from(order).where(and(eq(order.id, orderId), eq(order.buyerId, buyerId))).limit(1);
  if (!ord) return null;
  const [items, payments, settlements] = await Promise.all([
    db.select().from(orderItem).where(eq(orderItem.orderId, orderId)),
    db.select().from(orderPayment).where(eq(orderPayment.orderId, orderId)),
    db.select().from(orderSettlement).where(eq(orderSettlement.orderId, orderId)),
  ]);
  return { ...ord, items, payments, settlements };
}

export async function listCryptoCurrencies() {
  return getNowPaymentCurrencies();
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
