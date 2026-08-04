/**
 * Database connection — Cloudflare Hyperdrive in production, direct Neon in dev.
 *
 * Constitution §X.2: "No Cloudflare Worker is allowed to connect directly
 * to Neon using a standard pg connection string. All DB traffic must be
 * routed through Cloudflare Hyperdrive."
 *
 * One client, driver chosen by what the connection string can serve:
 *  - Hyperdrive (production Worker): HYPERDRIVE_CONNECTION_STRING is the
 *    internal `<id>.hyperdrive.local` proxy. It speaks the Postgres wire
 *    protocol over TCP only — the Neon HTTP/WebSocket drivers cannot traverse
 *    it. Use the node-postgres `Pool` with `drizzle-orm/node-postgres`,
 *    which is the driver pairing Cloudflare documents for Drizzle + Hyperdrive.
 *  - No Hyperdrive (astro dev, scripts, tests): query Neon directly over
 *    HTTPS with the `neon()` client + `drizzle-orm/neon-http`.
 *
 * The client is created lazily on first use so this module can load in both
 * the Astro app (import.meta.env) and the standalone pipeline Worker (which
 * hydrates worker bindings into readEnv before any query runs).
 */

import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import { Pool } from "pg";
import { drizzle as drizzlePostgres, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { readEnv } from "../env";

function makeDb() {
  const hyperdriveString = readEnv("HYPERDRIVE_CONNECTION_STRING");
  if (hyperdriveString) {
    const pool = new Pool({
      connectionString: hyperdriveString,
      max: 5,
      idleTimeoutMillis: 0,
    });
    return drizzlePostgres(pool, { schema }) as Database;
  }
  const connectionString = readEnv("DATABASE_URL");
  if (!connectionString) {
    throw new Error(
      "No database connection string available. " +
      "Set HYPERDRIVE_CONNECTION_STRING (production Worker) or DATABASE_URL (dev).",
    );
  }
  return drizzleHttp(neon(connectionString), { schema }) as unknown as Database;
}

export type Database = NodePgDatabase<typeof schema>;

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