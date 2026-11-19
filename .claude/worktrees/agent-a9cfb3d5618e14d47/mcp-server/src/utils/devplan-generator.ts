// Deterministic Development-Plan doctype generator (SCOPE-081). Sibling of
// scopeflow-generator.ts: reads the project's specs + tasks + scope-dependency
// graph and renders the foundation-up build roadmap (status-at-a-glance table,
// phase-grouped Mermaid dependency map, critical path) into a DB-only `devplan`
// projectdocuments row. Deterministic, no AI — the judgment narrative + PDF live
// in the dev-plan skill. Phase grouping is longest-path layering over the
// dependsOn graph; an edge A->B in the rendered map means "build A before B".
import { eq, and, ne, isNull } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { projectdocuments, projectspecifications, projecttasks } from '../db/schema.js';
import { buildScopeGraph } from './scopeflow-generator.js';
import type { ScopeGraph, StoredRef } from './scopeflow-generator.js';
import type { Namespace, EdgeKind } from './scope-edges.js';
import { scopedependencies } from '../db/schema.js';
import logger from './logger.js';
import { stampMarkdown } from '@wxkanban/watermark';
import { WXKANBAN_VERSION } from '../version.js';

export interface SpecProgress {
  num: number;
  title: string;
  status: string;
  taskTotal: number;
  taskDone: number;
}
export type DevplanState = 'done' | 'partial' | 'todo';

const DONE_TASK = new Set(['done', 'complete', 'completed', 'closed']);
const DONE_SPEC = new Set(['released', 'done', 'complete', 'completed']);
const STATE_EMOJI: Record<DevplanState, string> = { done: '🟢', partial: '🟡', todo: '🔴' };
const pad = (n: number): string => String(n).padStart(3, '0');
const trim = (s: string, n = 40): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s).replace(/["()/&·]/g, "'");

/** State marker for a spec: task-count wins, then spec status, else not-started. */
// [SCOPE 081 / T001] BEGIN — devplan-generator module (MCP server)
export function specState(s: SpecProgress): DevplanState {
  if (s.taskTotal > 0) {
    if (s.taskDone >= s.taskTotal) return 'done';
    if (s.taskDone > 0) return 'partial';
  }
  if (DONE_SPEC.has(s.status.toLowerCase())) return 'done';
  return 'todo';
}
// [SCOPE 081 / T001] END

/** Task-completion percentage (0 when a spec has no tasks). */
// [SCOPE 081 / T001] BEGIN — devplan-generator module (MCP server)
export function specPct(s: SpecProgress): number {
  return s.taskTotal > 0 ? Math.round((100 * s.taskDone) / s.taskTotal) : 0;
}
// [SCOPE 081 / T001] END

/**
 * Foundation-up phase index per scope via longest-path layering over dependsOn
 * edges. A node with no prerequisites is layer 0; otherwise its layer is one more
 * than the deepest prerequisite. Cycle-safe (a gray node contributes 0).
 */
// [SCOPE 081 / T001] BEGIN — devplan-generator module (MCP server)
export function layerNodes(graph: ScopeGraph): Map<number, number> {
  const prereqs = new Map<number, number[]>(); // node -> the scopes it depends on
  for (const n of graph.nodes) prereqs.set(n.num, []);
  for (const e of graph.edges) if (e.kind === 'dependsOn') prereqs.get(e.from)?.push(e.to);
  const layer = new Map<number, number>();
  const gray = new Set<number>();
  const visit = (n: number): number => {
    if (layer.has(n)) return layer.get(n)!;
    if (gray.has(n)) return 0; // cycle guard
    gray.add(n);
    let best = 0;
    for (const p of prereqs.get(n) ?? []) best = Math.max(best, visit(p) + 1);
    gray.delete(n);
    layer.set(n, best);
    return best;
  };
  for (const n of graph.nodes) visit(n.num);
  return layer;
}
// [SCOPE 081 / T001] END

/** The scopes that unblock the most others (most reverse-reachable dependents), top N. */
// [SCOPE 081 / T001] BEGIN — devplan-generator module (MCP server)
export function criticalPath(graph: ScopeGraph, topN = 4): number[] {
  const dependents = new Map<number, number[]>(); // prereq -> direct dependents
  for (const n of graph.nodes) dependents.set(n.num, []);
  for (const e of graph.edges) if (e.kind === 'dependsOn') dependents.get(e.to)?.push(e.from);
  const reach = (start: number): number => {
    const seen = new Set<number>();
    const stack = [...(dependents.get(start) ?? [])];
    while (stack.length) {
      const cur = stack.pop()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const d of dependents.get(cur) ?? []) stack.push(d);
    }
    return seen.size;
  };
  return [...graph.nodes]
    .map((n) => ({ num: n.num, unblocks: reach(n.num) }))
    .filter((x) => x.unblocks > 0)
    .sort((a, b) => b.unblocks - a.unblocks || a.num - b.num)
    .slice(0, topN)
    .map((x) => x.num);
}
// [SCOPE 081 / T001] END

/** Render the deterministic Development-Plan markdown. No AI; stable output. */
// [SCOPE 081 / T001] BEGIN — devplan-generator module (MCP server)
export function generateDevplanMarkdown(specs: SpecProgress[], graph: ScopeGraph): string {
  const byNum = new Map(specs.map((s) => [s.num, s]));
  const layer = layerNodes(graph);
  const maxLayer = Math.max(0, ...[...layer.values()]);
  const lines: string[] = [];
  lines.push('# Development Plan', '');
  lines.push('> Deterministic build roadmap (auto-generated). The judgment narrative — START HERE,');
  lines.push('> exit gates, what-remains — and the PDF come from the `dev-plan` skill on demand.', '');

  // Status at a glance, grouped foundation-up.
  lines.push('## Status at a glance', '');
  lines.push('Legend: 🟢 built · 🟡 partial · 🔴 not started.', '');
  for (let L = 0; L <= maxLayer; L++) {
    const inLayer = graph.nodes.filter((n) => (layer.get(n.num) ?? 0) === L);
    if (inLayer.length === 0) continue;
    lines.push(`### Phase ${L}`, '');
    lines.push('| Spec | Title | State | Tasks |', '|------|-------|-------|-------|');
    for (const n of inLayer) {
      const s = byNum.get(n.num);
      const st = s ? specState(s) : 'todo';
      const pct = s ? specPct(s) : 0;
      lines.push(`| SCOPE-${pad(n.num)} | ${trim(n.title, 60)} | ${STATE_EMOJI[st]} | ${s ? `${s.taskDone}/${s.taskTotal} (${pct}%)` : '—'} |`);
    }
    lines.push('');
  }

  // Dependency map — phase subgraphs, status-colored nodes. A->B = build A first.
  lines.push('## Dependency map', '');
  lines.push('How to read: an arrow `A --> B` means **B depends on A** — build A first.', '');
  lines.push('```mermaid', 'flowchart TD');
  lines.push('  classDef done fill:#2ecc71,stroke:#1e8449,color:#0b3d20');
  lines.push('  classDef partial fill:#f1c40f,stroke:#b7950b,color:#3a2f00');
  lines.push('  classDef todo fill:#e74c3c,stroke:#922b21,color:#fff');
  for (let L = 0; L <= maxLayer; L++) {
    const inLayer = graph.nodes.filter((n) => (layer.get(n.num) ?? 0) === L);
    if (inLayer.length === 0) continue;
    lines.push(`  subgraph P${L}[Phase ${L}]`);
    for (const n of inLayer) {
      const s = byNum.get(n.num);
      const st = s ? specState(s) : 'todo';
      lines.push(`    S${pad(n.num)}["SCOPE-${pad(n.num)} ${trim(n.title)}"]:::${st}`);
    }
    lines.push('  end');
  }
  // Edge to->from so the prerequisite points at its dependent (foundation-up).
  for (const e of graph.edges) if (e.kind === 'dependsOn') lines.push(`  S${pad(e.to)} --> S${pad(e.from)}`);
  lines.push('```', '');

  // Critical path.
  const cp = criticalPath(graph);
  lines.push('**Critical path — the scopes that unblock the most:**', '');
  if (cp.length === 0) {
    lines.push('_No dependency edges recorded yet — capture scope dependencies to populate this._');
  } else {
    for (const num of cp) lines.push(`- SCOPE-${pad(num)} — ${trim(byNum.get(num)?.title ?? '', 60)}`);
  }
  lines.push('');
  return lines.join('\n');
}
// [SCOPE 081 / T001] END

// ── DB wrappers (mirror scopeflow-generator) ────────────────────────────────

// [SCOPE 081 / T001] BEGIN — devplan-generator module (MCP server)
async function loadSpecProgress(projectId: string): Promise<SpecProgress[]> {
  const specs = await db
    .select({ id: projectspecifications.id, specNumber: projectspecifications.specNumber, title: projectspecifications.title, status: projectspecifications.status })
    .from(projectspecifications)
    // [SCOPE 103 / T004] archived scopes are hidden from the dev plan
    .where(and(eq(projectspecifications.projectId, projectId), ne(projectspecifications.status, 'archived')));
  const tasks = await db
    .select({ specId: projecttasks.specId, status: projecttasks.status })
    .from(projecttasks)
    .where(eq(projecttasks.projectId, projectId));
  const totals = new Map<string, { total: number; done: number }>();
  for (const t of tasks) {
    if (!t.specId) continue;
    const cur = totals.get(t.specId) ?? { total: 0, done: 0 };
    cur.total += 1;
    if (DONE_TASK.has((t.status ?? '').toLowerCase())) cur.done += 1;
    totals.set(t.specId, cur);
  }
  const out: SpecProgress[] = [];
  for (const s of specs) {
    const n = parseInt(s.specNumber, 10);
    if (Number.isNaN(n)) continue;
    const c = totals.get(s.id) ?? { total: 0, done: 0 };
    out.push({ num: n, title: s.title, status: s.status, taskTotal: c.total, taskDone: c.done });
  }
  return out.sort((a, b) => a.num - b.num);
}
// [SCOPE 081 / T001] END

// [SCOPE 081 / T001] BEGIN — devplan-generator module (MCP server)
// Exported so cockpit_summary can reuse the scope-dependency refs to order the
// Cockpit scope list + Development Plan panel in foundation-up (build) order.
export async function loadStoredRefs(projectId: string): Promise<StoredRef[]> {
  const rows = await db.select().from(scopedependencies).where(eq(scopedependencies.projectid, projectId));
  return rows.map((r) => ({
    sourcescope: r.sourcescope,
    targetnumber: r.targetnumber,
    targetnamespace: r.targetnamespace as Namespace,
    kind: r.kind as EdgeKind,
  }));
}
// [SCOPE 081 / T001] END

/**
 * Upsert the per-project `devplan` projectdocuments row (DB-only, no AI).
 * Fail-open: callers wrap this so a failure never blocks the triggering op.
 */
// [SCOPE 081 / T001] BEGIN — devplan-generator module (MCP server)
// [SCOPE 082 / T005] MODIFIED-BY — stamp devplan markdown with wxKanban watermark
export async function regenerateDevplan(projectId: string): Promise<void> {
  const [specs, refs] = await Promise.all([loadSpecProgress(projectId), loadStoredRefs(projectId)]);
  const known = new Map(specs.map((s) => [s.num, s.title]));
  const graph = buildScopeGraph(refs, known);
  const content = stampMarkdown(generateDevplanMarkdown(specs, graph), {
    kind: 'generated',
    version: WXKANBAN_VERSION,
    generator: 'devplan',
  });

  const [existing] = await db
    .select({ id: projectdocuments.id })
    .from(projectdocuments)
    .where(and(eq(projectdocuments.projectId, projectId), eq(projectdocuments.doctype, 'devplan'), isNull(projectdocuments.specId)))
    .limit(1);

  if (existing) {
    await db.update(projectdocuments).set({ content, updatedAt: new Date() }).where(eq(projectdocuments.id, existing.id));
  } else {
    await db.insert(projectdocuments).values({
      projectId,
      doctype: 'devplan',
      title: 'Development Plan',
      content,
      filepath: 'specs/DEVELOPMENT-PLAN.md',
      isGenerated: true,
    });
  }
  logger.info('devplan.regenerated', { projectId, specs: specs.length, edges: graph.edges.length });
}
// [SCOPE 081 / T001] END
