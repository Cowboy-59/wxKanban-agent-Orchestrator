import type { EngineId, SupportLevel } from "./engine.js";
import type {
  DimensionId,
  Finding,
  RejectedFinding,
  Severity,
  Urgency,
} from "./finding.js";
import { codeFence } from "./markdown.js";

// [SCOPE 121 / T013] BEGIN — Report types
export interface DimensionStatus {
  id: DimensionId;
  support: SupportLevel;
  note?: string;
}

/**
 * ADDITION (SCOPE-121 final wave, C3 — CRITICAL): a schema source (e.g. the
 * `mcp-server/src/db/schema.ts` declaration) that could not be resolved.
 * Deliberately shaped generically here — `label`/`path`/`reason` as plain
 * strings — rather than importing `UnresolvedSchemaSource` from
 * `engines/postgres/declared.js`: `core/report.ts` stays engine-agnostic
 * (it already only depends on the generic `EngineId`, never on a
 * PostgreSQL-specific type), and the CLI's real, narrower type is
 * structurally assignable to this one with no cast needed.
 */
export interface UnresolvedSourceSummary {
  label: string;
  path: string;
  reason: string;
}

/**
 * ADDITION (SCOPE-121 final wave, C3 — CRITICAL): a convention-based
 * relationship resolution that was attempted and declined. Same generic-
 * shape rationale as `UnresolvedSourceSummary` above.
 */
export interface SkippedRelationshipSummary {
  child: string;
  childColumn: string;
  parent: string;
  reason: string;
}

export interface AnalysisReport {
  runAt: string;
  engine: EngineId;
  database: string;
  dimensions: DimensionStatus[];
  findings: Finding[];
  rejected: RejectedFinding[];
  /**
   * FIX (SCOPE-121 final wave, C3 — CRITICAL): these used to go to
   * `console.error` only, in `cli.ts`, and never reached `renderMarkdown` or
   * `renderTerminal`. stderr is ephemeral; `latest.md` is what a reader
   * actually opens. A schema source that failed to resolve, or a
   * convention-based relationship that was attempted and declined, is now
   * part of the report itself — see `gapSuffix` and the new sections in both
   * renderers below.
   */
  unresolvedSources: UnresolvedSourceSummary[];
  skippedRelationships: SkippedRelationshipSummary[];
}

export interface ReportPaths {
  reportPath: string;
  latestPath: string;
  snapshotPath: string;
  /**
   * ADDITION (SCOPE-121 final fix wave, LATEST-FILE — Important): true when
   * `latest.md` was actually (re)written on this call. A `--dimension`
   * filtered run must not overwrite `latest.md` with a partial slice — see
   * `writeReport` below.
   */
  latestUpdated: boolean;
}
// [SCOPE 121 / T013] END

// [SCOPE 121 / T013] BEGIN — Ranking
const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0, high: 1, medium: 2, low: 3, info: 4,
};
const URGENCY_ORDER: Record<Urgency, number> = {
  immediate: 0, scheduled: 1, deferred: 2, none: 3,
};

/**
 * Severity first, then urgency. They are ranked separately because they answer
 * different questions — how bad is it, and when must it be dealt with — and a
 * single blended score would lose the scheduling information.
 */
export function rankFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency] ||
      a.id.localeCompare(b.id),
  );
}

function severityCounts(findings: Finding[]): string {
  const counts = new Map<Severity, number>();
  for (const f of findings) counts.set(f.severity, (counts.get(f.severity) ?? 0) + 1);
  return (["critical", "high", "medium", "low", "info"] as Severity[])
    .filter((s) => counts.has(s))
    .map((s) => `${counts.get(s)} ${s}`)
    .join(", ");
}

/**
 * The clause appended to the leading summary line — e.g.
 * " — 2 withheld (analyser defect), 7 dimensions not fully run" — or the
 * empty string when nothing is withheld and every dimension ran in full.
 *
 * This has to live in the summary line, not only in the detail sections
 * further down, because a withheld finding means the analyser itself
 * malfunctioned: that is not information a scrolling operator is allowed
 * to miss just because the report is long. A clean run must still read
 * clean, so the clause is omitted entirely rather than printing "0
 * withheld" — an absent clause reads as nothing to report; a present one
 * always reads as something to look at.
 */
function gapSuffix(report: AnalysisReport): string {
  const notFullyRun = report.dimensions.filter((d) => d.support !== "full").length;
  const parts: string[] = [];
  if (report.rejected.length > 0) {
    parts.push(`${report.rejected.length} withheld (analyser defect)`);
  }
  if (notFullyRun > 0) {
    parts.push(`${notFullyRun} dimensions not fully run`);
  }
  // FIX (SCOPE-121 final wave, C3 — CRITICAL): fold both new gap classes
  // into the same leading-summary clause, for the same reason the two above
  // already live here rather than only in a detail section further down —
  // a reader who only sees the top line must still learn that part of the
  // declared schema could not be loaded, or that a plausible relationship
  // was never resolved.
  if (report.unresolvedSources.length > 0) {
    const n = report.unresolvedSources.length;
    parts.push(`${n} unresolved schema source${n === 1 ? "" : "s"}`);
  }
  if (report.skippedRelationships.length > 0) {
    const n = report.skippedRelationships.length;
    parts.push(`${n} skipped relationship${n === 1 ? "" : "s"}`);
  }
  return parts.length > 0 ? ` — ${parts.join(", ")}` : "";
}

/** Escape `|` so a finding-derived note cannot misalign a markdown table row. */
function escapeTableCell(text: string): string {
  return text.replace(/\|/g, "\\|");
}
// [SCOPE 121 / T013] END

// [SCOPE 121 / T013] BEGIN — Renderers
export function renderTerminal(report: AnalysisReport): string {
  const lines: string[] = [
    `wxDBAnalyze — ${report.database} (${report.engine}) — ${report.runAt}`,
    "",
  ];

  const ranked = rankFindings(report.findings);
  lines.push(
    (ranked.length === 0
      ? "No findings. Every dimension that ran found nothing to report."
      : `${ranked.length} findings: ${severityCounts(ranked)}`) + gapSuffix(report),
    "",
  );

  let currentDimension = "";
  for (const finding of ranked) {
    if (finding.dimension !== currentDimension) {
      currentDimension = finding.dimension;
      lines.push(`── ${currentDimension} ──`);
    }
    lines.push(
      `  [${finding.severity}/${finding.urgency}] ${finding.subject} — ${finding.observation}`,
      `      why: ${finding.whyItNeedsChanging}`,
      `      impact: ${finding.businessImpact}`,
      `      fix: ${finding.remediation.fixClass}`,
      "",
    );
  }

  const notRun = report.dimensions.filter((d) => d.support !== "full");
  if (notRun.length > 0) {
    lines.push("Dimensions that did not run in full:");
    for (const d of notRun) {
      lines.push(`  - ${d.id}: ${d.support}${d.note ? ` — ${d.note}` : ""}`);
    }
    lines.push("");
  }

  if (report.rejected.length > 0) {
    lines.push(
      `${report.rejected.length} finding was withheld for failing the finding ` +
        "contract — this is a defect in the analyser, not a clean result:",
    );
    for (const r of report.rejected) {
      lines.push(`  - ${r.id}: missing ${r.missingFields.join(", ")}`);
    }
    lines.push("");
  }

  // ADDITION (SCOPE-121 final wave, C3 — CRITICAL): previously reported only
  // via console.error, never in the report a reader actually opens.
  if (report.unresolvedSources.length > 0) {
    lines.push("Schema sources that could not be loaded — findings below are incomplete:");
    for (const s of report.unresolvedSources) {
      lines.push(`  - ${s.label} (${s.path}): ${s.reason}`);
    }
    lines.push("");
  }

  if (report.skippedRelationships.length > 0) {
    lines.push("Convention-based relationships attempted and declined:");
    for (const s of report.skippedRelationships) {
      lines.push(`  - ${s.child}.${s.childColumn} -> ${s.parent}: ${s.reason}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * ADDITION (SCOPE-121 final fix wave, I5d — Important): a large report is
 * mostly restated mechanism — a by-rule count table lets a reader see the
 * shape of the report (how many of what) without scrolling it, and makes two
 * runs of the same report diffable at a glance.
 */
function ruleCounts(findings: Finding[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const f of findings) {
    const key = `${f.dimension}.${f.rule}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function renderMarkdown(report: AnalysisReport): string {
  const ranked = rankFindings(report.findings);
  const out: string[] = [
    `# Database Analysis — ${report.database}`,
    "",
    `**Engine**: ${report.engine}  `,
    `**Run at**: ${report.runAt}  `,
    `**Findings**: ${ranked.length === 0 ? "none" : severityCounts(ranked)}${gapSuffix(report)}`,
    "",
  ];

  if (ranked.length > 0) {
    out.push(
      "## Findings by rule",
      "",
      "| Rule | Count |",
      "| --- | --- |",
      ...ruleCounts(ranked).map(([rule, count]) => `| ${rule} | ${count} |`),
      "",
    );
  }

  out.push(
    "## Dimension coverage",
    "",
    "| Dimension | Support | Note |",
    "| --- | --- | --- |",
    ...report.dimensions.map(
      (d) => `| ${d.id} | ${d.support} | ${escapeTableCell(d.note ?? "")} |`,
    ),
    "",
    "## Findings",
    "",
  );

  if (ranked.length === 0) out.push("No findings.", "");

  for (const f of ranked) {
    out.push(
      // ADDITION (SCOPE-121 final fix wave, I5d — Important): the finding's
      // own `id` now rides in its heading so the report is navigable
      // (searchable by id) and diffable across two runs.
      `### ${f.severity.toUpperCase()} — ${f.subject} — \`${f.id}\``,
      "",
      `**Rule**: \`${f.dimension}.${f.rule}\`  `,
      `**Severity**: ${f.severity}  `,
      `**Urgency**: ${f.urgency}  `,
      `**Confidence**: ${f.confidence}`,
      "",
      f.observation,
      "",
      `**Why it needs changing**: ${f.whyItNeedsChanging}`,
      "",
      `**Business impact**: ${f.businessImpact}`,
      "",
      `**Doing nothing**: ${f.doingNothing}`,
      "",
      `**Remediation** (${f.remediation.fixClass}, lock: ${f.remediation.lockClass}, ` +
        `duration: ${f.remediation.estimatedDuration})`,
      "",
    );
    if (f.remediation.statements.length > 0) {
      const remediationBody = f.remediation.statements.join("\n");
      const remediationFence = codeFence(remediationBody);
      out.push(`${remediationFence}sql`, ...f.remediation.statements, remediationFence, "");
    } else {
      out.push("_No statement is generated; this requires manual handling._", "");
    }
    const evidenceQuery = f.evidence.query.trim();
    const evidenceFence = codeFence(evidenceQuery);
    out.push(
      `**Fix risk**: ${f.fixRisk}`,
      "",
      `**Rollback**: ${f.remediation.rollback}`,
      "",
      "**Evidence**",
      "",
      `${evidenceFence}sql`,
      evidenceQuery,
      evidenceFence,
      "",
      "---",
      "",
    );
  }

  if (report.rejected.length > 0) {
    out.push(
      "## Withheld findings",
      "",
      "These failed the finding contract and were not emitted. They are listed " +
        "because a silently dropped finding would make this report read as more " +
        "complete than it is.",
      "",
      ...report.rejected.map((r) => `- \`${r.id}\` — missing ${r.missingFields.join(", ")}`),
      "",
    );
  }

  // ADDITION (SCOPE-121 final wave, C3 — CRITICAL): unresolved schema
  // sources and skipped relationships used to reach only `console.error`,
  // never this file. stderr is ephemeral; `latest.md` is what a reader
  // actually opens, and both of these are exactly the kind of gap this
  // report's whole design (finding contract, rejected findings, dimension
  // coverage) exists to make impossible to miss.
  if (report.unresolvedSources.length > 0) {
    out.push(
      "## Schema sources that could not be loaded",
      "",
      "Every finding above was produced from whatever schema sources DID resolve. " +
        "Declarations from the sources below were not available, so any table or " +
        "column only declared there reads as undeclared rather than as a real gap.",
      "",
      ...report.unresolvedSources.map(
        (s) => `- **${escapeTableCell(s.label)}** (\`${s.path}\`) — ${s.reason}`,
      ),
      "",
    );
  }

  if (report.skippedRelationships.length > 0) {
    out.push(
      "## Convention-based relationships attempted and declined",
      "",
      "Naming convention resolved a plausible parent table for each of these " +
        "columns, but the resolution was declined rather than silently accepted " +
        "— see each reason. These are not reported as findings because nothing " +
        "was actually asserted; they are listed so a reader can judge whether the " +
        "decline was correct.",
      "",
      ...report.skippedRelationships.map(
        (s) => `- \`${s.child}.${s.childColumn}\` -> \`${s.parent}\` — ${s.reason}`,
      ),
      "",
    );
  }

  return out.join("\n");
}
// [SCOPE 121 / T013] END

// [SCOPE 121 / T013] BEGIN — Report persistence
/**
 * Derive a filesystem-safe stamp from an ISO timestamp.
 *
 * Windows forbids `: " < > | ? * \ /` in filenames, and an ISO string
 * (`2026-08-01T10:00:00.000Z`) contains colons and a period. Those are
 * replaced first for clarity, then a catch-all strips anything else that
 * isn't alphanumeric or a hyphen, so a malformed or non-standard `runAt`
 * can never produce an illegal path. The full timestamp — including
 * seconds and milliseconds — is kept; truncating to minute precision
 * would let two runs in the same clock minute silently overwrite each
 * other's report and snapshot, which is exactly the kind of silent loss
 * this renderer exists to prevent.
 */
function toFilenameStamp(runAt: string): string {
  return runAt.replace(/[:.]/g, "-").replace(/[^0-9A-Za-z-]/g, "-");
}

/**
 * Write the markdown report, conditionally refresh `latest.md`, and retain
 * the raw snapshot.
 *
 * ADDITION (SCOPE-121 final fix wave, LATEST-FILE — Important): `complete`
 * is a new required parameter — true only when the caller's selected
 * dimension set equals the full implemented set. A `--dimension` filtered
 * run (e.g. `--dimension maintenance`) previously overwrote `latest.md`
 * unconditionally, so a 2-finding filtered slice could silently replace a
 * 613-finding complete run as "the" current report. When `complete` is
 * false, `latest.md` is left untouched — the timestamped report and
 * snapshot are still written in full, so nothing about THIS run's own
 * output is lost, only the special "latest" alias is not moved onto it.
 * `ReportPaths.latestUpdated` tells the caller which happened, so it can
 * print an explicit message rather than let the omission pass silently.
 */
export async function writeReport(
  directory: string,
  report: AnalysisReport,
  snapshot: unknown,
  complete: boolean,
): Promise<ReportPaths> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");

  await mkdir(directory, { recursive: true });
  const stamp = toFilenameStamp(report.runAt);
  const reportPath = join(directory, `${stamp}.md`);
  const latestPath = join(directory, "latest.md");
  const snapshotPath = join(directory, `${stamp}.snapshot.json`);
  const markdown = renderMarkdown(report);

  await writeFile(reportPath, markdown, "utf8");
  if (complete) {
    await writeFile(latestPath, markdown, "utf8");
  }
  await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), "utf8");

  return { reportPath, latestPath, snapshotPath, latestUpdated: complete };
}
// [SCOPE 121 / T013] END
