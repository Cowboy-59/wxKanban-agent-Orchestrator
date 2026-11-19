# Quickstart: Multi-language help content (Spec 092)

**Spec**: 092 · **Created**: 2026-07-09

## What this delivers

Admin-authored help content (`wxkanbanhelp`: docs videos, cli/reference/guide articles, faq) can be translated into the 6 supported locales. Admins author English, AI-seeds the other 5 as editable drafts, and the public help reads serve the viewer's active locale with per-field English fallback.

## Developer setup

1. Ensure `LLM_PROVIDER` and its key are set in `.env` (same provider the app already uses).
2. Apply the new migration: `npm run db:generate && npm run db:migrate` (dev).
3. `npm run dev:server` (3001) + `npm run dev:client`.

## Seed the back-catalog

```
npx tsx scripts/seed-help-translations.ts          # draft translations for all untranslated items
npx tsx scripts/seed-help-translations.ts --force  # re-seed everything (overwrites drafts)
```

## Try it

- Author or open a help item in SysAdmin → Docs, click **Generate translations**, edit a locale tab, **Publish**.
- Switch the app language (🌐) to that locale and open `/docs` → the item's title/summary/content appear in that language; untranslated fields fall back to English.
- Edit the English source of a translated item → its locales show a **stale** badge; end users keep seeing the last-published version until you re-seed and republish.

## Key files

- `src/db/schema/…helptranslations…` — table
- `routes/help.ts` — locale-aware reads
- `routes/sysadmin.ts` — seed/save/publish routes
- `src/client/pages/SysAdmin/Docs.tsx` — per-locale editor
- `scripts/seed-help-translations.ts` — bulk seed
