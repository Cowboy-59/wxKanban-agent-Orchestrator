# Bug: MCP scoped-query tenancy-column defects (projectidCol casing + projectproposals mis-classification)

**Date**: 2026-05-28
**Spec**: 028 (Hosted MCP Deployment — scope-enforcement layer, `mcp-server/src/db/scoped-query.ts`)
**Severity**: High (blocks `create_specs` / `upsert_document` for project-scoped tables)
**Found during**: dbpush of spec 042 (VS Code Dev Cockpit)

---

## Summary

Two distinct defects in the MCP server's per-request scope-enforcement layer (`scoped-query.ts`, spec 028 / T009) surfaced while pushing spec 042 to the DB:

1. **`projectidCol` property-casing mismatch** (FIXED 2026-05-28) — the tenancy-column lookup used the wrong JS property casing, so writes to camelCase-keyed scoped tables threw `scope-missing-column`.
2. **`projectproposals` mis-classified as project-scoped** (OPEN) — it is listed in `PROJECT_SCOPED_TABLES` but has no project column by design; it should be company-scoped.

---

## Defect 1 — projectidCol property-casing mismatch (FIXED)

### Root cause
`projectidCol(table)` resolved the tenancy column via `table['projectid']` (lowercase). Drizzle exposes columns under their JS property name, which is camelCase (`projectId`) for `projectdocuments`, `projecttasks`, and `projectspecifications` (e.g. `schema.ts:23 projectId: uuid('projectid')`). The lookup returned `undefined`, so the guard threw:

```
scope-missing-column: projectdocuments.projectid not defined
```

`create_specs` surfaced this as `MCP error -32603 … 500 Internal Server Error`.

### Impact
Every `selectScoped` / `insertScoped` / `updateScoped` against a camelCase-keyed scoped table failed. `create_specs` (writes `projectdocuments` + `projecttasks` + `projectspecifications`) and `upsert_document` were broken under authenticated (non-dev-bypass) scope.

### Fix applied
`scoped-query.ts` `projectidCol` now resolves either casing, preserving enforcement:

```ts
const t = table as unknown as Record<string, unknown>;
return t['projectid'] ?? t['projectId'];
```

---

## Defect 2 — projectproposals mis-classified as project-scoped (OPEN)

### Root cause
`PROJECT_SCOPED_TABLES` includes `projectproposals`, but a proposal represents a *potential* new project and is not bound to one — its schema has `companyid` only, no `projectid` (`schema.ts:97`). Project-id scoping therefore cannot apply.

### Impact
Any access to `projectproposals` through the scoped helpers throws `scope-missing-column` (the casing fix does not help — there is genuinely no project column). Not hit by 042's dbpush (`create_specs` never writes proposals), so it is currently latent.

### Proposed fix (not yet applied)
Give `projectproposals` company-level tenancy: scope it by `companyid` (`scope.customerId`) instead of `projectId` — either a `COMPANY_SCOPED_TABLES` branch in `withScope`, or remove it from `PROJECT_SCOPED_TABLES` and route proposal access through a company-scoped helper. Confirm the proposal model (spec 024 / 025) for the correct tenancy key.

---

## Defect 3 — create_specs is not transactional; partial commits on failure (OPEN)

### Root cause
`project.create_specs` writes the spec row, then documents, then tasks in sequence with no wrapping DB transaction. When a later step throws (e.g. Defect 1's `scope-missing-column` on a scoped op), the already-committed earlier writes are left behind as an orphan partial spec.

### Impact
During the 042 dbpush, the run blocked by Defect 1 still left an orphan set (1 spec + 2 docs + 1 task) in the DB; the later successful run created a complete second set → duplicates that required manual cleanup via `scripts/cleanup-042-orphan.mjs`.

### Proposed fix (not yet applied)
Wrap all of `create_specs`'s writes in a single DB transaction so any failure rolls back the entire spec creation (all-or-nothing).

---

## Defect 4 — dbpush idempotency detection is broken (OPEN) — properly a spec-029 concern

### Root cause
`dbpush` `phase2Compare` (dbpush.ts) decides whether a spec already exists by parsing a `[NNN-T###]` prefix from task titles returned by `list_open_items` (`TASK_TITLE_SCOPE_RE`). But the `dbpush → create_specs` path pushes raw task titles **without** that prefix, so no scope is ever derived, `knownSpecNumbers` stays empty, and every re-run treats the spec as new (`pushNewSpec`) → duplicate rows instead of an update.

### Impact
Re-running dbpush for an already-pushed spec duplicates spec/doc/task rows (compounds Defect 3). Cross-referenced here because it surfaced in the same 042 session; the fix belongs to spec 029 (DbpushBlockingContract).

### Proposed fix (not yet applied)
Make idempotency independent of title formatting — compare by `projectspecifications.specnumber` via a dedicated exists/list query, or have `create_specs` upsert by `(projectId, specNumber)`.

---

## Defect 5 — insertScoped does not enforce scope on camelCase-keyed tables (FIXED)

### Root cause
`scoped-query.ts` `insertScoped` merged the tenancy value as `{ ...values, projectid: projectId }` (lowercase). Drizzle insert values are keyed by the schema PROPERTY name, which is camelCase `projectId` for `projectspecifications`/`projecttasks`/`projectdocuments`, so the lowercase key was dropped and the caller-supplied `projectId` survived — bypassing scope enforcement on insert. Write-side twin of Defect 1.

### Impact
`create_specs` (and any scoped insert) wrote rows under the caller-supplied `projectId` instead of the token's scope. Surfaced when the local token (scope `73d25de9`) wrote spec 042 to `ba924193` (the dbpush input projectId) without a scope-mismatch error. Silent scope-enforcement bypass on writes — a security hole.

### Fix applied
Added `projectidKey(table)` to resolve the correct property name; `insertScoped` now reads the incoming value and merges under that key, so the token's scope is enforced and a mismatched caller `projectId` raises `scope-mismatch`.

---

## Verification
- Defect 1: re-run dbpush for spec 042 after rebuild + MCP restart; `create_specs` should land the spec + 34 tasks with `pushErrors: 0`. (CONFIRMED 2026-05-28: specsCreated 1, tasksCreated 34, 0 errors.)
- Defect 2: add a scoped read/write test against `projectproposals` once company-scoping lands.
- Defect 3: simulate a mid-call failure in `create_specs`; confirm no spec/doc/task rows persist.
- Defect 4: push a spec twice; confirm the second run updates rather than duplicating.
