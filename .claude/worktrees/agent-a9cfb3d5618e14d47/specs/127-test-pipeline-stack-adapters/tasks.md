# Tasks: Test Pipeline Stack Adapters — Adapter Seam Across All Three Layers

**Spec**: 127
**Spec ID**: `ac79dae6-28e9-4ed2-a3bf-2ac0d199dada`
**Total**: 20 tasks
**Source**: materialized from the wxKanban database, which is authoritative for status.

Fence label for all code produced here: `[SCOPE 127 / Tnnn]`. Labels **must** be `Tnnn` — an
`FR-nnn` label silently fails the `T\d+` regex and registers as unfenced.

---

## Task Table

This table is the machine-readable source the orchestrator parses. Its shape is required: a row
number, then `Tnnn: Title`, then priority, then status.

| #  | Task | Priority | Status |
|----|------|----------|--------|
| 1 | T001: Relocate the adapter directory so all three layers read one place | high | done |
| 2 | T002: Build the shared adapter-resolution service (FR-001) | critical | done |
| 3 | T003: Adapter contract validation — six answers or hard-stop (FR-008) | critical | done |
| 4 | T004: Phase 5b resolves its seeding form from the adapter (FR-002) | critical | done |
| 5 | T005: /preTest resolves database posture from the adapter (FR-003) | critical | done |
| 6 | T006: Posture boundary enforcement — schema and file postures (FR-009) | critical | done |
| 7 | T007: /preTest resolves the UI driver from the adapter (FR-004) | high | done |
| 8 | T008: UI driver must PROVE it drove something before any UI result (FR-005) | critical | done |
| 9 | T009: Provenance reporting — shipped / provisional / approved (FR-010) | high | done |
| 10 | T010: Generate a candidate adapter from stack.md and proceed automatically (FR-006) | critical | in_progress |
| 11 | T011: Persist, reuse and preserve a generated adapter (FR-007) | high | done |
| 12 | T012: Provisional-to-approved status lifecycle on user-added adapters | medium | done |
| 13 | T013: Generation cannot bypass the existing guards (FR-013) | critical | done |
| 14 | T014: Reference adapter: Expo / React Native (FR-011) | high | todo |
| 15 | T015: Reference adapter: Electron / embedded SQLite (FR-012) | high | todo |
| 16 | T016: Security test cases per adapter — SOC 2 CC7.1 (FR-014) | high | todo |
| 17 | T017: Document the adapter contract for hand-authoring (FR-015) | medium | done |
| 18 | T018: Prove wxKanban's own pipeline is unchanged (SC-6) | critical | todo |
| 19 | T019: Answer and close the three customer reports | medium | todo |
| 20 | T020: Resolution excludes an adapter whose required tokens the stack lacks (FR-001) | critical | in_progress |
| 21 | T021: Resolution reports every declared application type, so none is silently dropped (FR-001) | critical | in_progress |

## Detail

### T001 — Relocate the adapter directory so all three layers read one place

Move the adapter directory out from under `_wxAI/skills/wxCreateTestPlan/adapters/` to a location `wxCreateTestPlan`, `implement` Phase 5b and `/preTest` can all legitimately read, and update every reference.

Leaving it under one skill's folder while two other layers depend on it is the ownership smell that becomes a sync problem; this kit already carries three skill-mirror drift traps and must not gain a fourth.

**Watch:** kit sync mirrors the FILESYSTEM, not git. Any adapter left in the wxKanban tree during development ships to a public release.

Blocks T002. Owner decision 5.

### T002 — Build the shared adapter-resolution service (FR-001)

One mechanism that reads `stack.md` and returns a resolved adapter or a documented miss, consumed by all three layers.

Acceptance:
- `wxCreateTestPlan`, `implement` Phase 5b and `/preTest` all resolve through the same code path
- Resolution is machine-decidable from `stack.md` alone — no prose interpretation at run time
- A project with no `stack.md` gets a named, actionable miss, never a silent default to Express

Machine-decidable matters more than usual here: the primary actor is an AI agent mid-`implement`, and under FR-006 an unmatched result triggers generation rather than a stop.

Depends on T001. Blocks T004, T005, T007.

**Completed 2026-10-02 — the first acceptance line was not met when this was marked done.** Phase 5b and `/preTest` were cut over to `resolve-adapter.mjs`, but `_wxAI/skills/wxCreateTestPlan/SKILL.md` was never touched by a SPEC-127 commit: it still matched `stack.md` against its own two-row table by eye, with paths into the `adapters/` folder T001 had moved away, and it could not see a project adapter in `.wxai/adapters/`. Found answering feedback `8a4e0de4` (Tauri 2 + Rust + embedded Firebird), which hit exactly that layer. The skill and both command stubs now call the resolver and validator; `tests/unit/adapterResolution.test.ts` asserts every layer does, and that the skill names no stale adapter path.

### T003 — Adapter contract validation — six answers or hard-stop (FR-008)

Validate any adapter (shipped, hand-authored or generated) against the six-question contract: inventory source, schema source, harness, UI driver, DB posture, test substitutes.

Acceptance:
- An adapter missing any of the six answers fails validation
- Failure exits non-zero naming WHICH questions were unanswered
- The pipeline never proceeds on a partially-specified adapter

The contract stays SIX questions (owner decision 8) — security cases are a companion requirement in T016, not a seventh question.

Depends on T002. Blocks T010.

### T004 — Phase 5b resolves its seeding form from the adapter (FR-002)

Strip all stack-specific instruction from `implement` Phase 5b and have it ask the adapter what a seed is on this stack.

Acceptance:
- Phase 5b's own text contains no stack-specific file path, language or ORM idiom. Grep for `tests/seeds`, `.ts`, `onConflictDoNothing`, `runSeed`, `wxktest_` returns 0 (today: all five present)
- On the Express stack the resolved form is identical in effect to today
- On a .NET stack, following Phase 5b introduces no Node/TypeScript file into the repo

**Delivery:** `implement` is a MIRROR PAIR — `_wxAI/commands/implement.md` and `.claude/commands/implement.md` must stay byte-identical.

Closes customer report 7f33e279. Depends on T002.

### T005 — /preTest resolves database posture from the adapter (FR-003)

Turn the clone-a-hosted-Postgres-schema assumption into one posture among several.

Acceptance:
- `/preTest` asks the adapter how to create a disposable target rather than assuming `wxktest_` schema cloning
- An adapter may answer with a schema, a database file, or a container
- The Postgres posture's existing behavior — `clone-test-schema.mjs` and its `faithful:false` refusal — is preserved UNCHANGED as the Express adapter's answer

Does not change SCOPE-120's sequence, bounded repair loop, or the gate's authority to block.

Closes the `/preTest` half of report 0e39182f. Depends on T002. Blocks T006.

### T006 — Posture boundary enforcement — schema and file postures (FR-009)

The disposable-target guarantee must survive the change of mechanism.

Acceptance:
- Every posture declares an explicit boundary — a schema prefix, a directory, a container
- Writes outside that boundary are refused BY THE POSTURE, not by convention
- Each shipped posture is proven by an attempted out-of-boundary write that is refused
- "Never touching production" holds on a stack with no database server

Ship two hand-authored postures: schema (existing `wxktest_` behavior) and file (a disposable database file with a directory boundary). Container stays expressible and generation-proposable but is NOT hand-authored here — analyst assumption, recorded in the scope.

Depends on T005.

### T007 — /preTest resolves the UI driver from the adapter (FR-004)

Every adapter must supply a real, named, executable UI driver. No adapter may decline to drive the UI.

Acceptance:
- The contract requires a named executable UI driver
- An adapter with no UI driver fails contract validation and is unusable

Owner decision 4. The alternative — letting an adapter declare "no automated driver" and degrade the UI gate to a human walkthrough under SCOPE-111's human-executor set — was proposed and REJECTED. Consequence: a generated adapter must invent a driver for an unanticipated stack, which is precisely why T008 exists and must not be weakened.

Depends on T002. Blocks T008.

### T008 — UI driver must PROVE it drove something before any UI result (FR-005)

**The load-bearing safety requirement of this scope.** With generation proceeding automatically and no human approving the adapter, this is the only thing standing between a fabricated driver and a false green.

Acceptance:
- Before recording ANY UI-tier result, `/preTest` obtains proof of real interaction: a booted target plus a non-empty element tree or captured frame
- Absent proof, the run exits non-zero and records NO UI-tier pass
- The failure names the adapter, the declared driver, and the probe's actual return
- A fixture adapter declaring a driver that launches nothing produces a hard stop across repeated runs — any single green run fails this outright

Do not trade this down under schedule pressure. Everything else in SCOPE-127 is more permissive than today's behavior; this and T013 are the counterweight. Rationale: `docs/adr/0001-generated-stack-adapters-proceed-without-human-approval.md`.

Depends on T007.

### T009 — Provenance reporting — shipped / provisional / approved (FR-010)

Every run states which adapter served each layer and where it came from.

Acceptance:
- Each of the three layers announces its resolved adapter out loud
- The announcement states provenance in one of three states: **shipped** (wxperts-authored), **provisional** (user-added or generated, unapproved), **approved** (user-added, promoted)
- A generated adapter is never presented as though it were a shipped one
- A run resolving an unapproved user-added adapter says so (SC-8)

Provisional applies to USER-ADDED adapters only; wxperts-shipped reference adapters are never provisional (owner decision 6).

Depends on T002.

### T010 — Generate a candidate adapter from stack.md and proceed automatically (FR-006)

The behavior change that closes the report class rather than three tickets.

Acceptance:
- No matching adapter triggers generation from `stack.md` against the six-question contract, with NO approval prompt
- Generation answers all six questions with commands and paths real for that stack
- The pipeline continues on the generated adapter within the same run
- A project on a stack wxperts ships no adapter for completes `/implement` through all six phases: 0 phases skipped, 0 approval prompts, 1 adapter file written

Closes 0e8e034d and the `wxCreateTestPlan` half of 0e39182f — for every stack, not only the two reported.

Depends on T003. Blocks T011.

**Status 2026-10-02 — in progress, not done.** Built with T009, T011, T012 and T013: `generate-adapter.mjs`, `inventory-guard.mjs`, `GENERATE.md`, the project-adapter rules in `validate-adapter.mjs`, and all three layers pointing a `no-match` at `GENERATE.md` (decisions: spec clarifications 12–24). Proven by 114 unit tests (mutation-checked on the placeholder, under-count and per-kind guards) and by **two cold runs** — a fresh agent with no context took a realistic Tauri 2 + embedded Firebird repository from `no-match` through generation, validation, provisional resolution and a guard-accepted inventory, unaided. Acceptance lines 1–3 are met. **Line 4 (SC-3: a full `/implement`, all six phases, on an unanticipated stack) is not demonstrated** — the runs stop at Phase 1, and Phase 2's item schema is not yet stack-neutral (spec, *Open — found 2026-10-02*). Do not close this, or claim SC-3 at T019, until a run gets through planning.

### T011 — Persist, reuse and preserve a generated adapter (FR-007)

Acceptance:
- Written into the consumer project's adapter directory on first generation
- Subsequent runs resolve the persisted file rather than regenerating
- Plain markdown a developer can edit
- Edits survive kit upgrade per SPEC-121's preservation rules

**Release dependency:** SPEC-121 (kit upgrade file preservation) ships 2026-08-23. SCOPE-127 cannot release before it.

Depends on T010.

### T012 — Provisional-to-approved status lifecycle on user-added adapters

A user-added adapter (generated or customer hand-authored) carries `status: provisional` until approved, and approval promotes it to `approved`.

Mechanism for THIS scope is a status field in the adapter file — owner decision 7. It is the only mechanism that works with no server, and this seam runs on a customer's laptop mid-`implement`.

Explicitly deferred, not rejected: a `/approveAdapter` command, and a wxKanban-record signoff alongside SCOPE-111's existing signoff model. If this heads toward an audited signoff, the record-based option is the honest starting point rather than a retrofit.

Approval never blocks a run — it promotes after the fact. Blocking and trust stay separated.

Depends on T009, T011.

### T013 — Generation cannot bypass the existing guards (FR-013)

The second load-bearing safety requirement, with T008.

Acceptance:
- The under-count hard stop from commit `6c7d9a5c` (kit v1.7.55) still fires on an adapter-driven inventory
- The zero-unit stack guard still fires
- `/preTest`'s `faithful:false` refusal still fires
- A generated adapter yielding an implausible inventory hard-stops exactly as a shipped one would

History this protects: run against a C#/.NET repo the extractor walked 316 `.cs` files, matched nothing, wrote an inventory of ZERO units and exited 0. A confident empty result reads as a real one. The under-count variant is worse — a plausible small number reads as real far more readily than a zero does.

Depends on T010.

### T014 — Reference adapter: Expo / React Native (FR-011)

Acceptance:
- Answers all six contract questions for Expo Router, React Native, NativeWind, on-device SQLite
- Inventory source enumerates Expo Router routes and RN components, and hard-stops on an under-count as the Express extractor does
- Declares a simulator-based UI driver (Detox or Maestro) per FR-004
- Verified against a minimal fixture, with the LIMITS of that verification named inside the adapter
- Ships as a **shipped** adapter, not provisional

wxperts has no in-house Expo project; fixture verification is the accepted approach (RISK-3). Name what the fixture could not prove.

Depends on T002, T003, T006, T007.

### T015 — Reference adapter: Electron / embedded SQLite (FR-012)

Acceptance:
- Answers all six contract questions for Electron, IPC handlers, embedded SQLite, no HTTP API
- Inventory source enumerates IPC command handlers as FIRST-CLASS callable units — the analogue of an Express route on a stack with no HTTP surface
- DB posture is a disposable database file with a directory boundary (T006)
- Declares Playwright's Electron target as its UI driver
- Verified against a minimal fixture with limits named
- Ships as a **shipped** adapter, not provisional

Proves the seam expresses "a file, not a schema" — if it can, it can express most things.

Depends on T002, T003, T006, T007.

### T016 — Security test cases per adapter — SOC 2 CC7.1 (FR-014)

Compliance is ACTIVE on this project (SOC 2). Control CC7.1: "Test plans include security test cases."

Acceptance:
- Security cases sit ALONGSIDE the six-question contract, not inside it — the contract stays six questions
- Both reference adapters name concrete cases for their stack: secure storage on mobile; IPC boundary and `nodeIntegration` posture on Electron
- Generation produces security cases rather than omitting the section

Cheap now, expensive to retrofit across every generated adapter later. Without it each new adapter creates a per-stack hole in security coverage.

Depends on T014, T015.

### T017 — Document the adapter contract for hand-authoring (FR-015)

Generation is the default path; hand-authoring stays first-class.

Acceptance:
- The six questions, the validation rules and a worked example are documented
- A developer can author an adapter without reading pipeline source
- A hand-authored adapter resolves identically to a shipped one

Extend the existing `adapters/README.md` rather than replacing it. That contract is the best-designed artifact in this subsystem — it forces the "which constraints can this substitute NOT enforce" question that catches unfailable assertions. Keep that intact.

Depends on T003.

### T018 — Prove wxKanban's own pipeline is unchanged (SC-6)

**RISK-1, the highest risk in this scope:** it cuts a seam through the machinery that verifies wxKanban itself. The blast radius of getting it wrong is our own release pipeline.

Acceptance:
- An `/implement` and a `/preTest` run on a wxKanban scope produce the same behavior as before this scope
- No regression in the existing 115-file test suite
- Phase 5b seeding outcome on the Express stack is identical
- The seam is invisible to the stack that already worked

A scope that serves five new stacks and breaks the one we ship on is a net loss. Watch this every day of implementation, not just at the end.

Depends on T004, T005, T006, T008, T013.

### T019 — Answer and close the three customer reports

Close `0e8e034d` (Expo/RN), `0e39182f` (Electron/IPC/SQLite — BOTH halves) and `7f33e279` (Phase 5b on .NET), naming the shipped version.

Each reply should credit what the reporter got right: all three read the skill's own safety rule, correctly refused to run the wrong stack's tooling speculatively, hand-rolled their own verification, and filed a defect. The hard-stop behaved exactly as designed — it simply had nowhere to hand off to. Say that plainly rather than treating these as bug reports about broken tooling.

State what changed: the seam now runs through all three layers, and an unmatched stack generates its own adapter instead of stopping.

Do NOT close `83069d1a` — that consumer's whole `_wxAI/` tree was missing, a kit sync/bootstrap defect with a different root cause.

**Added 2026-10-02: a fourth report, `8a4e0de4`** — Tauri 2 + Rust + React + embedded Firebird 5, `/wxCreateTestPlan` stopped with `no-match` (best candidate `dotnet-wpf`, score 0). Same class, closed by the same release. The reporter offered their `cargo test` layout; it is the first real non-wxKanban tree available to verify T010/T013 against (RISK-3).

**Added 2026-10-05: a fifth report, `3626c874`** — Express + React + SQLite (better-sqlite3, no Drizzle), `implement` Phase 5b resolved `wxkanban-express` as **shipped** on `express vitest playwright react node`. The opposite failure from the other four: a confident *wrong* match rather than a miss. The reporter announced the adapter but refused to seed from it, which is the right call. Closed by T020; credit the refusal.

**Added 2026-10-19: a sixth report, `1565dac1`** — `stack.md` declares Web (Express / Vitest / Playwright) and Mobile (Express API / Expo / Jest / Detox); code is `api/` + `mobile/`. Kit v1.7.61 had no adapter and the skill stopped, correctly. On v1.7.83 the resolver returns `wxkanban-express` from the Web table and never mentions Mobile, so generation never runs for it. Near-duplicate of `0e8e034d`. Status `needsinfo` (asked whether the Web section is a `/buildstack` leftover). Closed by T021, and fully by T014.

Forward-looking measure (SC-7): no new "no adapter for X" report within one release cycle.

Depends on T018, T020.

### T020 — Resolution excludes an adapter whose required tokens the stack lacks (FR-001)

Decision 25 (spec, *Session 2026-10-05*). Scoring only adds, so a shipped adapter wins on shared framework and test-tool tokens even when the stack declares a database its machinery cannot serve — feedback `3626c874`, and the Python / FastAPI hole recorded on 2026-10-02.

Acceptance:
- `resolve-adapter.mjs` reads `**Requires:**` — space-separated groups, `|` between alternatives — and excludes an adapter missing any group before it is scored, so it can neither win nor tie
- Excluded adapters are returned with the groups they missed, and printed in the miss
- `wxkanban-express` declares `express postgresql|postgres`; `dotnet-wpf` declares `wpf`; a test pins that every shipped adapter declares the line
- Express + SQLite and Python / FastAPI + PostgreSQL web stacks are `no-match` (exit 3); `Supabase (Postgres)` still resolves to `wxkanban-express`
- wxKanban's own `stack.md` and the .NET fixture resolve exactly as before (SC-6)
- README *Writing your own adapter* documents the line

Depends on T002.

### T021 — Resolution reports every declared application type, so none is silently dropped (FR-001)

Decision 26 (spec, *Session 2026-10-19*). Without `--app-type` the resolver pools every declared type and returns the best one, so a Web + Mobile project gets the web adapter and its Mobile type never reaches `no-match` or generation — feedback `1565dac1`.

Acceptance:
- Without `--app-type`, the result keeps its top-level answer and exit code, and adds `byAppType`: one entry per declared type with `resolved`, and either the adapter name or the miss reason
- The CLI prints a note for every type that misses, or resolves to a different adapter than the top-level one, naming the exact `--app-type <type>` command
- With `--app-type`, or with a single declared type, the result carries no notes and behaves exactly as before
- `wxCreateTestPlan` (skill and both command stubs), `implement` Phase 5b and `/preTest` tell the caller to pick the application type from the files the target touches, announce it, and re-resolve with `--app-type` when it is not the top-level one
- Regression fixture: the reporter's Web + Mobile `stack.md` resolves top-level to `wxkanban-express`, and `byAppType` names `mobile` as `no-match`
- wxKanban's own `stack.md` still resolves to `wxkanban-express` (SC-6)

Depends on T002, T020.
