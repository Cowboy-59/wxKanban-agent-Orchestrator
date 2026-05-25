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
