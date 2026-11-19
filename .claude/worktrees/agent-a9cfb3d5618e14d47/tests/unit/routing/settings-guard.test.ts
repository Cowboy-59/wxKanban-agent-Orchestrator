// SPEC-143 / T008, T029 — the hook that denies agent writes to the models: section of
// decisions/settings.yaml, while allowing edits to other sections (allowedProviders: retired).
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DENY_BASH_MESSAGE, DENY_MESSAGE, bashWritesSettings, changesProtected, decideSettingsGuard } from "../../../_wxAI/routing/hook-settings-guard.mjs";

const HOOK = join(process.cwd(), "_wxAI", "routing", "hook-settings-guard.mjs");
const CURRENT = [
  "gate:",
  "  mode: observe",
  "  matchThreshold: 0.75",
  "minimalCode:",
  "  level: on",
  "models:",
  "  tiers:",
  "    easy: claude-haiku-5-5",
  "  commands:",
  "    dbpush: easy",
  "links: []",
  "",
].join("\n");

let root = "";
const settingsPath = () => join(root, "decisions", "settings.yaml");
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "routing-guard-"));
  mkdirSync(join(root, "decisions"), { recursive: true });
  writeFileSync(settingsPath(), CURRENT);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const call = (tool_name: string, tool_input: object) => ({ hook_event_name: "PreToolUse", tool_name, tool_input, cwd: root });
const denied = (out: unknown) => (out as { hookSpecificOutput?: { permissionDecision?: string } } | null)?.hookSpecificOutput?.permissionDecision === "deny";

describe("edit tools", () => {
  it.each([
    ["Edit models tier", "Edit", { old_string: "easy: claude-haiku-5-5", new_string: "easy: llama-4-scout" }],
    ["Edit command tier", "Edit", { old_string: "dbpush: easy", new_string: "dbpush: heavy" }],
    ["Edit removing models", "Edit", { old_string: "models:\n  tiers:\n    easy: claude-haiku-5-5\n  commands:\n    dbpush: easy\n", new_string: "" }],
    ["Edit adding to models via the next line", "Edit", { old_string: "    dbpush: easy\n", new_string: "    dbpush: easy\n    implement: easy\n" }],
    ["Write changing models", "Write", { content: CURRENT.replace("claude-haiku-5-5", "claude-opus-5-5") }],
    ["MultiEdit with one protected edit", "MultiEdit", { edits: [{ old_string: "mode: observe", new_string: "mode: enforce" }, { old_string: "dbpush: easy", new_string: "dbpush: heavy" }] }],
    ["NotebookEdit", "NotebookEdit", { new_source: "x" }],
  ])("denies: %s", (_name, tool, input) => {
    const out = decideSettingsGuard(call(tool as string, { file_path: settingsPath(), notebook_path: tool === "NotebookEdit" ? settingsPath() : undefined, ...(input as object) }));
    expect(denied(out)).toBe(true);
    expect(JSON.stringify(out)).toContain("Only the project owner changes it");
  });

  it.each([
    ["Edit gate.mode", "Edit", { old_string: "mode: observe", new_string: "mode: enforce" }],
    ["Edit minimalCode", "Edit", { old_string: "level: on", new_string: "level: lite" }],
    ["Edit links", "Edit", { old_string: "links: []", new_string: "links:\n  - ../wxHub" }],
    ["Write changing only gate", "Write", { content: CURRENT.replace("matchThreshold: 0.75", "matchThreshold: 0.9") }],
    ["Write adding a comment inside models", "Write", { content: CURRENT.replace("  tiers:", "  # tiers are owner-set\n  tiers:") }],
    ["MultiEdit on other sections", "MultiEdit", { edits: [{ old_string: "mode: observe", new_string: "mode: enforce" }, { old_string: "level: on", new_string: "level: off" }] }],
  ])("allows: %s", (_name, tool, input) => {
    expect(decideSettingsGuard(call(tool as string, { file_path: settingsPath(), ...(input as object) }))).toBeNull();
  });

  it("denies creating a settings file that has a models section, allows one that has not", () => {
    rmSync(settingsPath());
    expect(denied(decideSettingsGuard(call("Write", { file_path: settingsPath(), content: "models:\n  tiers:\n    easy: x\n" })))).toBe(true);
    expect(decideSettingsGuard(call("Write", { file_path: settingsPath(), content: "gate:\n  mode: enforce\n" }))).toBeNull();
  });

  it("resolves a relative path against the hook's cwd", () => {
    expect(denied(decideSettingsGuard(call("Edit", { file_path: "decisions/settings.yaml", old_string: "dbpush: easy", new_string: "dbpush: heavy" })))).toBe(true);
    expect(decideSettingsGuard(call("Edit", { file_path: "decisions\\settings.yaml", old_string: "mode: observe", new_string: "mode: enforce" }))).toBeNull();
  });

  it("an edit it cannot place is denied when it names a protected section, allowed otherwise", () => {
    expect(denied(decideSettingsGuard(call("Edit", { file_path: settingsPath(), old_string: "models:\n  tiers: {}", new_string: "" })))).toBe(true);
    expect(decideSettingsGuard(call("Edit", { file_path: settingsPath(), old_string: "mode: nothing-like-this", new_string: "mode: enforce" }))).toBeNull();
  });

  it("ignores other files and reads", () => {
    expect(decideSettingsGuard(call("Write", { file_path: join(root, "decisions", "assumptions.yaml"), content: "models: x" }))).toBeNull();
    expect(decideSettingsGuard(call("Write", { file_path: join(root, "config", "settings.yaml.bak"), content: "models: x" }))).toBeNull();
    expect(decideSettingsGuard(call("Read", { file_path: settingsPath() }))).toBeNull();
    expect(decideSettingsGuard({ hook_event_name: "PostToolUse", tool_name: "Write", tool_input: { file_path: settingsPath(), content: "" } })).toBeNull();
  });

  it("changesProtected treats comments and blank lines as no change", () => {
    expect(changesProtected(CURRENT, CURRENT.replace("easy: claude-haiku-5-5", "easy: claude-haiku-5-5  # cheapest"))).toBe(false);
    expect(changesProtected(CURRENT, CURRENT + "\n\n")).toBe(false);
  });
});

describe("Bash", () => {
  it.each([
    "echo 'models:' >> decisions/settings.yaml",
    "echo 'gate:' > decisions/settings.yaml",
    "sed -i 's/claude-haiku-5-5/llama/' decisions/settings.yaml",
    "cat x | tee decisions/settings.yaml",
    "cp /tmp/s.yaml decisions/settings.yaml",
    "mv decisions/settings.yaml /tmp/s.yaml",
    "rm decisions/settings.yaml",
    "Set-Content -Path decisions\\settings.yaml -Value x",
    "(Get-Content decisions/settings.yaml) -replace 'a','b' | Set-Content decisions/settings.yaml",
    `node -e "require('fs').writeFileSync('decisions/settings.yaml','')"`,
    "cd decisions && echo x >> settings.yaml",
    "git checkout -- decisions/settings.yaml",
  ])("denies: %s", (command) => {
    expect(bashWritesSettings(command)).toBe(true);
    const out = decideSettingsGuard(call("Bash", { command }));
    expect(denied(out)).toBe(true);
    expect(JSON.stringify(out)).toContain("use the Edit tool");
  });

  it.each([
    "cat decisions/settings.yaml",
    "grep -n models decisions/settings.yaml",
    "cp decisions/settings.yaml /tmp/backup.yaml",
    "cat decisions/settings.yaml > /tmp/copy.yaml",
    "node _wxAI/routing/tiers.mjs --difficulty easy",
    "echo x > src/settings.yaml",
    "ls decisions",
  ])("allows: %s", (command) => {
    expect(bashWritesSettings(command)).toBe(false);
    expect(decideSettingsGuard(call("Bash", { command }))).toBeNull();
  });
});

describe("as a hook process", () => {
  const run = (input: object | string) => spawnSync(process.execPath, [HOOK], { input: typeof input === "string" ? input : JSON.stringify(input), encoding: "utf8" });

  it("prints the deny JSON for a models edit", () => {
    const r = run(call("Edit", { file_path: settingsPath(), old_string: "dbpush: easy", new_string: "dbpush: heavy" }));
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.hookSpecificOutput).toMatchObject({ hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: DENY_MESSAGE });
  });

  it("prints the Bash deny JSON for a shell write", () => {
    const r = run(call("Bash", { command: "echo x >> decisions/settings.yaml" }));
    expect(JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason).toBe(DENY_BASH_MESSAGE);
  });

  it("prints nothing for an allowed edit and for garbage input", () => {
    expect(run(call("Edit", { file_path: settingsPath(), old_string: "mode: observe", new_string: "mode: enforce" })).stdout).toBe("");
    const bad = run("not json");
    expect(bad.status).toBe(0);
    expect(bad.stdout).toBe("");
  });
});
