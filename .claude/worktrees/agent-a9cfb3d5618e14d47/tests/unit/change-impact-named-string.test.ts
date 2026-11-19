// SCOPE-137 / T021 — a shared name alone is not an Impact Boundary (Amendment B, FR-006a).
//
// Two files in different scopes that only share an MCP tool name are listed as Likely impact, and the
// change is notify. Add an import between them and it is a boundary again.
//
// Written directly: the fencer rejects test files with no top-level declaration.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildReport } from "../../_wxAI/impact/change-impact.mjs";

// Never reach the real wxKanban from a test (see change-impact-hook.test.ts, 2026-10-17).
for (const k of ["WXKANBAN_API_TOKEN", "WXKANBAN_PROJECT_ID"]) delete process.env[k];
process.env.WXKANBAN_MCP_URL = "http://127.0.0.1:9/mcp";

let root = "";
const write = (rel: string, text: string) => {
  mkdirSync(join(root, rel, ".."), { recursive: true });
  writeFileSync(join(root, rel), text);
};
const fenced = (scope: string, body: string) => `// [SCOPE ${scope} / T001] BEGIN — fixture\n${body}\n// [SCOPE ${scope} / T001] END\n`;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "impact-names-"));
  write("tsconfig.json", "{}");
  write("src/caller.ts", fenced("001", "export const send = (c: { call: (n: string) => void }) => c.call('project.create_task');"));
  write("src/other.ts", fenced("002", "export const other = (c: { call: (n: string) => void }) => c.call('project.create_task');"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("SCOPE-137 T021 — a shared name alone is not an Impact Boundary (FR-006a)", () => {
  it("lists the file that shares the tool name as Likely impact, but does not reach its scope", () => {
    const report = buildReport({ root, changedFiles: ["src/caller.ts"], useCache: false });
    const named = report.links.filter((l: { type: string; to: string }) => l.type === "named-string" && l.to === "src/other.ts");
    expect(named.length).toBeGreaterThan(0);
    expect(report.scopes.reachedScopes).not.toContain("002");
    expect(report.classification.reasons.filter((r: { kind: string }) => r.kind === "other-scope")).toEqual([]);
    expect(report.classification.boundary).toBe(false);
    expect(report.classification.decision).toBe("notify");
  });

  it("a change to the file that DEFINES the name reaches the scopes that use it", () => {
    write("src/tools.ts", fenced("003", "export function handle(name: string) { switch (name) { case 'project.create_task': return 1; } return 0; }"));
    const report = buildReport({ root, changedFiles: ["src/tools.ts"], useCache: false });
    expect(report.scopes.reachedScopes.sort()).toEqual(["001", "002"]);
    expect(report.classification.boundary).toBe(true);
    expect(report.links.find((l: { type: string; defines?: boolean }) => l.type === "named-string")?.defines).toBe(true);
  });

  it("an import into the other scope's file is still a boundary", () => {
    write("src/other.ts", fenced("002", "import { send } from './caller';\nexport const other = send;"));
    const report = buildReport({ root, changedFiles: ["src/caller.ts"], useCache: false });
    expect(report.classification.reasons.map((r: { kind: string; scope?: string }) => `${r.kind}:${r.scope ?? ""}`)).toContain("other-scope:002");
    expect(report.classification.boundary).toBe(true);
  });
});
