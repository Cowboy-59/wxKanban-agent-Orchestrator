/**
 * SCOPE 118 / T004 — extend the fence legacy baseline with a dated, queryable record.
 *
 * The existing baseline is a map of file path to content hash. That is enough to
 * SUPPRESS a finding, but not enough to answer "what un-fenced code do we still
 * owe?" — which is the question that matters, because baselining is deliberate
 * debt rather than a fix.
 *
 * This adds the current `UNFENCED_DECL` errors to the baseline AND records what
 * was deferred, when, and why. The existing hash map is extended, never replaced.
 *
 * Usage:  npx tsx scripts/baseline-fences.ts [--dry-run]
 */

import { createHash } from "crypto";
import { readFileSync, writeFileSync, existsSync } from "fs";
import * as handlerModule from "../wxkanban-agent/core/orchestrator/command-handlers/auditfences";

type HandlerModule = typeof handlerModule;
const handler: HandlerModule =
  (handlerModule as { default?: HandlerModule }).default ?? handlerModule;

const BASELINE_PATH = ".wxai/auditfences-legacy.json";

interface DeferredEntry {
  file: string;
  line: number;
  message: string;
}

interface DeferredBlock {
  capturedAt: string;
  reason: string;
  scope: string;
  count: number;
  declarations: DeferredEntry[];
}

interface BaselineFile {
  capturedAt: string;
  files: Record<string, string>;
  deferred?: DeferredBlock[];
}

// [SCOPE 118 / T004] BEGIN — Dated fence baseline capture
async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");

  const result = await handler.handleAuditFencesCommand({
    path: ".",
    specsRoot: "specs",
    legacyFile: BASELINE_PATH,
    strict: true,
    format: "json",
  });

  const parsed = JSON.parse(result.output) as {
    findings: Array<{
      severity: string;
      code: string;
      file: string;
      line?: number;
      message: string;
    }>;
  };

  const unfenced = parsed.findings.filter(
    (f) => f.severity === "error" && f.code === "UNFENCED_DECL",
  );

  if (unfenced.length === 0) {
    console.log("Nothing to baseline — no UNFENCED_DECL errors remain.");
    return;
  }

  const declarations: DeferredEntry[] = unfenced
    .map((f) => ({ file: f.file, line: f.line ?? 0, message: f.message }))
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

  const affectedFiles = [...new Set(declarations.map((d) => d.file))].sort();

  if (!existsSync(BASELINE_PATH)) {
    console.error(`Baseline not found at ${BASELINE_PATH} — refusing to create one.`);
    process.exit(2);
  }

  const baseline = JSON.parse(
    readFileSync(BASELINE_PATH, "utf8"),
  ) as BaselineFile;

  const before = Object.keys(baseline.files ?? {}).length;
  let added = 0;
  for (const file of affectedFiles) {
    try {
      const hash = createHash("sha256")
        .update(readFileSync(file, "utf8"))
        .digest("hex");
      if (baseline.files[file] !== hash) added++;
      baseline.files[file] = hash;
    } catch {
      // File unreadable — leave it reported rather than silently suppressed.
    }
  }

  const capturedAt = new Date().toISOString().slice(0, 10);
  const block: DeferredBlock = {
    capturedAt,
    scope: "SCOPE-118",
    reason:
      "Pre-existing un-fenced declarations deferred as recorded debt so the fence gate can return to green. Baselining suppresses these from the gate; it does not fix them. Anything introduced after this date is reported as an error.",
    count: declarations.length,
    declarations,
  };

  baseline.deferred = [...(baseline.deferred ?? []), block];

  console.log(`UNFENCED_DECL deferred : ${declarations.length}`);
  console.log(`files affected         : ${affectedFiles.length}`);
  console.log(`baseline hash entries  : ${before} -> ${Object.keys(baseline.files).length} (+${added} updated/added)`);
  console.log(`deferred blocks        : ${baseline.deferred.length}`);

  if (dryRun) {
    console.log("\n(dry run — nothing written)");
    return;
  }

  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + "\n", "utf8");
  console.log(`\nWrote ${BASELINE_PATH}`);
}

void main();
// [SCOPE 118 / T004] END
