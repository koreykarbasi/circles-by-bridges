import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Logger } from "drizzle-orm/logger";

/**
 * A disposable cluster, never an environment-provided database. PostgreSQL's
 * initdb and pg_ctl must be on PATH; missing binaries fail rather than skip.
 * A private Unix socket and disabled TCP keep parallel runs isolated.
 */
export async function isolatedPostgres(logger?: Logger) {
  const root = mkdtempSync(join(tmpdir(), "circle-moves-pg-"));
  const data = join(root, "data");
  let started = false;
  let pool: Pool | undefined;
  try {
    execFileSync("initdb", [
      "-D", data, "-U", "fixture", "--auth=trust", "--no-locale", "--encoding=UTF8",
    ], { stdio: "pipe", timeout: 30_000 });
    execFileSync("pg_ctl", [
      "-D", data, "-l", join(root, "postgres.log"),
      "-o", `-F -k ${root} -c listen_addresses=''`,
      "-w", "-t", "15", "start",
    ], { stdio: "pipe", timeout: 20_000 });
    started = true;
    pool = new Pool({
      host: root,
      port: 5432,
      user: "fixture",
      database: "postgres",
      password: "",
      ssl: false,
      connectionTimeoutMillis: 5_000,
      max: 3,
    });
    await pool.query("SELECT 1");
    const fixturePool = pool;
    return {
      pool: fixturePool,
      db: drizzle(fixturePool, { logger }),
      async close() {
        try {
          await fixturePool.end();
        } finally {
          execFileSync("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"], {
            stdio: "pipe", timeout: 20_000,
          });
          rmSync(root, { recursive: true, force: true });
        }
      },
    };
  } catch (error) {
    await pool?.end();
    if (started) {
      execFileSync("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"], {
        stdio: "pipe", timeout: 20_000,
      });
    }
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}
