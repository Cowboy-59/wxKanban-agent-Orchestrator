// Spec 029 / T001 — text utilities for scope preflight scoring.
// Extracted byte-for-byte from mcp-server/src/utils/project-kit.ts so the
// kit and the MCP server share a single source of preflight truth. Behavior
// is unchanged from the inline original; tests in ../tests/preflight.test.ts
// cover the same boundary conditions.
//
// Fences are normally written by `wxkanban-agent implement`. The CLI is
// broken (memory: feedback_orchestrator_cli_broken), so this scope's T001
// hand-writes them in canonical form. `auditfences` should pass once the
// CLI is restored.

const PLACEHOLDER_MARKERS = ['TODO', 'TBD', 'NEEDS CLARIFICATION', 'placeholder'] as const;

/**
 * SCOPE-124 / T003 + T010 — where a marker was found, so the block can be acted on.
 *
 * `line` is 1-indexed against the ORIGINAL text. Locations are why this exists: "Placeholder
 * markers found: TODO" against a 300-line document is a fact the author cannot use.
 */
export interface PlaceholderHit {
  marker: string;
  /** The line as written, trimmed — enough to see the marker in its own context. */
  text: string;
  line: number;
}

// [SCOPE 029 / T001] BEGIN — normalizeText (strip markdown noise, collapse whitespace)
export function normalizeText(value: string | undefined): string {
  return (value || '')
    .replace(/`/g, '')
    .replace(/\*\*/g, '')
    .replace(/^[\-*]\s+/gm, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
// [SCOPE 029 / T001] END

// [SCOPE 029 / T001] BEGIN — matchesPlaceholder (returns placeholder markers found in value)
// MODIFIED-BY: [SCOPE 124 / T010] — markers are matched as ISOLATED UPPERCASE tokens, not
// case-insensitively, so ordinary prose in another language stops being rejected.
/**
 * SCOPE-124 / T010 (FR-007) — judge content, not language.
 *
 * The word-boundary match ran with the `i` flag, so `\bTODO\b` matched the Spanish word **todo**
 * ("all", "every") — a word that is unavoidable in ordinary Spanish prose. A whole project was
 * blocked from filing its scopes for writing its own language correctly (c9fc52d4).
 *
 * A marker is a marker because of how it is written, not merely which letters it contains. The
 * templates emit `TODO:` and `[NEEDS CLARIFICATION]` in caps, so requiring an isolated UPPERCASE
 * token keeps every real marker blocking while `todo el historial` passes. `Todo` at the start of
 * a sentence passes too, which is the point.
 *
 * `placeholder` keeps BUG-12's structural narrowing instead: it is a real English word whose
 * template form is lowercase, so case cannot separate marker from prose there — position does.
 *
 * NOTE, carried from the scope's plan: `normalizeText` strips backticks before matching starts, so a
 * code-span-aware exemption ("it's in a code fence, let it through") cannot be built here. That
 * information is destroyed before this function sees the text.
 */
function markerPattern(marker: string): RegExp {
  if (marker === 'placeholder') {
    // BUG-12: "placeholder" is a real English word (e.g., "the URL still
    // contains the placeholder string"). Only match it as a standalone
    // marker — bracketed ([placeholder], <placeholder>), as a leading
    // label (placeholder:), or as a whole-line value — not as substring
    // of natural prose.
    return /(^|[\s])(?:\[placeholder\]|<placeholder>|placeholder\s*:)|^\s*placeholder\s*$/i;
  }
  // Case-SENSITIVE. The absence of the `i` flag is the entire fix — do not add it back.
  return new RegExp(`\\b${marker.replace(/\s+/g, '\\s+')}\\b`);
}

export function matchesPlaceholder(value: string): string[] {
  const normalized = normalizeText(value);
  return PLACEHOLDER_MARKERS.filter((marker) => markerPattern(marker).test(normalized));
}
// [SCOPE 029 / T001] END

// [SCOPE 124 / T010] BEGIN — findPlaceholders (markers WITH their location)
/**
 * Every marker occurrence, with the line it sits on.
 *
 * Scans line by line so a location can be reported, then makes a second pass over the whole text
 * so a marker split across a line break — `NEEDS\nCLARIFICATION`, which the whole-text normalize
 * collapses into one — is still caught. A marker found only by that second pass is reported with
 * `line: 0`, meaning "present, location not pinpointed", rather than being silently dropped.
 */
export function findPlaceholders(value: string): PlaceholderHit[] {
  const hits: PlaceholderHit[] = [];
  const lines = (value || '').split(/\r?\n/);

  lines.forEach((rawLine, index) => {
    const normalized = normalizeText(rawLine);
    if (!normalized) {
      return;
    }
    for (const marker of PLACEHOLDER_MARKERS) {
      if (markerPattern(marker).test(normalized)) {
        hits.push({ marker, text: rawLine.trim(), line: index + 1 });
      }
    }
  });

  for (const marker of matchesPlaceholder(value)) {
    if (!hits.some((hit) => hit.marker === marker)) {
      hits.push({ marker, text: '', line: 0 });
    }
  }

  return hits;
}
// [SCOPE 124 / T010] END

// [SCOPE 029 / T001] BEGIN — matchesDefaultValue (detect template placeholder strings)
export function matchesDefaultValue(value: string | undefined, defaults: string[]): boolean {
  const normalized = normalizeText(value).toLowerCase();
  return defaults.some((candidate) => normalizeText(candidate).toLowerCase() === normalized);
}
// [SCOPE 029 / T001] END

// [SCOPE 029 / T001] BEGIN — isMeaningfulText (gates against placeholders + defaults + min length)
export function isMeaningfulText(value: string | undefined, defaults: string[], minimumLength = 20): boolean {
  const normalized = normalizeText(value);

  if (!normalized || normalized.length < minimumLength) {
    return false;
  }

  if (matchesPlaceholder(normalized).length > 0) {
    return false;
  }

  if (matchesDefaultValue(normalized, defaults)) {
    return false;
  }

  return true;
}
// [SCOPE 029 / T001] END

// [SCOPE 029 / T001] BEGIN — isMeasurableMetric (gate for success-metric quality)
export function isMeasurableMetric(metric: string): boolean {
  const normalized = normalizeText(metric);

  if (!normalized || normalized.length < 12) {
    return false;
  }

  if (matchesPlaceholder(normalized).length > 0) {
    return false;
  }

  return /\d|%/.test(normalized) || /\b(under|within|less than|more than|at least|at most|per|seconds?|minutes?|hours?|days?|weeks?|months?|ms|concurrent|users?|requests?|records?|tasks?|tickets?|errors?|uptime|availability|latency|throughput|rate)\b/i.test(normalized);
}
// [SCOPE 029 / T001] END

// [SCOPE 029 / T001] BEGIN — uniqueStrings (dedupe + drop empties)
export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
// [SCOPE 029 / T001] END
