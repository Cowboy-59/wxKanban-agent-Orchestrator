import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

config();

// Strip SSL-related query params so drizzle-kit does not inherit sslmode=require
// (which newer pg versions treat as verify-full and reject self-signed certs).
// SSL behavior is set explicitly below, matching src/server/lib/db.ts.
function getCleanConnectionString(): string {
  const url = process.env.DATABASE_URL || "";
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("sslmode");
    parsed.searchParams.delete("ssl");
    return parsed.toString();
  } catch {
    return url;
  }
}

const isProduction = process.env.NODE_ENV === "production";

export default defineConfig({
  schema: "./src/db/schema/*.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: getCleanConnectionString(),
    ssl: isProduction
      ? { rejectUnauthorized: true }
      : { rejectUnauthorized: false },
  },
  verbose: true,
  strict: true,
});
