# Verification: Nightly Testing

**Spec**: SPEC-140 · **Task**: T015 (fixture part) · **Run**: 2026-10-17

The owner runs the release test (SC-10) on wxHub. Nothing here was run against wxKanban's app or
database: every test uses a temporary project, a local fixture portal and app, and a stub of the
hosted MCP that records every call.

## Success criteria on fixtures

| SC | What was run | Result |
|---|---|---|
| SC-1 | `checkTargets` for a production app, an unlisted app, a production and an unlisted database, an unreadable address, no lists; then a **whole `nightly.mjs run`** pointed at a production address | **Pass**. Every case refused with the rule named and no credential echoed; the full run refused before any MCP call (0 `start_test_run`, 0 tasks, no artifacts) |
| SC-2 | Selection with changed, reached and boundary files; a too-broad change; carried items; coverage over a cycle | **Pass**. Every reached item first (boundary crossings first, no cap); rotation least recently tested first; unmapped items by rotation only and listed; the cycle completes and restarts |
| SC-3 | Estimate from history (defaults stated), the split on the fallback, the lock | **Pass**. UAT never splits; the fallback carries what does not fit, with the reason; a second run never overlaps a live one, and a stale lock is taken over. (±25% after 5 nights is measured on wxHub) |
| SC-4 | The helper on a fallback night | Built: the main run waits at most 5 s for the helper, then stops it and says so. Measured on wxHub |
| SC-5 | Observations merged over five nights | **Pass**. Reported once, marked fixed when gone, never again once dismissed; none carries pass/fail. The full run filed `[Observation] /app/d: click-depth` (4 clicks) and `/app/form: tab-order` |
| SC-6 | Retry; patch rules; two nights with the same failure | **Pass**. Pass, flaky and fail told apart; a patch touching a test or removing an assertion is refused; **one** task across two nights in the full run |
| SC-7 | Cleanup choices; docker and command forms with leftovers | **Pass**. Remove, keep on failure, keep; leftovers counted and reported |
| SC-8 | The full run with an admin page that answers 200 to the normal user | **Pass**. The run failed, naming `/app/admin`; no evidence written |
| SC-9 | Secret scan; the full run's every output searched for every secret value | **Pass**. Values never echoed (names only); no secret in any file the run wrote; the signed-in session file deleted |

## Also checked

- **Real sign-in in a real browser** (Playwright Chromium): sign-in page, the RFC 6238 authenticator
  code (the RFC's own test vectors pass), the portal tile, the app opening. A portal without the app
  tile is reported as a **setup problem**, not an app failure.
- **The agent path**: an item with no automation went to the agent command, which read its prompt on
  stdin and reported each attempt with `nightly.mjs record`; the failing item was re-run once and got
  one task.
- **Evidence**: written only after a green run, only for ticked frameworks (SOC 2 here). The PDF is
  real (`%PDF-`), the manifest fingerprints match the files, and the
  `compliance_artifact_written` metadata passes the MCP schema. HITRUST was refused for want of a
  signed crosswalk, and the summary says why. Every control id mapped exists in the repo's SCOPE-112
  and SCOPE-113 catalogs (a test reads them). The wording rule refuses "compliant" and "certified".
- **`start_test_run`**: `dryRun` returns the items with subjects and risk tier and writes nothing; a
  real run still opens exactly one run (fake-database test).
- **Install / uninstall, live on Windows Task Scheduler** with a temporary project: the generated task
  was accepted, then removed, with no residue.
- **Cockpit card**: rows for results, failures with tasks, the permission check, Observations,
  cleanup, evidence and what was not tested; a refused run shows as refused. The Help entry lists
  `--nightly`, `--install`, `--uninstall`.
- Suites: 46 nightly tests (units, the end-to-end run, the Cockpit card) and the MCP tests pass; MCP
  and Cockpit typecheck clean; `auditfences` finds nothing new (one legacy file re-hashed
  surgically, with an amendment).

## Open (owner)

- **SC-10** on wxHub: 7 nights through its Entry Path with a planted break caught. Prerequisites: a
  UAT-only local test login enabled by a setting production refuses, two normal-user test accounts,
  a Designated Agent account, and the `docs-workspace/config.json` `nightly` block (see the wxPreTest
  skill, Nightly mode).
- Constraint 13: confirm the subscription terms allow an unattended Designated Agent.

## Release (T016), 2026-10-17

| Channel | Shipped | Verified how |
|---|---|---|
| App + MCP (push `660a2e38..e2a8b2b3`, commit `c3ae156a`) | App 1.5.342; MCP: start_test_run dryRun/itemIds/subjects; nightly_run_completed, compliance_artifact_written, onboarding_video_generated | Both App Runner deploys **SUCCEEDED**; `/api/version` reports 1.5.342. Live `start_test_run` with `dryRun` returned 153 items with subjects and opened no run. Each new event type was accepted as a type and refused only for its probe metadata (nothing written); an unknown type is refused as a type |
| Kit v1.7.81 (GitHub release) | nightly.mjs and nightly/, video.mjs (both copies), skills, preTest and wxHelpGenerate commands | Published assets byte-match the local build. In the downloaded archive: the nightly modules, identical video.mjs copies, the --nightly and --video Help flags, version 1.7.81, none of the orchestrator's uncommitted SCOPE-068 work (set aside and restored byte for byte). The published nightly.mjs and video.mjs ran their checks. The release printed the HyperFrames pin review (0.8.113; newest 0.8.169) |
| Cockpit 0.2.43 (Marketplace) | Nightly morning summary card; Onboarding videos group | The packaged bundle contains the card, the onboarding- grouping and the last-summary reader; published |
