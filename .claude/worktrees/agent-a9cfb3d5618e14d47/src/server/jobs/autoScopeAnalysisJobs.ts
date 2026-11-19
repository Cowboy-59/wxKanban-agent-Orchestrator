// [SCOPE 077 / T001] BEGIN — background job: debounced sweep for automated scope analysis.
// Mirrors aiSpecSessionJobs (interval + start/stop). DEFAULT OFF — set
// AUTO_SCOPE_ANALYSIS_ENABLED=true to enable (gates per-change LLM cost in prod).
import { runAutoScopeAnalysisSweep } from "../services/AutoScopeAnalysisService.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("auto-scope-analysis-job");

const SWEEP_INTERVAL_MS = 90_000; // poll cadence; the service debounces per scope
const MAX_PER_SWEEP = 3; // bound LLM calls per cycle

let sweepInterval: NodeJS.Timeout | null = null;

function enabled(): boolean {
  return (process.env.AUTO_SCOPE_ANALYSIS_ENABLED ?? "false").toLowerCase() === "true";
}

export function startAutoScopeAnalysisJob(): void {
  if (sweepInterval) return; // already running
  if (!enabled()) {
    logger.info("Auto scope analysis job disabled (set AUTO_SCOPE_ANALYSIS_ENABLED=true to enable)");
    return;
  }
  logger.info("Starting auto scope analysis background job");
  sweepInterval = setInterval(async () => {
    try {
      await runAutoScopeAnalysisSweep(MAX_PER_SWEEP);
    } catch (err) {
      logger.error({ error: err instanceof Error ? err.message : "Unknown error" }, "Auto scope analysis sweep failed");
    }
  }, SWEEP_INTERVAL_MS);
}

export function stopAutoScopeAnalysisJob(): void {
  if (sweepInterval) {
    clearInterval(sweepInterval);
    sweepInterval = null;
    logger.info("Stopped auto scope analysis background job");
  }
}
// [SCOPE 077 / T001] END
