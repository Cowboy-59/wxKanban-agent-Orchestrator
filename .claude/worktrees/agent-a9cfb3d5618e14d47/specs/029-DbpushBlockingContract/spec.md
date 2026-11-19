# 029 — Dbpush Blocking Contract

**Status**: Design
**Created**: 2026-05-25
**Owner**: kit maintainer
**Origin**: Bug report — YappChat (`wxkanban-agent/bug-reports/2026-05-25-dbpush-silent-success-on-blocked-specs.md`)

---

## Overview

`wxkanban-agent dbpush` is the kit's promotion path from local spec files on disk into the wxKanban database via the hosted MCP server. Today it can return a green `status: success` report with non-zero spec/task counts even though the MCP server rejected every spec at a preflight quality gate — operators only learn the push failed when the UI is empty hours later. This scope hardens the contract between the kit and the MCP so blocked specs surface as visible push errors, and aligns the kit's spec template with the preflight's required section headings so well-formed specs aren't rejected for cosmetic reasons. Discovered 2026-05-25, as reported by the YappChat project (kit v1.2.6), where all 11 specs were silently blocked.

## Business Problem

Customers running the kit's promotion path cannot trust the report they receive. When the hosted MCP server's preflight quality gate rejects a spec, it returns HTTP 200 with `{success: false, blocked: true, blockingIssues: [...]}`; the kit's `callMcpTool` only throws on non-2xx, and `pushNewSpec` unconditionally increments its `specsCreated` and `tasksCreated` counters from the local artifact rather than from the server's response. The result is a green CLI report claiming N specs and M tasks were written while zero rows actually land in the database. This breaks the kit's core promise — that `dbpush` is a deterministic, auditable promotion step — and silently corrupts downstream signals: the dashboard reads empty, `capture_event` logs a `document_updated` event whose metadata claims `pushErrors: 0`, and operators waste time investigating a "missing UI" bug whose true cause is upstream. A compounding template defect (the kit emits required sections as bold labels inside `## Overview` rather than as their own headings) means even well-authored specs trip the preflight, turning a rare edge case into the default outcome for new customer projects.

## Actors

- Primary: Kit operator (customer or wxKanban author). Runs `wxkanban-agent dbpush` from a project root to promote local spec files into the wxKanban database; expects the CLI's exit status, error list, and printed counts to truthfully reflect what landed server-side; acts on those signals (re-runs, opens UI, hands off to QA).
- Secondary: Hosted MCP server (`mcp.wxperts.com`). Receives `project.create_specs` calls, runs the preflight quality gate, and either persists the spec+tasks or returns a blocked envelope; owns the authoritative answer to "did anything land?", so the kit must treat the server's response as ground truth.
- Secondary: Spec-template author (kit maintainer). Maintains the `createspecs` scope template inside the kit; decisions about which `##` headings AND which `Primary:` / `Secondary:` line shapes the template emits directly drive whether customer projects pass the MCP preflight on the first try.
- Secondary: wxKanban dashboard / event consumers. Read `projectdocuments`, `tasks`, and `projectevents` to render lifecycle state; currently get inconsistent signals when a `document_updated` event is captured for a push that wrote zero rows.

## Success Metrics

1. **Zero silent-success reports.** Across the kit's `dbpush` integration test suite plus a manual probe against `mcp.wxperts.com` using a deliberately blocked spec, 100% of pushes that the MCP rejects produce a CLI report whose `push.errors` length equals the number of blocked specs and whose `push.specsCreated` / `push.tasksCreated` counts match what actually landed in the database (verified via direct `project.list_open_items` query). Target: 0 false-success reports in 50 consecutive runs.
2. **Counts match server truth.** For each successful spec, `push.specsCreated` is derived from `response.spec != null` and `push.tasksCreated` from `response.tasks.length` — not from the local artifact. Validated by a unit test that mocks the MCP envelope and asserts the kit reads server-reported values.
3. **`capture_event` metadata is accurate.** The `document_updated` event emitted at end-of-run reports `pushErrors` equal to `totals.errors.length` *after* blocked-envelope detection. Validated by an integration test that asserts the persisted event matches the CLI report.
4. **First-run pass rate on fresh customer projects.** A scope produced by the kit's `createspecs` template, with no human heading edits, passes the MCP preflight on the first `dbpush` attempt. Target: ≥ 95% of templated scopes (the 5% slack covers user-entered placeholder text that legitimately should fail). Measured by running `createspecs` → `dbpush` against a clean project for each of the 7 preflight checks.
5. **Migration cost for YappChat.** The 11 existing YappChat specs land in the database after applying the heading-shape migration documented by this scope, with no further code changes. Confirms the fix is sufficient for the reported regression.

## Scope Boundary

This scope covers six code surfaces, all inside this repository:

1. **Kit MCP client envelope handling** — `wxkanban-agent/core/orchestrator/mcp-client.ts` and `wxkanban-agent/core/http/mcp-client.ts`. Add a typed return shape that surfaces `success`, `blocked`, and `blockingIssues` to callers without breaking the existing throw-on-non-2xx contract.
2. **Kit dbpush blocked-envelope detection** — `wxkanban-agent/dbpush.ts` (`pushNewSpec`, `pushExistingSpec`) and `wxkanban-agent/core/orchestrator/command-handlers/dbpush.ts`. After every `callMcpTool` to a write tool (`project.create_specs`, `project.upsert_document`), inspect the response: on `success === false` push `blockingIssues` into `r.errors`; otherwise count `specsCreated` from `response.spec` and `tasksCreated` from `response.tasks.length`.
3. **Kit dbpush Phase 2 idempotency read** — `phase2Compare` in `wxkanban-agent/dbpush.ts`. Derive `knownSpecNumbers` from the actual `project.list_open_items` envelope (which has `tasks` / `documents` / `events`, no `specs`). Fallback: parse the `[NNN-T###]` prefix from task titles when no `specNumber` field is present.
4. **MCP server contract for blocked tools** — `mcp-server/src/server.ts`. When `project.create_specs` (and any other write tool with a preflight) returns `success: false, blocked: true`, also set HTTP status 422 (Unprocessable Entity) so misbehaving clients fail loudly. Body shape stays the same for backward compat.
5. **Shared preflight module** — extract the preflight rules into a new top-level `shared/preflight/` package exporting `runPreflight(scopeMarkdown) → {ok, missingSections, blockingIssues, checks}`. Both `mcp-server/` and `wxkanban-agent/` import from there. Decoupling avoids the kit depending on the server's tree.
6. **`createspecs` scope template** — the spec template emitted by `wxkanban-agent` must produce explicit `## Business Problem`, `## Actors`, `## Success Metrics`, `## Scope Boundary`, `## Out of Scope`, and `## Open Questions` headings (not bold labels inside `## Overview`), so the MCP preflight passes on first generation.
7. **Tests** — unit tests for the kit changes (mocked MCP envelopes), one integration test that asserts `dbpush` reports a server-blocked push as an error, a CI guard on the spec template that fails if a templated scope would not pass the preflight section check, and a stdin-stub helper for testing the interactive `y/N` prompt.
8. **YappChat migration playbook** — a short remediation note (in this scope's plan, not in YappChat) documenting the heading-split steps so YappChat's 11 specs can land after the kit fix ships.

## Out of Scope

1. **Rewriting the preflight quality gate itself.** The 7-check section validator on the MCP stays as-is; this scope aligns the kit's template to it, not the reverse. Loosening or expanding preflight rules is a separate scope.
2. **Migrating YappChat's 11 spec files.** The migration *playbook* is in scope (item 8 above), but executing it against the YappChat repo happens there, not here. YappChat is a kit consumer, not a kit codebase.
3. **Task status sync on re-push.** `pushExistingSpec` already leaves task status untouched on re-runs (documented gap, needs `T-ID → UUID` resolution server-side). This scope does not address it; the only change to `pushExistingSpec` is blocked-envelope detection on `upsert_document`.
4. **Replacing the `list_open_items` envelope.** Phase 2 reads tasks to infer scope numbers; this scope does not add a new `project.list_specs` MCP tool even though one would simplify the kit. If/when that tool is added, `phase2Compare` can be tightened, but the title-prefix fallback shipped here remains the floor.
5. **`capture_event` schema changes.** The event keeps its current shape; only the *values* in `metadata.pushErrors` become accurate, and one new field (`blockingIssuesCount`) is added. New event types (e.g. `dbpush_blocked`) are deferred.
6. **General retry / auto-fix on blocked envelopes.** When the MCP returns `blocked`, the kit surfaces the issues and exits — it does not attempt to rewrite the spec, prompt the user, or re-call the tool for *content* blocking issues. **Carve-out**: heading-shape blocks (a section appears as a bold label inside another section rather than as its own `##` heading) get the interactive auto-fix path defined in FR-017–FR-020. All other classes of blocking issue remain author-must-fix-by-hand.
7. **Published npm distribution.** Per the project's source-of-truth model, the local kit ships these fixes; bumping the published `wxkanban-agent` package on npm is deferred until the broader publication strategy is settled.
8. **Changes to wxKanban dashboard UI.** The dashboard already renders whatever lands in `projectdocuments` / `tasks`; once the kit stops lying about counts, the UI is correct by default. No client-side work needed.

## Open Questions

All decisions captured below were resolved during the interactive `buildscope` session on 2026-05-25. Listed for traceability.

1. **HTTP status for blocked envelopes — 422 vs. 200.** **Decision: ship HTTP 422 Unprocessable Entity** with the existing JSON body shape. Both the MCP server and the kit gain matching contract awareness in this scope; legacy clients that only check HTTP status now fail loudly instead of silently accepting blocks.
2. **Backward-compat window for kit envelope handling.** **Decision: keep both checks.** The kit recognizes a blocked envelope whether it arrives as HTTP 422 *or* HTTP 200 with `success: false`. Belt + suspenders — costs nothing, protects against an older MCP paired with a newer kit (and vice versa).
3. **Template heading order.** **Decision: confirmed canonical order** — Overview → Business Problem → Actors → Success Metrics → Scope Boundary → Out of Scope → Open Questions → Functional Requirements.
4. **CI guard location.** **Decision: kit-side only, with shared preflight module.** The preflight is extracted into `shared/preflight/` (FR-014); the kit's CI imports it to test that a templated scope clears the preflight. The MCP server's tests cover its end of the same module independently.
5. **YappChat migration owner.** **Decision: interactive in-kit auto-correction.** When the kit detects a 422 with heading-shape blocking issues, it offers to auto-correct the local spec.md files (with `.bak` backups) and re-push. This serves YappChat's migration AND every future customer who hits the same shape problem.

## Functional Requirements

### Kit MCP client envelope handling

**FR-001.** `callMcpTool` in `wxkanban-agent/core/orchestrator/mcp-client.ts` MUST return a typed envelope `{success: boolean, blocked?: boolean, blockingIssues?: string[], data: T}` where `data` is the parsed payload. Existing throw-on-non-2xx behavior is preserved. The HTTP layer adds a new case: HTTP **422** is **not** treated as an error — its JSON body is returned with `success: false` set from the body so callers can branch.

**FR-002.** The same envelope contract MUST apply to `wxkanban-agent/core/http/mcp-client.ts` (the newer parallel client). Both clients share a single response-parsing helper to prevent drift.

**FR-003.** When the server returns HTTP 200 with a body shape `{success: false, blocked: true, blockingIssues: [...]}` (the legacy/backward-compat case), `callMcpTool` MUST recognize it and surface the same envelope as the 422 path.

**FR-004.** Unit tests MUST cover four envelope variants: (a) HTTP 200 success, (b) HTTP 422 blocked, (c) HTTP 200 with `success: false` (legacy block), (d) HTTP 5xx error (still throws).

### Kit dbpush blocked-envelope detection

**FR-005.** `pushNewSpec` in `wxkanban-agent/dbpush.ts` MUST inspect the `callMcpTool('project.create_specs', ...)` envelope before incrementing counters. On `success === false`, it MUST push each entry of `blockingIssues` into `r.errors` prefixed with the scope number (e.g. `"002: Business Problem must be specific and non-placeholder."`) and MUST NOT increment `specsCreated` or `tasksCreated`.

**FR-006.** On `success === true`, `pushNewSpec` MUST count `specsCreated` from `response.data.spec != null` (0 or 1) and `tasksCreated` from `response.data.tasks?.length ?? 0`. Counters are no longer derived from the local artifact.

**FR-007.** `pushExistingSpec` MUST apply the same envelope inspection to every `callMcpTool('project.upsert_document', ...)` call. Blocked documents append to `r.errors`; successful ones increment `r.docsUpserted` from the server response.

**FR-008.** The same envelope inspection MUST be applied in `wxkanban-agent/core/orchestrator/command-handlers/dbpush.ts` (newer parallel handler). The two paths share a helper.

### Kit dbpush Phase 2 idempotency

**FR-009.** `phase2Compare` in `wxkanban-agent/dbpush.ts` MUST derive `knownSpecNumbers` from the real `project.list_open_items` envelope shape (`tasks` / `documents` / `events`). The current `resp.specs` branch is removed.

**FR-010.** When task records lack a `specNumber` field, `phase2Compare` MUST fall back to parsing the leading `[NNN-T###]` prefix from each task's `title` (regex `^\[(\d{3})-T\d+\]`). Tasks whose titles do not match are ignored for scope-number derivation, not treated as errors.

**FR-011.** `knownTaskIdsBySpec` MUST be populated from the task `id` and the parsed scope number from FR-010 when `specNumber` is absent. If a future MCP envelope adds an explicit `specs[]` array or a `project.list_specs` tool, the prefix parser remains the floor — it does not get removed.

### MCP server contract for blocked tools

**FR-012.** When `project.create_specs` in `mcp-server/src/server.ts` (and any other write tool with a preflight) computes a blocked result, the handler MUST return HTTP **422 Unprocessable Entity**. Response body shape is unchanged: `{success: false, blocked: true, message, blockingIssues, spec: null, tasks: []}`.

**FR-013.** Non-blocked, non-success failures (server error, permission denied, schema mismatch) keep their existing status codes (5xx, 401/403, 400). Only the "preflight blocked" case becomes 422.

### Shared preflight module

**FR-014.** The preflight logic MUST be extracted from `mcp-server/src/server.ts` into a new top-level package `shared/preflight/` exporting `runPreflight(scopeMarkdown: string) → {ok: boolean, missingSections: string[], blockingIssues: string[], checks: Record<string, boolean>}`. Both `mcp-server/` and `wxkanban-agent/` import from there; no logic is duplicated. The new package has its own minimal `package.json` and `tsconfig.json` and is referenced via workspace links or relative paths per the existing repo build setup.

### createspecs scope template

**FR-015.** The scope template emitted by `wxkanban-agent`'s `createspecs` command MUST produce explicit top-level headings in this canonical order: `## Overview` → `## Business Problem` → `## Actors` → `## Success Metrics` → `## Scope Boundary` → `## Out of Scope` → `## Open Questions` → `## Functional Requirements`. Section bodies remain customer-authored; only the heading scaffolding is mandated.

**FR-015a.** The `## Actors` section template MUST emit a bulleted list whose items begin with `Primary:` or `Secondary:` line labels (regex `(?:^|\n)\s*[-*]?\s*(Primary|Secondary)\s*:\s*(.+)$`) — this is the exact extraction pattern the preflight's `extractActorValue()` uses (`mcp-server/src/utils/project-kit.ts`). Bold-em-dash forms like `**Primary actor — Name**` do NOT match and fail the preflight even when the `## Actors` heading is present. Discovered while dogfooding this scope on 2026-05-25: spec 029's initial draft used the bold-em-dash form and was blocked with `hasActors: false` despite having the heading.

**FR-016.** A freshly templated scope (with placeholder text in each section sufficient to clear the preflight's content checks) MUST pass `runPreflight()` on first generation. Verified by FR-024.

### Interactive heading correction on 422

**FR-017.** When `dbpush` receives a 422 / blocked envelope, the kit MUST call `runPreflight()` (imported from `shared/preflight/`, per FR-014) against each affected local `spec.md`. For each section in the returned `missingSections`, the kit classifies it as **heading-shape** if the section's required label appears as a bold (`**Label**` or `**Label:**`) inside another `##` block in the file, otherwise **content**. Classification is deterministic from the canonical preflight signal, not from server message strings.

**FR-018.** If at least one blocking issue is heading-shape AND the CLI is running in a TTY (interactive), `dbpush` MUST prompt the operator: print the affected scope numbers, the heading-shape issues only, and `Auto-correct heading shape and retry push? [y/N]:`. Default on Enter is **No**.

**FR-019.** On `y`, the kit MUST rewrite the affected local `spec.md` files in place: each `**Label**` bold inside another section is split out into its own `## Label` heading at the appropriate position, with the body text following. The original file is backed up to `spec.md.bak-<ISO>` before the rewrite. After all affected files are rewritten, `dbpush` re-runs Phase 1 → Phase 4 once (no second auto-retry loop).

**FR-020.** **Content** blocking issues are surfaced as `r.errors` entries (per FR-005) and never auto-corrected. The prompt in FR-018 is not shown when no heading-shape issues are present — those blocks just fail loudly. Non-TTY runs skip the prompt entirely and exit with all blocking issues as errors (CI-safe).

### capture_event accuracy

**FR-021.** The `document_updated` event emitted at end-of-run MUST report `pushErrors: totals.errors.length` *after* blocked-envelope detection (FR-005, FR-007). `validationErrors` continues to mean Phase 1 (markdown structural) errors; the new `blockingIssuesCount: number` field is added to event metadata for downstream observability.

### Tests

**FR-022.** Unit tests for `wxkanban-agent/tests/unit/`: (a) `callMcpTool` envelope variants per FR-004; (b) `pushNewSpec` blocked envelope → `r.errors` populated, counters zero; (c) `pushNewSpec` success → counters derived from server response, not local artifact; (d) `phase2Compare` parses `[NNN-T###]` prefix from task titles; (e) heading-shape classifier (FR-017) against fixture spec files.

**FR-023.** Integration test in `wxkanban-agent/tests/integration/`: spin up a fixture project with one valid spec and one heading-shape-broken spec, run `dbpush` against a mocked MCP that returns 422 for the broken one, assert (i) the kit's report shows `specsCreated: 1, errors: [...one entry...]`, (ii) the `capture_event` payload reports `pushErrors: 1, blockingIssuesCount: N`, (iii) running with a stdin stub returning `y` rewrites the broken file and re-pushes successfully. A new stdin-stub helper is added to the kit's test infrastructure as part of this scope.

**FR-024.** CI guard test in `wxkanban-agent/tests/integration/template-passes-preflight.test.ts`: render the `createspecs` template with default placeholder text, feed it through the imported `runPreflight()`, assert `ok === true`. This is the regression fence for FR-015 / FR-016.

**FR-025.** MCP server tests in `mcp-server/tests/`: integration test asserting `project.create_specs` returns HTTP 422 with the correct body when preflight blocks, HTTP 200 on success. Standalone `runPreflight()` unit tests live with the shared package at `shared/preflight/tests/`.

### YappChat migration playbook

**FR-026.** A short migration note MUST be included in this scope's `plan.md` (not in YappChat) documenting: (a) which sections need to be split out, (b) the in-place rewrite the kit performs (so a YappChat operator can either run `dbpush` interactively and answer `y`, or perform the same rewrite by hand), (c) the `.bak` cleanup step after a successful re-push.

### Non-functional

**FR-027.** All new top-level functions, route handlers, and Drizzle changes added by this scope MUST carry a `[SCOPE 029 / T###]` BEGIN/END fence per CLAUDE.md spec 026. Fences are written by `wxkanban-agent implement`, not by hand.

**FR-028.** Logging: any new log lines added by FR-005 / FR-007 / FR-017–FR-019 MUST go through Pino (no `console.log`), at level `warn` for blocked envelopes and `info` for successful auto-corrections.

**FR-029.** TypeScript: no `any`, no `@ts-ignore`. The shared envelope type from FR-001 is exported from a single module both clients import.
