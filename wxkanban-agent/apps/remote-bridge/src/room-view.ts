// Agent room view model (SPEC-159 FR-015, FR-058, FR-080, FR-083, FR-084, FR-087, FR-090). The data
// the Cockpit Parallel Agents panel and the VS Code gate notice draw from. It READS session status
// and the run board (no new store), masks every string, and has no gate-answer path.

import { join } from "node:path";
import { redactSecrets } from "./redact";
import { RUN_LOG_DIR_REL } from "./run-log";

// [SCOPE 159 / T018] BEGIN — Lane health lights (FR-015)
export type Light = "live" | "stale" | "gone";
export const LIVE_WITHIN_MS = 90_000;
export const GONE_AFTER_MS = 180_000;

/** Live within 90 s of the last heartbeat, stale after that, gone at 3 min. */
export function laneLight(lastBeatAt: Date | null, now: Date): Light {
  if (!lastBeatAt) return "gone";
  const age = now.getTime() - lastBeatAt.getTime();
  if (age <= LIVE_WITHIN_MS) return "live";
  return age >= GONE_AFTER_MS ? "gone" : "stale";
}
// [SCOPE 159 / T018] END

// [SCOPE 159 / T018] BEGIN — Panel rows, masked (FR-058, FR-083, FR-087)
export interface WorkerInput {
  id: string;
  role: "manager" | "worker";
  persona: string;
  model: string;
  taskId: string;
  state: string;
  lane: "local" | "room";
  lastBeatAt: Date | null;
}
export interface GateInput {
  gateId: string;
  raisedBy: string;
  raisedAt: Date;
}
export interface PersonaRate {
  persona: string;
  hitRate: number | null;
}

export interface PanelRow {
  id: string;
  role: "manager" | "worker";
  persona: string;
  model: string;
  taskId: string;
  state: string;
  lane: "local" | "room";
  light: Light;
  /** Hit rate for this row's persona, null when none is scored. */
  hitRate: number | null;
}
export interface PanelModel {
  rows: PanelRow[];
  gates: Array<{ gateId: string; raisedBy: string; raisedAt: string }>;
  /** What "open run log" opens: today's file. */
  runLogFile: string;
}

const m = (s: string): string => redactSecrets(s).text;
export const todayRunLog = (root: string, now: Date): string => join(root, RUN_LOG_DIR_REL, `${now.toISOString().slice(0, 10)}.jsonl`);

/** Built from data the bridge already holds: the same inputs give the same rows in every view. */
export function buildPanel(root: string, workers: readonly WorkerInput[], gates: readonly GateInput[], rates: readonly PersonaRate[], now: Date): PanelModel {
  const rate = new Map(rates.map((r) => [r.persona, r.hitRate]));
  return {
    rows: workers.map((w) => ({
      id: m(w.id),
      role: w.role,
      persona: m(w.persona),
      model: m(w.model),
      taskId: m(w.taskId),
      state: m(w.state),
      lane: w.lane,
      light: laneLight(w.lastBeatAt, now),
      hitRate: rate.get(w.persona) ?? null,
    })),
    gates: gates.map((g) => ({ gateId: m(g.gateId), raisedBy: m(g.raisedBy), raisedAt: g.raisedAt.toISOString() })),
    runLogFile: todayRunLog(root, now),
  };
}
// [SCOPE 159 / T018] END

// [SCOPE 159 / T018] BEGIN — Gate notice for VS Code: tells, never answers (FR-090)
export const NOTICE_WITHIN_MS = 10_000;

export interface GateNotice {
  gateId: string;
  text: string;
  /** Always false: the notice has no answer path. */
  canAnswer: false;
}

/** Notices for gates not yet announced. Poll at least every 10 s so each shows within the bound. */
export class GateNotifier {
  private readonly told = new Set<string>();
  fresh(gates: readonly GateInput[]): GateNotice[] {
    const out: GateNotice[] = [];
    for (const g of gates) {
      if (this.told.has(g.gateId)) continue;
      this.told.add(g.gateId);
      out.push({ gateId: m(g.gateId), text: m(`A gate is waiting, raised by ${g.raisedBy}. Answer it in the room or on the Agent.`), canAnswer: false });
    }
    return out;
  }
}
// [SCOPE 159 / T018] END

// [SCOPE 159 / T018] BEGIN — Panel snapshot file the Cockpit and VS Code read (FR-083: session status, no new store; FR-084: rewritten on every change)
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const PANEL_SNAPSHOT_REL = join(".wxai", "agent-room-panel.json");

/** Write the masked panel through a temp file then rename, so a watcher never reads half a file. */
export function writePanelSnapshot(root: string, panel: PanelModel): string {
  const f = join(root, PANEL_SNAPSHOT_REL);
  mkdirSync(dirname(f), { recursive: true });
  const tmp = `${f}.tmp`;
  writeFileSync(tmp, JSON.stringify(panel), "utf8");
  renameSync(tmp, f);
  return f;
}
// [SCOPE 159 / T018] END
