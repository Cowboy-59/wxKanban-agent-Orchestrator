// [SCOPE 073 / T004] BEGIN — scope-flow generator + deterministic graph-health.
// Sibling of lifecycle-generator.ts. Reads scopedependencies + the known scope set, resolves
// each stored ref against the namespace, builds the dependency graph + deterministic clusters,
// runs warn-only graph-health, renders a Mermaid `scopeflow` doc, and upserts it (DB-only, no AI).
import { eq, and, ne, isNull } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { projectdocuments, projectspecifications, scopedependencies } from '../db/schema.js';
import type { Namespace, EdgeKind } from './scope-edges.js';
import { harvestRefs } from './scope-edges.js';
import logger from './logger.js';

export interface StoredRef {
  sourcescope: number;
  targetnumber: number;
  targetnamespace: Namespace;
  kind: EdgeKind;
}

export interface ScopeNode {
  num: number;
  title: string;
}
export interface ScopeEdge {
  from: number;
  to: number;
  kind: EdgeKind;
}
export interface ScopeWarning {
  id: string; // stable, category-prefixed
  category: 'cycle' | 'missing' | 'collision' | 'nonreciprocal' | 'forward';
  message: string;
}
export interface ScopeGraph {
  nodes: ScopeNode[];
  edges: ScopeEdge[];
  externals: number[]; // SPEC-NNN impl-spec refs (no scope node)
  clusters: number[][]; // connected components (scope numbers), deterministic
}

// ── pure core (testable, no I/O) ───────────────────────────────────────────

/** Build the scope graph from stored refs + the known scope set (number -> title). */
export function buildScopeGraph(refs: StoredRef[], known: Map<number, string>): ScopeGraph {
  const edgeKey = new Map<string, ScopeEdge>(); // dedupe; dependsOn wins over related
  const externals = new Set<number>();
  for (const r of refs) {
    if (r.sourcescope === r.targetnumber && (r.targetnamespace === 'scope' || r.targetnamespace === 'bare')) continue;
    const exists = known.has(r.targetnumber);
    const isEdge =
      r.targetnamespace === 'scope' ? exists
      : r.targetnamespace === 'specword' ? exists
      : r.targetnamespace === 'bare' ? exists
      : false; // spec -> external
    if (r.targetnamespace === 'spec') {
      externals.add(r.targetnumber);
    } else if (!exists && r.targetnamespace === 'specword') {
      externals.add(r.targetnumber);
    }
    if (isEdge) {
      const k = `${r.sourcescope}->${r.targetnumber}`;
      const prev = edgeKey.get(k);
      if (!prev || (prev.kind === 'related' && r.kind === 'dependsOn')) {
        edgeKey.set(k, { from: r.sourcescope, to: r.targetnumber, kind: r.kind });
      }
    }
  }
  const nodes: ScopeNode[] = [...known.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([num, title]) => ({ num, title }));
  const edges = [...edgeKey.values()].sort((a, b) => a.from - b.from || a.to - b.to);
  return { nodes, edges, externals: [...externals].sort((a, b) => a - b), clusters: clusterScopes(nodes, edges) };
}

/** Connected components over the undirected edge graph — deterministic ordering. */
export function clusterScopes(nodes: ScopeNode[], edges: ScopeEdge[]): number[][] {
  const adj = new Map<number, Set<number>>();
  for (const n of nodes) adj.set(n.num, new Set());
  for (const e of edges) {
    adj.get(e.from)?.add(e.to);
    adj.get(e.to)?.add(e.from);
  }
  const seen = new Set<number>();
  const components: number[][] = [];
  for (const n of [...nodes].sort((a, b) => a.num - b.num)) {
    if (seen.has(n.num)) continue;
    const comp: number[] = [];
    const stack = [n.num];
    seen.add(n.num);
    while (stack.length) {
      const cur = stack.pop()!;
      comp.push(cur);
      for (const nb of [...(adj.get(cur) ?? [])].sort((a, b) => a - b)) {
        if (!seen.has(nb)) {
          seen.add(nb);
          stack.push(nb);
        }
      }
    }
    components.push(comp.sort((a, b) => a - b));
  }
  return components.sort((a, b) => a[0] - b[0]);
}

const pad = (n: number) => String(n).padStart(3, '0');

/** Deterministic warn-only graph-health over the graph + raw refs. */
export function runScopeHealth(graph: ScopeGraph, refs: StoredRef[], known: Map<number, string>): ScopeWarning[] {
  const out: ScopeWarning[] = [];

  // 1. cycles over dependsOn edges (DFS)
  const dep = new Map<number, number[]>();
  for (const e of graph.edges) if (e.kind === 'dependsOn') (dep.get(e.from) ?? dep.set(e.from, []).get(e.from)!).push(e.to);
  const color = new Map<number, number>(); // 0=white,1=gray,2=black
  const cyclesSeen = new Set<string>();
  const stack: number[] = [];
  const dfs = (u: number) => {
    color.set(u, 1);
    stack.push(u);
    for (const v of (dep.get(u) ?? []).sort((a, b) => a - b)) {
      if (color.get(v) === 1) {
        const cyc = stack.slice(stack.indexOf(v)).sort((a, b) => a - b);
        const key = cyc.join('-');
        if (!cyclesSeen.has(key)) {
          cyclesSeen.add(key);
          out.push({ id: `CYCLE-${cyc.map(pad).join('-')}`, category: 'cycle', message: `Dependency cycle: ${cyc.map((n) => `SCOPE-${pad(n)}`).join(' ↔ ')}` });
        }
      } else if (!color.get(v)) {
        dfs(v);
      }
    }
    stack.pop();
    color.set(u, 2);
  };
  for (const n of graph.nodes) if (!color.get(n.num)) dfs(n.num);

  // 2. missing/not-yet-built: explicit SCOPE-NNN (or specword/bare) dependsOn ref to an unknown scope
  for (const r of refs) {
    if (r.kind !== 'dependsOn') continue;
    if (r.targetnamespace === 'spec') continue; // external impl-spec, not a missing scope
    if (!known.has(r.targetnumber) && r.targetnamespace !== 'bare') {
      out.push({ id: `MISSING-${pad(r.sourcescope)}-${pad(r.targetnumber)}`, category: 'missing', message: `SCOPE-${pad(r.sourcescope)} depends on missing/not-yet-built SCOPE-${pad(r.targetnumber)}` });
    }
  }

  // 3. namespace collision: a SPEC-NNN ref whose number also exists as a known scope
  for (const r of refs) {
    if (r.targetnamespace === 'spec' && known.has(r.targetnumber)) {
      out.push({ id: `COLLIDE-${pad(r.sourcescope)}-${pad(r.targetnumber)}`, category: 'collision', message: `SCOPE-${pad(r.sourcescope)} cites SPEC-${pad(r.targetnumber)}, but SCOPE-${pad(r.targetnumber)} also exists (SCOPE/SPEC namespace collision)` });
    }
  }

  // 4. non-reciprocal related
  const relatedSet = new Set(graph.edges.filter((e) => e.kind === 'related').map((e) => `${e.from}->${e.to}`));
  for (const e of graph.edges) {
    if (e.kind === 'related' && !relatedSet.has(`${e.to}->${e.from}`)) {
      out.push({ id: `NONRECIP-${pad(e.from)}-${pad(e.to)}`, category: 'nonreciprocal', message: `SCOPE-${pad(e.from)} relates to SCOPE-${pad(e.to)}, but SCOPE-${pad(e.to)} does not relate back` });
    }
  }

  // dedupe by id, stable order
  const byId = new Map(out.map((w) => [w.id, w]));
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

const trim = (s: string, n = 40) => (s.length > n ? `${s.slice(0, n - 1)}…` : s).replace(/"/g, "'");

/** Render the scopeflow document (Mermaid graph + clusters + warnings). Deterministic. */
export function generateScopeFlowMarkdown(graph: ScopeGraph, warnings: ScopeWarning[]): string {
  const titleOf = new Map(graph.nodes.map((n) => [n.num, n.title]));
  const lines: string[] = ['# Scope Flow', '', '```mermaid', 'graph LR'];
  graph.clusters.forEach((comp, i) => {
    if (comp.length > 1) lines.push(`  subgraph C${i}[Cluster ${i + 1}]`);
    for (const num of comp) lines.push(`    S${pad(num)}["SCOPE-${pad(num)}<br/>${trim(titleOf.get(num) ?? '')}"]`);
    if (comp.length > 1) lines.push('  end');
  });
  if (graph.externals.length) {
    lines.push('  subgraph EXT[Impl-specs · no scope node]');
    for (const x of graph.externals) lines.push(`    X${pad(x)}["SPEC-${pad(x)}"]`);
    lines.push('  end');
  }
  lines.push('');
  for (const e of graph.edges) lines.push(`  S${pad(e.from)} ${e.kind === 'dependsOn' ? '-->' : '-.->'} S${pad(e.to)}`);
  lines.push('  %% solid = Depends On, dotted = Related Scopes');
  lines.push('```', '');
  lines.push('## Graph-health warnings', '');
  if (warnings.length === 0) {
    lines.push('_No structural warnings — the scope graph is clean._');
  } else {
    lines.push('> Non-blocking. Verdicts (severity/remediation) belong to `/analyzescope`.', '');
    for (const w of warnings) lines.push(`- **${w.category}** \`${w.id}\` — ${w.message}`);
  }
  lines.push('');
  return lines.join('\n');
}

// ── DB wrappers ─────────────────────────────────────────────────────────────

async function loadKnownScopes(projectId: string): Promise<Map<number, string>> {
  const rows = await db
    .select({ specNumber: projectspecifications.specNumber, title: projectspecifications.title })
    .from(projectspecifications)
    // [SCOPE 103 / T004] archived scopes are hidden from the scope-flow map
    .where(and(eq(projectspecifications.projectId, projectId), ne(projectspecifications.status, 'archived')));
  const map = new Map<number, string>();
  for (const r of rows) {
    const n = parseInt(r.specNumber, 10);
    if (!Number.isNaN(n)) map.set(n, r.title);
  }
  return map;
}

async function loadStoredRefs(projectId: string): Promise<StoredRef[]> {
  const rows = await db
    .select()
    .from(scopedependencies)
    .where(eq(scopedependencies.projectid, projectId));
  return rows.map((r) => ({
    sourcescope: r.sourcescope,
    targetnumber: r.targetnumber,
    targetnamespace: r.targetnamespace as Namespace,
    kind: r.kind as EdgeKind,
  }));
}

/** Upsert the per-project `scopeflow` projectdocuments row. Returns the warnings. */
export async function regenerateScopeFlow(projectId: string): Promise<ScopeWarning[]> {
  const [known, refs] = await Promise.all([loadKnownScopes(projectId), loadStoredRefs(projectId)]);
  const graph = buildScopeGraph(refs, known);
  const warnings = runScopeHealth(graph, refs, known);
  const content = generateScopeFlowMarkdown(graph, warnings);

  const [existing] = await db
    .select({ id: projectdocuments.id })
    .from(projectdocuments)
    .where(and(eq(projectdocuments.projectId, projectId), eq(projectdocuments.doctype, 'scopeflow'), isNull(projectdocuments.specId)))
    .limit(1);

  if (existing) {
    await db.update(projectdocuments).set({ content, updatedAt: new Date() }).where(eq(projectdocuments.id, existing.id));
  } else {
    await db.insert(projectdocuments).values({
      projectId,
      doctype: 'scopeflow',
      title: 'Scope Flow',
      content,
      filepath: 'specs/scopeflow.md',
      isGenerated: true,
    });
  }
  logger.info('scopeflow.regenerated', { projectId, edges: graph.edges.length, externals: graph.externals.length, warnings: warnings.length });
  return warnings;
}
// [SCOPE 073 / T004] END

// [SCOPE 073 / T007b] BEGIN — capture a scope's dependency edges (store only; caller regenerates).
// Shared by the set_scope_dependencies tool and the create_specs trigger so the harvest+replace
// logic lives in one place. Replace-by-source: a scope's edges are fully rewritten each call.
export async function captureScopeEdges(
  projectId: string,
  scopeNumber: number,
  dependsOnRaw: string,
  relatedRaw: string,
): Promise<number> {
  const rows: Array<typeof scopedependencies.$inferInsert> = [];
  for (const [kind, raw] of [['dependsOn', dependsOnRaw], ['related', relatedRaw]] as const) {
    if (!raw) continue;
    for (const { num, ns } of harvestRefs(raw)) {
      if (num === scopeNumber && (ns === 'scope' || ns === 'bare')) continue; // self-ref noise
      rows.push({ projectid: projectId, sourcescope: scopeNumber, targetnumber: num, targetnamespace: ns, kind });
    }
  }
  await db.transaction(async (tx) => {
    await tx
      .delete(scopedependencies)
      .where(and(eq(scopedependencies.projectid, projectId), eq(scopedependencies.sourcescope, scopeNumber)));
    if (rows.length) await tx.insert(scopedependencies).values(rows);
  });
  return rows.length;
}
// [SCOPE 073 / T007b] END
