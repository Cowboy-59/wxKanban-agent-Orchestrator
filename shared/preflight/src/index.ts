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
  FR_HEADING,
  SCENARIO_HEADING,
  HEADING,
  completenessWarnings,
  type ScopeCompleteness,
} from './completeness.js';

// [SCOPE 135 / T019] FR-021 — the synced-hash marker, one implementation for the kit and the server.
export {
  readScopeSyncMarker,
  stripScopeSyncMarker,
  scopeSyncHash,
  withScopeSyncMarker,
  type ScopeSyncMarker,
} from './scope-sync.js';

// [SCOPE 135 / T024] FR-028 — the source-record pointer, one grammar for the server, the kit and run stamps.
export {
  parseSourceRecord,
  formatSourceRecord,
  expandPointers,
  validateSourceRecord,
  sourceRecordApplied,
  createFenceTracker, // [SCOPE 135 / T029] FR-028 — one fence rule for the log writer and the parser
  isAmendmentLogHeading, // [SCOPE 135 / T029] FR-028 — one heading rule for where the log starts
  endsAmendmentLog, // [SCOPE 135 / T029] FR-028 — and where it ends
  SOURCE_RECORD_GRAMMAR,
  SOURCE_RECORD_NOT_APPLIED,
  type SourceRecordPointer,
  type SourceRecordValue,
  type SourceRecordReading,
  type SourceRecordAmendment,
  type ParsedSourceRecord,
  type SourceRecordValidation,
} from './source-record.js';
