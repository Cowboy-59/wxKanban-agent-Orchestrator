# SCOPE-100: Founder Bio Page

**Scope Number**: SCOPE-100
**Status**: `draft`
**Created**: 2026-07-16
**Last Reviewed**: 2026-07-16 (codebase mapped; storage, upload, translation and locale-scoping paths verified by direct read)
**Depends On**: SCOPE-048 (`marketingassets` table — the storage substrate and its `(assetkey, locale)` uniqueness), SCOPE-065 (marketing AI route/service/provider stack and the per-call provider override). Conventions authority: `CLAUDE.md`.
**Related Scopes**: SCOPE-092 (multi-language help content) solves the same translate-and-serve problem for `wxkanbanhelp` and remains unimplemented; this scope deliberately does not wait for it or extend it. SCOPE-096 (feature snippets) owns the locale-strip editing idiom reused here.
**Source**: `specs/Project-Scope/100-founder-bio-page.md`

---

## Overview

wxKanban asks career-changers to trust a methodology and buy a subscription, but the product's public surfaces never say who is behind it. The React landing page has no founder content at all. The static launch site has a founder letter, but it is hand-written HTML that only a developer with S3 deploy access can change.

This scope adds a public `/bio` page telling the founder's story in all six supported languages, and a SysAdmin editor that makes it editable without a developer or a deploy. Content is markdown with an uploaded portrait, authored in English, translated on demand into the five other locales by an explicit action, and served with per-locale fallback to English.

It introduces no new table and no migration. The bio is six rows in `marketingassets` sharing `assetkey = 'founder-bio'` and differing by `locale` — the exact shape the six-language feature snippets already use.

## Business Problem

The product's positioning depends on a personal story that the product cannot tell.

The target customer is a career-changer roughly a year into development work, being asked to adopt an unfamiliar lifecycle methodology. The founder's mainframe-to-cloud path is the credibility argument for exactly that audience — someone who made the transition the customer is being asked to make. That argument is currently absent from the React landing page, and on the static site it is frozen in `marketing/site/index.html` at line 362, reachable only through an S3 redeploy.

The freeze is the real problem. Marketing copy that requires a developer to change does not get changed; it goes stale and stays stale. Every other marketing surface in the product — assets, FAQs, feature snippets, training sessions — is already editable by a SysAdmin through the marketing dashboard and translated into six languages. The founder's story is the one piece of customer-facing narrative with no editor and no translations, which is backwards: it is the piece most likely to need revision as positioning evolves.

The multi-language gap compounds it. The six locales exist precisely because the beachhead is the WinDev community, which is substantially French-speaking. An English-only founder story addresses that audience in the wrong language at the moment it is trying to establish trust.

The desired outcome: the founder's story is public, is available in every language the product speaks, and can be rewritten by its author in minutes without a deploy.

## Actors

Primary: A SysAdmin (in practice, the founder) authoring and revising the bio in the marketing dashboard.
Secondary: A prospective customer reading the bio from either landing page in any of the six supported locales; a visitor arriving from the static launch site at windev.wxperts.com.

Key value: the founder's story becomes editable content rather than deployed code, and reaches non-English prospects in their own language.

## Scope Boundary

1. **Public `/bio` page.** A new unauthenticated React route rendering the bio markdown with the portrait positioned in the page corner, responsive to a stacked layout on mobile.
2. **Public `GET /api/bio` endpoint.** Unauthenticated, locale-scoped, returning exactly one resolved row.
3. **Storage in `marketingassets`.** Six rows, `assetkey = 'founder-bio'`, `type = 'page'`, `category = 'bio'`, `companyid = NULL`. No new table, no migration.
4. **Widen the admin category enum.** `category` gains `'bio'` in the zod enum at `src/server/routes/marketingAdmin.ts:291`. Without this the row inserts but every admin PATCH 400s.
5. **SysAdmin editor tab** at `/sysadmin/marketing/bio`, registered via the one-line `TABS` registry in `MarketingTabs.tsx`.
6. **Markdown editor** using `@uiw/react-md-editor` (a new frontend dependency), wired to the app's existing theme toggle.
7. **AI assistant chat** beside the editor, proposing full revised drafts the author accepts or discards.
8. **Portrait upload** through the existing presign → PUT → PATCH flow, via a new `presignBioPhotoUpload` mirroring `presignBannerBackgroundUpload`.
9. **Explicit Translate action** fanning out to the five non-English locales, with paragraph-level chunking for content exceeding the model's output budget.
10. **Staleness surfacing** derived from existing `updatedat` timestamps — no flag column.
11. **Bio links below Contact on both landing pages.** React footer gets a localized link; `marketing/site/index.html` gets a cross-domain absolute link to the app's `/bio`.

## Out of Scope

- **A static `marketing/site/bio.html`.** The static site cannot read the database, so a local copy would silently ignore every SysAdmin edit. It cross-links to the app instead. This is the deliberate trade that keeps one source of truth.
- **Localizing the static marketing site.** `marketing/site/index.html` is hard-coded `lang="en"` with no i18n mechanism. Giving it one is its own scope; the Bio link there is English chrome pointing at a page that localizes itself.
- **Extending or replacing `/about`.** The existing About page keeps the company contact block, postal address, and phone. The bio is a separate page and a separate footer link.
- **Implementing SCOPE-092.** `helptranslations` is specced but exists in no code or migration. This scope does not build it, block on it, or borrow from it.
- **A general-purpose page CMS.** This edits one document. Multiple bios, team rosters, or arbitrary marketing pages are not in scope.
- **Per-locale hand-editing of translations.** Translations are generated, not hand-tuned; re-translating overwrites a locale. Hand-edit preservation would require a stale/edited flag and was explicitly declined.
- **Retiring the static site's existing founder letter** at `index.html:362`. It stays as-is; this scope adds a link, not a rewrite of that section.
- **Removing the vestigial `companyid` column** from `marketingassets`, despite this scope confirming nothing ever writes it.

## User Scenarios

### US1 — Founder writes and publishes the bio (happy path)
A SysAdmin opens `/sysadmin/marketing/bio`, writes markdown, uploads a portrait, saves, presses Translate, and sets status to published.
**Expected:** `/bio` renders the English bio with the portrait; the five other locales render translated prose; the locale strip shows all six current.

### US2 — Prospect reads the bio in French
A visitor with the app set to `fr-FR` opens `/bio`.
**Expected:** the French row renders — one bio, not six. The FAQ endpoint shipped exactly this defect (every FAQ appearing once per language) before locale scoring was added; this scope must not reintroduce it.

### US3 — A locale fails to translate
One of the five translation calls errors or returns nothing.
**Expected:** the other four still write; the failed locale keeps its previous text; `/bio` in that locale falls back to English prose rather than a blank or half page; the failure is Pino-logged and marked in the locale strip. The save is never rolled back.

### US4 — Founder edits English but forgets to translate
The English row is saved; Translate is not pressed.
**Expected:** the five locales are flagged stale (their `updatedat` is older than the English row's) and the Translate button carries a badge. `/bio` still serves the old translations rather than nothing — stale beats absent.

### US5 — A long bio exceeds the model's output budget
The markdown is long enough that a translation would exceed the per-call token cap.
**Expected:** content is split on paragraph boundaries, translated in chunks, and stitched back with structure intact. It must not be silently truncated mid-sentence — the current cap is 1600 tokens and truncation today produces no error at all.

### US6 — Visitor follows the static site's Bio link before the bio is published (failure case)
The static site's hard-coded link is live but no published English row exists.
**Expected:** `/bio` redirects to `/about` rather than showing a 404 or an empty page. The link ships in an S3 file and cannot be conditionally hidden, so the page must absorb this.

### US7 — AI assistant rewrites the bio
The author types "make this warmer" in the side chat.
**Expected:** the assistant returns a full revised draft into a preview the author accepts or discards. Accepting replaces the editor content; discarding changes nothing. An LLM revision must never silently overwrite unsaved work.

## Functional Requirements

### FR-001 — Bio storage in `marketingassets`
The bio MUST be stored as locale-variant rows of one asset, with no new table or migration.
- [ ] `assetkey = 'founder-bio'`, `type = 'page'`, `category = 'bio'`, `companyid = NULL`.
- [ ] `assetkey` MUST NOT match `feature-%`. `scripts/translate-feature-snippets.ts:75` selects on `assetkey LIKE 'feature-%'` and would otherwise enroll the bio in the wrong translation script.
- [ ] `type` MUST NOT be `video` and `category` MUST NOT be `open` with `type = video`; that combination is the one that lands a row in the public `/api/help/marketing-videos` feed.
- [ ] Writes use `onConflictDoUpdate` on `(assetkey, locale)`, matching the existing translation scripts.
- [ ] The portrait URL is written to `fileurl` on all six rows, keeping each row self-sufficient for serving. (Closed 2026-07-16 as T015, whole-branch review fix: the editor originally PATCHed `fileurl` on the en-US row only, so a portrait uploaded after a Translate press left the 5 locale rows stale until the next re-translate. `PATCH /api/sysadmin/marketing/bio/photo` now updates the whole assetkey group in one write, with no LLM call.)

### FR-002 — Widen the admin category enum
The admin write path MUST accept the `bio` category.
- [ ] `'bio'` is added to the zod enum at `src/server/routes/marketingAdmin.ts:291`.
- [ ] A bio row can be PATCHed through the admin API without a 400. (The DB column is a plain `varchar(50)` and imposes no constraint, so a script insert succeeds while admin edits fail — the editor would appear broken with no schema error.)

### FR-003 — Public bio endpoint with locale resolution
`GET /api/bio?locale=<locale>` MUST return exactly one resolved bio.
- [ ] Resolution scores rows requested-language 2 > English 1 > other 0 and returns the best, reusing the contract proven at `src/server/routes/help.ts:293-328`.
- [ ] Exactly one row is returned regardless of how many locale variants exist.
- [ ] An untranslated or failed locale falls back to the English row.
- [ ] The endpoint is unauthenticated, like `GET /api/help/faq`.
- [ ] **The `en-US` row's status is the only publish decision.** `/bio` serves content only when the `en-US` row is `status = 'published'`; otherwise the endpoint returns `data: null` for every locale and the page redirects to `/about`. Once that gate passes, the best locale row is resolved from the whole assetkey group **without** filtering candidates on per-row status — the five locale rows are derived content written solely by the translation service and carry no independent publish meaning (FR-001, Data Requirements).

  *History (2026-07-16, two whole-branch review fixes — recorded because the naive reading of this requirement is wrong twice over):* T015 added the `en-US` gate, closing US6 — without it an English visitor could be served a published Portuguese translation while `en-US` was still `draft`, because every row scored 0 in `pickBestByLocale` and the first row won. T015 also made the translate upsert inherit the source row's status, which introduced a second defect: following US1's own documented order (save → Translate → publish), the five locales inherited `draft` and were then filtered out, so a French visitor got English and only a re-translate (≈10 more paid LLM calls) recovered it. T016 removed the per-row status filter entirely, which is what this bullet now specifies. An earlier draft of this bullet read "Only `status = 'published'` rows are served" — that wording is what produced the second defect and must not return.

### FR-004 — Public `/bio` page
A new public React route MUST render the bio.
- [ ] The portrait renders in the page corner on desktop and stacks above the text on mobile.
- [ ] Markdown renders via the app's existing `marked` dependency.
- [ ] With no published English row, `/bio` redirects to `/about` — not a 404, not an empty page.
- [ ] The portrait carries meaningful alt text.

### FR-005 — SysAdmin editor
A SysAdmin MUST be able to author the bio without a deploy.
- [ ] Registered by one line in `MarketingTabs.tsx`'s `TABS` array — not by editing `SysAdminDashboard.tsx`, whose tabs are hard-coded in three separate places.
- [ ] `@uiw/react-md-editor` provides the editor. Its `data-color-mode` is **hardcoded to dark** (amended 2026-07-16, product owner approved). This scope was drafted assuming the editor had to follow the app's theme toggle; that assumption was wrong. `grep "dark:"` across `src/client/pages/SysAdmin/marketing` returns zero Tailwind `dark:` variants — the entire SysAdmin marketing subtree hardcodes a dark palette and does not follow the toggle. Wiring the editor reactively would desync it from every panel around it. Making that subtree theme-aware is a separate scope.
- [ ] The editor exposes a `draft`/`published` control for the **en-US row**, whose status governs whether `/bio` is live (added 2026-07-16 as T014; the scope's US1 required it but the original task breakdown omitted it). Without this the founder saves a bio, visits `/bio`, and is silently redirected to `/about` with no explanation.
- [ ] Its preview renders through the same path `/bio` uses. The library's own preview uses a different markdown engine (remark/rehype) than the page (`marked`), so an unwired preview would not be what ships. (Closed 2026-07-16 as T015, whole-branch review fix: the editor shipped with no `previewOptions`/`components.preview` wiring at all, so this was still unmet at review time. `components.preview` now renders via `marked.parse`, mirroring `BioPage.tsx`.)
- [ ] Routes carry `authenticateToken` + `requireSysAdmin`.
- [ ] Saving English writes and returns success independently of any translation.

### FR-006 — Portrait upload
The portrait MUST be replaceable through the editor.
- [ ] A new `presignBioPhotoUpload` in `src/server/lib/marketing-assets-s3.ts` mirrors `presignBannerBackgroundUpload` (png/jpeg/webp, 15 MB cap).
- [ ] The client follows the proven three-step flow at `Assets.tsx:139-169`: presign, PUT direct to S3, PATCH `fileurl`. Bytes never transit the API.
- [ ] Persisted URLs are validated by the existing `isMarketingAssetUrl` guard.
- [ ] A failed upload leaves `fileurl` untouched and surfaces inline.

### FR-007 — Explicit translation with chunking
Translation MUST be an explicit action, and MUST NOT mangle or truncate markdown.
- [ ] A Translate button fans out to the five locales; saving alone spends no LLM calls.
- [ ] Both `title` and `content` are translated.
- [ ] Translation uses a markdown-safe prompt preserving exact line-break and blank-line structure. `translateAll` at `MarketingAIService.ts:298-310` MUST NOT be used as-is: its prompt preserves only "tone and any HTML" and omits the line-break instruction that its sibling `translateText` carries at `:289-291`. In markdown, line breaks are the formatting.
- [ ] Content above a character budget is split on blank lines, packed greedily into chunks, translated, and stitched back. The budget sits meaningfully below the token cap because translations run 15–30% longer than English source.
- [ ] Fenced code blocks stay atomic across the split.
- [ ] A single block exceeding the budget alone is sent whole. **Truncation is mitigated, not detected** (amended 2026-07-16, product owner approved): `src/server/ai/llm-provider.ts` surfaces no `finish_reason` or equivalent signal to any caller, so a truncated-but-non-null response is indistinguishable from a complete one. Detecting it would mean changing shared LLM infrastructure used by 9 consumers (SCOPE-099 territory). The mitigation is the chunk budget itself: 3500 source characters against a 4000-token output cap absorbs the 15–30% expansion with margin. Hitting the ceiling requires a single unbroken markdown block roughly 3–4× the chunk budget. Surfacing `finish_reason` is a candidate follow-up for SCOPE-099.
- [ ] Chunks translate in order within a locale and reassemble by index; the five locales run in parallel, capping concurrency at five rather than chunks × 5.
- [ ] `maxTokens` for this path is raised above the current 1600.
- [ ] Each locale is independent and fail-open: a failure preserves the previous text and never rolls back the English save.

### FR-008 — Staleness without a schema change
The editor MUST show which locales are behind English.
- [ ] Staleness is derived by comparing the `en-US` row's `updatedat` against each locale row's. No flag column, no migration.
- [ ] The strip distinguishes "stale" (English changed since translating) from "untranslated" (never translated), following the `FeatureSnippets.tsx:332-339` idiom.
- [ ] The Translate button badges when anything is stale.

### FR-009 — AI assistant chat
The editor MUST offer conversational drafting and revision.
- [ ] A new `POST /api/sysadmin/marketing/ai/bio` route follows the established stack: auth + `requireSysAdmin`, zod body, per-user throttle via `checkThrottle`, then `MarketingAIService` → `generateOnce`.
- [ ] The assistant receives the current markdown plus the instruction and returns a full revised draft.
- [ ] Revisions land in a preview the author accepts or discards; accepting replaces editor content, discarding changes nothing.
- [ ] The client reuses the `aiPost` helper idiom at `AIStudio.tsx:28-46` (401 → login, 403 → dashboard, 429 → slow down, `data.ok` check).
- [ ] Model errors return `200 {ok:false}` with a Pino log — never a 5xx, matching `FAIL_OPEN` at `marketingAi.ts:41`.

### FR-010 — Bio links below Contact on both landing pages
Both landing pages MUST offer an entry point to the bio.
- [ ] React: a Bio link beside Contact in the footer Company column (`LandingPage.tsx:323-339`), keyed `landing.footer.bio` and added to all six locale files.
- [ ] Static site: a Bio link in the footer nav beside Contact (`index.html:465`), as an absolute cross-domain URL to the app's `/bio`.
- [ ] No bio content is copied into the static site.

### FR-011 — Founder-selectable translation/AI provider
The founder MUST be able to choose which LLM provider translates the bio and drives the AI revision assistant, from the providers actually configured, and that choice MUST persist as the default. (Added 2026-07-18. Motivation: on the real bio, Gemini's translations read materially better than the groq default; the founder needs a durable in-UI choice for marketing quality rather than an env edit + restart. The provider plumbing already exists — `llm-provider.ts` supports `groq|gemini|anthropic|openai-compatible` and `generateOnce` takes a per-call `{provider, model}` override (SCOPE-099 / SCOPE-065).)
- [ ] The choice is a single persisted default stored as one `systemsettings` row, `key = 'marketing.translationProvider'`, `value = { provider }`, `category = 'integrations'` — reusing the existing `systemSettings`/`systemSettingsHistory` store and its history-on-write pattern. No new table, no migration.
- [ ] Absent setting → behavior is unchanged, falling back to the existing env default (`MARKETING_LLM_PROVIDER` via `translationOpts()`).
- [ ] `GET /api/sysadmin/marketing/bio/providers` (auth + SysAdmin) returns `{ available, selected }`. `available` lists only providers whose key env is set (`GROQ_API_KEY`/`GEMINI_API_KEY`/`ANTHROPIC_API_KEY`; `openai-compatible` only when both `LLM_API_KEY` and `LLM_BASE_URL` exist) — no dead options.
- [ ] `PUT /api/sysadmin/marketing/bio/provider` (auth + SysAdmin) validates the provider is in `available` (else 400) and upserts the setting with a history row.
- [ ] `POST /bio/translate` and `POST /ai/bio` resolve routing from that setting server-side — no provider travels in a request body. One picker governs both actions.
- [ ] Provider→model resolution generalizes today's `translationOpts()`: `groq` keeps the high-TPM `MARKETING_TRANSLATION_MODEL`, `anthropic` keeps `claude-sonnet-4-6`, `gemini`/`openai-compatible` use their preset default model.
- [ ] Fail-open: if a stored provider later loses its key, resolution falls back to the env default rather than erroring — the translate/revise actions never 5xx (matching FR-007/FR-009).
- [ ] The editor exposes a "Translation & AI provider" control populated from `available`, defaulting to `selected`, that persists on change (mirroring the en-US draft/published control's immediate single-field write). Chunking, `maxTokens`, and the translation prompt are unchanged — every provider rides the existing chunk-and-stitch path.

## Data Requirements

No schema changes. No new tables, columns, or migrations.

The bio occupies six existing-shape rows in `marketingassets`, made possible by the `unique(assetkey, locale)` constraint at `marketingassets.ts:45-48`, which also supplies the upsert target.

`companyid = NULL` was verified as correct rather than merely permitted. Nothing in the codebase — no route, service, or script — ever writes that column, so every existing row is already NULL, and three listings (`faq.ts:38`, `help.ts:310`, `help.ts:401`) explicitly filter `isNull(companyid)`, making NULL the visible side. The column is vestigial. A company-scoped row is what would have gone missing.

Isolation from other listings comes from `category` + `type`, not `companyid`. The listings that do not filter `companyid` each have a different secondary gate the bio misses: the public video feed requires `type = 'video'` with a non-empty `fileurl`; the landing carousel requires an inner join to a `marketingfeaturesnippets` sidecar row this scope never creates; the FAQ paths require `category = 'faq'`.

Two exposures are unavoidable and accepted: the bio row appears in the SysAdmin assets library listing (`marketingAdmin.ts:300`) and increments the type/status counts on the SysAdmin marketing overview (`SysAdminMarketingOverviewService.ts:151-155`). Both are auth-gated SysAdmin surfaces, not public leaks.

## API Routes

New:
- `GET /api/bio` — public, unauthenticated, `?locale=` scoped, returns one resolved row.
- `POST /api/sysadmin/marketing/bio/translate` — auth + SysAdmin; fans out the five locales.
- `POST /api/sysadmin/marketing/ai/bio` — auth + SysAdmin; the assistant chat.
- `POST /api/sysadmin/marketing/bio/photo/upload-url` — auth + SysAdmin; presigns the portrait PUT.

Modified:
- `PATCH /api/sysadmin/marketing/assets/:id` — unchanged in shape; its category enum widens to admit `bio` (FR-002). This is the bio's **save path**: the editor persists English `title`/`content` and the portrait's `fileurl` through the existing asset PATCH rather than a bespoke save route. `POST /api/sysadmin/marketing/assets` likewise creates the initial row. No new save endpoint is introduced, which is precisely why FR-002's enum widening is a gate rather than a nicety.

## Frontend Components

New:
- `src/client/pages/BioPage.tsx` — the public `/bio` page.
- `src/client/pages/SysAdmin/marketing/Bio.tsx` — the editor, AI chat, upload, and locale strip.

Modified:
- `src/client/pages/SysAdmin/marketing/MarketingTabs.tsx` — one line added to `TABS`.
- `src/client/pages/LandingPage.tsx` — a Bio link in the footer Company column.
- `src/client/App.tsx` — two routes registered.
- `src/client/i18n/locales/*.ts` (six files) — `landing.footer.bio` plus any bio-page chrome.
- `marketing/site/index.html` — a Bio link in the footer nav.

New dependency: `@uiw/react-md-editor`. Chosen over a textarea-plus-`marked`-preview with the trade understood — it adds bundle weight for a page only a SysAdmin edits, in exchange for a toolbar, syntax highlighting, and drag-drop images in the surface where the founder will actually write.

## Success Metrics

- The founder revises the bio and sees it live on `/bio` with zero deploys and zero developer involvement — where today the equivalent change requires editing `marketing/site/index.html` and an S3 redeploy.
- `/bio` serves all six locales from one authored English source, and `GET /api/bio?locale=fr-FR` returns exactly one row — not six, the defect the FAQ endpoint shipped and had to be repaired for.
- A bio long enough to require chunking round-trips through translation with its markdown structure intact (paragraph breaks, headings, and lists preserved) and no truncated sentences in any of the five locales.
- With any single locale's translation forced to fail, `/bio` still renders that locale as English prose, the English row is unaffected, and the other four locales still write.
- New tables and migrations added: 0.

## Constraints

- Fences are orchestrator-written and never hand-authored. Steps that MODIFY existing fenced files (`marketingAdmin.ts`, `MarketingTabs.tsx`, `LandingPage.tsx`, `App.tsx`, `marketing-assets-s3.ts`) must route through the hosted `/call` implement path; the local `implement` CLI has no fence-DB client and strips fences on modify. `auditfences` must pass before push.
- 100% TypeScript, no `any`, no `@ts-ignore`. Pino only, no `console.log`.
- Editing React/Tailwind files requires `_wxAI/rules/shadcn.md` and the shadcn-ui MCP.
- The static site's Bio link is hard-coded HTML that cannot be conditionally hidden. Publishing the bio before that link ships is the intended ordering; FR-004's `/about` redirect is the guard for when it is not.
- LLM failures fail open (`200 {ok:false}`, Pino-logged) throughout, matching `MarketingAIService` and `marketingAi.ts`. Never a 5xx.
- The English save and the translation fan-out are separate operations. English is committed first and never rolled back by a translation failure.
- No push until the product owner says push.

## Verified Findings

Recorded because they were established by direct read during drafting, and three of them corrected assumptions this scope started from.

- **`companyid` is vestigial, and NULL is the convention, not an exception.** Twelve write sites across routes, services, and scripts were checked; none sets the column. The original concern — that a global row might be invisible to company-scoped queries — was backwards.
- **`translateAll` is not markdown-safe.** Its prompt (`MarketingAIService.ts:304`) omits the line-break preservation that `translateText` demands at `:289-291`. The helper whose name suggests it is the right one for "translate into all locales" would flatten markdown structure across five languages.
- **`checkThrottle` is route-level, not inside `genText`.** Parallel locale calls do not self-throttle, so a fan-out costs roughly one call's latency. This is what made an explicit button a free choice rather than a latency workaround.
- **`maxTokens: 1600`** applies to both translation paths — roughly 1200 words — and truncation raises no error. Chunking addresses the cause; the raised cap alone would not.
- **The admin category enum is a hard gate.** `marketingAdmin.ts:291` restricts category to four values while the DB column accepts anything, so a `bio` row would insert by script and then 400 on every admin edit — an editor that looks broken with no schema error to explain it.
- **The three-step presign upload is proven in the UI**, not just in scripts (`Assets.tsx:139-169`), and an image-only presigner with a 15 MB cap already exists to clone.

## Open Questions

1. **Does the portrait need a per-locale alt text**, or does one English alt string suffice? Alt text is content, and the translation fan-out covers `title` and `content` but not `fileurl`'s description.
2. **What is the character budget for a chunk?** It derives from the raised `maxTokens` and the 15–30% expansion factor, but the exact figure should be set against a real bio draft rather than assumed.
3. **Should `/bio` be linked from the app's authenticated shell**, or is it purely a public marketing surface? Current design links it only from the two landing-page footers.
4. **Does the bio belong in the SysAdmin assets library listing** where it will now appear alongside marketing assets, or should that listing exclude `category = 'bio'`?
5. **Who writes the first English bio**, and does that content land in this scope's implementation or as a separate content task after the editor ships?

## Notes

- SCOPE-092 solves a structurally identical problem (one English source, five generated locales, per-field fallback) for `wxkanbanhelp` and remains unbuilt. This scope's chunker, locale scoring, and staleness-from-`updatedat` derivation are all candidates for reuse if 092 proceeds — worth a look before 092 invents its own.
- The `?locale` inconsistency in `help.ts` is adjacent and untouched: `GET /api/help/faq` filters by locale, while `marketing-videos` (`:349`) and `training-sessions` (`:386`) return `locale` without filtering on it — the same latent defect the FAQ endpoint already had to fix. Not this scope's to repair, but the next locale bug will likely come from there.
- The `marketingassets.ts:31` comment lists `open|training` while live code uses `faq` and `trainingsession` as well. Adding `bio` makes it four values out of date; correcting the comment is a one-line courtesy for the next reader.
- Implementation order (each step independently shippable): A storage + category enum + public endpoint → B `/bio` page + locale scoring → C SysAdmin tab + editor + upload → D AI chat → E translation + chunking + staleness → F the two footer links, last, once content is published.
