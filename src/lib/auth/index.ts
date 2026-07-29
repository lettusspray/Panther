import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db";
import { user, session, account } from "../db/schema";

// Runtime validation — fail loud if secret is missing
const authSecret = import.meta.env.BETTER_AUTH_SECRET;
if (!authSecret || authSecret === "generate-a-random-secret") {
  throw new Error(
    "BETTER_AUTH_SECRET is not set or is still the placeholder. " +
    "Generate a real secret: openssl rand -base64 32",
  );
}

const authUrl = import.meta.env.BETTER_AUTH_URL ?? "http://localhost:4321";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user,
      session,
      account,
    },
  }),
  baseURL: authUrl,
  trustedOrigins: [
    // Cloudflare Pages frontend — set to your production domain
    "http://localhost:4321",
    "https://*.panther.ng",
    "https://panther.ng",
  ],
  emailAndPassword: {
    enabled: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  user: {
    additionalFields: {
      phone: {
        type: "string",
        required: false,
        unique: true,
      },
      phoneVerified: {
        type: "date",
        required: false,
      },
      disclosureTier: {
        type: "string",
        required: false,
        defaultValue: "none",
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
