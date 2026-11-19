# SCOPE-114: Curated Design System Catalog — 50 Analysed Systems, Browsable, Pickable, Downloadable as Theme + Controls

**Scope Number**: 114
**Status**: `draft`
**Created**: 2026-07-29
**Depends On**: SCOPE-062 (Project Theme — `ProjectTheme` model, execute renderers, AA contrast checks), SCOPE-106 (Borrow-a-Look — `themetemplates` gallery, business chrome), SCOPE-107 (Block Composer — `themeblocks`), Theme Studio Phase 1 (the `/themes` Studio page and its snapshot-on-pick semantics)
**Source**: this document

---

## Overview

Turn the 50 hand-authored design-system analyses in `marketing/AIBM-Design-Systems-Pack/` into a first-class product surface: a **wxKanban-curated, globally shared catalog** stored in the database, browsable and previewable inside the existing Theme Studio, pickable into a company's own theme gallery in one click, and downloadable as a complete **theme + controls** template that drops into the React + Tailwind + shadcn product wxKanban generates.

Today a customer starting a project chooses between six built-in presets, an AI-derived look, or building tokens by hand. None of those give a *coherent whole* — a palette, a real type scale, a spacing rhythm, an elevation model and a matching set of styled controls that were designed together. The pack already contains 50 such wholes, each captured at high fidelity from a real, professionally designed product. This scope makes them usable instead of merely present on disk.

The work is deliberately additive. `ProjectTheme`, the Studio components, the per-project apply path and the execute renderers all keep their current shape; a richer sibling model carries what the pack captures beyond the 19 shadcn tokens, and the download bundle grows to emit it.

### Core Design

| Element | Value |
|---------|-------|
| **Primary Actor** | Project owner choosing the visual identity for a product wxKanban will generate |
| **Secondary Actors** | Company admin curating which looks the team reuses; the AI implementation agent consuming the downloaded `DESIGN.md` as build context; wxKanban operator re-seeding the catalog when systems are added |
| **Key Value** | Pick a professionally coherent design system in one click and get real, drop-in artifacts — not a palette you then have to turn into a product |
| **Catalog ownership** | **Global and system-owned.** One `designsystems` table with no `companyid`; 50 rows total, read-only to users, visible to every company |
| **Pick semantics** | **Copy, not link.** Picking writes a new `themetemplates` row owned by the company; the catalog row is never mutated and later catalog changes never reach an existing copy |
| **Token fidelity** | Both layers kept — the rich pack token set verbatim, **plus** a deterministically derived 19-token `ProjectTheme` that every existing consumer already understands |
| **Naming** | Descriptive character shown (`Electric Indigo on Near-Black`); the originating brand stored for traceability and **never** rendered or serialised to a client |
| **Ingest** | Deterministic parser + fixed mapping table. **No AI call anywhere in the pipeline** |
| **Missing mode** | Synthesized algorithmically at seed time, AA-verified, and badged as approximated |
| **Scope Boundary** | Catalog storage, browse/preview/pick in the Studio, and the extended download bundle. Excludes promoting company-captured systems into the catalog, favourites, catalog versioning, and non-web app types |

---

## Business Problem

wxKanban's promise is that a customer describes a product and the platform generates it. Visual identity is the weakest link in that promise. SCOPE-062 shipped an executable theme model, and SCOPE-106 shipped URL-based look borrowing, but the *starting points* on offer remain thin:

- Six built-in presets, all variations on the same shadcn slate/blue/emerald/rose/violet/amber palette. They differ only in hue.
- AI derivation from a gallery, prompt or logo, which produces colour but no type scale, no spacing rhythm, no elevation model and no control specifications.
- Manual token pickers, which require the design judgement the customer came to wxKanban precisely because they lack.

The target customer is a career-changer roughly a year into development. They can reason about data and logic; they cannot invent a coherent visual system from nineteen colour swatches. Handing them a hue picker is handing them the hardest part of design and calling it a feature.

Meanwhile the pack sitting in `marketing/AIBM-Design-Systems-Pack/` contains exactly what is missing, at a fidelity the current model cannot even store:

| Layer | What the pack captures | Where it lands today |
|-------|------------------------|----------------------|
| Colour | ~14 core semantic keys present in 46–50 of 50 systems, plus a long tail of accents | 19 shadcn tokens — a lossy but workable target |
| Typography | 10 core roles with real `fontSize` / `fontWeight` / `lineHeight` / `letterSpacing` (`display-1`, `button`, `body-md` in all 50) | One `fontFamily` string and one freeform `scale` string |
| Radius | A 7-step scale (`xs` through `full`) | One `radius` string |
| Spacing | A 7-step scale on a 4px base | Nowhere |
| Elevation | 3 levels plus signature inset treatments | Nowhere |
| **Controls** | A `components:` block — `text-input`, `nav-bar`, `button-primary` in all 50; `card` and `badge-pill` in 46; `button-secondary` in 42; then per-system extras | **Nowhere.** There is no home for control specification in any shipped model |
| Rationale | A prose design analysis explaining *why* the system works | Nowhere |
| Visual proof | A self-contained ~25 KB showcase page per system — palette, type, buttons, cards, forms, spacing, radius, elevation, responsive, pricing, data table, auth forms | Nowhere |

So the two halves of the problem are: the assets exist but are invisible to the product, and the model cannot hold the half that matters most — the controls. A customer who picks a look today still has to design every button, input, card and badge themselves.

The vocabulary consistency across the 50 files is high enough to rule out AI parsing: all 50 share the same nine top-level frontmatter keys, the core colour and typography keys appear in 46–50 of 50, and every gap has a declarable fallback. A deterministic parser is both sufficient and repeatable, which matters because a non-deterministic pipeline would produce a different catalog on every re-seed.

---

## Success Metrics

1. **All 50 systems ingest cleanly.** A table-driven test over the real pack asserts 50 of 50 parse to a complete rich token set and to a `ProjectTheme` with all 19 tokens populated — zero skips, zero partial rows.
2. **Zero silent synthesis failures.** Every synthesized counterpart mode either passes the existing `themePassesAA` check or is explicitly recorded as a fallback with `synthesizedmode` set; the test asserts the count of unrecorded failures is exactly 0.
3. **No colour literals in generated controls.** A regex assertion over every emitted control file across all 50 systems finds 0 hex, `rgb(` or `hsl(` literals — all colour resolves through shadcn semantic classes.
4. **Browse stays under 250 KB per page load.** The list endpoint response for all 50 entries excludes `showcasehtml`, `analysis` and `sourcebrand`; a contract test asserts those three keys are absent from the payload and that the serialised body is under 250 KB.
5. **Pick-to-artifacts in at most 4 actions, with the controls actually present.** From opening the Catalog tab to holding a downloaded bundle: pick, name, apply to project, execute — no manual token editing required. An end-to-end test walks catalog → template → project theme → bundle and asserts the bundle contains all 6 control files with ≥1 system-specific variant, proving the rich tokens survived both hops.
6. **Trademark surface is zero.** `sourcebrand` appears in 0 client-bound response payloads and 0 generated artifact files; asserted by contract test and by a regex sweep of the emitted bundle.
7. **No regression in shipped theme surfaces.** The existing `theme-tokens` unit suite (13 tests) and the Studio's Look & Chrome, Blocks and per-project apply paths pass unchanged; `ProjectTheme`'s shape is not modified.

---

## Scope Boundary

In scope for this iteration:

- **Storage.** A new global `designsystems` table (no `companyid`), holding per system: `slug`, descriptive `name`, `description`, `sourcebrand` (internal only), `nativemode`, `tags`, the rich `tokens` jsonb, the derived `theme` jsonb (`ProjectTheme`), `synthesizedmode`, the `analysis` prose, `showcasehtml`, `fontstack`, `fontimporturl` and `sortorder`. Migration `0057`.
- **Copy carrier — both tiers.** Nullable `tokens` jsonb and `designsystemslug` varchar added to **`themetemplates` and `projectthemes`**, so the rich set and its provenance survive both hops of the chain: catalog → company template (pick) → project theme (snapshot apply) → bundle (execute). Migration `0058`. This is load-bearing: `execute` resolves from `projectthemes`, so without the project-tier columns the rich set would die at the project boundary and the control files could never be emitted.
- **Carry-across in `apply-template`.** `POST /api/projects/:id/theme/apply-template` currently selects only `theme, chrome, blocks` from the template. It must also select and write `tokens` and `designsystemslug` — in **both** the insert values *and* the `onConflictDoUpdate` set clause, since re-applying a profile to a project that already has a theme takes the update path and would otherwise silently strand stale tokens.
- **Rich model.** `src/shared/design-system.ts` defining `DesignSystemTokens` (colors / typography / rounded / spacing / elevation / components, each an open `Record` so per-system extras survive) as a **sibling** of `ProjectTheme`, not a replacement.
- **Deterministic ingest.** `scripts/seed-design-systems.ts`, idempotent upsert by `slug`: parse frontmatter and prose; lift the webfont href from the showcase `<link>`; map rich to `ProjectTheme` via a fixed table with declared fallback chains; composite translucent values against their own canvas before HSL conversion; synthesize the missing mode; upsert. Runnable repeatedly with identical output.
- **Curated naming.** `src/shared/designsystemcatalog.ts` — a checked-in map of 50 `{ folder, slug, name, tags }` entries authored from each system's own description. Deterministic, reviewable, and the mechanism by which the originating brand stays out of the UI.
- **Counterpart synthesis.** Flip canvas lightness to the opposite pole; invert the ink ramp preserving step distances; hold brand hue and shift only its lightness for legibility; recompute hairlines as the opposite alpha; then iterate foreground lightness in 2% steps against the shipped `themeContrastReport` until AA passes, falling back to `WXKANBAN_DEFAULT_THEME`'s set for that mode and recording the failure if it cannot converge.
- **Browse.** A third **Catalog** tab in the Theme Studio: filter by mode and tag with free-text search; a card grid showing swatches, name, description, mode badge, resolved font and radius, plus an "approximated — tune in Studio" badge wherever `synthesizedmode` is set.
- **Preview.** A dialog rendering the stored `showcasehtml` in an iframe with `sandbox=""` and `referrerpolicy="no-referrer"` — no scripts, no same-origin, Google Fonts the only outbound request.
- **Pick.** "Use this system" names the copy and writes a normal `themetemplates` row (`theme` and `tokens` from the catalog, `chrome` = `DEFAULT_BUSINESS_CHROME`, `blocks` = null), then selects it in the rail with Look & Chrome focused so the user lands in the editor on their own copy. The per-project snapshot apply path is reused unchanged.
- **Download bundle.** `POST /api/projects/:id/theme/execute` extended, same response contract, to additionally emit: extended `theme.css` (the 19 vars plus radius / spacing / elevation / per-role type custom properties and the webfont import); `tailwind.theme.ts`; the six core control files `components/ui/{button,card,input,badge,nav}.tsx` with per-system extras expressed as **additional variants on the same component** rather than extra files. The default emission threshold is **an extra appears in ≥5 of the 50 systems** — which admits `button-dark` (19), `button-pill` (11) and `button-outline` (6), while single-occurrence entries such as `segmented-pill`, `progress-bar` and `plan-card-featured` remain in `tokens` only and are documented rather than generated. Also `DESIGN.md` carrying the prose analysis plus a resolved token table as build context for the implementation agent. `Header.tsx` / `Footer.tsx` continue unchanged.
- **The staleness rule, enforced in the renderers.** Once copied, `theme` is authoritative for **all colour** and `tokens` is authoritative **only** for the layers it uniquely holds — type scale, spacing, elevation, radius steps and control geometry. Control colour resolves through shadcn semantic classes exactly as the shipped `renderHeaderComponent` already does, so a user recolouring in the Studio can never desynchronise the bundle.

## Out of Scope

Explicitly excluded from this iteration:

- **Promoting a company's own captured system into the catalog.** URL capture belongs to SCOPE-106; a company-authored entry appearing in the shared browse experience would mix curation with tenant data in one table and is deferred.
- **Rebranding the showcase page to customer chrome.** Templating 50 hand-authored 25 KB HTML files is the fiddliest possible work for the least certain payoff; the showcase stays a read-only preview of the catalog entry.
- **Per-user favourites, ratings or usage counts.**
- **Catalog versioning.** Re-seeding overwrites by `slug`; there is no history of prior token values and no notification to companies holding an older copy.
- **Non-web app types.** Every system in the pack is a web design language; desktop and mobile continue to resolve through the existing preset path, which already returns an empty preset list for them.
- **Shipping font files.** Roughly 30 of the 50 name a typeface that is not freely licensed. No font binary is ever bundled, hosted or redistributed; the resolved stack falls back to the substitute the pack itself declares, and `DESIGN.md` names the intended family so the customer can license it directly.
- **Rendering the originating brand anywhere user-visible**, including generated artifacts, filenames and code comments.
- **Reconciling the two confusingly-similar theme nav items** (admin "Theme Profiles" vs "Theme Studio") — known WIP from Theme Studio Phase 1, tracked separately and deliberately not worsened here, since the Catalog is a tab inside an existing page rather than a new nav entry.

---

## Data Requirements

**New table `designsystems`** (global; no tenant column by design):

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | uuid v7 |
| `slug` | varchar(80) NOT NULL | UNIQUE; the upsert key for idempotent re-seeding |
| `name` | varchar(120) NOT NULL | descriptive title, user-visible |
| `description` | text NOT NULL | the pack's `description` prose |
| `sourcebrand` | varchar(80) | internal traceability only; never serialised to a client |
| `nativemode` | varchar(10) NOT NULL | `light` \| `dark` |
| `tags` | jsonb `$type<string[]>` NOT NULL | filter facets |
| `tokens` | jsonb `$type<DesignSystemTokens>` NOT NULL | the rich set, verbatim |
| `theme` | jsonb `$type<ProjectTheme>` NOT NULL | derived 19-token light + dark |
| `synthesizedmode` | varchar(10) NOT NULL | `light` \| `dark` \| `none` |
| `analysis` | text NOT NULL | prose body of the DESIGN md |
| `showcasehtml` | text NOT NULL | ~25 KB per row |
| `fontstack` | varchar(255) NOT NULL | resolved CSS font stack |
| `fontimporturl` | varchar(500) | Google Fonts href from the showcase, or null |
| `sortorder` | integer NOT NULL | catalog ordering |
| `createdat` / `updatedat` | timestamp NOT NULL | defaults now |

Approximately 1.9 MB across 50 rows, dominated by `showcasehtml`. Every read path other than the showcase endpoint selects explicit columns.

**Altered tables `themetemplates` and `projectthemes`** — the same two nullable additions to each, no backfill and no behaviour change for existing rows:

| Column | Type | Notes |
|--------|------|-------|
| `tokens` | jsonb `$type<DesignSystemTokens>` | the rich set, copied at pick time onto the template and again at apply time onto the project theme; null for looks not sourced from the catalog |
| `designsystemslug` | varchar(80) | provenance; null when hand-built or URL-derived |

Both tiers are required because the artifact chain has two hops and `execute` reads the **project** tier:

```text
designsystems  →(pick, POST /themes/templates)→  themetemplates
               →(snapshot, POST .../theme/apply-template)→  projectthemes
               →(POST .../theme/execute)→  downloaded bundle
```

Omitting the `projectthemes` columns is the single most likely way to ship this feature with the controls silently missing — the UI would look complete and the bundle would quietly fall back to colour-only output.

**Migrations** — `0057_scope114_design_systems.sql` (create the catalog table) and `0058_scope114_rich_tokens.sql` (add `tokens` + `designsystemslug` to **both** `themetemplates` and `projectthemes`), both in `e:\AI_Development\wxperts\wxKanban\src\db\migrations`. Applied to the single shared `wxkanban` RDS instance that both the app and the hosted MCP use.

**Source data** — `marketing/AIBM-Design-Systems-Pack/` is a **dev-only ingest input**. After seeding, the database is the source of truth; production never reads the folder.

---

## API Routes

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/design-systems` | authenticated member | List the catalog. Explicit column selection — excludes `showcasehtml`, `analysis`, `sourcebrand`. Supports `?mode=`, `?tag=`, `?q=` |
| GET | `/api/design-systems/:slug` | authenticated member | One entry including `analysis`, still excluding `showcasehtml` and `sourcebrand` |
| GET | `/api/design-systems/:slug/showcase` | authenticated member | The stored showcase HTML, `Content-Type: text/html`, for the sandboxed preview iframe |
| POST | `/api/themes/templates` | any member (existing route) | Extended to accept `designsystemslug`, copying the catalog entry's `theme` and `tokens` into the new company-owned row |
| POST | `/api/projects/:id/theme/apply-template` | any member (existing route) | Extended to select and carry `tokens` + `designsystemslug` from the template onto `projectthemes` — in both the insert values and the `onConflictDoUpdate` set clause |
| PUT | `/api/themes/templates/:id` | any member (existing route) | Must preserve `tokens` + `designsystemslug` when a user saves edits to a catalog-sourced profile, rather than dropping columns it does not send |
| POST | `/api/projects/:id/theme/execute` | ADMIN (existing route) | Extended to emit the control files, extended `theme.css`, `tailwind.theme.ts` and `DESIGN.md` when the resolved theme carries `tokens`; falls back to today's colour-only bundle when it does not |

The catalog is global and read-only, so no tenant predicate applies to the three GET routes — which is precisely why the `sourcebrand` exclusion needs a contract test rather than a convention.

---

## Frontend Components

| Component | File | Role |
|-----------|------|------|
| `DesignSystemCatalog` | `src/client/components/Themes/DesignSystemCatalog.tsx` | The Catalog tab body — filter row, card grid, empty and loading states |
| `DesignSystemCard` | `src/client/components/Themes/DesignSystemCard.tsx` | One entry: swatch strip from the mapped theme, name, description, mode badge, font and radius chips, approximation badge, Preview and Use actions |
| `DesignSystemShowcaseDialog` | `src/client/components/Themes/DesignSystemShowcaseDialog.tsx` | Sandboxed iframe preview of the stored showcase |
| `UseDesignSystemDialog` | `src/client/components/Themes/UseDesignSystemDialog.tsx` | Name the copy, then create the `themetemplates` row and hand focus to Look & Chrome |
| `ThemeStudioPage` | `src/client/pages/ThemeStudioPage.tsx` | **Modified** — third tab registered; on successful pick, selects the new profile in the rail and switches tabs |

All five follow `_wxAI/rules/shadcn.md` and use shadcn components via the shadcn-ui MCP.

---

## Integration Context

This scope is almost entirely **wiring plus one new table**, and it must align with four shipped surfaces rather than reinvent them:

- **SCOPE-062** owns `ProjectTheme`, `renderThemeCss`, the preset registry, and the `contrastRatio` / `themeContrastReport` / `themePassesAA` AA machinery. Synthesis reuses that machinery rather than adding a second contrast implementation, and `ProjectTheme`'s shape is not touched.
- **SCOPE-106** owns `themetemplates`, `BusinessChrome`, and the chrome renderers. The pick path writes an ordinary `themetemplates` row, so everything downstream — apply, edit, execute — is already built. The control renderers copy the semantic-class discipline that `renderHeaderComponent` established.
- **SCOPE-107** owns `themeblocks` and the Block Composer. Untouched; a catalog-sourced template simply starts with `blocks` null.
- **Theme Studio Phase 1** established build-centrally-at-`/themes`, choose-per-project-by-snapshot. The Catalog is a third tab in that page and a third source feeding the same profiles gallery — no new nav item, and the copy-on-pick rule is the same snapshot rule Phase 1 locked.

The one genuinely new architectural idea is the **global, system-owned table**: every other theme table in the codebase is tenant-scoped, so `designsystems` is the first row set that is deliberately shared across companies. Reviewers should read the absent `companyid` as intentional, not as a missed tenant predicate.

---

## Open Questions

1. **Should `marketing/AIBM-Design-Systems-Pack/` be committed?** It is currently untracked. Committing it makes re-seeds reproducible and lets CI run the 50-system parser test; leaving it out keeps ~1.8 MB of third-party-analysing content out of the repo, which matters given that kit sync mirrors the filesystem rather than git. Recommendation: commit it, and confirm it is excluded from every kit allowlist.
2. **How ugly is too ugly for a synthesized dark mode?** Warm off-white canvases (`#F6F5E8`, `#faf9f5`) invert to muddy browns. The badge plus Studio editability is the accepted mitigation, but if more than a handful land unusable it may be worth hand-authoring dark counterparts for the worst offenders as curated data rather than improving the algorithm.
3. ~~**Do the 10 dark-native systems need their light counterpart at all?**~~ **RESOLVED 2026-07-30 — yes, synthesize a light version for all 10.** The concern was that a system whose identity is darkness might be better served by declining. Reviewing the actual output settled it: all 10 produce a genuine light mode (backgrounds 97–100% lightness, near-black foregrounds) and **the brand hue survives in every one** — the electric indigo stays indigo at h=233.8, the acid lime stays lime at h=72. Declining would leave the customer's dark-mode toggle inert on a fifth of the catalog, which is the failure this scope exists to avoid. No code change: this is what the pipeline already does.
4. **Should the catalog be reachable during project creation?** `CreateProjectModal` already hosts a Theme step, and picking a coherent system is most valuable at the moment of creation. Deliberately deferred here to keep this scope to one surface, but it is the obvious follow-on and worth sequencing explicitly.
5. **Is ≥5 the right threshold for emitting a control extra as a variant?** The scope commits to that default, which admits `button-dark` (19 systems), `button-pill` (11) and `button-outline` (6) while leaving single-occurrence entries documented but not generated. The number is a judgement call, not a derived one — a lower threshold produces richer bundles and more noise, a higher one loses `button-outline`.

---

## Amendment A — Apply a curated system directly to one application

**Added 2026-07-30, after SPEC-116 T001–T011 shipped. Implemented; not yet covered by the test suite.**

### What changed

The base scope routes every pick through the company profile gallery: browse the catalog in the Theme Studio, name a copy, and that copy becomes a `themetemplates` row which is then applied to projects. Amendment A adds a **second, shorter path** — the project's own Theme tab can browse the same catalog and apply a system **straight to that project and app type**, writing nothing to the gallery.

### Why

The two-step path is right when a look is meant to be *reused*. It is friction when someone is theming a single application. Every experiment would leave a permanent company-wide profile behind, and the gallery would silently fill with one-off names nobody chose to keep — the same "quiet clutter" failure the snapshot rule was designed to avoid at the project tier.

Nothing is lost by taking the short path. The project records `designsystemslug` exactly as the long path does, so the look remains fully identifiable, and the same catalog entry can be picked into a reusable profile from the Studio at any later point if it turns out to be worth keeping.

### Decisions

| Element | Value |
|---------|-------|
| **Where** | The existing project Theme tab, behind a `Company profiles` / `Design system catalog` switch |
| **Scope of an apply** | Exactly one `(project, apptype)` pair — the tab is already scoped that way by its app-type selector |
| **Gallery side effects** | **None.** No `themetemplates` row is created, updated or read |
| **Source of truth for the look** | Read server-side from the `designsystems` row, never accepted from the client |
| **Chrome** | **Untouched.** Logo, app name and footer are the customer's own and must survive a change of look |
| **Naming step** | Skipped — there is no profile to name |
| **UI reuse** | `DesignSystemCatalog` gains a `variant` prop rather than being duplicated, so filters, preview, the full-page link and the native/approximated labelling all carry over |

### API

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/projects/:id/theme/apply-design-system` | any member, tenant-isolated via `projectInCompany` | Apply a catalog entry to one `(project, apptype)`. Body `{ appType, designsystemslug }`. Copies `theme` + `tokens` + `designsystemslug` from the `designsystems` row |

The rich token set is written on **both** the insert and the `onConflictDoUpdate` path, for the same reason the base scope insists on it in `apply-template`: re-applying over an existing theme takes the update branch, and a project left carrying a previous system's tokens would generate control files that do not match the look on screen.

### Frontend

| Component | Change |
|-----------|--------|
| `ThemeTabView` | **Modified** — source switch, `applyDesignSystem`, and `appliedSlug` derived from `theme.sourceRef` (which ingest already stores) so the live look is marked without a second request |
| `DesignSystemCatalog` | **Modified** — `variant`, `onApply`, `appliedSlug` props; naming dialog mounted only in `profile` mode; apply failures shown above the grid rather than replacing it, so one bad click cannot blank the catalog |
| `DesignSystemCard` | **Modified** — `actionLabel` and `applied` props |

### Verified

Against the live database: apply returns 200 and writes `designsystemslug` plus 6 token groups and 7 control specs; re-applying a *different* system switches both, proving the update branch carries them; 0 catalog-sourced rows appear in `themetemplates`, confirming the gallery is untouched. Confirmed working in the browser.

### Out of scope for this amendment

- Promoting a project's directly-applied look back into a company profile. The data supports it (`designsystemslug` is recorded); no UI offers it.
- Test coverage. SPEC-116's suite does not exercise this route or the `variant="project"` path — tracked as SPEC-116 T012 below.

---

## Notes

- The scope aligns with the educational mission: a customer who cannot yet design a system gets a professionally coherent one *and* the prose analysis explaining why it works, so the pick is a teaching moment rather than a black box.
- No AI provider is involved anywhere in this scope, which keeps it immune to the `LLM_PROVIDER` fragility that has bitten SCOPE-106's derivation path.
- Fence convention applies: all new top-level declarations must be authored through `wxkanban-agent implement 114/Tnn` so fences are correct from the start, rather than hand-authored and retro-fenced.
- **Likely fan-out at `createSpecs`:** this scope has a clean seam between the data half (rich model, catalog table, both migrations, parser, mapping, synthesis, curated name map, seed script) and the surface half (Catalog tab and its four components, the three GET routes, the carry-across route edits, and the extended bundle renderers). Expect roughly two implementation specs at the next global SPEC numbers rather than a single `SPEC-114`, per the numbering convention in CLAUDE.md — the data half is independently testable and must land first, since the surface half has nothing to render until the catalog is seeded.
