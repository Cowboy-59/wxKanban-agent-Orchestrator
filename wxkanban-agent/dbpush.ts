// dbpush — Spec 019 R6a compliant spec-metadata sync.
//
// Validates local spec artifacts (spec.md, plan.md, tasks.md, tests.md,
// lifecycle.json) under specs/NNN-<slug>/ and syncs them to the MCP Project
// Hub via existing MCP tools (project.create_specs, project.upsert_document,
// project.capture_event).
//
// NOT a Drizzle migration tool — that was an out-of-scope side-effect on the
// earlier implementation, removed 2026-05-15. Real DB migrations follow the
// reference_drizzle_migration_apply pattern (raw pg.Client + transaction in
// a standalone script). Bug report:
//   specs/019-agent-orchestrator-kit/bug-reports/2026-05-15-dbpush-broken-and-misnamed.md

import { z } from 'zod';
import path from 'path';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { parseSpecMd, isSpecFolderName, SpecMetadata } from './core/orchestrator/spec-md-parser';
import * as readline from 'readline';
import { callMcpTool, callMcpToolWithEnvelope, McpClientError } from './core/orchestrator/mcp-client';
import { classifyBlockingIssues } from './core/orchestrator/heading-classifier';
import { rewriteHeadings } from './core/orchestrator/spec-heading-rewriter';
import { emitCockpitRefresh, ensureCockpitUpToDate } from './core/orchestrator/cockpit-refresh';
import { syncTaskStatuses, buildDoneTitles } from './core/orchestrator/sync-task-status';
import { syncArchivedFiles } from './core/orchestrator/sync-archived-files';
import { trustSystemCertificates } from './core/bootstrap/system-ca';
import { loadProjectEnv } from './core/bootstrap/load-env';

// ---------------------------------------------------------------------------
// Zod schema for lifecycle.json — lenient by design.
//
// The canonical _wxAI/commands/dbpush.md contract is "check lifecycle.json
// is valid JSON". Two different shapes exist in the repo today:
//   - Newer (createspecs.ts emits this): { specNumber, featureName, phase,
//     priority, progress, timeline }
//   - Older (hand-authored 2025 specs): { feature, spec, phases: [...] }
// We accept either, require at least one identifying field, and pass
// everything else through. Stricter validation belongs in a future spec.
// ---------------------------------------------------------------------------

const LifecycleSchema = z
  .object({
    specNumber: z.string().optional(),
    featureName: z.string().optional(),
    feature: z.string().optional(),
  })
  .passthrough()
  .refine(
    (v) => Boolean(v.specNumber || v.featureName || v.feature),
    {
      message:
        'lifecycle.json must include at least one of: specNumber, featureName, feature',
    },
  );

type Lifecycle = z.infer<typeof LifecycleSchema>;

// Task-table parser — local copy so dbpush doesn't depend on spec-loader's
// prefix-find behaviour (which silently picks the alphabetically-first
// match when two folders share a scope prefix, e.g. 003-Registration vs.
// 003-Reports). Here we parse the artifact's own tasks.md only.
interface ParsedTask {
  id: string;
  title: string;
  status: string;
}
// Header-aware tasks.md parser. createspecs historically emitted a 4-column
// table `| # | Task | Priority | Status |` (specs 028–036), but newer specs
// (037+) emit 5 columns with an FR/SC linkage column inserted:
// `| # | Task | FR / SC | Priority | Status |`.
//
// Pre-fix (BUG: status column lookup was hard-coded to col index 4) treated
// the 5-column variant's col 4 — which is Priority — as Status, causing the
// MCP to reject `tasks.0.status: 'high'` against the
// `'todo' | 'in_progress' | 'blocked' | 'done'` enum.
//
// Fix: read the header row to discover the actual column positions of "Task"
// (or "Title") and "Status". Fall back to legacy positions (2, last) when the
// header is missing or unrecognized so we don't regress on hand-authored
// tables without explicit headers.
//
// Also: the canonical T### id lives on per-task headings in `## Task Details`
// (`### T001 — Title`); synthesize it from col 1 here.

function splitTableRow(line: string): string[] {
  // Strip leading/trailing pipes and split. Trim each cell.
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function findColumnIndex(
  headerCells: string[],
  matchers: RegExp[],
): number {
  for (let i = 0; i < headerCells.length; i += 1) {
    for (const re of matchers) {
      if (re.test(headerCells[i])) return i;
    }
  }
  return -1;
}

export function parseTasksMd(body: string): ParsedTask[] {
  const out: ParsedTask[] = [];
  const lines = body.split(/\r?\n/);

  // First pass: locate the header row + decode column indices.
  // The header row is the first table line that starts with `| #` (case-insensitive).
  let titleCol = 1; // legacy default: 2nd column (index 1)
  let statusCol = -1; // legacy default: last column; resolved per-row below
  let headerFound = false;
  for (const line of lines) {
    if (/^\|\s*#\s*\|/i.test(line)) {
      const cells = splitTableRow(line);
      const tIdx = findColumnIndex(cells, [/^task$/i, /^title$/i, /^name$/i]);
      const sIdx = findColumnIndex(cells, [/^status$/i, /^state$/i]);
      if (tIdx > 0) titleCol = tIdx;
      if (sIdx > 0) statusCol = sIdx;
      headerFound = true;
      break;
    }
  }

  // Reject rows that don't have enough columns to fill the expected layout —
  // protects against secondary tables (e.g. verification matrices in 026, 028,
  // 036) appearing later in the same file with fewer columns. Without this
  // guard the parser would treat their rows as tasks with garbage statuses.
  const minColsRequired =
    statusCol >= 0 ? statusCol + 1 : titleCol + 1;

  // Second pass: parse data rows.
  for (const line of lines) {
    if (/^\|\s*#\s*\|/i.test(line)) continue; // header
    if (/^\|\s*-+\s*\|/.test(line)) continue; // separator
    if (!line.trim().startsWith("|")) continue; // not a table row
    const cells = splitTableRow(line);
    if (cells.length < 2) continue;

    // First column may be either bare integer ("1", "001") or T-prefixed
    // ("T001", "t012") — accept both since createspecs has emitted both
    // shapes across spec generations.
    const numMatch = /^T?0*(\d+)$/i.exec(cells[0]);
    if (!numMatch) continue;
    const num = Number(numMatch[1]);
    if (!Number.isFinite(num)) continue;

    // Skip rows that can't possibly be from the same table as the header.
    if (cells.length < minColsRequired) continue;

    const title = (cells[titleCol] ?? "").trim();
    // When no header (or no Status column found), fall back to the LAST
    // cell — matches the legacy 4-column emitter where Status was the
    // rightmost column.
    const effectiveStatusCol =
      statusCol >= 0 && statusCol < cells.length ? statusCol : cells.length - 1;
    const status = (cells[effectiveStatusCol] ?? "").trim();

    out.push({
      id: "T" + String(num).padStart(3, "0"),
      title,
      status,
    });
  }

  // headerFound is captured for potential future telemetry; current behavior
  // works fine with or without it (fallback to legacy positions).
  void headerFound;

  return out;
}

// Normalize free-form status strings authored in tasks.md to the canonical
// MCP enum. Spec authors have used 'N/A' (026), 'partial' (028), and similar
// values that the strict MCP server rejects with -32602. Map them to the
// closest canonical value; default unknowns to 'todo' so create_specs at
// least lands the task row instead of failing the whole spec.
function normalizeTaskStatus(
  raw: string,
): "todo" | "in_progress" | "blocked" | "done" {
  const v = raw.toLowerCase().trim();
  if (
    v === "done" ||
    v === "completed" ||
    v === "complete" ||
    v === "closed" ||
    v === "finished" ||
    v === "shipped"
  ) return "done";
  if (
    v === "in_progress" ||
    v === "in progress" ||
    v === "in-progress" ||
    v === "doing" ||
    v === "active" ||
    v === "wip"
  ) return "in_progress";
  if (v === "blocked" || v === "stalled" || v === "waiting") return "blocked";
  if (
    v === "todo" ||
    v === "pending" ||
    v === "open" ||
    v === "not started" ||
    v === "queued"
  ) return "todo";
  // Closed-but-not-strictly-done values that spec authors use to mark
  // tasks they've stopped working on. Treat as 'done' so they land in DB.
  if (
    v === "n/a" ||
    v === "na" ||
    v === "not applicable" ||
    v === "not-applicable" ||
    v === "partial" ||
    v === "wontfix" ||
    v === "won't fix" ||
    v === "cancelled" ||
    v === "canceled" ||
    v === "deferred"
  ) return "done";
  // Anything else: log via the kit logger handled by the caller; default to
  // 'todo' so the row still lands.
  return "todo";
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProjectConfig {
  projectId: string;
}

interface SpecArtifact {
  scope: string;
  slug: string;
  dir: string;
  specMeta: SpecMetadata;
  specBody: string;
  planBody?: string;
  testsBody?: string;
  tasks: Array<{ id: string; title: string; status: string }>;
  lifecycle?: Lifecycle;
  errors: string[];
  warnings: string[];
}

interface ValidationReport {
  artifacts: SpecArtifact[];
  topLevelErrors: string[];
  // Each entry is "name — reason" so the user sees why dbpush ignored it.
  skipped: string[];
}

interface DbState {
  knownSpecNumbers: Set<string>;
  knownTaskIdsBySpec: Map<string, Set<string>>;
  unreachable: boolean;
}

interface PushTotals {
  specsCreated: number;
  specsUpdated: number;
  docsUpserted: number;
  tasksCreated: number;
  taskStatusUpdated: number;
  errors: string[];
  // Spec 029 / T006 — count of blockingIssues entries surfaced from MCP
  // envelopes (separate from generic `errors` length so consumers can tell
  // a preflight rejection apart from a network failure). FR-021.
  blockingIssuesCount: number;
}

export interface DbPushOptions {
  dryRun?: boolean;
  spec?: string;
  force?: boolean;
  skipLifecycle?: boolean;
  // Spec 029 / T012 — disables the interactive heading-shape auto-correct
  // prompt. Used by the recursive retry path to prevent infinite loops,
  // and by callers (CI, tests) that want non-interactive behavior even
  // when stdin is a TTY.
  skipInteractiveRetry?: boolean;
}

export interface DbPushReport {
  validation: {
    specsParsed: number;
    specsSkipped: string[];
    errorCount: number;
    errors: string[];
    warnings: string[];
  };
  push: PushTotals;
  dryRun: boolean;
  dbUnreachable: boolean;
  // Spec 029 / T012 — populated when the kit auto-rewrote heading-shape
  // issues and re-ran the push. `retryAttempted: false` means no retry
  // happened (no heading-shape issues, non-TTY, user answered N, or
  // skipInteractiveRetry was set).
  retryAttempted?: boolean;
  rewroteSpecs?: Array<{ scope: string; bakPath: string; rewroteSections: string[] }>;
}

// ---------------------------------------------------------------------------
// Phase 1 — validate local files
// ---------------------------------------------------------------------------

function loadProjectConfig(root: string): ProjectConfig | null {
  const p = path.join(root, '.wxkanban-project.json');
  if (!existsSync(p)) return null;
  try {
    const obj = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, unknown>;
    if (typeof obj['projectId'] === 'string') {
      return { projectId: obj['projectId'] };
    }
  } catch {
    /* fall through */
  }
  return null;
}

function readIfExists(p: string): string | undefined {
  return existsSync(p) ? readFileSync(p, 'utf-8') : undefined;
}

function validateOne(specsRoot: string, name: string): SpecArtifact {
  const scope = name.replace(/^(\d{3,})-.*/, '$1');
  const slug = name.slice(scope.length + 1);
  const dir = path.join(specsRoot, name);

  const artifact: SpecArtifact = {
    scope,
    slug,
    dir,
    specMeta: {},
    specBody: '',
    tasks: [],
    errors: [],
    warnings: [],
  };

  // spec.md — required, Markdown
  const specMd = readIfExists(path.join(dir, 'spec.md'));
  if (!specMd) {
    artifact.errors.push('Missing required file: spec.md');
  } else {
    const parsed = parseSpecMd(specMd);
    artifact.specMeta = parsed.meta;
    artifact.specBody = parsed.body;
    if (!artifact.specMeta.title) {
      artifact.warnings.push('spec.md has no parseable "# Spec NNN: Title" header');
    }
  }

  // tasks.md — read from the artifact's own directory (do not use
  // spec-loader's prefix-find; it silently aliases duplicate-scope folders
  // like 003-Registration vs. 003-Reports).
  const tasksMd = readIfExists(path.join(dir, 'tasks.md'));
  if (tasksMd) {
    artifact.tasks = parseTasksMd(tasksMd);
  } else {
    artifact.warnings.push('tasks.md missing');
  }

  // plan.md / tests.md — optional
  artifact.planBody = readIfExists(path.join(dir, 'plan.md'));
  artifact.testsBody = readIfExists(path.join(dir, 'tests.md'));

  // lifecycle.json — optional but warned
  const lifecycleRaw = readIfExists(path.join(dir, 'lifecycle.json'));
  if (lifecycleRaw === undefined) {
    artifact.warnings.push('lifecycle.json missing');
  } else {
    let parsed: unknown;
    try {
      parsed = JSON.parse(lifecycleRaw);
    } catch (err) {
      artifact.errors.push(`lifecycle.json is not valid JSON: ${(err as Error).message}`);
      return artifact;
    }
    const validated = LifecycleSchema.safeParse(parsed);
    if (validated.success) {
      artifact.lifecycle = validated.data;
    } else {
      const issues = validated.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
        .join('; ');
      artifact.errors.push(`lifecycle.json schema invalid: ${issues}`);
    }
  }

  return artifact;
}

function phase1Validate(specsRoot: string, scopeFilter?: string): ValidationReport {
  const report: ValidationReport = {
    artifacts: [],
    topLevelErrors: [],
    skipped: [],
  };

  if (!existsSync(specsRoot)) {
    report.topLevelErrors.push(`specs/ directory not found at ${specsRoot}`);
    return report;
  }

  for (const name of readdirSync(specsRoot)) {
    const full = path.join(specsRoot, name);
    let isDir = false;
    try {
      isDir = statSync(full).isDirectory();
    } catch {
      isDir = false;
    }
    if (!isDir) {
      report.skipped.push(`${name} — not a directory`);
      continue;
    }
    if (!isSpecFolderName(name)) {
      report.skipped.push(`${name} — doesn't match NNN-<slug> pattern`);
      continue;
    }
    const scope = name.replace(/^(\d{3,})-.*/, '$1');
    if (scopeFilter && scope !== scopeFilter) continue;

    // A spec folder without spec.md isn't an error — it's just not a real
    // dbpush target. Common cases: legacy `Scope.md` filename (003-Reports),
    // bug-report / runbook directories (019-agent-orchestrator-kit). Skip
    // with reason so the user knows why.
    if (!existsSync(path.join(full, 'spec.md'))) {
      report.skipped.push(`${name} — no spec.md (likely a legacy or support-doc folder)`);
      continue;
    }
    report.artifacts.push(validateOne(specsRoot, name));
  }

  // Flag duplicate scope numbers (two folders sharing "NNN-" prefix).
  // The repo currently has e.g. 003-Registration + 003-Reports; we don't
  // try to merge them — both get pushed independently and the user is
  // warned to rename one or move the older into Project-Scope/.
  const byScope = new Map<string, SpecArtifact[]>();
  for (const a of report.artifacts) {
    if (!byScope.has(a.scope)) byScope.set(a.scope, []);
    byScope.get(a.scope)!.push(a);
  }
  for (const [scope, group] of byScope) {
    if (group.length <= 1) continue;
    const names = group.map((g) => path.basename(g.dir)).join(', ');
    for (const a of group) {
      a.warnings.push(
        `duplicate scope number ${scope} shared with: ${names}. Consider renaming one folder or archiving older variants under specs/Project-Scope/.`,
      );
    }
  }

  return report;
}

// ---------------------------------------------------------------------------
// Phase 2 — compare local with database
// ---------------------------------------------------------------------------

// [SCOPE 029 / T005] BEGIN — TASK_TITLE_SCOPE_RE (extract NNN from `[NNN-T###]` prefix)
//
// Spec 029 / FR-010 — the live `project.list_open_items` envelope returns
// `tasks` with no `specNumber` field, so we derive the scope number from
// the leading `[NNN-T###]` prefix that createspecs and implement emit on
// every task title. Tasks whose titles do not match are ignored, not
// errors.
const TASK_TITLE_SCOPE_RE = /^\[(\d{3})-T\d+\]/;
// [SCOPE 029 / T005] END

// [SCOPE 029 / T005] BEGIN — parseScopeFromTaskTitle (single-task helper, exported for tests)
export function parseScopeFromTaskTitle(title: string | undefined): string | null {
  if (typeof title !== 'string') return null;
  const m = title.match(TASK_TITLE_SCOPE_RE);
  return m ? (m[1] ?? null) : null;
}
// [SCOPE 029 / T005] END

// [SCOPE 029 / T005] BEGIN — phase2Compare (envelope-aware idempotency read)
//
// Spec 029 / FR-009 — the real `project.list_open_items` envelope only has
// `tasks` / `documents` / `events` (no `specs[]`), so the old `resp.specs`
// branch is removed. Scope numbers come from each task's `specNumber`
// field when present, or are parsed from the title's `[NNN-T###]` prefix
// (FR-010). FR-011 preserves the prefix parser as the floor even if the
// envelope later adds an explicit specs[] array.
async function phase2Compare(projectId: string): Promise<DbState> {
  type ListResp = {
    tasks?: Array<{ id?: string; specNumber?: string; title?: string }>;
    documents?: Array<{ id?: string; title?: string }>;
    events?: Array<{ id?: string; type?: string }>;
  };
  try {
    const resp = await callMcpTool<ListResp>('project.list_open_items', {
      projectId,
      maxItems: 100,
    });
    const knownSpecNumbers = new Set<string>();
    const knownTaskIdsBySpec = new Map<string, Set<string>>();
    if (Array.isArray(resp.tasks)) {
      for (const t of resp.tasks) {
        const scope = t.specNumber ?? parseScopeFromTaskTitle(t.title);
        if (!scope) continue;
        knownSpecNumbers.add(scope);
        if (!knownTaskIdsBySpec.has(scope)) {
          knownTaskIdsBySpec.set(scope, new Set());
        }
        if (t.id) knownTaskIdsBySpec.get(scope)!.add(t.id);
      }
    }
    return { knownSpecNumbers, knownTaskIdsBySpec, unreachable: false };
  } catch (err) {
    const msg = err instanceof McpClientError ? err.message : (err as Error).message;
    console.warn(`dbpush: phase 2 DB compare skipped (${msg})`);
    return {
      knownSpecNumbers: new Set(),
      knownTaskIdsBySpec: new Map(),
      unreachable: true,
    };
  }
}
// [SCOPE 029 / T005] END

// ---------------------------------------------------------------------------
// Phase 4 — push to database
//
// Phase 3 (lifecycle.json auto-generation) is intentionally skipped:
// lifecycle.json and specs/projectlifecycle.md are hand-maintained per
// CLAUDE.md project conventions. dbpush validates them; the user/editor AI
// maintains them.
// ---------------------------------------------------------------------------

// Spec 029 / T003 — counters now derived from server-reported envelope,
// not from the local artifact. Blocked envelopes (success:false, blocked:
// true) surface their blockingIssues as r.errors entries prefixed with the
// scope number. FR-005, FR-006, FR-007.
interface CreateSpecsResponseShape extends Record<string, unknown> {
  spec?: { id?: string; specNumber?: string } | null;
  tasks?: Array<{ id?: string; title?: string }>;
  documents?: Array<{ id?: string; title?: string }>;
}

interface UpsertDocumentResponseShape extends Record<string, unknown> {
  document?: { id?: string; title?: string };
}

// [SCOPE 029 / T003] BEGIN — pushNewSpec (envelope-aware create_specs)
async function pushNewSpec(
  projectId: string,
  artifact: SpecArtifact,
  dryRun: boolean,
): Promise<PushTotals> {
  const r: PushTotals = {
    specsCreated: 0,
    specsUpdated: 0,
    docsUpserted: 0,
    tasksCreated: 0,
    taskStatusUpdated: 0,
    errors: [],
    blockingIssuesCount: 0,
  };
  const featureName =
    artifact.specMeta.title || artifact.slug || `Spec ${artifact.scope}`;
  if (dryRun) {
    // Dry-run keeps the old behavior — we can't know the server response
    // without calling, so we estimate from the local artifact. The estimate
    // is labelled as such by the report's `dryRun: true` flag.
    r.specsCreated++;
    r.tasksCreated += artifact.tasks.length;
    return r;
  }
  try {
    const envelope = await callMcpToolWithEnvelope<CreateSpecsResponseShape>(
      'project.create_specs',
      {
        projectId,
        specNumber: artifact.scope,
        featureName,
        scopeContent: artifact.specBody,
        phase: artifact.lifecycle?.phase ?? 'design',
        priority: artifact.lifecycle?.priority ?? 'medium',
        tasks: artifact.tasks.map((t) => ({
          // MCP enforces title ≤ 255 chars. Some spec authors author
          // multi-sentence "titles" in tasks.md (e.g. 028 T050). Truncate
          // with ellipsis so the row still lands; the full text is
          // preserved verbatim in the description field below (and in the
          // source tasks.md on disk).
          title:
            t.title.length > 255 ? t.title.slice(0, 252) + "…" : t.title,
          description: t.title,
          priority: 'medium' as const,
          // Normalize free-form status (N/A, partial, etc.) to the MCP enum
          // instead of casting blindly — see normalizeTaskStatus comment.
          status: normalizeTaskStatus(t.status || 'todo'),
        })),
        generateLifecycle: false,
      },
    );
    if (envelope.success === false) {
      // FR-005 — blocked envelope. Surface each blocking issue prefixed
      // with the scope number; do NOT increment counters.
      const issues = envelope.blockingIssues.length > 0
        ? envelope.blockingIssues
        : ['create_specs returned success:false without blockingIssues'];
      for (const issue of issues) {
        r.errors.push(`${artifact.scope}: ${issue}`);
      }
      // FR-021 — blockingIssuesCount tracks only server-reported blocking
      // issues, not generic network/throw errors.
      r.blockingIssuesCount += envelope.blockingIssues.length;
    } else {
      // FR-006 — counts derived from server response, not local artifact.
      r.specsCreated += envelope.data.spec != null ? 1 : 0;
      r.tasksCreated += Array.isArray(envelope.data.tasks) ? envelope.data.tasks.length : 0;
    }
  } catch (err) {
    r.errors.push(`create_specs ${artifact.scope}: ${(err as Error).message}`);
  }
  return r;
}
// [SCOPE 029 / T003] END

// [SCOPE 029 / T003] BEGIN — pushExistingSpec (envelope-aware upsert_document)
async function pushExistingSpec(
  projectId: string,
  artifact: SpecArtifact,
  dryRun: boolean,
): Promise<PushTotals> {
  const r: PushTotals = {
    specsCreated: 0,
    specsUpdated: 1,
    docsUpserted: 0,
    tasksCreated: 0,
    taskStatusUpdated: 0,
    errors: [],
    blockingIssuesCount: 0,
  };
  const featureName =
    artifact.specMeta.title || artifact.slug || `Spec ${artifact.scope}`;
  // BUG-2026-07-18 (Issue 3): titles MUST match exactly what create_specs writes,
  // because upsert_document matches project-level docs by (doctype, title). Both
  // paths already use doctype 'specs'; the only divergence was the title format
  // (em-dash vs colon, and the Plan naming), which made dbpush create a parallel
  // 31+ doc set on an already-imported project instead of updating in place.
  // create_specs writes: spec = `Spec {N}: {name}` (colon), plan = `Plan: {name}`.
  // (create_specs also seeds spec.md's `# Spec {N}: {name}` header, so the parsed
  // specMeta.title here equals the original featureName — the titles line up.)
  const docs: Array<{ title: string; body: string }> = [
    { title: `Spec ${artifact.scope}: ${featureName}`, body: artifact.specBody },
  ];
  if (artifact.planBody) {
    docs.push({ title: `Plan: ${featureName}`, body: artifact.planBody });
  }
  if (artifact.testsBody) {
    // create_specs writes no tests doc, so this is dbpush-owned; its stable title
    // keeps it idempotent across dbpush re-runs (matches its own prior row).
    docs.push({ title: `Spec ${artifact.scope} — Tests`, body: artifact.testsBody });
  }

  for (const d of docs) {
    if (dryRun) {
      r.docsUpserted++;
      continue;
    }
    try {
      const envelope = await callMcpToolWithEnvelope<UpsertDocumentResponseShape>(
        'project.upsert_document',
        {
          projectId,
          title: d.title,
          bodyMarkdown: d.body,
          // doctype is required by the tool. spec/plan/tests share doctype 'specs'
          // and stay distinct rows because the server matches by (doctype, title).
          doctype: 'specs',
        },
      );
      if (envelope.success === false) {
        // FR-007 — blocked envelope on upsert. Surface each blocking issue
        // prefixed with the doc title; do NOT increment docsUpserted.
        const issues = envelope.blockingIssues.length > 0
          ? envelope.blockingIssues
          : ['upsert_document returned success:false without blockingIssues'];
        for (const issue of issues) {
          r.errors.push(`upsert_document "${d.title}": ${issue}`);
        }
        r.blockingIssuesCount += envelope.blockingIssues.length;
      } else {
        r.docsUpserted++;
      }
    } catch (err) {
      r.errors.push(`upsert_document "${d.title}": ${(err as Error).message}`);
    }
  }

  // [SCOPE 042 / T037] BEGIN — task-status sync (the previously-deferred half)
  // The "T-ID → UUID resolution" the stub punted on is done by syncTaskStatuses
  // via project.cockpit_summary (which returns each incomplete task's UUID).
  // Forward-only: tasks now marked done in tasks.md are flipped to 'done' in
  // the DB, so the cockpit's remaining count actually drops (spec 042 FR-006 /
  // SC-3). Best-effort — failures are surfaced as errors, never thrown.
  if (!dryRun) {
    const sync = await syncTaskStatuses({
      projectId,
      scope: artifact.scope,
      doneTitles: buildDoneTitles(artifact.tasks),
    });
    r.taskStatusUpdated += sync.updated;
    r.errors.push(...sync.errors);
  }
  // [SCOPE 042 / T037] END
  return r;
}
// [SCOPE 029 / T003] END

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function dbpush(options: DbPushOptions = {}): Promise<DbPushReport> {
  const projectRoot = process.cwd();
  const specsRoot = path.resolve(projectRoot, 'specs');
  const config = loadProjectConfig(projectRoot);
  if (!config) {
    throw new Error(
      'dbpush: no .wxkanban-project.json in cwd. Run `kit init` first, or cd to the project root.',
    );
  }

  // Phase 1
  const validation = phase1Validate(specsRoot, options.spec);
  const blockingErrors = validation.artifacts.flatMap((a) =>
    a.errors.map((e) => `${a.scope}: ${e}`),
  );
  const allWarnings = validation.artifacts.flatMap((a) =>
    a.warnings.map((w) => `${a.scope}: ${w}`),
  );
  validation.topLevelErrors.forEach((e) => blockingErrors.push(e));

  if (blockingErrors.length && !options.force) {
    throw new Error(
      `dbpush: ${blockingErrors.length} validation error(s):\n  ` +
        blockingErrors.slice(0, 10).join('\n  ') +
        (blockingErrors.length > 10
          ? `\n  ... and ${blockingErrors.length - 10} more`
          : '') +
        `\n\nUse --force to push anyway (errors are logged in capture_event metadata).`,
    );
  }

  // Phase 2
  const dbState = await phase2Compare(config.projectId);

  // Phase 4 (Phase 3 skipped — lifecycle.json is hand-maintained)
  const totals: PushTotals = {
    specsCreated: 0,
    specsUpdated: 0,
    docsUpserted: 0,
    tasksCreated: 0,
    taskStatusUpdated: 0,
    errors: [],
    blockingIssuesCount: 0,
  };
  // Short-circuit Phase 4 when MCP is unreachable AND we're not in dry-run.
  // Without this guard we'd emit one "MCP not reachable" error per spec —
  // noise. Dry-run still walks the artifacts so the user sees the plan.
  if (dbState.unreachable && !options.dryRun) {
    totals.errors.push(
      'MCP server unreachable; no specs pushed. Start the kit runtime with `node scripts/setup-mcp.mjs` and re-run.',
    );
  } else {
    for (const a of validation.artifacts) {
      if (a.errors.length > 0 && !options.force) continue;
      const isNew = !dbState.knownSpecNumbers.has(a.scope);
      const r = isNew
        ? await pushNewSpec(config.projectId, a, options.dryRun === true)
        : await pushExistingSpec(config.projectId, a, options.dryRun === true);
      totals.specsCreated += r.specsCreated;
      totals.specsUpdated += r.specsUpdated;
      totals.docsUpserted += r.docsUpserted;
      totals.tasksCreated += r.tasksCreated;
      totals.taskStatusUpdated += r.taskStatusUpdated;
      totals.errors.push(...r.errors);
      totals.blockingIssuesCount += r.blockingIssuesCount;
    }
  }

  // Phase 5 — best-effort, never fails the command
  if (!options.dryRun && !dbState.unreachable) {
    try {
      await callMcpTool('project.capture_event', {
        projectId: config.projectId,
        type: 'document_updated',
        source: 'cli',
        actor: process.env['USER'] || 'cli-user',
        rawContent:
          `dbpush: ${totals.specsCreated} new spec(s), ${totals.specsUpdated} updated, ` +
          `${totals.docsUpserted} doc(s), ${totals.tasksCreated} new task(s)`,
        metadata: {
          specsProcessed: validation.artifacts.length,
          specsSkipped: validation.skipped.length,
          validationErrors: blockingErrors.length,
          // Spec 029 / T006 / FR-021 — pushErrors reflects post-envelope
          // detection truth; blockingIssuesCount surfaces server-reported
          // preflight rejections separately from network/throw errors.
          pushErrors: totals.errors.length,
          blockingIssuesCount: totals.blockingIssuesCount,
          forced: !!options.force,
        },
      });
    } catch (err) {
      console.warn(`dbpush: capture_event failed (non-fatal): ${(err as Error).message}`);
    }
  }

  // [SCOPE 029 / T012] BEGIN — interactive heading-shape retry (FR-017 / FR-018 / FR-019 / FR-020)
  //
  // When at least one spec was blocked AND we're attached to a TTY AND
  // the caller didn't disable interactive retry, classify each blocked
  // spec for recoverable heading-shape issues and offer auto-correct.
  // Content blocking issues remain in errors regardless (FR-020).
  const retryDecision = await maybeOfferInteractiveRetry({
    artifacts: validation.artifacts,
    totals,
    options,
    dryRun: !!options.dryRun,
    dbUnreachable: dbState.unreachable,
  });

  if (retryDecision.retryConfirmed) {
    // Rewrite affected files, then re-run dbpush once with the retry
    // flag set so we never loop more than one round.
    const rewroteSpecs: Array<{ scope: string; bakPath: string; rewroteSections: string[] }> = [];
    for (const candidate of retryDecision.candidates) {
      const result = rewriteHeadings(candidate.specPath, candidate.headingShape);
      rewroteSpecs.push({
        scope: candidate.scope,
        bakPath: result.bakPath,
        rewroteSections: result.rewroteSections,
      });
    }
    console.log(`dbpush: rewrote ${rewroteSpecs.length} spec.md file(s); re-running push.`);
    const retryReport = await dbpush({ ...options, skipInteractiveRetry: true });
    return {
      ...retryReport,
      retryAttempted: true,
      rewroteSpecs,
    };
  }
  // [SCOPE 029 / T012] END

  // [SCOPE 042 / T021] BEGIN — ping the VS Code Dev Cockpit after a real push
  // [SCOPE 042 / T038] MODIFIED-BY — also self-heal a stale cockpit (FR-012)
  // so newly created scopes/specs/tasks surface without a manual refresh
  // (spec 042 FR-006 / SC-2). Best-effort; skipped for dry-run / DB-unreachable.
  if (!options.dryRun && !dbState.unreachable) {
    emitCockpitRefresh();
    ensureCockpitUpToDate();
  }
  // [SCOPE 042 / T021] END

  // [SCOPE 103 / T007] BEGIN — reconcile on-disk files to the DB archived status
  // The app archives a scope by setting its DB status; the kit is the only side
  // that can move the local files, so after a real push we sync each group
  // to/from specs/_archive/ to match. Best-effort; never fails the command.
  if (!options.dryRun && !dbState.unreachable) {
    try {
      const arch = await syncArchivedFiles({ projectId: config.projectId, projectRoot });
      if (arch.archived.length) console.log(`dbpush: archived files for scope(s) ${arch.archived.join(', ')}`);
      if (arch.unarchived.length) console.log(`dbpush: restored files for scope(s) ${arch.unarchived.join(', ')}`);
      // This is a best-effort side reconcile, NOT part of the spec/task push report —
      // its errors go to the log, never into totals.errors (which the push envelope and
      // its tests treat as spec-push failures).
      for (const e of arch.errors) console.warn(`dbpush: archived-file sync: ${e}`);
    } catch (err) {
      console.warn(`dbpush: archived-file sync failed (non-fatal): ${(err as Error).message}`);
    }
  }
  // [SCOPE 103 / T007] END

  return {
    validation: {
      specsParsed: validation.artifacts.length,
      specsSkipped: validation.skipped,
      errorCount: blockingErrors.length,
      errors: blockingErrors.slice(0, 20),
      warnings: allWarnings.slice(0, 20),
    },
    push: totals,
    dryRun: !!options.dryRun,
    dbUnreachable: dbState.unreachable,
    retryAttempted: false,
  };
}

// [SCOPE 029 / T012] BEGIN — maybeOfferInteractiveRetry (prompt + classifier orchestration)
//
// Side effect: prints heading-shape issues + reads y/N from stdin when the
// gate conditions are met. Returns:
//   - retryConfirmed: whether to actually rewrite + re-run
//   - candidates: per-spec heading-shape sections to rewrite
async function maybeOfferInteractiveRetry(input: {
  artifacts: SpecArtifact[];
  totals: PushTotals;
  options: DbPushOptions;
  dryRun: boolean;
  dbUnreachable: boolean;
}): Promise<{
  retryConfirmed: boolean;
  candidates: Array<{ scope: string; specPath: string; headingShape: string[] }>;
}> {
  if (input.options.skipInteractiveRetry) return { retryConfirmed: false, candidates: [] };
  if (input.dryRun || input.dbUnreachable) return { retryConfirmed: false, candidates: [] };
  if (input.totals.blockingIssuesCount === 0) return { retryConfirmed: false, candidates: [] };

  // Parse scope numbers out of `r.errors` — pushNewSpec uses `NNN:` prefix
  // for blocking issues (FR-005).
  const blockedScopes = new Set<string>();
  for (const err of input.totals.errors) {
    const m = err.match(/^(\d{3}):/);
    if (m && m[1]) blockedScopes.add(m[1]);
  }

  const candidates: Array<{ scope: string; specPath: string; headingShape: string[] }> = [];
  for (const artifact of input.artifacts) {
    if (!blockedScopes.has(artifact.scope)) continue;
    const specPath = path.join(artifact.dir, 'spec.md');
    if (!existsSync(specPath)) continue;
    const classified = classifyBlockingIssues(specPath);
    if (classified.headingShape.length > 0) {
      candidates.push({
        scope: artifact.scope,
        specPath,
        headingShape: classified.headingShape,
      });
    }
  }

  if (candidates.length === 0) return { retryConfirmed: false, candidates: [] };

  // FR-018 / FR-020 — non-TTY runs skip the prompt entirely and exit with
  // all blocking issues as errors (CI-safe).
  if (!process.stdin.isTTY) return { retryConfirmed: false, candidates: [] };

  console.log('');
  console.log('Heading-shape issues detected — these can be auto-corrected:');
  for (const c of candidates) {
    console.log(`  ${c.scope}: ${c.headingShape.join(', ')}`);
  }
  console.log('');
  const answer = await promptYesNo('Auto-correct heading shape and retry push? [y/N]: ');
  return { retryConfirmed: answer, candidates };
}
// [SCOPE 029 / T012] END

// [SCOPE 029 / T012] BEGIN — promptYesNo (readline wrapper, default = no)
function promptYesNo(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}
// [SCOPE 029 / T012] END

// ---------------------------------------------------------------------------
// CLI entry point (preserved for backwards-compat with `node dbpush.js`)
// ---------------------------------------------------------------------------

// Map the documented dbpush flags (_wxAI/commands/dbpush.md) to DbPushOptions.
// The CLI previously hardcoded `dbpush({})`, so --dry-run/--spec/--force/
// --skip-lifecycle were silently ignored (Issue 4).
function parseDbPushArgv(argv: string[]): DbPushOptions {
  const opts: DbPushOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run' || a === '--dryRun') opts.dryRun = true;
    else if (a === '--force') opts.force = true;
    else if (a === '--skip-lifecycle' || a === '--skipLifecycle') opts.skipLifecycle = true;
    else if (a === '--spec' || a === '--scope') {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        opts.spec = next;
        i++;
      }
    } else if (a.startsWith('--spec=')) opts.spec = a.slice('--spec='.length);
    else if (a.startsWith('--scope=')) opts.spec = a.slice('--scope='.length);
  }
  return opts;
}

if (require.main === module) {
  // BUG-REPORT-kit-dbpush-tls-and-packaging.md fixes:
  //  - Issue 1: trust the OS cert store (also covered transitively via the
  //    mcp-client import, but explicit here keeps the entry point self-contained).
  //  - Issue 4: load .env so the push is authenticated, and honour CLI flags.
  trustSystemCertificates();
  loadProjectEnv();

  const options = parseDbPushArgv(process.argv.slice(2));

  dbpush(options)
    .then((report) => {
      console.log('dbpush Report (MCP Project Hub)');
      console.log('===============================');
      console.log(`Specs parsed:     ${report.validation.specsParsed}`);
      console.log(`Specs skipped:    ${report.validation.specsSkipped.length}`);
      console.log(`Validation errors: ${report.validation.errorCount}`);
      if (report.validation.warnings.length > 0) {
        console.log(`Warnings (${report.validation.warnings.length}):`);
        for (const w of report.validation.warnings) console.log(`  - ${w}`);
      }
      console.log('');
      console.log('Database Sync:');
      console.log(`  Specs created:   ${report.push.specsCreated}`);
      console.log(`  Specs updated:   ${report.push.specsUpdated}`);
      console.log(`  Docs upserted:   ${report.push.docsUpserted}`);
      console.log(`  Tasks created:   ${report.push.tasksCreated}`);
      if (report.push.errors.length > 0) {
        // Spec 029 / T006 — surface the blocking-issues subset so operators
        // can tell a preflight rejection apart from a network/throw error.
        const blockingIssuesCount = report.push.blockingIssuesCount;
        const suffix = blockingIssuesCount > 0
          ? `, ${blockingIssuesCount} from server preflight blocks`
          : '';
        console.log(`  Push errors (${report.push.errors.length}${suffix}):`);
        for (const e of report.push.errors) console.log(`    - ${e}`);
      }
      if (report.dryRun) console.log('\n(dry-run — no DB writes performed)');
      if (report.dbUnreachable) {
        console.log('\nNOTE: MCP server unreachable; validation ran, sync skipped.');
      }
    })
    .catch((err) => {
      console.error('Error:', (err as Error).message);
      // Issue 2: set the exit code and let the loop drain rather than
      // process.exit() mid-socket-teardown (libuv crash on Windows/Node 24).
      process.exitCode = 1;
    });
}
