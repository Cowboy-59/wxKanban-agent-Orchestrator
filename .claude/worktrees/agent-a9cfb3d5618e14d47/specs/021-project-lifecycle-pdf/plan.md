# Plan 021: Per-Project Lifecycle PDF

**Status**: `draft`
**Spec**: `specs/021-project-lifecycle-pdf/spec.md`
**Created**: 2026-04-13

---

## Implementation Phases

### Phase A — Schema + Service (FR-001, FR-004)

1. Extend [src/db/schema/projectdocuments.ts](../../src/db/schema/projectdocuments.ts):
   - Add `pdfcontent: customType bytea` (Drizzle `customType` for `bytea`)
   - Add `pdfgeneratedat: timestamp('pdfgeneratedat', { withTimezone: true })`
2. Run `npm run db:generate` to produce migration.
3. Add `upsertDocumentWithPdf()` to [src/server/services/ProjectDocumentService.ts](../../src/server/services/ProjectDocumentService.ts). Mirrors `upsertDocument` but also writes `pdfcontent` + `pdfgeneratedat`.

### Phase B — Lifecycle Markdown Generator

1. New module `src/server/services/ProjectLifecycleGenerator.ts`:
   - `generateMarkdown(projectid): Promise<string>` — queries project + its specs + scopes + phase counts, returns markdown conforming to the Mermaid conventions in `CLAUDE.md` (pie + bar charts).
   - Writes to `specs/projects/<projectid>/projectlifecycle.md`.

### Phase C — Puppeteer PDF Renderer

1. `npm install puppeteer` (regular dep, per NFR-004).
2. New module `src/server/services/MarkdownPdfRenderer.ts`:
   - `renderToPdf(markdown: string): Promise<Buffer>` — launches Puppeteer, loads an HTML template that includes marked.js + mermaid@10 (bundled/CDN), runs `mermaid.run()`, calls `page.pdf({ format: 'Letter', printBackground: true })`.

### Phase D — HTTP routes (FR-005, FR-006)

1. New route file `src/server/routes/projectLifecycle.ts`:
   - `GET /projects/:id/lifecycle` — auth-check same company → fetch `pdfcontent` from `projectdocuments` → respond inline `application/pdf`.
   - `POST /api/admin/projects/:id/lifecycle/regenerate` — ADMIN only → invoke generator + renderer + `upsertDocumentWithPdf`.
2. Mount in [src/server/index.ts](../../src/server/index.ts).

### Phase E — CLI + Backfill (FR-007)

1. New script `scripts/generate-project-lifecycle.ts`:
   - `--project <id>` → single project
   - `--all` → iterate `companyprojects` rows
2. Add `lifecycle:generate` to `package.json` scripts.

### Phase F — Dashboard wiring (FR-008)

- No client change needed: `ReportLinkCard` already links `/projects/:id/lifecycle` ([src/client/pages/AdminDashboard.tsx:326](../../src/client/pages/AdminDashboard.tsx#L326)); the new server route will serve PDF inline. The existing `/api/admin/doc-status` already tracks `projectLifecycle`.

---

## Sequencing Gates

- **Gate 1 (after Phase A)**: Migration applied cleanly; `upsertDocumentWithPdf` unit-tested.
- **Gate 2 (after Phase C)**: Manual verification — render a sample markdown with a pie + xychart-beta to PDF, confirm Mermaid rendered.
- **Gate 3 (after Phase D)**: Hit `/projects/:id/lifecycle` in a browser; native PDF viewer shows printable doc.
- **Gate 4 (after Phase E)**: Run `npm run lifecycle:generate -- --all`; every project in DB has a row with `pdfgeneratedat IS NOT NULL`.

---

## Known Risks / Deferred

- Auto-regeneration on spec writes is **out of scope**; explicit call only (per user decision 2026-04-13).
- The global `specs/projectlifecycle.md` and `/admin/lifecycle` page are **not touched**.
- Large Puppeteer install size accepted as cost of real server-side rendering.
