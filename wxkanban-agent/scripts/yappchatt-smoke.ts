/* eslint-disable no-console */
// [SCOPE 102 / T001] BEGIN — YappChatt live connectivity smoke (manual)
// Opt-in manual check: resolves config from the repo-root .env, connects the
// ported YappchattClient to the private room, prints history + live frames, posts
// the "Claude on project <name> is connected" announce, and confirms the echo
// round-trips. Logs NO secrets (only message text/from + status).
// Run: `npx ts-node scripts/yappchatt-smoke.ts`.
import { existsSync, readFileSync } from "fs";
import { basename, join } from "path";
import { YappchattClient, resolveYappchattConfig } from "../core/yappchatt";

const REPO_ROOT = join(__dirname, "..", "..");

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
    // strip inline comments (whitespace + #...), trailing ws, then surrounding quotes
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
  if (!process.env.YAPPCHATT_EMAIL && !process.env.WXKANBAN_CHAT_EMAIL) process.env.YAPPCHATT_EMAIL = "andy@wxperts.com";

  const { config, user } = resolveYappchattConfig();
  const announce = `Claude on project ${projectName()} is connected`;
  console.log(`[smoke] room=${config.conversationId} email=${user.email}`);
  console.log(`[smoke] app=${config.wxkanbanBaseUrl} yappchat=${config.yappchatBaseUrl} ws=${config.wsUrl}`);

  let announced = false;
  let sendOk: boolean | undefined;
  let echoed = false;

  // Forward reference: handlers close over `client`, which is assigned just below
  // and is set before onStatus('connected') can fire (start() runs after).
  let client: YappchattClient;
  client = new YappchattClient(config, user, {
    onStatus: (s, d) => {
      console.log(`[status] ${s}${d ? " — " + d : ""}`);
      if (s === "connected" && !announced) {
        announced = true;
        console.log(`[smoke] announcing: "${announce}"`);
        void client.send(announce).then((ok) => {
          sendOk = ok;
          console.log(`[smoke] send returned ${ok}`);
        });
      }
    },
    onHistory: (msgs) => {
      console.log(`[history] ${msgs.length} message(s)`);
      for (const m of msgs.slice(-5)) console.log(`   · ${m.from}: ${m.text}`);
    },
    onMessage: (m) => {
      console.log(`[live] ${m.from}${m.mine ? " (me)" : ""}: ${m.text}`);
      if (m.text === announce) echoed = true;
    },
    onTyping: () => undefined,
    onError: (e) => console.log(`[error] ${e}`),
  });

  await client.start();
  await new Promise((r) => setTimeout(r, 8000));

  // Symmetric teardown notice (mirrors the FR-009 "remote ended" post).
  const bye = `Claude on project ${projectName()} is disconnected`;
  console.log(`[smoke] posting disconnect: "${bye}"`);
  await client.send(bye);
  await new Promise((r) => setTimeout(r, 1500));

  client.dispose();
  console.log(`[smoke] result: announced=${announced} sendOk=${sendOk} echoRoundTrip=${echoed}`);
  process.exit(echoed ? 0 : 1);
}

void main();
// [SCOPE 102 / T001] END
