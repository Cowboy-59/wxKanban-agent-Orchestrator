#!/usr/bin/env tsx
/**
 * Reports WHICH database-credential environment keys are set, and nothing about their values.
 * Written as a script so no secret material can reach a transcript.
 */
import { config } from "dotenv";

config();

const KEYS = [
  "DATABASE_URL",
  "ADMIN_DATABASE_URL",
  "DATABASE_ADMIN_URL",
  "MIGRATION_DATABASE_URL",
  "DATABASE_OWNER_URL",
  "DIRECT_DATABASE_URL",
  "PGUSER",
  "PGPASSWORD",
  "PGHOST",
];

for (const k of KEYS) {
  const v = process.env[k];
  console.log(`${k.padEnd(24)} ${v ? "SET" : "-"}`);
}

// For DATABASE_URL only, report the ROLE it names — not the host, not the password.
const url = process.env.DATABASE_URL;
if (url) {
  try {
    console.log(`\nDATABASE_URL names role: ${new URL(url).username || "(none)"}`);
  } catch {
    console.log("\nDATABASE_URL is not a parseable URL");
  }
}
