/**
 * Payment Provider Registry
 *
 * Constitution §X.4: "Third-party rails are dumb pipes for fiat movement."
 *
 * Selects the active payment provider based on PAYMENT_PROVIDER env var.
 * Currently supports: paystack (primary).
 * Flutterwave adapter planned as fallback.
 */

import type { PaymentProvider } from "./types";

let cachedProvider: PaymentProvider | null = null;

export function getPaymentProvider(): PaymentProvider {
  if (cachedProvider) return cachedProvider;

  const providerName = import.meta.env.PAYMENT_PROVIDER ?? "paystack";

  switch (providerName) {
    case "paystack": {
      // Lazy import to avoid loading Paystack code if not needed
      const { PaystackProvider } = require("./paystack");
      cachedProvider = new PaystackProvider();
      break;
    }
    // Flutterwave adapter — planned, not yet implemented
    // case "flutterwave": {
    //   const { FlutterwaveProvider } = require("./flutterwave");
    //   cachedProvider = new FlutterwaveProvider();
    //   break;
    // }
    default:
      throw new Error(
        `Unknown payment provider: "${providerName}". ` +
          `Set PAYMENT_PROVIDER to "paystack".`,
      );
  }

  return cachedProvider;
}
