/* eslint-disable no-console */
import { existsSync, readFileSync } from "fs";
import { hostname } from "os"; // [SCOPE 151 / T004]
import { basename, join } from "path";
import { RemoteBridge } from "./bridge";
import { clearRefusal, recordRefusal } from "./agent-status"; // [SCOPE 149 / T010]
import type { YappchattConnection } from "../../../core/yappchatt"; // [SCOPE 150 / T003]
import { noticeRetiredRoomKeys } from "../../../core/bootstrap/retired-room-keys"; // [SCOPE 150 / T006]
import {
  acquireWorktreeLock,
  assertDistinctTag,
  connectProjectAgent,
  readProjectAgentConfig,
  refusalCode,
  refusedLine,
  WORKTREE_LOCKED,
  type WorktreeLock,
} from "./agent-mode"; // [SCOPE 134] [SCOPE 145 / T006]
import { AgentAlreadyConnectedError, ConnectionRecord } from "./connection-record"; // [SCOPE 151 / T004]

// [SCOPE 102 / T004] BEGIN — remote-bridge entry point (the Project Agent)
// MODIFIED-BY: [SCOPE 145 / T006] — fixed refusal lines; stop on SIGBREAK and stdin close; 5 s exit bound
// MODIFIED-BY: [SCOPE 150 / T002] — the plain .env launch is gone: project-agent mode only, room handed over in memory (FR-010, FR-011)
// MODIFIED-BY: [SCOPE 150 / T004] — no seed or resume hooks (FR-012)
// MODIFIED-BY: [SCOPE 150 / T006] — one-time notice for retired room keys in .env (FR-014)
// MODIFIED-BY: [SCOPE 151 / T004] — opens, heartbeats and closes the connection record KAIN reads; another live machine refuses the start (FR-059 – FR-061)
// The bridge runs only as the project's Project Agent: started by the Cockpit
// (bin/project-agent.mjs) or `npm run remote`, both with --project-agent. The room, its token
// and the read identity are fetched with the project's kit token and handed to the bridge in
// memory; no room setting is read from the environment. SIGINT posts the disconnect notice.

// [SCOPE 134 / T032] The launcher passes the project root explicitly: from the compiled
// bundle (wxkanban-agent/dist/) __dirname is a different depth than from src/.
const REPO_ROOT = process.env.WXKANBAN_REPO_ROOT || join(__dirname, "..", "..", "..", "..");

/** SPEC-145 FR-007: the most a clean shutdown may take before the process exits anyway. */
const SHUTDOWN_BOUND_MS = 5000;

/** SPEC-150 FR-010: one plain line when started without project-agent configuration. */
const NOT_PROJECT_AGENT =
  "The remote bridge runs only as the Project Agent. Start it from the Dev Cockpit (wxKanban: Start Project Agent) or run `npm run remote` in wxkanban-agent/.";

// The kit token and the agent's WXKANBAN_* settings (app and MCP URLs, supervisor, model) and
// the optional YAPPCHATT_* endpoint and display-name overrides. Room settings are not read
// from here any more (SPEC-150 FR-011): the agent's own values replace them.
function loadRepoEnv(): void {
  const envPath = join(REPO_ROOT, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const m = /^\s*((?:WXKANBAN|YAPPCHATT)_[A-Z0-9_]+)\s*=\s*(.+)$/.exec(line);
    if (!m) continue;
    const key = m[1];
    const val = m[2]
      .replace(/\s+#.*$/, "")
      .trim()
      .replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function projectName(): string {
  if (process.env.WXKANBAN_PROJECT_NAME) return process.env.WXKANBAN_PROJECT_NAME;
  const wxai = join(REPO_ROOT, ".wxai", "project.json");
  if (existsSync(wxai)) {
    try {
      const j = JSON.parse(readFileSync(wxai, "utf-8")) as { projectName?: string; name?: string };
      if (j.projectName) return j.projectName;
      if (j.name) return j.name;
    } catch {
      /* fall through */
    }
  }
  return basename(REPO_ROOT);
}

// [SCOPE 151 / T004] The kit version for the connection record, read the way the kit update check
// reads it (kitVersion, else version, in the project config). Null when unknown, never guessed.
function kitVersion(): string | null {
  try {
    const j = JSON.parse(readFileSync(join(REPO_ROOT, ".wxai", "project.json"), "utf-8")) as Record<string, unknown>;
    const v = j["kitVersion"] ?? j["version"];
    return typeof v === "string" && v.trim() ? v.trim().slice(0, 50) : null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  loadRepoEnv();
  noticeRetiredRoomKeys(REPO_ROOT); // [SCOPE 150 / T006] stderr: stdout carries the refusal lines

  // [SCOPE 134 / T030, T022, T023] BEGIN — project-agent mode (Amendment A)
  // MODIFIED-BY: [SCOPE 145 / T006] — prints `[project-agent] refused <code>` the Cockpit can match
  // MODIFIED-BY: [SCOPE 148 / T012] — hands the bridge the token's expiry, for the shared holder (FR-016)
  // MODIFIED-BY: [SCOPE 149 / T010] — records the start refusal in .wxai/project-agent-status.json and clears it on bind (FR-002)
  // MODIFIED-BY: [SCOPE 150 / T002, T003] — the only mode; the connection goes to the bridge in memory, not process.env (FR-010, FR-011)
  // MODIFIED-BY: [SCOPE 151 / T004] — opens the connection record after the room binds; agent_already_connected refuses the start (FR-059)
  // The kit's per-project agent. Everything an operator used to paste by hand is fetched
  // with the project's own kit token instead: the room (derived server-side), a room token
  // minted once and kept locally, the read identity, and a bound MCP token for filing
  // gate decisions.
  let lock: WorktreeLock | undefined;
  let agent:
    { name: string; projectId: string; mcpUrl: string; mcpToken: string; mcpExpiresAt?: string }
    | undefined;
  let supervisor: string | undefined;
  let connection: YappchattConnection | undefined;
  let record: ConnectionRecord | undefined; // [SCOPE 151 / T004]
  let paCfg: ReturnType<typeof readProjectAgentConfig> = null;
  try {
    paCfg = readProjectAgentConfig(process.argv, process.env, REPO_ROOT);
  } catch (err) {
    console.error(`[project-agent] ${(err as Error).message}`);
    process.exit(2);
  }
  if (!paCfg) {
    console.error(NOT_PROJECT_AGENT);
    process.exit(2);
  }
  // FR-026: refuse, before anything connects, if another session holds this tree.
  try {
    lock = acquireWorktreeLock(REPO_ROOT, "project agent");
  } catch (err) {
    console.error((err as Error).message);
    process.stdout.write(`${refusedLine(WORKTREE_LOCKED)}\n`);
    recordRefusal(REPO_ROOT, WORKTREE_LOCKED);
    process.exit(3);
  }
  try {
    const conn = await connectProjectAgent(paCfg, REPO_ROOT);
    const tag = process.env.YAPPCHATT_DISPLAY_NAME || conn.projectName;
    assertDistinctTag(tag, paCfg.supervisor); // FR-032
    // [SCOPE 151 / T004] FR-059: only another live machine (409) stops the start; any other
    // failure warns and the agent runs without a record.
    record = new ConnectionRecord(
      { appBaseUrl: paCfg.appBaseUrl, projectToken: paCfg.projectToken, supervisor: paCfg.supervisor },
      { machine: hostname(), repo: basename(REPO_ROOT), agentTag: tag, kitVersion: kitVersion() },
    );
    await record.open();
    clearRefusal(REPO_ROOT);
    // The post prefix follows the display name: every post reads [<project>] (FR-018).
    connection = {
      conversationId: conn.conversationId,
      yappchatToken: conn.yappchattToken,
      email: conn.operatorEmail,
      displayName: tag,
    };
    process.env.WXKANBAN_PROJECT_NAME = conn.projectName;
    supervisor = paCfg.supervisor;
    // [SCOPE 148 / T012] mcpExpiresAt seeds the bridge's token holder (FR-016).
    agent = {
      name: conn.agentName,
      projectId: conn.projectId,
      mcpUrl: paCfg.mcpUrl,
      mcpToken: conn.mcpToken,
      mcpExpiresAt: conn.mcpExpiresAt,
    };
    console.info(
      `[project-agent] ${conn.projectName} bound to room ${conn.conversationId.slice(0, 8)}..., supervised by ${supervisor}`,
    );
  } catch (err) {
    console.error(`[project-agent] ${(err as Error).message}`);
    // SPEC-145 FR-005: one fixed line naming the cause (remote_not_allowed, no_company_account, …).
    const code = err instanceof AgentAlreadyConnectedError ? err.code : refusalCode(err); // [SCOPE 151 / T004]
    process.stdout.write(`${refusedLine(code)}\n`);
    recordRefusal(REPO_ROOT, code);
    lock?.release();
    process.exit(4);
  }
  // [SCOPE 134 / T030, T022, T023] END

  const bridge = new RemoteBridge({
    projectName: projectName(),
    cwd: REPO_ROOT,
    model: process.env.WXKANBAN_REMOTE_MODEL,
    connection, // [SCOPE 150 / T003]
    agent, // [SCOPE 134 / T019]
    supervisor, // [SCOPE 134 / T031]
    // [SCOPE 148 / T012] The config, not just the connect-time token: the bridge outlives the
    // short-lived token above, so its holder renews through this config (FR-016).
    projectAgentConfig: paCfg,
  });
  record?.startHeartbeat(() => bridge.connectionState()); // [SCOPE 151 / T004] FR-060

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stdout.write(`\n[bridge] ${signal} — shutting down\n`);
    // SPEC-145 FR-007: a disconnect post that hangs must not keep the process (and the
    // worktree lock) alive; the lock is also released on exit below.
    setTimeout(() => process.exit(0), SHUTDOWN_BOUND_MS).unref();
    // [SCOPE 151 / T004] FR-061: the record closes alongside the disconnect post, inside the bound.
    void Promise.allSettled([bridge.shutdown(), record?.close()]).finally(() => {
      lock?.release(); // [SCOPE 134 / T022]
      process.exit(0);
    });
  };
  // [SCOPE 134 / T022] CANCEL REMOTE exits from inside the bridge; release on any exit.
  process.on("exit", () => lock?.release());
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  // SPEC-145 FR-007: Windows delivers no SIGTERM to a child (kill() terminates it outright),
  // so the Cockpit stops the agent by closing its stdin instead. Only when it asks for that:
  // a launch whose stdin is already closed must not shut down the moment it starts.
  process.on("SIGBREAK", () => shutdown("SIGBREAK"));
  if (process.env.WXKANBAN_STOP_ON_STDIN_CLOSE === "1") {
    process.stdin.on("end", () => shutdown("stdin closed"));
    process.stdin.on("close", () => shutdown("stdin closed"));
    process.stdin.resume();
  }

  console.log(`[bridge] going remote on project "${projectName()}" (cwd=${REPO_ROOT})`);
  await bridge.run();
}

void main();
// [SCOPE 102 / T004] END
