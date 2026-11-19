// [SCOPE 121 / T014] BEGIN — Environment loading
// DEVIATION (controller decision, SCOPE-121/T014): DATABASE_URL lives in the
// repo-root .env, not the shell environment (see scripts/check-schema-drift.ts,
// which does the same for npm run db:drift). Without this import, `npm run
// db:analyze` would report "no --url and no DATABASE_URL in the environment"
// even though .env has one, because tsx does not load .env on its own.
import "dotenv/config";
// [SCOPE 121 / T014] END
import { ENGINE_IDS, resolveEngine, type EngineId } from "./core/engine.js";
import type { DimensionId } from "./core/finding.js";
import { partitionFindings } from "./core/finding.js";
import {
  loadApplyPolicy,
  loadAnalysisPolicy,
  type ApplyPolicy,
  type AnalysisPolicy,
} from "./core/policy.js";
import { renderTerminal, writeReport, type AnalysisReport, type DimensionStatus, type ReportPaths } from "./core/report.js";
import { adapterFor } from "./engines/registry.js";
import { extractDeclaredSchema, loadSchemaModules } from "./engines/postgres/declared.js";
import { collectLiveSchema } from "./engines/postgres/schema.js";
import { estimateRowCounts, probeIntegrity } from "./engines/postgres/integrity.js";
import { analyzeSchema } from "./dimensions/schema.js";
import { analyzeIntegrity } from "./dimensions/integrity.js";
import { inferRelationships, type SkippedRelationship } from "./dimensions/relationships.js";
// [SCOPE 121 / T022] BEGIN — Batch A imports
import { collectCapabilities } from "./engines/postgres/capabilities.js";
import { collectTableStats } from "./engines/postgres/stats.js";
import { probeDataHealth } from "./engines/postgres/data.js";
import { analyzeData } from "./dimensions/data.js";
import { collectPerformance } from "./engines/postgres/performance.js";
import { analyzePerformance } from "./dimensions/performance.js";
import { collectMaintenance } from "./engines/postgres/maintenance.js";
import { analyzeMaintenance } from "./dimensions/maintenance.js";
// [SCOPE 121 / T022] END

// [SCOPE 121 / T014] BEGIN — CLI argument parsing
// MODIFIED-BY [SCOPE 121 / T022] — "data", "performance" and "maintenance"
// moved from PHASE_2 into IMPLEMENTED now that Tasks 15-21 shipped their
// collectors and analysers. The remaining four (conventions, security,
// availability, impact) are Batch B.
/** Dimensions implemented through Batch A. The other four arrive in Batch B. */
const IMPLEMENTED: DimensionId[] = ["schema", "integrity", "data", "performance", "maintenance"];

const PHASE_2: DimensionId[] = [
  "conventions", "security", "availability", "impact",
];

export interface CliOptions {
  dimensions: DimensionId[];
  engine?: EngineId;
  url?: string;
  apply: boolean;
  dryRun: boolean;
  deep: boolean;
  reportDir: string;
}

function readFlags(argv: string[]): Map<string, string | true> {
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    if (!token.startsWith("--")) continue;
    const eq = token.indexOf("=");
    if (eq > -1) {
      flags.set(token.slice(2, eq), token.slice(eq + 1));
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      flags.set(token.slice(2), next);
      i += 1;
    } else {
      flags.set(token.slice(2), true);
    }
  }
  return flags;
}

export function parseArgs(argv: string[]): CliOptions {
  const flags = readFlags(argv);

  const apply = flags.get("apply") === true;
  const dryRun = flags.get("dry-run") === true;
  if (apply && dryRun) {
    throw new Error("--apply and --dry-run cannot both be given; they contradict");
  }

  const raw = flags.get("dimension");
  let dimensions = IMPLEMENTED;
  if (typeof raw === "string") {
    dimensions = raw.split(",").map((d) => d.trim()) as DimensionId[];
    for (const d of dimensions) {
      if (IMPLEMENTED.includes(d)) continue;
      throw new Error(
        PHASE_2.includes(d)
          ? `dimension ${JSON.stringify(d)} is not implemented yet (Batch B)`
          : `unknown dimension ${JSON.stringify(d)} — available: ${IMPLEMENTED.join(", ")}`,
      );
    }
  }

  const engine = flags.get("engine");
  if (typeof engine === "string" && !(ENGINE_IDS as readonly string[]).includes(engine)) {
    throw new Error(`unknown engine ${JSON.stringify(engine)}`);
  }

  return {
    dimensions,
    engine: typeof engine === "string" ? (engine as EngineId) : undefined,
    url: typeof flags.get("url") === "string" ? (flags.get("url") as string) : undefined,
    apply,
    dryRun,
    deep: flags.get("deep") === true,
    reportDir: typeof flags.get("report-dir") === "string"
      ? (flags.get("report-dir") as string)
      : "docs/db-analysis",
  };
}
// [SCOPE 121 / T014] END

// [SCOPE 121 / T014] BEGIN — Run orchestration
/**
 * FIX (SCOPE-121 final wave, C2 — CRITICAL): this used to emit a row for
 * every SELECTED dimension plus every PHASE_2 dimension that was not
 * selected. An IMPLEMENTED dimension that was not selected (e.g. `integrity`
 * on a `--dimension schema` run) fell into NEITHER list, so it was simply
 * absent from the coverage table — `--dimension schema` produced a report
 * byte-identical, at the coverage-table level, to a complete run, with
 * `integrity` silently missing rather than reported as skipped. Every
 * dimension — implemented or not, selected or not — now gets exactly one
 * row, with wording that tells the three cases apart:
 *   - selected                        -> "full"
 *   - implemented, not selected       -> "not-selected" (this run's choice)
 *   - not implemented yet (Phase 2)   -> "not-implemented" (a real gap)
 * `gapSuffix` (core/report.ts) already counts every dimension whose support
 * is not "full", so both new rows are automatically folded into the summary
 * line's "N dimensions not fully run" count with no further change needed
 * there. Exported so a caller can construct/inspect a coverage table (and so
 * a test can assert on it directly) without going through the full `run()`
 * pipeline.
 */
export function dimensionStatuses(selected: DimensionId[]): DimensionStatus[] {
  const ALL_DIMENSIONS: DimensionId[] = [...IMPLEMENTED, ...PHASE_2];
  return ALL_DIMENSIONS.map((id) => {
    if (selected.includes(id)) {
      return { id, support: "full" as const };
    }
    if (IMPLEMENTED.includes(id)) {
      return {
        id,
        support: "not-selected" as const,
        note: "implemented, but not selected for this run — pass --dimension to include it",
      };
    }
    return {
      id,
      support: "not-implemented" as const,
      note: "arrives in wxDBAnalyze Phase 2",
    };
  });
}

/**
 * ADDITION (SCOPE-121 final fix wave, LATEST-FILE — Important): true only
 * when `selected` is exactly the full `IMPLEMENTED` set (same length, every
 * member present) — order-independent, since `--dimension` order does not
 * matter to what was actually covered.
 */
export function isCompleteDimensionSet(selected: DimensionId[]): boolean {
  return (
    selected.length === IMPLEMENTED.length &&
    IMPLEMENTED.every((d) => selected.includes(d))
  );
}

/**
 * The two schema sources this project declares. Named so both `run()` and
 * the all-unresolved refusal below can refer to the same count without a
 * magic number drifting out of sync with the array it's meant to describe.
 */
const SCHEMA_SOURCES: ReadonlyArray<{ label: string; path: string }> = [
  { label: "app", path: "src/db/schema" },
  { label: "mcp", path: "mcp-server/src/db/schema.ts" },
];

/**
 * ADDITION (SCOPE-121 final wave, I3 — Important): `run()` is the single
 * composition seam for this whole skill, and until this fix it had zero test
 * coverage — `cli.test.ts` exercised only `parseArgs`. Both C2 and C3 lived
 * in `run()` and would have been caught by a test exercising it. Every
 * external effect `run()` performs — resolving an adapter (which is how a
 * real network connection gets opened), reading the on-disk apply policy,
 * resolving schema source modules, and writing the report to disk — is
 * injectable here, defaulting to the real implementation used in
 * production. A test supplies a fake `adapterFor` whose `connect()` returns
 * an in-memory `DbConnection` (never a real socket) to exercise the full
 * pipeline with NO database connection ever made — the same fake-connection
 * pattern already used throughout `pg-schema-collect.test.ts` and
 * `pg-integrity-probe.test.ts`, just injected one level higher so `run()`
 * itself can be driven end to end.
 */
export interface RunDeps {
  adapterFor: typeof adapterFor;
  loadApplyPolicy: typeof loadApplyPolicy;
  // MODIFIED-BY (SCOPE 111 / T046)
  loadAnalysisPolicy: typeof loadAnalysisPolicy;
  loadSchemaModules: typeof loadSchemaModules;
  writeReport: typeof writeReport;
}

const defaultRunDeps: RunDeps = {
  adapterFor,
  loadApplyPolicy,
  loadAnalysisPolicy,
  loadSchemaModules,
  writeReport,
};

export async function run(options: CliOptions, deps: RunDeps = defaultRunDeps): Promise<number> {
  const url = options.url ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("wxDBAnalyze: no --url and no DATABASE_URL in the environment.");
    return 2;
  }

  const engine = resolveEngine({ explicit: options.engine, url });
  const adapter = deps.adapterFor(engine);

  const unsupported = options.dimensions.filter(
    (d) => adapter.supports(d) === "not-implemented",
  );
  if (unsupported.length > 0) {
    console.error(
      `wxDBAnalyze: the ${engine} adapter does not implement ` +
        `${unsupported.join(", ")}. Nothing was read and nothing was written.`,
    );
    return 3;
  }

  const policy: ApplyPolicy = await deps.loadApplyPolicy(process.cwd());
  // MODIFIED-BY (SCOPE 111 / T046): columns declared all-null BY DESIGN, so
  // `data.all-null-column` stops asking anyone to drop a meaningful null.
  const analysisPolicy: AnalysisPolicy = await deps.loadAnalysisPolicy(process.cwd());

  // FIX (SCOPE-121 Phase 1 punch list, P2): schema-source resolution and the
  // all-unresolved refusal now run BEFORE `adapter.connect(url)` (previously
  // they ran ahead of `collectLiveSchema` only, inside the connected
  // session — see the retained history below). `.env`'s DATABASE_URL points
  // at production, so a misconfigured run — every schema source path wrong —
  // must refuse without ever dialling the target, not merely without
  // querying it. Nothing depended on the connected-session ordering:
  // `loadSchemaModules` never touched the connection, and only
  // `collectLiveSchema`/`analyzeSchema`/`inferRelationships` further down
  // need one.
  //
  // DEVIATION (controller decision, SCOPE-121/T014, preserved): the brief's
  // draft called `loadSchemaModules(paths)` as if it returned a bare
  // DeclaredSource[]. Task 5 shipped it returning { sources, unresolved }
  // instead, precisely so a moved or renamed schema file is reported
  // rather than silently dropped from the merge.
  const { sources, unresolved } = await deps.loadSchemaModules(SCHEMA_SOURCES);
  for (const miss of unresolved) {
    console.error(
      `wxDBAnalyze: schema source "${miss.label}" (${miss.path}) was not ` +
        `loaded — ${miss.reason}. Findings below are incomplete.`,
    );
  }

  // ADDITION (SCOPE-121 final wave, C3 — CRITICAL; relocated ahead of
  // connect() by the Phase 1 punch list, P2): when EVERY declared schema
  // source fails to resolve, `declared` would be empty and every live table
  // would read as "undeclared" — the report would claim the whole database
  // is undeclared, when the true state is "the declarations could not be
  // loaded", a configuration error on THIS run of the tool (wrong cwd, moved
  // path, wrong project), not a finding about the database. `SKILL.md`'s
  // advertised "point it at any project" usage is exactly the scenario that
  // hits this: both hardcoded paths are relative to `process.cwd()` and
  // specific to wxKanban's own layout. Refuse rather than produce a
  // misleading report — and refuse before a connection to the (production)
  // target is ever opened.
  if (unresolved.length > 0 && unresolved.length === SCHEMA_SOURCES.length) {
    console.error(
      "wxDBAnalyze: every declared schema source failed to resolve " +
        `(${unresolved.map((u) => `${u.label}: ${u.reason}`).join("; ")}). ` +
        "This is a configuration error for THIS run — the schema source " +
        "paths need updating for this project — not a finding about the " +
        "database. Nothing was analysed and nothing was written.",
    );
    return 4;
  }

  const connection = await adapter.connect(url);

  try {
    const live = await collectLiveSchema(connection);
    const declared = extractDeclaredSchema(sources);

    // [SCOPE 121 / T022] BEGIN — Batch A capability and statistics collection
    // Collected ONCE, unconditionally, before the per-dimension branches
    // below — `data`, `performance` and `maintenance` all read `capabilities`
    // and/or `tableStats`, and the alternative (collecting them separately
    // inside each branch) would run the same catalog queries up to three
    // times over on a run that selects more than one of them.
    const capabilities = await collectCapabilities(connection);
    const tableStats = await collectTableStats(connection);
    // [SCOPE 121 / T022] END

    const candidates: unknown[] = [];
    if (options.dimensions.includes("schema")) {
      candidates.push(...analyzeSchema(declared, live));
    }

    let skippedRelationships: SkippedRelationship[] = [];
    if (options.dimensions.includes("integrity")) {
      const rowCounts = await estimateRowCounts(connection);
      // DEVIATION (controller decision, SCOPE-121/T014): the brief's draft
      // treated `inferRelationships(...)` as returning a bare Relationship[].
      // Task 8 shipped it returning { relationships, skipped } instead, so a
      // convention-based resolution that was attempted and declined (e.g. a
      // resolved parent with no primary key) is reported rather than silently
      // dropped. Destructure both and surface the skip count loudly.
      const { relationships, skipped } = inferRelationships({ declared, live });
      skippedRelationships = skipped;
      if (skipped.length > 0) {
        console.error(
          `wxDBAnalyze: ${skipped.length} convention-based relationship ` +
            "resolution(s) were attempted and declined (see the report for " +
            "the full list).",
        );
      }
      const probes = await probeIntegrity(connection, relationships, {
        rowCounts,
        tenantColumn: "companyid",
        maxUnindexedRows: options.deep ? Number.MAX_SAFE_INTEGER : undefined,
      });
      candidates.push(...analyzeIntegrity(probes));
    }

    // [SCOPE 121 / T022] BEGIN — Batch A dimension branches
    // `perfSnapshot` and `maintSnapshot` are hoisted out of their `if` blocks
    // (rather than declared `const` inside them) so their `statementsUnavailable`
    // / `blockersUnavailable` / `bloatUnavailable` gap fields can still be
    // threaded into the JSON snapshot below even though each dimension only
    // runs when selected.
    let perfSnapshot: Awaited<ReturnType<typeof collectPerformance>> | undefined;
    let maintSnapshot: Awaited<ReturnType<typeof collectMaintenance>> | undefined;
    // ADDITION (SCOPE-121 final fix wave, I5a — Important): the set of tables
    // the `data` dimension measured as exactly zero rows via count(*) — the
    // same source `data.empty-table` findings come from. Hoisted alongside
    // `perfSnapshot`/`maintSnapshot` so `performance` can read it even though
    // it is only populated when `data` also ran this pass.
    let knownEmptyTables: ReadonlySet<string> | undefined;

    if (options.dimensions.includes("data")) {
      // `--deep` means the same thing here it already means for the
      // orphan anti-join above: raise the bound to effectively unlimited
      // rather than leave a table above the default ceiling unprofiled.
      const dataSnapshot = await probeDataHealth(connection, live, tableStats, {
        maxTableBytes: options.deep ? Number.MAX_SAFE_INTEGER : undefined,
      });
      candidates.push(
        ...analyzeData(dataSnapshot, analysisPolicy.intentionalNullColumns),
      );
      knownEmptyTables = new Set(
        [...dataSnapshot.tables.values()]
          .filter((t) => t.rowCount === 0)
          .map((t) => t.name),
      );
    }

    if (options.dimensions.includes("performance")) {
      perfSnapshot = await collectPerformance(connection, capabilities);
      // MODIFIED-BY (SCOPE-121 final fix wave, C3/I5a): `capabilities` is
      // threaded through so `analyzePerformance` can suppress
      // unused-index/seq-scan-heavy when track_counts is off rather than
      // read a fabricated zero as "measured and clean"; `knownEmptyTables`
      // (when the `data` dimension also ran) lets it suppress unused-index on
      // a table with zero rows regardless of whether it has ever been
      // ANALYZEd.
      candidates.push(
        ...analyzePerformance(perfSnapshot, tableStats, capabilities, knownEmptyTables),
      );
    }

    if (options.dimensions.includes("maintenance")) {
      maintSnapshot = await collectMaintenance(connection, capabilities);
      // MODIFIED-BY (SCOPE-121 final fix wave, C3 — CRITICAL): same as above
      // for dead-tuple-ratio, plus the global autovacuum=off check.
      candidates.push(...analyzeMaintenance(maintSnapshot, tableStats, capabilities));
    }
    // [SCOPE 121 / T022] END

    const { emitted, rejected } = partitionFindings(candidates);
    const report: AnalysisReport = {
      runAt: new Date().toISOString(),
      engine,
      database: new URL(url).pathname.replace(/^\//, "") || "unknown",
      dimensions: dimensionStatuses(options.dimensions),
      findings: emitted,
      rejected,
      // FIX (SCOPE-121 final wave, C3 — CRITICAL): these now ride in the
      // report itself (rendered by both renderTerminal and renderMarkdown),
      // not only logged to stderr above.
      unresolvedSources: unresolved,
      skippedRelationships,
    };

    console.log(renderTerminal(report));
    // ADDITION (SCOPE-121 final fix wave, LATEST-FILE — Important): a
    // `--dimension`-filtered run must not overwrite `latest.md` with a
    // partial slice — `complete` is true only when the selected dimension
    // set is exactly the full implemented set.
    const complete = isCompleteDimensionSet(options.dimensions);
    const paths: ReportPaths = await deps.writeReport(
      options.reportDir,
      report,
      {
        declaredTables: [...declared.tables.keys()],
        liveTables: [...live.tables.keys()],
        unresolvedSchemaSources: unresolved,
        skippedRelationships,
        // [SCOPE 121 / T022] BEGIN — Batch A gap channels in the machine-readable snapshot
        // These are already surfaced as findings (no-statement-stats,
        // never-analyzed, bloat-unmeasurable, blockers-unknown) — this is for
        // the raw JSON artifact, not a second rendering path, so an operator
        // scripting against the snapshot can see the same gaps without
        // re-parsing prose.
        capabilityExtensions: capabilities.extensions,
        neverAnalyzedCount: tableStats.neverAnalyzed.length,
        statementsUnavailable: perfSnapshot?.statementsUnavailable,
        blockersUnavailable: maintSnapshot?.blockersUnavailable,
        bloatUnavailable: maintSnapshot?.bloatUnavailable,
        freezeMaxAge: maintSnapshot?.freezeMaxAge,
        freezeMaxAgeAssumed: maintSnapshot?.freezeMaxAgeAssumed,
        // [SCOPE 121 / T022] END
      },
      complete,
    );
    console.log(`Report: ${paths.reportPath}`);
    if (paths.latestUpdated) {
      console.log(`latest.md updated (complete run covering: ${IMPLEMENTED.join(", ")}).`);
    } else {
      console.log(
        `wxDBAnalyze: latest.md was NOT updated — this run only covered ` +
          `${options.dimensions.join(", ")}, not the full implemented set ` +
          `(${IMPLEMENTED.join(", ")}). latest.md still reflects the most recent complete run.`,
      );
    }
    console.log(`Apply policy: ${policy.mode} (${policy.source})`);

    if (options.apply || options.dryRun) {
      console.log(
        "Apply is driven by the skill, which presents each statement with its " +
          "classification before anything is executed. See SKILL.md.",
      );
    }

    return emitted.some((f) => f.severity === "critical") ? 1 : 0;
  } finally {
    await connection.close();
  }
}
// [SCOPE 121 / T014] END

// [SCOPE 121 / T014] BEGIN — Entry point
if (process.argv[1]?.endsWith("cli.ts") || process.argv[1]?.endsWith("cli.js")) {
  run(parseArgs(process.argv.slice(2)))
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      console.error(
        `wxDBAnalyze failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exit(2);
    });
}
// [SCOPE 121 / T014] END
