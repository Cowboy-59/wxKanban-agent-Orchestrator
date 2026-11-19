# Task Breakdown: Time and Billing

**Feature**: Time and Billing
**Spec**: 005
**Date Generated**: 2026-11-01
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

- [x] T001 Write schema SQL for Time and Billing (owner applies) — FR-002, FR-005, FR-008, FR-009, FR-011, FR-012
- [x] T002 Declare the new columns in Drizzle after the DDL is live — FR-002, FR-005, FR-008, FR-009, FR-011, FR-012
- [x] T003 Rounding and rate resolution helpers — FR-005, FR-007, FR-008
- [x] T004 Time lines and totals query (TimeBillingService) — FR-002, FR-003, FR-004
- [x] T005 Manual entries with locking and corrections — FR-005, FR-011
- [x] T006 Side timer and automatic notes — FR-006
- [x] T007 Daily agent-run pull into Resource lines — FR-007
- [x] T008 Rates and ACH settings with encryption — FR-008, FR-012
- [x] T009 Client statement generation — FR-009, FR-011
- [x] T010 Statement summary page (Items Done) — FR-010
- [x] T011 Statement PDF — FR-009, FR-010
- [x] T012 Time and Billing API routes with guard and audit — FR-001, FR-002, FR-013
- [x] T013 Customer billing cycle — FR-009
- [x] T014 TimeBillingPage and route registration — FR-001
- [x] T015 Project list, time lines and range filter UI — FR-002, FR-003, FR-004
- [x] T016 Entry dialog and timer panel UI — FR-005, FR-006
- [x] T017 Statement dialog UI — FR-009
- [x] T018 Rates and ACH settings UI — FR-008, FR-012
- [x] T019 i18n for all Time and Billing strings — FR-003
- [x] T020 Contract and unit tests — FR-001, FR-005, FR-007, FR-009, FR-011, FR-012, FR-013
- [x] T021 Endpoint test as ADMIN in the running app — FR-001 to FR-014
- [x] T022 projectbillings table: SQL 0073 (applied and verified 2026-11-02) and its Drizzle declaration — FR-014
- [x] T023 Billable-project resolver (own + engaged) used by the list, entries, timer, rates, statements and agent pull — FR-002, FR-014
- [x] T024 Cross-tenant isolation tests for engaged client projects — FR-014, FR-013
- [ ] T025 Amendment C: project list sorted by name with a "Billable" checkbox; a clock at each project row's right edge opens a Start timer window (pick the line) — FR-002, FR-006
- [ ] T026 Amendment D: migration 0074 widens projecttimeentries_line_check to dba, management, meeting (apply by hand, verify) — FR-003
- [ ] T027 Amendment D: DBA, Management, Meetings Developer-only lines through types, validation, totals, timer, lines table, Start timer window and statement summary groups; i18n in 6 languages — FR-003, FR-006, FR-010
- [x] T028 Amendment F: migration 0077 adds projecttimeentries.pausedat (timestamp, null) and pausedseconds (integer, not null, default 0, >= 0) — apply by hand, verify, then declare — FR-006
- [x] T029 Amendment F: timer Pause/Resume — service (pause, resume, active-time stop, frozen elapsed), POST /timer/pause and /timer/resume, Pause/Resume button on the timer card, i18n in 6 languages, tests — FR-006
