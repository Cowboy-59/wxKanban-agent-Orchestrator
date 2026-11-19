# Task Breakdown: FAQ System

**Feature**: FAQ System
**Spec**: 066
**Date Generated**: 2026-06-21
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | Band | Priority | Status |
|---|------|------|----------|--------|
| 1 | T001 Add `'faq'` to category enum (server zod in `marketingAdmin.ts` + client `CATEGORIES`) | SysAdmin | high | done |
| 2 | T002 Admin FAQ endpoints — reuse `/assets` CRUD with `category=faq`; add unanswered-queue read + `POST /assets/faq/generate` + DELETE `/assets/:id` | SysAdmin | high | done |
| 3 | T003 `MarketingAIService.generateFaqDefaults()` — fail-open strict-JSON, Claude override, throttled; inserts `draft` rows | SysAdmin | high | done |
| 4 | T004 SysAdmin FAQ tab — `Faq.tsx` + `MarketingTabs` entry: Published/Draft list + Unanswered queue + editor + Generate-defaults | SysAdmin | high | done |
| 5 | T005 User router `routes/faq.ts` — `GET /api/faq` (published global) + `POST /api/faq/questions`; visibility gate; mount in `app.ts` | Web | high | done |
| 6 | T006 `FaqPanel` read component + Ask-a-question form — wired into Admin + Team Dashboard and Project Detail | Web | high | done |
| 7 | T007 **[GATED — not built]** Cockpit data path — `faq.list` (+ categorized-videos) MCP tool, `PERMISSION_MATRIX` entry, hosted redeploy | Cockpit | medium | blocked |
| 8 | T008 **[GATED — not built]** Cockpit tree — FAQ section (read-only) + Videos Open/Training subtrees from `marketingassets` (keep docs videos) | Cockpit | medium | blocked |
| 9 | T009 Docs — note FAQ seed reuses SCOPE-065 env in `.env.example` | — | low | done |

> **Status 2026-06-21:** T001–T006 + T009 implemented in-conversation; client + server builds pass clean. NOT committed/pushed; DB `projecttasks` rows still `open` (no test gate yet). T007/T008 deferred — need the data-path decision + a hosted-MCP redeploy that can't be done/tested from the dev box.

> **Build order:** T001–T004 (SysAdmin) first, then T005–T006 (web read/ask), then T007–T008 (Cockpit). T007/T008 are **blocked** until the data-path decision in the spec's *Open Dependency* is made.

---

## Task Details

### T001 — `faq` category enum
Add `'faq'` to the `category` zod enum in `src/server/routes/marketingAdmin.ts` (`assetSchema`) and to the client `CATEGORIES` constant in `src/client/pages/SysAdmin/marketing/Assets.tsx` (and anywhere else the constant is shared). No migration — column is already `varchar(50)` with `idx_marketingassets_category`. *(FR-001)*

### T002 — Admin FAQ endpoints
FAQ CRUD reuses the existing SYSADMIN-gated `/assets` endpoints with `category=faq`. Add: (a) an unanswered-queue read — list `category='faq' AND (content IS NULL OR content='')` (a query param on `GET /assets` or a dedicated `GET /assets/faq/unanswered`); (b) `POST /assets/faq/generate` calling `generateFaqDefaults()` (T003) and inserting the results as `status='draft'`, `companyid=NULL` rows. Both require `authenticateToken` + `requireSysAdmin`; non-sysadmin → 403. *(FR-002, FR-003, FR-004)*

### T003 — generateFaqDefaults()
Add to `src/server/services/MarketingAIService.ts`, mirroring the existing action shape: a focused system prompt grounded in wxKanban product/methodology knowledge (6-phase lifecycle, scope-first, the kit/Cockpit, billing/consulting), strict expected output `[{question, answer}]`, fence-stripped `JSON.parse`, fail-open to a handled error (no partial rows saved), Pino-logged, never throws. Calls `generateOnce(..., { provider, model })` with the marketing override (`MARKETING_LLM_PROVIDER`/`MARKETING_LLM_MODEL`). Apply the existing soft-throttle helper. *(FR-004)*

### T004 — SysAdmin FAQ tab
New `src/client/pages/SysAdmin/marketing/Faq.tsx` + a `FAQ` entry in `MarketingTabs.tsx` (`/sysadmin/marketing/faq`). Two sections: **Published/Draft FAQs** (list + create/edit/delete, status toggle) and **Unanswered questions** (the empty-content rows, each with an "Answer" action that opens the editor). Editor fields: question (title), answer (textarea), optional video URL (`fileurl`), locale, status. A **"Generate default FAQs"** button calls `POST /assets/faq/generate` and refreshes the draft list. Reuses the `fetch(credentials:'include')` + `useState` pattern from `Assets.tsx`. *(FR-002, FR-003, FR-004, FR-010)*

### T005 — User router (`routes/faq.ts`)
New `src/server/routes/faq.ts`, mounted via `src/server/index.ts → app.ts`, `authenticateToken` only (any logged-in user). `GET /api/faq` returns published global FAQs — the single visibility rule `category='faq' AND status='published' AND content <> ''`, `companyid IS NULL`, locale-aware. `POST /api/faq/questions` creates one faq row (`title`=question, empty `content`, unanswered) and returns an acknowledgement; enforce length limits + a soft throttle (abuse guard). DB via `src/db/client.ts`. *(FR-005, FR-006, FR-007, FR-008)*

### T006 — FaqPanel + Ask form
Reusable `FaqPanel` component (read-only Q/A list, renders `fileurl` video when present, omits cleanly when absent) + a small "Ask a question" form posting to `POST /api/faq/questions`. Wire both into the User Dashboard and the Project Detail page. No draft/unanswered content is ever requested or shown. *(FR-006, FR-007, FR-008, FR-010)*

### T007 — Cockpit data path **[GATED]**
**Resolve the Open Dependency first** (MCP reads app DB vs. proxies `GET /api/faq`). Then add a read-only MCP tool serving published FAQs (`faq.list`) and the categorized `marketingassets` videos, **registered in `PERMISSION_MATRIX`** (unregistered tools are rejected pre-dispatch — see `reference_mcp_stale_build`). Requires a hosted MCP redeploy. *(FR-009, FR-011)*

### T008 — Cockpit tree
In the VS Code extension `CockpitTreeProvider`: add a **FAQ** section (read-only, mirroring Help/Videos) fed by `faq.list`; and extend the **Videos** section with **Open** and **Training** subtrees sourced from `marketingassets` videos (`type='video'`, grouped by `category`, `faq` excluded) while keeping the existing docs how-to videos. *(FR-009, FR-011)*

### T009 — Docs
Note that the FAQ AI seed reuses SCOPE-065's env (`MARKETING_LLM_PROVIDER`/`MARKETING_LLM_MODEL`/`ANTHROPIC_API_KEY`) — no new vars. Brief quickstart for curating FAQs + working the unanswered queue. *(Technical Sections)*

---

## Notes

- **Process:** authored in-conversation (orchestrator `createSpecs` CLI broken); implementation routes through `implement` per orchestrator-first; fences written at implement time.
- **DB-only category already applied:** the `open|training` category column is in the app DB but **uncommitted** in git; T001 adds `'faq'` to that same enum.
- **Nothing pushed until the user says push.**
