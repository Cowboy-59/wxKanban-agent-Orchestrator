// Work memory (SPEC-159 FR-024, FR-033, FR-035, FR-039). One writer: the Manager. Append-only
// JSONL beside the ledger in decisions/, read from the main repo path, tagged company and project.
// Every write is masked by redact.ts first, then cut at the cap, so a cut never exposes a secret.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { redactSecrets } from "./redact";
import { refuseIfWorker, type BlockLog } from "./worker-guard";

// [SCOPE 159 / T009] BEGIN — Work memory kinds, cap and masking (FR-033)
export type MemoryKind = "history" | "nugget" | "future";
export const WORK_MEMORY_CAP = 4000;
export const WORK_MEMORY_FILES: Record<MemoryKind, string> = {
  history: "workmemory-history.jsonl",
  nugget: "workmemory-nuggets.jsonl",
  future: "workmemory-future.jsonl",
};

/** Mask first, then cut at the cap and mark the cut. */
export function maskAndCap(text: string, cap = WORK_MEMORY_CAP): string {
  const masked = redactSecrets(text).text;
  if (masked.length <= cap) return masked;
  return `${masked.slice(0, cap)}[cut: ${masked.length - cap} characters over cap]`;
}

export interface HistoryEntry {
  task: string;
  scope: string;
  spec: string;
  done: string;
  files: string[];
  problems: string;
  ledgerIds: string[];
  testResult: string;
}
export interface NuggetEntry {
  question: string;
  choice: string;
  why: string;
  alternatives: string;
  preference: string;
}
export interface FutureEntry {
  idea: string;
  deferredBecause: string;
}
export type EntryFor<K extends MemoryKind> = K extends "history" ? HistoryEntry : K extends "nugget" ? NuggetEntry : FutureEntry;

export interface StoredRow {
  id: string;
  kind: MemoryKind;
  companyId: string;
  projectId: string;
  date: string;
  entry: Record<string, unknown>;
}
// [SCOPE 159 / T009] END

// [SCOPE 159 / T009] BEGIN — Main-repo path and the work memory store (FR-035, FR-039)
/** A worktree lives at <main>/.claude/worktrees/<name>; work memory is always read from <main>. */
export function mainRepoPath(root: string): string {
  const r = resolve(root).replace(/\\/g, "/");
  const i = r.indexOf("/.claude/worktrees/");
  return i === -1 ? resolve(root) : resolve(r.slice(0, i));
}

export type WriteResult = { ok: true; id: string } | { ok: false; reason: "worker_refused" | "duplicate_task" | "cross_company" };

export interface WorkMemoryOptions {
  root: string;
  companyId: string;
  projectId: string;
  env?: NodeJS.ProcessEnv;
  blocks?: BlockLog;
  now?: () => Date;
}

export class WorkMemory {
  private readonly dir: string;
  private readonly env: NodeJS.ProcessEnv;
  private readonly now: () => Date;

  constructor(private readonly o: WorkMemoryOptions) {
    this.dir = join(mainRepoPath(o.root), "decisions");
    this.env = o.env ?? process.env;
    this.now = o.now ?? (() => new Date());
  }

  private file(kind: MemoryKind): string {
    return join(this.dir, WORK_MEMORY_FILES[kind]);
  }

  private rows(kind: MemoryKind): StoredRow[] {
    const f = this.file(kind);
    if (!existsSync(f)) return [];
    return readFileSync(f, "utf8")
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => JSON.parse(l) as StoredRow);
  }

  /** Append one entry. A worker-marked process is refused and counted; strings are masked and capped. */
  append<K extends MemoryKind>(kind: K, entry: EntryFor<K>): WriteResult {
    const refusal = refuseIfWorker("ledger_append", this.env, this.o.blocks, "workmemory");
    if (refusal) return { ok: false, reason: "worker_refused" };
    const clean = this.clean(entry as unknown as Record<string, unknown>);
    if (kind === "history") {
      const key = `${clean.scope}/${clean.task}`;
      if (this.rows("history").some((r) => `${r.entry.scope}/${r.entry.task}` === key)) return { ok: false, reason: "duplicate_task" };
    }
    const all = this.rows(kind);
    const row: StoredRow = {
      id: `${kind}-${all.length + 1}`,
      kind,
      companyId: this.o.companyId,
      projectId: this.o.projectId,
      date: this.now().toISOString(),
      entry: clean,
    };
    mkdirSync(dirname(this.file(kind)), { recursive: true });
    appendFileSync(this.file(kind), `${JSON.stringify(row)}\n`, "utf8");
    return { ok: true, id: row.id };
  }

  /** Earlier entries are never edited: this always refuses. */
  edit(_id: string): { ok: false; reason: "append_only" } {
    return { ok: false, reason: "append_only" };
  }

  /** Read for a company; another company's read is refused. */
  read(kind: MemoryKind, asCompanyId: string): { ok: true; rows: StoredRow[] } | { ok: false; reason: "cross_company" } {
    if (asCompanyId !== this.o.companyId) return { ok: false, reason: "cross_company" };
    return { ok: true, rows: this.rows(kind).filter((r) => r.companyId === asCompanyId) };
  }

  private clean(entry: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(entry)) {
      if (typeof v === "string") out[k] = maskAndCap(v);
      else if (Array.isArray(v)) out[k] = v.map((x) => (typeof x === "string" ? maskAndCap(x) : x));
      else out[k] = v;
    }
    return out;
  }
}
// [SCOPE 159 / T009] END
