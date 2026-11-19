// SPEC-142 US3 live: a blocker in a --create run parks only its unit, reaches the real room through
// the bridge's own outbox drain and YappChatt client, and the owner's room reply becomes a ledger
// entry through route.mjs. Room credentials load the way the bridge's main.ts loads them and are
// never printed.
//   npx tsx us3-live.ts <scratch project>
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { YappchattClient, resolveYappchattConfig, type YappchattMessage } from "E:/AI_Development/wxperts/wxKanban/wxkanban-agent/core/yappchatt";
import { drainOutbox } from "E:/AI_Development/wxperts/wxKanban/wxkanban-agent/apps/remote-bridge/src/outbox";

const REPO = "E:/AI_Development/wxperts/wxKanban";
const root = process.argv[2];
const WAIT_MS = 20 * 60 * 1000;
const say = (s: string) => process.stdout.write(`[us3] ${s}\n`);

function loadRepoEnv(): void {
  const envPath = join(REPO, "." + "env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const m = /^\s*((?:WXKANBAN|YAPPCHATT)_[A-Z0-9_]+)\s*=\s*(.+)$/.exec(line);
    if (!m) continue;
    const val = m[2].replace(/\s+#.*$/, "").trim().replace(/^["']|["']$/g, "");
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}

async function main() {
  // 1. A --create run with four units in progress, and a live bridge session (this process holds the lock).
  const state = {
    mode: "create", phase: "implement", decisionQueue: [],
    scopes: ["SCOPE-901", "SCOPE-902", "SCOPE-903", "SCOPE-904"].map((key, i) => ({ key, implement: "implementing", helper: `helper-${i + 1}` })),
  };
  mkdirSync(join(root, "docs"), { recursive: true });
  mkdirSync(join(root, ".wxai"), { recursive: true });
  writeFileSync(join(root, "docs", "GOD-State.json"), JSON.stringify(state, null, 2));
  writeFileSync(join(root, ".wxai", "remote-session.lock"), JSON.stringify({ pid: process.pid, owner: "us3-live", since: new Date().toISOString() }));

  // 2. A helper on SCOPE-902 asks a blocker through the real hook process.
  const question = "[SPEC-142 live test, not a real request] May I load the production customer data into the test database for SCOPE-902?";
  const env = { ...process.env, CLAUDE_PROJECT_DIR: root, WXAI_UNATTENDED: "1", WXAI_UNIT: "SCOPE-902" };
  delete env.WXAI_REMOTE;
  const hook = spawnSync(process.execPath, [join(root, "_wxAI", "askgate", "hook-tool.mjs")], {
    input: JSON.stringify({ session_id: "us3-live", hook_event_name: "PreToolUse", tool_name: "AskUserQuestion", cwd: root, tool_input: { questions: [{ question, header: "Prod data", options: [{ label: "Yes" }, { label: "No" }] }] } }),
    env, encoding: "utf-8",
  });
  const out = JSON.parse(hook.stdout || "{}");
  say(`hook decision: ${out.hookSpecificOutput?.permissionDecision ?? "none"}`);
  say(`hook reason: ${String(out.hookSpecificOutput?.permissionDecisionReason ?? "").split("\n").slice(0, 4).join(" | ")}`);
  const after = JSON.parse(readFileSync(join(root, "docs", "GOD-State.json"), "utf-8"));
  say(`units: ${after.scopes.map((s: { key: string; implement: string }) => `${s.key}=${s.implement}`).join(", ")}`);
  say(`queue: ${JSON.stringify(after.decisionQueue.map((q: { id: string; blocks: string[]; status: string }) => ({ id: q.id, blocks: q.blocks, status: q.status })))}`);
  const outbox = join(root, ".wxai", "room-outbox.jsonl");
  say(`outbox lines: ${existsSync(outbox) ? readFileSync(outbox, "utf-8").trim().split("\n").length : 0}`);
  const dqId = after.decisionQueue[0]?.id;
  if (!dqId) throw new Error("nothing was queued");

  // 3. The bridge's drain posts the outbox line through the real room client.
  loadRepoEnv();
  const { config, user } = resolveYappchattConfig();
  let connected = false;
  let resolveReply: (m: YappchattMessage) => void = () => undefined;
  const reply = new Promise<YappchattMessage>((r) => (resolveReply = r));
  let posted = false;
  const client = new YappchattClient(config, user, {
    onStatus: (s) => { if (s === "connected") connected = true; },
    onHistory: () => undefined,
    onMessage: (m) => { if (posted && !m.isAgent && !m.mine && m.text.trim()) resolveReply(m); },
    onTyping: () => undefined,
    onError: (e) => say(`room error: ${e}`),
  });
  await client.start();
  for (let i = 0; i < 40 && !connected; i++) await new Promise((r) => setTimeout(r, 250));
  say(`room connected: ${connected}`);
  const n = await drainOutbox(root, (t) => client.send(t));
  posted = n > 0;
  say(`drained to the room: ${n} line(s); outbox left: ${existsSync(outbox) ? readFileSync(outbox, "utf-8").trim().length : 0} chars`);
  if (!posted) throw new Error("the blocker was not posted");
  await client.send(`[SPEC-142 live test] Reply in this room with your answer to ${dqId} (any words). It will be written to the scratch project's decision ledger only, not to wxKanban.`);

  // 4. The owner's room reply becomes a ledger entry through the route script (approved_by: owner).
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), WAIT_MS));
  const m = await Promise.race([reply, timeout]);
  if (!m) { say("no reply within 20 minutes"); client.dispose(); process.exit(2); }
  say(`owner replied (${m.from}): ${m.text.slice(0, 200)}`);
  const route = await import(pathToFileURL(join(root, "_wxAI", "askgate", "route.mjs")).href);
  const r = await route.applyOwnerAnswer(root, dqId, m.text, { rationale: "Owner answer in the bridge room (SPEC-142 US3 live test)" });
  say(`applyOwnerAnswer: ${JSON.stringify(r)}`);
  const check = spawnSync(process.execPath, [join(root, "_wxAI", "askgate", "ledger.mjs"), "check", "--root", root], { encoding: "utf-8" });
  say(`ledger check: ${check.stdout.trim()} (exit ${check.status})`);
  await client.send(`[SPEC-142 live test] Recorded ${dqId} as ${r.ledgerId ?? "(no id)"} in the scratch ledger; it releases ${(r.releases ?? []).join(", ")}. Test complete.`);
  client.dispose();
  process.exit(0);
}

main().catch((e) => { process.stderr.write(`[us3] FAILED: ${e instanceof Error ? e.message : e}\n`); process.exit(1); });
