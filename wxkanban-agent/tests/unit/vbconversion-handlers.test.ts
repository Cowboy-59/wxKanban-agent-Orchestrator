// vbConversion / vbConversionScope command-handler coverage (the VB6 counterparts
// to cwconversion-handlers.test.ts).
//
// Both handlers run NO AI: they scaffold/verify a workspace and install a skill
// DIRECTORY. Tests point templatesDir at a fixture skill dir and projectRoot at a
// temp consumer root.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readFileSync, utimesSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { handleVbConversionCommand } from "../../core/orchestrator/command-handlers/vbconversion";
import { handleVbConversionScopeCommand } from "../../core/orchestrator/command-handlers/vbconversionscope";

let tmp: string;
let templatesDir: string;

function setupConsumer(opts: { claude?: boolean } = { claude: true }): string {
  const root = mkdtempSync(join(tmpdir(), "vbconv-"));
  mkdirSync(join(root, ".wxai"));
  if (opts.claude !== false) mkdirSync(join(root, ".claude"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "test-consumer", dependencies: { "wxkanban-agent": "^1.0.0" } }, null, 2),
  );
  return root;
}

function setupTemplates(): string {
  const dir = mkdtempSync(join(tmpdir(), "vbconv-tpl-"));
  for (const name of ["vbConversion", "vbConversionScope"]) {
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

describe("vbconversion handler", () => {
  it("scaffolds the workspace and installs the skill to both locations (Claude consumer)", () => {
    const r = handleVbConversionCommand({ projectRoot: tmp, templatesDir });
    expect(r.exitCode).toBe(0);
    expect(existsSync(join(tmp, "pre-convert"))).toBe(true);
    expect(existsSync(join(tmp, "rebuild", "pages"))).toBe(true);
    expect(existsSync(join(tmp, "rebuild", "db"))).toBe(true);
    expect(existsSync(join(tmp, "rebuild", "scopes"))).toBe(true);
    expect(existsSync(join(agnostic(tmp, "vbConversion"), "SKILL.md"))).toBe(true);
    expect(existsSync(join(agnostic(tmp, "vbConversion"), "scripts", "noop.py"))).toBe(true);
    expect(existsSync(join(claude(tmp, "vbConversion"), "SKILL.md"))).toBe(true);
  });

  it("installs only to _wxAI/skills/ when the consumer does not use Claude", () => {
    const noClaude = setupConsumer({ claude: false });
    try {
      const r = handleVbConversionCommand({ projectRoot: noClaude, templatesDir });
      expect(r.exitCode).toBe(0);
      expect(existsSync(join(agnostic(noClaude, "vbConversion"), "SKILL.md"))).toBe(true);
      expect(existsSync(join(noClaude, ".claude"))).toBe(false);
    } finally {
      rmSync(noClaude, { recursive: true, force: true });
    }
  });

  it("keeps an existing skill copy unless --force", () => {
    const skillFile = join(agnostic(tmp, "vbConversion"), "SKILL.md");
    handleVbConversionCommand({ projectRoot: tmp, templatesDir });
    writeFileSync(skillFile, "# edited by developer\n");

    const r2 = handleVbConversionCommand({ projectRoot: tmp, templatesDir });
    expect(r2.actions.some((a) => a.action === "skipped")).toBe(true);
    expect(readFileSync(skillFile, "utf-8")).toContain("edited by developer");

    const r3 = handleVbConversionCommand({ projectRoot: tmp, templatesDir, force: true });
    expect(r3.actions.some((a) => a.action === "created")).toBe(true);
    expect(readFileSync(skillFile, "utf-8")).not.toContain("edited by developer");
  });

  it("errors when the skill template is missing", () => {
    const r = handleVbConversionCommand({ projectRoot: tmp, templatesDir: join(tmp, "nope") });
    expect(r.exitCode).toBe(1);
    expect(r.output).toMatch(/skill template not found/);
  });
});

describe("vbconversion --review", () => {
  it("errors with exit 2 when pre-convert/ is missing (run conversion first)", () => {
    const r = handleVbConversionCommand({ projectRoot: tmp, review: true });
    expect(r.exitCode).toBe(2);
    expect(r.output).toMatch(/no pre-convert/i);
  });

  it("reports a form that has source (.controls.md) but no generated .tsx", () => {
    mkdirSync(join(tmp, "pre-convert"));
    writeFileSync(join(tmp, "pre-convert", "frmMain.page.md"), "# frmMain\n");
    writeFileSync(join(tmp, "pre-convert", "frmMain.controls.md"), "# controls\n");

    const r = handleVbConversionCommand({ projectRoot: tmp, review: true });
    expect(r.exitCode).toBe(0);
    expect(r.findings?.some((f) => f.kind === "missing" && f.item.includes("frmMain"))).toBe(true);
    expect(r.output).toMatch(/MISSING/);
  });

  it("flags a stale business-logic scope and the _discarded.md review item", () => {
    const pre = join(tmp, "pre-convert");
    const scopes = join(tmp, "rebuild", "scopes");
    mkdirSync(pre, { recursive: true });
    mkdirSync(scopes, { recursive: true });
    writeFileSync(join(scopes, "PROC-procedures-scope.md"), "# procs\n");
    writeFileSync(join(pre, "modStayOnTop.proc.md"), "# module\n");
    const old = new Date(Date.now() - 60_000);
    const recent = new Date();
    utimesSync(join(scopes, "PROC-procedures-scope.md"), old, old);
    utimesSync(join(pre, "modStayOnTop.proc.md"), recent, recent);
    writeFileSync(join(pre, "_discarded.md"), "# not captured\n");

    const r = handleVbConversionCommand({ projectRoot: tmp, review: true });
    expect(r.exitCode).toBe(0);
    expect(r.findings?.some((f) => f.kind === "stale" && f.item.includes("business-logic scope"))).toBe(true);
    expect(r.findings?.some((f) => f.kind === "review" && f.item.includes("_discarded.md"))).toBe(true);
  });

  it("reports in-sync when every generated artifact is newer than its source", () => {
    const pre = join(tmp, "pre-convert");
    const pages = join(tmp, "rebuild", "pages");
    mkdirSync(pre, { recursive: true });
    mkdirSync(pages, { recursive: true });
    writeFileSync(join(pre, "frmMain.page.md"), "# frmMain\n");
    writeFileSync(join(pre, "frmMain.controls.md"), "# controls\n");
    writeFileSync(join(pages, "frmMain.tsx"), "export default function frmMain(){return null}\n");
    const old = new Date(Date.now() - 60_000);
    const recent = new Date();
    utimesSync(join(pre, "frmMain.page.md"), old, old);
    utimesSync(join(pre, "frmMain.controls.md"), old, old);
    utimesSync(join(pages, "frmMain.tsx"), recent, recent);

    const r = handleVbConversionCommand({ projectRoot: tmp, review: true });
    expect(r.exitCode).toBe(0);
    expect(r.findings).toEqual([]);
    expect(r.output).toMatch(/in sync/i);
  });
});

describe("vbconversionscope handler", () => {
  it("errors with exit 2 when pre-convert/ is missing (run conversion first)", () => {
    const r = handleVbConversionScopeCommand({ projectRoot: tmp, templatesDir });
    expect(r.exitCode).toBe(2);
    expect(r.output).toMatch(/vbconversion/);
  });

  it("installs the skill to both locations once pre-convert/ exists", () => {
    mkdirSync(join(tmp, "pre-convert"));
    const r = handleVbConversionScopeCommand({ projectRoot: tmp, templatesDir });
    expect(r.exitCode).toBe(0);
    expect(existsSync(join(agnostic(tmp, "vbConversionScope"), "SKILL.md"))).toBe(true);
    expect(existsSync(join(claude(tmp, "vbConversionScope"), "SKILL.md"))).toBe(true);
  });

  it("does not scaffold rebuild/ (scopes are owned by the buildscope pipeline)", () => {
    mkdirSync(join(tmp, "pre-convert"));
    handleVbConversionScopeCommand({ projectRoot: tmp, templatesDir });
    expect(existsSync(join(tmp, "rebuild"))).toBe(false);
  });
});
