# SCOPE-063: Customer-Facing Bug-Trapping — Install & Per-Project Triage

**Scope Number**: SCOPE-063
**Status**: `draft` — **stale label.** FR-001…FR-010 are implemented and mounted in production
(`src/server/app.ts`; migration `0036` applied; code fenced `[SCOPE 063 / T…]`). The doc was never
advanced past `draft`. **Amendment A** (kit-side delivery, below) is authored but **not released**.
**Created**: 2026-06-20
**Last Reviewed**: 2026-08-03 (Amendment A — kit-side delivery gap found by auditing what the
published kit actually ships)
**Depends On**: SCOPE-061 (automatic bug-trapping — reuses its `feedbacksubmissions` table, fingerprint, dedup, and triage service); SCOPE-043 (user-feedback pipeline — the triage back-half); the project-scoped API-token model (`mcpapitokens`, `ApiTokenService`); the per-project tab pattern (SCOPE-062 Theme).
**Related Scopes**: SCOPE-061 monitors wxKanban's *own* app into the central sink; this scope is its **customer-facing** counterpart — the same back-half pipeline, but routed per customer project and surfaced to the customer.
**Source**: `specs/Project-Scope/063-customer-bug-trapping.md`

---

## Overview

SCOPE-061 shipped automatic bug-trapping for wxKanban's own app: it traps runtime errors, fingerprints and de-duplicates them, and routes them into a single central sink (`wxKanban Development`) for wxperts to triage. That value never reaches customers — a customer's own application has no place to send its failures, and no screen to triage them.

This scope productizes 061 into a **customer-facing** surface with two connected capabilities:

1. **Install action** — a one-click button (inside a new Bug Reports tab) that *seeds* the bug-trapping scope into the customer's own project as a `draft` in their Design phase. The customer runs it through their own lifecycle and their AI builds runtime error-capture into *their own* application, wired to report back to *their* wxKanban project. Installing also issues the project's error-ingest endpoint and a one-time token to paste into their app.

2. **Bug Reports tab** — a new per-project tab where the customer sees only *their* project's trapped errors, triages them (status + notes, any project member), requests an on-demand **AI-suggested fix** per report, and turns a suggestion into a linked task.

Underneath, a token-authenticated `POST /api/projects/:id/errors` ingest routes each error to the owning project instead of the central sink. The change is strictly **additive** to SCOPE-061 — wxKanban's own dogfooding path (`/api/errors` → central sink) is untouched.

## Business Problem

The kit teaches customers to run a real software lifecycle, and 061 proved bug-trapping works — but only for wxperts. A customer building an app with the kit has no automatic visibility into that app's runtime failures: errors surface by luck, late, and inconsistently, exactly the problem 061 solved internally. There is no endpoint for their app to report to, no per-project storage for those reports, and no screen in their project to triage them.

The gap is purely **productization**: route a trapped error to the *owning* project (not the shared sink), give that project a triage surface its own members can use, and add the one piece 061 deferred — an AI-suggested cause and fix — plus a path to turn that suggestion into a tracked task. Framing the install as *seeding the 061 scope* (rather than flipping a hidden feature) keeps it on-brand with the kit's teach-the-methodology mission: the customer learns by building the capture themselves from a real scope, and the reports they then see close the loop.

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actor** | A Client Company **project member** (the customer) installing bug-trapping and triaging their own project's trapped errors. |
| **Secondary Actors** | The token-authenticated `POST /api/projects/:id/errors` ingest; the reused SCOPE-061 `feedbacksubmissions` storage + fingerprint/dedup; the `LLM_PROVIDER` AI pass; the existing task-create path; the SysAdmin (whose central triage is unchanged). |
| **Key Value** | A customer's silent app failures land in *their* wxKanban project — grouped, de-duplicated, with an on-demand AI-proposed cause and fix — and can become a tracked task in one click. |
| **Install mechanism** | A button inside the Bug Reports tab seeds the 061 scope into the project (`draft`, Design phase) via the canonical scope-create path; returns the project ingest endpoint + a one-time token. Idempotent via a stable content marker. |
| **Ingest mechanism** | `POST /api/projects/:id/errors`, bearer-token authed against `mcpapitokens`; stored under `:id` only when `token.projectid === :id`; reuses 061 fingerprint + dedup; fail-open (never 5xx); bounded per-IP and per-token; no Origin check (external apps are cross-origin). |
| **Triage surface** | New per-project Bug Reports tab — a project-scoped clone of the SysAdmin Feedback triage UI: list + detail, status transitions, internal notes (any project member), AI-suggestion panel (Suggest / Regenerate), Create-task. |
| **AI suggestion** | On-demand `POST …/suggest` via `generateOnce` (`LLM_PROVIDER`, default groq + `llama-3.3-70b-versatile`); strict-JSON, fail-open; soft-throttled with explicit Regenerate override. |
| **Scope Boundary** | **IN**: per-project token ingest + routing, install/seed action (any member) + endpoint/token issuance, per-project Bug Reports tab + triage (status/notes), on-demand AI-suggested fix, suggestion→linked task, the schema delta. **OUT**: writing the capture code into the customer's app (their AI does that from the seeded scope), any change to wxKanban's own `/api/errors` central-sink path, the SysAdmin central triage, disposition/accept-to-scope on the customer surface, a shipped capture SDK/snippet, multi-instance rate-limit coordination. |

---

## User Scenarios

### US1 — Install bug-trapping into my project (happy path)
A project member opens the project's Bug Reports tab (empty state) and clicks **Install bug-trapping**. The system seeds the 061 scope as a `draft` in the Design phase and returns the ingest endpoint (`…/api/projects/<id>/errors`) plus a freshly minted ingest token, shown once. They copy the token into their app's `.env`, run the seeded scope through createSpecs → implement, and their AI writes the capture code.
**Expected:** exactly one new draft scope exists in the project; endpoint + token displayed once; a second install reports `alreadyInstalled` (no duplicate scope).

### US2 — Triage a trapped error with an AI-suggested fix (primary value)
The customer's deployed app throws a `TypeError`. It posts to their ingest endpoint and appears in the Bug Reports tab, grouped by fingerprint with an occurrence count. A member opens it, clicks **Suggest fix**; an AI pass returns a likely cause + proposed fix. The member sets status `triaged` and adds a note.
**Expected:** report visible only within that project; AI suggestion populated and persisted; status/notes saved and visible to other members.

### US3 — Cross-tenant isolation + abuse (the must-not-fail case)
Project B's token is used to POST an error to project A's endpoint → rejected (token's project ≠ URL project → 403). A flood of malformed/oversized payloads hits the endpoint; each is bounded (per-IP + per-token rate limit, 32 KB cap) and answered 4xx/202 — never 5xx, never mis-stored. A project-B member querying the Bug Reports API cannot read project A's reports.
**Expected:** no cross-project read or write; capture stays fail-open; one noisy project/IP can't starve another.

### US4 — Turn a suggestion into a task
After reviewing an AI-suggested fix, a member clicks **Create task**. A new Task is created in the project, pre-filled with the report's title and the AI's cause + fix as the description, linked back to the report. The report auto-advances to `inprogress`.
**Expected:** a real Task appears on the project's board carrying the suggestion text; the report shows the link; a second click does not create a duplicate.

---

## Functional Requirements

### FR-001 — Per-project error ingest endpoint
`POST /api/projects/:id/errors` accepts a trapped error from an external app and stores it against project `:id`.
- [ ] Requires `Authorization: Bearer <project token>`; validated against `mcpapitokens` (not revoked).
- [ ] Stores the error under `:id` only when `token.projectid === :id`; otherwise **403**.
- [ ] Reuses 061 fingerprint + dedup: repeat of an open error increments `occurrencecount` + `lastoccurredat` instead of inserting.
- [ ] Fail-open: any internal failure returns 202, never 5xx; malformed/oversized (>32 KB) → 4xx/202, never stored.

### FR-002 — Ingest abuse bounding
- [ ] Per-IP rate limit and per-token rate limit both enforced (one noisy project/IP can't starve others).
- [ ] No Origin check on this route (external apps are cross-origin; bearer token is the trust anchor).
- [ ] Unknown `kind` / missing required fields rejected without 5xx.

### FR-003 — Central sink unchanged
- [ ] Existing `POST /api/errors` (unauthenticated, central sink) behaves exactly as before; wxKanban's own trapped errors still land in `wxKanban Development`.
- [ ] `ErrorCaptureService.capture()` defaults to the central sink when no `projectId` is given.

### FR-004 — Install bug-trapping (seed scope)
A button inside the Bug Reports tab installs the 061 scope into the project.
- [ ] Available to any authenticated member of the project's company; tenant-guarded.
- [ ] Creates a `draft` scope via the canonical scope-create path (auto-numbered `specnumber`; respects unique `(projectid, specnumber)`).
- [ ] Idempotent: a stable marker in the seeded content prevents a duplicate; a second install returns `{ alreadyInstalled: true, specnumber }`.
- [ ] Returns the ingest endpoint URL and a project ingest token; token cleartext shown **once**; the secret is never written into the scope content.

### FR-005 — Seeded scope is project-parameterized
- [ ] The seeded scope's content targets *this* project: it embeds the project's ingest endpoint and instructs the customer's AI to build capture into their own app posting there, sourcing the token from their `.env`.

### FR-006 — Per-project Bug Reports list + detail
- [ ] `GET /api/projects/:id/bug-reports` returns only rows where `projectid = :id`; supports `?status=&source=&type=`; defaults to `source=auto`/`type=error`.
- [ ] `GET …/:reportId` returns a single report only if `row.projectid === :id` (else 404).
- [ ] Visible to any authenticated member of the project's company; a member of another company sees nothing.

### FR-007 — Triage (status + notes)
- [ ] Any project member can transition status (new→triaged→needsinfo→inprogress→resolved/declined) and append internal notes.
- [ ] Every mutation re-checks `row.projectid === :id` before writing.
- [ ] `declinereason` required when status set to `declined`.

### FR-008 — On-demand AI-suggested fix (soft throttle + override)
- [ ] `POST …/:reportId/suggest` runs an AI pass via `LLM_PROVIDER` (default groq + `llama-3.3-70b-versatile`); stores `suggestedsolution`, `suggestedsolutionrationale`, `suggestedat`.
- [ ] Throttled: if `suggestedat` is within the window, return the cached suggestion without a model call.
- [ ] Explicit **Regenerate** (`?force=true`) bypasses the throttle and forces a fresh call.
- [ ] Fail-open: on any LLM error, columns stay null, soft failure, never 5xx. Only runs on `source=auto`/`type=error`.

### FR-009 — Turn suggestion into a task
- [ ] `POST …/:reportId/create-task` creates a Task in the project pre-filled with the report title + AI cause/fix as description, via the existing task-create path. Available to any project member.
- [ ] Stores `linkedtaskid` on the report; a second click does not create a duplicate (returns the existing link).
- [ ] On task creation the report auto-advances to `inprogress`.

### FR-010 — Schema delta
- [ ] `feedbacksubmissions` gains nullable `suggestedsolution text`, `suggestedsolutionrationale text`, `suggestedat timestamp`, `linkedtaskid uuid`; mirrored in the mcp-server schema; one generated migration applied via the pg.Client+transaction pattern.

---

## Amendment A — Kit-side delivery (2026-08-03)

**Why this amendment exists.** FR-001…FR-010 all landed: the routes are implemented and mounted
(`src/server/app.ts` — ingest, install, triage), migration `0036` applied, `BugSuggestionService`
and `BugReportsTabView` shipped, everything fenced `[SCOPE 063 / T…]`. But the capability was built
**entirely on the app side**. A grep of the published kit (`wxKanban-agent-Orchestrator`, v1.7.44)
finds **no mention of bug-trapping in any command, skill or reference** — so a customer's AI
toolchain has no idea the capability exists.

The scope's own design depends on discovery: FR-004 seeds a scope into the project, and *then* the
customer's `createSpecs → implement` builds the capture code. That loop is sound — it simply never
starts, because nothing tells them to click Install. The install button sits in a tab, unmentioned.

The same audit found a second, wider gap: **nothing in the kit reports a kit defect back to
wxperts.** The only `project_submit_feedback` wiring shipped lives inside `wxCreateTestPlan` and
`test-sweep`, and it files *test-plan findings* (clarifications, unenforced FKs) — not "this command
errored" or "this gate misfired". `implement` had no reporting step at all, so a field defect that
cost one customer an hour cost every other customer the same hour, invisibly.

### FR-011 — `implement` reports field defects (kit → wxperts)
- [ ] `implement` gains a **Phase 6** that files `project_submit_feedback` (`type: "bug"`) when the
  **kit itself** misbehaved: an MCP tool errored on valid input, a phase's instructions could not be
  followed as written, a generated artifact was malformed, or a documented gate passed/blocked wrongly.
- [ ] Explicitly **excluded**: the project's own failing tests or non-compiling code, and merely
  ambiguous specs (ambiguity is a clarification and belongs to `/wxCreateTestPlan`'s findings path).
  Filing those buries real defects.
- [ ] `title` carries the **stable** identity (command + phase + failure) with run-specific values
  such as UUIDs, absolute paths and timestamps kept **out** of it — the queue de-duplicates on the
  title, so a UUID in it files a fresh copy of the same defect every run (the SCOPE-110 failure mode).
- [ ] One report per distinct defect per run; repeats counted in `details`.
- [ ] **Fail-open** — a reporting failure is noted in the run output and never fails, blocks or
  retries the implement run.

### FR-012 — `implement` offers bug-trapping once per project
- [ ] `implement` gains a **Phase 6b** that checks for a scope titled "Automatic Bug-Trapping &
  Reporting" (content marker `<!-- wxkanban:bug-trapping-seed -->`, per FR-004's idempotency marker).
- [ ] Present → say nothing. This is a one-time offer, not a per-run prompt.
- [ ] Absent → one line in the run output pointing at the project's **Bug Reports** tab, and naming
  the path that follows: install seeds a scope, and running it through `createSpecs → implement`
  builds the capture into the application.
- [ ] The agent **must not install it**. Install issues a one-time ingest token that has to be shown
  to a human exactly once (FR-004), so it stays a deliberate action in the web app.

### FR-013 — Both authoring copies stay in step
- [ ] The phases land in **both** `_wxAI/commands/implement.md` and `.claude/commands/implement.md`.
  These two files are byte-identical by convention and drift silently when only one is edited.
- [ ] Reaching existing customers requires a **kit release**. `UPGRADE_STRIP_FILES`
  (`src/server/services/KitProxyService.ts`) strips `CLAUDE.md`, `.env`, `.mcp.json` and the legacy
  `mcp-server` tree — but **not** `_wxAI/` or `.claude/commands/`, so unlike SCOPE-080's Item A this
  reaches upgrades, not just new scaffolds.

### Amendment A status
FR-011, FR-012, FR-013 (authoring half) applied **2026-08-03**, out of band — no `implement` run,
no fences (markdown only). **Not yet released**: customers see none of it until a kit release is cut.
Ships alongside two other unreleased `implement` deltas — Phase 5b (SCOPE-120 seed authoring) and the
`wxPreTest` skill, neither of which is in v1.7.44.

**Known authoring gap, not fixed here:** `preTest.md` exists only under `.claude/commands/` and was
never authored into `_wxAI/commands/`, so a release would not carry it even today.

---

## Technical Sections

### Data / Schema
- `feedbacksubmissions` gains nullable: `suggestedsolution text`, `suggestedsolutionrationale text`, `suggestedat timestamp`, `linkedtaskid uuid` (→ tasks). Mirrored in `mcp-server/src/db/schema.ts` (061's two-mirrors rule). Generated via drizzle-kit; applied via the pg.Client+transaction pattern.
- No new table — reuses 061's `feedbacksubmissions` (already carries `projectid`, `source`, fingerprint, occurrence count, full triage workflow).

### API Routes (new)
- `POST /api/projects/:id/errors` — token-auth ingest (Seam A). New `authenticateProjectIngest` middleware (bearer-only, never 5xx). New `src/server/routes/projectErrorIngest.ts`.
- `POST /api/projects/:id/bug-trapping/install` — seed scope + issue endpoint/token (Seam B). New `src/server/routes/projectBugTrapping.ts`.
- `GET /api/projects/:id/bug-reports` · `GET …/:reportId` · `PATCH …/:reportId/status` · `POST …/:reportId/note` · `POST …/:reportId/suggest` · `POST …/:reportId/create-task` (Seam C). New `src/server/routes/projectBugReports.ts`.
- All Seam B/C routes: `authenticateToken` + `projectInCompany` tenant guard (reused from `projectTheme.ts`). All mounted in `src/server/app.ts` next to `projectThemeRoutes`.

### Services
- Refactor `ErrorCaptureService.capture(input, ctx)` → `ctx.projectId` (default `SINK_PROJECT_ID`); per-fingerprint rate-key becomes `${projectId}:${fp}`. Pure refactor — 061 behavior preserved.
- New `ProjectBugReportService.ts` — project-scoped list/detail/status/note/create-task; every query filters `projectid`, every mutation re-checks `row.projectid`. Does *not* reuse the cross-project `FeedbackTriageService.listFeedback`.
- New `BugSuggestionService.ts` — calls `generateOnce(...)` (`src/server/ai/llm-provider.ts`), strict-JSON + `safeParse` + fail-open (mirrors `deriveThemeViaAI`).
- New `src/server/lib/bugTrappingScopeTemplate.ts` — `renderBugTrappingScope({ projectName, ingestEndpoint })`; install uses `ScopeService.createScope` + `apiTokenService.getOrCreateToken`.

### Frontend Components
- New `src/client/components/Projects/BugReportsTabView.tsx` — project-scoped clone of `SysAdmin/Feedback.tsx` (list+detail, status buttons, notes, AI-suggestion panel with Suggest/Regenerate + Create-task). Empty state hosts the **Install** action (button → dialog showing endpoint + one-time token). Uses the `authHeaders()` Bearer pattern from `ThemeTabView`.
- Wire into `src/client/pages/ProjectWorkspacePage.tsx`: add a `bugreports` tab (button + `activeTab` ternary + conditional render), mirroring the Theme tab.

### AI Integration
- Reuses the `LLM_PROVIDER` contract — no new provider wiring. Default groq + `llama-3.3-70b-versatile`.

---

## Success Criteria

1. **Isolation holds.** 0 cross-tenant reads or writes in testing; the automated isolation test passes in CI.
2. **Ingest correctly routed and bounded.** Valid project token stores under that project 100% of the time; mismatched token → 403; malformed/oversized/flood traffic → 4xx/202 with zero 5xx and zero mis-stored rows.
3. **Dogfooding untouched.** wxKanban's own trapped errors continue to land in the central sink after the change (regression on `/api/errors` green).
4. **Install works end-to-end and is idempotent.** One click seeds exactly one draft scope + returns endpoint + one-time token; a second click yields `alreadyInstalled` with no duplicate.
5. **Value loop completes.** From a real trapped error, a member can get an AI-suggested fix and create a linked task in under ~30 seconds of interaction; the task carries the suggestion text and the report shows the link.
6. **AI pass resilient and economical.** Suggestion succeeds on normal input; with the LLM unavailable it fails open (null columns, no 5xx); the soft throttle prevents repeat model calls within the window while Regenerate forces a fresh one.

---

## Key Entities

- **Trapped Error** — an auto-captured runtime error from a customer's own application, routed to and stored against its owning wxKanban project (a `feedbacksubmissions` row, `source='auto'`, `type='error'`).
- **Error Ingest Token** — a project-scoped bearer token (reusing `mcpapitokens`) authorizing an external app to post Trapped Errors to that project; bound to the project, revocable, shown in cleartext once at issue.
- **Bug Report** — a Trapped Error as surfaced and triaged in the per-project Bug Reports tab (status, notes, AI suggestion, optional linked task).

---

## Constraints

- **Spec-first / fencing.** Implementation routes through the orchestrator `implement` path; all new top-level units fenced `[SCOPE 063 / Tnnn]`; `auditfences` clean before push (CLAUDE.md).
- **Two-schema mirror.** `feedbacksubmissions` changes land in both `src/db/schema` and `mcp-server/src/db/schema.ts` or the MCP side drifts (061 precedent).
- **No secret in spec content.** The ingest token is surfaced once in the install response only — never written into the seeded scope markdown or any persisted doc.
- **Customer surface read-limited.** Disposition and accept-to-scope remain SysAdmin-only; customers get list/detail/status/note/suggest/create-task only.
- **DB connection.** Server code uses `src/db/client.ts` (postgres-js), not `lib/db.ts`; migration applied via the pg.Client+transaction pattern (drizzle-kit push needs a TTY).
- **LLM contract.** Reuse `LLM_PROVIDER` (default groq + `llama-3.3-70b-versatile`); no new provider wiring.

## Notes

- **Linchpin risk = cross-tenant leakage.** The entire defense is the `projectid` filter on every query + per-row recheck on every mutation + the token↔`:id` binding on ingest (US3 / Success Criterion #1).
- **In-memory rate limits are single-instance** (carried forward from 061). Acceptable for v1; multi-instance coordination is a deferred follow-up — noted, not built.
- **Pre-existing, out of scope:** `getProviderModel` maps `anthropic` → date-suffixed `claude-haiku-4-5-20251001`; alias `claude-haiku-4-5` is preferred. Flagged for separate cleanup, not touched here.
- **Dependency:** assumes the customer's app can send HTTPS POSTs with a bearer header (any stack). The seeded scope tells *their* AI how to build that; wxKanban ships no capture SDK/snippet in v1.
- **Builds on SCOPE-061** (capture, fingerprint, dedup, triage service, `feedbacksubmissions`). Strictly additive — not a replacement.
