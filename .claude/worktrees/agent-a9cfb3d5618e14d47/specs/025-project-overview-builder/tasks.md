# Task Breakdown: Project Overview Builder

**Feature**: Project Overview Builder
**Spec**: 025
**Date Generated**: 2026-04-24
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | T001: Create overviewdrafts Drizzle schema + migration | high | todo |
| 2 | T002: Create overviewtranscripts Drizzle schema + migration | high | todo |
| 3 | T003: Create importcache Drizzle schema + migration | high | todo |
| 4 | T004: Schema validation tests (Vitest + test Postgres) | high | todo |
| 5 | T005: Shared BA persona prompt module | high | todo |
| 6 | T006: Atomic file+DB persistence utility | high | todo |
| 7 | T007: URL fetcher with host allowlist + DNS-rebind defense (C14 SSRF guard) | high | todo |
| 8 | T008: Text chunking utility with 80-call hard cap | high | todo |
| 9 | T009: POST /api/overview/draft — Create (A1) | high | todo |
| 10 | T010: GET /api/overview/draft/:id — Load (A2) | high | todo |
| 11 | T011: PUT /api/overview/draft/:id — Save with atomic persistence + concurrent-save race (A3, N3) | high | todo |
| 12 | T012: POST /api/overview/draft/:id/ai-message — SSE BA interview (A4, N4) | high | todo |
| 13 | T013: POST /api/overview/draft/:id/paste-analyze — Paste flow with C15 bug-report fallback (A9) | high | todo |
| 14 | T014: POST /api/overview/draft/:id/import — File/URL import with chunking (A10) | high | todo |
| 15 | T015: POST /api/overview/draft/:id/import/refresh — Re-import (A11) | medium | todo |
| 16 | T016: POST /api/overview/draft/:id/submit-proposal — Handoff to spec-024 (A5, C7) | high | todo |
| 17 | T017: POST /api/overview/draft/:id/create-project — Create project + first file write (A6) | high | todo |
| 18 | T018: GET /api/overview/draft/:id/pdf — Reuse Puppeteer pipeline with Mermaid fidelity (A7) | medium | todo |
| 19 | T019: PDF parser using pdf-parse (src/server/parsers/pdf-parser.ts) | medium | todo |
| 20 | T020: DOCX parser using mammoth (src/server/parsers/docx-parser.ts) | medium | todo |
| 21 | T021: HTML parser using html-to-text (src/server/parsers/html-parser.ts) | medium | todo |
| 22 | T022: Route /overview/:draftId + OverviewEditorPage (FR-001, N1) | high | todo |
| 23 | T023: MarkdownEditorPane — @uiw/react-md-editor with raw Mermaid (FR-002, C5, N2) | high | todo |
| 24 | T024: EditorToolbar — save status + commit button + PDF export (FR-008, FR-011, FR-012) | medium | todo |
| 25 | T025: AIPane — three entry modes + SSE chat + transcript (FR-004/005/006) | medium | todo |
| 26 | T026: PasteAnalyzeDialog — 10k counter + overflow handoff (FR-013) | medium | todo |
| 27 | T027: ImportDialog — two tabs + client-side allowlist + chunk progress (FR-014) | medium | todo |
| 28 | T028: SectionWriteConfirm — Replace/Merge/Skip with diff preview (FR-013 AC6, FR-014 AC7) | medium | todo |
| 29 | T029: Core draft hooks A1-A8 (src/client/hooks/overview/) | medium | todo |
| 30 | T030: Paste + import hooks A9-A11 | medium | todo |
| 31 | T031: AdminDashboard — New Project + New Proposal launch buttons (FR-009) | medium | todo |
| 32 | T032: ProposalList — Edit action + Export PDF menu (FR-010, FR-012 AC1) | medium | todo |
| 33 | T033: Extend GET /api/proposals — editEligibility + lastEditedAt (A8) | medium | todo |
| 34 | T034: Unit tests — G2 utilities + G1 schema | high | todo |
| 35 | T035: Integration tests — draft CRUD + AI interview | high | todo |
| 36 | T036: Integration tests — paste-analyze (A9) + C15 bug-report fallback | high | todo |
| 37 | T037: Integration tests — import (A10/A11) + security | high | todo |
| 38 | T038: Integration tests — submit + create-project + spec-024 handoff | high | todo |
| 39 | T039: Integration tests — proposals extension (A8) matrix | medium | todo |
| 40 | T040: E2E Playwright tests — US1-US4 + paste + import happy paths | medium | todo |
| 41 | T041: Update CLAUDE.md conventions + Claude Projects N7 help text | low | todo |
| 42 | T042: Late-bound AC verification + lifecycle sync + status flip | low | todo |

## Task Details

### T001 — T001: Create overviewdrafts Drizzle schema + migration

Add src/db/schema/overviewdrafts.ts with all 8 columns (id uuid v7, projectid FK nullable, proposalid FK nullable, authoruserid FK, companyid FK, status text w/ check constraint for draft|submitted|accepted|rejected, content text, createdat, updatedat). Run npm run db:generate. Migration reviewable and reversible independently.

### T002 — T002: Create overviewtranscripts Drizzle schema + migration

Add src/db/schema/overviewtranscripts.ts with all 6 columns incl. sourceuri text NULL (populated only for FR-014 imports). FK overviewdraftid cascade deletes. role enum user|assistant|system. sectionkey nullable.

### T003 — T003: Create importcache Drizzle schema + migration

Add src/db/schema/importcache.ts with (id, sourceuri, companyid FK, content text, contenthash text, fetchedat). Unique index on (sourceuri, companyid) for tenant isolation per C14. No FK to drafts — cache persists across drafts.

### T004 — T004: Schema validation tests (Vitest + test Postgres)

Insert/update/delete on each new table. Unique (sourceuri, companyid) fires on duplicate. FK cascade deletes transcripts when draft deleted. Status check constraint rejects invalid values. Run against ephemeral test DB.

### T005 — T005: Shared BA persona prompt module

Create src/server/ai/prompts/business-analyst.ts exporting BUSINESS_ANALYST_PROMPT plus six-section probe helpers. Imported by BOTH A4 (ai-message route) AND wxkanban-agent/core/orchestrator/command-handlers/buildscope.ts — divergence is a defect per Success Criterion #7. Unit test asserts single-source import.

### T006 — T006: Atomic file+DB persistence utility

Extend existing ProjectDocumentService with ProjectOverview doctype support. saveOverview(projectid, content) writes projectoverview.md at repo root AND upserts projectdocuments row transactionally (FR-007). On file-write failure: DB not updated. On DB failure: file reverted to pre-save content. Mirrors existing projectlifecycle.md sync pattern.

### T007 — T007: URL fetcher with host allowlist + DNS-rebind defense (C14 SSRF guard)

Create src/server/services/UrlImportService.ts. fetchAllowedUrl(url) checks hostname against allowlist (github.com, raw.githubusercontent.com, gist.github.com, gitlab.com, bitbucket.org, docs.google.com, notion.so), DNS-resolves and rejects RFC1918/loopback/link-local/cloud-metadata (169.254.169.254, fd00::/8, fe80::/10) IPs, 10s timeout, 500k response cap. Unit tests cover each rejection path including DNS-rebind.

### T008 — T008: Text chunking utility with 80-call hard cap

Create src/server/ai/text-chunker.ts. chunk(text, 8000) returns 8k windows with ~200 char overlap at sentence boundaries. analyzeWithChunking(chunks, sectionMapper) runs accumulating-context mode (N9): chunk N receives section-mapping-so-far from 1..N-1. Enforces 80 AI-call cap per import (prevents runaway cost on near-ceiling docs).

### T009 — T009: POST /api/overview/draft — Create (A1)

Accept { mode: proposal|project }. Create overviewdrafts row, seed six-section template. Return { draftid, content }. JWT required; authoruserid + companyid from token. Integration tests: both modes, unauth 401.

### T010 — T010: GET /api/overview/draft/:id — Load (A2)

Return { content, transcript[], binding, status }. Authz: author OR admin OR consultant on same company. Integration tests: author 200, other user 403, admin any-company 200, consultant same-company 200.

### T011 — T011: PUT /api/overview/draft/:id — Save with atomic persistence + concurrent-save race (A3, N3)

Use T006 atomic persistence. For proposal-bound drafts: file NOT written until acceptance. For project-bound drafts: file written on Create Project (T017). Optimistic-lock via updatedat CAS (N3). Reject post-accept edits (FR-011 AC3). Integration tests: happy path, file-write failure rolls back DB, concurrent-save stale error, post-accept rejection.

### T012 — T012: POST /api/overview/draft/:id/ai-message — SSE BA interview (A4, N4)

SSE via fetch+ReadableStream. Imports BUSINESS_ANALYST_PROMPT from T005. Heartbeat 15s (N4). 90s timeout closes half-open connections. Append user+assistant to overviewtranscripts. On approve, patch section into draft content. Integration tests: stream chunks, heartbeat, timeout, approve-patch.

### T013 — T013: POST /api/overview/draft/:id/paste-analyze — Paste flow with C15 bug-report fallback (A9)

Accept { content: text|base64image }. 10k soft cap; overflow returns { error: too_large, handoff: import } (FR-013 AC3) — no truncation. SSE stream of per-section proposals via T005 prompt + T008 chunker (vision LLM for images). Writes ONLY AI analysis to transcripts, raw paste dropped (C16). Unresolvable format writes bug report to specs/Project-Scope/025-project-overview-builder/bug-reports/YYYY-MM-DD-paste-format-unsupported-<hash>.md with sanitized sample (C15). Inline bug-report helper (G2 judgment #4).

### T014 — T014: POST /api/overview/draft/:id/import — File/URL import with chunking (A10)

Accept { source: file, filename, mimetype, payload } | { source: url, url }. File path dispatches to G5 parsers by mimetype. URL path calls T007 (allowlist + SSRF guard). Both run through T008 chunker. Raw content + AI analysis + sourceuri to transcripts (C16 asymmetry). URL imports upsert importcache. 500k hard ceiling rejected with clear message. Integration tests: each file type, each allowlisted host, rejection paths.

### T015 — T015: POST /api/overview/draft/:id/import/refresh — Re-import (A11)

URL-sourced imports only; file imports return { error: not_refreshable }. Deletes matching importcache row, re-runs T014 URL path, updates fetchedat. Timestamp shown in UI (N10). Integration tests: URL refresh succeeds, file-source returns error.

### T016 — T016: POST /api/overview/draft/:id/submit-proposal — Handoff to spec-024 (A5, C7)

Transition draft status to submitted. Call into spec-024 pending-queue handoff — DO NOT BYPASS spec-024 contract (C7). Proposer retains edit access until admin accepts (FR-011 AC3). Integration test verifies spec-024 queue receives handoff payload.

### T017 — T017: POST /api/overview/draft/:id/create-project — Create project + first file write (A6)

Create projects row, flip draft to accepted + set projectid. Call T006 to write projectoverview.md at repo root (first write). Upsert projectdocuments with doctype=ProjectOverview, specid=null. GET /api/admin/doc-status immediately returns non-null projectOverview timestamp (FR-011 AC2). Integration tests: project row exists, file written, doc-status timestamp present.

### T018 — T018: GET /api/overview/draft/:id/pdf — Reuse Puppeteer pipeline with Mermaid fidelity (A7)

Reuse projectlifecycle.md Puppeteer pipeline (C4). Markdown → HTML (Mermaid rendered in Puppeteer page context, not CLI subprocess — reuses same browser for PDF render). Stream application/pdf, Content-Disposition attachment. Filename: overview-<projectname>-<date>.pdf; for drafts without project, overview-draft-<shortid>-<date>.pdf. Proposer scoped to own drafts (C13). Mermaid fidelity test fixture (pie + bar + xychart-beta + gantt) folded into integration suite per Q3.

### T019 — T019: PDF parser using pdf-parse (src/server/parsers/pdf-parser.ts)

parsePdf(buffer) returns plain text. 500k cap. Encrypted/password PDFs return UnsupportedFormatError → T014 routes to C15. Unit tests: text PDF, scanned-only PDF (fallback), encrypted PDF rejection, 500k cap.

### T020 — T020: DOCX parser using mammoth (src/server/parsers/docx-parser.ts)

parseDocx(buffer) returns markdown via mammoth.convertToMarkdown. Preserves headings/lists/bold/italic/tables. Strips images. Image-only detection: if stripped output < 100 chars AND source > 100KB, return UnsupportedFormatError for C15 fallback. Size-cap before unzip (zip-bomb defense). 500k cap.

### T021 — T021: HTML parser using html-to-text (src/server/parsers/html-parser.ts)

parseHtml(buffer) returns markdown. Strips script/style/iframe/inline-event-handlers at parse time (not render — defense in depth). Handles UTF-8 + common encodings. Rejects billion-laughs/compression-bomb inputs. 500k cap.

### T022 — T022: Route /overview/:draftId + OverviewEditorPage (FR-001, N1)

Register /overview/:draftId as SIBLING route to Admin Dashboard — NOT nested (N1, past full-screen attempts leaked chrome). OverviewEditorPage.tsx renders 75/25 split at >=1280px. Back button returns to origin tracked via router state. Orchestrates save state (dirty flag, last-saved, pending-save). Uses useOverviewDraft hook.

### T023 — T023: MarkdownEditorPane — @uiw/react-md-editor with raw Mermaid (FR-002, C5, N2)

Library: @uiw/react-md-editor (N2 decision). Live preview for headings/lists/tables/code/links. Mermaid fenced blocks stay raw (C5). Keyboard shortcuts: bold/italic/heading/list/link. Emits onChange(markdown). Accessible keyboard nav.

### T024 — T024: EditorToolbar — save status + commit button + PDF export (FR-008, FR-011, FR-012)

Four elements: autosave status indicator (Saved X ago / Saving / Unsaved — saving in Ns), manual Save button, contextual commit button (Submit Proposal | Create Project) disabled until six required sections have non-placeholder content (FR-011 AC1), Export PDF. beforeunload browser guard + react-router navigate block on unsaved changes.

### T025 — T025: AIPane — three entry modes + SSE chat + transcript (FR-004/005/006)

1/4-width panel. Top: three entry mode buttons (Interview, Paste to analyze, Import). Chat scrollback from useOverviewDraft transcript. Input: Enter-send / Shift-Enter newline. SSE streaming via useAiMessage. [A]pprove/[C]hange/[E]xplain/[Add] per assistant msg. On approve: route through SectionWriteConfirm if target has existing content. Draft-from-prompt per-section (FR-005) — button in each editor section header. Heartbeat retry banner on >30s silence (N4).

### T026 — T026: PasteAnalyzeDialog — 10k counter + overflow handoff (FR-013)

Modal from AIPane paste button. Textarea with live char counter (amber 9000, red 10000). onPaste captures clipboard image as base64 (thumbnail preview shown). Overflow >10k: non-truncating banner "Content too large — switch to import?" with button opening ImportDialog seeded with pasted content as .txt file (FR-013 AC3). Submit calls usePasteAnalyze, closes dialog, AIPane takes over section walkthrough.

### T027 — T027: ImportDialog — two tabs + client-side allowlist + chunk progress (FR-014)

Modal with tabs "From File" (drag-drop for .md/.txt/.pdf/.docx/.html + 500k client-side check) and "From URL" (input validated against shared src/shared/url-allowlist.ts constants — prevents client/server drift). Chunk progress indicator ("Analyzing chunk 3 of 8…"). Handoff to AIPane when section mapping starts. Re-import button visible on URL-sourced imports in AIPane sidebar (wires to T015).

### T028 — T028: SectionWriteConfirm — Replace/Merge/Skip with diff preview (FR-013 AC6, FR-014 AC7)

Modal fires ONLY on non-empty section collision (empty sections bypass — direct write). Three buttons: Replace (overwrite), Merge (append proposed with \n\n separator — deterministic, no second LLM call), Skip (leave untouched, advance). Preview diff above buttons: current vs proposed.

### T029 — T029: Core draft hooks A1-A8 (src/client/hooks/overview/)

useOverviewDraft, useCreateDraft, useSaveOverviewDraft (2s debounce + manual save), useAiMessage (SSE via fetch+ReadableStream — NOT EventSource; POST bodies needed), useSubmitProposal, useCreateProject, useExportPdf. Shared TanStack query key [overview-draft, id]. Optimistic PUT updates with merge-by-timestamp conflict resolution. Unit tests with mocked fetch.

### T030 — T030: Paste + import hooks A9-A11

usePasteAnalyze (SSE stream, approve/reject section API). useImportDraft (file upload OR URL; surfaces {currentChunk, totalChunks} for ImportDialog progress). useReimportDraft (throws on file-sourced call; invalidates importcache). All three invalidate [overview-draft, id] after section approvals.

### T031 — T031: AdminDashboard — New Project + New Proposal launch buttons (FR-009)

Add TWO side-by-side buttons: "New Project" (ADMIN only) and "New Proposal" (company users + invited proposers). Each calls useCreateDraft with appropriate mode, then navigate(/overview/:draftId). Cancelling leaves draft in status=draft (FR-009 AC2). Role gating client + server (A1). Does NOT replace existing CreateProjectModal — this is a SECOND button for overview-guided project creation.

### T032 — T032: ProposalList — Edit action + Export PDF menu (FR-010, FR-012 AC1)

Per-row Edit action gated by editEligibility flag from A8 (author-or-admin AND not accepted). Opens /overview/:draftId preloaded (no new projectdocuments row — FR-010 AC2). Last-edited timestamp updates on save. Export PDF in 3-dot menu (proposer scoped to own drafts, C13). Concurrent-edit UX (N3): PUT reject during admin-accept shows toast "This proposal was just accepted — your changes cannot be saved" (non-blocking).

### T033 — T033: Extend GET /api/proposals — editEligibility + lastEditedAt (A8)

Add per-row editEligibility: boolean — true if author pre-accept OR admin OR consultant on same company. Add lastEditedAt: ISO string — max(overviewdrafts.updatedat) for the proposal. Strictly additive — existing consumers ignoring fields continue to work. Integration tests cover full matrix (author/admin/consultant/outsider × pre-accept/post-accept).

### T034 — T034: Unit tests — G2 utilities + G1 schema

URL allowlist (T007): allowlisted pass, non-allowlisted rejected, DNS-rebind to RFC1918/loopback/cloud-metadata rejected, timeout fires. Text chunker (T008): 8k boundary, 500k ceiling rejection, 80-call cap. Atomic persistence (T006): happy path, file-write rollback DB, DB rollback file, concurrent-save optimistic lock. BA prompt parity (T005): single module verified. Schema (G1): insert/update/delete, FK cascade, unique constraints, enum rejection.

### T035 — T035: Integration tests — draft CRUD + AI interview

A1 both modes + unauth 401. A2 author 200 / other 403 / admin any-company / consultant same-company. A3 happy path, file-write failure rolls back DB, concurrent-save stale error (N3), post-accept rejection (FR-011 AC3). A4 SSE chunks, 15s heartbeat, 90s timeout, approve patches section.

### T036 — T036: Integration tests — paste-analyze (A9) + C15 bug-report fallback

FR-013 ACs: text happy path, markdown paste, image paste (vision LLM returns content), overflow returns handoff error (AC3), Replace/Merge/Skip on approved writes (AC6), missing-section re-paste prompt (AC7), unresolvable format writes bug report file to specs/Project-Scope/025-project-overview-builder/bug-reports/ with sanitized sample. C16: raw paste NOT in transcripts (post-request DB query assertion).

### T037 — T037: Integration tests — import (A10/A11) + security

FR-014 ACs: each file type upload + parse round-trip (fixtures in tests/fixtures/parsers/). Each allowlisted URL host — mock upstream. Security: non-allowlisted host rejected, DNS-rebind rejected, 500k ceiling, 10s timeout. Chunking: 50k import produces >6 chunks, accumulating context passes prior mappings. Cache: first import populates importcache, second returns cached, A11 invalidates + refetches, file-source A11 returns not_refreshable error. C16: raw + AI analysis + sourceuri all in transcripts.

### T038 — T038: Integration tests — submit + create-project + spec-024 handoff

Submit enqueues to spec-024 pending queue (verify handoff payload, do NOT bypass). Create Project: projects row created, draft flipped to accepted, projectoverview.md at repo root (fs check), projectdocuments upserted, GET /api/admin/doc-status returns non-null timestamp (AC2). N3 race: author PUT during admin accept rejected. Post-accept proposer edit rejected (AC3).

### T039 — T039: Integration tests — proposals extension (A8) matrix

editEligibility: author-owned pre-accept true / post-accept false; admin on company always true; consultant on company always true; outside company row hidden. lastEditedAt updates on draft PUT. Backwards compatibility: ignoring-consumers still work.

### T040 — T040: E2E Playwright tests — US1-US4 + paste + import happy paths

US1 new proposal: create → interview 6 sections → submit → appears in spec-024 queue. US2 new project: admin creates via editor → appears on dashboard → ReportLinkCard non-null timestamp. US3 re-edit: proposer Edit → existing content + transcript load → revise Goals → save → timestamp updates. US4 PDF export: from toolbar + from row menu → downloaded PDF contains 6 sections + Mermaid rendered (text-extraction assertion, Q3). Plus: one paste E2E (textarea → section mapping → approve → editor fills), one URL import E2E (public GitHub URL → chunked analysis → section mapping → approve).

### T041 — T041: Update CLAUDE.md conventions + Claude Projects N7 help text

Add "Project Overview Builder conventions" section to CLAUDE.md: (a) projectoverview.md repo-root location, (b) dual-persistence pattern extending projectlifecycle.md precedent, (c) shared host allowlist at src/shared/url-allowlist.ts, (d) BA prompt single-source at src/server/ai/prompts/business-analyst.ts. Add in-app tooltip/help for N7: "Have a Claude Project? Export claude.md to a GitHub repo, then paste the URL into Import."

### T042 — T042: Late-bound AC verification + lifecycle sync + status flip

Manually verify N10: Re-import button visible on URL-sourced imports only, last-fetched timestamp renders + updates after A11. Smoke-verify Success Criterion #2: 10 sequential Create Project flows each produce non-null projectOverview timestamp in GET /api/admin/doc-status — no silent "not created" states. Confirm specs/025-project-overview-builder/{spec.md,plan.md,tasks.md,tests.md,lifecycle.json,quickstart.md,checklists/requirements.md} exist and reference Project-Scope/025 as upstream. Update specs/projectlifecycle.md with spec 025 in Implementation phase (Mermaid charts recalculated per CLAUDE.md). Push projectlifecycle.md to DB via ProjectDocumentService.upsertDocument. Flip 025 spec status draft → planned.
