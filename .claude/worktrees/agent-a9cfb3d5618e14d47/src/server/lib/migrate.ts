import { createLogger } from "./logger.js";
import postgres from "postgres";
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

config();

const logger = createLogger("migrate");

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigrations() {
  try {
    logger.info("Running database migrations...");

    let databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL environment variable is not set");
    }

    // The postgres.js driver doesn't accept the 'schema' parameter in the URL
    // So we need to remove it
    const url = new URL(databaseUrl);
    url.searchParams.delete("schema");
    databaseUrl = url.toString();

    const sql = postgres(databaseUrl);

    // Get all migration files
    const migrationsDir = join(__dirname, "../../../src/db/migrations");
    const migrationFiles = readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    if (migrationFiles.length === 0) {
      logger.info("No migration files found");
      await sql.end();
      process.exit(0);
    }

    // Execute each migration file
    for (const file of migrationFiles) {
      const filePath = join(migrationsDir, file);
      logger.info(`Executing migration: ${file}`);

      const sqlContent = readFileSync(filePath, "utf-8");

      try {
        // Split by semicolon to handle multiple SQL statements
        const statements = sqlContent
          .split(";")
          .map((stmt) => stmt.trim())
          .filter((stmt) => stmt.length > 0);

        for (const statement of statements) {
          await sql.unsafe(statement);
        }

        logger.info(`Completed migration: ${file}`);
      } catch (error) {
        logger.error({ error }, `Failed to execute migration: ${file}`);
        throw error;
      }
    }

    await sql.end();
    logger.info("Database migrations completed successfully");
    process.exit(0);
  } catch (error) {
    logger.error({ error }, "Migration failed");
    process.exit(1);
  }
}

runMigrations();
