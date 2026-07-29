/**
 * Payment Provider Interface
 *
 * Constitution §X.4: "Third-party rails are dumb pipes for fiat movement;
 * the Switchboard state machine must live entirely in our proprietary
 * Neon Postgres ledger."
 *
 * This interface abstracts the PSP so we can swap providers without
 * touching the Switchboard state machine. The state machine calls
 * these methods; it does NOT contain PSP logic.
 */

// ── Transaction Initialization ──────────────────────────────────────

export interface InitializeTransactionParams {
  /** Switchboard transaction ID — stored as PSP metadata for webhook binding */
  switchboardTxId: string;
  /** Amount in the smallest currency unit (kobo for NGN) */
  amountKobo: number;
  /** ISO 4217 currency code */
  currency: "NGN";
  /** Buyer's email (from Better-Auth user record) */
  email: string;
  /** PSP reference we generate — deterministic for idempotency */
  reference: string;
  /** Redirect URL after payment (Paystack-hosted checkout) */
  callbackUrl: string;
}

export interface InitializeTransactionResult {
  /** PSP's authorization URL — buyer redirects here to pay */
  authorizationUrl: string;
  /** The access_code for Paystack SDK (if using inline) */
  accessCode: string;
  /** Our reference — echoed back for verification */
  reference: string;
}

// ── Transaction Verification ────────────────────────────────────────

export interface VerifyTransactionResult {
  /** Whether the transaction was successfully completed */
  status: "success" | "failed" | "abandoned";
  /** Amount in kobo */
  amountKobo: number;
  /** Currency */
  currency: string;
  /** Our reference */
  reference: string;
  /** PSP's internal ID */
  providerId: string;
  /** Customer email */
  email: string;
  /** Metadata we sent during initialization */
  metadata: Record<string, unknown>;
}

// ── Transfer / Disbursement ─────────────────────────────────────────

export interface CreateTransferRecipientParams {
  /** Seller's bank code (e.g., "044" for Access Bank) */
  bankCode: string;
  /** Seller's account number */
  accountNumber: string;
  /** Seller's full name (for verification) */
  name: string;
}

export interface CreateTransferRecipientResult {
  /** Paystack transfer recipient code (e.g., "RCP_xxxx") */
  recipientCode: string;
  /** Whether the account details were verified by Paystack */
  verified: boolean;
}

export interface InitiateTransferParams {
  /** Paystack transfer recipient code */
  recipientCode: string;
  /** Amount in kobo */
  amountKobo: number;
  /** Our reference for this transfer */
  reference: string;
  /** Reason for transfer (for audit trail) */
  reason: string;
}

export interface InitiateTransferResult {
  /** Whether the transfer was accepted for processing */
  status: "pending" | "failed";
  /** Paystack's transfer ID */
  transferId: number;
  /** Our reference */
  reference: string;
  /** Transfer fee in kobo (Paystack's ₦10/₦25/₦50 + stamp duty) */
  feeKobo: number;
}

// ── Transfer Verification ───────────────────────────────────────────

export interface VerifyTransferResult {
  /** Current transfer status */
  status: "pending" | "success" | "failed" | "reversed";
  /** Paystack's transfer ID */
  transferId: number;
  /** Our reference */
  reference: string;
  /** Amount in kobo */
  amountKobo: number;
}

// ── Webhook Signature Verification ──────────────────────────────────

export interface WebhookVerification {
  /** Whether the signature is valid */
  valid: boolean;
  /** The parsed event (only valid if valid=true) */
  event?: WebhookEvent;
}

// ── Normalized Webhook Events ───────────────────────────────────────
// PSP-specific event types are mapped to these normalized types.
// The Switchboard state machine only cares about these.

export type WebhookEventType =
  | "transaction.success"
  | "transaction.failed"
  | "transfer.success"
  | "transfer.failed"
  | "transfer.reversed";

export interface WebhookEvent {
  /** Normalized event type */
  type: WebhookEventType;
  /** Our reference (switchboard transaction ID or transfer reference) */
  reference: string;
  /** PSP's internal ID */
  providerId: string;
  /** Amount in kobo */
  amountKobo: number;
  /** Raw event type from PSP (for logging) */
  rawEventType: string;
  /** Full raw payload (stored in providerMetadata for audit) */
  rawPayload: Record<string, unknown>;
}

// ── Provider Interface ──────────────────────────────────────────────

export interface PaymentProvider {
  /** Provider name (for logging and config) */
  readonly name: string;

  /** Initialize a collection transaction (buyer pays) */
  initializeTransaction(
    params: InitializeTransactionParams,
  ): Promise<InitializeTransactionResult>;

  /** Verify a transaction by reference */
  verifyTransaction(
    reference: string,
  ): Promise<VerifyTransactionResult>;

  /** Create a transfer recipient for a seller's bank account */
  createTransferRecipient(
    params: CreateTransferRecipientParams,
  ): Promise<CreateTransferRecipientResult>;

  /** Initiate a transfer (disburse funds to seller) */
  initiateTransfer(
    params: InitiateTransferParams,
  ): Promise<InitiateTransferResult>;

  /** Verify a transfer status */
  verifyTransfer(
    reference: string,
  ): Promise<VerifyTransferResult>;

  /** Verify webhook signature against raw body */
  verifyWebhookSignature(
    rawBody: string,
    signature: string,
  ): boolean;

  /** Parse and normalize a webhook event from raw body */
  parseWebhookEvent(
    rawBody: string,
  ): WebhookEvent | null;
}
