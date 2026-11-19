# Spec 025: Project Overview Builder — AI-Assisted Overview Authoring Surface

**Spec Number**: 025
**Status**: `draft`
**Created**: 2026-04-23
**Depends On**: 024-pending-projects (proposal handoff), 002-Scope (Admin Dashboard), shared Mermaid/PDF pipeline from `specs/projectlifecycle.md`
**Source**: `specs/Project-Scope/025-project-overview-builder.md`

---

## Overview

A full-screen authoring surface where a user builds a project's `projectoverview.md` with AI Business Analyst assistance beside them. Layout: **3/4 width Markdown editor** (live markdown preview; Mermaid kept as raw code blocks, NOT rendered in the editor) + **1/4 width AI discussion pane** on the right. The AI walks the user through a FIXED section template using the same interactive methodology as `/buildscope` — probe → draft → `[A]`pprove / `[C]`hange / `[E]`xplain / `[Add]` → advance.

The document produced is the canonical project definition. It is the shared source of truth for:

- **New proposals** (spec 024 pending-projects)
- **New projects** (consultant/admin-initiated)

It is persisted to BOTH:

- **Filesystem**: `projectoverview.md` at the **repo root** (one per active project, mirroring the `CLAUDE.md` convention — there is only one active project per workspace)
- **Database**: `projectdocuments` row keyed by (`projectid`, `doctype='ProjectOverview'`, `specid=null`)

Mermaid handling is intentionally bifurcated: raw code blocks in the editor (avoids known web-render instability) and fully rendered in PDF export (same Puppeteer pipeline already used by `specs/projectlifecycle.md` printing).

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actors** | Proposer (any user submitting a proposal), any company user with project-edit rights, Consultant |
| **Deferred Actors** | "Customer" role — not yet modeled in wxKanban; out of scope for 025 |
| **Key Value** | One authoring surface replaces two (proposal form + project-setup doc). AI guidance produces a complete overview in minutes using the proven `/buildscope` conversational pattern. Same document, two entry points, zero drift. |
| **Scope Boundary (IN)** | Full-screen editor route; fixed section template; live Markdown preview with raw Mermaid blocks; dual file+DB persistence; launch from "New Proposal" AND "New Project"; PDF export (Mermaid rendered); "Edit" action on proposal list; shared BA persona with `/buildscope` |
| **Scope Boundary (OUT)** | Functional-area detection / candidate-scope flagging; auto-creation of scope stubs; multi-scope splitting; any spec-breakdown work; dedicated "customer" actor role; version history / diff view (deferred) |

---

## User Scenarios & Testing

### US1 — New Proposal Authoring (happy path)

**Actor**: Proposer (any company user or external invitee)

**Scenario**:
1. From Admin Dashboard (or proposal invite link), the proposer clicks **"New Proposal"**.
2. The compact `AddProposalDialog` opens: small fields for Title / Priority / Effort, plus an embedded mini-editor for Description (FR-015). Three entry-mode buttons sit above the description editor: **Interview**, **Paste to analyze**, **Import** — same affordances as the full-screen editor's AI pane, scoped to the dialog's mini-editor.
3. The proposer can either:
   - Type a brief description directly into the mini-editor and submit (lightweight path), OR
   - Use any of the three entry modes — content is mapped section-by-section using `[A]`pprove / `[C]`hange / `[E]`xplain / `[Add]` (FR-013/FR-014/FR-004 same as full screen), OR
   - Click **"Expand to full screen ↗"** to hand off to `/overview/:draftId` for serious authoring (full 3/4 editor + 1/4 AI pane layout).
4. The bound `overviewdrafts` row is created lazily on first edit / paste-analyze / import / expand (FR-015 D4) — never on dialog-open alone, so cancelling produces no DB residue.
5. Whether finishing in the dialog OR full-screen, the proposer clicks **"Submit Proposal"** → an atomic transaction creates the `projectproposals` row AND finalizes the `overviewdrafts` row (status='submitted') with the same content. Proposal enters the spec-024 pending queue for admin review.
6. If full-screen path was used, autosave fires on every approved section write and on ~2s debounced idle; content is persisted to the `projectdocuments` row continuously (file at repo root not written until acceptance per FR-007).

**Expected outcome**: A complete `projectoverview.md` exists and is linked to the submitted proposal. The AI transcript is retained with the draft so later edits can resume with full context.

### US2 — New Project Initiation by Consultant / Admin

**Actor**: Consultant or Company Admin

**Scenario**:
1. From Admin Dashboard, clicks **"New Project"**.
2. Full-screen editor opens with the same layout as US1.
3. The admin picks any entry mode offered by the pane:
   - **Author manually** in the Markdown editor.
   - **Short-prompt draft** — give the AI a one-line description and walk the BA interview (FR-004, FR-005).
   - **Paste to analyze** — paste existing notes, emails, or docs; AI maps them to sections (FR-013).
   - **Import** — upload a file or fetch a GitHub / docs URL; AI walks the section mapping (FR-014).
4. Every approved section autosaves to file + DB. Replace / Merge / Skip is presented when an approved mapping would overwrite existing author content.
5. Admin clicks **"Create Project"** → a project row is created with the overview already attached.

**Expected outcome**: The new project appears on Admin Dashboard and its ProjectOverview `ReportLinkCard` reflects "created" immediately (non-null timestamp from `GET /api/admin/doc-status`).

### US3 — Re-edit an Existing Proposal Overview

**Actor**: Original proposer OR Company Admin

**Scenario**:
1. The proposal list shows a new **"Edit"** action per row.
2. Clicking Edit opens the same full-screen editor, preloaded with the proposal's existing `projectoverview.md` content AND the prior AI conversation transcript for continuity.
3. The user edits markdown directly OR asks the AI to revise a specific section ("tighten the Goals section").
4. Changes autosave to file + DB.
5. User exits; the proposal-list row reflects the updated timestamp.

**Expected outcome**: The proposal in the pending queue shows revised content. No duplicate `projectdocuments` rows are created. A proposer retains edit access until an admin accepts or rejects the proposal.

### US4 — Export Overview to PDF (print-ready)

**Actor**: Any author (admin, consultant, or proposer)

**Scenario**:
1. From the editor toolbar or a proposal-list row menu, the user clicks **"Export PDF"**.
2. Server renders `projectoverview.md` → HTML → PDF (Puppeteer), with Mermaid rendered server-side using the same pipeline as `specs/projectlifecycle.md` printing.
3. Browser downloads the PDF.

**Expected outcome**: Printable PDF matches on-screen content; all Mermaid diagrams render correctly in the PDF.

---

## Functional Requirements

### Editor Surface & Layout

#### FR-001 — Full-Screen Overview Editor Route

The system MUST provide a full-screen editor route that splits the viewport 75/25 (left: Markdown editor, right: AI pane).

**Acceptance Criteria**:
- [ ] Route renders above the Admin Dashboard chrome (true full-screen, not embedded inside the dashboard frame).
- [ ] Split ratio holds across common breakpoints (≥1280px).
- [ ] Browser back button returns the user to the originating list.

#### FR-002 — Markdown Editing with Live Preview (Mermaid raw)

The editor MUST render a Markdown preview live as the user types, EXCEPT Mermaid fenced blocks which remain raw code (unrendered).

**Acceptance Criteria**:
- [ ] Headings, lists, tables, code, links preview live.
- [ ] ```` ```mermaid ```` blocks display as code, not charts.
- [ ] Keyboard shortcuts for bold / italic / heading / list are present.

#### FR-003 — Fixed Section Template

A new overview document MUST be seeded with a fixed template containing six required sections: **Overview**, **Goals**, **Primary Users**, **Constraints**, **Success Criteria**, **Notes**.

**Acceptance Criteria**:
- [ ] New doc loads with all six section headings present.
- [ ] Each section has a placeholder prompting the author.
- [ ] AI pane references the same section ordering when walking the user through.

### AI Assistance Pane

#### FR-004 — Business Analyst AI Persona

The AI pane MUST use the same Senior Business Analyst persona and conversational pattern as `/buildscope` (probe → draft → `[A]`pprove / `[C]`hange / `[E]`xplain / `[Add]` → advance to next section).

**Acceptance Criteria**:
- [ ] AI walks sections in the defined template order.
- [ ] AI waits for explicit approval before advancing.
- [ ] Approved section text is written into the Markdown editor at the corresponding heading.

#### FR-005 — AI Drafting from Short Prompt

An author MUST be able to ask the AI to draft any section from a short free-text prompt instead of answering the full interview.

**Acceptance Criteria**:
- [ ] "Draft from prompt" action is available per section.
- [ ] AI generates a draft; the user must still approve before the editor content is replaced.

#### FR-006 — AI Conversation Transcript Retention

The system MUST persist the AI conversation transcript alongside the overview document so edits can resume with context.

**Acceptance Criteria**:
- [ ] Transcript survives page reload and re-entry via the Edit action.
- [ ] Transcript is visible and scrollable in the AI pane.
- [ ] Transcript is NOT included in `projectoverview.md` itself.

### Alternative Entry Modes

#### FR-013 — Paste-to-Draft Analysis

The AI pane MUST provide a "Paste to analyze" action that accepts arbitrary user-pasted content (plain text, markdown, or image), reformats it to Markdown, and proposes a section-by-section mapping into the six fixed template sections. Each proposed section is reviewed using the same `[A]pprove / [C]hange / [E]xplain / [Add]` pattern as FR-004 before being written into the editor.

**Acceptance Criteria**:
- [ ] "Paste to analyze" action is visible in the AI pane (not triggered by paste into the editor itself).
- [ ] Paste input accepts plain text, markdown, and images (best-effort content extraction — OCR not guaranteed).
- [ ] Soft cap at 10,000 characters; over-limit input is NOT truncated — instead the pane surfaces a handoff prompt ("That's too large to paste safely — switch to file import?") linking to FR-014.
- [ ] AI maps content section-by-section in template order (Overview, Goals, Primary Users, Constraints, Success Criteria, Notes).
- [ ] For each proposed section, user chooses `[A]pprove / [C]hange / [E]xplain / [Add]`; advance is gated on explicit approve.
- [ ] On approve: if the target section already contains author content, user is prompted **Replace / Merge / Skip** BEFORE any write occurs (never silent overwrite).
- [ ] When AI cannot map content to a section, the pane asks: "I couldn't find content for **<Section>**. Do you have more to paste, or should I walk you through the interview questions?" — preserving paste-first as the primary path.
- [ ] When paste format cannot be resolved (e.g., image with no extractable content, corrupt binary), the system auto-files a markdown bug report at `specs/Project-Scope/025-project-overview-builder/bug-reports/YYYY-MM-DD-paste-format-unsupported-<hash>.md` with a sanitized sample, and the user is told "I couldn't read this — logged for the team."
- [ ] Only the AI's analysis (not the raw paste) is persisted to `overviewtranscripts`.

#### FR-014 — Import from File or GitHub URL

The AI pane MUST provide an "Import" action that accepts (a) uploaded files in `.md`, `.txt`, `.pdf`, `.docx`, or `.html` format, OR (b) a URL from an allowed host list. Imported content is routed through the same section-by-section mapping pipeline as FR-013.

**Acceptance Criteria**:
- [ ] "Import from file" and "Import from URL" actions are both visible in the AI pane.
- [ ] File upload accepts `.md`, `.txt`, `.pdf`, `.docx`, `.html` (server-side parsing via `pdf-parse`, `mammoth`, `html-to-text`).
- [ ] URL import is restricted server-side to an allowlist of known documentation hosts: `github.com`, `raw.githubusercontent.com`, `gist.github.com`, `gitlab.com`, `bitbucket.org`, `docs.google.com`, `notion.so`. Non-allowlisted hosts return a clear error. Extending the list requires a follow-up scope change.
- [ ] Private GitHub repos are NOT supported in v1; 401/403 responses from upstream return "This repo requires authentication — private-repo support is scheduled for a follow-up scope."
- [ ] Content larger than 8,000 characters is chunked into ~8k-character windows; chunks are passed to the AI sequentially with accumulating context so the mapping sees the full document, producing a single stitched section-mapping output.
- [ ] Hard ceiling at 500,000 characters per import; larger content is rejected with a clear message ("an overview isn't the right container for that volume").
- [ ] Each proposed section follows the same `[A]pprove / [C]hange / [E]xplain / [Add]` pattern as FR-013.
- [ ] On approve: if the target section already contains author content, user is prompted **Replace / Merge / Skip** BEFORE any write occurs.
- [ ] Raw imported content is persisted to `overviewtranscripts` with `role='user'` and `sourceuri` (URL or filename) for audit.
- [ ] AI analysis is persisted as `role='assistant'`.
- [ ] Fetched URL content is cached in `importcache` keyed by `(sourceuri, companyid)`; subsequent opens reuse the cached content indefinitely. A visible "Re-import" action triggers a fresh fetch on demand.

#### FR-015 — Embedded Mini-Editor in Proposal Dialog with Expand-to-Full-Screen

The proposal entry point (`AddProposalDialog`) MUST embed a mini-editor for the Description field that exposes the same authoring affordances as the full-screen editor (Interview / Paste-to-analyze / Import) AND a "Expand to full screen" action that hands off to `/overview/:draftId`.

**Acceptance Criteria**:
- [ ] Dialog continues to collect Title / Priority / Effort as small fields (unchanged).
- [ ] Description field is replaced by an embedded markdown mini-editor capped at ~200px height (per D2 — modal stays compact).
- [ ] Three entry-mode buttons are visible inline above the description editor (per D5): **Interview**, **Paste to analyze**, **Import**. These trigger the same flows as in the full-screen `AIPane` (FR-004 / FR-013 / FR-014), scoped to the embedded editor.
- [ ] An **"Expand to full screen ↗"** button is present next to the description label. Clicking it: (i) closes the dialog (per D3 one-way), (ii) navigates to `/overview/:draftId`, (iii) preserves any content already typed/pasted/imported.
- [ ] The bound `overviewdrafts` row is created **lazily** (per D4): the row does NOT exist when the dialog opens. It is created on the first content edit, paste-analyze submission, import submission, OR expand-to-full-screen click — whichever happens first. Cancelling a never-edited dialog leaves no DB residue.
- [ ] Submit from the dialog creates the `projectproposals` row AND finalizes the `overviewdrafts` row (status='submitted') in one atomic transaction. If the draft row was never lazily created (user filled only Title/Priority/Effort, never touched Description), it is created at submit time so every proposal has a bound overview draft.
- [ ] Authors who expanded to full screen and then return via `Submit Proposal` from the toolbar produce the same final state as authors who submitted from the dialog — the dialog and the editor are interchangeable surfaces over the same data.
- [ ] On expand, content already in the dialog is mirrored into the full-screen editor without round-tripping through the server (avoid latency).

### Persistence & Integration

#### FR-007 — Atomic Dual Persistence (File + DB)

On every approved section (and on manual save / autosave), the system MUST write content to BOTH the filesystem (`projectoverview.md`) AND the `projectdocuments` table. The root file is the single-source file for the currently active project in this workspace.

**Acceptance Criteria**:
- [ ] File at `projectoverview.md` (repo root) matches DB content byte-for-byte on save.
- [ ] DB row is keyed by (`projectid`, `doctype='ProjectOverview'`, `specid=null`) — upsert semantics; never duplicate.
- [ ] Write is atomic: if the file write fails, the DB is not updated (or is reverted); the editor surfaces the error to the user.

#### FR-008 — Autosave + Manual Save

The editor MUST autosave on a ~2 second idle debounce AND MUST also expose an explicit **Save** button in the toolbar. Both paths exercise FR-007 atomic persistence.

**Acceptance Criteria**:
- [ ] Save status indicator visible in the toolbar.
- [ ] Autosave never loses content on navigation if the save completed before the navigation event.
- [ ] Manual Save forces immediate persistence regardless of the debounce state.

### Launch & Lifecycle Entry Points

#### FR-009 — Launch from "New Proposal" and "New Project"

The system MUST provide two entry points:

- (a) **"New Proposal"** — opens the existing `AddProposalDialog` (compact modal with Title / Priority / Effort + an embedded mini-editor for Description per FR-015). The dialog is the proposal entry point; the full-screen editor route is reached via FR-015's "Expand to full screen" button when the author wants a larger surface.
- (b) **"New Project"** — opens the full-screen editor at `/overview/:draftId` directly (no compact dialog — admin/consultant project creation expects more substantial overview content and skips straight to the editor).

**Acceptance Criteria**:
- [ ] Both entry points produce the same `overviewdrafts` row + `projectdocuments` overview row on submit.
- [ ] "New Proposal" path: submit from the dialog creates the `projectproposals` row AND the bound `overviewdrafts` row in one atomic transaction. The proposal's overview content is stored in `overviewdrafts.content` (NOT in `projectproposals.description` — see Data Requirements below for the schema impact).
- [ ] "New Project" path: full-screen editor opens with an empty draft; on Create Project, project + overview are created together (T017).
- [ ] Cancelling the proposal dialog deletes the in-flight draft (lazy creation per FR-015 means no orphan rows survive a cancelled dialog).
- [ ] Cancelling the full-screen editor (without Submit/Create) leaves the draft in `status='draft'` so the author can resume.

#### FR-010 — Proposal List "Edit" Action

The proposal list MUST add an **"Edit"** action per row that reopens the editor with the proposal's existing `projectoverview` content AND its AI transcript loaded.

**Acceptance Criteria**:
- [ ] Edit is visible per row; gated by author-or-admin role.
- [ ] Re-entry does NOT create a new `projectdocuments` row.
- [ ] Last-edited timestamp updates on save.

#### FR-011 — Submit / Create Commits (editable until accepted)

Terminal actions MUST transition the draft:

- (a) **"Submit Proposal"** → proposal enters the spec-024 pending queue. The proposer retains edit rights until the admin accepts or rejects.
- (b) **"Create Project"** → project row promoted to active; Admin Dashboard's ProjectOverview `ReportLinkCard` reflects "created" (non-null timestamp from `GET /api/admin/doc-status`).

**Acceptance Criteria**:
- [ ] Submit / Create is disabled until all required sections have non-placeholder content.
- [ ] After Submit or Create, `GET /api/admin/doc-status` returns a non-null `projectOverview` timestamp for that project.
- [ ] After admin-accept, further proposer-originated edits are blocked with a clear explanation.

### Export

#### FR-012 — PDF Export (print-ready; Mermaid rendered)

The system MUST provide a PDF export action that renders the overview to print-ready PDF **with Mermaid diagrams rendered**, using the same pipeline as `specs/projectlifecycle.md` printing.

**Acceptance Criteria**:
- [ ] Export is available from the editor toolbar and from the proposal-list row menu.
- [ ] Mermaid blocks render as diagrams in the PDF.
- [ ] Author, admin, consultant, AND proposer can all trigger export. The endpoint enforces that proposers can only export their own drafts (no arbitrary `draftid` enumeration).

---

## Data Requirements

### Existing Table — Re-used

| Table | Purpose |
|-------|---------|
| `projectdocuments` | Re-used for overview content. Rows keyed by (`projectid`, `doctype='ProjectOverview'`, `specid=null`). Write `content`, `isgenerated=false`, `title='Project Overview'`. |
| `projectproposals` | **D1 impact** — `description` column becomes a derived/legacy field. Source of truth for proposal narrative is now `overviewdrafts.content` joined via `overviewdrafts.proposalid`. The legacy `description` column is left in place for backwards compatibility with existing rows but is no longer written by new proposals (POST /api/admin/proposals stops setting it; reads fall through to the joined overview content). A future migration may drop the column once existing rows have been backfilled into `overviewdrafts`. |

### New Tables

#### `overviewdrafts`

Purpose: hold in-progress authoring state when a proposal or project has not been finalized yet (covers FR-009 draft state and FR-011 "editable until accepted").

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid v7` | Primary key |
| `projectid` | `uuid v7` | FK → `projects.id`; nullable until the project is created |
| `proposalid` | `uuid v7` | FK → `proposals.id`; nullable until the proposal is submitted |
| `authoruserid` | `uuid v7` | FK → `users.id` |
| `companyid` | `uuid v7` | FK → `companies.id` — for tenant isolation |
| `status` | `text` | `'draft' \| 'submitted' \| 'accepted' \| 'rejected'`, default `'draft'` |
| `content` | `text` | Markdown body |
| `createdat` | `timestamp` | |
| `updatedat` | `timestamp` | |

#### `overviewtranscripts`

Purpose: persist the AI conversation (FR-006).

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid v7` | Primary key |
| `overviewdraftid` | `uuid v7` | FK → `overviewdrafts.id` |
| `role` | `text` | `'user' \| 'assistant' \| 'system'` |
| `content` | `text` | Message body |
| `sectionkey` | `text` | Nullable — which template section the message relates to |
| `sourceuri` | `text` | Nullable — set for entries produced by FR-014 imports; holds the URL or uploaded filename for audit. NULL for interview and paste entries. |
| `createdat` | `timestamp` | |

#### `importcache`

Purpose: cache fetched URL content for FR-014 so subsequent editor opens reuse the same content without re-fetching upstream. Cached indefinitely; user triggers refresh explicitly via A11.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid v7` | Primary key |
| `sourceuri` | `text` | Canonical URL (normalized) or filename hash |
| `companyid` | `uuid v7` | FK → `companies.id` — tenant isolation; same URL cached separately per company |
| `content` | `text` | Raw fetched content (up to 500k chars per FR-014) |
| `contenthash` | `text` | sha256 of `content` for integrity |
| `fetchedat` | `timestamp` | |

Unique constraint: `(sourceuri, companyid)`.

### Filesystem Path

- `projectoverview.md` lives at the **repo root** — one file per active project per workspace, mirroring `CLAUDE.md`. Proposals that have NOT been accepted write only to the DB (`overviewdrafts`); the root file is (re)written on Create Project or proposal acceptance.

---

## API Routes

| ID | Method | Route | Description |
|----|--------|-------|-------------|
| A1 | POST | `/api/overview/draft` | Create `overviewdrafts` row; returns `draftid` + seeded template content. Mode: `'proposal' \| 'project'`. |
| A2 | GET | `/api/overview/draft/:id` | Load draft content + transcript + proposal/project binding. |
| A3 | PUT | `/api/overview/draft/:id` | Save content (debounced autosave + manual Save, FR-008). Atomic: writes file AND upserts `projectdocuments` row (FR-007). Rolls back DB on file-write failure. |
| A4 | POST | `/api/overview/draft/:id/ai-message` | Append user message; stream assistant response; append to transcript; optionally patch a section on `[A]`pprove. Uses the shared BA persona prompt (see §4.4 / Constraints). |
| A5 | POST | `/api/overview/draft/:id/submit-proposal` | Promote draft to proposals queue (spec-024 handoff). `status='submitted'`. Proposer retains edit rights until admin accepts. |
| A6 | POST | `/api/overview/draft/:id/create-project` | Promote draft to a real project row; `projectdocuments` row flips to `specid=null / doctype='ProjectOverview'`; `GET /api/admin/doc-status` now returns a non-null timestamp. |
| A7 | GET | `/api/overview/draft/:id/pdf` | Render markdown → HTML → PDF (Puppeteer) with Mermaid server-rendered. Reuses the `projectlifecycle.md` pipeline (FR-012). Streams `application/pdf`. |
| A8 | GET | `/api/proposals` (extend existing) | Add `edit-eligibility` flag per row so the UI can render the Edit button (FR-010). |
| A9 | POST | `/api/overview/draft/:id/paste-analyze` | Accept paste payload (text, markdown, or base64 image). Stream AI mapping proposal as a series of per-section drafts. Body on per-section approve: `{ sectionkey, action: 'replace' \| 'merge' \| 'skip', content }`. Writes ONLY AI analysis to `overviewtranscripts` (raw paste dropped per FR-013). Unresolvable formats trigger auto bug-report (C15). |
| A10 | POST | `/api/overview/draft/:id/import` | Accept `{ source: 'file', filename, mimetype, payload }` OR `{ source: 'url', url }`. Enforces host allowlist (C14) and file-type whitelist. Chunks content >8k chars (FR-014). Streams AI mapping like A9. Writes raw content + AI analysis + `sourceuri` to `overviewtranscripts`. Upserts `importcache` row for URL imports. |
| A11 | POST | `/api/overview/draft/:id/import/refresh` | Re-import — bypasses `importcache`, refetches upstream, replaces cache entry. Only valid for `source='url'` imports. |

**Authorization (all endpoints)**:
- JWT required.
- Row-level check: `authoruserid == requesting user` OR admin role OR consultant role on the same company.
- PDF export endpoint additionally enforces "proposer can only export their own draft" to prevent `draftid` enumeration.

---

## Frontend Components

### New Components

| Component | Path | Description |
|-----------|------|-------------|
| `OverviewEditorPage` | `src/client/pages/OverviewEditorPage.tsx` | Top-level page; orchestrates the 75/25 layout and save state. |
| `MarkdownEditorPane` | `src/client/components/overview/MarkdownEditorPane.tsx` | 3/4 width Markdown editor. Library choice pinned in the detail plan (see Notes N2). Live preview; Mermaid blocks rendered as raw code. |
| `AIPane` | `src/client/components/overview/AIPane.tsx` | 1/4 width chat UI; streams assistant responses (SSE); **three entry modes from the top of the pane**: (1) Interview (FR-004), (2) "Paste to analyze" action opening a paste dialog (FR-013), (3) "Import" action opening file-upload + URL-fetch dialog (FR-014). "Draft from prompt" per section (FR-005). `[A]`pprove inserts section into editor; Replace / Merge / Skip modal on existing-content collision. Scrollback persisted via A4. "Re-import" button visible on URL-sourced imports with last-fetched timestamp (N10). |
| `PasteAnalyzeDialog` | `src/client/components/overview/PasteAnalyzeDialog.tsx` | Modal surfaced from AIPane; textarea for paste content (10k char counter), best-effort image paste support, streaming section-map preview; 10k overflow shows handoff prompt to `ImportDialog`. |
| `ImportDialog` | `src/client/components/overview/ImportDialog.tsx` | Modal with two tabs: "From File" (drag-drop for `.md`, `.txt`, `.pdf`, `.docx`, `.html`) and "From URL" (host-allowlist-validated input). Shows chunk progress for content > 8k chars; rejects > 500k with a clear message. |
| `SectionWriteConfirm` | `src/client/components/overview/SectionWriteConfirm.tsx` | Small modal shown only when approved AI mapping would overwrite existing author content in a section. Offers **Replace / Merge / Skip**; never silent overwrite (FR-013 / FR-014 ACs). |
| `EmbeddedOverviewEditor` | `src/client/components/overview/EmbeddedOverviewEditor.tsx` | **FR-015** — Shared mini-editor used inside `AddProposalDialog`. ~200px capped height, markdown textarea + optional preview toggle, the three entry-mode buttons (Interview / Paste / Import) inline above, and an "Expand to full screen ↗" button that navigates to `/overview/:draftId` while passing current content via router state (D3 one-way handoff). The same component (or a thin wrapper) can be reused inside the full-screen page below the AIPane — to be evaluated during T022. |
| `EditorToolbar` | `src/client/components/overview/EditorToolbar.tsx` | Manual Save, Submit Proposal / Create Project (contextual), Export PDF, autosave status indicator. |

### Modified Components

| Component | Change |
|-----------|--------|
| `AdminDashboard` | Add "New Project" and "New Proposal" buttons that launch the editor. |
| `ProposalList` | Add per-row "Edit" action (FR-010) and proposal-row Export PDF menu. |

### Route

| Route | Component | Purpose |
|-------|-----------|---------|
| `/overview/:draftId` | `OverviewEditorPage` | Full-screen editor, bypasses Admin Dashboard chrome. |

### Client Hooks (TanStack Query)

- `useOverviewDraft(id)` — loads draft + transcript (A2)
- `useSaveOverviewDraft()` — debounced + manual save (A3)
- `useAiMessage()` — SSE stream to A4
- `useSubmitProposal()` — A5
- `useCreateProject()` — A6
- `useExportPdf()` — A7
- `usePasteAnalyze()` — A9 (streams per-section AI proposals; emits Replace/Merge/Skip events on collision)
- `useImportDraft()` — A10 (handles file upload + URL submit; streams chunked AI mapping)
- `useReimportDraft()` — A11 (URL-sourced imports only; invalidates `importcache` entry for the draft)

### wxAI Commands — OMITTED

No new `/command` files. This feature embeds BA assistance inside the product for end-users; `/buildscope` already covers the CLI-based BA flow for developers in VS Code. Sharing is at the **prompt** level, not the command level — the BA persona prompt lives in a single shared module (e.g., `src/server/ai/prompts/business-analyst.ts`) imported by BOTH the `/buildscope` command handler AND the `A4 /ai-message` route. Any divergence between the two is a defect.

---

## Success Criteria

1. **Time to First Draft** — A typical author (proposer, admin, or consultant) can produce a complete first-pass overview in **≤ 20 minutes** using the AI pane, measured from editor open to all six template sections containing non-placeholder content.
2. **Adoption / Coverage** — **≥ 95 %** of new proposals and new projects created after release ship with a non-empty `projectoverview.md` (DB row present, all required sections populated). No silent "not created" states on the Admin Dashboard.
3. **Persistence Integrity** — Across 1,000 save events, **100 %** of successful saves produce byte-identical content in both `projectoverview.md` (repo root) AND the `projectdocuments` row. Zero drift incidents.
4. **Data Loss Prevention** — Authors can close the tab, refresh, or navigate away at any point and return to find the last autosaved content intact (including AI transcript) in **100 %** of cases where the last autosave completed before navigation.
5. **PDF Export Fidelity** — Generated PDFs render all Markdown constructs AND all Mermaid diagrams correctly in **≥ 99 %** of export attempts. Failures surface a clear error rather than producing a broken PDF.
6. **Edit-After-Submit Behavior** — Proposers can reopen a submitted-but-unaccepted proposal and modify its overview 100 % of the time; once admin accepts, further edits by the proposer are blocked with a clear explanation.
7. **BA Prompt Parity with `/buildscope`** — The same BA persona prompt powers the in-app AI pane and the `/buildscope` CLI command — verified by pointing both at the same shared module. Any behavioral divergence between the two is treated as a bug.

---

## Key Entities

| Entity | Description |
|--------|-------------|
| `OverviewDraft` | A work-in-progress project overview bound to a proposal or project, with status `draft \| submitted \| accepted \| rejected`. |
| `OverviewTranscriptEntry` | A single AI-pane message (user / assistant / system) linked to a draft; optionally tied to a template section. |
| `ProjectOverviewDocument` | The finalized overview stored in `projectdocuments` (doctype `ProjectOverview`) and written to `projectoverview.md` at repo root. |
| `SharedBaPrompt` | The BA persona prompt module shared between `/buildscope` and the in-app AI pane. |

---

## Constraints

### Technical

- **C1** — Stack compliance: TypeScript 100 %, no `any`, no `@ts-ignore`. Pino for logging (no `console.log`). Drizzle ORM + UUID v7 for all new tables. bcrypt + JWT for authz (no Clerk). Per `_wxAI/rules/`.
- **C2** — Naming: new tables `overviewdrafts` and `overviewtranscripts` are lowercase, concatenated, no underscores, no spaces (per CLAUDE.md database conventions).
- **C3** — Dual-persistence pattern MUST mirror the existing `specs/projectlifecycle.md` ⇄ `projectdocuments` sync (per CLAUDE.md "projectdocuments DB Sync" section). No new pattern invented.
- **C4** — PDF export MUST reuse the existing Puppeteer pipeline used by `projectlifecycle.md` printing. No new PDF library.
- **C5** — Mermaid handling is bifurcated by policy: raw in editor (no live render), rendered in PDF. This is a deliberate trade-off against known web-render instability.
- **C6** — Shared BA persona prompt: a single source-file module imported by BOTH the in-app `ai-message` route AND the `/buildscope` command handler. Any divergence is a defect.

### Integration

- **C7** — Spec 024 (pending-projects) is a hard dependency for proposal submission. The "Submit Proposal" action in FR-011 enqueues via spec-024's existing handoff; no bypass.
- **C8** — Admin Dashboard's Project Overview `ReportLinkCard` is the post-launch source of truth for "created" status. No change to the `GET /api/admin/doc-status` contract — this feature must make it return a non-null timestamp on Create / Accept.
- **C9** — No new "customer" actor role. All actors (proposer, company user, consultant) are covered by existing roles. Deferred.

### Business / Workflow

- **C10** — **SPEC-FIRST rule applies** — any change to the set of required template sections (Overview, Goals, Primary Users, Constraints, Success Criteria, Notes) requires a spec update before implementation. Prevents silent drift.
- **C11** — **Orchestrator routing** — spec edits, implementation, and releases for this feature route through `wxkanban-agent` per established convention. No out-of-band manual edits once implementation begins.

### Security / Privacy

- **C12** — AI transcripts may contain sensitive business info — the `overviewtranscripts` table must respect company isolation via `companyid` tie-through (through `overviewdrafts`).
- **C13** — PDF export endpoint is JWT-gated; proposers can only export their own drafts (no arbitrary `draftid` enumeration).
- **C14** — **URL-import host allowlist (security hard-line).** FR-014 URL imports are restricted server-side to a finite allowlist of known documentation hosts (initially: `github.com`, `raw.githubusercontent.com`, `gist.github.com`, `gitlab.com`, `bitbucket.org`, `docs.google.com`, `notion.so`). Arbitrary HTTPS URLs are rejected. Opening the list to arbitrary URLs is an SSRF risk (cloud metadata endpoints, internal services, RFC1918 ranges) and requires a dedicated threat-model review — do not relax this constraint without one.
- **C15** — **Paste-format fallback creates a bug report.** When FR-013 cannot extract usable content from a paste (e.g., image with no text, corrupt binary), the server auto-writes a markdown bug report to `specs/Project-Scope/025-project-overview-builder/bug-reports/YYYY-MM-DD-paste-format-unsupported-<hash>.md` containing a sanitized sample. The user is told "logged for the team" — no silent data loss.
- **C16** — **Transcript asymmetry.** Raw paste is NOT persisted (only AI analysis — FR-013). Raw import IS persisted alongside AI analysis (FR-014) with `sourceuri`. Rationale: pastes are often throwaway clipboard content with no audit value; imports have a durable source pointer and represent a deliberate seeding action worth preserving.
- **C17** — **Private GitHub auth deferred.** FR-014 v1 is public-only. OAuth / PAT handling for private repos (encrypted token storage per C1, per-company scope, refresh, revocation) is split into a follow-up scope (e.g., 026) to keep 025 shippable.
- **C18** — **Parsing dependency footprint.** FR-014 adds `pdf-parse`, `mammoth` (docx), and `html-to-text` to server dependencies. These run server-side only; do not bundle to client. Sandboxed file inputs must be size-capped at the HTTP layer (matching the 500k-char import ceiling) to prevent parser DoS.

---

## Notes

- **N1** — The full-screen route must truly bypass the Admin Dashboard chrome — sibling to the dashboard route, not nested. Past full-screen attempts in this repo nested inside the dashboard and leaked chrome; avoid that.
- **N2** — Editor library choice (`@uiw/react-md-editor`, Milkdown, TipTap, custom) is a material decision affecting accessibility, bundle size, and Mermaid handling. Pin the choice in the detailed plan before coding.
- **N3** — **Race condition to design for**: author A is editing while admin accepts the proposal. On accept, subsequent author saves must be rejected with a clear error (not silently overwrite the frozen overview).
- **N4** — AI streaming via SSE needs an explicit heartbeat / timeout story; half-open connections waste model tokens.
- **N5** — Root-level `projectoverview.md` is tenant-bound — one file per active project per workspace. If wxKanban ever supports multi-project workspaces, this assumption breaks and must be revisited. Document loudly.
- **N6** — Deferred until a later scope:
  - Functional-area detection → candidate scopes
  - Multi-scope splitting
  - Dedicated "customer" actor role
  - Version history / diff view of overview edits
- **N7** — **Claude Projects path.** Users with a Claude Projects workspace can export the project's `claude.md` to a GitHub repository (public), then seed a wxKanban overview by pasting that file's GitHub URL into FR-014's URL import. No bespoke "Claude Projects connector" is needed — the standard FR-014 URL flow handles it natively. Document this path in user-facing help so authors know it's the recommended way to seed an overview from an existing Claude Project.
- **N8** — **Image paste is best-effort; OCR is not guaranteed.** FR-013 accepts images but does not ship dedicated OCR. Unrecognized images trigger C15's auto bug-report path so the team can see demand. If image imports become common, a dedicated OCR pipeline (e.g., Tesseract server-side or a vision-capable LLM call) should be scoped separately.
- **N9** — **Chunking strategy for FR-014 imports.** 8,000-character windows with accumulating-context mode (each chunk is sent to the AI along with prior-chunk section mappings, so the final output is stitched rather than disjoint per-chunk mappings). The AI client must cap total LLM calls per import to prevent runaway costs on near-ceiling documents — suggested hard cap: 80 AI calls per import (i.e., 500k / 8k = 62 chunks worst case + ~20 for revision rounds).
- **N10** — **Re-import UX.** The "Re-import" action (A11) is visible on imports sourced from URLs only. File-uploaded imports have no upstream to refresh; re-running requires a fresh upload. The UI should show the last-fetched timestamp alongside the "Re-import" button so authors know how stale the cached content is.

---

## Clarifications

### Session 2026-04-23

| # | Question | Decision |
|---|----------|----------|
| 1 | What does "create project Overview" mean? | Build a full-screen AI-assisted MD editor for authoring `projectoverview.md`, shared by new proposals AND new projects. |
| 2 | Persistence target — file, DB, or both? | BOTH — `projectoverview.md` at repo root AND `projectdocuments` row, kept in sync atomically. |
| 3 | Where does it launch from? | "New Proposal" AND "New Project" entry points from Admin Dashboard. |
| 4 | Should AI detect functional areas and create candidate scopes? | NO — overview only. Scope breakdown happens later in VS Code via `/buildscope`. |
| 5 | Fixed section template or freeform? | Fixed template (Overview, Goals, Primary Users, Constraints, Success Criteria, Notes). |
| 6 | Who are the primary actors? | Proposers, any company user with project-edit rights, consultants. No "customer" role yet — deferred. |
| 7 | Live Mermaid preview in editor? | NO — raw code blocks in editor (web render instability). Mermaid IS rendered in PDF export, using the `projectlifecycle.md` pipeline. |
| 8 | PDF export included? Who can use it? | Yes, in v1. All authors — admin, consultant, AND proposer — can export. |
| 9 | Autosave behavior? | Both: 2 s debounced autosave AND manual Save button in the toolbar. |
| 10 | Edit-after-submit for proposers? | Proposer can edit a submitted proposal until the admin accepts it. After accept, the overview is locked. |
| 11 | File location for `projectoverview.md`? | Repo root only (one per active project per workspace, mirroring `CLAUDE.md`). |
| 12 | Version history / diff view in scope? | No — deferred to a later scope. |

### Session 2026-04-24

| # | Question | Decision |
|---|----------|----------|
| 13 | Can authors paste arbitrary content into the AI pane and have it mapped to the template? | **Yes — FR-013.** "Paste to analyze" action in the AI pane accepts text, markdown, and images (best-effort). Section-by-section mapping using the same `[A]pprove / [C]hange / [E]xplain / [Add]` pattern as FR-004. Replace / Merge / Skip prompt on existing section content — never silent overwrite. 10k soft cap; overflow hands off to FR-014 import, not truncated. Only AI analysis is persisted to transcripts (raw paste dropped). Unresolvable paste formats auto-file a bug report (C15). |
| 14 | Can authors import existing files or GitHub documentation? | **Yes — FR-014.** Accepts `.md`, `.txt`, `.pdf`, `.docx`, `.html` file uploads AND URL imports. URL imports restricted to a server-side host allowlist (C14) — GitHub, GitLab, Bitbucket, Gist, Google Docs, Notion. Public repos only in v1; private-repo auth deferred (C17, follow-up scope ~026). Content chunked at 8k chars with accumulating context (mode ii); hard ceiling 500k chars. URL content cached in `importcache` indefinitely; user triggers refresh via "Re-import" (A11). Raw import + AI analysis + `sourceuri` all logged (C16 asymmetry vs. paste). |
| 15 | URL import reach — any HTTPS URL, or allowlist? | **Allowlist (α).** Arbitrary HTTPS URLs are an SSRF risk (cloud metadata, internal services); allowlist is the security hard-line. Broader reach requires a dedicated threat-model review — see C14. |
| 16 | Private GitHub repos — absorb into 025 or split? | **Split (B).** 025 ships public-only. Follow-up scope (provisionally 026) adds encrypted PAT / GitHub App OAuth, per-company token scope, refresh, and revocation — keeps 025 shippable. |
| 17 | Cache TTL for imported URL content? | **No TTL — cache forever.** User manually refreshes via A11 ("Re-import"). Simpler than TTL and matches deliberate-seed mental model. Last-fetched timestamp is shown in UI (N10). |

### Session 2026-04-25

| # | Question | Decision |
|---|----------|----------|
| 18 | Is the proposal `description` the same content as the project overview? | **Yes (D1 = a).** One source of truth. Proposal description IS the overview content, stored in `overviewdrafts.content`. Legacy `projectproposals.description` column kept for backwards-compat with old rows but no longer written by new proposals. See "Existing Table — Re-used" note for migration path. |
| 19 | When proposal dialog embeds the editor, how big is the embedded editor? | **Capped ~200px (D2 = y).** Modal stays compact for quick proposals; full-screen does the heavy lifting. Authors who want more space click Expand. |
| 20 | What happens when the user clicks "Expand to full screen"? | **One-way handoff (D3 = p).** Dialog closes, navigates to `/overview/:draftId`. User submits from the full-screen toolbar. Simpler state model than two-way sync. Content already typed in the dialog is mirrored into the editor without server round-trip. |
| 21 | When is the bound `overviewdrafts` row created? | **Lazily (D4 = β).** Created on first content edit / paste / import / expand — whichever happens first. Cancelling a never-touched dialog produces no DB residue (no orphan rows). If submit fires with content but the row was never lazily created, it is created at submit time. |
| 22 | Where do the three entry-mode buttons (Interview / Paste / Import) appear in the dialog? | **Inline above the description editor (D5 = i).** Always visible — discoverability matters for first-time users. Hiding them behind an "AI assist" reveal would obscure the value proposition. |

---

## Implementation Audit Trail

- **Scope scaffolded**: 2026-04-23 via `npx tsx wxkanban-agent/apps/command-gateway/src/cli.ts buildscope --featureDescription "Project Overview Builder" --quick --user andy@wxperts.com` (orchestrator audit record persisted).
- **Interactive BA review**: Performed in Claude Code session prior to orchestrator invocation; six sections approved section-by-section by andy@wxperts.com per the `/buildscope` methodology.
- **Known kit gap surfaced during this scope**: `setup-mcp.mjs` did not run the R16 project-identity check when MCP was already up (AC1 covers the "MCP down" path only). Cross-project misbinding was detected manually; to be filed as a follow-up bug against spec 019.
