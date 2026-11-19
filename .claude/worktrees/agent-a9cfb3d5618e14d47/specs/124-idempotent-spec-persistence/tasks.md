# Tasks: Idempotent Spec Persistence

Source of truth for status is the DB (spec `23c7cf78-3f94-4ce2-b124-50935c4b8bbc`). Task titles carry the `[124-Tnnn]` prefix
so `dbpush` can still resolve them today — see SCOPE-124 T004, which removes that dependency.

## Task table

| Task | Title | Priority | Status |
|---|---|---|---|
| T001 | Resolve buildscope edit identity from the database | critical | done |
| T002 | Make an edit a read-modify-write | critical | done |
| T003 | Report which sections an edit replaced | medium | done |
| T004 | dbpush determines existence from specs, not task titles | critical | done |
| T005 | Remove parseScopeFromTaskTitle from the identity path | high | done |
| T006 | Let list_open_items answer what specs exist | critical | done |
| T007 | Resolve or delete dbpush's dead specNumber branch | medium | done |
| T008 | Make every write path idempotent | critical | done |
| T009 | Stop truncation feeding a correctness decision | high | done |
| T010 | Marker detection judges content, not language | high | done |
| T011 | Actor detection tolerates Markdown emphasis | high | done |
| T012 | Reconcile the second, inconsistent marker detector | medium | done |
| T013 | Sweep the remaining preflight checks for English-only assumptions | medium | done |
| T014 | Detect duplicates already written | high | done |
| T015 | Remove duplicates through project.delete_scope | high | closed — will not do |
| T016 | Fix the stale setup-mcp.mjs advice in dbpush | low | done |
| T017 | Regression suite for identity and idempotency | high | done |
| T018 | validatescope answers from the DB or not at all | critical | done |
| T019 | validatescope can judge a scope that is not pushed yet | high | done |
### Amendment B

The first column is the row number, not the task id. The orchestrator's `implement` parser
(`spec-loader.ts` TABLE_ROW_RE) requires a numeric first cell, and the table above — written
before that mattered — puts the task id there, so no row in it is visible to `implement`.
Amendment tasks are listed in the parseable shape rather than renumbering shipped rows.

| # | Task | Priority | Status |
|---|---|---|---|
| 20 | T020 buildscope reports what it actually did | high | done |
| 21 | T021 the other tools that answer for work they did not do | critical | done |
| 22 | T022 a spec write says which record it hit | critical | done |
| 23 | T023 the instructions name what actually exists | high | done |
| 24 | T024 the MCP build is pinned, so a release cannot silently not happen | critical | done |


## Task detail

### T001 — Resolve buildscope edit identity from the database

**Priority**: critical · **Status**: done

**SECOND RESIDUAL, found 2026-08-05 while building T002 — now tasked and fixed as T018.**

FR-001. SHIPPED AHEAD OF THIS SCOPE as a hotfix - commit 316ffef4, deployed to the hosted MCP 2026-08-05. The edit path resolved which scope it was editing via readdirSync on a path containing no project identifier, which on the hosted MCP is the wxKanban repository; a consumer editing scope NNN received whatever NNN-*.md sat in our tree (field report a6734641). Identity now resolves against (projectId, specNumber). Recorded as SOC 2 finding NEW-12 in project-documentation/SOC2_RELEASE_REVIEW_2026-08-05.md.

### T002 — Make an edit a read-modify-write

**DONE 2026-08-05.** The edit path now splices supplied fields into the document that already
exists (`mcp-server/src/utils/scope-merge.ts`); `resolveEditTargetFileName` became
`resolveEditTarget` and returns the stored content alongside the file name, so identity and content
come from the one query T001 already made.

**Splice, never regenerate — and the difference is not stylistic.** "Parse into fields, re-emit"
cannot meet the acceptance criteria: `buildScopeContent` stamps a fresh `**Created**` date and a
`### Session <today>` block, and emits fixed US1–US3 / FR-001–FR-006 boilerplate, so a round-trip
through it is never byte-identical — and a hand-edited document loses every section the generator
has no concept of. An edit supplying nothing now returns the existing bytes by identity, with no
parse and no rejoin.

**A missing section is CREATED, never borrowed.** Preflight reads `## Overview` when
`## Business Problem` is absent, so writing the business problem into Overview would have scored
fine and destroyed prose the field does not own. Same rule keeps `constraintsAndRisks` off the
`## Constraints` MUST-list. Generated scopes are edited through their Core Design table rows,
hand-written ones through their headings; both forms are handled, heading first.

**The blank re-interview was a second bug in the same path.** `assessBuildScopeInput` judges how
complete the *arguments* are, so an edit supplying one field looked like a scope with six missing
answers and was sent back through the guided interview with no content returned — ff0eb155. An edit
over existing content now bypasses that gate entirely and is judged by preflight, which is the gate
that matters.

15 tests in `mcp-server/tests/scope-edit-merge.test.ts`, including both field reports by name.

**Priority**: critical · **Status**: done

FR-002. The edit branch locates a filename and never reads the existing document, so every section is rebuilt from the caller's arguments and anything omitted comes back empty - reported as blank re-interview (ff0eb155) and as generating an empty shell (a02e6ec5). Load the existing scope, apply supplied fields over it, preserve everything not supplied. Acceptance: editing one section leaves all others byte-identical; a no-change round-trip is byte-identical.

### T003 — Report which sections an edit replaced

**DONE 2026-08-05.** `mergeScopeEdit` now returns a `changes[]` entry per region — `section`,
`action` (replaced/created), `previousLines`, `previousChars`, a ≤120-char `previousExcerpt`, and
`substantial`. Surfaced on the tool response as `sectionsChanged`.

**`substantial` is decided by preflight's own `isMeaningfulText`,** not a threshold invented here.
So it means what it means everywhere else in this codebase: not empty, not a placeholder, and not
the generator's default for that field. That distinction is the whole point — listing every touched
section equally buries the one that matters. Overwriting `Define the business value and outcome for
this scope.` is unremarkable; overwriting someone's paragraph is the blast radius, and only the
latter is named in the response message.

Counts and an excerpt rather than the previous body in full: the caller needs to recognise what was
displaced, not receive a second copy of their document in the envelope.

**`sectionsCreated` was also lying on an edit.** It returned the fixed seven-item list a CREATE
writes, so an edit that changed one line claimed to have created seven sections. It now reports the
regions this call actually created — usually none.

**T003's reporting immediately found a T002 defect, which is the argument for the task.** The first
run showed a one-line Business-Problem edit displacing **8 lines**. `findSectionEnd` bounded a
section the way preflight's `extractSectionContent` does — stopping only at `##`, reading straight
through `###`. In a generated scope `### Core Design` sits inside its parent section, so editing the
prose above it **destroyed the whole Core Design table**: exactly the collateral damage T002 exists
to prevent, and invisible until something measured it. Now bounded at a heading of any level.

The trade-off is deliberate: a section that genuinely owns subsections has only its leading prose
replaced. Under-replacing is recoverable; destroying a table the caller never mentioned is not.

13 tests in `mcp-server/tests/scope-edit-blast-radius.test.ts`, plus a regression test for the
nested-subsection bug in `scope-edit-merge.test.ts` where the T002 contract lives.

**Priority**: medium · **Status**: done

FR-002. Where a supplied field replaces substantial existing content, the response enumerates what changed so the caller can see the edit's blast radius. Acceptance: the response lists the replaced sections; an edit supplying no optional fields is a no-op on content.

### T004 — dbpush determines existence from specs, not task titles

**DONE 2026-08-05.** `phase2Compare` now reads `resp.specs` for identity. Task grouping stays
task-derived but uses the `specNumber` T006 puts on each task instead of parsing its title.

**The key decision is what happens when the answer cannot be trusted.** A missing `specs[]` is
**UNKNOWN, never "no specs exist"** — and that difference is the entire defect. Treating
absent-or-truncated as empty makes every spec look new, which is precisely the failure being fixed.
So both cases route to the existing `unreachable` path, which already refuses to push outside a dry
run. An older MCP without T006, or a project past `SPEC_IDENTITY_CAP`, therefore **stops with a
message instead of writing duplicates**. Fail closed, not fail quiet.

Archived specs are counted as existing — an archived spec still owns its `specNumber`.


**Priority**: critical · **Status**: done

FR-003. dbpush.ts:499-512 derives its known-spec set from list_open_items' tasks array via t.specNumber ?? parseScopeFromTaskTitle(t.title). The first branch is dead - tasks link by specId UUID and no specNumber is ever returned - so identity always falls to regex-matching an [NNN-T###] prefix in title TEXT. Query the project's specs directly and make line 774's isNew decision on that authoritative set. Acceptance: a spec with zero open tasks, and one whose task titles carry no prefix, are both recognised as existing.

### T005 — Remove parseScopeFromTaskTitle from the identity path

**DONE 2026-08-05.** No caller in the identity path; the function is **retained, not deleted**.
Reading the `[NNN-T###]` prefix is still legitimate for display, grouping and diagnostics. What it
may never again decide is whether a spec EXISTS. The defect was never this parser being wrong — it
was a correct parser being asked a question it cannot answer, about specs whose tasks it could not
see.


**Priority**: high · **Status**: done

FR-003. A task title is documentation, not a key. Acceptance: parseScopeFromTaskTitle has no callers in the identity path; the Duplicate specNumber error becomes unreachable through normal re-runs, asserted by a second run of a real fixture being clean.

### T006 — Let list_open_items answer what specs exist

**DONE 2026-08-05.** Open question resolved: a **`specs[]` collection**, not `specNumber` decorated
onto tasks. Decorating tasks cannot satisfy FR-003 — a spec with **zero tasks** has no task row to
decorate, and that is the sharpest form of the defect. `specId`/`specNumber` were added to the task
projection as well, but as convenience; `specs[]` is the identity answer.

Deliberately **not** bounded by `maxItems` (FR-006): a truncated list is a wrong answer to "does this
spec exist". `SPEC_IDENTITY_CAP = 1000` is a runaway backstop and `specsComplete: false` reports it
rather than applying it silently. `specRows` is loaded for `category:'tasks'` too, so that call still
resolves each task's `specNumber` instead of returning null for all of them.

**Archived specs are included, deliberately.** SCOPE-103 hides archived scopes' *documents* from this
listing; extending that to `specs[]` would be a correctness bug, because an archived spec still OWNS
its `specNumber` — omitting it tells a caller the number is free and walks back into a duplicate.
**Structurally verified** (the query carries no status predicate; SCOPE-103's filter applies only to
`docWhere`) but **behaviourally untested** — this project has no archived specs. T017 must cover it.

Verified over the real HTTP route against a temporary local server on the production database:
deployed envelope has keys `[documents, events, paging, tasks]` and tasks carrying neither `specId`
nor `specNumber`; after the change, 83 specs returned with `specsComplete: true`, all four of
121/122/123/124 resolvable by number, 100 of 100 tasks carrying `specNumber`, `category:'specs'`
returning specs only, and `category:'tasks'` still resolving 5 of 5.


**Priority**: critical · **Status**: done

FR-004. The envelope carries only tasks, documents and events - which is why callers infer. Add authoritative spec identity: a specs[] collection, or specNumber resolved onto each returned task. Open question: which. Acceptance: a caller can enumerate the project's specs without parsing any title; existing consumers keep working because the addition is additive.

### T007 — Resolve or delete dbpush's dead specNumber branch

**DONE 2026-08-05 — resolved rather than deleted.** `t.specNumber` now carries a value for every task
the envelope returns (100 of 100 verified), so `dbpush.ts:503`'s long-dead
`t.specNumber ?? parseScopeFromTaskTitle(t.title)` branch finally executes its first arm. Note this
does **not** close T004: the title-parsing fallback is still reachable, and a spec with no tasks is
still invisible to a task-derived set. T004 must move `dbpush` onto `specs[]`.


**Priority**: medium · **Status**: done

FR-004. dbpush.ts:503's t.specNumber branch never fires. Once T006 lands it must either become live or be deleted - it must not remain as a branch that never executes, which is what disguised this defect for months.

### T008 — Make every write path idempotent

**DONE 2026-08-05 — server-side only; the kit needed no change.** `dbpush`'s `pushExistingSpec`
already upserts through `project.upsert_document` and creates no tasks, so every duplicate came from
`create_specs`, which inserted a fresh row per call. Confirms plan.md's read that FR-005 is
server-side, and means this reaches customers on the next deploy with no kit release.

**The SCOPE-061 guard now updates instead of refusing.** It was right about the duplicate and wrong
about the remedy: a re-push is the normal way to sync an edited spec, and answering it with
"Duplicate specNumber 010" left customers with no route to update a spec at all. Uniqueness is still
absolute — one row per (project, specNumber) — reached by writing to the row that owns the number.

**Document identity is `(projectId, doctype, title)` with `specId IS NULL`.** Not "spec + doctype"
as the task text assumed: the spec doc and the plan doc **both** use doctype `specs`, so that key
collides between two different documents. Title is what separates them, which is exactly the key
`upsert_document` already uses.

**`projectdocuments.specid` exists and is deliberately still left NULL here.** Measured against
production: the column is present, but **0 of 2567** doctype-`specs` rows carry it. Populating it
would move these rows out from under `upsert_document`'s `specId IS NULL` filter, so the next
`dbpush` would stop matching them and build a parallel set for every consumer — reintroducing
BUG-2026-07-18 from the other direction. Migrating both writers to `specId` is a real improvement
and a separate, coordinated change.

**Neither spec status nor task status is overwritten on update.** The incoming `phase` is whatever
the caller's local files say; letting a content sync rewind a spec from `implementing` to `planned`
is how a board stops being believed. Stage transitions stay with `update_spec_status`, SCOPE-123,
and `dbpush`'s own forward-only `syncTaskStatuses`.

Task identity is `(specId, name)`. Repeated titles **within one push** collapse to one row too —
otherwise a single call could duplicate on its own.

Production scale of what this closes, measured before the fix: **115 excess document rows across 83
`(project, title, doctype)` groups**, including six copies each of scope 020's spec, plan and
lifecycle documents. Those existing rows are FR-008's job (T014/T015); this stops new ones.

14 tests in `mcp-server/tests/spec-persistence.test.ts`, including a cross-writer contract test that
reads `wxkanban-agent/dbpush.ts` and asserts the two writers still agree on every title — the drift
that caused BUG-2026-07-18 now fails a test instead of duplicating a customer's documents.

**Priority**: critical · **Status**: done

FR-005. create_specs and dbpush upsert on identity rather than inserting a parallel set. A document's identity is its spec plus doctype, so a second write updates instead of creating a second one (975ada4a reported duplicate document sets). Prefer application-level upsert over a new unique index to keep this scope DDL-free - production has no migration ledger and six declared tables are already missing. Acceptance: pushing the same spec twice yields one spec row and one document per doctype; task rows are not duplicated.

### T009 — Stop truncation feeding a correctness decision

**DONE 2026-08-05.** `phase2Compare` now calls `project.list_open_items` with **no bound at all**.

**The bound could not have been raised to fix this.** `maxItems` is capped at 100 by the tool's own
schema, so no value of it can express "all of them". T006 answered the question a different way:
`specs[]` is returned outside `maxItems` entirely, capped only by a runaway backstop that reports
itself through `specsComplete`. Passing no bound keeps the two facts from drifting apart — a
`maxItems` sitting on the identity call reads as though it governs identity, and the next person to
route a decision through the bounded lists reintroduces exactly this defect.

**A second finding: `knownTaskIdsBySpec` was built on every run and read by nothing.** A map
assembled to answer a question no caller asked. It is now left explicitly empty rather than
populated from the newly-unbounded task list, because task-level idempotency moved to the SERVER in
T008 — `create_specs` matches task rows on (specId, name). Populating a second, client-side
answer to the same question is how two sources of truth start.

3 tests in `wxkanban-agent/tests/unit/dbpush-identity-unbounded.test.ts`: the call carries no
`maxItems`, a spec at position 150 is recognised, and an answer that reports itself incomplete still
fails closed.

**Priority**: high · **Status**: done

FR-006. dbpush requests maxItems: 100; any spec beyond that window is invisible and treated as new. Remove the bound from the identity path or paginate to completion. A limit may bound a display, never an existence check, and reaching one must be reported rather than silently applied. Acceptance: a project with more than 100 open items pushes correctly.

### T010 — Marker detection judges content, not language

**DONE 2026-08-05.** Markers are matched as **isolated UPPERCASE tokens**. Dropping the `i` flag is
the entire fix.

**The cause, reproduced before changing anything:** the word-boundary match ran case-insensitively,
so it matched the Spanish word **todo** ("all", "every") — unavoidable in ordinary Spanish
prose. A whole project was blocked from filing its scopes for writing its own language correctly.

The stand-in word keeps BUG-12's structural narrowing instead of the case rule: it is a real English
word whose template form is lowercase, so case cannot separate marker from prose there —
position can.

**Blocking issues now quote the matched text and its line** (`findPlaceholders`), capped at five
with a remainder count. Naming the marker alone, against a 300-line document, was a fact the author
could not act on — and when the match was their own language, could not believe either.

**Priority**: high · **Status**: done

FR-007. matchesPlaceholder in shared/preflight/src/text-utils.ts matches its marker words case-insensitively on a word boundary, so ordinary Spanish prose is rejected (c9fc52d4). Require the marker as an isolated UPPERCASE token, or narrow it the way BUG-12 already narrowed the stand-in word. NOTE: normalizeText strips backticks before matching, so a code-span-aware check cannot work - that information is destroyed first. Acceptance: a Spanish document passes; a literal uppercase marker still blocks; the blocking message quotes the matched text and its location.

### T011 — Actor detection tolerates Markdown emphasis

**DONE 2026-08-05 — and the task text described the wrong shape.** Reproducing all seven forms
first showed that `- Secondary: **Supervisor**` (emphasis on the actor's NAME, the example the task
gives) **already passed**, because `normalizeText` strips the emphasis from the captured value. What
actually failed was emphasis on the **LABEL** — `- **Secondary**:`, `- *Secondary*:` — and
emphasis wrapping the whole line, since the old pattern required the label to start immediately
after an optional bullet. The reporter's document must have emphasised the label.

All eight forms are now recognised, for both Primary and Secondary. Reproducing before fixing is
what kept this from being "fixed" in a way that changed nothing.

**Priority**: high · **Status**: done

FR-007. '- Secondary: **Supervisor** - descripcion' is rejected while the unbolded form passes, so validation is coupled to typography - and the methodology we ship tells authors to use the very label the check then rejects when the name is emphasised. The label identifies the actor; the formatting does not. Acceptance: the bolded form is recognised as a secondary actor.

### T012 — Reconcile the second, inconsistent marker detector

**DONE 2026-08-05 — converged, not documented as different.** `server.ts` carried its own
inline rule set: case-insensitive (so it counted Spanish "todo") and matching the stand-in word
anywhere in prose, which BUG-12 narrowed in the shared module years ago and never reached here. An
author who fixed what `create_specs` blocked on could still see an ambiguity count they could not
reproduce.

It now calls `findPlaceholders` from `@wxkanban/preflight`. **Safe in this direction specifically:**
that detector is advisory (a warning on `project.analyze`) while the shared one blocks, so aligning
them can only narrow what is reported — no artifact that passed before starts failing.

**Priority**: medium · **Status**: done

FR-007. server.ts:396 is a SEPARATE marker detector with its own rule set that BUG-12's narrowing never reached - two detectors, two behaviours, one concept. Either converge them on the shared implementation or document why they must differ. Found while making this scope's own document pass preflight.

### T013 — Sweep the remaining preflight checks for English-only assumptions

**DONE 2026-08-05.** Four findings, two of them deliberately left alone. Recorded as tests in
`shared/preflight/tests/fr007-language-and-formatting.test.ts` so they cannot quietly change.

1. **The reporter's plural claim is settled: it was imprecise, and there is no third detection
   site.** Word-boundary matching cannot match the plural — it stops at the trailing letter
   — and neither detector ever did. Verified against both. They almost certainly saw the
   singular blocked and assumed the plural. Pinned by a test so a future prefix-match change fails
   loudly.
2. **`isMeasurableMetric`'s keyword list is entirely English** (under, within, users, latency...),
   so a metric with no digits is held to a stricter bar in Spanish than in English. **Left
   unchanged**: requiring a number is the right bar for a *measurable* metric whatever the language,
   and widening the keyword list is product localisation — SCOPE-046, explicitly out of scope
   here.
3. **Section headings and actor labels are English-only, by design.** The template that ships is
   English and every heading regex matches English, so a scope with translated headings is not
   recognised. **This is the line FR-007 draws, and it is worth stating plainly: the STRUCTURE is
   English, the CONTENT need not be.** Changing it is SCOPE-046.
4. **`matchesDefaultValue` compares against English defaults only** — harmless, since a
   non-English document simply never matches them. No false rejection is possible. No change.

**Found while sweeping, and fixed:** `shared/preflight/tests/preflight.test.ts` had been
**unrunnable since spec 029**. The repo-root vitest config includes only `tests/**`, so it never
collected them, and running vitest inside the package inherited that config and died resolving
`tests/setup.env.ts` against the wrong root. 29 assertions over the rules that gate every
`create_specs` call, silently never run. A package-local `vitest.config.ts` fixes it; all 29 pass,
including against this scope's changes.

**Priority**: medium · **Status**: done

FR-007, last acceptance criterion. Marker detection was the one found; it is unlikely to be the only one. Record the findings even where no change is made. This also settles the unconfirmed reporter claim that both the singular and plural Spanish forms trigger the check - do not close FR-007 on the marker fix alone.

### T014 — Detect duplicates already written

**DONE 2026-08-05** — `mcp-server/src/utils/duplicate-scopes.ts`, read-only, plus
`formatDuplicateReport` for a human-readable rendering. **Run against production: 97 projects,
1705 specs.**

**The headline finding contradicts this scope's own premise. The 29-shadow set numbered 030-058
copying 001-029 is NOT in production.** No bulk-copy cluster of any kind survives. Either it was
already cleaned, its project was removed, or the original report described something else. The claim
should be treated as unverified until someone can point at the project it came from — and
T015's sizing rests on it.

**One genuine duplicate exists.** A project holds `008 "WIN_CodiciCAP — ricerca CAP"` alongside
`108` of the same name — 99% similar, both written the same day by one wxConversion run that
filed its output at 101-132. Contents have since diverged slightly, so the report says so rather
than presenting it as a safe delete.

**Everything else is a converted application whose scopes are near-identical BY NATURE** — one
per legacy window, `BrowseCarrierTypes` beside `BrowseControlTypes`. Content similarity cannot
separate "copied" from "structurally the same" there, which is why no pair reaches `high` without a
numbering cluster behind it.

Two tuning decisions came directly from that run, not from theory:

- **A cluster requires the offset to be at least as large as the number of pairs supporting it.**
  Copying N scopes lands them N or more numbers later. Without this, five pairs at offset +1 —
  which is what an ordinary project looks like — were being reported as a bulk copy.
- **Similarity ignores wording the project repeats everywhere.** Raw token sets scored twelve
  unrelated scopes at 61% similar purely on shared template scaffolding. Tokens appearing in more
  than 60% of a project are dropped before comparing (only once the corpus is at least 8, or a
  two-scope project would have its entire shared body erased).

Together these took the production report from 117 candidate pairs to 49, removed every spurious
cluster, and left the one real duplicate standing.

11 tests in `mcp-server/tests/duplicate-scopes.test.ts`, including that an ordinary project reports
nothing and that a pair whose timestamps contradict the copy direction is flagged rather than
silently resolved.

**Priority**: high · **Status**: done

FR-008. Report pairing shadow scopes with the originals they copy, by content similarity and numbering offset - one project carries 29 duplicates numbered 030-058 shadowing 0001-0029. Detection is read-only and safe to run against production. Acceptance: each duplicate is listed with the original it shadows and the reason.

### T015 — Remove duplicates through project.delete_scope

**CLOSED WILL-NOT-DO 2026-09-23. The tooling blocker is gone; the premise is not.**

`project.delete_scope` now exists — SCOPE-098 T007–T009 were built on 2026-09-23 specifically
to unblock this task. It is closed anyway, because the thing it was written to delete does not
exist, and the detector that would feed it cannot currently tell a duplicate from a sibling.

Re-verified against production 2026-09-23, across **155 projects and 3,594 scopes** — roughly
twice the data T014 saw:

- **No 29-offset cluster.** T014's 2026-08-05 finding stands.
- **The detector reports 12,349 pairs**, essentially all from one project: Frumar, a WinDev
  conversion holding 1,021 scopes. `RPT_Table_<entity>` at 0877–0896 pairs against
  `RPT_Details_<entity>` at 0779–0797 at similarity 0.95–0.96. Those are a table view and a
  detail view of the same entity — two legitimate report families, not copies.
- **The cluster signature is what fails.** The "constant offset" is the numbering gap between
  two families, repeated 87 times — and offset agreement is exactly what promotes a pair to
  `high` confidence, the label that would justify acting on it.

A deletion pass over that output would propose removing 87 legitimate report scopes, each with
its tasks, from a customer project. A working delete tool aimed at this detector is worse than
no tool. Filed as field report **`a9bcb204`**.

To reopen: fix the cluster heuristic to exclude parallel families first, re-run detection, then
judge what is actually there. The one genuine duplicate T014 found — a project holding `008` and
`108` of the same name, written the same day by one wxConversion run — is a human decision, not
a batch job.

---

*Original blocking note, 2026-08-05, retained for history:*

**BLOCKED, confirmed 2026-08-05.** `project.delete_scope` does not exist in `server.ts`, and
SCOPE-098's T007-T009 (schema + permission entry, handler + tool definition, tests) are all still
`todo`. The scope's rule holds: this consumes `delete_scope` rather than growing a second delete
path, so if SCOPE-098 slips, this slips. `merge_scope` cannot substitute — it refuses pairs
that do not share a `specNumber`.

**T014 changes the urgency.** The 29-duplicate set this task was sized against is not in production,
and the one genuine duplicate found has diverged contents, so it needs a human decision rather than
a bulk delete. Unblocking SCOPE-098 for this alone is worth a deliberate choice, not an assumption.

**Priority**: high · **Status**: blocked on SCOPE-098 FR-005

FR-008. Depends on SCOPE-098 FR-005 (T007-T009), which is specced and not built - if it slips, this slips rather than growing a second delete path. merge_scope cannot help: it refuses any pair not sharing a specNumber and these differ by 29. Acceptance: removal takes tasks and documents with it; nothing is deleted without explicit per-scope confirmation.

### T016 — Fix the stale setup-mcp.mjs advice in dbpush

**DONE 2026-08-05.** Surfaced itself while running the T004 tests — the failure output literally
printed "Start the kit runtime with `node scripts/setup-mcp.mjs`". Deleted at kit v1.1.0; following
it added MODULE_NOT_FOUND on top of the original failure. Now points at `npm run kit:status`, and a
regression test asserts the string never returns.


**Priority**: low · **Status**: done

dbpush.ts:769 tells the user to run node scripts/setup-mcp.mjs when MCP is unreachable. That script was deleted in kit v1.1.0 during the hosted-MCP cutover and SCOPE-121 confirmed the archive has never shipped it, so a consumer following the advice gets MODULE_NOT_FOUND. One line, same file.

### T017 — Regression suite for identity and idempotency

**DONE 2026-08-05** — `mcp-server/tests/scope-124-acceptance.test.ts`, 17 tests organised by FR
rather than by module, so a change that satisfies every unit test while breaking the promise still
fails.

**The archived-spec gap T006 could not close is now guarded, structurally and honestly.** This
project has no archived specs, so there is nothing to drive the behaviour against. The test asserts
the identity query's WHERE clause contains the projectId equality and nothing else — no
`status`, no `archiv`, no `and(`. An archived spec still OWNS its `specNumber`; filtering it out
would report the number free and walk straight back into a duplicate. The test is labelled
structural rather than dressed up as behavioural.

Four criteria are guarded the same way, each stating why: the handler `switch` in `server.ts` is not
exported, there is no test database, and `phase2Compare` needs a live MCP.

**Three of these guards failed on their own documentation the first run** — asserting a removed
pattern is absent, against a file whose comment explains the removal by quoting the pattern. They
now read comment-stripped source. Worth recording because it is the obvious way to write a
structural guard that passes for the wrong reason.

**Priority**: high · **Status**: done

Executable coverage of the FR acceptance criteria: a second dbpush run on an unchanged project creates nothing; two projects at the same spec number resolve differently; a scope with no open tasks is recognised; an edit round-trip is byte-identical; a Spanish document passes preflight while a real marker still blocks.

### T018 — validatescope answers from the DB or not at all

**FILED AND DONE 2026-08-05.** Found while building T002; tasked rather than folded into it, because
it is FR-001's residual and not FR-002's work.

**Priority**: critical · **Status**: done

FR-001. `validateScope` still carried the filesystem fallback T001 removed from the edit path. When
the `(projectId, specNumber)` lookup found nothing it fell through to `readdirSync` over
`resolveWorkspaceRoot()`, which on the hosted MCP is the **wxKanban repository** — so a consumer
validating their spec 016 had OUR `016-scope-help.md` scored and was told their scope passed, or
which blocking issues to fix, on the strength of another tenant's document.

**State the disclosure precisely.** The document body is not echoed back; what crosses the boundary
is the *verdict* computed from it — score, per-section checks, blocking issues, and any placeholder
fragments quoted from the matched text. That is a wrong answer about the caller's own scope rather
than a bulk content leak, and it is worth the accuracy: the earlier write-up of this finding
overstated it as returning content.

**The `filePath` branch was the sharper half.** That path is caller-supplied, unconstrained, and
`isAbsolute` was honoured, so a remote caller could name any readable path on the server and learn
from the result whether it exists and whether it contains marker tokens. `ValidateScopeInputSchema`
puts no constraint on the string, and the handler passes it straight through.

**One rule closes both:** with a `projectId`, the database is the only source. The filesystem
survives only where there is no `projectId` — the local kit-author path, the same condition
`generateNextSpecNumber` and `resolveEditTarget` already document. The not-found result now names
the real reason and the remedy, since buildscope does not persist and an unpushed scope genuinely
has no record.

6 tests in `mcp-server/tests/validatescope-tenant-isolation.test.ts`. They drive a real temp
workspace with `016-scope-help.md` present, so they prove refusal rather than absence — **verified
by reverting the gate: the 3 leak tests fail and the 3 kit-author tests still pass.**

Ships with the server; no kit release needed. Worth recording as a SOC 2 finding alongside NEW-12.

### T019 — validatescope can judge a scope that is not pushed yet

**Amendment A, filed 2026-08-20 from field report 287f076a.** T018's residual: it closed the
filesystem routes correctly and left no route open for the case those routes were being used for.

**Priority**: high · **Status**: done

FR-001. The reporter ran `buildscope`, which wrote `specs/Project-Scope/007-*.md` on their machine
per its own documented write-first flow, then called `project.validatescope` with `filePath` naming
that exact file — and was told the scope was not in the project's records. They concluded `filePath`
was dead. It was, for them, and the schema still advertised it as *"Path to scope file (alternative
to specNumber)"* with no hint otherwise.

**Two separate faults, and the smaller one is the more visible.** The advertised description
promised a capability T018 had removed. But the deeper fault predates T018: `filePath` could never
have worked for a consumer, gate or no gate. The hosted MCP resolves a path against **its own**
disk. The caller's file is not on this machine. Reading a caller-named path was never *their* file
being validated — which is precisely why T018 found it scoring ours.

**So the remedy cannot be a path, and must not be.** Any parameter that makes the server open a path
reopens T018 exactly. What closes the gap is content: the caller reads their own file and sends the
text as `scopeContent`, the server scores it and touches no filesystem. `create_specs` has always
taken its scope this way; validatescope is now consistent with the tool it gates.

Content takes precedence over the stored record deliberately. A caller who sends a document is
asking about *that* document — normally a draft newer than the record. If the record won, editing
then validating would report the pre-edit verdict.

`filePath` survives as a label only, echoed into the result so a run over several drafts can tell
the verdicts apart. Its description now says so, rather than implying a read. The not-found message
named pushing as the only remedy, which sent callers to `create_specs` purely to obtain a verdict;
it now names `scopeContent` first and says plainly that `filePath` is not read here.

`scopeContent` is capped at 500 KB (`SCOPE_CONTENT_MAX`). The largest scope in this repository is
~92 KB, so that is headroom rather than a working limit — it exists so a runaway payload becomes a
validation error instead of an unbounded run through the preflight regexes.

**The runtime prompt was the other half of the report.** `mcp-server/src/prompts/validatescope.md`
never mentioned `project.validatescope` at all — 356 lines of purely local file-walking methodology,
which is why calling the tool directly with a path was the reasonable thing to try. Pre-Flight now
has a step 3 that reads the located file and calls the tool with `scopeContent`, states why content
rather than a path, and makes the server's verdict authoritative over the prompt's own rubric.

**Known divergence, NOT closed here.** That rubric scores a different document shape than the server
preflight does — it looks for `US1/US2/US3`, sequential `FR-001` numbering and a Core Design table,
where the preflight scores Overview / Business Problem / Actors / Success Metrics / Scope Boundary /
Out of Scope / Open Questions. Step 3 subordinates the rubric to the server verdict so the two
cannot contradict each other on readiness, but they remain two rubrics. Reconciling them is its own
task and is not attempted here.

7 tests in `mcp-server/tests/validatescope-scopecontent.test.ts`, alongside T018's 6, which still
pass unchanged. They drive the same real temp workspace with a well-formed scope file present, so a
test that passed because the file was missing would prove nothing — the filePath-precedence test
names that file and sends a weak draft, and a verdict of `valid` would mean the file had been
opened. **Verified by mutation: disabling the `scopeContent` branch fails 5 of the 7.** The two that
survive are the T018 guard and the not-found message, both independent of that branch by design.

Ships with the server; no kit release needed. The consumer-visible half is the tool description and
the runtime prompt, both server-delivered.


### T020 — buildscope reports what it actually did

**Amendment B, filed 2026-09-04 from field report 7dfc7c13.** The same family as T018/T019: a
response that describes an outcome the call never produced.

**Priority**: high · **Status**: done

FR-009. The reporter called `project.buildscope` with every quality field supplied and got back
`success: true`, `status: "created"`, `specNumber: "051"`, a `filePath` of
`specs/Project-Scope/051-imap-ingestion-read-support-mailbox.md`, a `checklistPath` beside it, and
the message *"Scope 051 created, but it still has blocking issues to resolve before create_specs."*

Neither half of "created" was true. No file existed at either path — checked immediately, and the
directory held only the scope the session had authored by hand. No record existed either:
`project_cockpit_summary` for spec 051 answered *"Spec not found in this project"*. The scope came
into being only when `project_create_specs` was called with `scopeContent`.

**This is the response wording, not the behavior.** The behavior is correct and deliberate:
SCOPE-028 Phase 12 (FR-021) removed the server-side write precisely because on the hosted MCP those
writes land in our container, not on the caller's machine — the same class of fault T018 found in
`validateScope`. `buildScope` writes no file and stores no row; it returns `scopeContent` and
`checklistContent` for the caller to write. What was never updated is what the function *says* about
itself: `status: 'created'`, two bare paths, a docblock still reading "save to database", and a
message in the past tense.

**Why that costs more than a wrong word.** A path plus "created" is a claim an operator acts on —
the natural next move is to open the file and edit it, which creates a *new* empty file at a path
the tool named and forks it from the real scope. In this report it also nearly destroyed work: the
returned draft was placeholder-ridden boilerplate scoring 86 with four `NEEDS CLARIFICATION`
blockers, and taking "created" at face value would have replaced a finished, hand-authored scope
that preflighted at 100. `validatescope`'s own description already states the true contract
("buildscope writes the file on your machine, so there is no record here until create_specs or
dbpush runs") — buildscope's response contradicts the tool it feeds.

**The remedy is to say what happened, in the fields a caller reads:**

- `status` becomes `drafted` for a create and `draft_updated` for an edit. Neither word claims a
  file or a row. `template_only` and `draft_interview` already claimed nothing and are unchanged.
- `persisted: false` — machine-readable, so a client need not parse prose to learn that nothing was
  stored.
- `suggestedFilePath` / `suggestedChecklistPath` name the destinations as destinations.
- The message says the draft is returned for the caller to write, and that no record exists until
  `create_specs` or `dbpush` runs. `nextSteps` leads with writing the content, because this response
  is the only copy of it.
- The docblock stops claiming a database write the function has not performed since SCOPE-028.

**`filePath` and `checklistPath` are deliberately kept alongside the new names.** Renaming them
outright is what the report suggests, and it would break every kit already in the field:
`wxkanban-agent/workers/ai/buildscope-worker.ts` writes the scope and checklist from exactly those
two fields, and a consumer on v1.7.x would silently stop getting scope files written. They keep
their names and gain honest siblings; the tool description says what they are.

The worker also derives its console verb from `status`, so it learns `drafted`/`draft_updated`. Its
"created" stays accurate there, because on that path a file genuinely is created — by the client,
which is the whole point.

**The test file had encoded the false contract too, and had been failing since Phase 12 removed the
writes.** `mcp-server/tests/project-kit-scope-flow.test.ts` called `buildScope` and then
`readFileSync`'d the returned `filePath`, so both buildscope tests died on ENOENT — the suite was
asserting the very behavior the report says does not exist, and the ENOENT masked every assertion
after it. They now assert the write-first contract: content returned, `persisted` false, `suggested*`
mirroring the paths, no `specs/Project-Scope` directory created, a message that says "drafted" and
never "created", and `nextSteps[0]` naming the write.

A third test in that file, "refreshes the requirements checklist", carried the same false assumption
from the same removal — `validateScope` writes no checklist either — and is corrected here rather
than left for someone else: the test now writes the draft to the temp workspace itself, the way
`buildscope-worker.ts` does in the CLI, and asserts that neither call put a checklist on disk.

Two assertions elsewhere tracked the old status words and were moved to the new ones:
`scope-edit-merge.test.ts` (×2, `updated` → `draft_updated`) and `scope-edit-blast-radius.test.ts`
(`updated:` → `edited:`).

**Two things in that file are NOT T020's, and are reported rather than papered over:**

1. `canProceedToCreateSpecs` is **false**, not true as the old test hoped. The generated template
   carries four `[NEEDS CLARIFICATION]` blocks in the sections buildscope takes no input for (Data,
   API, Frontend, Key Entities), so the generator's own output cannot clear the generator's own
   gate. That is the boilerplate defect the same field report ran into (score 86 there, 93 on the
   probe here) and it is untouched. The test asserts the real behavior with the cause named.
2. `fixtures/buildscope-rich-template.md` is **stale** — it predates the rewrite that replaced
   invented tables and routes with those placeholder prompts. Its comparison is split into its own
   `it.skip` test, named and commented as known-stale, so it is visibly skipped rather than silently
   green or permanently red. Un-skip by regenerating the fixture once the placeholder behavior is
   settled.

One pre-existing failure remains in the file and is unrelated to both: `placeholdersFound` no longer
contains a bare `placeholder`, which T010 narrowed on purpose. Baseline was 5 failed / 3 passed;
after T020 the file is **7 passed, 1 skipped, 1 failed** on that T010 assertion.

Verification: `mcp-server` builds clean (`tsc -b --force`), the six scope-related suites run
**85 passed / 1 skipped / 1 failed** (that T010 assertion), the kit's `workflow-engine` and
`mcp-adapter` suites stay green, and a direct probe of the built `dist/utils/project-kit.js`
reproduces the reporter's exact case — a 93-scoring draft with four blockers — now answering
`status: "drafted"`, `persisted: false`, and a message that says nothing was written or stored. The
9 other failures in the wider mcp-server run are `tests/server.test.ts` and `tests/integration.test.ts`
needing a live database.

`mcp-server/src/utils/schemas.ts` and the runtime prompt were applied outside the `implement`
proposal: the fence emitter rejects a file of `export const X = z.object(...)` with "no top-level
declaration detected", and a Markdown prompt has no fenceable unit at all — the same carve-out
barrel files already use. The `prebuild` step (`build-prompts.mjs`) re-encoded the prompt into
`registry.ts`, verified by decoding it back out of `dist`.

Applying through `implement 124/T020` newly fenced the whole `BuildScopeWorker` class under
`[SCOPE 124 / T020]`. The class was un-fenced legacy and T020 changed two lines of it, so the fence
overstates authorship — left exactly as the orchestrator wrote it, because fences are not
hand-edited.

Ships with the server — the tool description and the runtime prompt are server-delivered, so the
consumer-visible half needs no kit release. The worker change ships with the next kit cut and is
backward-compatible in both directions.

### T021 — the other tools that answer for work they did not do

**Amendment B, part 2 — swept 2026-09-05 after T020.** T020 fixed the response the field report
named. The same question asked of every other tool on this server found six more, and one of them is
worse than the report: it answers with an identity for a record it never created.

**Priority**: critical · **Status**: done

FR-009. Each of these answers `success: true` for work that did not happen. None is a behavior
change here — the behavior is already what it is; what changes is that the response stops
contradicting it.

**1. `project.import_project` invents a project.** `importProject` is a placeholder whose comment
lists the four things a real implementation would do, then returns `{ id: randomUUID(), name,
status: 'active', createdAt: now }`. Nothing is inserted. The caller receives a UUID for a project
that exists nowhere and a status of `active`, and the tool description says "Creates project record
and optionally generates a kit." Fabricated identity is the most damaging shape this defect takes:
every later call carrying that id fails or, worse, is filed against nothing. Now returns
`success: false`, `status: 'not_implemented'`, no id at all, and names where projects are actually
created.

**2. `project.analyze` reports an analysis it never ran.** `analyzeSpecArtifacts` resolves its
artifacts directory from `const dir = undefined; // TODO`, so the first branch always wins: every
call in the tool's life has returned 0 requirements, 0 tasks, `0%` coverage, 1 critical issue and
the finding "No spec artifacts directory found for spec NNN" — under `success: true` and
"wxAI-analyze completed". Both halves mislead. The finding is about *this container*, not the
caller's project, and everything below the early return is unreachable code that would have read
**our** repository — the same fault T018 closed in `validateScope`, where a caller-named path scored
the wrong tenant's documents. The reader is deleted (git history keeps it) and the tool says it has
no access to those artifacts, naming the local commands that do.

**3. `project.session_start` states facts it did not check.** An admitted placeholder returning
`projectType: 'CONSUMER'`, `governance: { version: '1.2.0', upToDate: true }`,
`todos: { scanned: true, unlinkedCount: 0 }` and `sessionReady: true`. A `note` field does say it is
a placeholder, below four fields that read as measurements. Every one of those checks needs the
caller's workspace. The fields are now `null` and the response says nothing was checked.

**4. `project.regenerate_kit` starts nothing and leaves the record stuck.** It set the kit row to
`status: 'generating'` and answered "Kit regeneration started. Check status with kitstatus command."
The comment beneath admits the async job "would" exist. Nothing clears `generating`, so a caller
polling for completion waits forever on a job that was never queued — the one instance here that
corrupts state rather than only describing it wrongly. The write is removed and the response says
regeneration is not available from this server.

**5. `project.implement`'s description promises files it deliberately never reads.** "Run
implementation plan from tasks.md with scope-first enforcement, checklist validation, and mandatory
task push to database." The handler explicitly does not read `tasks.md` — its own comment explains
that the hosted MCP cannot see the client's `specs/` directory, so the disk read was removed and
tasks come from `projecttasks`. No checklist is validated and no code is written; it syncs task
rows, records two events, and moves the spec to `implementing`. The description and the "completed"
message now say that, and the `phases` array lists the four things that ran instead of six that
did not.

**6. `project.kit_status` answers `ready` for a kit it knows nothing about.** The mildest, and
already documented in code: kit-generation state lives in the wxKanban app, so this is a
token-scoped reachability check that returns `ready` with every real field `null`. The value is
**left alone** — kit install and upgrade use this tool as their token sentinel and an unknown
consumer may branch on it — and a `statusMeaning` field now says what `ready` means here. Changing
it needs a check of the installers, which is not this task.

Also corrected: `project.validatescope`'s description still said "buildscope writes the file on your
machine", which T020 made stale — buildscope returns the content and the *kit* writes it.

**The shape of the remedy is T018's, not a new one.** Where a route cannot work from this host, say
so and name the route that can; never answer with a measurement that was not taken. Two of these
could instead be rebuilt against the database (a DB-backed `analyze` over stored spec documents; a
real `import_project`) — both are features with their own scope, deliberately not attempted here,
and the responses now point at what exists today rather than pretending.

Guarded by `mcp-server/tests/scope-124-t021-truthful-responses.test.ts` — 12 tests, structural, in
the style T017 established: the fabricated literals and completion claims are asserted absent from
the executable source (comments stripped, since the comments explaining each removal necessarily
quote what was removed). It also carries a guard for T020's buildscope response, so the pair is
pinned in one place.

**One existing guard had to move, and the reason is worth recording.** T017's "there is only ONE
marker detector" test required `findPlaceholders(specContent).length` to appear in `server.ts` — and
that call site was *inside* `analyzeSpecArtifacts`. Deleting the dead reader deleted the last call,
so the guard failed on a correct change: it had pinned the invariant to a line that only existed in
unreachable code. It now asserts what it names — that no second, private marker rule set appears in
`server.ts` — while the shared detector keeps its real coverage from the preflight assertions in the
same block.

Deleting the reader also orphaned three imports (`existsSync`/`readFileSync`, `join`,
`findPlaceholders`), removed in the same change; `tsc` catches these, which is how they were found.

Verification: `mcp-server` builds clean; the full unit suite runs **445 passed / 3 skipped /
10 failed**, the same 10 that failed before this task — 9 `tests/integration.test.ts` cases plus
`tests/server.test.ts`, all needing a live database, and the T010 placeholder assertion carried
forward from T020. The built `dist` was checked to carry each corrected response, and to no longer
contain `analyzeSpecArtifacts` at all.

### T022 — a spec write says which record it hit, and refuses a project it will not act on

**Amendment B, part 3 — from three customer reports, 2026-09-05.** T020 and T021 fixed responses
that overstated what a call did. These are the same defect one step further in: the call did
something real, to a record the caller never named.

**Priority**: critical · **Status**: done

FR-009. Closes `3ea10d39`, `928f604f`, `64dadcc1`, `c98f8aa7` and `032ee3a2`. Two reporters
independently hit the same silent wrong-record write; `a17783bb` is a fifth report of the buildscope
defect T020 already fixed, and needs no code.

**1. `update_spec_status` picked a different spec and said nothing (`3ea10d39`, `928f604f`).** The
target was resolved with a single `find` whose predicate is an `or`:

```
String(s.specNumber) === String(input.specNumber) ||
  (Number.isFinite(Number(input.specNumber)) && Number(s.specNumber) === Number(input.specNumber))
```

Both branches sit inside one pass, so **row order decides**: a numeric match on an earlier row beats
an exact string match on a later one. A project holding both `0006` and an archived `006` therefore
resolves `"0006"` to whichever the database returned first.

It cost both reporters real state. One un-archived two specs — `006` and `002`, both explicitly
marked `[ARCHIVED — fictional]` — and set them to `implementing`, reversing two archive decisions,
while the specs they meant to move were left untouched. The other moved a scaffold spec `003`
("Dashboard / Main Application Shell") instead of their own `0003` ("Backend / API"), and caught it
only because the returned title looked wrong. Both had to hunt the real spec by listing every spec
and matching the exact string, revert the damage, and re-issue by `specId`.

The remedy is the one both reporters proposed. **Exact string match wins outright.** Numeric
normalization runs only when no exact match exists, and when it yields more than one candidate the
call is **refused** with an ambiguity error naming every candidate — id, specNumber, title, status —
rather than picking one. The response now also carries `requestedSpecNumber` and `resolvedBy`
(`specId` | `exact` | `normalized`), so a caller that asked for `"0006"` and got `"006"` can see it
in the response instead of inferring it from a title that looks off.

The resolver moves out of the switch into `resolveSpecTarget()` in `spec-persistence.ts`, beside the
other identity rules from T008, because a rule that decides which row gets written must be testable
without a database, an auth scope and a transport.

**2. A supplied `projectId` that does not match the token was ignored (`64dadcc1`).** The reporter
mistyped one character of a project uuid, the call returned success, and the write landed in the
token's project. Their sentence is the whole finding: *"A parameter documented as a guard performs
no guarding."* `update_spec_status` now refuses a `projectId` that is not the token's project, and
its parameter description says the write goes to the token's project and a mismatch is an error.

**Not made global, deliberately.** The reporter suggests auditing every `project_*` tool taking a
`projectId`, and they are right that the pattern is wider — but a blanket mismatch guard in
`withResolvedProjectId` would break tools where a different project is legitimate: the feedback sink
rebinds scope inside its handlers, and `list_my_feedback` deliberately accepts another project and
authorises it through `assertCallerCanViewProject`. Breaking the channel customers report bugs
through, to fix a report about a mistyped uuid, is not a trade worth making blind. The guard goes on
the tool that was reported; the wider audit is named in Open Questions with the two exemptions
already identified.

**3. `createSpecs` documented `scopeContent` as something the gates reject (`c98f8aa7`,
`032ee3a2`).** The kit's createspecs prompt specifies the field as
`"<multi-paragraph markdown body for Spec ## Overview section>"`, and the MCP schema as "Scope
document content in Markdown". The preflight that gates the call requires the full canonical set:
`## Overview`, `## Business Problem`, `## Actors` with `- Primary:` and `- Secondary:` lines,
`## Success Metrics` (≥ 3 measurable), `## Scope Boundary`, `## Out of Scope`, plus
`## Open Questions` as a warning. Supplying exactly what the field description asks for is blocked
with six failed gates, each naming a section the description never mentioned.

As one reporter put it, following the documented contract as written cannot succeed, and every
project pays the same round trip to discover it. Both descriptions now name the required sections;
the kit prompt names them where the AI producing the JSON will read them. The gates are not relaxed
— they are what makes a scope usable downstream — and semantic parsing of headingless prose is a
different piece of work, not a documentation fix.

Guarded by 10 unit tests over `resolveSpecTarget` in
`mcp-server/tests/spec-target-resolution.test.ts`, including both reporters' exact scenarios:
`"0006"` against a project holding `0006` and an archived `006`, and `"0003"` against `0003` plus a
scaffold `003`. Real assertions over the rule, not structural ones — which is the point of moving it
out of the switch.

**Proven by mutation rather than assumed.** The old predicate was re-run against reporter one's
fixture and does pick `archived-006` for `"0006"`, so the fixture ordering genuinely reproduces the
defect and the exact-wins test would fail against the old code. The new resolver returns
`real-0006` with `resolvedBy: 'exact'`, and reporter two's `003` / `0003` pair is refused with both
candidates named.

The test file is applied outside the `implement` proposal — the fence emitter finds no fence-eligible
declaration in a file of arrow consts and `describe` blocks — the same carve-out T020's schemas.ts
and the runtime prompts use. The server-delivered `createspecs` prompt was corrected too and
re-encoded into `registry.ts` by `prebuild`, verified by decoding it back out of `dist`.

Verification: `mcp-server` builds clean; the full unit suite is **455 passed / 3 skipped /
10 failed**, the same 10 as before (9 needing a live database, plus T010's placeholder assertion).
The kit's unit suite is 541 passed / 1 failed, and that one failure — `auditfences.test.ts` strict
mode — was confirmed pre-existing by re-running it with this work stashed.

### T023 — the instructions name what actually exists

**Amendment B, part 4 — from the same customer sweep, 2026-09-05.** T020–T022 corrected what tools
*say they did*. These two correct what our own instructions *tell people to do*: one sends callers
through seven wrong guesses, the other sends them to a command that was removed.

**Priority**: high · **Status**: done

FR-009. Closes `3a463856` and `e699f326`. Two more from the same sweep needed no code and are
recorded here with their evidence: `4678de36` (implement Phase 3's `spec_implementation_progress`
event type) was closed when the type joined the `capture_event` enum on 2026-08-20, and `293d4ddb`
(Phase 3 omitting the required `source` / `actor`) was closed when `implement.md` grew the explicit
five-field list. Both verified in the tree rather than assumed.

**1. The preflight refused a scope without saying what it would accept (`3a463856`).** The Actors
gate takes exactly one shape — `- Primary: <actor>` and `- Secondary: <actor>` line labels — and
that requirement was stated in exactly one place: the runtime prompt returned by
`get_command_prompt({command: 'createspecs'})`. Not in the blocking message, not in the suggestion
text, not in validatescope's own prompt.

The reporter had a 50-scope corpus stuck at score 79 on "Actors section must identify a primary
actor" and tried seven reasonable shapes against the live server before the createspecs prompt gave
it away: `**Primary actor:** X`, `- **Primary actor:** X`, a `### Primary Actor` subheading, an
Actor/Type table inside Core Design, generic role keywords, `Primary Actor:` inside Overview, and
combinations. They filed it as documentation rather than a defect, and were generous to do so — a
gate that rejects without naming its accepted form is a gate that costs every new corpus the same
afternoon.

Both actor messages now carry the form. The rule is unchanged; only the refusal explains itself.

**2. `_wxAI/rules/git.md` mandates a command that no longer exists (`e699f326`).** The file states
as an ABSOLUTE RULE that `git commit`, `git add`, `git push`, `git merge` and branch creation must
all route through the `wxAIGit` skill, and credits it with conventional-commit formatting, automatic
changelog updates, semantic version bumping and automatic push. SPEC-058 Amendment B reduced wxAIGit
to two subcommands: `scripts/wxaigit/` contains `gitbranch.sh` and `gitmerge.sh`, and both launchers
answer anything else with *"unsupported subcommand (only 'branch' and 'merge')"*.

So the mandated path for a commit does not exist. The reporter's session stalled on exactly that:
asked for a commit, directed to a tool with no commit subcommand, and left choosing between an
apparent governance violation and not committing. This repository is not exempt — the same rule
sits in CLAUDE.md's always-on set, and every commit made here has been plain `git`.

The second half is the enforcement claim: the file leans on a PreToolUse git-guard hook and offers
`SKIP_GIT_GUARD=1` as the bypass. No such hook is installed — not in the reporter's project and not
in this one, whose `.claude/settings.json` carries no git guard. An assistant following the rule
literally asks the user to set an environment variable that does nothing.

Rewritten to describe the tool as shipped: wxAIGit is branch and merge, commits and pushes are plain
`git`, and that is the intended path rather than a bypass. The changelog / version-bump / auto-push
claims are gone, because nothing performs them. **The permission rule is kept and strengthened**,
restated on its own merits — never initiate git unprompted, never run history-rewriting or
destructive commands — rather than resting on a hook that is not there. The reporter's own words on
why this matters are worth keeping: the genuinely valuable parts of the file were being undermined
by sitting next to instructions that are demonstrably false.

`_wxAI/rules/` is what the kit syncs to consumer projects, so the corrected file reaches them on
their next sync. There is no second copy under `wxkanban-agent/templates/` to keep in step —
checked, not assumed.

**Not closed here, and bigger than a wording fix:** `152b8eb2` reports `/scope-import` calling four
`wxk_*` tools that no exist on the server (`wxk_scope_import`, `wxk_stats`, `wxk_task_ready`,
`wxk_spec_list`) — the skill was written against a replaced tool surface — *and* parsing tasks.md as
`- [ ]` checklists when the kit's own generator emits a table. `0ff8acaf` reports the same parser
disagreement from the task-push skill. That is a retarget plus a parser rewrite across two skills,
with the same root cause as the parser mismatch this amendment's own work ran into, and it deserves
its own task rather than being tacked on here. Both reports stay open and named.

Verification: the reporter's exact shape — `**Primary actor:** Operations manager` under
`## Actors` — was re-run through the rebuilt preflight. It still scores 79 and still blocks, which
is correct, and the refusal now reads *"Expected form: a line reading \"- Primary: <actor>\" under
\"## Actors\""*. `shared/preflight` builds and its own suite is 50/50; two assertions in it pinned
the bare literals and now assert the claim and the form separately. `mcp-server` rebuilds against
the new package and holds at **455 passed / 3 skipped / 10 failed** — the same 10 as before.

The `git.md` rewrite is prose in `_wxAI/rules/`, applied directly: the fence emitter has no unit to
fence in Markdown, the same carve-out the runtime prompts use.

### T024 — the MCP build is pinned, so a release cannot silently not happen

**Amendment B, part 5 — 2026-09-10, found while sending the customer notes for T020–T023.**

**Priority**: critical · **Status**: done

Not this scope's subject matter, and filed here because this scope's own release is what surfaced it.
It belongs to release integrity rather than spec persistence; a dedicated scope is warranted if the
follow-ups below are taken up.

**What happened.** The 2026-09-08 push deployed the app (1.5.316) and published kit v1.7.62. The MCP
service deployed at 09:21 UTC and **rolled back at 09:23**, so production kept serving the
2026-08-28 build. T020, T021 and T022 — the buildscope wording, the six faked-result tools, the
spec-target resolver — were never live, while the commits sat in `origin/main` looking shipped. It
was caught only by probing the live server before answering eleven customer reports: `project_analyze`
still returned `success: true`, `"wxAI-analyze completed"`, 0 requirements and the phantom critical
finding that T021 deleted.

Two days of believing a release had shipped is the same defect class as the reports themselves — a
system reporting an outcome it did not produce — one level up, in the release pipeline.

**Root cause.** `mcp-server/.gitignore` ignored `package-lock.json`, so the MCP's dependency tree was
never pinned: every App Runner build resolved ~338 packages from the registry from scratch, on top of
a root tree that already symlinks the two `file:` deps (`@wxkanban/preflight`, `@wxkanban/watermark`).
**npm 10.9.4 — the version in App Runner's Node 22 image — crashes on that shape** with
`Cannot read properties of null (reading 'edgesOut')`, and the build command returned non-zero:

```
[Build] npm error Cannot read properties of null (reading 'edgesOut')
[AppRunner] Failed to build your application source code. Reason: Failed to execute 'build' command.
```

No dependency changed between the last good build and the failed one — no `package.json`, no lock,
no new nested package. Nothing in the repository moved; the build image's npm did. An unpinned build
means the release outcome depends on something no one in this repository controls.

**Proven, not inferred, in both directions.** A clean worktree at HEAD, with the build's own command
sequence, run under `npx npm@10.9.4`:

| state | result |
|---|---|
| no `package-lock.json` (as App Runner had it) | **exit 1** — `Cannot read properties of null (reading 'edgesOut')` |
| `package-lock.json` present | **exit 0** — added 338 packages in 12s |

The same tree under the local npm 11.12.0 installs cleanly with or without the lock, which is why
this never showed up in development and why reproducing it needed the build image's exact version.
After the locked install, `npm run build` exits 0 and `dist/server.js` contains
`wxAI-analyze cannot run here` — the T021 string — so the artifact the deploy would ship is confirmed
to carry the fixes.

**The fix.** `mcp-server/package-lock.json` is committed and the ignore is removed, with the reason
written into `.gitignore` where the next person will meet it. `mcp-server` was the only build-feeding
package without a tracked lock — the root, `vscode-extension` and `wxkanban-agent` all had one.

**Deliberately NOT switched to `npm ci`.** It would be stricter, but the lock is generated on Windows
and `npm ci` refuses to add platform-specific optional binaries it finds missing, which is the
lightningcss / rolldown trap already reported from the field (`cf606eb1`). `npm install` against a
committed lock installs the pinned versions and still resolves the Linux binaries. It also needs no
infrastructure change, so this fix ships with a push rather than a Terraform apply.

**Two findings carried forward, neither fixed here:**

1. **The live service's build command has drifted from Terraform.** `infra/apprunner.tf` declares
   `npm install && cd mcp-server && npm install && npm run build` (lines 101 and 147, prod and
   staging), while the build log shows the service actually running
   `npm install && cd mcp-server && rm -rf dist tsconfig.tsbuildinfo && npm install && npm run build`.
   The service is `ConfigurationSource: API`, so the console/API value wins and Terraform is not the
   source of truth for it. `apprunner-mcp.yaml` in the repo declares a third variant and is inert.
2. **A failed MCP deploy is silent.** App Runner rolled back and nothing said so — no alarm, no
   notification, and the app half succeeded, so every other signal looked healthy. A deploy-outcome
   check belongs with the release procedure; until one exists, verify the live server after every
   push rather than trusting the version number.

## Amendment C — 2026-10-25

Scope: `specs/Project-Scope/124-idempotent-spec-persistence.md`, section **Amendment C**. Rows below are in the parseable shape (numeric first cell). T015's "will not do" is reversed by Amendment C (see T031).

| # | Task | Priority | Status |
|---|---|---|---|
| 25 | T025 CI restored before any Amendment C work ships | critical | todo |
| 26 | T026 Document kind and retire columns — SQL for the owner to apply (FR-011 step 1) | critical | done |
| 27 | T027 Declare the new projectdocuments columns after they exist (FR-011) | critical | todo |
| 28 | T028 A document's identity is (spec, kind), never its title (FR-010, FR-005 reopened) | critical | todo |
| 29 | T029 A push never writes over another scope's number; the hub spec id lives in the local spec (FR-015) | critical | todo |
| 30 | T030 Delete means retire: shared service, project.delete_document, web Retire/Restore (FR-013) | high | todo |
| 31 | T031 Duplicate documents found automatically, cleaned only with consent (FR-012, FR-008 reopened) | high | todo |
| 32 | T032 Unique live-document index — owner applies after the cleanup (FR-011 step 2) | high | todo |
| 33 | T033 Scope numbers allocated by the hub atomically (FR-014) | high | todo |
| 34 | T034 Every parser accepts <scope>-NNNN spec numbers (FR-014) | high | todo |
| 35 | T035 Hub issues <scope>-0001 spec numbers; old kits refused (FR-014) | high | todo |
| 36 | T036 One write-safety contract suite; resolved means proven live (FR-016) | high | todo |

### T025 — CI restored before any Amendment C work ships

**Amendment C — 2026-10-25.** build order 1.

**Priority**: critical · **Status**: todo

GitHub Actions is blocked by an exhausted Actions budget (owner action, 2026-10-24). Every later task's regression and contract tests rely on CI. Done when a push runs the full CI workflow green. Owner task; tracked here so the build order is visible. Classification: easy (owner).

### T026 — Document kind and retire columns — SQL for the owner to apply (FR-011 step 1)

**Amendment C — 2026-10-25.** FR-011.

**Priority**: critical · **Status**: done — applied by Andy 2026-10-25, verified (4 columns, FK, 16,158 rows untouched, app-role privileges, db:drift exit 0); see the schema change log

Write specs/124-idempotent-spec-persistence/sql/0001-document-kind-retire.sql (ALTER TABLE projectdocuments ADD COLUMN IF NOT EXISTS kind varchar(50), retiredat timestamptz, retiredbyid uuid REFERENCES userprofiles(id) ON DELETE SET NULL, retiredreason text) and record it in specs/117-production-schema-integrity/schema-change-log.md. Owner applies by hand (no owner connection string here). Verify with npm run db:drift AND a column-level information_schema check (db:drift is table-level only). Classification: heavy (schema).

### T027 — Declare the new projectdocuments columns after they exist (FR-011)

**Amendment C — 2026-10-25.** FR-011.

**Priority**: critical · **Status**: todo

Only after T026 is applied in production: declare kind, retiredat, retiredbyid, retiredreason in src/db/schema/projectdocuments.ts and mcp-server/src/db/schema.ts (drizzle selects every declared column — declaring first causes 500s). New document ids are UUID v7 generated in code (the MCP declaration's defaultRandom() gives v4). Classification: heavy (schema).

### T028 — A document's identity is (spec, kind), never its title (FR-010, FR-005 reopened)

**Amendment C — 2026-10-25.** FR-010, FR-005.

**Priority**: critical · **Status**: todo

**Also covers (added 2026-10-28):** SPEC-135 Amendment B ships first (Andy, "3 b") and stores each scope document as a projectdocuments row with doctype 'scope', found by title = the scope's file name (wxkanban-agent/core/orchestrator/sync-scope-docs.ts, mcp-server stale-base check). Move that lookup to (spec, kind) along with the rest.

create_specs (server.ts ~3424-3469), upsert_document (~800-874; no more rows[0] without ORDER BY), dbpush pushNewSpec and pushExistingSpec (dbpush.ts 609-736) set specid and kind (from the file name) on every spec-level document and match insert-vs-update on (project, specid, kind). Title is display text, updated in place. pushNewSpec uploads plan.md and tests.md on the first push. Project-level documents keep their (doctype, title) rule. Regression tests on the real CLI→MCP path: same folder pushed twice changes zero rows; a changed H1/heading updates in place; two scopes with the same name get separate plan documents. Classification: heavy.

### T029 — A push never writes over another scope's number; the hub spec id lives in the local spec (FR-015)

**Amendment C — 2026-10-25.** FR-015.

**Priority**: critical · **Status**: todo

Close the create_specs takeover (server.ts 3314-3330): a write whose number is owned by a different spec id is refused naming the owner and the next free number; with no id yet, refused when the owning row's title and content differ. Write the hub spec id into lifecycle.json specId on first create and match on it afterwards. dbpush refuses two local folders with the same number before pushing either (today it only warns, dbpush.ts 436-453). Add an explicit rename operation keyed by spec id. Reproduce 532e34a3 (web scope 035, then a kit push of a different 035) as a regression test. Classification: heavy.

### T030 — Delete means retire: shared service, project.delete_document, web Retire/Restore (FR-013)

**Amendment C — 2026-10-25.** FR-013.

**Priority**: high · **Status**: todo

One retire service behind: new MCP tool project.delete_document (dry run by default returning per-document impact — scope/spec, linked tasks, last live copy of its kind, matches local file — real retire needs explicit confirm); web POST /projects/:id/documents/:docid/retire and /restore beside the PATCH route with a Retire action in ProjectDetailPanel; the FR-012 cleanup. Authorise with isCallerAdmin (company ADMIN of the owning company or SYSADMIN) — not the permission matrix admin role, unreachable over HTTP. Retire sets retiredat/retiredbyid/retiredreason (reason required); every read of projectdocuments filters retiredat IS NULL (MCP: server.ts 1500, 2373, lifecycle/devplan/scopeflow generators; app: the 17 files under src/server). Retire and restore write companyauditlogs in the same transaction with the previous state. delete_scope retires its spec's documents. Retiring the last live copy of a kind needs a second confirm. Classification: heavy.

### T031 — Duplicate documents found automatically, cleaned only with consent (FR-012, FR-008 reopened)

**Amendment C — 2026-10-25.** FR-012, FR-008.

**Priority**: high · **Status**: todo

Read-only detector grouping a project's live spec-level documents by (spec, kind), backfilling specid/kind for pre-FR-010 rows from titles, tags and file paths and listing unattributable rows separately. New kit cleanup command: asks first; shows the keep/retire list (copy matching the local file kept, else most recently updated, said so); one confirm for the whole list; one pass (backfill, then retire through T030). Re-run reports zero groups. Verified against a copy of the reporting customer's project before it is offered. Record in this file that T015's will-not-do is reversed by Amendment C. Classification: heavy.

### T032 — Unique live-document index — owner applies after the cleanup (FR-011 step 2)

**Amendment C — 2026-10-25.** FR-011.

**Priority**: high · **Status**: todo

Only after T031 reports zero live duplicate groups for every project: owner applies CREATE UNIQUE INDEX IF NOT EXISTS idx_projectdocuments_project_spec_kind_live ON projectdocuments (projectid, specid, kind) WHERE retiredat IS NULL AND specid IS NOT NULL AND kind IS NOT NULL; recorded in the schema change log. A second live row for the same key is rejected. Classification: heavy (schema).

### T033 — Scope numbers allocated by the hub atomically (FR-014)

**Amendment C — 2026-10-25.** FR-014.

**Priority**: high · **Status**: todo

buildscope reserves the scope number it allocates (today it computes one and reserves nothing, project-kit.ts 1200-1258) so two concurrent creates never get the same number. Retire the client allocators: materialize-seeds.ts 36-56, the createspecs prompt's 'next free under specs/', and ScopeService.createScope's Number(max)+1. Classification: heavy.

### T034 — Every parser accepts <scope>-NNNN spec numbers (FR-014)

**Amendment C — 2026-10-25.** FR-014.

**Priority**: high · **Status**: todo

Update every site listed in Amendment C FR-014 (dbpush 325/422/469/984; spec-md-parser.ts 23; fence regexes in fence-emitter.ts, _wxAI/impact/lib/scopes.mjs, fence-usage.mjs, Cockpit impactViews.ts; auditfences.ts 131; workflow-engine.ts 111; spec-verification.ts 11/39; prefix lookups; parseInt sites; scopedependencies integer columns) with a 146-0001 fixture each; siblings 146-0001/146-0002 never resolve to each other; existing 3- and 4-digit projects (0877) unchanged. Fences read [SCOPE <scope>-<nnnn> / Tnnn]. Classification: heavy.

### T035 — Hub issues <scope>-0001 spec numbers; old kits refused (FR-014)

**Amendment C — 2026-10-25.** FR-014.

**Priority**: high · **Status**: todo

New scopes' specs are numbered <scope>-0001, -0002... by the hub at create_specs. The hub refuses to issue a new-style number to, and refuses writes carrying one from, a kit older than the release carrying T034, naming the upgrade. Ships only after the kit release with T034. Classification: heavy.

### T036 — One write-safety contract suite; resolved means proven live (FR-016)

**Amendment C — 2026-10-25.** FR-016.

**Priority**: high · **Status**: todo

A contract suite asserting repeatable / contained / loud over every MCP write tool and kit write command (the SCOPE-019 Amendment B AC13 set), failing when a write tool is added without a contract entry; runs in CI and the nightly run (SPEC-140). Each report this amendment closes (0c395650, d493cadd, 975ada4a, 07107d2d, 532e34a3) gets a live probe of the deployed hub and its version in the resolution note; a recurrence reopens and links the original. Notify every company with an open report on these defects when it ships. Classification: heavy.
