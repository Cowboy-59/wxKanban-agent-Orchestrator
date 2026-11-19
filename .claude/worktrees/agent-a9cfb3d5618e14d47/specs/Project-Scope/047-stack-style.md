# SCOPE-047: Stack & Style Preferences

**Scope Number**: SCOPE-047 (implementation specs: SPEC-055, SPEC-056, SPEC-057)
**Status**: `draft`
**Created**: 2026-06-13
**Last Reviewed**: 2026-06-13 (interactive buildscope — section-by-section, approved through Section 6)
**Depends On**: SCOPE-025 (Project Overview Builder — reuses its per-project `projectdocuments` document + atomic file+DB persistence pattern), SCOPE-046 (Language — reuses its command-template `{{…}}` injection mechanism), SCOPE-014 (SysAdmin / company roles — the ADMIN gate for company-wide profiles), SCOPE-019 (Agent Orchestrator Kit — `/buildstack` is an auto-discovered consumer-side command and the generation templates that receive the injection), SCOPE-025/SCOPE-019 (LLM provider contract — the editor-AI interview + token derivation)
**Related Scopes**: complements the WinDev→AI conversion flow — SPEC-044 (wxconversion command) and SPEC-047 (windev-site-integration) — so a converted project can declare its target rebuild stack + style here, and generated specs/code target the rebuild stack, not the legacy one.
**Source**: `specs/Project-Scope/047-stack-style.md`

---

## Overview

A per-project capability to capture a project's **target technology stack** and **design/CSS style** through a guided `/buildstack` interview, persist them as a per-project document (`stack.md` at repo root **+** a `projectdocuments` row, doctype `ProjectStack` — the dual-persistence pattern from spec 025), and **inject them into the kit's generation templates** (`buildscope`, `createspecs`, `implement` — the spec 046 injection mechanism) so every generated scope, spec, and implementation targets the project's real stack and look. The kit stays a **workflow engine**: the editor AI runs the interview and derives design tokens; the kit injects preferences into the templates it follows and persists the document — it generates nothing itself.

**Default-first (zero-config path):** every choice ships a sensible **default**. A user who doesn't want to decide accepts the default in one step; all customization is opt-in — the escape hatch for non-experts.

**Application type drives the stack:** the interview asks **Web / Desktop / Mobile** first, and the recommended default stack adapts (e.g. Web → React/Express/Postgres; Desktop → Tauri or Electron; Mobile → React Native or Flutter).

**Look-and-feel by reference, not by design jargon:** for UI app types the style step shows **3–4 curated inspiration galleries** (Mobbin, Land-book, Dribbble, Awwwards); the user browses, picks a direction, and/or cites a specific named/URL reference, and the AI derives **design tokens** (color palette, typography, spacing/radius) from that choice. This serves the non-designer career-changer directly.

**Company-wide tier:** an ADMIN can promote a project's stack/style to a **company-wide default for its application type** (≤ 1 per type, ≤ 3 per company). Stack remains **project-level and authoritative**; the company profile is the **live default** for any project that hasn't overridden — resolved the same way at interview-seed time and at generation-injection time.

## Business Problem

The kit is used by **consumer projects on many different stacks**, but today nothing tells it what a given project is built with or how it should look. Generated specs and code silently assume wxKanban's own Express/React/Postgres/Tailwind stack, which is wrong for most consumer projects and forces rework. Separately, the kit's target customers are career-changers who are systems thinkers but **not designers** — they can't express a visual direction in design vocabulary, so they end up with incoherent or default-ugly UIs. This scope captures the project's deliberate stack choices (with rationale, the habit the kit teaches) and lets a non-designer pick a look by pointing at an app they admire — then feeds both into everything the kit generates, so output matches the project's real target. A company can standardize once per surface and have every new project inherit it.

### Core Design

| Element | Value |
|---|---|
| **Primary Actor** | A developer/architect setting up or maintaining a project — especially a consumer project on a non-wxKanban stack. |
| **Secondary Actors** | The **editor AI agent** (runs the interview, derives tokens); the **kit** (injects preferences into templates, persists the doc); the **Company ADMIN** (promotes/manages company-wide profiles); the team building from generated specs. |
| **Key Value** | Generated scopes, specs, and code match the project's **real** stack and design system — never silently assuming wxKanban's own stack — with deliberate, documented, teachable choices. A beginner ships a coherent look by pointing at an app they admire; a company standardizes once and every new project inherits it. |
| **Capture mechanism** | A guided, default-first `/buildstack` interview (editor-AI-driven, one question at a time, BuildScope discipline). |
| **What's captured** | **Target stack** (backend language/framework, frontend framework, database, styling/component library, testing, hosting/deploy) each with a one-line rationale; **design tokens** (colors, typography, spacing/radius); **component/CSS library** choice. |
| **Resolution order** | Project `stack.md` → company-wide profile (per app type) → kit built-in default — evaluated identically at interview-seed and generation-injection time. |
| **Storage** | Per-project: `stack.md` (repo root) + `projectdocuments` (doctype `ProjectStack`, `specid` null), atomic file+DB (spec 025 pattern). Company-wide: new company-scoped `companystackprofiles` table, unique `(companyid, apptype)`. |
| **Scope Boundary** | **IN**: the `/buildstack` guided default-first interview; app-type-driven stack defaults (Web/Desktop/Mobile); full stack capture with rationale; look-and-feel via curated galleries → derived design tokens; dual file+DB persistence; injection into `buildscope`/`createspecs`/`implement` with no-`stack.md` fallback; edit/re-run (idempotent, non-destructive); ADMIN-promoted company-wide profiles (≤ 3 per company, tenant-isolated, live default) managed via both a kit/MCP action and a web ADMIN screen. **OUT**: emitting build artifacts (`tailwind.config`/theme CSS/scaffold); brand-asset/screenshot import (named/URL reference only in v1); conformance enforcement of generated code; offered-at-init integration (spec 011/025 flow); propagate-to-existing-projects on company-profile change; multiple named profiles per type; non-UI app types (API/CLI). |

---

## User Scenarios

### US1 — Beginner accepts the default (zero-config path)
A career-changer starts a new web project and runs `/buildstack`. They pick **Web** and, not wanting to make a dozen decisions, accept the defaults at each step. The command writes `stack.md` (and the `projectdocuments` row) with the default web stack (React/Express/Postgres, Tailwind + shadcn) and a default style. From then on, kit generation targets that stack.
**Expected:** a complete, valid `stack.md` is produced from defaults alone; every section has a sensible value; no choice is mandatory.

### US2 — Experienced dev customizes, picks a look by reference
An architect runs `/buildstack`, selects **Mobile** (default stack seeds to React Native), overrides the database and testing framework (each with a one-line rationale), then at the style step browses the galleries, cites a specific app screen on Mobbin they admire, and the AI derives design tokens (palette, typography, spacing) from that reference. `stack.md` records the full stack, rationales, the cited reference, and the derived tokens.
**Expected:** app-type changes the recommended defaults; per-field overrides persist with rationale; a cited reference yields concrete design tokens.

### US3 — Generation targets the project's stack and style
With `stack.md` (or an inherited company default) in place, the developer runs `createspecs` and later `implement`. The kit injects the project's resolved stack + style into the command templates, so the generated spec's technical sections name the real stack and the generated code uses the chosen framework and component library / tokens — not wxKanban's own assumptions.
**Expected:** generated specs and code reflect the resolved stack and style; with no `stack.md` and no company profile, generation falls back to today's behavior (no regression).

### US4 — ADMIN standardizes the company, a project overrides
A consulting company's ADMIN runs `/buildstack` on a reference web project and promotes it to the **company-wide Web profile**. Every new web project then inherits that profile as its live default without running `/buildstack` at all. One project with unusual needs overrides by running `/buildstack` and setting its own `stack.md`; later the ADMIN updates the company Web profile — the overriding project is untouched, while still-default projects pick up the new default.
**Expected:** ADMIN-only promotion (≤ 1 per app type); company default is the live default for non-overriding projects; a project's own `stack.md` always wins; company-profile changes are non-destructive to overridden projects; Company A never sees Company B's profiles.

---

## Functional Requirements

### FR-001 — `/buildstack` guided, default-first interview

The kit MUST provide a `/buildstack` command that runs a BuildScope-style, one-question-at-a-time interview (editor-AI-driven; no kit-internal AI) to capture stack + style, where every step offers a sensible default and the user can accept all defaults to finish.

**Acceptance Criteria**:
- [ ] The command runs one question at a time and explains why it asks
- [ ] Accepting defaults at every step still produces a complete, valid `stack.md`
- [ ] No single choice is mandatory to complete the interview

### FR-002 — Application type drives stack defaults

The interview MUST ask the application type — Web / Desktop / Mobile — first, and seed the recommended default from it, resolving the default as: company-wide profile for that app type (if one exists) → kit built-in default.

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

### FR-006 — Inject preferences into generation; fallback when absent

The kit MUST inject the project's resolved stack + style into the `buildscope`, `createspecs`, and `implement` command templates so generated output targets them. Resolution is project `stack.md` → company-wide profile → kit built-in default, evaluated live. When no `stack.md` and no company profile exist, generation MUST behave exactly as today (no regression).

**Acceptance Criteria**:
- [ ] With a resolved stack/style present, generated specs/code reflect the project's stack + style
- [ ] With no `stack.md` and no company profile, generation is unchanged from current behavior
- [ ] Injection is template-level only — the kit calls no AI itself (workflow engine)

### FR-007 — Editable, re-runnable, non-destructive

Re-running `/buildstack` or editing `stack.md` MUST update the document and DB idempotently and MUST NOT alter already-generated specs.

**Acceptance Criteria**:
- [ ] Re-running updates only the changed fields and re-persists both legs
- [ ] Already-generated specs/code are untouched by a stack/style change
- [ ] The latest preferences govern only future generation

### FR-008 — Company-wide stack/style profiles (per application type)

An ADMIN MUST be able to promote a project's stack/style to a company-wide default for its application type, via **both** a kit/MCP action (from `/buildstack`) and a web ADMIN screen. There is at most one profile per application type per company (Web / Desktop / Mobile → up to 3). Any project without its own `stack.md` uses the company-wide profile for its app type as its **live default**. Profiles are company-scoped and tenant-isolated; changing one affects only projects that have not overridden — existing projects with their own `stack.md` are never altered.

**Acceptance Criteria**:
- [ ] An ADMIN can promote the current project's stack/style to company-wide for its app type (kit action and ADMIN screen); a non-ADMIN cannot (403/blocked)
- [ ] At most one profile per `(company, application type)`; re-promoting overwrites that type's profile
- [ ] A project with no `stack.md` resolves to the company-wide profile for its app type as its live default
- [ ] Changing a company-wide profile leaves overriding projects' `stack.md` untouched (non-destructive)
- [ ] Company A's profiles are never visible to Company B

---

## Technical Sections

### Data / Schema
- **Per-project** — no new per-project table. `stack.md` at repo root + a `projectdocuments` row (doctype `ProjectStack`, `specid` null), reusing spec 025's pattern. The markdown is the source of truth.
- **Company-wide** — new company-scoped table **`companystackprofiles`**: `id` (UUID v7), `companyid` (FK), `apptype` (`web` | `desktop` | `mobile`), `content` (the stack/style markdown), `createdbyid`, `createdat`, `updatedat`; **unique index on `(companyid, apptype)`**. Migration lands in the next number after the current head (`0030`). DB conventions: lowercase/concatenated/no underscores.

### Commands / API
- **`/buildstack`** — consumer-side slash command (auto-discovered from `_wxAI/commands/`, like `wxConversionScope`), editor-AI-driven interview. The kit handler persists via spec 025's atomic file+DB utility (doctype `ProjectStack`); the kit calls no AI itself.
- **Promote to company-wide** — ADMIN-gated action (kit/MCP tool resolving `companyid` from the token, role-checked) that upserts the `(companyid, apptype)` profile from the current project's stack/style.
- **Seed/resolve lookup** — fetch the company-wide profile for a given `apptype` (company-scoped, tenant-isolated) to supply the live default in the resolution chain.
- **Curated gallery list** — the 3–4 inspiration sites live in one shared constant (e.g. `src/shared/lookfeel-galleries.ts`) per FR-004.

### Frontend Components
- The interview is command-driven (editor/web chat) — no heavy new UI.
- **Read view:** the project's `ProjectStack` document renders in the existing project document panel (reuses `projectdocuments` rendering).
- **Company-wide management:** a new ADMIN settings screen listing the up-to-3 company profiles (Web/Desktop/Mobile) with promote/replace/clear — the one genuinely new screen.

### Kit / Generation integration
- Inject the resolved project stack + style (the `stack.md` / company-profile content) into the `buildscope`, `createspecs`, and `implement` command templates as `{{stack}}` context — the same template-injection mechanism as spec 046's `{{language}}`. Absent any resolved stack → no injection, today's behavior unchanged (FR-006 fallback).

---

## Success Criteria

1. **Default-first produces a complete setup.** Accepting every default completes `/buildstack` and yields a valid `stack.md` with all six stack dimensions + a default style. *(FR-001/003)*
2. **App type + company tier resolve correctly.** Selecting Web/Desktop/Mobile seeds the matching default; when a company-wide profile exists for that type it seeds/serves instead of the kit built-in — verifiable with and without a company profile present. *(FR-002/008)*
3. **A cited reference yields concrete tokens.** Citing a reference produces a recorded palette, typography, and spacing in `stack.md`; accepting the default style yields a valid default token set. *(FR-004)*
4. **Persistence is atomic across file + DB.** Success yields both `stack.md` and a `ProjectStack` row; a forced failure in either leg leaves the two consistent (no half-write). *(FR-005)*
5. **Generation targets the stack/style, with clean fallback.** With a resolved stack/style, generated specs/code reflect it; with none, generation is byte-for-byte today's behavior. *(FR-006)*
6. **Company tier is safe and isolated.** An ADMIN can promote (≤ 1 per app type); a non-ADMIN is blocked; Company A never sees Company B's profiles; changing a company profile leaves overriding projects untouched. *(FR-008)*
7. **Editing is idempotent and non-destructive.** Re-running `/buildstack` or editing `stack.md` updates both legs and never alters already-generated specs. *(FR-007)*

---

## Constraints & Notes

### Constraints
- **Stack is project-level; company profile is the live default.** Authority order is always project `stack.md` → company-wide profile (per app type) → kit built-in default, evaluated the same way at interview-seed time and generation-injection time. A project overrides by having its own `stack.md`.
- **Default-first.** Every choice has a default; nothing is mandatory; accepting defaults yields a complete, valid setup.
- **Kit stays a workflow engine.** The editor AI runs the interview and derives design tokens; the kit only injects preferences into command templates and persists the document. No kit-internal AI.
- **Reuse, don't invent.** Per-project storage rides on spec 025's `projectdocuments` doc + atomic file+DB persistence; generation rides on spec 046's `{{…}}` template injection. Net-new = one company-scoped table (`companystackprofiles`), one ADMIN screen, the `/buildstack` command + promote action.
- **Company tier is ADMIN-only and tenant-isolated.** ≤ 1 profile per `(company, app type)` (≤ 3 per company). Changing it is non-destructive — existing projects with their own `stack.md` are untouched; it only changes the live default for projects that haven't overridden.
- **No-regression fallback.** With no `stack.md` and no company profile, generation behaves exactly as today.

### Out of Scope (v1 / later)
- **No build artifacts** — v1 captures preferences; it does not emit a `tailwind.config`, theme CSS, or scaffold a project (that's implementation / `implement`).
- **No brand-asset/screenshot import** — look-and-feel is a named/URL reference only in v1; attaching screenshots/logos for richer derivation is deferred.
- **No conformance enforcement** — the kit doesn't lint/validate that generated code obeys the stack/style.
- **No offered-at-init integration** — `/buildstack` is standalone in v1; wiring it into the new-project / Project Overview flow (spec 011/025) is a later enhancement.
- **No propagate-to-existing-projects** — company-profile changes don't push to projects that already overrode.
- **No multiple named profiles per type, no non-UI app types (API/CLI)** in v1 — one profile per type; Web/Desktop/Mobile only.

### Dependencies
- Spec 025 (per-project doc + atomic file+DB persistence), spec 046 (command-template injection), company roles (ADMIN gate), LLM provider (`LLM_PROVIDER`) for the editor-AI interview + token derivation. Migration after head `0030`.

### Notes
- **Educational rationale:** capturing rationale per choice and letting non-designers pick a look by example (galleries) teaches deliberate stack + design decisions — the kit's mission.
- **Curated gallery list** (Mobbin, Land-book, Dribbble, Awwwards) lives in one place and is expected to be updated over time.
- **Process note:** authored in-conversation via interactive buildscope (the orchestrator `buildscope` CLI is broken — standing workaround); implementation routes through `createSpecs` → `implement` per orchestrator-first.
