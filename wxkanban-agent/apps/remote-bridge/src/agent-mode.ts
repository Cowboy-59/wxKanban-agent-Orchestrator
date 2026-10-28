/* eslint-disable no-console */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { resolveApiToken } from "../../../core/http/mcp-client";

// [SCOPE 134 / T030] BEGIN — project-agent mode (SCOPE-132 Amendment A, FR-030/031)
//
// The kit provides one agent per project. It runs on this bridge in the project's own
// working tree, manages the project, and is supervised by KAIN through the project's
// room. It authenticates with the project's own kit API token — no company ticket ever
// sits in a project repo — and the server answers with the room (derived from the
// token, FR-013), a room token minted once (FR-015), and a short-lived bound MCP token
// for filing gate decisions.
//
// Enabled by `--project-agent` (the kit's `project-agent` script and the Cockpit use
// it). Without it the bridge runs exactly as SCOPE-102 built it: operator-driven.

export interface ProjectAgentConfig {
  /** The project's kit API token. Never logged. */
  projectToken: string;
  /** The supervising agent whose room this is and whose [TAG] messages are input. */
  supervisor: string;
  appBaseUrl: string;
  mcpUrl: string;
}

export function readProjectAgentConfig(
  argv: string[],
  env: NodeJS.ProcessEnv,
  repoRoot: string,
): ProjectAgentConfig | null {
  if (!argv.includes("--project-agent")) return null;
  const projectToken = resolveApiToken({ projectRoot: repoRoot, env });
  if (!projectToken) {
    throw new Error(
      "Project agent needs this project's kit API token (.wxai/project.json kit.apiToken, or WXKANBAN_API_TOKEN). Run 'wxkanban-agent kit:configure --token <token>'.",
    );
  }
  const supervisor = (env.WXKANBAN_SUPERVISOR || "KAIN").trim();
  if (!/^[A-Za-z][A-Za-z0-9_-]{1,63}$/.test(supervisor)) {
    throw new Error(`WXKANBAN_SUPERVISOR "${supervisor}" is not a valid agent name.`);
  }
  return {
    projectToken,
    supervisor,
    appBaseUrl: (env.WXKANBAN_APP_BASE_URL || "https://wxkanban.wxperts.com").replace(/\/$/, ""),
    mcpUrl: (env.WXKANBAN_MCP_URL || "https://mcp.wxperts.com").replace(/\/$/, ""),
  };
}

export interface ProjectAgentConnection {
  projectId: string;
  projectName: string;
  /** The audit identity record_override checks the bound token against. */
  agentName: string;
  conversationId: string;
  yappchattToken: string;
  operatorEmail: string;
  mcpToken: string;
  mcpExpiresAt: string;
}

interface RoomResponse {
  projectId: string;
  projectName: string;
  agentName: string;
  mcp: { token: string; expiresAt: string };
  room: { conversationId: string; agentToken?: string; minted: boolean; operatorEmail: string };
}

/**
 * Where the project agent keeps its yca_ token. The server deliberately stores none
 * (migration 0068): YappChatt never revokes, so the one copy lives with the agent. Gitignored.
 */
export function roomStatePath(repoRoot: string): string {
  return join(repoRoot, ".wxai", "agent-room.json");
}

type RoomState = Record<string, { conversationId: string; token: string }>;

function readRoomState(path: string): RoomState {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as RoomState;
  } catch {
    return {};
  }
}

function writeRoomState(path: string, state: RoomState): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2), { encoding: "utf-8", mode: 0o600 });
}

async function postRoom(cfg: ProjectAgentConfig, mintAgentToken: boolean): Promise<RoomResponse> {
  const res = await fetch(`${cfg.appBaseUrl}/api/project-agent/room`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${cfg.projectToken}` },
    body: JSON.stringify({ supervisor: cfg.supervisor, ...(mintAgentToken ? { mintAgentToken: true } : {}) }),
  });
  const text = await res.text();
  if (!res.ok) {
    // Surfaced plainly and not retried (FR-016): an invalid token or not_a_member is not
    // something a retry can fix.
    throw new Error(`project agent room refused (${res.status}): ${text.slice(0, 300)}`);
  }
  return JSON.parse(text) as RoomResponse;
}

/**
 * Bind the project agent's room. Mints a yca_ token only when this machine holds none
 * for the room — so connect count never grows the token count (SC-5).
 */
export async function connectProjectAgent(cfg: ProjectAgentConfig, repoRoot: string): Promise<ProjectAgentConnection> {
  const statePath = roomStatePath(repoRoot);
  const state = readRoomState(statePath);
  const key = `project-agent:${cfg.supervisor}`;

  let r = await postRoom(cfg, false);
  let token = r.room.agentToken;
  if (!token) {
    const held = state[key];
    if (held && held.conversationId === r.room.conversationId) {
      token = held.token;
    } else {
      // Bound room, but no copy here (new machine, wiped state). One deliberate mint.
      r = await postRoom(cfg, true);
      token = r.room.agentToken;
    }
  }
  if (!token) throw new Error("project agent room returned no room token and none is held locally");

  if (r.room.minted) {
    state[key] = { conversationId: r.room.conversationId, token };
    writeRoomState(statePath, state);
  }

  return {
    projectId: r.projectId,
    projectName: r.projectName,
    agentName: r.agentName,
    conversationId: r.room.conversationId,
    yappchattToken: token,
    operatorEmail: r.room.operatorEmail,
    mcpToken: r.mcp.token,
    mcpExpiresAt: r.mcp.expiresAt,
  };
}

// [SCOPE 148 / T012] BEGIN — the sink gate and the per-run MCP token refresh (SPEC-148 FR-001)
//
// A triage trigger needs two things from the app, both derived server-side from the project's
// own kit token and never from anything this process claims:
//
//   feedbackSink   whether this project IS the feedback sink, so a schedule may be armed at all
//   mcpToken       a FRESH bound MCP token for the run that is about to start
//
// The token is the part that is easy to get wrong. `connectProjectAgent` returns a short-lived
// one, and the bridge is not short-lived: an agent up for a week would hand every 06:00 run the
// token it was given on the day it started, every MCP call in the run would fail auth, and the
// room would get "Feedback triage failed" each morning for a reason nobody could see. So a run
// takes a new token seconds before it starts instead of reusing the connect-time copy.
//
// Refreshing goes back through the same room route, which re-checks `allowremote` on the way —
// so revoking remote on the sink project stops triage by itself, with nothing else to switch off.
// `mintAgentToken` stays false: refreshing must never grow the YappChatt token count (SC-5).

export interface ProjectAgentSettings {
  allowRemote: boolean;
  /** True only when the token's project is the feedback sink (the server decides, FR-001). */
  feedbackSink: boolean;
}

/**
 * Read the project agent's server-side settings. An older app that predates SPEC-148 T006
 * returns no `feedbackSink` at all; that reads as false, which arms no schedule — the safe
 * direction, and the reason the caller reports "unreachable or not the sink" rather than
 * assuming a missing field means yes.
 */
export async function fetchProjectAgentSettings(cfg: ProjectAgentConfig): Promise<ProjectAgentSettings> {
  const res = await fetch(`${cfg.appBaseUrl}/api/project-agent/settings`, {
    headers: { authorization: `Bearer ${cfg.projectToken}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`project agent settings refused (${res.status}): ${text.slice(0, 300)}`);
  const body = JSON.parse(text) as { allowRemote?: unknown; feedbackSink?: unknown };
  return { allowRemote: body.allowRemote === true, feedbackSink: body.feedbackSink === true };
}

/** A bound MCP token minted for the run about to start. Never logged, never persisted. */
export async function refreshMcpToken(cfg: ProjectAgentConfig): Promise<{ token: string; expiresAt: string }> {
  const r = await postRoom(cfg, false);
  if (!r.mcp?.token) throw new Error("the room route returned no MCP token");
  return { token: r.mcp.token, expiresAt: r.mcp.expiresAt };
}
// [SCOPE 148 / T012] END

/**
 * FR-032: the tag is the only thing telling the project agent from its supervisor in a
 * room where YappChatt makes them one user. A project agent tagged like its supervisor
 * would obey its own posts, so that combination refuses to start.
 */
export function assertDistinctTag(projectTag: string, supervisor: string): void {
  if (projectTag.trim().toLowerCase() === supervisor.trim().toLowerCase()) {
    throw new Error(
      `Refusing to start: the project agent would tag its posts [${projectTag}], the same as its supervisor. Set YAPPCHATT_DISPLAY_NAME to something else.`,
    );
  }
}
// [SCOPE 134 / T030] END

// [SCOPE 134 / T022] BEGIN — one agent per working tree (FR-026)
//
// Refuse, do not warn. The failure this prevents is silent — two sessions editing one
// tree surface later as a confusing diff, never as an error — so a warning that can be
// clicked through protects nothing. The lock is a file holding the owner's pid; a lock
// whose pid is gone is stale and is taken over, so a crash never wedges the tree.

export function lockPath(repoRoot: string): string {
  return join(repoRoot, ".wxai", "remote-session.lock");
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means it exists but belongs to someone else — alive.
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

export interface WorktreeLock {
  release(): void;
}

export function acquireWorktreeLock(repoRoot: string, owner: string, pid: number = process.pid): WorktreeLock {
  const path = lockPath(repoRoot);
  if (existsSync(path)) {
    let held: { pid?: number; owner?: string; since?: string } = {};
    try {
      held = JSON.parse(readFileSync(path, "utf-8")) as typeof held;
    } catch {
      held = {};
    }
    if (typeof held.pid === "number" && held.pid !== pid && pidAlive(held.pid)) {
      throw new Error(
        `Refusing to start: ${held.owner ?? "another session"} (pid ${held.pid}, since ${held.since ?? "?"}) ` +
          `is already active on this working tree. One agent per tree (SCOPE-132 FR-026).`,
      );
    }
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ pid, owner, since: new Date().toISOString() }), "utf-8");
  return {
    release() {
      try {
        const cur = JSON.parse(readFileSync(path, "utf-8")) as { pid?: number };
        if (cur.pid === pid) unlinkSync(path);
      } catch {
        /* already gone */
      }
    },
  };
}
// [SCOPE 134 / T022] END

// [SCOPE 134 / T019] BEGIN — record the outcome after the room answers
// MODIFIED-BY: [SCOPE 148 / T012] — returns the HTTP status, so a 401 can renew the token and retry (FR-016)
//
// The MCP is the RECORD, not the mechanism (FR-004): the decision was already made in
// the room and enforced by canUseTool. Recording is best-effort by design — a failed
// record must never turn a refusal into an allow or hold a granted action hostage — but
// it is never silent: a failure is logged loudly and returned.

export interface OverrideRecord {
  projectId: string;
  agentName: string;
  sessionId?: string;
  action: "gitpush" | "prodatawrite";
  granted: boolean;
  grantedBy?: string;
  requestText: string;
}

export async function recordOverride(
  mcpUrl: string,
  mcpToken: string,
  rec: OverrideRecord,
): Promise<{ ok: boolean; detail: string; status?: number }> {
  const args: Record<string, unknown> = {
    projectId: rec.projectId,
    agentName: rec.agentName,
    action: rec.action,
    outcome: rec.granted ? "granted" : "denied",
    requestText: rec.requestText.slice(0, 4000),
  };
  if (rec.sessionId) args.sessionId = rec.sessionId.slice(0, 64);
  if (rec.grantedBy) args.grantedBy = rec.grantedBy.slice(0, 200);

  try {
    const res = await fetch(`${mcpUrl}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${mcpToken}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: { name: "project.record_override", arguments: args },
      }),
    });
    const body = await res.text();
    const ok = res.ok && /\\?"success\\?"\s*:\s*true/.test(body);
    if (!ok) console.error(`[override] record FAILED (${res.status}): ${body.slice(0, 300)}`);
    return { ok, detail: body.slice(0, 500), status: res.status };
  } catch (err) {
    console.error(`[override] record FAILED: ${(err as Error).message}`);
    return { ok: false, detail: (err as Error).message };
  }
}
// [SCOPE 134 / T019] END

// [SCOPE 145 / T006] BEGIN — fixed lines the Cockpit reads (SPEC-145 FR-005)
/** Printed once the "connected" post has landed in the room. Never carries a token. */
export function readyLine(projectName: string): string {
  return `[bridge] ready project=${projectName}`;
}

/** Printed when the agent cannot start, so the Cockpit can name the cause. */
export function refusedLine(code: string): string {
  return `[project-agent] refused ${code}`;
}

/** The worktree lock's refusal code (FR-026). */
export const WORKTREE_LOCKED = "worktree_locked";

/**
 * A short, fixed code for why connecting failed: the server's own error code when the room
 * route answered (`remote_not_allowed`, `no_company_account`, …), `http_<status>` when it gave
 * none, and `unreachable` when no answer came back at all.
 */
export function refusalCode(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const refused = /^project agent room refused \((\d{3})\): ([\s\S]*)$/.exec(message);
  if (!refused) return "unreachable";
  try {
    const body = JSON.parse(refused[2]) as { error?: unknown };
    if (typeof body.error === "string" && /^[a-z][a-z0-9_-]{0,63}$/i.test(body.error)) return body.error;
  } catch {
    /* not JSON: fall back to the status */
  }
  return `http_${refused[1]}`;
}
// [SCOPE 145 / T006] END
