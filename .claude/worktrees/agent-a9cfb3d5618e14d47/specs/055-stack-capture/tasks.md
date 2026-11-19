# Task Breakdown: Stack Capture & /buildstack

**Feature**: Stack Capture & /buildstack
**Spec**: 055
**Date Generated**: 2026-06-13
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | T001 /buildstack consumer-side slash command (editor-AI-driven, default-first, one-question-at-a-time interview) | high | done |
| 2 | T002 Dual file+DB persistence of stack.md + projectdocuments (doctype ProjectStack) reusing spec 025's atomic utility | high | done |
| 3 | T003 Application-type gate (Web/Desktop/Mobile) + kit built-in default stacks per type | high | done |
| 4 | T004 Full target-stack capture with per-choice rationale (six dimensions) | high | done |
| 5 | T005 Curated look-and-feel galleries constant + reference→design-token derivation | medium | done |
| 6 | T006 Edit / re-run flow — idempotent, non-destructive to existing specs | medium | done |
| 7 | T007 Read view — render the ProjectStack document in the existing project document panel | low | done |
| 8 | T008 Dedicated Stack tab on project detail (beside Kanban) with inline markdown edit | medium | done |

## Task Details

### T001 — /buildstack consumer-side slash command

Add the `/buildstack` consumer-side slash command, auto-discovered from `_wxAI/commands/` like `wxConversionScope`. It runs a BuildScope-style, one-question-at-a-time interview driven by the submitter's editor AI — never kit-internal AI — that explains why it asks each question and offers a sensible default at every step. Accepting all defaults must yield a complete, valid `stack.md`; no single choice is mandatory. Honors "the kit is a workflow engine, not an AI client": the editor AI conducts the interview and the kit only persists the result.

### T002 — Dual file+DB persistence of stack.md + projectdocuments (doctype ProjectStack)

Persist the interview result to both `stack.md` at the repo root and a `projectdocuments` row (doctype `ProjectStack`, `specid` null) atomically, reusing spec 025's atomic file+DB persistence utility (e.g. `ProjectDocumentService.upsertDocument`). On file-write failure the DB is not updated; on DB failure the file is reverted — no half-write. The markdown is the source of truth; no new table is introduced (this rides on `projectdocuments`).

### T003 — Application-type gate (Web/Desktop/Mobile) + kit built-in default stacks per type

Ask the application type — Web / Desktop / Mobile — first and seed the recommended default stack from it (Web → React/Express/Postgres; Desktop → Tauri or Electron; Mobile → React Native or Flutter). Changing the type re-seeds defaults only for fields the user has not yet customized, and the chosen type is recorded in `stack.md`. This task implements the gate plus the kit built-in defaults; the company-wide profile half of default resolution is delivered by spec 057, so until then resolution falls through to the kit built-in default.

### T004 — Full target-stack capture with per-choice rationale (six dimensions)

Capture all six stack dimensions — backend language/framework, frontend framework, database, styling/component library, testing framework, and hosting/deploy target — each defaulted or overridden and each carrying a one-line rationale (a default rationale is acceptable). Write the captured stack into `stack.md` in a structured, readable form so the project's deliberate choices are documented — the rationale-per-choice habit the kit teaches.

### T005 — Curated look-and-feel galleries constant + reference→design-token derivation

Define the curated 3–4 inspiration galleries (Mobbin, Land-book, Dribbble, Awwwards) in a single shared constant (`src/shared/lookfeel-galleries.ts`) so the list is maintainable in one place. In the style step (UI app types only), present the galleries, let the user pick a direction and/or cite a named/URL reference, and have the editor AI derive concrete design tokens (color palette, typography, spacing/radius) recorded in `stack.md`. Accepting the default style (no reference) yields a valid default token set.

### T006 — Edit / re-run flow — idempotent, non-destructive to existing specs

Make re-running `/buildstack` (or editing `stack.md` directly) update the document and DB idempotently — only the changed fields are re-persisted, and both legs stay consistent. Already-generated specs and code must be untouched by a stack/style change; the latest preferences govern only future generation. This guarantees the document stays a live, safely editable per-project artifact.

### T007 — Read view — render the ProjectStack document in the existing project document panel

Surface the captured `ProjectStack` document in the existing project document panel by reusing the `projectdocuments` rendering path (no heavy new UI). The interview is command-driven, so this is the only read surface in the base spec: the developer and team can open the project's stack/style document and read the captured stack, rationales, cited reference, and derived tokens.

### T008 — Dedicated Stack tab on project detail (beside Kanban) with inline markdown edit

> **Amendment B (2026-06-14, Andy):** T007 gave only a read surface inside the document panel. Add a dedicated **Stack** tab in the project workspace "Views" row beside **Kanban** (`/projects/:id/phase/stack`) that shows the project's `ProjectStack` document and lets the user **change it with the same structured capabilities as project creation**. The creation-time stack controls were extracted into a shared **`StackEditor`** component (app type, the six stack dimensions with rationale, look-&-feel galleries + cited reference, AI design-token derivation) now used by **both** `CreateProjectModal` and the Stack tab. The tab loads the doc via `GET /api/projects/:id/documents`, parses the stored markdown back into structured `ProjectStackData` via the new `parseStackMarkdown` (inverse of `renderStackMarkdown`), edits it in `StackEditor`, and saves the re-rendered markdown via the existing `PATCH /api/projects/:id/documents/:docId` (markdown stays the source of truth; the kit re-materializes `stack.md` on next project open). Empty state when no doc exists points to `/buildstack` / project-creation capture. No new server endpoint or DB change.
