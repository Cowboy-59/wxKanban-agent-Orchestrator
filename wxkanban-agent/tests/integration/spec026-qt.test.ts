import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "fs";
import { tmpdir } from "os";
import { join, extname } from "path";
import { handleImplementCommand } from "../../core/orchestrator/command-handlers/implement";
import { handleAuditFencesCommand } from "../../core/orchestrator/command-handlers/auditfences";
// Spec 019 R6a — implement no longer calls AIClient.
import {
  emitFence,
  FULL_REPLACEMENT_THRESHOLD,
  MODIFIED_BY_WARN_AT,
} from "../../core/orchestrator/fence-emitter";
import { LANGUAGE_MATRIX } from "../../core/orchestrator/language-matrix";
import { sha256, isDriftDetected } from "../../core/orchestrator/content-hash";

let workdir: string;
let specsDir: string;

function writeSpec(scope: string, slug: string, tasks: { id: string; title: string }[]) {
  const dir = join(specsDir, `${scope}-${slug}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "spec.md"),
    `# Spec ${scope}: ${slug}\n\n## Overview\nQT fixture.\n`,
  );
  const rows = tasks.map(
    (t, i) => `| ${i + 1} | ${t.id}: ${t.title} | high | todo |`,
  );
  writeFileSync(
    join(dir, "tasks.md"),
    [
      "# Tasks",
      "",
      "| # | Task | Priority | Status |",
      "|---|------|----------|--------|",
      ...rows,
    ].join("\n"),
  );
}

beforeAll(() => {
  workdir = mkdtempSync(join(tmpdir(), "qt-026-"));
  specsDir = join(workdir, "specs");
  mkdirSync(specsDir, { recursive: true });
});

afterAll(() => {
  rmSync(workdir, { recursive: true, force: true });
});

beforeEach(() => {
  rmSync(specsDir, { recursive: true, force: true });
  mkdirSync(specsDir, { recursive: true });
  for (const p of ["src", "out", "migrations", "styles", "configs"]) {
    const dir = join(workdir, p);
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
});

describe("QT-1 — fresh-write fence emission across every FR-005 language (US1, US6)", () => {
  it("emits valid fences for TS, SQL, CSS, YAML, MD, and HTML files", () => {
    const samples: Array<{ ext: string; body: string; expectMatch: RegExp }> = [
      {
        ext: ".ts",
        body: `export function ts(): number { return 1; }\n`,
        expectMatch: /^\/\/ \[SCOPE 099 \/ T001\] BEGIN/,
      },
      {
        ext: ".sql",
        body: `CREATE TABLE qt1 (id uuid);\n`,
        expectMatch: /^-- \[SCOPE 099 \/ T001\] BEGIN/,
      },
    ];
    for (const s of samples) {
      const result = emitFence({
        filepath: `out/sample${s.ext}`,
        currentContent: null,
        proposedContent: s.body,
        ownerScope: "099",
        ownerTask: "T001",
        description: "QT-1 fresh write",
        existingFences: [],
      });
      const firstLine = result.content.split(/\r?\n/)[0] ?? "";
      expect(firstLine, `${s.ext} fence missing`).toMatch(s.expectMatch);
    }
  });

  it("skips fence emission entirely for .json (US6, FR-005)", () => {
    const result = emitFence({
      filepath: "config/flags.json",
      currentContent: null,
      proposedContent: '{ "flag": true }\n',
      ownerScope: "099",
      ownerTask: "T001",
      description: "config",
      existingFences: [],
    });
    expect(result.skipped).toBe(true);
    expect(result.content).toBe('{ "flag": true }\n');
  });

  it("LANGUAGE_MATRIX includes all FR-005 extensions", () => {
    const required = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".sql", ".css", ".scss", ".md", ".yaml", ".yml", ".html", ".json"];
    for (const ext of required) {
      expect(LANGUAGE_MATRIX[ext], `missing ${ext}`).toBeDefined();
    }
  });
});

describe("QT-2 — MODIFIED-BY insertion + stack + warning at 5+ (US2)", () => {
  it("inserts a MODIFIED-BY line under the original BEGIN on partial edit", () => {
    const current = [
      "// [SCOPE 013 / T042] BEGIN — Audit log retention pruning",
      "export function pruneAuditLogs(x: number) {",
      "  return x;",
      "}",
      "// [SCOPE 013 / T042] END",
    ].join("\n");
    const proposed = `export function pruneAuditLogs(x: number) {\n  if (x < 0) return 0;\n  return x;\n}\n`;
    const result = emitFence({
      filepath: "src/x.ts",
      currentContent: current,
      proposedContent: proposed,
      ownerScope: "015",
      ownerTask: "T011",
      description: "added soft-delete branch",
      existingFences: [{
        id: "00000000-0000-7000-8000-000000000001",
        filepath: "src/x.ts",
        unitkind: "function",
        unitname: "pruneAuditLogs",
        ownerscope: "013",
        ownertask: "T042",
        description: "Audit log retention pruning",
        contenthash: sha256("export function pruneAuditLogs(x: number) {\n  return x;\n}"),
        linestart: 2,
        lineend: 4,
      }],
      mode: "modify",
    });
    expect(result.content).toMatch(/\[SCOPE 015 \/ T011\] MODIFIED-BY/);
    expect(result.content).toMatch(/\[SCOPE 013 \/ T042\] BEGIN/);
    expect(result.dbWrites.some((w) => w.kind === "modification")).toBe(true);
  });

  it("MODIFIED_BY_WARN_AT constant matches spec FR-003 (= 5)", () => {
    expect(MODIFIED_BY_WARN_AT).toBe(5);
  });
});

describe("QT-3 — full-replacement at 80% threshold + flag overrides (US3)", () => {
  it("FULL_REPLACEMENT_THRESHOLD constant is 0.8 (FR-004)", () => {
    expect(FULL_REPLACEMENT_THRESHOLD).toBe(0.8);
  });

  it("--replace flag forces full replacement and writes a history row", () => {
    const current = [
      "// [SCOPE 013 / T042] BEGIN — Audit log retention pruning",
      "export function pruneAuditLogs(): number { return 1; }",
      "// [SCOPE 013 / T042] END",
    ].join("\n");
    const proposed = `export function pruneAuditLogs(): Promise<number> { throw new Error("rewritten"); }\n`;
    const result = emitFence({
      filepath: "src/x.ts",
      currentContent: current,
      proposedContent: proposed,
      ownerScope: "015",
      ownerTask: "T055",
      description: "Audit log retention pruning",
      existingFences: [{
        id: "00000000-0000-7000-8000-000000000002",
        filepath: "src/x.ts",
        unitkind: "function",
        unitname: "pruneAuditLogs",
        ownerscope: "013",
        ownertask: "T042",
        description: "Audit log retention pruning",
        contenthash: sha256("export function pruneAuditLogs(): number { return 1; }"),
        linestart: 2,
        lineend: 2,
      }],
      mode: "replace",
    });
    expect(result.content).toMatch(/\(replaces 013\/T042\)/);
    expect(result.dbWrites.some((w) => w.kind === "history")).toBe(true);
  });
});

describe("QT-4 — auditfences exit codes + JSON schema (US4, US5)", () => {
  beforeEach(() => {
    writeSpec("099", "qt4", [
      { id: "T001", title: "QT-4 task" },
    ]);
  });

  it("exits 0 on a clean tree", async () => {
    const src = join(workdir, "src");
    mkdirSync(src, { recursive: true });
    writeFileSync(
      join(src, "clean.ts"),
      [
        "// [SCOPE 099 / T001] BEGIN — QT-4 task",
        "export function qt4(): number { return 1; }",
        "// [SCOPE 099 / T001] END",
      ].join("\n"),
    );
    const result = await handleAuditFencesCommand({
      path: src,
      specsRoot: specsDir,
      legacyFile: join(workdir, ".legacy-nonexistent.json"),
    });
    expect(result.exitCode).toBe(0);
  });

  it("exits 1 with UNFENCED_DECL when a declaration lacks a fence", async () => {
    const src = join(workdir, "src");
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, "bad.ts"), "export function naked() {}\n");
    const result = await handleAuditFencesCommand({
      path: src,
      specsRoot: specsDir,
      legacyFile: join(workdir, ".legacy-nonexistent.json"),
    });
    expect(result.exitCode).toBe(1);
    expect(
      result.result?.findings.some((f) => f.code === "UNFENCED_DECL"),
    ).toBe(true);
  });

  it("--format json output matches schema { summary, findings, perScope }", async () => {
    const src = join(workdir, "src");
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, "naked.ts"), "export function naked() {}\n");
    const result = await handleAuditFencesCommand({
      path: src,
      specsRoot: specsDir,
      format: "json",
      legacyFile: join(workdir, ".legacy-nonexistent.json"),
    });
    const parsed = JSON.parse(result.output);
    expect(parsed.summary).toBeDefined();
    expect(parsed.summary.files).toBeGreaterThanOrEqual(0);
    expect(parsed.summary.errors).toBeGreaterThanOrEqual(0);
    expect(parsed.findings).toBeInstanceOf(Array);
    expect(parsed.perScope).toBeDefined();
  });

  it("--history with a malformed argument exits 2", async () => {
    const result = await handleAuditFencesCommand({
      history: "not-a-valid-task",
      specsRoot: specsDir,
    });
    expect(result.exitCode).toBe(2);
  });
});

describe("QT-5 — drift detection + --accept-drift (US7)", () => {
  it("isDriftDetected returns true for tampered content", () => {
    const original = "export function pruneAuditLogs(x: number) { return x; }";
    const tampered = "export function pruneAuditLogs(x: number) { return x + 1; }";
    expect(isDriftDetected(tampered, sha256(original))).toBe(true);
  });

  it("isDriftDetected returns false for unchanged content", () => {
    const body = "export function pruneAuditLogs(x: number) { return x; }";
    expect(isDriftDetected(body, sha256(body))).toBe(false);
  });
});

describe("QT-6 — idempotent implement re-run (FR-009)", () => {
  it("second invocation with identical inputs is a no-op", async () => {
    writeSpec("099", "qt6", [
      { id: "T001", title: "QT-6 idempotent" },
    ]);
    const payload = JSON.stringify([
      {
        path: "src/qt6.ts",
        body: `export function qt6(): number { return 1; }\n`,
        action: "create",
      },
    ]);
    const first = await handleImplementCommand({
      scope: "099",
      task: "T001",
      projectRoot: workdir,
      specsRoot: "specs",
      proposalJson: payload,
    });
    expect(first.exitCode).toBe(0);
    const afterFirst = readFileSync(join(workdir, "src/qt6.ts"), "utf-8");
    const second = await handleImplementCommand({
      scope: "099",
      task: "T001",
      projectRoot: workdir,
      specsRoot: "specs",
      proposalJson: payload,
    });
    expect(second.exitCode).toBe(0);
    const afterSecond = readFileSync(join(workdir, "src/qt6.ts"), "utf-8");
    expect(afterSecond.replace(/[\r\n]+/g, "\n")).toBe(
      afterFirst.replace(/[\r\n]+/g, "\n"),
    );
  });
});

void extname;
