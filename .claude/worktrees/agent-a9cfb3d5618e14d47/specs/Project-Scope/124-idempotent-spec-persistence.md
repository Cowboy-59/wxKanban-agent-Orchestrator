# SCOPE-124: Idempotent Spec Persistence — Edit, Push, and Preflight

**Spec Number**: 124
**Status**: `draft`
**Amendments**: A (2026-08-20) and B (2026-09-04) are recorded in `specs/124-idempotent-spec-persistence/spec.md` (FR-009); **C (2026-10-25)** — document identity, retire, scope-derived numbering, no number takeover, live-proven resolution; reopens FR-005 and FR-008, adds FR-010..FR-016 (below).
**Created**: 2026-08-05
**Last Reviewed**: 2026-08-05
**Depends On**: SPEC-019 (Agent Orchestrator Kit — owns `wxkanban-agent/dbpush.ts` and the kit release path)
**Related**: SCOPE-089 (per-project spec numbering — fixed this exact bug class for *numbering*; FR-001 finishes the job for *identity*). SCOPE-098 FR-005 (`project.delete_scope` — the tool FR-008 needs to remove duplicates already written). SCOPE-101 (`update_spec_status` + task-spec linking — owns `projecttasks.specId`, which FR-004 exposes). SCOPE-122 (status vocabulary). SCOPE-123 (per-scope stage progression — ships in the same kit release).
**Source**: wxKanban feedback refs `ff0eb155`, `a02e6ec5`, `ac139158`, `975ada4a` (origin project `68cf2d4b-fb8e-442f-8290-3aa3fd2be701`); `7d581603` (`f44453ef`); `a6734641` (`aeff2578`); `3de3efa6` (`1b7ff890`); `c9fc52d4` (`b1e5b76c`). Eight reports, five projects, 16 July – 3 August 2026.

---

## Overview

Eight field reports from five projects, filed 16 July to 3 August, describe a spec that cannot be
updated. `buildscope --edit` re-interviews from blank and regenerates an unrelated short-name.
`dbpush` blocks with "Duplicate specNumber 010" on every re-run. `create_specs` writes a second
document set rather than upserting. One project accumulated 29 duplicate scopes numbered 030–058,
each a content-copy of a real spec offset by exactly 29, cluttering its board with fake open work.

These are one defect. **Spec identity is inferred rather than read from the record that owns it.**

`wxkanban-agent/dbpush.ts:499-512` builds its set of already-known specs entirely from the `tasks`
array returned by `project.list_open_items`, taking `t.specNumber ?? parseScopeFromTaskTitle(t.title)`.
The first branch never fires: `projecttasks` links to a spec by `specId`, a UUID foreign key — there
is no `specNumber` column on a task, so the field is absent from every row the tool returns. Every
lookup therefore falls through to `parseScopeFromTaskTitle`, which regex-matches an `[NNN-T###]`
prefix in the task's **title text**.

The code says so itself at `dbpush.ts:482`: *"the real `project.list_open_items` envelope only has
`tasks` / `documents` / `events` (no `specs[]`)... Scope numbers come from each task's `specNumber`
field when present, or are parsed from the title's `[NNN-T###]` prefix."* The envelope has no
`specs[]` collection, so the tool never asks what specs exist — it infers them from task titles.

Line 774 decides everything on that inference: `const isNew = !dbState.knownSpecNumbers.has(a.scope)`
routes to `pushNewSpec` or `pushExistingSpec`. A spec is invisible — and therefore "new" — if it has
no open tasks, if its task titles lack the prefix, or if it falls outside the `maxItems: 100` window
the call requests.

`buildscope` infers identity a different way, and worse: from the **server's own filesystem**.
`project-kit.ts:994` sets `scopeDir = join(workspaceRoot, 'specs', 'Project-Scope')` — no `projectId`
in the path — and on an edit, line 1001 runs `readdirSync(scopeDir).find(name =>
name.startsWith('016-'))` and adopts that filename's short-name. On the hosted MCP that directory is
the wxKanban repository. A customer editing spec 016 reads ours.

This scope makes spec identity authoritative, makes every write path idempotent, and stops the
preflight failing on non-English prose.

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actor** | A developer maintaining a scope after it first exists — editing it, re-pushing it, or re-running `dbpush` in CI — and finding that the tool either refuses them with a duplicate error or silently writes a second copy |
| **Secondary Actors** | An author writing scopes in a language other than English, currently rejected for using an ordinary word of their own language; the Dev Cockpit and Kanban board, which render the duplicate rows as real open work; support, who are the only route to removing a duplicate today |
| **Key Value** | A spec has one identity, read from the record that owns it, so editing preserves what it did not touch and re-running any write path changes nothing — the board can be believed without cross-checking it against the repository |
| **Scope Boundary** | See the `## Scope Boundary` and `## Out of Scope` sections below. |

> **Notation.** This document cannot spell the marker tokens FR-007 is about — `create_specs`' own
> preflight rejects any document containing them, which is precisely the defect being fixed. They are
> written here with a separator (`T·O·D·O`, `T·B·D`, `[NEEDS·CLARIFICATION]`) and the word for a
> stand-in value is written *stand-in*. The Spanish word at the centre of FR-007 is separated the
> same way (*t·o·d·o*) for the same reason — this document cannot name it either.
>
> The first attempt to file this scope scored **57 and was blocked**, naming those three tokens. That
> is not an anecdote: it is acceptance evidence for FR-007, and it answers Open Question 4 before it
> was asked.

---

## Business Problem

Eight reports from five projects, and the two halves compound: specs cannot be updated, and the
identity of the spec being updated is resolved against the wrong machine entirely.

**The hosted MCP resolves spec identity from its own filesystem.** Report `a6734641` is this
happening in the field. The customer created scope 016 and got back `shortName:
"single-shared-top-bar-app"`. They called again with `editSpecNumber: '016'` and got back `shortName:
"scope-help"`, `filePath: "specs/Project-Scope/016-scope-help.md"` — a name from nowhere in their
project. **`specs/Project-Scope/016-scope-help.md` exists in this repository.** It came from ours.
They reported it as "the edit path regenerates a nonsensical short-name"; it is not regenerating
anything, it is reading our disk.

The consequences run past one confusing field. A customer editing a spec number we happen not to have
gets `Scope NNN not found` for a spec that exists in their project. Two customers editing the same
number resolve to the same file. And a scope short-name of ours crosses a tenant boundary on every
such call — narrow disclosure, since only the slug travels and never document content, but it is
customer-visible and it is ours.

We have fixed this bug class once already. `server.ts:3508` carries the comment *"[SCOPE 089]
per-project DB numbering (was global-filesystem → every new project got 092)"*. Spec *numbering* was
moved off the shared filesystem to per-project database numbering; the edit path was left behind on
the old mechanism.

**Editing is a full overwrite from arguments, never a read-modify-write.** The edit branch locates a
filename and nothing more: it never reads the existing document's content. Every section is rebuilt
from whatever the caller passed. Omit a field and that section comes back empty — reported as "blank
re-interview" (`ff0eb155`) and "generates a placeholder shell" (`a02e6ec5`). Neither is an interview
defect. There is no merge, so an edit that is not a complete re-statement of the whole scope silently
destroys the rest.

**`dbpush` decides what already exists by parsing task titles.** Where the unique index
`idx_projectspec_project_specnumber` catches the resulting insert, the customer is hard-blocked with
*"Duplicate specNumber 010"* and can never update that spec again (`ac139158`, `7d581603`). Where
nothing guards it, the duplicate lands silently: duplicate document sets (`975ada4a`), and 29 shadow
scopes numbered 030–058 offset from the real 0001–0029 (`3de3efa6`). That customer described the Dev
Cockpit as no longer usable as a source of truth — every claim on it had to be cross-checked against
the repo before being believed, and it had already caused one false-positive investigation.

**A fourth cost, on the same call path.** `create_specs`' preflight rejects valid Spanish documents.
`matchesPlaceholder` in `shared/preflight/src/text-utils.ts` matches its marker words with a
case-insensitive word boundary — so the ordinary Spanish word *t·o·d·o* is reported as a stand-in
marker. Reproduced in one line: `matchesPlaceholder` returns a hit for any English sentence containing that word in lowercase. The customer
rephrased sentences to avoid a word in their own language, and the error insisted there were
stand-in markers when there were none. They also had to remove bold from actor names to pass. Both couple validation to formatting,
and the second contradicts the methodology we ship, which tells authors to use the `- Secondary:`
label the check then rejects when the name is emphasised.

The through-line: **spec identity is inferred — from task-title text, from server filenames, from
regenerated slugs — rather than read from the record that owns it.** Every symptom above is a
different inference failing. The customers most affected are the ones with the most specs, because
each additional spec is another chance for an inference to miss.

## Scope Boundary

Resolve spec identity from the database, keyed by `projectId` + `specNumber`, everywhere it is
currently inferred. That is the single change from which the rest follow. `buildscope`'s edit path
stops calling `readdirSync` on the server's workspace; `dbpush` stops parsing task titles.

Make `project.list_open_items` able to answer "what specs exist" — today its envelope carries only
`tasks`, `documents` and `events`, which is why the caller resorts to inference.

Make editing a read-modify-write. An edit loads the existing scope, applies the supplied fields over
it, and preserves everything not supplied.

Make every write path idempotent. Re-running `dbpush` or `create_specs` against an unchanged project
produces no new rows — documents upsert on their identity rather than inserting a parallel set.

Remove result truncation as an input to an identity decision. `maxItems: 100` may bound a display; it
may not bound a correctness check.

Make preflight marker detection case-sensitive and tolerant of Markdown emphasis, so a document is
judged on content rather than on the language it is written in or the formatting of a label.

Give the already-written duplicates a route out, using `project.delete_scope` from SCOPE-098 FR-005
rather than a second deletion path.

## Out of Scope

**Hand-cleaning affected customers' data.** One customer has 29 shadow scopes and another has
duplicate document sets. FR-008 gives them a supported route; database surgery per customer does not
scale and leaves no audit trail.

**The `buildscope` interview itself.** Reports describe the *edit* path re-interviewing from blank.
That is the missing read-modify-write, not an interview defect. The interview's question flow, its
section ordering, and the interactive approval loop are unchanged.

**SCOPE-098 FR-005's `project.delete_scope`.** FR-008 consumes it. If 098 has not shipped, FR-008
waits rather than building a second delete.

**Spec *numbering*.** SCOPE-089 already moved numbering to per-project database allocation. This
scope fixes identity resolution, which was left on the old mechanism, and does not revisit how
numbers are assigned.

**`projecttasks.specId` semantics.** SCOPE-101 owns the task-to-spec link. FR-004 exposes it through
an existing tool; it does not redefine it.

**Localisation of the product.** FR-007 stops the preflight *misfiring* on non-English input. It does
not translate messages, and it does not make the methodology multilingual — that is SCOPE-046.

## User Scenarios & Testing

### US1 — Editing a scope updates that customer's scope, not ours

**Actor**: a developer editing an existing scope through the hosted MCP

1. The developer's project has scope 016, named in their project as `single-shared-top-bar-app`.
2. They call `buildscope` with `editSpecNumber: '016'`.

**Expected outcome**: the call resolves scope 016 **in their project**, by `projectId` +
`specNumber`, and returns their short-name and their file path. No filesystem on the server
participates. Today the call reads `specs/Project-Scope/` on the hosted server — this repository —
and returns `016-scope-help`, a scope of ours.

### US2 — Editing preserves the sections the caller did not supply

**Actor**: a developer correcting one section of an existing scope

1. The scope has a full set of sections.
2. The developer edits it, supplying only the corrected Business Problem.

**Expected outcome**: the Business Problem is replaced and every other section survives unchanged.
Today every unsupplied section is rebuilt empty, because the edit is an overwrite from arguments with
no read of the existing document.

### US3 — Re-running `dbpush` on an unchanged project changes nothing

**Actor**: a developer re-running `dbpush` after a partial failure, or in CI

1. The project's specs are already in the database.
2. `dbpush` runs a second time with no local changes.

**Expected outcome**: zero specs created, zero documents duplicated, and no "Duplicate specNumber"
error. Today existence is inferred from task titles, so any spec whose tasks are closed, untagged, or
past the 100-item window is treated as new — hard-blocked by the unique index, or silently duplicated
where no index guards it.

### US4 — A spec with no open tasks is still recognised as existing

**Actor**: a developer whose scope is complete and whose tasks are all closed

1. Every task in the scope is done.
2. `dbpush` runs.

**Expected outcome**: the spec is recognised and updated. This is the sharpest form of the defect —
**the more finished the work, the more likely it is to be duplicated**, because a scope with no open
tasks contributes nothing to the inferred set.

### US5 — A Spanish scope passes preflight on its merits

**Actor**: an author writing scopes in Spanish

1. The document uses the ordinary word *t·o·d·o* in several sentences and formats a secondary actor as
   `- Secondary: **Supervisor** - descripción`.
2. They call `create_specs`.

**Expected outcome**: the document is assessed on content. *t·o·d·o* in lowercase prose is not a
placeholder marker; a bold actor name is still an actor. Today the author must reword around a word
in their own language and strip emphasis, neither of which improves the document. A genuine
uppercase marker — `T·O·D·O`, `T·B·D`, `[NEEDS·CLARIFICATION]` — is still caught.

### US6 — A project already carrying duplicates can be cleaned up

**Actor**: a developer whose project has accumulated shadow scopes

1. The project has 29 duplicate scopes numbered 030–058, content-copies of 0001–0029, each with its
   own duplicate task list.
2. The developer wants their board to reflect reality.

**Expected outcome**: the duplicates are identifiable as duplicates and removable through
`project.delete_scope`, without support running SQL. The customer asked for exactly this and noted
that `merge_scope` cannot help, because it refuses any pair not sharing a `specNumber` — and these
differ by 29.

## Functional Requirements

### FR-001 — Spec identity is resolved from the database, never a filesystem

Every path that answers "which spec is this?" queries `projectspecifications` by `projectId` +
`specNumber` — the pair the unique index `idx_projectspec_project_specnumber` already enforces. No
identity decision reads a directory.

Specifically, `project-kit.ts:994-1010`'s `readdirSync(scopeDir)` lookup is replaced. The short-name
and file path returned to the caller come from the customer's own record.

SCOPE-089 established this pattern for numbering; this completes it for identity.

**This requirement ships ahead of the rest of the scope as a hotfix** — see Clarifications.

**Acceptance Criteria**:
- [ ] An edit resolves the caller's own scope and returns their short-name and path
- [ ] No code path in the edit flow calls `readdirSync` on a workspace directory; a test asserts this
- [ ] Editing a spec number that exists in the caller's project succeeds regardless of what exists in the server's workspace
- [ ] Editing a spec number that does **not** exist in the caller's project returns not-found, even when the server's workspace has a file of that number
- [ ] Two projects editing the same spec number resolve to different records
- [ ] Verified against the hosted MCP, not only locally — the local kit-author fallback path masks this defect entirely

### FR-002 — An edit is a read-modify-write

An edit loads the existing scope, applies supplied fields over it, and preserves every field not
supplied. Omitting a field means "leave it alone", never "blank it".

Where a supplied field would replace substantial existing content, the response reports what changed
so the caller can see the edit's blast radius.

**Acceptance Criteria**:
- [ ] Editing one section leaves all other sections byte-identical
- [ ] An edit supplying no optional fields is a no-op on content
- [ ] The response enumerates which sections the edit replaced
- [ ] A scope round-tripped through edit with no changes is byte-identical to its original

### FR-003 — `dbpush` determines existence from specs, not from task titles

`dbpush.ts:499-512` queries the project's specs directly. `parseScopeFromTaskTitle` is removed from
the identity path — a task title is documentation, not a key.

Line 774's `isNew` decision is made on that authoritative set.

**Acceptance Criteria**:
- [ ] A spec with zero open tasks is recognised as existing
- [ ] A spec whose task titles carry no `[NNN-T###]` prefix is recognised as existing
- [ ] `parseScopeFromTaskTitle` has no callers in the identity path
- [ ] Re-running `dbpush` on an unchanged project reports zero created and zero duplicated
- [ ] The "Duplicate specNumber" error becomes unreachable through normal re-runs, and a test asserts a second run of a real fixture is clean

### FR-004 — `project.list_open_items` can answer what specs exist

The envelope gains authoritative spec identity — a `specs[]` collection, or `specNumber` resolved
onto each returned task. Today it carries only `tasks`, `documents` and `events`, which is the reason
callers infer.

`dbpush`'s dead `t.specNumber ?? …` branch either becomes live or is removed; it must not remain as a
branch that never fires.

**Acceptance Criteria**:
- [ ] The response lets a caller enumerate the project's specs without parsing any title
- [ ] The dead branch in `dbpush.ts:503` is either satisfied or deleted
- [ ] Existing consumers of the envelope keep working — the collection is additive
- [ ] The addition is bounded and paginated deliberately, not silently truncated (see FR-006)

### FR-005 — Every write path is idempotent

`create_specs` and `dbpush` upsert on identity rather than inserting a parallel set. Documents are
keyed by their spec and doctype, so a second push updates the existing document instead of creating a
second one.

**Acceptance Criteria**:
- [ ] Pushing the same spec twice yields one spec row and one document per doctype
- [ ] A document's identity is its spec plus doctype; a second write to the same pair updates
- [ ] `create_specs` re-run on an existing spec updates rather than creating a duplicate set
- [ ] Task rows are not duplicated by a re-run

### FR-006 — Truncation may bound a display, never a correctness check

No identity or existence decision is made from a truncated result set. The `maxItems: 100` bound on
`dbpush`'s `list_open_items` call is removed from the identity path, or the call paginates to
completion.

Where a limit remains for display, reaching it is reported rather than silently applied.

**Acceptance Criteria**:
- [ ] A project with more than 100 open items pushes correctly, with no spec beyond the window treated as new
- [ ] Any remaining limit is surfaced to the caller when reached
- [ ] A test exercises a project sized past the old boundary

### FR-007 — Preflight judges content, not language or formatting

Placeholder-marker detection at `server.ts:396` requires the marker as an isolated **uppercase**
token — `T·O·D·O`, `T·B·D`, `F·I·X·M·E`, and their colon and bracketed variants — rather than
matching case-insensitively. Real markers are uppercase by convention; the Spanish word *t·o·d·o* is not one.

Actor detection tolerates Markdown emphasis in the value following the `- Primary:` / `- Secondary:`
label. The label identifies the actor; the typography does not.

Where the preflight blocks, it quotes the offending text and its location, so an author can find it
rather than hunting for a marker that is not there.

**Acceptance Criteria**:
- [ ] A Spanish document using *t·o·d·o* and *t·o·d·o·s* in prose passes
- [ ] A literal uppercase marker (`T·O·D·O`, `T·B·D`, `[NEEDS·CLARIFICATION]`, written normally) still blocks
- [ ] `- Secondary: **Supervisor** - descripción` is recognised as a secondary actor
- [ ] A blocking message quotes the matched text and where it was found
- [ ] Every other preflight check is reviewed for the same English-only or formatting assumption, and the findings are recorded even where no change is made

### FR-008 — Existing duplicates are identifiable and removable

Duplicates already written are detectable — a report that pairs shadow scopes with their originals by
content similarity and numbering offset — and removable through `project.delete_scope` (SCOPE-098
FR-005), including their tasks and documents.

`merge_scope` is not the tool: it refuses any pair not sharing a `specNumber`, and duplicates
generated by this defect differ.

**Acceptance Criteria**:
- [ ] A project's duplicate scopes are listed with the original each shadows and the reason
- [ ] Removal goes through `project.delete_scope` and takes tasks and documents with it
- [ ] Detection is read-only and safe to run against production
- [ ] Nothing is deleted without an explicit per-scope confirmation
- [ ] Verified against a copy of the project carrying the 030–058 duplicates

## Data Requirements

**No DDL.** `projectspecifications` already carries `specNumber` and the unique index
`idx_projectspec_project_specnumber` on `(projectId, specNumber)` — the key FR-001 resolves against.
`projecttasks.specId` already links tasks to specs. Everything needed exists.

FR-005's document idempotency needs a stable document identity — spec plus doctype. Whether that is
enforced by a unique index or by application-level upsert is a plan decision; if an index is chosen,
it is DDL and must go through the manual schema process, since this database has no migration ledger
and `drizzle-kit push` is prohibited against it. **Prefer the application-level upsert** to keep this
scope DDL-free.

FR-008 writes nothing until a confirmed delete, which routes through SCOPE-098 FR-005's transaction.

## API Routes

No new HTTP routes.

Two MCP tools change contract additively: `project.list_open_items` gains spec identity (FR-004), and
`project.buildscope`'s edit response returns the caller's own short-name and path (FR-001). Existing
fields keep their shape.

`project.create_specs` changes behaviour, not shape — a re-run updates instead of duplicating.

## Frontend Components

None built. The Dev Cockpit and the Kanban board render what the database holds; the reported symptom
— 29 fake open scopes cluttering the board — is bad data, not bad rendering. FR-008 removes the data.

## Integration Context

**SCOPE-098 FR-005** supplies `project.delete_scope`, which FR-008 consumes. 098's FR-005 is specced
and not built; if it slips, FR-008 slips with it rather than growing a second delete path.

**SCOPE-101** owns `projecttasks.specId` and `update_spec_status`. FR-004 exposes that link through
an existing tool without redefining it.

**SCOPE-089** established per-project database numbering after global-filesystem numbering gave every
new project the same number. FR-001 is the same correction applied to identity.

**SCOPE-123** ships in the same kit release; both change `wxkanban-agent/`.

`mcp-server/` deploys on push to main and reaches customers with no upgrade. `wxkanban-agent/`
reaches them only through a kit release. This scope spans both, so its parts have different delivery
paths — see Constraints.

## Success Criteria

1. **Re-running `dbpush` on an unchanged project creates nothing.** Baseline: every re-run either
   hard-blocks with "Duplicate specNumber" or silently duplicates, reported by four projects. Target:
   zero specs created, zero documents duplicated, zero errors, on a real customer fixture.

2. **No customer receives another project's short-name.** Baseline: `a6734641` received
   `016-scope-help`, a scope from this repository. Target: zero cross-project identity resolutions,
   asserted by a test that runs two projects at the same spec number against the hosted MCP.

3. **An edit preserves what it was not asked to change.** Baseline: unsupplied sections are rebuilt
   empty; two projects reported losing scope content this way. Target: a scope round-tripped through
   edit with no changes is byte-identical.

4. **Non-English scopes pass preflight at the same rate as English ones.** Baseline: one project
   blocked until it reworded around the Spanish word *t·o·d·o* and removed bold from actor names, then
   scored 100 unchanged in substance. Target: the same document passes without edits that do not
   improve it.

5. **The projects carrying duplicates can clear them without support.** Baseline: 29 shadow scopes in
   one project, duplicate document sets in another, no self-service route — `merge_scope` refuses
   cross-numbered pairs. Target: both cleared through `project.delete_scope`, with support running no
   SQL.

## Key Entities

- **`projectspecifications`** — the record that owns spec identity. `(projectId, specNumber)` is
  already unique; FR-001 makes it the only key anything resolves against.
- **`projecttasks.specId`** — the real task-to-spec link, a UUID FK. Its absence from
  `list_open_items`' output is what drove callers to parse titles.
- **Task title `[NNN-T###]` prefix** — documentation that became a de-facto key. FR-003 demotes it.
- **`scopeDir` / `resolveWorkspaceRoot()`** — the server-side path whose use for identity is the
  cross-tenant defect. Retained for the local kit-author fallback only.
- **Short-name (slug)** — derived from the feature description on create, from the filename on edit.
  FR-001 makes it a property of the record.
- **`matchesPlaceholder` (`shared/preflight/src/text-utils.ts`)** — the detector that actually blocks
  `create_specs`. Case-insensitive word-boundary matching on its marker words is the i18n defect. It
  already narrows the stand-in word itself to bracketed/labelled forms under BUG-12; the same
  narrowing was never applied to the other markers.
- **`ambiguityRegex` (`server.ts:396`)** — a **second, inconsistent** marker detector with its own
  rule set, which BUG-12 never reached. Two detectors, two behaviours, one concept.

## Constraints

**Two delivery paths in one scope.** `mcp-server/` changes deploy on push to main with no customer
action; `wxkanban-agent/dbpush.ts` changes reach customers only through a kit release. FR-001,
FR-002, FR-004, FR-005, FR-007 and FR-008 are server-side and can ship as they are ready. FR-003 and
FR-006 are kit-side and ship with the batch.

**Prefer no DDL.** Six declared tables are already missing from production, there is no migration
ledger, and `drizzle-kit push` is prohibited. FR-005 should achieve idempotency in application code
rather than by adding an index.

**FR-001 must be verified against the hosted MCP.** `generateNextSpecNumber` has a documented
"local kit-author fallback ONLY (no projectId or DB unreachable)" path that never runs on the hosted
server. Testing locally exercises the fallback and hides the defect.

**FR-008 cannot precede SCOPE-098 FR-005.** There is no delete tool until it ships.

**Detection before deletion.** FR-008 operates on real customer projects. Detection is read-only and
deletion is per-scope confirmed; nothing is removed in bulk on inference.

## Notes

**`a6734641` was filed as two defects and is one.** The customer reported "buildscope reports success
but silently fails to persist" and, separately, "the edit path regenerates a nonsensical short-name".
Both are FR-001. The first call generated a short-name from the feature description and reported the
path it *would* write; the second resolved `016-` against the server's directory and returned ours.
Their instinct that the two might be related was correct.

**The defect is worst on the most finished work.** A scope with no open tasks contributes nothing to
`dbpush`'s inferred set, so it is always treated as new. The customers hit hardest are the ones who
completed their tasks.

**A stale message to fix while in the file.** `dbpush.ts:769` tells the user to run `node
scripts/setup-mcp.mjs` when MCP is unreachable. That script was deleted in kit v1.1.0 during the
hosted-MCP cutover — SCOPE-121 confirmed the archive has never shipped it. A consumer following the
advice gets `MODULE_NOT_FOUND`. One line, same file, no reason to leave it.

**`unreachable` is handled correctly.** `dbpush.ts:767` short-circuits before pushing when MCP is
unreachable and the run is not a dry-run, so an MCP outage does not degrade into "create everything".
Recorded because it was a plausible cause of `3de3efa6`'s 29 duplicates and was ruled out.

**FR-001 leaves a known residual: the derived slug can differ from the file the client already has.**
With no `shortName` column on `projectspecifications`, the hotfix derives the file name from the
spec's `title`. That is deterministic and per-project — the same scope always yields the same name —
but it is not guaranteed to match the name the client wrote when the scope was created, because
creation derives the slug from `featureDescription` instead. Observed while verifying: our own spec
016 has DB title "Spec 016: wxKanban Online Help", deriving to
`016-spec-016-wxkanban-online-help.md`, while the file in this repo is `016-scope-help.md`. A client
told the former could write a second file rather than updating the first. This is strictly better
than returning another tenant's name, so it does not block the hotfix — but it is why FR-002's
read-modify-write is not the whole answer either. The durable fix is to store the slug on the record,
which needs DDL and therefore its own decision.

**One reporter detail is unconfirmed.** `c9fc52d4` states that both *t·o·d·o* and *t·o·d·o·s* trigger the
marker check. `/\bTODO\b/gi` should not match "todos" — the trailing word boundary fails on the "s" —
so either a second, looser detection site exists or the observation is imprecise. FR-007's last
acceptance criterion requires sweeping the other preflight checks, which should settle it. Do not
close FR-007 on the `server.ts:396` fix alone.

## Amendment C — 2026-10-25 — writes that are safe to repeat: document identity, retire, numbering that cannot be taken over

**Source:** customer report package received 2026-10-25 (one three-person team's workflow analysis, runbook and a full session export, 14 Aug – 25 Oct 2026); feedback `0c395650`, `d493cadd`, `975ada4a`, `07107d2d`, `532e34a3`. Brainstorm record `docs/brainstorms/2026-10-25-kit-write-safety.md`, decisions 1, 5b, 5c, 5d, 5f and 11.

**Acceptance bar for the whole amendment (decision 1):** every kit write is **repeatable** (the same files pushed twice change nothing), **contained** (it touches only what it names) and **loud** (anything unexpected stops before writing).

### Why FR-005 and FR-008 are reopened

**FR-005 ("every write path is idempotent") is marked done and is failing in the field.** `975ada4a` was resolved 2026-07-26 and recurred as `07107d2d` on 2026-10-19. Verified in code 2026-10-25: a spec document's identity is still its **title**. `create_specs` matches documents on (doctype, title, specId IS NULL) and deliberately leaves `specid` unset (`mcp-server/src/server.ts:3424-3469`). dbpush's `pushExistingSpec` sends `Spec N: name`, `Plan: name`, `Spec N — Tests`, all doctype `specs`, no spec link (`wxkanban-agent/dbpush.ts:709-736`). `upsert_document` takes `rows[0]` with no ORDER BY, so with duplicates the row it updates is arbitrary (`server.ts:800-874`). Every changed heading therefore makes a new document, and `Plan: <name>` carries no number, so two scopes with the same name share one plan row.

**FR-008 ("existing duplicates are identifiable and removable") stalled at T015, closed "will not do".** That task proposed removing duplicate *scopes* by content similarity (12,349 false pairs). This amendment reverses T015 openly, for a different reason. Duplicate *documents* are exact-key groups — (project, spec, kind) — not similarity guesses. They are removed by **retiring**, never by deletion, and only after a person confirms (FR-012, FR-013).

**Open Question 2 is answered: a unique index.** It replaces the "prefer application-level upsert to keep this scope DDL-free" lean (`specs/124-idempotent-spec-persistence/tasks.md:240`). Application-level upsert is what failed. The index is partial and is created only after the cleanup, so today's duplicates do not block it.

### FR-005 — reopened acceptance criteria (Amendment C)

- [ ] Pushing the same spec folder twice changes **zero** rows the second time (spec, documents, tasks), measured row by row.
- [ ] Changing the H1 or any heading of `spec.md`, `plan.md` or `tests.md` and pushing again updates the existing document in place. No new row. Kept as a permanent regression test on the real CLI → MCP path.
- [ ] Two scopes with the same name have separate plan documents.

### FR-008 — reopened acceptance criteria (Amendment C)

- [ ] Duplicate documents are listed as exact (project, spec, kind) groups (FR-012), not by similarity.
- [ ] Removal is retire (FR-013), never a hard delete, and never without a per-group confirmation.
- [ ] T015's "will not do" is recorded as reversed by Amendment C, with this section as the reason.

### FR-010 — A document's identity is (spec, kind), never its title (Amendment C)

Every write of a spec-level document (`create_specs`, `upsert_document`, dbpush new and existing paths) MUST set `specid` and `kind`. `kind` comes from the file name (`spec.md` → `spec`, `plan.md` → `plan`, `tests.md` → `tests`, `tasks.md` → `tasks`, `lifecycle.json` → `lifecycle`, and so on), never from the heading. Insert-vs-update is decided on (project, specid, kind) alone. The title is display text, updated in place.

**Acceptance Criteria**:
- [ ] create_specs, upsert_document and both dbpush paths set `specid` and `kind` on every spec-level document they write.
- [ ] A write whose (project, specid, kind) exists updates that row, whatever its title.
- [ ] `pushNewSpec` uploads plan.md and tests.md on the first push, not only from the second.
- [ ] Project-level documents (no spec) keep their current matching rule, unchanged.

### FR-011 — Schema change, applied by the owner (Amendment C)

The owner applies, by hand, a reviewed SQL file at `specs/124-idempotent-spec-persistence/sql/0001-document-kind-retire.sql`, recorded in `specs/117-production-schema-integrity/schema-change-log.md`:

```sql
ALTER TABLE projectdocuments
  ADD COLUMN IF NOT EXISTS kind          varchar(50),
  ADD COLUMN IF NOT EXISTS retiredat     timestamptz,
  ADD COLUMN IF NOT EXISTS retiredbyid   uuid REFERENCES userprofiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS retiredreason text;

-- Second step, only after the FR-012 backfill and cleanup:
CREATE UNIQUE INDEX IF NOT EXISTS idx_projectdocuments_project_spec_kind_live
  ON projectdocuments (projectid, specid, kind)
  WHERE retiredat IS NULL AND specid IS NOT NULL AND kind IS NOT NULL;
```

The columns are declared in `src/db/schema/projectdocuments.ts` and `mcp-server/src/db/schema.ts` **only after** they exist in production. Drizzle selects every declared column, so declaring first causes 500s. New ids are UUID v7, generated in code: the MCP declaration's `defaultRandom()` gives v4.

**Acceptance Criteria**:
- [ ] `npm run db:drift` exits 0 after step 1, and a column-level check confirms all four columns.
- [ ] Step 2 runs only after FR-012 reports zero live duplicate groups for every project.
- [ ] A second live row for the same (project, spec, kind) is rejected by the database.

### FR-012 — Duplicates are found automatically and never removed automatically (Amendment C)

A read-only detector MUST group a project's live spec-level documents by (spec, kind). Rows written before FR-010 get `specid` and `kind` from their titles, tags and file paths, and the detector reports any it cannot attribute rather than guessing. The kit MUST offer the project's user a cleanup, with these steps:

- Ask whether to run it.
- On yes, show the keep/retire list for every group. The copy that matches the local file is kept; when none matches, the most recently updated one is kept, and the list says so.
- The person confirms the list as a whole.
- Every group is fixed in one pass (backfill, then retire), through the FR-013 service.

**Acceptance Criteria**:
- [ ] Detection writes nothing and is safe against production.
- [ ] Nothing is retired or backfilled without the confirm; declining changes nothing.
- [ ] Unattributable rows are listed separately and left alone.
- [ ] Re-running after the cleanup reports zero groups.
- [ ] Verified against a copy of the reporting customer's project before it is offered to them.

### FR-013 — Delete means retire, with the impact shown first (Amendment C)

A single document-retire service MUST back three entrances: a new MCP tool `project.delete_document`, a web-app **Retire** / **Restore** action, and the FR-012 cleanup. Retire is soft: it sets `retiredat`, `retiredbyid` and `retiredreason` (required). A retired document is hidden from every list and read: every read of `projectdocuments` filters `retiredat IS NULL`, on the MCP and app sides alike. Before anything is retired, the caller is shown, per document:

- its scope and spec;
- the tasks linked to it;
- whether it is the last live copy of its kind;
- whether it matches the local file (kit entrances).

The person then confirms. `project.delete_document` defaults to a dry run that returns that impact and writes nothing; the real retire needs an explicit confirm. Restore clears the retire fields. Every retire and restore writes a `companyauditlogs` row in the same transaction, with the document's previous state. Who may retire: a company ADMIN of the project's owning company, or a SYSADMIN, checked with `isCallerAdmin` (`server.ts:103-111`) — not the permission matrix's `admin` role, which no HTTP caller can hold (`index-http.ts:149` sets every caller to `editor`). `project.delete_scope` MUST retire its spec's documents along with the scope. Today they survive the hard delete as orphans, because `specid` is NULL.

**Acceptance Criteria**:
- [ ] A dry run returns the per-document impact and changes zero rows.
- [ ] A confirmed retire hides the document from `upsert_document` matching, `list_open_items`, the lifecycle, devplan and scopeflow generators, and `GET /projects/:id/documents`.
- [ ] A TEAM_MEMBER or editor-only token gets 403 on retire and restore.
- [ ] A restore brings the document back exactly; both actions leave audit rows.
- [ ] Retiring the last live copy of a kind needs a second, explicit confirm.

### FR-014 — Spec numbers come from their scope: `<scope>-0001` (Amendment C)

Specs of **new** scopes are numbered from the scope: `<scope>-0001`, `<scope>-0002`… — even when there is only one — so adding a spec never renumbers one. Existing scope and spec numbers are unchanged. Scope numbers are allocated by the hub **atomically**, reserved when allocated, so two callers can never be handed the same number (today buildscope computes a number and reserves nothing, `mcp-server/src/utils/project-kit.ts:1200-1258`). Client-side allocators are retired:

- `materialize-seeds.ts:36-56`;
- the createspecs prompt's "next free under specs/";
- the web `ScopeService.createScope` `Number(max)+1`, which turns `146-0001` into `NaN`.

Every parser of a scope or spec number MUST accept the new form before the hub issues it. Verified sites, 2026-10-25:

- dbpush `:325,422,469,984`;
- `spec-md-parser.ts:23`;
- the fence regexes in `fence-emitter.ts:72-80`, `_wxAI/impact/lib/scopes.mjs`, `fence-usage.mjs` and the Cockpit's `impactViews.ts:220`;
- `auditfences.ts:131`;
- `workflow-engine.ts:111` and `spec-verification.ts:11,39`;
- the prefix lookups in `spec-loader.ts`, `sync-task-status.ts`, `archive-files.ts`, `buildscope-worker.ts`, `task-id-index.ts`, `sync-archived-files.ts`, `ProjectLifecycleGenerator.ts`, `ai-audit.ts:49` and `scope-impact.mjs`;
- the `parseInt` sites in `devplan-generator.ts:192`, `scopeflow-generator.ts:206`, `cockpit-summary.ts:160-184`, `duplicate-scopes.ts:153` and `AutoScopeAnalysisService.ts:196`;
- `scopedependencies.sourcescope` and `targetnumber`, which are integer columns.

Fences for a spec of a new-style scope read `[SCOPE <scope>-<nnnn> / Tnnn]`.

**Acceptance Criteria**:
- [ ] A new scope's first spec is `<scope>-0001`, and its second is `<scope>-0002`, with the first unchanged.
- [ ] Two concurrent buildscope creates in one project get different scope numbers.
- [ ] Every listed site has a test with a `146-0001` fixture, and sibling specs `146-0001` and `146-0002` never resolve to each other.
- [ ] Existing three- and four-digit projects (`0877` style) push, fence and audit exactly as before.
- [ ] The hub refuses to issue a `<scope>-NNNN` number to, and refuses writes carrying one from, a kit older than the release that understands it, naming the upgrade.

### FR-015 — A push never writes over another scope's number (Amendment C)

`create_specs` and dbpush MUST carry the hub spec id once it is known. The id is written into the local spec on first create (`lifecycle.json` `specId`, which 21 specs already carry by hand and nothing reads). A write whose number is owned by a different spec id MUST be refused, naming the owner and the next free number. When the caller has no id yet, the same rule applies to a write whose number is owned by a scope with a different title and content. This closes the `create_specs` takeover at `server.ts:3314-3330`, where any push carrying another scope's number replaces its title and content. Renames are explicit (a rename operation that names the spec id), never inferred from a changed title.

**Acceptance Criteria**:
- [ ] The `532e34a3` reproduction (a web-created scope 035, then a kit push of a different 035) is refused, and the web scope is unchanged.
- [ ] Two local folders with the same number are refused before either is pushed (today dbpush only warns, `dbpush.ts:436-453`).
- [ ] After a first create, the local spec carries the hub spec id, and later pushes match on it.
- [ ] A rename changes the title only through the rename operation.

### FR-016 — "Resolved" means proven live; one contract suite guards every write (Amendment C)

A feedback report on a write defect is marked resolved only after a live probe of the **deployed** hub. The probe reproduces the customer's original steps and passes, and its output and the deployed version are written in the resolution note. Every fix ships a regression test on the path the customer used (CLI and MCP over HTTP, not mocks), shown to fail without the fix. One contract suite asserts the three properties — repeatable, contained, loud — over **every** MCP write tool and every kit write command. It runs in CI and in the nightly run. A recurrence reopens the original report and links the new one.

**Acceptance Criteria**:
- [ ] The contract suite covers every tool and command classed as a write by SCOPE-019 Amendment B AC13 and fails when a new write tool is added without a contract entry.
- [ ] The suite runs in CI and in the nightly run (SPEC-140), and restoring CI comes first in the build order.
- [ ] Each report this amendment closes carries a live probe, and its version, in its resolution note.

### Build order (decision 11)

1. CI restored (blocked today: GitHub Actions budget exhausted — owner action).
2. FR-011 step 1, the columns (owner applies).
3. FR-010 and FR-015, the identity and number guards.
4. FR-012 and FR-013, retire and cleanup; then FR-011 step 2, the index.
5. SCOPE-135 Amendment B, surgical buildscope edits.
6. FR-014, the new numbering.
7. FR-016, the contract suite.

Clients (kit, Cockpit) ship before the server.

### Out of scope for this amendment

- Undo, version history, bringing web-created scopes down to laptops — group 1 topic.
- dbpush defaulting to a dry run, and the customer's runbook — group 3 topic.
- Renumbering any existing scope or spec.
- Retiring **project-level** documents (no spec) through the cleanup. They stay matchable by (doctype, title) and retirable one by one through FR-013.

### Clarifications — Session 2026-10-25 (Amendment C)

| # | Question | Decision |
|---|----------|----------|
| 1 | New scope or amend? | Amend SCOPE-124 (5b, 5c, 5d, 5f) — it owns the write path (brainstorm decision 3). |
| 2 | Unique index or application code (Open Question 2)? | Unique partial index; the owner applies it after the cleanup. |
| 3 | Delete or retire? | Retire, soft and restorable, impact shown first, audited; T015 reversed openly. |
| 4 | Who may retire? | Company ADMIN of the owning company or SYSADMIN, via `isCallerAdmin` (owner, 2026-10-25). |
| 5 | How do old kits avoid corrupting new numbers? | The hub refuses new-style numbers to and from kits older than the release that parses them (owner, 2026-10-25). |
| 6 | Phase it? | No — one batch, nothing deferred (decision 4). |

---

## Clarifications

**FR-001 ships ahead of this scope as a hotfix.** Decided 2026-08-05. The batch-by-area rule exists
because every kit release costs the customer an upgrade, and in this product upgrading is itself the
risky act. `mcp-server/` is the opposite case: it auto-deploys on push to main and costs the customer
nothing. The rule is therefore **batch what customers must install; ship what they do not**. FR-001
is server-side, live in production today, and crosses a tenant boundary — it goes out on its own,
scoped tightly to identity resolution. FR-002's read-modify-write is a design change and stays with
the batch even though it sits in the same function.

**The disclosure is narrow and does not warrant an incident notice.** Only the short-name slug
crosses the boundary; no document content, no customer data. It is a correctness bug with a leak as a
side effect.

**This scope is built before SCOPE-123.** A blocked customer knows they are blocked; a corrupted
board gets believed. 123 stops work visibly, while this scope writes wrong data that looks right.
This cluster is also larger — eight reports across five projects against five across two — and has no
predecessor, whereas 123 waits on SCOPE-122.

## Open Questions

1. **How `list_open_items` exposes spec identity (FR-004)** — a `specs[]` collection, or `specNumber`
   resolved onto each task. The first is cleaner and answers "what specs exist" directly; the second
   is a smaller change and makes `dbpush`'s dead branch live. Not decided.

2. **Whether FR-005's document identity is enforced by a unique index or in application code.** **Answered by Amendment C (2026-10-25): a unique partial index, applied by the owner after the cleanup (FR-011).** The
   index is stronger; the application-level upsert keeps this scope DDL-free against a database with
   no migration ledger. Leaning application-level.

3. **What FR-008 does with a duplicate that has diverged.** A shadow scope someone has since edited is
   no longer a pure copy. Report and leave it, or offer a merge? Deleting edited work on an inference
   is not acceptable.

4. **Whether FR-007's uppercase-only rule needs an escape for authors who legitimately write about
   markers.** Answered by this document — see Notation. Not hypothetical: it happened on the first
   attempt to file this scope.
