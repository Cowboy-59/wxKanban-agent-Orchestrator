// Parallel status file (SPEC-159 FR-085). docs/GOD-Parallel-Status.md is rewritten each time a unit
// starts, parks or finishes: header fields from SCOPE-136 FR-025..FR-028, then one row per unit.
// Masked by redact.ts, and email addresses and phone numbers are stripped (no contact detail).

import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { redactSecrets } from "./redact";

// [SCOPE 159 / T019] BEGIN — Parallel status file (FR-085)
export const PARALLEL_STATUS_REL = join("docs", "GOD-Parallel-Status.md");
export type UnitState = "running" | "parked" | "finished" | "waiting_merge";

export interface UnitRow {
  unit: string;
  agent: string;
  worktree: string;
  state: UnitState;
  /** The question a parked unit waits on. */
  question?: string;
}

export interface StatusHeader {
  /** FR-027: day 06:00-18:00, night 18:00-06:00 local time. */
  window: "day" | "night";
  capInForce: number;
  userCap: number;
  machineMax: number;
  /** FR-028: who set the unattended flag, if anyone. */
  presenceSetBy: "bridge" | "night_window" | "none";
  /** Share of agents working against the 70% target, 0..1. */
  workingShare: number;
}

export const windowOf = (d: Date): "day" | "night" => (d.getHours() >= 6 && d.getHours() < 18 ? "day" : "night");

/** The cap in force: machine max at night or with a remote session live; otherwise the user's cap, bounded. */
export function capInForce(userCap: number, machineMax: number, win: "day" | "night", remoteLive: boolean): { cap: number; presenceSetBy: StatusHeader["presenceSetBy"] } {
  if (remoteLive) return { cap: machineMax, presenceSetBy: "bridge" };
  if (win === "night") return { cap: machineMax, presenceSetBy: "night_window" };
  return { cap: Math.min(userCap, machineMax), presenceSetBy: "none" };
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /\+?\d[\d\s().-]{8,}\d/g;
const clean = (s: string): string => redactSecrets(s).text.replace(EMAIL, "[contact removed]").replace(PHONE, "[contact removed]").replace(/\|/g, "/").replace(/\r?\n/g, " ");

export function renderParallelStatus(h: StatusHeader, rows: readonly UnitRow[], at: Date): string {
  const lines = [
    "# G.O.D. Parallel Status",
    "",
    `Updated: ${at.toISOString()}`,
    `Window: ${h.window} | Cap in force: ${h.capInForce} (your cap ${h.userCap}, machine max ${h.machineMax})`,
    `Unattended flag set by: ${h.presenceSetBy}`,
    `Agents working: ${Math.round(h.workingShare * 100)}% (target 70%)`,
    "",
    "| Unit | Agent | Worktree | State | Parked on |",
    "|------|-------|----------|-------|-----------|",
    ...rows.map((r) => `| ${clean(r.unit)} | ${clean(r.agent)} | ${clean(r.worktree)} | ${r.state} | ${r.state === "parked" ? clean(r.question ?? "") : ""} |`),
    "",
  ];
  return lines.join("\n");
}

/** Rewrite the file now, through a temp file then rename. Call on every start, park and finish. */
export function writeParallelStatus(root: string, h: StatusHeader, rows: readonly UnitRow[], at: Date = new Date()): string {
  const f = join(root, PARALLEL_STATUS_REL);
  mkdirSync(dirname(f), { recursive: true });
  const tmp = `${f}.tmp`;
  writeFileSync(tmp, renderParallelStatus(h, rows, at), "utf8");
  renameSync(tmp, f);
  return f;
}
// [SCOPE 159 / T019] END
