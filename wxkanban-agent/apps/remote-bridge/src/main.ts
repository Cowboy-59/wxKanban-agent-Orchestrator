/* eslint-disable no-console */
import { existsSync, readFileSync } from "fs";
import { basename, join } from "path";
import { RemoteBridge } from "./bridge";
import {
  acquireWorktreeLock,
  assertDistinctTag,
  connectProjectAgent,
  readProjectAgentConfig,
  type WorktreeLock,
} from "./agent-mode"; // [SCOPE 134]

// [SCOPE 102 / T004] BEGIN — remote-bridge entry point (GO REMOTE launcher)
// Resolves config from the repo-root .env (tolerant of inline comments), derives the
// project name, and runs the bridge. The GO REMOTE handoff seeds/resumes from the
// current conversation via WXKANBAN_REMOTE_SEED / WXKANBAN_REMOTE_RESUME (set by the
// launcher when "GO REMOTE" is said to Claude). SIGINT posts the disconnect notice.
// Run: `npx ts-node apps/remote-bridge/src/main.ts`.

// [SCOPE 134 / T032] The launcher passes the project root explicitly: from the compiled
// bundle (wxkanban-agent/dist/) __dirname is a different depth than from src/.
const REPO_ROOT = process.env.WXKANBAN_REPO_ROOT || join(__dirname, "..", "..", "..", "..");

function loadRepoEnv(): void {
  const envPath = join(REPO_ROOT, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    // Both families: the bare YAPPCHATT_* connection vars and the WXKANBAN_* bridge
    // vars. Filtering on the WXKANBAN_ prefix alone would silently skip every
    // canonical connection var and leave the resolver reporting them unset.
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

async function main(): Promise<void> {
  loadRepoEnv();

  // [SCOPE 134 / T030, T022, T023] BEGIN — project-agent mode (Amendment A)
  // The kit's per-project agent. Everything an operator used to paste by hand is fetched
  // with the project's own kit token instead: the room (derived server-side), a room token
  // minted once and kept locally, the read identity, and a bound MCP token for filing
  // gate decisions. Written into process.env so the unchanged SCOPE-102 resolver and
  // bridge pick it up exactly as before.
  let lock: WorktreeLock | undefined;
  let agent: { name: string; projectId: string; mcpUrl: string; mcpToken: string } | undefined;
  let supervisor: string | undefined;
  let paCfg: ReturnType<typeof readProjectAgentConfig> = null;
  try {
    paCfg = readProjectAgentConfig(process.argv, process.env, REPO_ROOT);
  } catch (err) {
    console.error(`[project-agent] ${(err as Error).message}`);
    process.exit(2);
  }
  if (paCfg) {
    // FR-026: refuse, before anything connects, if another session holds this tree.
    try {
      lock = acquireWorktreeLock(REPO_ROOT, "project agent");
    } catch (err) {
      console.error((err as Error).message);
      process.exit(3);
    }
    // FR-020 / SCOPE-102 seed policy: a directive seed is a second autonomous Claude on
    // this tree. The lock is what makes one safe here, so a seed runs only while it is held.
    try {
      const conn = await connectProjectAgent(paCfg, REPO_ROOT);
      const tag = process.env.YAPPCHATT_DISPLAY_NAME || conn.projectName;
      assertDistinctTag(tag, paCfg.supervisor); // FR-032
      process.env.YAPPCHATT_ROOM = conn.conversationId;
      process.env.YAPPCHATT_TOKEN = conn.yappchattToken;
      process.env.YAPPCHATT_EMAIL = conn.operatorEmail;
      // The post prefix follows the display name: every post reads [<project>] (FR-018).
      process.env.YAPPCHATT_DISPLAY_NAME = tag;
      process.env.WXKANBAN_PROJECT_NAME = conn.projectName;
      supervisor = paCfg.supervisor;
      agent = { name: conn.agentName, projectId: conn.projectId, mcpUrl: paCfg.mcpUrl, mcpToken: conn.mcpToken };
      console.info(
        `[project-agent] ${conn.projectName} bound to room ${conn.conversationId.slice(0, 8)}..., supervised by ${supervisor}`,
      );
    } catch (err) {
      console.error(`[project-agent] ${(err as Error).message}`);
      lock?.release();
      process.exit(4);
    }
  }
  // [SCOPE 134 / T030, T022, T023] END

  // Publish the resolved project name so the config resolver can use it as the
  // read session's display name (.wxai/project.json and the repo directory are
  // not visible from core/).
  if (!process.env.WXKANBAN_PROJECT_NAME) process.env.WXKANBAN_PROJECT_NAME = projectName();
  if (!process.env.YAPPCHATT_EMAIL && !process.env.WXKANBAN_CHAT_EMAIL) {
    console.error("YAPPCHATT_EMAIL is not set — cannot identify the operator to YappChatt.");
    process.exit(2);
  }

  const bridge = new RemoteBridge({
    projectName: projectName(),
    cwd: REPO_ROOT,
    model: process.env.WXKANBAN_REMOTE_MODEL,
    seedContext: process.env.WXKANBAN_REMOTE_SEED,
    resumeSessionId: process.env.WXKANBAN_REMOTE_RESUME,
    agent, // [SCOPE 134 / T019]
    supervisor, // [SCOPE 134 / T031]
  });

  const shutdown = (signal: string) => {
    console.log(`\n[bridge] ${signal} — shutting down`);
    void bridge.shutdown().finally(() => {
      lock?.release(); // [SCOPE 134 / T022]
      process.exit(0);
    });
  };
  // [SCOPE 134 / T022] CANCEL REMOTE exits from inside the bridge; release on any exit.
  process.on("exit", () => lock?.release());
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  console.log(`[bridge] going remote on project "${projectName()}" (cwd=${REPO_ROOT})`);
  await bridge.run();
}

void main();
// [SCOPE 102 / T004] END
