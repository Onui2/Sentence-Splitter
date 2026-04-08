import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

function missingDatabaseUrl(): never {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

// NOTE:
// We allow the server to boot without DATABASE_URL so auth-only flows
// (brand/branch lookup + external login) can work on deployments that don't
// provision a DB. Any DB-backed route will throw a clear error when accessed.
export const pool: any = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : new Proxy(
      {},
      {
        get() {
          return missingDatabaseUrl();
        },
      },
    );

export const db: any = process.env.DATABASE_URL
  ? drizzle(pool, { schema })
  : new Proxy(
      {},
      {
        get() {
          return missingDatabaseUrl();
        },
      },
    );
