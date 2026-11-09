import { redactSecrets } from "./handoff-writer";
import { formatUnitFailed } from "./autopilot-pipeline";
import type { AutopilotRunState, UnitRunRecord } from "./autopilot-skip";
import { formatQuestionHeartbeatLine, type AutopilotQuestion } from "./autopilot-question";

// [SCOPE 154 / T008] BEGIN — 15-minute heartbeat from the run state (FR-007, SCOPE-132 FR-098)
// MODIFIED-BY: [SCOPE 154 / T015] — quiet heartbeat names the running unit + elapsed; repeats a waiting question (FR-015, FR-016)
//
// FR-007 says to reuse "Amendment G piece A's masked rolling-summary mechanism ... no second
// summarizer is built." Amendment G piece A (SCOPE-132 FR-076/FR-077 — a per-turn session-feed
// hook plus a cheap-model-maintained rolling summary of a developer's interactive session) is not
// built anywhere in this codebase yet (confirmed: no `session-feed`/`rollingSummary` anywhere under
// wxkanban-agent, and SCOPE-132's own FR-103 "Build order" names it as a still-open release-gate
// prerequisite). But T008's own text gives the real data source already — "posts ... from the run
// state" — which is exactly `AutopilotRunState` (T004/T007): a structured, deterministic record of
// what each unit did. No LLM summarizer is needed to describe it, so "no second summarizer" is
// honored by construction. What *is* reused from Amendment G piece A is its masking primitive
// (`redactSecrets`, SCOPE-149/handoff-writer.ts — the same mask Amendment G's own upload path
// applies a second time before anything leaves the machine): every heartbeat line passes through
// it before posting, so nothing in a unit's error text reaches the room or K.A.I.N. unmasked.

/** One heartbeat or STATUS-on-demand result. */
export interface HeartbeatResult {
  message: string;
  kind: "full" | "nothing-changed" | "paused";
  /** Scopes now considered posted — carry this into the next call's `previouslyPosted`. */
  postedScopes: string[];
}

function formatUnitLine(u: UnitRunRecord): string {
  if (u.status === "done") return `Done — SCOPE-${u.scope}: ${u.title}.`;
  if (u.status === "parked") return `Parked — SCOPE-${u.scope}: ${u.title}.`;
  return formatUnitFailed({ num: u.scope, title: u.title }, u.error, u.waitingDependents ?? []);
}

/** Masks every line independently, so one bad line never hides the rest. */
function maskLines(lines: string[]): string[] {
  return lines.map((l) => redactSecrets(l).text);
}

export interface HeartbeatOptions {
  state: AutopilotRunState;
  /** The owner paused the run (the heartbeat still fires; it just says so). */
  paused: boolean;
  /** Unit scopes already covered by an earlier post — new since then get full detail. */
  previouslyPosted: string[];
  /** [SCOPE 154 / T015] A unit's question waiting on the owner — every heartbeat repeats it. */
  waitingQuestion?: AutopilotQuestion;
  /** [SCOPE 154 / T015] Clock for the elapsed time; defaults to now. */
  now?: Date;
}

/** [SCOPE 154 / T015] "1h 05m" / "12m" / "under a minute" — the elapsed part of the running-unit line. */
export function formatElapsed(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return "under a minute";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

/** [SCOPE 154 / T015] The unit running right now, from the run state — undefined when none is. */
export function describeRunningUnit(state: AutopilotRunState, now: Date = new Date()): string | undefined {
  const scope = state.currentScope;
  if (!scope) return undefined;
  const title = state.startupList?.find((i) => i.scope === scope)?.title;
  const started = state.stepStartedAt ? Date.parse(state.stepStartedAt) : NaN;
  const elapsed = Number.isNaN(started) ? "" : ` (${formatElapsed(now.getTime() - started)} so far)`;
  return `SCOPE-${scope}${title ? ` — ${title}` : ""}${elapsed}`;
}

/** The 15-minute post, and STATUS on demand (same content, called early). */
export function buildHeartbeat(opts: HeartbeatOptions): HeartbeatResult {
  // [SCOPE 154 / T015] A waiting question rides on every heartbeat, paused or not.
  const waiting = opts.waitingQuestion ? [redactSecrets(formatQuestionHeartbeatLine(opts.waitingQuestion)).text] : [];
  if (opts.paused) {
    return { message: ["Autopilot heartbeat: paused.", ...waiting].join("\n"), kind: "paused", postedScopes: opts.previouslyPosted };
  }
  const units = opts.state.units ?? [];
  const seen = new Set(opts.previouslyPosted);
  const changed = units.filter((u) => !seen.has(u.scope));
  const running = describeRunningUnit(opts.state, opts.now); // [SCOPE 154 / T015]
  const runningLine = running ? [redactSecrets(`Working on ${running}.`).text] : [];
  if (changed.length === 0) {
    const head = running
      ? `Autopilot heartbeat: still working on ${redactSecrets(running).text}. Nothing else changed since the last post.`
      : "Autopilot heartbeat: nothing changed since the last post.";
    return { message: [head, ...waiting].join("\n"), kind: "nothing-changed", postedScopes: opts.previouslyPosted };
  }
  const lines = maskLines(changed.map(formatUnitLine));
  const message = ["Autopilot heartbeat:", ...lines, ...runningLine, ...waiting].join("\n");
  return { message, kind: "full", postedScopes: [...opts.previouslyPosted, ...changed.map((u) => u.scope)] };
}

/** The finish-of-startup-list summary, and the 18:00 summary if the run is still going (FR-007): every unit, not just the new ones. */
export function buildFullSummary(state: AutopilotRunState): HeartbeatResult {
  const units = state.units ?? [];
  if (units.length === 0) {
    return { message: "Autopilot summary: no units have run yet.", kind: "nothing-changed", postedScopes: [] };
  }
  const lines = maskLines(units.map(formatUnitLine));
  return { message: ["Autopilot summary:", ...lines].join("\n"), kind: "full", postedScopes: units.map((u) => u.scope) };
}
// [SCOPE 154 / T008] END
