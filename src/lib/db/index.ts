/**
 * Database connection — Cloudflare Hyperdrive in production, direct Neon in dev.
 *
 * Constitution §X.2: "No Cloudflare Worker is allowed to connect directly
 * to Neon using a standard pg connection string. All DB traffic must be
 * routed through Cloudflare Hyperdrive."
 *
 * The client is created lazily on first use so this module can load in both
 * the Astro app (import.meta.env) and the standalone pipeline Worker (which
 * hydrates worker bindings into readEnv before any query runs).
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";
import { readEnv } from "../env";

function resolveConnectionString(): string | undefined {
  return readEnv("HYPERDRIVE_CONNECTION_STRING") || readEnv("DATABASE_URL");
}

function makeDb() {
  const connectionString = resolveConnectionString();
  if (!connectionString) {
    throw new Error(
      "No database connection string available. " +
      "Set HYPERDRIVE_CONNECTION_STRING (production) or DATABASE_URL (dev).",
    );
  }
  return drizzle(neon(connectionString), { schema });
}

export type Database = ReturnType<typeof makeDb>;

let _db: Database | null = null;

function getDb(): Database {
  if (_db) return _db;
  _db = makeDb();
  return _db;
}

export const db = new Proxy({} as Database, {
  get(_target, prop) {
    const client = getDb();
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === "function" ? value.bind(client) : value;
  },
});
