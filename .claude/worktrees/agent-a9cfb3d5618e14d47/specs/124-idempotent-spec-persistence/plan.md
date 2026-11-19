# Implementation Plan: Idempotent Spec Persistence

## Read this first

**T001 is already done and deployed.** FR-001 shipped ahead of this scope as commit `316ffef4` on
2026-08-05 and is live on the hosted MCP. Do not re-implement it. Its residual — the derived slug may
not match the file name the client wrote at creation — is real and is *not* closed by T001; see Risks.

**Two delivery paths in one scope.** `mcp-server/` deploys on push to main with no customer action;
`wxkanban-agent/dbpush.ts` reaches customers only through a kit release. FR-002, FR-004, FR-005,
FR-007 and FR-008 are server-side and can ship as they are ready. FR-003 and FR-006 are kit-side and
ship with the batch. Knowing which half a task is in tells you when it reaches anyone.

## Architecture

### The enabling insight

`(projectId, specNumber)` is **already** the unique key — `idx_projectspec_project_specnumber` exists
and is enforced. Every symptom in this scope is something choosing to answer "which spec is this?"
some other way: a regex over task titles, a directory listing, a regenerated slug. The work is to make
the existing key the only answer.

That is also why the unique index is currently experienced as a *bug* ("Duplicate specNumber 010")
rather than as protection. It is doing its job; the caller is asking the wrong question.

### Why FR-004 comes before FR-003

`dbpush` parses task titles because the envelope it is given cannot answer the question — it carries
`tasks`, `documents` and `events`, and no `specs[]`. Fixing `dbpush` without fixing the envelope means
inventing a second query path. Give the tool the answer first, then let `dbpush` consume it.

### The document-identity question

FR-005 needs a stable document identity — spec plus doctype. An index enforces it properly, but this
database has no migration ledger, six declared tables are already missing from production, and
`drizzle-kit push` is prohibited. **Prefer the application-level upsert**; if an index is chosen it is
DDL and goes through the manual schema process with a schema-change-log entry.

## Sequencing

1. **T006, T007** — `list_open_items` exposes spec identity, and `dbpush`'s dead branch is resolved or
   deleted. Everything downstream depends on this.
2. **T004, T005** — `dbpush` reads specs instead of titles. Kit-side.
3. **T008** — idempotent upsert. The fix most visible to the affected customers.
4. **T009** — remove the `maxItems: 100` bound from the identity path.
5. **T002, T003** — read-modify-write on edit. Independent of the `dbpush` line and safe to
   parallelise.
6. **T010–T013** — preflight. Fully independent; can start any time.
7. **T014, T015** — duplicate detection and removal. **T015 cannot start until SCOPE-098 T007–T009
   ship.**
8. **T016, T017** — housekeeping and the regression suite.

## Key decisions already locked

- FR-001 ships ahead as a hotfix, scoped tightly to identity resolution. Rationale: the batch rule
  covers what customers must *install*; server-side fixes cost them nothing, so they ship when ready.
- SCOPE-124 is built before SCOPE-123 — a blocked customer knows they are blocked, a corrupted board
  gets believed.
- FR-008 consumes `project.delete_scope` rather than growing a second delete path. If SCOPE-098 slips,
  FR-008 slips.
- Detection before deletion: FR-008's detection is read-only and every removal is per-scope confirmed.

## Risks

**T001's residual is not closed.** With no `shortName` column, the slug derives from the spec's
`title`, which need not match the file name created from `featureDescription`. Our own spec 016
demonstrates it: DB title yields `016-spec-016-wxkanban-online-help`, the file on disk is
`016-scope-help.md`. A client told the former may write a *second* file. FR-002 does not fix this
either — the durable fix is storing the slug, which needs DDL and its own decision. Do not close
FR-001's residual by widening T002.

**FR-008 operates on real customer projects.** One carries 29 duplicates. Detection must be read-only,
matching must be explainable, and nothing may be removed in bulk on an inference.

**FR-007 has two detectors, not one.** `matchesPlaceholder` in `shared/preflight` is what blocks
`create_specs`; `server.ts:396` is a separate implementation with its own rules that BUG-12's
narrowing never reached. Fixing one and declaring victory is the likely failure. Note also that
`normalizeText` **strips backticks before matching**, so a code-span-aware check cannot work — that
information is destroyed first.

**An unconfirmed reporter claim.** `c9fc52d4` says both the singular and plural Spanish forms trigger
the check; word-boundary matching should not match the plural. Either a third detection site exists or
the observation is imprecise. T013 settles it — do not close FR-007 on the marker fix alone.

## Delivery

Server-side pieces deploy continuously as they land. Kit-side pieces batch with SCOPE-121, SCOPE-122
and SCOPE-123 into one kit release at 1.7.50, after which the eight customer replies go out together.
