# SCOPE-089 — Project-Scoped Scope Numbering (UUID-Keyed Allocation)

**Scope Number**: SCOPE-089
**Status**: `draft`
**Created**: 2026-07-05
**Depends On**: SCOPE-028 (hosted MCP + `/call`/SSE gateway — the shared allocation surface), the buildscope → create_specs pipeline (the caller being changed)
**Source**: `specs/Project-Scope/089-project-scoped-scope-numbering.md`

---

## Overview

Scope numbers are allocated by a filesystem heuristic. `generateNextSpecNumber()` (`mcp-server/src/utils/project-kit.ts`) takes the highest `NNN` among `specs/Project-Scope/NNN-*.md` in whatever directory `resolveWorkspaceRoot()` resolves to, and adds one. That resolver walks **up** from the process's launch directory to the first `.wxkanban-project.json` it finds. With ~30 wxKanban-managed projects nested under a single parent folder, the resolver frequently anchors on a **sibling** project's tree, so a new scope inherits the wrong project's counter.

The damage is observable: YappChat's scope sequence reads `001…018, 068, 071, 087` — the jumps are wxKanban's numbers borrowed at the moments those YappChat scopes were built (wxKanban was at max 086 when YappChat's "087-conferences" was created). This produces cross-project number collisions (two different projects each own an "087"), a non-contiguous per-project history that misleads anyone reading the roadmap, and silent mis-filing that only surfaces later. Because the number is the entry point to every downstream artifact (spec folder, code fences, lifecycle, dependency graph), a wrong number at buildscope time propagates everywhere.

This scope makes a scope's number a function of **which project it belongs to** — its DB identity (UUID) — never **where the process was launched**. The database becomes the authoritative per-project scope counter; allocation is atomic; the filesystem `NNN-*.md` sequence becomes a mirror. When the DB is unreachable, buildscope asks the developer for a number, marks the scope **provisional**, and reconciles it against the authority the next time the DB is reachable.

Existing contaminated numbers are **frozen** — this scope fixes allocation going forward only, with no renumbering pass.

## Actors

Primary: the developer (or the editor AI acting on their behalf) who invokes buildscope to create a new scope in a specific project. They get a number that belongs to *their* project regardless of the directory the process was launched from.

Secondary: the MCP/kit scope-allocation component that computes and hands out the number; the wxKanban database, which holds the authoritative per-project scope records keyed by project UUID; the local `specs/Project-Scope/` filesystem tree, which becomes a mirror of the allocated number rather than its source of truth.

**Key value:** a scope's number is determined by the project it belongs to, not by the accident of the launch directory — so two projects can never silently claim the same number, and a project's scope history reads contiguously.

## Scope Boundary

Included in this iteration:

- A DB-backed, per-project scope-number allocator keyed by project UUID: given a UUID it returns that project's own next SCOPE number (current max + 1), allocated **atomically** (transaction / advisory lock / sequence keyed on the UUID) so concurrent calls cannot collide.
- buildscope calls this allocator with the project UUID it already holds (from `.wxai/project.json` / `.mcp.json`) instead of the cwd-walking filesystem heuristic.
- File placement resolved from the intended project's UUID, not the cwd walk-up — the new `NNN-*.md` lands in the tree of the project it belongs to, so number and location never diverge.
- The `specs/Project-Scope/NNN-*.md` sequence becomes a **mirror** of the DB-allocated number, no longer the source of truth.
- A DB-unreachable path: buildscope prompts the developer for the number, records the scope as **provisional**, and reconciles it against the authoritative per-project max on the next DB-reachable operation.
- Allocation exposed as one MCP operation reachable through the existing `/call` gateway and SSE, so the local kit and the hosted paths share a single authority and implementation.
- Applies to the **SCOPE** namespace only.

## Out of Scope

Explicitly excluded from this iteration:

- Renumbering or reconciling the already-contaminated scopes (YappChat's 068/071/087, etc.) — frozen; allocation is fixed going forward only.
- Any change to the SPEC-folder (`specs/NNN-name/`) numbering — the separate namespace is untouched.
- Building a full DB scope registry for projects that exist only on disk and were never pushed, beyond what is needed to read a project's current max.
- Cross-project number dashboards, analytics, or reporting.
- Changing the `SCOPE-NNN` vs `SPEC-NNN` labelling convention itself.

---

## Functional Requirements

**FR-001 — Atomic per-project allocator.** A new allocator computes the next SCOPE number for a given project UUID as (the project's current max SCOPE number in the authoritative DB registry) + 1, executed within a transaction / advisory lock keyed on the project UUID so concurrent allocations serialize rather than collide. It returns a zero-padded 3-digit string. First-ever scope for a project returns `001`.

**FR-002 — UUID-driven allocation in buildscope.** buildscope reads the project UUID from `.wxai/project.json` / `.mcp.json` and calls the allocator with it, replacing `generateNextSpecNumber()`'s cwd-walking max-plus-one heuristic as the source of the number. The allocator echoes the resolved project name + UUID so the developer can confirm the number was allocated for the intended project.

**FR-003 — UUID-driven file placement.** The target `specs/Project-Scope/` directory the new `NNN-*.md` is written to is resolved from the intended project's identity (the `.wxkanban-project.json` whose `projectId` matches the UUID, or the registered project path), not by walking up from `process.cwd()`. The allocated number and the file's location always belong to the same project.

**FR-004 — DB-unreachable path: user-supplied provisional number.** If the allocator cannot reach the DB, buildscope does not silently fall back to the cwd heuristic. It prompts the developer to supply the scope number (offering the local filesystem max+1 as a non-authoritative suggested default), records the scope, and marks it **provisional** — a visible marker in the scope frontmatter (e.g. `Status: draft (provisional-number)` or an explicit `Provisional-Number: true` field).

**FR-005 — Reconciliation on reachability.** On the next DB-reachable scope operation (buildscope, create_specs, or an explicit sync), every provisional scope is reconciled against the authoritative per-project max: if its provisional number is valid and unique for that project it is confirmed and the provisional marker cleared; if it collides or is out of sequence, the scope is reassigned the correct next number and the change is surfaced to the developer (not applied silently).

**FR-006 — Filesystem as mirror, not authority.** After allocation the number is written to disk as `NNN-*.md`; the DB per-project scope registry remains the source of truth. The directory-scan max-plus-one logic is removed as an *authority* — retained only, if at all, as the suggested default in the FR-004 offline prompt.

**FR-007 — Single allocation authority via MCP.** Allocation is exposed as an MCP operation reachable through the `/call` gateway and SSE, so the local kit CLI and the hosted/SSE paths use one implementation and one authority. No second, divergent allocator.

**FR-008 — Namespace isolation.** Allocation applies to the SCOPE namespace only. The SPEC-folder counter is unaffected by this change. The `SCOPE-NNN` / `SPEC-NNN` dual-namespace convention is preserved exactly.

---

## Data Requirements

**Authoritative store: `projectspecifications`.** This table (mirrored in the MCP and app schemas) already carries `(projectid, specnumber)` under a **unique index** (`idx_projectspec_project_specnumber`) — one spec number per project. It becomes the per-project scope counter this scope makes authoritative: the next number for a project is `max(specnumber) + 1` over rows where `projectid = :uuid`. No new table is strictly required.

- **Numeric comparison, not lexical.** `specnumber` is `varchar(10)`. Max/increment must compare **numerically** (cast to int), so `100` follows `099` rather than sorting as a string; the result is zero-padded back to at least 3 digits. Frozen legacy rows of mixed width must not break the comparison.
- **Reservation at buildscope time (the timing gap).** Today rows are inserted by create_specs, which runs *after* buildscope. If the allocator only reads `max(specnumber)`, two scopes buildscope'd before either is create_specs'd would collide. So allocation must **reserve** the number atomically at buildscope time — insert a placeholder `projectspecifications` row (status `scoping`/`draft`) inside the same transaction / advisory lock, letting the unique index reject a racing duplicate and the allocator retry. create_specs then **upserts** that reserved row (by `projectid, specnumber`) instead of inserting a fresh one.
- **Reservation lifecycle.** An abandoned buildscope leaves a draft reservation, and that number is treated as used — numbers only ever climb, consistent with the frozen-history decision. Cleanup of stale reservations is out of scope here.
- **Offline provisional path (FR-004/FR-005).** When the DB is unreachable no reservation is written; the user-supplied number stays provisional until the reconciliation pass validates/writes the reservation row against this table (confirming or reassigning).
- **Namespace note.** This governs the SCOPE number stored in `specnumber`; the separate SPEC-folder counter is untouched. If a `scoping`-status reservation proves noisy in practice, a dedicated lightweight per-project counter column/table is the alternative to weigh in the plan.

## Integration

- Reads project identity (the UUID anchor) from `.wxai/project.json` / `.mcp.json`, and runs as an MCP operation over the existing `/call` + SSE gateway, so the local kit CLI and the hosted paths share one allocator and one authority.
- Replaces the *authority* role of `generateNextSpecNumber()` / `resolveWorkspaceRoot()` in `mcp-server/src/utils/project-kit.ts`; both buildscope (reserve) and create_specs (upsert) consume the allocated number, and the filesystem `NNN-*.md` sequence is written to match.

---

## Success Metrics

- **SM-001 — Correct project, any cwd:** Across a regression suite of buildscope runs launched from varied working directories (including a cwd that resolves to a *sibling* project's `.wxkanban-project.json`), 100% of allocated numbers match the **target project's** own next-in-sequence, with 0 numbers borrowed from another project.
- **SM-002 — No new collisions:** After rollout, an automated cross-project audit over all managed `Project-Scope/` trees reports 0 **new** within-project duplicate scope numbers (pre-existing frozen collisions excluded from the baseline).
- **SM-003 — Atomic under concurrency:** Under 20 concurrent allocations against the same project UUID, the allocator returns 20 distinct, sequential numbers with 0 duplicates.
- **SM-004 — Provisional reconciliation:** 100% of provisional (offline-allocated) scopes are reconciled — confirmed or corrected — on the first DB-reachable scope operation, with every correction surfaced to the developer (0 silent renumbers).

## Open Questions

- **Authoritative DB source of the per-project max.** Which existing table/column is queried for a project's current max SCOPE number — the per-project scope records (e.g. `projectspecifications` / a scope-materialization row filtered by `projectId`), or a dedicated scope-counter column? To be pinned in the plan; the allocator must read whatever the create_specs / record_scope_materialized path already writes so the two stay consistent.
- **Locating a project's on-disk `Project-Scope/` from its UUID (FR-003).** Match the `.wxkanban-project.json` whose `projectId` equals the UUID, or maintain a registered path map? Behavior when no local tree exists (hosted-only project) needs definition.
- **Provisional marker representation.** Reuse `Status` with a suffix, or add a dedicated frontmatter field, so the reconciliation pass (FR-005) and the create_specs preflight both recognize it without ambiguity.

---

## Dependencies & Risks

**Dependencies**

- **Authoritative per-project scope registry (DB).** The allocator reads the same per-project scope records the create_specs / `record_scope_materialized` path writes, keyed by `projectId`. If a project's registry is incomplete (disk-only scopes never pushed), the computed max can be too low until seeded/reconciled.
- **Project identity in config.** `.wxai/project.json` / `.mcp.json` must carry the correct project UUID — that UUID is the anchor that replaces the cwd walk-up.
- **Hosted MCP `/call` + SSE (SCOPE-028).** Allocation runs as a shared MCP operation over these transports so local and hosted callers share one authority.
- **`resolveWorkspaceRoot()` / `generateNextSpecNumber()` in `mcp-server/src/utils/project-kit.ts`.** The code being replaced as the *source of authority* (and, for FR-003, as the file-placement resolver).

**Risks**

- **Wrong UUID in config → allocates for the wrong project.** Mitigation: the allocator echoes the resolved project name + UUID for the developer to confirm before the file is written (FR-002).
- **Incomplete DB registry for disk-only projects.** Max computed too low → duplicate. Mitigation: seed/import the project's on-disk max on first allocation, and let FR-005 reconciliation catch drift.
- **Provisional-number proliferation** if a developer is frequently offline. Mitigation: the FR-005 reconcile step runs on the next reachable op and the marker is visible, so provisional scopes cannot silently persist.
- **Concurrency across hosted + local callers.** Two callers allocating for one project at once. Mitigation: FR-001 atomic allocation via advisory lock / transaction keyed on the project UUID.
- **Preflight compatibility.** The create_specs preflight must accept the provisional marker rather than reject the scope. Mitigation: FR-004/FR-005 define the marker explicitly and the plan wires the preflight to recognize it.

**Deferred (future scopes, not built here)**

- A one-time reconciliation/renumbering pass over historically contaminated scopes (frozen by decision).
- Applying the same UUID-keyed atomic allocation to the SPEC-folder namespace.
- A cross-project scope-number audit dashboard.
