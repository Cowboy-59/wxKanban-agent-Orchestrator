# Scope 140: Nightly Testing

**Scope Number**: 140
**Status**: `draft`
**Created**: 2026-10-17
**Depends On**: SCOPE-137 (Change Impact — impact-first selection and the CC8.1 change log)
**Related Scopes**: SCOPE-120 (wxPreTest — answers its open question 1), SCOPE-127 (stack adapters), SCOPE-111 (test runs), SCOPE-113 (NIST SSDF / ISO 27001 catalogs), SCOPE-126 (evidence PDF and wording rule), SCOPE-138 / SCOPE-139 (shared UAT/Production lists and Entry Path)
**Implemented By**: SPEC-140 (`specs/140-nightly-testing/`)
**Source**: `specs/Project-Scope/140-nightly-testing.md` — converted from `docs/brainstorms/2026-10-17-nightly-testing.md`

## Overview

**Nightly Testing** tells the team every morning whether anything broke, without anyone testing by
hand.

`wxPreTest --nightly` is installed on the project's **UAT server** and runs as a **Designated Agent**
against a **separate, non-production database instance**: the developer's chosen engine, PostgreSQL
by default. Production targets are refused, with no override.

**Run length.** On a dedicated UAT environment the run goes to completion, with no time limit. Its
time estimate is reported for information, and a new run never overlaps one still going. On the
developer-machine fallback, a run estimated at more than 10 hours is split across nights.

**What each run does:**

1. Tests **every item the day's changes reached** (SCOPE-137), then fills the rest by **rotation**,
   least recently tested first.
2. Signs in through the app's **Entry Path** (direct, or through a portal such as Workbench or
   wxHub) with a local test login and **normal-user** test accounts, and checks those accounts are
   refused on admin pages.
3. Runs exploration and a **UI/UX usability pass** in a **background helper**, reporting
   **Observations** (more than 3 clicks deep, fields out of flow order, odd issues). These are never
   pass/fail.
4. **Re-runs failures once** to catch flaky tests. For each real failure it writes a diagnosis,
   proposes a patch, and opens a wxKanban task. It **never** commits, pushes, or edits tests.
5. **Removes its test data** (a choice, and the default) and writes a **morning summary** to
   wxKanban and the Cockpit dashboard, stating what wasn't tested.
6. **After a completely successful run only**, writes fingerprinted **compliance evidence** for each
   framework **ticked in the project's compliance settings** to
   `artifacts/<release version>/<framework>/`. HITRUST is written only from an assessor-signed
   CSF v11.9.0 crosswalk. The evidence states what was checked and found, never "compliant".

It serves wxKanban and kit customers' apps through the SCOPE-127 stack adapters.

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actor** | Development team reading the morning summary |
| **Secondary Actors** | Designated Agent (runs it), Project owner (configures it), External auditor or assessor (consumes the artifacts) |
| **Key Value** | Breakage caught overnight, usability issues surfaced, and audit evidence produced as a by-product — all without manual testing. |
| **Scope Boundary** | IN: wxPreTest --nightly (one unattended run through wxPreTest's engine and wxCreateTestPlan items, for wxKanban and customer stacks via SCOPE-127 adapters); the non-production instance rule with hard refusal; impact-first selection (SCOPE-137) plus rotation; the time estimate (no limit or split on a dedicated UAT environment, with no-overlap; split past 10 hours on the developer-machine fallback); the Entry Path (direct or through a named portal such as Workbench or wxHub) with local test logins and normal-user accounts; the permission check; the background helper (exploration and the UI/UX usability pass reporting Observations); failure handling (re-run, diagnose, propose patch, task; never commit); the cleanup choice; secrets handling; Designated Agent installation on the UAT server (developer-machine fallback); the morning summary in wxKanban and on the Cockpit dashboard; compliance artifacts per framework ticked in the project (SOC 2, HIPAA, GDPR, NIST SSDF, ISO 27001:2022; HITRUST only with an assessor-signed CSF v11.9.0 crosswalk). |

## Business Problem

Breakage is found late, and by hand. Nobody re-tests the whole app after every change, and problems
ordinary users hit (permissions, awkward screens) surface only when customers report them. A
customer (meeting 2026-10-16) proposed an AI with a browser signing in as a normal user and testing
about 5 functions a night, overnight.

wxKanban has the engine already: wxPreTest (disposable schema, seed, boot, drive), wxCreateTestPlan
items, test-run history, and the SCOPE-127 adapters. What's missing or unsafe:

- Nothing runs on a schedule, and nothing chooses what to test each night.
- The ready-made driver, run-wxkanban, runs against the **production** database and mints cookies
  instead of signing in.
- wxPreTest's disposable copy sits inside the same database instance as live data.

Compliance-sensitive customers (Alitho: SOC 2 and HITRUST) also need dated evidence of testing,
environment separation, and change control. Today that evidence is assembled by hand.

## Out of Scope

- Running against production, in any form.
- Committing, merging, pushing, deploying, or editing tests to make them pass (automatic fixes).
- CI and cloud-agent hosting (not built).
- Automating Entra ID sign-in, which stays a human UAT check.
- The portals' UAT-only local test login change, which is Alitho's and wxHub's own work.
- Shipping any HITRUST CSF content in the kit or the product.
- The NIST SP 800-53 Rev 5 catalog, which belongs in a SCOPE-113 amendment.
- Amending SCOPE-138, SCOPE-139, or SCOPE-065 (follow-ups).
- Any database schema change.

## User Scenarios & Testing

### US1 — An ordinary night with a change

**Actor**: Designated Agent on Alitho's UAT server; the team in the morning

1. At the scheduled start, the target database host and app address are on the UAT list, so the run proceeds.
2. It estimates 3.5 hours for 12 impacted items and 5 rotation items (reported for information).
3. It signs in through the Workbench with a local test login as a normal user, opens the app, and runs the 17 items through wxPreTest while the background helper explores and runs the usability pass.
4. One item fails twice: a diagnosis, a proposed patch, and a wxKanban task are created.
5. It removes its test data, verifies the removal, and writes the morning summary: 16 passed, 1 failed (linked to the change that caused it), 2 usability Observations, and "Entra ID sign-in not tested nightly".

**Expected outcome**: The team knows by morning what broke and why; no compliance artifacts because the run was not fully green.

### US2 — A green night with compliance ticked

**Actor**: Designated Agent on a project with SOC 2 and ISO 27001 ticked

1. Every item passes, the permission check passes, cleanup is verified, and the secret scan is clean.
2. It writes artifacts/<release version>/SOC2/ and /ISO27001/ with a PDF, evidence.json, and a fingerprinted manifest, and records the fingerprints in wxKanban.

**Expected outcome**: An auditor gets dated, fingerprinted evidence of what was checked, never a claim of compliance.

### US3 — Pointed at production by mistake

**Actor**: Project owner

1. The configured database host matches the Production list.
2. The run refuses before touching anything and says why.

**Expected outcome**: Nothing happens to production (SC-1).

### US4 — A long run

**Actor**: Designated Agent

1. On the dedicated UAT server the estimate is 13 hours; the run proceeds to completion with no split, and the next night's run waits until it finishes.
2. On a developer-machine fallback the same estimate splits: impacted items run in risk order and the rest carry to the next night, shown in the summary.

**Expected outcome**: UAT runs are never cut short or overlapped; fallback nights never exceed 10 hours; nothing is silently skipped (SC-2, SC-3).

### US5 — Edge cases

**Actor**: Designated Agent

1. The normal user reaches an admin page: a failure (SC-8).
2. A test account's password nears expiry: the summary warns before sign-in starts failing.
3. HITRUST is ticked but no signed crosswalk exists: no HITRUST artifact; the summary says why.
4. The machine can carry only one agent: the background helper skips that run and says so.

**Expected outcome**: Every edge case fails safe and explains itself.

## Functional Requirements

### FR-001 — wxPreTest --nightly

One unattended run through wxPreTest's existing engine (seed, boot, drive), driven by wxCreateTestPlan items, for wxKanban and for customer stacks through SCOPE-127 adapters. A stack without an adapter is reported as not supported.

**Acceptance Criteria**:
- [ ] One engine; no separate copy of wxPreTest's safety rules.
- [ ] No silent pass for an unsupported stack.

### FR-002 — Non-production instance and refusal

A separate database instance using the developer's engine from stack.md (PostgreSQL by default, Docker if needed). Hard refusal before touching anything if the database host or app address is on the Production list or not on the UAT list. No override.

**Acceptance Criteria**:
- [ ] SC-1 holds.
- [ ] wxKanban's own runs use a local Docker PostgreSQL, never the .env production URL.

### FR-003 — Selection

All items reached by changes since the last run (SCOPE-137 Change Impact) run first with no cap, in risk order (Impact Boundary crossings first); rotation fills the remaining slots (default 5, configurable), least recently tested first.

**Acceptance Criteria**:
- [ ] SC-2 holds.
- [ ] Coverage over the cycle is shown in the summary.

### FR-004 — Time estimate and run length

Before starting, the run estimates its time from per-item history (a first run uses defaults and says so) and compares it with actual each morning. On a dedicated UAT environment there is no time limit and no split: the run goes to completion, and a new run waits for one still running rather than overlapping. On the developer-machine fallback, the night ends at 6:00 by default and a set estimated over 10 hours is split across nights, impacted items first.

**Acceptance Criteria**:
- [ ] SC-3 holds.
- [ ] Any wait caused by a still-running previous run is noted in the summary.

### FR-005 — Entry Path and test accounts

Sign in through the real sign-in page via the configured Entry Path (direct, or through a named portal such as Workbench or wxHub) using a local test login and dedicated normal-user accounts (at least two; never a real person's account); two-factor via a stored authenticator secret. A missing portal assignment is reported as a setup problem, not an app failure. The summary states that Entra ID sign-in is not tested nightly.

**Acceptance Criteria**:
- [ ] The portal hand-off (sign-in, open the app, return) is tested every run.
- [ ] The Entra statement appears in every summary for portal-entry projects.

### FR-006 — Permission check

Each run, the normal-user account must be refused on a sample of admin-only pages; a leak is a failure.

**Acceptance Criteria**:
- [ ] SC-8 holds.

### FR-007 — Background helper

Exploration plus the UI/UX usability pass (the wxuiuxcodereview persona applied to live screens as the normal-user role): anything more than 3 clicks from the signed-in home (with the click path), fields out of flow order (tab order vs visual order, required after optional, related fields split, order not matching the task), and other odd issues. Reported as Observations, once each, tracked until fixed or dismissed, and sendable to wxBrainstorm. Own session and account; data tagged with the run id; runs only if machine-capacity.mjs allows; on the developer-machine fallback it never extends the night.

**Acceptance Criteria**:
- [ ] SC-4 holds.
- [ ] SC-5 holds.

### FR-008 — Failure handling

Re-run each failure once; flaky tests are listed separately. Each real failure gets a diagnosis (with a SCOPE-137 Change Impact link where relevant), a proposed fix as a patch file that cannot weaken assertions (wxPreTest's repair rule), and one wxKanban task deduplicated across nights. Never commit, merge, push, deploy, or edit tests to make them pass.

**Acceptance Criteria**:
- [ ] SC-6 holds.

### FR-009 — Cleanup choice

Per project: remove all test data at the end (default), keep on failure only (removed by the next run), or always keep. Only data tagged with the run id is touched; removal is verified and leftovers are reported.

**Acceptance Criteria**:
- [ ] SC-7 holds.

### FR-010 — Secrets

Test account and Designated Agent credentials live only in the UAT server's secret store, referenced by name; password fields are masked in screenshots; secrets never appear in logs, results, Observations, or the summary; expiring or failing credentials are warned about.

**Acceptance Criteria**:
- [ ] SC-9 holds.

### FR-011 — Designated Agent and installation

wxPreTest --nightly --install registers the run on the UAT server's scheduler (cron, systemd timer, or Task Scheduler) to run as the Designated Agent, with all records attributed to it. Fallback: the developer's machine via the OS scheduler, a wake timer, and keep-awake held only during the run (caffeinate, a Windows keep-awake request, systemd-inhibit). --uninstall removes everything.

**Acceptance Criteria**:
- [ ] Install and uninstall leave no residue.
- [ ] Records show the Designated Agent as actor.

### FR-012 — Morning summary

Results are recorded in wxKanban's test history (runnerType ci, environment uat) and summarized on the Cockpit dashboard: pass/fail, flaky tests, failures with tasks, Observations, coverage, estimate vs actual, any split or wait, cleanup status, and what was not tested.

**Acceptance Criteria**:
- [ ] One summary per run.
- [ ] Every summary lists what was not tested.

### FR-013 — Compliance artifacts

Only after a completely successful run (all tests green, permission check passed, cleanup verified, secret scan clean) and only for frameworks ticked in the project's compliance settings (project.get_compliance_context): write artifacts/<release version>/<framework>/ with a PDF (SCOPE-126 renderer), evidence.json, and a SHA-256 manifest whose fingerprints are recorded in wxKanban. Mapped to SOC 2 (CC6, CC7.1/7.2, CC8.1, confidentiality), HIPAA Security Rule sections, GDPR articles, NIST SSDF v1.1 IDs (e.g. PO.5.1, PW.8.2), and ISO 27001:2022 Annex A SDLC IDs (A.8.29, A.8.31, A.8.32, A.8.33, A.8.15/16, A.5.3, A.8.34) with the 15-of-93 coverage stated. Wording states what was checked and found, never "compliant" or "certified"; ISO text described in our own words. Not committed to git by default; a later green run for the same version replaces the folder.

**Acceptance Criteria**:
- [ ] A red run writes no artifacts and the summary says why.
- [ ] Only ticked frameworks get artifacts.
- [ ] Every manifest fingerprint is recorded in wxKanban.

### FR-014 — HITRUST artifacts

A HITRUST artifact is written only with a crosswalk to HITRUST CSF v11.9.0 control reference IDs derived from the customer's licensed CSF, cross-checked through NIST, signed off by the customer's External Assessor, and stored in that customer's project only (never the kit or product). The artifact states the CSF and crosswalk versions; a newer CSF version flags the crosswalk for re-review. Without a signed crosswalk, no HITRUST artifact is written, and the local 01-17 taxonomy is never used.

**Acceptance Criteria**:
- [ ] No signed crosswalk means no HITRUST artifact and an explanation in the summary.
- [ ] No CSF content exists in the kit or product.

## Data Requirements

**No new table and no DDL.** Two Zod event types are added to the existing `events` table, alongside
those from SCOPE-137, 138, and 139:

- `nightly_run_completed`: the Designated Agent, environment, estimate vs actual, selection, results
  summary, cleanup outcome, and which frameworks produced artifacts
- `compliance_artifact_written`: the framework, the release version, and the SHA-256 of every
  manifest file

**Results** use the existing test-run tables, through `start_test_run`, `report_test_progress`, and
`complete_test_run`.

**Failures** become wxKanban tasks (`project.create_task`). **Observations** are tasks of kind
"observation", deduplicated by screen and issue.

**Configuration** lives in a `nightly` block in the shared configuration, beside the UAT/Production
lists and the Entry Path:

- schedule
- end time and split limit (developer-machine fallback only)
- rotation slots
- cleanup choice
- test-account secret names
- background helper on or off
- whether artifacts are committed

**Files:** `artifacts/<release version>/<framework>/` holds the PDF, `evidence.json`, and
`manifest.json`. It's gitignored unless the project opts in.

**HITRUST crosswalk:** `artifacts/hitrust-crosswalk/`, in the customer's project only, versioned
with the assessor's sign-off. Never in `_wxAI/`, the kit, or the product.

## API Routes

MCP: no new tool — reuses project.capture_event (two new types), the test-run tools, project.create_task, and project.get_compliance_context.
App: none new — results appear in existing test history; failures and Observations on the board.

## Frontend Components

Cockpit: a morning summary card on the dashboard (last run's pass/fail, failures, Observations, coverage, links into wxKanban); the wxPreTest Help entry names --nightly, --install, --uninstall.
App: none new.

## Success Criteria

1. SC-1: 100% of runs whose database host or address is on the Production list or not on the UAT list are refused before touching anything.
2. SC-2: Every test item reached by changes since the last run is tested (or, on the developer-machine fallback, carried with a reason) — 0 silently skipped; rotation reaches 100% of items within one coverage cycle.
3. SC-3: The time estimate is within ±25% of actual after 5 runs; on the developer-machine fallback every night estimated over 10 hours is split; on a dedicated UAT environment no run is cut short and no two runs overlap.
4. SC-4: The background helper never extends a fallback night (the main run's end is unchanged with the helper on or off).
5. SC-5: 0 Observations recorded as pass/fail; each usability Observation is reported once until fixed or dismissed.
6. SC-6: A failing test is re-run once; every real failure has a diagnosis, a proposed patch, and exactly one wxKanban task across nights; 0 commits, pushes, or test edits by the run.
7. SC-7: With "remove all", 0 rows created by the run remain after cleanup (verified); with "keep on failure", kept data is removed by the next run.
8. SC-8: The normal-user permission check fails the run if any sampled admin page is reachable.
9. SC-9: 0 secrets in logs, results, screenshots, or the summary (secret scan of the outputs).
10. SC-10: 7 consecutive nights in Alitho's UAT through the Workbench Entry Path, each with a correct morning summary, including 1 planted break caught; on fully green nights, artifacts written only for the frameworks ticked.

## Key Entities

**Nightly Run** — unattended scheduled run of planned tests against a non-production instance; the only pass/fail source (CONTEXT.md).
**Observation** — exploration or usability finding; never pass/fail; tracked until fixed or dismissed (CONTEXT.md).
**Designated Agent** — the dedicated non-human identity runs execute and record as (CONTEXT.md).
**Entry Path** — direct, or through a named portal; shared with SCOPE-138/139 (CONTEXT.md).
**Compliance artifact set** — one per ticked framework per release version, fingerprinted.
**HITRUST crosswalk** — per customer, from their licensed CSF v11.9.0, assessor-signed.

## Constraints

**Delivery**

1. One complete release, after SCOPE-137.
2. Release test SC-10: 7 nights in Alitho's UAT through the Workbench, with a planted break caught.
3. Channels: the kit, an app + MCP push, and the Cockpit VSIX.

**Safety**

4. **Production is never a target.** The refusal has no override, and the UAT server should have no
   network route to production. This repo's `.env` points at production, so wxKanban's own runs use
   a local Docker PostgreSQL.
5. **A local test login in a portal is a back door if it reaches production.** It's enabled only by
   a setting that production refuses, and limited to the designated test accounts.
6. Never commit, merge, push, deploy, or edit tests.
7. Observations never become pass/fail.

**Compliance**

8. Artifacts are written only for frameworks ticked in the project's compliance settings, and only
   after a completely successful run.
9. Wording follows SCOPE-126: what was checked and found, never "compliant" or "certified".
10. ISO 27001 coverage is stated as the 15-of-93 SDLC slice, with no ISMS. ISO text is described in
    our own words.
11. HITRUST evidence comes only from the customer's licensed CSF v11.9.0, used for the customer's
    internal business purposes. The crosswalk is signed off by their External Assessor and kept in
    their project only. wxperts ships no CSF content without its own license, and never presents the
    local 01–17 taxonomy as CSF.
12. NIST SSDF v1.1 is current; v1.2 is still a draft. Update the catalog under SCOPE-113 when v1.2
    is final.

**Open**

13. The subscription terms for an unattended Designated Agent are unverified. If they don't allow it,
    use an API key or a dedicated seat.
14. Alitho's HITRUST prerequisites: MyCSF access with CSF v11.9.0, and an External Assessor
    engaged.

## Compliance Requirements

### SOC 2
- **CC6:** the normal-user permission check (FR-006).
- **CC7.1 / CC7.2:** nightly testing, monitoring, and run records (FR-012).
- **CC8.1:** the SCOPE-137 change log in the artifact (FR-013).
- **Confidentiality:** non-production only, demo data, cleanup, and the secret scan (FR-002, FR-009,
  FR-010).

### HIPAA, GDPR, NIST SSDF, ISO 27001:2022, HITRUST
These map as in FR-013 and FR-014, and apply only when the framework is ticked for the project.

## Notes

- Reuses wxCreateTestPlan items, seeded non-admin users, project.capture_event, project.create_task, project.get_compliance_context, the wxuiuxcodereview persona, and wxG-O-D's machine-capacity.mjs.
- Follow-ups: `/buildscope --edit 138` and `--edit 139` (shared Entry Path); `--edit 065` (video note pointer); SCOPE-113 amendment for NIST SP 800-53 Rev 5; Alitho UAT prerequisites (UAT-only local test login, Designated Agent account); wxHub test credentials.
- Converted from `docs/brainstorms/2026-10-17-nightly-testing.md` (group 4 of a customer meeting, 2026-10-16).

## Clarifications

### Session 2026-10-17

| # | Question | Decision |
|---|----------|----------|
| 1 | Reuse check | No existing scope covers it (all matches < 0.68, unrelated); SCOPE-120 has no scheduling. New scope. |
| 2 | Terminology | Nightly Run, Observation, Designated Agent, Entry Path added to CONTEXT.md. |
| 3 | Compliance evidence | Added during the interview: artifacts per framework ticked in the project, after a fully green run, via SCOPE-126's renderer and wording rule. |
| 4 | HITRUST | Complete, no shortcuts: licensed CSF v11.9.0 crosswalk, NIST cross-check, External Assessor sign-off, customer project only; no artifact until signed. |
| 5 | NIST and ISO | NIST SSDF v1.1 and ISO 27001:2022 (15 SDLC controls) catalogs already in the repo (SCOPE-113); 800-53 Rev 5 is a follow-up. |
| 6 | Run length on UAT | No time limit or split on a dedicated UAT environment; no overlap; split past 10 h only on the developer-machine fallback. |
| 7 | Success criteria | SC-1 to SC-10 as listed. |
