---
description: Build Scope-of-Project documents from already-converted WinDev Markdown — seed from a window's .wdw.md (or sweep every .wdw.md in pre-convert/), follow each window's calls into the procedures/classes it reaches, then run the full BuildScope section-by-section method to completion, one window at a time.
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
---

# wxConversionScope — Scope a Window, Following Its Calls

## Purpose

Run the **scoping stage** of the WinDev conversion on source that has **already been converted to Markdown** by `/wxConversion` (which switched the app to text saves and wrote one `.md` per element under `pre-convert/`, e.g. `WIN_Invoice.wdw.md`, `COL_Billing.wdg.md`, `CLS_Customer.wdc.md`).

A **window** is the natural unit of scope — it is what the user opens and acts in. So the seed is a window's **`*.wdw.md`** file. The command reads the WLanguage inside it and, every time the code **calls a global procedure or a class method**, it **follows that call** into the matching `.wdg.md` / `.wdc.md` file, reads it, and keeps going — assembling the full call graph reachable from that window. That accumulated behavior is the source material for **one** Scope-of-Project document.

Then, once gathering for a window is complete, it runs the **full BuildScope method** — same persona, same gated section-by-section review, to completion — and only then **moves to the next window**.

**The only output is Markdown files.** No code porting, no live database work.

Use this when:

- The WinDev source is already converted to Markdown and you want to scope it **one window at a time**, with each scope covering everything that window actually touches.
- You want to **sweep the whole app**: process every `*.wdw.md` in `pre-convert/` in turn, producing one scope per window.

This is the **second half** of `/wxConversion`. If the Markdown doesn't exist yet, run `/wxConversion` first.

## Usage

```bash
/wxConversionScope <window.wdw.md>     # scope ONE window, following its calls
/wxConversionScope --all               # sweep every *.wdw.md in pre-convert/, one window at a time
/wxConversionScope <window.wdw.md> --db        # also document the HFSQL → target-DB mapping for the tables this window touches
/wxConversionScope --all --target <db>         # preset the target DB for the optional mapping (postgres | sqlserver | mysql | sqlite)
```

- `<window.wdw.md>` — a single converted **window** file under `pre-convert/` (e.g. `pre-convert/WIN_Invoice.wdw.md`). Traversal radiates out from it.
- `--all` — discover **every `*.wdw.md`** under `pre-convert/`, list them, and process them **one window at a time** (singular — never batch). After each window's scope is finished and approved, announce the next and continue until the list is exhausted.

## Arguments

- `--all` — sweep mode (see above). Mutually exclusive with naming a single window. Only `.wdw.md` files seed a scope; `.wdg.md` / `.wdc.md` are followed *into*, never seeded on their own.
- `--db` — after the code walk for a window, run **Part B** of the skill (HFSQL → target-DB documentation) **scoped to the tables that window's call graph touches**. Without it the database is skipped (the skill still asks before any DB work; `--db` pre-answers "yes").
- `--target <db>` — preset the target database for the optional mapping (default recommendation `postgres`, the wxKanban stack). wxKanban naming/key conventions apply **only** when the target is `postgres`; any other target follows that DB's own idioms and preserves legacy names by default.

## Persona (carried throughout)

You hold **two personas at once**, and they do not conflict:

- **WinDev Conversion Analyst** (from `_wxAI/skills/wxConversion-analyst.md`) — a Senior Software & Business Analyst with 25+ years reverse-engineering legacy systems. You translate *behavior*, not implementation. You surface dead code, magic numbers, and KEEP/MODERNIZE/DROP calls — you never decide silently. Every observation cites `file:line` or `procedure/method-name` in the converted Markdown.
- **BuildScope Senior Business Analyst (Adversarial)** (from `_wxAI/commands/buildscope.md`) — 15+ years shipping features that work. You ask hard questions because vague requirements cause rework. You turn intent into testable statements, stress-test edge cases, keep vocabulary consistent with `CONTEXT.md`, and ensure the scope is implementation-ready — a developer should build it without a single clarifying question.

Question discipline for both: **one question at a time**, explain *why* you're asking, wait for the answer, push back gently on vague answers, and **never advance a section without explicit `[A]pprove`**.

## Behavior

### Preflight

1. Confirm the skill exists at `_wxAI/skills/wxConversion-analyst.md`; if missing, say so and stop.
2. Resolve the seed set:
   - `<window.wdw.md>` → that one window (must exist under `pre-convert/`; if it's still binary or absent, send the developer back to `/wxConversion` and stop).
   - `--all` → list **every `*.wdw.md`** under `pre-convert/`, show the developer the full list and the order you'll take them, and confirm before starting.
3. Load `CONTEXT.md`, `docs/adr/`, and existing `specs/Project-Scope/` for overlap — exactly as BuildScope's Domain Awareness step requires — **once**, up front, so it carries across every window in the sweep.

### Per window — do these in order, then move to the next window

**Stage 1 — Gather (call-graph walk + screen analysis).** *(Skill Steps 0, 1, 3.)*

- Run **Code Ingestion** on the window's `.wdw.md`; emit the one-paragraph **Code Summary**; wait for "go".
- Walk its handlers/functions in **call order from the entry point**. **Every call to a global procedure or class method → resolve it to its `.wdg.md` / `.wdc.md`** in `pre-convert/` and follow it: read, catalog, continue into *its* calls.
- **Track visited units** (visit each procedure/method once; note extra call sites) so recursion and mutual calls terminate.
- **Locate and analyze the window's screenshot.** Look for an image **with the same stem as the window file, minus `.wdw.md`** — `<stem>.png` / `.jpg` / `.jpeg` / `.webp` / `.gif` — first under `pre-convert/screens/`, then alongside the `.wdw.md` in `pre-convert/`. If found, **read the image** and derive a **field mapping**: for each visible control (text box, combo, table column, checkbox, button, label), pair it with the control/variable in the `.wdw.md` and the data column it binds to (e.g. on-screen "Montant TTC" → control `EDT_MontantTTC` → `Factures.MontantTTC`). Note required-field cues (red asterisk, color), formats/masks, tab order, and any control whose binding you **can't** resolve from the code — surface those as questions, don't guess. If **no image** is found, say so and proceed code-only (flag the window as "no screen — field mapping unverified").
- **Unresolved edges** — a target `.md` not in `pre-convert/`, a dynamic/indirect call, or an external/framework call — are **surfaced and asked about** (in scope / out of scope / convert first), never dropped or invented.
- Output a short **gather summary** for the window: the reachable call graph, the data tables touched, the **screen field-mapping table** (control → code binding → data column), UI controls observed, and flagged items (dead code, hardcoded values, unresolved edges, unmapped controls). Get a "go" before scoping.

**Stage 2 — Scope (full BuildScope method, to completion).** *(BuildScope Phases 1–5; skill Steps 4–6.)*

Using the gathered material as the authoritative source — *extract, don't invent; everything traces back to a `file:line` in the converted Markdown or to a developer answer* — run BuildScope exactly:

- **Discovery confirmation** — present what you extracted (purpose, actors, key workflows, data, stated boundaries, gaps you need filled). Ask about each gap one at a time.
- **Section-by-section review**, each presented with your reasoning + 2–4 targeted questions, each gated on `[A]pprove` / `[C]hange` / `[E]xplain` / `[Add]` / `[R]emove`, **never advancing on silence**:
    1. **Overview & Scope Boundaries** — in/out, primary actor, key value
    2. **User Scenarios** — ≥3, derived from the actual flows in the code
    3. **Functional Requirements** — `FR-### — <verb> <user-visible outcome>`, with testable acceptance criteria (never "loop through tblX and sum Y")
    4. **Data / Schema** — tables/fields/types observed, citing which procedure uses each; **reconciled against the Stage 1 screen field-mapping** (every bound control's data column appears here); fold in the DB mapping if `--db`
    5. **External Integrations** — every non-local call, legacy mechanism noted
    6. **UI Surface** — screens/fields/controls, built from the **Stage 1 field-mapping table** (control → code binding → data column), with required-field/format/tab-order cues and any unmapped controls flagged
    7. **Success Criteria** — measurable, behavior-based ("same invoice totals on N test cases")
    8. **Constraints & Notes** — hardcoded values needing decisions, dead code flagged, assumptions
    9. **Conversion Notes** — KEEP / MODERNIZE / DROP per legacy concept, with the developer's reason
- Run the adversarial check internally before showing any section (untestable criteria, `CONTEXT.md` conflicts, contradictions with existing scopes) — fix first, then present.
- **Final review** → on confirmation, **write this window's scope to disk now** — `specs/Project-Scope/<NNNN>-<stem>.md` plus its `checklists/`, `source-references.md`, and copied `screens/` (and `schema-mapping.md` if `--db`) — and update `CONTEXT.md` with any terms defined this session.

**Stage 3 — Advance.** The scope file is **persisted before moving on** — never deferred to the end of an `--all` sweep — so an interrupted run keeps every already-finished scope. Announce the written scope (with its `<NNNN>-<stem>` path), then (in `--all`) name the **next** window and return to Stage 1. In single-window mode, stop. On resuming a `--all` sweep, skip windows whose `<NNNN>-<stem>.md` already exists (or note and continue from the next unwritten one).

## Operating Constraints

- **Markdown in, Markdown out.** Input is the converted `.md` under `pre-convert/`; output is scopes under `specs/Project-Scope/`. This command never re-reads or re-saves binary WinDev elements — that's `/wxConversion`.
- **Window-seeded, call-followed.** Only `*.wdw.md` seeds a scope. `.wdg.md` / `.wdc.md` are reached by following calls. Follow the call graph — don't flatten the directory. A converted file nothing reaches is out of the current scope (note it; it gets covered when its own window pulls it in).
- **One window at a time.** In `--all`, fully finish and approve one window's scope before starting the next. Never batch windows or run two ahead of the developer.
- **Cite your source.** Every observation references `file:line` or `procedure/method-name`, traceable back to the original element by name.
- **Surface, don't decide.** Flag dead code, hardcoded values, unresolved calls, and KEEP/MODERNIZE/DROP; the developer chooses.
- **wxKanban DB rules are Postgres-only.** In any mapping doc, never impose plural/lowercase/no-underscore naming or UUID-v7 PKs on a non-Postgres target.

## Output (per window)

**Naming.** Each scope is named after the window file's stem — the part **before `.wdw.md`** — preserved verbatim (no kebab-casing, no rename), prefixed with a **4-digit sequence** starting at `0001` and incrementing per window processed: `<NNNN>-<stem>`. Example: `WIN_Invoice.wdw.md` → `0001-WIN_Invoice`; the next window → `0002-<its-stem>`. In `--all`, the sequence follows the processing order you listed at preflight. (If `specs/Project-Scope/` already holds `NNNN-*` entries, continue from the highest existing number.)

- `specs/Project-Scope/<NNNN>-<stem>.md` — the scope for the window and everything its call graph reaches.
- `specs/Project-Scope/<NNNN>-<stem>/checklists/requirements.md` — quality checklist.
- `specs/Project-Scope/<NNNN>-<stem>/source-references.md` — every scoped requirement mapped back to the converted `.md` (and through it to the original `.wdw/.wdg/.wdc`) by name + line range, **plus the list of unresolved / out-of-scope call edges**.
- `specs/Project-Scope/<NNNN>-<stem>/screens/*` — UI images copied from `pre-convert/screens/`, when present.
- `pre-convert/schema-mapping.md` — *(only with `--db`, or on explicit opt-in)* HFSQL → target-DB mapping for the tables this window's graph touches, with KEEP/MODERNIZE/DROP verdicts and migration notes. **A planning document only — no database is built or loaded.**

## Exit conditions

- **Single window:** one finished, approved Scope-of-Project document (+ checklist + source-references, + schema-mapping if `--db`).
- **`--all`:** one scope per `*.wdw.md` in `pre-convert/`, each gathered and BuildScope-completed in turn, with a closing summary listing every scope produced and any windows skipped (and why).

## Context

{{args}}
