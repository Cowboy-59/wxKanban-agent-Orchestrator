import { describe, it, expect } from "vitest";
import {
  LANGUAGE_MATRIX,
  buildFenceLine,
  getLanguageEntry,
  isSuppressed,
  UnknownExtensionError,
} from "../../core/orchestrator/language-matrix";
import { detectTopLevelDeclarations } from "../../core/orchestrator/declaration-detector";
import { sha256, isDriftDetected } from "../../core/orchestrator/content-hash";
import {
  emitFence,
  parseFences,
  truncateDescription,
  MAX_DESCRIPTION_LENGTH,
  FULL_REPLACEMENT_THRESHOLD,
  MODIFIED_BY_WARN_AT,
  NoDetectableUnitError,
  MalformedFenceError,
  TaskFenceRow,
} from "../../core/orchestrator/fence-emitter";

describe("FR-005 — Language matrix", () => {
  it("maps each declared extension to a comment style", () => {
    for (const ext of [
      ".ts",
      ".tsx",
      ".js",
      ".jsx",
      ".mjs",
      ".cjs",
      ".sql",
      ".css",
      ".scss",
      ".md",
      ".yaml",
      ".yml",
      ".html",
      ".json",
    ]) {
      expect(LANGUAGE_MATRIX[ext]).toBeDefined();
    }
  });

  it(".json is suppressed", () => {
    expect(isSuppressed(".json")).toBe(true);
  });

  it("unknown extension throws UnknownExtensionError", () => {
    expect(() => getLanguageEntry(".rs")).toThrow(UnknownExtensionError);
  });

  it("builds line comment for .ts", () => {
    expect(buildFenceLine(".ts", "[SCOPE 026 / T001] BEGIN — Hello")).toBe(
      "// [SCOPE 026 / T001] BEGIN — Hello",
    );
  });

  it("builds SQL comment for .sql", () => {
    expect(buildFenceLine(".sql", "[SCOPE 026 / T001] END")).toBe(
      "-- [SCOPE 026 / T001] END",
    );
  });

  it("builds block comment for .css", () => {
    expect(buildFenceLine(".css", "[SCOPE 026 / T001] END")).toBe(
      "/* [SCOPE 026 / T001] END */",
    );
  });

  it("builds HTML comment for .md", () => {
    expect(buildFenceLine(".md", "[SCOPE 026 / T001] END")).toBe(
      "<!-- [SCOPE 026 / T001] END -->",
    );
  });

  it("builds hash comment for .yaml", () => {
    expect(buildFenceLine(".yaml", "[SCOPE 026 / T001] END")).toBe(
      "# [SCOPE 026 / T001] END",
    );
  });

  it("builds JSX-wrapped comment for .tsx in JSX context", () => {
    expect(
      buildFenceLine(".tsx", "[SCOPE 026 / T001] BEGIN — X", true),
    ).toBe("{/* [SCOPE 026 / T001] BEGIN — X */}");
  });

  it("refuses to build a fence line for .json", () => {
    expect(() => buildFenceLine(".json", "anything")).toThrow();
  });
});

describe("FR-002 — Declaration detector", () => {
  it("detects an exported top-level function", () => {
    const src = `export function foo(x: number) {\n  return x;\n}\n`;
    const decls = detectTopLevelDeclarations(src, ".ts");
    expect(decls).toHaveLength(1);
    expect(decls[0]?.kind).toBe("function");
    expect(decls[0]?.name).toBe("foo");
  });

  it("detects a class declaration", () => {
    const src = `export class Bar {\n  method() { return 1; }\n}\n`;
    const decls = detectTopLevelDeclarations(src, ".ts");
    expect(decls).toHaveLength(1);
    expect(decls[0]?.kind).toBe("class");
    expect(decls[0]?.name).toBe("Bar");
  });

  it("detects a pgTable export as kind=table", () => {
    const src = `export const widgets = pgTable("widgets", {\n  id: uuid("id").primaryKey(),\n});\n`;
    const decls = detectTopLevelDeclarations(src, ".ts");
    expect(decls.some((d) => d.kind === "table" && d.name === "widgets")).toBe(
      true,
    );
  });

  it("detects an Express route handler as kind=route", () => {
    const src = `app.get("/health", (req, res) => res.send("ok"));\n`;
    const decls = detectTopLevelDeclarations(src, ".ts");
    expect(decls.some((d) => d.kind === "route")).toBe(true);
  });

  it("detects nothing in a .json file (suppressed)", () => {
    const src = `{ "foo": 1 }\n`;
    expect(detectTopLevelDeclarations(src, ".json")).toEqual([]);
  });

  it("detects a SQL migration as a single block", () => {
    const src = `CREATE TABLE foo (id uuid);\nCREATE INDEX foo_idx ON foo (id);\n`;
    const decls = detectTopLevelDeclarations(src, ".sql");
    expect(decls).toHaveLength(1);
    expect(decls[0]?.kind).toBe("migration");
  });

  it("returns empty for an unknown but non-suppressed extension via throw", () => {
    expect(() => detectTopLevelDeclarations("x", ".rs")).toThrow(
      UnknownExtensionError,
    );
  });
});

describe("FR-001 — Fence syntax + truncation", () => {
  it("truncates description to <= 60 chars with ellipsis", () => {
    const long = "a".repeat(80);
    const truncated = truncateDescription(long);
    expect(truncated.length).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH);
    expect(truncated.endsWith("…")).toBe(true);
  });

  it("leaves a short description unchanged", () => {
    expect(truncateDescription("Hello")).toBe("Hello");
  });
});

describe("FR-009 — Create-new fence emission", () => {
  it("wraps a fresh function with BEGIN/END fence", () => {
    const proposed = `export function pruneAuditLogs(x: number) {\n  return x + 1;\n}\n`;
    const result = emitFence({
      filepath: "src/server/services/auditRetention.ts",
      currentContent: null,
      proposedContent: proposed,
      ownerScope: "013",
      ownerTask: "T042",
      description: "Audit log retention pruning",
      existingFences: [],
    });
    expect(result.skipped).toBe(false);
    expect(result.content).toMatch(
      /\/\/ \[SCOPE 013 \/ T042\] BEGIN — Audit log retention pruning/,
    );
    expect(result.content).toMatch(/\/\/ \[SCOPE 013 \/ T042\] END/);
    expect(result.dbWrites).toHaveLength(1);
    expect(result.dbWrites[0]?.kind).toBe("create");
  });

  it("suppresses fence emission for .json files", () => {
    const proposed = `{\n  "flag": true\n}\n`;
    const result = emitFence({
      filepath: "config/flags.json",
      currentContent: null,
      proposedContent: proposed,
      ownerScope: "011",
      ownerTask: "T005",
      description: "Feature flags",
      existingFences: [],
    });
    expect(result.skipped).toBe(true);
    expect(result.content).toBe(proposed);
    expect(result.dbWrites).toHaveLength(0);
  });

  it("throws NoDetectableUnitError when no top-level declaration is found", () => {
    const proposed = `const x = 1;\nconst y = 2;\n`;
    expect(() =>
      emitFence({
        filepath: "src/x.ts",
        currentContent: null,
        proposedContent: proposed,
        ownerScope: "026",
        ownerTask: "T001",
        description: "no-op",
        existingFences: [],
      }),
    ).toThrow(NoDetectableUnitError);
  });
});

describe("Fence parser", () => {
  it("parses a single BEGIN/END pair", () => {
    const src = [
      "// [SCOPE 013 / T042] BEGIN — Audit log retention pruning",
      "export function pruneAuditLogs(x: number) { return x; }",
      "// [SCOPE 013 / T042] END",
    ].join("\n");
    const { fences } = parseFences(src);
    expect(fences).toHaveLength(1);
    expect(fences[0]?.ownerScope).toBe("013");
    expect(fences[0]?.ownerTask).toBe("T042");
    expect(fences[0]?.modifiedBy).toEqual([]);
  });

  it("parses a fence with one MODIFIED-BY line", () => {
    const src = [
      "// [SCOPE 013 / T042] BEGIN — Audit log retention pruning",
      "// [SCOPE 015 / T011] MODIFIED-BY — added soft-delete branch",
      "export function pruneAuditLogs(x: number) { return x; }",
      "// [SCOPE 013 / T042] END",
    ].join("\n");
    const { fences } = parseFences(src);
    expect(fences[0]?.modifiedBy).toHaveLength(1);
    expect(fences[0]?.modifiedBy[0]?.scope).toBe("015");
    expect(fences[0]?.modifiedBy[0]?.task).toBe("T011");
  });

  it("throws MalformedFenceError when BEGIN has no matching END", () => {
    const src = "// [SCOPE 013 / T042] BEGIN — orphan\nexport function f() {}\n";
    expect(() => parseFences(src)).toThrow(MalformedFenceError);
  });

  it("parses a replacement fence (replaces N/Tn)", () => {
    const src = [
      "// [SCOPE 015 / T055] BEGIN — Audit log retention pruning (replaces 013/T042)",
      "export function pruneAuditLogs(x: number) { return x; }",
      "// [SCOPE 015 / T055] END",
    ].join("\n");
    const { fences } = parseFences(src);
    expect(fences[0]?.replacesNote).toBe("013/T042");
  });
});

describe("FR-010 — SHA-256 drift detection", () => {
  it("sha256 of a known string matches the expected hex digest", () => {
    expect(sha256("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("identical content yields identical hashes (no drift)", () => {
    const body = "export function f() { return 1; }";
    expect(isDriftDetected(body, sha256(body))).toBe(false);
  });

  it("modified content yields different hash (drift detected)", () => {
    const original = "export function f() { return 1; }";
    const tampered = "export function f() { return 2; }";
    expect(isDriftDetected(tampered, sha256(original))).toBe(true);
  });
});

describe("Spec constants", () => {
  it("FULL_REPLACEMENT_THRESHOLD is 0.8 (FR-004)", () => {
    expect(FULL_REPLACEMENT_THRESHOLD).toBe(0.8);
  });

  it("MODIFIED_BY_WARN_AT is 5 (FR-003)", () => {
    expect(MODIFIED_BY_WARN_AT).toBe(5);
  });

  it("MAX_DESCRIPTION_LENGTH is 60 (FR-001)", () => {
    expect(MAX_DESCRIPTION_LENGTH).toBe(60);
  });
});

describe("FR-003 / FR-004 — Existing fence flow (decision routing)", () => {
  const baseExisting: TaskFenceRow = {
    id: "00000000-0000-7000-8000-000000000001",
    filepath: "src/x.ts",
    unitkind: "function",
    unitname: "pruneAuditLogs",
    ownerscope: "013",
    ownertask: "T042",
    description: "Audit log retention pruning",
    contenthash: sha256(
      `export function pruneAuditLogs(x: number) {\n  return x;\n}`,
    ),
    linestart: 1,
    lineend: 3,
  };

  it("MODIFIED-BY path inserts the modifier line and writes a modification + update", () => {
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
      existingFences: [{ ...baseExisting, linestart: 2, lineend: 4 }],
      mode: "modify",
    });
    expect(result.content).toMatch(
      /\[SCOPE 015 \/ T011\] MODIFIED-BY — added soft-delete branch/,
    );
    expect(result.content).toMatch(
      /\[SCOPE 013 \/ T042\] BEGIN — Audit log retention pruning/,
    );
    expect(result.dbWrites.some((w) => w.kind === "modification")).toBe(true);
    expect(result.dbWrites.some((w) => w.kind === "update")).toBe(true);
  });

  it("Full-replacement path writes a history row and a new fence", () => {
    const current = [
      "// [SCOPE 013 / T042] BEGIN — Audit log retention pruning",
      "export function pruneAuditLogs(x: number) { return x; }",
      "// [SCOPE 013 / T042] END",
    ].join("\n");
    const proposed = `export function pruneAuditLogs(): Promise<number> {\n  throw new Error("rewritten");\n}\n`;
    const result = emitFence({
      filepath: "src/x.ts",
      currentContent: current,
      proposedContent: proposed,
      ownerScope: "015",
      ownerTask: "T055",
      description: "Audit log retention pruning",
      existingFences: [{ ...baseExisting, linestart: 2, lineend: 2 }],
      mode: "replace",
    });
    expect(result.content).toMatch(
      /\[SCOPE 015 \/ T055\] BEGIN — Audit log retention pruning \(replaces 013\/T042\)/,
    );
    expect(result.content).toMatch(/\[SCOPE 015 \/ T055\] END/);
    expect(result.dbWrites.some((w) => w.kind === "history")).toBe(true);
  });
});
