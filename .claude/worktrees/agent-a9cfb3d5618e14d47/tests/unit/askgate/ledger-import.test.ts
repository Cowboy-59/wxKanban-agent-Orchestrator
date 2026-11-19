// SPEC-142 / T004 — /wxLedger import: propose from a brainstorm record, write only on approval.
//
// Written directly: the fencer rejects test files with no top-level declaration.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { parseDecisionRows, proposeEntry } from "../../../_wxAI/askgate/import.mjs";
import { checkLedger, readLedger } from "../../../_wxAI/askgate/ledger.mjs";

const REPO = process.cwd();
const IMPORT = join(REPO, "_wxAI", "askgate", "import.mjs");
const RECORD = join(REPO, "docs", "brainstorms", "2026-10-22-parallel-build-agent.md");
const temps: string[] = [];
afterAll(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});
// [SCOPE 142 / T004] BEGIN — /wxLedger command: check, check --global, search, import (F…
function sandbox(): string {
  const d = mkdtempSync(join(tmpdir(), "import-test-"));
  temps.push(d);
  mkdirSync(join(d, "docs", "brainstorms"), { recursive: true });
  cpSync(RECORD, join(d, "docs", "brainstorms", "rec.md"));
  return d;
}
// [SCOPE 142 / T004] END

describe("parseDecisionRows", () => {
  const sample = [
    "## Decisions",
    "| # | Item | Decision | Kind | To scope? | Date |",
    "|---|---|---|---|---|---|",
    "| 1 | Pipes | Use a \\| b | Agreed | done (SCOPE-142) | 2026-10-22 |",
    "",
    "| 2 | Later | Wait | Parked | no | 2026-10-23 |",
    "| 3 | Bad | x | Whatever | no | 2026-10-23 |",
    "| 4 | Short | only three |",
    "## Open items",
    "| 9 | not | in | the | table | 2026-01-01 |",
  ].join("\n");

  it("reads rows across a blank line, unescapes pipes, stops at the next section", () => {
    const { rows, problems } = parseDecisionRows(sample);
    expect(rows.map((r) => r.num)).toEqual(["1", "2", "3"]);
    expect(rows[0].decision).toBe("Use a | b");
    expect(problems).toHaveLength(1);
  });

  it("maps Parked to evidence unknown and others to confirmed; flags unknown kinds", () => {
    const { rows } = parseDecisionRows(sample);
    const ctx = { recordPath: "docs/x.md", scopeFallback: "x" };
    expect(proposeEntry(rows[0], ctx).entry).toMatchObject({ kind: "Agreed", evidence: "confirmed", scope: "SCOPE-142", source: "docs/x.md#1" });
    expect(proposeEntry(rows[1], ctx).entry).toMatchObject({ kind: "Parked", evidence: "unknown", scope: "x" });
    expect(proposeEntry(rows[2], ctx).error).toMatch(/unknown kind/);
  });

  it("reports a record with no Decisions section", () => {
    expect(parseDecisionRows("# nothing").problems[0]).toMatch(/Decisions/);
  });
});

describe("import CLI against the parallel-build-agent record", () => {
  it("prints one proposed entry per decision row and writes nothing without --approve", () => {
    const root = sandbox();
    const r = spawnSync(process.execPath, [IMPORT, "docs/brainstorms/rec.md", "--root", root], { encoding: "utf8" });
    expect(r.status).toBe(0);
    const rowCount = parseDecisionRows(readFileSync(RECORD, "utf8")).rows.length;
    expect(rowCount).toBe(14);
    expect(r.stdout).toContain(`${rowCount} of ${rowCount} decision row(s)`);
    expect(r.stdout.match(/^\s+\d+\.\s\[/gm)).toHaveLength(rowCount);
    expect(r.stdout).toContain("Nothing written");
    expect(existsSync(join(root, "decisions", "ledger.yaml"))).toBe(false);
  });

  it("writes every entry on --approve, check passes, and a second run skips them all", () => {
    const root = sandbox();
    const first = spawnSync(process.execPath, [IMPORT, "docs/brainstorms/rec.md", "--root", root, "--approve", "owner"], { encoding: "utf8" });
    expect(first.status).toBe(0);
    const entries = readLedger(root);
    expect(entries).toHaveLength(14);
    expect(entries.every((e) => e.approved_by === "owner")).toBe(true);
    expect(entries.map((e) => e.kind)).toContain("Changed");
    expect(checkLedger(root).ok).toBe(true);
    const again = spawnSync(process.execPath, [IMPORT, "docs/brainstorms/rec.md", "--root", root, "--approve", "owner"], { encoding: "utf8" });
    expect(again.status).toBe(1);
    expect(readLedger(root)).toHaveLength(14);
  });

  it("refuses --approve with no name", () => {
    const root = sandbox();
    writeFileSync(join(root, "docs", "brainstorms", "x.md"), "## Decisions\n| 1 | a | b | Agreed | no | 2026-10-22 |\n");
    const r = spawnSync(process.execPath, [IMPORT, "docs/brainstorms/x.md", "--root", root, "--approve"], { encoding: "utf8" });
    expect(r.status).toBe(2);
    expect(existsSync(join(root, "decisions", "ledger.yaml"))).toBe(false);
  });
});
