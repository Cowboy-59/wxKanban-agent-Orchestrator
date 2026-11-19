# SCOPE-101: MCP Task↔Spec Linking & Spec Lifecycle Transition

**Scope Number**: SCOPE-101
**Status**: `draft`
**Created**: 2026-07-18
**Amended**: 2026-09-25 — **Amendment B** adds `project.update_task` and a guarded `project.delete_task` (feedback `edd34387`). See [Amendment B](#amendment-b--task-edit-and-delete-2026-09-25).
**Last Reviewed**: 2026-08-04 — **Amendment A** pulls report Issues 3 and 4 in-scope and corrects the Issue 3 diagnosis. See [Amendment A](#amendment-a--issues-3-and-4-pulled-in-scope-2026-08-04) at the foot of this document.
**Previously Reviewed**: 2026-07-18 (all four report issues diagnosed and confirmed in code during authoring; Issues 1 & 2 implemented + built green before this scope was written)
**Depends On**: SPEC-028 (Hosted MCP Deployment — bearer auth, `db/scoped-query.ts` tenant enforcement, the `project.*` tool surface in `mcp-server/src/server.ts`). SCOPE-042 (Dev Cockpit — `cockpit_summary` groups tasks under specs purely on `task.specId`, which is the behavior this scope makes reachable).
**Related Scopes**: SCOPE-097 (MCP Token/Project Binding Hardening) — same "hosted-MCP tool surface has a gap that burns consuming-project sessions" family. SCOPE-058 (scope check-out/-in) which already writes spec-level claim columns but not `status`.
**Source**: `specs/Project-Scope/101-mcp-task-spec-linking.md`
**Originating report**: `Bugs/Bug-Report-Andrew.md` — Andrew Mathieson-Blakely, project "Proactive By DDES" (`da4eebf4-eb6d-4a8d-9694-2b2e6292702b`): 31 specs, 129 tasks imported via the MCP, all rendering as unlinked in the Dev Cockpit.

---

## Overview

Two independent gaps in the **hosted MCP tool surface** (`mcp.wxperts.com`, `mcp-server/src/server.ts`) leave a consuming project unable to associate its tasks with specs or advance a spec's lifecycle — so the Dev Cockpit reports zero work against every module and no spec can be driven through the governed flow.

**Gap 1 — a task's spec link is unreachable through the tools.** The `projecttasks.specid` column exists and `cockpit_summary` groups every task under its spec *purely* on that column (`cockpit-summary.ts:127`: a null/unmatched `specId` → the `__unlinked__` bucket). But the only client-reachable writer of `specid` was `create_specs` (bulk, at spec-creation time, create-only). `create_task`'s handler and Zod validator already accepted `specId` — it was simply **omitted from the published `inputSchema`**, so no client could send it and every `create_task` task landed with `specid = null`. `link_doc_to_task` mutates only the `documentIds`/`taskIds` JSON arrays, never `specId`, so it cannot fix grouping. Net: tasks created or repaired through the normal tools are permanently invisible in the Cockpit.

**Gap 2 — a spec cannot leave its creation status through the tools.** `create_specs` writes an initial `status` from `phase` (design → `planned`, etc.). Nothing in the MCP surface transitions it afterward: `update_task_status` is task-level only, `checkout/checkin_scope` write only claim columns, and `project.implement` (the only tool that would advance status) is dead — `artifactDir` is hardcoded `undefined`, so it always throws before the status update. A spec is therefore stuck at its creation status forever via supported tooling.

This scope closes both gaps with the smallest coherent additions: expose the already-wired `specId` on `create_task`; add a batch `project.link_task_to_spec` repair tool (the supported path to re-parent existing orphaned tasks); and add `project.update_spec_status` to transition a spec through the canonical lifecycle vocabulary. It does **not** attempt to fix `project.implement`, the read-endpoint scalability (report Issue 4), the `dbpush` duplicate-document bug (Issue 3), or the environment-note stubs — those are tracked separately (see Out of Scope).

## Business Problem

A consuming project imports its specs and tasks through the MCP (`create_specs` + `create_task`) and then manages the build from the Dev Cockpit. Today that breaks at scale: because `create_task` cannot set `specId`, all 129 of "Proactive By DDES"'s tasks are orphaned, so `cockpit_summary` reports `remainingCount: 0` and `tasks: []` for **all 31 modules** while holding every task in `unlinkedTasks`. Progress is invisible, and there is no supported recovery path — `create_specs` refuses to touch an existing spec, `link_doc_to_task` doesn't move the needle, and `dbpush` links zero tasks. Separately, every spec is stuck at `planned` with no tool to advance it, so the documented implementation gate can never be satisfied. The customer's explicit ask: a supported path to associate their existing 129 tasks with their specs, and a way to move specs forward — without deleting and re-importing.

### Core Design

| Element | MCP Task↔Spec Linking & Spec Lifecycle Transition |
| --- | --- |
| **Primary Actor** | A consuming project (e.g. "Proactive By DDES") that imports specs + tasks via the MCP and manages the build from the Dev Cockpit |
| **Secondary Actor** | The hosted MCP server (`mcp-server/src/server.ts`, tenant-scoped writes) and the Dev Cockpit reader (`cockpit_summary`, which groups on `task.specId`) |
| **Key Value** | Tasks can be created or repaired with their spec link, so they group under their scope in the Cockpit; specs can be transitioned through their lifecycle — all through supported, tenant-scoped tools, with no re-import |
| **Boundary — IN** | (1) `create_task` publishes `specId` (already validated + persisted). (2) New `project.link_task_to_spec` — batch re-parent existing tasks, targeting a spec by `specId` or `specNumber`. (3) New `project.update_spec_status` — transition `projectspecifications.status` within the canonical lifecycle vocabulary. (4) Both new tools tenant-scoped (`selectScoped`/`updateScoped`) and gated `editor`/`admin` in the permission matrix. (5) Regression tests for the schema contracts. |
| **Boundary — OUT** | Fixing `project.implement` (`artifactDir` bug); read-endpoint pagination/filtering (Issue 4); the `dbpush` em-dash/colon duplicate-document bug (Issue 3); the `check_for_updates`/`kit_status` version stubs and the `wxAI-implement.md` merge conflict (env notes); reconciling the gate-doc status vocabulary with `policy.ts` (flagged as a follow-up decision, not built here). |

---

## User Scenarios

### US1 — Create a task already linked to its spec (Gap 1 core)
A consuming project calls `project.create_task` with `specId` set to the owning spec.
**Expected:** the task is persisted with that `specid` and immediately groups under its scope in `cockpit_summary` (leaves `unlinkedTasks`). Omitting `specId` behaves exactly as today (task created unlinked).

### US2 — Re-parent existing orphaned tasks in bulk (Gap 1 repair — the customer's ask)
The project has 129 tasks created via `create_task` with `specid = null`. It calls `project.link_task_to_spec` with an array of `{ taskId, specNumber }` links.
**Expected:** each task's `specid` is set to the resolved spec; the tool returns a per-link result plus a summary (`linked`, `taskNotFound`, `specNotFound`). After the call, `cockpit_summary` shows the tasks under their modules and `remainingCount` is non-zero. No re-import, no spec deletion.

### US3 — Target a spec by number or by id (ergonomics)
A link (or a status transition) names its spec by `specNumber` (`"0012"`, as the customer holds them) rather than a UUID.
**Expected:** the server resolves `specNumber` to the spec within the caller's project, matching exact or numeric-equal (`"12"` resolves to stored `"0012"`). Supplying both `specId` and `specNumber`, or neither, is rejected by the schema.

### US4 — Transition a spec's lifecycle status (Gap 2)
A project calls `project.update_spec_status` for a spec (by `specId` or `specNumber`) with a target `status` (e.g. `planned` → `implementing`).
**Expected:** `projectspecifications.status` is updated within the canonical vocabulary (`draft`/`planned`/`implementing`/`qa`/`human_testing`/`beta`/`released`), an audit event is recorded, and the tool returns the spec with `previousStatus` + `status`. A status outside the vocabulary is rejected by the schema.

### US5 — Cross-project safety (tenant isolation)
A token for project A calls either new tool naming a task or spec that belongs to project B.
**Expected:** unchanged from the rest of the surface — `selectScoped`/`updateScoped` AND-in the caller's project, so the tool cannot read or mutate another project's rows; a `taskId`/`specNumber` not in the caller's project resolves to `task_not_found`/`spec_not_found`, never a cross-tenant write.

---

## Functional Requirements

### FR-001 — `create_task` publishes `specId` (Gap 1 core) — T001
The published `inputSchema` for `project.create_task` MUST include an optional `specId` (uuid). The handler and `CreateTaskInputSchema` already accept and persist it; only the advertised schema was hiding it.
**Acceptance:**
- [ ] `project.create_task` tool definition advertises `specId` (uuid, optional)
- [ ] A `create_task` call with `specId` persists `projecttasks.specid` and the task groups under that scope in `cockpit_summary`
- [ ] A `create_task` call without `specId` behaves exactly as before (task created unlinked)

### FR-002 — `project.link_task_to_spec` batch re-parent tool (Gap 1 repair) — T002 (schema), T003 (handler/registration/permission)
A new tool MUST set `projecttasks.specid` for existing tasks in batch. Input: `projectId` + `links[]` (1–500), each `{ taskId, specId? | specNumber? }` requiring exactly one of `specId`/`specNumber`. `specNumber` resolves exact-or-numeric-equal within the caller's project. Returns a per-link result and a summary (`requested`, `linked`, `taskNotFound`, `specNotFound`).
**Acceptance:**
- [ ] Registered in the tool list and `PERMISSION_MATRIX` (`editor`/`admin`)
- [ ] A link by `specId` and a link by `specNumber` both set `specid`; a link with both or neither is rejected by the schema
- [ ] A `taskId` not in the caller's project → `task_not_found`; a `specNumber`/`specId` not in the caller's project → `spec_not_found`; neither performs a cross-tenant write
- [ ] Re-running the same links is idempotent (already-correct links produce the same result, no error)

### FR-003 — `project.update_spec_status` lifecycle transition tool (Gap 2) — T004 (schema), T005 (handler/registration/permission)
A new tool MUST transition `projectspecifications.status` within the canonical vocabulary (`draft`, `planned`, `implementing`, `qa`, `human_testing`, `beta`, `released`) — the exact statuses `create_specs` assigns from `phase`. Target the spec by `specId` or `specNumber` (exactly one). Records an audit event; returns `{ previousStatus, status }`.
**Acceptance:**
- [ ] Registered in the tool list and `PERMISSION_MATRIX` (`editor`/`admin`)
- [ ] A valid transition updates `status` and returns `previousStatus` + `status`
- [ ] A status outside the vocabulary is rejected by the schema (e.g. `tasks_generated`)
- [ ] A spec not in the caller's project → `InvalidParams` "Spec not found", never a cross-tenant write

### FR-004 — Tenant scoping & least-privilege for both new tools — T003, T005
Both new tools MUST resolve and mutate rows only through the scoped query layer (`selectScoped`/`updateScoped`), binding to the token's project, and MUST be gated `editor`/`admin` so a `read_only` token cannot call them.
**Acceptance:**
- [ ] No handler path bypasses `scoped.*` for `projecttasks`/`projectspecifications`
- [ ] `read_only` role is rejected for both tools by `checkPermission`
- [ ] A call whose spec/task is out-of-project resolves to not-found, not a mutation

### FR-005 — Cockpit outcome: repaired tasks become visible — (verification of FR-001/002 against SCOPE-042)
After linking, the affected tasks MUST leave `unlinkedTasks` and appear under their spec in `cockpit_summary`, with `remainingCount` reflecting incomplete linked tasks. No change to `cockpit_summary` code is required — this FR asserts the end-to-end outcome the tools exist to produce.
**Acceptance:**
- [ ] For a project with orphaned tasks, after `link_task_to_spec` the tasks appear under their scope and `remainingCount` > 0 for the affected specs
- [ ] `unlinkedTasks` no longer contains the linked tasks

### FR-006 — Regression tests & no vocabulary pollution — T006
Schema-level tests (no DB) MUST lock the mutually-exclusive `specId`/`specNumber` contract for both tools and the lifecycle-status enum, and confirm `create_task` accepts optional `specId`. The status enum MUST NOT admit the stale gate-doc vocabulary (`tasks_generated`/`in_progress`/`ready_for_implementation`) into the DB.
**Acceptance:**
- [ ] Tests assert: link requires exactly one of `specId`/`specNumber`; empty `links` rejected; status enum rejects out-of-vocabulary values; `create_task` accepts and omits `specId`
- [ ] `tsc --noEmit` and `npm run build` (tsc -b + esbuild) are clean
- [ ] No out-of-vocabulary status string can be written via `update_spec_status`

---

## Technical Sections

This is additive server work in `mcp-server/src/` — new tools + one schema exposure. No new table (columns exist), no route, no UI, no wxAI command.

### Server — `mcp-server/src/`
- `utils/schemas.ts` — add `TaskSpecLinkSchema` + `LinkTaskToSpecInputSchema` (T002) and `SpecStatusSchema` + `UpdateSpecStatusInputSchema` (T004). Both enforce exactly-one-of `specId`/`specNumber` via `.refine`.
- `server.ts` — (T001) add `specId` to the `create_task` published `inputSchema`; (T003) `case 'project.link_task_to_spec'` handler + tool registration; (T005) `case 'project.update_spec_status'` handler + tool registration. Handlers resolve specs via `scoped.selectScoped(projectspecifications)` and mutate via `scoped.updateScoped(...)`; `update_spec_status` records a `document_updated` event (best-effort).
- `auth/role-checker.ts` — add `project.link_task_to_spec` and `project.update_spec_status` to `PERMISSION_MATRIX` (`editor`/`admin`) (part of T003/T005).
- `tests/task-spec-linking-schemas.test.ts` — pure-Zod contract tests (T006).

### Task breakdown (fence attribution — must match the `[SCOPE 101 / Tnnn]` fences already in code)
- **T001** — expose `specId` on `create_task` published schema
- **T002** — `LinkTaskToSpecInputSchema` (+ `TaskSpecLinkSchema`)
- **T003** — `link_task_to_spec` handler + registration + permission
- **T004** — `UpdateSpecStatusInputSchema` (+ `SpecStatusSchema`)
- **T005** — `update_spec_status` handler + registration + permission
- **T006** — schema regression tests

### Conventions & release path
- TypeScript, no `any`; Pino logging. Fences: authored in-conversation this session because the orchestrator `implement` path is broken; they carry `[SCOPE 101 / T001..T006]` and must be reconciled against DB task rows before `auditfences --strict` is clean.
- ~~**Single deployment surface:**~~ **AMENDED by Amendment A — there are now TWO.** T001–T006 and T008 are hosted-MCP tools: pushing `main` auto-deploys the app + MCP (production), and this is how those reach the customer. T007 and T009–T012 are **kit source** (`wxkanban-agent/dbpush.ts`) and reach consumers only via `sync-to-orchestrator --release`. Nothing pushed until the user says so.

---

## Success Criteria

1. **The customer's 129 tasks become linkable without re-import.** A single `project.link_task_to_spec` call (or a few, batched ≤500) sets `specid` on the orphaned tasks; `cockpit_summary` then shows them under their 31 modules with non-zero `remainingCount`, and `unlinkedTasks` no longer holds them. *(FR-002, FR-005)*
2. **New tasks can be born linked.** A `create_task` call with `specId` returns a task that groups under its scope on the very next `cockpit_summary`, with no follow-up call. *(FR-001)*
3. **Specs can move off their creation status.** `project.update_spec_status` transitions a spec `planned` → `implementing` (and any valid lifecycle step), returns `previousStatus` + `status`, and writes an audit event; an out-of-vocabulary status is rejected. *(FR-003)*
4. **Spec targeting works by the identifier the customer holds.** A link or transition naming `specNumber: "0012"` resolves to the right spec (exact or numeric-equal); ambiguous input (both/neither identifier) is rejected. *(FR-002, FR-003)*
5. **Tenant isolation is preserved.** A token for project A cannot link or transition project B's rows; out-of-project targets resolve to not-found, and `read_only` is rejected for both tools. *(FR-004)*
6. **Green build + contract tests.** `tsc --noEmit` and `npm run build` pass; the schema test file passes and locks the exactly-one-of and enum contracts. *(FR-006)*

---

## Constraints & Notes

### Constraints
- **Group on `specId`, so `specId` must be settable.** `cockpit_summary` deliberately groups only on `task.specId` (SCOPE-042). This scope does not change that; it makes `specId` reachable through the tools that create and repair tasks.
- **Tenant scoping is non-negotiable.** Both tools resolve and mutate only through `selectScoped`/`updateScoped`. No raw cross-project reads/writes.
- **Canonical status vocabulary only.** `update_spec_status` accepts exactly the statuses `create_specs` assigns (`draft`…`released`). It deliberately does NOT accept the gate-doc vocabulary (`tasks_generated`/`in_progress`/`ready_for_implementation`), which the DB never stores — admitting those would pollute the column and desync from the app's PhaseService.
- **Orchestrator-first, but broken.** The intended path is `createSpecs` → `implement` with orchestrator-written fences. Because `implement` is currently non-functional on the hosted MCP, Issues 1 & 2 were implemented in-conversation with hand-authored fences; this scope documents that and flags the fence/DB-task reconciliation as required before push.
- **Nothing pushed/published until the user says so.** The hosted MCP auto-deploys on push to main — this reaches production and the customer.

### Dependencies
- `projecttasks.specid` and `projectspecifications.status` columns (exist; SPEC-028 mirror schema).
- The scoped-query layer (SPEC-028) that enforces token-project binding.
- `cockpit_summary` grouping (SCOPE-042) — reused, not changed.

### Out of Scope
- **`project.implement` `artifactDir` bug.** The only status-advancing tool is dead; fixing it is a separate effort. `update_spec_status` gives an independent transition path in the meantime.
- **Gate-doc vocabulary reconciliation.** `_wxAI/commands/wxAI-implement-gate.md` and `_wxAI/rules/projectrules.md` call `planned` invalid and reference `tasks_generated`/`in_progress`/`ready_for_implementation`, which neither `create_specs` nor `policy.ts` (which whitelists `planned`) matches. This drift is real but is a governance-doc/policy decision, not built here — flagged for a follow-up (fold into this scope or a new one on the user's call).
- ~~**Report Issue 3** (`dbpush` `pushExistingSpec` em-dash vs colon title → duplicate documents, zero tasks linked).~~ **SUPERSEDED — moved IN-SCOPE by Amendment A (2026-08-04).** The stated cause is also wrong; see Amendment A.
- ~~**Report Issue 4** (read-endpoint pagination/filtering on `cockpit_summary`/`list_open_items`).~~ **SUPERSEDED — the `list_open_items` half moved IN-SCOPE by Amendment A (2026-08-04).** `cockpit_summary` pagination remains out of scope.
- **Environment notes** — `check_for_updates` `getCurrentVersion()` `0.0.0` stub + unauthenticated private-repo release fetch; `kit_status` `kitVersion: null` stub; the unresolved merge conflict in `_wxAI/commands/wxAI-implement.md` (lines 162/296, 322/356).

### Notes
- **Origin:** `Bugs/Bug-Report-Andrew.md`. This scope covers the report's Issues 1 & 2 only; Issues 3, 4, and the env notes are enumerated in Out of Scope for a later scope.
- **Corrections to the report carried into design:** the `specid` column and `create_task` plumbing already exist (only the published schema hid `specId`); ~~the `dbpush` duplication is caused by the title separator (em-dash vs colon), not the doctype (both are `'specs'`)~~ — **this is wrong; corrected by Amendment A (2026-08-04).** The separator defect is real but sits in `pushExistingSpec`, a code path that never executes; the duplication is caused by `phase2Compare` classifying every spec as new. `list_open_items` already truncates document bodies to a 200-char preview. These corrections scoped the fix down to the minimal additions above.
- **Process:** Issues 1 & 2 authored + built green (tsc, build, 12/12 schema tests) in-conversation before this scope was written; `createSpecs` → task registration → fence reconciliation → deploy is the remaining path.

---

## Amendment A — Issues 3 and 4 Pulled In-Scope (2026-08-04)

**Status**: `draft` — approved section by section, not yet built.

### Why this amendment exists

SCOPE-101 identified four issues during authoring, built fixes for two, and deferred Issues 3 and 4
to "tracked separately". They were never tracked anywhere. Seventeen days later both are still live,
and Issue 3 is worse than recorded.

**What SCOPE-101 got wrong.** The original Notes record the dbpush duplication as *"caused by the
title separator (em-dash vs colon), not the doctype"* — a defect inside `pushExistingSpec`. That
diagnosis describes a code path **that never executes**. `phase2Compare` builds `knownSpecNumbers`
from `project.list_open_items`, reading `t.specNumber ?? parseScopeFromTaskTitle(t.title)`. Both
halves fail: `list_open_items` publishes no `specNumber` field at all, and task titles carry no scope
number — they read `"T011: Transitional mitigation…"`. The set is empty, `isNew` is true for every
spec, and **every artifact routes to `pushNewSpec`**. The em-dash bug is real but unreachable;
fixing it alone would change nothing.

**What it costs.** dbpush cannot sync — every run is an insert. Because the failure is silent and the
tool reports success, the only thing standing between the project and 85 duplicate specs is an
operator noticing the created/updated split.

**Primary actor.** The operator syncing local spec artifacts to the Project Hub — in this project and
in consuming projects, which is where this scope's originating bug report came from.

**Compliance bearing (SOC 2 CC8.1).** *"Every production change traces to a tracked item recording
what changed, why, and who approved it."* dbpush is the mechanism that keeps the change-tracking
system faithful to what was built. A sync tool that silently duplicates makes the tracked item cease
to be a record of the change — the control fails at its source.

### Boundary

| | |
| --- | --- |
| **IN** | dbpush spec-matching (`phase2Compare`); `list_open_items` publishing spec identity; paging past `maxItems: 100`; the unreachable `pushExistingSpec` separator bug, fixed once reachable. |
| **OUT** | `project.implement`'s `artifactDir` bug (still unowned); lifecycle-document upsert, which dbpush has never implemented despite the skill doc claiming it; `cockpit_summary` pagination; a `created > 0 && updated == 0` safety guard (offered, not taken up). |

### User Scenarios

#### US6 — dbpush updates an existing spec instead of duplicating it (Issue 3 core)

The operator runs `dbpush --spec 112` against a spec that already exists in the Project Hub with 10 tasks.

**Expected:** the report reads `Specs updated: 1`, `Specs created: 0`. Task statuses reconcile forward-only against `tasks.md`. No second spec row is created, and no task is duplicated.

#### US7 — a read endpoint names the spec a task belongs to (Issue 4 — the enabler)

`project.list_open_items` returns tasks for a project where every task is already linked via `projecttasks.specid`.

**Expected:** each task carries its owning spec's identity in the payload. `phase2Compare` builds a populated `knownSpecNumbers` without parsing titles. The title-parsing fallback stays a fallback, and is no longer the only path.

#### US8 — matching survives a project larger than one page (Issue 4 — scale)

A project holds more open tasks than `maxItems: 100`. The operator runs dbpush.

**Expected:** spec matching is complete regardless of task count. A spec whose tasks fall on page 2 is not classified as new.

#### US9 — the em-dash title, now that the code path is reachable

A spec whose stored title uses an em-dash separator is pushed while `tasks.md` uses a colon.

**Expected:** `pushExistingSpec` matches the existing document and updates it. No duplicate document row. Only observable once US6 lands.

#### US10 — an indeterminate DB state refuses rather than inserts (recurrence prevention)

`phase2Compare` cannot establish what the project already contains — the call fails, returns nothing usable, or truncates.

**Expected:** dbpush refuses to write and says why. "I could not determine what exists" and "this project contains nothing" must not produce the same behaviour.

### Functional Requirements

#### FR-007 — dbpush resolves existing specs from spec identity, not task titles — T007

`phase2Compare` MUST determine what the project already contains from an authoritative spec listing, not by inferring scope numbers from task title strings. The title-parsing fallback MAY remain, but MUST NOT be the only source.

- [ ] A spec present in the DB is classified `isNew: false` and routes to `pushExistingSpec`
- [ ] Classification holds when no task in the project carries a scope number in its title
- [ ] `--dry-run --spec 112` against the current DB reports `updated: 1 / created: 0`
- [ ] A genuinely new spec still routes to `pushNewSpec`

#### FR-008 — `list_open_items` publishes each task's owning spec — T008

The tool MUST return the owning spec identity per task. `projecttasks.specid` is already populated and is what `cockpit_summary` groups on; it is simply not exposed on this endpoint.

- [ ] Every returned task carries its spec identity, or an explicit null for a genuinely unlinked task
- [ ] A task linked via `link_task_to_spec` reports that spec
- [ ] Existing consumers of the endpoint are unaffected by the added field

#### FR-009 — Matching is complete regardless of task volume — T009

Spec and task matching MUST NOT be bounded by a single page. Today `maxItems: 100` silently truncates, and a spec whose tasks fall beyond the cap is indistinguishable from one that does not exist.

- [ ] A project with more open tasks than one page matches every existing spec
- [ ] Completed tasks are included in task identity, so a done task is not recreated
- [ ] Truncation, if it can still occur, is reported — never silent

#### FR-010 — An indeterminate DB state refuses rather than inserts — T010

Where `phase2Compare` cannot establish project contents, dbpush MUST refuse to write. "Could not determine" and "project is empty" MUST NOT produce the same behaviour.

- [ ] An empty result from a failed or truncated read blocks the push with a stated reason
- [ ] A genuinely empty project still permits a first push
- [ ] The refusal names which read failed
- [ ] `--force` may override, and says what it is overriding

#### FR-011 — `pushExistingSpec` matches documents across title separators — T011

Now reachable, the originally-recorded Issue 3 must hold: a stored title using an em-dash MUST match its `tasks.md` counterpart using a colon. **Verify before fixing** — this defect has never been observed, because its code path never ran.

- [ ] Separator variation updates the existing document rather than creating a second
- [ ] Zero duplicate documents for a spec pushed twice in succession

#### FR-012 — Regression tests lock the classification contract — T012

- [ ] A test asserts `isNew: false` for a spec present in the DB, and fails against today's code
- [ ] A test asserts an unusable read refuses rather than inserting (FR-010)
- [ ] Schema test locks the new `list_open_items` field

### Technical Sections

#### Kit — `wxkanban-agent/`

- `dbpush.ts` — **(T007)** `phase2Compare` resolves specs from an authoritative spec listing rather than `parseScopeFromTaskTitle`; `knownTaskIdsBySpec` populated from a complete task read, including completed tasks. **(T009)** paging until exhausted, with truncation reported. **(T010)** the `unreachable` flag becomes a three-state (`ok` / `empty` / `indeterminate`) so "could not determine" stops collapsing into "nothing exists".
- `dbpush.ts` — **(T011)** `pushExistingSpec` document-title matching normalised across separators (em-dash / colon / hyphen).
- `tests/` — **(T012)** classification regression tests, written failing first.

#### Server — `mcp-server/src/`

- `server.ts` — **(T008)** `list_open_items` publishes each task's owning spec identity. Read-only addition; no permission-matrix change, since the tool is already gated.
- `tests/` — **(T012)** schema test for the added field.

#### Task breakdown (fence attribution `[SCOPE 101 / Tnnn]`)

- **T007** — `phase2Compare` resolves specs by identity, not title parsing *(FR-007)* — kit
- **T008** — `list_open_items` publishes owning spec *(FR-008)* — hosted MCP
- **T009** — complete matching under paging, truncation reported *(FR-009)* — kit
- **T010** — indeterminate DB state refuses rather than inserts *(FR-010)* — kit
- **T011** — `pushExistingSpec` separator-tolerant document matching *(FR-011)* — kit
- **T012** — regression tests, kit + server *(FR-012)*

#### Ordering

T007 ships and tests green against `cockpit_summary` for spec identity plus paged `list_open_items`
for tasks, so the kit fix is not blocked on an MCP deploy. T008 then removes the two-call workaround.

**Why not `cockpit_summary` alone:** it returns only *incomplete* tasks, so every task already marked
done would look absent and dbpush would recreate it. `phase2Compare` populates both
`knownSpecNumbers` and `knownTaskIdsBySpec`; the cheap option solves only the first.

### Success Criteria

7. **dbpush syncs instead of inserting.** `dbpush --dry-run --spec 112` against the live DB reports `Specs updated: 1 / Specs created: 0`, where today it reports `created: 1 / updated: 0`. A whole-project dry run reports `0 created` where every spec already exists — against the 2026-07-30 baseline of `85 created / 811 tasks`. *(FR-007)*
8. **Spec identity is available from the read surface.** `list_open_items` returns an owning spec for every linked task — measured against today's **0 of 100**. *(FR-008)*
9. **Volume does not defeat matching.** A project with more open tasks than one page classifies every existing spec as existing, and a completed task is not recreated. Any residual truncation is reported, never silent. *(FR-009)*
10. **An unusable read cannot cause an insert.** With `phase2Compare` forced to fail, dbpush refuses and names the failed read; a genuinely empty project still permits a first push. *(FR-010)*
11. **Proven against the live database, not only in test.** T007 and T010 are verified by an actual dbpush run reporting the correct created/updated split — unit-green plus build-green has shipped fatal bugs before. *(FR-012)*
12. **Green build + regression tests.** `tsc --noEmit` and `npm run build` pass; the classification test fails against today's code and passes after. *(FR-012)*

### Constraints — added by this amendment

- **Two deployment surfaces, superseding the original single-surface constraint.** T008 is hosted-MCP and reaches production on a `main` push. T007 and T009–T012 are kit source and reach consumers only via `sync-to-orchestrator --release`. A consumer on an older kit keeps the duplicating dbpush until they upgrade — the half that protects users has the slower delivery path.
- **T011 is verify-before-fix.** SCOPE-101 recorded the em-dash defect but it has never been observed, because its code path never ran. Confirm it is real before changing anything.
- **Forward-only status sync is retained.** `syncTaskStatuses` flips incomplete DB tasks to terminal and never the reverse. Nothing here changes that; `partial` and other non-terminal statuses stay non-terminal.
- **Nothing pushed or published until the user says so.**

### Out of Scope — added

- **A `created > 0 && updated == 0` safety guard.** Offered and not taken up — a cheap backstop independent of the root-cause fix. Recorded here so it is a decision, not an omission; on request it becomes FR-013.
- **Lifecycle-document upsert.** dbpush has never implemented it despite the skill doc's "Push lifecycle to `projectdocuments` (doctype: 'lifecycle')" step. It only reads `phase`/`priority` and feeds `create_specs`. Named so the next reader does not assume it regressed.
- **`project.implement`'s `artifactDir` bug** — still unowned, unchanged by this amendment.
- **`cockpit_summary` pagination** — this amendment covers `list_open_items` only.

### Notes — added

- **This amendment corrects SCOPE-101's own diagnosis.** The original Notes state the duplication is caused by the title separator. That describes `pushExistingSpec`, which never executes. The original note is superseded, not deleted.
- **Issues 3 and 4 move from Out of Scope to In Scope.** They sat in the Out of Scope list from 2026-07-18 as "tracked separately" and were never tracked anywhere.
- **Evidence, 2026-08-04.** `--dry-run --spec 112` → `created: 1 / updated: 0 / tasks created: 11` against existing spec `287a44cf` holding 10 tasks. `list_open_items` → 0 of 100 tasks carry `specNumber`; titles read `"T011: …"`. SPEC-112 was hand-synced through 11 targeted MCP calls instead.
- **Process:** authored via `/buildscope` Edit Mode, section by section with explicit approval at each of the five sections. Compliance context loaded and active (SOC 2) — which itself confirms SPEC-112's `get_audit_config` re-key works.

---

## Amendment B — Task Edit and Delete (2026-09-25)

**Status**: `approved` — design decisions taken by Andy on 2026-09-25, before any code.
**Originating report**: feedback `edd34387-e52d-457a-acd8-75ea17c35674` (suggestion, medium), raised by a consuming project's AI agent (project `68cf2d4b-fb8e-442f-8290-3aa3fd2be701`) during a multi-scope design build.

### Why this amendment exists

The MCP surface can create a task, change its status, and re-parent it to a spec. It cannot change a task's content, and it cannot remove one. In the reported case an agent identified two tasks carrying stale cross-scope FR references, knew the exact before and after text, and could not apply the fix. Separately, any file-based task push can create a parallel duplicate set, and nothing can remove it.

**Deletion is worse than reported.** The report assumes the Portal can clean up. It cannot: there is no task DELETE route in the app at all, so today a duplicate task is permanent everywhere.

**A plain delete would destroy billable time.** `projecttimeentries.taskid` is `ON DELETE CASCADE`, and so are `taskdependencies` (both sides), `tasksyncrecords`, `complianceflags` and `taskstateoverrides`. A naive delete would silently remove time entries, the external PM link, and compliance evidence.

### Decisions (2026-09-25)

| Question | Decision | Why |
| --- | --- | --- |
| Delete semantics | **Guarded hard delete** | Covers duplicate cleanup exactly. A soft `archived` status would have to be taught to every board, Cockpit and count query. |
| Who can delete | **Editor and admin** | Agent tokens are typically editor. Matches `delete_scope`'s precedent. The guard is what makes it safe, not the role. |
| Assignee | **`assignedToId` (user UUID)** | Writes `assignedtoid`, the column the app reads and notifies on. `create_task`'s free-text `assignee` column is not shown in the Portal. |
| Home | **SCOPE-101 Amendment B** | Same MCP task-surface family as `link_task_to_spec`. |

### User Scenarios

#### US11 — correct a task's stale content

An agent finds a task whose description cites `007 FR-017` where the requirement now lives at `SCOPE-002 FR-013`.

**Expected:** one `project.update_task` call with `taskId` and the corrected `descriptionMarkdown` changes the task in place. Fields not sent stay unchanged. The response returns the updated task.

#### US12 — remove a duplicate the agent created

A file-based push created a plain-titled duplicate of an existing task. Nobody has logged time against it.

**Expected:** `project.delete_task` removes it and returns a snapshot of what was deleted, so a mistake can be recreated by hand.

#### US13 — a delete that would destroy work refuses

The agent tries to delete a task that has two time entries and a Jira sync record.

**Expected:** nothing is deleted. The response names each blocker and its count (`timeEntries: 2`, `externalSyncRecords: 1`). Deleting it takes a human decision.

#### US14 — tenant isolation

A token bound to project A passes a task ID from project B to either tool.

**Expected:** `Task not found`. Nothing in project B is read, changed or deleted.

### Functional Requirements

FR-013 remains reserved for the dbpush safety guard that Amendment A offered and did not adopt.

#### FR-014 — `project.update_task` patches task content — T013 (schema), T014 (handler)

- [ ] Accepts `taskId` plus any of: `title`, `descriptionMarkdown`, `priority`, `dueDate` (null clears it), `assignedToId` (null unassigns)
- [ ] At least one patch field is required; an empty patch is rejected with a clear message
- [ ] Only the fields sent change; `updatedat` is stamped
- [ ] `assignedToId` must be a user in the project's company or with a `projectusers` row on the project; otherwise the call is rejected and nothing is written
- [ ] Status and spec link are not editable here: `update_task_status` and `link_task_to_spec` own them

#### FR-015 — `project.delete_task` is a guarded hard delete — T013 (schema), T015 (handler)

- [ ] Refuses, deleting nothing, when the task has any time entry, external PM sync record, dependency in either direction, compliance flag, or state override. The response names every blocker with its count.
- [ ] When unblocked, deletes the task and returns a snapshot (id, title, description, status, priority, specId, createdAt)
- [ ] Reports how many AI proposals and test-plan items lost their link (`ON DELETE SET NULL`), so the side effect is visible
- [ ] Logs the deletion with the snapshot

#### FR-016 — Tenant scoping and least privilege — T014, T015

- [ ] Both tools resolve the task through `projectid = scope.projectId`; a cross-project `taskId` returns `Task not found`
- [ ] The blocker check and the delete run in **one transaction that first locks the task row** (`SELECT … FOR UPDATE`, predicated on `id` and `projectid`). Without the lock, a time entry logged between the count and the delete would be cascade-deleted silently; with it, a concurrent child insert waits and then fails its foreign key. This follows `merge_scope`'s manually-scoped `scoped.raw` pattern, because the scoped helpers cannot join a transaction.
- [ ] A blocker count that cannot be read refuses the delete (fail closed); it is never treated as zero
- [ ] Both gated `editor`/`admin` in the permission matrix; the stale admin-only `delete_task` placeholder is replaced

#### FR-017 — Regression tests — T016

- [ ] Schema tests: an empty patch is rejected; a non-UUID `assignedToId` is rejected; `null` is accepted for `dueDate` and `assignedToId`
- [ ] Tool-matrix parity test passes with both tools registered
- [ ] The guard's blocker query is run read-only against the live database and returns correct counts for a task known to have time entries

### Technical Sections

#### Server — `mcp-server/src/`

- `utils/schemas.ts` — **(T013)** `UpdateTaskInputSchema`, `DeleteTaskInputSchema`
- `db/schema.ts` — **(T014)** declare `assignedToId` → `assignedtoid` on the `projecttasks` mirror. The column already exists in production (verified 2026-09-25), so declaring it is safe.
- `server.ts` — **(T014, T015)** handlers and tool registrations
- `auth/role-checker.ts` — **(T014, T015)** permission entries
- `utils/help-context.ts` — both tools listed

#### Task breakdown (fence attribution `[SCOPE 101 / Tnnn]`)

- **T013** — `UpdateTaskInputSchema` and `DeleteTaskInputSchema` *(FR-014, FR-015)*
- **T014** — `update_task` handler, registration, permission, `assignedToId` mirror column *(FR-014, FR-016)*
- **T015** — `delete_task` guarded handler (row-locked transaction), registration, permission *(FR-015, FR-016)*
- **T016** — regression tests and live read-only guard verification *(FR-017)*

### Success Criteria

13. **The reported case is fixable by an agent.** A stale FR reference in a task description is corrected with one `update_task` call and no Portal visit. *(FR-014)*
14. **A duplicate can be removed.** A task with no dependent work is deleted with one call, and the response carries its snapshot. *(FR-015)*
15. **No billable time is ever lost to this tool.** A task with time entries is refused, with the count named. *(FR-015)*
16. **Green build and tests.** `tsc --noEmit`, `npm run build` and the MCP unit suite pass, including the tool-matrix parity test. *(FR-017)*

### Constraints

- **One deployment surface.** All of this is hosted MCP and reaches production on a push to `main`, which also deploys the app. Nothing is pushed until Andy says so.
- **Verify live after deploy.** Run one `update_task` and one refused `delete_task` against the hosted server. App Runner has rolled back silently before, so check that the tool actually works; a matching version number is not proof.

### Out of Scope

- **A Portal delete button.** The app still has no task DELETE route. Adding one is a UI decision this amendment does not make.
- **Soft archive.** Rejected on 2026-09-25 (see Decisions).
- **Batch edit or delete.** One task per call. `link_task_to_spec` is batch because its repair case was hundreds of tasks; the edit and delete cases reported are a handful.
- **Reconciling `assignee` with `assignedtoid`.** Both columns exist. `create_task` keeps writing `assignee`; this amendment writes `assignedtoid`. Merging them is a separate decision.
