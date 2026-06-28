---
name: cwConversion
description: >-
  Convert a legacy SoftVelocity / PCSoft **Clarion** desktop application into a modern React +
  Tailwind + shadcn/ui rebuild scaffold by parsing its raw source — the dictionary text export
  (.txd), the application text export (.txa), and any hand-coded Clarion modules (.clw/.inc/.equ).
  Use this when a developer has a Clarion app (Clarion 6 through 11) and wants per-element Markdown,
  regenerated stack-native page components (Clarion WINDOW controls → shadcn, with embed code wired
  as handler stubs), a target-DB schema + ER diagram from the dictionary, a queries scope from the
  VIEW/browse definitions, a server/business-logic scope from procedures and embeds, and a reports
  stub from REPORT structures. It is deterministic and token-efficient: the heavy mechanical work
  runs in bundled Python scripts, the model orchestrates and reviews.
---

# cwConversion — Clarion source (TXA/TXD/.clw) → modern rebuild scaffold

This skill is **self-contained**: the full methodology is below. You do **not** need
`project.get_command_prompt` or the wxKanban MCP to run it — the pipeline is six deterministic Python
scripts plus a renderer (all in this skill's `scripts/`), and this file is the instruction set. When
the conversion is complete, hand off to **`/wxConversionScope`** to turn the artifacts into
Scope-of-Project documents (it is source-agnostic and works on the `rebuild/` output regardless of
whether the legacy stack was WinDev or Clarion).

> **Sibling skill:** `wxConversion` does the same job for PCSoft **WinDev/WebDev** apps starting from
> a generated technical-documentation **PDF**. `cwConversion` is the **Clarion** counterpart and
> starts from **raw text source** instead. Same outputs, same `pre-convert/` → `rebuild/` shape, same
> "surface, don't decide" posture — only the front-end parsers differ.

## What this skill produces (summary)

From a Clarion app's text exports plus its hand-coded modules:

- **`pre-convert/`** — one Markdown file per element: `*.table.md` (one per dictionary FILE),
  `*.page.md` + `*.controls.md` (one per PROCEDURE that owns a WINDOW), `*.report.md` (one per
  PROCEDURE that owns a REPORT), `*.view.md` (VIEW/browse query definitions), `*.proc.md`
  (procedures, routines, class methods, and global/local embed code = the business-logic layer),
  `_schema.md` (dictionary relations), `_project.md` (app overview / procedure tree / module list),
  `index.md` (manifest), and `_discarded.md` (blocks not captured — **review before discarding**).
- **`rebuild/pages/*.tsx`** — modern React + Tailwind + shadcn/ui components, one per WINDOW, with
  Clarion embed code wired as `async function on<Control>()` handler stubs (original Clarion kept as
  comments + TODO).
- **`rebuild/db/`** — `schema.<dialect>.sql` (CREATE TABLE + FK constraints from the dictionary) and
  `ER-diagram.md` (Mermaid erDiagram + per-table field reference + the TopSpeed/ISAM → SQL migration
  note).
- **`rebuild/scopes/`** — `VIEW-queries-scope.md`, `PROC-procedures-scope.md`,
  `RPT-reports-stub.md`.
- **`rebuild/COMPONENT-GAPS.md`** and previews under `scratch-render/`.

## A note on the parsers (read this once)

Clarion's TXA/TXD text format and the `.clw` window/structure language are **stable in their
backbone** (bracketed `[SECTION]` markers; the `WINDOW … END` / `REPORT … END` control language;
`USE(...)`, `AT(...)`, `FROM(...)` attributes) but **vary in detail across Clarion 6 → 11** and across
template sets (ABC vs Legacy/Clarion templates, third-party templates). These scripts are a strong
first cut against the common grammar. Treat unrecognized blocks the way `wxConversion` treats unmapped
breadcrumb Types: they land in `_discarded.md` with a console warning so you can **surface them to the
developer and extend the parser's keyword tables** rather than silently dropping them. Never assume
"the script ran, so everything converted" — always read `_discarded.md` and the run summary.

## Prerequisites

- **Python 3** (standard library only — no PyMuPDF needed; Clarion source is already text).
- **Node** with **puppeteer** for page previews (`render.mjs`).
- On Windows, prefix Python commands with `PYTHONUTF8=1` if console encoding errors appear (Clarion
  exports are frequently Windows-1252).
- Run all scripts with the **project root** as the working directory. `<skill>` below = this skill's
  directory.

### Getting the inputs from a Clarion developer

Binary `.app` and `.dct` are **not** text-parseable; Clarion exports them losslessly:

- **Dictionary → `.txd`:** open the dictionary, **File → Export** (a.k.a. "Export Dictionary to a
  text file"). Yields the FILE / FIELD / KEY / RELATION model.
- **Application → `.txa`:** in the IDE, **Application → Export Application as text** (older: "Selective
  Export") → a `.txa` with `[PROCEDURE]` blocks containing `[WINDOW]` / `[REPORT]` structures,
  `[DATA]`, `[CODE]`, and `[EMBED]` points (the embedded Clarion you hand-wrote).
- **Hand-coded modules:** any `.clw` / `.inc` / `.equ` files the project keeps as source (members,
  global maps, classes, legacy hand-code).

Drop them anywhere consistent, e.g. `conversion/src/<App>.txa`, `conversion/src/<App>.txd`, and
`conversion/src/*.clw`.

## Workflow

Run the stages **in order**, pausing to review output between stages.

### Stage 1 — Split the source into per-element Markdown
`scripts/clarion-app-split.py` parses the `.txd` (dictionary) and `.txa` (application), groups by
element, and writes one Markdown file per element under `pre-convert/`. PROCEDUREs are classified by
**what structure they own** — a PROCEDURE with a `WINDOW` becomes a `*.page.md` (+ a faithful
`*.controls.md` sidecar holding the raw control list), a PROCEDURE with a `REPORT` becomes a
`*.report.md`, and procedures/routines/methods plus all embed code become `*.proc.md`. Dictionary
FILEs become `*.table.md`; relations land in `_schema.md`. `.clw` modules are scanned for
`PROCEDURE`/`ROUTINE`/`MAP`/`CLASS` declarations and any window/report structures they define directly.

```bash
python <skill>/scripts/clarion-app-split.py \
  --txa conversion/src/<App>.txa --txd conversion/src/<App>.txd \
  --clw "conversion/src/*.clw" --out pre-convert
```
**Input precedence (prefer the clean exports, fall back to generated source):** the splitter uses the
`.txd` for the dictionary and the `.txa` for procedures when you pass them; if either is **absent** it
automatically falls back to the generated `.clw` set — parsing the inline `name FILE,DRIVER(...),PRE()
… RECORD … END` dictionaries and the top-level `Name PROCEDURE` elements (ABC class-method prototypes
inside `CLASS … END` and dotted method bodies are correctly kept with their owner, not split out). So
a project handed over as just a binary `.app`/`.dct` plus its generated `.clw` files converts with
`--clw "<dir>/*.clw"` alone. Review `pre-convert/index.md` (the manifest). Re-runs skip elements already written. Use `--dry-run`
to preview grouping without writing.

**Review what was not captured.** Any `[SECTION]` or PROCEDURE whose kind the splitter can't classify
is appended to `pre-convert/_discarded.md` (grouped by the raw section/keyword, with source line
ranges) and printed as a `NOT CAPTURED` warning. Most entries are export boilerplate
(`[APPLICATION]` headers, `[COMMON]`, dictionary option blocks) — but if any names a real element
kind (a procedure with UI, a report, a class of business logic), it was **not** converted because its
keyword is unmapped. **Open `_discarded.md`, surface it to the developer, and ask whether to keep any
of it before continuing — never silently discard.** Note unmapped keywords so the splitter's
`SECTION_KIND` table can be extended in a follow-up.

### Stage 2 — Regenerate windows as modern stack components
For each `pre-convert/<PROC>.controls.md`, `scripts/clarion-window-to-react.py` parses the Clarion
`WINDOW … END` control language (nesting via `SHEET`/`TAB`/`GROUP`/`OPTION`/`MENUBAR`/`TOOLBAR … END`,
sibling order from source order and `AT(x,y,w,h)`), emits a **modern app-shell** React + Tailwind +
shadcn/ui component to `rebuild/pages/<PROC>.tsx`, and a Tailwind-CDN preview to
`scratch-render/<PROC>.preview.html`. It **wires behavior**: each embed handler attached to a control
(`EMBED … WHEN '?Ctrl' … ` blocks, plus `ACCEPTED`/`SELECTED`/`NEWSELECTION` events read from the
`.controls.md` and `.proc.md`) becomes an `async function on<Ctrl>()` stub with the original Clarion
as comments + a TODO, with `onClick`/`onChange` attached. Controls with no shadcn primitive are
flagged inline `{/* GAP: … */}` — see `references/clarion-gaps.md`.

```bash
for f in pre-convert/*.page.md; do p=$(basename "$f" .page.md); \
  [ -f "pre-convert/$p.controls.md" ] && \
  python <skill>/scripts/clarion-window-to-react.py --page "pre-convert/$p.controls.md" --out rebuild/pages; done
```
Preview a page: `node <skill>/scripts/render.mjs scratch-render/<PROC>.preview.html out.png`.

**Browse → data grid.** A Clarion `LIST,FROM(Queue),USE(?Browse)` backed by a `VIEW` is the app's
data-grid pattern. The generator emits a shadcn `Table` placeholder wired to the columns it can
recover from the `FORMAT('…')` string and the VIEW projection, and flags the data binding as a TODO —
this is a **GAP** (see `references/clarion-gaps.md`, "data grid"). **Picture tokens** (`@s30`, `@n9.2`,
`@d6`) are surfaced as the input's format/validation hint, not silently dropped.

### Stage 3 — Database schema + ER diagram
**Ask the developer two questions first:**
1. *Target database?* — PostgreSQL (default per `stack.md`), MSSQL, MySQL, Firebird, or **None**
   (already converted → only emit the ER doc).
2. *Keep field names/types faithful, or modify to the target's conventions?* Clarion field names carry
   a file **prefix** (`CUS:Name`). By default the prefix is stripped from the column name (kept in a
   comment) and the table named from the FILE; if "faithful", the prefixed name is preserved. If
   "modify", list each table's fields and collect per-table rename/type decisions before generating.

Then run `scripts/clarion-dict-to-sql.py --dialect <db>`. It parses the dictionary FILE/FIELD/KEY/
RELATION model (from `_schema.md` + `*.table.md`) into `rebuild/db/schema.<dialect>.sql` (CREATE TABLE,
PRIMARY KEY from the `PRIMARY` key, FK constraints from `[RELATION]`) and `rebuild/db/ER-diagram.md`
(Mermaid erDiagram + per-table field reference + migration note). Supported dialects: `firebird`,
`postgres`, `mssql`, `mysql`.

```bash
python <skill>/scripts/clarion-dict-to-sql.py --dialect postgres --out rebuild/db
```
**Tell the developer (TopSpeed/ISAM source):** Clarion data in `.tps`/`.dat`/Btrieve files can't be
read by the target DB directly. The robust path is a **small Clarion export procedure** (loop each file
`SET`/`NEXT`, write each record to JSON/NDJSON), which a loader then inserts using the generated DDL.
The migration gotchas (Clarion `DATE` = days since 1800-12-28; `TIME` = centiseconds since midnight;
Windows-1252 → UTF-8; `DECIMAL`/`PDECIMAL` sign/precision; empty-string vs NULL; FK load order; BLOB →
base64) are written into `rebuild/db/ER-diagram.md`.

### Stage 4 — Queries scope (VIEW / browse)
`scripts/clarion-views-to-scope.py` documents every `VIEW` structure and browse data source as ONE
scope (`rebuild/scopes/VIEW-queries-scope.md`): inferred purpose, the FILE(s) joined (from the VIEW
`JOIN`/`PROJECT`/relation), result columns, ORDER/filter, and any literal `PROP:SQL` / embedded SQL
strings found. A **reconstructed** SQL SELECT is derived from the dictionary FK graph when the VIEW
relies on dictionary relations rather than an explicit join.

```bash
python <skill>/scripts/clarion-views-to-scope.py --src pre-convert --out rebuild/scopes
```
**Surface this caveat:** Clarion VIEWs express joins via the dictionary's relations, not always as
literal SQL — the emitted SELECT is reconstructed from those relations and the VIEW projection, so
verify joins against the developer's intent.

### Stage 5 — Server / business-logic scope (procedures, routines, embeds)
`scripts/clarion-procs-to-scope.py` documents every `*.proc.md` as ONE backend scope
(`rebuild/scopes/PROC-procedures-scope.md`): a per-procedure summary (parameters from the `PROCEDURE(...)`
prototype, ROUTINEs, files touched via `Access:`/`Relate:`/`SET`/`GET`/`PUT`, other procedures called),
and a **callout** for any record-validation / referential-integrity logic that lived in the dictionary
or in `Update`/`Delete` embeds — the Clarion equivalent of triggers, which **have no UI and must be
ported to the API/server layer, not scaffolded as pages**. ABC `Hide:Access:` / `Relate:` calls are
recognized as the data layer.

```bash
python <skill>/scripts/clarion-procs-to-scope.py --src pre-convert --out rebuild/scopes
```

### Stage 6 — Reports stub
`scripts/clarion-reports-to-stub.py` documents every `*.report.md` as ONE rebuild stub
(`rebuild/scopes/RPT-reports-stub.md`): per report, the page format (`AT`/paper from the `REPORT`
header), bands present (`HEADER`/`DETAIL`/`FOOTER`/`BREAK`/`FORM`), the data source (the VIEW or FILE
the print loop walks), and the print-time embeds. Clarion reports are band/structure layouts driven by
a `Process`/`Print` loop, so this is a **stub**: move the print-time data assembly into an
**API/server data-prep step**, then render with a React PDF/print component (`@react-pdf/renderer` or
a print-CSS route; barcodes via `bwip-js`/`jsbarcode`). If the app has no reports, the script still
writes the stub recording that.

```bash
python <skill>/scripts/clarion-reports-to-stub.py --src pre-convert --out rebuild/scopes
```

### Review / re-sync
After the generation stages — and any time the **source changes** or you re-split — compare
`pre-convert/` (source) against `rebuild/` (generated) before handing off. Re-run Stage 1 with the
updated source; the splitter reports added/changed elements, and each generator skips up-to-date
outputs. Read `_discarded.md` again. Present anything **missing / stale / orphaned** to the developer
as choices (regenerate / keep / delete) — never auto-apply.

### Handoff — scope generation
When conversion is complete, hand off to **`/wxConversionScope`**. It acts as a Systems & Business
Analyst and turns these artifacts into Scope-of-Project documents — one per page/report plus overall
Program, Database, and Backend/API scopes — BuildScope-style and **resumable**. This conversion stage
does not write scopes itself.

## Operating principles

- **Modernize, don't replicate 1:1.** Same data and behavior, but a clean idiomatic React/shadcn
  arrangement (app-bar, top nav, toolbars, Cards, Dialogs, a real data grid for browses) is preferred
  over pixel-matching the Clarion `AT()` layout.
- **Surface, don't decide.** Flag picture-token formats, component gaps, reconstructed joins,
  dictionary prefixes, validation/trigger logic, and anything in `_discarded.md` for human review
  rather than silently guessing or dropping.
- **Faithful by default for data.** Keep legacy file/field names and types verbatim (prefix in a
  comment) unless the developer explicitly opts into modernization.
- **Embeds are logic, not layout.** Clarion embed code is the business logic — port it to handlers and
  the server layer; do not try to recreate the embed-point execution order in React.

## Resources

### scripts/
- `clarion-app-split.py` — `.txa`/`.txd`/`.clw` → per-element Markdown under `pre-convert/` (Stage 1).
- `clarion-window-to-react.py` — `<proc>.controls.md` → modern `.tsx` + preview, embeds wired (Stage 2).
- `clarion-dict-to-sql.py` — dictionary FILE/FIELD/KEY/RELATION → DDL + ER diagram, multi-dialect (Stage 3).
- `clarion-views-to-scope.py` — `*.view.md` → one queries scope with reconstructed SQL (Stage 4).
- `clarion-procs-to-scope.py` — `*.proc.md` → one server/business-logic scope, validation flagged (Stage 5).
- `clarion-reports-to-stub.py` — `*.report.md` → one reports rebuild stub (Stage 6).
- `render.mjs` — puppeteer HTML→PNG renderer for previewing generated pages.

### references/
- `clarion-gaps.md` — Clarion control → React/shadcn mapping, picture-token reference, Clarion type →
  SQL map, and OSS-vs-paid React library recommendations for controls with no shadcn/ui equivalent
  (data grid, rich-text, charts, file upload, image).
