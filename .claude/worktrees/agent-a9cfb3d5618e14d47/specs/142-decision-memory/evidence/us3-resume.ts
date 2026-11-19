// Recover the owner's room reply to DQ-01 from history (the first run dropped it: the read session
// is the owner's own account, so `mine` is true for the owner's messages; the bridge filters on
// isAgent only), then record it exactly as us3-live.ts would have.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { YappchattClient, resolveYappchattConfig, type YappchattMessage } from "E:/AI_Development/wxperts/wxKanban/wxkanban-agent/core/yappchatt";

const REPO = "E:/AI_Development/wxperts/wxKanban";
const root = process.argv[2];
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
  loadRepoEnv();
  const { config, user } = resolveYappchattConfig();
  let history: YappchattMessage[] = [];
  let done = false;
  const client = new YappchattClient(config, user, {
    onStatus: () => undefined,
    onHistory: (ms) => { history = ms; done = true; },
    onMessage: () => undefined,
    onTyping: () => undefined,
    onError: (e) => say(`room error: ${e}`),
  });
  await client.start();
  for (let i = 0; i < 40 && !done; i++) await new Promise((r) => setTimeout(r, 250));
  const sorted = [...history].sort((a, b) => a.ts - b.ts);
  const askAt = sorted.find((m) => m.isAgent && /Decision needed \(DQ-01\)/.test(m.text))?.ts;
  say(`history: ${sorted.length} messages; DQ-01 post found: ${askAt ? new Date(askAt).toISOString() : "no"}`);
  if (!askAt) { client.dispose(); process.exit(2); }
  const replies = sorted.filter((m) => m.ts > askAt && !m.isAgent && m.text.trim());
  say(`human messages after it: ${replies.length}`);
  for (const r of replies) say(`  ${new Date(r.ts).toISOString()} ${r.from}: ${r.text.slice(0, 160)}`);
  const m = replies[0];
  if (!m) { client.dispose(); process.exit(3); }
  const route = await import(pathToFileURL(join(root, "_wxAI", "askgate", "route.mjs")).href);
  const res = await route.applyOwnerAnswer(root, "DQ-01", m.text, { rationale: "Owner answer in the bridge room (SPEC-142 US3 live test)" });
  say(`applyOwnerAnswer: ${JSON.stringify(res)}`);
  const check = spawnSync(process.execPath, [join(root, "_wxAI", "askgate", "ledger.mjs"), "check", "--root", root], { encoding: "utf-8" });
  say(`ledger check: ${check.stdout.trim()} (exit ${check.status})`);
  if (res.ok) await client.send(`[SPEC-142 live test] Recorded DQ-01 as ${res.ledgerId ?? "(no id)"} in the scratch ledger; it releases ${(res.releases ?? []).join(", ")}. Test complete.`);
  client.dispose();
  process.exit(res.ok ? 0 : 1);
}

main().catch((e) => { process.stderr.write(`[us3] FAILED: ${e instanceof Error ? e.message : e}\n`); process.exit(1); });
