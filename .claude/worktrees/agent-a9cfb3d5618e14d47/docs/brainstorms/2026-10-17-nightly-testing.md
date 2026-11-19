# Brainstorm: Nightly testing — unattended overnight test runs in UAT

- **Status:** closed
- **Opened / last updated:** 2026-10-17 / 2026-10-17
- **Source:** customer meeting notes, 2026-10-16 (group 4 of 4)
- **Asked for by:** one customer
- **Level:** senior

## The request

From the meeting notes:

- An AI with a browser signs into the app as a **normal user, not an admin**, and navigates and
  tests it on its own.
- About 5 functions are tested per night, on a schedule, over the next month.
- The runs happen overnight, keeping the machine awake (macOS `caffeinate`), so they don't slow the
  machine during the day.
- Their evidence of the value: the AI fixed 5 workflows in an hour that would have taken 3–5 hours by
  hand.

This group also carries **P1 from group 1**: choose each night's functions from what the day's
changes reached, not by blind rotation.

**The need behind it, as agreed:** every morning the team knows whether anything broke.
Unattended overnight runs exercise the app as a normal user, in a safe environment. They cover what
the day's changes reached plus a rotating share of the rest, and their results land in wxKanban's
test history. Nobody spends the day testing by hand.

## What already exists

| Item | Status | Evidence | Confidence |
|---|---|---|---|
| run-wxkanban: headless Chromium driver signing in as admin, manager, member, or sysadmin | Built; runs against the **production database** (test company only, and only its `companies` row is restored); signs in by minting a cookie, not through the sign-in page | `.claude/skills/run-wxkanban/SKILL.md:16-21`, `driver.mts:57-62` | Confirmed |
| wxPreTest: clones the live schema into a disposable `wxktest_` schema, seeds it, boots the real app, drives the routes and screens of a scope, and repairs within a bounded loop that cannot weaken assertions | Built, triggered per scope. The clone sits **inside the same database instance** | `_wxAI/skills/wxPreTest/SKILL.md:3,65` | Confirmed |
| wxCreateTestPlan test items per scope; gates 1–2 run by machine | Built | its SKILL.md | Confirmed |
| Test-run tools and history (start, progress, complete); `runnerType` ai-agent / ci / manual; `environment` local / ci / uat / production | Built | `mcp-server/src/tools/test-lifecycle.ts:124-126` | Confirmed |
| Seeded non-admin users | Built | `tests/seeds/_base/seed.ts` | Confirmed |
| `machine-capacity.mjs` (how many agents a machine can run at once) | Built (in wxG-O-D) | `.claude/skills/wxG-O-D/scripts/` | Confirmed |
| Any schedule (cron, nightly CI, Task Scheduler) | Not found (the only workflow is `auditfences.yml`, which runs on push) | `.github/workflows/` | Confirmed |
| Rotating N functions per night | Not found | — | Confirmed |
| Autonomous exploration | Not found (everything follows a plan) | — | Confirmed |
| KAIN autonomous driver (SCOPE-132) | Planned (draft); drives development sessions, with no testing and no schedule | `specs/Project-Scope/132-*.md` | Confirmed |
| A UAT environment for wxKanban | Not known (the local `.env` is production) | memory | Likely |
| Alitho Workbench and wxHub | Portals that open their applications with a login or Entra ID (per Andy, 2026-10-17); not represented in this repo | — | Confirmed (by owner) |

## Panel

**Spoke:** Lead Architect (chair), Domain Analyst, Database, QA, Security, DevOps, Backend.

**Sat out:** Legacy, Migration, Frontend, Documentation.

## Decisions

| # | Item | Decision | Kind | To scope? | Date |
|---|---|---|---|---|---|
| 1 | The need | As stated above | Agreed | yes | 2026-10-17 |
| 2 | Who | Both wxKanban and kit customers' apps, through one runner and the SCOPE-127 stack adapters. A stack with no adapter is reported as "not supported", never a silent pass | Agreed | yes | 2026-10-17 |
| 3 | Reuse or build new | `wxPreTest --nightly`. **Reuses:** wxPreTest, wxCreateTestPlan items, SCOPE-137 Change Impact, the test-run tools and history, the adapters, and the seeded non-admin users. **Builds:** nightly selection, schedule installation, test accounts, failure handling, and a morning summary in wxKanban and on the Cockpit dashboard | Agreed | yes | 2026-10-17 |
| 4 | Release | One complete release after SCOPE-137 (it does not depend on 138 or 139). Release test: a week of nightly runs in **Alitho's UAT**, including a planted break that gets caught | Agreed | yes | 2026-10-17 |
| 4+ | Test-data cleanup | **A choice**, set per project: **remove all test data at the end** (default), **keep on failure only** (removed on the next run), or **always keep**. Removal touches only data the run created, tracked by run id, and is verified afterwards; anything left over is reported | Added | yes | 2026-10-17 |
| 5a | Never against production | Always a **separate database instance**, using the developer's chosen engine from `stack.md` (**PostgreSQL by default**, provided through Docker if needed) or the project's UAT database. **Hard refusal** before touching anything when the database host or app address matches the Production list or is not on the UAT list. No override flag. wxKanban's own runs use a local Docker PostgreSQL, never the `.env` production URL | Agreed | yes | 2026-10-17 |
| 5b | What runs each night | **Impact first:** every test item whose code or screens the changes since the last nightly run reached, with no cap. **Rotation:** the remaining slots (default 5, configurable) go to least-recently-tested items. **Time budget:** the night ends at 6:00 local by default; impacted items run in risk order (Impact Boundary crossings first) and anything left carries to the next night. **Coverage** is shown in the summary | Agreed | yes | 2026-10-17 |
| 5b+ | Time estimate | Before starting, the run estimates its time to completion from per-item history (a first run uses defaults and says so). **If the estimate is over 10 hours, the set is split across nights.** The estimate is compared with the actual time each morning | Added | yes | 2026-10-17 |
| 5c | Pass/fail versus exploration | Plan-driven wxCreateTestPlan items through wxPreTest are the only pass/fail. **Exploration**, as a normal user, produces "Observations: needs a human look", with screenshots and repro steps, and is never counted as failure. An observation a person confirms becomes a new test item | Agreed | yes | 2026-10-17 |
| 5c+ | Usability pass | The **UI/UX persona** (wxUIUXCodeReview's methodology, fetched from the MCP) is applied to the running screens as the normal-user role. It flags: anything **more than 3 clicks** from the signed-in home page (with the click path); **fields out of order** (tab order differs from visual order, required fields after optional ones, related fields split, an order that doesn't fit the task's flow); and other odd issues (inconsistent labels, dead ends, hidden or ambiguous actions, a missing confirmation on a destructive action, unclear errors). Reported as **"Usability observations"**, never pass/fail, each with the screen, the problem, why it confuses, and a suggested change. Each is reported once, tracked until fixed or dismissed, and can be sent to wxBrainstorm | Added | yes | 2026-10-17 |
| 5c-chg | Where exploration and usability run | Both run in a **background helper** with its own browser session and its own normal-user account, tagging its data with the run id. It starts with the main run and stops at the night's end time at the latest, **never extending the night**. It runs only if `machine-capacity.mjs` says the machine can carry both. The main run is pure pass/fail | Changed | yes | 2026-10-17 |
| 5d | Where it runs | **Default: installed on the UAT server** (`wxPreTest --nightly --install`), scheduled by the server (cron, a systemd timer, or Task Scheduler). A **designated agent identity** with its own Claude subscription runs the background helper headless; check that the plan's terms allow unattended service use, otherwise use an API key or a dedicated seat. Runs, results, and observations are recorded **as the designated agent**. The UAT server should have no network route to production. **Fallback:** the developer's machine, using the OS scheduler, a wake timer, and keep-awake held only during the run (`caffeinate` on macOS, a keep-awake request on Windows, `systemd-inhibit` on Linux). `--uninstall` removes everything. CI and cloud agents are not built | Agreed | yes | 2026-10-17 |
| 5e | Test accounts | Dedicated seeded **normal-user** accounts (at least two: one for the main run, one for the helper; a manager is optional), seeded through the adapter or supplied by the customer, **never a real person's account**. Sign-in goes through the real sign-in page; two-factor codes come from a stored authenticator secret. Secrets live only in the UAT server's secret store, referenced by name; password fields are masked in screenshots; nothing secret appears in logs, results, or the summary. Expiring or failing credentials are reported. **Permission check:** the normal user must be refused on a sample of admin-only pages, and a leak is a **failure** | Agreed | yes | 2026-10-17 |
| 5f | On failure | **Report, diagnose, propose.** Re-run once, and list **flaky** tests separately. For each real failure: a diagnosis (what failed, the likely cause, the Change Impact link where relevant), a **proposed fix as a patch file** that cannot weaken assertions (following wxPreTest's repair rule), and a **wxKanban task**, deduplicated across nights. **Never** commit, merge, push, deploy, or edit tests to make them pass | Agreed | yes | 2026-10-17 |
| 5g | Portal entry path (Workbench, wxHub) | **Defined once** in the shared configuration (beside the UAT and Production lists): **direct**, or **through a named portal**. Nightly testing, Teaching Skills (138), and Onboarding Videos (139) all use it. Workbench and wxHub open apps with a login or Entra ID, so test accounts use a **local, non-Entra test login**. Every morning summary states **"Entra ID sign-in not tested nightly"**, and Entra stays a human UAT check. A missing portal assignment for a test account is reported as a setup problem, not an app failure. The portal hand-off (sign-in, opening the app, returning) is tested every run | Added | yes | 2026-10-17 |
| 6 | Fit and priority | **Now**, as a **new scope** after SCOPE-137, referencing SCOPE-120 (wxPreTest), 127 (adapters), 111 (test runs), and 137 (Change Impact) | Agreed | yes | 2026-10-17 |
| P1 | From group 1: impact-first selection | Resolved as 5b | Agreed | yes | 2026-10-17 |
| D1 | Automatic fixes (commit unattended) | Declined: an unattended agent changing code overnight is unsafe; code goes through `/implement` and a person | Declined | no | 2026-10-17 |
| D2 | CI and cloud-agent hosting | Not built for now; the UAT server is the default | Declined | no | 2026-10-17 |

## Follow-ups (outside this scope)

1. `/buildscope --edit 138` and `/buildscope --edit 139` to add the shared portal entry path (5g).
   Lessons for portal-hosted apps start at the portal.
2. `/buildscope --edit 065` to point its deferred "video generation" note at SCOPE-139.
3. **Alitho pilot prerequisites** (Alitho's own work):
   - a **UAT-only** local, non-Entra test login in the Workbench, enabled by a setting production
     refuses, limited to the designated test accounts; it must never reach production
   - a designated agent account
4. **wxHub:** testing user id and password for the test accounts.

## Risks to carry into the scope

- The production database is the default `.env` target in this repo, so the separate-instance
  refusal is the main safety rule.
- A UAT-only local login in a portal is a back door if it ever reaches production.
- Subscription terms for an unattended designated agent are unverified.
- Exploration and usability findings must never leak into pass/fail, or the morning report
  stops being trusted.

## Open items

None.

## Next step

**Done (SCOPE-140):** `/buildscope --from-md` built `specs/Project-Scope/140-nightly-testing.md`
and its checklist. The draft passed the buildscope gate (valid, 93).

**Added during the `/buildscope` interview (approved):**

- **Compliance artifacts.** Written after a completely successful run, only for frameworks ticked in
  the project's compliance settings, to `artifacts/<release version>/<framework>/`: a PDF from
  SCOPE-126's renderer, JSON evidence, and a SHA-256 manifest whose fingerprints are recorded in
  wxKanban. Covers SOC 2, HIPAA, GDPR, NIST SSDF v1.1, and ISO 27001:2022 (15 SDLC controls).
  Wording states what was checked and found, never "compliant".
- **HITRUST, no shortcuts.**
  - The source is the customer's licensed CSF v11.9.0. The CSF is licensed to MyCSF subscribers,
    assessors, and readiness licensees, for internal business purposes.
  - The crosswalk is cross-checked through NIST, signed off by the External Assessor, and stored in
    the customer's project only.
  - No artifact is written until it's signed. The local 01–17 taxonomy is never used.
- **Run length.** On a dedicated UAT environment there's no time limit and no split, and runs never
  overlap. Runs split past 10 hours only on the developer-machine fallback.
- **New terms in `CONTEXT.md`:** Nightly Run, Observation, Designated Agent, Entry Path.

**Still open:**

- Alitho's MyCSF access (CSF v11.9.0) and an engaged External Assessor.
- The subscription terms for an unattended Designated Agent.

**Not yet done:** `/createSpecs`, and the follow-ups listed above (138, 139, 065, the SCOPE-113 NIST
800-53 amendment, the Alitho and wxHub prerequisites).
