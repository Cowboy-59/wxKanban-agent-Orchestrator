// [SCOPE 154 / T009] BEGIN — missed-heartbeat alert, bridge-local (FR-008)
//
// T009 was originally designed server-side, against the SCOPE-151 connection record
// (ProjectAgentConnectionService.ts:298-344 — that fence is untouched and still correct as pure
// logic). It was never wired: the server never holds the room's agent token by design
// (agent-mode.ts:72-74), so a server job computing "missed" would have nowhere to post it. Every
// room post in this codebase already runs inside the bridge process — same reason T008's heartbeat
// lives here. So this is that same check, ported to run where posting is actually possible, against
// this process's own state instead of a DB record: "live" becomes "did the last heartbeat post
// succeed", and "autopilotRunActive" becomes the bridge's own `autopilotRunAbort` presence.

/** How long a run may go without a successful heartbeat post before it counts as missed (FR-008). */
export const STATUS_POST_WINDOW_MS = 20 * 60_000;

/** FR-008: a paused run never raises. Otherwise: no successful post for 20 minutes. */
export function isHeartbeatMissed(runActive: boolean, paused: boolean, lastPostOkAt: Date | undefined, now: Date): boolean {
  if (!runActive || paused) return false;
  if (!lastPostOkAt) return false;
  return now.getTime() - lastPostOkAt.getTime() >= STATUS_POST_WINDOW_MS;
}

export type OutageVerdict = "none" | "missed" | "back";

/** One alert per outage, one "back" line on return (SC-40) — never a line on every tick. */
export function stepOutage(alerting: boolean, missedNow: boolean): { alerting: boolean; verdict: OutageVerdict } {
  if (missedNow && !alerting) return { alerting: true, verdict: "missed" };
  if (!missedNow && alerting) return { alerting: false, verdict: "back" };
  return { alerting, verdict: "none" };
}

export function formatHeartbeatMissed(machine: string): string {
  return `Autopilot: no heartbeat from ${machine} — the run may have stopped.`;
}

export function formatHeartbeatBack(machine: string): string {
  return `Autopilot: ${machine} is posting again.`;
}
// [SCOPE 154 / T009] END
