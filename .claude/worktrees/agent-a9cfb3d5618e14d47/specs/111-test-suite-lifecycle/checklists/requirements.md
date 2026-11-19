# Requirements checklist: Test Suite Lifecycle

**Spec**: 111 — Test Suite Lifecycle
**Scope**: SCOPE-111 (`specs/Project-Scope/111-test-suite-lifecycle.md`)
**Spec ID**: `f5552f9a-e581-46d1-8cdf-6e09569d1b22`
**Status**: planned
**Phase**: design
**Created**: 2026-07-25

---

83 functional requirements. Each is checked when implemented **and** covered by a test
that would fail without it.

- [ ] **FR-001** — The system stores one test plan per scope, owning that scope's test items and carrying the administrator's force-test default.
- [ ] **FR-002** — The system stores one row per test item, retaining its stable key, title, requirement reference, spec reference, code unit, source location, and authoring fence.
- [ ] **FR-003** — Each item retains its gate, layer, variant, parent item, priority, risk tier, test level, execution tier, automation state, and automation reference as queryable values, not as text.
- [ ] **FR-004** — Each item retains its full criteria — preconditions, test data, ordered steps each with its own expected result, navigation flow where applicable, postconditions, exemptions, and the database extension fields for data-layer items — in a form the interface renders and a runner consumes.
- [ ] **FR-005** — Each item records its executor as either machine or human, and an item belongs to exactly one of the two sets.
- [ ] **FR-005a** — Each item separately records its origin as either AI-generated or user-authored, which is independent of its executor.
- [ ] **FR-005b** — A human item records whether it has been released to testers and, once released, when and by which event.
- [ ] **FR-006** — Each item retains its last result status, when it was produced, and which run produced it.
- [ ] **FR-007** — Re-generating a scope's suite updates existing items by their stable key and adds new ones without destroying accumulated results or signoffs.
- [ ] **FR-008** — Deleting a scope removes its plan, items, runs, results, and signoffs.
- [ ] **FR-009** — A run is recorded independently of who executes it, naming the runner type, a runner reference, the gate covered, and the scope or plan in question.
- [ ] **FR-010** — Starting a run returns the ordered list of items that run will execute, and that list is stored with the run.
- [ ] **FR-011** — A run records which item is executing at the current moment, and that value is readable by any project member while the run is in progress.
- [ ] **FR-012** — A run maintains its status and running totals of passed, failed, skipped, and blocked items as results arrive.
- [ ] **FR-013** — Each item result is stored per run with its status, its failure bucket, its evidence, and its duration, and previous runs' results are never overwritten.
- [ ] **FR-014** — Reporting a result updates the item's last-result fields to point at that run.
- [ ] **FR-015** — A run can be completed, failed, or cancelled, and a run left without events beyond a defined interval is reported as stalled rather than running.
- [ ] **FR-016** — The run API accepts events from any authenticated runner, requiring no change to admit a CI runner alongside the AI runner.
- [ ] **FR-017** — Each item carries exactly one signoff, given by its own executor: a machine item is signed by the run that proved it, a human item by the person who performed it.
- [ ] **FR-018** — A signoff of a type that does not match the item's executor is refused — a person cannot sign off a machine item, and a run cannot sign off a human item.
- [ ] **FR-019** — Each signoff records its status, who or what produced it, a label identifying the producer, the run it derives from where applicable, free-text notes, and the time.
- [ ] **FR-020** — An AI signoff may only be recorded against an item whose result in the referencing run was a pass.
- [ ] **FR-021** — A human signoff records the identity of the person who gave it.
- [ ] **FR-021a** — When a newer run produces a failing result for an item, that item's existing signoff ceases to count as current for gating purposes, and the interface shows it as superseded rather than deleting it.
- [ ] **FR-021b** — The human set is released to testers on promotion of the release to UAT — the point at which the machine set and the regression gate have both been satisfied. Release happens for the set as a whole and requires no manual step.
- [ ] **FR-021c** — An unreleased human item is not offered to a tester, is not signable, and is not counted as outstanding against the QA gate.
- [ ] **FR-022** — The User Testing surface presents each released item's preconditions, numbered steps with their expected results, and postconditions, rather than a task title.
- [ ] **FR-023** — A tester records a pass or a fail against an item, producing a human signoff.
- [ ] **FR-024** — A fail cannot be recorded without a stated reason describing what actually happened.
- [ ] **FR-025** — Recording a fail creates a bug report in the project's existing bug queue containing the item, its steps, the expected result, the stated actual result, and a reference back to the item.
- [ ] **FR-026** — A tester can add a new test item to a scope's suite, supplying at minimum a title, preconditions, ordered steps with expected results, and postconditions.
- [ ] **FR-027** — A tester-authored item is stored, displayed, run, signed off, and gated identically to a generated item, and is visually distinguishable by origin.
- [ ] **FR-027a** — A tester-authored item is a human item and is live on creation — it is immediately visible, runnable, and signable without waiting for a release, since the set it joins has already been released. Release governs only the set authored at generation time.
- [ ] **FR-028** — The tester sees, before starting, which items are binding and which are optional.
- [ ] **FR-029** — Each scope carries a force-test flag defaulting to off.
- [ ] **FR-030** — Each item may override its scope's flag in either direction, and an item with no override inherits the scope's value.
- [ ] **FR-031** — Only an administrator may change a scope's flag or an item's override.
- [ ] **FR-032** — Every change to a flag or override is written to the audit log with the actor, the previous value, and the new value.
- [ ] **FR-033** — An administrator may waive a specific forced signoff, which is recorded as a waiver naming the actor and reason, is audited, and satisfies the gate without being reported as a pass.
- [ ] **FR-034** — The QA phase cannot be advanced while any forced machine item lacks a current AI signoff or holds a failing last result. Human items are not considered at this gate.
- [ ] **FR-035** — The User Testing phase cannot be advanced while any forced released human item lacks a current tester signoff. Machine items are not re-checked at this gate.
- [ ] **FR-036** — The Release phase cannot be completed while any forced item of either kind anywhere in the project is unsigned, regardless of which phase it belongs to.
- [ ] **FR-037** — A refused advance names the specific items that blocked it.
- [ ] **FR-038** — Items that are not forced are reported as outstanding but never prevent an advance.
- [ ] **FR-039** — The release commands evaluate the same gate as the interface, from the same source, so the two cannot report different outcomes.
- [ ] **FR-040** — The test-plan generator files its output into this structure rather than into generic task rows, authoring the machine set and the human set in a single pass and marking each item's executor.
- [ ] **FR-041** — The generator's execute mode operates only on machine items: it starts a run, reports each item as it executes it, completes the run, and records AI signoffs for the items it proved.
- [ ] **FR-042** — The narration a person sees in the AI conversation and the state shown in the project view derive from the same run record.
- [ ] **FR-043** — A test item may be linked to a task for cross-reference without a task being required for the item to exist.
- [ ] **FR-047** — A test cycle is the unit that testing belongs to, and every run, result, and signoff records the cycle it was produced in.
- [ ] **FR-048** — The application version identifies the cycle. A version the system has not seen before opens a new cycle automatically, with no separate act required to start one.
- [ ] **FR-049** — No machine signoff carries across cycles. Every cycle re-earns them through its regression run, so a machine item is unsigned in a new cycle until that cycle's run proves it.
- [ ] **FR-049a** — A human signoff carries forward into a new cycle unless the change is determined to reach the code that item covers, in which case the item is marked Retest for that cycle and its carried signoff stops counting.
- [ ] **FR-049b** — Impact is determined by following the module dependency graph transitively. An item is marked when the subject it records — its source location, code unit, or authoring fence — depends, directly or through any chain of imports, on a file the release changed. An item with no such path to any changed file is not marked.
- [ ] **FR-049b1** — The graph is derived from the code itself rather than from hand-maintained declarations, so it cannot drift from reality as scope documents can.
- [ ] **FR-049b1a** — The graph is produced by the runner, which is the only party holding the code, and posted with the impact request. The application never reads a repository.
- [ ] **FR-049b1b** — The runner posts the files the release changed and, for each, the set of files that transitively depend on it together with a representative path from the change to each dependent. Computing reachability stays with the runner; deciding what that means for testing stays with the application, which owns the gate.
- [ ] **FR-049b1c** — An impact request that arrives without a graph is refused rather than treated as no impact, since silence and "nothing was affected" must never be the same answer.
- [ ] **FR-049b1c1** — The graph carries the commit it was computed from, and the application refuses it when that commit does not match the one under test. A graph computed against different code marks the wrong items, and without this check nothing downstream can detect it.
- [ ] **FR-049b1c2** — When the dependent set would be oversized, the runner posts the changed files alone and declares the analysis broad. The application then treats every human item as reached rather than inferring that nothing was, and records the mark's reason as a broad change naming the files responsible. Truncating a dependent set silently is never permitted — the choice is a complete set or a declared broad change.
- [ ] **FR-049b1d** — An item declares one or more subjects — the code locations it exercises. A flow item spanning several screens declares each of them. The graph is walked from every subject an item declares, and an item is marked if any one of them is reached.
- [ ] **FR-049b1e** — A Retest mark records which of the item's subjects was reached, so a tester sees the specific part of a multi-screen flow the change touches rather than being told the whole flow is suspect.
- [ ] **FR-049b2** — A Retest mark records the chain that produced it — the changed file, the path by which it reaches the item's subject, and the length of that path — because a tester deciding whether to dismiss needs to see how the change reaches their test, not merely that something changed.
- [ ] **FR-049b3** — Changes that carry no import edges — database migrations, configuration, environment values, static content, and dependency upgrades — are mapped by their own rules rather than being treated as reaching nothing: a migration maps to items whose subject touches the affected tables, and a dependency upgrade maps to items depending on the modules that import it.
- [ ] **FR-049b4** — When a change marks a large proportion of the suite — whether by transitive reach or by a declared broad analysis — the cycle reports it as a broad change and states the files responsible. The marks still stand; this is an explanation for the team, not a suppression of them.
- [ ] **FR-049c** — A Retest mark records why it was applied — the changed file, fence, or unit that triggered it — so a tester can see what changed rather than being told only to test again.
- [ ] **FR-049d** — Impact analysis runs after the cycle's machine set has passed, not when the version appears, so testers on the promoted build are not disturbed by a release still working its way through machine testing.
- [ ] **FR-049e** — An item whose impact cannot be determined — no fence, no resolvable source location, or an ambiguous mapping — is marked Retest rather than left carrying its signoff.
- [ ] **FR-049f** — A tester may dismiss a Retest mark on an item they previously signed off, with a stated reason. The dismissal is recorded against their existing signoff, which remains current, and the item stops blocking without anyone re-performing the test.
- [ ] **FR-049g** — A dismissal records who dismissed it, when, the reason, and the mark it answered, and is written to the audit log. It is distinguishable from a fresh signoff and from an administrative waiver, so a release cleared by dismissals is never mistaken for one cleared by testing.
- [ ] **FR-049h** — A human signoff carries forward with each new version by default, whether or not that version required any re-testing, and records the version and build it was originally given against.
- [ ] **FR-050** — A closed cycle is retained in full and read-only, including its runs, results, and signoffs.
- [ ] **FR-051** — Before a release is promoted to UAT, the AI executes a regression run covering every machine item in the project, not only the items belonging to scopes the release changed.
- [ ] **FR-052** — The regression run compares each item against its own last recorded result — the previous time that test was actually executed — not against whatever the immediately preceding cycle happened to contain. An item not exercised for several cycles is judged against the last run that exercised it.
- [ ] **FR-052a** — On that basis the run reports three distinct categories: items whose last execution passed and still pass, items whose last execution passed and now fail, and items that have never passed. Only the second category is reported as a regression; the third is outstanding new work.
- [ ] **FR-052b** — Each reported regression names the cycle and version in which the item last passed, so the change window is bounded without anyone reconstructing it.
- [ ] **FR-053** — Promotion to UAT is refused while any forced machine item in the current cycle is unsigned or holds a failing result, and the refusal names them.
- [ ] **FR-054** — Promotion to production is refused while any forced human item in the current cycle lacks a tester signoff, and the refusal names them.
- [ ] **FR-055** — Each run records the environment it executed against, and a human signoff records the environment the tester was working in.
- [ ] **FR-056** — A cycle's state is visible at a glance: its version, whether it is open, promoted to UAT, promoted to production, or superseded, and what remains outstanding at each gate.
- [ ] **FR-044** — Reading a project's suite, runs, and results requires membership of that project.
- [ ] **FR-045** — Recording a human signoff requires membership of that project; changing force flags or recording a waiver requires administrator rights.
- [ ] **FR-046** — A run against a live database gate is refused unless the target database is verified as non-production.

## Open questions still unresolved

These are carried from the scope and are not blockers for the data layer, but each one changes
behaviour further up the build:

- **What threshold makes an analysis broad.** A runner declaring breadth marks every human item, so the threshold is the difference between a targeted release and one that re-tests everything. Is it a fixed dependent count, a proportion of the codebase, a payload size, or the runner's own judgement — and does the application get a say, given it can see how many items the declaration will actually cost?
- **Whether dismissals should be visible as a release-quality signal.** A tester can dismiss a Retest mark, which is the right escape valve for an over-marked release. But a release cleared largely by dismissals has had less human verification than its green state suggests. Should the count of dismissals be surfaced at the promotion gate, and is there a level at which it should require an administrator to look?
- **Items whose code disappears.** Re-generation matches on the item key, so an item whose underlying route, table, or screen no longer exists will simply stop being regenerated while its row remains. Should such an item be detected and marked obsolete, be removed, or be left for a person to judge?
- **The default force state of a tester-authored test.** A tester adds a test because something went wrong in real use, which is an argument for it being binding by default. But it also lets any tester create a release blocker. Should a user-authored item default to forced, default to optional, or require an administrator to decide before it can block?
- **Whether a waiver survives a later failing run.** A waived item that subsequently fails a run is in an ambiguous state: the administrative decision was made against an earlier situation. Does the waiver persist, lapse on any new failing result, or lapse only when the failure differs from the one waived?
- **Where project-wide tests live.** Some items — cross-cutting security, navigation, or database-integrity checks — belong to no single scope. Do they attach to a designated project-level plan, to the scope that most closely owns them, or is a scope-less plan permitted?
- **Whether non-forced failures should be visible at Release.** Non-forced items never block by design. Should a failing non-forced item nevertheless be surfaced at the Release gate as a warning that must be acknowledged, or stay entirely silent?
- **Runner authentication for CI.** The run API is runner-agnostic, but a CI job needs credentials of some kind. Does it use a project API token like the orchestrator, a dedicated runner token, or is that deferred until a CI runner actually exists?
