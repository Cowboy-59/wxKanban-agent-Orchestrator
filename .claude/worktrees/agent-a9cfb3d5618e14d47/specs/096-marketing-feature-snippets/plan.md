# Plan: SysAdmin Marketing Feature Snippets Manager (Spec 096)

## Approach

Reuse the existing marketing surfaces; add one sidecar table, one router (+ one public read
endpoint), and one sysAdmin tab; then wire the landing carousel to the API. Build foundation-first so
each layer is verifiable before the next.

## Phases

1. **Data (T001, T009).** Add the `marketingfeaturesnippets` sidecar table + migration; seed rows for
   the 18 existing snippets from `feature-set.json` (in-flux features default off/draft).
2. **Read path (T002, T008).** Public `GET /api/marketing/feature-snippets` (published only);
   repoint the landing `FeatureBillboards` from the static manifest to the API. Exit gate: carousel
   renders from the DB.
3. **Admin write path (T003, T004, T005).** SYSADMIN list + PATCH (toggle/dwell/enhanced/cta/order),
   translations endpoint, edit-copy endpoint. Exit gate: toggling in the API changes the carousel.
4. **AI add-from-scope (T006).** `POST /from-scope` via `generateOnce` (Claude override, fail-open),
   inserts a draft snippet + sidecar row. Exit gate: a scope yields a reviewable draft, off.
5. **Client tab (T007).** `FeatureSnippets.tsx` in the Marketing hub — table with toggle, CTA,
   language dropdown, dwell, featured, edit, add-from-scope.
6. **Tests (T010).** toggle→carousel, missing-locale flagged, from-scope draft, 403 gating, empty state.

## Conventions

100% TypeScript; Pino-only; DB via `src/db/client.ts`; routes via `index.ts → app.ts`; fences by the
orchestrator at `implement`; nothing pushed until the user says push.

## Open decisions (resolve during build)

- Public endpoint caching; on/off cascade vs canonical-only; billboard image URLs S3 vs
  `public/feature-banners/`; the Claude model id for `/from-scope`.
