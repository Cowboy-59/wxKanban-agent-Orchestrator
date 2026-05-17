import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { scanTree, promoteWarningsToErrors } from "../../core/orchestrator/auditfences-scanner";
import { buildTaskIdIndex } from "../../core/orchestrator/task-id-index";
import { handleAuditFencesCommand } from "../../core/orchestrator/command-handlers/auditfences";

let workdir: string;
let specsDir: string;
let sourceRoot: string;

beforeAll(() => {
  workdir = mkdtempSync(join(tmpdir(), "auditfences-test-"));
  specsDir = join(workdir, "specs");
  sourceRoot = join(workdir, "src");
  mkdirSync(specsDir, { recursive: true });
  mkdirSync(sourceRoot, { recursive: true });

  mkdirSync(join(specsDir, "026-CodeFencing"), { recursive: true });
  writeFileSync(
    join(specsDir, "026-CodeFencing", "tasks.md"),
    [
      "| # | Task | Priority | Status |",
      "| 1 | T001: First task | high | todo |",
      "| 2 | T002: Second task | high | todo |",
    ].join("\n"),
  );

  mkdirSync(join(specsDir, "013-AuditManagement"), { recursive: true });
  writeFileSync(
    join(specsDir, "013-AuditManagement", "tasks.md"),
    [
      "| # | Task | Priority | Status |",
      "| 1 | T042: Audit log retention pruning | high | todo |",
    ].join("\n"),
  );
});

afterAll(() => {
  rmSync(workdir, { recursive: true, force: true });
});

describe("Task ID indexer", () => {
  it("builds a per-scope set of task IDs from tasks.md", () => {
    const idx = buildTaskIdIndex(specsDir);
    expect(idx.scopes.get("026")?.has("T001")).toBe(true);
    expect(idx.scopes.get("026")?.has("T002")).toBe(true);
    expect(idx.scopes.get("013")?.has("T042")).toBe(true);
  });

  it("returns empty for an unknown scope", () => {
    const idx = buildTaskIdIndex(specsDir);
    expect(idx.scopes.get("999")).toBeUndefined();
  });
});

describe("auditfences scanner — clean tree (FR-007)", () => {
  it("reports zero errors when every declaration is fenced", () => {
    const file = join(sourceRoot, "clean.ts");
    writeFileSync(
      file,
      [
        "// [SCOPE 013 / T042] BEGIN — Audit log retention pruning",
        "export function pruneAuditLogs(x: number) { return x; }",
        "// [SCOPE 013 / T042] END",
      ].join("\n"),
    );
    const result = scanTree({
      root: sourceRoot,
      taskIndex: buildTaskIdIndex(specsDir),
    });
    expect(result.summary.errors).toBe(0);
    rmSync(file);
  });
});

describe("auditfences scanner — un-fenced declaration (FR-007 UNFENCED_DECL)", () => {
  it("reports an error when a top-level function lacks a fence", () => {
    const file = join(sourceRoot, "naked.ts");
    writeFileSync(
      file,
      "export function orphanFn(x: number) { return x + 1; }\n",
    );
    const result = scanTree({
      root: sourceRoot,
      taskIndex: buildTaskIdIndex(specsDir),
    });
    expect(result.summary.errors).toBeGreaterThan(0);
    expect(
      result.findings.some(
        (f) => f.code === "UNFENCED_DECL" && f.message.includes("orphanFn"),
      ),
    ).toBe(true);
    rmSync(file);
  });
});

describe("auditfences scanner — unknown task ID (FR-007 UNKNOWN_TASK)", () => {
  it("flags a fence whose task does not exist in tasks.md", () => {
    const file = join(sourceRoot, "phantom.ts");
    writeFileSync(
      file,
      [
        "// [SCOPE 013 / T099] BEGIN — phantom",
        "export function phantomFn() { return 0; }",
        "// [SCOPE 013 / T099] END",
      ].join("\n"),
    );
    const result = scanTree({
      root: sourceRoot,
      taskIndex: buildTaskIdIndex(specsDir),
    });
    expect(
      result.findings.some(
        (f) => f.code === "UNKNOWN_TASK" && f.task === "T099",
      ),
    ).toBe(true);
    rmSync(file);
  });
});

describe("auditfences scanner — malformed fence (FR-007 MALFORMED_FENCE)", () => {
  it("flags a BEGIN without a matching END", () => {
    const file = join(sourceRoot, "broken.ts");
    writeFileSync(
      file,
      [
        "// [SCOPE 013 / T042] BEGIN — orphan",
        "export function notClosed() { return 0; }",
      ].join("\n"),
    );
    const result = scanTree({
      root: sourceRoot,
      taskIndex: buildTaskIdIndex(specsDir),
    });
    expect(
      result.findings.some((f) => f.code === "MALFORMED_FENCE"),
    ).toBe(true);
    rmSync(file);
  });
});

describe("auditfences scanner — warnings (FR-007)", () => {
  it("warns when MODIFIED-BY references unknown task", () => {
    const file = join(sourceRoot, "warn.ts");
    writeFileSync(
      file,
      [
        "// [SCOPE 013 / T042] BEGIN — Audit log retention pruning",
        "// [SCOPE 013 / T999] MODIFIED-BY — ghost edit",
        "export function pruneAuditLogs(x: number) { return x; }",
        "// [SCOPE 013 / T042] END",
      ].join("\n"),
    );
    const result = scanTree({
      root: sourceRoot,
      taskIndex: buildTaskIdIndex(specsDir),
    });
    expect(
      result.findings.some(
        (f) => f.code === "UNKNOWN_MODIFIER_TASK" && f.severity === "warning",
      ),
    ).toBe(true);
    rmSync(file);
  });
});

describe("auditfences scanner — strict mode promotes warnings to errors", () => {
  it("promotes warning-class findings to errors and bumps exit code", () => {
    const file = join(sourceRoot, "warn2.ts");
    writeFileSync(
      file,
      [
        "// [SCOPE 013 / T042] BEGIN — Audit log retention pruning",
        "// [SCOPE 013 / T999] MODIFIED-BY — ghost",
        "export function pruneAuditLogs(x: number) { return x; }",
        "// [SCOPE 013 / T042] END",
      ].join("\n"),
    );
    const result = scanTree({
      root: sourceRoot,
      taskIndex: buildTaskIdIndex(specsDir),
    });
    const promoted = promoteWarningsToErrors(result);
    expect(promoted.summary.warnings).toBe(0);
    expect(promoted.summary.errors).toBeGreaterThan(result.summary.errors);
    rmSync(file);
  });
});

describe("auditfences scanner — JSON files are skipped (FR-005)", () => {
  it("does not report .json files even with un-fenced-looking content", () => {
    const file = join(sourceRoot, "ignored.json");
    writeFileSync(file, '{ "key": "value" }\n');
    const result = scanTree({
      root: sourceRoot,
      taskIndex: buildTaskIdIndex(specsDir),
    });
    expect(result.findings.some((f) => f.file.endsWith(".json"))).toBe(false);
    rmSync(file);
  });
});

describe("auditfences command handler — exit codes (FR-007)", () => {
  it("exits 0 on a clean tree", async () => {
    const file = join(sourceRoot, "okay.ts");
    writeFileSync(
      file,
      [
        "// [SCOPE 013 / T042] BEGIN — Audit log retention pruning",
        "export function pruneAuditLogs(x: number) { return x; }",
        "// [SCOPE 013 / T042] END",
      ].join("\n"),
    );
    const result = await handleAuditFencesCommand({
      path: sourceRoot,
      specsRoot: specsDir,
      legacyFile: join(workdir, "nonexistent-legacy.json"),
    });
    expect(result.exitCode).toBe(0);
    rmSync(file);
  });

  it("exits 1 when an un-fenced declaration is present", async () => {
    const file = join(sourceRoot, "bad.ts");
    writeFileSync(file, "export function bad() { return 0; }\n");
    const result = await handleAuditFencesCommand({
      path: sourceRoot,
      specsRoot: specsDir,
      legacyFile: join(workdir, "nonexistent-legacy.json"),
    });
    expect(result.exitCode).toBe(1);
    rmSync(file);
  });

  it("--format json produces parseable JSON matching the schema", async () => {
    const file = join(sourceRoot, "for-json.ts");
    writeFileSync(file, "export function naked() {}\n");
    const result = await handleAuditFencesCommand({
      path: sourceRoot,
      specsRoot: specsDir,
      format: "json",
      legacyFile: join(workdir, "nonexistent-legacy.json"),
    });
    const parsed = JSON.parse(result.output);
    expect(parsed.summary).toBeDefined();
    expect(parsed.findings).toBeInstanceOf(Array);
    expect(parsed.perScope).toBeDefined();
    rmSync(file);
  });

  it("--baseline captures hashes and exits 0", async () => {
    const file = join(sourceRoot, "legacy.ts");
    writeFileSync(file, "export function legacyFn() { return 1; }\n");
    const baselineFile = join(workdir, "captured-legacy.json");
    const result = await handleAuditFencesCommand({
      path: sourceRoot,
      specsRoot: specsDir,
      baseline: true,
      legacyFile: baselineFile,
    });
    expect(result.exitCode).toBe(0);
    expect(result.baselineFile).toBe(baselineFile);
    rmSync(file);
  });

  it("after --baseline, an un-fenced legacy file is reported as info not error", async () => {
    const file = join(sourceRoot, "post-baseline.ts");
    writeFileSync(file, "export function legacyFn() { return 1; }\n");
    const baselineFile = join(workdir, "post-baseline.json");
    await handleAuditFencesCommand({
      path: sourceRoot,
      specsRoot: specsDir,
      baseline: true,
      legacyFile: baselineFile,
    });
    const result = await handleAuditFencesCommand({
      path: sourceRoot,
      specsRoot: specsDir,
      legacyFile: baselineFile,
    });
    expect(result.exitCode).toBe(0);
    expect(
      result.result?.findings.some(
        (f) => f.code === "LEGACY_UNFENCED" && f.severity === "info",
      ),
    ).toBe(true);
    rmSync(file);
  });

  it("--history with malformed argument returns exit 2", async () => {
    const result = await handleAuditFencesCommand({
      history: "not-valid",
      specsRoot: specsDir,
    });
    expect(result.exitCode).toBe(2);
  });
});
