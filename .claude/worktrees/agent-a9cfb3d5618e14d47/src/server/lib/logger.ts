import pino from "pino";

const logLevel = process.env.LOG_LEVEL || "info";

// Determine if we should attempt to use pino-pretty
// Skip during migrations, production, and tests
const isMigration = process.argv.some(
  (arg) => arg.includes("migrate") || arg.includes("validation"),
);
const isProduction = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";

export let logger: ReturnType<typeof pino>;

if (!isMigration && !isProduction && !isTest) {
  // Development mode: try to use pino-pretty
  try {
    logger = pino({
      level: logLevel,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
          singleLine: false,
          messageFormat: "{levelLabel} [{name}] {msg}",
        },
      },
    });
  } catch {
    // Fallback to basic pino if pino-pretty not available
    logger = pino({ level: logLevel });
  }
} else {
  // Migration, production, or test: use basic pino (no pretty-print)
  logger = pino({ level: logLevel });
}

// Create namespaced loggers for different modules
export const createLogger = (namespace: string) => {
  return logger.child({ module: namespace });
};
