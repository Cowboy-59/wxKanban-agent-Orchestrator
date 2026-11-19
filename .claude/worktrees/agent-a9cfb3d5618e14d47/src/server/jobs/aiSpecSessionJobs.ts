/**
 * Background jobs for AI spec sessions (FR-005, T017 + T018).
 *
 * T017 — auto-close: every 60s, find active sessions whose linked spec tasks
 *        are all status='completed' and close them with summary generation.
 * T018 — timeout sweep: hourly, find active sessions older than 30 days and
 *        force-close with status='timeout'.
 *
 * Plus T014 — outbound PM sync: every 5 min, drain pending tasksyncrecords.
 */

import { AISpecSessionService } from "../services/AISpecSessionService.js";
import { runOutboundSync } from "../services/pmSyncService.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("ai-spec-session-jobs");

const AUTO_CLOSE_INTERVAL_MS = 60 * 1000; // 60s
const TIMEOUT_SWEEP_INTERVAL_MS = 60 * 60 * 1000; // 1h
const OUTBOUND_SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5min

let autoCloseInterval: NodeJS.Timeout | null = null;
let timeoutInterval: NodeJS.Timeout | null = null;
let outboundInterval: NodeJS.Timeout | null = null;

export function startAISessionJobs(): void {
  if (autoCloseInterval || timeoutInterval || outboundInterval) {
    return; // already running
  }

  logger.info("Starting AI spec session background jobs");

  autoCloseInterval = setInterval(async () => {
    try {
      await AISpecSessionService.runAutoClose();
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : "Unknown error" },
        "Auto-close job failed",
      );
    }
  }, AUTO_CLOSE_INTERVAL_MS);

  timeoutInterval = setInterval(async () => {
    try {
      await AISpecSessionService.runTimeoutSweep();
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : "Unknown error" },
        "Timeout sweep job failed",
      );
    }
  }, TIMEOUT_SWEEP_INTERVAL_MS);

  outboundInterval = setInterval(async () => {
    try {
      await runOutboundSync();
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : "Unknown error" },
        "Outbound PM sync job failed",
      );
    }
  }, OUTBOUND_SYNC_INTERVAL_MS);
}

export function stopAISessionJobs(): void {
  if (autoCloseInterval) {
    clearInterval(autoCloseInterval);
    autoCloseInterval = null;
  }
  if (timeoutInterval) {
    clearInterval(timeoutInterval);
    timeoutInterval = null;
  }
  if (outboundInterval) {
    clearInterval(outboundInterval);
    outboundInterval = null;
  }
  logger.info("Stopped AI spec session background jobs");
}
