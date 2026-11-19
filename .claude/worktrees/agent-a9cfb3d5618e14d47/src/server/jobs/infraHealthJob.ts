// [SCOPE 078 / T006] BEGIN — background job: periodic Infrastructure Health Monitor sweep.
// Mirrors autoScopeAnalysisJobs (interval + start/stop, env-gated). DEFAULT OFF — set
// INFRA_HEALTH_ENABLED=true to enable (so dev/local doesn't make AWS calls without intent; the
// deploy sets it true once the App Runner instance role has read-only cloudwatch/rds/apprunner perms).
import { runInfraHealthSweep } from "../infrahealth/runner.js";
import { loadThresholds } from "../infrahealth/config.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("infra-health-job");

let sweepInterval: NodeJS.Timeout | null = null;

function enabled(): boolean {
  return (process.env.INFRA_HEALTH_ENABLED ?? "false").toLowerCase() === "true";
}

export function startInfraHealthJob(): void {
  if (sweepInterval) return; // already running
  if (!enabled()) {
    logger.info("Infrastructure Health Monitor disabled (set INFRA_HEALTH_ENABLED=true to enable)");
    return;
  }
  const cadenceMs = Math.max(1, loadThresholds().cadenceMinutes) * 60_000;
  logger.info({ cadenceMs }, "Starting Infrastructure Health Monitor background job");
  // run once on boot so the dashboard is populated promptly, then on cadence
  void runInfraHealthSweep();
  sweepInterval = setInterval(() => {
    void runInfraHealthSweep();
  }, cadenceMs);
}

export function stopInfraHealthJob(): void {
  if (sweepInterval) {
    clearInterval(sweepInterval);
    sweepInterval = null;
    logger.info("Stopped Infrastructure Health Monitor background job");
  }
}
// [SCOPE 078 / T006] END
