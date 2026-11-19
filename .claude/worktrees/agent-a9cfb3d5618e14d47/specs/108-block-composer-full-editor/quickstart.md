# Quickstart: Theme Header & Footer Designer (Spec 108)

## What this delivers

Retargets the 107/108 Block Composer: removes the flat editing canvas and makes the live themed preview the one editing surface, driven by a structural tree. Lets a theme author **design a header and footer** by dragging elements in, and emits them as real `Header.tsx`/`Footer.tsx` on Execute so a later app build can reference them. Body-content building is parked. Additive, zero-migration.

## Where it lives

- UI: Theme Studio → **Layout** tab (`ThemeStudioPage` / `ThemeStudio.tsx`) — the tree + live-preview designer, full-width. The old "Header & Footer" form tab is gone.
- Model/seed: `src/shared/theme-template.ts` (`BusinessChrome` + `seedChromeTrees`). Emitter: `src/shared/block-model.ts` (`renderBlockCode` → Header/Footer). Preview surface: `ThemePreview.tsx`. Renderer: `BlockRenderer.tsx`.
- Server: `projectTheme.ts` / `themeBlocks.ts` (carry the two arrays), the Execute/download emit site.

## Try it end-to-end (operator, live)

1. `npm run dev` (server + client HMR). Open Theme Studio → **Layout**.
2. **Design:** drag a logo + heading + nav-link row + CTA into the **Header** branch; drag columns + links + a copyright line into the **Footer** branch. Reorder by drag; select an element to edit props / resize. The live preview updates in the real theme — header pinned top, footer pinned bottom.
3. **Persist:** save the theme; reload; confirm the header/footer come back exactly.
4. **Export:** Execute/download; confirm the package includes `Header.tsx` + `Footer.tsx` matching the preview, importable into a fresh component.
5. **Back-compat:** open a pre-change theme; confirm a seeded header (logo+name) + footer (footer line) appear, editable.

## Build & checks

- `npm run build:client` — must be clean; confirm new Tailwind classes appear in `dist/client/assets/*.css`; grep the bundle for 0 references to the removed flat-canvas/form-tab surfaces.
- `auditfences` (filter to your files) — clean on all `[SCOPE 108 / T00x]`.
- Vitest: `seedChromeTrees`, the snap invariant, and the Header/Footer emit parity.

## Notes

- Snap: exactly one header (top), one footer (bottom) — not free placement.
- The old flat-canvas `BlockComposer` shell is deleted outright after its reusable bits are lifted into the designer.
- No push until the operator says push.
