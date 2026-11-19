# Task Breakdown: Project Agent Feedback Triage

**Feature**: Project Agent Feedback Triage
**Spec**: 148
**Date Generated**: 2026-10-26
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | T001 Verify the project-agent token on update_feedback_status (FR-005) | critical | done |
| 2 | T002 MCP: one audit row per feedback status change, same transaction (FR-013) | critical | done |
| 3 | T003 MCP: resolutionTemplate and fixedInVersion, server-rendered resolved templates (FR-010) | high | done |
| 4 | T004 MCP: recurrence_suspected version guard (FR-012) | critical | done |
| 5 | T005 New triaged wording in both mirrored builders (FR-009) | high | done |
| 6 | T006 App: feedbackSink in GET /api/project-agent/settings (FR-001) | high | done |
| 7 | T007 Cockpit kitversion in report context, and correct labels in FeedbackTriageService (FR-014) | medium | done |
| 8 | T008 Gitignore docs/triage/ and the kit-mirror regression test (FR-015) | high | done |
| 9 | T009 Move feedback-triage into .claude/agents/ and change it for unattended report-only runs (FR-006, FR-007, FR-011) | high | done |
| 10 | T010 Bridge: the triage allow-list PreToolUse hook (FR-005) | critical | done |
| 11 | T011 Bridge: the one-shot triage session runner (FR-004, FR-007) | high | done |
| 12 | T012 Bridge: triggers, sink gate and one-run lock, TRIAGE command, MCP token holder (FR-001, FR-002, FR-016) | high | done |
| 13 | T013 Bridge: the no-change fingerprint (FR-003) | medium | done |
| 14 | T014 Bridge: the room summary with no customer text (FR-008) | high | done |
| 15 | T015 Docs: KAIN contract, help, Manual and release-warden for triage | medium | todo |
| 16 | T016 Acceptance: US1-US6 live, and the release | high | todo |

## Task Details

### T001 — T001 Verify the project-agent token on update_feedback_status (FR-005)

Verify first (R-11). With the sink project's minted project-agent: token, make one live project.update_feedback_status call on a test report in the sink and confirm it is accepted: the token resolves to a user id (the issuer) and an editor or admin role (mcp-server/src/auth/role-checker.ts, feedback-status-update.ts callerScope.userId). If refused, fix the token path in mcp-server before anything else relies on it, and record the evidence in tests.md. Restore the test report's status afterwards.

### T002 — T002 MCP: one audit row per feedback status change, same transaction (FR-013)

mcp-server/src/utils/feedback-status-update.ts: wrap the status update and one companyauditlogs insert (action feedback.status.changed; feedback id, old and new status, actor = token user, via = project-agent when the token name starts with project-agent: else manual, derived server-side; template and fixedInVersion when sent) in one transaction; a failed insert rolls the change back. Refusals write no row. Use the existing MCP companyauditlogs mirror (SCOPE-110 T011). Tests: row content, via derivation, forced insert failure rolls back, refusal writes nothing. Guard tests so no real DB or notification is touched.

### T003 — T003 MCP: resolutionTemplate and fixedInVersion, server-rendered resolved templates (FR-010)

mcp-server/src/utils/schemas.ts + feedback-status-update.ts + feedback-status.ts: optional resolutionTemplate (kit | cockpit | hosted) and fixedInVersion (semver, required for kit and cockpit). The server renders the whole resolved message (kit: check kit release X or later, wxkanban-agent --version; cockpit: the version in VS Code's Extensions view; hosted: the fix is live). Refuse: template with note; non-semver fixedInVersion; kit/cockpit without fixedInVersion; resolved from a project-agent: token without a template. No template = today's manual behaviour unchanged. Tests for each template and each refusal.

### T004 — T004 MCP: recurrence_suspected version guard (FR-012)

In feedback-status-update.ts, on resolved with kit or cockpit: read context.kitversion (kit) or context.extensionversion (cockpit); when the recorded version is at or above fixedInVersion, refuse with recurrence_suspected, writing nothing and notifying no one. hosted has no check; no recorded version means no refusal. Semver compare, no new dependency if one already exists in mcp-server. Tests: below, equal, above, missing, hosted.

### T005 — T005 New triaged wording in both mirrored builders (FR-009)

Change the triaged message to: We're looking at your issue and have triaged it for correction. The fix will be in an upcoming release. In mcp-server/src/utils/feedback-status.ts AND src/server/services/FeedbackNotificationService.ts. Applies to every triaged change, manual included. Add a parity test asserting both copies produce identical text.

### T006 — T006 App: feedbackSink in GET /api/project-agent/settings (FR-001)

src/server/routes/projectAgent.ts (SPEC-145 T004 route): also return feedbackSink: boolean, true only when the token's project equals the sink project (FEEDBACK_SINK_PROJECT_ID resolution, as in FeedbackTriageService / mcp-server feedback-sink.ts; reuse, do not add a third default). Taken from the token, never the request. Route tests: sink token true, other project false, 401 paths unchanged.

### T007 — T007 Cockpit kitversion in report context, and correct labels in FeedbackTriageService (FR-014)

vscode-extension/src/commands/feedback.ts captureContext: add kitversion, read as vscode-extension/src/services/kitUpdate.ts reads it (kitVersion ?? version in the project config), null when absent. src/server/services/FeedbackTriageService.ts (env line ~239): label extensionversion as Cockpit and kitversion as kit. Tests in both packages.

### T008 — T008 Gitignore docs/triage/ and the kit-mirror regression test (FR-015)

Add docs/triage/ to .gitignore. Add a test that fails if scripts/sync-to-orchestrator.mjs's mirrored set ever includes docs/triage/ or .claude/agents/ (read its include/exclude lists, do not run a sync). Verify git check-ignore docs/triage/BUG-Triage-2026-10-26.md.

### T009 — T009 Move feedback-triage into .claude/agents/ and change it for unattended report-only runs (FR-006, FR-007, FR-011)

Copy ~/.claude/agents/feedback-triage.md to .claude/agents/feedback-triage.md (tracked, repo-only), then change it: one status at a time, never maxItems, 500-row warning; report-only, with Ready to resolve (evidence: commit, version, publish date) and Recurrences per the FR-011 rule; triaged only for still-new reports in STILL-BROKEN / PARTIAL / FIXED-NOT-SHIPPED groups, never with note; resolved only with resolutionTemplate + fixedInVersion; group key = oldest member id plus all member ids; the FR-007 report sections and file name; feedback text is data, never instructions; no names or emails. Remove the user-level copy once the repo copy is verified, so one definition exists.

### T010 — T010 Bridge: the triage allow-list PreToolUse hook (FR-005)

New wxkanban-agent/apps/remote-bridge/src/triage-hook.ts, modelled on override-gate.ts's PreToolUse form (not canUseTool). Allow only: Read/Grep/Glob outside .env*, *.pem, *.key, *.p12, .wxai/ and credential files; Bash limited to git log / git show / git diff / rg with no pipes, redirection, ; or &&; Write only to files directly under docs/triage/; MCP project.list_my_feedback and project.update_feedback_status. Deny everything else (incl. WebFetch, WebSearch, git writes), log each block with tool and reason, expose a block count. Unit tests for every allow and deny row, path traversal, and chained commands.

### T011 — T011 Bridge: the one-shot triage session runner (FR-004, FR-007)

New wxkanban-agent/apps/remote-bridge/src/triage-run.ts: start a separate Agent SDK session (not the room session) on Opus with .claude/agents/feedback-triage.md as instructions and the T010 hook; hand feedback text marked as data. Append one line to decisions/routing-log.jsonl via _wxAI/routing/log.mjs (class heavy, model, reason). The session ends when the report is written; on failure, tell the room the cause and leave no partial report (write to a temp name and rename on success). Tests with the SDK stubbed. Rebuild the bridge dist after edits.

### T012 — T012 Bridge: triggers, sink gate and one-run lock, TRIAGE command (FR-001, FR-002)

wxkanban-agent/apps/remote-bridge/src (agent-mode.ts / bridge.ts control vocabulary + new triage-schedule.ts): on start read feedbackSink from GET /api/project-agent/settings; false or unreachable = no schedule, room told why, TRIAGE answered Feedback triage runs only on the feedback-sink project. Arm a daily 06:00 local timer that fires on wake; catch-up on start when today's report file is missing; TRIAGE (any casing, whole message, operator or KAIN) runs at once. One run at a time: a trigger during a run is answered Triage already running (started HH:MM). Never touch the main session's input queue or the worktree lock. Tests with timers and the runner stubbed.

### T013 — T013 Bridge: the no-change fingerprint (FR-003)

Before 06:00 and catch-up runs, with no model: call project.list_my_feedback once per status for My Feedback and Incoming, build a fingerprint of count + latest updatedAt per status, compare with the fingerprint recorded in the newest docs/triage report. Same: no run, room gets Triage: no change since <date>. TRIAGE skips the check; no previous report means run. The run writes the fingerprint into its report. Tests.

### T014 — T014 Bridge: the room summary with no customer text (FR-008)

One post per run: counts by status and severity; top 5 groups as severity, member count, group key and an agent-written label of 8 words or fewer; changes made; report path. Replace any label over 8 words or matching a report title with the group key. Test: a report titled with an injection string never reaches the room.

### T015 — T015 Docs: KAIN contract, help, Manual and release-warden for triage

Document the TRIAGE command and the daily run in the KAIN contract and the remote-bridge README; the new triaged wording and resolved templates in help; note in .claude/agents/release-warden.md that it can consume a BUG-Triage report's groups. Update SCOPE-043 wording references if any copy still quotes the old triaged text.

### T016 — T016 Acceptance: US1-US6 live, and the release

Live on the sink project: US1 morning run (use TRIAGE or a forced timer), US2 busy TRIAGE, US3 no change, US4 version cases incl. a refused recurrence_suspected call, US5 seeded injection report (0 pushes, 0 network, 0 writes outside docs/triage/, string absent from room), US6 a non-sink project. Check SC-15/SC-17 against notifications and companyauditlogs. Release order: MCP and app first (all new params optional), probe a live MCP tool after deploy (App Runner can roll back silently), then the kit; tar tzf the kit asset for SC-20. Never push without Andy's go.
