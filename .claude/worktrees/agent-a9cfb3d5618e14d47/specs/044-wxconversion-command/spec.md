# Spec 044: wxConversion Orchestrator Command

## Overview

Add a new orchestrator command, `wxkanban-agent wxconversion`, that makes the existing **wxConversion — WinDev Conversion Analyst** skill a first-class, stage-gated kit capability. The command is **Design-stage gated** and does **not** require a verified spec — it exists to *produce* the conversion scope, so it cannot demand one first.

Consistent with the kit's "workflow engine, not AI client" rule, the command runs **no kit-internal AI**. Its handler scaffolds the conversion workspace and hands off to the developer's editor AI, which runs the skill. On invocation in the Design phase the handler: (1) creates the `pre-convert/` and `pre-convert/screens/` working directories in the consumer project if absent; (2) installs the `wxConversion-analyst` skill into the consumer's `.claude/` from the kit template (consumer-owned after install; not overwritten on re-run unless `--force`); (3) prints next-step instructions telling the developer to invoke the skill in their editor; (4) exits 0. It writes no scope content itself — the editor AI does that by following the skill.

The command is exposed on **both** the CLI surface (`wxconversion`) and the hosted MCP surface (`project.wxconversion`), under the same Design-stage gate. The skill ships in the kit at `wxkanban-agent/templates/skills/wxConversion-analyst.md` (mirroring `wxICA`), and the `_wxAI/commands/wxConversion.md` entry point is the consumer-side slash command.

## Amendment (2026-06-09) — Two-stage split: conversion vs. scoping

The single end-to-end command was split into **two stages** so the mechanical one-shot conversion is separate from the slow, gated, judgment-heavy scoping pass:

1. **`/wxConversion`** — **source → Markdown only** (skill Step 2 / Part A): switch to text saves, process `.wdw/.wdg/.wdc` into `pre-convert/`, capture screenshots. It stops there.
2. **`/wxConversionScope`** *(new consumer-side slash command)* — the **scoping stage**: seed from one window's `*.wdw.md` (or `--all` to sweep every window), **follow each call** into the `.wdg.md` / `.wdc.md` it reaches, **analyze the matching screenshot** for field mapping, then run the **BuildScope gated section-by-section method** to completion — one window at a time — emitting one Scope-of-Project per window.

**Naming convention (new):** converted files **keep the element extension** — `WIN_Invoice.wdw` → `WIN_Invoice.wdw.md` — so the scoper can distinguish windows (scope seeds) from procedures/classes (followed into) and recover the `<stem>` to pair the screenshot. Each scope is named **`<NNNN>-<stem>`** (4-digit sequence from `0001`, stem = filename before `.wdw.md`, preserved verbatim).

**Orchestrator impact: none beyond docs.** `/wxConversionScope` needs **no new `Capability`, gate row, CLI/MCP surface, dispatch case, or handler**. The kit's command gateway auto-discovers `_wxAI/commands/*.md` by frontmatter, and the scoping pass is editor-AI-driven via the **already-installed skill** (the workspace + skill were scaffolded by the prior `/wxConversion` run). The kit changes are limited to syncing the skill template and the existing handler's hand-off text. See FR-008 and FR-009.

## Business Problem

WinDev→AI-dev conversion is the marketing beachhead (smart career-changers migrating PCSoft applications). The wxConversion skill already exists and encodes the full conversion workflow, but it is **invisible to the orchestrator**: it isn't stage-gated, doesn't appear in `wxkanban-agent --help`, isn't reachable via MCP, and consumers never receive it. The conversion workflow is therefore undiscoverable and un-distributed. This scope wires the skill into the orchestrator so the conversion entry point is discoverable, phase-correct (Design only), and shipped to consumers like every other kit command — without the orchestrator ever running the AI analysis itself.

## Actors

- Primary: the developer converting a WinDev application, working in VS Code with their editor AI.
- Secondary: the orchestrator (`wxkanban-agent`) which gates the command to the Design phase and scaffolds the workspace; the kit distribution which ships the skill template to consumers; the editor AI which runs the skill after hand-off.

## Success Metrics

1. In a Design-stage project, `wxkanban-agent --help` lists `wxconversion`; running it scaffolds `pre-convert/` + `pre-convert/screens/`, installs the skill into `.claude/`, and exits 0 with printed next steps.
2. In any non-Design stage, both `wxkanban-agent wxconversion` and the `project.wxconversion` MCP tool are blocked with the standard stage reason string.
3. Re-running `wxconversion` after the developer edits the installed skill does not clobber it (no `--force`); with `--force` it re-installs from the template.
4. The handler performs zero AI calls and zero DB/SQL/data operations — verified by the handler having no such imports or code paths.

## Scope Boundary

IN: a new `Capability.WxConversion` + gate row (Design only, `requiresVerifiedSpec: false`); the CLI surface mapping `wxconversion → Capability.WxConversion` and its adapter-test row; the MCP tool `project.wxconversion → Capability.WxConversion` (displayName `wxconversion`) and its adapter-test row; the `WorkflowEngine.dispatch` case plus a runner method; a new `command-handlers/wxconversion.ts` handler that scaffolds `pre-convert/` + `pre-convert/screens/` and installs the skill into `.claude/` (with `--force` re-install); shipping the skill at `wxkanban-agent/templates/skills/wxConversion-analyst.md`; the `_wxAI/commands/wxConversion.md` entry point (already authored).

## Out of Scope

The skill's own conversion logic and content (not re-specified here); any kit-internal AI execution of the analysis; the source-to-Markdown processing and scope drafting — which happen interactively inside the skill, driven by the editor AI, not by the orchestrator handler. **(2026-06-09)** the scope drafting now runs under the separate `/wxConversionScope` slash command (still editor-AI-driven); a new orchestrator capability/handler for it is explicitly **out of scope** (see Amendment).

**Skill scope clarification (revised 2026-06-02):** the wxConversion skill produces **Markdown files only** — readable source, scope docs, and (optionally) a Markdown HFSQL → target-DB *mapping* document. The database conversion is **opt-in**: the skill asks first and skips it on "no". It does **not** extract data, convert/execute SQL against a live DB, create schemas, or load data — building the target database is downstream implementation work outside this skill.

## Open Questions

None. All decisions were resolved interactively on 2026-06-01: handler behavior = scaffold workspace + hand off (no kit AI); Design-stage gate with no spec requirement; MCP `project.wxconversion` included (initial defer reversed on review).

## Functional Requirements

### FR-001 — Register the wxConversion capability, Design-gated

A new `Capability.WxConversion` MUST be added with a gate row allowing only the **Design** phase and `requiresVerifiedSpec: false`. The existing module-load drift assert and the "every Capability has exactly one gate row" test MUST pass unchanged.

**Acceptance Criteria**:
- [ ] `wxconversion` is allowed in Design and blocked in every other phase with the standard reason string.
- [ ] The capability/gate drift assert in `capabilities.ts` stays green.

### FR-002 — CLI surface + discoverability

The CLI adapter MUST map the surface name `wxconversion` to `Capability.WxConversion`, and the command MUST appear in `wxkanban-agent --help` when the project is in the Design stage. The adapter test's `PAIRS` MUST gain a `wxconversion → Design` row.

**Acceptance Criteria**:
- [ ] In Design, `wxkanban-agent --help` lists `wxconversion`.
- [ ] `evaluateStageOnly(Design, 'wxconversion').allowed === true`; cli-adapter test passes.

### FR-003 — Dispatch + scaffold handler (no kit AI)

`WorkflowEngine.dispatch` MUST route `wxconversion` to a runner that calls a new `command-handlers/wxconversion.ts`. The handler MUST: (a) create `pre-convert/` and `pre-convert/screens/` in the consumer root if absent; (b) install the `wxConversion-analyst` skill into the consumer's `.claude/` from the kit template (consumer-owned after install; not overwritten on re-run unless `--force`); (c) print next-step instructions for the editor AI; (d) exit 0. The handler MUST NOT call any AI.

**Acceptance Criteria**:
- [ ] Running `wxconversion` in Design creates the two dirs, installs the skill file, prints instructions, exits 0.
- [ ] A re-run without `--force` leaves an edited installed skill untouched; `--force` re-installs from the template.
- [ ] Dispatch no longer returns "No handler registered" for `wxconversion`.

### FR-004 — Ship the skill in the kit

The skill MUST be shipped at `wxkanban-agent/templates/skills/wxConversion-analyst.md` (mirroring `wxICA`) so consumers receive it via the install path the handler reads.

**Acceptance Criteria**:
- [ ] The template file exists and is the source the handler copies from; content matches the authored skill.

### FR-005 — Scope boundary enforced in behavior

The command MUST stay within "scaffold + hand off": it performs filesystem scaffolding and skill install only, never code porting, schema conversion, or data migration. The installed skill itself is **Markdown-only** — it documents the conversion (incl. an optional, opt-in HFSQL → target-DB mapping document) but never builds or loads a database.

**Acceptance Criteria**:
- [ ] No DB connection, SQL execution, or source-to-Markdown processing happens in the handler; those remain skill-driven.

### FR-006 — Out-of-band guard for the gate

`wxconversion` MUST NOT be added to the spec-gated command set (it does not require a verified spec) and MUST NOT appear as a cross-cutting "all phases" capability.

**Acceptance Criteria**:
- [ ] `isSpecGatedCommand('wxconversion') === false`.
- [ ] The command is absent from non-Design stages' allowed lists.

### FR-007 — MCP tool `project.wxconversion`, Design-gated

The MCP adapter MUST register `project.wxconversion` in `MCP_TOOL_MAP` mapping to `Capability.WxConversion` with displayName `wxconversion`, so the editor can trigger the command through the hosted MCP surface under the same Design-stage gate as the CLI. A matching row MUST be added to the mcp-adapter test.

**Acceptance Criteria**:
- [ ] `enforceTool(db, projectId, 'project.wxconversion')` is allowed only in Design and gated elsewhere.
- [ ] The tool resolves to the scaffold handler path; mcp-adapter test passes.

### FR-008 — `/wxConversionScope` scoping slash command (Amendment 2026-06-09)

The kit MUST ship a consumer-side slash command `_wxAI/commands/wxConversionScope.md` that runs the **scoping stage** on already-converted Markdown: seed from one `*.wdw.md` window (or `--all` to sweep every window in `pre-convert/`, one at a time), **follow each call** into the `.wdg.md` / `.wdc.md` it reaches (tracking visited units so recursion terminates; surfacing unresolved/external edges rather than guessing), **locate and analyze the matching `<stem>` screenshot** to derive a control → code → data-column field mapping, then run the **BuildScope gated section-by-section method to completion** before advancing to the next window. The command MUST NOT add a new `Capability`, gate row, CLI/MCP surface, dispatch case, or orchestrator handler — it is auto-discovered by the command gateway from `_wxAI/commands/*.md`, and the scoping pass is editor-AI-driven via the skill already installed by `/wxConversion`. `/wxConversion` itself is correspondingly trimmed to **Part A only** (source → Markdown + screenshots); it hands off to `/wxConversionScope`.

**Acceptance Criteria**:

- [x] `_wxAI/commands/wxConversionScope.md` exists with frontmatter `description`, so the gateway lists it automatically (no registry edit).
- [x] No `Capability.WxConversionScope`, gate row, CLI/MCP mapping, dispatch case, or handler is added.
- [x] `_wxAI/commands/wxConversion.md` is trimmed to Part A and points at `/wxConversionScope`.
- [x] `help.md` / `wxHelp.md` list both commands; conversion flow is `wxConversion → wxConversionScope → createspecs`.

### FR-009 — Extension-preserving filenames + `<NNNN>-<stem>` scope naming (Amendment 2026-06-09)

The skill's source→Markdown step (Part A / A2) MUST write each converted element **keeping its original extension** — `<name>.wdw.md` / `.wdg.md` / `.wdc.md` — not the extension-dropped `<name>.md`. Screenshots (A3) MUST be named by the window **stem** (`<stem>.<img-ext>`) under `pre-convert/screens/`, and A3 MUST ensure `pre-convert/screens/` exists. `/wxConversionScope` MUST name each produced scope `<NNNN>-<stem>` (4-digit sequence from `0001`; stem = the filename before `.wdw.md`, verbatim; continue from the highest existing `NNNN-*`).

**Acceptance Criteria**:

- [x] Skill A2 documents `<name>.wdw.md` naming and the reason (window-vs-procedure discrimination + stem recovery); kit template matches.
- [x] Skill A3 creates `pre-convert/screens/` and names images by stem; the handler also scaffolds both dirs.
- [x] Skill Step 3/Step 6 output paths use `<NNNN>-<stem>`; `buildscope.md` `--from-md` examples use `*.wdw.md`.

### FR-010 — Part B conversion-safety guardrails + pre-mapping interview (Amendment 2026-06-13)

The optional HFSQL → target-DB mapping (Step 2 / Part B, reached via `/wxConversionScope --db`) MUST be **faithful by default** and MUST run a short interview **before** writing `pre-convert/schema-mapping.md`. The mapping document defaults to a verbatim, 1:1 translation of the legacy schema; any deviation is opt-in, per item, and traceable to a developer answer.

Two standing rules govern the mapping, for **every** target (including PostgreSQL):

- **Rule 1 — No schema changes unless specified.** Tables, columns, relationships, and structure are preserved as found in the source DDL. The mapping does not add, drop, split, merge, or restructure anything on its own.
- **Rule 2 — No field-name changes unless specified.** Table and column names are kept verbatim (including French names). French→English renames and the wxKanban Postgres naming conventions (plural/lowercase/no-underscores, UUID-v7 PKs, `<parent>id` FKs) are **no longer auto-applied** — they are surfaced as *opt-in suggestions* the developer may accept per table/column, never imposed.

Before producing the mapping, Part B MUST ask, one question at a time (BuildScope discipline):

- **Data types** — present the distinct HFSQL data types observed across the in-scope tables (the actual list, deduplicated), and ask whether any need to change for the target. Default is the faithful type cheat-sheet mapping with no alteration. If the developer says yes, capture the desired target type **per source type to change** and apply only those.
- **Missing primary key** — for each in-scope table whose source DDL specifies **no primary key**, ask what the primary key should be, or accept **none** (the table is mapped keyless, recorded explicitly). The skill does not invent or auto-add a surrogate key.

**Acceptance Criteria**:

- [x] Skill Part B states Rules 1 & 2 (preserve-by-default for all targets) and reframes the Postgres conventions + French→English renames as opt-in suggestions, never auto-applied.
- [x] Part B lists the distinct HFSQL types in use and asks whether any need changing; only developer-specified type changes are applied, else the faithful cheat-sheet mapping is used.
- [x] For each in-scope table with no PK in the source DDL, Part B asks for a PK or accepts none (recorded explicitly); no surrogate key is invented.
- [x] `wxConversionScope.md` `--db` documents the preserve-by-default stance and the pre-mapping interview; guardrails apply to Part B only.

### FR-011 — Stage 3 source-fidelity parser, with an operator escape hatch (Amendment 2026-10-25)

Source: feedback `2634b849` and the isolated parser package from its reporter (ShopMaster, `E-issues/stage3-2026-10-25/`, built against generator SHA-256 `f38b62bf…`, which every shipped copy matched). Owner chose option **B** on 2026-10-25: take the reporter's patch, plus an escape hatch and restored guidance.

`pcsoft-schema-to-sql.py` MUST keep every source row, never silently absorb or drop one, and refuse to emit DDL while anything is unresolved — but every refusal a developer can answer MUST be answerable with `--type-map`.

1. **Source fidelity (the reporter's patch).** Array, JSON and UUID declarations are recognised as their own records (with dimensions, element type, width, format and default annotations) independently of TYPEMAP; wrapped array continuations stay with their field; a caption and type joined into one PDF text run are split only on an exact scalar suffix; every field carries its source identity (Markdown line span, PDF pages, printed and canonical name, raw type). Unknown, incomplete, unmapped, name-unresolved, name-colliding, boundary-ambiguous and ambiguous-relationship rows are diagnostics that block emission (exit 3), written to `_unmapped-types.json` (`diagnosticsVersion: 2`) through the redactor.
2. **Operator escape hatch.** `--type-map` also maps Array, JSON and UUID source types, by exact printed label (`"Array of 7 Time (hhmm)=text"`; the label with or without its format annotation) or by family (`"Array=<key>"`, `"JSON=<key>"`, `"UUID=<key>"`; an exact label wins over its family). The mapped field keeps its source descriptor and records `mapping_status: "operator"` and the label that matched; it no longer raises `TARGET_MAPPING_UNRESOLVED`. Keys are the existing TYPEMAP keys; no new target representation is introduced.
3. **Guidance restored.** The refusal again tells the developer what to do: each distinct unmapped type label with a ready-to-paste `--type-map "<label>=<key>"` line, the family shortcut, the valid keys, a count of name problems pointing at `_unmapped-types.json`, and the reminder to file confirmed mappings to wxKanban.
4. **Composite keys are not names.** A composite key's own name is never emitted (indexes are named from table + member columns), so composite-key pseudo-items are excluded from `CANONICAL_NAME_COLLISION`. Column collisions still block.

**Acceptance Criteria**:

- [x] The reporter's patch is applied unchanged in substance to all three skill copies (`.claude/wxConversion`, `_wxAI/skills/wxConversion`, `wxkanban-agent/templates/skills/wxConversion`), which stay byte-identical; their 21 boundary tests run from `scripts/`. (Applied file hashed to the reporter's patched SHA-256 `be9b2720…` before our changes.)
- [x] `--type-map "Array=text"` clears every array's `TARGET_MAPPING_UNRESOLVED`; an exact label beats the family; JSON and UUID families work the same way.
- [x] The exit-3 message lists each unmapped label with its `--type-map` line and the valid keys.
- [x] Two composite keys sharing a truncated name do not block; two columns sharing a name still do.
- [ ] The full skill test suite passes (241 pass; the one failure, `test_module_imports_without_pymupdf`, is a pre-existing test-order artifact that also fails on the unpatched generator and passes alone); the ShopMaster reporter is told what shipped.

### FR-012 — Native PostgreSQL array/json/uuid target types (Amendment 2026-11-08)

Source: feedback `2634b849` (ShopMaster), via a follow-up type-mapping specification dropped at
`Bugs/Adrian/` — `CONVERTER-COMPATIBILITY.md`, `TYPE-MAPPING-SPECIFICATION.md`, and
`field-type-mapping.json` (282 fields across 40 tables, built against the converter's current
SHA-256, confirmed matching). FR-011 bullet 2 currently states "Keys are the existing TYPEMAP
keys; no new target representation is introduced" — this amendment supersedes that sentence **for
the PostgreSQL dialect only**. Every other FR-011 behavior (source fidelity, the refusal-until-
resolved gate, the operator escape hatch's label/family matching) is unchanged and still applies.

1. **New native TYPEMAP[postgres] keys.** Add `integer[]`, `bigint[]`, `boolean[]`, `date[]`,
   `time[]`, `numeric[]`, `varchar(n)[]`, `json`, and `uuid` to the PostgreSQL TYPEMAP only. No
   other dialect's TYPEMAP changes.
2. **Array rendering.** `col_type()` renders an array target from the field's retained element
   descriptor and `dimensions[0]` (e.g., `Array of 7 Time (hhmm)` → `time[]`), instead of refusing
   or falling back to a scalar key, when the resolved key is one of the new native array keys.
3. **Bounds and unsigned-range metadata.** Field-level bounds and unsigned-range metadata already
   captured by FR-011's source-fidelity parsing carry through into the emitted native type where
   the target supports it (e.g., `numeric(p,s)`); `numeric[]` renders unconstrained precision/scale
   per the type-mapping specification, not a guessed default.
4. **The refusal gate is not relaxed.** A field still blocks emission (exit 3) while its source
   attributes are incomplete (nullability, lower bound, precision/scale, empty sentinels) — this
   amendment only adds what a *resolved* Array/JSON/UUID field renders as; it does not change when
   emission is allowed to proceed.
5. **Operator escape hatch extended, not replaced.** `--type-map` by exact label or family (FR-011
   bullet 2) may now also target the new native keys, in addition to the existing scalar keys.

**Acceptance Criteria**:

- [ ] `TYPEMAP[postgres]` includes the nine native keys listed above; every other dialect's TYPEMAP
  is byte-identical to before this amendment.
- [ ] `col_type()` emits correct native array syntax (`<type>[]`) with the right element type and
  dimension width for each of the nine families.
- [ ] `numeric[]` renders with unconstrained precision/scale, per the type-mapping specification.
- [ ] A field with incomplete source attributes still exits 3 — this amendment adds no new
  emission path around the existing refusal gate.
- [ ] `--type-map` can target each new native key by exact label or family, same matching rules as
  FR-011.
- [ ] `test_stage3_operator_mappings.py` and `test_boundaries.py` gain coverage for each new
  family: dimension/width preservation and the NULL vs. empty vs. NULL-element distinction.
- [ ] The change is applied unchanged in substance to all three skill copies
  (`.claude/wxConversion`, `_wxAI/skills/wxConversion`, `wxkanban-agent/templates/skills/wxConversion`),
  which stay byte-identical.
- [ ] The ShopMaster reporter (feedback `2634b849`) is told what shipped.

**Found while applying (fixed):** the reporter's patch retained a `#`-joined line that is not a composite key as a record, which swallowed the following field (`Status` lost, a phantom `String` field created — `test_0a922271`, excluded from the reporter's run because it emits DDL). Such a line is now kept as an annotation on the previous field, the same rule the patch applies to every other stray line. The reporter's `test_unmapped_scalar_override_cannot_flatten_array` encoded the opposite of decision B; it now asserts what still holds (an override does not change fields already parsed).
