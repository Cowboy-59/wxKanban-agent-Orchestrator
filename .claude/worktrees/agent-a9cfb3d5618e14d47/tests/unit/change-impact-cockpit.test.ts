// SCOPE-137 / T011 — the kit scripts the Cockpit runs (FR-010).
//
// The Cockpit shells out to the kit, so these run the scripts as processes, the way it does:
//   - change-impact.mjs --before: a hand save is judged against the file as it was just before;
//   - acknowledge.mjs: Agree/Undo for a hand edit is an acknowledgment, never an approval;
//   - fence-usage.mjs: the per-fence counts behind the CodeLens;
//   - the fence reader: only a line-start comment is a fence — fence text in a string is not.
//
// Written directly: the fencer rejects test files with no top-level declaration.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { fencedScopes } from "../../_wxAI/impact/lib/scopes.mjs";
import { fencesIn } from "../../_wxAI/impact/fence-usage.mjs";
import { acknowledge } from "../../_wxAI/impact/acknowledge.mjs";
import { FIXTURES } from "../../_wxAI/impact/prove.mjs";

// Never reach the real wxKanban from a test. tests/setup.env.ts loads .env, which holds a real token
// and project id; on 2026-10-17 one run filed 7 test records into the production agreement log
// that way. Clear them, and point any stray send at an address nothing listens on.
for (const k of ["WXKANBAN_API_TOKEN", "WXKANBAN_PROJECT_ID"]) delete process.env[k];
process.env.WXKANBAN_MCP_URL = "http://127.0.0.1:9/mcp";

const KIT = resolve("_wxAI/impact");
let root = "";
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "impact-cockpit-"));
  for (const [file, content] of Object.entries(FIXTURES.native.files)) {
    mkdirSync(join(root, file, ".."), { recursive: true });
    writeFileSync(join(root, file), content);
  }
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const engine = (args: string[]) =>
  spawnSync(process.execPath, [join(KIT, "change-impact.mjs"), "--root", root, "--quiet", ...args], { encoding: "utf8" });

describe("SCOPE-137 T011 — kit scripts behind the Cockpit (FR-010)", () => {
  it("--before: a hand save that drops a column is possible data loss, judged against the pre-save file", () => {
    const before = join(root, "before.sql");
    writeFileSync(before, "ALTER TABLE items ADD COLUMN sku text;\n");
    writeFileSync(join(root, "src/db/migrations/0001_items.sql"), "ALTER TABLE items ADD COLUMN sku text;\nALTER TABLE items DROP COLUMN sku;\n");
    const r = engine(["--changed", "src/db/migrations/0001_items.sql", "--before", before]);
    expect(r.status).toBe(3); // stop
    const report = JSON.parse(readFileSync(join(root, ".wxai/impact.json"), "utf8"));
    expect(report.classification.dataLoss.map((d: { kind: string }) => d.kind)).toEqual(["drop-column"]);
  });

  it("--before: a statement already in the file before the save is not news", () => {
    const content = "DELETE FROM sessions;\n";
    writeFileSync(join(root, "src/db/migrations/0009_cleanup.sql"), content);
    const before = join(root, "before.sql");
    writeFileSync(before, content);
    expect(engine(["--changed", "src/db/migrations/0009_cleanup.sql", "--before", before]).status).toBe(0);
  });

  it("--before needs exactly one changed file", () => {
    expect(engine(["--changed", "a.ts,b.ts", "--before", join(root, "x")]).status).toBe(2);
  });

  it("acknowledge: Agree on a hand edit is recorded as an acknowledgment from the Cockpit", async () => {
    writeFileSync(join(root, ".wxkanban-project.json"), JSON.stringify({ projectId: "ba924193-0335-4080-9fa6-33cd6b81300a" }));
    engine(["--changed", "src/server/service.ts"]);
    const report = JSON.parse(readFileSync(join(root, ".wxai/impact.json"), "utf8"));
    const sent: Array<{ type: string; source: string; metadata: Record<string, unknown> }> = [];
    const out = await acknowledge({ root, report, answer: "agree", hash: "a".repeat(64), actor: "andy", send: async (e: never) => { sent.push(e); return {}; } });
    expect(out).toMatchObject({ ok: true, sent: true });
    expect(sent[0].type).toBe("change_impact_ack");
    expect(sent[0].source).toBe("vscode");
    expect(sent[0].metadata).toMatchObject({ kind: "acknowledgment", answer: "agree", entryPoint: "cockpit", attended: true });
  });

  it("acknowledge refuses an answer other than agree or undo, and a missing hash", async () => {
    const report = { changedFiles: [], links: [], summary: { affected: 0 }, classification: { reasons: [], ownScopes: [], mode: "boundaries", decision: "ask", dataLoss: [] } };
    expect((await acknowledge({ root, report, answer: "approve", hash: "h", actor: "a" })).ok).toBe(false);
    expect((await acknowledge({ root, report, answer: "agree", hash: "", actor: "a" })).ok).toBe(false);
  });

  it("fence-usage: per-fence counts behind the CodeLens, from one run", () => {
    // service.ts's fence exports saveItem; routes/items.ts imports it.
    const out = JSON.parse(execFileSync(process.execPath, [join(KIT, "fence-usage.mjs"), "src/server/service.ts", "--root", root], { encoding: "utf8" }));
    expect(out.fences).toHaveLength(1);
    expect(out.fences[0]).toMatchObject({ scope: "001", task: "T001", symbols: ["saveItem"], usedByFiles: 1, files: ["src/server/routes/items.ts"] });
  });

  it("only a line-start comment is a fence: fence text inside a string is not one", () => {
    expect(fencedScopes("// [SCOPE 031 / T002] BEGIN — y")).toEqual(["031"]);
    expect(fencedScopes("  -- [SCOPE 012 / T001] BEGIN — sql")).toEqual(["012"]);
    expect(fencedScopes("{/* [SCOPE 058 / T003] BEGIN — jsx */}")).toEqual(["058"]);
    expect(fencedScopes('const s = "// [SCOPE 010 / T001] BEGIN — in a string";')).toEqual([]);
    expect(fencedScopes("x(); // [SCOPE 099 / T001] BEGIN — trailing")).toEqual([]);
    const src = "// [SCOPE 001 / T001] BEGIN — a\nconst s = '// [SCOPE 002 / T001] END';\nexport const a = 1;\n// [SCOPE 001 / T001] END\n";
    expect(fencesIn(src)).toEqual([{ line: 1, endLine: 4, scope: "001", task: "T001", title: "a" }]);
  });
});
