// [SCOPE 124 / T014] BEGIN — detect shadow scopes already written
/**
 * SCOPE-124 / T014 (FR-008) — find the duplicates the identity defect already created.
 *
 * T004/T008 stop new ones. They do nothing for what is already in the database, where 115 excess
 * document rows sit across 83 (project, title, doctype) groups and render as real open work.
 *
 * **What the first production run actually found, which is not what the scope predicted.** Across
 * 97 projects and 1705 specs there is NO trace of the 29-shadow set (030–058 copying 001–029) the
 * scope describes — no bulk-copy cluster survives at all. One genuine duplicate exists: a project
 * holding `008 "WIN_CodiciCAP — ricerca CAP"` alongside `108` of the same name, 99% similar,
 * created the same day by one conversion run. The remaining candidates are converted applications
 * whose scopes are near-identical BY NATURE — one per legacy window, differing only in the entity
 * name — and they are reported at low confidence precisely so they do not read as findings.
 *
 * That gap matters more than the count. The detector is tuned against real data rather than the
 * shape the report assumed, and the scope's own duplicate claim should be treated as unverified
 * until someone can point at the project it came from.
 *
 * This module only *reports*. Removal is T015, which consumes SCOPE-098's `project.delete_scope`
 * rather than growing a second delete path. Detection being read-only is what makes it safe to run
 * against production while removal is still blocked — and it is worth running now, because the
 * report is the input to deciding whether removal is even wanted.
 *
 * ## Why two signals, not one
 *
 * **Content similarity alone** over-reports: scopes written from the same template share most of
 * their words, and two genuinely different scopes in one project can score high.
 *
 * **Numbering offset alone** over-reports harder: consecutive numbers are the normal state of a
 * project.
 *
 * A shadow set has both — the same content AND a constant numeric distance repeated across many
 * pairs. The offset is what turns "these two look similar" into "these twenty-nine were copied in
 * one operation", and that is the claim worth acting on. Pairs carrying only one signal are still
 * reported, at lower confidence, because the caller decides — nothing here removes anything.
 *
 * ## Which one is the original
 *
 * The lower spec number, and `createdAt` breaks the tie when present. A shadow set is created by
 * re-pushing work that already existed, so the copy takes the later number. Where the evidence
 * disagrees with that assumption the pair is still reported, with the disagreement stated, rather
 * than silently resolved — deleting edited work on an inference is the failure the scope's own
 * risks section calls out.
 */

export interface ScopeRecord {
  id: string;
  specNumber: string;
  title?: string | null;
  content?: string | null;
  createdAt?: Date | string | null;
}

export interface DuplicatePair {
  /** The record that appears to be the copy — the one T015 would remove. */
  shadow: { id: string; specNumber: string; title: string };
  /** The record it shadows. */
  original: { id: string; specNumber: string; title: string };
  /** 0–1. Token-set (Jaccard) similarity of the two contents. */
  similarity: number;
  /** shadow number − original number, when both parse as integers. */
  numericOffset: number | null;
  confidence: 'high' | 'medium' | 'low';
  /** Human-readable justification — every element of it independently checkable. */
  reasons: string[];
}

export interface DuplicateReport {
  pairs: DuplicatePair[];
  /**
   * Offsets shared by three or more pairs, strongest first. This is the shape that identifies a
   * bulk copy rather than a coincidence.
   */
  clusters: Array<{ offset: number; pairCount: number; specNumbers: string[] }>;
  /** Scopes examined. Reported so a caller can tell "none found" from "nothing was looked at". */
  examined: number;
}

/**
 * Words worth comparing: lowercase, punctuation-stripped, short tokens dropped.
 *
 * Numbers survive whatever their length. Dropping them along with the other short tokens made two
 * scopes that differed ONLY by an identifier — "area 1" versus "area 12" — tokenize identically and
 * score a perfect match. Short numbers are frequently the only thing distinguishing one scope from
 * another, so they are exactly the wrong tokens to discard.
 */
function tokenize(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 2 || /^\d+$/.test(token)),
  );
}

/**
 * Words this project repeats everywhere carry no evidence, so they are removed before comparing.
 *
 * Every scope here comes from one template: "Overview", "Business Problem", "This scope covers",
 * "the system MUST". Comparing raw token sets scored twelve unrelated scopes at 61% similar purely
 * on that shared scaffolding — a detector that reports everything is the same as one that reports
 * nothing. Dropping tokens that appear in most of the project leaves the words that actually
 * distinguish one scope from another.
 *
 * Only applied once the corpus is big enough to say what "most" means. Under `MIN_CORPUS` every
 * token of a duplicated pair appears in 100% of a two-scope project, and filtering would erase the
 * very evidence being looked for.
 */
const MIN_CORPUS = 8;
const UBIQUITY_THRESHOLD = 0.6;

function buildSignalSets(tokenSets: Set<string>[]): Set<string>[] {
  if (tokenSets.length < MIN_CORPUS) {
    return tokenSets;
  }

  const documentFrequency = new Map<string, number>();
  for (const tokens of tokenSets) {
    for (const token of tokens) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }

  const ubiquitous = new Set(
    [...documentFrequency.entries()]
      .filter(([, count]) => count / tokenSets.length > UBIQUITY_THRESHOLD)
      .map(([token]) => token),
  );

  return tokenSets.map((tokens) => new Set([...tokens].filter((token) => !ubiquitous.has(token))));
}

/** Whitespace-normalised equality — the honest basis for claiming two scopes are identical. */
function sameContent(a: string, b: string): boolean {
  const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim();
  return normalize(a) !== '' && normalize(a) === normalize(b);
}

/** Jaccard similarity. 1 = identical token sets, 0 = disjoint. */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) {
    if (b.has(token)) shared += 1;
  }
  return shared / (a.size + b.size - shared);
}

function parseNumber(specNumber: string): number | null {
  const parsed = parseInt(specNumber, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function toTime(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

export interface DetectOptions {
  /**
   * Below this, a pair is not reported at all. Default 0.75.
   *
   * Raised from 0.6 after the first production run: a converted application's scopes are
   * near-identical BY NATURE — one per legacy window, differing only in the entity name — and 0.6
   * surfaced 64 low-confidence pairs in a single project of that kind. Content similarity cannot
   * separate "copied" from "structurally the same" there; only the numbering signature can, which
   * is why a pair with no cluster behind it never reaches high confidence.
   */
  minSimilarity?: number;
  /** At or above this, content alone justifies `medium` without offset support. Default 0.9. */
  strongSimilarity?: number;
}

/**
 * Compare every pair of scopes in one project and report the ones that look copied.
 *
 * O(n²) on the scope count, which is the right trade for clarity: projects here hold tens to low
 * hundreds of scopes, and a cheaper blocking strategy would have to assume something about how
 * duplicates differ — the assumption most likely to hide the ones that matter.
 */
export function detectDuplicateScopes(
  scopes: ScopeRecord[],
  options: DetectOptions = {},
): DuplicateReport {
  const minSimilarity = options.minSimilarity ?? 0.75;
  const strongSimilarity = options.strongSimilarity ?? 0.9;

  const rawTokens = scopes.map((scope) => tokenize(scope.content ?? ''));
  const signalTokens = buildSignalSets(rawTokens);

  const prepared = scopes.map((scope, index) => ({
    scope,
    tokens: rawTokens[index],
    signal: signalTokens[index],
    numeric: parseNumber(scope.specNumber),
    created: toTime(scope.createdAt),
  }));

  const candidates: Array<{
    a: (typeof prepared)[number];
    b: (typeof prepared)[number];
    similarity: number;
    identical: boolean;
  }> = [];

  for (let i = 0; i < prepared.length; i += 1) {
    for (let j = i + 1; j < prepared.length; j += 1) {
      // A scope with no content cannot be judged by content. Reporting it on numbering alone
      // would be a guess about which of two empty records is the copy.
      if (prepared[i].tokens.size === 0 || prepared[j].tokens.size === 0) continue;
      const identical = sameContent(prepared[i].scope.content ?? '', prepared[j].scope.content ?? '');
      const similarity = identical ? 1 : jaccard(prepared[i].signal, prepared[j].signal);
      if (similarity >= minSimilarity) {
        candidates.push({ a: prepared[i], b: prepared[j], similarity, identical });
      }
    }
  }

  // Offsets repeated across candidates — the signature of one bulk copy.
  const offsetCounts = new Map<number, string[]>();
  for (const candidate of candidates) {
    const lower = candidate.a.numeric !== null && candidate.b.numeric !== null
      ? Math.min(candidate.a.numeric, candidate.b.numeric)
      : null;
    const higher = candidate.a.numeric !== null && candidate.b.numeric !== null
      ? Math.max(candidate.a.numeric, candidate.b.numeric)
      : null;
    if (lower === null || higher === null || lower === higher) continue;
    const offset = higher - lower;
    if (!offsetCounts.has(offset)) offsetCounts.set(offset, []);
    offsetCounts.get(offset)!.push(String(higher).padStart(3, '0'));
  }

  // A bulk copy has a LARGE offset — copying N scopes lands them at least N numbers later, in a
  // block that does not interleave with the originals. Adjacent offsets (+1, +2) are what an
  // ordinary project looks like, and treating them as copy evidence is how the first run against
  // production reported five "clusters" at +1 and +4 in a converted application whose scopes are
  // near-identical by nature (BrowseCarrierTypes / BrowseControlTypes). Requiring the offset to be
  // at least as large as the number of pairs supporting it removes that entire class.
  const clusters = [...offsetCounts.entries()]
    .filter(([offset, numbers]) => numbers.length >= 3 && offset >= Math.max(3, numbers.length))
    .map(([offset, numbers]) => ({
      offset,
      pairCount: numbers.length,
      specNumbers: [...numbers].sort(),
    }))
    .sort((x, y) => y.pairCount - x.pairCount);

  const clusterOffsets = new Map(clusters.map((c) => [c.offset, c.pairCount]));

  const pairs: DuplicatePair[] = candidates.map(({ a, b, similarity, identical }) => {
    const reasons: string[] = [];

    // Orientation: the higher number is the copy, with createdAt as the tiebreak and as a check.
    let shadow = a;
    let original = b;
    if (a.numeric !== null && b.numeric !== null) {
      if (a.numeric < b.numeric) {
        shadow = b;
        original = a;
      }
    } else if (a.created !== null && b.created !== null) {
      if (a.created < b.created) {
        shadow = b;
        original = a;
      }
    }

    if (identical) {
      reasons.push('content is identical');
    } else {
      reasons.push(
        `content is ${Math.round(similarity * 100)}% similar, ignoring wording this project repeats across scopes`,
      );
    }

    const numericOffset =
      shadow.numeric !== null && original.numeric !== null ? shadow.numeric - original.numeric : null;

    let confidence: DuplicatePair['confidence'] = 'low';
    if (numericOffset !== null && clusterOffsets.has(numericOffset)) {
      const count = clusterOffsets.get(numericOffset)!;
      reasons.push(
        `numbering offset of +${numericOffset} is shared by ${count} pairs in this project, which is the signature of one bulk copy rather than a coincidence`,
      );
      confidence = similarity >= strongSimilarity ? 'high' : 'medium';
    } else if (similarity >= strongSimilarity) {
      reasons.push('no repeated numbering offset supports this pair — content similarity alone');
      confidence = 'medium';
    } else {
      reasons.push('content similarity is moderate and no numbering pattern supports it');
      confidence = 'low';
    }

    // State disagreements rather than resolving them. The scope's own risks section is explicit
    // that deleting edited work on an inference is not acceptable.
    if (shadow.created !== null && original.created !== null && shadow.created < original.created) {
      reasons.push(
        'CAUTION: the higher-numbered scope was created EARLIER, so the copy direction is not certain',
      );
      confidence = confidence === 'high' ? 'medium' : confidence;
    }
    if (!identical) {
      reasons.push('contents differ — review before removing, the copy may have been edited since');
    }

    return {
      shadow: {
        id: shadow.scope.id,
        specNumber: shadow.scope.specNumber,
        title: shadow.scope.title ?? '',
      },
      original: {
        id: original.scope.id,
        specNumber: original.scope.specNumber,
        title: original.scope.title ?? '',
      },
      similarity: Math.round(similarity * 1000) / 1000,
      numericOffset,
      confidence,
      reasons,
    };
  });

  const rank = { high: 0, medium: 1, low: 2 } as const;
  pairs.sort(
    (x, y) =>
      rank[x.confidence] - rank[y.confidence] ||
      y.similarity - x.similarity ||
      x.shadow.specNumber.localeCompare(y.shadow.specNumber),
  );

  return { pairs, clusters, examined: scopes.length };
}

/** Render a report a human can act on without reading JSON. */
export function formatDuplicateReport(report: DuplicateReport): string {
  const lines: string[] = [];
  lines.push(`Examined ${report.examined} scope(s).`);

  if (report.pairs.length === 0) {
    lines.push('No duplicate scopes detected.');
    return lines.join('\n');
  }

  if (report.clusters.length > 0) {
    lines.push('');
    lines.push('Bulk-copy clusters (a repeated numbering offset across many similar pairs):');
    for (const cluster of report.clusters) {
      lines.push(
        `  offset +${cluster.offset}: ${cluster.pairCount} pairs — shadows ${cluster.specNumbers[0]}…${cluster.specNumbers[cluster.specNumbers.length - 1]}`,
      );
    }
  }

  lines.push('');
  lines.push(`${report.pairs.length} candidate duplicate pair(s), most confident first:`);
  for (const pair of report.pairs) {
    lines.push('');
    lines.push(
      `  [${pair.confidence}] ${pair.shadow.specNumber} "${pair.shadow.title}" shadows ${pair.original.specNumber} "${pair.original.title}"`,
    );
    lines.push(`    shadow id:   ${pair.shadow.id}`);
    lines.push(`    original id: ${pair.original.id}`);
    for (const reason of pair.reasons) {
      lines.push(`    - ${reason}`);
    }
  }

  lines.push('');
  lines.push('This report changed nothing. Removal is SCOPE-124 T015, via project.delete_scope.');
  return lines.join('\n');
}
// [SCOPE 124 / T014] END
