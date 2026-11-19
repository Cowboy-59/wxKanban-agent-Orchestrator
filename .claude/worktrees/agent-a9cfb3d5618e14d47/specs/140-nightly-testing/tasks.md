 done |# Tasks: Nightly Testing

Source of truth for status is the DB (spec `91d5e439-efa1-4a33-9744-308ff44095b9`). Fences use
`[SCOPE 140 / Tnnn]`.

## Task table

| Task | Title | FRs | Priority | Status |
|---|---|---|---|---|
| T001 | --nightly mode on wxPreTest | FR-001 | high | done |
| T002 | Non-production instance and hard refusal | FR-002 | critical | done |
| T003 | Impact-first selection and rotation | FR-003 | high | done |
| T004 | Time estimate, run length, no-overlap | FR-004 | high | done |
| T005 | Entry Path, test accounts, real sign-in | FR-005 | high | done |
| T006 | Normal-user permission check | FR-006 | high | done |
| T007 | Background helper: exploration and usability Observations | FR-007 | medium | done |
| T008 | Failure handling: re-run, diagnose, propose, task | FR-008 | high | done |
| T009 | Cleanup choice and verification | FR-009 | high | done |
| T010 | Secrets handling | FR-010 | critical | done |
| T011 | Designated Agent install and uninstall | FR-011 | high | done |
| T012 | Morning summary and Cockpit card | FR-012 | medium | done |
| T013 | Compliance artifacts for ticked frameworks | FR-013 | high | done |
| T014 | HITRUST crosswalk gate | FR-014 | high | done |
| T015 | Verify on fixtures, then a week on wxHub UAT (owner) | SC-1..SC-10 | critical | in_progress |
| T016 | Release and live verification | — | medium | done |
| T017 | Amendment A: a full run on request (`--full`, `install --full-first`, `nightly.fullNext`) | FR-015 | high | done |
| T018 | Amendment A: AI sign-off on each first-attempt pass | FR-016 | high | done |

## Details

### T001 — --nightly mode on wxPreTest (FR-001)

Add `--nightly` to wxPreTest (`_wxAI/skills/wxPreTest/`): one unattended run through the existing seed / boot / drive engine, driven by wxCreateTestPlan items; customer stacks through SCOPE-127 adapters; a stack without an adapter is reported as not supported, never a silent pass. No second copy of wxPreTest's safety rules.

### T002 — Non-production instance and hard refusal (FR-002)

Today wxPreTest clones into a `wxktest_` schema inside the **same instance** as live data (`SKILL.md:65`) and this repo's `.env` is production. Require a separate instance using `stack.md`'s engine (PostgreSQL default; Docker if needed). Refuse before touching anything when the database host or app address is on the Production list or not on the UAT list (shared lists with SPEC-138). No override flag. wxKanban's own runs use a local Docker PostgreSQL.

### T003 — Impact-first selection and rotation (FR-003)

Requires SPEC-137. Select every wxCreateTestPlan item whose code or screens the changes since the last run reached, in risk order (Impact Boundary crossings first), with no cap; fill remaining slots (default 5) by least-recently-tested rotation; track per-item last-run and coverage over the cycle (SC-2).

### T004 — Time estimate, run length, no-overlap (FR-004)

Keep per-item duration history; estimate before starting (first run uses defaults and says so); compare with actual each morning (SC-3, ±25% after 5 runs). Dedicated UAT: no limit, no split; a new run waits for a still-running one and notes the wait. Developer-machine fallback: 6:00 end, split past 10 hours, impacted items first.

### T005 — Entry Path, test accounts, real sign-in (FR-005)

Read the shared Entry Path (direct, or a named portal such as Workbench or wxHub). Sign in through the real sign-in page with a local test login and dedicated normal-user accounts (at least two; never a real person's); two-factor from a stored authenticator secret; test the portal hand-off every run; report a missing portal assignment as a setup problem; state "Entra ID sign-in not tested nightly" in the summary. Unlike `run-wxkanban`, never mint session cookies.

### T006 — Normal-user permission check (FR-006)

Each run, the normal-user account must be refused on a sample of admin-only pages; a reachable admin page fails the run (SC-8).

### T007 — Background helper: exploration and usability Observations (FR-007)

A second session and account; data tagged with the run id. Exploration plus the UI/UX persona (MCP `wxuiuxcodereview`) on live screens: navigation map with click paths (> 3 clicks flagged), field order (tab vs visual order, required after optional, split groups, task-flow order), other odd issues. Observations become wxKanban tasks of kind "observation", deduplicated by screen + issue, reported once, sendable to wxBrainstorm. Runs only if `machine-capacity.mjs` allows; never extends a fallback night (SC-4, SC-5).

### T008 — Failure handling: re-run, diagnose, propose, task (FR-008)

Re-run each failure once; list flaky tests separately. For each real failure: a diagnosis with the SPEC-137 Change Impact link where relevant, a proposed patch file that cannot weaken assertions (wxPreTest's repair rule), and one wxKanban task deduplicated across nights. Never commit, merge, push, deploy, or edit tests (SC-6).

### T009 — Cleanup choice and verification (FR-009)

Per-project setting: remove all (default), keep on failure only (removed by the next run), always keep. Only run-id-tagged data is touched; verify removal and report leftovers (SC-7). Answers SCOPE-120 open question 1 (red-run clone disposition).

### T010 — Secrets handling (FR-010)

Test-account and Designated Agent credentials only in the UAT server's secret store, referenced by name in config; Playwright masking for password fields in screenshots; a secret scan over every output (logs, results, Observations, summary, artifacts) (SC-9); warn on expiring or failing credentials.

### T011 — Designated Agent install and uninstall (FR-011)

`--nightly --install` registers the run on the UAT server's scheduler (cron, systemd timer, or Task Scheduler) as the Designated Agent; all records attributed to it. Fallback: developer's machine with the OS scheduler, a wake timer, and keep-awake held only during the run (caffeinate / Windows keep-awake request / systemd-inhibit). `--uninstall` removes everything. Note: confirm the subscription terms allow an unattended agent, else use an API key or dedicated seat.

### T012 — Morning summary and Cockpit card (FR-012)

Record via start_test_run / report_test_progress / complete_test_run (runnerType ci, environment uat); event `nightly_run_completed` (Zod type, no DDL); Cockpit dashboard card with pass/fail, flaky, failures with tasks, Observations, coverage, estimate vs actual, split or wait, cleanup status, and what was not tested.

### T013 — Compliance artifacts for ticked frameworks (FR-013)

After a completely successful run only, for each framework ticked in `project.get_compliance_context`: `artifacts/<release version>/<framework>/` with a PDF from SCOPE-126's renderer, `evidence.json`, and a SHA-256 `manifest.json`; record fingerprints as `compliance_artifact_written`. Mappings: SOC 2, HIPAA, GDPR, NIST SSDF v1.1 (catalog `src/db/migrations/0014_spec113_nistssdf_catalog.sql`), ISO 27001:2022 Annex A SDLC slice (`0015_spec113_iso27001_catalog.sql`, 15 of 93 stated). SCOPE-126 wording; ISO text in our own words; gitignored by default; a later green run for the same version replaces the folder.

### T014 — HITRUST crosswalk gate (FR-014)

Write HITRUST artifacts only from `artifacts/hitrust-crosswalk/` in the customer's project: CSF v11.9.0 control reference IDs from the customer's licensed CSF, cross-checked through NIST, with the External Assessor's sign-off recorded. Stamp CSF and crosswalk versions; flag re-review on a newer CSF. No signed crosswalk → no HITRUST artifact and an explanation. No CSF content in the kit or product; never the local 01–17 taxonomy.

### T015 — Verify on fixtures and a week in Alitho UAT (SC-1..SC-10)

Fixture tests for SC-1..SC-9, then the SC-10 release test: 7 consecutive nights in Alitho's UAT through the Workbench Entry Path with a planted break caught. Prerequisites (Alitho's work): a UAT-only local test login in the Workbench (enabled by a setting production refuses), a Designated Agent account.

### T016 — Release and live verification (—)

Kit release with `--nightly` verified in the published asset; app + MCP push with a hosted-MCP probe of the two event types; Cockpit VSIX with the summary card and Help text.
