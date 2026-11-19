// [SCOPE 135 / T017] BEGIN — the tool checks that an edit changed only what it named
/**
 * SCOPE-135 / FR-019 — "everything not named stays byte-identical", enforced rather than hoped for.
 *
 * `mergeScopeEdit` splices by region, and each splice is individually careful. A defect in any of
 * them (a boundary one line too far, a regex that matches a neighbour) would still hand the author
 * a scope with a paragraph they never mentioned rewritten. This check is the backstop: it diffs the
 * finished draft against the base, line by line, and every difference must fall inside a region the
 * edit named. Anything else refuses the edit — no draft — and names the first line that moved.
 *
 * The regions are located here independently of the merge's own splicing. That is the point: a
 * check that shares the code it checks shares its mistakes. The cost is that a divergence shows up
 * as a loud refusal (never a silent write), which is the safe direction to fail.
 */

import { HEADING } from '@wxkanban/preflight';
import { ScopeEditRefusal, parseScopeItems } from './scope-edits.js';

export interface LineHunk {
  /** Base lines [aStart, aEnd) were replaced by draft lines [bStart, bEnd). */
  aStart: number;
  aEnd: number;
  bStart: number;
  bEnd: number;
}

/** Myers O(ND) line diff, returned as hunks. Equal prefix and suffix are trimmed first. */
export function diffLines(a: string[], b: string[]): LineHunk[] {
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s += 1;
  let ea = a.length;
  let eb = b.length;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) {
    ea -= 1;
    eb -= 1;
  }
  const A = a.slice(s, ea);
  const B = b.slice(s, eb);
  const n = A.length;
  const m = B.length;
  if (n === 0 && m === 0) return [];

  const max = n + m;
  const off = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  let found = 0;
  outer: for (let d = 0; d <= max; d += 1) {
    trace.push(v.slice(off - d - 1, off + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && A[x] === B[y]) {
        x += 1;
        y += 1;
      }
      v[off + k] = x;
      if (x >= n && y >= m) {
        found = d;
        break outer;
      }
    }
  }

  const deleted = new Array<boolean>(n).fill(false);
  const inserted = new Array<boolean>(m).fill(false);
  let x = n;
  let y = m;
  for (let d = found; d > 0; d -= 1) {
    const snap = trace[d];
    const get = (k: number): number => snap[k + d + 1];
    const k = x - y;
    const prevK = k === -d || (k !== d && get(k - 1) < get(k + 1)) ? k + 1 : k - 1;
    const prevX = get(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      x -= 1;
      y -= 1;
    }
    if (x === prevX) {
      inserted[prevY] = true;
    } else {
      deleted[prevX] = true;
    }
    x = prevX;
    y = prevY;
  }

  const hunks: LineHunk[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && !deleted[i] && !inserted[j]) {
      i += 1;
      j += 1;
      continue;
    }
    const aStart = i;
    const bStart = j;
    while (i < n && deleted[i]) i += 1;
    while (j < m && inserted[j]) j += 1;
    hunks.push({ aStart: aStart + s, aEnd: i + s, bStart: bStart + s, bEnd: j + s });
  }
  return hunks;
}

type Zone = [start: number, end: number];

const HEADING_FOR: Record<string, RegExp[]> = {
  business_problem: [/^##?\s*Business\s*Problem\b/i],
  actors: [/^##?\s*Actors\b/i],
  success_metrics: [/^##?\s*(?:Success\s*Metrics|Success\s*Criteria)\b/i],
  scope_boundary: [/^##?\s*(?:Scope\s*Boundary|In\s*Scope)\b/i],
  out_of_scope: [/^##?\s*Out\s*of\s*Scope\b/i],
  integration_context: [/^##?\s*Integration\s*Context\b/i],
  constraints_and_risks: [/^##?\s*Constraints\s*(?:and|&)\s*Risks\b/i],
  user_scenarios: [/^##?\s*User\s*(?:Scenarios|Stor(?:y|ies))\b/i],
  functional_requirements: [/^##?\s*Functional\s*Requirements\b/i],
  data_requirements: [/^##?\s*Data\s*Requirements\b/i],
  api_routes: [/^##?\s*API\s*Routes\b/i],
  frontend_components: [/^##?\s*Frontend\s*Components\b/i],
  key_entities: [/^##?\s*Key\s*Entities\b/i],
};

/** Lines a section's value can also live on, for documents that carry it outside a heading. */
const LINE_FOR: Record<string, RegExp[]> = {
  actors: [/^\s*\|\s*\*\*(?:Primary Actor|Secondary Actors)\*\*/i],
  scope_boundary: [/^\s*\|\s*\*\*Scope Boundary\*\*/i],
  integration_context: [/^\s*[-*]\s*Integration context\s*:/i],
  constraints_and_risks: [/^\s*[-*]\s*Constraints and risks\s*:/i],
};

function headingLevel(line: string): number {
  return (line.trim().match(/^(#+)/) as RegExpMatchArray)[1].length;
}

/** A heading's section runs to the next heading of the same or a higher level (inclusive of the gap before it). */
function sectionZone(lines: string[], index: number): Zone {
  const level = headingLevel(lines[index]);
  for (let idx = index + 1; idx < lines.length; idx += 1) {
    const heading = lines[idx].trim().match(HEADING);
    if (heading && heading[1].length <= level) return [index, idx];
  }
  return [index, lines.length];
}

/** The regions of `base` an edit that touched `named` sections was entitled to change. */
export function allowedZones(base: string[], named: string[], createdAny: boolean): Zone[] {
  const zones: Zone[] = [];
  const items = parseScopeItems(base);

  for (const name of named) {
    if (name === 'title') {
      const index = base.findIndex((line) => /^#\s+/.test(line));
      if (index !== -1) zones.push([index, index + 1]);
      continue;
    }
    const item = name.match(/^(FR|US)-?(\d+)(?:\/AC\d+)?$/);
    if (item) {
      const kind = item[1] as 'FR' | 'US';
      const hit = items.find((candidate) => candidate.kind === kind && candidate.number === Number(item[2]));
      if (hit) {
        zones.push([hit.start, hit.end]);
      } else {
        // An added item lands after the last item of its kind.
        const last = items.filter((candidate) => candidate.kind === kind).pop();
        if (last) zones.push([last.start, last.end]);
      }
      continue;
    }
    for (const pattern of HEADING_FOR[name] ?? []) {
      const index = base.findIndex((line) => pattern.test(line.trim()));
      if (index !== -1) zones.push(sectionZone(base, index));
    }
    for (const pattern of LINE_FOR[name] ?? []) {
      base.forEach((line, idx) => {
        if (pattern.test(line)) zones.push([idx, idx + 1]);
      });
    }
  }

  if (createdAny) {
    // A created section is appended after the last real line; the document's trailing blanks go with it.
    let last = base.length;
    while (last > 0 && base[last - 1].trim() === '') last -= 1;
    zones.push([last, base.length]);
  }
  return zones;
}

function inside(zones: Zone[], start: number, end: number): boolean {
  return zones.some(([zs, ze]) => zs <= start && end <= ze);
}

function excerpt(line: string | undefined): string {
  const text = (line ?? '').trim();
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

/**
 * Refuse the edit when the draft differs from the base anywhere outside the named regions, or when
 * it changed the document's line endings. `named` is the merge's own list of what it touched.
 */
export function verifyOnlyNamedChanged(
  baseContent: string,
  draftContent: string,
  named: string[],
  createdAny: boolean,
  extraZones: Zone[] = [],
): void {
  const crlf = baseContent.includes('\r\n');
  const bareLf = /(^|[^\r])\n/.test(baseContent);
  if (crlf && bareLf) {
    throw new ScopeEditRefusal(
      'Edit refused: the scope uses mixed line endings (CRLF and LF), and an edit would rewrite the lines it did not name. Normalise the file to one line ending and retry. No draft was produced.',
    );
  }
  if (crlf !== draftContent.includes('\r\n') || (!crlf && draftContent.includes('\r'))) {
    throw new ScopeEditRefusal('Edit refused: the draft changed the document\'s line endings. No draft was produced.');
  }

  const base = baseContent.split(/\r?\n/);
  const draft = draftContent.split(/\r?\n/);
  const zones = [...allowedZones(base, named, createdAny), ...extraZones];
  for (const hunk of diffLines(base, draft)) {
    if (inside(zones, hunk.aStart, hunk.aEnd)) continue;
    const line = hunk.aStart + 1;
    throw new ScopeEditRefusal(
      hunk.aEnd > hunk.aStart
        ? `Edit refused: line ${line} of the existing document would change but was not named by this edit: "${excerpt(base[hunk.aStart])}". Nothing else is touched; no draft was produced.`
        : `Edit refused: text would be inserted after line ${hunk.aStart} of the existing document, outside what this edit named: "${excerpt(draft.slice(hunk.bStart, hunk.bEnd).find((text) => text.trim() !== ''))}". No draft was produced.`,
    );
  }
}
// [SCOPE 135 / T017] END

// [SCOPE 135 / T018] BEGIN — the before/after diff an edit response carries
export interface EditDiffHunk {
  /** 1-based line in the existing document where the change starts. */
  line: number;
  before: string[];
  after: string[];
}

export interface EditDiff {
  hunks: EditDiffHunk[];
  /** The same hunks as text: `@@ line N @@`, then `- before` and `+ after` lines. Empty when nothing changed. */
  text: string;
}

/**
 * FR-020 - show the author exactly which lines an edit changes before anything is written. Built from
 * the same line diff the byte-identical check uses, so what is shown is what was verified.
 */
export function formatEditDiff(baseContent: string, draftContent: string): EditDiff {
  const base = baseContent.split(/\r?\n/);
  const draft = draftContent.split(/\r?\n/);
  const hunks = diffLines(base, draft).map((hunk) => ({
    line: hunk.aStart + 1,
    before: base.slice(hunk.aStart, hunk.aEnd),
    after: draft.slice(hunk.bStart, hunk.bEnd),
  }));
  const text = hunks
    .map((hunk) => [`@@ line ${hunk.line} @@`, ...hunk.before.map((l) => `- ${l}`), ...hunk.after.map((l) => `+ ${l}`)].join('\n'))
    .join('\n');
  return { hunks, text };
}
// [SCOPE 135 / T018] END
