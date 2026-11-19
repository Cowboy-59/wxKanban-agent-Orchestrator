import { z } from "zod";
import { logger } from "./lib/logger.js";

// Environment variable validation schema
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.string().default("3001").transform(Number),
  DATABASE_URL: z.string().url("Invalid DATABASE_URL"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  ENCRYPTION_KEY: z
    .string()
    .min(32, "ENCRYPTION_KEY must be at least 32 characters"),
  CLIENT_URL: z.string().url().default("http://localhost:5173"),
  JIRA_CLIENT_ID: z.string().optional(),
  JIRA_CLIENT_SECRET: z.string().optional(),
  MONDAY_CLIENT_ID: z.string().optional(),
  MONDAY_CLIENT_SECRET: z.string().optional(),
  ASANA_CLIENT_ID: z.string().optional(),
  ASANA_CLIENT_SECRET: z.string().optional(),
  TRELLO_API_KEY: z.string().optional(),
  TRELLO_API_SECRET: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  SENDGRID_API_KEY: z.string().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

type Config = z.infer<typeof envSchema>;

let config: Config;

try {
  config = envSchema.parse(process.env);
  logger.info({ env: config.NODE_ENV }, "Configuration loaded successfully");
} catch (error) {
  if (error instanceof z.ZodError) {
    const missingVars = error.issues.map((e) => e.path.join(".")).join(", ");
    logger.error(
      { errors: error.issues },
      `Missing or invalid environment variables: ${missingVars}`,
    );
  }
  process.exit(1);
}

export { config };
