# Tasks: Spec 136 — wxG-O-D Development Process Manager

**Spec**: `specs/136-wxgod-development-manager/spec.md`
**Scope**: `specs/Project-Scope/136-wxgod-development-manager.md` (SCOPE-136)
**Date Generated**: 2026-10-03
**Total**: 51 tasks (4 done before this spec; T042 to T051 added by Amendment A, 2026-10-19)

> FR-001 to FR-004 were built in commit `64738521` and verified in the tree on 2026-10-03:
> recursive registry builder with `prebuild`, nested-key registry test, byte-identical thin
> commands, stub plus three scripts. The hosted deploy probe (T006) is still open.
>
> `[~]` = written into the method or skill on 2026-10-03 and in progress: not yet exercised by a
> real `/wxG-O-D` run (T029 does that).

---

## Phase A — Hosted delivery (FR-001 to FR-004)

- [x] **T001** — Serve the method under key wxgod (FR-001) *(critical)*
  project.get_command_prompt('wxgod') returns the full method from mcp-server/src/prompts/wxgod.md; the stub SKILL.md and thin command carry no method step; lapsed subscriber gets the entitlement refusal; unreachable MCP gives the standard 'MCP not connected' guidance. Done in commit 64738521, verified in tree 2026-10-03.

- [x] **T002** — Serve the eight references by path key (FR-002) *(critical)*
  mcp-server/src/prompts/wxgod/references/{god-persona,new-project,review-and-brainstorm,document-templates,interview,database-options,data-integrity,flow-diagrams}.md served as wxgod/references/<name>; flat keys resolve to nothing; plan mode never fetches new-project. Done in commit 64738521.

- [x] **T003** — Registry builder walks subfolders (FR-003) *(high)*
  mcp-server/scripts/build-prompts.mjs keys every .md under src/prompts/ by forward-slash path without extension; mcp-server/tests/prompts/registry.test.ts covers the nested wxgod/references keys; prebuild regenerates on deploy. Done, verified 2026-10-03.

- [x] **T004** — Kit ships stub, three scripts, byte-identical command (FR-004) *(high)*
  .claude/skills/wxG-O-D/ holds SKILL.md stub and scripts/{inventory,machine-capacity,estimate-ai-time}.mjs; .claude/commands/wxG-O-D.md and _wxAI/commands/wxG-O-D.md are byte-identical; scripts/sync-to-orchestrator.mjs allowlists wxG-O-D. Done, verified 2026-10-03.

- [ ] **T005** — List wxgod in the get_command_prompt tool description *(medium)*
  One-line edit to the project.get_command_prompt tool description in mcp-server/src/server.ts so the advertised key list includes wxgod and the wxgod/references/<name> path form (API Routes section). Not yet made as of 2026-10-03.

- [ ] **T006** — Post-deploy probe and release-asset diff (SC-1, SC-2) *(high)*
  After the hosted MCP redeploy, probe get_command_prompt with wxgod and one reference key (the App Runner silent-rollback risk) before announcing. Diff the published kit release asset: no references/ folder, no method text, only stub + 3 scripts + command.

## Phase B — Plan mode (FR-005 to FR-009)

- [ ] **T007** — Inventory contract: exclusions, secrets by path, --dir validation (FR-005) *(high)*
  inventory.mjs honors .gitignore, skips kit files and build output, lists secret files by path only (never opened), stops on a missing --dir folder, and writes docs/GOD-Inventory.json recording every exclusion and its reason. Method text in wxgod.md states the contract.

- [ ] **T008** — Cited, confidence-labeled findings and verbatim intake reports (FR-006) *(high)*
  Method requires every finding to carry a file citation or one of Confirmed, Likely, Assumed, Unknown, Conflicting, Deprecated; a finding with neither is a defect. Intake helper reports are saved verbatim under docs/GOD-Intake/ so a cleared context loses none.

- [ ] **T009** — Plain-text section review at the user's level (FR-007) *(high)*
  Four finding sections reviewed one at a time at amateur/junior/senior, no choice menus, nothing written until a section summary is approved; docs/GOD-Scratchpad.md mirrors the chat only; each approved summary records plan-only vs plan+scope+specs routing.

- [ ] **T010** — Deterministic estimate and team-size sweep (FR-008, SC-4) *(high)*
  machine-capacity.mjs sets the machine maximum; estimate-ai-time.mjs schedules every team size and reports the quickest team and the machine maximum with a recommendation; a cycle or unknown dependency fails the run; --cap=<n> is the user's limit and --cap=1 the serial switch. Same GOD-Estimate-Input.json gives byte-identical GOD-Estimate.md on 2 runs.

- [ ] **T011** — Database/hosting recommendation, ERD, four documents as MD and PDF (FR-009, SC-3) *(high)*
  All three hosting columns (internal office, cloud, distributed) filled before one is recommended; ERD with referential-integrity suggestions; customer plan, management plan, roadmap, flows rendered to PDF; a Mermaid parse failure fails its render; redaction scan shows 0 credential values or personal data in documents or chat.

## Phase C — Roadmap fold-in (FR-010, FR-011)

- [~] **T012** — Fold the dev-plan roadmap and renderer into G.O.D. (FR-010) *(high)*
  Move the START HERE orientation, per-phase exit gates, plan-template (.claude/skills/dev-plan/references/plan-template.md -> hosted wxgod reference) and build-devplan-pdf.mjs (-> .claude/skills/wxG-O-D/scripts/) under G.O.D.; /wxG-O-D writes docs/DEVELOPMENT-PLAN.md and its PDF with no separate skill. SCOPE-081 server devplan document unchanged.

- [~] **T013** — Retire dev-plan skill; /dev-plan becomes a one-release alias (FR-011) *(medium)*
  Remove the dev-plan skill from the kit allowlist in scripts/sync-to-orchestrator.mjs; .claude/commands/dev-plan.md and _wxAI/commands/dev-plan.md become a byte-identical thin alias that prints one deprecation line naming /wxG-O-D and runs G.O.D.'s roadmap step; help catalog and Cockpit list mark it deprecated.

## Phase D — New-project mode and --create (FR-012 to FR-016)

- [ ] **T014** — Overview review and brainstorm offer (FR-012) *(high)*
  Given ProjectOverview.md, G.O.D. reviews it, asks whether the project is new, offers a brainstorm (--brainstorm skips the offer); every decision dated in docs/GOD-Brainstorm.md; nothing but the scratch pad is written during the brainstorm.

- [ ] **T015** — Design expansion and scope map in build order (FR-013) *(high)*
  Roles, data model and ERD, screens, integrations, architecture, database, a scope map in build order and one scope draft per scope; each feature marked stated-by-user or proposed-by-G.O.D.; docs/GOD-Design-Summary.md carries the numbered discussion list.

- [~] **T016** — --create executes the development plan (FR-014) *(critical)*
  One design review pause, then phase by phase and unit by unit in dependency order: buildscope, validateScope, createSpecs, implement with its test plan, phase exit gate. No unit starts before its dependencies' gates pass; each unit's status flips in docs/DEVELOPMENT-PLAN.md; run ends at the last exit gate. Without --create, today's ask-then-go behavior stays.

- [ ] **T017** — Orchestrate-never-substitute guard (FR-015, SC-5) *(critical)*
  Method forbids G.O.D. writing scopes, specs, tasks, test plans or code, answering a gate, adding --quick, advancing the lifecycle stage, or pushing; a known kit gap is surfaced, never worked around. End-of-run check confirms every artifact in specs/ and src/ traces to its own command.

- [~] **T018** — Checkpoint and --resume (FR-016, SC-7) *(critical)*
  docs/GOD-State.json written at every unit and gate (mode, level, phase, unit, gate, next action, per-scope design choice); the user is asked to clear context and run --resume; resume continues at the exact unit and gate with no unit repeated or skipped.

## Phase E — Parallel implementation (FR-017, FR-018)

- [x] **T019** — Implement verifies the named spec (FR-017) *(critical)* — done by SPEC-123 (kit v1.7.72, `f2088e82`): resolveScopeVerification in core/policy/resolve-spec-verification.ts
  wxkanban-agent/core/policy/resolve-spec-verification.ts takes the spec number being implemented and checks that spec's tasks and documents, instead of requiring exactly one spec in planned/tasks_generated/implementing (68 such specs exist today). mcp-adapter.ts passes the number. Two implementing specs do not block; a spec with no tasks or documents still blocks.

- [x] **T020** — Amend SPEC-030 FR-004 and its tests (FR-017) *(high)* — done 2026-10-04: SPEC-030 FR-004 amendment block; tests in tests/unit/policy/mcp-adapter.test.ts
  Update specs/030-*/spec.md FR-004 text and the corner-case rows in wxkanban-agent/tests/unit/policy/mcp-adapter.test.ts and wxkanban-agent/tests/unit/mcp-adapter.test.ts: multiple active specs no longer block; a missing named spec, no tasks, or no documents still block.

- [~] **T021** — Plan-governed concurrency (FR-018, SC-6) *(high)*
  G.O.D. runs independent units in parallel up to min(machine maximum, --cap) and holds dependent units until predecessors' gates pass; two units sharing a dependency edge never implement together; the estimate sweep and the run use the same dependency graph; --cap=1 forces serial.

## Phase F — Bridge, KAIN and defects (FR-019 to FR-022)

- [~] **T022** — Bridge offer when configured (FR-019) *(medium)*
  When the repo .env carries YAPPCHATT_ROOM/EMAIL/TOKEN and the wxkanban-agent remote launcher exists, offer once per run to continue under the Remote Session Bridge; declining keeps the in-editor run with checkpoints.
  *Amended 2026-10-28 (SCOPE-149 FR-018, SPEC-150 T010): the plain bridge is retired; the offer now checks `.wxai/remote-session.lock` for a project agent and hands over with HANDOFF REMOTE (next step `/wxG-O-D --resume`).*

- [~] **T023** — G.O.D. drives, KAIN relays (FR-020) *(medium)*
  KAIN relays every gate question and extra-action request to the phone and carries the answer back, never answering or taking the plan over; STATUS reports phase, unit and gate from GOD-State.json; one driver per working tree (SCOPE-132 FR-026).

- [~] **T024** — Inherited bridge rules: seed, kill switch, push grant (FR-021, SC-8) *(high)*
  Minimal seed, CANCEL REMOTE kill switch, and no push without a recorded grant through KAIN's gate apply unchanged; a push without a grant is refused and reported, never silently retried.

- [~] **T025** — Stop and report on a run defect (FR-022) *(high)*
  On a script failure or a method contradiction G.O.D. stops at that step, states exactly what failed, asks the developer to report it through Cockpit feedback (wxKanban Dev project, SCOPE-043), never improvises, and records the stop point in GOD-State.json for resume after the fix.

## Phase G — Style and screens (FR-023, FR-024)

- [~] **T026** — One style type for all screens (FR-023) *(medium)*
  At the end of the brainstorm, before build approval, offer one style type from the wx-design-skill named-style catalog or a SCOPE-114 company design system; record it in stack.md Look & Feel through the Stack & Style document; ask once per run; declining keeps the current look and feel.

- [~] **T027** — Design-or-build choice per screen-bearing scope (FR-024, US7) *(medium)*
  At the brainstorm ask, per screen-bearing scope, wxDesigner design vs let-it-build; run wxDesigner after that scope's createSpecs and before its implement; note conversion screen evidence paths; record choice, outcome and saved page.md path in the scope map and GOD-State.json so --resume never re-asks.

## Phase I — Commercial, delivery, and projected cost (FR-025, FR-026)

- [~] **T030** — Commercial and delivery questions open the brainstorm or review (FR-025, US8, US9) *(medium)*
  One shared definition in review-and-brainstorm.md § Commercial and delivery: commercial-or-not, then web-based-or-installed, plain text, pre-filled from the evidence. New-project mode asks them as N2b agenda items 1-2 (interview NP7/NP5/NP8 when skipped) and turns the commercial and installed-app items into Proposed features; plan mode asks them before review section 1 (interview PD1-PD3 when unsettled), cites present items in section 1, suggests missing ones in section 2, and lists a delivery change as a decision with an ADR. GOD-State.json records `commercial` and `delivery` in both modes.

- [~] **T031** — Projected SaaS cost document (FR-026, US8, US9) *(medium)*
  Either mode, web-based systems (plan mode: step 6; new-project: N5). database-options.md § Projected SaaS cost: optional Today column for an existing hosted system; size at launch and 12 months, bill of materials, rule out non-qualifying providers, research live list prices with source and date, price single providers and same-region mixes, keep the five lowest plus AWS, one ★ Recommended, no prices from memory. document-templates.md § 5 is the template; the customer document keeps cost tiers.

## Phase J — Business rules (FR-027, FR-028)

- [~] **T032** — Extract every business rule from existing code (FR-027, US10) *(high)*
  New reference wxgod/references/business-rules (ninth key; registry test updated): what counts as a rule, exhaustive slice-by-slice extraction from conversion output and ordinary code with a 100% coverage table, checkpointed via `rulesExtraction` in GOD-State.json, merged into docs/GOD-Business-Rules.md (BR- IDs, citations, enforced-in, confidence, disposition). Review becomes five sections with Business rules as section 2, decisions first and ordinary rules approved as a group. Rules to change become work with BR- IDs in acceptance criteria.

- [~] **T033** — Best-practice business rules in every mode (FR-028, US10) *(medium)*
  Domain-derived best-practice proposals labeled "Best practice (proposed)" beside the extracted rules; new-project mode drafts the register after N2 and opens the idea brainstorm with the rules right after the two opening questions (N6 takes them when the brainstorm is skipped); adopted rules become FRs in the scope drafts citing BR- IDs.

## Phase K — Planning additions (FR-029 to FR-034)

- [~] **T034** — From built to released with the existing commands (FR-029) *(high)*
  new-project.md § N8c: review (/wxUIUXCodeReview), parity (/wxConversionParity), DB (/wxDBAnalyze), compliance (/compliance-scan), fixes as tasks with the user's OK then /implement, tests (/wxCreateTestPlan --Execute, /autofix-tests), the owner's web-app stage advances verified via cockpit summary and project.test_gate_status, help (/wxHelpGenerate) during Human Testing, release work packages; N11 continues from built; broken lifecycle commands in the known-gaps table; development plan gains a Release phase.

- [~] **T035** — Internal-or-consulting opening question; build vs buy or competitors for internal builds (FR-030) *(medium)*
  review-and-brainstorm.md § Opening questions gains question 1 (who it is for) and the build-vs-buy / competitors topic; interview PD5 / NP10; state file `buildFor`.

- [~] **T036** — User personas (FR-031) *(medium)*
  Management plan § 3.1 persona table (UP- IDs); plan mode drafts them as section 1's first area; new-project N2b topic after business rules, N4 persona coverage check, scope-draft Actors lines name persona and role, top tasks become acceptance scenarios.

- [~] **T037** — Price and margin in the internal cost document (FR-032) *(medium)*
  PD4 / NP9 planned price; database-options step 9 and document-templates § 5a; GOD-SaaS-Cost.md marked internal, never customer-facing.

- [~] **T038** — SLA and quality-and-readiness questions (FR-033, FR-034) *(medium)*
  Interview D8 (SLA) and QR1 to QR3 (accessibility, languages, test and demo data); dependency license check as a release-phase work package for commercial apps; SLA rows in the cost projection.

## Phase L — `--create` completes the process (amends FR-015, FR-022, FR-029; 2026-10-04)

- [~] **T039** — Under `--create`, G.O.D. answers the gates, repairs when blocked, commits per unit (FR-015, FR-022, FR-029) *(high)*
  wxgod.md Rules and modes: plan mode and new-project mode keep "orchestrates, never substitutes"; `--create` answers every command gate from the approved design (`gateLog`), uses the commands first and repairs a failed command or kit gap itself (`repairs`, Revision History, `project.submit_feedback`), commits each unit and phase gate locally, never pushes, deploys, touches production, or signs off a human test. new-project.md: intro, N7/N8/N8b/N8c/N11/N12 gate wording, N10 state fields, known-gaps table, and the SPEC-123 per-scope stage advance replacing the owner's web-app advance. Kit stub and thin command (both mirrors) and CONTEXT.md glossary follow.

## Phase M — Brainstorms through wxBrainstorm; smoke test now, full test overnight (FR-035, FR-036; 2026-10-18)

- [x] **T040** — Every brainstorm runs through the wxBrainstorm skill, offered once after G.O.D. has looked through everything (FR-035) *(high)*
  review-and-brainstorm.md: § Offering the brainstorm (after the five sections, the topics gathered, the user's choice) and § Brainstorming: run by wxBrainstorm replace the brainstorm conduct and closing rules; no brainstorm mid-review; decisions in the wxBrainstorm record and `docs/GOD-Brainstorm.md`; learnings written once, by wxBrainstorm. new-project.md N2b and N6 and business-rules.md hand off the same way. wxBrainstorm SKILL.md gains § Embedded in wxG-O-D (topic, agenda and evidence passed in; G.O.D.'s scratch pad; G.O.D.'s three closing choices; step 7 never runs). Stub description updated.
- [x] **T041** — N8c step 6: smoke test (Gate 1) during the drive; the full test scheduled overnight after every scope's full plan is filed (FR-036) *(high)*
  new-project.md step 6 rewritten; step 8 notes QA clears from the overnight results; wxgod.md modes summary. Needs SPEC-140 Amendment A (`--full-first`, AI sign-off).

## Phase N — Seamless `--create` (Amendment A: FR-037 to FR-043; 2026-10-19)

Source: `docs/brainstorms/2026-10-19-wxgod-seamless-create.md`, decisions 1 to 15 (spec Q37 to Q51).

- [~] **T042** — The decision queue: assume low-risk, park high-risk (FR-037, FR-015) *(critical)*
  new-project.md N11: after approval, an uncovered question is classified. Low-risk is taken as `DQ-nn` `kind: assumed` with its cost to undo. High-risk (data loss, shared table shape, money, security/auth, legal/compliance, production, contradicts a decision, costly to reverse) is parked, and only its unit and its `dependsOn` dependents wait. A Change Impact data-loss denial is parked, and its answer is recorded only by `approve.mjs`. `docs/GOD-Decisions.md` is kept current, and `decisionQueue` is added to N10.
- [~] **T043** — Checkpoints keep going under `--create` (FR-038, FR-016) *(high)*
  N9: under `--create` a checkpoint saves and continues, and the state file is re-read after any compaction. `/clear` is offered only at the end of a sitting. wxgod.md Rules checkpoint bullet.
- [~] **T044** — Pipeline commands in helpers; the `parked` implement status (FR-039, FR-018) *(high)*
  N8b and N9: under `--create`, /buildscope, /validateScope, /createSpecs, and /implement each run in a helper with return-the-question. /buildscope and /createSpecs run one at a time, and wxDesigner stays in the main conversation. The `parked` status ends the helper, frees its slot, and re-runs the unit on release.
- [~] **T045** — A stuck phase gate parks; independent next-phase units start (FR-040, FR-014) *(high)*
  N11 items 2.6 and 3: the gate is parked as high-risk, the phase is "gate open" with no gate commit, and the units behind the gate are defined. Next-phase units with no `dependsOn` path to them may start.
- [~] **T046** — Readiness check at the N6 pause, before Approve (FR-041) *(high)*
  N6: list the UAT target and test logins, integration test keys, Claude in Chrome and Python, database reach, kit version, a clean git tree, and the bridge. Each is supplied now or recorded as a known skip (`readiness` in N10). Key names are checked, never values.
- [~] **T047** — The end of a sitting: run report, decision review, resume (FR-042, FR-016) *(critical)*
  N11: no time budget. A sitting ends when no unit is ready and no helper is running. Write `docs/GOD-Run-Report.md` (document-templates § 7), then present every queued item numbered in plain text, where "all recommended" is accepted. An answered parked item releases its units, and a reversed assumption becomes an N8c step 5 fix. N10 resume reads `decisionQueue` as well as `stoppedAt`.
- [~] **T048** — "Design it" screens park only their screen tasks (FR-043, FR-024) *(medium)*
  N6b, N8, and N11 2.3: wxDesigner drafts and SAVEs. The screen tasks are set `blocked` and `/implement --task-filter todo` builds the rest. The unit counts as implemented for its dependents and its gate, and the screen tasks are built after the review.
- [~] **T049** — G.O.D. script failures after approval stop only when unsafe (FR-022) *(high)*
  wxgod.md Rules "Stop and report a defect" and N11: the run stops after approval only when the state file cannot be written or read back, or the inventory or estimate is corrupt. Other failures are logged in `repairs` and the run continues. A method contradiction is parked. Before approval, the stop rule is unchanged.
- [~] **T050** — Known gaps and the bridge: Beta row, `/preTest` row, numbered plain text (FR-029, FR-020) *(medium)*
  Known-gaps table: Beta has no fix path (pass-through under `--create`, fixes in the run report), and the stale `/preTest` row is corrected. N2, N6, and N12 ask in numbered plain text under the bridge, and the decision review is posted to the room. wxgod.md Modes, Output table, and Resources; document-templates §§ 6 and 7; stub SKILL.md description.
- [x] **T051** — Cold read-through of the amended method (US11, SC-9) *(high)* — done 2026-10-19, two rounds
  A helper with no context reads the amended wxgod.md and new-project.md and walks a four-hour `--create` run on paper. It lists every place the run would still stop or meet a contradiction, and each is fixed. Round 1 found 18 problems and round 2 found 13; all are fixed in the method. The refinements beyond decisions 1–15 are listed in spec Q52.
- [~] **T052** — Fresh start before the build (FR-044, Amendment C) *(high)*
  N11 item 1: after set-up, and only when not handed to the bridge, checkpoint and offer once "`/clear`, then `/wxG-O-D --resume`, or reply go"; N11 intro and wxgod.md "Checkpoint before the context runs out" note the single exception. Built in the method 2026-10-24; needs the hosted MCP deploy and a real `--create` run to prove (T029).

## Phase H — Release and acceptance

- [ ] **T028** — Help catalog, CHANGELOG and release (all three) *(medium)*
  vscode-extension/src/services/helpCatalog.ts dev-plan deprecation note; wxkanban-agent/CHANGELOG.md entry; app push (hosted MCP redeploy), kit release via sync-to-orchestrator --release, Cockpit VSIX bump and vsce publish.
  The sync never prunes a de-listed skill: delete `.claude/skills/dev-plan/` in the orchestrator
  repo by hand in the same release.

- [ ] **T029** — End-to-end acceptance runs (SC-3, SC-5, SC-7, SC-8) *(high)*
  Plan-mode run on a real conversion repo (E:/AI_Development/EverettCash/analysis) with the redaction scan; --create run on a test overview to the last exit gate with the authorship check; a cleared-context --resume trial; a bridge trial with a grantless push attempt.

## Dependencies

- Phase A is the base; T005 and T006 ride the next hosted MCP deploy.
- Phase C (T012) precedes Phase D: `--create` writes `docs/DEVELOPMENT-PLAN.md` with the folded-in renderer.
- T019 and T020 (FR-017) precede T021 (FR-018): parallel units are refused by the kit until the per-spec check lands.
- T018 (checkpoint) precedes T022 to T025: the bridge `STATUS` and the defect stop point read `GOD-State.json`.
- T026 precedes T027: the style type is fixed before the first screen is designed or built.
- T030 precedes T031: the delivery answer decides whether the cost projection is written.
- T032 precedes T033: best-practice proposals sit beside the extracted rules in one register.
- T042 precedes T044, T045, T047, and T048: each of them parks into the decision queue. T051 runs after T042 to T050.
- Phase H runs last.
