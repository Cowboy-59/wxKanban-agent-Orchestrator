# Tasks: SysAdmin Marketing Feature Snippets Manager (Spec 096)

Source scope: `specs/Project-Scope/096-marketing-feature-snippets.md`. Each task traces to its FRs.

- [ ] T001 — marketingfeaturesnippets sidecar table + migration (FR-006, FR-007, Data Requirements): Drizzle schema `marketingfeaturesnippets` (assetkey PK: ctaurl, dwellms int default 5000, enhanced bool, sortorder, sourcescope, uuidv7 id, timestamps); generate migration + apply via pg.Client transaction.
- [ ] T002 — Public read endpoint GET /api/marketing/feature-snippets (FR-002, FR-003, FR-011): published-only snippets (canonical en-US marketingassets row joined with sidecar) with per-locale billboard image URLs, dwellMs, enhanced, ctaUrl; read-only, mounted before auth.
- [ ] T003 — Admin list + PATCH routes, SYSADMIN-gated (FR-001, FR-002, FR-004, FR-006, FR-007, FR-010): src/server/routes/marketingFeatureSnippets.ts under /api/sysadmin/marketing/feature-snippets behind authenticateToken+requireSysAdmin; GET joined list; PATCH :assetkey to toggle status, dwellms, enhanced, ctaurl, sortorder.
- [ ] T004 — Translations endpoint + language dropdown data (FR-005): GET :assetkey/translations returning each locale variant's title/valueProp/benefit; flag missing locales as untranslated.
- [ ] T005 — Edit-copy endpoint (FR-009): POST :assetkey to edit a snippet's fields and save; persists, no implicit publish.
- [ ] T006 — Add-from-scope AI draft, POST /from-scope (FR-008): read specs/Project-Scope/<scopeId>.md, call generateOnce with the marketing/Claude override (SCOPE-065 fail-open pattern) to draft the snippet; insert a draft en-US synopsis row + sidecar row with sourcescope; copy only; fail-open, Pino-logged.
- [ ] T007 — Client FeatureSnippets.tsx tab (FR-001, FR-004–FR-009): src/client/pages/SysAdmin/marketing/FeatureSnippets.tsx — shadcn table with on/off toggle, inline CTA link, language dropdown, dwell input, featured toggle, edit modal, Add-from-scope scope picker.
- [ ] T008 — Point landing carousel at the public API (FR-002, FR-011): update FeatureBillboards to read GET /api/marketing/feature-snippets instead of the static manifest.json; honor dwellMs/enhanced/ctaUrl and the graceful empty state.
- [ ] T009 — Seed marketingfeaturesnippets for the 18 existing snippets: backfill sidecar rows from feature-set.json (ctaurl/dwellms/enhanced/sortorder); default the low-proof (in-flux) features to off/draft.
- [ ] T010 — Tests (FR-002, FR-005, FR-008, FR-010, FR-011): toggle→carousel, missing-locale flagged, from-scope lands as draft, non-SYSADMIN 403, all-off empty state.
