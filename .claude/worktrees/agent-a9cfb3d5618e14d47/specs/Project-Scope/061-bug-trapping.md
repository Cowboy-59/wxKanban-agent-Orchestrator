# SCOPE-061: Automatic Bug-Trapping & Reporting (wxKanban self-monitoring)

**Scope Number**: SCOPE-061
**Status**: `draft`
**Created**: 2026-06-19
**Last Reviewed**: 2026-06-19 (interactive buildscope — section-by-section, approved through all 8 sections; Technical Sections revised per `/analyzescope 061` self-audit)
**Depends On**: SCOPE-043 (user-feedback pipeline — reuses its `feedbacksubmissions` table, the sink project, and the app-side triage console + accept-to-scope); SCOPE-042 (Dev Cockpit — the triage surface); the app error-handling layer (`errorHandler`, `ErrorBoundary`, `apiFetch`); `APP_VERSION`.
**Related Scopes**: SCOPE-043 is the **manual-submission** counterpart — same back-half pipeline, different (user-driven) intake; this scope adds the **automatic** runtime-capture front end.
**Source**: `specs/Project-Scope/061-bug-trapping.md`

---

## Overview

wxKanban has no automatic error capture today. Server failures reach only Pino stdout logs; browser failures reach only `console.error`; nothing routes either to a place a human will see and triage. Bugs surface by luck — the way the duplicate scope-058 rows and the missing `createSpecs` uniqueness guard were both found by hand.

This scope adds an always-on, **fail-open** capture layer across the wxKanban app — client and server — that traps any runtime issue (React render crashes, unhandled promise rejections, global JS errors, failed API calls, server 5xx responses, and process-level uncaught exceptions/rejections), **fingerprints** it for grouping, and routes it into the existing SCOPE-043 bug pipeline (the wxKanban Development sink, `ba924193`) where it is triaged and can be promoted to a scope. Capture is automatic and **deduped + rate-limited** so recurring errors never flood, **opt-out** via config, and never breaks the app — a failure inside the capture path is swallowed. v1 monitors wxKanban's own app; shipping the same capability to kit-built consumer apps is a deferred later phase.

## Business Problem

When something breaks in wxKanban, the failure is effectively invisible to the people who can fix it. On the server, an exception becomes one line in a Pino stdout stream that no one is watching unless they happen to be tailing logs during the failure; once App Runner rotates or the request passes, it's gone. In the browser, a render crash trips the `ErrorBoundary` (which only `console.error`s) or a rejected promise vanishes entirely — there is no `window.onerror`/`unhandledrejection` handler at all. There is no `/api/errors` endpoint, no telemetry, no aggregation. So defects are discovered manually, late, and inconsistently.

Meanwhile wxKanban already has the **back half** of a bug system — SCOPE-043's intake table, the central sink, dedup, the sysadmin triage console, and accept-to-scope — but it is fed only by **manual** user submissions through the Cockpit. Automatic runtime failures never enter it. The gap is purely the **capture and routing** front end: catch the error where it happens, attach enough context to act on it (version, environment, route, stack), group repeats so volume stays sane, and drop it into the pipeline that already knows how to triage and turn a recurring bug into a scope. Closing this gap turns silent, luck-dependent discovery into an automatic, deduped feed — without harming the running app, because the capture layer fails open. It also dogfoods the methodology the kit teaches: issues become tracked, triaged work items, not lore.

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actor** | The wxKanban **application runtime** (client + server) acting as the error capturer; downstream, the ADMIN/triager who dispositions what's captured. |
| **Secondary Actors** | The `/api/errors` intake endpoint; the reused SCOPE-043 sink + app-side triage console; the developer who fixes the bug or accepts it to a scope. |
| **Key Value** | Silent runtime failures become an automatic, deduped, context-rich feed into a triage→scope pipeline that already exists, with zero risk to the running app (capture fails open). |
| **Capture mechanism** | Always-on, fail-open hooks. Client: `ErrorBoundary`, global `error` + `unhandledrejection` listeners, failed `apiFetch`, optional TanStack `onError`. Server: central `errorHandler` (5xx only) + process-level `uncaughtException`/`unhandledRejection`. All funnel to `POST /api/errors`. |
| **What's captured** | Error class + message + normalized stack; a deterministic **fingerprint**; context = `APP_VERSION`, environment, route/URL, component stack, `userId` when available, `source` (client\|server). No additional PII. |
| **Dedup / grouping** | Fingerprint keys grouping: a matching open report increments `occurrencecount` + `lastoccurredat` instead of inserting; per-fingerprint rate-limit bounds writes. |
| **Storage** | Write `feedbacksubmissions` in the sink project **app-side** (mirroring `resolveSinkScope`'s resolve-sink + insert logic — the app server can't import the mcp-server util), `source='auto'`, `type='error'`, plus new columns (`source`, `errorfingerprint`, `occurrencecount`, `firstoccurredat`/`lastoccurredat`). |
| **Resolution / routing** | capture → `/api/errors` → fingerprint + **deterministic** severity → dedup-or-insert into the sink (app-side) → existing sysadmin triage console → disposition (out-of-band fix / accept-to-scope / duplicate / decline). AI classification of auto-errors is deferred. |
| **Scope Boundary** | **IN**: wxKanban-own client + server capture, the intake endpoint with channel-level abuse controls, fingerprint/dedup/rate-limit, context enrichment, opt-out, fail-open, surfacing in the existing app-side triage console. **OUT**: kit-distributed consumer-app capture (later), AI auto-triage of auto-errors, the rich mcp-server artifact, external telemetry, source-map symbolication, auto-fix/auto-deploy. |

---

## User Scenarios

### US1 — Server exception is captured without changing the response

A route handler throws. The central `errorHandler` returns the usual 500 to the caller *and*, as a side effect, posts the error to `/api/errors`. A `feedbacksubmissions` row appears in the sink with `source='auto'`, `type='error'`, the fingerprint, and context. The request behaves exactly as before; the developer now has a triable record.

**Expected:** response/latency unchanged; exactly one report written; a capture failure would not have affected the response.

### US2 — A recurring crash is grouped, not flooded

A React component starts crashing for many users after a deploy. Each crash trips the `ErrorBoundary` and captures, but all share one fingerprint, so the sink shows a **single** grouped report whose `occurrencecount`/`lastoccurredat` climb — not hundreds of rows. A per-fingerprint rate-limit caps write frequency.

**Expected:** one row per distinct fingerprint; occurrence count increments; volume stays bounded under a storm.

### US3 — A triager promotes a real bug to a scope

An ADMIN opens the existing sysadmin triage console, filters to `source='auto'`, and sees a high-occurrence error. They disposition it — out-of-band fix for a quick one, or **accept-to-scope** (the reused SCOPE-043 flow) to generate a spec seed for a feature-sized fix.

**Expected:** auto-errors appear alongside manual feedback, filterable; accept-to-scope produces a scope seed exactly as manual items do.

### US4 — Capture never harms the app, and can be turned off

The intake endpoint is unreachable (or the failure is *inside* the capture path itself). The app, the failing route, and the process all continue exactly as without capture — the error in capture is swallowed and does not re-trigger capture. A project that sets the opt-out flag captures nothing.

**Expected:** zero capture-induced failures or loops; opt-out fully disables capture.

---

## Functional Requirements

### FR-001 — Client-side capture

The client MUST capture runtime errors from four sources via a single capture module: the React `ErrorBoundary` (`componentDidCatch`), a global `window` `error` listener, a global `unhandledrejection` listener (both registered in `main.tsx`), and failed `apiFetch` calls. Capture MUST NOT throw into application code.

**Acceptance Criteria**:

- [ ] A render crash, an unhandled rejection, a raw `window` error, and a failed API call each produce one captured report
- [ ] A throw inside the capture module never propagates to the app (the original error still surfaces normally)
- [ ] Capture attaches the component stack (for `ErrorBoundary`) and the request URL/status (for API failures)

### FR-002 — Server-side capture

The server MUST capture from the central `errorHandler` (5xx responses only — not expected 4xx) and from process-level `uncaughtException` / `unhandledRejection` handlers, forwarding to the same intake. Capture MUST be best-effort and MUST NOT change the existing response or process behavior.

**Acceptance Criteria**:

- [ ] A handler that throws → existing 500 response unchanged + one captured report
- [ ] A 4xx (validation/auth) does NOT produce a report
- [ ] `uncaughtException` / `unhandledRejection` are captured; existing crash/shutdown behavior is otherwise unchanged

### FR-003 — Intake endpoint (abuse-bounded, app-side)

`POST /api/errors` MUST accept a captured-error payload and write it **app-side** to `feedbacksubmissions` in the sink project (see Technical / Intake) with `source='auto'`, `type='error'`, a **deterministic** `severity` (Technical / Intake), the `context` jsonb, and the fingerprint. The endpoint is **unauthenticated** (client capture may fire pre-auth), so it MUST be bounded against abuse **at the channel, independently of the fingerprint**: a per-IP rate-limit, a strict payload **size cap**, and a same-site/`Origin` check. Over-limit, malformed, or oversized requests MUST be dropped (2xx/4xx, **never 5xx**) and MUST never harm the caller.

**Acceptance Criteria**:

- [ ] A valid payload yields one sink row with the documented fields
- [ ] A malformed / partial / oversized payload is rejected or truncated best-effort and never returns 5xx
- [ ] A varied-fingerprint flood is still throttled by the per-IP rate-limit + size cap (channel-bounded, not just signature-bounded)
- [ ] The endpoint requires no authenticated app session (works pre-auth), yet rejects cross-origin and oversized writes
- [ ] `severity` is assigned deterministically by source/kind (no AI dependency)

### FR-004 — Fingerprint, dedup & grouping

The system MUST compute a deterministic fingerprint from (error class + normalized stack + route/component). A matching **open** report MUST increment `occurrencecount` and update `lastoccurredat` instead of inserting a new row; a per-fingerprint rate-limit MUST bound write frequency under a storm.

**Acceptance Criteria**:

- [ ] Two occurrences of the same error produce one row with `occurrencecount = 2`
- [ ] Distinct errors produce distinct rows
- [ ] Fingerprint is stable across occurrences (same input → same hash) and ignores volatile bits (timestamps, ids, line-noise)
- [ ] A burst of the same fingerprint is rate-limited (bounded writes)

### FR-005 — Context enrichment

Each report MUST carry `APP_VERSION`, environment (dev/staging/prod), route/URL, `source` (client|server), the component/stack trace, and `userId` when available — and MUST NOT collect additional PII beyond what the error itself contains.

**Acceptance Criteria**:

- [ ] Captured reports include version, environment, route, and source
- [ ] `userId` is included when an authenticated session exists, omitted otherwise (no failure when absent)
- [ ] No fields beyond the documented set are collected

### FR-006 — Opt-out, fail-open & non-recursion

Capture MUST be disableable via a config flag (per-project/env), MUST fail open (any error in the capture path is swallowed — the app, route, and process are never harmed), and MUST NOT recurse (an error raised while capturing must not trigger another capture).

**Acceptance Criteria**:

- [ ] With the flag off, no capture occurs anywhere (client + server)
- [ ] Intake unreachable / capture throws → application behavior is identical to capture being absent
- [ ] An error inside the capture path does not enqueue another capture (no loop)

### FR-007 — Triage surface (reused)

Auto-captured errors MUST appear in the existing SCOPE-043 triage surfaces (the sysadmin feedback console and the Cockpit feedback view), distinguishable/filterable by `source='auto'` / `type='error'`, and MUST be promotable via the existing **accept-to-scope** flow.

**Acceptance Criteria**:

- [ ] Auto-errors list alongside manual feedback, filterable by source/type
- [ ] An auto-error can be dispositioned (out-of-band fix / duplicate / decline) and **accepted to scope** to produce a spec seed
- [ ] Occurrence count + first/last-seen are visible to the triager

---

## Technical Sections

### Data / Schema

Extend `feedbacksubmissions` (and the MCP mirror `mcp-server/src/db/schema.ts`) with: `source` (`'manual'`|`'auto'`, default `'manual'`), `errorfingerprint` (nullable), `occurrencecount` (default 1), `firstoccurredat`/`lastoccurredat` (nullable). One generated migration applied via the established `pg.Client` + transaction pattern. `type` reuses the existing column with a new `'error'` value; `severity`/`classification`/`context`/`duplicateofid` reused as-is. Partial index on `(errorfingerprint)` where `source='auto'` for fast dedup.

### Intake (`src/server/routes`)

New `POST /api/errors` (mounted in `app.ts`) backed by an `ErrorCaptureService` that runs **entirely app-side** — the route lives in `src/server`, which cannot import `mcp-server` utilities. Flow: loosely validate + size-cap → enforce per-IP rate-limit + same-site/`Origin` check → compute/accept the fingerprint → resolve the sink project id (`FEEDBACK_SINK_PROJECT_ID`, a UUID env var, default `ba924193`) → look up an **open** `auto` row with that fingerprint in the sink → increment (`occurrencecount`, `lastoccurredat`) or insert a `feedbacksubmissions` row via `src/db/client.ts`. This **mirrors** `resolveSinkScope`'s resolve-sink + insert logic rather than importing it. Per-fingerprint write limit + per-IP channel limit are in-memory token buckets (single-instance; multi-instance coordination is a follow-up).

**Severity (deterministic, no AI in v1):** assigned at intake from `source` + kind — process-level `uncaughtException`/`unhandledRejection` → `critical`; server 5xx and client `ErrorBoundary` crashes → `high`; other client errors (`window` error, `unhandledrejection`, failed `apiFetch`) → `medium`. AI re-classification of auto-errors is deferred (see Out of Scope).

**Artifact:** the rich markdown artifact renderer (`feedback-artifact.ts`) lives in `mcp-server` and is **not reachable from the app server**; v1 either renders a minimal report app-side or **defers** the artifact entirely. The triage console reads the `feedbacksubmissions` row directly, so the artifact is not required to triage.

### Server hooks

- `src/server/middleware/errorHandler.ts` — after the existing `logger.error()` for 5xx, fire a best-effort capture (never awaited into the response path).
- `src/server/index.ts` — add `process.on('uncaughtException')` / `process.on('unhandledRejection')` that capture then defer to existing behavior.
- Reuse `src/server/lib/logger.ts` and `AppError` classes (`src/server/lib/errors.ts`) to classify 5xx vs 4xx.

### Client hooks

- New `src/client/lib/errorCapture.ts` — the single capture module (fingerprint hint, fail-open `fetch` to `/api/errors`, in-memory de-dupe/rate-limit, recursion guard).
- `src/client/main.tsx` — register `window` `error` + `unhandledrejection` listeners.
- `src/client/components/ErrorBoundary.tsx` — call capture in `componentDidCatch` (keep the existing console log + fallback UI).
- `src/client/lib/apiFetch.ts` — capture before the thrown error on non-OK responses.
- `src/client/App.tsx` — optionally wire `QueryClient` `defaultOptions.{queries,mutations}.onError`.

### Shared types

New `src/shared/types/errors.ts` — the `CapturedError` / error-report DTO (the `/api/errors` payload), exported from `src/shared/types/index.ts`, alongside `ErrorResponse` in `api.ts`.

### Triage surface (reuse, app-side — no MCP call)

The sysadmin `/feedback*` routes (`src/server/routes/sysadmin.ts`) + `FeedbackTriageService` read/triage/accept-to-scope **directly against `feedbacksubmissions`** (app server, `src/db`), so auto-errors written app-side appear there with **no cross-package call**. Add `source`/`type='error'` as a filter and surface `occurrencecount` + first/last-seen in the existing list/detail. The Cockpit feedback view reuses its current rendering. AI auto-triage is **not** wired in v1 (it lives in `mcp-server`).

### Fingerprint

Deterministic hash (e.g. SHA-256, truncated) over: error class name + a **normalized** stack (strip absolute paths, line/column numbers, hex addresses, UUIDs, query strings) + the logical route/component. Same logical error → same hash regardless of occurrence noise.

### Config

Opt-out flag (env, e.g. `ERROR_CAPTURE_ENABLED`, default on for wxKanban; the per-project form lands with the consumer phase) read at startup (server) and exposed to the client via the existing config bootstrap.

---

## Success Criteria

1. **Silent failures become visible.** A thrown server handler and a client render crash each land as a triable sink row with `source='auto'`, `type='error'`, fingerprint, and context — no manual action. *(FR-001/002/003)*
2. **Comprehensive capture.** All six sources are captured: `ErrorBoundary`, `window` error, `unhandledrejection`, failed `apiFetch`, server 5xx, process-level uncaught/rejection. *(FR-001/002)*
3. **Volume stays sane.** Repeats produce a single grouped row whose count/last-seen climb; a storm is rate-limited. *(FR-004)*
4. **The app is never harmed.** With capture failing/throwing internally, response behavior, latency, and process lifecycle are unchanged; no loop. *(FR-006)*
5. **Off means off.** With opt-out disabled, zero capture occurs anywhere. *(FR-006)*
6. **Actionable context.** Every report carries version/env/route/source/stack; `userId` when present; nothing beyond the documented set. *(FR-005)*
7. **It feeds the existing pipeline.** Auto-errors appear in the triage console + Cockpit filtered by source/type, and a recurring one can be **accepted to scope**. *(FR-007)*

---

## Constraints & Notes

### Constraints

- **Fail-open, always.** Capture is a side effect that may never affect the app, a request, or the process; any error in capture is swallowed; capture is non-recursive.
- **Reuse, don't reinvent — accurately.** Intake rides SCOPE-043's `feedbacksubmissions` table + the **app-side** triage console + accept-to-scope. The app-side intake **mirrors** `resolveSinkScope`'s sink resolution (it can't import the mcp-server util). AI auto-triage and the mcp-server artifact renderer are **not** reused in v1 (deferred). Net-new = the capture layer + `/api/errors` intake + the schema delta.
- **Deduped + bounded.** Fingerprint-grouped with a per-fingerprint rate-limit, plus a per-IP channel limit on the unauthenticated endpoint; the sink must not be floodable.
- **Minimal data.** Error context only (version/env/route/source/stack/userId-if-present); no new PII.
- **Two schema mirrors, one table.** App + MCP schema must agree; single migration to the shared Postgres.
- **Orchestrator-first.** Implement via `createSpecs` → `implement`; fences written by the orchestrator only.

### Out of Scope (v1 / later)

- **Kit-distributed consumer-app capture** — v1 is wxKanban-self only; capture inside consumer apps (with per-project opt-in + privacy controls) is a later phase.
- **AI auto-triage / classification of auto-errors** — the `feedback-triage.ts` LLM pass lives in `mcp-server`; v1 uses deterministic severity only. A later async/MCP pass can enrich auto rows.
- **Rich markdown artifact for auto-errors** — deferred; the triage console reads the row directly.
- **External telemetry** (Sentry/Datadog), **source-map symbolication** of minified client stacks, and **multi-instance** rate-limit coordination (single-instance token buckets in v1).
- **Auto-fix / auto-deploy** off a captured error.

### Dependencies

- SCOPE-043 (feedback pipeline + sink + app-side triage + accept-to-scope); SCOPE-042 (Cockpit surface); the app error-handling layer (`errorHandler`, `ErrorBoundary`, `apiFetch`); `APP_VERSION`.

### Notes

- **Dogfood-ready:** the sink is `ba924193` and a working MCP token exists, so a real captured error can be verified end-to-end on prod via `project.list_my_feedback` / the triage console.
- **Motivating defects:** the scope-058 duplicate and the missing `createSpecs` uniqueness guard are tracked as separate immediate fixes — and are exactly the class of issue this system is meant to surface automatically going forward.
- **Process note:** authored in-conversation via interactive buildscope (section-by-section, the standing workaround while the orchestrator `buildscope` CLI is broken); implementation routes through `createSpecs` → `implement` per orchestrator-first.
