# Spec 055: Stack Capture & /buildstack

## Overview

A per-project capability to capture a project's **target technology stack** and **design/CSS style** through a guided, default-first `/buildstack` interview, and persist them as a per-project document (`stack.md` at repo root **+** a `projectdocuments` row, doctype `ProjectStack`, `specid` null — the dual-persistence pattern from spec 025). The interview is **editor-AI-driven**: it asks one question at a time, explains why it asks, and offers a sensible default at every step, so a user who doesn't want to decide can accept all defaults and still produce a complete, valid `stack.md`. The application type — Web / Desktop / Mobile — is asked first and seeds the recommended default stack; for UI app types the style step lets a non-designer pick a look by pointing at a curated inspiration gallery, from which the AI derives concrete design tokens.

The kit stays a **workflow engine**: the editor AI runs the interview and derives the design tokens; the kit only persists the resulting document. This spec is the **base** of scope 047 — it implements the `/buildstack` interview, full stack capture with rationale, the look-and-feel-by-reference token derivation, atomic dual file+DB persistence, an idempotent re-run/edit flow, and a read view in the existing project document panel. Injecting the captured preferences into the kit's generation templates is spec 056, and the company-wide profile tier (with its ADMIN screen) is spec 057 — both depend on this base. Full reviewed scope: `specs/Project-Scope/047-stack-style.md`.

## Business Problem

The kit is used by **consumer projects on many different stacks**, but today nothing tells the kit what a given project is built with or how it should look. Generated specs and code silently assume wxKanban's own Express/React/Postgres/Tailwind stack, which is wrong for most consumer projects and forces rework. Separately, the kit's target customers are career-changers who are systems thinkers but **not designers** — they can't express a visual direction in design vocabulary, so they end up with incoherent or default-ugly UIs. This spec captures the project's deliberate stack choices once (with rationale, the habit the kit teaches) and lets a non-designer pick a look by pointing at an app they admire — recording both as a durable, editable per-project document so the project's real target is written down before any generation reasons about it.

## Actors

- Primary: Developer / architect running `/buildstack` — a signed-in kit user setting up or maintaining a project (especially a consumer project on a non-wxKanban stack) who walks the guided interview, accepts or overrides each default, and cites a look-and-feel reference.
- Secondary: the **editor AI agent** (runs the one-question-at-a-time interview and derives design tokens from the cited reference); the **kit** (persists the document atomically to file + DB; calls no AI itself); and the **team** building from the captured `stack.md`.

## Success Metrics

1. Default-first produces a complete setup: accepting every default completes `/buildstack` and yields a valid `stack.md` with all six stack dimensions plus a default style — no choice is mandatory. *(criterion 1)*
2. A cited reference yields concrete tokens: citing a gallery reference produces a recorded color palette, typography, and spacing in `stack.md`; accepting the default style yields a valid default token set. *(criterion 3)*
3. Persistence is atomic across file + DB: a successful run yields both `stack.md` and a `ProjectStack` `projectdocuments` row, and a forced failure in either leg leaves the two consistent (no half-write). *(criterion 4)*
4. Editing is idempotent and non-destructive: re-running `/buildstack` or editing `stack.md` updates both legs and never alters already-generated specs. *(criterion 7)*

## Scope Boundary

IN: the `/buildstack` guided, default-first, one-question-at-a-time interview (editor-AI-driven, auto-discovered from `_wxAI/commands/`, no kit-internal AI); the application-type gate (Web / Desktop / Mobile) with kit built-in default stacks per type; full target-stack capture across six dimensions (backend, frontend, database, styling/component library, testing, hosting/deploy) each with a one-line rationale; look-and-feel by reference via a curated set of 3–4 inspiration galleries kept in one maintainable place, deriving design tokens (color palette, typography, spacing/radius); dual file+DB persistence (`stack.md` at repo root + `projectdocuments` doctype `ProjectStack`, `specid` null), atomic via spec 025's utility; an idempotent, non-destructive edit/re-run flow; and a read view rendering the `ProjectStack` document in the existing project document panel.

## Out of Scope

Injection of the captured stack/style into the `buildscope`/`createspecs`/`implement` generation templates — that is **spec 056** (generation injection). The company-wide stack/style profile tier, the `companystackprofiles` table, the ADMIN promote action, and the ADMIN management screen — that is **spec 057** (company tier); this spec implements only the app-type gate plus kit built-in defaults, and notes that the company-wide half of default resolution is delivered by 057. Also out: emitting build artifacts (`tailwind.config`, theme CSS, project scaffold); brand-asset / screenshot import (named-or-URL reference only in v1); conformance enforcement of generated code against the stack/style; and offered-at-init integration into the new-project / Project Overview flow (spec 011/025).

## Open Questions

None at this time. All scope-review decisions for the base capability (default-first interview, app-type-first gate, look-and-feel-by-reference, dual atomic persistence reusing spec 025, idempotent re-run, base-vs-056-vs-057 split) were resolved during interactive buildscope on 2026-06-13 and recorded in `specs/Project-Scope/047-stack-style.md`.

## Functional Requirements

### FR-001 — `/buildstack` guided, default-first interview

The kit MUST provide a `/buildstack` command that runs a BuildScope-style, one-question-at-a-time interview (editor-AI-driven; no kit-internal AI) to capture stack + style, where every step offers a sensible default and the user can accept all defaults to finish.

**Acceptance Criteria**:
- [ ] The command runs one question at a time and explains why it asks
- [ ] Accepting defaults at every step still produces a complete, valid `stack.md`
- [ ] No single choice is mandatory to complete the interview

### FR-002 — Application type drives stack defaults

The interview MUST ask the application type — Web / Desktop / Mobile — first, and seed the recommended default from it, resolving the default as: company-wide profile for that app type (if one exists) → kit built-in default.

> **Note**: The company-wide half of this resolution (the `companystackprofiles` lookup) is delivered by **spec 057**. This spec implements the app-type gate and the kit built-in defaults per type; until 057 lands, resolution falls straight through to the kit built-in default.

**Acceptance Criteria**:
- [ ] Selecting Web/Desktop/Mobile changes the proposed default stack accordingly
- [ ] The chosen application type is recorded in `stack.md`
- [ ] Changing the type re-seeds the defaults for not-yet-customized fields
- [ ] When a company-wide profile exists for the chosen app type, it seeds the defaults; otherwise the kit built-in default does

### FR-003 — Capture the full target stack with rationale

The command MUST capture backend language/framework, frontend framework, database, styling/component library, testing framework, and hosting/deploy target — each with a one-line rationale.

**Acceptance Criteria**:
- [ ] All six stack dimensions are captured (default or overridden)
- [ ] Each captured choice carries a one-line rationale (default rationale acceptable)
- [ ] The result is written to `stack.md` in a structured, readable form

### FR-004 — Look-and-feel by reference → design tokens

For UI app types, the style step MUST present a curated list of 3–4 inspiration galleries (Mobbin, Land-book, Dribbble, Awwwards), let the user pick a direction and/or cite a specific named/URL reference, and derive design tokens (color palette, typography, spacing/radius) from that choice. The gallery list MUST live in one maintainable place.

**Acceptance Criteria**:
- [ ] The galleries are presented and the user can pick/cite a reference
- [ ] A cited reference yields concrete design tokens recorded in `stack.md`
- [ ] Accepting the default style (no reference) yields a valid default token set
- [ ] The curated gallery list is defined in a single location for easy update

### FR-005 — Dual persistence (file + DB), atomic

`stack.md` MUST be written to the repo root and upserted to `projectdocuments` (doctype `ProjectStack`, `specid` null) atomically — mirroring spec 025: on file-write failure the DB is not updated; on DB failure the file is reverted.

**Acceptance Criteria**:
- [ ] A successful run yields both `stack.md` and a `ProjectStack` `projectdocuments` row
- [ ] A failure in either leg leaves file and DB consistent (no half-write)

### FR-007 — Editable, re-runnable, non-destructive

Re-running `/buildstack` or editing `stack.md` MUST update the document and DB idempotently and MUST NOT alter already-generated specs.

**Acceptance Criteria**:
- [ ] Re-running updates only the changed fields and re-persists both legs
- [ ] Already-generated specs/code are untouched by a stack/style change
- [ ] The latest preferences govern only future generation

### FR-008 — Download `stack.md` from the web Stack tab

The project **Stack tab** MUST let the user download the captured stack as a `stack.md` file so they can place it in their application's working directory (where the kit materializes/consumes it). The download MUST use the persisted `ProjectStack` markdown verbatim as the file body — the same content that is the source of truth for re-materialization — and MUST be reachable both when viewing a saved stack and while defining/editing one (downloading the in-progress draft in the latter case). It is a client-side file download (no server round-trip); the browser places the file in the user's download location and the user moves it into the app directory.

**Acceptance Criteria**:
- [ ] A "Download stack.md" control is present in the Stack tab's view mode and downloads the saved `ProjectStack` content as `stack.md`
- [ ] The same control is present while defining/editing a stack and downloads the current draft rendered to canonical `stack.md` markdown
- [ ] The downloaded file body byte-matches the canonical `renderStackMarkdown` output for that stack
- [ ] No control is shown in the truly-empty state (no stack defined and not yet editing), where there is nothing to download

## Phase

**Current Phase**: design
**Priority**: high

## Status

- **Date**: 2026-06-13
- **Phase**: design

---

## Amendment A (2026-06-14) — Corrected delivery: web-first at project creation

The implementation pass found the original delivery model wrong. The Overview/Actors/FR sections above frame `/buildstack` as a **consumer-side VS Code command** (auto-discovered from `_wxAI/commands/`, like `wxConversionScope`) as the *primary* capture. **That is wrong.** This Amendment supersedes that framing.

### Corrected model

- **Primary capture is on the wxKanban web app, at project creation.** The new-project flow includes a guided, default-first **stack & style walkthrough**: pick the application type (Web / Desktop / Mobile), accept or override the per-type default stack (each choice with a one-line rationale), and — for UI app types — pick a look-and-feel **by reference** from the curated galleries, from which the AI derives design tokens. Default-first: accepting every default yields a complete, valid stack with no mandatory choice.
- **Server-side persistence (wxKanban app).** The wxKanban server writes the project's `stack.md` and upserts `projectdocuments` (doctype `ProjectStack`, `specid` null) **atomically** — spec 025's file+DB pattern genuinely applies here. The curated galleries + per-app-type default stacks live in **`src/shared/lookfeel-galleries.ts`** (and a sibling defaults constant), the correct single source since this is wxKanban-app code. *(055's original T002/T005 task hints were right; only T001's "consumer command" framing was wrong.)*
- **The VS Code `/buildstack` command IS in 055, as update-only.** After the web walkthrough has created the project's `stack.md`, a consumer-side `/buildstack` command (auto-discovered from `_wxAI/commands/`, editor-AI-driven) lets a developer **update** the existing `stack.md` from VS Code and persists the updated `ProjectStack` doc via MCP (`project.upsert_document` extended with an optional `doctype`). It is an *editor of an existing document*, not the primary capture.
- The persisted `stack.md` is consumed by generation in **spec 056** (unchanged).

### Net effect on this spec's FRs/tasks

- **FR-001 / T001 — re-scoped:** the base delivers the **web new-project stack walkthrough** (a step in the project-creation flow), not a VS Code command. The one-question-at-a-time, default-first, explains-why discipline still applies, now as web UI.
- **FR-005 / T002 — confirmed:** server-side atomic file+DB persistence (`stack.md` + `projectdocuments` doctype `ProjectStack`).
- **FR-002/003/004 / T003-T005 — unchanged** in substance (app-type gate + per-type defaults; six-dimension capture with rationale; look-and-feel-by-reference → tokens), delivered in the web walkthrough; galleries/defaults in `src/shared`.
- **FR-007 / T007 — unchanged:** read view of the `ProjectStack` doc in the project document panel.
- **VS Code update-only `/buildstack` command — IN 055:** a consumer-side command that edits the already-created `stack.md` and persists via MCP (`project.upsert_document` + optional `doctype`).

### Resolved integration (2026-06-14)

The walkthrough attaches as a **step in the existing new-project flow** (the `CreateProjectModal` / project-creation path), shown after the project basics; the captured stack/style is persisted with the project on create. The VS Code command edits that document afterward.

---

## Amendment B (2026-06-14) — Download `stack.md` from the Stack tab (FR-008)

Adds **FR-008**: a download affordance on the project Stack tab so a developer can take the captured stack out of the web app as a `stack.md` file and drop it into their application directory. This complements — does not replace — the kit's cross-host materialization (the kit pulls the `ProjectStack` doc from the DB and writes `stack.md` on project open); the download is the manual path for users who want the file directly.

### Behaviour

- **Where:** a "Download stack.md" button in the Stack tab — in **view mode** (downloads the saved `ProjectStack` content) and in **define/edit mode** (downloads the current draft via `renderStackMarkdown`). The truly-empty state shows no button (nothing to download).
- **What:** a client-side download (`Blob` + object URL), filename `stack.md`, body = canonical stack markdown verbatim. No server round-trip.
- **Where to put it:** on download, the UI tells the user the target directory — the **root of the application/repository** that the kit reads (`stack.md` at repo root, per FR-005 and Amendment A). This matches the kit's materialization location so a manual drop and the kit's auto-write land in the same place.

### Implementation

- `src/client/components/Projects/StackTabView.tsx` — `handleDownload` + the button(s) and the post-download directory hint.
- No schema, route, or server change; reuses `renderStackMarkdown` from `src/shared/stack-defaults.ts` for the draft case.

## Amendment C (2026-06-18) — Multiple application types per project

FR-002 originally bound a project to **one** application type. Real projects often ship more than one client against a shared backend (e.g. a Web app + a Mobile app). This Amendment generalizes the capture to **one-or-more** application types; the single-type case is unchanged for the user (Web stays preselected).

### Behaviour

- The app-type control becomes a **multi-select** (checkboxes): the user may select any non-empty subset of Web / Desktop / Mobile. At least one type is always required (the last-remaining type cannot be unchecked).
- Each selected type carries **its own** six-dimension stack (backend/frontend/database/styling/testing/hosting), seeded from that type's defaults when first added and editable independently. Look & Feel / design tokens remain **shared** across all selected types (one visual direction for the product).
- `stack.md` renders a `**Application types:** <list>` line and **one `## Target Stack — <Type>` table per selected type**, followed by the shared Look & Feel / Design Tokens sections.

### Data model

- `ProjectStackData` changes `appType: AppType` → `appTypes: AppType[]` and `stack: StackChoices` → `stacks: Partial<Record<AppType, StackChoices>>` (`src/shared/stack-defaults.ts`).
- `renderStackMarkdown` / `parseStackMarkdown` round-trip the per-type tables; `parseStackMarkdown` still reads **legacy single-type** docs (`**Application type:**` + a single unlabelled `## Target Stack`), so previously-captured `ProjectStack` documents keep loading.
- New `parseAppTypesFromStackMarkdown` returns all types; `parseAppTypeFromStackMarkdown` (used by spec 057's promote) now returns the **first/primary** type — promote keys `companystackprofiles` by a single `apptype`, so it promotes the primary type. Multi-type promote is a **057 follow-up**, not in this Amendment.

### Implementation

- `src/shared/stack-defaults.ts` — interface, `defaultStackData(appTypes[])`, render/parse, app-type parsers.
- `src/client/components/Projects/StackEditor.tsx` — checkbox selector + one dimension block per selected type; `customizedDims` keyed `"<appType>:<dim>"`.
- `src/client/components/Projects/{CreateProjectModal,StackTabView}.tsx` — `defaultStackData(["web"])`, `Set<string>` for customized dims.
- `src/server/routes/projects.ts` — create-project `stack` zod schema (`appTypes[]` + `stacks` record); persist log field.

### Not yet addressed (flagged)

- **Spec 057 promote** only captures the primary type per project (see above).
- The kit-side `materialize-stack` writes `stack.md` verbatim, so multi-type docs already flow through unchanged.
