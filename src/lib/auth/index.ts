import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db";
import { user, session, account } from "../db/schema";
import { readEnv } from "../env";

// The auth instance is created lazily so a missing/misconfigured
// BETTER_AUTH_SECRET can never take down the whole site (the middleware
// imports this module on every request). The secret guard fires only when
// auth is actually used — session checks and the auth API handler.
function createAuth() {
  const authSecret = readEnv("BETTER_AUTH_SECRET");
  if (!authSecret || authSecret === "generate-a-random-secret") {
    throw new Error(
      "BETTER_AUTH_SECRET is not set or is still the placeholder. " +
      "Generate a real secret: openssl rand -base64 32",
    );
  }

  const authUrl = readEnv("BETTER_AUTH_URL") ?? "http://localhost:4321";

  return betterAuth({
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
}

export type Auth = ReturnType<typeof createAuth>;

let _auth: Auth | null = null;

function getAuth(): Auth {
  if (_auth) return _auth;
  _auth = createAuth();
  return _auth;
}

export const auth = new Proxy({} as Auth, {
  get(_target, prop) {
    const instance = getAuth();
    const value = (instance as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export type Session = typeof auth.$Infer.Session;
