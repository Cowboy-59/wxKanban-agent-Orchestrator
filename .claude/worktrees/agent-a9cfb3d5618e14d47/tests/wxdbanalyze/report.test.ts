import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  rankFindings,
  renderMarkdown,
  renderTerminal,
  writeReport,
} from "../../_wxAI/skills/wxDBAnalyze/scripts/core/report.js";
import type { Finding } from "../../_wxAI/skills/wxDBAnalyze/scripts/core/finding.js";

const f = (over: Partial<Finding>): Finding => ({
  id: "x", dimension: "schema", rule: "r", subject: "s",
  observation: "obs", evidence: { query: "select 1", rows: [] },
  whyItNeedsChanging: "why", businessImpact: "impact",
  severity: "medium", urgency: "scheduled",
  remediation: { statements: [], fixClass: "none", lockClass: "n/a", estimatedDuration: "n/a", rollback: "n/a" },
  fixRisk: "risk", doingNothing: "nothing", confidence: "proven",
  ...over,
});

const report = (over = {}) => ({
  runAt: "2026-08-01T10:00:00.000Z",
  engine: "postgres" as const,
  database: "wxkanban",
  dimensions: [
    { id: "schema" as const, support: "full" as const },
    { id: "performance" as const, support: "not-implemented" as const, note: "lands in Phase 2" },
  ],
  findings: [f({ id: "a", severity: "critical", urgency: "immediate" })],
  rejected: [],
  unresolvedSources: [],
  skippedRelationships: [],
  ...over,
});

describe("rankFindings", () => {
  it("orders by severity, then urgency", () => {
    const ranked = rankFindings([
      f({ id: "low", severity: "low", urgency: "deferred" }),
      f({ id: "crit", severity: "critical", urgency: "immediate" }),
      f({ id: "high-def", severity: "high", urgency: "deferred" }),
      f({ id: "high-now", severity: "high", urgency: "immediate" }),
    ]);
    expect(ranked.map((x) => x.id)).toEqual(["crit", "high-now", "high-def", "low"]);
  });
});

describe("renderTerminal", () => {
  it("leads with the severity counts", () => {
    expect(renderTerminal(report())).toMatch(/1 critical/);
  });

  it("prints the why for each finding, not only the observation", () => {
    const text = renderTerminal(report());
    expect(text).toContain("why");
    expect(text).toContain("impact");
  });

  it("lists dimensions that did not run, so the gap is visible", () => {
    const text = renderTerminal(report());
    expect(text).toMatch(/performance.*not-implemented/i);
    expect(text).toContain("lands in Phase 2");
  });

  it("reports rejected findings rather than hiding them", () => {
    const text = renderTerminal(
      report({ rejected: [{ id: "bad", missingFields: ["whyItNeedsChanging"] }] }),
    );
    expect(text).toMatch(/1 finding was withheld/i);
    expect(text).toContain("whyItNeedsChanging");
  });

  it("says so plainly when nothing was found", () => {
    expect(renderTerminal(report({ findings: [] }))).toMatch(/no findings/i);
  });
});

describe("renderMarkdown", () => {
  it("includes every contract field for each finding", () => {
    const md = renderMarkdown(report());
    for (const label of [
      "Why it needs changing", "Business impact", "Severity", "Urgency",
      "Remediation", "Fix risk", "Doing nothing", "Confidence", "Evidence",
    ]) {
      expect(md).toContain(label);
    }
  });

  it("renders remediation SQL in a sql code fence", () => {
    const md = renderMarkdown(
      report({
        findings: [f({ remediation: { statements: ["alter table x add column y text;"], fixClass: "additive-safe", lockClass: "brief", estimatedDuration: "ms", rollback: "drop" } })],
      }),
    );
    expect(md).toContain("```sql");
    expect(md).toContain("alter table x add column y text;");
  });

  // [SCOPE 121 / T013] BEGIN — content-derived fence safety (fix round 1, Finding 1)
  it("keeps a remediation statement containing a triple-backtick inside its own fence", () => {
    const md = renderMarkdown(
      report({
        findings: [f({
          remediation: {
            statements: ["alter table x add column y text default '```evil```';"],
            fixClass: "additive-safe", lockClass: "brief", estimatedDuration: "ms", rollback: "drop",
          },
        })],
      }),
    );
    const fenceMatch = md.match(/\n(`{3,})sql\n([\s\S]*?)\n\1\n/);
    expect(fenceMatch).not.toBeNull();
    const [, fence, body] = fenceMatch as unknown as [string, string, string];
    expect(fence.length).toBeGreaterThan(3);
    expect(body).toContain("```evil```");
  });

  it("scales the remediation fence past four backticks for a longer embedded run", () => {
    const md = renderMarkdown(
      report({
        findings: [f({
          remediation: {
            statements: ["alter table x add column y text default '`````deep`````';"],
            fixClass: "additive-safe", lockClass: "brief", estimatedDuration: "ms", rollback: "drop",
          },
        })],
      }),
    );
    expect(md).toContain("``````sql");
    expect(md).toContain("`````deep`````");
  });

  it("keeps an evidence query containing a fence inside its own block", () => {
    const md = renderMarkdown(
      report({
        findings: [f({ evidence: { query: "select '```gotcha```' as x", rows: [] } })],
      }),
    );
    const fenceMatch = md.match(/\*\*Evidence\*\*\n\n(`{3,})sql\n([\s\S]*?)\n\1\n/);
    expect(fenceMatch).not.toBeNull();
    const [, fence, body] = fenceMatch as unknown as [string, string, string];
    expect(fence.length).toBeGreaterThan(3);
    expect(body).toContain("```gotcha```");
  });

  it("regression: an embedded triple-backtick can no longer close the fence early and turn following text into a real heading", () => {
    const md = renderMarkdown(
      report({
        findings: [f({
          remediation: {
            statements: ["select '```'; -- comment\n# Fake Heading\nmore text after the forged heading"],
            fixClass: "additive-safe", lockClass: "brief", estimatedDuration: "ms", rollback: "drop",
          },
        })],
      }),
    );
    // The whole statement — including the embedded ``` and the forged heading
    // line that follows it — must sit inside ONE correctly-sized fence. If the
    // fence were still fixed at three backticks, the embedded ``` would close
    // it early and "# Fake Heading" / the trailing text would fall outside the
    // fence-match regex entirely (i.e. render as ordinary markdown).
    const fenceMatch = md.match(/\n(`{3,})sql\n([\s\S]*?)\n\1\n/);
    expect(fenceMatch).not.toBeNull();
    const [, fence, body] = fenceMatch as unknown as [string, string, string];
    expect(fence.length).toBeGreaterThan(3);
    expect(body).toContain("# Fake Heading");
    expect(body).toContain("more text after the forged heading");
  });

  it("escapes a pipe in a dimension note so it cannot misalign the coverage table", () => {
    const md = renderMarkdown(
      report({
        dimensions: [
          { id: "schema" as const, support: "full" as const },
          { id: "performance" as const, support: "not-implemented" as const, note: "blocked by rule-a | rule-b" },
        ],
      }),
    );
    expect(md).toContain("blocked by rule-a \\| rule-b");
    expect(md).not.toContain("blocked by rule-a | rule-b |");
  });
  // [SCOPE 121 / T013] END
});

// [SCOPE 121 / T013] BEGIN — summary-line gap suffix (fix round 1, Finding 2)
describe("summary line — withheld and not-fully-run counts", () => {
  const bothFullDimensions = [
    { id: "schema" as const, support: "full" as const },
    { id: "integrity" as const, support: "full" as const },
  ];

  it("omits the gap clause entirely on a clean run — nothing withheld, every dimension ran in full", () => {
    const rpt = report({ dimensions: bothFullDimensions, rejected: [] });
    expect(renderTerminal(rpt)).not.toMatch(/withheld|not fully run/i);
    expect(renderMarkdown(rpt)).not.toMatch(/withheld \(analyser defect\)|not fully run/i);
  });

  it("shows only the withheld count when every dimension ran in full", () => {
    const rpt = report({
      dimensions: bothFullDimensions,
      rejected: [{ id: "bad", missingFields: ["whyItNeedsChanging"] }],
    });
    expect(renderTerminal(rpt)).toContain("1 withheld (analyser defect)");
    expect(renderTerminal(rpt)).not.toMatch(/dimensions not fully run/);
    expect(renderMarkdown(rpt)).toContain("1 withheld (analyser defect)");
  });

  it("shows only the not-fully-run count when nothing is withheld", () => {
    const rpt = report({
      dimensions: [
        { id: "schema" as const, support: "full" as const },
        { id: "performance" as const, support: "not-implemented" as const },
        { id: "security" as const, support: "partial" as const },
      ],
      rejected: [],
    });
    expect(renderTerminal(rpt)).toContain("2 dimensions not fully run");
    expect(renderTerminal(rpt)).not.toMatch(/withheld/);
    expect(renderMarkdown(rpt)).toContain("2 dimensions not fully run");
  });

  it("shows both counts together in the leading summary line, at realistic scale", () => {
    const notFull = ["data", "conventions", "performance", "maintenance", "security", "availability", "impact"] as const;
    const rpt = report({
      dimensions: [
        { id: "schema" as const, support: "full" as const },
        { id: "integrity" as const, support: "full" as const },
        ...notFull.map((id) => ({ id, support: "not-implemented" as const })),
      ],
      findings: [
        ...Array.from({ length: 3 }, (_, i) => f({ id: `crit-${i}`, severity: "critical", urgency: "immediate" })),
        ...Array.from({ length: 6 }, (_, i) => f({ id: `high-${i}`, severity: "high", urgency: "scheduled" })),
        ...Array.from({ length: 20 }, (_, i) => f({ id: `med-${i}`, severity: "medium", urgency: "deferred" })),
        ...Array.from({ length: 40 }, (_, i) => f({ id: `info-${i}`, severity: "info", urgency: "none" })),
      ],
      rejected: [
        { id: "bad-1", missingFields: ["whyItNeedsChanging"] },
        { id: "bad-2", missingFields: ["businessImpact"] },
      ],
    });

    const expectedSuffix =
      "69 findings: 3 critical, 6 high, 20 medium, 40 info — 2 withheld (analyser defect), 7 dimensions not fully run";
    expect(renderTerminal(rpt)).toContain(expectedSuffix);
    expect(renderMarkdown(rpt)).toContain(
      "**Findings**: 3 critical, 6 high, 20 medium, 40 info — 2 withheld (analyser defect), 7 dimensions not fully run",
    );
  });
});
// [SCOPE 121 / T013] END

// SCOPE-121 final wave, C3 [CRITICAL]: unresolved schema sources and skipped
// relationships used to reach only console.error, never the report itself.
describe("unresolved schema sources and skipped relationships", () => {
  const unresolvedSources = [
    { label: "mcp", path: "mcp-server/src/db/schema.ts", reason: "path does not exist" },
  ];
  const skippedRelationships = [
    { child: "widgets", childColumn: "ownerid", parent: "owners", reason: 'resolved parent table "owners" has no primary key' },
  ];

  it("renderTerminal lists an unresolved schema source so it is not only on stderr", () => {
    const text = renderTerminal(report({ unresolvedSources }));
    expect(text).toContain("mcp-server/src/db/schema.ts");
    expect(text).toMatch(/path does not exist/);
  });

  it("renderTerminal lists a skipped relationship", () => {
    const text = renderTerminal(report({ skippedRelationships }));
    expect(text).toContain("widgets.ownerid");
    expect(text).toMatch(/no primary key/);
  });

  it("renderMarkdown renders a section for unresolved schema sources", () => {
    const md = renderMarkdown(report({ unresolvedSources }));
    expect(md).toContain("## Schema sources that could not be loaded");
    expect(md).toContain("mcp-server/src/db/schema.ts");
    expect(md).toContain("path does not exist");
  });

  it("renderMarkdown renders a section for skipped relationships", () => {
    const md = renderMarkdown(report({ skippedRelationships }));
    expect(md).toContain("## Convention-based relationships attempted and declined");
    expect(md).toContain("widgets.ownerid");
    expect(md).toContain("owners");
  });

  it("folds unresolved-source and skipped-relationship counts into the leading summary line", () => {
    const rpt = report({ unresolvedSources, skippedRelationships });
    expect(renderTerminal(rpt)).toMatch(/1 unresolved schema source, 1 skipped relationship/);
    expect(renderMarkdown(rpt)).toMatch(/1 unresolved schema source, 1 skipped relationship/);
  });

  it("omits both clauses entirely when nothing is unresolved or skipped", () => {
    const rpt = report({ unresolvedSources: [], skippedRelationships: [] });
    expect(renderTerminal(rpt)).not.toMatch(/unresolved schema source|skipped relationship/);
    expect(renderMarkdown(rpt)).not.toMatch(/unresolved schema source|skipped relationship/);
  });

  it("omits the markdown sections entirely when there is nothing to report", () => {
    const md = renderMarkdown(report({ unresolvedSources: [], skippedRelationships: [] }));
    expect(md).not.toContain("## Schema sources that could not be loaded");
    expect(md).not.toContain("## Convention-based relationships attempted and declined");
  });
});

// [SCOPE 121 / T013] BEGIN — writeReport tests
describe("writeReport", () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("writes a timestamped report, refreshes latest.md, and persists the snapshot — using an isolated tmpdir, never the repo tree", async () => {
    dir = await mkdtemp(join(tmpdir(), "wxdbanalyze-report-"));
    const rpt = report();
    const snapshot = { hello: "world" };

    const paths = await writeReport(dir, rpt, snapshot, true);

    expect(paths.reportPath.startsWith(dir)).toBe(true);
    expect(paths.latestPath).toBe(join(dir, "latest.md"));
    expect(paths.snapshotPath.startsWith(dir)).toBe(true);
    expect(paths.latestUpdated).toBe(true);

    const reportContents = await readFile(paths.reportPath, "utf8");
    const latestContents = await readFile(paths.latestPath, "utf8");
    const snapshotContents = await readFile(paths.snapshotPath, "utf8");

    expect(reportContents).toBe(renderMarkdown(rpt));
    expect(latestContents).toBe(reportContents);
    expect(JSON.parse(snapshotContents)).toEqual(snapshot);
  });

  it("derives a Windows-legal filename from an ISO runAt timestamp (no colons or periods survive)", async () => {
    dir = await mkdtemp(join(tmpdir(), "wxdbanalyze-report-"));
    const rpt = report({ runAt: "2026-08-01T10:00:00.000Z" });

    const paths = await writeReport(dir, rpt, {}, true);

    const illegalWindowsChars = /[:"<>|?*\\/]/;
    const reportFilename = paths.reportPath.slice(dir.length);
    const snapshotFilename = paths.snapshotPath.slice(dir.length);

    // Strip the leading path separator before checking for illegal characters —
    // the separator itself is expected, everything after it must be clean.
    expect(illegalWindowsChars.test(reportFilename.slice(1))).toBe(false);
    expect(illegalWindowsChars.test(snapshotFilename.slice(1))).toBe(false);
    expect(reportFilename).toContain("2026-08-01");
  });

  it("creates the target directory when it does not already exist", async () => {
    const base = await mkdtemp(join(tmpdir(), "wxdbanalyze-report-"));
    dir = join(base, "nested", "does", "not", "exist");

    const paths = await writeReport(dir, report(), {}, true);

    const contents = await readFile(paths.latestPath, "utf8");
    expect(contents.length).toBeGreaterThan(0);

    // clean up the mkdtemp base too, since `dir` is nested beneath it
    await rm(base, { recursive: true, force: true });
    dir = base;
  });

  // ADDITION (SCOPE-121 final fix wave, LATEST-FILE — Important): a
  // `--dimension`-filtered run must never overwrite `latest.md` with a
  // partial slice — a real incident left `latest.md` holding 2 findings
  // while the true complete run was 613 findings.
  it("does NOT write latest.md when the run is incomplete (a filtered dimension selection), but still writes the full timestamped report", async () => {
    dir = await mkdtemp(join(tmpdir(), "wxdbanalyze-report-"));
    const rpt = report();

    const paths = await writeReport(dir, rpt, {}, false);

    expect(paths.latestUpdated).toBe(false);
    const reportContents = await readFile(paths.reportPath, "utf8");
    expect(reportContents).toBe(renderMarkdown(rpt));
    await expect(readFile(paths.latestPath, "utf8")).rejects.toThrow();
  });

  it("does not clobber a pre-existing latest.md when the run is incomplete", async () => {
    dir = await mkdtemp(join(tmpdir(), "wxdbanalyze-report-"));
    const complete = await writeReport(dir, report(), {}, true);
    const originalLatest = await readFile(complete.latestPath, "utf8");

    const partialReport = report({ findings: [] });
    const partial = await writeReport(dir, partialReport, {}, false);
    expect(partial.latestUpdated).toBe(false);

    const latestAfterPartialRun = await readFile(complete.latestPath, "utf8");
    expect(latestAfterPartialRun).toBe(originalLatest);
  });
});
// [SCOPE 121 / T013] END

// ADDITION (SCOPE-121 final fix wave, I5d — Important): the report is mostly
// restated mechanism at scale — a by-rule count table and a navigable,
// diffable heading (carrying the finding's own id) make it possible to see
// the report's shape without reading every finding, and to diff two runs.
describe("renderMarkdown — by-rule count table and id-bearing headings", () => {
  it("includes a by-rule count table under the header", () => {
    const md = renderMarkdown(
      report({
        findings: [
          f({ id: "a", dimension: "schema", rule: "ra" }),
          f({ id: "b", dimension: "schema", rule: "ra" }),
          f({ id: "c", dimension: "schema", rule: "rb" }),
        ],
      }),
    );
    expect(md).toContain("## Findings by rule");
    expect(md).toMatch(/\|\s*schema\.ra\s*\|\s*2\s*\|/);
    expect(md).toMatch(/\|\s*schema\.rb\s*\|\s*1\s*\|/);
    // The by-rule table must appear before the per-finding "## Findings" section.
    expect(md.indexOf("## Findings by rule")).toBeLessThan(md.indexOf("## Findings\n"));
  });

  it("omits the by-rule table when there are no findings", () => {
    const md = renderMarkdown(report({ findings: [] }));
    expect(md).not.toContain("## Findings by rule");
  });

  it("renders each finding's own id in its heading", () => {
    const md = renderMarkdown(
      report({ findings: [f({ id: "unique-finding-id-123", rule: "some-rule" })] }),
    );
    expect(md).toContain("`unique-finding-id-123`");
  });
});
