// SCOPE-140 / T012 — the Cockpit's morning summary card, and the Help entry for --nightly.
//
// Written directly: the fencer rejects test files with no top-level declaration.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { loadNightlyCard, nightlyCard } from "../../vscode-extension/src/services/nightlySummary";
import { buildSummary } from "../../_wxAI/skills/wxPreTest/scripts/nightly/summary.mjs";

describe("SCOPE-140 T012 — the Cockpit morning summary card", () => {
  it("shows pass/fail, each failure with its task, the permission check, Observations, cleanup, evidence and what was not tested", () => {
    const s = buildSummary({
      runId: "n1", environment: "uat", agent: "agent", entryPath: { kind: "portal" }, finishedAt: "2026-10-18T05:10:00Z",
      results: [{ itemKey: "A", status: "pass" }, { itemKey: "B", status: "fail", title: "Save", taskId: "t-9" }],
      permission: { ok: true, results: [{}, {}], leaks: [] }, observations: { fresh: [{ screen: "/x", issue: "click-depth", detail: "4" }], open: [{}] },
      cleanup: { choice: "remove", removed: true, leftovers: 0, detail: "gone" }, gate: { green: false, reasons: ["1 test(s) failed"] },
      estimate: { totalMs: 600_000 }, actualMs: 540_000,
    });
    const card = nightlyCard(s);
    expect(card.title).toBe("Nightly run — 1 passed, 1 failed");
    expect(card.tone).toBe("error");
    const rows = Object.fromEntries(card.rows.map((r) => [r.label, r.detail]));
    expect(rows["Failed: B"]).toBe("Save · task t-9");
    expect(rows["Permission check"]).toBe("passed (2 admin pages refused)");
    expect(rows.Observations).toBe("1 new, 1 open (not pass/fail)");
    expect(rows.Evidence).toBe("none: 1 test(s) failed");
    expect(card.rows.filter((r) => r.label === "Not tested").map((r) => r.detail)).toContain("Entra ID sign-in is not tested nightly; it stays a human UAT check.");
  });

  it("a refused run shows as refused; no summary means no card", () => {
    expect(nightlyCard({ refused: "Nightly run REFUSED before touching anything:\n  - the app address https://app is on the Production list\nThere is no override." })).toMatchObject({ title: "Nightly run — refused", tone: "error" });
    const dir = mkdtempSync(join(tmpdir(), "nightly-card-"));
    expect(loadNightlyCard(dir)).toBeNull();
    mkdirSync(join(dir, ".wxai/nightly"), { recursive: true });
    writeFileSync(join(dir, ".wxai/nightly/last-summary.json"), JSON.stringify({ results: { total: 2, passed: 2, failed: 0, flaky: 0, notRun: 0 }, green: true, artifacts: [{ framework: "SOC2" }], summaryPath: "x.md" }));
    expect(loadNightlyCard(dir)).toMatchObject({ title: "Nightly run — 2 passed", tone: "ok", summaryPath: "x.md" });
    rmSync(dir, { recursive: true, force: true });
  });

  it("the preTest Help entry names --nightly, --install and --uninstall as flags", () => {
    const md = readFileSync(".claude/commands/preTest.md", "utf8");
    for (const f of ["--nightly", "--install", "--uninstall"]) expect(md).toMatch(new RegExp(`^\\| \`${f}\` \\|`, "m"));
  });
});
