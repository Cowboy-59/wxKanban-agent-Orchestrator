# Theme Studio Phase 1 — Implementation Plan

> Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. Design:
> `specs/theme-studio/phase1-design.md`.

**Goal:** Promote theme building to a top-level `/themes` Studio page with a switchable
gallery of company theme profiles; make the in-project Theme tab a snapshot picker.

**Architecture:** Reuse the company-scoped `themetemplates` (profiles), `themeblocks`,
`TemplateGallery`, and `apply-template`. Add a profile-content update endpoint, relax the
apply gate, decouple the builder from `projectId` via a `ThemeSource` seam, and add the new
page + nav route. Snapshot model — no schema change.

**Tech Stack:** Express + Drizzle, React 18 + React Router v6, TailwindCSS, Vitest.

## Global Constraints

- TypeScript 100%, no `any`/`@ts-ignore`. Pino logging. Tenant isolation by `req.companyid`.
- No schema change. Snapshot (copy) on pick.
- Server contract tests need a live DB/server (not available in this dev box → they can't run
  locally; verify by `npx tsc` on server + matching the established route patterns exactly).
- Client verified by `npm run build:client`.

---

## Sub-pass 1 — Server: profile-content update + relax apply gate

**Files:** Modify `src/server/routes/themeTemplates.ts`, `src/server/routes/projectTheme.ts`.
Optionally add `tests/contract/theme-templates.test.ts` (runs only with a live server).

- [ ] **Step 1: Add `PUT /api/themes/templates/:id`** to `themeTemplates.ts` (any member,
  tenant-checked). Insert after the POST handler:

```ts
// PUT /api/themes/templates/:id — update a profile's content (any member, tenant-scoped).
router.put(
  "/api/themes/templates/:id",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const companyId = req.companyid;
    if (!companyId) return res.status(401).json({ error: "Authentication required" });
    const id = String(req.params.id);
    const parsed = saveTemplateSchema.partial({ name: true }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid template payload", details: parsed.error.issues });
    }
    try {
      const set: Record<string, unknown> = {
        theme: parsed.data.theme as ProjectTheme,
        chrome: parsed.data.chrome as BusinessChrome,
        blocks: (parsed.data.blocks as NamedBlock[] | undefined) ?? null,
        updatedat: new Date(),
      };
      if (parsed.data.name) set.name = parsed.data.name;
      const [row] = await db
        .update(themetemplates)
        .set(set)
        .where(and(eq(themetemplates.id, id), eq(themetemplates.companyid, companyId)))
        .returning({ id: themetemplates.id, name: themetemplates.name });
      if (!row) return res.status(404).json({ error: "Template not found" });
      return res.json({ template: row });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return res.status(409).json({ error: "A template with that name already exists" });
      }
      logger.error({ err, companyId, id }, "Failed to update theme template");
      return res.status(500).json({ error: "Failed to update template" });
    }
  },
);
```

- [ ] **Step 2: Relax `apply-template`** — in `projectTheme.ts`, remove `requireAdmin` from
  the `POST /api/projects/:id/theme/apply-template` chain (keep `authenticateToken`,
  `requireAuth`, and the `projectInCompany`/`companyid` tenant checks). Update the SCOPE-106
  comment noting members may now apply.

- [ ] **Step 3: Verify** — `npx tsc --noEmit -p tsconfig.json` (server files clean).

- [ ] **Step 4: Commit** — `git commit -m "feat(theme-studio): PUT template content + members can apply-template"`.

---

## Sub-pass 2 — Studio page shell + profiles gallery (the usable milestone)

**Files:** Create `src/client/pages/ThemeStudioPage.tsx`; modify `src/client/App.tsx`
(route), `src/client/components/layout/AppShell.tsx` (nav item + i18n label).

- [ ] **Step 1: Nav item** — add to `ADMIN_NAV` and `TEAM_NAV` in `AppShell.tsx`:
  `{ label: "nav.themeStudio", href: "/themes", icon: Palette }` (import the Palette icon if
  not present). Add the `nav.themeStudio` i18n key ("Theme Studio") to the locale files the
  other nav labels use.

- [ ] **Step 2: Route** — in `App.tsx`, add inside the protected `<Routes>`:
  `<Route path="/themes" element={<ProtectedRoute><ThemeStudioPage /></ProtectedRoute>} />`
  and import `ThemeStudioPage`.

- [ ] **Step 3: `ThemeStudioPage`** — profiles rail + builder area. The rail lists
  `GET /api/themes/templates`, with **New**, select (highlight), rename (`PATCH`), delete
  (`DELETE`). Selecting sets `selectedId`. Builder area is a placeholder in this sub-pass
  ("Select or create a profile to edit") — wired in sub-pass 3.

```tsx
// Fetch pattern mirrors BlockComposer.loadLibrary (Bearer token + credentials).
function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("wxkanban_token");
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}
```

- [ ] **Step 4: Verify** — `npm run build:client` → `✓ built`. Manual: nav shows "Theme
  Studio"; page lists profiles; create/rename/delete work.

- [ ] **Step 5: Commit** — `git commit -m "feat(theme-studio): /themes page + profiles gallery"`.

---

## Sub-pass 3 — Decouple the builder (ThemeSource seam)

**Files:** Modify `ThemeStudio.tsx`, `BlockComposer.tsx` (already project-agnostic — takes
`theme`), `ThemeTabView.tsx`, `ThemeStudioPage.tsx`. Add `src/client/components/Projects/themeSource.ts`.

- [ ] **Step 1:** Define the seam:

```ts
export interface ThemeSource {
  load(): Promise<{ theme: ProjectTheme; chrome: BusinessChrome; blocks: NamedBlock[]; tier: string; canEdit: boolean }>;
  save(payload: { theme: ProjectTheme; chrome: BusinessChrome; blocks: NamedBlock[] }): Promise<void>;
}
export function projectThemeSource(projectId: string, appType: string): ThemeSource { /* GET/PUT /api/projects/:id/theme */ }
export function templateThemeSource(templateId: string): ThemeSource { /* GET list→find, PUT /api/themes/templates/:id */ }
```

- [ ] **Step 2:** Refactor `ThemeStudio`/`ThemeTabView` to take a `ThemeSource` (or theme +
  onSave) instead of calling project endpoints directly. `BlockComposer` already receives
  `theme`/`onAddBlock`; give it an `onSaveBlocks` that routes through the source.

- [ ] **Step 3:** In `ThemeStudioPage`, when a profile is selected, mount the builder with
  `templateThemeSource(selectedId)`; Save persists via `PUT templates/:id`.

- [ ] **Step 4: Verify** — `npm run build:client`. Manual: edit a profile in the Studio, save,
  reload → persisted.

- [ ] **Step 5: Commit** — `git commit -m "feat(theme-studio): decouple builder via ThemeSource"`.

---

## Sub-pass 4 — In-project Theme tab → picker

**Files:** Modify `ThemeTabView.tsx` (and its mount in `ProjectWorkspacePage.tsx` if needed).

- [ ] **Step 1:** Replace the builder body with a `TemplateGallery` grid whose apply calls
  `POST /api/projects/:id/theme/apply-template` (snapshot). Show the project's current
  applied look as read-only context. Keep the **Execute to code** action.

- [ ] **Step 2:** Point the in-project "build/edit" affordances to the new `/themes` page
  (link/button "Build themes in Theme Studio").

- [ ] **Step 3: Verify** — `npm run build:client`. Manual: pick a profile in a project →
  applied; Execute produces the code; building is only in the Studio now.

- [ ] **Step 4: Commit** — `git commit -m "feat(theme-studio): in-project Theme tab becomes a picker"`.

## Self-Review

- Snapshot model → apply-template unchanged behavior (copy); no schema change. ✓
- All-users → apply-template gate relaxed (sub-pass 1); Studio nav in both nav arrays. ✓
- Switchable gallery → profiles rail (sub-pass 2) + templateThemeSource load/save (3). ✓
- Project picker → sub-pass 4. ✓
- Builder reuse → ThemeSource seam avoids duplicating ThemeStudio/BlockComposer. ✓
- **Placeholder scan:** builder placeholder in sub-pass 2 is intentional, wired in 3. Server
  tests noted as DB-gated. **Type consistency:** `ThemeSource.load/save`, `templateThemeSource`,
  `projectThemeSource` names consistent across sub-passes 3-4.

## Non-goals (Phase 1)

Live-link profiles, per-user themes, admin default-page consolidation, versioning.
