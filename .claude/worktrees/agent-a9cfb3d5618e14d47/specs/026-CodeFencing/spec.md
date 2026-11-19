# Spec 026: Code Fencing — Spec/Task Traceability Markers

## Overview

# Spec 026: Code Fencing — Spec/Task Traceability Markers

**Spec Number**: 026
**Status**: `draft`
**Created**: 2026-05-13
**Depends On**: 019-agent-orchestrator-kit (CLI host + `implement` command), pending `implement` repair (carried as prerequisite section in this spec)
**Source**: in-conversation buildscope, 2026-05-13

---

## Overview

Every block of code authored by the wxkanban-agent orchestrator is wrapped, at the function / class / route-handler / migration level, with a single-line comment fence that names the spec and task that produced it:

    // [SCOPE 013 / T042] BEGIN — Audit log retention pruning
    export function pruneAuditLogs(...) { ... }
    // [SCOPE 013 / T042] END

Fences make spec→code lineage greppable: any reader (or auditor, or future maintainer) can find every line a task introduced, see how later tasks modified or replaced it, and detect un-fenced code as evidence of work performed outside the orchestrator. This directly supports the kit's educational mission — students see, on every function, the discipline of "code exists because a spec and a task asked for it."

Fences are written exclusively by the orchestrator (`implement` for production code, `createtesttasks` for tests, migration generators for SQL). They are never hand-written; un-fenced code is treated as a defect.

This spec ships three things in the wxkanban-agent kit:

1. **Repaired `implement` command** (prerequisite — see Section 5) capable of emitting fences as it writes.
2. **Fence-writing behavior** in `implement`, `createtesttasks`, and the migration generator, governed by the rules in Section 3.
3. **`auditfences` CLI command** that scans a project tree, reports un-fenced top-level declarations, orphaned `MODIFIED-BY` lines, and fences that reference unknown scope/task IDs.

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actors** | wxkanban-agent CLI (writer); developer / auditor (reader of fences and `auditfences` reports) |
| **Key Value** | Every line of code traces to a spec + task, by inspection of the source alone. Reinforces "nothing outside the orchestrator." |
| **Scope Boundary (IN)** | Single-line `BEGIN`/`END` fences at function/class/handler/migration granularity; `MODIFIED-BY` nesting on partial later-task edits; full-replacement rule; per-language comment syntax matrix; emission by `implement` / `createtesttasks` / migration generator; `auditfences` CLI; kit-download packaging of all of the above; CLAUDE.md rule documenting the convention |
| **Scope Boundary (OUT)** | Line-level or statement-level fencing (function-level only); fencing of JSON files; retroactive fencing of pre-026 code (a follow-on scope); IDE plugin for fence visualization; renaming / restructuring of existing fence-less code |

---

## Functional Requirements

### FR-001 — Fence syntax (single line, BEGIN / END)
Every fence is exactly two single-line comments using the language's native comment syntax:

    <comment> [SCOPE <nnn> / T<nnn>] BEGIN — <short description>
    ...code...
    <comment> [SCOPE <nnn> / T<nnn>] END

- `<nnn>` for SCOPE is the 3-digit zero-padded spec number (e.g. `013`, `026`).
- `T<nnn>` is the task ID exactly as it appears in that spec's `tasks.md` (e.g. `T042`, `T100`). Zero-padding is preserved verbatim from the source.
- `<short description>` is ≤ 60 characters; must match the task's `tasks.md` title (truncated with `…` if longer). The orchestrator copies it verbatim from the task record — humans never author it.
- Exactly one space surrounds each token; the em-dash before the description is literal `—` (U+2014), not `--`.

### FR-002 — Fence granularity (function-level only, not statement-level)
A fence wraps exactly one of:

- An exported or top-level function declaration
- A class declaration (the fence wraps the entire class; methods inside inherit the class's fence)
- An Express route handler registration (the `app.get(...)` / `router.post(...)` call expression and its handler argument)
- A Drizzle schema table definition (one `pgTable(...)` export)
- A SQL migration file's top-level statement block (the whole migration body, one fence per file)
- A React component declaration (function component or class component)

Statement-level fencing inside an existing function is forbidden. If a task's work cannot be expressed as one of the above units, the task is split during `createtesttasks` / `implement` planning so it can.

### FR-003 — `MODIFIED-BY` nesting on partial later-task edits
When a later task modifies code inside an existing fence without replacing it, the orchestrator inserts a single `MODIFIED-BY` line immediately after the `BEGIN` line:

    // [SCOPE 013 / T042] BEGIN — Audit log retention pruning
    // [SCOPE 015 / T011] MODIFIED-BY — added soft-delete branch
    export function pruneAuditLogs(...) { ... }
    // [SCOPE 013 / T042] END

- Multiple `MODIFIED-BY` lines stack in chronological order (oldest first).
- `MODIFIED-BY` lines are written only by the orchestrator; they are derived from the active task ID at edit time.
- Maximum 5 `MODIFIED-BY` lines per fence; on the 6th edit the block is treated as a candidate for refactor and `auditfences` flags it (warning, not error).

### FR-004 — Full-replacement ownership transfer
When a task replaces a fenced unit entirely (≥ 80% of non-whitespace lines changed, measured against the prior committed version), the orchestrator removes the old `BEGIN`/`END`/`MODIFIED-BY` lines and writes a new fence in the new task's name, with a `(replaces <old-scope>/<old-task>)` suffix:

    // [SCOPE 015 / T055] BEGIN — Audit log retention pruning (replaces 013/T042)
    export function pruneAuditLogs(...) { ... }
    // [SCOPE 015 / T055] END

The 80% threshold is a default; `implement` accepts `--replace` to force full-replacement and `--modify` to force MODIFIED-BY nesting when the diff is ambiguous.

### FR-005 — Per-language comment syntax matrix

| File extension | BEGIN/END comment | Notes |
| --- | --- | --- |
| `.ts` `.tsx` `.js` `.jsx` `.mjs` `.cjs` | `//` | Inside JSX expression bodies: `{/* [SCOPE …] BEGIN — … */}` |
| `.sql` and Drizzle migration `.sql` outputs | `--` | One fence per migration file, wrapping the whole body |
| `.css` `.scss` | `/* [SCOPE …] BEGIN — … */` | Block comment form |
| `.md` | `<!-- [SCOPE …] BEGIN — … -->` | Used only for fenced code samples authored by tasks (rare) |
| `.yaml` `.yml` | `#` | |
| `.json` | **skipped** | JSON forbids comments; fencing is suppressed for `.json`. `auditfences` exempts these files. |
| `.html` | `<!-- … -->` | |

Adding a new language requires updating this matrix and shipping a kit release; `auditfences` must reject unknown extensions explicitly (rather than silently skipping) so new file types are not added without spec review.

### FR-006 — Emission sites in the orchestrator
The following commands emit / maintain fences and MUST refuse to write code without them:

- `implement <scope>/<task>` — production code, tests-of-record, route handlers, schema files
- `createtesttasks <scope>` — test files generated for QA tasks; each generated test function is fenced with the test task's ID
- The migration generator invoked by `dbpush` — migration files receive one fence per file
- `runqa` — when it writes regression test scaffolds, those are fenced with the QA task ID

Fence emission is unconditional; there is no `--no-fence` flag. The only way to produce un-fenced code is to bypass the orchestrator, which is explicitly forbidden by policy.

### FR-007 — `auditfences` CLI command
A new CLI command shipped in the kit:

    wxkanban-agent auditfences [--path <dir>] [--format text|json] [--strict]

Reports, exit-code `0` if clean, `1` if any error-class finding, `2` on internal failure:

- **Error**: top-level declaration without a fence (per FR-002 granularity)
- **Error**: fence whose `SCOPE`/`Task` ID does not exist in `specs/<scope>/tasks.md`
- **Error**: malformed fence (BEGIN without matching END, mismatched IDs, wrong language syntax)
- **Warning**: fence with > 5 `MODIFIED-BY` lines (FR-003)
- **Warning**: `MODIFIED-BY` line whose task ID does not exist
- **Info**: count of fences per scope and per task

`--strict` promotes warnings to errors. `--format json` produces machine-readable output for CI gating.

### FR-008 — CLAUDE.md convention rule
The repository CLAUDE.md gains a short section documenting:

- Every code unit (per FR-002) must be fenced; un-fenced code is a defect.
- Fences are written by the orchestrator only; never hand-author or hand-edit them.
- If you see un-fenced code, that's evidence work happened outside the orchestrator → remediate by routing the change through `implement`.

### FR-009 — Idempotency and re-runs
Running `implement <scope>/<task>` a second time on already-fenced code:

- If the code is byte-identical to what `implement` would write, no change (no duplicate fence).
- If the task ID matches the existing fence's owner, the body is updated in place; the fence is preserved.
- If the task ID differs, FR-003 / FR-004 rules govern (MODIFIED-BY or replacement).

### FR-010 — Out-of-band edit detection
If a fenced block has been modified since the last orchestrator write (detected via a content hash stored in `taskfences` table — see Section 4), `implement` refuses to write and reports the drift. The user is prompted to either reconcile (re-run through orchestrator) or explicitly waive (`--accept-drift`, logged).

---

## User Scenarios & Testing

### US1 — New task writes new code (happy path)

**Actor**: wxkanban-agent CLI on behalf of a developer running `implement`.

**Scenario**:
1. Developer runs `wxkanban-agent implement 013/T042`.
2. The orchestrator loads task T042 from `specs/013-AuditManagement/tasks.md`, reads its title ("Audit log retention pruning") and target file (`src/server/services/auditRetention.ts`).
3. The file does not yet exist. The orchestrator writes the file with a single fenced function:

       // [SCOPE 013 / T042] BEGIN — Audit log retention pruning
       export function pruneAuditLogs(...) { ... }
       // [SCOPE 013 / T042] END

4. A row is inserted into the `taskfences` table (Section 4) recording file path, line range, content hash, and owner task.
5. `auditfences` reports clean.

**Expected outcome**: Code is fenced; DB row exists; subsequent `git grep "\[SCOPE 013 / T042\]"` returns exactly the fence pair and the body in between.

### US2 — Later task partially modifies an existing fenced block

**Actor**: wxkanban-agent CLI running `implement 015/T011`.

**Scenario**:
1. T011 in spec 015 adds a soft-delete branch to `pruneAuditLogs` (the function from US1).
2. `implement` reads the existing file, locates the fence owned by 013/T042, computes the diff: < 80% line change → MODIFIED-BY rule (FR-003) applies.
3. The orchestrator inserts the MODIFIED-BY line and writes the new body:

       // [SCOPE 013 / T042] BEGIN — Audit log retention pruning
       // [SCOPE 015 / T011] MODIFIED-BY — added soft-delete branch
       export function pruneAuditLogs(...) { ... }
       // [SCOPE 013 / T042] END

4. The `taskfences` row's content hash is updated; a `taskfencemodifications` row is appended (Section 4).

**Expected outcome**: Original ownership preserved; modification history visible in source and in DB.

### US3 — Later task fully replaces a fenced block

**Actor**: wxkanban-agent CLI running `implement 015/T055`.

**Scenario**:
1. T055 rewrites `pruneAuditLogs` end-to-end (new algorithm). The diff exceeds 80% → full-replacement rule (FR-004).
2. `implement` removes the old fence and any MODIFIED-BY lines, writes the new fence:

       // [SCOPE 015 / T055] BEGIN — Audit log retention pruning (replaces 013/T042)
       export function pruneAuditLogs(...) { ... }
       // [SCOPE 015 / T055] END

3. The `taskfences` row's owner is reassigned to 015/T055; the prior owner record is moved to `taskfencehistory` (Section 4).

**Expected outcome**: New ownership visible in source; full lineage queryable in DB.

### US4 — `auditfences` detects un-fenced code (out-of-band edit)

**Actor**: Developer who hand-edited a source file (against policy) and now runs `auditfences`.

**Scenario**:
1. Developer hand-adds a new function `recomputeAuditTotals(...)` to a file, without a fence.
2. Developer runs `wxkanban-agent auditfences`.
3. Output:

       ERROR  src/server/services/auditRetention.ts:84  un-fenced top-level declaration: function recomputeAuditTotals
       1 error, 0 warnings
       exit code: 1

4. Developer routes the work through `implement <scope>/<task>`; on the next `auditfences` run the file is clean.

**Expected outcome**: Un-fenced code is caught before merge; the developer is funneled back into the orchestrator.

### US5 — `auditfences` detects fence pointing at non-existent task

**Actor**: Developer or CI running `auditfences` after a spec edit removed task T099.

**Scenario**:
1. A fence references `[SCOPE 013 / T099]` but `specs/013-AuditManagement/tasks.md` no longer lists T099 (task was removed during spec refactor).
2. `auditfences` reports:

       ERROR  src/server/services/x.ts:12  fence references unknown task: 013/T099
       1 error
       exit code: 1

3. Resolution: either restore T099 in the spec, or run `implement` against a current task to retake ownership.

**Expected outcome**: Spec/code drift cannot survive a CI run with `auditfences` gated.

### US6 — JSON file is exempt (FR-005)

**Actor**: `implement 011/T005` writing a `config/feature-flags.json`.

**Scenario**:
1. `implement` detects `.json` extension; per FR-005 fencing is suppressed.
2. The file is written without comments.
3. `auditfences` does not report the file.

**Expected outcome**: Valid JSON; no false errors.

### US7 — Drift detection on hand-edited fenced block (FR-010)

**Actor**: Developer who hand-edited inside an existing fence, then runs `implement` again.

**Scenario**:
1. Developer hand-changes a line inside the fence of 013/T042 (against policy).
2. `taskfences.contenthash` no longer matches the file.
3. Developer runs `implement 013/T042` again to "regenerate."
4. `implement` aborts:

       ERROR  src/server/services/auditRetention.ts: fence [SCOPE 013 / T042] modified out of band
       Use --accept-drift to overwrite (logged), or revert manual changes and retry.

5. Developer reverts the hand-edit and retries successfully.

**Expected outcome**: Manual edits cannot silently be lost to a re-run; explicit waiver is logged for audit.

### Integration test mapping (quickstart.md)

Each US above corresponds to a quickstart scenario; QA tasks (created via `createtesttasks 026`) cover:

- **QT-1** (US1, US6): fresh-write fence emission across all FR-005 language types.
- **QT-2** (US2): MODIFIED-BY insertion, stack ordering, 5-line warning.
- **QT-3** (US3): full-replacement detection at 80% threshold, manual `--replace` / `--modify` flags.
- **QT-4** (US4, US5): `auditfences` exit codes, JSON output schema, CI gating example.
- **QT-5** (US7): drift detection, `--accept-drift` logging.
- **QT-6**: idempotent re-run of `implement` (FR-009).

---

## Data Model

Three new tables, all following wxKanban DB conventions (lowercase, no underscores, UUID v7 PKs).

### `taskfences` — current fence ownership per code unit

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid v7 | PK |
| `projectid` | uuid | FK → `companyprojects.id` |
| `filepath` | text | Repo-relative, normalized forward-slash |
| `unitkind` | text | enum: `function` `class` `route` `table` `migration` `component` |
| `unitname` | text | Symbol name (e.g. `pruneAuditLogs`) or migration filename |
| `ownerscope` | text | 3-digit spec number, e.g. `013` |
| `ownertask` | text | Task ID verbatim, e.g. `T042` |
| `description` | text | ≤ 60 chars, copied from task title |
| `contenthash` | text | SHA-256 of fenced body (between BEGIN/END, excluding fence comments themselves) |
| `linestart` | integer | 1-based line of BEGIN |
| `lineend` | integer | 1-based line of END |
| `createdat` | timestamptz | |
| `updatedat` | timestamptz | |

**Unique constraint**: (`projectid`, `filepath`, `unitkind`, `unitname`).

### `taskfencemodifications` — append-only MODIFIED-BY history

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid v7 | PK |
| `taskfenceid` | uuid | FK → `taskfences.id` |
| `modifierscope` | text | e.g. `015` |
| `modifiertask` | text | e.g. `T011` |
| `description` | text | ≤ 60 chars |
| `contenthashbefore` | text | hash before this edit |
| `contenthashafter` | text | hash after this edit |
| `createdat` | timestamptz | |

Rows are written in chronological order and never deleted (audit trail).

### `taskfencehistory` — closed ownership records (after full replacement)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid v7 | PK |
| `projectid` | uuid | |
| `filepath` | text | |
| `unitkind` | text | |
| `unitname` | text | |
| `priorownerscope` | text | |
| `priorownertask` | text | |
| `replacedbyscope` | text | |
| `replacedbytask` | text | |
| `closedat` | timestamptz | |

Populated by FR-004 full-replacement events. Lets `auditfences --history` show the full chain of ownership for any unit.

## CLI Contracts

### `implement <scope>/<task>` (modified by this spec)

New behavior on top of existing:
- Always emits a fence on new units (FR-002).
- Detects existing fences in the target file; applies FR-003 / FR-004 / FR-009 rules.
- Updates `taskfences` / writes `taskfencemodifications` / closes into `taskfencehistory` accordingly.

New flags:
- `--replace` — force full replacement (override 80% heuristic).
- `--modify` — force MODIFIED-BY nesting (override 80% heuristic).
- `--accept-drift` — proceed even if FR-010 drift detected; logged to `taskfencemodifications` with `description='out-of-band-drift-accepted'`.
- `--dry-run` — print the fenced output and DB writes without applying.

Exit codes: `0` success, `1` drift detected (no `--accept-drift`), `2` spec/task not found, `3` filesystem or DB error.

### `auditfences` (new)

    wxkanban-agent auditfences [--path <dir>] [--format text|json] [--strict] [--history <scope>/<task>]

- `--path` defaults to repo root.
- `--format json` shape:

      {
        "summary": { "files": 482, "fences": 1730, "errors": 0, "warnings": 2 },
        "findings": [
          { "severity": "error", "code": "UNFENCED_DECL", "file": "src/x.ts", "line": 84, "message": "..." }
        ]
      }

- `--history <scope>/<task>` joins `taskfences` ∪ `taskfencemodifications` ∪ `taskfencehistory` and prints the full ownership timeline for any unit ever owned by that task.

Exit codes per FR-007.

### `dbpush` (touched, not redesigned)

Migration generator wraps each migration body in a fence owned by the task that triggered the migration (per FR-002 / FR-006). No new flags.

---

## Prerequisite — `implement` Command (Repair & Build-Out)

Code fencing requires a working `implement` command, because fencing is emitted at write-time, by the writer. Today (2026-05-13) `wxkanban-agent/core/orchestrator/command-handlers/` contains handlers for `buildscope`, `createspecs`, `dbpush`, `pipeline-agent`, `pipeline-agent-run`, and `wxht` — but **no `implement.ts`**. The command is documented in `CLAUDE.md` under the Implementation lifecycle stage, but does not actually exist in the CLI gateway.

This spec therefore treats `implement` as a first-class deliverable, not just a fence-emission patch. The fence work in earlier sections layers on top.

### P-FR-1 — Create `implement` command handler

Add `wxkanban-agent/core/orchestrator/command-handlers/implement.ts` and wire it into the command gateway (`wxkanban-agent/apps/command-gateway/src/cli.ts`), the policy file (`core/policy/command-policy.ts`), and the workflow engine (referenced in `tests/unit/workflow-engine.test.ts`).

The command signature:

    wxkanban-agent implement <scope>/<task> [--dry-run] [--replace] [--modify] [--accept-drift] [--file <path>]

Where `<scope>` is the 3-digit spec number and `<task>` is the task ID as written in that spec's `tasks.md`. Lifecycle policy: allowed only when the active scope's stage is `Implementation` (per the table in CLAUDE.md "Orchestrator-First" section).

### P-FR-2 — Task resolution

`implement` must:

1. Read `specs/<scope>-<slug>/tasks.md`, locate `<task>`, extract its title, target file(s), and dependency list.
2. Refuse to run if dependencies are not marked complete in `tasks.md` (FR-009 of spec 019 already governs `tasks.md` format).
3. Refuse to run if the spec is not currently in `Implementation` stage.

### P-FR-3 — Code generation pipeline

`implement` is an **AI-driven** code writer (matching `buildscope` and `createspecs` patterns already in the kit):

1. Build a system prompt from the spec content + task definition + relevant `data-model.md` / `contracts/openapi.json` excerpts.
2. Send to the configured AI provider (Gemini primary, OpenAI fallback per CLAUDE.md tech stack).
3. Receive proposed file content as a structured response (JSON: `[{ path, body, action: 'create'|'modify' }]`).
4. **Pass each file through the fence-emitter** (FR-001 through FR-005 of this spec) before writing.
5. Write files; update `taskfences` / `taskfencemodifications` / `taskfencehistory` (Data Model section) as appropriate.
6. Mark task complete in `tasks.md` (checkbox → `[x]`).

### P-FR-4 — Fence-emitter module

A new shared module `wxkanban-agent/core/orchestrator/fence-emitter.ts` exports:

    emitFence(opts: {
      filepath: string;
      languageMatrix: LanguageMatrix;  // FR-005
      currentContent: string | null;
      proposedContent: string;
      ownerScope: string;
      ownerTask: string;
      description: string;
      existingFences: TaskFenceRow[];
      mode: 'auto' | 'replace' | 'modify';
    }): { content: string; dbWrites: FenceDbWrite[]; warnings: string[] };

Used by `implement`, `createtesttasks`, the migration generator, and `runqa`. Single source of truth for fence rules.

### P-FR-5 — Out-of-band drift check

Before writing, `implement` recomputes the SHA-256 of every fenced body in the target file and compares to `taskfences.contenthash`. Mismatch → abort per FR-010 unless `--accept-drift`.

### P-FR-6 — Idempotency

Re-running `implement <scope>/<task>` against unchanged inputs and unchanged AI output produces zero file changes and zero DB writes (FR-009).

### P-FR-7 — Tests

Unit and integration coverage shipped alongside the command:

- `tests/unit/implement-command.test.ts` — argument parsing, lifecycle-stage gating, dependency gating.
- `tests/unit/fence-emitter.test.ts` — FR-002 granularity, FR-003 MODIFIED-BY, FR-004 80% threshold, FR-005 language matrix, JSON exemption, idempotency.
- `tests/integration/implement-end-to-end.test.ts` — runs `implement` against a fixture spec/task, asserts file written, fence present, DB rows correct, second run is no-op.

All three must pass before kit packaging ships.

### P-FR-8 — Documentation in kit

`wxkanban-agent/README.md` and `docs/` gain:

- `docs/implement.md` — full command reference, examples for create-new vs modify-existing.
- `docs/fencing.md` — the fence convention (mirrors FR-001 through FR-010), language matrix, MODIFIED-BY behavior, `auditfences` usage.
- Update to "Commands by lifecycle stage" table in `README.md` to confirm `implement` is now operative.

### Out of scope for the prerequisite

- AI prompt tuning beyond minimum viability (covered by ordinary `pipeline-agent` improvements).
- Multi-file atomic transactions across unrelated specs (one `implement` invocation operates on one task's declared files).
- Rollback / undo (handled by git; `implement` does not own version control).

---

## Kit Packaging & Distribution

Everything above must be reachable by a consumer project that installs the wxkanban-agent kit — not just usable inside this repo. Per the kit's distribution model (local source-of-truth at `wxkanban-agent/`, currently published as `v0.1.7` but stale per project memory), this spec drives a new kit release that bundles fencing end-to-end.

### K-FR-1 — Kit deliverables checklist

The release tarball / npm publish artifact MUST contain:

1. `core/orchestrator/command-handlers/implement.ts` (Prerequisite section).
2. `core/orchestrator/fence-emitter.ts` and its `language-matrix.ts` sibling (FR-005).
3. `core/orchestrator/command-handlers/auditfences.ts` (FR-007).
4. Drizzle schema files for the three new tables: `taskfences`, `taskfencemodifications`, `taskfencehistory` (Data Model section).
5. Auto-generated migration SQL for those tables (under `wxkanban-agent/templates/migrations/`).
6. CLI wiring in `apps/command-gateway/src/cli.ts` registering `implement` and `auditfences`.
7. HTTP wiring in `apps/command-gateway/src/http.ts` exposing the same as POST endpoints (parity with existing commands).
8. Policy entries in `core/policy/command-policy.ts` declaring `implement` allowed in `Implementation` stage and `auditfences` allowed in every stage.
9. Templates under `wxkanban-agent/templates/` that consumer projects need at scaffold time:
   - `templates/CLAUDE.md.fencing-snippet.md` — the section to inject into consumer CLAUDE.md (FR-008).
   - `templates/auditfences-github-action.yml` — a drop-in CI step that runs `wxkanban-agent auditfences --strict` on PRs.
10. Updated `wxkanban-agent/README.md` and `docs/` (P-FR-8 plus a new `docs/fencing.md`).
11. Updated `scripts/verify-install.ts` to assert the three tables exist, the two new commands respond to `--help`, and the templates are present.

### K-FR-2 — Schema delivery into consumer DBs

Consumer projects use a per-project Postgres database (NOT the wxKanban author DB — per project memory BUG-10, "Kit consumer projects must ignore the wxKanban PG connection"). The three new tables therefore ship as migrations applied to the **consumer project's** DB at kit install / upgrade time.

Mechanism:

- The migration files are bundled in the kit at `templates/migrations/0001-026-codefencing.sql`.
- On `wxkanban-agent dbpush` in a consumer project, the kit's startup discovers any un-applied bundled migrations and applies them to the consumer's `DATABASE_URL` after the consumer's own migrations.
- Bundled migrations are tracked in a `kitmigrations` table (already present per spec 019; if not, add it here as `K-FR-2a`).

Consumer DB schemas remain isolated; this spec adds three orchestrator-owned tables, nothing about consumer domain data.

### K-FR-3 — Version bump and changelog

- `wxkanban-agent/package.json` version bumps to `v0.2.0` on first release containing the prerequisite + this spec's deliverables (minor bump — adds commands; breaking only if a consumer had a stub `implement` of their own, which is not expected since the command was previously non-existent).
- `wxkanban-agent/CHANGELOG.md` gains a `## v0.2.0 — 2026-MM-DD` section noting:
  - Adds `implement` command (was documented but never shipped).
  - Adds `auditfences` command.
  - Adds code-fencing convention; consumer code is expected to be fenced going forward.
  - Adds three new tables; consumer DBs receive migrations on next `dbpush`.

### K-FR-4 — Backwards compatibility for existing consumer codebases

Most consumer code in production projects today is un-fenced (pre-026). The kit MUST NOT brick those projects.

Behavior on upgrade:

- `auditfences` distinguishes **legacy** files (modification time predates the kit upgrade, or matches a hash recorded in a new `taskfenceslegacy` ignore-table) from **post-upgrade** files. Legacy un-fenced declarations are reported as **info**, not error.
- A one-time `wxkanban-agent auditfences --baseline` command captures the current tree's hash set into `taskfenceslegacy`. Run once per project at upgrade time. After baseline, new un-fenced declarations are errors as normal.
- Without `--strict`, the migration path is non-blocking; with `--strict` (CI), legacy info-level findings still pass.

This satisfies "ship it in the kit" without forcing every existing customer project to retroactively fence its entire codebase on day one. Retroactive fencing is a separate scope per the Core Design "Scope Boundary (OUT)".

### K-FR-5 — Verification at install time

`scripts/verify-install.ts` (run by consumers post-install) gains checks:

- `implement --help` exits 0 with usage text.
- `auditfences --help` exits 0 with usage text.
- `auditfences --baseline --dry-run` runs to completion against the consumer repo (validates kit can read the tree).
- The three tables exist in the consumer's `DATABASE_URL` after migration.
- A synthetic dry-run `implement --dry-run` against a fixture task emits a properly formed fence.

Verify-install failures must be loud (non-zero exit, clear message) so consumers know the upgrade is partial.

### K-FR-6 — Distribution channel

Local-source-of-truth model continues per project memory: the authoritative source is `wxkanban-agent/` in this repo. Two distribution paths:

1. **`npm publish wxkanban-agent`** (when ready) — published version bumps to `v0.2.0`.
2. **`scripts/pack-kit.sh`** (new or existing) produces a tarball consumers can install via `npm install ./wxkanban-agent-v0.2.0.tgz` for projects that prefer pinned local copies.

Both paths produce identical deliverables (same `package.json`, same `templates/`, same migrations). The kit MUST NOT bake in author-side state (wxKanban PG creds, author repo paths) — per BUG-10.

---

## Acceptance Criteria

The spec is complete and ready to mark `Released` when all of the following hold:

### A-1 — `implement` command works end-to-end
- `wxkanban-agent implement <scope>/<task>` exists as a registered command (CLI + HTTP gateway).
- Running it against a real task in `Implementation` stage writes the declared files, emits fences per FR-001 through FR-005, and inserts/updates `taskfences` rows per the Data Model section.
- A second invocation with no input changes is a no-op (FR-009).
- All P-FR-7 tests pass (`implement-command.test.ts`, `fence-emitter.test.ts`, `implement-end-to-end.test.ts`).

### A-2 — Fence rules behave per spec
- New unit: BEGIN/END fence written, SCOPE/Task IDs match the invoking task, description matches `tasks.md` title verbatim (≤ 60 chars).
- Partial edit by later task: MODIFIED-BY line inserted, max-5 warning fires at the 6th edit.
- Full replacement at ≥ 80% line change: ownership transfers, old fence removed, `(replaces …)` suffix written, `taskfencehistory` row appended.
- `--replace` / `--modify` flags override the 80% heuristic.

### A-3 — `auditfences` works
- `auditfences --help` exits 0.
- Against a clean tree: exits 0, reports zero errors.
- Against a tree with one un-fenced top-level function: exits 1, names the file and line.
- Against a tree with a fence pointing at a non-existent task: exits 1.
- `--format json` produces parseable JSON matching the schema in the CLI Contracts section.
- `--strict` promotes warnings to errors.
- `--history <scope>/<task>` prints the full ownership chain.

### A-4 — Language matrix complete
- TS/JS/TSX/JSX, SQL, CSS/SCSS, MD, YAML, HTML files all receive correct comment-syntax fences.
- `.json` files are skipped silently and not reported by `auditfences`.
- Unknown extensions cause `auditfences` to emit an error, not silently skip.

### A-5 — Drift detection works (FR-010)
- Hand-edit inside a fenced block changes the file hash; `implement` refuses on re-run without `--accept-drift`.
- `--accept-drift` is logged to `taskfencemodifications` with a recognizable description.

### A-6 — CLAUDE.md updated
- Project CLAUDE.md gains the fencing convention section (P-FR-8 / K-FR-1 #9).
- Section explains: every code unit fenced, fences written only by orchestrator, un-fenced code is a defect.

### A-7 — Kit shipped
- `wxkanban-agent/package.json` version is `v0.2.0`.
- Tarball or npm publish contains all K-FR-1 deliverables.
- `scripts/verify-install.ts` passes all K-FR-5 checks against a fresh consumer install.
- A consumer project upgrading from `v0.1.7` to `v0.2.0` receives the three new tables on next `dbpush`.

### A-8 — Backwards compatibility
- `auditfences --baseline` captures legacy hashes; subsequent runs against a legacy-only tree exit 0 without `--strict`.
- No existing consumer project breaks on upgrade.

### A-9 — Documentation
- `wxkanban-agent/docs/implement.md` exists, with command reference + examples.
- `wxkanban-agent/docs/fencing.md` exists, mirrors the fence rules and FR-005 language matrix.
- `wxkanban-agent/CHANGELOG.md` has the `v0.2.0` entry.

### A-10 — Dogfood
- This very repo (`wxKanban`) has run `auditfences --baseline` against its current tree.
- All new code written under spec 026 itself (the `implement`, `fence-emitter`, `auditfences` modules) is itself fenced, owned by 026's own task IDs.

## Out of Scope

- **Retroactive fencing of pre-026 code.** Existing un-fenced functions across this repo and consumer repos are baseline-exempt; a follow-on scope handles the retrofit if/when desired.
- **Statement-level or line-level fencing.** FR-002 caps granularity at function/class/handler/migration/component.
- **IDE plugin for fence visualization or autocomplete.** Out of scope; treated as a future enhancement.
- **Fence-aware refactoring tools** (auto-rename, auto-move that preserves fence ownership). Out of scope.
- **Multi-repo / monorepo cross-cutting fence tracking.** Each repo's `taskfences` is scoped to that repo's consumer DB.
- **AI prompt tuning for `implement` beyond minimum viability.** Quality improvements ride on `pipeline-agent` and future spec work.
- **Rollback / undo of an `implement` run.** Git owns version control; the orchestrator does not.
- **Customer-facing UI showing fence ownership in the Kanban board.** Out of scope; a future scope could surface this in the project's audit reports.

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| AI returns code that parses but does not declare a recognizable top-level unit for FR-002, so fence-emitter cannot place a fence. | Medium | High (blocks `implement`) | Fence-emitter rejects with a clear diagnostic naming the offending file; `implement` exits non-zero. Operator either re-prompts the AI or files a bug. No silent skip. |
| 80% replacement heuristic mis-classifies a substantial-but-not-full rewrite. | Medium | Medium (wrong ownership recorded) | Operator can force with `--replace` or `--modify`. Heuristic threshold reviewable in a future patch (no spec edit required if kept ≤ ±10%). |
| Consumer projects refuse to baseline and want strict fencing from day one. | Low | Low | `--baseline` is optional, not required; consumers can omit it and let `--strict` flag every legacy file as expected. |
| Fence comments leak into rendered output (e.g., docstrings, generated docs). | Low | Low | Fence emission targets only the file types in FR-005; docstring-producing tooling reads symbols, not comments. Verified in QT-1. |
| Three new tables grow unbounded on long-lived consumer projects. | Low | Medium | `taskfences` rows are 1-per-unit (bounded by codebase size). `taskfencemodifications` is append-only but bounded by edit frequency × unit count. `taskfencehistory` is small. No retention policy needed at this scale; revisit at 10⁶ rows. |
| Kit upgrade applies migrations to a consumer DB that lacks privileges for new tables. | Low | High (upgrade failure) | `verify-install.ts` runs the migration in a transaction and rolls back on permission error, reporting the exact GRANT needed. |
| Developers find fence comments visually noisy. | Medium | Low | Single-line fences keep noise minimal; IDE folding handles the rest. Reviewable after one quarter of use; if pain confirmed, optional muted-style markers (e.g., `///` instead of `//`) become a backwards-compatible patch. |

## Dependencies

- **Spec 019** — Agent Orchestrator Kit. Provides CLI gateway, policy engine, lifecycle stages, AI provider wiring.
- **CLAUDE.md** — Orchestrator-First and SPEC-FIRST rules. Reinforced by this spec's policy ("nothing outside the orchestrator").
- **Pino logging** — All new commands log via Pino per CLAUDE.md.
- **No new third-party libraries** — fence parsing uses regex; no AST parser required for FR-002 granularities (top-level declarations are reliably regex-detectable per language). If FR-002 grows, an AST parser (e.g., `@typescript-eslint/parser`) becomes a dependency in a later spec.
