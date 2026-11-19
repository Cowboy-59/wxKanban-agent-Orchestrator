import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/index.js";
import { logger } from "../server/lib/logger.js";

// Load environment variables from .env file (must be first)
config();

// Validate required environment variables
const requiredEnvVars = [
  "DATABASE_URL",
  "JWT_SECRET",
  "ENCRYPTION_KEY",
] as const;
const missingEnvVars = requiredEnvVars.filter((v) => !process.env[v]);

if (missingEnvVars.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingEnvVars.join(", ")}. ` +
      `Please ensure your .env file is properly configured.`,
  );
}

// Strip sslmode from connection string — pg 8.12+ treats sslmode=require as verify-full,
// overriding ssl pool options. We handle SSL via the pool config instead.
const dbUrl = process.env.DATABASE_URL!.replace(/([?&])sslmode=[^&]*/g, "$1").replace(/[?&]$/, "");

// Create PostgreSQL connection pool.
//
// `rejectUnauthorized: false` is deliberate and load-bearing. RDS presents a
// chain rooted at the self-signed "Amazon RDS <region> Root CA", which is not
// in Node's default trust store, and DATABASE_URL reaches it through the
// pgkanban.wxperts.com CNAME rather than the certificate's own hostname.
// Strict verification therefore cannot succeed here without pinning the RDS CA
// bundle AND connecting via the RDS endpoint. Do not "harden" this to `true`
// without doing both — that is exactly what took the timer, billing, invoice,
// notes and verification paths down until 2026-08-27.
const pool = new Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

// A pg Pool emits 'error' for faults on IDLE clients. With no listener attached
// Node treats it as an unhandled 'error' event and terminates the process, so
// a single dropped backend connection would take the whole service down.
pool.on("error", (err) => {
  logger.error({ err }, "Unexpected error on idle database client");
});

// Initialize Drizzle ORM
export const db = drizzle(pool, { schema });

// Export pool for direct queries if needed
export { pool };
