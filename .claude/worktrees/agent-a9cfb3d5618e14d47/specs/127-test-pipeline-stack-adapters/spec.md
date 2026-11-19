# Spec 127: Test Pipeline Stack Adapters — Adapter Seam Across All Three Layers

**Spec Number**: 127
**Status**: `draft`
**Created**: 2026-08-22
**Last Reviewed**: 2026-08-22 (interactive buildscope — section-by-section, approved through all six sections by the project owner)
**Depends On**: SPEC-121 (kit upgrade file preservation — FR-007 requires it; ships 2026-08-23, this scope cannot release before it); SCOPE-026 (code fencing); SCOPE-117 (manual DDL workflow, if any schema change emerges)
**Related Scopes**: SCOPE-111 owns test items, executors and signoff; SCOPE-120 owns the `/preTest` sequence and its authority to block; SCOPE-047 owns capturing `stack.md`. This scope changes only how machinery is *resolved* per stack — it does not touch what any of those three own.
**Closes Feedback**: `0e8e034d`, `0e39182f` (both halves), `7f33e279`
**Source**: `specs/Project-Scope/127-test-pipeline-stack-adapters.md`

---

## Overview

wxKanban's test pipeline is stack-neutral in its method and stack-locked in its machinery. `/buildstack` interviews a customer into any Application Type — Web, Desktop, Mobile — and any stack within it. The pipeline that verifies the resulting code assumes exactly one: TypeScript, Express, Drizzle, hosted PostgreSQL, Playwright.

The adapter model that fixes this already exists, and it works — but it was cut into only one of the three layers the pipeline runs through. `wxCreateTestPlan` resolves an adapter before Phase 0. `implement` Phase 5b and `/preTest` do not, and cannot: Phase 5b instructs writing `tests/seeds/<NNN>/seed.ts` with Drizzle's `onConflictDoNothing`, and `/preTest` clones a live hosted Postgres schema into `wxktest_`. Neither has a seam to resolve anything through.

The result is a pipeline that stops twice. A customer on an unsupported stack is refused at Phase 5 — correctly and safely, by design. A customer on a *supported* stack still falls over at Phase 5b, because that phase hard-codes a stack no adapter can override.

This scope cuts the adapter seam through all three layers, makes an unmatched stack self-serving rather than blocking by generating a candidate adapter from `stack.md` and proceeding on it automatically, and ships two reference adapters — Expo/React Native and Electron/embedded-SQLite — as proof the seam carries stacks it was not designed around.

### Core Design

**Primary Actor**: the AI agent executing `/implement` on a kit-consumer project whose declared stack is not wxKanban's own.

**Secondary Actors**: the developer on that project (beneficiary — today receives a correct refusal and no test coverage); the wxperts kit maintainer (authors and ships reference adapters); the tester receiving human-executed items under SCOPE-111.

**Key Value**: the test pipeline serves every stack `/buildstack` can produce, without wxperts authoring an adapter per stack.

**The central design decision**: an unmatched stack generates its own adapter and the pipeline proceeds on it **automatically, with no approval gate**. Approval still exists, but it promotes a user-added adapter from provisional to approved *after the fact* — it never blocks a run. Blocking and trust are deliberately separated.

The consequence is that the safety burden moves off a human and onto machine-checkable guards. **FR-005 and FR-013 are the load-bearing requirements of this scope.** Without them, its net effect would be to make a confident wrong answer easier to obtain than it is today — which is the exact failure this subsystem was built to prevent.

---

## Actors

Primary: the AI agent executing `/implement` on a kit-consumer project whose declared stack is not wxKanban's own — it is the actor that resolves the adapter, so resolution must be machine-decidable rather than a judgment call.

Secondary: the developer on that kit-consumer project, who today receives a correct refusal and no test coverage; the wxperts kit maintainer, who authors and ships the reference adapters; and the tester receiving human-executed items under SCOPE-111.

---

## Business Problem

wxKanban's test pipeline is stack-neutral in its method and stack-locked in its machinery. Measured against the working tree on 2026-08-22: only two adapters exist; grepping the entire `wxCreateTestPlan` tree for `expo`, `react-native`, `detox` or `maestro` returns **zero** matches; and `implement` Phase 5b contains **five** distinct stack-specific idioms. `/buildstack` offers three Application Types; the pipeline can verify one of them end to end.

Three paying kit customers have already hit this mid-`implement` and filed reports. In every case the agent read the skill's own safety rule, correctly refused to run the wrong stack's tooling speculatively, hand-rolled its own verification, and filed a defect. The hard-stop worked exactly as designed — it simply has nowhere to hand off to, so the cost lands on the customer every time.

This is a recurring class rather than three incidents. `/buildstack` does not offer a fixed list of stacks; it interviews. A customer can land on Flutter+Firebase, Django, Rails, SwiftUI or Blazor, and wxperts will never have an adapter waiting. Authoring one adapter per reported stack is a treadmill whose first lap is the current feedback queue.

---

## Scope Boundary

Included in this scope:

- A single adapter-resolution service shared by all three pipeline layers — `wxCreateTestPlan`, `implement` Phase 5b, and `/preTest` (FR-001 … FR-003).
- On-demand generation of a candidate adapter from `stack.md` when no adapter matches, proceeding automatically with no approval gate, together with the machine-checkable guards that make that safe (FR-004 … FR-008).
- The invariants that must survive the change: a bounded disposable database target on every posture, and provenance reporting on every resolution (FR-009, FR-010).
- Two reference adapters — Expo/React Native and Electron/embedded-SQLite — as proof the seam carries stacks it was not designed around (FR-011, FR-012).
- The existing hard-stop guards remaining load-bearing under generation, per-adapter security test cases for SOC 2 CC7.1, and a documented hand-authoring path (FR-013 … FR-015).
- Relocating the adapter directory out from under `wxCreateTestPlan/` so all three layers read one place, and a provisional-until-approved status on user-added adapters.

Everything this scope explicitly excludes is listed under **Out of Scope** below, including the boundaries against SCOPE-111, SCOPE-120 and SCOPE-047.

---

## Integration Context

This scope must align with existing workflows rather than fork them. `wxCreateTestPlan`'s six-question adapter contract is extended intact, never replaced. The router-binding resolution and under-count hard stop from `6c7d9a5c` (kit v1.7.55), `clone-test-schema.mjs` and its `faithful:false` refusal, and the zero-unit stack guard all continue to fire unchanged. SCOPE-111 owns test items and signoff; SCOPE-120 owns the `/preTest` sequence and its authority to block; SCOPE-047 owns capturing `stack.md`, which this scope only reads. SPEC-121's upgrade-preservation rules govern how generated adapters survive a kit upgrade. Delivery must respect three different mechanisms — the `_wxAI/` kit mirror for the two skills, and the byte-identical `_wxAI/commands` / `.claude/commands` mirror pair for `implement`.

---

## User Scenarios & Testing

### US1 — Matched adapter carries all three layers (happy path)

A developer on a kit-consumer project whose `stack.md` declares Mobile / Expo / React Native / NativeWind / on-device SQLite runs `/implement 010`.

1. Phase 5 reads `stack.md`, matches `expo-react-native`, announces the resolved adapter out loud, and runs `wxCreateTestPlan` using that adapter's inventory source — Expo Router route files, the RN component tree, and the server's Express routes where the app calls them.
2. Phase 5b asks the same adapter for its seeding form. It gets the Expo answer — an on-device SQLite fixture applied through the app's own migration path — instead of `tests/seeds/*.ts` with Drizzle.
3. `/preTest` asks the adapter for its database posture and UI driver. It stands up a disposable on-device database, boots the app in a simulator, and drives the screens the scope touched through the adapter's declared driver.

**Expected**: `/implement` completes all six phases with no phase skipped and no stack drift — no `.ts` seed file appears in a project whose stack does not use one. The run names which adapter served each of the three layers.

### US2 — Unmatched stack generates its own adapter and proceeds (the report-closing path)

A developer on a Flutter + Firebase project — a stack wxperts has never shipped an adapter for — runs `/implement 007`.

1. The pipeline reads `stack.md`, finds no matching adapter, and does **not** stop.
2. It generates a candidate adapter from the declared stack against the six-question contract: inventory source, schema source, harness, UI driver, DB posture, test substitutes.
3. The candidate is checked against machine-decidable criteria. It proceeds automatically — no approval prompt.
4. The generated adapter is written to the project's adapter directory so the next run reuses it rather than regenerating, and so the developer can edit it. It is marked `status: provisional`.

**Expected**: the pipeline runs to completion on a stack nobody anticipated. The run states plainly that the adapter was generated rather than shipped, and names the file it wrote.

### US3 — A generated adapter that cannot really drive the UI is stopped, not passed (the safety edge case)

Same as US2, but the generated adapter's UI driver is wrong — it names a driver that is not installed, or one that launches nothing.

1. `/preTest` reaches the UI tier and invokes the declared driver.
2. Before recording any UI-tier result, it demands proof of a real interaction: a booted target and a non-empty element tree or captured frame.
3. No proof arrives.
4. The run exits non-zero, naming the adapter, the driver it declared, and what the probe actually got back.

**Expected**: no UI test item is marked passed. `/preTest` does not go green. The failure is loud and names the generated adapter as the suspect — the operator learns the adapter is wrong, not that their app is broken.

This is the scenario the whole design hangs on. Auto-generation without an approval gate is only safe if a fabricated driver fails closed, and the hard-stop shipped in `71ed91a1` exists precisely because a confident empty result reads as a real one.

### US4 — A stack with no server to clone gets a real database posture anyway

A developer on an Electron + embedded-SQLite desktop app — no HTTP API, IPC handlers only, a per-install local database file — runs `/preTest 007`.

1. `/preTest` asks the adapter for its DB posture. There is no hosted Postgres to clone, so `wxktest_` schema naming and `clone-test-schema.mjs` do not apply.
2. The adapter's answer is a disposable database *file* in a scratch location, created fresh from the app's own migrations.
3. The boundary guard changes shape with it: where the Postgres posture refuses any schema outside the `wxktest_` prefix, this posture refuses any path outside the scratch directory — same guarantee, different mechanism.
4. Seeding, boot and drive proceed against that file.

**Expected**: `/preTest` completes on a stack with no database server, and the "never touch anything outside the disposable target" guarantee holds — verified by attempting a write outside the boundary and having it refused.

---

## Functional Requirements

### Group A — The Seam

#### FR-001 — Adapter resolution is one shared service, not three implementations

All three layers resolve an adapter through a single mechanism that reads `stack.md` and returns a resolved adapter or a documented miss.

- [ ] `wxCreateTestPlan`, `implement` Phase 5b and `/preTest` all resolve through the same code path
- [ ] Resolution is machine-decidable from `stack.md` alone — no prose interpretation at run time
- [ ] A project with no `stack.md` gets a named, actionable miss rather than a silent default to Express
- [ ] An adapter is never chosen for a stack that lacks what its machinery depends on: each shipped adapter declares `**Requires:**`, every group must appear in the stack's Choice tokens, and an adapter excluded this way is named in the miss with what is missing (decision 25, T020)
- [ ] A `stack.md` that declares more than one application type never has one silently dropped: every declared type is resolved, the result lists each type's outcome, any type nothing covers is named with the exact command to resolve it, and every caller tests a target's code with the adapter for that code's own application type (decision 26, T021)

#### FR-002 — Phase 5b resolves its seeding form from the adapter

`implement` Phase 5b stops instructing `tests/seeds/<NNN>/seed.ts` and Drizzle idiom directly, and asks the adapter what a seed is on this stack.

- [ ] Phase 5b contains no stack-specific file path, language, or ORM idiom in its own text
- [ ] On the Express stack, the resolved form is identical in effect to today's behavior — no regression for wxKanban itself
- [ ] On a .NET stack, following Phase 5b introduces no Node/TypeScript file into the repo
- [ ] Closes report `7f33e279`

#### FR-003 — `/preTest` resolves database posture from the adapter

The clone-a-hosted-Postgres-schema assumption becomes one posture among several.

- [ ] `/preTest` asks the adapter how to create a disposable target, rather than assuming `wxktest_` schema cloning
- [ ] An adapter can answer with a schema, a database file, or a container
- [ ] The Postgres posture's existing behavior — including `clone-test-schema.mjs` and its `faithful:false` refusal — is preserved unchanged as the Express adapter's answer
- [ ] Closes the `/preTest` half of report `0e39182f`

### Group B — Generation and Its Safety

#### FR-004 — Every adapter supplies a real UI driver

No adapter may decline to drive the UI. Each declares a concrete driver for its stack.

- [ ] The adapter contract requires a named, executable UI driver
- [ ] `expo-react-native` declares a simulator-based driver; `electron-sqlite` declares Playwright's Electron target
- [ ] An adapter with no UI driver fails contract validation and is not usable

> **Alternative considered and rejected**: allowing an adapter to declare "no automated UI driver on this stack" and degrade the UI gate to a documented human walkthrough under SCOPE-111's human-executor set. Rejected by the project owner in favor of universal real drivers. The consequence is that a generated adapter must *invent* a driver for an unanticipated stack, which is what makes FR-005 load-bearing rather than defensive.

#### FR-005 — A UI driver must prove it drove something before any UI result is recorded

The driver's claim is verified, not trusted.

- [ ] Before recording any UI-tier result, `/preTest` obtains proof of real interaction: a booted target plus a non-empty element tree or captured frame
- [ ] Absent proof, the run exits non-zero and records no UI-tier pass
- [ ] The failure names the adapter, the declared driver, and the probe's actual return
- [ ] A deliberately broken driver in a test fixture produces a hard stop, never a green run

**This is the load-bearing safety requirement.** With automatic generation and no approval gate, it is the only thing standing between a fabricated driver and a false green.

#### FR-006 — An unmatched stack generates a candidate adapter and proceeds automatically

- [ ] No matching adapter triggers generation from `stack.md` against the six-question contract, with no approval prompt
- [ ] Generation answers all six contract questions with commands and paths real for that stack
- [ ] The pipeline continues on the generated adapter within the same run
- [ ] Closes reports `0e8e034d` and the `wxCreateTestPlan` half of `0e39182f` for every stack, not only the two reported

#### FR-007 — A generated adapter is persisted, reused, and editable

- [ ] Written into the consumer project's adapter directory on first generation
- [ ] Subsequent runs resolve the persisted file rather than regenerating
- [ ] The file is plain markdown a developer can edit, and edits survive kit upgrade (per SPEC-121's preservation rules)

#### FR-008 — An incomplete generated adapter hard-stops rather than running partially

- [ ] A generated adapter missing any of the six contract answers fails validation
- [ ] Validation failure exits non-zero naming which questions were unanswered
- [ ] The pipeline never proceeds on a partially-specified adapter

### Group C — Invariants

#### FR-009 — The disposable-target boundary holds across every posture

The guarantee survives the change of mechanism.

- [ ] Every posture defines an explicit boundary — a schema prefix, a directory, a container
- [ ] Writes outside that boundary are refused by the posture itself, not by convention
- [ ] Each shipped posture is proven by an attempted out-of-boundary write that is refused
- [ ] "Never touching production" remains true on a stack with no server

#### FR-010 — Every run states which adapter served each layer and where it came from

- [ ] Each of the three layers announces its resolved adapter out loud
- [ ] The announcement states provenance in one of three states: **shipped** (wxperts-authored, trusted), **provisional** (user-added or generated, in use but unapproved), **approved** (user-added, promoted)
- [ ] A generated adapter is never presented as though it were a shipped one

### Group D — The Proof

#### FR-011 — Reference adapter: Expo / React Native

- [ ] Answers all six contract questions for Expo Router, React Native, NativeWind, on-device SQLite
- [ ] Inventory source enumerates Expo Router routes and RN components, and hard-stops on an under-count as the Express extractor does
- [ ] Verified against a minimal fixture, with the specific limits of that verification named inside the adapter
- [ ] Ships as a **shipped** adapter, not provisional

#### FR-012 — Reference adapter: Electron / embedded SQLite

- [ ] Answers all six contract questions for Electron, IPC handlers, embedded SQLite, no HTTP API
- [ ] Inventory source enumerates IPC command handlers as first-class callable units
- [ ] DB posture is a disposable database file with a directory boundary, per FR-009
- [ ] Verified against a minimal fixture, with limits named
- [ ] Ships as a **shipped** adapter, not provisional

### Group E — Guards and Floor

#### FR-013 — Generation cannot bypass the existing guards

- [ ] The under-count hard stop from commit `6c7d9a5c` still fires on an adapter-driven inventory
- [ ] The zero-unit stack guard still fires
- [ ] `/preTest`'s `faithful:false` refusal still fires
- [ ] A generated adapter that yields an implausible inventory hard-stops exactly as a shipped one would

#### FR-014 — Every adapter carries security test cases for its stack (SOC 2 CC7.1)

- [ ] Security cases sit **alongside** the six-question contract, not inside it — the contract stays six questions
- [ ] Both reference adapters name concrete cases for their stack: secure storage on mobile; IPC boundary and `nodeIntegration` posture on Electron
- [ ] Generation produces security cases rather than omitting the section
- [ ] Satisfies CC7.1, *"Test plans include security test cases"*, which is active on this project

#### FR-015 — The adapter contract is documented for hand-authoring

Generation is the default path; hand-authoring stays a first-class one.

- [ ] The six-question contract, the validation rules, and a worked example are documented
- [ ] A developer can author an adapter without reading pipeline source
- [ ] A hand-authored adapter resolves identically to a shipped one

### Also in scope

- **The adapter directory moves** out from under `_wxAI/skills/wxCreateTestPlan/adapters/` to a location all three layers legitimately read, so no fourth skill-mirror drift trap is created.
- **User-added adapters carry provisional status until approved.** The approval mechanism for this scope is a **status field in the adapter file** (`status: provisional` → `approved`). A command-based (`/approveAdapter`) or wxKanban-record-based signoff is explicitly deferred, not rejected — the file field is the only mechanism that works with no server, and this seam runs on a customer's laptop mid-`implement`.
- **`CONTEXT.md` gains two terms**: *Stack Adapter* and *Database Posture*.

---

## Data Requirements

**Not applicable.** This scope touches no database table. Generated adapters are markdown files in the consumer's tree, not rows. Adding a schema section would invite a migration nobody needs — and under SCOPE-117 every schema change is hand-applied with a ledger entry, which is real cost for nothing.

## API Routes

**Not applicable.** Nothing in this scope is reachable over HTTP. The entire surface is kit-side skills and commands.

## Frontend Components

**Not applicable.** No wxKanban UI changes. The Dev Cockpit already surfaces `/preTest` and `implement`; their behavior changes, their entry points do not.

## Key Entities

**Not applicable as database entities.** The two conceptual entities this scope introduces — *Stack Adapter* and *Database Posture* — are markdown documents and resolution results, not persisted records. Both are defined in `CONTEXT.md` (see Notes).

---

## Success Criteria

1. **SC-1 — All three layers resolve through one service: 3 of 3.** A single `/implement` run on a matched non-Express stack names its resolved adapter at Phase 5, Phase 5b and `/preTest`. Measured by the run output naming three resolutions; today it names one.

2. **SC-2 — Phase 5b contains zero stack-specific idiom.** Grepping the Phase 5b text for `tests/seeds`, `.ts`, `onConflictDoNothing`, `runSeed` and `wxktest_` returns **0 matches**. Today it returns all five. This is the direct, machine-checkable close of `7f33e279`.

3. **SC-3 — An unanticipated stack completes end-to-end with no human intervention.** A project on a stack wxperts ships no adapter for runs `/implement` through all six phases, generating its adapter en route. Measured as: 0 phases skipped, 0 approval prompts, 1 adapter file written.

4. **SC-4 — A broken UI driver fails closed: 100% of attempts.** A fixture adapter declaring a driver that launches nothing produces a non-zero exit and **0 UI-tier passes**, across repeated runs. Any single green run against a non-driving driver fails this criterion outright.

5. **SC-5 — Every shipped database posture refuses an out-of-boundary write: 2 of 2.** The schema and file postures each demonstrate a refused write outside their declared boundary, so the "never touch production" guarantee is proven per posture rather than assumed from the Postgres one.

6. **SC-6 — wxKanban's own pipeline is unchanged.** An `/implement` and a `/preTest` run on a wxKanban scope produce the same behavior as before this scope: no regression in the existing 115-file test suite, and an identical Phase 5b seeding outcome. The seam must be invisible to the stack that already worked.

7. **SC-7 — All three open reports close, and the class stops recurring.** `0e8e034d`, `0e39182f` and `7f33e279` move to resolved. The forward-looking half: **no new "no adapter for X" report arrives within one release cycle** after release, because generation makes the unmatched case self-serving. This is the criterion that says whether the treadmill actually stopped.

8. **SC-8 — Provisional status is visible at run time, not just in the file.** A run resolving a user-added adapter that has not been approved says so out loud alongside its provenance (FR-010). A user must never take an unapproved adapter's output for a shipped one.

---

## Constraints

### Delivery — three layers, three different mechanisms

Getting one wrong ships a seam that only half-exists:

| Layer | In-repo copy | Reaches customers via | MCP prompt twin |
|---|---|---|---|
| `wxCreateTestPlan` | `_wxAI/skills/wxCreateTestPlan/` (one copy) | the `_wxAI/` kit mirror | **none** |
| `implement` | mirror pair: `_wxAI/commands/implement.md` **and** `.claude/commands/implement.md` | both, and they must stay byte-identical | n/a |
| `/preTest` | `_wxAI/skills/wxPreTest/` + `scripts/` | the `_wxAI/` kit mirror | n/a |

### Other constraints

- **Kit sync mirrors the filesystem, not git.** Generated adapters landing in the wxKanban tree during development would ship to a public release. The adapter directory's relocation must account for this.
- **FR-007 depends on unreleased work.** Generated adapters persisting in a consumer's tree requires SPEC-121's upgrade-preservation fix, which is built but ships 2026-08-23. **This scope cannot release before it.**
- **Compliance is active.** SOC 2, and control CC7.1 — *"Test plans include security test cases"* — applies to every adapter this scope produces, generated ones included. Hence FR-014.
- **Schema changes are hand-applied.** None expected (no Data Requirements section), but if one emerges it follows SCOPE-117: reviewed SQL, applied by hand, recorded in the schema change log, verified with `npm run db:drift`. `drizzle-kit push` remains prohibited.
- **Fences are written by the orchestrator only** (SCOPE-026). All new code routes through `implement <scope>/<task>`.
- **Existing machinery this scope must preserve**: the six-question adapter contract in `_wxAI/skills/wxCreateTestPlan/adapters/README.md` (extended intact, never replaced — it is the best-designed artifact in this subsystem because it forces the *"which constraints can this substitute NOT enforce"* question that catches unfailable assertions); the router-binding resolution and under-count hard stop from `6c7d9a5c` / kit v1.7.55; `clone-test-schema.mjs` and its `faithful:false` refusal; the zero-unit stack guard.

### Release

Targets the release **after** Sunday 2026-08-23. Nothing from this scope rides that release, which already carries six promises and the SPEC-121 fix.

---

## Risks

**RISK-1 (highest) — This scope cuts a seam through the machinery that verifies wxKanban itself.** The blast radius of getting it wrong is our own release pipeline. SC-6 exists solely for this and should be watched every day of implementation. A scope that serves five new stacks and breaks the one we ship on is a net loss.

**RISK-2 — Generation quality is unproven, and with no approval gate a bad generated adapter reaches execution.** FR-005, FR-008 and FR-013 are the three places it must fail closed. If any is weak, this scope makes confident-wrong results *easier* to get than they are today. Worth stating plainly: the feedback queue this scope came from is largely made of tools that reported success while producing nothing. Adding another would be the worst possible outcome.

**RISK-3 — Reference adapters are verified against minimal fixtures rather than real Expo/Electron projects**, because wxperts has neither in-house. Their verification limits must be named inside each adapter. Accepted deliberately; the honest framing is that they are a better starting point than nothing, not exhaustively proven.

---

## Out of Scope

1. **SCOPE-111 (Test Suite Lifecycle)** — 111 owns test items, executors, signoff and release gating. This scope changes *how machinery is resolved per stack*, not what a test item is or who signs it off.
2. **SCOPE-120 (Pre-Test Gate)** — 120 owns the `/preTest` sequence: clone, apply DDL, seed, boot, drive, repair, sign off. This scope makes each step resolvable per stack. It does **not** change the sequence, the bounded repair loop, or the gate's authority to block.
3. **SCOPE-047 (Stack & Style)** — 047 owns capturing `stack.md`. This scope only *reads* it. No change to `/buildstack`, to the stack interview, or to how `stack.md` is materialized.
4. **Report `83069d1a` is explicitly not closed here.** That consumer's entire `_wxAI/` tree was absent — a kit sync/bootstrap defect with a different root cause. Folding it in would muddy both.
5. **No database schema changes, no API routes, no wxKanban frontend components.**
6. **Container-based database postures** are a shape the contract can express and generation may propose, but wxperts hand-authors only two postures here: schema and file.
7. **Command-based approval** (`/approveAdapter`) and **wxKanban-record signoff** for adapter promotion are deferred to a later scope.
8. **Adapters for stacks beyond Expo/React Native and Electron/embedded-SQLite** are not hand-authored here; generation is the answer for all others.
9. **No changes to the 2026-08-23 release.**

---

## Compliance Requirements

**Active frameworks**: SOC 2.

| Control | Requirement | How this scope satisfies it |
|---|---|---|
| **CC7.1** | Test plans include security test cases | **FR-014** — every adapter, shipped or generated, carries security test cases for its stack. Both reference adapters name concrete cases: secure storage on mobile; IPC boundary and `nodeIntegration` posture on Electron. Generation produces the section rather than omitting it. |

Compliance context was loaded at scope creation (2026-08-22) and returned 8 Design-phase controls, 7 of them in the Testing category. CC7.1 is the one with direct bearing: without FR-014, every adapter this scope produces would create a per-stack hole in security test coverage, and retrofitting it across generated adapters later would be materially more expensive than requiring it now.

---

## Notes

### Decisions taken in the buildscope interview (2026-08-22)

Recorded so they are not re-litigated later. Section-by-section, approved through all six sections by the project owner.

| # | Decision | Choice | Consequence |
|---|---|---|---|
| 1 | Problem framing | The **seam**, not two missing adapter files | Phase 5b and `/preTest` gain an adapter seam they have never had; the two reference adapters are *proof*, not the deliverable |
| 2 | Unmatched stack | **Generate** a candidate adapter | The unmatched case stops being a support ticket |
| 3 | Approval gate | **None** — proceeds automatically | Safety rests entirely on FR-005 and FR-013 |
| 4 | UI driver | Every adapter **must** supply a real one | A generated adapter must invent one, making FR-005 load-bearing |
| 5 | Adapter location | Moves out from under `wxCreateTestPlan/` | All three layers read one directory; no fourth mirror to drift |
| 6 | Provisional status | Applies to **user-added** adapters only, and clears on approval | wxperts-shipped reference adapters are not provisional |
| 7 | Approval mechanism | **Status field in the adapter file** | Works with no server; command/record signoff deferred |
| 8 | Contract shape | Stays **six** questions; security sits alongside | FR-014 is a companion requirement, not a seventh question |
| 9 | Release | The release **after** 2026-08-23 | Nothing from this scope rides that release |

### Assumptions set by the analyst

The owner left these open; neither changes the shape of the work.

- **SC-7's window is one release cycle.** A 30-day window would straddle releases and blur cause.
- **Two database postures ship hand-authored** (schema, file). Container remains expressible by the contract and proposable by generation, but is not hand-authored here — shipping a third posture we cannot verify would contradict decision 6.

### Evidence measured against the working tree, 2026-08-22

| Signal | Value |
|---|---|
| Adapters shipped | **2** (`dotnet-wpf`, `wxkanban-express`) |
| Hits for `expo` / `react-native` / `detox` / `maestro` across the whole `wxCreateTestPlan` tree | **0** |
| Stack-specific idioms hard-coded in `implement` Phase 5b | **5** (`tests/seeds`, `.ts`, `onConflictDoNothing`, `runSeed`, `wxktest_`) |
| Application Types `/buildstack` offers | **3** (Web, Desktop, Mobile) |
| Application Types the pipeline can verify end-to-end | **1** |
| Open customer reports of this class | **3** |

In every one of the three reports, the agent read the skill's own safety rule, correctly refused to run the wrong stack's tooling speculatively, hand-rolled its own verification, and filed a defect. **The hard-stop worked exactly as designed** — it simply has nowhere to hand off to, so the cost lands on the customer every time.

### CONTEXT.md terms added by this scope

**Stack Adapter** — A per-stack module supplying the concrete machinery the stack-neutral test pipeline needs to execute on one technology stack: its inventory source, schema source, test harness, UI driver, database posture, and test substitutes. Authored by wxperts, hand-written by a customer, or generated from the project's `stack.md` when no adapter matches.

**Database Posture** — An adapter's answer for how a disposable, non-production database target is created and bounded on its stack: a schema prefix, a directory, or a container.

### Open item

No `docs/adr/` directory exists in this project. The "generate an adapter and proceed automatically, with no human approving it" decision is hard to reverse and genuinely surprising without its reasoning. An ADR was offered and accepted, so that a future reader of FR-006 finds *why* the safety burden sits on FR-005 rather than on a person.

---

## Clarifications

### Session 2026-08-22

| # | Question | Decision |
|---|----------|----------|
| 1 | Is the problem "two stacks are missing adapters", or "the pipeline is only adapter-driven at one of its three layers"? | The second. The seam is the deliverable; the two reference adapters are proof it carries stacks it was not designed around. |
| 2 | Do we own a fixed adapter set, publish the seam for customers to author their own, or generate the adapter on demand? | Generate on demand, with the hand-authoring path documented underneath it (FR-015). Owning a fixed set is a treadmill whose first lap is the current feedback queue. |
| 3 | Should a generated adapter require explicit approval before the pipeline uses it? | No — it proceeds automatically. Approval was later re-introduced as an *after-the-fact promotion* of user-added adapters rather than a gate (decisions 6 and 7), separating blocking from trust. |
| 4 | Must every adapter supply a real UI driver, or may one declare "no automated driver" and degrade to a human walkthrough? | Every adapter must supply a real driver. The degrade option was considered and rejected. This is what makes FR-005 load-bearing: a generated adapter for an unanticipated stack must invent a driver, so the driver's claim must be *proven*, not trusted. |
| 5 | Does this ride the 2026-08-23 release, split across two, or hold as one piece? | Hold as one piece for the release after. The seam does not ship safely in a day, and rushing it is the specific way we would ship a generated-adapter path that hands customers confident wrong test plans. |
| 6 | Which technical sections apply? | Commands and the adapter contract only. No data/schema, no API routes, no frontend components. |
| 7 | Should the adapter directory move out from under `wxCreateTestPlan/`? | Yes — all three layers read one directory. |
| 8 | How are FR-011 and FR-012 verified, given wxperts has no Expo or Electron project in-house? | Against minimal fixtures, with the limits of that verification named inside each adapter. Throwaway reference projects and a consenting customer's project were both considered; the fixture path was chosen. |
| 9 | Is the security-cases requirement a seventh contract question, or separate? | Separate. The contract stays six questions; FR-014 sits alongside it. |
| 10 | Who or what carries provisional status? | **User-added adapters only** — generated or customer hand-authored — and it clears on approval. wxperts-shipped adapters are never provisional. |
| 11 | How does approval happen — a file field, a command, or a wxKanban record? | A status field in the adapter file for this scope. It is the only mechanism that works with no server, and this seam runs on a customer's laptop mid-`implement`. The other two are deferred, not rejected. |

### Session 2026-10-02 — generation mechanism (T009–T013)

Taken before implementing generation, after feedback `8a4e0de4` (Tauri 2 + Rust + embedded Firebird) became the fourth report of this class.

| # | Question | Decision |
|---|----------|----------|
| 12 | Who writes a generated adapter's six answers? | **The agent, into a scaffold the kit writes.** `_wxAI/adapters/generate-adapter.mjs` runs only on a `no-match` miss and writes every machine-knowable part — header, a `**Matches:**` line from this project's own stack tokens, `**Status:** provisional`, `**Origin:** generated <date>`, the six headings and a `## Security test cases` section (FR-014) — with a marked placeholder under each. The agent fills each from `stack.md` and the actual repository. A script cannot know a Flutter or Tauri command; pretending it could is how a confident wrong adapter would be produced. The procedure lives once, in `_wxAI/adapters/GENERATE.md`, which all three layers point at. |
| 13 | What stops an unfilled scaffold from passing validation? | The validator fails any section still carrying a generation placeholder. Without it, a placeholder longer than the 80-character floor would count as an answer. |
| 14 | Does generation overwrite? | Never. An existing file at the target path that no longer resolves is a hard stop naming it — it is the developer's to edit (FR-007). A persisted adapter is found by the resolver on the next run, so nothing regenerates. |
| 15 | Which misses generate? | Only `no-match`. No `stack.md` (nothing to generate from) and `ambiguous` (two adapters already match) stay hard stops. |
| 16 | How does FR-013's under-count guard reach an inventory produced by an agent rather than by `inventory-functions.mjs`? | **Every non-shipped adapter — generated or hand-written — declares `**Inventory signal:** <glob> :: <regex>`**, the pattern of its stack's registration site. `_wxAI/adapters/inventory-guard.mjs` counts that signal independently of the inventory and hard-stops (exit 3) on: zero units; a signal that matches nothing in the tree (the adapter does not describe this codebase); or a file whose registrations outnumber its inventoried units — the `6c7d9a5c` shape. Shipped adapters are untouched, so SC-6 holds. |
| 17 | How does the `faithful:false` refusal survive generation? | A non-shipped adapter's `### Disposable target` must name exactly one posture and a faithfulness check; a `schema` posture must use `clone-test-schema.mjs`, whose refusal is then the one that fires. |
| 18 | Are T009 (provenance) and T012 (status lifecycle) part of this batch? | Yes. The resolver reads `**Status:**`: shipped adapters report `shipped`; a project adapter reports `provisional` unless its file says `approved`. Editing the field promotes it after the fact and never blocks a run (FR-010, SC-8). |
| 19 | The validator's "names something executable" check knew `npx`/`node`/`dotnet` and a fixed driver list — `npm run`, `cargo`, `wdio` and `tauri-driver` all failed. | Widened deliberately to common runners. It stays a shallow check: the T008 proof probe, which demands a booted target and a non-empty element tree or frame, is what actually decides. |

### Session 2026-10-02 — cold-run findings (T010, T013)

A fresh agent with no context followed `GENERATE.md` on a realistic Tauri 2 + Firebird repository. It completed every step, and reported twelve defects in the procedure and its guards. These decisions came out of them.

| # | Finding | Decision |
|---|----------|----------|
| 20 | The inventory guard scoped its check by the inventory's own `scanned.dirs` — written by the same agent being checked. A whole-app inventory missing every Tauri command passed as consistent once it narrowed that field. | **The scope comes from the caller** (`--scope`, from the run's own path target), never from the inventory. Registrations left out are counted and reported. Regression test pins the exploit. |
| 21 | "Every command must be real here" contradicted "a generated adapter must name a UI driver" on a repository with no UI tooling yet. | `GENERATE.md` separates **repository facts** (checked here, never from memory) from **stack facts** (knowledge is acceptable, marked as not run here). The scaffold now carries a **How this was completed** placeholder, so the note is enforced, not optional. A driver this stack documents is named even when not yet set up; the proof probe refuses it until it really drives. |
| 22 | Phase 2B's item schema accepted only TypeScript kind prefixes, and the inventory shape had no `id` — every unit of a generated adapter would fail the self-check. | Inventory units carry `id` = `<kind>:<name>`; a test item's `unitId` is that `id`. `test-item-schema.md` accepts the kinds an adapter-driven inventory declares. |
| 23 | The validator read an introductory sentence as the Posture line, read "none" in prose as a declined driver, and took "faithful" as proof of a faithfulness check. | The Posture line is the one *labelled* Posture; "none" declines only as the answer (`Driver: none`). Creation, isolation and boundary must each be addressed. The validator is documented as **a floor, not a review**; the runtime guards decide. `container` is documented as refused at run time by `posture-boundary.mjs`. |

| 24 | A second cold run on a fresh copy, with the revisions above, passed every gate — and found that the guard compared whole-file totals (a missed command could be covered by a unit of another kind in the same file), that the decline detector refused the honest "not set up yet" phrasing `GENERATE.md` asks for, and that a signal could not be case-insensitive. | Signals name their kind — `**Inventory signal (command):**` — and the guard compares per file **and per kind**; required on project adapters, and an unreplaced `<kind>` is refused. Decline patterns are anchored to the act of declining (`no automated driver`, `Driver: none.`), and `GENERATE.md` lists them. A signal may be written `/pattern/i`. Inventory `line`, extra fields and the risk rule are now specified. |

### Session 2026-10-05 — resolution excludes a contradicting adapter (feedback `3626c874`)

A customer's Express + React + **SQLite** (better-sqlite3, no Drizzle) web project resolved to `wxkanban-express` at `implement` Phase 5b — score 5 on `express vitest playwright react node`, `candidates: []`, announced as **shipped**. Following its seeding form would have introduced PostgreSQL/Drizzle machinery the declared stack does not use. This is the open item recorded below on 2026-10-02, now reached by a real project.

| # | Finding | Decision |
|---|----------|----------|
| 25 | Scoring only *adds*: shared framework and test-tool tokens outvote a database the adapter cannot serve, and nothing can disqualify. The 2026-10-02 proposal (`**Requires:** express drizzle`) would have broken wxKanban's own resolution — `stack.md` captures six fixed dimensions (backend, frontend, database, styling, testing, hosting) and none of them is an ORM, so no captured stack ever contains `drizzle`. | **Each shipped adapter declares `**Requires:**`** — space-separated groups, alternatives within a group joined by `\|`. Every group must appear in the stack's Choice tokens or the adapter is excluded before scoring. `wxkanban-express` requires `express postgresql\|postgres` (`Supabase (Postgres)` passes); `dotnet-wpf` requires `wpf` (its posture builds from the EF model, so it is not database-bound). An excluded adapter is listed in the result with the groups it missed, so a miss explains itself. The reporter's stack becomes `no-match`, exit 3, which routes to generation (FR-006) — the designed path for a stack nothing ships. Project adapters may declare the line; it is not required of them. Owner-approved 2026-10-05. Implemented by T020. |

### Session 2026-10-19 — a declared application type is silently dropped (feedback `1565dac1`)

A customer's `stack.md` declares **Web** (Node.js + Express · React + Vite · PostgreSQL · Vitest + Playwright) and **Mobile** (Node.js + Express API · React Native (Expo) · SQLite + Postgres · Jest + Detox). Their code is an Express API under `api/` and an Expo app under `mobile/`. Run without `--app-type`, which is how all three layers call it, the resolver scores every declared type together and returns the best: `wxkanban-express (shipped)` on the Web table, score 6. The Mobile type is never mentioned, so it never reaches `no-match`, and generation (FR-006) never runs for it. Reproduced on kit v1.7.83 against the reporter's own `stack.md` from the database. wxKanban's own `stack.md` declares Web, Desktop and Mobile, and its Mobile table is word-for-word the reporter's: these are the `/buildstack` defaults.

| # | Finding | Decision |
|---|----------|----------|
| 26 | Resolving all declared types as one pool returns one adapter for one type and says nothing about the rest. A multi-type project then tests its mobile code with the web adapter, or stops with no route to generation. Making a multi-type `stack.md` a hard stop is not an option: wxKanban's own `stack.md` declares three types and must keep resolving to `wxkanban-express` (SC-6). | **Resolution is reported per type.** Without `--app-type`, the result keeps its current top-level answer (best type, unchanged exit code) and adds `byAppType`, one entry per declared type with that type's own outcome. Every type that does not resolve, or resolves to a different adapter than the top-level one, is printed as a note naming the exact `--app-type <type>` command. Callers (`wxCreateTestPlan`, `implement` Phase 5b, `/preTest`) decide which application type the target's code belongs to from the files it touches, announce that type out loud, and re-resolve with `--app-type` when it is not the top-level one. A `no-match` on that type then generates, as FR-006 intends. Owner-approved 2026-10-19. Implemented by T021. |

### Open — found 2026-10-02

**Resolution is too loose for a shipped adapter to be trusted.** *Decided 2026-10-05 — see decision 25 above; kept here for the record.* `MIN_TOKEN_OVERLAP = 2` lets a Python / FastAPI / SQLAlchemy / PostgreSQL / Playwright web project resolve to `wxkanban-express` — announced as **shipped** — on `postgresql` and `playwright` alone. Generation then never triggers, and Phase 5b hands the project the Express / Drizzle seeding form: the `7f33e279` failure class. Predates the generation work (T002), but undercuts FR-006.

**Phase 2 onward is not yet stack-neutral** (second cold run). Generation now gets a project as far as a guarded inventory; the planning phases still carry wxKanban's assumptions. `test-item-schema.md` allows only a `playwright` tier for `ui-flow` items (no WebdriverIO, Maestro, UI Automation), its `crud` tier assumes `TEST_DATABASE_URL` or MCP-UAT rather than an adapter's posture, and `isolationLevel` uses PostgreSQL's names. On wxKanban's own stack it also contradicts the extractor it describes: `inventory-functions.mjs` writes `id: "route:…"` under kind `express-route`, while the schema says `unitId` is `express-route:…` *and* the inventory `id` exactly; and `layer` is required yet absent from examples (a)–(c). `SKILL.md`'s whole-app default (`src/server`, `src/client` as a lens) is wxKanban's layout. Separately, `inventory-functions.mjs` does not skip `*.test.tsx`. None of these are changed by this scope's generation work — the first touches SC-6, the rest belong to a stack-neutral Phase 2 — and they are recorded so T019 does not claim more than was delivered.
