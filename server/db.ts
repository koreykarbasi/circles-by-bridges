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
});
export const db = drizzle(pool, { schema });
