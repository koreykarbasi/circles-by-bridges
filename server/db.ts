import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

const connectionString = process.env.SUPABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL must be set");
}

const isExternalDb = connectionString.includes("supabase.com") ||
  connectionString.includes("neon.tech") ||
  connectionString.includes("sslmode=require");

export const pool = new Pool({
  connectionString,
  ...(isExternalDb ? { ssl: { rejectUnauthorized: false } } : {}),
  // Supabase's session pool is capped at 15 clients. Autoscale may briefly
  // run several server instances during cold starts, so the pg default of
  // 10 clients per instance can exhaust the shared pool and make ordinary
  // API requests and notification jobs fail.
  max: isExternalDb ? 3 : 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});
export const db = drizzle(pool, { schema });
