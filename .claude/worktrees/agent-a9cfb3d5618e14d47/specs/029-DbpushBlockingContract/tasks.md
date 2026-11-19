# 029 — Dbpush Blocking Contract — Tasks

**Spec**: [spec.md](./spec.md)
**Plan**: [plan.md](./plan.md)
**Created**: 2026-05-25
**Status**: Design

Tasks are consumed by `wxkanban-agent implement <scope>/<task>`. Each landed task adds a `[SCOPE 029 / T###]` BEGIN/END fence per CLAUDE.md spec 026 (FR-027).

---

## Layer 1 — Foundation

### T001 — Extract preflight rules into `shared/preflight/`

**Layer**: 1
**Depends on**: —
**FR**: FR-014
**Status**: done (2026-05-25)

**Files**:
- N `shared/preflight/package.json`
- N `shared/preflight/tsconfig.json`
- N `shared/preflight/src/index.ts`
- N `shared/preflight/src/checks.ts`
- N `shared/preflight/tests/preflight.test.ts`
- M `mcp-server/src/server.ts` — replace inline preflight with import
- M `mcp-server/src/utils/project-kit.ts` — if it owns part of the rule
- M repo root `package.json` (workspaces array) and `tsconfig.json` (path mapping)

**Acceptance**:
1. `shared/preflight/` is a recognized npm workspace; `npm install` at repo root resolves its dependencies.
2. `runPreflight(markdown)` returns `{ok, missingSections, blockingIssues, checks}` exactly matching the current MCP server output for a set of captured fixture envelopes (regression: byte-for-byte equivalence on 10+ real-world specs).
3. `mcp-server/src/server.ts`'s `project.create_specs` handler imports and calls `runPreflight` instead of inline logic. No behavior change visible to clients.
4. Unit tests in `shared/preflight/tests/preflight.test.ts` cover each of the 7 section checks.
5. CI green on both Linux and Windows (mitigates R5).

---

### T002 — Shared MCP envelope type + parser

**Layer**: 1
**Depends on**: T001 (workspace wiring)
**FR**: FR-001, FR-002, FR-003
**Status**: done (2026-05-25)

**Files**:
- N `wxkanban-agent/core/orchestrator/mcp-envelope.ts`
- M `wxkanban-agent/core/orchestrator/mcp-client.ts`
- M `wxkanban-agent/core/http/mcp-client.ts`
- N `wxkanban-agent/tests/unit/mcp-envelope.test.ts`

**Acceptance**:
1. `mcp-envelope.ts` exports `type McpEnvelope<T>` and `parseEnvelope(response: Response): Promise<McpEnvelope<T>>`.
2. Parser handles four cases per FR-004: (a) 200 success, (b) 422 blocked, (c) 200 with `success:false` legacy block, (d) 5xx throws.
3. Both `mcp-client.ts` and `core/http/mcp-client.ts` route response parsing through this module. No duplicated parse logic.
4. Existing `callMcpTool` callers compile without changes (envelope's `data` field carries the previous return shape).
5. Unit tests cover all four envelope variants.

---

## Layer 2 — Truth-telling

### T003 — `dbpush.ts` envelope inspection (`pushNewSpec`, `pushExistingSpec`)

**Layer**: 2
**Depends on**: T002
**FR**: FR-005, FR-006, FR-007
**Status**: done (2026-05-25)

**Files**:
- M `wxkanban-agent/dbpush.ts`
- N `wxkanban-agent/tests/unit/dbpush-blocked-envelope.test.ts`

**Acceptance**:
1. `pushNewSpec` inspects the envelope before incrementing counters. On `success === false`, pushes each `blockingIssues` entry into `r.errors` prefixed with the scope number; does NOT increment `specsCreated` / `tasksCreated`.
2. On success, `specsCreated` derived from `response.data.spec != null`, `tasksCreated` from `response.data.tasks?.length ?? 0` — NOT from the local artifact.
3. `pushExistingSpec` applies the same inspection to every `upsert_document` call.
4. Unit tests cover: blocked envelope (counters zero, errors populated), success envelope (counters from server response), mixed batch.

---

### T004 — `command-handlers/dbpush.ts` envelope inspection

**Layer**: 2
**Depends on**: T003
**FR**: FR-008
**Status**: done (2026-05-25) — no-op; acceptance already met by T003

**Files**:
- M `wxkanban-agent/core/orchestrator/command-handlers/dbpush.ts` (added maintenance comment only)

**Discovery**: The "newer parallel handler" referenced in this task does not exist as a parallel implementation — it is a 14-line passthrough that calls `dbpush()` from the core. T003's envelope inspection automatically flows through this path. Added a comment to the handler so future maintainers route any new MCP write calls through `callMcpToolWithEnvelope` rather than forking the logic.

**Acceptance**:
1. ✅ Newer parallel handler applies identical envelope inspection (by delegation).
2. ✅ Single shared helper — no duplicated logic (verified: handler is a passthrough).

---

### T005 — `phase2Compare` title-prefix fallback

**Layer**: 2
**Depends on**: T002 (parallel to T003)
**FR**: FR-009, FR-010, FR-011
**Status**: done (2026-05-25)

**Files**:
- M `wxkanban-agent/dbpush.ts` — `phase2Compare`
- N `wxkanban-agent/tests/unit/dbpush-phase2-title-prefix.test.ts`

**Acceptance**:
1. `phase2Compare` no longer reads `resp.specs` (removed branch).
2. When task records lack `specNumber`, falls back to parsing `^\[(\d{3})-T\d+\]` from task titles.
3. Tasks whose titles don't match the regex are ignored (not errors).
4. Unit tests cover: tasks with `specNumber` field present (passes through), tasks with only title prefix (parsed), tasks with neither (ignored), mixed batch.

---

### T006 — `capture_event` metadata accuracy

**Layer**: 2
**Depends on**: T003, T004
**FR**: FR-021
**Status**: done (2026-05-25)

**Files**:
- M `wxkanban-agent/dbpush.ts` — `capture_event` payload assembly

**Acceptance**:
1. `metadata.pushErrors` equals `totals.errors.length` AFTER blocked-envelope detection.
2. New `metadata.blockingIssuesCount` field added, equals total count of blocking issues across all blocked specs in the run.
3. `validationErrors` semantics unchanged (Phase 1 markdown structural errors only).

---

### T007 — MCP server returns HTTP 422 on blocked

**Layer**: 2
**Depends on**: T001 (parallel to T003-T006)
**FR**: FR-012, FR-013
**Status**: done (2026-05-25)

**Files**:
- M `mcp-server/src/server.ts` — `project.create_specs` handler response code
- N `mcp-server/tests/integration/create-specs-422.test.ts`

**Acceptance**:
1. When `runPreflight()` returns `ok: false` AND the handler decides to block, response status is **422 Unprocessable Entity**.
2. Response body shape unchanged: `{success: false, blocked: true, message, blockingIssues, spec: null, tasks: []}`.
3. Non-blocked failures (5xx server error, 401/403 auth, 400 bad schema) keep their existing status codes.
4. Integration test asserts 422 on a deliberately broken fixture spec; 200 on a valid one.

---

### T008 — Layer 2 integration test (blocked report end-to-end)

**Layer**: 2
**Depends on**: T003, T004, T005, T006, T007
**FR**: FR-023 (partial — Layer 2 portions only)
**Status**: done (2026-05-25)

**Files**:
- N `wxkanban-agent/tests/integration/dbpush-blocked-report.test.ts`

**Acceptance**:
1. Fixture: one valid spec + one heading-shape-broken spec.
2. Mock MCP returns 422 for the broken one, 200 for the valid one.
3. Assertion: kit report shows `specsCreated: 1`, `errors: [...one entry per blocking issue from the broken spec...]`.
4. Assertion: `capture_event` payload reports `pushErrors: 1`, `blockingIssuesCount: N`.
5. (Interactive retry assertion deferred to T015.)

---

## Layer 3 — Self-service recovery

### T009 — `createspecs` template emits explicit `##` headings

**Layer**: 3
**Depends on**: Layer 2 fully landed
**FR**: FR-015, FR-016
**Status**: done (2026-05-25)

**Files**:
- M `wxkanban-agent/<createspecs-template-location>` — exact path discovered during this task

**Acceptance**:
1. Template emits headings in canonical order: `## Overview` → `## Business Problem` → `## Actors` → `## Success Metrics` → `## Scope Boundary` → `## Out of Scope` → `## Open Questions` → `## Functional Requirements`.
2. Each section gets a placeholder body sufficient to clear preflight's content checks (e.g. Actors section has at least one primary + one secondary, Success Metrics has 3+ items).
3. Manual smoke: `createspecs` against an empty fixture project produces a scope that passes `runPreflight()`.

---

### T010 — Heading-shape classifier

**Layer**: 3
**Depends on**: T001 (for `runPreflight()`)
**FR**: FR-017
**Status**: done (2026-05-25)

**Files**:
- N `wxkanban-agent/core/orchestrator/heading-classifier.ts`
- N `wxkanban-agent/tests/unit/heading-classifier.test.ts`

**Acceptance**:
1. `classifyBlockingIssues(specPath, blockingIssues) → {headingShape: string[], content: string[]}`.
2. Algorithm: call `runPreflight()` on the file → for each `missingSection`, scan the file for `**Label**` or `**Label:**` inside a `##` block other than the section's own → match = heading-shape, else = content.
3. Unit tests cover: pure heading-shape spec (all issues classified as shape), pure content-missing spec (all classified as content), mixed spec.

---

### T011 — Spec heading rewriter + `.bak` handling

**Layer**: 3
**Depends on**: T010
**FR**: FR-019
**Status**: done (2026-05-25)

**Files**:
- N `wxkanban-agent/core/orchestrator/spec-heading-rewriter.ts`
- N `wxkanban-agent/tests/unit/spec-heading-rewriter.test.ts`

**Acceptance**:
1. `rewriteHeadings(specPath, headingShapeIssues) → {bakPath, rewroteSections: string[]}`.
2. Original file copied to `<specPath>.bak-<ISO-8601-timestamp>` before any modification (UTC timestamp, `:` replaced with `-` for Windows filename safety).
3. Each `**Label**` bold found in another `##` block is split out into a new `## Label` heading at the position immediately above its inline body text.
4. Content inside fenced code blocks (` ``` `) is NEVER modified — rewriter skips fenced regions.
5. Unit tests cover: simple bold-to-heading rewrite, nested bold (only outer rewritten), bold inside code fence (preserved), backup file naming on Windows.

---

### T012 — `dbpush` interactive prompt + retry loop

**Layer**: 3
**Depends on**: T010, T011
**FR**: FR-017, FR-018, FR-019, FR-020
**Status**: done (2026-05-25)

**Files**:
- M `wxkanban-agent/dbpush.ts` — adds 422 / blocked branch in the main loop

**Acceptance**:
1. On any blocked envelope, calls `classifyBlockingIssues` per affected spec.
2. If at least one heading-shape issue exists AND `process.stdout.isTTY === true`: prints heading-shape issues only and prompts `Auto-correct heading shape and retry push? [y/N]:`. Default on Enter = No.
3. On `y`: invokes `rewriteHeadings` for each affected file, then re-runs Phase 1 → Phase 4 ONCE (no second auto-retry).
4. Content blocking issues remain in `r.errors` regardless of prompt outcome.
5. Non-TTY mode: prompt is skipped; all blocking issues exit as errors (CI-safe).

---

### T013 — stdin-stub test helper

**Layer**: 3
**Depends on**: —
**FR**: FR-023 (test infrastructure)
**Status**: done (2026-05-25)

**Files**:
- N `wxkanban-agent/tests/helpers/stdin-stub.ts`

**Acceptance**:
1. Exports `stubStdin(responses: string[]): {restore: () => void}` that lets a test feed pre-canned lines to any code reading from `process.stdin` via the `readline` module.
2. Restores original stdin on teardown.
3. Smoke test demonstrates round-trip: stubbed stdin → readline question → received expected answer.

---

### T014 — CI guard: templated scope passes preflight

**Layer**: 3
**Depends on**: T001, T009
**FR**: FR-016, FR-024
**Status**: done (2026-05-25)

**Files**:
- N `wxkanban-agent/tests/integration/template-passes-preflight.test.ts`

**Acceptance**:
1. Test renders the `createspecs` template with default placeholder text.
2. Feeds the rendered output through `runPreflight()` (imported from `shared/preflight/`).
3. Asserts `ok === true`.
4. Test fails loudly if the template is edited in a way that breaks preflight conformance.

---

### T015 — Layer 3 integration test (interactive retry)

**Layer**: 3
**Depends on**: T012, T013
**FR**: FR-023 (interactive portion)
**Status**: done (2026-05-25)

**Files**:
- M `wxkanban-agent/tests/integration/dbpush-blocked-report.test.ts` — adds interactive scenario

**Acceptance**:
1. Setup: fixture project with one heading-shape-broken spec; mock MCP returns 422 first call, 200 second call (after rewrite).
2. Test uses `stdin-stub` to feed `y` to the prompt.
3. Assertion: `.bak` file created with expected timestamp pattern.
4. Assertion: rewritten spec file contains explicit `## Business Problem`, etc., headings.
5. Assertion: final kit report shows `specsCreated: 1`, `errors: []`.
6. Assertion: mock MCP saw two `project.create_specs` calls (first blocked, second successful).

---

## Summary

| Layer | Tasks | Critical path |
|-------|-------|---------------|
| 1 — Foundation | T001, T002 | T001 → T002 |
| 2 — Truth-telling | T003–T008 | T002 → T003 → T006 → T008 |
| 3 — Self-service recovery | T009–T015 | T010 → T011 → T012 → T015 |

**Total**: 15 tasks. Each task ships as a discrete `wxkanban-agent implement 029/T0NN` invocation, producing fenced code per FR-027.
