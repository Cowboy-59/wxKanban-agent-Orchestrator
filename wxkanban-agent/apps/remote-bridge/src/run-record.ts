// Run links and outcomes (SPEC-159 FR-081, FR-082). One record per run: pointers to the task, spec,
// scope, brainstorm rows and ledger ids (never copies), and the outcomes saved beside it. Masked
// before writing; daily files beside the run log; same 30-day retention.

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { redactSecrets } from "./redact";
import { RETENTION_DAYS, RUN_LOG_DIR_REL } from "./run-log";

// [SCOPE 159 / T017] BEGIN — Run links and outcomes (FR-081, FR-082)
export interface RunLinks {
  taskId: string;
  specId: string;
  scopeId: string;
  /** Repo-relative record path with optional rows, or "none". */
  brainstormRecord: string;
  /** Ledger ids in force: ids only. */
  ledgerIds: string[];
}

export interface Rework {
  taskId: string;
  reason: "task_reopened" | "gate_sent_back" | "test_failed_on_finished";
  at: string;
  /** Links the case to the original finish. */
  finishedAt: string;
}

export interface RunOutcomes {
  tests: { passed: number; failed: number };
  gates: Array<{ gateId: string; answeredBy: string }>;
  blocked: Array<{ what: string; why: string }>;
  rework: Rework[];
}

export interface RunRecord {
  runId: string;
  startedAt: string;
  links: RunLinks;
  outcomes: RunOutcomes;
}

const DAY = /^runs-(\d{4}-\d{2}-\d{2})\.jsonl$/;
const dayOf = (d: Date): string => d.toISOString().slice(0, 10);

/** Missing scope or spec id is a defect; the record field is "none" with no brainstorm. */
export function linkProblems(l: Partial<RunLinks>): string[] {
  const out: string[] = [];
  for (const k of ["taskId", "specId", "scopeId"] as const) if (!l[k]) out.push(`${k} missing`);
  return out;
}

export const emptyOutcomes = (): RunOutcomes => ({ tests: { passed: 0, failed: 0 }, gates: [], blocked: [], rework: [] });

export function withLinks(l: Partial<RunLinks>): RunLinks {
  return {
    taskId: l.taskId ?? "",
    specId: l.specId ?? "",
    scopeId: l.scopeId ?? "",
    brainstormRecord: l.brainstormRecord && l.brainstormRecord.trim() ? l.brainstormRecord : "none",
    ledgerIds: [...(l.ledgerIds ?? [])],
  };
}

/** Rework only for the three recorded events; a re-run before the unit reports done is not rework. */
export function reworkOf(ev: { kind: "task_reopened" | "gate_sent_back" | "test_failed_on_finished" | "rerun_before_done" | "edit"; taskId: string; at: string; finishedAt?: string }): Rework | null {
  if (ev.kind === "rerun_before_done" || ev.kind === "edit" || !ev.finishedAt) return null;
  return { taskId: ev.taskId, reason: ev.kind, at: ev.at, finishedAt: ev.finishedAt };
}

export class RunRecorder {
  readonly dir: string;
  constructor(root: string, private readonly now: () => Date = () => new Date()) {
    this.dir = join(root, RUN_LOG_DIR_REL);
  }

  /** Append one record, every text field masked. Throws on a missing task, spec or scope id. */
  save(runId: string, links: Partial<RunLinks>, outcomes: RunOutcomes = emptyOutcomes()): RunRecord {
    const bad = linkProblems(links);
    if (bad.length) throw new Error(`run links incomplete: ${bad.join(", ")}`);
    const m = (s: string): string => redactSecrets(s).text;
    const rec: RunRecord = {
      runId,
      startedAt: this.now().toISOString(),
      links: withLinks(links),
      outcomes: { ...outcomes, blocked: outcomes.blocked.map((b) => ({ what: m(b.what), why: m(b.why) })) },
    };
    mkdirSync(this.dir, { recursive: true });
    appendFileSync(join(this.dir, `runs-${dayOf(this.now())}.jsonl`), `${JSON.stringify(rec)}\n`, "utf8");
    this.prune();
    return rec;
  }

  read(): RunRecord[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter((n) => DAY.test(n))
      .sort()
      .flatMap((n) => readFileSync(join(this.dir, n), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as RunRecord));
  }

  prune(): string[] {
    const cutoff = dayOf(new Date(this.now().getTime() - RETENTION_DAYS * 86_400_000));
    const gone: string[] = [];
    if (!existsSync(this.dir)) return gone;
    for (const n of readdirSync(this.dir)) {
      const m = DAY.exec(n);
      if (m && (m[1] as string) < cutoff) {
        rmSync(join(this.dir, n), { force: true });
        gone.push(n);
      }
    }
    return gone;
  }
}
// [SCOPE 159 / T017] END
