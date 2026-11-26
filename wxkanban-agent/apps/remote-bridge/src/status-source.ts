import { lstatSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { loadAutopilotState } from "./autopilot-skip";
import { HANDOFF_NAME_RE, handoffDir, projectAgentLive } from "./handoff-writer";
import { PANEL_SNAPSHOT_REL } from "./room-view";
import { buildStatus, type PendingHandoffs, type StatusAgentState, type StatusMemory } from "./status-summary";

// [SCOPE 159 / T023] BEGIN — The two fills of the one status builder: the room's from bridge memory, the local session's from disk (FR-096)
//
// Side by side so a test can hold them to the same text. Both read the handoff folder and the
// Autopilot run state from disk; only the memory part differs. The bridge passes its memory
// straight in; the local reader takes it from the panel snapshot the bridge writes
// (`<repo root>/.wxai/agent-room-panel.json`, `status` field), and trusts it only while the
// Project Agent's lock says the agent runs. No network, no token, nothing written.

/** `20261027T201500123Z.md` → its ISO time, or undefined. */
function handoffNameTime(name: string): string | undefined {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z\.md$/.exec(name);
  if (!m) return undefined;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.${m[7]}Z`;
  return Number.isNaN(Date.parse(iso)) ? undefined : iso;
}

/** Pending handoffs: names only, regular files only (never a symlink). The folder is the queue. */
export function pendingHandoffs(repoRoot: string): PendingHandoffs {
  const dir = handoffDir(repoRoot);
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return { count: 0 };
  }
  const times: string[] = [];
  for (const name of names) {
    if (!HANDOFF_NAME_RE.test(name)) continue;
    try {
      if (!lstatSync(join(dir, name)).isFile()) continue;
    } catch {
      continue;
    }
    const at = handoffNameTime(name);
    if (at) times.push(at);
  }
  times.sort();
  return times.length ? { count: times.length, oldestAt: times[0] } : { count: 0 };
}

const AGENT_STATES: readonly StatusAgentState[] = ["starting", "idle", "working", "waiting"];

/** The snapshot's `status` field, checked field by field; anything malformed is dropped. */
export function readStatusMemory(repoRoot: string): StatusMemory | undefined {
  let raw: unknown;
  try {
    raw = (JSON.parse(readFileSync(join(repoRoot, PANEL_SNAPSHOT_REL), "utf8")) as { status?: unknown }).status;
  } catch {
    return undefined;
  }
  if (!raw || typeof raw !== "object") return undefined;
  const s = raw as Record<string, unknown>;
  if (!AGENT_STATES.includes(s.state as StatusAgentState)) return undefined;
  const mem: StatusMemory = { state: s.state as StatusAgentState, runActive: s.runActive === true, paused: s.paused === true };
  if (typeof s.awaitingGo === "number" && Number.isFinite(s.awaitingGo)) mem.awaitingGo = s.awaitingGo;
  const q = s.question as Record<string, unknown> | undefined;
  if (q && typeof q.who === "string" && typeof q.text === "string") mem.question = { who: q.who, text: q.text };
  return mem;
}

/** The room's fill: the bridge is running, so its memory is the truth. */
export function statusFromBridge(repoRoot: string, memory: StatusMemory, now: Date): string[] {
  return buildStatus({ agentRunning: true, memory, handoffs: pendingHandoffs(repoRoot), run: loadAutopilotState(repoRoot) }, now);
}

/** The local session's fill, agent up or down. With the agent down, only what the disk shows. */
export function statusFromDisk(repoRoot: string, now: Date, pidAlive?: (pid: number) => boolean): string[] {
  const agentRunning = projectAgentLive(repoRoot, pidAlive);
  return buildStatus(
    {
      agentRunning,
      memory: agentRunning ? readStatusMemory(repoRoot) : undefined,
      handoffs: pendingHandoffs(repoRoot),
      run: loadAutopilotState(repoRoot),
    },
    now,
  );
}
// [SCOPE 159 / T023] END
