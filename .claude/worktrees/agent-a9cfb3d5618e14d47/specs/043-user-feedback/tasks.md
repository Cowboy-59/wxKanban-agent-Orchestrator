# Task Breakdown: User Feedback

**Feature**: User Feedback
**Spec**: 043
**Date Generated**: 2026-05-31
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | T001 feedbacksubmissions table + migration | high | done |
| 2 | T002 project.submit_feedback MCP tool | high | done |
| 3 | T003 Lifecycle artifact rendering | high | done |
| 4 | T004 VS Code command + persona-led capture | high | done |
| 5 | T005 Background AI triage | medium | done |
| 6 | T006 SysAdmin triage surface | medium | done |
| 7 | T007 Needs-info round + submitter status in Dev Cockpit | medium | done |
| 8 | T008 Notification channels (in-app + email) with pending + retry | medium | done |
| 9 | T009 Two-mode webview capture (Quick paste / Guided interview) | high | done |
| 10 | T010 My Feedback cockpit tree section with needs-info badge | medium | done |
| 11 | T011 v2 schema: disposition + seed columns on feedbacksubmissions + migration | high | done |
| 12 | T012 v2 service: setDisposition, acceptToScope (next-free-NNN), getMetrics | high | done |
| 13 | T013 v2 AI triage disposition proposal (FR-011) | medium | done |
| 14 | T014 v2 routes: PATCH disposition, POST accept-to-scope, GET metrics | high | done |
| 15 | T015 v2 SysAdmin decision panel (FR-012/013) | high | done |
| 16 | T016 v2 /sysadmin/feedback/metrics dashboard route/page (FR-016) | medium | done |
| 17 | T017 v2 kit materialization of scope seed on project open (FR-013) | high | done |
| 18 | T018 security: authorise the caller-supplied `projectId` in `list_my_feedback` before the sink rebind (`utils/project-access.ts`) | critical | done |
| 19 | T019 audit: record the REQUESTED project on each MCP request, and read the tool name from every transport shape (`middleware/audit.ts`, migration 0061) | high | done |
| 23 | T023 Amendment D / FR-021: classify a project-access denial as a refusal, not a server fault — `McpError(InvalidRequest)` + `tool.call.denied` in `server.ts`, HTTP 403 (not 500) on `/call`, which also makes the audit record `scope-violation` (`utils/project-access.ts`, `server.ts`, `index-http.ts`) | high | done |
| 24 | T024 Amendment D / FR-022: advertise the incoming-queue capability on `cockpit_summary` (`canViewIncoming`) and gate the Cockpit's request on it, so consumer projects stop asking a vendor-only question every refresh (`utils/project-access.ts`, `server.ts`, `types.ts`, `cockpitTreeProvider.ts`) | high | done |
| 31 | T031 Amendment F / FR-027: `project.submit_feedback` description names who the channel is for and sends a defect in the caller's own application to their own project (`server.ts`) | medium | done |
| 32 | T032 Amendment F / FR-028: `wxCreateTestPlan` references `schema-analysis.md` and `test-item-schema.md` route application-under-test findings to the project's `testplanFindings` document, matching SKILL.md § Where findings go | medium | done |
| 33 | T033 Amendment G / FR-029: unwrap `node.feedbackItem` in the `pushFeedbackToChat` and `showFeedbackDetail` handlers, so the inline button and the context menu stop sending a blank prompt (`vscode-extension/src/extension.ts`) | high | done |
| 34 | T034 Amendment G / FR-030: a push no longer calls `project.triage_feedback`; the prompt shows the real status (`vscode-extension/src/commands/feedback.ts`, `cockpitTreeProvider.ts` copy) | high | done |
| 35 | T035 Amendment G / FR-031: submitter `project.triage_feedback` returns the current status unchanged, so older Cockpits can't hide or reopen reports (`mcp-server/src/server.ts`) | high | done |

## Task Details

### T001 — feedbacksubmissions table + migration

Add the `feedbacksubmissions` Drizzle table (UUID v7 id, projectid/userid/companyid scope, type bug|suggestion, structured persona fields, title, captured context: kitversion, activescope, vscodeversion, os; status enum new|triaged|needsinfo|inprogress|resolved|declined; declinereason; dedup link `duplicateofid` self-FK; clarificationquestion/clarificationanswer; per-leg notification status flags artifactstatus/notifystatus with pending|done|failed; createdat/firsttriagedat timestamps) plus auto-generated migration. The row is the single source of truth; follow DB naming conventions (plural lowercase, no underscores).

### T002 — project.submit_feedback MCP tool

Add the project-scoped MCP tool `project.submit_feedback` that accepts the structured persona result (type, title, persona-elicited fields) plus auto-attached context, resolves project/user/company from the API token, writes the `feedbacksubmissions` row first (source of truth), and returns a reference id within the 3s target. No app REST exposure (consistent with 042/028).

### T003 — Lifecycle artifact rendering

From a persisted `feedbacksubmissions` row, render a `bugreports.md`-style lifecycle artifact into the target project's lifecycle so it is triaged through the normal flow. Append a "Clarification" section in place when a needs-info round completes. Mark `artifactstatus` pending/done and reconcile against the row; never block the submit.

### T004 — VS Code command + persona-led capture

Add the Dev Cockpit "wxKanban: Report a Bug / Suggest a Feature" command. On type selection, run the matching persona (Bug Reporter: doing/expected/actual/repro/frequency/impact/env; Feature Suggester: problem/who/workaround/desired/why) as a buildscope-style one-question-at-a-time interview driven by the submitter's editor AI, with a static questionnaire fallback when no editor AI is present. Auto-attach context and send the structured result via project.submit_feedback. Honors "kit is a workflow engine, not an AI client" — no kit-internal AI in the VS Code command.

### T005 — Background AI triage

Server-side background assistant (LLM_PROVIDER) that runs over each new artifact/row: classify bug vs. suggestion, assign a severity tag, run dedup against existing submissions (set `duplicateofid` and surface "already received / added to existing" back to the submitter), and draft a clarifying question for the admin. Draft-resolution is out of scope for v1. Writes results back onto the row and artifact before a human opens it.

### T006 — SysAdmin triage surface

Add a feedback queue to the SysAdmin dashboard showing each submission with full context and the AI triage results (classification, severity, dedup link). Admins transition status (new→triaged→needsinfo→inprogress→resolved→declined-with-reason), add internal notes, send the single clarifying question, and trigger manual retry for any pending notification leg. Record firsttriagedat on first status change.

### T007 — Needs-info round + submitter status in Dev Cockpit

Add MCP tools `project.list_my_feedback` (submitter's own items + current status, including dedup "already received" links) and `project.answer_feedback` (single-round reply to a needs-info question). Build the Dev Cockpit UI: list of the user's submissions with status, the inline clarifying question with one reply box (status needsinfo → triaged on answer), and visible declined reasons. One refresh cycle to reflect SysAdmin changes.

### T008 — Notification channels (in-app + email) with pending + retry

Implement a pluggable submitter-side notification channel list. v1 ships in-app Dev Cockpit (always on) + email; reserve SMS and the AI-Assistant channel (YappChat/OpenClaw) as deferred v2 slots so adding them is config, not a rewrite. Submitter picks their channel at submit time. Notifications fire on status changes; a failed leg sets `notifystatus=failed/pending` on the row for manual SysAdmin retry (no background worker in v1). Zero silent drops.

### T009 — Two-mode webview capture (Quick paste / Guided interview)

Replace the InputBox-chain capture with a webview panel in the Dev Cockpit extension. On open, the submitter picks **Quick** or **Guided** (after type bug/suggestion). Quick: a multi-line paste textarea + a one-line note + a provenance field ("where did this come from?"). Guided: the Bug Reporter / Feature Suggester persona questions one at a time with a progress indicator, back-navigation, and answers preserved if the panel loses focus. Both gather auto-context and submit via `project.submit_feedback` with the same structured `details` shape. Shared webview (Quick = stripped layout, Guided = full interview); standard VS Code webview message-passing + theming/CSP; no kit-internal AI. Keep the existing `submitFeedback` command as the entry that opens the panel.

### T010 — My Feedback cockpit tree section with needs-info badge

Add a "My Feedback" section to the cockpit TreeView (cockpitTreeProvider) that lists the submitter's own reports via `project.list_my_feedback` with status; badge needs-info items so they're noticed without running a command. Selecting a needs-info item opens the single-round reply (`project.answer_feedback`) inline (reuse the myFeedback flow). Refresh on the cockpit's normal poll/refresh cycle. Replaces the must-remember `My Feedback` command as the primary status surface (the command can remain as a shortcut).

### T011 — Read-only detail view for a submitted feedback item

Extend `project.list_my_feedback` to also return the `details` body and auto-captured `context` per item (currently metadata-only). Add a `details` (+ `context`) field to the `MyFeedbackItem` wire type. In cockpitTreeProvider, give every non-needs-info feedback item a click command that opens a **read-only webview panel** rendering the submitted body text, the captured context (kit version, active scope, VS Code version, OS), and status/severity/classification — themed + CSP-compliant like the capture webview, no edit/submit affordances. Needs-info items keep opening the single-round reply. Implements FR-009.
| 25 | T025 Amendment E / FR-023: attachment envelope — validated `attachments` field on `submit_feedback`, caps enforced server-side, client-supplied `details.attachments` discarded (`mcp-server/src/utils/schemas.ts`, `server.ts`) | high | done |
| 26 | T026 Amendment E / FR-023+024: extension-host attachment reader — allowlist, NUL/binary reject, tail-truncation with marker, credential redaction before transmission (`vscode-extension/src/services/attachments.ts`) | high | done |
| 27 | T027 Amendment E / FR-023: Cockpit capture UI — attach button, chips with size/truncated/redaction count, remove, content held host-side (`vscode-extension/src/providers/feedbackPanel.ts`) | medium | done |
| 28 | T028 Amendment E / FR-026: bounded excerpting into the triage prompt and the lifecycle artifact (`mcp-server/src/utils/feedback-triage.ts`, `feedback-artifact.ts`) | high | done |
| 29 | T029 Amendment E / FR-025: strip attachment content from list responses + single-item download route (`mcp-server/src/server.ts`, `src/server/services/FeedbackTriageService.ts`, `src/server/routes/sysadmin.ts`) | critical | done |
| 30 | T030 Amendment E / FR-023: attachment rendering in the SysAdmin triage pane and the Cockpit read-only detail panel (`src/client/pages/SysAdmin/Feedback.tsx`, `vscode-extension/src/providers/feedbackDetailPanel.ts`) | medium | done |
