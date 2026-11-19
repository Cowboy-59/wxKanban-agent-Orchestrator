# Tasks: Test Suite Lifecycle

**Spec**: 111 — Test Suite Lifecycle
**Scope**: SCOPE-111 (`specs/Project-Scope/111-test-suite-lifecycle.md`)
**Spec ID**: `f5552f9a-e581-46d1-8cdf-6e09569d1b22`
**Status**: planned
**Phase**: design
**Created**: 2026-07-25

---

44 tasks, created and linked to spec `f5552f9a-e581-46d1-8cdf-6e09569d1b22`.

## Data layer

- [ ] **T001 — Extend testplans with project, force flag, and provenance**
      `7ace36b0-1841-44e2-a9ab-662310767f0b`
- [ ] **T002 — Create testplanitems table**
      `f1c317a3-af6b-417a-a37e-df9cdc62912e`
- [ ] **T003 — Create testitemsubjects table**
      `7612f7c1-dcb2-4e65-a254-9ba8703919f9`
- [ ] **T004 — Create testcycles table**
      `45794620-dd00-488d-9fc7-fceb28b9242a`
- [ ] **T005 — Create testruns table**
      `caa7726e-0b18-4f0a-b7f7-144f43b83a3e`
- [ ] **T006 — Create testrunresults table**
      `f9874738-1aa7-4b35-b80b-f7e2c3db4c63`
- [ ] **T007 — Create testsignoffs table**
      `774673c5-ad0b-4530-8ca2-940f6035f987`
- [ ] **T008 — Create testretests table**
      `b4876797-f194-4678-bffc-50586d54cc67`
- [ ] **T009 — Generate the additive migration and index the gate query paths**
      `082c9ce5-de67-46ba-81cc-fd0dedf0065b`
- [ ] **T010 — Schema conformance tests**
      `833ee7c9-6f35-4e99-ad90-fab61e826bfd`

## Services

- [ ] **T011 — TestPlanService**
      `0c341a61-eb43-453e-8cde-cfc4ed05ca4f`
- [ ] **T012 — TestCycleService**
      `d5ca644a-ed7d-4f46-ba84-5c5197e1ae02`
- [ ] **T013 — TestRunService**
      `41f0d5c0-689a-480b-8f9e-cc855aed9be5`
- [ ] **T014 — TestRegressionService**
      `4902542f-a0ec-4b0c-ac91-1a6cb649edc6`
- [ ] **T015 — TestImpactService**
      `8c4b4790-ce79-4e5a-b0d5-8b85cb33fc67`
- [ ] **T016 — TestSignoffService**
      `ee816b62-3541-4dfe-bd73-7d69db974e4f`
- [ ] **T017 — TestGateService — the single source both the UI and the release commands read**
      `adb6e8d6-491a-45da-96a8-e40d7c08e921`

## Routes

- [ ] **T018 — Suite routes**
      `368fdc93-f0eb-427f-983e-0d7c99b7fb4a`
- [ ] **T019 — Run routes**
      `6926ab8d-faad-4df7-ab45-5d4886c6e2ca`
- [ ] **T020 — Cycle, regression and impact routes**
      `76598bda-ccad-4531-b5fb-771d1da464f0`
- [ ] **T021 — Signoff, dismissal, waiver and gate routes**
      `a05bd0d8-6033-46a0-9485-b7f70b5f4ad0`
- [ ] **T022 — File a bug report from a failed test**
      `141c2e1f-bd02-4464-a3be-a12a93fb6563`
- [ ] **T023 — Route integration tests**
      `3ce42f46-29d2-4629-a6c6-41dc12f7d1c7`

## Gate integration

- [ ] **T024 — Wire the gate into PhaseService.checkCompletion**
      `9a21aad3-812d-4ce3-ac54-8c6032084444`
- [ ] **T025 — Release the human set on promotion to UAT**
      `7086db9e-6bde-4c7c-9445-1d9ffa4158d5`
- [ ] **T026 — Audit every governance action**
      `a8e0cb83-282a-4c23-9ae2-d881547cd140`

## MCP

- [ ] **T027 — MCP tools for the runner and the kit**
      `53ebe697-5d9b-43b0-b83d-3cd9f1b6304a`
- [ ] **T028 — Register the new tools in BOTH places**
      `e14c66fc-965f-4cc0-8eef-cca30ccbf863`

## Client

- [ ] **T029 — TestRunPanel replacing the flat QA task list**
      `f538bb95-64ef-4377-b9c5-a39423178438`
- [ ] **T030 — Live run view**
      `07a1afdf-a029-497f-b307-1f8f2752af4f`
- [ ] **T031 — Cycle header, run history and broad-change notice**
      `ec1f6f75-f8bc-4bf7-b9f9-9c3a3bd64821`
- [ ] **T032 — Regression view**
      `d39ae53f-2c6f-4215-85f3-a6eeeb9b70f6`
- [ ] **T033 — UserTestPanel replacing the flat User Testing task list**
      `3cbba24f-cc1e-451a-8fbf-8ff16bfd93f7`
- [ ] **T034 — Failure capture and its bug report**
      `3552013c-c201-4a97-8014-d4914e676f49`
- [ ] **T035 — Add-a-test dialog**
      `91d8f12c-0347-42f3-b781-ca7ae373c5ac`
- [ ] **T036 — Retest badge, reason and dismiss control**
      `7741df50-5b4f-406b-a3a4-9525a39a6976`
- [ ] **T037 — Force controls and waiver control**
      `757b85cf-1466-45c9-a39c-f81f322e4fc0`
- [ ] **T038 — Localise every new string**
      `3a4ef497-e070-4b17-99dc-722f40b73eea`

## Kit / runner

- [ ] **T039 — Rewire wxCreateTestPlan filing to the new structure**
      `c2eaed1b-5c76-4ab0-92e0-f6113dcbb047`
- [ ] **T040 — Rewire the --Execute path onto the run API**
      `ad3cd2cc-5ec5-4470-85df-fd94c7873c72`
- [ ] **T041 — Runner-side dependency graph and impact reporting**
      `2eb3e1bd-a38a-4fec-977b-007abd320fa3`
- [ ] **T042 — Gate the release commands on the same verdict**
      `47bdc9e9-a400-4bff-bf04-3889c30d494d`

## Prerequisites and verification

- [ ] **T043 — Add the browser test runner the ui-flow gate needs**
      `1d421634-c12d-45de-bb59-cd84b1f4b825`
- [ ] **T044 — End-to-end verification**
      `a0facd98-59ca-4e73-a64a-f3900bc41a37`

## Post-release hardening — GAP-05 (feedback c5569938)

Raised by `/wxCreateTestPlan 111` Phase 2C constraint-gap analysis, not by a defect in
production. `testplanitems.forcetest` is three-state (null = inherit the plan flag, FR-030)
and nothing outside `TestPlanService.resolveForce` recorded that null is meaningful. A
`SET NOT NULL DEFAULT false`, a writer coercing null to false, or a drop-as-unused would
silently un-force every inheriting item — failing **open**, so tests stop blocking the
release rather than starting to.

`tests/schema/scope111-test-suite-lifecycle.test.ts` already guarded the **Drizzle
declaration**. These two tasks close the paths that test cannot see.

### T045 — Assert forcetest nullability on the DEPLOYED schema, not just the declaration

- [x] Schema changes here are applied manually with no migration ledger, and `db:drift`
      compares tables only — a hand-applied `ALTER COLUMN` is invisible to every existing
      gate. Adds `information_schema` / `pg_attribute` assertions plus a column comment
      (migration `0063`, applied to production 2026-08-03) so the database itself states
      that null is meaningful. All four assertions verified passing against production.
      *Not filed to the DB — raised from feedback, not from the original task breakdown.*

### T046 — Stop wxDBAnalyze recommending action on an all-null column that is all-null by design

- [x] The `data.all-null-column` rule flagged `forcetest` (0 of 178 rows written) and asked
      whether to drop it or find the missing writer — both wrong here. Adds
      `analysis.intentionalNullColumns` to `.wxai/db-policy.json`; a declared column is
      withheld from that finding and re-emitted at `info` with its reason, so it is
      attributed rather than silently filtered.
      *Not filed to the DB — see above.*
