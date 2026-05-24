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
import { callMcpTool, McpClientError } from './core/orchestrator/mcp-client';

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
// createspecs emits the summary table as `| # | Task | Priority | Status |`
// — integer in col 1, bare title in col 2, no T### prefix anywhere. The
// canonical T### id lives on the per-task headings in `## Task Details`
// (`### T001 — Title`). Synthesize the id from col 1 here so the parser
// matches the emitter; col 4 (status) maps to ParsedTask.status. Pre-fix
// behavior required `T###` in col 2 and matched zero rows on every
// createspecs-produced tasks.md (BUG-2026-05-24).
const TASKS_TABLE_ROW_RE =
  /^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/;
export function parseTasksMd(body: string): ParsedTask[] {
  const out: ParsedTask[] = [];
  for (const line of body.split(/\r?\n/)) {
    // Skip the header + separator rows (`| # | Task | …` and `|---|---|…`).
    if (/^\|\s*#\s*\|/i.test(line)) continue;
    if (/^\|\s*-+\s*\|/.test(line)) continue;
    const m = line.match(TASKS_TABLE_ROW_RE);
    if (!m) continue;
    const num = Number(m[1]);
    if (!Number.isFinite(num)) continue;
    out.push({
      id: 'T' + String(num).padStart(3, '0'),
      title: (m[2] ?? '').trim(),
      status: (m[4] ?? '').trim(),
    });
  }
  return out;
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
}

export interface DbPushOptions {
  dryRun?: boolean;
  spec?: string;
  force?: boolean;
  skipLifecycle?: boolean;
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

async function phase2Compare(projectId: string): Promise<DbState> {
  type ListResp = {
    tasks?: Array<{ id?: string; specNumber?: string }>;
    specs?: Array<{ specNumber?: string }>;
  };
  try {
    const resp = await callMcpTool<ListResp>('project.list_open_items', {
      projectId,
      maxItems: 100,
    });
    const knownSpecNumbers = new Set<string>();
    const knownTaskIdsBySpec = new Map<string, Set<string>>();
    if (Array.isArray(resp.specs)) {
      for (const s of resp.specs) {
        if (s.specNumber) knownSpecNumbers.add(s.specNumber);
      }
    }
    if (Array.isArray(resp.tasks)) {
      for (const t of resp.tasks) {
        if (!t.specNumber) continue;
        knownSpecNumbers.add(t.specNumber);
        if (!knownTaskIdsBySpec.has(t.specNumber)) {
          knownTaskIdsBySpec.set(t.specNumber, new Set());
        }
        if (t.id) knownTaskIdsBySpec.get(t.specNumber)!.add(t.id);
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

// ---------------------------------------------------------------------------
// Phase 4 — push to database
//
// Phase 3 (lifecycle.json auto-generation) is intentionally skipped:
// lifecycle.json and specs/projectlifecycle.md are hand-maintained per
// CLAUDE.md project conventions. dbpush validates them; the user/editor AI
// maintains them.
// ---------------------------------------------------------------------------

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
  };
  const featureName =
    artifact.specMeta.title || artifact.slug || `Spec ${artifact.scope}`;
  if (dryRun) {
    r.specsCreated++;
    r.tasksCreated += artifact.tasks.length;
    return r;
  }
  try {
    await callMcpTool('project.create_specs', {
      projectId,
      specNumber: artifact.scope,
      featureName,
      scopeContent: artifact.specBody,
      phase: artifact.lifecycle?.phase ?? 'design',
      priority: artifact.lifecycle?.priority ?? 'medium',
      tasks: artifact.tasks.map((t) => ({
        title: t.title,
        description: t.title,
        priority: 'medium' as const,
        status: (t.status || 'todo') as 'todo' | 'in_progress' | 'blocked' | 'done',
      })),
      generateLifecycle: false,
    });
    r.specsCreated++;
    r.tasksCreated += artifact.tasks.length;
  } catch (err) {
    r.errors.push(`create_specs ${artifact.scope}: ${(err as Error).message}`);
  }
  return r;
}

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
  };
  const featureName =
    artifact.specMeta.title || artifact.slug || `Spec ${artifact.scope}`;
  const docs: Array<{ title: string; body: string }> = [
    { title: `Spec ${artifact.scope} — ${featureName}`, body: artifact.specBody },
  ];
  if (artifact.planBody) {
    docs.push({ title: `Spec ${artifact.scope} — Plan`, body: artifact.planBody });
  }
  if (artifact.testsBody) {
    docs.push({ title: `Spec ${artifact.scope} — Tests`, body: artifact.testsBody });
  }

  for (const d of docs) {
    if (dryRun) {
      r.docsUpserted++;
      continue;
    }
    try {
      await callMcpTool('project.upsert_document', {
        projectId,
        title: d.title,
        bodyMarkdown: d.body,
      });
      r.docsUpserted++;
    } catch (err) {
      r.errors.push(`upsert_document "${d.title}": ${(err as Error).message}`);
    }
  }

  // Task status sync deferred — needs T-ID → UUID resolution on the MCP
  // side. For now dbpush keeps existing tasks in DB untouched on re-runs.
  return r;
}

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
          pushErrors: totals.errors.length,
          forced: !!options.force,
        },
      });
    } catch (err) {
      console.warn(`dbpush: capture_event failed (non-fatal): ${(err as Error).message}`);
    }
  }

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
  };
}

// ---------------------------------------------------------------------------
// CLI entry point (preserved for backwards-compat with `node dbpush.js`)
// ---------------------------------------------------------------------------

if (require.main === module) {
  dbpush({})
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
        console.log(`  Push errors (${report.push.errors.length}):`);
        for (const e of report.push.errors) console.log(`    - ${e}`);
      }
      if (report.dryRun) console.log('\n(dry-run — no DB writes performed)');
      if (report.dbUnreachable) {
        console.log('\nNOTE: MCP server unreachable; validation ran, sync skipped.');
      }
    })
    .catch((err) => {
      console.error('Error:', (err as Error).message);
      process.exit(1);
    });
}
