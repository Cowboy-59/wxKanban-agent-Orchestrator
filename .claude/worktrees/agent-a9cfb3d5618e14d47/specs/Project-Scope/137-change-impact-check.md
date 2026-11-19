# Scope 137: Change Impact Check

**Scope Number**: 137
**Status**: `draft`
**Created**: 2026-10-16
**Depends On**: SCOPE-026 (code fences), SCOPE-058 (Cockpit badges), SCOPE-073 (scope dependencies, save watcher), SCOPE-111 (impact graph, `report_change_impact`), SCOPE-127 (stack adapters)
**Related Scopes**: SCOPE-077 (scope-level, non-blocking analysis — boundary below), SCOPE-015 (`/buildscope`)
**Implemented By**: SPEC-137 (`specs/137-change-impact-check/`)
**Source**: `specs/Project-Scope/137-change-impact-check.md` — converted from `docs/brainstorms/2026-10-16-impact-check.md`

## Overview

The Change Impact Check shows, at the moment of a change, the **Change Impact**: the code, scopes,
shared tables, and human test sign-offs the change reaches, each link labeled with its confidence.
It covers three kinds of change:

- **AI edits:** checked before the edit lands, by a Claude Code PreToolUse hook.
- **Hand edits in VS Code:** checked on save, through the Cockpit.
- **Scope changes:** checked by a step in `/buildscope`. wxBrainstorm also shows the impact during a
  discussion.

How it responds:

- Every change **notifies**.
- A change that crosses an **Impact Boundary** asks for agreement.
- A change that could **lose data** always stops.
- **Unattended runs** never wait: they log each crossing and report it at the next checkpoint.

The project owner chooses the mode (notify, boundaries, or always). Every agreement is recorded in
wxKanban as change-management evidence.

One engine serves every entry point. It reuses:

- the SCOPE-111 impact graph
- SCOPE-026 fences
- SCOPE-073 scope dependencies
- the SCOPE-058 and SCOPE-073 Cockpit plumbing
- the SCOPE-127 stack adapters

It covers every stack the kit offers, in one release.

**Boundary against SCOPE-077:** 077 stays scope-level, server-side AI analysis that never blocks.
This scope owns code-level Change Impact and the agree gate.

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actor** | Developer who makes or approves changes (by hand or through the AI) |
| **Secondary Actors** | AI coding agent (Claude Code), Project owner (sets impactMode) |
| **Key Value** | A fix stops silently breaking, or unmasking, something elsewhere, because whoever makes it sees what it reaches before it lands. |
| **Scope Boundary** | IN: one shared Change Impact engine (reusing the SCOPE-111 impact graph) used by every entry point; eight link types with confidence labels; file-level check for notify and function-level check at the ask moment, with a cached index; honest reports naming checked and unchecked link types; coverage of every stack the kit offers (JS/TS native incl. .vue/.svelte/.astro; other stacks via a new "links" section in SCOPE-127 adapters; generic fallback); Impact Boundary and data-loss detection; impactMode setting (notify / boundaries default / always); a Claude Code PreToolUse hook for AI edits (deny-with-reason at a boundary); unattended-run behavior (log, continue, report at checkpoint; data loss always stops; remote relays to phone); Cockpit views (status bar, Explorer badges, Problems entries, CodeLens on fences, agree panel); a /buildscope impact step on amend; a wxBrainstorm impact step (show only); an agreement log in wxKanban via project.capture_event with an offline queue; a read-only Change Impact tab in the app's scope detail; proof fixtures. OUT: Scope-level, server-side AI analysis (owned by SCOPE-077, which stays non-blocking). Blocking a human's save in VS Code (not possible — hand edits get Agree or Undo after save). A hand-maintained dependency spreadsheet. Groups 2-4 from the same customer meeting (skill-file onboarding, generated onboarding videos, overnight automated testing). Any database schema change (the agreement log reuses the existing events table). |

## Business Problem

Fixing one fault either breaks other code or unmasks downstream faults that were hidden. This
happens because neither the AI nor the developer sees what a change reaches before it lands; the AI
in particular does not consider the wider system before editing a line.

wxKanban already computes a module dependency graph (SCOPE-111 `impact-graph.mjs`), but only
**after** a change and only to choose retests. Beyond that:

- No workflow checks dependents before changing code: not `/implement`, not `/autofix-tests`, not
  any debug flow, not `/buildscope`.
- Nothing writes a readable map.
- 360 client-to-server calls in this repo link by URL string, not by import, so even the
  after-the-fact graph misses them.

A customer raised this in a meeting on 2026-10-16. It applies to every kit user on every change.

## Out of Scope

- **Scope-level, server-side AI analysis.** Owned by SCOPE-077, which stays non-blocking.
- **Blocking a human's save in VS Code.** VS Code can't do it, so a hand edit gets Agree or Undo after the save.
- **A hand-maintained dependency spreadsheet.**
- **Groups 2–4 from the same customer meeting:** skill-file onboarding, generated onboarding videos, and overnight automated testing.
- **Any database schema change.** The agreement log reuses the existing `events` table.

## User Scenarios & Testing

### US1 — AI fix crosses an Impact Boundary

**Actor**: Developer using Claude Code in VS Code (impactMode boundaries)

**Scenario**:
1. The developer asks Claude to fix a bug in a server route handler.
2. Before the edit lands, the hook runs the engine: the handler is called by 4 client screens (by URL) and writes the projects table, which another scope's code reads.
3. This is an Impact Boundary, so the hook denies the edit with the impact list as the reason; Claude stops and shows the list in chat: 4 screens, 1 shared table, 2 scopes, 1 human sign-off to redo, each with its confidence.
4. The developer says yes; the approval is recorded in wxKanban and the retried edit goes through.
5. The status bar shows 6 affected, 2 scopes, and the affected files carry Explorer badges.

**Expected outcome**: No boundary edit lands without the developer seeing its impact and agreeing, including in bypass mode; the approval is in wxKanban with who, when, and the list.

### US2 — Hand edit, notify only

**Actor**: Developer editing by hand in VS Code

**Scenario**:
1. The developer changes a helper function and saves.
2. The Cockpit status bar updates to 3 affected, same scope; the 3 files get badges, the Problems panel shows Information entries, and the CodeLens above the fence reads used by 3 files, 1 scope.
3. Nothing crosses a boundary, so no panel opens and nothing asks.

**Expected outcome**: The developer sees what the change reaches with no clicks and no interruption.

### US3 — Scope amendment in /buildscope

**Actor**: Developer amending a scope

**Scenario**:
1. The developer runs /buildscope --edit 073.
2. Before writing, /buildscope lists the specs implementing SCOPE-073, the code fenced to it, and the scopes that depend on it.
3. It asks whether to proceed; the answer is logged.

**Expected outcome**: No scope amendment is written without its impact shown and an answer recorded.

### US4 — Unattended run with a data-loss change

**Actor**: AI agent under wxG-O-D --create with no developer present

**Scenario**:
1. An edit crosses an Impact Boundary; the run does not wait — it logs the crossing and continues.
2. A later edit is a migration that drops a column: possible data loss, so the run stops; under the Remote Session Bridge the question is relayed to the developer's phone.
3. At the next checkpoint the developer sees every logged crossing.

**Expected outcome**: The run never stalls on an ordinary boundary and never passes possible data loss without a person deciding.

### US5 — A stack the engine cannot read natively

**Actor**: Developer on a Python + FastAPI project

**Scenario**:
1. The developer changes a module; the engine reads it through the stack adapter's links section.
2. Every link is labeled Likely, and the report names which link types were checked and which were not.

**Expected outcome**: The report never says 0 affected merely because a file type could not be read.

## Functional Requirements

### FR-001 — One shared Change Impact engine

One kit script computes Change Impact for every entry point (the AI-edit hook, the Cockpit, /buildscope, wxBrainstorm), reusing the SCOPE-111 impact graph moved out of wxCreateTestPlan.

**Acceptance Criteria**:
- [ ] The engine ships in both kit script locations (repo and orchestrator copy).
- [ ] It writes .wxai/impact.json plus a readable summary for every run.
- [ ] project.report_change_impact retest selection produces identical results on its existing tests after the move.

### FR-002 — Eight link types with confidence labels

The engine reports eight link types, each labeled Confirmed or Likely: (1) imports, both directions; (2) which exported function is used; (3) client URL to server route; (4) code to table, read or write; (5) table to table foreign keys; (6) migration to tables; (7) named strings (MCP tool names, event and job names, env vars, config keys); (8) code to scope through fences.

**Acceptance Criteria**:
- [ ] Each of the eight types is found in the proof fixture.
- [ ] Every reported link carries a confidence label.
- [ ] Raw-SQL table links and client-URL links are labeled Likely; Drizzle, import, foreign-key, migration and fence links are labeled Confirmed.

### FR-003 — Two speeds with a cached index

A file-level check runs for every notify; a function-level check (TypeScript find-references) runs at the ask moment of an Impact Boundary. The import index is cached in .wxai/ and updated as files change.

**Acceptance Criteria**:
- [ ] SC-2 holds: <= 2 s p95 added per AI edit on a 5,000-file repo with a warm cache.
- [ ] The cache refreshes when a file changes outside the editor (for example by git checkout).
- [ ] The function-level result is shown whenever the panel or chat asks for agreement.

### FR-004 — Honest reports

Every report states which link types were checked and which were not, and a file type the engine cannot read is reported as not read.

**Acceptance Criteria**:
- [ ] Each report lists checked and unchecked link types.
- [ ] No report says 0 affected for a change in a file type the engine cannot read (SC-7).

### FR-005 — Every offered stack covered

JS/TS is read natively, including .vue, .svelte and .astro files and tsconfig and Vite path aliases. Every other stack the kit offers is read through a new links section in its SCOPE-127 stack adapter. A generic text-match fallback covers anything else. MongoDB is reported as collections, with foreign-key links marked not applicable.

**Acceptance Criteria**:
- [ ] A JS/TS project importing through an @/ alias reports those links.
- [ ] Adapter and fallback links are labeled Likely until that adapter passes its proof fixture (SC-8).
- [ ] A MongoDB project report shows collections and marks foreign keys not applicable.

### FR-006 — Impact Boundary and data-loss detection

A change is an Impact Boundary when it reaches another scope's code (through fences), touches a shared table (written by one scope's code and read or written by another's), or would undo a human test sign-off (checked with report_change_impact in dryRun mode, which writes nothing; decided 2026-10-17). Possible data loss is a dropped table or column, a destructive migration, or a mass delete.

**Acceptance Criteria**:
- [ ] Each boundary condition is detected in the proof fixture.
- [ ] A drop-column migration is flagged as possible data loss (SC-5).
- [ ] A change confined to one scope with no shared table and no sign-off is not a boundary.

### FR-007 — impactMode setting

.wxai/project.json carries impactMode with values notify, boundaries, or always; the default is boundaries. Only the project owner sets it.

**Acceptance Criteria**:
- [ ] A missing setting behaves as boundaries.
- [ ] notify never asks; boundaries asks only at an Impact Boundary; always asks on every change with any impact.
- [ ] Possible data loss stops in every mode.

### FR-008 — AI-edit hook

The kit installs a Claude Code PreToolUse hook on Edit, Write, MultiEdit and NotebookEdit. In notify it passes the impact to Claude as context so Claude tells the developer. At an Impact Boundary it denies the edit with the impact list as the reason; Claude asks in chat; the developer's yes is recorded as an approval bound to that file and change hash, and the retried edit is allowed.

**Acceptance Criteria**:
- [ ] It works in bypass permission mode, proven in a live Claude Code run (SC-3).
- [ ] An approval does not carry over to a different change or file.
- [ ] Every approval is sent to the agreement log (FR-013).

### FR-009 — Unattended runs

Under wxG-O-D --create, the Remote Session Bridge, or any non-interactive run, an Impact Boundary is logged and the run continues; every crossing is listed at the next checkpoint. Possible data loss always stops; under the Remote Session Bridge the question is relayed to the developer's phone.

**Acceptance Criteria**:
- [ ] SC-4 holds: 0 waits and 100% of crossings listed at the next checkpoint.
- [ ] SC-5 holds: a data-loss change stops the unattended run.
- [ ] Each logged crossing is sent to the agreement log as change_impact_crossing.

### FR-010 — Cockpit views

The Cockpit reads .wxai/impact.json and shows a status bar count (click for details), Explorer badges on affected files, Information-level Problems entries on changed code, a CodeLens on every fence line (used by N files, N scopes), and an agree panel (affected list, a small diagram, Agree or Undo for hand edits) that opens by itself only at an Impact Boundary and otherwise on click.

**Acceptance Criteria**:
- [ ] All views update within 3 s of a save.
- [ ] An unanswered crossing stays visible in the status bar until answered.
- [ ] The panel never opens by itself for a change that only notifies.
- [ ] Undo restores the file to its state before the save.

### FR-011 — /buildscope impact step

When /buildscope edits or amends a scope, it lists the specs that implement the scope, the code fenced to it, and the scopes that depend on it, then asks whether to proceed before writing.

**Acceptance Criteria**:
- [ ] US3 passes: no amendment is written without the impact shown and an answer given.
- [ ] The answer is sent to the agreement log (FR-013).

### FR-012 — wxBrainstorm impact step

wxBrainstorm's step 3 shows the Change Impact when a topic would change existing work. It is shown in the discussion only; nothing is written unless the user adds it to a scope or creates one.

**Acceptance Criteria**:
- [ ] The impact list appears in step 3 with confidence labels when existing code or scopes are affected.
- [ ] No file or record is written by this step.

### FR-013 — Agreement log in wxKanban

Every agreement and every logged crossing is sent through the MCP by extending project.capture_event with three event types (change_impact_ack, change_impact_approval, change_impact_crossing), recording who, when, the change, the impact list, the mode, the kind (acknowledgment of one's own change or approval of the AI's change), and attended or unattended. Records are per project, cannot be altered by the user, and are visible in the app beside the scope. When the MCP is unreachable, records queue in .wxai/impact-queue.jsonl and resend on reconnect.

**Acceptance Criteria**:
- [ ] SC-6 holds: 0 records lost after an offline period.
- [ ] No route or MCP tool updates or deletes these event types; a test asserts it.
- [ ] A hand-edit self-agreement is stored as change_impact_ack, never as change_impact_approval.

### FR-014 — Proof fixtures

A JS/TS fixture project contains seeded links of all eight types, and each stack adapter has its own fixture. The adapter validator refuses the Confirmed label until that adapter's fixture passes.

**Acceptance Criteria**:
- [ ] SC-1 holds on the JS/TS fixture.
- [ ] SC-8 holds: an adapter without a passing fixture cannot be labeled Confirmed.

## Data Requirements

**No new table and no DDL.** Change Impact records reuse the existing `events` table
(`mcp-server/src/db/schema.ts:85`) with three new event types:

- `change_impact_ack`: an acknowledgment of one's own change
- `change_impact_approval`: an approval of an AI change
- `change_impact_crossing`: a crossing logged in an unattended run

`metadata` (jsonb) carries:

- the change (files and a change hash)
- the impact list, with confidence labels
- the link types checked and not checked
- the impactMode
- attended or unattended
- the scope numbers touched
- the specId, where known

Only the Zod `ProjectEventTypeSchema` changes; `type` is already `varchar(50)`.

**Immutability:** no route or tool updates or deletes these event types. A test asserts it.

Local files (not in the database), all gitignored:

- `.wxai/impact.json`: the current report
- `.wxai/impact-index/`: the cache
- `.wxai/impact-queue.jsonl`: the offline queue

The project setting `impactMode` lives in `.wxai/project.json`.

## API Routes

MCP: no new tool — `project.capture_event` accepts the three new event types and validates their metadata shape.
App: `GET /api/projects/:projectId/scopes/:scopeNumber/change-impact` — lists that scope's Change Impact records, newest first; read-only; tenant-scoped.

## Frontend Components

**Cockpit (VS Code extension):**

- a status bar item (a count; click for details)
- a FileDecorationProvider for affected files (the SCOPE-058 pattern)
- a DiagnosticCollection with Information-level entries on changed code
- a CodeLens provider on fence lines
- the agree panel webview (the detailPanel pattern): the affected list, a small diagram, Agree / Undo
- a watcher on `.wxai/impact.json` (the SCOPE-073 scopeDepsWatcher pattern)

**App:** a read-only **Change Impact** tab in scope detail, listing the agreement and crossing records
(who, when, kind, what was reached).

## Success Criteria

1. SC-1: On the JS/TS proof fixture, 100% of seeded links of all eight types are found, each with the correct confidence label.
2. SC-2: The notify check adds <= 2 s (p95) to an AI edit on a 5,000-file repo with a warm cache.
3. SC-3: 0 Impact Boundary crossings land without asking in an attended session, including bypass mode, proven in a live Claude Code run.
4. SC-4: Unattended runs: 0 waits, and 100% of crossings are logged and listed at the next checkpoint.
5. SC-5: Possible data loss (a drop-column or destructive migration) stops the change 100% of the time, attended and unattended.
6. SC-6: 0 agreement records lost after an offline period (MCP disconnected, agree, reconnect, verify the store).
7. SC-7: Every offered stack yields a report naming the link types it checked; 0 reports say '0 affected' for a file type the engine cannot read.
8. SC-8: No adapter is labeled Confirmed until it passes its proof fixture; the adapter validator rejects it otherwise.

## Key Entities

**Change Impact** — the set of code, scopes, shared tables, and human test sign-offs a change reaches, each link with a confidence label (CONTEXT.md).
**Impact Boundary** — a crossing that requires agreement: another scope's code, a shared table, or a human sign-off (CONTEXT.md).
**Change Impact record** — an `events` row of type change_impact_ack, change_impact_approval, or change_impact_crossing.
**impactMode** — project setting: notify | boundaries (default) | always.
**Adapter links section** — new part of the SCOPE-127 stack adapter format describing how imports, routes, data access, and named strings look in that stack.

## Constraints

**Delivery**

1. **One complete release, no partial** (brainstorm decision 4b). Only an adapter's move from Likely to Confirmed may follow later, as its fixture passes.
2. **Three channels, published together:** app and MCP (push, which deploys), kit (orchestrator release), Cockpit (VSIX publish). `/buildscope`'s method is MCP-served, so FR-011 reaches users only after the push.
3. **Two kit script locations.** The engine must land in both; customers run the orchestrator's copy.

**Technical**

4. **Bypass mode** has silently skipped gates in this project before. The hook uses deny-with-reason, and SC-3 must be proven in a live Claude Code run, not only in unit tests.
5. **Fences** are written only by the orchestrator. The engine reads them and never writes them.
6. **No schema change and no `drizzle-kit push`.** The new event types are Zod-only.
7. **Hook performance.** Scanning up to 5,000 files per AI edit is too slow, so the index is cached.
8. **A partial list that looks complete is worse than none.** Every report names the link types it checked.

**Boundaries**

9. **"Blast radius"** keeps its `CONTEXT.md` meaning (secret rotation). This scope uses Change Impact and Impact Boundary.
10. **SCOPE-077** stays scope-level, server-side, and non-blocking. This scope owns code-level Change Impact and the agree gate.

## Compliance Requirements

### SOC 2

- **CC8.1 (change management):** every agreement records who, what, and why.
- **CC7.2 (audit trail):** records live in a store the acting user cannot alter (FR-013).
- **CC5.2 (separation of duties):** a hand-edit self-agreement is recorded as an acknowledgment, not an independent approval. Independent approval stays at review and sign-off.

## Notes

- Integration context: Depends On: SCOPE-026 (code fences — code-to-scope links), SCOPE-058 (Cockpit FileDecorationProvider badges), SCOPE-073 (scope dependencies, scope-flow, scopeDepsWatcher save watcher), SCOPE-111 (impact-graph.mjs and project.report_change_impact), SCOPE-127 (stack adapters and the per-project adapter generator). Related: SCOPE-077, SCOPE-015 (/buildscope). Entry points modified: /buildscope (MCP-served prompt), wxBrainstorm skill (step 3), the kit's Claude Code hook set, the Cockpit VSIX, project.capture_event.
- Converted from `docs/brainstorms/2026-10-16-impact-check.md` (group 1 of a customer meeting, 2026-10-16).
- Customer-visible or operator-visible history should be limited to outcomes that materially affect workflow review and support.

## Clarifications

### Session 2026-10-16

| # | Question | Decision |
|---|----------|----------|
| 1 | Reuse check | SCOPE-077 and SCOPE-015 partially overlap; proceed with a new scope. Boundary: 077 stays scope-level and non-blocking; this scope owns code-level Change Impact and the agree gate. |
| 2 | Terminology | "Blast radius" already means secret rotation in CONTEXT.md. Canonical terms: **Change Impact** and **Impact Boundary** (added to CONTEXT.md). |
| 3 | Separation of duties (SOC 2 CC5.2) on hand edits | (a) Self-agreement allowed, recorded as an acknowledgment, not an independent approval. |
| 4 | Where the agreement log lives | (b) In wxKanban via the MCP (extending project.capture_event), with an offline queue in .wxai/. |
| 5 | Success criteria | SC-1 to SC-8 as listed. |
| 6 | Data store | Reuse the existing `events` table (no DDL); the app gets a read-only Change Impact tab. |
