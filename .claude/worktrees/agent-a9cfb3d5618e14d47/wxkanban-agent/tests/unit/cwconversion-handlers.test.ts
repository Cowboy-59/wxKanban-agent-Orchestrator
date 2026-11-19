// cwConversion / cwConversionScope command-handler coverage (the Clarion
// counterparts to wxconversion-handlers.test.ts).
//
// Both handlers run NO AI: they scaffold/verify a workspace and install a skill
// DIRECTORY. The AI-agnostic home is _wxAI/skills/; .claude/ is added too when
// the consumer uses Claude. Tests point templatesDir at a fixture skill dir and
// projectRoot at a temp consumer root.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readFileSync, utimesSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { handleCwConversionCommand } from "../../core/orchestrator/command-handlers/cwconversion";
import { handleCwConversionScopeCommand } from "../../core/orchestrator/command-handlers/cwconversionscope";

let tmp: string;
let templatesDir: string;

// A Claude-using consumer: has both .wxai/ (kit marker) and .claude/ (Claude).
function setupConsumer(opts: { claude?: boolean } = { claude: true }): string {
  const root = mkdtempSync(join(tmpdir(), "cwconv-clw-"));
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
  const dir = mkdtempSync(join(tmpdir(), "cwconv-clw-tpl-"));
  for (const name of ["cwConversion", "cwConversionScope"]) {
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
const claude = (root: string, name: string) => join(root, ".claude", name);

describe("cwconversion handler", () => {
  it("scaffolds the workspace and installs the skill to both locations (Claude consumer)", () => {
    const r = handleCwConversionCommand({ projectRoot: tmp, templatesDir });
    expect(r.exitCode).toBe(0);
    expect(existsSync(join(tmp, "pre-convert"))).toBe(true);
    expect(existsSync(join(tmp, "rebuild", "pages"))).toBe(true);
    expect(existsSync(join(tmp, "rebuild", "db"))).toBe(true);
    expect(existsSync(join(tmp, "rebuild", "scopes"))).toBe(true);
    expect(existsSync(join(agnostic(tmp, "cwConversion"), "SKILL.md"))).toBe(true);
    expect(existsSync(join(agnostic(tmp, "cwConversion"), "scripts", "noop.py"))).toBe(true);
    expect(existsSync(join(claude(tmp, "cwConversion"), "SKILL.md"))).toBe(true);
  });

  it("installs only to _wxAI/skills/ when the consumer does not use Claude", () => {
    const noClaude = setupConsumer({ claude: false });
    try {
      const r = handleCwConversionCommand({ projectRoot: noClaude, templatesDir });
      expect(r.exitCode).toBe(0);
      expect(existsSync(join(agnostic(noClaude, "cwConversion"), "SKILL.md"))).toBe(true);
      expect(existsSync(join(noClaude, ".claude"))).toBe(false);
    } finally {
      rmSync(noClaude, { recursive: true, force: true });
    }
  });

  it("keeps an existing skill copy unless --force", () => {
    const skillFile = join(agnostic(tmp, "cwConversion"), "SKILL.md");
    handleCwConversionCommand({ projectRoot: tmp, templatesDir });
    writeFileSync(skillFile, "# edited by developer\n");

    const r2 = handleCwConversionCommand({ projectRoot: tmp, templatesDir });
    expect(r2.actions.some((a) => a.action === "skipped")).toBe(true);
    expect(readFileSync(skillFile, "utf-8")).toContain("edited by developer");

    const r3 = handleCwConversionCommand({ projectRoot: tmp, templatesDir, force: true });
    expect(r3.actions.some((a) => a.action === "created")).toBe(true);
    expect(readFileSync(skillFile, "utf-8")).not.toContain("edited by developer");
  });

  it("errors when the skill template is missing", () => {
    const r = handleCwConversionCommand({ projectRoot: tmp, templatesDir: join(tmp, "nope") });
    expect(r.exitCode).toBe(1);
    expect(r.output).toMatch(/skill template not found/);
  });
});

describe("cwconversion --review", () => {
  it("errors with exit 2 when pre-convert/ is missing (run conversion first)", () => {
    const r = handleCwConversionCommand({ projectRoot: tmp, review: true });
    expect(r.exitCode).toBe(2);
    expect(r.output).toMatch(/no pre-convert/i);
  });

  it("reports a window that has source (.controls.md) but no generated .tsx", () => {
    mkdirSync(join(tmp, "pre-convert"));
    writeFileSync(join(tmp, "pre-convert", "UpdateAuthors.page.md"), "# UpdateAuthors\n");
    writeFileSync(join(tmp, "pre-convert", "UpdateAuthors.controls.md"), "# controls\n");

    const r = handleCwConversionCommand({ projectRoot: tmp, review: true });
    expect(r.exitCode).toBe(0);
    expect(r.findings?.some((f) => f.kind === "missing" && f.item.includes("UpdateAuthors"))).toBe(true);
    expect(r.output).toMatch(/MISSING/);
  });

  it("flags a stale VIEW queries scope and the _discarded.md review item", () => {
    const pre = join(tmp, "pre-convert");
    const scopes = join(tmp, "rebuild", "scopes");
    mkdirSync(pre, { recursive: true });
    mkdirSync(scopes, { recursive: true });
    // VIEW queries scope exists but a .view.md source is newer → stale
    writeFileSync(join(scopes, "VIEW-queries-scope.md"), "# views\n");
    writeFileSync(join(pre, "BrowseAuthors.view.md"), "# BrowseAuthors view\n");
    const old = new Date(Date.now() - 60_000);
    const recent = new Date();
    utimesSync(join(scopes, "VIEW-queries-scope.md"), old, old);
    utimesSync(join(pre, "BrowseAuthors.view.md"), recent, recent);
    // a split that dropped elements
    writeFileSync(join(pre, "_discarded.md"), "# not captured\n");

    const r = handleCwConversionCommand({ projectRoot: tmp, review: true });
    expect(r.exitCode).toBe(0);
    expect(r.findings?.some((f) => f.kind === "stale" && f.item.includes("VIEW queries scope"))).toBe(true);
    expect(r.findings?.some((f) => f.kind === "review" && f.item.includes("_discarded.md"))).toBe(true);
  });

  it("reports in-sync when every generated artifact is newer than its source", () => {
    const pre = join(tmp, "pre-convert");
    const pages = join(tmp, "rebuild", "pages");
    mkdirSync(pre, { recursive: true });
    mkdirSync(pages, { recursive: true });
    writeFileSync(join(pre, "UpdateAuthors.page.md"), "# UpdateAuthors\n");
    writeFileSync(join(pre, "UpdateAuthors.controls.md"), "# controls\n");
    writeFileSync(join(pages, "UpdateAuthors.tsx"), "export default function UpdateAuthors(){return null}\n");
    const old = new Date(Date.now() - 60_000);
    const recent = new Date();
    utimesSync(join(pre, "UpdateAuthors.page.md"), old, old);
    utimesSync(join(pre, "UpdateAuthors.controls.md"), old, old);
    utimesSync(join(pages, "UpdateAuthors.tsx"), recent, recent);

    const r = handleCwConversionCommand({ projectRoot: tmp, review: true });
    expect(r.exitCode).toBe(0);
    expect(r.findings).toEqual([]);
    expect(r.output).toMatch(/in sync/i);
  });
});

describe("cwconversionscope handler", () => {
  it("errors with exit 2 when pre-convert/ is missing (run conversion first)", () => {
    const r = handleCwConversionScopeCommand({ projectRoot: tmp, templatesDir });
    expect(r.exitCode).toBe(2);
    expect(r.output).toMatch(/cwconversion/);
  });

  it("installs the skill to both locations once pre-convert/ exists", () => {
    mkdirSync(join(tmp, "pre-convert"));
    const r = handleCwConversionScopeCommand({ projectRoot: tmp, templatesDir });
    expect(r.exitCode).toBe(0);
    expect(existsSync(join(agnostic(tmp, "cwConversionScope"), "SKILL.md"))).toBe(true);
    expect(existsSync(join(claude(tmp, "cwConversionScope"), "SKILL.md"))).toBe(true);
  });

  it("does not scaffold rebuild/ (scopes are owned by the buildscope pipeline)", () => {
    mkdirSync(join(tmp, "pre-convert"));
    handleCwConversionScopeCommand({ projectRoot: tmp, templatesDir });
    expect(existsSync(join(tmp, "rebuild"))).toBe(false);
  });
});
