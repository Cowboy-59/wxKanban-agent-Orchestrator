import { describeRunningUnit, formatElapsed } from "./autopilot-heartbeat";
import { redactSecrets } from "./redact";
import type { AutopilotRunState } from "./autopilot-skip";

// [SCOPE 159 / T023] BEGIN — The one "status" builder: pure, masked, the same text from the room and the local session (FR-096)
//
// "status" gives one concise summary of outstanding work: is the agent running, a pending
// handoff, a running Autopilot run and its current unit, a devplan list waiting for go, the
// waiting question, and the devplan items left. With nothing outstanding it is exactly one line.
// No I/O and no clock read here: the room fills it from bridge memory and the local session
// from disk (status-source.ts), and both hand it the same `now`.

export type StatusAgentState = "starting" | "idle" | "working" | "waiting";

export interface StatusQuestion {
  /** Who or what asks: "push", "gated action", "SCOPE-042". */
  who: string;
  text: string;
}

/** What only the running bridge knows. Written into the panel snapshot for the local reader. */
export interface StatusMemory {
  state: StatusAgentState;
  runActive: boolean;
  paused: boolean;
  /** Scopes on a devplan list waiting for "go"; absent when no list waits. */
  awaitingGo?: number;
  question?: StatusQuestion;
}

export interface PendingHandoffs {
  count: number;
  /** ISO time of the oldest pending handoff. */
  oldestAt?: string;
}

export interface StatusState {
  agentRunning: boolean;
  /** Bridge memory; trusted only while the agent runs. */
  memory?: StatusMemory;
  handoffs: PendingHandoffs;
  run: AutopilotRunState;
}

/** A waiting question is cut to this many characters. */
export const STATUS_QUESTION_MAX = 160;
/** At most this many devplan items are named; the rest are counted. */
export const STATUS_ITEMS_NAMED = 5;

/** Startup-list scopes not done and not skipped, in build order. */
export function devplanItemsLeft(run: AutopilotRunState): string[] {
  const done = new Set((run.units ?? []).filter((u) => u.status === "done").map((u) => u.scope));
  const skipped = new Set(run.skips.map((s) => s.scope));
  return (run.startupList ?? []).map((i) => i.scope).filter((s) => !done.has(s) && !skipped.has(s));
}

function cut(text: string, max: number): string {
  const flat = redactSecrets(text).text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function agentLine(s: StatusState): string {
  if (!s.agentRunning) return "Status — the Project Agent is not running.";
  return s.memory ? `Status — the Project Agent is running (${s.memory.state}).` : "Status — the Project Agent is running.";
}

function outstanding(s: StatusState, now: Date): string[] {
  const out: string[] = [];
  const mem = s.agentRunning ? s.memory : undefined;
  if (s.handoffs.count > 0) {
    const oldest = s.handoffs.oldestAt ? Date.parse(s.handoffs.oldestAt) : NaN;
    const age = Number.isNaN(oldest) ? "" : ` (oldest waiting ${formatElapsed(now.getTime() - oldest)})`;
    out.push(`Handoffs pending: ${s.handoffs.count}${age}.`);
  }
  if (mem?.runActive) {
    const unit = describeRunningUnit(s.run, now);
    out.push(`Autopilot run: ${unit ? `working on ${unit}` : "active, between units"}${mem.paused ? " — paused" : ""}.`);
  } else if (s.run.currentScope) {
    // Disk only: the run is not live, so no "working" and no elapsed time.
    const title = s.run.startupList?.find((i) => i.scope === s.run.currentScope)?.title;
    out.push(`Autopilot: no run active; the saved run stopped at SCOPE-${s.run.currentScope}${title ? ` — ${title}` : ""}.`);
  }
  if (mem?.awaitingGo !== undefined) {
    out.push(`Devplan list waiting for "go": ${mem.awaitingGo} scope${mem.awaitingGo === 1 ? "" : "s"}.`);
  }
  if (mem?.question) out.push(`Waiting on an answer — ${mem.question.who}: "${cut(mem.question.text, STATUS_QUESTION_MAX)}"`);
  const left = devplanItemsLeft(s.run);
  if (left.length > 0) {
    const named = left.slice(0, STATUS_ITEMS_NAMED).map((n) => `SCOPE-${n}`).join(", ");
    const more = left.length > STATUS_ITEMS_NAMED ? `, +${left.length - STATUS_ITEMS_NAMED} more` : "";
    out.push(`Devplan items left: ${left.length} — ${named}${more}.`);
  }
  return out;
}

/** The status text, one line per item; exactly one line when nothing is outstanding. Every line masked. */
export function buildStatus(state: StatusState, now: Date): string[] {
  const head = agentLine(state);
  const items = outstanding(state, now);
  const lines = items.length === 0 ? [`${head} Nothing outstanding.`] : [head, ...items];
  return lines.map((l) => redactSecrets(l).text);
}
// [SCOPE 159 / T023] END
