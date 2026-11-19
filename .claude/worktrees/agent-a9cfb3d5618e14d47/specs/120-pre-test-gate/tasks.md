# Tasks: Spec 120 — Pre-Test Gate

**Spec**: `specs/120-pre-test-gate/spec.md`
**Scope**: `specs/Project-Scope/120-pre-test-gate.md`
**Total**: 21 tasks

> Measured baseline, 2026-08-01 on the working tree: **94 scopes / 1 filed test plan / 115 test
> files / 0 seed fixtures / 2 migrations with unrecorded apply-status**. `implement` Phase 5 is documented as
> non-blocking and PLAN-mode-only, so **0** implement phases currently execute a test.

---

## Phase A — Stand up a truthful clone

- [x] **T001** — Scaffold `/preTest` command and `wxPreTest` skill *(FR-001, critical)*
  `.claude/commands/preTest.md` plus `_wxAI/skills/wxPreTest/SKILL.md`, following the thin-stub
  pattern used by `wxCreateTestPlan` and `wxDesigner` (command loads the skill by path). Define the
  run contract: accepts `SCOPE-N`, returns exactly one of green / red-with-attempts /
  refused-with-reason. Independently runnable — the operator's inspect-change-reverify cycle must
  not cost a full re-implement.

- [x] **T002** — Clone orchestration with blocking faithfulness check *(FR-002, critical)*
  Invoke `_wxAI/skills/wxCreateTestPlan/scripts/clone-test-schema.mjs --create --name
  wxktest_120_<run>`, parse its JSON result, and **refuse the run when `faithful` is false**.
  Reuse the script at its current path; relocating working, fenced code is churn without benefit.

- [x] **T003** — Prove production is unreachable before any write *(FR-008, critical)*
  Assert `current_schema()` resolves to a `wxktest_`-prefixed name, then insert a canary row and
  confirm it is invisible from `public`. Refuse otherwise. This runs before every other write task.
  It is an asserted invariant rather than a convention because `DATABASE_URL` on this machine is
  production.

- [x] **T004** — Apply the scope's pending DDL to the clone *(FR-002, high)*
  Locate the scope's SQL under `src/db/migrations/`, apply it to the clone, and classify each
  statement as **applied** or **already live**. `IF NOT EXISTS` does not raise, so error codes
  alone would report every idempotent no-op as "applied" — the NOTICE is the only signal that
  distinguishes them, and that distinction is what answers "is this migration already in production?". Any DDL runs freely inside a `wxktest_` schema with no
  per-statement approval; nothing outside that prefix may be touched. Verify against
  `0059_scope119_customers.sql` and `0060_scope017_connections.sql`.

- [x] **T005** — Seed contract and composable base seed *(FR-003, high)*
  Define `tests/seeds/<NNN-name>/seed.ts` exporting `seed(db)`, with deterministic identifiers so
  screens are reproducible and assertions can name known rows. Author the base seed establishing
  company + user + project, plus the composition helper that lets a scope seed import prior seeds
  rather than re-authoring the world.

- [x] **T006** — Teach `implement` to author a per-scope seed *(FR-003, high)*
  `implement` writes `tests/seeds/<NNN-name>/seed.ts` alongside the test plan, populating only the
  rows that scope's features need and importing prior seeds where they already establish what is
  required.

- [x] **T007** — Smoke gate against the clone *(FR-004, high)*
  Boot the real application against the clone via `search_path`. Assert every route the scope's
  fences touched returns non-5xx and every UI route the scope added renders without crashing.

- [x] **T008** — Clone lifecycle: keep on green, explicit teardown *(FR-009, high)*
  A green run leaves the clone standing and prints connection details, because the point of the
  gate is that the operator opens the app and looks at real screens holding known data. Add
  `--teardown`, surface `--list`, and make the next pre-test for a scope drop its predecessor.

## Phase B — Drive the application

- [ ] **T009** — Route drive: real CRUD per functional requirement *(FR-004, critical)*
  Real create→read→update→delete per FR via supertest against `createApp()` with genuine JWTs from
  `signToken`. Routes mount under `/api`. This makes the standing endpoint-test-every-feature-change
  rule automatic rather than remembered.

- [ ] **T010** — UI drive: Playwright walk of the scope's screens *(FR-004, high)*
  Page-to-page navigation and back, guarded-route redirect and return, deep-link and refresh, and
  each interactive element. `@playwright/test ^1.50.0` and `playwright.config.ts` are already
  present, so no harness setup is required.

- [ ] **T011** — Bounded repair loop, capped at three rounds *(FR-005, high)*
  On red: diagnose, fix, re-run **only the affected items**, at most three rounds. Application code
  may be corrected. After the cap, report red listing every repair attempted rather than continuing.

- [ ] **T012** — Assertion-integrity guard on the repair loop *(FR-005, critical)*
  The loop's cheapest path to green is weakening an assertion, which converts a known defect into a
  false guarantee — strictly worse than the red it replaced. Detect and refuse assertion-weakening
  edits structurally, and report them as findings. **Not optional; T011 without T012 is net-negative.**

## Phase C — Reconcile test items against change

- [ ] **T013** — Resolve touched fences to functional requirements *(FR-006, high)*
  Given the fences a change touched, resolve `[SCOPE N / Tnnn]` through the task to `FR-###` via the
  existing `link_task_to_spec` chain. Source the touched set from the implement proposal and the
  working-tree diff. Reads existing wiring; builds no new linkage.

- [ ] **T014** — Test-item delta classifier with approval gate *(FR-006, high)*
  Classify each affected requirement as items **added**, **updated**, or **proposed for retirement**
  when the requirement no longer appears in the spec. Retirement is proposed only and never
  automatic — silently dropping coverage is how a suite rots into green-but-meaningless. Present the
  delta for approval before the run proceeds.

## Phase D — Make the gate mandatory

- [ ] **T015** — Record gates 1 and 2 as passed, leave gate 3 pending *(FR-010, high)*
  On green, mark the smoke and CRUD signoffs passed in the wxKanban DB through the existing MCP
  surface, leaving final user verification filed pending exactly as the three-gate model defines.

- [ ] **T016** — Wire `implement` to block on `preTest` *(FR-007, critical)*
  Add the phase that invokes `/preTest` and prevents `implement` reporting done until it returns
  green. Update **both** `_wxAI/commands/implement.md` and `.claude/commands/implement.md`. This is
  the one-word change the whole scope exists for: non-blocking becomes blocking.

- [ ] **T017** — Recorded `--skip-pretest` waiver *(FR-007, high)*
  A single waiver that prints a loud warning and records itself against the scope, so a bypass is
  visibly distinguishable from a pass afterward rather than indistinguishable from one.

- [ ] **T018** — Consumer safety: unreachable DB degrades, never wedges *(FR-007, high)*
  `preTest` ships to every consumer through the kit. A consumer whose database is unreachable must
  degrade to the recorded waiver rather than wedging their `implement` permanently. Verify against
  at least one consumer project.

- [ ] **T019** — Surface `preTest` in the VS Code Cockpit *(FR-010, medium)*
  Add to `helpCatalog.ts` and `scripts/install-claude-commands.mjs` per the `wxCreateTestPlan`
  precedent, and bump `vscode-extension/package.json`. A command that does not surface in the
  Cockpit is invisible to the operator.

- [ ] **T020** — Three-channel release: app, kit, Cockpit VSIX *(FR-010, medium)*
  Ship all three per the standing rule that publishing one means publishing all three: app commit,
  `wxkanban-agent` kit release, and `vsce publish` of the VSIX.

## Validation

- [ ] **T021** — Prove phases A and B end to end against SCOPE-119 *(high)*
  Run the complete flow against SCOPE-119, which sits uncommitted in the tree — exercising clone, pending-DDL apply, seed, smoke, route drive and UI drive on a real
  in-flight scope rather than a synthetic one. **Must pass before T016 makes the gate blocking.**
