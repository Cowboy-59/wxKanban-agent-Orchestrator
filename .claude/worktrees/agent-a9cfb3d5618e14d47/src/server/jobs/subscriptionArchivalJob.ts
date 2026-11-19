// [SCOPE 132 / T003] BEGIN — background job: daily cancelled-company archival sweep.
//
// SPEC-132 FR-003. Mirrors infraHealthJob (interval + start/stop, env-gated).
// DEFAULT OFF — set SUBSCRIPTION_ARCHIVAL_ENABLED=dryrun or =on to activate.
//
// WHY THIS IS NOT A TIMER
//
// The obvious implementation of "archive 30 days after cancellation" is to schedule
// something at cancellation time. That is a trap in this codebase:
// `src/server/services/jobScheduler.ts` holds jobs in an in-memory Map of setTimeout /
// setInterval handles, so every App Runner redeploy silently forgets them. A 30-day
// timer registered there would never fire once. The wait therefore lives in the
// database as `companies.cancelledat`, and this job DISCOVERS eligible rows on a daily
// cadence — surviving any number of restarts.
//
// WHY THE MODES
//
// This job rewrites ownership of customer data and destroys credentials. It ships
// disarmed and is expected to be run in `dryrun` against real production data, and
// reviewed, before it is ever set to `on` — that review is the compensating control
// for SOC 2 CC5.2, whose separation of duties cannot be met on a single-operator
// project. An unrecognised value resolves to `off`, matching `gateMode()` in
// requireActiveSubscription: for a destructive job the safe fallback is to do nothing.
import { createLogger } from "../lib/logger.js";

const logger = createLogger("subscription-archival-job");

/**
 * off    — do not evaluate anything at all.
 * dryrun — select and report exactly what would be archived; write nothing.
 * on      — archive.
 */
export type ArchivalMode = "off" | "dryrun" | "on";

export interface ArchivalConfig {
  mode: ArchivalMode;
  /** Days after `cancelledat` before a company becomes eligible. */
  retentionDays: number;
  /** Maximum companies processed per run — bounds the blast radius of a bad selection. */
  perRunCap: number;
  /** Hours between sweeps. */
  cadenceHours: number;
  /** Company that transferred projects are re-pointed to. */
  targetCompanyId: string | null;
  /** User that transferred projects are re-owned by. Must be an ADMIN of the above. */
  targetUserId: string | null;
}

const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_PER_RUN_CAP = 5;
const DEFAULT_CADENCE_HOURS = 24;

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Resolve the job's configuration from the environment.
 *
 * The transfer targets are deliberately NOT defaulted to literal ids. SPEC-132 FR-004
 * requires them to be configuration, and a compiled-in fallback would mean a
 * misconfigured deployment silently moved a customer's projects to whichever company
 * the constant happened to name. Absent targets make the sweep refuse instead
 * (see `resolveTargets`).
 *
 * Intended production values, for reference only — they belong in the environment:
 *   SUBSCRIPTION_ARCHIVAL_TARGET_COMPANY_ID=019d4ff7-527e-7627-92a0-13eaf5e16ee8
 *   SUBSCRIPTION_ARCHIVAL_TARGET_USER_ID=019d4ff7-52b5-724d-b0ad-b37f5c331199
 */
export function archivalConfig(): ArchivalConfig {
  const raw = (process.env.SUBSCRIPTION_ARCHIVAL_ENABLED ?? "off").toLowerCase();
  const mode: ArchivalMode = raw === "on" || raw === "dryrun" ? raw : "off";

  return {
    mode,
    retentionDays: positiveInt(process.env.SUBSCRIPTION_ARCHIVAL_RETENTION_DAYS, DEFAULT_RETENTION_DAYS),
    perRunCap: positiveInt(process.env.SUBSCRIPTION_ARCHIVAL_PER_RUN_CAP, DEFAULT_PER_RUN_CAP),
    cadenceHours: positiveInt(process.env.SUBSCRIPTION_ARCHIVAL_CADENCE_HOURS, DEFAULT_CADENCE_HOURS),
    targetCompanyId: process.env.SUBSCRIPTION_ARCHIVAL_TARGET_COMPANY_ID ?? null,
    targetUserId: process.env.SUBSCRIPTION_ARCHIVAL_TARGET_USER_ID ?? null,
  };
}

let sweepInterval: NodeJS.Timeout | null = null;

/**
 * Start the sweep.
 *
 * Unlike the other jobs in this directory, this one logs a line on EVERY boot —
 * including when it is disabled. SPEC-132 FR-009 requires that: this project has
 * shipped a subscription gate off, a welcome message inert, and a compliance context
 * that loaded for nobody, so a destructive job that defaults to `off` needs a standing
 * signal that it exists and is not running. That line is a requirement, not noise.
 */
export function startSubscriptionArchivalJob(): void {
  if (sweepInterval) return; // already running

  const config = archivalConfig();

  if (config.mode === "off") {
    logger.info(
      { mode: "off" },
      "Subscription archival sweep DISABLED — no cancelled company will be archived " +
        "(set SUBSCRIPTION_ARCHIVAL_ENABLED=dryrun to preview, =on to arm)",
    );
    return;
  }

  const cadenceMs = config.cadenceHours * 60 * 60_000;
  logger.info(
    {
      mode: config.mode,
      retentionDays: config.retentionDays,
      perRunCap: config.perRunCap,
      cadenceHours: config.cadenceHours,
      targetsConfigured: Boolean(config.targetCompanyId && config.targetUserId),
    },
    config.mode === "dryrun"
      ? "Subscription archival sweep in DRYRUN — will report what it would archive and write nothing"
      : "Subscription archival sweep ARMED — cancelled companies will be transferred and scrubbed",
  );

  // Deliberately NOT run on boot. infraHealthJob sweeps immediately so its dashboard
  // populates promptly, but that is a read. An unattended first action that rewrites
  // customer data the moment a container starts would remove the operator's chance to
  // notice a misconfiguration, and would fire on every redeploy.
  sweepInterval = setInterval(() => {
    void runArchivalSweep();
  }, cadenceMs);
}

export function stopSubscriptionArchivalJob(): void {
  if (sweepInterval) {
    clearInterval(sweepInterval);
    sweepInterval = null;
    logger.info("Stopped subscription archival sweep");
  }
}
// [SCOPE 132 / T003] END

// [SCOPE 132 / T003] BEGIN — sweep entry point (selection and mutation land in T005–T014)
/**
 * One sweep pass.
 *
 * T003 establishes the entry point, the mode contract and the refusal conditions. The
 * selection query is T005; the transfer is T006–T008; the scrubs are T010–T012. Those
 * tasks fill this function — they do not replace it, and the refusals below apply to
 * every one of them.
 */
export async function runArchivalSweep(): Promise<void> {
  const config = archivalConfig();

  if (config.mode === "off") return;

  // Refuse rather than improvise. SPEC-132 FR-004: the job aborts WITHOUT WRITING if
  // either transfer target fails to resolve. Checked before selection so a
  // misconfigured deployment cannot get as far as reading customer rows.
  if (!config.targetCompanyId || !config.targetUserId) {
    logger.error(
      {
        mode: config.mode,
        targetCompanyId: config.targetCompanyId ? "set" : "MISSING",
        targetUserId: config.targetUserId ? "set" : "MISSING",
      },
      "Subscription archival sweep REFUSED — transfer targets are not configured; " +
        "set SUBSCRIPTION_ARCHIVAL_TARGET_COMPANY_ID and SUBSCRIPTION_ARCHIVAL_TARGET_USER_ID",
    );
    return;
  }

  logger.info(
    { mode: config.mode, retentionDays: config.retentionDays, perRunCap: config.perRunCap },
    "Subscription archival sweep starting",
  );

  // T005 selects eligible companies here: `cancelledat` older than retentionDays,
  // skipping cancelledat IS NULL, PAUSED, billingexempt and archivedat IS NOT NULL,
  // limited to perRunCap. T006-T014 then process each one in a single transaction.
  logger.warn(
    { mode: config.mode },
    "Subscription archival sweep has no selection implemented yet (SPEC-132 T005) — nothing was examined or changed",
  );
}
// [SCOPE 132 / T003] END
