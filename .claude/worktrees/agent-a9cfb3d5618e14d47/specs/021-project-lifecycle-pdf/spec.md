# Spec 021: Per-Project Lifecycle PDF

**Spec Number**: 021
**Status**: `draft`
**Created**: 2026-04-13
**Depends On**: 002-admin-Management (AdminDashboard lifecycle link), existing `projectdocuments` table, `ProjectDocumentService.upsertDocument`

---

## Overview

Generate a per-project `projectlifecycle.md` file (with Mermaid charts) for each `companyprojects` row, render it to PDF via Puppeteer, store the PDF bytes in the database, and serve that PDF inline when the user clicks the **Project Lifecycle** link in the Admin Dashboard. The PDF renders in the browser's native viewer with built-in print capability.

### Core Design

| Element | Value |
|---------|-------|
| **Primary Actor** | Admin / Project owner |
| **Trigger** | Explicit call (API endpoint + CLI script). Not auto-triggered by file watchers. |
| **Storage** | `projectdocuments.pdfcontent` (bytea) + `pdfgeneratedat` (timestamptz) |
| **Scope per project** | `specs/projects/<projectid>/projectlifecycle.md` |
| **Renderer** | Puppeteer (headless Chromium) rendering markdown + client-side Mermaid to PDF |
| **Out of scope** | Auto-regeneration on every spec write (future), signed/versioned PDFs, email delivery |

---

## User Scenarios

### US1 — Admin views a project's lifecycle PDF

1. Admin opens the Admin Dashboard
2. Admin clicks **Project Lifecycle** on a project card
3. Browser navigates to `/projects/:id/lifecycle` which serves `application/pdf` inline
4. Native PDF viewer renders the document; Print button is available

**Expected outcome**: The PDF is rendered from the most recent stored `pdfcontent`. If none exists yet, the link badge reads "not created" (existing behavior via `/api/admin/doc-status`).

---

### US2 — Regenerate a project's lifecycle document

1. Developer/admin runs `npm run lifecycle:generate -- --project <projectid>` (or calls `POST /api/admin/projects/:id/lifecycle/regenerate`)
2. System reads the project, its specs, and its scopes to produce markdown
3. System writes `specs/projects/<projectid>/projectlifecycle.md`
4. System renders the markdown to PDF via Puppeteer (Mermaid executed in headless Chrome)
5. System upserts `projectdocuments` with `doctype='ProjectLifecycle'`, full markdown in `content`, PDF bytes in `pdfcontent`, timestamp in `pdfgeneratedat`

**Expected outcome**: `projectdocuments` row reflects the latest markdown + PDF for that project.

---

### US3 — Backfill all projects

1. Developer runs `npm run lifecycle:generate -- --all`
2. Script iterates every row in `companyprojects` and performs US2 for each

**Expected outcome**: Every existing project has a lifecycle markdown + PDF available.

---

## Functional Requirements

- **FR-001**: Schema extends `projectdocuments` with `pdfcontent bytea NULL` and `pdfgeneratedat timestamptz NULL`.
- **FR-002**: A generator module produces per-project lifecycle markdown at `specs/projects/<projectid>/projectlifecycle.md`. The content follows the same Mermaid conventions as the global `specs/projectlifecycle.md` (pie chart + xychart-beta bar chart for phase distribution).
- **FR-003**: A Puppeteer-based renderer converts the markdown to PDF. Mermaid is executed client-side inside the headless page (same mermaid@10 lib already in `package.json`).
- **FR-004**: `ProjectDocumentService` gains a companion method `upsertDocumentWithPdf(projectid, doctype, title, content, pdfBytes, createdbyid)` that upserts both the markdown and binary PDF in one call.
- **FR-005**: `GET /projects/:id/lifecycle` (server route, authenticated) returns the PDF bytes inline with `Content-Type: application/pdf` and `Content-Disposition: inline; filename="lifecycle-<projectid>.pdf"`. Returns 404 if no PDF is stored.
- **FR-006**: `POST /api/admin/projects/:id/lifecycle/regenerate` (ADMIN only) regenerates markdown + PDF for one project.
- **FR-007**: CLI script `scripts/generate-project-lifecycle.ts` accepts `--project <id>` or `--all` and regenerates accordingly.
- **FR-008**: `ReportLinkCard` on the Admin Dashboard continues to display "not created" when `/api/admin/doc-status.projects[id].projectLifecycle` is null. No change to that contract.
- **FR-009**: Existing global `/admin/lifecycle` route and global `specs/projectlifecycle.md` remain untouched by this spec.

---

## Non-Functional Requirements

- **NFR-001**: Puppeteer runs headless Chromium; disable sandbox only if required by environment. PDF generation < 10 seconds per project.
- **NFR-002**: PDF bytes stored directly in Postgres bytea. No filesystem caching of PDFs.
- **NFR-003**: All endpoints require JWT auth. Non-admin users only see lifecycle PDFs for projects in their own company.
- **NFR-004**: Puppeteer installed as a regular dep (not dev), because the regenerate route runs in production.

---

## Open Risks

- Puppeteer adds ~170MB on install. Deployment size grows accordingly.
- Windows dev environment needs the bundled Chromium; verify `puppeteer` (not `puppeteer-core`) is used.

---

## Amendment A — Database ER Diagram report (2026-06-18)

Adds a second on-demand, PDF-rendered report to this spec's family: a **platform-wide Database
Entity-Relationship Diagram**, generated from **live Postgres introspection** at generate time and
surfaced as a **link on each project card in the dashboard**. It reuses this spec's Puppeteer
renderer and ReportLinkCard pattern, but — because the schema is identical for every tenant — it is a
**single global document**, not a per-project one.

### Core Design

| Element | Value |
|---------|-------|
| **Primary Actor** | Admin / SysAdmin |
| **Trigger** | Explicit (regenerate endpoint + CLI). Schema changes rarely; no auto-trigger. |
| **Source of truth** | Live Postgres introspection (`information_schema` / `pg_catalog`) — reflects the deployed schema (~101 tables, ~123 FKs at time of writing). |
| **Output** | Markdown with Mermaid `erDiagram`s — one high-level overview plus ~8 domain sub-diagrams (auth/tenancy, projects/tasks, lifecycle/specs, time/billing, compliance/audit, consulting/engagements, marketing, kit/MCP). |
| **Storage** | Global `wxkanbandocuments` table (the master/generated-document store; `projectdocuments.projectid` is NOT NULL so it can't host a platform doc), `documenttype='erdiagram'`, markdown in `filecontent`, PDF in new `pdfcontent` column. |
| **Renderer** | Reuse the Puppeteer renderer from FR-003. |
| **Surface** | A `ReportLinkCard` ("Entity Diagram") on each dashboard project card, pointing at the one global doc. |
| **Out of scope** | Per-tenant/customer schemas, diff-from-last-version, auto-regenerate on migration. |

### User Scenarios

**US4 — View the ER diagram.** Admin clicks **Entity Diagram** on any project card → browser opens
the global ERD PDF inline (native viewer + print).

**US5 — Regenerate the ER diagram.** Admin runs the CLI (or calls the regenerate endpoint) → system
introspects the live schema, builds the grouped Mermaid markdown, renders PDF, upserts the global doc.

### Functional Requirements

- **FR-010**: A schema-introspection module reads tables, columns, primary keys, and foreign-key edges
  from `information_schema`/`pg_catalog` and emits Mermaid `erDiagram` markdown. Tables are partitioned
  into domain groups (config-driven mapping by table name) so no single diagram exceeds a readable size;
  an overview diagram shows cross-domain FK edges only.
- **FR-011**: The generated markdown is rendered to PDF via the **same** Puppeteer path as FR-003
  (Mermaid executed client-side in headless Chromium).
- **FR-012**: The document is stored as a single global row in `wxkanbandocuments` with
  `documenttype='erdiagram'` (markdown in `filecontent`). `projectdocuments` cannot host it because
  `projectdocuments.projectid` is `NOT NULL` (no platform-level project). Extend `wxkanbandocuments`
  with `pdfcontent bytea NULL` + `pdfgeneratedat timestamptz NULL` (mirroring FR-001) to hold the PDF.
- **FR-013**: `GET /api/admin/database/erdiagram` (authenticated, ADMIN/SYSADMIN) returns the PDF bytes
  inline (`Content-Type: application/pdf`). Returns 404 if not yet generated.
- **FR-014**: `POST /api/admin/database/erdiagram/regenerate` (ADMIN/SYSADMIN) regenerates markdown + PDF.
- **FR-015**: CLI script `scripts/generate-erdiagram.ts` regenerates the global ERD doc.
- **FR-016**: A `ReportLinkCard` titled **Entity Diagram** appears on each dashboard project card,
  linking to `GET /api/admin/database/erdiagram`. Because the doc is global, its "last updated" badge
  reflects the single global doc's timestamp (extend `/api/admin/doc-status` with a top-level
  `databaseErd` field rather than a per-project one).

### Non-Functional Requirements

- **NFR-005**: Introspection is read-only against the live DB and must not lock or block app queries.
- **NFR-006**: Generation (introspect → markdown → PDF) completes < 20 seconds for ~100 tables.
- **NFR-007**: Reuses FR-003's Puppeteer install; no new heavy dependency.
