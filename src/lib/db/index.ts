/**
 * Database connection — Cloudflare Hyperdrive in production, direct Neon in dev.
 *
 * Constitution §X.2: "No Cloudflare Worker is allowed to connect directly
 * to Neon using a standard pg connection string. All DB traffic must be
 * routed through Cloudflare Hyperdrive."
 *
 * HYPERDRIVE_CONNECTION_STRING is injected by Cloudflare at runtime when
 * the Worker is bound to a Hyperdrive instance. In local dev, we fall
 * back to DATABASE_URL (direct Neon connection).
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const connectionString =
  import.meta.env.HYPERDRIVE_CONNECTION_STRING ||
  import.meta.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "No database connection string available. " +
    "Set HYPERDRIVE_CONNECTION_STRING (production) or DATABASE_URL (dev).",
  );
}

const sql = neon(connectionString);

export const db = drizzle(sql, { schema });

export type Database = typeof db;
