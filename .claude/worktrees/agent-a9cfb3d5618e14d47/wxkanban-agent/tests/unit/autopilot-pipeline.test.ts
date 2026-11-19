/**
 * [SCOPE 154 / T005] The unattended validateScope→createSpecs→implement pipeline (FR-004).
 */
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  formatParkedGate,
  formatUnitFailed,
  nodeLedgerResolver,
  resolveGate,
  runPipeline,
  type DependentsResolver,
  type GateResolver,
  type ParkedGate,
  type PipelineUnit,
  type RunUnitFn,
} from "../../apps/remote-bridge/src/autopilot-pipeline";
import type { UnitRunRecord } from "../../apps/remote-bridge/src/autopilot-skip";

const FIXTURE_ROOT = join(__dirname, "fixtures", "fake-ledger-root");

describe("nodeLedgerResolver", () => {
  const resolver = nodeLedgerResolver(FIXTURE_ROOT);

  it("answers a gate the ledger already covers", async () => {
    const r = await resolver("010", "Should invoices round to the cent?");
    expect(r).toEqual({ decision: "Yes, round half up to the cent.", rationale: "matches existing billing behavior", ledgerId: "D-0001" });
  });

  it("does not answer from an entry whose evidence is unknown", async () => {
    expect(await resolver("010", "Ineligible because evidence is unknown")).toBeUndefined();
  });

  it("returns undefined when no entry matches the scope or question", async () => {
    expect(await resolver("099", "Nothing on record")).toBeUndefined();
  });
});

describe("resolveGate (FR-004)", () => {
  it("answers from the resolver when it has an answer", async () => {
    const resolver: GateResolver = async () => ({ decision: "Yes.", ledgerId: "D-0001" });
    const outcome = await resolveGate("Billing App", "010", "Round to the cent?", "invoice totals", resolver);
    expect(outcome).toEqual({ kind: "answered", resolution: { decision: "Yes.", ledgerId: "D-0001" } });
  });

  it("parks as one line — project, scope, question, what it blocks — when nothing answers it", async () => {
    const resolver: GateResolver = async () => undefined;
    const outcome = await resolveGate("Billing App", "010", "Round to the cent?", "invoice totals", resolver);
    expect(outcome).toEqual({
      kind: "parked",
      parked: { project: "Billing App", scope: "SCOPE-010", question: "Round to the cent?", blocks: "invoice totals" },
    });
  });
});

describe("formatParkedGate", () => {
  it("names the project, scope, question, and what it blocks", () => {
    const g: ParkedGate = { project: "Billing App", scope: "SCOPE-010", question: "Round to the cent?", blocks: "invoice totals" };
    const text = formatParkedGate(g);
    expect(text).toContain("Billing App / SCOPE-010");
    expect(text).toContain('"Round to the cent?"');
    expect(text).toContain("blocks invoice totals");
  });
});

describe("runPipeline (FR-004)", () => {
  const UNITS: PipelineUnit[] = [
    { num: "010", title: "Billing" },
    { num: "011", title: "Invoices" },
  ];

  it("runs every unit one at a time and reports done for each", async () => {
    const seen: string[] = [];
    const runUnit: RunUnitFn = async (unit) => {
      seen.push(unit.num);
      return { ok: true };
    };
    const outcomes = await runPipeline({ units: UNITS, runUnit });
    expect(seen).toEqual(["010", "011"]);
    expect(outcomes).toEqual([
      { scope: UNITS[0], status: "done" },
      { scope: UNITS[1], status: "done" },
    ]);
  });

  it("a unit that parks does not stop the run, and posts the park line", async () => {
    const posts: string[] = [];
    const parked: ParkedGate = { project: "Billing App", scope: "SCOPE-010", question: "Q?", blocks: "X" };
    const runUnit: RunUnitFn = async (unit) => (unit.num === "010" ? { ok: false, parkedGates: [parked] } : { ok: true });
    const outcomes = await runPipeline({ units: UNITS, runUnit, post: (t) => void posts.push(t) });
    expect(outcomes[0]).toEqual({ scope: UNITS[0], status: "parked", parkedGates: [parked] });
    expect(outcomes[1]).toEqual({ scope: UNITS[1], status: "done" });
    expect(posts).toEqual([formatParkedGate(parked)]);
  });

  it("a unit that throws is reported failed, and the run continues", async () => {
    const runUnit: RunUnitFn = async (unit) => {
      if (unit.num === "010") throw new Error("worktree lock timed out");
      return { ok: true };
    };
    const outcomes = await runPipeline({ units: UNITS, runUnit });
    expect(outcomes[0]).toEqual({ scope: UNITS[0], status: "failed", error: "worktree lock timed out", waitingDependents: [] });
    expect(outcomes[1].status).toBe("done");
  });

  it("a unit that fails without a parked gate is reported failed with its error", async () => {
    const runUnit: RunUnitFn = async () => ({ ok: false, error: "tests failed after 2 cycles" });
    const outcomes = await runPipeline({ units: [UNITS[0]], runUnit });
    expect(outcomes).toEqual([{ scope: UNITS[0], status: "failed", error: "tests failed after 2 cycles", waitingDependents: [] }]);
  });

  it("a unit whose own text targets production parks without ever calling runUnit (FR-005, SC-38)", async () => {
    const seeded: PipelineUnit = { num: "030", title: "Backfill", text: "Run `drizzle-kit push` against the live database." };
    const seen: string[] = [];
    const posts: string[] = [];
    const runUnit: RunUnitFn = async (unit) => {
      seen.push(unit.num);
      return { ok: true };
    };
    const outcomes = await runPipeline({ units: [seeded, UNITS[0]], runUnit, post: (t) => void posts.push(t) });
    expect(seen).toEqual(["010"]);
    expect(outcomes[0].status).toBe("parked");
    expect(outcomes[1]).toEqual({ scope: UNITS[0], status: "done" });
    expect(posts[0]).toContain("SCOPE-030: Backfill");
    expect(posts[0]).toContain("left untouched");
  });

  it("a failed unit posts a short line and marks its dependents waiting (FR-006)", async () => {
    const posts: string[] = [];
    const dependentsOf: DependentsResolver = async (scopeNum) =>
      scopeNum === "010" ? [{ scope: "011", title: "Invoices" }] : [];
    const runUnit: RunUnitFn = async (unit) =>
      unit.num === "010" ? { ok: false, error: "tests failed after 2 cycles" } : { ok: true };
    const outcomes = await runPipeline({ units: UNITS, runUnit, dependentsOf, post: (t) => void posts.push(t) });
    expect(outcomes[0]).toEqual({
      scope: UNITS[0],
      status: "failed",
      error: "tests failed after 2 cycles",
      waitingDependents: [{ scope: "011", title: "Invoices" }],
    });
    expect(outcomes[1].status).toBe("done");
    expect(posts[0]).toContain("SCOPE-010: Billing");
    expect(posts[0]).toContain("tests failed after 2 cycles");
    expect(posts[0]).toContain("SCOPE-011 (Invoices)");
  });

  it("a thrown unit also posts a failure line with any waiting dependents", async () => {
    const posts: string[] = [];
    const dependentsOf: DependentsResolver = async () => [{ scope: "011", title: "Invoices" }];
    const runUnit: RunUnitFn = async (unit) => {
      if (unit.num === "010") throw new Error("worktree lock timed out");
      return { ok: true };
    };
    const outcomes = await runPipeline({ units: [UNITS[0]], runUnit, dependentsOf, post: (t) => void posts.push(t) });
    expect(outcomes[0].status).toBe("failed");
    expect(outcomes[0].waitingDependents).toEqual([{ scope: "011", title: "Invoices" }]);
    expect(posts[0]).toContain("worktree lock timed out");
  });

  it("records an explicit done/failed/parked line for every unit (FR-006 acceptance)", async () => {
    const parked: ParkedGate = { project: "Billing App", scope: "SCOPE-011", question: "Q?", blocks: "X" };
    const records: UnitRunRecord[] = [];
    const runUnit: RunUnitFn = async (unit) => {
      if (unit.num === "010") return { ok: false, error: "boom" };
      return { ok: false, parkedGates: [parked] };
    };
    await runPipeline({ units: UNITS, runUnit, recordOutcome: (r) => void records.push(r) });
    expect(records).toEqual([
      { scope: "010", title: "Billing", status: "failed", error: "boom", waitingDependents: [] },
      { scope: "011", title: "Invoices", status: "parked" },
    ]);
  });

  // [SCOPE 154 / T003] onUnitStart is the hook bridge.ts uses to persist currentScope/currentStep
  // into the Autopilot run state before each unit runs.
  describe("onUnitStart (SCOPE 154 / T003)", () => {
    it("is called with each unit, in order, before runUnit", async () => {
      const started: string[] = [];
      const ran: string[] = [];
      const runUnit: RunUnitFn = async (unit) => {
        ran.push(unit.num);
        return { ok: true };
      };
      await runPipeline({
        units: UNITS,
        runUnit,
        onUnitStart: (unit) => void started.push(unit.num),
      });
      expect(started).toEqual(["010", "011"]);
      expect(ran).toEqual(["010", "011"]);
    });

    it("is called even for a unit that parks via the preflight guard (FR-005)", async () => {
      const seeded: PipelineUnit = { num: "030", title: "Backfill", text: "Run `drizzle-kit push` against the live database." };
      const started: string[] = [];
      const runUnit: RunUnitFn = async () => ({ ok: true });
      await runPipeline({ units: [seeded], runUnit, onUnitStart: (unit) => void started.push(unit.num) });
      expect(started).toEqual(["030"]);
    });

    it("an async onUnitStart is awaited before the unit is checked/run", async () => {
      const order: string[] = [];
      const runUnit: RunUnitFn = async (unit) => {
        order.push(`run:${unit.num}`);
        return { ok: true };
      };
      await runPipeline({
        units: [UNITS[0]],
        runUnit,
        onUnitStart: async (unit) => {
          await new Promise((resolve) => setTimeout(resolve, 1));
          order.push(`start:${unit.num}`);
        },
      });
      expect(order).toEqual(["start:010", "run:010"]);
    });

    it("omitting onUnitStart changes nothing (backward-compatible for pipeline-agent)", async () => {
      const outcomes = await runPipeline({ units: UNITS, runUnit: async () => ({ ok: true }) });
      expect(outcomes).toEqual([
        { scope: UNITS[0], status: "done" },
        { scope: UNITS[1], status: "done" },
      ]);
    });
  });
});

describe("formatUnitFailed", () => {
  it("names the scope and title, with the error and no dependents", () => {
    const text = formatUnitFailed({ num: "010", title: "Billing" }, "tests failed", []);
    expect(text).toContain("SCOPE-010: Billing");
    expect(text).toContain("tests failed");
  });

  it("lists waiting dependents by scope and title", () => {
    const text = formatUnitFailed({ num: "010", title: "Billing" }, "tests failed", [{ scope: "011", title: "Invoices" }]);
    expect(text).toContain("Marked waiting: SCOPE-011 (Invoices).");
  });
});
