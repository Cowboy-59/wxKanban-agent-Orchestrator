# Theme Studio — Phase 1 (design)

**Date**: 2026-07-21
**Feature**: Promote theme *development* to a top-level page with a switchable gallery of
theme profiles; make the in-project Theme tab a *picker* that applies a profile.
**Status**: designed (pre-implementation)
**Touches**: SCOPE-062 (Project Theme), SCOPE-106 (Borrow-a-Look templates), SCOPE-107
(Block Composer). No new umbrella scope; extends existing theme surfaces.

## Problem

Theme building currently lives *inside* each project (the project's "Theme" tab →
`ThemeStudio` + `BlockComposer`). Andy wants the responsibilities to **switch**:
- Build themes **centrally** on a top-level page, with a **gallery of all theme profiles**
  you've made and the ability to **switch** between them to edit.
- In a project, **just pick** one of those profiles to apply.

## Decisions (Andy, 2026-07-21)

- **Snapshot on pick** — picking a profile *copies* its look onto the project (today's
  `apply-template` behavior). Later edits to a profile do **not** change already-applied
  projects; re-pick to update. **No schema change.**
- **New all-users Theme Studio page** — a brand-new top-level page (`/themes`) any member
  can open and build in (not the existing admin-only `/admin/theme-profiles`, which manages
  the company *default* look and is left untouched this phase).
- **Ownership is company-wide** (inherent: `themetemplates`/`themeblocks` are
  `companyid`-scoped) — a shared company library everyone picks from.

## What already exists (so this is mostly wiring)

- `themetemplates` (COMPANY-scoped, `UNIQUE(companyid, name)`) — the named theme gallery.
  These **are** the "theme profiles". CRUD: `GET/POST /api/themes/templates`,
  `PATCH/DELETE /api/themes/templates/:id` (rename/delete are ADMIN today).
- `themeblocks` (COMPANY-scoped) — Block Library, already shared.
- `POST /api/projects/:id/theme/apply-template` — snapshot-copies a template → project
  (ADMIN today).
- `TemplateGallery.tsx` — lists templates with an `onApply(theme, chrome)` callback; reused
  for both surfaces.
- Left nav lives in `AppShell.tsx` (`ADMIN_NAV`/`TEAM_NAV`); client routes in `App.tsx`.
- `ThemeStudio` + `BlockComposer` are the builder; `ThemeTabView` is the project tab that
  hosts them and loads/saves via `GET/PUT /api/projects/:id/theme`.

## Design

### A. New top-level Theme Studio page (`/themes`)

- New route `/themes` → `ThemeStudioPage` (client page). New nav item **"Theme Studio"**
  added to `ADMIN_NAV` **and** `TEAM_NAV` (all users), Palette icon.
- Layout: a **profiles rail** (the `themetemplates` gallery) + the **builder** on the right.
  - Rail: list of profiles with **New**, select-to-edit, rename, delete. Selecting one loads
    it into the builder ("switch").
  - Builder: the existing `ThemeStudio` (look & chrome) + `BlockComposer`, operating on the
    **selected profile** (not a project).
- **Save** writes the profile's `{ theme, chrome, blocks }` back to its `themetemplates` row.

### B. Decouple the builder from `projectId`

`ThemeStudio`/`BlockComposer`/`ThemeTabView` currently assume a project. Introduce a small
**editing-context** seam so the same components load/save against either a project OR a
profile:
- A `ThemeSource` prop shape: `{ load(): Promise<{theme,chrome,blocks,tier}>, save(payload):
  Promise<void>, canEdit: boolean }`. The project tab passes a project-backed source; the
  Studio passes a template-backed source. Components stop calling project endpoints directly.
- This is the meatiest change; it keeps the builders reusable and avoids duplicating them.

### C. In-project Theme tab → picker

- `ThemeTabView` becomes a **picker**: a `TemplateGallery` grid; picking a profile calls
  `POST /api/projects/:id/theme/apply-template` (snapshot). Keep **Execute to code** (runs
  on the project's copied theme). Remove the in-project builder entry points.
- Show the project's currently-applied profile/look as read-only context.

### Server gaps to build

1. **Profile-content update** — `PUT /api/themes/templates/:id` updating `{ theme, chrome,
   blocks }` (today's `POST` only *creates* by unique name; editing needs update). Any member,
   tenant-checked by `companyid`.
2. **Relax `apply-template`** from ADMIN-only → any authenticated member of the company (so
   members can pick per-project). Keep tenant isolation.
3. (Rename/delete of profiles may also need relaxing from ADMIN for the all-users Studio —
   flag during implementation; default: keep **delete** ADMIN-gated, allow **create/edit/
   apply** for members, to avoid members destroying shared profiles.)

### Data model

No schema change. Profiles = `themetemplates` rows; projects keep their own `projectthemes`
snapshot via `apply-template`.

## Sub-passes (each committable)

1. **Server**: `PUT /api/themes/templates/:id` (update content) + relax `apply-template`
   gate. TDD.
2. **Studio shell**: `/themes` route + nav item + `ThemeStudioPage` with the profiles gallery
   (list/new/select/rename/delete) — read-only builder placeholder.
3. **Decouple builder**: introduce the `ThemeSource` seam; wire `ThemeStudio`+`BlockComposer`
   to save/load a profile in the Studio.
4. **Project picker**: convert `ThemeTabView` to the `TemplateGallery` picker + apply-template;
   keep Execute.

## Non-goals (Phase 1)

Live-link/propagating profiles (snapshot only), per-user themes, consolidating the admin
`/admin/theme-profiles` default page, cross-company/global theme sharing, versioning of
profiles.

## Testing

- Server: unit/contract tests for the new `PUT templates/:id` (updates content, tenant-
  isolated, rejects cross-company) and the relaxed `apply-template` (member can apply).
- Client: build-verified; manual pass — build a profile in the Studio, switch profiles, then
  pick it in a project and confirm the applied look + Execute output.
