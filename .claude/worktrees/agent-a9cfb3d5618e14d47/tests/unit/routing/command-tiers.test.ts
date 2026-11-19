// SPEC-143 / T019 — per-command model tier in the kit command files (FR-016).
// Only the frontmatter model: line changes, the body never does, both mirrors stay byte-identical,
// and nothing in _wxAI/routing sets a session-wide model.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyCommandTiers, applyFrontmatterModel, commandBody, planCommandTiers } from "../../../_wxAI/routing/apply-command-tiers.mjs";

const SCRIPT = join(process.cwd(), "_wxAI", "routing", "apply-command-tiers.mjs");
let root = "";
const put = (name: string, text: string, dirs = ["_wxAI/commands", ".claude/commands"]) => {
  for (const d of dirs) {
    mkdirSync(join(root, d), { recursive: true });
    writeFileSync(join(root, d, `${name}.md`), text);
  }
};
const get = (name: string, d: string) => readFileSync(join(root, d, `${name}.md`), "utf8");
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "routing-cmdtiers-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const BODY = "# dbpush\n\n---\nmodel: not-frontmatter\n---\n\nBody text with `model: x` in it.\n";

describe("applyFrontmatterModel", () => {
  it("adds model: to existing frontmatter and leaves the body alone", () => {
    const src = `---\ndescription: x\nargs: "{{args}}"\n---\n${BODY}`;
    const r = applyFrontmatterModel(src, "haiku");
    expect(r.action).toBe("add");
    expect(r.text).toBe(`---\ndescription: x\nargs: "{{args}}"\nmodel: haiku\n---\n${BODY}`);
    expect(commandBody(r.text)).toBe(commandBody(src));
  });

  it("creates frontmatter only when there is none, ignoring a --- block inside the body", () => {
    const r = applyFrontmatterModel(BODY, "opus");
    expect(r.action).toBe("insert-frontmatter");
    expect(r.text).toBe(`---\nmodel: opus\n---\n${BODY}`);
    expect(commandBody(r.text)).toBe(BODY);
  });

  it("keeps CRLF line endings", () => {
    const src = "---\r\ndescription: x\r\n---\r\nBody\r\n";
    expect(applyFrontmatterModel(src, "sonnet").text).toBe("---\r\ndescription: x\r\nmodel: sonnet\r\n---\r\nBody\r\n");
  });

  it("is idempotent, refuses a different model without force, replaces only that line with force", () => {
    const src = "---\ndescription: x\nmodel: haiku\nargs: y\n---\nBody\n";
    expect(applyFrontmatterModel(src, "haiku")).toMatchObject({ action: "unchanged", text: src });
    expect(applyFrontmatterModel(src, "opus")).toMatchObject({ action: "refused", from: "haiku", text: src });
    const forced = applyFrontmatterModel(src, "opus", { force: true });
    expect(forced).toMatchObject({ action: "update", from: "haiku" });
    expect(forced.text).toBe("---\ndescription: x\nmodel: opus\nargs: y\n---\nBody\n");
  });

  it("handles an empty frontmatter", () => {
    expect(applyFrontmatterModel("---\n---\nBody\n", "haiku").text).toBe("---\nmodel: haiku\n---\nBody\n");
  });
});

describe("planCommandTiers / applyCommandTiers", () => {
  it("writes both mirrors with identical bytes and never changes the body", () => {
    put("dbpush", BODY);
    put("buildscope", `---\ndescription: b\n---\n${BODY}`);
    const plan = applyCommandTiers({ root, write: true });
    expect(plan.find((p) => p.command === "dbpush")).toMatchObject({ action: "insert-frontmatter", alias: "haiku", written: true });
    expect(plan.find((p) => p.command === "buildscope")).toMatchObject({ action: "add", alias: "opus" });
    for (const name of ["dbpush", "buildscope"]) {
      expect(get(name, "_wxAI/commands")).toBe(get(name, ".claude/commands"));
      expect(commandBody(get(name, "_wxAI/commands"))).toBe(BODY);
    }
    expect(get("dbpush", "_wxAI/commands")).toMatch(/^---\nmodel: haiku\n---\n/);
  });

  it("a dry run writes nothing", () => {
    put("dbpush", BODY);
    const plan = applyCommandTiers({ root });
    expect(plan.find((p) => p.command === "dbpush")?.action).toBe("insert-frontmatter");
    expect(get("dbpush", "_wxAI/commands")).toBe(BODY);
    expect(get("dbpush", ".claude/commands")).toBe(BODY);
  });

  it("refuses a pair that differs and a command with one mirror missing; skips one with no file", () => {
    mkdirSync(join(root, "_wxAI/commands"), { recursive: true });
    mkdirSync(join(root, ".claude/commands"), { recursive: true });
    writeFileSync(join(root, "_wxAI/commands/help.md"), "a\n");
    writeFileSync(join(root, ".claude/commands/help.md"), "b\n");
    put("buildscope", "x\n", ["_wxAI/commands"]);
    const plan = applyCommandTiers({ root, write: true });
    expect(plan.find((p) => p.command === "help")).toMatchObject({ action: "refused", newText: null });
    expect(plan.find((p) => p.command === "buildscope")).toMatchObject({ action: "refused", newText: null });
    expect(plan.find((p) => p.command === "auditfences")).toMatchObject({ action: "skipped" });
    expect(readFileSync(join(root, "_wxAI/commands/help.md"), "utf8")).toBe("a\n");
    expect(get("buildscope", "_wxAI/commands")).toBe("x\n");
  });

  // [SCOPE 143 / T019] implement keeps the session model (owner decision, T022)
  it("never writes a model: line on implement, although it has a tier", () => {
    put("implement", "---\ndescription: x\n---\nbody\n", ["_wxAI/commands", ".claude/commands"]);
    const plan = applyCommandTiers({ root, write: true });
    expect(plan.find((p) => p.command === "implement")).toMatchObject({ action: "skipped", newText: null });
    expect(get("implement", ".claude/commands")).toBe("---\ndescription: x\n---\nbody\n");
  });

  it("maps easy, moderate, heavy to the haiku, sonnet, opus aliases", () => {
    const plan = planCommandTiers({ root });
    for (const p of plan) expect(p.alias).toBe({ easy: "haiku", moderate: "sonnet", heavy: "opus" }[p.tier as "easy"]);
  });

  it("as a process: dry run exits 0 and prints the plan; a refusal exits 1", () => {
    put("dbpush", BODY);
    const ok = spawnSync(process.execPath, [SCRIPT, "--root", root, "--only", "dbpush"], { encoding: "utf8" });
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain("Dry run");
    expect(ok.stdout).toContain("would write _wxAI/commands/dbpush.md");
    put("dbpush", "---\nmodel: opus\n---\nBody\n");
    expect(spawnSync(process.execPath, [SCRIPT, "--root", root, "--only", "dbpush"], { encoding: "utf8" }).status).toBe(1);
  });
});

describe("no session-wide model", () => {
  it("no script in _wxAI/routing touches a Claude settings.json or a model setting outside command frontmatter", () => {
    const dir = join(process.cwd(), "_wxAI", "routing");
    // install.mjs must write .claude/settings.json (hook entries only); it is checked by behavior below.
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".mjs") && n !== "install.mjs")) {
      const src = readFileSync(join(dir, f), "utf8");
      expect(src, f).not.toMatch(/settings\.json|settings\.local\.json|ANTHROPIC_MODEL|CLAUDE_CODE_SUBAGENT_MODEL/);
    }
    expect(readFileSync(join(dir, "install.mjs"), "utf8"), "install.mjs").not.toMatch(/ANTHROPIC_MODEL|CLAUDE_CODE_SUBAGENT_MODEL/);
  });

  it("install.mjs adds hook entries only: no model key, no env model, other settings unchanged", () => {
    const root = mkdtempSync(join(tmpdir(), "routing-install-"));
    mkdirSync(join(root, ".claude"), { recursive: true });
    const before = { permissions: { allow: ["Bash(ls:*)"] }, hooks: {} };
    writeFileSync(join(root, ".claude", "settings.json"), JSON.stringify(before, null, 2));
    const r = spawnSync(process.execPath, [join(process.cwd(), "_wxAI", "routing", "install.mjs"), "--root", root], { encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    const after = JSON.parse(readFileSync(join(root, ".claude", "settings.json"), "utf8"));
    expect(after.model).toBeUndefined();
    expect(after.env?.ANTHROPIC_MODEL).toBeUndefined();
    expect(after.permissions).toEqual(before.permissions);
    const commands = JSON.stringify(after.hooks);
    expect(commands).toContain("_wxAI/routing/");
    rmSync(root, { recursive: true, force: true });
  });

  it("an applied run leaves .claude/settings.json byte-identical", () => {
    put("dbpush", BODY);
    const settings = '{\n  "model": "opus",\n  "hooks": {}\n}\n';
    writeFileSync(join(root, ".claude", "settings.json"), settings);
    applyCommandTiers({ root, write: true, force: true });
    expect(readFileSync(join(root, ".claude", "settings.json"), "utf8")).toBe(settings);
  });
});
