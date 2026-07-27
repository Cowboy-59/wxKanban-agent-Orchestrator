/* eslint-disable no-console */
import { existsSync, readFileSync } from "fs";
import { basename, join } from "path";
import { RemoteBridge } from "./bridge";

// [SCOPE 102 / T004] BEGIN — remote-bridge entry point (GO REMOTE launcher)
// Resolves config from the repo-root .env (tolerant of inline comments), derives the
// project name, and runs the bridge. The GO REMOTE handoff seeds/resumes from the
// current conversation via WXKANBAN_REMOTE_SEED / WXKANBAN_REMOTE_RESUME (set by the
// launcher when "GO REMOTE" is said to Claude). SIGINT posts the disconnect notice.
// Run: `npx ts-node apps/remote-bridge/src/main.ts`.

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");

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
  });

  const shutdown = (signal: string) => {
    console.log(`\n[bridge] ${signal} — shutting down`);
    void bridge.shutdown().finally(() => process.exit(0));
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  console.log(`[bridge] going remote on project "${projectName()}" (cwd=${REPO_ROOT})`);
  await bridge.run();
}

void main();
// [SCOPE 102 / T004] END
