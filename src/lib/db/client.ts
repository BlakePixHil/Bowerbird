import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import * as schema from "./schema";

/** Any Drizzle Postgres database with our schema: node-postgres in the app, PGlite in tests. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

let cached: { pool: Pool; db: Db } | undefined;

/**
 * The shared database client. It uses node-postgres over TCP, which Neon recommends for Vercel
 * functions, and works the same against a local Postgres. It connects on first use, so importing
 * this file never needs DATABASE_URL.
 */
export function getDb(): Db {
  if (!cached) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    const pool = new Pool({ connectionString, max: 5, idleTimeoutMillis: 10_000 });
    // On Vercel, close idle connections before the function is suspended. A no-op elsewhere.
    if (process.env.VERCEL) attachDatabasePool(pool);
    cached = { pool, db: drizzle(pool, { schema, casing: "snake_case" }) };
  }
  return cached.db;
}

/** Close the pool. Scripts and tests call this so they can exit. */
export async function closeDb(): Promise<void> {
  if (cached) {
    await cached.pool.end();
    cached = undefined;
  }
}
