# Tasks: Multi-language help content (Spec 092)

**Spec**: 092 · **Phase**: design → implementation · **Created**: 2026-07-09

Legend: `[ ]` todo · `[~]` in progress · `[x]` done

## T001 — `helptranslations` schema + migration (FR-001)
- [ ] Add `helptranslations` Drizzle table in `src/db/schema/` (id UUID v7, helpid FK→wxkanbanhelp.id cascade, locale, title, summary, content, ispublished, isstale, createdat, updatedat; unique(helpid, locale)).
- [ ] Generate + apply migration (app `src/db/migrations`).
- **Verify**: table exists with unique constraint; deleting a help row cascades.

## T002 — Locale resolver + per-field fallback merge (FR-002)
- [ ] `resolveHelpLocale(req)` — precedence `?locale=` → `user.language` → `Accept-Language` → en-US.
- [ ] `mergeHelpTranslation(base, translation)` — per-field English fallback.
- **Verify**: unit tests for precedence + fallback.

## T003 — Locale-aware `/api/help/*` reads (FR-002)
- [ ] Apply resolver + merge in `routes/help.ts` (`/docs`, `/docs/:slug`, sibling content reads).
- **Verify**: `?locale=it` returns Italian-with-English-fallback; unknown locale → English; no-translations → unchanged English.

## T004 — Client passes active locale (FR-002)
- [ ] `DocsIndexPage.tsx` / `DocsDetailPage.tsx` (and other `/api/help` fetches) append `?locale=<current app locale>`.
- **Verify**: switching app language changes served content locale.

## T005 — AI translation seed service (FR-003)
- [ ] `HelpTranslationService.seedItem(helpid)` → translate title/summary/content into 5 locales via `LLM_PROVIDER`, save as drafts; fail-open.
- **Verify**: seeding populates 5 locales as drafts; provider error surfaces without blocking English.

## T006 — Admin translation routes (FR-003/004/005)
- [ ] `POST /api/sysadmin/help/:id/translations/seed`, `PUT /api/sysadmin/help/:id/translations/:locale`, `POST /api/sysadmin/help/:id/translations/:locale/publish` in `routes/sysadmin.ts`.
- **Verify**: seed/save/publish round-trip; auth-guarded (SysAdmin).

## T007 — SysAdmin editor per-locale UI (FR-004)
- [ ] `SysAdmin/Docs.tsx`: locale tab strip, Generate-translations button, per-locale edit fields, draft/published/stale badges, save/publish.
- **Verify**: admin edits a locale, publishes, sees it served.

## T008 — Staleness + re-seed (FR-005)
- [ ] On English source save, set `isstale=true` on that item's translations (non-blocking); editor shows flag + one-click re-seed; last-published stays live.
- **Verify**: English edit flags stale without changing live output; re-seed clears flag.

## T009 — Bulk-seed script (FR-006)
- [ ] `scripts/seed-help-translations.ts` — seed all untranslated items across categories; `--force` re-seeds; per-item success/failure report; idempotent.
- **Verify**: one run drafts all 26 items; second run does 0 duplicate work without `--force`.

## T010 — Tests
- [ ] Unit: locale precedence + per-field fallback (T002); seed idempotency (T009).
- [ ] Integration: `/api/help/docs` + `/docs/:slug` across locales incl. no-translations regression.
- **Verify**: `npm run test:unit` green.
