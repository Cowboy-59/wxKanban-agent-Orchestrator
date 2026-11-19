// Load environment variables FIRST before any config validation
import { config as dotenvConfig } from "dotenv";
dotenvConfig();

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "../config.js";

// Remove schema parameter from DATABASE_URL for postgres-js
// The schema parameter is not recognized by postgres-js
let connectionUrl = config.DATABASE_URL;
const urlObj = new URL(connectionUrl);
urlObj.searchParams.delete("schema");
connectionUrl = urlObj.toString();

// Create PostgreSQL client.
// prepare: false is required when connecting through Supabase's transaction
// pooler (port 6543) — it multiplexes connections and does not support
// prepared statements. Harmless on direct / session-pooler connections too.
const client = postgres(connectionUrl, { prepare: false });

// Create Drizzle instance
export const db = drizzle(client);

export { client };
