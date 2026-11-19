// [SCOPE 111 / T027] BEGIN — Test Suite Lifecycle MCP tools
// [SCOPE 123 / T015] MODIFIED-BY — test_gate_status delegates to utils/test-gate.ts; sign_off_test and complete_test_run re-attempt the scope stage advance
// [SCOPE 123 / T021] MODIFIED-BY — sign_off_test and complete_test_run check the item or run belongs to the caller's project
// [SCOPE 137 / T008] MODIFIED-BY — report_change_impact matching moved to matchHumanItems; dryRun previews the live human sign-offs a change would undo, writing nothing
// [SCOPE 140 / T003] MODIFIED-BY — start_test_run returns each item's subjects, risk tier and automation ref; itemIds declares only a nightly selection; dryRun lists without opening a run or cycle
//
// The runner-facing half of this scope. These map onto the same tables the HTTP
// routes use, so the two surfaces cannot report different things — the whole
// point of having one gate answer.
//
// Kept in its own module because server.ts is already ~4k lines; the switch in
// server.ts delegates here rather than growing seven more inline cases.
import { and, eq, desc, inArray, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import logger from '../utils/logger.js';
import type { ScopedDb } from '../db/scoped-query.js';
import { computeTestGate } from '../utils/test-gate.js'; // [SCOPE 123 / T015]
import { advanceAfterTestWrite } from '../utils/scope-stage.js'; // [SCOPE 123 / T015]
import {
  testplans,
  testplanitems,
  testitemsubjects,
  testcycles,
  testruns,
  testrunresults,
  testsignoffs,
  testretests,
} from '../db/schema.js';

export const TEST_LIFECYCLE_TOOLS = [
  'project.upsert_test_plan',
  'project.start_test_run',
  'project.report_test_progress',
  'project.complete_test_run',
  'project.sign_off_test',
  'project.report_change_impact',
  'project.test_gate_status',
] as const;

export type TestLifecycleTool = (typeof TEST_LIFECYCLE_TOOLS)[number];

export function isTestLifecycleTool(name: string): name is TestLifecycleTool {
  return (TEST_LIFECYCLE_TOOLS as readonly string[]).includes(name);
}

const uuidProp = { type: 'string', format: 'uuid' } as const;

/**
 * The advertised half of registration. A tool listed here but missing from
 * PERMISSION_MATRIX (auth/role-checker.ts) is reported as an unknown tool at
 * call time — both halves are required, which is what the parity test guards.
 */
export const TEST_LIFECYCLE_TOOL_DEFS = [
  {
    name: 'project.upsert_test_plan',
    description:
      "File or refresh a scope's test suite. Authors the machine set and the human set in ONE pass, each item declaring its executor (machine|human), its origin (ai|user) and the code subjects it exercises. Matching is on the immutable (plan, itemKey) pair, so re-running preserves accumulated results and signoffs, and never undoes an administrator's force override or re-hides an already-released human set.",
    inputSchema: {
      type: 'object',
      properties: {
        projectId: uuidProp,
        specId: uuidProp,
        source: { type: 'string', enum: ['ai', 'manual', 'imported'], default: 'ai' },
        items: {
          type: 'array',
          description: 'Test items. Machine items run in QA; human items are withheld until UAT promotion.',
          items: {
            type: 'object',
            properties: {
              itemKey: { type: 'string', description: 'Stable, immutable key e.g. TC-AUTH-001-N1' },
              title: { type: 'string' },
              executor: { type: 'string', enum: ['machine', 'human'], description: 'WHO RUNS IT. Independent of origin.' },
              origin: { type: 'string', enum: ['ai', 'user'], default: 'ai', description: 'Who authored it.' },
              gate: { type: 'string', enum: ['smoke', 'crud', 'ui-flow', 'unit'] },
              requirementId: { type: 'string' },
              specRef: { type: 'string' },
              fenceRef: { type: 'string' },
              layer: { type: 'string', enum: ['app', 'data'] },
              variant: { type: 'string' },
              priority: { type: 'string', enum: ['P1', 'P2', 'P3'] },
              riskTier: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
              testLevel: { type: 'string' },
              tier: { type: 'string' },
              automation: { type: 'string' },
              automationRef: { type: 'string' },
              detail: {
                type: 'object',
                description: 'preconditions, testData, steps (each with its own machine-checkable expected), flow, postconditions, exemptions.',
              },
              subjects: {
                type: 'array',
                description: 'The code this item exercises. A multi-screen flow declares one per screen — impact analysis walks from every one.',
                items: {
                  type: 'object',
                  properties: {
                    sourcePath: { type: 'string', description: 'Repository-relative, no line suffix.' },
                    sourceLine: { type: 'number' },
                    unitId: { type: 'string' },
                    role: { type: 'string', enum: ['primary', 'secondary'] },
                  },
                  required: ['sourcePath'],
                },
              },
            },
            required: ['itemKey', 'title', 'executor', 'gate', 'detail'],
          },
        },
      },
      required: ['projectId', 'specId', 'items'],
    },
  },
  {
    name: 'project.start_test_run',
    description:
      'Start a run and RETURN THE ORDERED LIST it will execute. Declare that list to the user before executing anything — it is what the project view shows while the run is in flight. Operates on machine items only. Opens the test cycle for `version` if it has not been seen.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: uuidProp,
        version: { type: 'string', description: 'Application version — identifies the test cycle.' },
        commitSha: { type: 'string' },
        specId: uuidProp,
        testPlanId: uuidProp,
        gate: { type: 'string', enum: ['smoke', 'crud', 'ui-flow', 'unit'] },
        isRegression: { type: 'boolean', default: false, description: 'True covers EVERY machine item in the project.' },
        itemIds: { type: 'array', items: uuidProp, description: 'Declare only these machine items (a nightly selection). Omit for every matching item.' },
        dryRun: { type: 'boolean', default: false, description: 'List the matching items with their subjects and risk tier; open no run and no cycle.' },
        runnerType: { type: 'string', enum: ['ai-agent', 'ci', 'manual'], default: 'ai-agent' },
        runnerRef: { type: 'string' },
        environment: { type: 'string', enum: ['local', 'ci', 'uat', 'production'], default: 'local' },
      },
      required: ['projectId', 'version'],
    },
  },
  {
    name: 'project.report_test_progress',
    description:
      'Report what is executing now and/or one item outcome. Send currentItemId as each item starts so watchers see the run progress; send itemId + status as each finishes.',
    inputSchema: {
      type: 'object',
      properties: {
        runId: uuidProp,
        currentItemId: uuidProp,
        itemId: uuidProp,
        status: { type: 'string', enum: ['pass', 'fail', 'skip', 'blocked', 'unresolved'] },
        bucket: { type: 'string', enum: ['TEST-BUG', 'CODE-BUG', 'NOT-IMPLEMENTED', 'SPEC-GAP', 'UNRESOLVED'] },
        evidence: { type: 'string' },
        durationMs: { type: 'number' },
      },
      required: ['runId'],
    },
  },
  {
    name: 'project.complete_test_run',
    description: 'Close the run. Always call this — an abandoned run reads as stalled, not finished.',
    inputSchema: {
      type: 'object',
      properties: {
        runId: uuidProp,
        status: { type: 'string', enum: ['completed', 'failed', 'cancelled'], default: 'completed' },
      },
      required: ['runId'],
    },
  },
  {
    name: 'project.sign_off_test',
    description:
      'Record the AI signoff for a machine item a run PROVED. Refused unless that run passed the item, and refused outright on a human item — only the person who performed it can sign that off.',
    inputSchema: {
      type: 'object',
      properties: {
        itemId: uuidProp,
        runId: uuidProp,
        label: { type: 'string', description: 'Identifies the producer, e.g. the model name.' },
        notes: { type: 'string' },
      },
      required: ['itemId', 'runId'],
    },
  },
  {
    name: 'project.report_change_impact',
    description:
      "Post the change-impact graph so human signoffs can be selectively withdrawn. Compute reachability yourself (you hold the code) and send changed files plus their TRANSITIVE dependents. Stamp it with the commit it was computed from — a mismatch against the cycle under test is refused. If the dependent set would be oversized, set broad:true rather than truncating: a truncated set that looks complete produces confidently wrong marking. Omitting the graph is refused; absence is not evidence that nothing was affected.",
    inputSchema: {
      type: 'object',
      properties: {
        projectId: uuidProp,
        version: { type: 'string' },
        dryRun: {
          type: 'boolean',
          default: false,
          description:
            'Ask without marking: returns wouldUndo, the reached human items carrying a live human sign-off, and writes nothing (no cycle opened, no retest marked, commit not compared). Use it to check a change before it lands.',
        },
        graph: {
          type: 'object',
          properties: {
            commitsha: { type: 'string', description: 'REQUIRED. The commit the graph was computed from.' },
            changedFiles: { type: 'array', items: { type: 'string' } },
            dependents: {
              type: 'array',
              description: 'Transitive dependents per changed file, with a representative path.',
              items: {
                type: 'object',
                properties: {
                  changedFile: { type: 'string' },
                  dependentPath: { type: 'string' },
                  path: { type: 'array', items: { type: 'string' } },
                },
                required: ['changedFile', 'dependentPath'],
              },
            },
            broad: { type: 'boolean', description: 'Set when the dependent set is too large to send. Marks every human item.' },
            broadReason: { type: 'string' },
          },
          required: ['commitsha', 'changedFiles'],
        },
      },
      required: ['projectId', 'version', 'graph'],
    },
  },
  {
    name: 'project.test_gate_status',
    description:
      "Whether forced tests clear the gate for the current cycle. 'ai' = the pre-UAT machine gate, 'user' = the User Testing gate over released human items, 'all' = the production gate over every forced item project-wide. This is the SAME verdict the application's phase views use, so the release commands and the interface cannot disagree.",
    inputSchema: {
      type: 'object',
      properties: {
        projectId: uuidProp,
        version: { type: 'string' },
        requirement: { type: 'string', enum: ['ai', 'user', 'all'], default: 'all' },
      },
      required: ['projectId', 'version'],
    },
  },
] as const;

/** Repository-relative, forward-slashed, no line suffix — must match the app side. */
function normalizePath(input: string): string {
  return input.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/:\d+(:\d+)?$/, '');
}

async function resolveCycle(
  scoped: ScopedDb,
  projectId: string,
  version: string,
  commitSha?: string | null,
): Promise<{ id: string; version: string; commitSha: string | null }> {
  const existing = (await scoped.raw
    .select()
    .from(testcycles)
    .where(and(eq(testcycles.projectId, projectId), eq(testcycles.version, version)))
    .limit(1)) as Array<{ id: string; version: string; commitSha: string | null }>;

  if (existing[0]) return existing[0];

  const inserted = (await scoped.raw
    .insert(testcycles)
    .values({ id: uuidv7(), projectId, version, status: 'open', commitSha: commitSha ?? null })
    .returning()) as Array<{ id: string; version: string; commitSha: string | null }>;

  logger.info('Test cycle opened', { projectId, version, cycleId: inserted[0].id });
  return inserted[0];
}

/**
 * SCOPE-123 T021 — the item or run a call names by id must belong to the caller's project. A
 * token-bound caller is held to the token's project; otherwise to the projectId it passed.
 */
function ownedByCaller(scoped: ScopedDb, args: Record<string, unknown>, ownerProjectId: string): boolean {
  const caller =
    scoped.scope.authMode === 'token'
      ? scoped.scope.projectId
      : typeof args.projectId === 'string'
        ? args.projectId
        : null;
  return caller === null || caller === ownerProjectId;
}

function ok(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }] };
}

/**
 * FR-050 — a closed cycle is retained in full AND read-only.
 *
 * Mirrors TestCycleService.assertWritable in the app package. It is duplicated
 * rather than shared because this package talks to the same database through its
 * own hand-maintained schema mirror and cannot import from `src/`. That
 * duplication is a known drift risk and is tracked as a finding; what is NOT
 * acceptable is guarding only one of the two write paths, because then the rule
 * is bypassable by choosing the other door.
 *
 *   superseded — a newer cycle exists, so any write here is stale: refuse all.
 *   production — refuse machine writes (runs execute before UAT); human
 *                signoffs stay allowed, since a tester finishing late is normal.
 */
async function assertCycleWritable(
  scoped: ScopedDb,
  cycleId: string,
  kind: 'machine' | 'human' | 'any' = 'any',
): Promise<string | null> {
  const rows = (await scoped.raw
    .select({ status: testcycles.status, version: testcycles.version })
    .from(testcycles)
    .where(eq(testcycles.id, cycleId))
    .limit(1)) as Array<{ status: string; version: string }>;

  const row = rows[0];
  if (!row) return `Test cycle ${cycleId} not found`;
  if (row.status === 'superseded') {
    return `Test cycle ${row.version} is superseded and read-only (FR-050). A newer cycle has opened, so this write is stale — re-run it against the current cycle.`;
  }
  if (row.status === 'production' && kind === 'machine') {
    return `Test cycle ${row.version} has been promoted to production and no longer accepts machine runs or signoffs (FR-050).`;
  }
  return null;
}

/**
 * FR-049b3 — changes with NO import edges, mirrored from the app package.
 *
 * Duplicated for the same reason as assertCycleWritable: this package cannot
 * import from `src/`. It MUST exist here, because this MCP tool is the path the
 * runner actually posts to — leaving it app-only would mean the requirement is
 * implemented where nothing calls it and absent where everything does.
 */
function classifyEdgelessPath(path: string): 'migration' | 'config' | 'env' | 'static' | 'dependency' | null {
  const p = path.toLowerCase();
  if (/(^|[/])src[/]db[/]migrations[/].*[.]sql$/.test(p) || /(^|[/])migrations[/].*[.]sql$/.test(p)) return 'migration';
  if (/(^|[/])[.]env([.]|$)/.test(p)) return 'env';
  if (/(^|[/])(package-lock[.]json|pnpm-lock[.]yaml|yarn[.]lock|package[.]json)$/.test(p)) return 'dependency';
  if (/[/](locales?|i18n)[/]/.test(p)) return 'static';
  if (/[.](json|ya?ml|toml|ini|conf)$/.test(p)) return 'config';
  if (/[.](css|scss|svg|png|jpe?g|webp|ico|woff2?|md|html)$/.test(p)) return 'static';
  return null;
}

const UNSCOPABLE_EDGELESS = new Set(['config', 'env', 'dependency']);

/** Does a declared subject cover this table? See the app-side twin for why. */
function subjectCoversTable(sourcePath: string, table: string): boolean {
  const t = table.toLowerCase();
  const file = sourcePath.toLowerCase();
  if (!file.includes('/schema/')) return false;
  const base = file.split('/').pop()?.replace(/[.][cm]?tsx?$/, '') ?? '';
  if (!base) return false;
  const singular = t.replace(/ies$/, 'y').replace(/s$/, '');
  return base === t || base === singular;
}

type ImpactGraph = {
  commitsha?: string;
  changedFiles?: string[];
  dependents?: Array<{ changedFile: string; dependentPath: string; path?: string[] }>;
  edgeless?: Array<{ path: string; kind: string; tables?: string[]; note?: string }>;
  broad?: boolean;
};

type ImpactMatch = {
  item: { id: string; itemKey: string };
  reason: string;
  subjectId: string | null;
  subjectPath: string | null;
  triggerPath: string | null;
  pathLength: number | null;
};

/**
 * Which human items a graph reaches, and why. Pure: report_change_impact marks
 * exactly these, and its dry run (SCOPE-137 FR-006) previews exactly these, so
 * the question "would this undo a sign-off?" and the marking cannot disagree.
 */
function matchHumanItems(
  humanItems: Array<{ id: string; itemKey: string }>,
  subjects: Array<{ id: string; itemId: string; sourcePath: string }>,
  graph: ImpactGraph,
): ImpactMatch[] {
  const reached = new Map<string, { changedFile: string; length: number }>();
  for (const file of graph.changedFiles ?? []) {
    reached.set(normalizePath(file), { changedFile: normalizePath(file), length: 0 });
  }
  for (const dep of graph.dependents ?? []) {
    const key = normalizePath(dep.dependentPath);
    if (!reached.has(key)) {
      reached.set(key, {
        changedFile: normalizePath(dep.changedFile),
        length: Math.max((dep.path?.length ?? 1) - 1, 0),
      });
    }
  }

  // ---- FR-049b3 -------------------------------------------------------
  const declaredEdgeless = new Map(
    (graph.edgeless ?? []).map((e) => [normalizePath(e.path), e]),
  );
  const unclassified = (graph.changedFiles ?? [])
    .map(normalizePath)
    .filter((f) => !declaredEdgeless.has(f) && classifyEdgelessPath(f) !== null);

  const changedTables: Array<{ table: string; path: string }> = [];
  let globalEdgeless: string | null = null;
  for (const [path, entry] of declaredEdgeless) {
    if (UNSCOPABLE_EDGELESS.has(entry.kind)) {
      globalEdgeless ??= path;
      continue;
    }
    if (entry.kind === 'migration') {
      if (!entry.tables?.length) {
        // Highest-consequence unknown in the scope: a migration whose tables
        // could not be read reaches every screen using the changed shape.
        globalEdgeless ??= path;
        continue;
      }
      for (const table of entry.tables) changedTables.push({ table, path });
    }
  }
  if (!globalEdgeless && unclassified.length) globalEdgeless = unclassified[0];
  const staticPaths = [...declaredEdgeless.entries()]
    .filter(([, e]) => e.kind === 'static')
    .map(([path]) => path);

  const matches: ImpactMatch[] = [];
  for (const item of humanItems) {
    const declared = subjects.filter((s) => s.itemId === item.id);

    let reason: string | null = null;
    let hit: { subject: (typeof declared)[number]; entry: { changedFile: string; length: number } } | null = null;

    if (graph.broad || globalEdgeless) {
      reason = 'broad';
    } else if (declared.length === 0) {
      // Cannot be shown unaffected — fails safe to a mark.
      reason = 'undetermined';
    } else {
      for (const subject of declared) {
        const entry = reached.get(subject.sourcePath);
        if (entry) {
          hit = { subject, entry };
          reason = 'impact';
          break;
        }
      }
      // FR-049b3 — a migration reaches an item through the TABLES it alters;
      // nothing imports a .sql file, so without this it marks nothing.
      if (!reason) {
        for (const ct of changedTables) {
          const subject = declared.find((sub) => subjectCoversTable(sub.sourcePath, ct.table));
          if (subject) {
            hit = { subject, entry: { changedFile: ct.path, length: 0 } };
            reason = 'impact';
            break;
          }
        }
      }
      // Content and styling can only change the rendered surface.
      if (!reason && staticPaths.length) {
        const subject = declared.find((sub) => sub.sourcePath.toLowerCase().startsWith('src/client/'));
        if (subject) {
          hit = { subject, entry: { changedFile: staticPaths[0], length: 0 } };
          reason = 'impact';
        }
      }
    }

    if (!reason) continue;
    matches.push({
      item,
      reason,
      subjectId: hit?.subject.id ?? null,
      subjectPath: hit?.subject.sourcePath ?? null,
      triggerPath: hit?.entry.changedFile ?? globalEdgeless ?? (graph.changedFiles ?? [])[0] ?? null,
      pathLength: hit?.entry.length ?? null,
    });
  }
  return matches;
}

export async function handleTestLifecycleTool(
  toolName: TestLifecycleTool,
  args: Record<string, unknown>,
  scoped: ScopedDb,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  switch (toolName) {
    // -----------------------------------------------------------------------
    case 'project.upsert_test_plan': {
      const projectId = String(args.projectId);
      const specId = String(args.specId);
      const items = (args.items ?? []) as Array<Record<string, unknown>>;

      const existingPlan = (await scoped.raw
        .select()
        .from(testplans)
        .where(eq(testplans.specId, specId))
        .limit(1)) as Array<{ id: string }>;

      const plan =
        existingPlan[0] ??
        (
          (await scoped.raw
            .insert(testplans)
            .values({
              specId,
              projectId,
              source: String(args.source ?? 'ai'),
              generatedAt: new Date(),
              status: 'active',
            })
            .returning()) as Array<{ id: string }>
        )[0];

      let created = 0;
      let updated = 0;

      for (const item of items) {
        const itemKey = String(item.itemKey);
        const executor = String(item.executor);
        const prior = (await scoped.raw
          .select({ id: testplanitems.id })
          .from(testplanitems)
          .where(and(eq(testplanitems.testPlanId, plan.id), eq(testplanitems.itemKey, itemKey)))
          .limit(1)) as Array<{ id: string }>;

        const values = {
          testPlanId: plan.id,
          projectId,
          specId,
          itemKey,
          title: String(item.title),
          requirementId: (item.requirementId as string) ?? null,
          specRef: (item.specRef as string) ?? null,
          fenceRef: (item.fenceRef as string) ?? null,
          gate: String(item.gate ?? 'smoke'),
          layer: String(item.layer ?? 'app'),
          variant: String(item.variant ?? 'happy'),
          priority: String(item.priority ?? 'P2'),
          riskTier: String(item.riskTier ?? 'MEDIUM'),
          testLevel: String(item.testLevel ?? 'integration'),
          tier: String(item.tier ?? 'unit-mocked'),
          automation: String(item.automation ?? 'automatable'),
          automationRef: (item.automationRef as string) ?? null,
          executor,
          origin: String(item.origin ?? 'ai'),
          detail: item.detail ?? {},
          updatedAt: new Date(),
        };

        let itemId: string;
        if (prior[0]) {
          // Deliberately does NOT touch forceTest, released or lastResult* —
          // re-generation must never undo an admin override or re-hide a set
          // already released to testers.
          await scoped.raw
            .update(testplanitems)
            .set(values)
            .where(eq(testplanitems.id, prior[0].id));
          itemId = prior[0].id;
          updated += 1;
        } else {
          const inserted = (await scoped.raw
            .insert(testplanitems)
            .values({
              ...values,
              id: uuidv7(),
              // Machine items are runnable at once; the human set waits for the
              // release to be promoted to UAT.
              released: executor === 'machine',
            })
            .returning({ id: testplanitems.id })) as Array<{ id: string }>;
          itemId = inserted[0].id;
          created += 1;
        }

        const subjects = (item.subjects ?? []) as Array<Record<string, unknown>>;
        if (subjects.length) {
          await scoped.raw.delete(testitemsubjects).where(eq(testitemsubjects.itemId, itemId));
          for (const subject of subjects) {
            await scoped.raw.insert(testitemsubjects).values({
              id: uuidv7(),
              itemId,
              projectId,
              sourcePath: normalizePath(String(subject.sourcePath)),
              sourceLine: (subject.sourceLine as number) ?? null,
              unitId: (subject.unitId as string) ?? null,
              role: String(subject.role ?? 'primary'),
            });
          }
        }
      }

      const counted = (await scoped.raw
        .select({ total: sql<number>`count(*)::int` })
        .from(testplanitems)
        .where(eq(testplanitems.testPlanId, plan.id))) as Array<{ total: number }>;

      await scoped.raw
        .update(testplans)
        .set({ itemCount: counted[0]?.total ?? 0, updatedAt: new Date() })
        .where(eq(testplans.id, plan.id));

      logger.info('Test plan upserted', { specId, planId: plan.id, created, updated });
      return ok({ planId: plan.id, created, updated, total: counted[0]?.total ?? 0 });
    }

    // -----------------------------------------------------------------------
    case 'project.start_test_run': {
      const projectId = String(args.projectId);
      const version = String(args.version);
      const gate = (args.gate as string) ?? null;
      const isRegression = Boolean(args.isRegression);

      // A regression run covers EVERY machine item in the project, not only the
      // scopes the release touched (FR-051).
      const conds = [eq(testplanitems.projectId, projectId), eq(testplanitems.executor, 'machine')];
      if (!isRegression && args.specId) conds.push(eq(testplanitems.specId, String(args.specId)));
      if (gate && !isRegression) conds.push(eq(testplanitems.gate, gate));
      // [SCOPE 140 / T003] A nightly run declares only the items it selected.
      const itemIds = Array.isArray(args.itemIds) ? (args.itemIds as unknown[]).map(String) : null;
      if (itemIds?.length) conds.push(inArray(testplanitems.id, itemIds));

      const items = (await scoped.raw
        .select({
          id: testplanitems.id,
          itemKey: testplanitems.itemKey,
          title: testplanitems.title,
          requirementId: testplanitems.requirementId,
          gate: testplanitems.gate,
          riskTier: testplanitems.riskTier,
          priority: testplanitems.priority,
          automationRef: testplanitems.automationRef,
        })
        .from(testplanitems)
        .where(and(...conds))
        .orderBy(testplanitems.itemKey)) as Array<{
        id: string;
        itemKey: string;
        title: string;
        requirementId: string | null;
        gate: string;
        riskTier: string;
        priority: string;
        automationRef: string | null;
      }>;

      if (items.length === 0) {
        return ok({ blocked: true, reason: 'No machine test items match this run request.' });
      }

      // [SCOPE 140 / T003] The code each item exercises, so a nightly run can select by impact.
      const subjectRows = (await scoped.raw
        .select({ itemId: testitemsubjects.itemId, sourcePath: testitemsubjects.sourcePath })
        .from(testitemsubjects)
        .where(inArray(testitemsubjects.itemId, items.map((i) => i.id)))) as Array<{ itemId: string; sourcePath: string }>;
      const withSubjects = items.map((i) => ({ ...i, subjects: subjectRows.filter((s) => s.itemId === i.id).map((s) => ({ sourcePath: s.sourcePath })) }));

      // [SCOPE 140 / T003] dryRun: the list only. Nothing is written, no run or cycle is opened.
      if (args.dryRun === true) {
        return ok({ dryRun: true, total: withSubjects.length, items: withSubjects });
      }

      // The cycle is resolved (and opened if new) only for a real run, after the dry-run return.
      const cycle = await resolveCycle(scoped, projectId, version, args.commitSha as string);
      const closed = await assertCycleWritable(scoped, cycle.id, 'machine');
      if (closed) return ok({ blocked: true, reason: closed });

      const run = (await scoped.raw
        .insert(testruns)
        .values({
          id: uuidv7(),
          cycleId: cycle.id,
          projectId,
          testPlanId: (args.testPlanId as string) ?? null,
          specId: (args.specId as string) ?? null,
          runnerType: String(args.runnerType ?? 'ai-agent'),
          runnerRef: (args.runnerRef as string) ?? null,
          isRegression,
          gate,
          environment: String(args.environment ?? 'local'),
          status: 'running',
          totalItems: items.length,
          declaredItemIds: items.map((i) => i.id),
        })
        .returning()) as Array<{ id: string }>;

      // The ordered list is returned AT START — this is what the runner narrates
      // and what the project view shows before anything has executed (FR-010).
      return ok({
        runId: run[0].id,
        cycleId: cycle.id,
        version: cycle.version,
        total: items.length,
        items: withSubjects,
      });
    }

    // -----------------------------------------------------------------------
    case 'project.report_test_progress': {
      const runId = String(args.runId);

      const runRows = (await scoped.raw
        .select({ id: testruns.id, cycleId: testruns.cycleId })
        .from(testruns)
        .where(eq(testruns.id, runId))
        .limit(1)) as Array<{ id: string; cycleId: string }>;
      if (!runRows[0]) return ok({ blocked: true, reason: `Run ${runId} not found` });

      // FR-050 — cycle read from the RUN, not the caller: a delayed callback
      // carries a runid, and this is the path a stale result would arrive by.
      const progressClosed = await assertCycleWritable(scoped, runRows[0].cycleId, 'machine');
      if (progressClosed) return ok({ blocked: true, reason: progressClosed });

      // Heartbeat + current item. Sent on its own while an item is in flight.
      await scoped.raw
        .update(testruns)
        .set({
          lastHeartbeatAt: new Date(),
          updatedAt: new Date(),
          ...(args.currentItemId !== undefined
            ? { currentItemId: (args.currentItemId as string) ?? null }
            : {}),
        })
        .where(eq(testruns.id, runId));

      if (args.itemId && args.status) {
        await scoped.raw.insert(testrunresults).values({
          id: uuidv7(),
          runId,
          itemId: String(args.itemId),
          cycleId: runRows[0].cycleId,
          status: String(args.status),
          bucket: (args.bucket as string) ?? null,
          evidence: (args.evidence as string) ?? null,
          durationMs: (args.durationMs as number) ?? null,
          endedAt: new Date(),
        });

        await scoped.raw
          .update(testplanitems)
          .set({
            lastResultStatus: String(args.status),
            lastResultAt: new Date(),
            lastRunId: runId,
            updatedAt: new Date(),
          })
          .where(eq(testplanitems.id, String(args.itemId)));

        // A failing result withdraws whatever signoff was standing (FR-021a).
        if (args.status === 'fail') {
          await scoped.raw
            .update(testsignoffs)
            .set({ superseded: true, supersededAt: new Date(), updatedAt: new Date() })
            .where(
              and(
                eq(testsignoffs.itemId, String(args.itemId)),
                eq(testsignoffs.superseded, false),
              ),
            );
        }

        // Totals recomputed rather than incremented — a repeated or dropped
        // event cannot drift the counters away from the truth.
        const tallies = (await scoped.raw
          .select({ status: testrunresults.status, n: sql<number>`count(*)::int` })
          .from(testrunresults)
          .where(eq(testrunresults.runId, runId))
          .groupBy(testrunresults.status)) as Array<{ status: string; n: number }>;
        const by = (s: string) => tallies.find((t) => t.status === s)?.n ?? 0;

        await scoped.raw
          .update(testruns)
          .set({
            passedItems: by('pass'),
            failedItems: by('fail'),
            skippedItems: by('skip'),
            blockedItems: by('blocked') + by('unresolved'),
            updatedAt: new Date(),
          })
          .where(eq(testruns.id, runId));
      }

      return ok({ ok: true });
    }

    // -----------------------------------------------------------------------
    case 'project.complete_test_run': {
      const runId = String(args.runId);
      const completeRows = (await scoped.raw
        .select({ cycleId: testruns.cycleId, projectId: testruns.projectId })
        .from(testruns)
        .where(eq(testruns.id, runId))
        .limit(1)) as Array<{ cycleId: string; projectId: string }>;
      if (!completeRows[0]) return ok({ blocked: true, reason: `Run ${runId} not found` });
      // [SCOPE 123 / T021] A run in another project reads as not found (and now that closing a run
      // advances its scopes, a foreign run must never get that far).
      if (!ownedByCaller(scoped, args, completeRows[0].projectId)) {
        return ok({ blocked: true, reason: `Run ${runId} not found` });
      }
      const completeClosed = await assertCycleWritable(scoped, completeRows[0].cycleId, 'machine');
      if (completeClosed) return ok({ blocked: true, reason: completeClosed });

      await scoped.raw
        .update(testruns)
        .set({
          status: String(args.status ?? 'completed'),
          endedAt: new Date(),
          currentItemId: null,
          lastHeartbeatAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(testruns.id, runId));
      logger.info('Test run closed', { runId });

      // [SCOPE 123 / T015] A finished run settles its items' results; re-attempt the advance of
      // every scope it touched, so a scope moves once its last gate clears (FR-010).
      const ranItems = (await scoped.raw
        .selectDistinct({ itemId: testrunresults.itemId })
        .from(testrunresults)
        .where(eq(testrunresults.runId, runId))) as Array<{ itemId: string }>;
      await advanceAfterTestWrite(
        ranItems.map((r) => r.itemId),
        { actor: scoped.scope.userId ?? 'test-runner', trigger: 'test_run_completed' },
      );
      return ok({ ok: true, runId });
    }

    // -----------------------------------------------------------------------
    case 'project.sign_off_test': {
      const itemId = String(args.itemId);
      const runId = String(args.runId);

      const itemRows = (await scoped.raw
        .select({
          id: testplanitems.id,
          itemKey: testplanitems.itemKey,
          executor: testplanitems.executor,
          projectId: testplanitems.projectId,
        })
        .from(testplanitems)
        .where(eq(testplanitems.id, itemId))
        .limit(1)) as Array<{ id: string; itemKey: string; executor: string; projectId: string }>;
      const item = itemRows[0];
      // [SCOPE 123 / T021] An item in another project reads as not found: signing it would also
      // advance that project's scope and release its human tests.
      if (!item || !ownedByCaller(scoped, args, item.projectId)) {
        return ok({ blocked: true, reason: `Test item ${itemId} not found` });
      }

      // A run can never sign off a human test. The database enforces this too;
      // refusing here gives the runner a usable message instead of a constraint
      // violation.
      if (item.executor !== 'machine') {
        return ok({
          blocked: true,
          reason: `${item.itemKey} is a human test — only the person who performed it can sign it off.`,
        });
      }

      const resultRows = (await scoped.raw
        .select({ status: testrunresults.status })
        .from(testrunresults)
        .where(and(eq(testrunresults.runId, runId), eq(testrunresults.itemId, itemId)))
        .orderBy(desc(testrunresults.createdAt))
        .limit(1)) as Array<{ status: string }>;

      // A signoff is a claim about evidence. Without a passing result the QA
      // gate would be self-certifying.
      if (resultRows[0]?.status !== 'pass') {
        return ok({
          blocked: true,
          reason: `${item.itemKey} did not pass in run ${runId} (${resultRows[0]?.status ?? 'no result'}) — refusing to sign it off.`,
        });
      }

      const runRows = (await scoped.raw
        .select({ cycleId: testruns.cycleId })
        .from(testruns)
        .where(eq(testruns.id, runId))
        .limit(1)) as Array<{ cycleId: string }>;
      const cycleId = runRows[0]?.cycleId;
      if (!cycleId) return ok({ blocked: true, reason: `Run ${runId} not found` });
      const signoffClosed = await assertCycleWritable(scoped, cycleId, 'machine');
      if (signoffClosed) return ok({ blocked: true, reason: signoffClosed });

      await scoped.raw
        .delete(testsignoffs)
        .where(
          and(
            eq(testsignoffs.itemId, itemId),
            eq(testsignoffs.cycleId, cycleId),
            eq(testsignoffs.signoffType, 'ai'),
          ),
        );

      await scoped.raw.insert(testsignoffs).values({
        id: uuidv7(),
        cycleId,
        itemId,
        itemExecutor: 'machine',
        signoffType: 'ai',
        status: 'passed',
        runId,
        signedByLabel: String(args.label ?? 'ai-runner'),
        notes: (args.notes as string) ?? null,
      });

      // [SCOPE 123 / T015] A signoff can clear a scope's machine gate: re-attempt its advance.
      await advanceAfterTestWrite([itemId], { actor: scoped.scope.userId ?? 'ai-runner', trigger: 'test_signoff' });

      return ok({ ok: true, itemKey: item.itemKey });
    }

    // -----------------------------------------------------------------------
    case 'project.report_change_impact': {
      const projectId = String(args.projectId);
      const version = String(args.version);
      const dryRun = args.dryRun === true;
      const graph = args.graph as ImpactGraph | undefined;

      // Silence and "nothing was affected" must never be the same answer.
      if (!graph) {
        return ok({
          blocked: true,
          reason: 'No graph supplied. Refusing — an absent graph is not evidence that nothing was affected.',
        });
      }
      if (!graph.broad && !graph.dependents && !graph.edgeless?.length) {
        return ok({
          blocked: true,
          reason: 'Graph declares neither a dependent set nor a broad analysis. Refusing rather than assuming no impact.',
        });
      }

      const humanItemsFor = async () =>
        (await scoped.raw
          .select({ id: testplanitems.id, itemKey: testplanitems.itemKey, title: testplanitems.title })
          .from(testplanitems)
          .where(
            and(eq(testplanitems.projectId, projectId), eq(testplanitems.executor, 'human')),
          )) as Array<{ id: string; itemKey: string; title: string }>;
      const subjectsFor = async (ids: string[]) =>
        (await scoped.raw
          .select()
          .from(testitemsubjects)
          .where(inArray(testitemsubjects.itemId, ids))) as Array<{ id: string; itemId: string; sourcePath: string }>;

      // [SCOPE 137 / T008] Dry run: which LIVE human sign-offs would this change undo? The same
      // matching as a real call, read-only — no cycle is opened, no retest is marked. Needs no
      // commit match: it is asked before the change is committed.
      if (dryRun) {
        const items = await humanItemsFor();
        if (items.length === 0) return ok({ dryRun: true, wouldUndo: [], matched: 0 });
        const matches = matchHumanItems(items, await subjectsFor(items.map((i) => i.id)), graph);
        const matchedIds = matches.map((m) => m.item.id);
        const live = matchedIds.length
          ? ((await scoped.raw
              .select({ itemId: testsignoffs.itemId, signedByLabel: testsignoffs.signedByLabel, signedAt: testsignoffs.signedAt, signedAgainstVersion: testsignoffs.signedAgainstVersion })
              .from(testsignoffs)
              .where(
                and(
                  inArray(testsignoffs.itemId, matchedIds),
                  eq(testsignoffs.itemExecutor, 'human'),
                  eq(testsignoffs.status, 'passed'),
                  eq(testsignoffs.superseded, false),
                ),
              )) as Array<{ itemId: string; signedByLabel: string | null; signedAt: Date; signedAgainstVersion: string | null }>)
          : [];
        const titleOf = new Map(items.map((i) => [i.id, i.title]));
        const wouldUndo = matches
          .filter((m) => live.some((s) => s.itemId === m.item.id))
          .map((m) => {
            const s = live.find((x) => x.itemId === m.item.id);
            return {
              itemId: m.item.id,
              itemKey: m.item.itemKey,
              title: titleOf.get(m.item.id) ?? m.item.itemKey,
              reason: m.reason,
              chain: m.subjectPath ? `${m.triggerPath} → ${m.subjectPath}` : null,
              signedBy: s?.signedByLabel ?? null,
              signedAt: s?.signedAt ?? null,
              signedAgainstVersion: s?.signedAgainstVersion ?? null,
            };
          });
        return ok({ dryRun: true, wouldUndo, matched: matches.length });
      }

      if (!graph.commitsha) {
        return ok({ blocked: true, reason: 'Graph carries no commit. Refusing.' });
      }

      const cycle = await resolveCycle(scoped, projectId, version, graph.commitsha);
      if (cycle.commitSha && cycle.commitSha !== graph.commitsha) {
        return ok({
          blocked: true,
          reason: `Graph was computed against ${graph.commitsha} but the cycle under test is ${cycle.commitSha}. Refusing.`,
        });
      }

      // FR-050 — marks may not be applied to a closed cycle.
      const impactClosed = await assertCycleWritable(scoped, cycle.id, 'machine');
      if (impactClosed) return ok({ blocked: true, reason: impactClosed });

      const humanItems = await humanItemsFor();

      if (humanItems.length === 0) {
        return ok({ cycleId: cycle.id, marked: 0, survived: 0, broad: Boolean(graph.broad) });
      }

      const subjects = await subjectsFor(humanItems.map((i) => i.id));

      let marked = 0;
      for (const m of matchHumanItems(humanItems, subjects, graph)) {
        const existing = (await scoped.raw
          .select({ id: testretests.id })
          .from(testretests)
          .where(and(eq(testretests.cycleId, cycle.id), eq(testretests.itemId, m.item.id)))
          .limit(1)) as Array<{ id: string }>;
        if (existing[0]) {
          marked += 1;
          continue;
        }

        await scoped.raw.insert(testretests).values({
          id: uuidv7(),
          cycleId: cycle.id,
          itemId: m.item.id,
          reason: m.reason,
          triggerPath: m.triggerPath,
          reachedSubjectId: m.subjectId,
          chain: m.subjectPath ? `${m.triggerPath} → ${m.subjectPath}` : null,
          pathLength: m.pathLength,
        });
        marked += 1;
      }

      logger.info('Change impact applied', { projectId, cycleId: cycle.id, marked });
      return ok({
        cycleId: cycle.id,
        version: cycle.version,
        broad: Boolean(graph.broad) || marked / humanItems.length >= 0.5,
        marked,
        survived: humanItems.length - marked,
      });
    }

    // -----------------------------------------------------------------------
    case 'project.test_gate_status': {
      const projectId = String(args.projectId);
      const version = String(args.version);
      const requirement = String(args.requirement ?? 'all') as 'ai' | 'user' | 'all';
      const cycle = await resolveCycle(scoped, projectId, version);

      // [SCOPE 123 / T015] The computation lives in utils/test-gate.ts, shared with the per-scope
      // stage advance, so the tool and the advance cannot answer differently. Output unchanged.
      const gate = await computeTestGate(scoped.raw, { projectId, cycleId: cycle.id, requirement });

      return ok({
        passed: gate.passed,
        requirement,
        version: cycle.version,
        cycleId: cycle.id,
        blocking: gate.blocking,
        forcedTotal: gate.forcedTotal,
      });
    }
  }
}
// [SCOPE 111 / T027] END
