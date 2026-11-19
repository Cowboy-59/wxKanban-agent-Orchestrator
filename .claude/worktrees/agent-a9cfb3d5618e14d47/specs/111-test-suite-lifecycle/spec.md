# Spec 111: Test Suite Lifecycle

**Spec**: 111 — Test Suite Lifecycle
**Scope**: SCOPE-111 (`specs/Project-Scope/111-test-suite-lifecycle.md`)
**Spec ID**: `f5552f9a-e581-46d1-8cdf-6e09569d1b22`
**Status**: planned
**Phase**: design
**Created**: 2026-07-25

---

## Overview

wxKanban already knows how to *write* a test suite. During Implementation, the AI reads a scope's requirements, walks the code that implements them, and produces a requirement-traceable set of test items — each one naming the requirement it proves, the code unit it exercises, the exact steps to run, and a machine-checkable expected result for every step. What it cannot do is *keep* them. The suite is written into generic task rows and a markdown document, so the moment it is generated it stops being a test suite and becomes prose.

This scope makes the suite a living object in the project. Test items are stored per scope, with their criteria intact, and every item names the executor that will run it — the machine or a person. Generation authors both sets at once, but they do not run at once. The machine-executed set runs first, during QA. When the AI runs it, it declares the whole list up front and then reports item by item as it works, so the team watches the run happen rather than receiving a verdict afterwards. The last result of every item is retained, so a test that passed last month and fails today is visibly a regression.

The human-executed set is written at the same time but withheld. It is released to testers only once the machine set has completed and QA has been signed off — a person is never asked to test something the machine has not yet cleared, and the two sets are never worked in parallel. Each item carries a single signoff, given by whoever was supposed to run it; a machine test is never satisfied by a human's word, and a human test is never satisfied by a passing run.

When the released set reaches them, the tester is no longer handed a list of task titles. They are shown what to do — the preconditions, the ordered steps, and what each step should produce — and they record a pass or a fail against it. A failure captures why, and becomes a bug report. A tester who finds something the specification never anticipated can add a test of their own, and it joins the suite as a first-class item.

All of this is bounded by a release rather than by a scope. The application version defines a test cycle: every run, every result, and every signoff belongs to one. Machine testing happens before the release reaches UAT, and it is not only the new work — before promotion the AI runs a regression across every machine test in the project, so a change in one scope cannot quietly break another. Only once that passes does the release move to UAT, and only then does the human set reach the testers who work there.

Machine and human work are reset differently, because they cost differently. Every cycle re-runs every machine test from scratch; a machine signoff is never inherited, because re-earning it is nearly free. Human signoffs are not thrown away. A tester is working the build that was promoted, not the one being assembled behind it, so a new version does not interrupt them and does not discard what they have already confirmed. Instead, when the machine set for the new version has passed, the system works out which tests the change actually reaches. Each test names the code it exercises, and the system follows the dependencies outward from what changed: a test is reached if its subject depends on a changed file, however many imports away that is. Those tests, and only those, are marked **Retest**. A human signoff for a test the change could not have touched stands. One for a test sitting on changed code does not, and the tester is asked for that test again and only that test. The previous cycle is kept either way, because comparing the two is what makes a regression a regression rather than a surprise.

Finally, an administrator decides which of this is binding. Each scope carries a force-test flag, and individual test items can override it. Where the flag is on, the product cannot advance toward production until that item has been run, passed, and signed off. Where it is off, the item is offered but never blocks. Testing stops being an activity that happens next to the build and becomes a condition of shipping it.

## Business Problem

A test that nobody can see, re-run, or be held to is not a test — it is a document. That is what wxKanban produces today.

The generation side already works and is not the problem. The test-plan generator inventories 527 Express routes, 94 database tables, 67 UI routes and 167 navigation edges, and derives items against the requirements in the spec. The failure is entirely in what happens next: those items are flattened into task rows that carry a title, a description, and a single results column holding the word `pass` or `fail`. The steps, the preconditions, the expected values, the requirement reference and the code fence all survive only as text inside a description field. Nothing can query them, nothing can re-run them, and nothing can tell whether the pass in that column was produced by a machine two minutes ago or typed by a person two months ago.

Because a run has no record, a run has no visibility. The AI executes tests inside a conversation window and the result is a summary message. Anyone not watching that window learns nothing, and nobody at all learns what is happening while it happens. There is no list of what is about to be tested, no indication of what is executing now, and no history to compare against — so the single most valuable signal a test suite produces, *this used to pass*, does not exist.

The human side is worse, because the human is given the least. The User Testing phase renders the same flat task list as every other phase. A tester opens it and sees titles. The criteria that would tell them what to actually do — navigate here, enter this, expect exactly that — were written by the AI and then discarded into a description blob. So the tester improvises, and an improvised test proves nothing that can be relied on later.

The tester's own knowledge is discarded too. A person using the product finds things the AI could not have derived from the specification, because they come from use rather than from code: an order of operations nobody wrote down, a value that breaks a screen, a workflow the team assumed but never specified. Today there is nowhere to put that. The suite is fixed at generation time, so a test born from real experience either becomes an informal note or is lost. The people best placed to expand the suite are the only ones who cannot.

And when a test does fail, the failure evaporates. A `fail` in the results column records that something was wrong but not what, not where, and not for whom. The project already runs a bug pipeline — reports carry status transitions, internal notes, an AI-suggested fix, and a route into scope — but a failing test does not enter it. The tester who found the problem is the person holding the detail, and at the exact moment they have it, the system asks them for a single word.

None of it is binding. Phase advance is gated on task rows being marked complete and not marked `fail`, so a team can mark a test complete without running it, advance out of QA and User Testing, and reach Release with the suite untouched — the system cannot tell a test that passed from a test that was clicked. There is no notion of a test that *must* be signed off before shipping, and therefore no way for an administrator to say which parts of the product are too important to ship on trust. For a product whose stated differentiator is that AI and users test the work together, that is the gap that matters most.

## Actors

- Primary: The human tester — a project team member working the User Testing phase, who is shown each test's criteria, records a pass or a fail with the reason, adds tests of their own from real use, and whose signoff is the act that releases a forced test.
- Secondary: The AI test runner, a non-human actor that generates the suite during Implementation, declares the list it is about to execute, reports each item as it runs, and signs off the items it proved. The project administrator, who sets the force-test flag on a scope and overrides it on individual items, and is the only actor who can waive a forced signoff. The team manager who owns a phase and is blocked from advancing it while a forced item is unsigned. The developer, who receives a bug report generated from a failed test. A future CI runner, which posts to the same run API as the AI without any change to it. The audit log, which records every signoff, every waiver, and every change to a force-test flag.

## Success Metrics

- 100% of items produced by a generation run are stored as queryable rows with their steps and expected results intact — zero items filed as generic task rows with criteria buried in a description field.
- The live run view reflects the runner's current item within 3 seconds of the runner reporting it, and a run of 40 items is followed end to end by an observer who has no access to the AI conversation.
- Zero phase advances succeed while a forced item is unsigned: across QA, User Testing, and Release, 100% of attempted advances with an unsigned forced item are refused and name the blocking items.
- 100% of recorded test failures carry a stated reason and produce a bug report linked back to the test item — no failure is recorded as a bare status.
- A tester adds a usable test item from their own experience in under 2 minutes with no developer involvement, and that item is immediately runnable and gateable like a generated one.
- The gate verdict returned to the release commands matches the verdict shown in the interface in 100% of checks, because both read the same source.
- Result history is retained across at least the last 10 runs per item with zero prior results overwritten, so a pass-then-fail sequence is identifiable as a regression rather than as a current state.
- The phase completion check adds under 200 milliseconds to a phase view load on a project carrying 500 test items.
- Re-generating a scope's suite preserves 100% of existing signoffs and results for items whose keys are unchanged, and adds new items without duplication.
- A new application version opens a cycle in which 0% of the previous cycle's machine signoffs count toward any gate, while 100% of the previous cycle's runs, results, and signoffs remain readable.
- A change reaching one scope withdraws human signoffs only for the items that scope's code backs: 0% of human signoffs for untouched areas are invalidated, and 100% of withdrawn ones carry a stated reason naming the change that triggered them.
- Zero testers are interrupted, logged out, or have in-progress work discarded by a version bump occurring while they test the promoted build.
- The pre-UAT regression run covers 100% of the project's machine items and classifies every one of them into exactly one of the three categories, with zero items unaccounted for.
- Zero promotions to UAT succeed with a forced machine item unsigned or failing, and zero promotions to production succeed with a forced human item unsigned.

## Scope Boundary

IN: First-class storage of a test suite per scope — a plan row per scope carrying the administrator's force-test default, and one row per test item holding its identity, requirement reference, code unit and fence, gate, priority, risk tier, execution tier, origin, per-item force override, last result, and the full criteria (preconditions, ordered steps with a machine-checkable expected value per step, test data, navigation flow, postconditions) in a form the interface can render and a runner can execute.

Runner-agnostic execution records — a run row describing who or what is running, which gate it covers, its status, its totals, and which item it is executing at this moment; and a result row per item per run, retaining the full history behind each item's last-known result.

A run that announces itself: starting a run returns the ordered list of items it will execute, and the QA surface shows that list up front, highlights the item currently executing, and fills in outcomes as they land, without the observer needing access to the AI conversation.

A test cycle bounded by the application version. Every run, result, and signoff belongs to exactly one cycle, and a new version opens a new one automatically. Machine signoffs never carry across cycles — the regression run re-earns all of them. Human signoffs do carry, and are invalidated selectively rather than wholesale. Closed cycles are retained read-only, because the comparison between them is what identifies a regression.

Change-impact analysis and the Retest state. When a cycle's machine set has passed, the system determines which code the release changed and follows the module dependency graph transitively to find every test that reaches it — an item is impacted if its subject depends on a changed file directly or through any chain of imports, not only if the change landed in the file the item names. Changes carrying no import edges, such as migrations and configuration, are mapped by their own rules rather than treated as reaching nothing. Human tests whose covered code was touched are marked Retest for that cycle and must be signed again; human tests the change could not have reached keep the signoff they already have. A tester is never stopped, interrupted, or asked to repeat work the change did not affect, because they are testing the promoted build rather than the one being assembled.

A full regression gate before UAT. Ahead of promotion the AI executes every machine item in the project, not only those belonging to scopes the release touched, and reports what still passes, what has started failing, and what has never passed as three distinct categories. Promotion to UAT is refused while a forced machine item is unsigned or failing; promotion to production is refused while a forced human item lacks its tester signoff.

Environment awareness. Machine testing runs before the release reaches UAT; human testing happens in UAT against the promoted build; each run records the environment it executed against.

Two separate test sets in sequence. Every item names the executor that runs it — machine or human — and generation authors both sets in one pass. Machine items are executable immediately and run during QA. Human items are stored but withheld from testers until the machine set has completed and QA has been signed off, at which point they are released as a set. The two sets are never in play at the same time, and an item belongs to exactly one of them.

One signoff per item, given by its own executor — a machine item is signed by the run that proved it, a human item by the person who performed it — recorded with who signed it, when, and against which run where applicable. No signoff substitutes for another, and no item carries two.

A User Testing surface that presents criteria rather than titles: the preconditions, the numbered steps and their expected results, and the postconditions, with pass and fail recorded against the item. A failure requires a stated reason and files a bug report through the existing bug pipeline, linked back to the test item that produced it.

Tester-authored tests — a person in User Testing can add a test item from their own use of the product. It is stored, gated, run, and signed off exactly like a generated one, and is distinguishable by origin.

Administrative force control — a force-test flag on the scope, overridable per item, changeable only by an administrator, audited, and surfaced to the tester so they can see which items are binding and which are optional.

Gating on that flag — the QA phase cannot advance while a forced machine item lacks its AI signoff or holds a failing result; the User Testing phase cannot advance while a forced human item lacks its tester signoff; the Release phase cannot complete while any forced item anywhere in the project is unsigned; and the release commands consult the same check as the interface, so the two can never disagree.

The generation command's filing path is rewired to write to this structure instead of to generic task rows, and its execute path drives the run API.

## Out of Scope

Building a test execution engine inside the wxKanban server. The application stores, displays, gates, and audits; it does not spawn a unit-test runner, a browser driver, or a database client. Execution stays with the runner that has the code — today the AI agent, later a CI job — and reaches the application only as run events.

Authoring the CI runner itself. The run API is deliberately runner-agnostic and a CI job can post to it unchanged, but no pipeline configuration, job definition, or CI credential handling is delivered here.

Provisioning a non-production database. The live-write gate remains unable to run until a database exists whose host differs from production; this scope defines how such a run is recorded, not where it runs.

Changing the test item contract. The field definitions, variant derivation rules, gate and tier consistency rules, and data-layer extension already specified by the generation skill are adopted as-is; this scope persists them rather than redesigning them.

Redesigning the bug pipeline. A failed test files into the existing bug-report mechanism with its current statuses, notes, and AI-suggested-fix behaviour. No new triage surface, severity model, or routing is added.

Test analytics — coverage percentages, trend charts, flakiness detection, mean-time-to-green, or any reporting surface beyond the run view, the item list, and the phase gate's statement of what is blocking.

Synchronising test items to external project-management systems. Test items are wxKanban-native and are not pushed to Jira, Monday, Asana, or Trello.

The compliance audit engine, which runs its own executions against its own task catalogue and is a separate mechanism that this scope does not merge with, extend, or replace.

Automatic remediation. A failing test produces a bug report and a blocked gate; it does not open a branch, propose a patch, or trigger an implementation task.

Retroactive migration of previously generated test suites. Existing test-shaped task rows stay where they are; new generation writes to the new structure.

## Open Questions

- **What threshold makes an analysis broad.** A runner declaring breadth marks every human item, so the threshold is the difference between a targeted release and one that re-tests everything. Is it a fixed dependent count, a proportion of the codebase, a payload size, or the runner's own judgement — and does the application get a say, given it can see how many items the declaration will actually cost?
- **Whether dismissals should be visible as a release-quality signal.** A tester can dismiss a Retest mark, which is the right escape valve for an over-marked release. But a release cleared largely by dismissals has had less human verification than its green state suggests. Should the count of dismissals be surfaced at the promotion gate, and is there a level at which it should require an administrator to look?
- **Items whose code disappears.** Re-generation matches on the item key, so an item whose underlying route, table, or screen no longer exists will simply stop being regenerated while its row remains. Should such an item be detected and marked obsolete, be removed, or be left for a person to judge?
- **The default force state of a tester-authored test.** A tester adds a test because something went wrong in real use, which is an argument for it being binding by default. But it also lets any tester create a release blocker. Should a user-authored item default to forced, default to optional, or require an administrator to decide before it can block?
- **Whether a waiver survives a later failing run.** A waived item that subsequently fails a run is in an ambiguous state: the administrative decision was made against an earlier situation. Does the waiver persist, lapse on any new failing result, or lapse only when the failure differs from the one waived?
- **Where project-wide tests live.** Some items — cross-cutting security, navigation, or database-integrity checks — belong to no single scope. Do they attach to a designated project-level plan, to the scope that most closely owns them, or is a scope-less plan permitted?
- **Whether non-forced failures should be visible at Release.** Non-forced items never block by design. Should a failing non-forced item nevertheless be surfaced at the Release gate as a warning that must be acknowledged, or stay entirely silent?
- **Runner authentication for CI.** The run API is runner-agnostic, but a CI job needs credentials of some kind. Does it use a project API token like the orchestrator, a dedicated runner token, or is that deferred until a CI runner actually exists?

## Functional Requirements

**Storage**

- FR-001: The system stores one test plan per scope, owning that scope's test items and carrying the administrator's force-test default.
- FR-002: The system stores one row per test item, retaining its stable key, title, requirement reference, spec reference, code unit, source location, and authoring fence.
- FR-003: Each item retains its gate, layer, variant, parent item, priority, risk tier, test level, execution tier, automation state, and automation reference as queryable values, not as text.
- FR-004: Each item retains its full criteria — preconditions, test data, ordered steps each with its own expected result, navigation flow where applicable, postconditions, exemptions, and the database extension fields for data-layer items — in a form the interface renders and a runner consumes.
- FR-005: Each item records its executor as either machine or human, and an item belongs to exactly one of the two sets.
- FR-005a: Each item separately records its origin as either AI-generated or user-authored, which is independent of its executor.
- FR-005b: A human item records whether it has been released to testers and, once released, when and by which event.
- FR-006: Each item retains its last result status, when it was produced, and which run produced it.
- FR-007: Re-generating a scope's suite updates existing items by their stable key and adds new ones without destroying accumulated results or signoffs.
- FR-008: Deleting a scope removes its plan, items, runs, results, and signoffs.

**Execution runs**

- FR-009: A run is recorded independently of who executes it, naming the runner type, a runner reference, the gate covered, and the scope or plan in question.
- FR-010: Starting a run returns the ordered list of items that run will execute, and that list is stored with the run.
- FR-011: A run records which item is executing at the current moment, and that value is readable by any project member while the run is in progress.
- FR-012: A run maintains its status and running totals of passed, failed, skipped, and blocked items as results arrive.
- FR-013: Each item result is stored per run with its status, its failure bucket, its evidence, and its duration, and previous runs' results are never overwritten.
- FR-014: Reporting a result updates the item's last-result fields to point at that run.
- FR-015: A run can be completed, failed, or cancelled, and a run left without events beyond a defined interval is reported as stalled rather than running.
- FR-016: The run API accepts events from any authenticated runner, requiring no change to admit a CI runner alongside the AI runner.

**Signoffs**

- FR-017: Each item carries exactly one signoff, given by its own executor: a machine item is signed by the run that proved it, a human item by the person who performed it.
- FR-018: A signoff of a type that does not match the item's executor is refused — a person cannot sign off a machine item, and a run cannot sign off a human item.
- FR-019: Each signoff records its status, who or what produced it, a label identifying the producer, the run it derives from where applicable, free-text notes, and the time.
- FR-020: An AI signoff may only be recorded against an item whose result in the referencing run was a pass.
- FR-021: A human signoff records the identity of the person who gave it.
- FR-021a: When a newer run produces a failing result for an item, that item's existing signoff ceases to count as current for gating purposes, and the interface shows it as superseded rather than deleting it.

**User testing**

- FR-021b: The human set is released to testers on promotion of the release to UAT — the point at which the machine set and the regression gate have both been satisfied. Release happens for the set as a whole and requires no manual step.
- FR-021c: An unreleased human item is not offered to a tester, is not signable, and is not counted as outstanding against the QA gate.
- FR-022: The User Testing surface presents each released item's preconditions, numbered steps with their expected results, and postconditions, rather than a task title.
- FR-023: A tester records a pass or a fail against an item, producing a human signoff.
- FR-024: A fail cannot be recorded without a stated reason describing what actually happened.
- FR-025: Recording a fail creates a bug report in the project's existing bug queue containing the item, its steps, the expected result, the stated actual result, and a reference back to the item.
- FR-026: A tester can add a new test item to a scope's suite, supplying at minimum a title, preconditions, ordered steps with expected results, and postconditions.
- FR-027: A tester-authored item is stored, displayed, run, signed off, and gated identically to a generated item, and is visually distinguishable by origin.
- FR-027a: A tester-authored item is a human item and is live on creation — it is immediately visible, runnable, and signable without waiting for a release, since the set it joins has already been released. Release governs only the set authored at generation time.
- FR-028: The tester sees, before starting, which items are binding and which are optional.

**Force control**

- FR-029: Each scope carries a force-test flag defaulting to off.
- FR-030: Each item may override its scope's flag in either direction, and an item with no override inherits the scope's value.
- FR-031: Only an administrator may change a scope's flag or an item's override.
- FR-032: Every change to a flag or override is written to the audit log with the actor, the previous value, and the new value.
- FR-033: An administrator may waive a specific forced signoff, which is recorded as a waiver naming the actor and reason, is audited, and satisfies the gate without being reported as a pass.

**Gating**

- FR-034: The QA phase cannot be advanced while any forced machine item lacks a current AI signoff or holds a failing last result. Human items are not considered at this gate.
- FR-035: The User Testing phase cannot be advanced while any forced released human item lacks a current tester signoff. Machine items are not re-checked at this gate.
- FR-036: The Release phase cannot be completed while any forced item of either kind anywhere in the project is unsigned, regardless of which phase it belongs to.
- FR-037: A refused advance names the specific items that blocked it.
- FR-038: Items that are not forced are reported as outstanding but never prevent an advance.
- FR-039: The release commands evaluate the same gate as the interface, from the same source, so the two cannot report different outcomes.

**Generation and execution flow**

- FR-040: The test-plan generator files its output into this structure rather than into generic task rows, authoring the machine set and the human set in a single pass and marking each item's executor.
- FR-041: The generator's execute mode operates only on machine items: it starts a run, reports each item as it executes it, completes the run, and records AI signoffs for the items it proved.
- FR-042: The narration a person sees in the AI conversation and the state shown in the project view derive from the same run record.
- FR-043: A test item may be linked to a task for cross-reference without a task being required for the item to exist.

**Release cycles and regression**

- FR-047: A test cycle is the unit that testing belongs to, and every run, result, and signoff records the cycle it was produced in.
- FR-048: The application version identifies the cycle. A version the system has not seen before opens a new cycle automatically, with no separate act required to start one.
- FR-049: No machine signoff carries across cycles. Every cycle re-earns them through its regression run, so a machine item is unsigned in a new cycle until that cycle's run proves it.
- FR-049a: A human signoff carries forward into a new cycle unless the change is determined to reach the code that item covers, in which case the item is marked Retest for that cycle and its carried signoff stops counting.
- FR-049b: Impact is determined by following the module dependency graph transitively. An item is marked when the subject it records — its source location, code unit, or authoring fence — depends, directly or through any chain of imports, on a file the release changed. An item with no such path to any changed file is not marked.
- FR-049b1: The graph is derived from the code itself rather than from hand-maintained declarations, so it cannot drift from reality as scope documents can.
- FR-049b1a: The graph is produced by the runner, which is the only party holding the code, and posted with the impact request. The application never reads a repository.
- FR-049b1b: The runner posts the files the release changed and, for each, the set of files that transitively depend on it together with a representative path from the change to each dependent. Computing reachability stays with the runner; deciding what that means for testing stays with the application, which owns the gate.
- FR-049b1c: An impact request that arrives without a graph is refused rather than treated as no impact, since silence and "nothing was affected" must never be the same answer.
- FR-049b1c1: The graph carries the commit it was computed from, and the application refuses it when that commit does not match the one under test. A graph computed against different code marks the wrong items, and without this check nothing downstream can detect it.
- FR-049b1c2: When the dependent set would be oversized, the runner posts the changed files alone and declares the analysis broad. The application then treats every human item as reached rather than inferring that nothing was, and records the mark's reason as a broad change naming the files responsible. Truncating a dependent set silently is never permitted — the choice is a complete set or a declared broad change.
- FR-049b1d: An item declares one or more subjects — the code locations it exercises. A flow item spanning several screens declares each of them. The graph is walked from every subject an item declares, and an item is marked if any one of them is reached.
- FR-049b1e: A Retest mark records which of the item's subjects was reached, so a tester sees the specific part of a multi-screen flow the change touches rather than being told the whole flow is suspect.
- FR-049b2: A Retest mark records the chain that produced it — the changed file, the path by which it reaches the item's subject, and the length of that path — because a tester deciding whether to dismiss needs to see how the change reaches their test, not merely that something changed.
- FR-049b3: Changes that carry no import edges — database migrations, configuration, environment values, static content, and dependency upgrades — are mapped by their own rules rather than being treated as reaching nothing: a migration maps to items whose subject touches the affected tables, and a dependency upgrade maps to items depending on the modules that import it.
- FR-049b4: When a change marks a large proportion of the suite — whether by transitive reach or by a declared broad analysis — the cycle reports it as a broad change and states the files responsible. The marks still stand; this is an explanation for the team, not a suppression of them.
- FR-049c: A Retest mark records why it was applied — the changed file, fence, or unit that triggered it — so a tester can see what changed rather than being told only to test again.
- FR-049d: Impact analysis runs after the cycle's machine set has passed, not when the version appears, so testers on the promoted build are not disturbed by a release still working its way through machine testing.
- FR-049e: An item whose impact cannot be determined — no fence, no resolvable source location, or an ambiguous mapping — is marked Retest rather than left carrying its signoff.
- FR-049f: A tester may dismiss a Retest mark on an item they previously signed off, with a stated reason. The dismissal is recorded against their existing signoff, which remains current, and the item stops blocking without anyone re-performing the test.
- FR-049g: A dismissal records who dismissed it, when, the reason, and the mark it answered, and is written to the audit log. It is distinguishable from a fresh signoff and from an administrative waiver, so a release cleared by dismissals is never mistaken for one cleared by testing.
- FR-049h: A human signoff carries forward with each new version by default, whether or not that version required any re-testing, and records the version and build it was originally given against.
- FR-050: A closed cycle is retained in full and read-only, including its runs, results, and signoffs.
- FR-051: Before a release is promoted to UAT, the AI executes a regression run covering every machine item in the project, not only the items belonging to scopes the release changed.
- FR-052: The regression run compares each item against its own last recorded result — the previous time that test was actually executed — not against whatever the immediately preceding cycle happened to contain. An item not exercised for several cycles is judged against the last run that exercised it.
- FR-052a: On that basis the run reports three distinct categories: items whose last execution passed and still pass, items whose last execution passed and now fail, and items that have never passed. Only the second category is reported as a regression; the third is outstanding new work.
- FR-052b: Each reported regression names the cycle and version in which the item last passed, so the change window is bounded without anyone reconstructing it.
- FR-053: Promotion to UAT is refused while any forced machine item in the current cycle is unsigned or holds a failing result, and the refusal names them.
- FR-054: Promotion to production is refused while any forced human item in the current cycle lacks a tester signoff, and the refusal names them.
- FR-055: Each run records the environment it executed against, and a human signoff records the environment the tester was working in.
- FR-056: A cycle's state is visible at a glance: its version, whether it is open, promoted to UAT, promoted to production, or superseded, and what remains outstanding at each gate.

**Access and safety**

- FR-044: Reading a project's suite, runs, and results requires membership of that project.
- FR-045: Recording a human signoff requires membership of that project; changing force flags or recording a waiver requires administrator rights.
- FR-046: A run against a live database gate is refused unless the target database is verified as non-production.

## User Scenarios

**US1 — The suite is generated and lands somewhere real**
A developer finishes implementing a scope. The implementation flow calls the test-plan generator, which inventories the code the scope's fences authored, derives items against its requirements, and files them — forty machine items and twelve human items, in one pass. The developer opens the project's QA phase and sees the machine set: each item showing the requirement it proves and the code unit it exercises, all with no result yet. The twelve human items are recorded as pending release and are not offered to anyone.
Expected: one plan row for the scope and one item row per test, each carrying its full criteria and its executor; nothing marked passed; the QA surface shows only the machine set; the human set exists but is not yet available to testers.

**US2 — An AI run announces itself before it starts**
A team member triggers the smoke gate for that scope. Before any test executes, the QA view lists every item the run will cover, in order, marked pending.
Expected: the run is recorded as started with its total item count; the full ordered list is visible to anyone with the project open, not only to whoever triggered it.

**US3 — The team watches the run happen**
As the run proceeds, the currently executing item is highlighted with its title and the requirement it proves, and finished items fill in as passed or failed with their evidence. A second team member, who never saw the AI conversation, follows the whole run from the project view.
Expected: the current item and the running totals update as the run progresses; every completed item shows a result and the run it came from; the view needs no access to the agent.

**US3a — A regression run holds a release back**
The team is ready to promote to UAT. The AI runs every machine item in the project. Thirty-eight items whose last execution passed still pass; two that passed the last time they ran now fail, both in a scope nobody touched this release; four have never passed and are flagged as outstanding new work rather than as regressions. Promotion is refused on the two failures, each naming the version it last passed in.
Expected: the run covers the whole project, not only the changed scopes; each item is judged against its own last execution rather than against the previous cycle; the three categories are reported separately; the refusal names the two regressed items, states where each last passed, and distinguishes them from the four that were never green.

**US3b — A new version reaches only the tests it touches**
A release is in UAT with most of its human signoffs collected, and a tester is part-way through the rest. A fix to the invoicing calculation is pushed and the version bumps. The tester is not interrupted — they are working the promoted build, not the one being assembled. The new cycle's machine set runs and passes, and impact analysis then maps the changed code to the tests that cover it: three invoicing tests are marked Retest, each naming the changed unit that triggered it. The other twenty-nine human signoffs stand and are not asked for again.
Expected: no tester is stopped or interrupted; machine signoffs are all re-earned by the new cycle's run; exactly the three impacted human items lose their standing and are marked Retest with a stated reason; the remaining human signoffs carry forward; the previous cycle is retained intact.

**US4 — The human set is released only once the machine set is done**
The AI run finishes, every forced machine item is signed off, and QA is completed. At that moment the twelve human items for the scope become available and the project moves to User Testing. Before that point a tester opening the project saw nothing to do.
Expected: the human set is released as a set when QA completes, with the release time recorded; no human item is offered while the machine set is outstanding; releasing requires no manual step.

**US5 — A tester is told what to do, not what it was called**
A tester opens a released item and is shown its preconditions, its numbered steps with the expected result beside each one, and the end state to check. They follow it and record a pass.
Expected: a signoff recorded against that item naming the person and the time; the item is a human item and has no AI signoff, and none is expected of it.

**US6 — A test fails and the detail survives**
The tester follows another item and step four produces the wrong total. They record a fail and state what happened. A bug report is created in the project's existing bug queue containing the item, its steps, the expected result, what actually occurred, and a link back to the test.
Expected: the failure is stored as the item's last result; a bug report exists and is linked to the item; the item is not signed off and, if forced, blocks the phase.

**US7 — A tester adds a test the AI could not have written**
While testing, the tester finds that changing a project's phase while a timer is running produces a wrong duration — a sequence nobody specified. They add a test item describing it: what to set up, the steps, and what should have happened. It joins the suite.
Expected: the item is stored with origin recorded as user-authored and executor recorded as human, is live the moment it is saved rather than waiting on any release, is runnable and signable like any other, appears in the scope's suite, and is subject to the same force rules.

**US8 — An administrator decides what is binding**
An administrator turns force-test on for the billing scope and, within it, turns it off for three cosmetic items. In User Testing the billing items are badged as required and the three are badged optional.
Expected: the flag is stored on the scope, the three overrides on their items, both changes audited; the tester sees which items are binding before starting.

**US9 — The phase refuses to advance**
The team manager tries to complete User Testing with four forced billing items unsigned. The advance is refused and the four items are named.
Expected: advance rejected; the completion bar states the criterion that failed and lists the blocking items; non-forced unsigned items are shown as outstanding but do not contribute to the block.

**US10 — Release is held for a test added late**
Two forced items were added to a scope after QA had already been completed. At Release the project is stopped because those items were never signed off, even though every phase before it reads complete.
Expected: the release check evaluates every forced item in the project rather than only the current phase's, and the release command reports the same blocking items as the interface.

**US11 — A regression is visible as a regression**
A scope is re-tested after a change. An item that passed in the previous run now fails.
Expected: the previous result is retained in the run history, the item shows the new failure as its last result, and its AI signoff no longer counts as current for gating purposes.

## Data Requirements

All new tables follow the project's conventions: plural lowercase names with no underscores and no camel case, UUID v7 primary keys, and foreign keys named for the singular parent entity plus `id`.

**`testplans` — extended, not replaced.** The table already exists with a `specid` and two unused JSON blobs, and is referenced by the scope-delete cascade and the duplicate-scope merge. It gains the project it belongs to, a status, a source recording whether the plan was AI-generated, hand-authored, or imported, who generated it and when, an item count, the scope-level `forcetest` flag defaulting to false, and an updated timestamp. The two legacy blob columns are left in place and unused so nothing that references the table breaks. One plan per scope.

**`testplanitems` — one row per test.** Holds the plan and scope it belongs to, the project, an optional link to a task for cross-reference, and the item's stable key such as `TC-AUTH-001-N1`, which is immutable once filed and is what re-generation matches on. Carries as typed columns everything the interface filters or the gate reasons about: title, requirement reference, spec reference, code unit, authoring fence, gate, layer, variant, parent item, priority, risk tier, test level, execution tier, automation state and reference, the executor (`machine` or `human`) that determines which set the item belongs to and which gate it answers to, the origin (`ai` or `user`) recording who authored it, the released state and release time that keep a human item out of a tester's hands until QA is done, and the nullable `forcetest` override where null means inherit the plan's flag. Carries the last result status, when it was produced, and the run that produced it. The criteria the database never queries — preconditions, test data, ordered steps with their expected results, navigation flow, postconditions, exemptions, and the data-layer extension fields — are held as structured JSON, and that is what the User Testing screen renders.

**`testcycles` — one row per application version.** The container everything else hangs from. Holds the project, the version string that identifies it, its status (open, promoted to UAT, promoted to production, or superseded), when it opened and when it was promoted at each step, the commit or build reference it corresponds to where known, and who promoted it. A version the system has not seen opens a cycle on first sight, so no one has to remember to start one. One cycle per project per version.

**`testitemsubjects` — the code an item exercises.** One row per subject per item, holding the source location and the unit it names. Most items have a single subject; a flow item spanning several screens has one per screen, and impact analysis walks the graph from every one of them. Kept as rows rather than a single column on the item because it is the join impact analysis runs against on every cycle, and because "which subject was reached" is what a Retest mark has to name.

**`testruns` — one row per execution, runner-agnostic.** Modelled on the existing audit-execution table. Holds the cycle it belongs to, whether it is a regression run or a targeted one, the environment it executed against, the project, plan, and scope, the runner type (`ai-agent`, `ci`, or `manual`), a runner reference identifying the agent session or CI job, the gate covered, a status of queued, running, completed, failed, or cancelled, start and end times, the total and per-outcome item counts, the ordered list of items the run declared at start, the item currently executing, a last-heartbeat time used to detect a stalled run, and who triggered it.

**`testrunresults` — one row per item per run.** Modelled on the existing audit-results table. Holds the run, the item, the outcome status, the failure bucket, the evidence, the duration, start and end times, and, where the failure produced one, a reference to the bug report it filed. Never overwritten — this is the history that makes a regression legible, while the item's last-result columns are the denormalised current view of it.

**`testsignoffs` — one row per signoff, per cycle.** Holds the cycle it was given in, the item, the signoff type (`ai` or `user`), a status of passed, failed, or waived, the person who signed it where human, a label identifying the producer where automated, the run it derives from where applicable, notes, whether it has been superseded by a later failing result, and the time. The type must match the item's executor, which the database enforces rather than leaving to the caller — an item has one signoff, not a stack of them, and a run can never satisfy a human item. A waiver is stored here rather than as a pass, so a gate satisfied by administrative decision is always distinguishable from one satisfied by a test.

**`testretests` — one row per item marked for re-testing in a cycle.** Holds the cycle, the item, the reason the mark was applied, the changed file, fence, or unit that triggered it, whether it was applied because impact could be determined or because it could not, when it was applied, and how it was answered — by a fresh signoff, or by a tester dismissing it, in which case the dismisser, the time, and their stated reason are held here too. This is the record behind the Retest state; without it the tester is told to repeat work with no explanation of what changed.

**How the two resets work, and why they differ.** Nothing is deleted and no flag is swept when a version bumps.

A machine signoff records the cycle it was given in, and the gate asks for one *in the current cycle*. A signoff from an earlier cycle therefore does not answer the current gate — it simply isn't found, and the item reads as unsigned until this cycle's regression run proves it again. That reset is a consequence of the key rather than an operation that has to run, succeed, and be audited.

A human signoff is deliberately not keyed that way. It travels forward with each new version by default — including versions that required no re-testing at all — recording the version and build it was originally given against, and remains the item's current signoff until something invalidates it: an unanswered Retest mark for the current cycle, or a later failing run. A Retest mark answered by a tester's dismissal leaves that original signoff standing rather than replacing it. The gate asks whether the item has a standing human signoff that is neither superseded nor under an unsatisfied Retest mark. So the expensive signoff persists by default and is withdrawn only on evidence, while the cheap one is re-earned every time by default. Both rules are expressed as queries over existing rows rather than as batch mutations, so neither can half-complete and leave the project in a state nobody can explain.

**What the regression compares against.** An item's baseline is its own most recent prior result — the last cycle in which that test was actually executed — not the immediately preceding cycle. An item skipped for several cycles is judged against the last run that exercised it, which is why the results history is retained per cycle rather than collapsed.

**Relationships and cascades.** Deleting a scope removes its plan, and the plan's deletion cascades to its items; deleting an item removes its results and signoffs; deleting a run removes its results but leaves the items and their signoffs intact, with any signoff whose originating run has gone retaining its recorded label. The bug report created from a failed test is referenced by the result rather than owned by it, so the bug survives independently in the existing bug queue.

**Indexing.** Items are read by plan, by scope, and by project with a force filter; results are read by run and by item; signoffs are read by item and type. Those access paths carry indexes, since the phase gate runs this query on every completion check and every phase view render.

**Migration.** Purely additive — new tables plus new nullable or defaulted columns on an existing, effectively unused table. No existing column changes type, and no existing row requires backfill.

## API Routes

All HTTP routes sit under `/api`, require an authenticated session, and are scoped to a project the caller belongs to. Mutating routes that change force flags or record waivers additionally require administrator rights.

**Suite**

- `GET /api/projects/:projectId/testplans` — the project's plans with per-plan counts and force state; optional `?specId=` narrows to one scope.
- `GET /api/testplans/:id/items` — the plan's items with their resolved force value, last result, and current signoff state; filterable by executor, released state, gate, origin, forced, and outstanding.
- `GET /api/testplanitems/:id` — one item with its full criteria, its executor, its released state, its result history, and its signoff.
- `POST /api/testplans/:id/items` — add a test item by hand; this is the tester-authored path, and it records origin as user.
- `PATCH /api/testplans/:id` — set the scope-level force flag. Administrator only, audited.
- `PATCH /api/testplanitems/:id` — set or clear an item's force override, or edit a user-authored item's criteria. Force changes are administrator only and audited.

**Runs**

- `POST /api/testruns` — start a run for a plan or scope at a given gate; returns the run together with the ordered list of items it will execute.
- `GET /api/testruns/:id` — the live snapshot: run status, totals, the item currently executing, and every item's outcome so far. This is what the QA view reads while a run is in progress.
- `GET /api/projects/:projectId/testruns` — run history, newest first.
- `PATCH /api/testruns/:id` — heartbeat; sets the current item and the run status.
- `POST /api/testruns/:id/results` — report one item's outcome; updates the item's last result and the run's totals.
- `POST /api/testruns/:id/complete` — close the run as completed, failed, or cancelled.

**Signoffs and gating**

- `POST /api/testplanitems/:id/signoff` — record a human pass or fail. A fail requires a reason and files a bug report through the existing bug pipeline, returning its identifier.
- `POST /api/testplanitems/:id/waive` — administrator waiver of a forced signoff, with a required reason. Audited.
- `GET /api/projects/:projectId/testcycles` — cycle history with each version's status, gate state, and outstanding counts; the current cycle is resolved from the application version.
- `GET /api/testcycles/:id/regression` — the three-way comparison, each item judged against its own last execution: still passing, newly failing (with the version it last passed in), never passed.
- `GET /api/testcycles/:id/retests` — the human items marked Retest in this cycle, each with the change that triggered the mark and how it was answered, if it has been.
- `POST /api/testretests/:id/dismiss` — the tester dismisses a Retest mark on an item they previously signed off, with a required reason. Their original signoff stands. Audited.
- `POST /api/testcycles/:id/analyze-impact` — the runner posts the commit under test, the changed files, and either their transitive dependents with representative paths or a declaration that the analysis is broad. The application verifies the commit, walks each item's declared subjects against the set, and applies Retest marks. Invoked automatically once the machine set passes; exposed so it can be re-run or previewed without applying. Refuses a request carrying no graph, and one whose commit does not match the cycle under test.
- `GET /api/projects/:projectId/testgate` — the gate verdict for a given requirement level (AI, human, or all) **within the current cycle**, listing the forced items that are unsigned. Consumed by the phase views, the phase advance check, and the release commands, so all three read one answer.

**Orchestrator tools**

The kit and the AI runner reach the same behaviour through the project MCP server, each tool registered in the permission matrix as well as the tool list:

- `project.upsert_test_plan` — file or update a scope's plan and items from a generated suite.
- `project.start_test_run` — start a run; returns the ordered item list the runner is expected to narrate.
- `project.report_test_progress` — set the current item and report an item's outcome.
- `project.complete_test_run` — close the run with its final totals.
- `project.sign_off_test` — record an AI signoff for an item proved by a run.
- `project.report_change_impact` — the runner posts the changed files and the transitive dependent sets it computed, and receives back what was marked.
- `project.test_gate_status` — the same verdict as the HTTP gate route, for the release commands.

**Existing routes affected**

The phase completion and phase advance endpoints gain test criteria in their responses and refuse advancement on unsigned forced items; the bug-report creation path gains an optional originating test item. No existing route changes shape in a way that breaks a current caller.

## Frontend Components

All components follow the project's existing React, Tailwind, and shadcn conventions, render in light and dark themes, and carry translated strings in all six supported locales.

**Test suite panel (QA phase).** Replaces the flat task list in the QA phase view. Lists the scope's machine items grouped by gate, each row showing its key, title, the requirement it proves, priority and risk chips, its origin, whether it is forced, and its last result with the run and time that produced it. Filters for outstanding, forced-only, failing, and origin. A run control starts a run at a chosen gate. The human set is shown only as a count of what is waiting to be released, so the team can see it exists without being able to act on it yet.

**Live run view.** Rendered inside the suite panel while a run is active. On start it shows the full ordered list the run declared, every item pending. It highlights the item currently executing with its title and requirement, fills in outcomes as they arrive, and shows the running totals and elapsed time. It refreshes on a short interval using the same fetch-and-poll pattern the audit execution panel already uses, and it stops polling when the run closes. A stalled run is shown as stalled rather than as running.

**Run history.** Previous runs for the scope with their gate, runner, environment, totals, and duration; opening one shows that run's per-item outcomes.

**Cycle header.** Present above both phase panels: the current version, the cycle's state (open, in UAT, in production, superseded), and what is outstanding at each gate. When a new cycle applies Retest marks it states how many human signoffs stood and how many were withdrawn, so the change reads as a deliberate, bounded action rather than as work mysteriously disappearing.

**Retest badge, reason, and dismissal.** A human item under a Retest mark is badged distinctly from one never signed — the tester has done this before and is being asked again for a reason, and the reason is shown with it: the unit or fence that changed. Retest items sort to the top of the tester's list, since they are the shortest path back to a promotable release. Alongside the pass and fail controls sits a dismiss control: the tester states why the change could not have affected what they verified, their original signoff stands, and the item stops blocking. A dismissed mark renders as dismissed, never as a fresh pass.

**Regression view.** The pre-UAT comparison against the previous cycle in three groups: still passing, newly failing, and never passed. Newly failing items are the ones that block, and they lead with the cycle the item last passed in, so the change window is obvious.

**User test panel (User Testing phase).** Replaces the flat task list in the User Testing phase view. Lists the released human items awaiting signoff, required ones first and clearly badged as binding, optional ones badged as skippable. Before release it states plainly that the machine set is still running and shows nothing to work on, so a tester is never left guessing whether their list is empty or merely not ready. Selecting an item opens its criteria: preconditions as a checklist, the numbered steps in a table with the expected result beside each action, the navigation flow where the item has one, and the postconditions to verify. Pass and fail controls sit with the criteria.

**Failure capture.** Recording a fail requires the tester to state what actually happened, and shows them that a bug report will be created. On submission it confirms the report was filed and links to it in the existing bug queue.

**Add-a-test dialog.** Opened from the user test panel. Captures a title, preconditions, ordered steps each with an expected result, and postconditions, with the same guidance the generated items follow — an expected result must state a value, a count, a status, a screen assertion, or an absence, not that something "works". The saved item appears in the suite marked as tester-authored.

**Force controls.** A force-test switch on the scope, visible to everyone and operable only by an administrator, with a per-item override control in both panels. Both show their current inherited or overridden state plainly, so a tester can see why an item is binding.

**Waiver control.** Administrator-only, on a blocking item, requiring a reason, and rendering afterwards as waived rather than as passed.

**Phase completion bar.** Reused unchanged. The new gate criteria arrive through the existing criterion and blocking-item structure, so the bar already renders which forced tests are holding the phase and shows the advance button disabled until they clear.

## Constraints & Notes

**Database safety is the sharpest constraint here.** The repository's local environment points at the production database, and the hosted orchestrator currently shares that same instance. A gate that executes real writes therefore cannot run until a database exists whose host differs from production. This scope defines how such a run is recorded and requires that it be refused otherwise; it does not resolve the underlying environment problem. Runs at the mocked and read-only tiers are unaffected.

**The browser-driven gate has an unmet prerequisite.** No browser test runner is currently a development dependency and no root configuration exists for one, so navigation-flow items can be stored, displayed, and signed off by hand but cannot execute automatically until that is added. It is a small, separable prerequisite rather than a design problem.

**The version bump is automatic, and selective invalidation is what makes that safe.** The application version is bumped by a pre-push hook on every push to main, so every push opens a cycle. That would be punishing if a cycle wiped all testing — a documentation or marketing push would discard human signoffs for a change that cannot affect behaviour. It does not, because human signoffs are withdrawn only where the change reaches the code a test covers. A push touching no application code marks nothing for Retest, so the cycle opens, the machine set re-runs, and no tester is asked to repeat anything. The automatic bump therefore needs no exception list, and the cost of a cycle scales with what actually changed.

**Transitive impact is the deliberate choice, and it errs wide.** Following the dependency graph transitively catches the case that matters most: a change deep in a service reaching a test driven from a screen several layers above it, which a direct file match would miss entirely and pass off as still-verified. The cost is the opposite error — a change to a widely-imported module reaches a large share of the suite and marks it. That is accepted rather than engineered around, because the two errors are not symmetric. An under-mark ships a defect under a green human signoff and has no recovery; an over-mark costs one dismissal with a reason, which the tester can give in seconds. The graph is read from the code, so it cannot drift the way hand-maintained dependency declarations do.

**Not everything that changes behaviour has an import edge.** Migrations, configuration, environment values, static content, and dependency upgrades change what the product does while appearing nowhere in the module graph. Each needs its own mapping rule, and those rules are weaker than the import graph — a migration is matched to items by the tables it alters, which depends on items naming their tables accurately. This is the part of impact analysis most likely to under-mark, and it is worth building the migration rule first, since schema changes carry the highest consequence.

**The existing table must keep working.** `testplans` is referenced today by the scope-delete cascade and by a raw-SQL reassignment in the duplicate-scope merge. Extension must leave both paths intact, which is why the change is additive and the legacy columns stay.

**The item contract is owned elsewhere.** The field definitions, variant rules, gate-and-tier consistency rules, and data-layer extension come from the generation skill's reference material. This scope persists that contract; if it changes there, the storage follows rather than diverging.

**Orchestrator tools need two registrations.** A new tool added to the tool list but not to the permission matrix is reported as an unknown tool at call time. Both entries are required for each of the six new tools.

**Everything ships through the orchestrator.** All code is authored through the implementation flow so that fences are written by the orchestrator and never by hand; unfenced new code is a defect. The command-line orchestrator is currently unreliable, so the work runs in-conversation or through the direct call transport.

**Shipping is three channels, not one.** Because the generation skill and its command change alongside the application, delivery covers the application, a kit release, and a rebuilt extension. Shipping only the application would leave the skill filing into the old structure.

**Standing project rules apply without exception:** TypeScript throughout with no escape hatches, structured logging only, plural lowercase table and column names with no underscores, UUID v7 keys, migrations generated rather than hand-written, and translated strings in all six locales. There are two migration directories in this repository, so migration work must name absolute paths.

**Vocabulary.** *Waived* means an administrator released a gate without a passing test and is never rendered as a pass. *Superseded* describes a signoff invalidated by a later failing run and is never deleted. Neither term collides with *archived*, which belongs to the scope-archival mechanism.
