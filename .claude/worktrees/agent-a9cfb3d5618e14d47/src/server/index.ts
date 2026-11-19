import "dotenv/config";
import { createApp } from "./app.js";
import { logger } from "./lib/logger.js";
import { pgNotifyListener } from "./lib/pgNotifyListener.js";
import { shutdownScheduler } from "./services/jobScheduler.js";
import {
  initializeInactivityMonitoring,
  shutdownInactivityMonitoring,
} from "./services/inactivityService.js";
import {
  startAISessionJobs,
  stopAISessionJobs,
} from "./jobs/aiSpecSessionJobs.js";
import {
  startAutoScopeAnalysisJob,
  stopAutoScopeAnalysisJob,
} from "./jobs/autoScopeAnalysisJobs.js"; // [SCOPE 077 / T001]
import {
  startInfraHealthJob,
  stopInfraHealthJob,
} from "./jobs/infraHealthJob.js"; // [SCOPE 078 / T006]
import {
  startSubscriptionArchivalJob,
  stopSubscriptionArchivalJob,
} from "./jobs/subscriptionArchivalJob.js"; // [SCOPE 132 / T004]
import { config } from "./config.js";
import { ErrorCaptureService } from "./services/ErrorCaptureService.js"; // [SCOPE 061]

const app = createApp();

// [SCOPE 061] Process-level capture. uncaughtException is unrecoverable → capture
// then exit(1) (preserves crash). unhandledRejection is captured but NOT fatal —
// a stray rejection shouldn't take down a serving web process. Both fail-open.
process.on("uncaughtException", (err: Error) => {
  logger.error({ err }, "uncaughtException");
  void ErrorCaptureService.capture({
    source: "server",
    kind: "uncaughtException",
    name: err.name || "Error",
    message: err.message,
    stack: err.stack,
  });
  setTimeout(() => process.exit(1), 500);
});
process.on("unhandledRejection", (reason: unknown) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  logger.error({ err }, "unhandledRejection");
  void ErrorCaptureService.capture({
    source: "server",
    kind: "unhandledRejectionServer",
    name: err.name || "Error",
    message: err.message,
    stack: err.stack,
  });
});

const startServer = (): void => {
  const port = config.PORT;
  const server = app.listen(port, () => {
    logger.info({ port }, "Express server started");
    pgNotifyListener.connect().catch((err: Error) => {
      logger.error({ err }, "pg_notify listener failed to start");
    });
  });

  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      logger.error({ port }, `Port ${port} already in use. Kill the existing process and restart.`);
      process.exit(1);
    } else {
      throw error;
    }
  });

  initializeInactivityMonitoring();
  startAISessionJobs();
  startAutoScopeAnalysisJob(); // [SCOPE 077 / T001] no-op unless AUTO_SCOPE_ANALYSIS_ENABLED=true
  startInfraHealthJob(); // [SCOPE 078 / T006] no-op unless INFRA_HEALTH_ENABLED=true
  // [SCOPE 132 / T004] Archives nothing unless SUBSCRIPTION_ARCHIVAL_ENABLED=on. Unlike the
  // jobs above it logs a line on EVERY boot, including when disabled — SPEC-132 FR-009.
  startSubscriptionArchivalJob();

  process.on("SIGTERM", async () => {
    await pgNotifyListener.shutdown();
    shutdownScheduler();
    shutdownInactivityMonitoring();
    stopAISessionJobs();
    stopAutoScopeAnalysisJob();
    stopInfraHealthJob(); // [SCOPE 078 / T006]
    stopSubscriptionArchivalJob(); // [SCOPE 132 / T004]
    server.close(() => process.exit(0));
  });

  process.on("SIGINT", async () => {
    await pgNotifyListener.shutdown();
    shutdownScheduler();
    shutdownInactivityMonitoring();
    stopAISessionJobs();
    stopAutoScopeAnalysisJob();
    stopInfraHealthJob(); // [SCOPE 078 / T006]
    stopSubscriptionArchivalJob(); // [SCOPE 132 / T004]
    server.close(() => process.exit(0));
  });
};

startServer();

export default app;
