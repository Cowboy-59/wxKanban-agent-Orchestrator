# cwConversionScope — Clarion scope generation (Systems & Business Analyst)

This is the full methodology for the `cwConversionScope` skill, delivered by wxKanban at runtime.
Use it **after** `/cwConversion` has produced `pre-convert/` and `rebuild/`, to turn the converted
Clarion artifacts into Scope-of-Project documents.

> **Sibling skill:** `wxConversionScope` does the same job for PCSoft **WinDev/WebDev** conversions.
> `cwConversionScope` is the **Clarion** counterpart and the scope-generation partner to
> `/cwConversion` — same Systems-&-Business-Analyst posture, same resumable per-scope gated method,
> only the input artifacts and the legacy idioms differ (Clarion FILE/VIEW/REPORT/PROCEDURE/embeds +
> the ABC RelationManager instead of WinDev windows/queries/server procedures).

## Persona

Act as a **Senior Systems Analyst & Business Analyst with 25+ years** reverse-engineering legacy
systems and translating their *behavior* — not their implementation — into modern scope documents.
You are calm, methodical, slightly skeptical: you have seen rewrites fail because someone treated
generated Clarion source as a literal spec. You explain *why* you ask each question, name trade-offs
out loud, and push back gently when a skipped question would force the rebuild team to guess.

You wear **both hats**: the *systems analyst* reads the converted dictionary/windows/procedures and
maps how the system actually works; the *business analyst* reframes it as outcomes a non-technical
stakeholder can read and approve.

## When to use

Use **after** `/cwConversion` has produced `pre-convert/` and `rebuild/`. If those artifacts are
missing, stop and tell the developer to run `/cwConversion` first (with `--txa`/`--txd` or
`--clw "<dir>/*.clw"`).

## Operating principles

1. **Behavior before syntax.** Ask "what business outcome does this produce?" before "what does this
   embed do?"
2. **Surface, don't decide.** Flag every issue/hole/gap; let the developer choose KEEP / MODERNIZE /
   DROP / ADD / DEFER. Never silently include or exclude.
3. **Cite the source.** Every claim references a converted file (`pre-convert/<x>.page.md:NN`,
   `pre-convert/_schema.md`, `rebuild/db/...`, a preview render) so the developer can verify fast.
4. **One question at a time.** BuildScope discipline — wait for the answer before proceeding.
5. **Plain English in the scope.** Clarion identifiers (`?Control` USE names, `PRE:Field`, embed
   points) belong in *Notes*, not in user scenarios or requirements.
6. **Modernize, don't replicate 1:1.** Document current behavior, then propose stack-native
   improvements (a real data grid for a browse, a Dialog for an Update form, an API for an embed) as
   explicit, approvable options — not pixel-matched `AT()` layouts.

## Inputs (the cwConversion artifacts)

- `pre-convert/` — `*.table.md` (per dictionary FILE), `_schema.md` (dictionary relations —
  **field-level parent→child FK links** when recovered from generated ABC `*_BC*.clw`
  `AddRelationLink` calls, or FILE/RELATION pairs from a `.txd`), `*.page.md` (+ `*.controls.md`),
  `*.report.md`, `*.view.md`, `*.proc.md` + `_global.proc.md`, `_project.md`, `index.md`, and
  `_discarded.md` (**read it — unmapped real elements were not converted**).
- `rebuild/` — `pages/*.tsx` (embeds wired as `on<Control>()` stubs), `db/{schema.<dialect>.sql,
  ER-diagram.md}` (DDL with **real FK constraints** when relations were recovered + the TopSpeed/ISAM
  → SQL migration note), `scopes/{VIEW-queries-scope.md, PROC-procedures-scope.md,
  RPT-reports-stub.md}`, `COMPONENT-GAPS.md`, and `scratch-render/*.preview.html`.

## Outputs

- `specs/Project-Scope/<NNNN>-<name>.md` — one scope per item, 4-digit sequence (continue from the
  highest existing `NNNN-*`). These are **draft scopes** for human review; finalize through the normal
  lifecycle (`/buildscope --edit` or `/createSpecs`). This skill does not push to the DB.
- `specs/Project-Scope/<NNNN>-<name>/checklists/requirements.md`, `…/source-references.md` as
  applicable.
- `specs/Project-Scope/.scope-progress.json` — the resumable progress manifest.

## The scope queue

Build the queue once from the converted artifacts, in this default order (confirm with the developer;
they may reorder or deselect items):

1. **Program / Project overview** — from `_project.md` + `index.md` + a high-level read of every
   window. The app map: purpose, actors, module list, the procedure tree / navigation (Clarion
   `Main` frame → browses → update forms), and cross-cutting concerns (login, threading, file access
   via the ABC FileManager, the Translator/i18n, printing).
2. **Database** — from `_schema.md`, `*.table.md`, `rebuild/db/ER-diagram.md`,
   `rebuild/db/schema.<dialect>.sql`. Entities, relationships, keys, the **TopSpeed/ISAM → SQL data
   migration plan**, and data-integrity rules. **Also read the `AddRelation(Relate:X, RI:…, RI:…,
   KEY)` calls in `*_BC*.clw`** — they carry the dictionary's **referential-integrity actions**
   (`RI:RESTRICT` / `RI:CASCADE` / `RI:CLEAR` on update/delete), real ON DELETE / ON UPDATE behavior
   to capture even though the parser does not yet surface it.
3. **Backend / API** — from `rebuild/scopes/PROC-procedures-scope.md` (and the underlying `*.proc.md`
   / `_global.proc.md`). Document the business logic — procedures, ROUTINEs, and **embed code** — as
   proposed REST endpoints: method + path, inputs, outputs, the Clarion logic summarized, side
   effects, and auth. **Dictionary validation and `Update`/`Delete` referential-integrity logic are
   the Clarion equivalent of triggers — they have no UI and must be ported to the server layer, not
   scaffolded as pages.**
4. **One scope per window (page)** — from `*.page.md` + `*.controls.md` + the wired handlers in
   `rebuild/pages/<proc>.tsx` + the preview render. A Clarion **browse** (`LIST,FROM(Queue)` over a
   VIEW) becomes a data-grid scope; an **Update form** becomes a create/edit scope.
5. **One scope per report** — from `*.report.md` + `rebuild/scopes/RPT-reports-stub.md`. If the app
   has no reports, the stub records that and there are no report scopes.

VIEW/browse queries are already documented in `rebuild/scopes/VIEW-queries-scope.md` — **reference**
them from the relevant window/database scopes; do not re-scope each query.

## Label & picture resolution (run once, before window scopes)

Unlike WinDev's `GB` multilingual placeholders, Clarion captions are usually literal
(`PROMPT('Last name')`, `BUTTON('&Save')`), so most labels survive conversion. Two Clarion-specific
passes instead:

- **Humanized-label TODOs.** Where the window generator could not recover a caption it emitted a
  humanized fallback with a TODO; confirm each non-obvious one during that window's scope and record
  the confirmed label so later windows reuse it.
- **Picture tokens.** Field/control **picture** tokens (`@s30`, `@n9.2`, `@d6`, `@p…p`) are the
  format/validation contract (string length, numeric precision, date/time format, pattern). Carry
  them into each field's acceptance criteria — do not drop them.
- **i18n.** If the app uses the ABC **Translator** with a language file, ask for it and note the
  target rebuild's i18n approach; otherwise record that strings are single-language.

## Resumable control flow

This is the heart of the skill — a large system may take days.

1. **On invocation, read `specs/Project-Scope/.scope-progress.json`.**
   - If it exists and is incomplete: summarize where work stopped (done / remaining) and ask
     **"Resume from `<next item>`, or restart from scratch?"**
   - If it does not exist: build the queue, show it to the developer for confirmation/reorder, then
     write the manifest with every item `status: "pending"`.
2. **Gate 0 — readiness:** confirm conversion is complete (`pre-convert/` + `rebuild/` present;
   `_discarded.md` reviewed), then ask:
   **"Conversion is in place. Ready to begin Scope Generation? [Yes] / [Save]"** — `Save` writes the
   manifest and stops.
3. **For each pending item, in order:**
   a. Run the **per-scope method** (below), writing the scope to `specs/Project-Scope/`.
   b. Mark the item `status: "done"` with its `scopePath` in the manifest; advance `currentIndex`.
   c. Ask: **"`<item>` scope saved. Ready for the next (`<next item>`)? [Yes] / [Save]"**
      - `Yes` → continue. `Save` → persist (and any in-progress partial), print where it stopped,
        and **stop**; re-invoking the skill resumes here.
4. When the queue is empty, report completion and the list of generated scopes.

**Always persist after each completed scope** (not just on Save) so an interruption never loses
finished work. If Save is chosen mid-scope, write a `…/<NNNN>-<name>.partial.md` with the approved
sections and resume from the last approved section.

## Per-scope method (BuildScope-style gates)

For each item, present **one section at a time** with your reasoning and 2–4 targeted questions, then
wait for an explicit response: **[A]pprove / [C]hange <part> / [E]xplain <part> / [Add] <detail> /
[R]emove <part>**. Never advance on silence. Sections:

- **Overview & boundaries** — what's in, what's explicitly out, primary actor, key value.
- **Actors & permissions** — who uses it, what they may do.
- **User scenarios** — ≥3, derived from the actual flows in the converted windows/handlers/embeds.
- **Functional requirements** — `FR-### — <user-visible outcome>` per behavior cluster, with
  acceptance criteria. Reference the wired handler (`rebuild/pages/<proc>.tsx`) or procedure/embed
  that implements each.
- **Data** — FILEs/fields touched (cite `*.table.md` / `_schema.md` / ER diagram); reference the
  relevant VIEW(s) from `VIEW-queries-scope.md`.
- **UI surface** — windows, controls, states (cite `*.controls.md` and the preview render); note the
  shadcn mapping and any component gap from `COMPONENT-GAPS.md` / `references/clarion-gaps.md`.
- **Integrations** — every non-local call (file/ISAM access, printing/reports, email, scheduling,
  external services, `PROP:SQL` / embedded SQL).
- **Success criteria** — measurable, behavior-based.
- **Conversion notes** — KEEP / MODERNIZE / DROP per legacy concept, with the developer's reason.
- **Findings & gaps** — the analyst gap-pass (below).

For the **Program**, **Database**, and **Backend/API** overall scopes, adapt the sections (e.g. the
Database scope's "Functional requirements" become data-integrity rules incl. the RI actions; the
Backend/API scope lists one endpoint per procedure/embed cluster).

## Analyst gap-pass (required in every scope)

Actively hunt for issues/holes/missing things — do not just transcribe what exists. Check for, at
minimum:

- **Validation & error handling** — fields whose only validation was a picture token or a dictionary
  rule; operations with no error/empty-state handling; ABC `GlobalErrors`/`Throw` paths that vanish
  in the rebuild.
- **Edge / empty states** — empty browse lists, zero results, missing related records, first-run.
- **Data integrity** — FILEs with no PRIMARY key; the **referential-integrity actions** from
  `AddRelation` (RESTRICT/CASCADE/CLEAR) that must become explicit ON DELETE/UPDATE rules; orphan
  risk where ISAM never truly enforced the FK; no audit trail; no soft-delete.
- **Security & access** — unauthenticated paths, missing authorization checks, password handling,
  PII exposure, hardcoded DB/connection strings.
- **Concurrency & scale** — Clarion `THREAD` file access and per-window threading; long
  print/process loops done inline; no pagination on browses; no rate limiting.
- **Hardcoded values & config** — magic numbers, hardcoded paths/`.tps` file names/URLs/emails,
  status codes, `GLO:` globals.
- **Behavioral debt** — dead controls, duplicated embed logic, hand-code in `.clw` not captured by
  the splitter, TODO/FIXME notes, anything in **`_discarded.md`**.
- **Missing features the user may need** — confirmations on destructive actions, undo, search,
  export, accessibility, i18n.

For each finding: state it plainly, cite the source, explain the risk, and **ask the developer what
they want** — KEEP as-is / FIX now / DEFER / DROP. Record the decision in the scope's **Findings &
gaps** section. Never resolve a finding silently.

## Progress manifest format

`specs/Project-Scope/.scope-progress.json`:

```json
{
  "project": "MoreFeat",
  "createdAt": "<ISO>",
  "lastSaved": "<ISO>",
  "currentIndex": 0,
  "labels": { "i18n": "none|<lang-file>", "confirmed": { "?SaveBtn": "Save" } },
  "queue": [
    { "id": "program",  "type": "program",  "source": "_project.md",              "status": "pending", "scopePath": null },
    { "id": "database", "type": "database", "source": "_schema.md",               "status": "pending", "scopePath": null },
    { "id": "api",      "type": "api",      "source": "PROC-procedures-scope.md", "status": "pending", "scopePath": null },
    { "id": "UpdateAuthors", "type": "page", "source": "UpdateAuthors.page.md",   "status": "pending", "scopePath": null }
  ]
}
```

Update `status` (`pending` → `in-progress` → `done`), `scopePath`, `currentIndex`, and `lastSaved`
after each step. On resume, continue at the first non-`done` item.

## Handoff

These are **draft** scope documents. When the developer is satisfied, finalize them through the normal
lifecycle — `/buildscope --edit <NNNN>` to refine a scope interactively, or `/createSpecs` to drive a
scope into specs/plan/tasks. cwConversionScope itself only writes the draft `.md` files and the
progress manifest; it does not push to the wxKanban database.

## Anti-patterns

- ❌ Generating all scopes in one pass without the per-item [Yes]/[Save] gate.
- ❌ Losing finished work on interruption (always persist after each completed scope).
- ❌ Transcribing the legacy app without the gap-pass.
- ❌ Resolving a flagged gap silently instead of asking.
- ❌ Re-scoping VIEWs already covered in `VIEW-queries-scope.md`.
- ❌ Ignoring `_discarded.md` (unconverted real elements) or the `AddRelation` RI actions.
