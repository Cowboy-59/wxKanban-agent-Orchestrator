# Implementation Plan: FAQ System

**Spec**: 066 — [spec.md](spec.md) | **Tasks**: [tasks.md](tasks.md)
**Scope**: [`specs/Project-Scope/066-faq.md`](../Project-Scope/066-faq.md)
**Stack**: Express + React/Vite + PostgreSQL + Tailwind/shadcn (per `stack.md`); hosted MCP for the Cockpit.

---

## Approach

Reuse, don't reinvent. FAQs ride the existing `marketingassets` table and the SCOPE-065 AI plumbing; the only genuinely new pieces are a second (user-trust-level) router, a SysAdmin FAQ page, a reusable read panel, and the Cockpit MCP read tool. Build in three bands in order — **SysAdmin (T001–T004) → web read/ask (T005–T006) → Cockpit (T007–T008)** — so shippable work lands while the Cockpit data-path decision is resolved.

## Data model — no migration

FAQs are `marketingassets` rows: `category='faq'`, `companyid=NULL`, `title`=question, `content`=answer, `fileurl`=optional video, `locale`, `status` (`draft`→`published`). Unanswered = `content IS NULL OR content=''`. The `category` column + `idx_marketingassets_category` index already exist (shipped with `open|training`). No schema change beyond widening the zod/TS enum to include `'faq'`.

## Trust model — two routers

- **Admin** (`src/server/routes/marketingAdmin.ts`, `authenticateToken` + `requireSysAdmin`): FAQ CRUD reuses the existing `/assets` endpoints with `category=faq`. Add (a) an unanswered-queue read and (b) a `POST /assets/faq/generate` AI-seed endpoint.
- **User** (`src/server/routes/faq.ts`, NEW, `authenticateToken` only): `GET /api/faq` (published global FAQs) and `POST /api/faq/questions` (submit → empty-content row). Mounted via `src/server/index.ts → app.ts`. The single visibility rule (`status='published' AND content <> ''`) lives here so no read surface re-implements it.

## AI seed

Extend `src/server/services/MarketingAIService.ts` with `generateFaqDefaults()`: a product/methodology-grounded system prompt, strict JSON `[{question, answer}]`, fence-stripped parse, fail-open to handled error, Pino-logged, `generateOnce` with the marketing Claude override (`MARKETING_LLM_PROVIDER`), soft-throttled via the existing helper. Inserts results as `status='draft'` faq rows. No new env (reuses SCOPE-065).

## Client

- **SysAdmin:** `src/client/pages/SysAdmin/marketing/Faq.tsx` (new) + a `FAQ` entry in `MarketingTabs.tsx`. Sections: Published/Draft FAQs, Unanswered queue, an editor (title + answer textarea + optional video URL + status), and a "Generate default FAQs" button. Reuses the `fetch(credentials:'include')` + `useState` pattern (no TanStack Query in these pages), mirroring `Assets.tsx`.
- **User read:** a reusable `FaqPanel` component (read-only list + optional video render) used on the User Dashboard and Project Detail, plus a small "Ask a question" form posting to `POST /api/faq/questions`.

## Cockpit (gated)

A read-only MCP tool serving published FAQs (`faq.list`) and the categorized `marketingassets` videos, registered in the MCP `PERMISSION_MATRIX` (or it's rejected pre-dispatch — see the `reference_mcp_stale_build` lesson), plus a hosted MCP redeploy. `CockpitTreeProvider` gains a FAQ section (read-only, like Help/Videos) and the Videos section gains Open/Training subtrees from `marketingassets` while keeping the existing docs how-to videos.

**Decide before T007:** MCP reads the app DB directly, or proxies `GET /api/faq` + a categorized-videos app endpoint. One decision covers both FAQs and videos.

## Conventions

Routes via `index.ts → app.ts`; DB via `src/db/client.ts`; 100% TypeScript (no `any`/`@ts-ignore`); Pino-only; fences written by the orchestrator at `implement`; nothing pushed until the user says push.

## Risks

- **Visibility leak** — mitigated by single-sourcing the read rule in `routes/faq.ts` and the `faq.list` tool; both filter on `status='published' AND content <> ''`.
- **Cockpit DB-reachability** — the one open dependency; isolated to T007/T008 so it can't stall T001–T006.
- **AI cost/abuse** — SYSADMIN-gating + soft-throttle on the seed (FR-004); length limits + throttle on the public-authenticated submit (FR-008).
