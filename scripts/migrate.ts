/**
 * Apply every migration in ./drizzle to DATABASE_URL. Run with `pnpm db:migrate`.
 * Vercel runs it before every build (`vercel-build`), so production and previews stay in step
 * with the code. `--if-configured` skips quietly when there's no database yet.
 */
import { loadEnvConfig } from "@next/env";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

loadEnvConfig(process.cwd());

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    if (process.argv.includes("--if-configured")) {
      console.log("No DATABASE_URL, so no migrations to run.");
      return;
    }
    throw new Error("DATABASE_URL is not set");
  }
  const pool = new Pool({ connectionString, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
    console.log("Migrations applied.");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
