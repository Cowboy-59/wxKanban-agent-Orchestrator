# wxConversion — PCSoft doc PDF → modern rebuild scaffold

## Overview

Reverse-engineer a PCSoft (WinDev / WebDev / WLanguage) application from its **generated technical
documentation PDF** into a modern rebuild scaffold. The PDF is far easier to obtain from a client
than a text-saved source project, and a single PDF (often 1000+ pages) contains the windows/pages,
their controls, the WLanguage event code, the HFSQL data model, the SQL queries, the server/global
procedure sets (incl. HFSQL triggers), and the reports. The pipeline is six deterministic Python
scripts plus a renderer (all in this skill's `scripts/`); the model orchestrates and reviews while
the scripts do the mechanical extraction, so token cost stays low even on huge documents.

## When to use

Use when a developer provides a PCSoft **Technical Documentation** PDF and wants any of: per-element
Markdown, regenerated React/Tailwind/shadcn page components, a target-DB schema + ER diagram, a
queries scope, or a reports stub. It works from the generated documentation PDF, not the `.wdw/.wdg/.wdc` source project.

**Raw source is out of scope — refuse it.** If the developer supplies `.wdw`, `.wdg`, `.wdc`,
`.wdr`, `.wdp` or any other text-saved PCSoft source instead of the PDF, **stop and say so**: none
of the six stages below can read those files, and improvising a reading of them produces confident,
wrong results (procedures silently dropped on invented "disabled" markers). Ask the developer to
generate the Technical Documentation export from the WinDev/WebDev IDE and re-run with the PDF. Do
not partially convert from source "to get started", and do not answer questions about individual
source-file attributes by guessing at their meaning.

## Inputs and outputs

- **Input:** one PCSoft technical-doc PDF (e.g. `conversion/docs/<App>_Documentation.pdf`).
- **Working Markdown:** `pre-convert/` — one `.md` per element (`*.table.md`, `*.page.md`,
  `*.qry.md`, `*.report.md`, `*.proc.md`, `_project.md`, `_schema.md`, `index.md`) plus
  `*.controls.md` sidecars, and `_discarded.md` (pages not captured — review before discarding).
- **Rebuild scaffold:** `rebuild/pages/*.tsx`, `rebuild/db/*`, `rebuild/scopes/*`,
  `rebuild/COMPONENT-GAPS.md`; previews in `scratch-render/`.

## Stack & Style targeting (SPEC-056)

**Before running any stage, read `stack.md` at the repo root if it exists.** Conversion produces two
kinds of output, and the declared stack governs only the second:

- **Stack-independent — always produced.** The `pre-convert/` per-element Markdown, `_schema.md`, the
  target-DB schema + ER diagram, the queries and reports scopes, `index.md`, `_discarded.md`. These
  capture the legacy application's *behavior*, which is the durable value of a conversion and is worth
  exactly the same whatever the rebuild is written in.
- **Stack-specific — conditional.** The regenerated page components in `rebuild/pages/`. Stage 2's
  generator emits **React + Tailwind + shadcn/ui `.tsx`**. Run it when `stack.md` declares a
  React-family frontend (React, React + Vite, Next.js, React Native) **or when no `stack.md` exists** —
  the historical default, so behavior is unchanged for every project that has not captured a stack.

If `stack.md` declares a **non-React** frontend (WPF/XAML, WinForms, Blazor, Angular, Vue, Svelte,
Flutter, native mobile, …), **do not emit `.tsx` that you already know does not match the target.**
Say so once, run every other stage normally, and record the skip in `rebuild/COMPONENT-GAPS.md` so it
stays visible. Handing a WPF team React components is not a head start — it is work they must first
recognize as wrong and then throw away, and it makes the conversion look less trustworthy than it is.

Never block on a missing or unrecognized `stack.md`. If the frontend is genuinely ambiguous, ask the
developer which one the rebuild targets and proceed on their answer. `stack.md` is materialized by the
kit from the project's Stack & Style document — do not hand-edit it here; use `/buildstack`.

## Prerequisites

- Python with **PyMuPDF** (`pip install pymupdf`); Node with **puppeteer** for previews.
- On Windows, prefix Python commands with `PYTHONUTF8=1` if console encoding errors appear.
- Run all scripts with the **project root** as the working directory. `<skill>` below = this skill's
  directory.

## Workflow

Run the stages in order, pausing to review output between stages.

### Stage 1 — Split the PDF into per-element Markdown
`scripts/pcsoft-doc-split.py` parses the breadcrumb running-header on every page
(`Part N › Type › Element › Subsection`; the separator extracts as U+203A) to group pages by element
and write one Markdown file per element under `pre-convert/`. **Elements are classified by the
breadcrumb _Type_ segment, not the Part number** — PCSoft part numbering is not stable across exports
(queries can be Part 4 or Part 6, procedure sets Part 5 or Part 7), so keying on the number silently
dropped whole sections. This means the `*.qry.md` queries AND the `*.proc.md` server/global procedure
sets (incl. HFSQL trigger procedures) are captured regardless of their Part number, and reports land
in `*.report.md`. The verbose "Information on controls" dump goes to a faithful `<name>.controls.md`
**sidecar** so later analysis skips it (the behavior content is a small fraction of the page count).

```bash
python <skill>/scripts/pcsoft-doc-split.py --pdf conversion/docs/<App>_Documentation.pdf --out pre-convert
```
Review `pre-convert/index.md` (the manifest). Re-runs skip elements already written. Use `--dry-run`
to preview grouping without writing.

**Review what was not captured.** When any page fails to group into an element, the splitter writes
`pre-convert/_discarded.md` (pages grouped by breadcrumb Type, with page ranges) and prints a
`NOT CAPTURED` warning. Most entries are the cover, table of contents, and section dividers — but if
any Type there names a real element kind (a window/page, query, report, or set of procedures), that
element was **not** converted because its Type is unmapped. **Open `_discarded.md`, surface it to the
developer, and ask whether to keep any of it before continuing — never silently discard.** If a real
Type is unmapped, note it so the splitter's `TYPE_KIND` / `PAGE_TYPE_RE` can be extended in a follow-up.

**`_discarded.md` opens with "Named elements whose breadcrumb carries no Type" — surface those
first** (they are also warned on stderr). Elements of an internal component print a breadcrumb with
no Type; the splitter converts one only when its own pages print the physical file that proves its
kind (`.wdw`/`.wdt`/`.wwh` → page, `.wde`/`.wte` → report, `.wdr` → query — the `.md` carries a
provenance line). Procedure sets and classes print no such file, so they are listed, never guessed.
Pages printed with no running header at all are kept with the surrounding element (console line
`NO HEADER`); "(no breadcrumb / cover)" rows now mean blank pages or the cover only.

**Exit 3 — "captured ZERO elements".** The run names the breadcrumb Types it saw. That is an export
language or shape the splitter does not know; report those Types to wxKanban with
`project_submit_feedback`. Spanish breadcrumbs (Parte, Proyecto, Análisis, Consulta,
Reporte/Informe, Conjunto de procedimientos, Clase, Ventana WINDEV) are recognised.

**A Type of `...` in `_discarded.md` is a red flag, not noise.** PCSoft elides a breadcrumb segment
when the breadcrumb is too wide, and Analysis breadcrumbs embed the full `.ana`/`.wda` filesystem
path — so the pages that get elided are the data model's, and the ones with the LONGEST names. The
splitter now recovers them from the breadcrumb (which still names the table) or, failing a name,
files them under the analysis so `_schema.md` keeps them. If a run still leaves dozens of pages
under `...`, the data model is probably short: **check that `*.table.md` and `_schema.md` were
written before moving to Stage 3**, and report the export's subsection heading to wxKanban.

### Stage 2 — Regenerate pages as modern stack components

> **Gate (SPEC-056).** This stage is the one stack-specific step. Run it only when `stack.md` declares
> a React-family frontend, or when there is no `stack.md`. If it declares a different frontend, **skip
> this stage**, tell the developer once which stage was skipped and why, note it in
> `rebuild/COMPONENT-GAPS.md`, and continue to Stage 3 — every remaining stage is stack-independent
> and still worth running in full.

For each `pre-convert/<PAGE>.controls.md`, `scripts/pcsoft-page-to-react.py` builds the control tree
(nesting from dotted paths, sibling order from `X/Y position` — on WinDev desktop exports, from the
column-oriented geometry tables, matched by name; a name the PDF column cut short is matched by order
only when that is unambiguous, otherwise reported), emits a **modern app-shell** React +
Tailwind + shadcn/ui component to `rebuild/pages/<PAGE>.tsx`, and a Tailwind-CDN preview to
`scratch-render/<PAGE>.preview.html`. It also **wires WLanguage behavior**: event-handler blocks in
both header dialects — WebDev `Click on <CTRL> ( … )` and WinDev desktop `Click <CTRL>`,
`Initialization of <CTRL>`, `Global declarations of <WINDOW>` — are read from BOTH the
`.controls.md` and `.page.md`, carried across PDF page breaks, and become `async function on<CTRL>()`
stubs with the original WLanguage as comments + a TODO. Only buttons and links get `onClick`
attached; every other handler and every local procedure is carried verbatim as comments. Referenced
server procedures (`NL_*`/`SET_*`/`COL_*`) are listed as future API endpoints. Controls with no
shadcn primitive are flagged inline `{/* GAP: … */}` — see `references/library-gaps.md`. A control
type the generator does not know renders as a visible placeholder (its inner controls are kept), and
the script records placeholders and unnamed declarations in `rebuild/COMPONENT-GAPS.md` itself.

**Read each page's yield line** — `event handlers: N read, M attached…; local procedures: P`.
Surface `!! WARNING … NOT ONE event header` and `WLanguage under no recognised event header` to the
developer: that code is kept in the `.tsx` but is not wired to anything. `!! PLANES` means the window
switches between planes and all of them are rendered at once; the planes are listed in the `.tsx`
header, and the rebuild needs a tab or step switcher there.

**A page whose dump has no control geometry is NOT laid out.** Sibling order and nesting come from
each control's `X/Y position`; some exports print none. When that happens *and* every
control-shaped name was matched loosely, the names are as likely to be property labels as controls
— one export produced a page whose six "controls" were `Img1`, `Simple`, `Hotkey`, `Toolbar`,
`Step` and `Autocompletion`. The generator now refuses that page instead: it writes the control
names and their events, taken verbatim from the WLanguage handler headers, into the `.tsx` header
and into `rebuild/COMPONENT-GAPS.md`, and prints `NO LAYOUT EMITTED`. **Surface those pages to the
developer** — their layout has to come from the running application or its screenshots, which is
the "Modernize, don't replicate 1:1" principle applied to a case where replicating is impossible.
`--force-layout` emits the speculative layout anyway; use it only if the developer asks.

```bash
for f in pre-convert/*.page.md; do p=$(basename "$f" .page.md); \
  [ -f "pre-convert/$p.controls.md" ] && \
  python <skill>/scripts/pcsoft-page-to-react.py --page "pre-convert/$p.controls.md" --out rebuild/pages; done
```
Pages whose only subsections are Image/General-info have no `.controls.md` — skip them. Preview a
page: `node <skill>/scripts/render.mjs scratch-render/<PAGE>.preview.html out.png`.

**Caption gap:** multilingual captions (`ES: Cerrar / GB: Close`) get their GB/US text picked
automatically. Captions stored only as the multilingual placeholder `GB` have no literal text in the
PDF (they live in the project's translation table); the generator falls back to a humanized name +
TODO. To resolve them, obtain the project's string/`.wdtrad` export.

### Stage 3 — Database schema + ER diagram
**Ask the developer two questions first:**
1. *Target database?* — PostgreSQL (default per `stack.md`), MSSQL, MySQL, Firebird, SQLite, or **None**
   (already converted → only emit the ER doc). The picker allows ~4 named options + free-text Other.
2. *Keep field names/types faithful, or modify to the target's conventions?* If "modify", list each
   table's fields and collect per-table rename/type decisions before generating.

Then run `scripts/pcsoft-schema-to-sql.py --dialect <db>`. It parses `*.table.md` + the `_schema.md`
Links section into `rebuild/db/schema.<dialect>.sql` (CREATE TABLE; composite keys as non-unique
`CREATE INDEX`; a foreign key is declared only onto the parent's primary key — one onto any other
parent column, or on a column the table lacks, is written as a `-- REVIEW` comment and counted in
`!! N foreign key(s) written as REVIEW lines`) and `rebuild/db/ER-diagram.md` (Mermaid erDiagram +
per-table field reference + the HFSQL→JSON migration note). Supported dialects: `firebird`, `postgres`, `mssql`,
`mysql`, `sqlite` (FKs inline, `PRAGMA foreign_keys = ON`; a 0 foreign key must load as NULL).

```bash
python <skill>/scripts/pcsoft-schema-to-sql.py --dialect firebird --out rebuild/db
```

**Integer widths are handled automatically.** Any `<n>-byte integer` PCSoft emits — 1, 2, 4, 6, 8 —
maps by width with no prompting: **4 bytes and under become INTEGER, wider becomes BIGINT.** Those
are the only two integer types the conversion produces; a narrow width is widened rather than given
its own SMALLINT/TINYINT, because widening is always safe and the rebuilt schema should not sprout
narrow types the application never needed. `<n>-byte real` behaves the same way (REAL, then DOUBLE).
So an unseen width is not a reason to stop.

**If it exits 3 — the schema was refused (MANDATORY loop, do not work around it).**
No DDL or ER diagram is written while anything in the source is unresolved. Every source row is kept,
and every problem is listed with its source line in `rebuild/db/_unmapped-types.json`
(`diagnosticsVersion: 2`, one entry per row and problem). The console prints a count per problem code
and what to do about each. There are two kinds:

- **Type problems — answer them with `--type-map`.** `SOURCE_TYPE_UNKNOWN` is a type whose *meaning*
  cannot be derived (an unfamiliar word, not an unfamiliar width — real HFSQL types such as `Password`
  and `Duration` land here; `Password` once swallowed the `PasswordSalt` column after it).
  `TARGET_MAPPING_UNRESOLVED` is an **Array**, **JSON** or **UUID** field: the parser reads it
  exactly (an array keeps its dimension, element type, width and format), but the kit has no default
  target for it yet, so the developer chooses one.
- **Source problems — answer them in the source, not with a flag.** `CANONICAL_NAME_UNRESOLVED` /
  `CANONICAL_NAME_COLLISION` (a printed column name is cut off or repeated — show the developer the
  rows and their source lines, and correct the name in the per-table Markdown),
  `RELATIONSHIP_ENDPOINT_AMBIGUOUS`, `FIELD_BOUNDARY_AMBIGUOUS` and `TYPE_DECLARATION_INCOMPLETE` (a
  record that could not be read cleanly — review the listed lines). Composite keys never count as
  name collisions; their indexes are named from their member columns.

Do all three of these, in order:

1. **Ask the developer what each type should become.** Show them each type label and the affected
   `table.field` list from the error, and the valid keys it printed. They know their data; the kit
   does not. Do not guess, and do not drop the column to keep moving.
2. **Re-run with their answer** so the conversion proceeds:
   ```bash
   python <skill>/scripts/pcsoft-schema-to-sql.py --dialect firebird --out rebuild/db \
     --type-map "6-byte duration=int8" --type-map "Fixed point=numeric" \
     --type-map "Array=text" --type-map "Array of 7 Time (hhmm)=blob"
   ```
   Repeat `--type-map` once per answer. For Array / JSON / UUID the label can be the exact printed
   type (with or without its format annotation) or the whole family (`"Array=<key>"`,
   `"JSON=<key>"`, `"UUID=<key>"`); an exact label wins over its family. The field keeps its source
   description and records that the developer chose its target. An invalid key is rejected with the
   valid list.
3. **Send the confirmed mapping to wxKanban** with `project_submit_feedback`, so the type ships in
   the built-in table and nobody converting a similar app hits it again. Include the contents of
   `rebuild/db/_unmapped-types.json` (the type label, how many columns it affected) and the mapping
   the developer confirmed. Title it `HFSQL unmapped type: <label>`. This is a kit gap, so it
   belongs in wxKanban's queue — unlike findings about the developer's own application.

Fixing it only locally leaves the next person to rediscover it. The point of the loop is that one
developer's answer becomes everyone's default.

**If it prints `!! INCOMPLETE` — columns are missing. Say so; do not build on the schema quietly.**
The analysis states its own item count, and the run compares what it recovered against that number.
A shortfall means the generated DDL has fewer columns than the source analysis declares. The run
still exits 0, because the cause is often upstream — the splitter dropped a PDF page, so the
per-table extract was already short before this stage read it — and stopping every such conversion
would block ones this stage handled correctly.

So treat it as a finding, not as noise:

1. **Tell the developer the numbers** (declared vs recovered) before any schema work starts. A
   column that is missing here is missing from every model, migration and screen built on it.
2. **Check each item it names against the source PDF.** Under the counts, the run lists the
   dictionary items that match no column in the DDL, each with the data file(s) the dictionary
   says use it. The data file is a hint, not a finding. Compare `pre-convert/<Table>.table.md`
   with the PDF: an item the table page prints under another name (`MessagesID` printed as `ID`)
   is not lost, and an item whose data file has no `.table.md` at all is a page the splitter did
   not write.
3. **Report the shortfall** with `project_submit_feedback`, including both counts and the items you
   confirmed lost. Field loss in this stage was silent for a long time; the count is what makes it
   visible, and reports are what make it fixable.

More than 25 unmatched items are written in full to `rebuild/db/unmatched-items.md`. **`!! LINKS`**
is the same check for relationships: fewer links were read than the analysis declares (`Nb links`),
and it names links whose data file has no table page — treat it like `!! INCOMPLETE`.

**Review headers in the DDL.** `ALSO REVIEW: numeric precision` lists the Numeric/Decimal columns:
the PDF prints no precision, so they are emitted as an assumed NUMERIC(18,4) — confirm each against
the legacy analysis. Names quoted only because they are reserved words (`Status`, `Type`, `Size`,
`value`) are quoted in the case the target folds to (lowercase on PostgreSQL, uppercase on
Firebird), so they behave like the columns beside them. A running page header that some exports
print above the reprinted column labels (often the project name) is dropped by position.

**If it writes `rebuild/db/truncated-names.md` — item names were CUT by the PDF column.** The
per-table pages print each item name into a fixed-width column, so a name wider than it arrives
short: `CompanyBankAccountNo` becomes `CompanyBankAccount`. Nothing downstream can tell a cut name
from a genuinely short one, which is why this was reported eight times before it was recognised as
one defect — each time found by hand, weeks later, against the source.

The run repairs what it can prove, using three places that print the name in a wider column: the
row's own **caption**, the UI **control data bindings**, and the analysis **Item dictionary** with
its `Used by...` column. What it cannot prove it leaves exactly as printed and lists. So:

1. **Read the "Left as printed" table with the developer.** Those columns still carry the cut name.
   The listed candidates are suggestions, not answers — the developer knows which is right. They are
   listed shortest first, **not in source order**: never apply them positionally, or columns swap
   (foreign keys included). Where two cut names collided, each row's caption already decided.
2. **Do not "improve" the restored names.** The "Restored" table is already applied to the DDL and
   the ER diagram; renaming them again by hand desynchronises the foreign keys.
3. **If it warns that a column name appears TWICE**, the cut collapsed two different items onto one
   string. The second occurrence is written as a `-- DUPLICATE` comment above its `CREATE TABLE`, so
   the table still creates — but that column is missing until it is resolved from the source.

**Tell the developer (HFSQL source only):** HFSQL data cannot be read by the target DB directly —
they must write a **WLanguage global procedure** that loops every data file
(`HReadFirst`/`HReadNext`) and exports each to **JSON**, which a loader then inserts using the
generated DDL. The exact instruction and migration gotchas (Win-1252→UTF-8, empty-date
sentinels→NULL, FK load order, BLOB handling) are written into `rebuild/db/ER-diagram.md`.

### Stage 4 — Queries scope
`scripts/pcsoft-queries-to-scope.py` documents every `QRY_*` as ONE scope
(`rebuild/scopes/QRY-queries-scope.md`): inferred purpose, result columns, parameters, selection
conditions, and a **reconstructed** SQL SELECT with real `JOIN … ON` clauses derived from the
schema's FK graph. **Surface this caveat:** the PDF clips each query's SQL box, so only the first
`SELECT <col>,` line of the verbatim SQL survives — the rest is reconstructed, not copied.

Calculated and aggregate result items are listed too (aggregates as COUNT/SUM/AVG/MAX/MIN, with an
inferred `GROUP BY` in the reconstruction). A calculated column whose expression the export does not
print is marked **`expression NOT in the export`** — do not invent it; the reconstructed SQL carries a
deliberately non-runnable placeholder there. A query whose result columns could not be read at all
is marked **`!! NOT RECOVERED`** in the scope and warned on stderr — open its `.qry.md` with the
developer before relying on that query.

```bash
python <skill>/scripts/pcsoft-queries-to-scope.py --out rebuild/scopes
```

### Stage 5 — Server / global procedures scope (incl. HFSQL triggers)
`scripts/pcsoft-procs-to-scope.py` documents every `*.proc.md` "Set of procedures" as ONE backend
scope (`rebuild/scopes/PROC-procedures-scope.md`): a **triggers callout** at the top, a per-set
summary (procedure count, trigger count, HFSQL server procedures called), and a per-set procedure
list with `*Trigger` procedures flagged. This is the application's **business-logic layer**. HFSQL
"triggers" are ordinary WLanguage procedures (named `*Trigger`, invoked by the custom-rules engine or
registered via `HDescribeTrigger`), NOT SQL `CREATE TRIGGER`. **These have no UI — do NOT scaffold
them as React pages; port them to the API/server layer the pages call.** Each signature comes from
the procedure's own declaration (including `PRIVATE`/`PUBLIC`/`PROTECTED`/`VIRTUAL` modifiers); when
only the `Global procedure X (server)` heading survived, it is shown as `X(?)` — read the parameters
from the `.proc.md` rather than guessing them.

```bash
python <skill>/scripts/pcsoft-procs-to-scope.py --src pre-convert --out rebuild/scopes
```

### Stage 6 — Reports stub
`scripts/pcsoft-reports-to-stub.py` documents every `*.report.md` (`RPT_*`) as ONE rebuild stub
(`rebuild/scopes/RPT-reports-stub.md`): per report, the type, data-source type, source name, page
format, and the queries / data files referenced in the print-time code, plus a rebuild target. Legacy
WinDev reports are pixel-positioned `.wde` layouts whose data is assembled at print time by
`Before printing` / `After printing` WLanguage handlers — so this is a **stub**: move the print-time
data assembly into an **API/server data-prep step**, then render with a React PDF/print component
(`@react-pdf/renderer` or a print-CSS route; barcodes via `bwip-js`/`jsbarcode`). If the doc has no
reports, the script still writes the stub recording that.

```bash
python <skill>/scripts/pcsoft-reports-to-stub.py --src pre-convert --out rebuild/scopes
```

### Review / re-sync (`--review`)
After the generation stages — and any time the **source PDF changes** or you re-split — run the
re-sync review to compare `pre-convert/` (source) against `rebuild/` (generated) and catch anything
missing or out of date BEFORE handing off:

```bash
wxkanban-agent wxconversion --review
```
It changes nothing; it lists, by category:
- **MISSING** — a source element with no generated artifact (e.g. a `*.page.md`+`*.controls.md` with
  no `rebuild/pages/<X>.tsx`, or a `*.qry.md`/`*.proc.md`/`*.report.md`/`*.table.md` whose scope/DDL
  was never produced).
- **STALE** — the source is newer than what was generated from it (the PDF is newer than
  `pre-convert/index.md`, or a `pre-convert/*.md` is newer than its `rebuild/` output) → regenerate.
- **ORPHANED** — a `rebuild/` artifact whose source element is gone (renamed/removed).
- **REVIEW** — `pre-convert/_discarded.md` exists (pages not captured at split time).

Each finding prints the exact command to fix it. **Present the list to the developer as choices**
(regenerate / keep / delete) and run only what they pick — never auto-apply. Re-run `--review` until
it reports "in sync".

### Handoff — scope generation
When conversion is complete, hand off to **`/wxConversionScope`** (the companion skill). It
acts as a Systems & Business Analyst and turns these artifacts into Scope-of-Project documents —
one per page/report plus overall Program, Database, and Backend/API scopes — BuildScope-style and
**resumable** (a large system can take days; it saves progress between scopes). This conversion
stage does not write scopes itself.

## Operating principles

- **Modernize, don't replicate 1:1.** Same controls and behavior, but a clean idiomatic React/shadcn
  arrangement (app-bar, top nav, toolbars, Cards, Dialogs) is preferred over pixel-matching the
  legacy WebDev layout.
- **Surface, don't decide.** Flag `GB` captions, component gaps, truncated SQL, composite keys, and
  any pages listed in `pre-convert/_discarded.md` for human review rather than silently guessing or
  dropping them — tell the developer what was not captured and let them decide whether to keep it.
- **Faithful by default for data.** Keep legacy table/column names and types verbatim unless the
  developer explicitly opts into modernization.
- **Never infer status from syntax.** An element is disabled, obsolete, dead, or excluded **only**
  when a named attribute says so and you can quote the exact key and line that says it. Formatting
  carries no lifecycle meaning: indentation, key ordering, ID values, and YAML block-scalar headers
  (`|`, `|-`, `|+`, `>`, `>-`, `|1`, `|1-`, `|2+`) are syntax. In text-saved PCSoft sources the
  header on a `code :` block is plain YAML — the digit is an explicit indentation indicator and the
  `-`/`+` is a chomping indicator controlling trailing newlines only, so `code : |1-` and
  `code : |1+` are both ordinary live code. If you cannot quote the attribute, the element is
  **live** — convert it.
- **One confirmation is not a policy.** A developer answering keep/drop for one element authorizes
  that decision for **that element only**. Never generalize an answer into a rule and apply it to
  others. If the same question affects several elements, list every one of them and get an explicit
  decision on the batch. When you report what was excluded, name each element and the quoted
  evidence for excluding it.

## Resources

### scripts/
- `pcsoft-doc-split.py` — PDF → per-element Markdown under `pre-convert/` (Stage 1).
- `pcsoft-page-to-react.py` — `<page>.controls.md` → modern `.tsx` + preview, behavior wired (Stage 2).
- `pcsoft-schema-to-sql.py` — `*.table.md` + links → DDL + ER diagram, multi-dialect (Stage 3).
- `pcsoft-queries-to-scope.py` — `*.qry.md` → one queries scope with reconstructed SQL (Stage 4).
- `pcsoft-procs-to-scope.py` — `*.proc.md` → one server/global procedures scope, triggers flagged (Stage 5).
- `pcsoft-reports-to-stub.py` — `*.report.md` → one reports rebuild stub (Stage 6).
- `render.mjs` — puppeteer HTML→PNG renderer for previewing generated pages.

### references/
- `library-gaps.md` — OSS-vs-paid React library recommendations for each WebDev control type with no
  shadcn/ui equivalent (data grid, WYSIWYG editor, charts, captcha, file upload, image gallery).
