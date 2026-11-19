// SCOPE-137 / T012 — the /buildscope impact step (FR-011).
//
// Before an edit or amendment is written, /buildscope shows the specs that implement the scope,
// the code fenced to it and the scopes that depend on it, asks, and records the answer.
// Fences carry the SPEC folder number (SCOPE-045's code is fenced 046–050), so the script must
// follow the implementing specs to find the code. US3: no amendment is written without the
// impact shown and an answer given.
//
// Written directly: the fencer rejects test files with no top-level declaration.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { recordScopeAnswer, renderScopeImpact, scopeImpact } from "../../_wxAI/impact/scope-impact.mjs";

// Never reach the real wxKanban from a test. tests/setup.env.ts loads .env, which holds a real token
// and project id; on 2026-10-17 one run filed 7 test records into the production agreement log
// that way. Clear them, and point any stray send at an address nothing listens on.
for (const k of ["WXKANBAN_API_TOKEN", "WXKANBAN_PROJECT_ID"]) delete process.env[k];
process.env.WXKANBAN_MCP_URL = "http://127.0.0.1:9/mcp";

let root = "";
const put = (rel: string, body: string) => {
  mkdirSync(join(root, rel, ".."), { recursive: true });
  writeFileSync(join(root, rel), body);
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "impact-scope-"));
  put("specs/Project-Scope/045-marketing.md", "# Scope 045: Marketing\n\n**Depends On**: None\n**Implemented By**: SPEC-050 (`specs/050-outcomes/`)\n");
  put("specs/Project-Scope/052-alerts.md", "# Scope 052: Alerts\n\n**Depends On**: SCOPE-045 (marketing), Spec 008\n");
  put("specs/Project-Scope/060-other.md", "# Scope 060: Other\n\n**Depends On**: SCOPE-046\n");
  put("specs/046-lead-capture/spec.md", "# Spec 046\n\n**Parent Scope**: spec 045 (Marketing umbrella)\n");
  put("specs/050-outcomes/spec.md", "# Spec 050\n\n**Implements**: SCOPE-045\n");
  put("specs/026-CodeFencing/spec.md", "# Spec 026: Code Fencing\n");
  put("src/leads.ts", "// [SCOPE 046 / T001] BEGIN — leads\nexport const leads = 1;\n// [SCOPE 046 / T001] END\n");
  put("src/outcomes.ts", "// [SCOPE 050 / T002] BEGIN — outcomes\nexport const o = 1;\n// [SCOPE 050 / T002] END\n// [SCOPE 099 / T001] BEGIN — shared\nexport const s = 1;\n// [SCOPE 099 / T001] END\n");
  put("src/unrelated.ts", "// [SCOPE 099 / T001] BEGIN — x\nexport const x = 1;\n// [SCOPE 099 / T001] END\n");
  put("src/strings.ts", "export const t = '// [SCOPE 045 / T001] BEGIN — not a fence';\n");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("SCOPE-137 T012 — scope impact (FR-011)", () => {
  it("finds the implementing specs in both the current and the older form", () => {
    expect(scopeImpact({ root, scope: "045" }).specs.map((s: { spec: string }) => s.spec)).toEqual(["046", "050"]);
  });

  it("follows the specs to the fenced code, and names files shared with other scopes", () => {
    const r = scopeImpact({ root, scope: "45" });
    expect(r.fencedFiles).toEqual([
      { file: "src/leads.ts", labels: ["046"], shared: [] },
      { file: "src/outcomes.ts", labels: ["050"], shared: ["099"] },
    ]);
  });

  it("lists the scopes that depend on it, whatever the reference style", () => {
    expect(scopeImpact({ root, scope: "045" }).dependents.map((d: { scope: string }) => d.scope)).toEqual(["052"]);
  });

  it("a legacy scope with no scope file is its own spec folder", () => {
    const r = scopeImpact({ root, scope: "026" });
    expect(r.file).toBe("specs/026-CodeFencing/spec.md");
    expect(r.specs).toEqual([{ spec: "026", folder: "specs/026-CodeFencing" }]);
  });

  it("the text shown to the developer names all three, and an unknown scope says so", () => {
    const text = renderScopeImpact(scopeImpact({ root, scope: "045" }));
    expect(text).toMatch(/Specs that implement it: SPEC-046 .*SPEC-050/);
    expect(text).toMatch(/Code fenced to it: 2 file\(s\), 1 of them shared with other scopes/);
    expect(text).toMatch(/Scopes that depend on it: SCOPE-052 \(Scope 052: Alerts\)/);
    expect(renderScopeImpact(scopeImpact({ root, scope: "777" }))).toMatch(/no scope file for SCOPE-777/);
  });

  it("records the answer as an approval from /buildscope, with the developer's words and the draft's hash", async () => {
    writeFileSync(join(root, ".wxkanban-project.json"), JSON.stringify({ projectId: "ba924193-0335-4080-9fa6-33cd6b81300a" }));
    const sent: Array<{ type: string; metadata: Record<string, unknown> }> = [];
    const out = await recordScopeAnswer({
      root, scope: "045", answer: "approve", quote: "yes, add the SMS consent", draft: "# Scope 045 v2\n", actor: "andy",
      send: async (e: never) => { sent.push(e); return {}; },
    });
    expect(out).toMatchObject({ ok: true, sent: true });
    expect(sent[0].type).toBe("change_impact_approval");
    expect(sent[0].metadata).toMatchObject({ kind: "approval", answer: "approve", entryPoint: "buildscope", quote: "yes, add the SMS consent" });
    expect((sent[0].metadata.scopes as string[]).sort()).toEqual(["045", "052"]);
    expect((sent[0].metadata.change as { hash: string }).hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses to record without the developer's words", async () => {
    expect((await recordScopeAnswer({ root, scope: "045", answer: "approve", quote: " ", actor: "a" })).ok).toBe(false);
  });

  it("US3: /buildscope's edit mode shows the impact and asks BEFORE it writes the file", () => {
    const prompt = readFileSync("mcp-server/src/prompts/buildscope.md", "utf8");
    const edit = prompt.slice(prompt.indexOf("## Edit Mode"));
    const impact = edit.indexOf("scope-impact.mjs NNN");
    const write = edit.indexOf("**Write the returned `scopeContent` back");
    expect(impact).toBeGreaterThan(0);
    expect(write).toBeGreaterThan(impact);
    expect(edit).toMatch(/\*\*No:\*\* write nothing/);
    expect(edit).toMatch(/--record --answer approve\|decline/);
  });
});

describe("SCOPE-137 T013 — wxBrainstorm shows the impact and writes nothing (FR-012)", () => {
  it("step 3 runs both checks show-only, before 'This step writes nothing'", () => {
    const skill = readFileSync(".claude/skills/wxBrainstorm/SKILL.md", "utf8");
    const step3 = skill.slice(skill.indexOf("### 3."), skill.indexOf("### 4."));
    expect(step3).toMatch(/scope-impact\.mjs NNN --no-cache/);
    expect(step3).toMatch(/change-impact\.mjs --changed "<file>,<file>" --no-write\s+--no-cache --summary/);
    expect(step3).toMatch(/\*\*Confirmed\*\* or\s+\*\*Likely\*\*/);
    expect(step3.indexOf("What changing it would reach")).toBeLessThan(step3.indexOf("This step writes nothing."));
  });

  it("run that way, neither command creates or changes any file", async () => {
    const { spawnSync } = await import("node:child_process");
    const { existsSync, readdirSync } = await import("node:fs");
    const listing = () => readdirSync(root, { recursive: true }).map(String).sort();
    const before = listing();
    const kit = (script: string, args: string[]) =>
      spawnSync(process.execPath, [join(process.cwd(), "_wxAI/impact", script), ...args], { cwd: root, encoding: "utf8" });
    const summary = kit("change-impact.mjs", ["--root", root, "--changed", "src/leads.ts", "--no-write", "--no-cache", "--summary"]);
    expect(summary.stdout).toMatch(/^# Change Impact/);
    const scope = kit("scope-impact.mjs", ["045", "--root", root, "--no-cache"]);
    expect(scope.stdout).toMatch(/Change Impact for an amendment to SCOPE-045/);
    expect(existsSync(join(root, ".wxai"))).toBe(false);
    expect(listing()).toEqual(before);
  });
});
