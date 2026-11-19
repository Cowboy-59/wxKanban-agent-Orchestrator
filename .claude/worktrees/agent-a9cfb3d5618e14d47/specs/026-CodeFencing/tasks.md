# Task Breakdown: Code Fencing — Spec/Task Traceability Markers

**Feature**: Code Fencing — Spec/Task Traceability Markers
**Spec**: 026
**Date Generated**: 2026-05-13
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| #  | Task | Priority | Status |
|----|------|----------|--------|
| 1  | T001: Create `taskfences` Drizzle schema + migration | high | done |
| 2  | T002: Create `taskfencemodifications` Drizzle schema + migration | high | done |
| 3  | T003: Create `taskfencehistory` + `taskfenceslegacy` Drizzle schemas + migration | high | done |
| 4  | T004: Schema validation tests (Vitest + test Postgres) | high | done |
| 5  | T005: Language matrix + top-level declaration detector (FR-002, FR-005) | high | done |
| 6  | T006: Fence-emitter — create-new + MODIFIED-BY + replacement (FR-001/003/004) | high | done |
| 7  | T007: Drift detection via SHA-256 (FR-010) | high | done |
| 8  | T008: Fence-emitter unit tests | high | done |
| 9  | T009: `implement` command — skeleton, arg parsing, lifecycle + dependency gating (P-FR-1/2) | high | done |
| 10 | T010: AI provider integration for code generation (P-FR-3 steps 1–3) | high | done |
| 11 | T011: Wire `implement` to fence-emitter + DB writes (P-FR-3 step 4–5) | high | done |
| 12 | T012: Idempotency + drift handling + `--replace`/`--modify`/`--accept-drift`/`--dry-run` flags (P-FR-5/6) | high | done |
| 13 | T013: Mark task complete in `tasks.md` on success (P-FR-3 step 6) | high | done |
| 14 | T014: Register `implement` in CLI gateway + HTTP gateway + policy | high | done |
| 15 | T015: `implement` command unit tests | high | done |
| 16 | T016: `implement` end-to-end integration test (fixture spec/task) | high | done |
| 17 | T017: `auditfences` scanner — un-fenced + malformed + unknown task ID detection (FR-007 errors) | high | done |
| 18 | T018: `auditfences` warnings + counts (FR-007 warnings, info) | high | done |
| 19 | T019: `auditfences` flags: `--format json`, `--strict`, `--history`, `--baseline` | high | done |
| 20 | T020: `auditfences` unit tests | high | done |
| 21 | T021: Register `auditfences` in CLI + HTTP + policy | high | done |
| 22 | T022: `createtesttasks` emits fences for generated test functions (FR-006) | medium | done |
| 23 | T023: `dbpush` migration generator emits fences per migration file (FR-006) | medium | done |
| 24 | T024: `runqa` emits fences for regression scaffolds (FR-006) | medium | N/A |
| 25 | T025: Templates — `CLAUDE.md.fencing-snippet.md` + `auditfences-github-action.yml` (K-FR-1 #9) | medium | done |
| 26 | T026: Migration bundling + kit-migration applier in `dbpush` (K-FR-2) | high | done |
| 27 | T027: `verify-install.ts` updates (K-FR-5) | medium | done |
| 28 | T028: `pack-kit.sh` / npm publish prep (K-FR-6) | medium | done |
| 29 | T029: `README.md` — update "Commands by lifecycle stage" table, confirm `implement` operative | medium | done |
| 30 | T030: `docs/implement.md` (P-FR-8) | medium | done |
| 31 | T031: `docs/fencing.md` (P-FR-8) | medium | done |
| 32 | T032: `CHANGELOG.md` v0.2.0 entry + `package.json` bump to v0.2.0 | medium | done |
| 33 | T033: Update wxKanban `CLAUDE.md` with fencing convention (FR-008, A-6) | high | done |
| 34 | T034: Run `auditfences --baseline` against wxKanban tree (A-10) | medium | done |
| 35 | T035: Add `auditfences --strict` to wxKanban CI | medium | done |
| 36 | T036: Integration tests — QT-1 (fresh-write across all FR-005 languages) | high | done |
| 37 | T037: Integration tests — QT-2 (MODIFIED-BY insertion + stack + 5-line warning) | high | done |
| 38 | T038: Integration tests — QT-3 (full replacement at 80% threshold + flag overrides) | high | done |
| 39 | T039: Integration tests — QT-4 (auditfences exit codes + JSON schema) | high | done |
| 40 | T040: Integration tests — QT-5 (drift detection + `--accept-drift` logging) | high | done |
| 41 | T041: Integration tests — QT-6 (idempotent `implement` re-run, FR-009) | high | done |
| 42 | T042: Late-bound AC verification + lifecycle sync + status flip to Released | low | done |

## Dependencies

- **Phase 2 (T005–T008)** depends on **Phase 1 (T001–T004)** — fence-emitter writes to schema.
- **Phase 3 (T009–T016)** depends on **Phase 2** — `implement` uses fence-emitter.
- **Phase 4 (T017–T021)** depends on **Phase 2** — `auditfences` parses fences using the same matrix. Can run in parallel with Phase 3.
- **Phase 5 (T022–T024)** depends on **Phase 3 complete** — other emission sites reuse `implement`'s fence-emitter wiring.
- **Phase 6 (T025–T032)** depends on **Phases 3–5 complete** — kit packaging bundles all of the above.
- **Phase 7 (T033–T035)** depends on **Phase 6** — repo rollout requires a released kit.
- **Phase 8 (T036–T041)** runs alongside **Phases 3–5** as features land. T036–T041 must all pass before T042.
- **T042** is last (lifecycle status flip to `Released`).

---

## Task Details

### T001 — Create `taskfences` Drizzle schema + migration

**Target files**: `src/db/schema/taskfences.ts`, auto-generated migration under `drizzle/`
**Spec refs**: Data Model section
**Acceptance**:
- Table matches column list and types in the Data Model section.
- Unique constraint on (`projectid`, `filepath`, `unitkind`, `unitname`).
- FK to `projects.id` with `ON DELETE CASCADE`.
- Drizzle exports the table and inferred types.

### T002 — Create `taskfencemodifications` Drizzle schema + migration

**Target files**: `src/db/schema/taskfencemodifications.ts`
**Spec refs**: Data Model section, FR-003
**Acceptance**:
- Append-only design — no UPDATE/DELETE in service code.
- FK to `taskfences.id`.
- Chronological ordering enforced by `createdat` index.

### T003 — Create `taskfencehistory` + `taskfenceslegacy` Drizzle schemas + migration

**Target files**: `src/db/schema/taskfencehistory.ts`, `src/db/schema/taskfenceslegacy.ts`
**Spec refs**: Data Model section, FR-004, K-FR-4
**Acceptance**:
- `taskfencehistory` columns per Data Model.
- `taskfenceslegacy` stores (`projectid`, `filepath`, `contenthash`, `baselinedat`) — pre-026 file fingerprints.
- Both tables have indexes on `projectid` for tenant isolation.

### T004 — Schema validation tests (Vitest + test Postgres)

**Target files**: `tests/integration/schema-026-codefencing.test.ts`
**Acceptance**:
- All four tables created by migration on a fresh test DB.
- Inserts/updates/deletes respect the constraints in T001–T003.
- Cascade behavior on `projects` deletion verified.

### T005 — Language matrix + top-level declaration detector (FR-002, FR-005)

**Target files**: `wxkanban-agent/core/orchestrator/language-matrix.ts`, `wxkanban-agent/core/orchestrator/declaration-detector.ts`
**Acceptance**:
- Exports `LANGUAGE_MATRIX` keyed by file extension → comment syntax + JSX form.
- `detectTopLevelDeclarations(source: string, ext: string): Decl[]` returns the list of fence-eligible units (FR-002 list).
- Regex-based per language; `.json` returns empty list (suppressed).
- Unknown extensions throw `UnknownExtensionError`.

### T006 — Fence-emitter — create-new + MODIFIED-BY + replacement (FR-001/003/004)

**Target files**: `wxkanban-agent/core/orchestrator/fence-emitter.ts`
**Acceptance**:
- Exports `emitFence` with the signature defined in P-FR-4.
- Create-new path: wraps new declarations with BEGIN/END (FR-001).
- Existing-fence path: computes diff vs prior content, applies MODIFIED-BY (< 80% change) or full-replacement (≥ 80%).
- Returns `dbWrites` describing required `taskfences` / `taskfencemodifications` / `taskfencehistory` operations.

### T007 — Drift detection via SHA-256 (FR-010)

**Target files**: extends `fence-emitter.ts` and adds `wxkanban-agent/core/orchestrator/content-hash.ts`
**Acceptance**:
- SHA-256 computed over the fenced body excluding the BEGIN/END/MODIFIED-BY lines.
- Hash compared against `taskfences.contenthash`; mismatch returned as a `DriftDetected` result.
- `--accept-drift` override logged with reason.

### T008 — Fence-emitter unit tests

**Target files**: `wxkanban-agent/tests/unit/fence-emitter.test.ts`
**Acceptance**:
- Coverage matrix: each language in FR-005 × each rule in FR-001/003/004/009/010.
- JSON exemption verified.
- 80% threshold edge cases (79% vs 81%) verified.
- 5-line MODIFIED-BY warning verified.

### T009 — `implement` command — skeleton, arg parsing, lifecycle + dependency gating (P-FR-1/2)

**Target files**: `wxkanban-agent/core/orchestrator/command-handlers/implement.ts`
**Acceptance**:
- Accepts `<scope>/<task>` positional + flags listed in CLI Contracts.
- Reads `.wxai/project.json`; refuses to run unless active scope's stage is `Implementation`.
- Reads `specs/<scope>-<slug>/tasks.md`; refuses if task dependencies are incomplete.
- Exit codes per CLI Contracts section.

### T010 — AI provider integration for code generation (P-FR-3 steps 1–3)

**Target files**: extends `implement.ts`; reuses existing AI provider adapter under `wxkanban-agent/adapters/`
**Acceptance**:
- Builds prompt from spec + task + adjacent context (data-model excerpts, contracts).
- Calls Gemini primary, OpenAI fallback (per CLAUDE.md tech stack).
- Parses structured response `[{ path, body, action }]`.

### T011 — Wire `implement` to fence-emitter + DB writes (P-FR-3 step 4–5)

**Target files**: extends `implement.ts`
**Acceptance**:
- Every file from the AI response passes through `emitFence` before disk write.
- `dbWrites` from fence-emitter are applied in a single transaction.
- File write and DB write fail atomically (write to tmp + rename; rollback DB on filesystem error).

### T012 — Idempotency + drift handling + `--replace`/`--modify`/`--accept-drift`/`--dry-run` flags (P-FR-5/6)

**Target files**: extends `implement.ts`
**Acceptance**:
- Re-running with no input change produces zero file/DB writes.
- Drift detected → exit 1 without `--accept-drift`.
- `--dry-run` prints fenced output + would-be DB writes; no side effects.
- `--replace` / `--modify` override 80% heuristic.

### T013 — Mark task complete in `tasks.md` on success (P-FR-3 step 6)

**Target files**: extends `implement.ts`; adds `wxkanban-agent/core/orchestrator/tasks-md-writer.ts`
**Acceptance**:
- Status column in the task row flips `todo` → `done` on successful run.
- The flip is atomic (tmp + rename) and skipped on `--dry-run`.
- Idempotent — re-running on a `done` task is a no-op.

### T014 — Register `implement` in CLI gateway + HTTP gateway + policy

**Target files**: `wxkanban-agent/apps/command-gateway/src/cli.ts`, `wxkanban-agent/apps/command-gateway/src/http.ts`, `wxkanban-agent/core/policy/command-policy.ts`
**Acceptance**:
- `wxkanban-agent implement --help` exits 0 with usage text.
- POST `/commands/implement` accepts the same arguments.
- Policy entry: `implement` allowed only when stage = `Implementation`.

### T015 — `implement` command unit tests

**Target files**: `wxkanban-agent/tests/unit/implement-command.test.ts`
**Acceptance**:
- Arg parsing, lifecycle gating, dependency gating all covered.
- Mocked AI provider returns canned responses.

### T016 — `implement` end-to-end integration test (fixture spec/task)

**Target files**: `wxkanban-agent/tests/integration/implement-end-to-end.test.ts`
**Acceptance**:
- Runs `implement` against a fixture spec under `tests/fixtures/spec-zzz/`.
- Verifies file written, fence present, three DB tables populated.
- Second run is a no-op.

### T017 — `auditfences` scanner — un-fenced + malformed + unknown task ID detection (FR-007 errors)

**Target files**: `wxkanban-agent/core/orchestrator/command-handlers/auditfences.ts`
**Acceptance**:
- Walks repo tree, parses each file per `LANGUAGE_MATRIX`.
- Detects top-level declarations missing BEGIN/END (error `UNFENCED_DECL`).
- Detects BEGIN without END or mismatched IDs (error `MALFORMED_FENCE`).
- Cross-references fence IDs against `specs/*/tasks.md`; error `UNKNOWN_TASK` on miss.
- Exits 1 on any error.

### T018 — `auditfences` warnings + counts (FR-007 warnings, info)

**Target files**: extends `auditfences.ts`
**Acceptance**:
- Warning when MODIFIED-BY lines exceed 5 per fence.
- Warning when MODIFIED-BY references unknown task ID.
- Info-level summary: total fences per scope and per task.
- `--strict` promotes warnings to errors.

### T019 — `auditfences` flags: `--format json`, `--strict`, `--history`, `--baseline`

**Target files**: extends `auditfences.ts`
**Acceptance**:
- `--format json` produces output matching the schema in CLI Contracts.
- `--strict` per T018.
- `--history <scope>/<task>` joins `taskfences` ∪ `taskfencemodifications` ∪ `taskfencehistory`.
- `--baseline` writes current tree's hash set into `taskfenceslegacy`; subsequent runs treat legacy files as info-only.

### T020 — `auditfences` unit tests

**Target files**: `wxkanban-agent/tests/unit/auditfences.test.ts`
**Acceptance**:
- Coverage of every error/warning/info class.
- JSON output schema validated.
- `--baseline` round-trip verified.

### T021 — Register `auditfences` in CLI + HTTP + policy

**Target files**: same as T014
**Acceptance**:
- `wxkanban-agent auditfences --help` exits 0.
- Policy: allowed in every stage.

### T022 — `createtesttasks` emits fences for generated test functions (FR-006)

**Target files**: `wxkanban-agent/core/orchestrator/command-handlers/createtesttasks.ts` (or wherever the command lives once added; if not yet present, this task creates the stub and adds fencing in the same pass)
**Acceptance**:
- Each generated test function wrapped with a fence owned by the QA task ID.
- Fence emitted using the same `emitFence` module.

### T023 — `dbpush` migration generator emits fences per migration file (FR-006)

**Target files**: extends `wxkanban-agent/dbpush.ts` and/or `wxkanban-agent/core/orchestrator/command-handlers/dbpush.ts`
**Acceptance**:
- Each generated migration `.sql` file has one fence wrapping its body.
- Fence comment syntax `--` (SQL).
- Owner task is the task that triggered the migration (from the active `implement` context).

### T024 — `runqa` emits fences for regression scaffolds (FR-006)

**Target files**: wherever `runqa` writes scaffolds (TBD — investigate during task)
**Acceptance**:
- Generated regression scaffolds fenced with the QA task ID.
- If no scaffold writes exist yet, document this as N/A and close the task.

### T025 — Templates — `CLAUDE.md.fencing-snippet.md` + `auditfences-github-action.yml` (K-FR-1 #9)

**Target files**: `wxkanban-agent/templates/CLAUDE.md.fencing-snippet.md`, `wxkanban-agent/templates/auditfences-github-action.yml`
**Acceptance**:
- Snippet is the canonical text consumer projects paste into their CLAUDE.md.
- GH Action: triggers on PR, runs `wxkanban-agent auditfences --strict`, fails the check on non-zero exit.

### T026 — Migration bundling + kit-migration applier in `dbpush` (K-FR-2)

**Target files**: `wxkanban-agent/templates/migrations/0001-026-codefencing.sql`, extends `dbpush.ts`
**Acceptance**:
- Migration file generated from T001–T003 schemas and bundled in the kit tarball.
- `dbpush` discovers bundled migrations, applies un-applied ones to the consumer's `DATABASE_URL` after consumer migrations.
- `kitmigrations` tracking table verified (created if missing).

### T027 — `verify-install.ts` updates (K-FR-5)

**Target files**: `wxkanban-agent/scripts/verify-install.ts`
**Acceptance**:
- All five K-FR-5 checks run and report pass/fail with clear messages.
- Non-zero exit on any failure.

### T028 — `pack-kit.sh` / npm publish prep (K-FR-6)

**Target files**: `wxkanban-agent/scripts/pack-kit.sh` (create or extend)
**Acceptance**:
- Produces a tarball containing all K-FR-1 deliverables.
- Tarball installable via `npm install ./wxkanban-agent-v0.2.0.tgz`.
- No author-side state baked in (BUG-10 guardrail).

### T029 — `README.md` — update "Commands by lifecycle stage" table, confirm `implement` operative

**Target files**: `wxkanban-agent/README.md`
**Acceptance**:
- Implementation stage row lists `implement` as available.
- `auditfences` listed under cross-cutting commands.

### T030 — `docs/implement.md` (P-FR-8)

**Target files**: `wxkanban-agent/docs/implement.md`
**Acceptance**:
- Command reference with all flags.
- Example: create-new file.
- Example: modify-existing fenced file.
- Example: full-replacement override.

### T031 — `docs/fencing.md` (P-FR-8)

**Target files**: `wxkanban-agent/docs/fencing.md`
**Acceptance**:
- Mirrors FR-001 through FR-010 of this spec.
- Language matrix table.
- MODIFIED-BY behavior worked example.
- `auditfences` usage section.

### T032 — `CHANGELOG.md` v0.2.0 entry + `package.json` bump to v0.2.0

**Target files**: `wxkanban-agent/CHANGELOG.md`, `wxkanban-agent/package.json`
**Acceptance**:
- CHANGELOG entry covers the four bullets in K-FR-3.
- `package.json` version field updated.

### T033 — Update wxKanban `CLAUDE.md` with fencing convention (FR-008, A-6)

**Target files**: `CLAUDE.md` (repo root)
**Acceptance**:
- New section titled "Code Fencing Convention" injected (content from `templates/CLAUDE.md.fencing-snippet.md`).
- States: every code unit must be fenced; fences written only by orchestrator; un-fenced code is a defect; route through `implement` to remediate.

### T034 — Run `auditfences --baseline` against wxKanban tree (A-10)

**Target files**: none (runtime task)
**Acceptance**:
- Command run; `taskfenceslegacy` populated with current tree's hash set.
- Subsequent `auditfences` exits 0 (info-level findings only).

### T035 — Add `auditfences --strict` to wxKanban CI

**Target files**: `.github/workflows/*.yml` (existing CI workflow file)
**Acceptance**:
- CI step added that runs `wxkanban-agent auditfences --strict` on every PR.
- PR is blocked if new un-fenced code (non-legacy) appears.

### T036 — Integration tests — QT-1 (fresh-write across all FR-005 languages)

**Target files**: `wxkanban-agent/tests/integration/qt-1-fresh-write.test.ts`
**Acceptance**:
- One test per language extension in FR-005.
- Each verifies correct fence syntax and DB row insertion.

### T037 — Integration tests — QT-2 (MODIFIED-BY insertion + stack + 5-line warning)

**Target files**: `wxkanban-agent/tests/integration/qt-2-modified-by.test.ts`
**Acceptance**:
- Sequential `implement` runs against the same file with different task IDs accumulate MODIFIED-BY lines.
- 6th MODIFIED-BY triggers warning in `auditfences`.

### T038 — Integration tests — QT-3 (full replacement at 80% threshold + flag overrides)

**Target files**: `wxkanban-agent/tests/integration/qt-3-replacement.test.ts`
**Acceptance**:
- 81% diff → full replacement.
- 79% diff → MODIFIED-BY.
- `--replace` overrides 79% to full replacement.
- `--modify` overrides 81% to MODIFIED-BY.

### T039 — Integration tests — QT-4 (auditfences exit codes + JSON schema)

**Target files**: `wxkanban-agent/tests/integration/qt-4-auditfences.test.ts`
**Acceptance**:
- Clean tree → exit 0.
- Un-fenced declaration → exit 1, JSON output validates against schema.
- Unknown task ID → exit 1.

### T040 — Integration tests — QT-5 (drift detection + `--accept-drift` logging)

**Target files**: `wxkanban-agent/tests/integration/qt-5-drift.test.ts`
**Acceptance**:
- Hand-edit inside a fence → `implement` exits 1.
- `--accept-drift` proceeds; `taskfencemodifications` row written with recognizable description.

### T041 — Integration tests — QT-6 (idempotent `implement` re-run, FR-009)

**Target files**: `wxkanban-agent/tests/integration/qt-6-idempotent.test.ts`
**Acceptance**:
- Two consecutive identical `implement` runs produce zero file changes and zero new DB rows on the second run.

### T042 — Late-bound AC verification + lifecycle sync + status flip to Released

**Target files**: `specs/026-CodeFencing/lifecycle.json`, `specs/projectlifecycle.md`
**Acceptance**:
- All A-1 through A-10 acceptance criteria pass.
- `lifecycle.json` phase flipped to `released`.
- `specs/projectlifecycle.md` regenerated with updated phase distribution charts.
- `projectdocuments` row for `lifecycle` doctype upserted per CLAUDE.md convention.
