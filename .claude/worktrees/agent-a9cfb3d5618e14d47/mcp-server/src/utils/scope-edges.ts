// [SCOPE 073 / T002] BEGIN — namespace-aware scope-dependency edge parser.
// TypeScript port of the reference resolver in .claude/skills/scope-flow-map/scripts/
// extract_scope_edges.py — the single source of edge logic. Honors the SCOPE-NNN vs
// SPEC-NNN namespace so the SCOPE/SPEC integer collision cannot mint phantom edges.
// Pure functions, no I/O.

export type Namespace = 'scope' | 'spec' | 'specword' | 'bare';
export type EdgeKind = 'dependsOn' | 'related';

export interface RawRef {
  num: number;
  ns: Namespace;
}

export interface Edge {
  from: number;
  to: number;
  kind: EdgeKind;
}

export interface ExternalRef {
  from: number;
  to: number;
  kind: EdgeKind;
}

export interface ResolveResult {
  edges: Edge[]; // scope -> scope
  externals: ExternalRef[]; // scope -> impl-spec (SPEC-NNN with no scope file)
  unresolved: ExternalRef[]; // explicit SCOPE-NNN with no scope file
}

// Strip noise BEFORE harvesting numbers so dates/versions/FR-task ids never become edges.
const NOISE_PATTERNS: RegExp[] = [
  /\b\d{4}-\d{2}-\d{2}\b/g, // ISO dates 2026-06-14
  /\bv?\d+\.\d+(?:\.\d+)*\b/g, // versions 1.5.118 / v0.1.7
  /\bFR-\d+\b/gi, // FR ids
  /\bT\d{2,4}\b/g, // task ids T042
  /\bAES-256\b/gi, // known false friend
  /\bUUID\s*v?\d+\b/gi, // UUID v7
];

// "SPEC-046/048" / "SCOPE-013/016" — the slash list shares one prefix; expand so every
// number keeps the namespace of the first (otherwise "/048" reads as bare).
const SLASH_LIST = /(SCOPE-|SPEC-)(\d{2,3})((?:\/\d{2,3})+)/g;

// Candidate references. Group 1 = citation form (drives namespace); group 2 = the number.
const REF_PATTERN = /(SCOPE-|SPEC-|spec\s+|Spec\s+)?\(?(\d{2,3})\b/g;

export function classify(prefix: string | undefined): Namespace {
  if (!prefix) return 'bare';
  const p = prefix.toUpperCase();
  if (p.startsWith('SCOPE-')) return 'scope';
  if (p === 'SPEC-') return 'spec';
  return 'specword'; // "spec " / "Spec " — legacy, ambiguous
}

export function expandSlashed(line: string): string {
  return line.replace(SLASH_LIST, (_m, prefix: string, first: string, rest: string) => {
    const nums = [first, ...rest.split('/').filter(Boolean)];
    return nums.map((n) => `${prefix}${n}`).join(' ');
  });
}

/** Return (number, namespace) pairs cited in a dependency line, de-duplicated. */
export function harvestRefs(line: string): RawRef[] {
  let cleaned = expandSlashed(line);
  for (const pat of NOISE_PATTERNS) cleaned = cleaned.replace(pat, ' ');
  const seen = new Set<string>();
  const out: RawRef[] = [];
  for (const m of cleaned.matchAll(REF_PATTERN)) {
    const num = parseInt(m[2], 10);
    const ns = classify(m[1]);
    const key = `${num}:${ns}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ num, ns });
    }
  }
  return out;
}

/**
 * Pull the raw `**Depends On**:` / `**Related Scopes**:` line text out of a scope's markdown
 * body, so the same content can feed edge capture from create_specs or an editor file-save.
 * Returns empty strings when a line is absent (harvestRefs then yields nothing).
 */
export function parseDepsFromContent(content: string): { dependsOnRaw: string; relatedRaw: string } {
  const c = (content ?? '').replace(/\r/g, '');
  return {
    dependsOnRaw: c.match(/^\*\*Depends On\*\*:\s*(.+)$/m)?.[1]?.trim() ?? '',
    relatedRaw: c.match(/^\*\*Related Scopes\*\*:\s*(.+)$/m)?.[1]?.trim() ?? '',
  };
}

const NONE_VALUES = new Set(['none', 'n/a', '-', '']);

/**
 * Resolve one scope's `Depends On` / `Related Scopes` line into categorized edges,
 * honoring the namespace. `known` is the set of scope numbers that have a scope file.
 * - SPEC-NNN  -> always external (even if a same-numbered scope exists)
 * - SCOPE-NNN -> scope edge if it exists, else unresolved (flagged)
 * - spec NNN  -> scope edge if it exists, else external
 * - bare NNN  -> scope edge only if it exists, else dropped (too noisy to trust)
 */
export function resolveLine(
  fromNum: number,
  raw: string,
  kind: EdgeKind,
  known: ReadonlySet<number>,
): ResolveResult {
  const result: ResolveResult = { edges: [], externals: [], unresolved: [] };
  if (!raw || NONE_VALUES.has(raw.trim().toLowerCase())) return result;

  for (const { num, ns } of harvestRefs(raw)) {
    if (num === fromNum && (ns === 'scope' || ns === 'bare')) continue; // self-ref noise
    const exists = known.has(num);
    if (ns === 'spec') {
      result.externals.push({ from: fromNum, to: num, kind });
    } else if (ns === 'scope') {
      if (exists) result.edges.push({ from: fromNum, to: num, kind });
      else result.unresolved.push({ from: fromNum, to: num, kind });
    } else if (ns === 'specword') {
      if (exists) result.edges.push({ from: fromNum, to: num, kind });
      else result.externals.push({ from: fromNum, to: num, kind });
    } else {
      // bare: trust only if it resolves to a real scope
      if (exists) result.edges.push({ from: fromNum, to: num, kind });
    }
  }
  return result;
}
// [SCOPE 073 / T002] END
