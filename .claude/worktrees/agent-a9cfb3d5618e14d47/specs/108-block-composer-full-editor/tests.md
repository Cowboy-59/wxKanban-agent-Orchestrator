# Tests: Theme Header & Footer Designer (Spec 108)

**Framework**: Vitest (unit — the priority) + live visual pass in Theme Studio → Layout by the operator.

## Unit (pure, single-source — the priority)

- **seedChromeTrees** (FR-007): a chrome with `logoRef`/`appName` yields a default header tree (logo + name); `footerLine` yields a default footer tree; a chrome with none yields empty header/footer; when `headerNodes`/`footerNodes` already exist they are returned unchanged (no clobber).
- **Snap invariant** (FR-002): the region model exposes exactly one header and one footer; operations that would create a second, or a free-floating header/footer, are rejected/coerced.
- **Emit parity** (FR-006): `renderBlockCode` over `headerNodes` produces a `Header` component and over `footerNodes` a `Footer` component; the rendered structure matches the `BlockRenderer` preview arm for the same tree (0 drift); an empty tree emits a no-op stub, not broken code.
- **Reused ops still hold inside regions** (FR-003): `moveNodeTo` / `clampDim` behave identically when the container is a header/footer region (regression guard on the lifted mechanics).

Add `tests/unit/blockModel108HeaderFooter.test.ts` (seed + snap + emit) alongside the existing `blockModel108*` tests.

## Integration / persistence

- **Round-trip** (FR-005): a theme saved with designed `headerNodes`/`footerNodes` reloads identically; the same survives `TemplateGallery` save/apply. (Server contract tests need a DB — run where available.)

## Success-Metric verification

1. **SM1** — build a header + footer using only the Layout-tab designer; 0 console errors; grep the built bundle for 0 references to the removed flat-canvas/form-tab surfaces.
2. **SM2** — compose a header (logo + nav links + CTA) and a footer (columns + links + copyright); reorder/resize by drag; tree↔preview in sync; exactly one header (top) + one footer (bottom).
3. **SM3** — Execute; assert emitted `Header.tsx`/`Footer.tsx` match the live preview (0 drift) and each imports + renders in a fresh component with 0 errors.
4. **SM4** — open a set of pre-change themes; each opens with a seeded header/footer, no breakage, 0 DDL applied.
5. **SM5** — save then reload a theme; `headerNodes`/`footerNodes` restore identically, including through company-template apply.

## Verification gates

- `npm run build:client` clean; new Tailwind classes present in `dist/client/assets/*.css` (T012).
- `auditfences` clean on all `[SCOPE 108 / T00x]` (T012).
- Live visual pass in Theme Studio → Layout by the operator (design header/footer → save → Execute → check emitted files).
