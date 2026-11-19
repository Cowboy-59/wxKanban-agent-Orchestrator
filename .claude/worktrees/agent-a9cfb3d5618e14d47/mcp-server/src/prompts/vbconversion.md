# vbConversion — Visual Basic 6 source → modern rebuild scaffold

Full methodology for the `vbConversion` skill, delivered by wxKanban at runtime. The pipeline is six
deterministic Python scripts (bundled in the skill's `scripts/`) — this prompt drives them. When the
conversion is complete, hand off to **`/vbConversionScope`** to generate Scope-of-Project documents.

`vbConversion` is the **VB6** member of the conversion family, alongside `wxConversion` (PCSoft
WinDev/WebDev, from a technical-doc **PDF**) and `cwConversion` (SoftVelocity Clarion, from
**TXA/TXD/.clw**). Same `pre-convert/` → `rebuild/` shape and "surface, don't decide" posture — only
the front-end parsers differ.

> **Scope: VB6 / Classic VB only.** "Visual Basic" spans four things — this targets **VB6 (1998–2008,
> COM)**. NOT VB.NET (.vb/.vbproj — a different language on .NET), VBScript/classic ASP (.vbs/.asp),
> or VBA-in-Office directly (Access/Excel macros live in a binary `.mdb`/`.xls`; export with
> `Application.SaveAsText` / the VBE first, then they parse like `.bas`/`.frm`).

## What this skill produces

From a VB6 project's text source (`.vbp` + `.frm`/`.frx` + `.bas` + `.cls` + `.ctl`):

- **`pre-convert/`** — per-element Markdown: `*.page.md` + `*.controls.md` (per `.frm`/`.ctl`),
  `*.proc.md` (per `.bas`/`.cls`), `_project.md` (forms/modules/classes, references, **third-party
  OCX objects**, startup), `index.md`, `_discarded.md`.
- **`rebuild/pages/*.tsx`** — React + Tailwind + shadcn/ui, one per form; bound textboxes → a typed
  `record` state, command buttons → `on<Ctrl>Click()` handler stubs carrying the original VB, menus
  surfaced, third-party OCX flagged `{/* GAP … */}`.
- **`rebuild/db/`** — a **reconstructed** data model + ER diagram (VB6 has no dictionary — inferred
  from Data-control `RecordSource`, bound `DataField`s, and code SQL; types are name-hinted and must
  be confirmed against the `.mdb`).
- **`rebuild/scopes/`** — `QRY-queries-scope.md` (SQL from code/RecordSource), `PROC-procedures-scope.md`
  (modules/classes; Win32 `Declare` flagged non-portable), `RPT-reports-stub.md`.
- **`references/vb6-gaps.md`** — control→shadcn map, OCX→library picks, type map, twips/Jet/ADO notes.

## A note on the parsers (read once)

The VB6 `.frm` text format is **stable and well documented** — a `Begin <Type> <Name> … End` control
tree (controls nest via `Begin`/`End`; property groups via `BeginProperty`/`EndProperty`), then
`Attribute VB_Name` and event code. It parses cleanly. The real variability is **third-party
OCX/ActiveX** controls (grids, Crystal, RichText, Flash) — flagged as GAP candidates, never dropped.
Always read `_discarded.md` and the run summary; never assume "it ran, so everything converted."

## Stack & Style targeting (SPEC-056)

**Before running any stage, read `stack.md` at the repo root if it exists.** Conversion produces two
kinds of output, and the declared stack governs only the second:

- **Stack-independent — always produced.** `pre-convert/` per-element Markdown, `rebuild/db/` (the
  reconstructed data model + ER diagram), `rebuild/scopes/` (`QRY-queries-scope.md`,
  `PROC-procedures-scope.md`, `RPT-reports-stub.md`), and `references/vb6-gaps.md`. These capture the
  legacy application's *behavior*, which is the durable value of a conversion and is worth exactly the
  same whatever the rebuild is written in.
- **Stack-specific — conditional.** `rebuild/pages/*.tsx`. Stage 2's generator emits **React +
  Tailwind + shadcn/ui**. Run it when `stack.md` declares a React-family frontend (React, React +
  Vite, Next.js, React Native) **or when no `stack.md` exists** — the historical default, so behavior
  is unchanged for every project that has not captured a stack.

If `stack.md` declares a **non-React** frontend (WPF/XAML, WinForms, Blazor, Angular, Vue, Svelte,
Flutter, native mobile, …), **do not emit `.tsx` that you already know does not match the target.**
Say so once, run every other stage normally, and record the skip in `rebuild/COMPONENT-GAPS.md` so it
stays visible. A VB6 shop rebuilding in WinForms or WPF gains nothing from React components — it is
work they must first recognize as wrong and then throw away.

Note the control→shadcn map in `references/vb6-gaps.md` is React-specific, but the **OCX inventory and
the type/twips/Jet/ADO notes are not** — surface those on every stack.

Never block on a missing or unrecognized `stack.md`. If the frontend is genuinely ambiguous, ask the
developer which one the rebuild targets and proceed on their answer. `stack.md` is materialized by the
kit from the project's Stack & Style document — do not hand-edit it here; use `/buildstack`.

## Prerequisites

- **Python 3** (stdlib only — VB6 source is already text). **Node + puppeteer** for previews.
- On Windows, prefix Python with `PYTHONUTF8=1` if console-encoding errors appear (VB6 source is
  usually Windows-1252).
- **Windows path gotcha:** pass **Windows-style** paths (`E:/App/src/*.frm`). Git-Bash/MSYS `/e/...`
  paths silently fail Python's `glob`/`os.path` — empty file set, **no error**.

### Getting the inputs

VB6 source is plain text. Ask for: the `.vbp`; the `.frm`/`.frx` forms; `.bas`/`.cls`/`.ctl` modules;
and for data, an Access `.mdb`/`.accdb` or just the DB engine + connection string. (VBA/Access forms
are binary — export with `Application.SaveAsText`.)

## Workflow (all six stages implemented; validated on a real app, DBAddressBook)

### Stage 1 — Split the project
`scripts/vb6-project-split.py` reads the `.vbp` (or a `--src` glob) → one Markdown file per element.
Forms → `*.page.md` (overview, caption, control count, event list, code) + `*.controls.md` (parsed
control tree with a per-control **OCX-gap** flag, menu tree, verbatim `Begin…End`). Modules → `*.proc.md`.
The `.vbp` → `_project.md` with the **OCX object list** as Stage-2 GAP candidates.
```bash
python <skill>/scripts/vb6-project-split.py --vbp conversion/src/<App>.vbp --out pre-convert
```
Review `index.md` and `_discarded.md`; surface anything real that was not classified.

### Stage 2 — Forms → modern stack components

> **Gate (SPEC-056).** This stage is the one stack-specific step. Run it only when `stack.md` declares
> a React-family frontend, or when there is no `stack.md`. If it declares a different frontend, **skip
> this stage**, tell the developer once which stage was skipped and why, note it in
> `rebuild/COMPONENT-GAPS.md`, and continue to Stage 3 — every remaining stage is stack-independent
> and still worth running in full. The OCX inventory still gets surfaced either way.

`scripts/vb6-form-to-react.py` parses each `*.controls.md` + the form code, emits `rebuild/pages/<Form>.tsx`.
Intrinsic controls map directly (TextBox→Input/Textarea, CommandButton→Button, Label, ComboBox→Select,
CheckBox, Frame→Card, Data control→a record model). Bound textboxes become a typed `record` state
(shape = the Stage-3 table); each control event Sub (`cmdAdd_Click`) becomes an `async function
on<Ctrl>Click()` stub with the original VB as comments + TODO; menus → a trailing note; third-party
OCX → `{/* GAP: … */}` (pick a React library — see `references/vb6-gaps.md`).
```bash
for f in pre-convert/*.controls.md; do python <skill>/scripts/vb6-form-to-react.py --page "$f" --out rebuild/pages; done
```

### Stage 3 — Data model (no dictionary — inferred)
**Ask the developer:** target database (PostgreSQL default / MSSQL / MySQL) and whether to keep names
faithful. `scripts/vb6-data-to-sql.py` reconstructs the model from Data-control `RecordSource` (table
or SQL), bound `DataField`s (the columns, each tagged with the screen control that edits it), and code
SQL/`DatabaseName`. Output: `rebuild/db/schema.<dialect>.sql` + `ER-diagram.md`. **Types are unknown
at the VB6 binding layer** — emitted as the dialect text type with name-based hints; the form bound no
key, so an `id` identity is synthesized. **Tell the developer to confirm types, lengths, the primary
key, and relationships against the `.mdb`**, and that Jet data must be exported (JSON/CSV via Access /
`mdb-tools` / an ADO dump) and loaded with the generated DDL.
```bash
python <skill>/scripts/vb6-data-to-sql.py --dialect postgres --src pre-convert --out rebuild/db
```

### Stage 4 — Queries scope
`scripts/vb6-queries-to-scope.py` collects SQL from `RecordSource`/`Recordset.Open`/inline literals
into `rebuild/scopes/QRY-queries-scope.md`, each cited to its procedure. **Surface the caveat:** SQL
built by `& _` concatenation may be truncated at the first literal — verify the full text; and
string-concatenated SQL is an injection risk to parameterize in the rebuild.
```bash
python <skill>/scripts/vb6-queries-to-scope.py --src pre-convert --out rebuild/scopes
```

### Stage 5 — Business-logic scope
`scripts/vb6-procs-to-scope.py` documents `.bas`/`.cls` modules as one backend scope — procedures +
what each touches (DB / file I/O / Win32). **`Declare` (Win32 API) is flagged non-portable** — it has
no browser analog (e.g. `SetWindowPos`/always-on-top); replace the behavior or drop it.
```bash
python <skill>/scripts/vb6-procs-to-scope.py --src pre-convert --out rebuild/scopes
```

### Stage 6 — Reports stub
`scripts/vb6-reports-to-stub.py` records Data Report (`.dsr`) / Crystal (`.rpt`) artifacts (or that
none exist). Rebuild path: move data assembly to an API step, render with `@react-pdf/renderer` or a
print-CSS route.
```bash
python <skill>/scripts/vb6-reports-to-stub.py --src pre-convert --out rebuild/scopes
```

### Review / re-sync
After generation — or whenever the source changes — run **`wxkanban-agent vbconversion --review`** to
compare `pre-convert/` against `rebuild/` and list what is missing, stale, or orphaned. Read
`_discarded.md` again. Present findings as choices (regenerate / keep / delete); change nothing
automatically.

### Handoff
When done, hand off to **`/vbConversionScope`** — a Systems & Business Analyst that turns the artifacts
into resumable, BuildScope-style Scope-of-Project documents.

## Operating principles

- **Modernize, don't replicate 1:1.** Ignore twips `Left/Top/Width/Height`; use a clean responsive
  layout, a real data grid for list views, a Dialog for modal forms.
- **Surface, don't decide.** Flag OCX controls, reconstructed SQL/types, the synthesized key,
  Win32 calls, and anything in `_discarded.md` for human review.
- **Events are logic, not layout.** Port VB6 event code to handlers and the server layer; don't
  recreate event-execution order in React.
- **Never infer status from syntax.** Treat a form, control, or procedure as disabled, obsolete,
  dead, or excluded **only** when a named attribute says so and you can quote the exact key and
  line. Formatting carries no lifecycle meaning — line continuations, `Attribute` lines, indentation,
  key ordering, ID values, and block/quoting markers are syntax, not status. If you cannot quote the
  attribute, the element is **live** — convert it.
- **One confirmation is not a policy.** A developer answering keep/drop for one element authorizes
  that decision for **that element only**. Never generalize an answer into a rule and apply it to
  others; if the same question affects several elements, list every one and get an explicit decision
  on the batch. Name each excluded element and the quoted evidence for excluding it.

## Resources (bundled in the skill)

- `scripts/vb6-project-split.py` (1), `vb6-form-to-react.py` (2), `vb6-data-to-sql.py` (3),
  `vb6-queries-to-scope.py` (4), `vb6-procs-to-scope.py` (5), `vb6-reports-to-stub.py` (6).
- `references/vb6-gaps.md` — control/OCX/type maps + twips/Jet/ADO migration notes.
