// Unit trace (SPEC-159 T017 + T019 hooks). One place the unit runner's start, park and finish are
// reported to: it rewrites the parallel status file each time (FR-085) and saves one run record per
// unit with its links and outcomes (FR-081, FR-082). Never throws: a record is not a gate.

import { RunRecorder, emptyOutcomes, type RunOutcomes } from "./run-record";
import { capInForce, windowOf, writeParallelStatus, type UnitRow } from "./parallel-status";
import type { PipelineUnit, UnitRunResult } from "./autopilot-pipeline";

// [SCOPE 159 / T020] BEGIN — Unit trace: recorder (T017) and status file (T019) hooks
export interface UnitTraceOptions {
  root: string;
  /** The user's parallel cap and this machine's maximum. Default 1 and 1 (one unit at a time). */
  userCap?: number;
  machineMax?: number;
  /** True while a remote session is live (lifts the cap, FR-028). */
  remoteLive?: () => boolean;
  now?: () => Date;
}

/** SPEC-NNN named in the unit's own text, else "unresolved": the field is never left empty. */
export function specIdOf(unit: PipelineUnit): string {
  const m = /SPEC-\d{3,}/i.exec(unit.text ?? "");
  return m ? m[0].toUpperCase() : "unresolved";
}

export class UnitTrace {
  private readonly rows = new Map<string, UnitRow>();
  private readonly gates = new Map<string, RunOutcomes["gates"]>();
  private readonly recorder: RunRecorder;
  private readonly now: () => Date;

  constructor(private readonly o: UnitTraceOptions) {
    this.now = o.now ?? (() => new Date());
    this.recorder = new RunRecorder(o.root, this.now);
  }

  private flush(): void {
    try {
      const at = this.now();
      const userCap = this.o.userCap ?? 1;
      const machineMax = this.o.machineMax ?? 1;
      const { cap, presenceSetBy } = capInForce(userCap, machineMax, windowOf(at), this.o.remoteLive?.() ?? false);
      const rows = [...this.rows.values()];
      const working = rows.filter((r) => r.state === "running").length;
      writeParallelStatus(
        this.o.root,
        { window: windowOf(at), capInForce: cap, userCap, machineMax, presenceSetBy, workingShare: rows.length ? working / rows.length : 0 },
        rows,
        at,
      );
    } catch {
      /* the status file is a view, not a gate */
    }
  }

  start(unit: PipelineUnit): void {
    this.rows.set(unit.num, { unit: `SCOPE-${unit.num} ${unit.title}`, agent: `unit:${unit.num}`, worktree: ".", state: "running" });
    this.gates.set(unit.num, []);
    this.flush();
  }

  /** A gate answered for the unit: kept for the run record. */
  gate(unit: PipelineUnit, gateId: string, answeredBy: string): void {
    this.gates.get(unit.num)?.push({ gateId, answeredBy });
  }

  /** The unit ended: parked on a question, or finished. Saves its run record. */
  end(unit: PipelineUnit, result: UnitRunResult): void {
    const parked = result.parkedGates?.[0];
    const row = this.rows.get(unit.num);
    if (row) {
      row.state = parked ? "parked" : "finished";
      if (parked) row.question = parked.question;
    }
    this.flush();
    try {
      const outcomes: RunOutcomes = { ...emptyOutcomes(), gates: this.gates.get(unit.num) ?? [] };
      for (const g of result.parkedGates ?? []) outcomes.blocked.push({ what: g.blocks || g.scope, why: g.question });
      if (!result.ok && !parked && result.error) outcomes.blocked.push({ what: `SCOPE-${unit.num}`, why: result.error });
      this.recorder.save(
        `unit-${unit.num}-${this.now().getTime()}`,
        { taskId: `unit:${unit.num}`, specId: specIdOf(unit), scopeId: `SCOPE-${unit.num}` },
        outcomes,
      );
    } catch {
      /* the record is not a gate */
    }
  }
}
// [SCOPE 159 / T020] END
