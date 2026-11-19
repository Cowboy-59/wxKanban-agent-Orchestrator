# Plan: Project Agent Feedback Triage

**Spec Number**: 148 (implements SCOPE-132 Amendment C)
**Date**: 2026-10-26

## Implementation Plan

Four areas, built so the server enforces every limit before an agent exists that could test them.
Build after the kit write-safety batch.

### Phase 1: Verify and enforce on the server (T001 – T006)

- T001 first: a live call proving `project.update_feedback_status` accepts the minted
  `project-agent:` token. Nothing in the bridge relies on that path until it is proven.
- T002 the audit row in the same transaction; T003 the server-rendered `resolved` templates and
  refusals; T004 the `recurrence_suspected` guard; T005 the new `triaged` wording in both mirrors.
- T006 `feedbackSink` in the settings route.
- Tests: MCP and route tests with the database and notifications stubbed.

### Phase 2: Inputs and containment (T007 – T009)

- T007 `kitversion` in Cockpit reports and correct version labels in triage.
- T008 `docs/triage/` gitignored and the kit-mirror regression test.
- T009 the feedback-triage definition moved into `.claude/agents/` and changed for report-only runs.

### Phase 3: The bridge (T010 – T014)

- T010 the allow-list hook; T011 the one-shot session runner; T012 the triggers, sink gate and
  one-run lock; T013 the no-change fingerprint; T014 the room summary.
- Tests with the SDK, timers, fetch and the room stubbed; the injection case for T010 and T014.

### Phase 4: Docs and acceptance (T015, T016)

- T015 the KAIN contract, help, Manual and release-warden.
- T016 US1 – US6 live on the sink project, then the release.

## Release order

The MCP and app go first: every new `update_feedback_status` parameter is optional, so a manual
caller sees no change except the new `triaged` wording and the audit row. Probe a live MCP tool after
the deploy rather than trusting the version number. The kit follows with the bridge; customers'
project agents read `feedbackSink: false` and arm nothing.

## Known Issues

- MCP unit tests can reach the production database and send real notifications when the env file is
  loaded; guard the variables in every new test (see the MCP test setup).
- The Cockpit's project agent runs the bridge from `dist/remote-bridge.cjs` when present: rebuild
  `wxkanban-agent` after bridge edits or the old code runs.
- `canUseTool` is never consulted in bypass mode; the hook must be a PreToolUse hook (T010).
- The fingerprint misses a change that moves neither a status count nor `updatedAt` (R-14);
  `TRIAGE` always runs in full.
