# Spec 043: User Feedback — Bug Reports & Suggestions from VS Code

**Spec Number**: 043
**Status**: `draft`
**Created**: 2026-05-30
**Last Reviewed**: 2026-05-31 (scope review — GitHub fan-out dropped; lifecycle-artifact-as-core; notification channels; needs-info round; background AI triage)
**Depends On**: spec 042 (VS Code Dev Cockpit — extension shell, Activity Bar sidebar, project resolution + project-scoped token auth, MCP read pattern; 043 fills the reserved feedback/bug-panel slot), spec 028 (Hosted MCP Deployment — MCP transport + project-scoped API tokens), spec 019 (Agent Orchestrator Kit — McpClient, project resolution), spec 014 (SysAdmin / Platform Admin — the triage surface)
**Related Scopes**: 042 reserved the cockpit slot this fills. **Note:** 042's deferred *"select a bug → AI fixes it"* in-project self-fix handoff is a distinct future scope; 043 is the **user → wxperts feedback channel**, not in-project bug-fixing.
**Source**: `specs/Project-Scope/043-user-feedback.md`
**Amended Elsewhere**: SCOPE-132 Amendment C (2026-10-26) changes this scope's `triaged` wording in both mirrored copies (FR-050), adds server-rendered `resolved` templates, a version guard and an audit row per change to `project.update_feedback_status` (FR-051 – FR-054), and records `kitversion` on Cockpit reports (FR-055). The requirements live there; this is the pointer.

---

## Overview

The Dev Cockpit VS Code extension gains a **"Report a Bug / Suggest a Feature"** command. Any signed-in kit user submits a typed report (bug or suggestion) through a **persona-led, buildscope-style guided interview** (a QA-minded **Bug Reporter** persona or a product-discovery **Feature Suggester** persona) that elicits the best possible signal; the extension auto-attaches context — project id, kit version, active scope, user/company (from the API token), VS Code version, and OS. The submission travels through a new MCP tool `project.submit_feedback` to the wxKanban server, which persists it to a `feedbacksubmissions` table (the **source of truth**) and renders it as a **lifecycle artifact** — a `bugreports.md`-style document that lands in the target project's lifecycle and is triaged through the normal flow. A **background AI assistant** auto-triages each new submission (classify, severity, dedup, draft a clarifying question). wxperts platform admins move each item through statuses (new → triaged → needs-info → in-progress → resolved → declined) and add internal notes; the submitter sees their report's current status — and answers any clarifying question — back inside the Dev Cockpit, optionally pushed via a chosen **notification channel** (in-app + email in v1). v1 ships the full channel, the triage workflow, and AI auto-triage; no rate-limiting.

## Business Problem

Today, user bug reports and ideas reach wxperts only ad hoc (out-of-band messages), so signal is lost, nothing is tracked, and users get no confirmation that their report was received or acted on. As the kit goes to a wider audience (the marketing push), wxperts needs a first-class, in-context channel that captures feedback **where users actually work** (VS Code), routes it straight into the dev workflow (as a lifecycle artifact the team already knows how to triage), and surfaces it for support (SysAdmin) — closing the loop back to the submitter with a visible status.

### Reusability — three layers (v1 builds Layer 1, generic by design)

The capability is built **generic and project-scoped** (keyed on `projectid` like 042/028), not hardwired to wxKanban. This is deliberate so the same code path serves a wider vision without redesign:

- **Layer 1 (v1 — IN SCOPE):** wxKanban's own feedback channel — kit users report bugs/suggestions about the product back to wxperts. Proven by dogfooding.
- **Layer 2 (later — falls out of Layer 1 for free):** any consumer project built *with* the kit fires feedback back into *its own* lifecycle (same tool, different `projectid`) — feedback arrives as spec-like `bugreports.md` artifacts the team resolves the normal way.
- **Layer 3 (future scope — DO NOT design schema now):** feedback shipped *inside* a consumer's released product for *their* end-users (different auth/tenancy/triage owner). Flagged as a downstream scope (044+); 043's tables must not be shaped around it.

### Persona-led capture (buildscope-style elicitation)

Submission is **not a flat form** — each type runs a **guided, persona-led interview** (the same section-by-section, one-question-at-a-time pattern as `buildscope`) so the submitter produces the best possible signal. One persona per type:

- **Bug Reporter persona** — a QA-minded triage partner. Elicits, in order: *what you were doing* → *expected result* → *actual result* → *reproduction steps* → *frequency / consistency* → *user-felt impact* → *environment* (auto-attached). Goal: a **reproducible, actionable** bug.
- **Feature Suggester persona** — a product-discovery partner. Elicits, in order: *the problem / pain* → *who feels it* → *current workaround* → *desired outcome* → *why it matters / value*. Goal: a **problem-framed** suggestion, not a solution-only ask.

**Execution (honors "kit is a workflow engine, not an AI client"):** the persona-led interview is driven by the **submitter's own editor AI** in VS Code — the Dev Cockpit supplies the persona prompt and collects the structured result; it does **not** call kit-internal AI. A **plain structured questionnaire** (the persona's questions as static fields) is the **fallback** when no editor AI is available, so capture always works. The structured result (not raw freeform text) is what `project.submit_feedback` sends and what the lifecycle artifact and background AI triage consume.

### Core Design

| Element | Value |
|---|---|
| **Primary Actor** | Kit user / developer — a signed-in user working in VS Code with the Dev Cockpit extension. Submits a bug or suggestion, answers any clarifying question, and later sees its status. |
| **Secondary Actors** | **wxperts platform admin** (triages in SysAdmin: status changes, internal notes, clarifying questions); **wxKanban server** (persists + renders the lifecycle artifact + drives notifications); **background AI assistant** (auto-triage over the artifact); **notification channel** (delivers status updates to the submitter). |
| **Key Value** | A first-class, in-editor feedback loop: users report bugs/ideas without leaving VS Code, wxperts captures every one with full context as a triageable lifecycle artifact, AI pre-triages it, and the submitter can see it was received and where it stands. |
| **Transport** | MCP only — project-scoped tools: `project.submit_feedback` (submit), `project.list_my_feedback` (the submitter's own items + status), `project.answer_feedback` (reply to a needs-info question). No app REST API exposure to customers (consistent with 042/028). |
| **Canonical destination** | A **lifecycle artifact** — a `bugreports.md`-style document rendered into the target project's lifecycle and triaged through the normal workflow. **No GitHub** (the GitHub fan-out is dropped entirely — no dedicated repo, no token, no issue creation). |
| **Source of truth** | The `feedbacksubmissions` DB row. The lifecycle artifact and any notification are derived/reconciled from it and **never silently dropped** — a failed notification leg is marked **pending** on the row with a **manual retry** in SysAdmin (no background retry worker in v1). |
| **Background AI triage (v1)** | On each new submission the AI assistant **classifies** (bug vs. suggestion), tags **severity**, runs **dedup** (links near-duplicates to an existing item and informs the submitter it was already received / added to an existing report), and **drafts a clarifying question** for the admin to send. Draft-resolution is deferred. |
| **Notifications (v1)** | **Submitter-side preference.** Ships **in-app Dev Cockpit (always-on)** + **Email**. **Reserved for v2:** **SMS** and the **AI-Assistant channel** (deliver via the submitter's chosen assistant — YappChat / OpenClaw — once those expose an inbound notification API). Channels are a pluggable list so v2 channels are config, not a rewrite. wxperts-side, the SysAdmin queue + AI pre-triage is the notification. |
| **Scope Boundary** | **IN**: VS Code submit command + **persona-led guided capture** (Bug Reporter / Feature Suggester personas, driven by the submitter's editor AI, with a static questionnaire fallback); auto-context capture; `project.submit_feedback` / `project.list_my_feedback` / `project.answer_feedback` MCP tools; `feedbacksubmissions` table + migration; rendering each submission as a lifecycle artifact; background AI auto-triage (classify + severity + dedup + draft-clarification); SysAdmin triage surface; status workflow (new→triaged→needs-info→in-progress→resolved→declined-with-reason) + admin internal notes; single-round **needs-info** clarification (same record); submitter-visible status + clarifying-question reply in the Dev Cockpit; notification channels in-app + email; pending-flag + manual retry for failed notification legs. **OUT (future)**: GitHub issue fan-out; rate-limiting / abuse prevention; file/screenshot attachments; submission from the web app (VS Code only in v1); SMS + AI-Assistant notification channels (v2); multi-round threaded chat (v1 is single-round needs-info + internal notes); background retry worker; AI draft-resolution; SLAs / auto-routing; email-based replies; analytics dashboards; **Layer 2** consumer-project reuse and **Layer 3** ship-in-released-product; the 042 "select a bug → AI fixes it" self-fix handoff. |

---

## Success Metrics

1. A signed-in user can submit from VS Code via the **persona-led interview** (open command → pick type → answer the persona's guided questions → submit) and receives a confirmation with a reference id **within 3 seconds** of submitting. The interview favors signal quality over raw speed, but a user who wants to move fast can answer tersely and still submit.
2. **Zero silent drops:** 100% of accepted submissions are persisted to `feedbacksubmissions` *and* rendered as a lifecycle artifact; any notification leg that fails is marked **pending** on the row (manual retry in SysAdmin) and never lost — the DB row is the source of truth.
3. wxperts can triage any submission (status change, internal note, clarifying question) from SysAdmin, and the submitter sees the updated status / question in the Dev Cockpit **within one refresh cycle**.
4. Every new submission is **auto-triaged by AI** (classified + severity-tagged + dedup-checked) before a human opens it.
5. Every submission records `createdat` and `firsttriagedat` timestamps, so **median time-to-first-triage is reportable**.

---

## User Scenarios & Testing

### US1 — Report a bug from the editor (primary / happy path)

**Actor**: Kit user / developer

**Scenario**:
1. The user hits a problem while working in VS Code and runs the **"wxKanban: Report a Bug / Suggest a Feature"** command.
2. They pick a type (bug or suggestion); the matching **persona** (Bug Reporter or Feature Suggester) runs a short buildscope-style guided interview that draws out the key details one question at a time; they optionally choose a notification channel (in-app default, or email), and submit.
3. The extension attaches context automatically (project, kit version, active scope, user/company, VS Code/OS) and sends it via `project.submit_feedback`.
4. They get a confirmation with a reference id; the report now exists as a DB row and a lifecycle artifact, and the background AI has classified + severity-tagged it.

**Pass condition**: A complete, context-rich submission is captured in ≤ 3 steps and confirmed within 3 seconds, persisted as a row + lifecycle artifact, and AI-triaged.

---

### US2 — wxperts triages, the submitter sees status

**Actor**: wxperts platform admin (and the original submitter)

**Scenario**:
1. A wxperts admin opens the feedback queue in the SysAdmin dashboard and sees the new submission with its full context **and the AI's classification + severity + dedup result** already attached.
2. The admin moves it to *triaged*, adds an internal note, and later to *in-progress* / *resolved* (or *declined* with a reason).
3. The submitter, back in the Dev Cockpit, sees their report's current status update via their chosen channel.

**Pass condition**: Triage actions in SysAdmin are reflected to the submitter in the Dev Cockpit within one refresh cycle; `firsttriagedat` is recorded on first status change; a *declined* item shows the reason.

---

### US3 — Clarification round (needs-info)

**Actor**: wxperts platform admin (and the original submitter)

**Scenario**:
1. A report is too vague to act on. The admin sends a **single clarifying question** (often pre-drafted by the AI assistant); the status becomes **needs-info**.
2. The submitter sees "Needs more info" with the question shown inline in the Dev Cockpit and answers once via `project.answer_feedback`.
3. The answer is written back onto the same `feedbacksubmissions` row and appended as a **"Clarification" section** on the lifecycle artifact; status returns to *triaged*.

**Pass condition**: One clarification round-trip completes entirely inside the cockpit on the same record (no second file), and the artifact reflects the full question/answer exchange.

---

### US4 — Dedup (already received)

**Actor**: wxKanban server / background AI assistant

**Scenario**:
1. Several users report the same bug.
2. The AI assistant detects the near-duplicate and **links the new submission to the existing item**.
3. The submitter is informed their report was **already received / added to an existing report** (with the existing reference), still gets a confirmation, and can track the existing item's status.

**Pass condition**: Duplicates are linked rather than triaged independently; the submitter is told it was already received and still has a tracked reference.

---

### US5 — Fan-out is resilient (no silent drops)

**Actor**: wxKanban server

**Scenario**:
1. A submission is accepted and the DB row is written first, then the lifecycle artifact.
2. A notification leg (e.g. email) is momentarily unavailable.
3. The server marks that leg **pending** on the row and surfaces a **manual retry** in SysAdmin; the submission still succeeds and the user is still confirmed.

**Pass condition**: No accepted submission is ever lost; a transient notification failure is marked pending and retryable from SysAdmin, reconciled against the DB row, which is the source of truth.

---

## Design Decisions

- **Persona-led capture**, not a flat form: each type runs a buildscope-style guided interview (Bug Reporter / Feature Suggester persona) to maximize signal quality. Driven by the submitter's **editor AI** (never kit-internal AI, per the workflow-engine constraint), with a static questionnaire fallback. The structured result — not raw freeform text — is what flows downstream.
- **Canonical destination = lifecycle artifact**, not a GitHub issue. Feedback lands as a `bugreports.md`-style document in the target project's lifecycle and is triaged the normal way. This is more on-brand (educational/lifecycle), needs no external repo/token, and gives the background AI a structured substrate to work over. **The GitHub fan-out is dropped from v1 entirely.**
- **Built generic / project-scoped** (Layer 1 now), so Layer 2 (consumer-project reuse) falls out later for free; **Layer 3** (ship-in-released-product) is a separate future scope and must not shape 043's schema.
- **Background AI auto-triage in v1**: classify + severity + dedup + draft-clarification. Draft-resolution deferred.
- **Clarification = single-round needs-info on the same record** (not a threaded chat): one question, one answer, handled in the Dev Cockpit; the artifact gets an appended "Clarification" section. Full comment thread is a future upgrade.
- **Status model**: new → triaged → needs-info → in-progress → resolved → **declined (with reason)**.
- **Notifications are submitter-side and pluggable**: in-app + email ship in v1; **SMS and the AI-Assistant channel (YappChat / OpenClaw) are v2**, gated on those products exposing an inbound notification API.
- **Resilience without a worker**: DB row first, then artifact, then notifications; a failed notification leg is marked **pending** with a **manual retry in SysAdmin**. The background retry worker is deferred to a later version.
- **No rate-limiting in v1** (KISS; revisit if abuse appears).
- **VS Code only** for v1 submission (the audience works there; web submission is a future add).

---

## Amendment B — Cockpit feedback scoping + the vendor's incoming queue (2026-08-03)

### What prompted it

Andy reported the Cockpit's **My Feedback** list had grown unmanageable. Measured against
production the same day: **94 open rows spanning 17 origin projects**, of which only **16**
belonged to wxKanban itself. The rest were consumer and dogfooding projects, plus **21
auto-captured runtime errors carrying no origin at all**.

Two earlier findings were also corrected on inspection, and both had been stated wrongly:

- **`resolved` was already hidden.** `my-feedback-filter.ts` has always defaulted to
  `status !== 'resolved'`. Reading the tool output as the data suggested nothing had ever been
  closed; the DB in fact held 4 resolved rows. `declined` was **not** filtered.
- **The list was not truncated.** The sink cap was `isSink ? 500 : 50`, so all rows were showing.

### FR-014 — "My Feedback" is scoped to the current project AND the caller's company

- [ ] `showAllInProject` is **false everywhere**, reversing the 2026-07-24 sink-shows-all rule.
      That rule made the sink list every stored row on the reasoning that it is the central triage
      hub — which turned a per-project view into everyone's queue.
- [ ] A company guard filters on the **`companyid` COLUMN**, not only `context.originProjectId`.
      Provenance lives in a JSON blob stamped at submit time; tenancy must not rest on it. Measured
      effect today is zero rows (every wxKanban-origin row was already wxperts') — this is defence
      in depth, not a fix.
- [ ] **It does close a real hole.** `submit_feedback` never validates `input.projectId` before
      stamping it as `context.originProjectId`, so a caller could stamp another company's project id
      and have their row appear in *that company's* Cockpit list. `companyId` comes from the token
      and cannot be forged, so the guard blocks it. The comment above the handler claims *"a token
      for project A can never file feedback against project B"* — that is true of the stored
      `projectid` column (forced to the sink for everyone) but **not** of the provenance field that
      drives the view. **The comment should be corrected; it describes a guarantee the code does not
      provide.**
- [ ] Triage keeps its full view: the web app's Bug Reports tab filters the `projectid` column, and
      since the sink IS wxKanban Dev it still lists every stored row there.

### FR-015 — Vendor's incoming queue (`list_my_feedback` `incoming: true`)

- [ ] Scoping FR-014 removed the only surface where the sink owner saw customer reports. Rather than
      re-conflate the two lists, `incoming: true` asks the opposite question: every sink row whose
      owning company is **not** the caller's, ignoring project origin.
- [ ] **Gated on sink ownership** — `assertCallerCanViewProject(scope, sinkProjectId())` must pass,
      or the flag would be a polite way to read across tenants, which is what SCOPE-043 was.
- [ ] Rows with a null `companyId` (auto-captured errors, no submitter) stay out: an unattributable
      row must not appear under any company's view.
- [ ] Cockpit renders it as a **separate** "Incoming from customers" section, shown only when
      non-empty — so it never appears for a consumer project. Measured 2026-08-03: **57 items, 47
      untriaged, across 9 customer companies.**

### FR-016 — NOT BUILT: nobody is notified when customer feedback arrives

- [ ] There is **no notification leg**. The fan-out on submit is (1) render the lifecycle artifact,
      (2) run AI triage. Neither tells a human. `notificationChannel: inapp|email` on the row is the
      *submitter's* channel for needs-info replies — not a route to the vendor.
- [ ] So the loop is: customer files → row lands → AI triages → it sits until someone looks. With
      FR-014 scoping the Cockpit, "someone looks at the web app" became the only path, which is why
      FR-015 exists.
- [ ] **Deliberately deferred** (Andy, 2026-08-03): scope it, do not build it. Shape when picked up —
      a third best-effort fan-out leg notifying the sink-owning company on new feedback, severity-gated
      to avoid turning 47 untriaged rows into 47 emails, and fail-open like the other two legs.
- [x] **BUILT 2026-08-03** (commit `a9cb7a44`), to the shape scoped above: third fan-out leg, Mailgun
      over plain `fetch` (no new dependency), best-effort, severity-gated at `high`, and OFF until
      `FEEDBACK_NOTIFY_EMAIL` is set. An unclassified row (null severity) **notifies** rather than
      staying silent — a triage pipeline that has stopped working is itself worth hearing about.
- [x] Building it exposed an unrelated latent defect: `mcp-server/src/db/schema.ts` is a **partial
      mirror** and its `companies` table declared no `name` column, while a hand-written
      `as Array<{ name }>` cast asserted a shape Drizzle never selected. No `42703` — the field was
      simply `undefined` forever, so every notification would have printed a raw company UUID. Only a
      live read caught it. Mirror corrected; casts in this area now use `$inferSelect` so a missing
      column is a compile error.

### Amendment B status

FR-014 and FR-015 implemented 2026-08-03, out of band. `tsc -b` clean; mcp-server suite unchanged at
234 passed / 14 pre-existing failures; extension typecheck and build clean. **Not deployed** — the MCP
half needs a push to main (auto-deploys), the Cockpit half needs a VSIX build and publish. FR-016 was
scoped here and **built later the same day** — see its entry above and commit `a9cb7a44` (mcp-server
suite then 252 passed / same 14 pre-existing failures). Also undeployed: it ships inert until
`FEEDBACK_NOTIFY_EMAIL`, `MAILGUN_DOMAIN` and `MAILGUN_API_KEY` are set in the App Runner console.

---

## Amendment C — Vendor status transitions over MCP (2026-08-03)

### What prompted Amendment C

FR-015 gave the vendor a **read** of the incoming queue and FR-016 gave them a **signal** that
something arrived. Neither gave them a **write**. The vendor can now be told a report exists, open it
in Claude, and still have to leave for the SysAdmin web screen to move it one square.

Measured in production 2026-08-03 — 100 stored submissions, by status:

| status | rows |
|--------|-----:|
| `new` | 69 |
| `triaged` | 20 |
| `resolved` | 9 |
| `inprogress` | 2 |

Every one of those 9 `resolved` and 2 `inprogress` rows had to be set by hand in the web screen,
because **MCP can write exactly one status and only on a row the caller owns**:
`project.triage_feedback` is hardcoded to `status: 'triaged'` and refuses anything it does not own
(*"You can only triage your own feedback"*). The full vocabulary lives only in
`FeedbackTriageService.transitionStatus`, reachable solely through the platform-admin web route.

### The constraint that shapes the design

`mcp-server` has **zero imports from `src/`** — they are separate App Runner deployments that share
one database. MCP therefore cannot call `transitionStatus`, and `notifications` is not in the MCP
schema mirror. Every option is either "re-implement the transition against the shared DB" or "reach
the app over the network". Chosen: **re-implement**, matching how the four existing feedback tools
that write already do it against the shared DB (`submit_feedback`, `answer_feedback`,
`triage_feedback`, `manage_my_feedback`; `list_my_feedback` is read-only and gates the same way this
tool will). Rejected: a new service-to-service HTTP route, which would invent a fresh
privilege surface in the area where SCOPE-043's cross-tenant hole already lived.

### FR-017 — `project.update_feedback_status`

- [x] **New tool, not an extension of `triage_feedback`.** That tool is explicitly owner-only;
      widening it into a vendor tool would silently escalate an existing tool's privilege. It stays
      exactly as it is.
- [x] Contract: `feedbackId` (uuid, required), `status` (the six values below), `note` (string,
      optional — **required** when declining). Returns `{ id, status, firstTriagedAt, notified }`.
- [x] Vocabulary is the app's: `new`, `triaged`, `needsinfo`, `inprogress`, `resolved`, `declined`.
- [x] Must be added to `PERMISSION_MATRIX`; a tool missing from it fails at runtime as
      *"Unknown tool"* rather than as a permission error.
- [x] **Authority — sink ownership, not row ownership.**
      `assertCallerCanViewProject(scope, sinkProjectId())`, the *identical* gate FR-015 uses for
      `incoming: true`. "May I read other tenants' reports in this sink" and "may I move them" become
      the same question answered by the same line, so the two surfaces cannot drift apart into a hole.
- [x] Single row per call. **No batch** — a batch decline sharing one reason is coarse, and partial
      failure would need a defined outcome that nothing yet needs.
- [x] One transaction: set status, stamp `firsttriagedat` when unset (first touch, matching the web
      path), append `note` to `internalnotes` using the app's `\n---\n` join, bump `updatedat`.

### FR-018 — Declining requires the note (resolves the missing reason field)

- [x] The web path **rejects** `declined` without a reason, and the submitter's notification quotes
      that reason. With no separate reason field in the contract, `declined` would be unreachable over
      MCP — a hole in the vocabulary.
- [x] Resolution (Andy, 2026-08-03): when `status='declined'` the `note` is **required** and is
      written to **both** `internalnotes` and `declinereason`. One field, both jobs, vocabulary intact.
- [x] **Extended to `needsinfo` at the final review (Andy, 2026-08-03).** The same hole existed one
      status over, and worse: `needsinfo` was reachable with no way to set the question, so the
      submitter was told *"needs more info: please add details."* — or was re-asked a **stale**
      question, since `answer_feedback` never clears `clarificationquestion`. The note is now
      required for `needsinfo` too and is written to `clarificationquestion`, replacing any stale
      value. The rule now reads: a note is required for `declined` and `needsinfo`, becoming the
      decline reason or the clarifying question respectively.

### FR-019 — The submitter is told

- [x] Mirror `notifications` into the MCP schema (`id`, `userid`, `type`, `entityid`, `entitytype`,
      `message`, `read`, `createdat`) and insert `type='feedback_status'`, `entitytype='feedback'`,
      `entityid=row.id`, `userid=row.userId` — parity with the web screen's always-on in-app leg.
- [x] **The email leg cannot run from MCP** (no SES there). The app's retry affordance appears only
      for `notifystatus='failed'`, so writing `'pending'` would leave an email-channel submitter with
      silence *and* no retry button — the precise disease this scope exists to cure.
- [x] Resolution (Andy, 2026-08-03): set `notifystatus='done'` when the submitter's channel is
      `inapp` (genuinely delivered) and `'failed'` when it is `email`. Deliberately abusing `failed`
      to mean "in-app delivered, email still owed", because it makes the gap **visible and one click
      from fixed** instead of invisible. Recorded here because the value is otherwise a lie to a
      future reader.

### FR-020 — Drift guard

- [x] Re-implementing the transition means the rules now exist twice. A test asserts the MCP status
      vocabulary equals the app's `FEEDBACK_STATUSES`. Without it the two copies diverge quietly,
      which is the standing cost of the chosen approach.
- [x] **Correction to this requirement as first written.** It claimed the guard "fails the build".
      That is **false**, and was false before this scope existed: **no CI job runs any mcp-server
      test.** Root `vitest.config.ts` includes only repo-root `tests/`, and `auditfences.yml`
      references `mcp-server` solely as a schema path. The guard — and every test added by this
      amendment — runs only when a developer invokes vitest inside `mcp-server/`. Recorded rather
      than quietly fixed, because a guard believed to gate merges but which gates nothing is worse
      than a known-manual one. **Follow-up (not in this amendment, by decision 2026-08-03): wire an
      mcp-server test job into CI.** Note the 14 known-failing tests there would need excluding
      first or the job fails on arrival.
- [x] **FOLLOW-UP CLOSED, same day**, under SCOPE-122 FR-011 (Amendment B). `.github/workflows/`
      gained an `mcp-server-tests` job running typecheck plus **287 tests** on every PR and push to
      main, so this guard now genuinely fails the build. The three suites needing live
      infrastructure (`integration.test.ts`, `server.test.ts`, `project-kit-scope-flow.test.ts`) are
      excluded **by name in the workflow** rather than hidden in config — a silently-skipped suite is
      the same disease as a guard nobody runs.
- [x] The guard's own failure path was exercised, not assumed: a bogus status was injected, the
      test observed failing, then reverted. It also distinguishes "no app tree here" (kit consumer
      — skip) from "the app file moved" (fail), so a rename cannot silently disable it.
- [x] Verification follows the project rule that unit-green plus build-green is not evidence: the
      transition was exercised against a real row on the real database before this was called done.

### Non-goals

- [ ] No batch updates. No email sent from MCP. No change to `triage_feedback`, `answer_feedback` or
      `manage_my_feedback`. No new status values. No Cockpit UI in this amendment — the tool is
      callable from Claude first; surfacing it in the Cockpit is a separate piece of work.

### Amendment C status

Scoped, approved and **implemented 2026-08-03**, in five reviewed steps (commits `0d449da8`,
`8e79196f`+`ed2cf84f`, `8f9628c3`, `27708120`+`2b8fa73f`, `b7106075`).

**Result:** `tsc --noEmit` clean, `npm run build` clean, mcp-server suite **281 passed** against
the unchanged pre-existing baseline of **14 failures** (`integration.test.ts` needs a live DB;
`project-kit-scope-flow.test.ts` needs fixture files). 24 tests added.

**Design change made during implementation.** FR-017's handler was extracted from the `server.ts`
switch into an exported, dependency-injected `updateFeedbackStatus()` in
`mcp-server/src/utils/feedback-status-update.ts`; the case is now four lines of glue. The reason is
recorded because it is the whole point: as a `case` in a 4000-line switch the handler was
**untestable** — not exported, and importing `server.ts` triggers config validation and a live DB
connect. The privilege boundary would otherwise have merged unproven, in the scope that has already
shipped one cross-tenant disclosure. 11 of the 24 tests now pin it, and a mutation analysis
confirmed that deleting the gate, or moving it after the write, both fail the suite.

**Verified against production** inside a transaction that was rolled back — the real
`updateFeedbackStatus()` against the real schema, proving every written column exists: status
`new`→`inprogress`, `internalNotes` appended, `firstTriagedAt` stamped on first touch,
`notifyStatus` resolved to `done` for an `inapp` submitter, and the inbox row written
(*"Your report … is now in progress."*). Post-rollback the row was confirmed unchanged and zero
notification rows leaked. Nothing was committed to production.

**NOT deployed.** A push deploys production and auto-deploys the hosted MCP; that remains a
separate, deliberate decision.

**Open follow-up:** wire an mcp-server test job into CI (see FR-020) — until then none of this
gates a merge.

### Amendment C — what the final review changed

A whole-branch review after the five tasks found four defects the per-task reviews had not, all
now fixed (commit `b111c155`):

1. **The fences did not parse.** They were labelled `FR-016/017/019`, but the fence parser's regex
   requires `[SCOPE nnn / Tnnn]`. Every declaration in this feature therefore counted as
   **un-fenced**, with the fence gate due to turn blocking on **2026-08-14**. Relabelled to
   **T020** (FR-016 notification leg), **T021** (FR-017 status tool) and **T022** (FR-019
   notifications mirror). Requirement IDs in this document remain `FR-0nn`; only fence labels
   changed, and code comments still cite the FR numbers because they point here.
2. **The `notifications` mirror was nested inside the `[SCOPE 058 / T003]` fence**, misattributing
   authorship — the same defect found and fixed in `server.ts` earlier the same day, repeated in
   `schema.ts` and missed because an audit sees *an* enclosing fence.
3. **The notification failure path was itself silent** — the exact disease FR-019 exists to cure.
   The catch only logged, so `notifystatus` kept its stale value and SysAdmin never showed a retry
   button. It now writes `notifystatus='failed'`, guarded so a second failure cannot escape.
4. **`needsinfo` had no way to set the question** — see FR-018 above.

**Known consequence, recorded deliberately:** because FR-019 sets `notifystatus='failed'` for
email-channel submitters, a SysAdmin retry re-runs `sendFeedbackNotification` and inserts a
**duplicate** in-app inbox row. Accepted: a duplicate notification is a smaller harm than a silent
one, which is the trade this whole scope is built around.

## Amendment D — a denial is not a server fault (2026-08-04)

### What was observed

`project.list_my_feedback` errors rose from a 0–35/day baseline through 08-02 to **935 on 08-03**
and **5,396 on 08-04**, across three consumer projects belonging to two customers, each polling
roughly twice a minute. Nothing alerted. The rise begins at Amendment B's deploy (`f95b78ae`).

### What it actually is

Production logs settle it. Every failing call carries `incoming: true`, and the same projects'
own-feedback calls succeed 46–76 ms apart in the same second:

```text
06:10:16.321  tool.call.success  project.list_my_feedback  46ms          ← own list, fine
06:10:16.437  ERROR Tool execution error {"incoming":true}               ← vendor query, denied
```

```text
McpError: MCP error -32603: Error executing tool project.list_my_feedback:
scope-violation: the requested project is not accessible to this token.
```

So **the customers' My Feedback panel is not broken**, and no customer data is affected. Amendment
B's gate is doing exactly its job: a consumer does not own the sink, so the incoming queue is
refused. Two defects turn that correct refusal into a production error signal.

**Root cause — an authorization denial is modelled as an unclassified exception.**
`ProjectAccessError extends Error`, not `McpError`, so it misses the `instanceof McpError` branch in
the `CallToolRequestSchema` catch and falls through to the generic handler, which logs at **error**
and rethrows as `ErrorCode.InternalError` (-32603). A permanent, expected, correct "no" is recorded
as a server fault. This affects every `assertCallerCanViewProject` call site, not just this one —
both `list_my_feedback` gates and `updateFeedbackStatus`.

**Contributing cause — the client asks a question it can never get "yes" to.** The Cockpit calls
`listIncomingFeedback` on every refresh for every project, and swallows the failure by design
("same fail-quiet posture"). That fail-quiet is why nobody noticed for two days: the customer sees
nothing wrong while the server records a 500, twice a minute, indefinitely.

The severity here is **not** availability. It is that a handler's error rate rose ~150× and stayed
there for two days with no signal — the monitoring finding (CC7.1/CC7.4), not the outage one.

### Requirements

- **FR-021** — A denial raised by `assertCallerCanViewProject` MUST be returned as a client-class
  MCP error, not `InternalError`, and MUST be logged at `warn` as a denial rather than at `error` as
  a fault. The opaque `PROJECT_ACCESS_DENIED` message is preserved verbatim: FR-021 changes the
  *classification* of the refusal, never its content, so the existence-oracle property that
  `decideProjectAccess` was built to avoid is unaffected. The audit outcome for a denied call MUST
  record a denial — this also closes the residual noted after Amendment B, where denials audited as
  `success`.

- **FR-022** — The Cockpit MUST NOT issue the incoming-queue request for a project whose company
  cannot own the sink. Preferred mechanism is a capability flag on `cockpit_summary`, which the
  refresh already calls: one authoritative server-side answer, no extra round trip, and no sink UUID
  hardcoded into the extension. *Deferred to a VSIX release* — customers run the shipped extension,
  so FR-022 cannot help the current incident.

### Sequencing — why FR-021 ships alone

Only FR-021 reaches customers without them taking action. It converts ~5,400 errors/day into the
same number of `warn`-level denials and makes the tool-error metric meaningful again the moment the
hosted MCP redeploys. FR-022 then removes the wasted round trip whenever the next extension ships.
The residual after FR-021 is one cheap (~50 ms) refused read per poll — noise-free, and acceptable
until FR-022 lands.

### Out of scope — flagged, not designed here

The reason this ran for two days is that **nothing alerts on MCP tool failure rate**. That is a real
gap and the one that stops NEW-9 recurring, but it belongs to the launch-observability work, not to
this scope: it is a metric filter on `tool.call.failed` plus a rate-of-change alarm onto the existing
SNS topic, and it protects all ~60 tools rather than this one. Recorded here so the dependency is
explicit; sequencing is a separate decision.

### Amendment D status

Scoped and **fully implemented 2026-08-04** — FR-021 (task **T023**) and FR-022 (task **T024**).

**Where the fix landed — two layers, because the incident had two.** Investigation found the
tool-call catch was only half of it: `/call`'s own catch in `index-http.ts` returned **HTTP 500 for
every throw**, so each denial was logged at error level *twice* and returned to the Cockpit as a
literal 500. Fixing only `server.ts` would have left the customer-visible status code and one of the
two error logs untouched.

| File | Change |
|------|--------|
| `utils/project-access.ts` | `PROJECT_ACCESS_DENIAL_MARKER` + `isProjectAccessDenial()` — the shared predicate |
| `server.ts` | catch branch → `McpError(InvalidRequest, …, {reason})`; `didDeny` routes the finally to `tool.call.denied` instead of `tool.call.failed` |
| `index-http.ts` | `/call` returns **403** + `mcp.call.denied` for a denial; 500 + `mcp.call.error` still for a real fault |

The marker rides in `McpError`'s `data` rather than being matched on the message: the tool layer
converts the error before the HTTP layer sees it, and coupling the transport to the wording of a
deliberately opaque string would make the non-disclosure property fragile.

**Audit closed for free.** `auditFinishMiddleware` already maps `res.statusCode === 403` to outcome
`scope-violation`, so returning the honest status makes the trail record denials as denials with no
new plumbing — the residual left open after Amendment B.

**`tool.call.denied` is deliberately NOT `tool.call.failed`.** The out-of-scope alarm will key on the
failure rate, and refusals working as designed must not desensitise it — that is precisely how this
stayed invisible for two days.

**Verified:** `tsc --noEmit` clean; `auditfences` reports no new `UNFENCED_DECL` and the `043/T023`
fence resolves; mcp-server suite **297 passed / 14 failed**, the 14 being the unchanged pre-existing
baseline (`integration.test.ts` and `server.test.ts` need a live DB — `28P01 password authentication
failed for user "test"`; `project-kit-scope-flow.test.ts` needs fixture files). 5 tests added,
including the dangerous direction: a genuine fault must NOT be reclassified as a denial.

**No client change required for FR-021.** The Cockpit already treats any non-OK response as "no
incoming queue" and renders nothing, so 403 behaves exactly as 500 did for customers — FR-021
reaches them on the next hosted-MCP deploy with no VSIX release.

### FR-022 — stop asking (task T024)

`cockpit_summary` now returns **`canViewIncoming`**, and the Cockpit issues the incoming-queue
request only when it is not `false`. That removes the request entirely for every consumer project
rather than merely making its refusal cheap.

| File | Change |
|------|--------|
| `utils/project-access.ts` | `callerCanViewProject()` — the non-throwing form; `assertCallerCanViewProject` now delegates to it |
| `server.ts` | `cockpit_summary` returns `canViewIncoming`, answered on the caller's own (non-rebound) scope |
| `types.ts` / `cockpitTreeProvider.ts` | optional field; the request is gated on it |

**One decision, not two.** The gate was refactored rather than copied. A capability that drifts from
the enforcement it advertises fails in both directions — saying "yes" where the gate says "no"
produces a request that is refused anyway, and "no" where the gate says "yes" silently hides the
vendor's queue. Four tests pin the two against the same inputs, including the dev-bypass branch.

**The flag grants nothing.** `list_my_feedback` still calls the throwing gate on every `incoming`
request; a client that ignores the flag is refused exactly as before. This is an optimisation of
*asking*, not a relocation of *enforcement*.

**Absent flag means ask anyway** (`!== false`, not `=== true`). Defaulting to "don't ask" would drop
the vendor's queue silently on any response that lost the field, and a silently missing surface is
the failure this whole scope exists to prevent. The fallback costs one refused read that FR-021 has
already made cheap and non-alarming.

**Rollout.** FR-022 needs a VSIX release, so the traffic stops per-customer as they update. FR-021
is what protects the interim, which is why they were sequenced that way and not merged.

**NOT deployed.** Pushing redeploys the hosted MCP; that stays a separate, deliberate decision.

**Not verified end-to-end.** The route has not been exercised against a live server — that needs
either the hosted MCP (i.e. deploy) or a local DB, and no local database is available. The two-layer
contract is pinned by unit tests, not by an observed 403.

---

## Amendment E — attaching a log file to a report (2026-08-12)

### What prompted Amendment E

Feedback `052e76de` (suggestion, low severity), filed from a consumer project through the Cockpit's
Quick mode:

> "It will be nice to add an attachment (a log file for example) to the report"

This is not a gap in the build — it is a **deliberate v1 deferral coming due**. The original Scope
Boundary lists "file/screenshot attachments" under **OUT (future)**, and the spec repeats it. The
submitter has independently arrived at the same place the boundary anticipated, which is the signal
that the deferral has expired rather than that something was missed.

### What the reporter is actually blocked on

Today the only way to get a log into a report is to paste it into the Quick-mode textarea. That
works and is genuinely used — but it forces a choice the submitter should not have to make: paste
the whole file and lose readability, or paste an excerpt and risk cutting out the part that
mattered. The submitter is being asked to triage their own evidence before anyone has looked at it.

### The constraint that shapes the design

`details` is a `jsonb` column with no size discipline, and three consumers read it whole. Attaching
a log naively — dropping the file text under a `details` key — breaks all three:

| Consumer | Code | What breaks |
|----------|------|-------------|
| AI triage | `feedback-triage.ts` — `JSON.stringify(row.details)` into the prompt | Every submission pays for the whole log in prompt tokens; a large one can exceed the context |
| Lifecycle artifact | `feedback-artifact.ts` — renders every `details` entry | A 128 KB log lands inside a project document |
| List responses | `project.list_my_feedback`; `FeedbackTriageService.listFeedback` (`db.select()`) | Both return **full `details` for every row**. The Cockpit polls the first roughly twice a minute (see Amendment D); the SysAdmin queue was measured at 93 rows |

The list case is the sharp one. It is not a slow degradation — it multiplies a per-row payload by
the queue depth on a fixed-interval poll, and it would land on customers who did not attach
anything. **The envelope therefore has to be designed around what does *not* travel**, which is why
FR-025 and FR-026 are requirements and not implementation detail.

Attachments are also a **credential-leak vector**: a log is exactly where a connection string or a
bearer token ends up, and the submitter attaching it is usually not thinking about that. SCOPE-125
is building a redaction module for the conversion families; this scope does not depend on it, but
the risk is the same one and is handled here rather than deferred.

### Requirements

- **FR-023** — The Cockpit MUST let a submitter attach text files to a report, in both Quick and
  Guided modes. Bounded: at most **3 files**, **128 KB per file** and **256 KB total** after
  truncation, extension-allowlisted, and rejected if the decoded bytes contain a NUL (a renamed
  binary). Oversized files are **accepted and tail-truncated**, not refused — a log's failure is at
  its end, and refusing the file sends the submitter back to copy-pasting. Truncation MUST be
  visible in the stored content, not silent. Attaching MUST remain optional and MUST NOT be able to
  block a submission.

- **FR-024** — Attachment content MUST be scanned for credentials and redacted **in the extension
  host, before it leaves the submitter's machine**. The count of redactions MUST be shown to the
  submitter at attach time and MUST be stored alongside the attachment, so a triager knows the text
  they are reading was modified. The file on disk MUST NOT be modified — redaction applies to the
  copy being transmitted only.

- **FR-025** — Attachment **content** MUST NOT ride any list response. `project.list_my_feedback`
  and `GET /api/sysadmin/feedback` MUST carry attachment *metadata* (name, size, truncated,
  redaction count) plus a bounded tail excerpt only. Full content is served exclusively by an
  explicit single-item fetch.

- **FR-026** — Attachment content MUST NOT enter the triage LLM prompt or the rendered lifecycle
  artifact in full. Both take a bounded tail excerpt with the metadata; the full text stays in the
  row.

### Scope Boundary change

"file/screenshot attachments" moves from **OUT** to **partially IN**:

- **IN** — text attachments as specified above (`.log`, `.txt`, `.json`, `.md`, `.csv`, `.yml`,
  `.yaml`, `.xml`, `.ini`, `.conf`, `.out`, `.err`), stored inline in the existing `details` jsonb.
- **STILL OUT** — screenshots and any binary attachment. Those need object storage, a retention
  policy, and read-back access control, none of which exist for this channel; they are not a bigger
  version of this change but a different one.

**No schema migration.** Attachments live under a reserved `attachments` key inside the existing
`details` jsonb, so nothing is added to `feedbacksubmissions`. Given SCOPE-117 (schema changes are
applied by hand, no migration ledger), avoiding a DDL step here is a feature, not a shortcut.

### Design decisions

**Tail, not head.** Truncation keeps the **last** 128 KB and marks what was dropped. Logs put the
failure at the end; keeping the head would systematically discard the reason the file was attached.

**The reserved key is enforced, not trusted.** `attachments` is a validated first-class field on
`submit_feedback`, and any client-supplied `details.attachments` is discarded server-side. Without
that, the caps would be bypassable by writing straight into the free-form `details` record.

**The Cockpit never gets the content back.** The submitter's detail view shows metadata and the
excerpt only. They already have the file on their own disk; shipping it back to them would be the
one payload with a guaranteed-zero information gain.

### Amendment E status

Scoped and **implemented 2026-08-12** — FR-023 to FR-026, tasks **T025**–**T030**. **Not committed,
not deployed, and the reporter has not been answered.**

| Task | File | Change |
|------|------|--------|
| T025 | `mcp-server/src/utils/schemas.ts`, `server.ts` | Validated `attachments` field + caps; client-supplied `details.attachments` discarded and replaced by the validated value |
| T026 | `vscode-extension/src/services/attachmentText.ts` (new), `attachments.ts` | Allowlist, NUL/binary reject, tail truncation with marker, credential redaction — split so the risky half carries no `vscode` import and stays testable |
| T027 | `vscode-extension/src/providers/feedbackPanel.ts` | Attach button, chips with size/truncated/redaction count, remove; content held host-side and never entering the webview |
| T028 | `mcp-server/src/utils/feedback-attachments.ts` (new), `feedback-triage.ts`, `feedback-artifact.ts` | Split + bounded excerpts for the prompt and the artifact |
| T029 | `mcp-server/src/server.ts`, `src/shared/feedback-attachments.ts` (new), `src/server/routes/sysadmin.ts` | Content stripped from both list responses; single-item download route |
| T030 | `src/client/pages/SysAdmin/Feedback.tsx`, `vscode-extension/src/providers/feedbackDetailPanel.ts` | Attachment rendering in the triage pane and the submitter's read-only view |

**Two defects were found by the tests, in this scope's own new code, and both were the kind that
passes a glance.**

1. **The generic `key=value` redaction rule ran first and defeated the specific ones.** Against
   `Authorization: Bearer <token>` it matched `Authorization` + `:` and took the word `Bearer` as
   the value, emitting `Authorization: [redacted] <token>` — a line that *looks* scrubbed with the
   token still in it. Worse than no redaction, because it invites trust. Specific patterns now run
   first and the generic rule sweeps up what is left; auth scheme names are excluded from being
   treated as secret values.

2. **`` never matches inside `DB_PASSWORD`.** Underscore is a word character, so the word-boundary
   guard silently skipped `DB_PASSWORD`, `API_KEY`, and `AWS_SECRET_ACCESS_KEY` — which is how a
   credential appears in a log or an env dump nearly every time. Replaced with a negative lookbehind
   that still refuses a mid-word hit like `bypassword`.

Also fixed: a tail slice landing mid-character emitted `U+FFFD` when the tail held no newline to
advance past (minified JSON, single-line dumps). UTF-8 continuation bytes are now dropped before
decoding.

**Verified.** 17 redaction/bounding tests (extension, `tests/attachmentText.test.ts`), 13 splitting
and excerpting tests (MCP, `tests/feedback-attachments.test.ts`), and 9 **route** tests
(`tests/contract/feedback-attachments.test.ts`) that mount the real sysadmin router — covering the
download happy path, a filename crafted to inject a `Content-Disposition` header, a non-numeric and
an out-of-range index, a report with no attachments, and a regression guard proving the new
multi-segment path does not shadow `GET /feedback/:id`. Client and server builds pass.
`auditfences` reports **zero** findings attributable to these files; the 50 in `sysadmin.ts`,
`server.ts`, and `schemas.ts` are pre-existing declarations in the same files.

**Pre-existing failures left untouched:** `mcp-server` shows 14 failing tests in `server.test.ts`,
`integration.test.ts`, and `project-kit-scope-flow.test.ts`. Verified identical on a clean tree
(stash / re-run / restore) — 14 failed, 3 passed, 2 skipped both ways.

**Rollout has two independent halves.** FR-025 and FR-026 are hosted-MCP + app changes and take
effect on deploy. FR-023 and FR-024 are Cockpit changes and reach a customer only when they take a
VSIX update — the same asymmetry as Amendment D. A submitter on an older extension is unaffected:
`attachments` is optional, so an older Cockpit keeps working unchanged.

---

## Amendment F — the channel says who it is for (2026-10-02)

### What prompted Amendment F

Feedback `3e394ca1` (bug, high), from consumer project `68cf2d4b`: *"No logout on tenant/office
surfaces — TenantShell doesn't wire sign-out."* The defect was real, and the diagnosis was correct:
`apps/web/src/components/TenantShell.tsx` in **that project's own application** did not pass
`onAvatar` to its `AppShell`. wxKanban owns none of that code and could not act on it. The report was
declined on 2026-10-02 with the fix pointed back at the project.

It was filed by an agent, not through the Cockpit form — the context carries no `vscodeversion` or
`extensionversion`, which the Cockpit always stamps.

### Why it happened

The header of this scope already says it: **043 is the user → wxperts feedback channel, not
in-project bug-fixing.** Nothing an agent reads says so.

- The `project.submit_feedback` tool description is the only text a free-form agent sees before it
  calls the tool, and it reads *"Submit a bug report or feature suggestion"* with no owner. An agent
  that has just found a bug and has an MCP tool named "submit feedback" in front of it uses it.
- FR-010 routes **every** submission to the central sink regardless of the caller's project. So
  whatever an agent files lands in the vendor's queue, never in the project where the bug lives.
- Commit `ff22775e` (C14) fixed this for one caller — `wxCreateTestPlan`'s **Where findings go**
  table — after findings about customers' own systems reached the vendor queue. It did not reach the
  tool itself, and it missed two of that skill's own reference files, which still instruct filing
  application-under-test findings through `project_submit_feedback`:
  - `_wxAI/skills/wxCreateTestPlan/references/schema-analysis.md` — "each material finding →
    `project_submit_feedback`, one per unenforced FK, orphan table…", and an unenforced FK called "a
    candidate `project_submit_feedback`".
  - `_wxAI/skills/wxCreateTestPlan/references/test-item-schema.md` — an integrity constraint enforced
    only in application code is "filed as a FINDING via `project_submit_feedback`" (twice).

  An agent following the reference rather than the SKILL.md table is following written instructions,
  and the instructions disagree.

### Requirements

- **FR-027** — The `project.submit_feedback` tool description MUST say who the channel is for: defects
  in, and suggestions about, wxKanban itself — the web app, the hosted MCP tools, the kit and its
  commands and skills, and the Dev Cockpit. It MUST say that a submission goes to the wxKanban team,
  not to the caller's project, and that a defect in the caller's **own application** belongs in their
  own project (`project.create_task`).
- **FR-028** — Kit-shipped skill instructions MUST NOT direct an agent to file findings about the
  application under test through `project_submit_feedback`. The `wxCreateTestPlan` references are
  brought in line with SKILL.md's **Where findings go** table: they route such findings to the
  project's own `testplanFindings` document and name `submit_feedback` only for defects in wxKanban,
  the kit or the skill.

### Design decisions

- **The description is the control. No server-side content filter.** A classifier that tried to
  spot app bugs in free text would misfire on legitimate kit reports, which routinely quote a
  consumer's file paths as evidence. The cost of a misrouted report is one decline; the cost of a
  refused real kit defect is the defect going unreported.
- **The Cockpit form is unchanged.** It is used by a human who chose to write to wxperts, and this
  report did not come through it.
- **`test-sweep` is unchanged.** It is wxKanban's internal skill and runs on wxKanban, where the
  project under test *is* the vendor, so its findings belong in this queue.

### Open — flagged, not changed here

`wxCreateTestPlan` SKILL.md still sends **Clarifications Required** (`CLAR-nn`) to
`project_submit_feedback`, and `test-item-schema.md` §*wxKanban insert mapping* step 1 repeats it.
That was left in place by C14, so it may be deliberate, but a clarification about a *customer's* own
spec is the same misroute this amendment closes. It needs an owner decision before anyone changes it.

### Amendment F status

- **Date**: 2026-10-02
- **Tasks**: **T031** (FR-027 — `mcp-server/src/server.ts`), **T032** (FR-028 —
  `_wxAI/skills/wxCreateTestPlan/references/schema-analysis.md`, `test-item-schema.md`)
- **Schema**: none
- **Rollout**: FR-027 is a hosted-MCP change and takes effect on deploy. FR-028 reaches consumers in
  the next kit release, through the `_wxAI/` mirror.
