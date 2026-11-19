// SPEC-142 T008 / FR-005: the Ask Gate installer adds its three hook entries beside the SCOPE-137
// Change Impact hook, touches nothing else, and a reinstall leaves exactly one of each.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { askGateStatus, installAskGate } from "../../../_wxAI/askgate/install.mjs";
import { installHook } from "../../../_wxAI/impact/install-hook.mjs";

const REPO = process.cwd();
const temps: string[] = [];
afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true });
});

type Entry = { matcher?: string; hooks: { command: string }[] };
type Settings = { env?: Record<string, string>; permissions?: unknown; hooks?: Record<string, Entry[]> };

// [SCOPE 142 / T008] BEGIN — Ask Gate PreToolUse hook on AskUserQuestion, installed besi…
function project(settings: Settings | null): string {
  const root = mkdtempSync(join(tmpdir(), "askgate-install-"));
  temps.push(root);
  mkdirSync(join(root, ".claude"));
  if (settings) writeFileSync(join(root, ".claude", "settings.json"), JSON.stringify(settings, null, 2));
  return root;
}
// [SCOPE 142 / T008] END
const read = (root: string): Settings => JSON.parse(readFileSync(join(root, ".claude", "settings.json"), "utf-8"));
const commands = (s: Settings, event: string) => (s.hooks?.[event] ?? []).flatMap((e) => e.hooks.map((h) => h.command));
const count = (s: Settings, needle: string) => Object.keys(s.hooks ?? {}).flatMap((ev) => commands(s, ev)).filter((c) => c.includes(needle)).length;

const OWN_HOOKS: Settings = {
  env: { KEEP: "1" },
  permissions: { deny: ["Read(.env)"] },
  hooks: {
    SessionStart: [{ hooks: [{ command: "echo hi" }] }],
    PreToolUse: [{ matcher: "^Bash$", hooks: [{ command: "node my-own-hook.mjs" }] }],
    Stop: [{ hooks: [{ command: "node my-stop.mjs" }] }],
  },
};

describe("install.mjs", () => {
  it("installs beside the impact hook; both present, each exactly once", () => {
    const root = project(OWN_HOOKS);
    installHook(root);
    installAskGate(root);
    const s = read(root);
    expect(count(s, "_wxAI/impact/hook.mjs")).toBe(1);
    expect(count(s, "_wxAI/askgate/hook-tool.mjs")).toBe(1);
    expect(count(s, "_wxAI/askgate/hook-ledger-guard.mjs")).toBe(1);
    expect(count(s, "_wxAI/askgate/hook-stop.mjs")).toBe(1);
    const tool = s.hooks!.PreToolUse.find((e) => e.hooks[0].command.includes("hook-tool.mjs"))!;
    expect(tool.matcher).toBe("^AskUserQuestion$");
    const guard = s.hooks!.PreToolUse.find((e) => e.hooks[0].command.includes("hook-ledger-guard.mjs"))!;
    expect(guard.matcher).toBe("^(Edit|Write|MultiEdit|NotebookEdit|Bash)$");
    expect(s.hooks!.Stop.find((e) => e.hooks[0].command.includes("hook-stop.mjs"))).toBeTruthy();
  });

  it("reinstall (in any order) leaves exactly one of each and changes nothing", () => {
    const root = project(OWN_HOOKS);
    installAskGate(root);
    installHook(root);
    const once = readFileSync(join(root, ".claude", "settings.json"), "utf-8");
    expect(installAskGate(root).changed).toBe(false);
    installHook(root);
    expect(readFileSync(join(root, ".claude", "settings.json"), "utf-8")).toBe(once);
    const s = read(root);
    for (const n of ["_wxAI/impact/hook.mjs", "hook-tool.mjs", "hook-ledger-guard.mjs", "hook-stop.mjs"]) expect(count(s, n)).toBe(1);
  });

  it("leaves every other setting and hook alone", () => {
    const root = project(OWN_HOOKS);
    installHook(root);
    const before = read(root);
    installAskGate(root);
    const after = read(root);
    expect(after.env).toEqual(before.env);
    expect(after.permissions).toEqual(before.permissions);
    expect(after.hooks!.SessionStart).toEqual(before.hooks!.SessionStart);
    for (const ev of ["PreToolUse", "Stop"]) {
      for (const e of before.hooks![ev]) expect(after.hooks![ev]).toContainEqual(e);
    }
  });

  it("repairs a stale or duplicated entry", () => {
    const root = project({
      hooks: {
        PreToolUse: [
          { matcher: "AskUserQuestion", hooks: [{ command: 'node "${CLAUDE_PROJECT_DIR}/_wxAI/askgate/hook-tool.mjs"' }] },
          { matcher: "AskUserQuestion", hooks: [{ command: 'node "${CLAUDE_PROJECT_DIR}/_wxAI/askgate/hook-tool.mjs"' }] },
        ],
      },
    });
    expect(installAskGate(root, { mode: "check" }).status).toBe("stale");
    installAskGate(root);
    expect(askGateStatus(read(root))).toBe("current");
    expect(count(read(root), "hook-tool.mjs")).toBe(1);
  });

  it("uninstall removes only the Ask Gate entries; the impact hook stays", () => {
    const root = project(OWN_HOOKS);
    installHook(root);
    installAskGate(root);
    installAskGate(root, { mode: "uninstall" });
    const s = read(root);
    expect(count(s, "_wxAI/askgate/")).toBe(0);
    expect(count(s, "_wxAI/impact/hook.mjs")).toBe(1);
    expect(commands(s, "Stop")).toEqual(["node my-stop.mjs"]);
    expect(commands(s, "PreToolUse")).toContain("node my-own-hook.mjs");
  });

  it("works with no settings file, and keeps the guard state out of git", () => {
    const root = project(null);
    const r = installAskGate(root);
    expect(r.status).toBe("current");
    expect(readFileSync(join(root, ".gitignore"), "utf-8")).toContain(".wxai/askgate-stop-turns.json");
    installAskGate(root);
    expect(readFileSync(join(root, ".gitignore"), "utf-8").match(/askgate-stop-turns/g)).toHaveLength(1);
  });

  it("CLI: --check exits 1 when missing, 0 when current; --root works", () => {
    const root = project({});
    const cli = (...a: string[]) => spawnSync(process.execPath, [join(REPO, "_wxAI", "askgate", "install.mjs"), ...a, "--root", root], { encoding: "utf-8" });
    expect(cli("--check").status).toBe(1);
    const inst = cli();
    expect(inst.status).toBe(0);
    expect(inst.stdout).toMatch(/Ask Gate hooks installed/);
    expect(inst.stderr).toMatch(/not in/); // the temp project has no kit scripts: warned
    expect(cli("--check").status).toBe(0);
    expect(cli().stdout).toMatch(/already current/);
  });

  it("refuses a malformed settings file without touching it", () => {
    const root = project(null);
    writeFileSync(join(root, ".claude", "settings.json"), "{ not json");
    const r = spawnSync(process.execPath, [join(REPO, "_wxAI", "askgate", "install.mjs"), "--root", root], { encoding: "utf-8" });
    expect(r.status).toBe(2);
    expect(readFileSync(join(root, ".claude", "settings.json"), "utf-8")).toBe("{ not json");
  });
});

describe("the existing installer the Cockpit runs (FR-005)", () => {
  const cli = (root: string, ...args: string[]) =>
    spawnSync(process.execPath, [join(REPO, "_wxAI", "impact", "install-hook.mjs"), "--root", root, ...args], { encoding: "utf-8" });

  it("install-hook.mjs installs both hooks; a reinstall leaves one of each; --check and --uninstall cover both", () => {
    const root = project(OWN_HOOKS);
    expect(cli(root).status).toBe(0);
    expect(cli(root).stdout).toMatch(/Ask Gate hooks already current/);
    const s = read(root);
    for (const n of ["_wxAI/impact/hook.mjs", "hook-tool.mjs", "hook-ledger-guard.mjs", "hook-stop.mjs", "my-own-hook.mjs", "my-stop.mjs"]) expect(count(s, n), n).toBe(1);
    const check = cli(root, "--check");
    expect(check.status).toBe(0);
    expect(check.stdout).toMatch(/Change Impact hook is current[\s\S]*Ask Gate hooks are current/);
    expect(cli(root, "--uninstall").status).toBe(0);
    const after = read(root);
    expect(count(after, "_wxAI/impact/hook.mjs") + count(after, "_wxAI/askgate/")).toBe(0);
    expect(count(after, "my-own-hook.mjs")).toBe(1);
    expect(cli(root, "--check").status).toBe(1);
  });
});
