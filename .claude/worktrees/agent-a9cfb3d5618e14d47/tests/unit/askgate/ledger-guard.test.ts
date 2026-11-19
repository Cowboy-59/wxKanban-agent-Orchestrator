// SPEC-142 / T003 — the hook that denies direct agent writes to decisions/ledger.yaml.
//
// Deny must hold for every write route (edit tools and shell), and must NOT fire on reads or on
// the ledger script's own command. Written directly: the fencer rejects test files with no
// top-level declaration.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { DENY_MESSAGE, bashWritesLedger, decideLedgerGuard } from "../../../_wxAI/askgate/hook-ledger-guard.mjs";

const HOOK = join(process.cwd(), "_wxAI", "askgate", "hook-ledger-guard.mjs");
const call = (tool_name: string, tool_input: object) => ({ hook_event_name: "PreToolUse", tool_name, tool_input });
const denied = (out: unknown) => (out as { hookSpecificOutput?: { permissionDecision?: string } } | null)?.hookSpecificOutput?.permissionDecision === "deny";

describe("edit tools", () => {
  it.each([
    ["Edit", { file_path: "E:\\proj\\decisions\\ledger.yaml", old_string: "a", new_string: "b" }],
    ["Write", { file_path: "/e/proj/decisions/ledger.yaml", content: "x" }],
    ["Write", { file_path: "decisions/ledger.yaml", content: "x" }],
    ["MultiEdit", { file_path: "C:/p/decisions/ledger.yaml", edits: [] }],
    ["NotebookEdit", { notebook_path: "decisions/ledger.yaml", new_source: "x" }],
  ])("denies %s on the ledger and names the script", (tool, input) => {
    const out = decideLedgerGuard(call(tool, input));
    expect(denied(out)).toBe(true);
    expect(JSON.stringify(out)).toContain("_wxAI/askgate/ledger.mjs");
    expect(DENY_MESSAGE).toContain("_wxAI/askgate/ledger.mjs");
  });

  it.each([
    ["Write", { file_path: "decisions/settings.yaml", content: "x" }],
    ["Write", { file_path: "decisions/assumptions.yaml", content: "x" }],
    ["Edit", { file_path: "docs/ledger.yaml", old_string: "a", new_string: "b" }],
    ["Write", { file_path: "decisions/ledger.yaml.md", content: "x" }],
    ["Read", { file_path: "decisions/ledger.yaml" }],
  ])("allows %s on %j", (tool, input) => {
    expect(decideLedgerGuard(call(tool, input))).toBeNull();
  });
});

describe("Bash", () => {
  it.each([
    "echo '- id: D-0009' >> decisions/ledger.yaml",
    "echo x > decisions/ledger.yaml",
    "echo x>decisions\\ledger.yaml",
    'cat entry.yaml >> "E:/proj/decisions/ledger.yaml"',
    "cat entry.yaml | tee -a decisions/ledger.yaml",
    "sed -i 's/Agreed/Declined/' decisions/ledger.yaml",
    "sed -i.bak s/a/b/ decisions/ledger.yaml",
    "mv decisions/ledger.yaml /tmp/old.yaml",
    "mv /tmp/new.yaml decisions/ledger.yaml",
    "cp /tmp/new.yaml decisions/ledger.yaml",
    "rm decisions/ledger.yaml",
    "Set-Content -Path decisions/ledger.yaml -Value x",
    "Add-Content decisions\\ledger.yaml 'x'",
    "echo hi && echo x >> decisions/ledger.yaml",
    `node -e "require('fs').appendFileSync('decisions/ledger.yaml','x')"`,
    // found live (T013, every permission mode): deleting the folder deleted the ledger
    "rm -rf decisions",
    "rm -rf ./decisions/",
    "rm -r decisions/*",
    "mv decisions /tmp/old-decisions",
    "git rm -r decisions",
    "Remove-Item -Recurse -Force decisions",
    'cd /e/proj && rm -rf "E:/proj/decisions"',
  ])("denies: %s", (command) => {
    expect(bashWritesLedger(command)).toBe(true);
    expect(denied(decideLedgerGuard(call("Bash", { command })))).toBe(true);
  });

  it.each([
    "node _wxAI/askgate/ledger.mjs append --file /tmp/e.json --approved-by owner",
    "node _wxAI/askgate/ledger.mjs check --root .",
    "cat decisions/ledger.yaml",
    "grep -n Agreed decisions/ledger.yaml",
    "cat decisions/ledger.yaml > /tmp/copy.yaml",
    "cp decisions/ledger.yaml /tmp/backup.yaml",
    "cat decisions/ledger.yaml | head -20",
    "git status",
    "echo done >> notes.txt",
    "ls decisions",
    "rm -rf decisions-old",
    "rm decisions/scratch.txt",
    "mv notes.txt decisions-archive.txt",
  ])("allows: %s", (command) => {
    expect(bashWritesLedger(command)).toBe(false);
    expect(decideLedgerGuard(call("Bash", { command }))).toBeNull();
  });
});

describe("as a hook process", () => {
  const run = (input: object) => spawnSync(process.execPath, [HOOK], { input: JSON.stringify(input), encoding: "utf8" });

  it("prints the deny JSON for a ledger write", () => {
    const r = run(call("Write", { file_path: "decisions/ledger.yaml", content: "x" }));
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.hookSpecificOutput).toMatchObject({ hookEventName: "PreToolUse", permissionDecision: "deny" });
    expect(out.hookSpecificOutput.permissionDecisionReason).toContain("_wxAI/askgate/ledger.mjs");
  });

  it("prints nothing for an unrelated call and for garbage input", () => {
    expect(run(call("Write", { file_path: "src/a.ts", content: "x" })).stdout).toBe("");
    const bad = spawnSync(process.execPath, [HOOK], { input: "not json", encoding: "utf8" });
    expect(bad.status).toBe(0);
    expect(bad.stdout).toBe("");
  });
});
