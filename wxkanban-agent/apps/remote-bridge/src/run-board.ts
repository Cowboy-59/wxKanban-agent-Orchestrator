// Live run board (SPEC-159 FR-034). One file per project at .wxai/run-board.json, ids only,
// Manager-written, temp file then rename. Task and spec status stay in the DB.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { refuseIfWorker, type BlockLog } from "./worker-guard";

// [SCOPE 159 / T010] BEGIN — Run board shape and store (FR-034)
export interface BoardScope {
  scopeId: string;
  specId: string;
}
export interface BoardAssignment {
  taskId: string;
  worker: string;
  persona: string;
}
export interface RunBoard {
  version: 1;
  projectId: string;
  scopes: BoardScope[];
  assignments: BoardAssignment[];
  /** Ids only: a gate id, a ledger id or an assumptions.yaml row. */
  blockers: string[];
  openQuestions: string[];
  assumptions: string[];
  checkpoint: { at: string; taskId: string } | null;
  updatedAt: string;
}

/** Fields that would copy DB state onto the board; stripped on every write. */
const FORBIDDEN_KEYS = ["status", "title", "text", "answer", "body", "description"];

export function emptyBoard(projectId: string, now: Date = new Date()): RunBoard {
  return { version: 1, projectId, scopes: [], assignments: [], blockers: [], openQuestions: [], assumptions: [], checkpoint: null, updatedAt: now.toISOString() };
}

function idsOnly<T extends object>(rows: T[]): T[] {
  return rows.map((r) => {
    const o: Record<string, unknown> = { ...(r as Record<string, unknown>) };
    for (const k of FORBIDDEN_KEYS) delete o[k];
    return o as T;
  });
}

export type BoardWrite = { ok: true; board: RunBoard } | { ok: false; reason: "worker_refused" };

export class RunBoardStore {
  private readonly path: string;
  private readonly env: NodeJS.ProcessEnv;
  private readonly now: () => Date;

  constructor(private readonly o: { root: string; projectId: string; env?: NodeJS.ProcessEnv; blocks?: BlockLog; now?: () => Date }) {
    this.path = join(o.root, ".wxai", "run-board.json");
    this.env = o.env ?? process.env;
    this.now = o.now ?? (() => new Date());
  }

  /** Read the board from disk; an absent or damaged file gives an empty board. */
  load(): RunBoard {
    if (!existsSync(this.path)) return emptyBoard(this.o.projectId, this.now());
    try {
      const b = JSON.parse(readFileSync(this.path, "utf8")) as RunBoard;
      return b.version === 1 && b.projectId === this.o.projectId ? b : emptyBoard(this.o.projectId, this.now());
    } catch {
      return emptyBoard(this.o.projectId, this.now());
    }
  }

  /** Apply a change and write it. A worker-marked process is refused and counted. */
  update(change: (b: RunBoard) => void): BoardWrite {
    if (refuseIfWorker("ledger_append", this.env, this.o.blocks, "runboard")) return { ok: false, reason: "worker_refused" };
    const b = this.load();
    change(b);
    b.scopes = idsOnly(b.scopes);
    b.assignments = idsOnly(b.assignments);
    b.updatedAt = this.now().toISOString();
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(b, null, 2)}\n`, "utf8");
    renameSync(tmp, this.path);
    return { ok: true, board: b };
  }
}
// [SCOPE 159 / T010] END
