// wxConversion / wxConversionScope command-handler coverage.
//
// Both handlers run NO AI: they scaffold/verify a workspace and install a skill
// DIRECTORY. The AI-agnostic home is _wxAI/skills/; .claude/skills/ is added too
// when the consumer uses Claude (a .claude/ dir exists). Tests point templatesDir
// at a fixture skill dir and projectRoot at a temp consumer root.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { handleWxConversionCommand } from "../../core/orchestrator/command-handlers/wxconversion";
import { handleWxConversionScopeCommand } from "../../core/orchestrator/command-handlers/wxconversionscope";

let tmp: string;
let templatesDir: string;

// A Claude-using consumer: has both .wxai/ (kit marker) and .claude/ (Claude).
function setupConsumer(opts: { claude?: boolean } = { claude: true }): string {
  const root = mkdtempSync(join(tmpdir(), "wxconv-pdf-"));
  mkdirSync(join(root, ".wxai"));
  if (opts.claude !== false) mkdirSync(join(root, ".claude"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "test-consumer", dependencies: { "wxkanban-agent": "^1.0.0" } }, null, 2),
  );
  return root;
}

// Minimal fixture skills dir holding both skill directories.
function setupTemplates(): string {
  const dir = mkdtempSync(join(tmpdir(), "wxconv-pdf-tpl-"));
  for (const name of ["wxConversion", "wxConversionScope"]) {
    const skillDir = join(dir, name);
    mkdirSync(join(skillDir, "scripts"), { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), `# ${name}\n`);
    writeFileSync(join(skillDir, "scripts", "noop.py"), "# noop\n");
  }
  return dir;
}

beforeEach(() => {
  tmp = setupConsumer();
  templatesDir = setupTemplates();
});

afterEach(() => {
  for (const d of [tmp, templatesDir]) {
    if (d && existsSync(d)) rmSync(d, { recursive: true, force: true });
  }
});

const agnostic = (root: string, name: string) => join(root, "_wxAI", "skills", name);
const claude = (root: string, name: string) => join(root, ".claude", "skills", name);

describe("wxconversion handler", () => {
  it("scaffolds the workspace and installs the skill to both locations (Claude consumer)", () => {
    const r = handleWxConversionCommand({ projectRoot: tmp, templatesDir });
    expect(r.exitCode).toBe(0);
    expect(existsSync(join(tmp, "pre-convert"))).toBe(true);
    expect(existsSync(join(tmp, "rebuild", "pages"))).toBe(true);
    expect(existsSync(join(tmp, "rebuild", "db"))).toBe(true);
    expect(existsSync(join(tmp, "rebuild", "scopes"))).toBe(true);
    // agnostic home + Claude location, recursive copy brought scripts along
    expect(existsSync(join(agnostic(tmp, "wxConversion"), "SKILL.md"))).toBe(true);
    expect(existsSync(join(agnostic(tmp, "wxConversion"), "scripts", "noop.py"))).toBe(true);
    expect(existsSync(join(claude(tmp, "wxConversion"), "SKILL.md"))).toBe(true);
  });

  it("installs only to _wxAI/skills/ when the consumer does not use Claude", () => {
    const noClaude = setupConsumer({ claude: false });
    try {
      const r = handleWxConversionCommand({ projectRoot: noClaude, templatesDir });
      expect(r.exitCode).toBe(0);
      expect(existsSync(join(agnostic(noClaude, "wxConversion"), "SKILL.md"))).toBe(true);
      expect(existsSync(join(noClaude, ".claude"))).toBe(false);
    } finally {
      rmSync(noClaude, { recursive: true, force: true });
    }
  });

  it("keeps an existing skill copy unless --force", () => {
    const skillFile = join(agnostic(tmp, "wxConversion"), "SKILL.md");
    handleWxConversionCommand({ projectRoot: tmp, templatesDir });
    writeFileSync(skillFile, "# edited by developer\n");

    const r2 = handleWxConversionCommand({ projectRoot: tmp, templatesDir });
    expect(r2.actions.some((a) => a.action === "skipped")).toBe(true);
    expect(readFileSync(skillFile, "utf-8")).toContain("edited by developer");

    const r3 = handleWxConversionCommand({ projectRoot: tmp, templatesDir, force: true });
    expect(r3.actions.some((a) => a.action === "created")).toBe(true);
    expect(readFileSync(skillFile, "utf-8")).not.toContain("edited by developer");
  });

  it("errors when the skill template is missing", () => {
    const r = handleWxConversionCommand({ projectRoot: tmp, templatesDir: join(tmp, "nope") });
    expect(r.exitCode).toBe(1);
    expect(r.output).toMatch(/skill template not found/);
  });
});

describe("wxconversionscope handler", () => {
  it("errors with exit 2 when pre-convert/ is missing (run conversion first)", () => {
    const r = handleWxConversionScopeCommand({ projectRoot: tmp, templatesDir });
    expect(r.exitCode).toBe(2);
    expect(r.output).toMatch(/wxconversion/);
  });

  it("installs the skill to both locations once pre-convert/ exists", () => {
    mkdirSync(join(tmp, "pre-convert"));
    const r = handleWxConversionScopeCommand({ projectRoot: tmp, templatesDir });
    expect(r.exitCode).toBe(0);
    expect(existsSync(join(agnostic(tmp, "wxConversionScope"), "SKILL.md"))).toBe(true);
    expect(existsSync(join(claude(tmp, "wxConversionScope"), "SKILL.md"))).toBe(true);
  });

  it("does not scaffold rebuild/ (scopes are owned by the buildscope pipeline)", () => {
    mkdirSync(join(tmp, "pre-convert"));
    handleWxConversionScopeCommand({ projectRoot: tmp, templatesDir });
    expect(existsSync(join(tmp, "rebuild"))).toBe(false);
  });
});
