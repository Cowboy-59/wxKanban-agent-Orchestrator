# Test Plan: Multi-language help content (Spec 092)

**Spec**: 092 · **Created**: 2026-07-09

## Unit

- **Locale precedence** (T002): `resolveHelpLocale` returns `?locale=` when present even if `user.language` differs; falls through user → Accept-Language → en-US; unknown locale resolves to en-US.
- **Per-field fallback** (T002): `mergeHelpTranslation` returns the translated field when non-empty and the English base field when the translation field is empty/null; never returns null when the base has a value.
- **Seed idempotency** (T009): given items already translated, the seeder skips them without `--force` and re-seeds with `--force`.

## Integration

- **`GET /api/help/docs?locale=it`**: items with Italian translations return Italian; untranslated fields return English; response shape unchanged.
- **`GET /api/help/docs/:slug?locale=fr`**: same per-field behavior on the detail route.
- **Precedence over profile**: authenticated request with `user.language='en-US'` and `?locale=it` returns Italian content.
- **No-translations regression**: with an empty `helptranslations` table, every read returns the same English payload as before the change.

## Admin round-trip

- **Seed → edit → publish**: `POST …/translations/seed` creates 5 drafts; `PUT …/translations/it` edits; `POST …/translations/it/publish` makes it live; a subsequent read at `?locale=it` reflects the edited text.
- **Staleness**: editing the English source sets `isstale` on translations and does not change the currently-served (last-published) output.

## Manual / E2E (spot check)

- Switch the app to each of the 6 locales and load `/docs` + a `/docs/:slug`; confirm content language and zero blank fields.
