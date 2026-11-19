// [SCOPE 078 / T006] BEGIN — Infrastructure Health Monitor run orchestration (read -> evaluate -> upsert)
// One self-contained sweep: collect readings, evaluate the rules, and UPSERT one row per check key
// into infrahealthchecks (current-state model). Fail-open: any error logs and returns without writing
// partial/wrong rows, so a bad run never blocks the app and the next cadence retries.
import { db } from "../db/client.js";
import { infrahealthchecks } from "../../db/schema/infrahealthchecks.js";
import { createLogger } from "../lib/logger.js";
import { evaluateChecks } from "./rules.js";
import { readRds, readBudget } from "./readers.js";
import { loadThresholds, infraTargets } from "./config.js";
import type { CheckResult } from "./types.js";

const logger = createLogger("infra-health-runner");

export interface SweepOutcome {
  ok: boolean;
  results: CheckResult[];
}

/** Run one monitor sweep. Never throws. */
export async function runInfraHealthSweep(): Promise<SweepOutcome> {
  try {
    const t = loadThresholds();
    const { rdsInstanceId, awsRegion } = infraTargets();

    const rds = await readRds(rdsInstanceId, awsRegion);
    const budget = await readBudget(rds.maxConnections, t.connectionReserve);
    const results = evaluateChecks({ rds, budget }, t);

    const now = new Date();
    for (const r of results) {
      await db
        .insert(infrahealthchecks)
        .values({
          checkkey: r.checkkey,
          resource: r.resource,
          status: r.status,
          title: r.title,
          detail: r.detail,
          solution: r.solution,
          readings: r.readings,
          evaluatedat: now,
        })
        .onConflictDoUpdate({
          target: infrahealthchecks.checkkey,
          set: {
            resource: r.resource,
            status: r.status,
            title: r.title,
            detail: r.detail,
            solution: r.solution,
            readings: r.readings,
            evaluatedat: now,
          },
        });
    }

    const worst = results.reduce(
      (acc, r) => (r.status === "urgent" ? "urgent" : r.status === "caution" && acc !== "urgent" ? "caution" : acc),
      "ok" as CheckResult["status"],
    );
    logger.info({ checks: results.length, worst }, "infra-health sweep complete");
    return { ok: true, results };
  } catch (err) {
    logger.error({ error: err instanceof Error ? err.message : String(err) }, "infra-health sweep failed (fail-open)");
    return { ok: false, results: [] };
  }
}
// [SCOPE 078 / T006] END
