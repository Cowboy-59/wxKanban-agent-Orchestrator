/**
 * [SCOPE 154 / T013] Full-flow test (FR-013): a startup list, one skip, one failed unit, one
 * parked production-bound unit, and one missed heartbeat, scripted end to end across T003–T009's
 * own modules. Confirms the run-state record carries exactly one row per unit — the proxy for
 * "agentruns receives a row per unit" this codebase can assert: T010 reuses the existing agentruns
 * mechanism unmodified (no new booking code), so one unit here is one ordinary session's work,
 * which that existing mechanism books on its own.
 */
import { describe, expect, it } from "vitest";
import {
  formatStartupList,
  type StartupScope,
} from "../../wxkanban-agent/apps/remote-bridge/src/autopilot-startup";
import {
  classifyDependents,
  formatSkipCascade,
  recordSkipCascade,
  type AutopilotRunState,
  type ScopeImpactDependent,
} from "../../wxkanban-agent/apps/remote-bridge/src/autopilot-skip";
import {
  runPipeline,
  type PipelineUnit,
  type RunUnitFn,
  type UnitRunRecord,
} from "../../wxkanban-agent/apps/remote-bridge/src/autopilot-pipeline";
import { buildHeartbeat, buildFullSummary } from "../../wxkanban-agent/apps/remote-bridge/src/autopilot-heartbeat";
import {
  isHeartbeatMissed,
  stepOutage,
  formatHeartbeatMissed,
  formatHeartbeatBack,
  type OutageState,
} from "../../src/server/services/ProjectAgentConnectionService";

describe("Autopilot full flow (FR-013, SC-42)", () => {
  it("startup list, a skip, a failed unit, a production-parked unit, and a missed heartbeat", async () => {
    // 1. Startup list — four scopes from the dev plan, in build order.
    const startup: StartupScope[] = [
      { num: "010", title: "Billing", stage: "Implementation" },
      { num: "011", title: "Invoices", stage: "Design" },
      { num: "030", title: "Backfill", stage: "Implementation" },
      { num: "012", title: "Reports", stage: "Design" },
    ];
    const startupPost = formatStartupList(startup);
    expect(startupPost).toContain("4 scopes from the dev plan, in build order");
    expect(startupPost).toContain('Reply "go" to start working this list.');

    // 2. Owner skips SCOPE-011; it has one dependent, already partly worked.
    const dependents: ScopeImpactDependent[] = [{ scope: "012", title: "Reports", file: "specs/012-reports/spec.md" }];
    const classified = await classifyDependents(dependents, async () => "Implementation");
    const skipPost = formatSkipCascade("011", "Invoices", classified);
    expect(skipPost).toContain("Autopilot is skipping SCOPE-011 — Invoices. 1 dependent scope affected");
    expect(skipPost).toContain("SCOPE-012 — Reports (partly worked)");

    let state: AutopilotRunState = recordSkipCascade({ mode: "autopilot", skips: [] }, "011", "Invoices", classified);
    expect(state.skips).toEqual([
      { scope: "011", title: "Invoices", status: "partly-worked", dependents: classified },
    ]);

    // 3. Run the remaining units: one production-bound unit (parks without ever running), and one
    // that fails its tests — each reusing T005–T007's own pipeline.
    const units: PipelineUnit[] = [
      { num: "010", title: "Billing" },
      { num: "030", title: "Backfill", text: "Run `drizzle-kit push` against the live database." },
    ];
    const posts: string[] = [];
    const records: UnitRunRecord[] = [];
    const ranUnits: string[] = [];
    const runUnit: RunUnitFn = async (unit) => {
      ranUnits.push(unit.num);
      if (unit.num === "010") return { ok: false, error: "tests failed after 2 cycles" };
      return { ok: true };
    };
    const outcomes = await runPipeline({
      units,
      runUnit,
      post: (t) => void posts.push(t),
      recordOutcome: (r) => void records.push(r),
    });

    // The production-bound unit never reaches runUnit at all (FR-005).
    expect(ranUnits).toEqual(["010"]);
    expect(outcomes[0]).toEqual({ scope: units[0], status: "failed", error: "tests failed after 2 cycles", waitingDependents: [] });
    expect(outcomes[1].status).toBe("parked");
    expect(posts[0]).toContain("Failed — SCOPE-010: Billing. tests failed after 2 cycles.");
    expect(posts[1]).toContain("Parked — SCOPE-030: Backfill.");
    expect(posts[1]).toContain("left untouched for the owner.");

    // One run-state record per unit — the row-per-unit acceptance criterion, in this codebase's
    // own terms (one unit, one record, one ordinary session booked by the existing mechanism).
    expect(records).toHaveLength(units.length);
    expect(records.map((r) => r.scope)).toEqual(["010", "030"]);

    state = { ...state, units: records };

    // 4. Heartbeat — one line per unit, in the same Done/Parked/Failed shape the posts used.
    const heartbeat = buildHeartbeat({ state, paused: false, previouslyPosted: [] });
    expect(heartbeat.kind).toBe("full");
    expect(heartbeat.message).toContain("Failed — SCOPE-010: Billing. tests failed after 2 cycles.");
    expect(heartbeat.message).toContain("Parked — SCOPE-030: Backfill.");

    const summary = buildFullSummary(state);
    expect(summary.postedScopes).toEqual(["010", "030"]);

    // 5. Missed heartbeat — an active run that stops posting raises one alert, then one "back"
    // line on return; a paused run raises nothing.
    const now = new Date("2026-11-07T12:00:00Z");
    const stale = new Date(now.getTime() - 25 * 60_000);
    expect(
      isHeartbeatMissed({ live: true, autopilotRunActive: true, paused: false, lastStatusPostAt: stale }, now),
    ).toBe(true);
    expect(
      isHeartbeatMissed({ live: true, autopilotRunActive: true, paused: true, lastStatusPostAt: stale }, now),
    ).toBe(false);

    let outage: OutageState = { alerting: false };
    const missed = stepOutage(outage, true);
    expect(missed.verdict).toBe("missed");
    expect(formatHeartbeatMissed("andys-laptop")).toBe("Autopilot: no heartbeat from andys-laptop — the run may have stopped.");
    outage = missed.state;

    const polledAgain = stepOutage(outage, true);
    expect(polledAgain.verdict).toBe("none"); // already alerting: no repeat line on every poll

    const back = stepOutage(outage, false);
    expect(back.verdict).toBe("back");
    expect(formatHeartbeatBack("andys-laptop")).toBe("Autopilot: andys-laptop is posting again.");
  });
});
