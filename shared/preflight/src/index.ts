// Spec 029 / T001 — public surface of @wxkanban/preflight.
// Consumed by mcp-server/src/utils/project-kit.ts and (later) by
// wxkanban-agent/dbpush.ts so they share a single source of preflight
// truth. See specs/029-DbpushBlockingContract/spec.md FR-014.

export {
  runPreflight,
  type ScopeValidationResult,
} from './check.js';

export {
  normalizeText,
  matchesPlaceholder,
  // [SCOPE 124 / T010 + T012] findPlaceholders is exported so the ambiguity counter in
  // mcp-server's analyzeSpecArtifacts can converge on this module instead of keeping its own regex.
  findPlaceholders,
  type PlaceholderHit,
  matchesDefaultValue,
  isMeaningfulText,
  isMeasurableMetric,
  uniqueStrings,
} from './text-utils.js';

export {
  extractSectionContent,
  extractActorValue,
  extractCoreDesignValue,
  extractMetricLines,
} from './extractors.js';

export { DEFAULT_SCOPE_CONTENT } from './defaults.js';

// [SCOPE 135 / T004] The checklist's Advisory group counts with the same function the warnings use.
export {
  BOILERPLATE_FR_TITLES,
  countScopeCompleteness,
  completenessWarnings,
  type ScopeCompleteness,
} from './completeness.js';
