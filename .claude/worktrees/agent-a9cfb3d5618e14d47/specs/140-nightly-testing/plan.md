# Implementation Plan: Nightly Testing

**Spec**: SPEC-140 (`91d5e439-efa1-4a33-9744-308ff44095b9`) · **Scope**: SCOPE-140
**Fence label**: `[SCOPE 140 / Tnnn]`

## Read this first

**Safety comes first.** This repo's `.env` points at **production**, and wxPreTest today clones
inside the **same database instance**. T002, the separate-instance refusal, is built and tested
**before** anything is allowed to run unattended.

**It depends on SPEC-137** for impact-first selection (T003) and for the CC8.1 change log in the SOC 2
artifact (T013). It does **not** depend on 138 or 139.

**The release test needs Alitho's prerequisites**, which are Alitho's own work:

- a UAT-only local test login in the Workbench, enabled by a setting production refuses
- a Designated Agent account

HITRUST artifacts also need a signed CSF v11.9.0 crosswalk.

## Architecture

```mermaid
flowchart TD
  S[UAT server scheduler] --> G{refusal check<br/>DB host + address vs lists}
  G -- production / unlisted --> R[refuse, report, stop]
  G -- UAT --> E[estimate time]
  E --> SEL[select: impacted (SPEC-137) + rotation]
  SEL --> M[main run: wxPreTest drive<br/>Entry Path, normal user]
  SEL --> HLP[background helper<br/>exploration + usability]
  M --> PC[permission check]
  M --> F{failures?}
  F -- yes --> RR[re-run once] --> D[diagnose + patch + task]
  HLP --> OB[Observations as tasks]
  PC --> CL[cleanup choice + verify]
  D --> CL
  CL --> SUM[morning summary<br/>test history + Cockpit card]
  SUM --> GR{completely green?}
  GR -- yes --> CA[artifacts per ticked framework<br/>PDF + evidence + manifest]
  GR -- no --> NA[no artifacts, reason stated]
  CA --> HT{HITRUST ticked?}
  HT -- signed crosswalk --> HA[HITRUST artifact]
  HT -- no crosswalk --> HN[none, reason stated]
```

**Run length (T004).** On a dedicated UAT server there's no limit, no split, and no overlap. On the
developer-machine fallback the run ends at 06:00 and splits past 10 hours.

**Pass/fail versus Observations.** Only the main run's planned items produce pass/fail. The helper's
findings are Observations, and they never feed the green-or-red decision that gates the artifacts.

## Build order

| Step | Tasks | Why |
|---|---|---|
| 1 | T002 | Refusal first; nothing runs until it is proven |
| 2 | T001, T010 | `--nightly` skeleton and secrets handling |
| 3 | T005, T006 | Real sign-in through the Entry Path, and the permission check |
| 4 | T003, T004 | Selection (needs SPEC-137) and run length |
| 5 | T008, T009 | Failure handling and cleanup |
| 6 | T012 | Summary, test history, and the Cockpit card |
| 7 | T007 | Background helper and Observations |
| 8 | T011 | Install and uninstall as the Designated Agent |
| 9 | T013, T014 | Compliance artifacts and the HITRUST gate |
| 10 | T015 | Fixtures, then the week in Alitho's UAT |
| 11 | T016 | Release |

## Files touched (expected)

| Area | Files |
|---|---|
| Runner | `_wxAI/skills/wxPreTest/` (`SKILL.md`, references, scripts); the command stub `_wxAI/commands/` |
| Adapters | `_wxAI/adapters/*` (boot, seed, and drive per stack; already used by wxPreTest) |
| MCP | `mcp-server/src/utils/schemas.ts` (two event types) |
| Cockpit | A dashboard summary card in `vscode-extension/src/` |
| Evidence | Reuse SCOPE-126's PDF renderer; read the SCOPE-113 catalogs (`src/db/migrations/0014_*`, `0015_*`) |

## Risks

| Risk | Mitigation |
|---|---|
| An unattended run touches production | T002 refusal with no override; UAT server has no route to production; tested first |
| The portal's local test login leaks to production | It's Alitho's and wxHub's change; it must be refused by a production setting. Flagged in the prerequisites |
| Flaky tests make the morning report noisy | Re-run once; a separate flaky list |
| Observations pollute pass/fail | Separate store (tasks of kind observation); never part of the green decision |
| Compliance overclaim | SCOPE-126 wording; ISO "15 of 93" stated; HITRUST only with a signed crosswalk |
| Subscription terms forbid an unattended agent | Verify before T011; fall back to an API key or a dedicated seat |
| `implement` admits only one spec in progress at a time (SCOPE-123 gap) | Build after SPEC-137 completes |

## Known issues

- **Follow-ups** (outside this spec): add the shared Entry Path to SPEC-138 and SPEC-139 through
  `/buildscope --edit`, and amend SCOPE-113 to add the NIST SP 800-53 Rev 5 catalog.
