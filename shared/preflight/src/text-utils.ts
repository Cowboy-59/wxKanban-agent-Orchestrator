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
export function matchesPlaceholder(value: string): string[] {
  const normalized = normalizeText(value);
  return PLACEHOLDER_MARKERS.filter((marker) => {
    // BUG-12: "placeholder" is a real English word (e.g., "the URL still
    // contains the placeholder string"). Only match it as a standalone
    // marker — bracketed ([placeholder], <placeholder>), as a leading
    // label (placeholder:), or as a whole-line value — not as substring
    // of natural prose. The other markers (TODO, TBD, NEEDS CLARIFICATION)
    // are unambiguous and use word-boundary matching unchanged.
    if (marker === 'placeholder') {
      const standalone = /(^|[\s])(?:\[placeholder\]|<placeholder>|placeholder\s*:)|^\s*placeholder\s*$/i;
      return standalone.test(normalized);
    }
    return new RegExp(`\\b${marker.replace(/\s+/g, '\\s+')}\\b`, 'i').test(normalized);
  });
}
// [SCOPE 029 / T001] END

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
