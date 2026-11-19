# Spec 043: User Feedback

## Overview

The Dev Cockpit VS Code extension gains a **"Report a Bug / Suggest a Feature"** command. Any signed-in kit user submits a typed report (bug or suggestion) through a **persona-led, buildscope-style guided interview** — a QA-minded **Bug Reporter** persona or a product-discovery **Feature Suggester** persona — that draws out the best possible signal one question at a time. The extension auto-attaches context (project id, kit version, active scope, user/company from the API token, VS Code version, OS) and sends the **structured result** (not freeform text) through a new MCP tool `project.submit_feedback`.

The wxKanban server persists each submission to a `feedbacksubmissions` table — the **source of truth** — and renders it as a **lifecycle artifact** (a `bugreports.md`-style document) that lands in the target project's lifecycle and is triaged through the normal flow. **There is no GitHub fan-out.** A **background AI assistant** auto-triages every new submission: classifies (bug vs. suggestion), tags severity, runs **dedup** (linking near-duplicates to an existing item and informing the submitter it was already received), and **drafts a clarifying question** for the admin.

wxperts platform admins triage in the SysAdmin dashboard, moving each item through statuses (**new → triaged → needs-info → in-progress → resolved → declined-with-reason**) and adding internal notes. A single-round **needs-info** clarification happens on the same record inside the Dev Cockpit (`project.list_my_feedback` to see status, `project.answer_feedback` to reply once). The submitter sees status updates via a **submitter-chosen notification channel** — in-app Dev Cockpit (always on) + email in v1; SMS and the AI-Assistant channel (YappChat / OpenClaw) are reserved for v2. Resilience without a worker: the DB row is written first, then the artifact, then notifications; a failed notification leg is marked **pending** with a **manual retry** in SysAdmin.

The capability is built **generic and project-scoped** (keyed on `projectid` like specs 042/028), not hardwired to wxKanban: Layer 1 (wxKanban's own feedback channel) ships in v1; Layer 2 (any consumer project reusing it at dev-time) falls out for free later; Layer 3 (feedback shipped inside a consumer's released product) is a separate future scope whose tenancy must not shape 043's schema. Full reviewed scope: `specs/Project-Scope/043-user-feedback.md`.

## Business Problem

Today, user bug reports and ideas reach wxperts only ad hoc (out-of-band messages), so signal is lost, nothing is tracked, and users get no confirmation that their report was received or acted on. As the kit goes to a wider audience (the marketing push), wxperts needs a first-class, in-context channel that captures feedback where users actually work (VS Code), routes it straight into the dev workflow as a lifecycle artifact the team already knows how to triage, surfaces it for support in SysAdmin, and closes the loop back to the submitter with a visible status — turning every report into tracked, reportable, actionable signal.

## Actors

- Primary: Kit user / developer — a signed-in user working in VS Code with the Dev Cockpit extension who submits a bug or suggestion, answers any clarifying question, and later sees its status.
- Secondary: wxperts platform admin (triages in SysAdmin — status changes, internal notes, the clarifying question); the wxKanban server (persists the row, renders the lifecycle artifact, drives notifications); the background AI assistant (auto-triage over the artifact); and the submitter-chosen notification channel (delivers status updates).

## Success Metrics

1. A signed-in user can submit from VS Code via the persona-led interview and receives a confirmation with a reference id within 3 seconds of submitting; the interview favors signal quality, with a fast path for terse answers.
2. Zero silent drops: 100% of accepted submissions are persisted to `feedbacksubmissions` and rendered as a lifecycle artifact; any failed notification leg is marked pending on the row (manual SysAdmin retry) and never lost.
3. Every new submission is auto-triaged by AI — classified, severity-tagged, and dedup-checked — before a human opens it, and triage actions reach the submitter in the Dev Cockpit within one refresh cycle.
4. Every submission records `createdat` and `firsttriagedat`, so median time-to-first-triage is reportable.

## Scope Boundary

IN: the VS Code "Report a Bug / Suggest a Feature" command with persona-led guided capture (Bug Reporter / Feature Suggester, driven by the submitter's editor AI, with a static questionnaire fallback); auto-context capture; the `project.submit_feedback`, `project.list_my_feedback`, and `project.answer_feedback` MCP tools; the `feedbacksubmissions` table + migration; rendering each submission as a lifecycle artifact; background AI auto-triage (classify + severity + dedup + draft-clarification); the SysAdmin triage surface; the status workflow (new → triaged → needs-info → in-progress → resolved → declined-with-reason) + internal notes; the single-round needs-info clarification on the same record; submitter-visible status + reply in the Dev Cockpit; in-app + email notification channels; pending-flag + manual retry for failed legs. Built generic and project-scoped (keyed on `projectid`) so Layer 2 reuse falls out later.

## Out of Scope

GitHub issue fan-out (dropped); rate-limiting / abuse prevention; **screenshot / binary attachments** (note: *text* attachments such as log files became IN scope under **Amendment E**, 2026-08-12 — see `specs/Project-Scope/043-user-feedback.md`; binary remains out, as it needs object storage, retention, and read-back access control this channel does not have); submission from the web app (VS Code only in v1); SMS and the AI-Assistant notification channel (YappChat / OpenClaw) — reserved for v2; multi-round threaded chat (v1 is single-round needs-info + internal notes); a background retry worker; AI draft-resolution; SLAs / auto-routing; email-based replies; broad product/website/end-user-app (Layer 3) analytics dashboards — note the **v2 feedback-metrics dashboard is now IN scope** (see FR-016), only the broader usage-telemetry surface is deferred; Layer 2 consumer-project reuse and Layer 3 ship-in-released-product (future scopes whose tenancy must not shape 043's schema); and the spec 042 "select a bug → AI fixes it" self-fix handoff.

## Open Questions

None at this time. All scope-review decisions (lifecycle-artifact-as-core, dropped GitHub, persona-led capture execution model, notification channels, needs-info round, status model, resilience without a worker) were resolved on 2026-05-31 and recorded in `specs/Project-Scope/043-user-feedback.md`.

## Functional Requirements

### FR-001 — Persona-led capture from VS Code

The Dev Cockpit MUST add a "wxKanban: Report a Bug / Suggest a Feature" command that, on type selection, runs the matching persona (Bug Reporter or Feature Suggester) as a buildscope-style one-question-at-a-time interview driven by the submitter's editor AI, falling back to a static questionnaire when no editor AI is present. The command MUST NOT call kit-internal AI.

**Acceptance Criteria**:
- [ ] Selecting "bug" runs the Bug Reporter persona (doing → expected → actual → repro → frequency → impact → env); selecting "suggestion" runs the Feature Suggester persona (problem → who → workaround → desired → why).
- [ ] The structured result (not freeform text) plus auto-attached context is sent via `project.submit_feedback`, and the user receives a reference id within 3 seconds.

### FR-002 — Persist and render as a lifecycle artifact

The server MUST write the `feedbacksubmissions` row first as the source of truth, then render a `bugreports.md`-style lifecycle artifact into the target project's lifecycle. A failed artifact or notification leg MUST be marked pending on the row and never block the submit.

**Acceptance Criteria**:
- [ ] Each accepted submission yields exactly one `feedbacksubmissions` row and one lifecycle artifact, reconciled against the row.
- [ ] A transient downstream failure leaves the submit successful and the failed leg marked pending for manual SysAdmin retry.

### FR-003 — Background AI auto-triage

A server-side background assistant MUST classify (bug vs. suggestion), tag severity, run dedup (linking near-duplicates via `duplicateofid` and surfacing "already received / added to existing" to the submitter), and draft a clarifying question — writing results onto the row and artifact before a human opens the item. Draft-resolution is out of scope for v1.

**Acceptance Criteria**:
- [ ] Every new submission has a classification, severity tag, and dedup result attached before it appears in the SysAdmin queue.
- [ ] A detected duplicate is linked rather than triaged independently, and the submitter is told it was already received with a tracked reference.

### FR-004 — SysAdmin triage + status workflow

The SysAdmin dashboard MUST present a feedback queue with full context and AI triage results, and let admins move each item through new → triaged → needs-info → in-progress → resolved → declined (with a required reason on decline), add internal notes, send the single clarifying question, and trigger manual retry for any pending leg. `firsttriagedat` MUST be recorded on first status change.

**Acceptance Criteria**:
- [ ] An admin can perform every status transition and add an internal note; a declined item records and shows its reason.
- [ ] `firsttriagedat` is stamped exactly once, on the first status change.

### FR-005 — Needs-info round and submitter status in the Dev Cockpit

The kit MUST expose `project.list_my_feedback` (the submitter's own items + current status, including dedup links) and `project.answer_feedback` (a single-round reply to a needs-info question). The Dev Cockpit MUST show the user's submissions with status, render an inline clarifying question with one reply box (status needs-info → triaged on answer), and reflect SysAdmin changes within one refresh cycle.

**Acceptance Criteria**:
- [ ] A needs-info question appears inline in the Dev Cockpit and the submitter can answer exactly once, returning the item to triaged and appending a "Clarification" section to the artifact.
- [ ] Status changes made in SysAdmin are visible to the submitter within one refresh cycle.

### FR-006 — Submitter-side notification channels with no silent drops

Notifications MUST be a pluggable, submitter-chosen channel list shipping in-app Dev Cockpit (always on) + email in v1, with SMS and the AI-Assistant channel (YappChat / OpenClaw) reserved as deferred v2 slots so adding them is config, not a rewrite. A failed notification leg MUST set a pending/failed status on the row for manual SysAdmin retry; no background worker in v1.

**Acceptance Criteria**:
- [ ] The submitter selects a channel at submit time; status changes fire to in-app + email in v1.
- [ ] A failed leg is recorded as pending/failed on the row and is retryable from SysAdmin; no accepted submission's notification is silently dropped.

## v1.1 — Dev Cockpit UX (post-ship enhancement, 2026-05-31)

v1 shipped capture as a native QuickPick/InputBox chain. Two UX gaps were identified in review and are addressed here, motivated by how users actually report:

- **Two capture modes** (the submitter has the raw material vs. wants to author a full report):
  - **Quick / paste** — the fast path. The submitter pastes existing material (an error, a chat excerpt, a log) plus a one-line note and a *provenance* answer ("where did this come from?"), and fires. Structuring is deferred to the AI triage + needs-info round (no new AI extraction — the existing pipeline fills gaps).
  - **Guided / full report** — the deliberate path. The persona interview (Bug Reporter / Feature Suggester) is run one question at a time to author a complete, reproducible report (the teaching experience).
- Both modes produce the same `feedbacksubmissions` row and flow through the same triage → needs-info → SysAdmin pipeline; they differ only in *who structures the report and when*.
- **Shared webview** hosts both modes (Quick = stripped-down layout, Guided = full interview) — fixes the InputBox chain's fragilities (no back-navigation, total data loss on Escape, single-line paste).
- **Passive status** — a "My Feedback" section in the cockpit tree shows the submitter's reports with status, **badges needs-info items**, and opens the reply inline; replaces the must-remember `My Feedback` command as the primary status surface.

### FR-007 — Two-mode webview capture (Quick paste / Guided interview)

The "Report a Bug / Suggest a Feature" entry MUST open a webview panel where the submitter picks **Quick** or **Guided**. Quick shows a multi-line paste field + a one-line note + a provenance ("where did this come from?") field. Guided runs the persona interview one question at a time with progress, back-navigation, and no data loss on dismissal. Both submit via `project.submit_feedback` with the same structured `details` shape and auto-context. The webview calls no kit-internal AI.

**Acceptance Criteria**:
- [ ] Quick mode accepts a multi-line paste, captures provenance, and submits in well under a minute.
- [ ] Guided mode walks the persona questions with back-navigation and preserves answers if the panel loses focus.

### FR-008 — "My Feedback" cockpit tree section with needs-info badge

The Dev Cockpit tree MUST show the submitter's own feedback (via `project.list_my_feedback`) with current status; a needs-info item MUST be visually badged and, when selected, open the single-round reply (`project.answer_feedback`) inline. Status MUST refresh on the cockpit's normal cycle.

**Acceptance Criteria**:
- [ ] The submitter sees their reports + statuses in the cockpit without running a command; a needs-info item is badged.
- [ ] Selecting a needs-info item lets the submitter answer once, returning it to triaged.

### FR-009 — Read-only detail view for a submitted feedback item

Clicking a non-needs-info feedback item in the My Feedback tree MUST open a **read-only webview panel** showing the full text the submitter originally entered — the persona-elicited `details` body — together with the auto-captured `context` (kit version, active scope, VS Code version, OS) and the current status/severity/classification. This requires `project.list_my_feedback` to additionally return the `details` and `context` payloads (it currently returns metadata only). Needs-info items keep their existing click behaviour (open the single-round reply); the detail view is for items the submitter can no longer act on but wants to re-read.

**Acceptance Criteria**:
- [ ] Clicking a submitted/triaged/inprogress/resolved/declined/duplicate item opens a read-only panel rendering the submitted body text + captured context.
- [ ] The panel is read-only (no edit/submit affordances) and themed/CSP-compliant like the capture webview.
- [ ] Needs-info items still open the reply box on click, unchanged.

## v1.2 — Central feedback sink (routing change, 2026-06-02)

v1 routed every submission to the **submitter's own project** (`feedbacksubmissions.projectid` = the caller token's project). In practice this scattered kit/MCP bug reports across consumer projects (e.g. a "Bug on Kit and MCP" report filed from the ScanSF project landed in ScanSF, not where wxperts triages). The product decision is to **centralize**: every VS Code bug report and suggestion, from any project, routes to a single wxperts-owned **feedback sink project** (wxKanban Development) so all kit feedback is triaged in one place.

This supersedes the "Layer 2 lands in the consumer's own project" framing of the Overview for routing purposes: feedback is now a **central intake funnel**, not a per-project resource. Provenance is preserved — the row still carries the submitter's `userid` and `companyid`, and the originating project id is recorded in `context.originProjectId` — so SysAdmin still shows *who* reported it and *from where*. The submitter still sees and answers their own items (the needs-info loop is keyed on `userid`, not project). Layer 3 (feedback shipped inside a consumer's *released* product) remains a separate future scope and is unaffected.

### FR-010 — Central sink routing for all VS Code feedback

All submissions from `project.submit_feedback` MUST be persisted with `projectid` = the configured feedback sink project (`FEEDBACK_SINK_PROJECT_ID`, defaulting to wxKanban Development), regardless of the submitting token's project. The lifecycle artifact (FR-002) and AI triage/dedup (FR-003) MUST run against the sink project. The submitter's identity (`userid`) and company (`companyid`) MUST be preserved on the row, and the originating project recorded in `context.originProjectId`. `project.list_my_feedback` and `project.answer_feedback` MUST resolve the caller's items by `userid` against the sink project (not the caller's token project), so the submitter retains full visibility and the single-round needs-info reply.

**Acceptance Criteria**:
- [ ] A report submitted with a token scoped to project A is persisted with `projectid` = the sink project, with `userid`/`companyid` = the submitter and `context.originProjectId` = A.
- [ ] The submitter can `list_my_feedback` and `answer_feedback` on that item even though it lives in the sink project; ownership is still enforced by `userid`.
- [ ] Dedup candidates and the rendered artifact are scoped to the sink project, so all kit feedback triages together in one place.

## v2 — Web triage console + accept-to-scope (2026-06-12)

v1 closed the loop from VS Code submission → central sink → AI triage → SysAdmin status workflow → submitter notification. What it stopped short of is the **decision**: turning a triaged report into actionable development work. v2 adds a **web-side triage console** in the wxKanban SysAdmin dashboard that sits *above* the raw feedback queue. For each triaged item, the AI proposes a **disposition** (`scope` / `outofbandfix` / `duplicate` / `decline` / `needsinfo`), and a wxperts admin reviews it and, where warranted, clicks **Accept to scope** — which produces a **draft scope seed** pre-populated with the customer's own words as the problem statement and linked back to the originating `feedbacksubmissions.id`. The scope is then "waiting" in the project when a developer opens VS Code and runs `buildscope` to refine it — so the spec-first decision is made on the web, *before* the editor is ever opened.

Because the wxKanban server is hosted (App Runner) and cannot write a developer's local working tree (the cross-host-write boundary v1 already respects; 028 Phase-12 write-first model), accept-to-scope **persists the seed to the DB as the source of truth**, and the kit **materializes it to `specs/Project-Scope/NNN-<shortname>.md` on next project open** via the existing sync path. This is wxperts-admin-only and single-tenant; cross-app/customer-admin telemetry (Layer 3) remains a separate future scope and must not shape v2's schema.

**Primary actor:** wxperts platform admin (triages, dispositions, and accepts in the SysAdmin web console).
**Key value:** Every customer message becomes a triaged, dispositioned decision on the web — and an accepted one lands as a ready-to-refine scope seed before any dev opens VS Code. No feedback dies in the queue; no scoping starts from a blank slate.

### FR-011 — AI disposition proposal

The background AI triage (FR-003) MUST, after classify/severity/dedup, attach a **proposed disposition** to each new submission from the set {`scope`, `outofbandfix`, `duplicate`, `decline`, `needsinfo`} with a one-line rationale, written to the row before a human opens it. Extends FR-003; does not draft the scope itself.

**Acceptance Criteria**:
- [ ] Every triaged item carries a proposed disposition + rationale before appearing in the decision queue.
- [ ] A dedup hit (FR-003) yields a `duplicate` disposition automatically.

### FR-012 — SysAdmin disposition review & override

The SysAdmin Feedback surface (FR-004) MUST present a **decision view** showing the customer's original text, the AI triage results, and the proposed disposition, and let the admin **accept or override** it to any value in the set. The admin's chosen disposition AND the AI's original suggestion MUST both be retained on the row.

**Acceptance Criteria**:
- [ ] An admin can accept the AI disposition or override it to any allowed value in one action.
- [ ] Both the AI suggestion and the admin's final disposition are stored (override is never lost).

### FR-013 — Accept-to-scope persists a draft scope seed (DB source of truth)

Selecting the `scope` disposition and confirming **Accept to scope** MUST persist a draft scope seed to the DB (source of truth), pre-populated with the customer's submitted text as the problem statement and a back-link to the originating `feedbacksubmissions.id`, then record the assigned scope number on the feedback row. The kit MUST materialize the seed to `specs/Project-Scope/NNN-<shortname>.md` on next project open (the hosted server never writes the working tree directly). The seed is a draft for `buildscope` to refine in VS Code — it is NOT a finished scope.

**Acceptance Criteria**:
- [ ] Accept-to-scope produces exactly one draft scope seed containing the customer's original text and the feedback id, persisted to the DB.
- [ ] The feedback row is updated with the linked scope number and a `scoped` state; the seed materializes to `specs/Project-Scope/NNN.md` on next open.

### FR-014 — Safe seed numbering (no collision, no overwrite)

Seed creation MUST select the next free `NNN` by scanning existing scope numbers in BOTH `specs/` and `specs/Project-Scope/`, and MUST refuse to overwrite an existing file, surfacing the conflict instead. Disposition actions that don't seed a scope (`outofbandfix`, `duplicate`, `decline`, `needsinfo`) reuse v1's existing status transitions.

**Acceptance Criteria**:
- [ ] The assigned `NNN` does not collide with any existing scope number in either directory.
- [ ] If the computed target file already exists, the operation aborts with a surfaced conflict and writes nothing.

### FR-015 — Feedback ↔ scope traceability

The link MUST be bidirectional and durable: the `feedbacksubmissions` row records the scope number it produced, and the generated scope file's Constraints & Notes records "Seeded from feedback `<id>` (`<title>`)". Accept-to-scope is a one-way transition — an already-scoped item cannot be re-scoped (it shows its existing link).

**Acceptance Criteria**:
- [ ] From a feedback item an admin can see its scope number; from the scope file a reader can see the source feedback id.
- [ ] Re-running accept-to-scope on an already-scoped item is a no-op that shows the existing link, not a second seed.

### FR-016 — Feedback analytics dashboard

A dedicated SysAdmin route `/sysadmin/feedback/metrics` MUST present a feedback analytics dashboard. v2 ships only what is **already capturable from existing data**:
- **Feedback metrics** (from `feedbacksubmissions`): decision coverage (open / dispositioned / scoped), median time-to-disposition, AI disposition accuracy (accepted-as-proposed vs. overridden), scope conversion (by classification/severity), volume trend (bug vs. suggestion over time).
- **Cockpit / MCP activity** (from `mcprequestaudit`): tool & command usage, active cockpit users.
- **Active users** (from `sessions`): DAU/WAU/MAU.

All tiles are computed by aggregation via `GET /api/sysadmin/feedback/metrics`. Admin-only. **Website usage** (most-active-page, page-view volume — requires a new events capture layer) and **end-user-application telemetry** (Layer 3, multi-tenant) are explicitly **deferred to a future "Usage & Telemetry Analytics" scope** and MUST NOT shape v2's schema.

**Acceptance Criteria**:
- [ ] The dashboard renders all three capturable metric families from live data; non-admins get 403.
- [ ] Every metric derives from existing tables (`feedbacksubmissions`, `mcprequestaudit`, `sessions`) plus v2's new columns — no new capture layer in v2.

### v2 Data / Schema

Extend the existing `feedbacksubmissions` table (no new table):
- `aiproposeddisposition` text — AI's suggested disposition
- `dispositionrationale` text — AI's one-line reason
- `disposition` text — admin's final choice (retains override vs. AI per FR-012)
- `dispositionedat` timestamptz / `dispositionedbyid` uuid — who/when
- `linkedscopenumber` text — the `NNN` produced by accept-to-scope (null until scoped)
- `scopeseed` jsonb — the seed payload (title, shortname, problem-statement body) the kit materializes on open

**v2 API** (add to `src/server/routes/sysadmin.ts`): `PATCH /api/sysadmin/feedback/:id/disposition`, `POST /api/sysadmin/feedback/:id/accept-to-scope`, `GET /api/sysadmin/feedback/metrics`.
**v2 Service** (`FeedbackTriageService`): `setDisposition()`, `acceptToScope()` (next-free-NNN scan + idempotent), metrics aggregation; FR-011 disposition extends the existing triage assistant.
**v2 Frontend**: a decision panel in `src/client/pages/SysAdmin/Feedback.tsx`, and a new `/sysadmin/feedback/metrics` route/page (+ one nav entry).

### v2 Success Criteria

5. **Decision teed up:** 100% of items reaching the SysAdmin decision view carry a non-null AI-proposed disposition + rationale before a human opens them.
6. **Accept-to-scope end-to-end:** an admin turns a triaged item into a linked draft seed in a single confirm; on next project open in VS Code the seed exists at `specs/Project-Scope/NNN.md` with the customer's original text intact.
7. **No collisions, no clobbers, no lost overrides:** zero `NNN` collisions, zero overwrites, 100% of admin overrides retain the original AI suggestion.
8. **Bidirectional traceability:** every scoped item shows its scope number on the row and its source feedback id in the scope file — 100%, no orphan links.
9. **Authorization floor:** only a wxperts platform admin can disposition, accept-to-scope, or view metrics; everyone else gets 403.
10. **Analytics dashboard:** the `/sysadmin/feedback/metrics` route renders all three capturable metric families from live row data, admin-only.

### v2 Constraints & Notes

- **Built on v1, not beside it.** Reuses the `feedbacksubmissions` table, the triage assistant, the SysAdmin surface, and notification machinery. Net-new = six columns, three endpoints, the decision panel, one metrics route.
- **DB is source of truth; the hosted server never writes a dev's working tree.** Accept-to-scope persists the seed to the DB; the kit materializes `specs/Project-Scope/NNN.md` on next open (028 Phase-12 write-first / cross-host-write model). This is *why* the decision can be made on the web before VS Code.
- **Seed numbering scans both `specs/` and `specs/Project-Scope/` and refuses to overwrite** — a live collision exists today (044 is used by *both* `landing-docs` and `wxconversion-command`), exactly the failure FR-014 prevents.
- **wxperts-admin-only, single-tenant.** Customer-admin/cross-app acceptance is out of scope (Layer 3).
- **No overlap triage against existing scopes at accept time — by design (2026-06-12).** Accept-to-scope does NOT compare the feedback against the existing body of scopes/specs before minting a new `NNN`; the AI dedup (FR-003) only links feedback-vs-feedback (`duplicateofid`), never feedback-vs-scope. The existing-scope conflict check (new-vs-extend-vs-already-covered) is **deliberately left to `buildscope`'s discovery phase**, which the dev runs in VS Code to refine the materialized seed and where the "Scope NNN already covers X" prompt resolves overlap. Consequence accepted: the number is minted *before* overlap is checked, so a seed that `buildscope` later finds redundant becomes a thin/abandoned scope the dev merges or deprecates there. This keeps the web decision KISS and the overlap judgment with the human at refinement time; revisit only if duplicate scopes become common in practice.
- **Deferred follow-on scope recorded (not designed here):** a future "Usage & Telemetry Analytics" scope to hold active-users + cockpit/MCP activity (expanded), the onboarding funnel (register → first project → first scope → first implement), website usage (with its capture layer), and end-user-app Layer 3 telemetry. Flagged as a dependency; sequencing TBD.
- **Process note:** authored in-conversation because the orchestrator `buildscope` CLI is broken (standing workaround); implementation routes through `implement` per orchestrator-first.

## Phase

**Current Phase**: design
**Priority**: high

## Status

- **Date**: 2026-06-02
- **Phase**: design

### v2 Status

- **Date**: 2026-06-12
- **Phase**: design (v2 amendment — web triage console + accept-to-scope + feedback analytics dashboard)

### Amendment E Status

- **Date**: 2026-08-12
- **Phase**: implementation (Amendment E — text/log attachments on a report)
- **Prompted by**: feedback `052e76de` (suggestion, low) — "It will be nice to add an attachment (a log file for example) to the report"
- **Requirements**: FR-023 (bounded text attachments in the Cockpit), FR-024 (client-side credential redaction before transmission), FR-025 (content never rides a list response), FR-026 (content never enters the triage prompt or the lifecycle artifact in full)
- **Tasks**: T025–T030
- **Boundary change**: text attachments move OUT → IN; screenshots / binary stay OUT
- **Schema**: none — attachments ride a reserved `attachments` key inside the existing `details` jsonb

### Amendment F Status

- **Date**: 2026-10-02
- **Phase**: implementation (Amendment F — the channel says who it is for)
- **Prompted by**: feedback `3e394ca1` (bug, high) — a missing sign-out in a consumer project's own `TenantShell.tsx`, filed by an agent into the wxKanban sink; declined as misrouted
- **Requirements**: FR-027 (`project.submit_feedback` description names the channel's owner and points app defects at the caller's own project), FR-028 (kit-shipped `wxCreateTestPlan` references stop routing application-under-test findings to the vendor queue)
- **Tasks**: T031–T032
- **Schema**: none
- **Detail**: `specs/Project-Scope/043-user-feedback.md` § Amendment F

### Amendment G — "triaged" means wxperts looked (2026-10-09)

- **Date**: 2026-10-09
- **Prompted by**: feedback `b4d8b0c6` and `e8541c30` from project `a899b6e4`. Hosted-MCP logs show
  the customer's own Cockpit clicks set two of their reports to `triaged`. That took the root-issue
  report out of the vendor's "new" count, and it went unanswered for two days.
- **Changes T011b.** A submitter pushing their own report into Claude chat no longer changes its
  status.
- **FR-029**: The Cockpit's "Push to Claude chat" MUST build the prompt from the feedback item
  whichever way it is invoked: a row click, the inline button, or the context menu.
  - The inline button and the context menu pass the tree node, not the item. The handlers MUST
    unwrap `node.feedbackItem`.
  - Before this fix, the inline button sent a prompt of `undefined` fields.
  - The same applies to "Show feedback detail".
- **FR-030**: Pushing a report to chat MUST NOT change its status. The Cockpit no longer calls
  `project.triage_feedback` after a push, and the prompt shows the report's real status.
- **FR-031**: `project.triage_feedback` (submitter-scoped) MUST NOT change status any more.
  - It returns the report's current status unchanged, so a Cockpit at 0.2.40 or earlier, which
    still calls it after every push, can neither hide a new report nor reopen a resolved or
    declined one.
  - The tool stays registered so those older Cockpits get no error.
  - Vendor transitions remain `project.update_feedback_status` (T021).
- **Data**: reports `6d76a9fb` and `ecacc0c6` were reset from `triaged` to `new`, and
  `firsttriagedat` was cleared (2026-10-09).
- **Tasks**: T033–T035
- **Schema**: none
