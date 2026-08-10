---
name: wxConversion
description: >-
  Convert a legacy PCSoft WinDev / WebDev application into a modern React + Tailwind + shadcn/ui
  rebuild scaffold by working FROM the project's generated technical-documentation PDF (not the
  .wdw/.wdg/.wdc source). This skill should be used when a developer has a PCSoft "Technical
  Documentation" PDF export and wants per-element Markdown, regenerated stack-native page
  components (with WLanguage behavior wired as handler stubs), a database schema/ER diagram in a
  chosen dialect, a queries scope, and a reports stub. It is deterministic and token-efficient
  (the heavy mechanical work runs in bundled Python scripts, not the model).
---

# wxConversion — PCSoft doc PDF → modern rebuild scaffold

> **The full step-by-step methodology for this skill is delivered by wxKanban at runtime.**
>
> To run the conversion, call the MCP tool **`project.get_command_prompt`** with
> `{ "command": "wxconversion" }`, then follow the returned instructions exactly. They drive the
> deterministic conversion scripts bundled locally in this skill's **`scripts/`** directory
> (`pcsoft-doc-split.py`, `pcsoft-page-to-react.py`, `pcsoft-schema-to-sql.py`,
> `pcsoft-queries-to-scope.py`, `pcsoft-procs-to-scope.py`, `pcsoft-reports-to-stub.py`,
> `render.mjs`) and reference **`references/library-gaps.md`**.
>
> **Raw PCSoft source is out of scope — refuse it.** This skill converts the Technical
> Documentation **PDF**. If the developer supplies `.wdw` / `.wdg` / `.wdc` / `.wdr` / `.wdp` or any
> other text-saved source instead, stop and ask them to generate the PDF export from the IDE. None
> of the stages can read those files, and improvising a reading of them yields confident, wrong
> results. Do not partially convert from source to get started.
>
> **Never infer status from syntax.** An element is disabled, obsolete, or excluded **only** when a
> named attribute says so and you can quote the exact key and line. Formatting carries no lifecycle
> meaning — YAML block-scalar headers (`|`, `|-`, `|+`, `|1-`, `|2+`, `>-`) are syntax: the digit is
> an indentation indicator and the `-`/`+` is a chomping indicator controlling trailing newlines
> only. `code : |1-` and `code : |1+` are both ordinary live code. If you cannot quote the
> attribute, the element is live. And a developer's keep/drop answer covers **that element only** —
> never generalize one answer into a rule applied to others.
>
> **`pcsoft-doc-split.py` classifies elements by the breadcrumb _Type_ segment, not the Part
> number** — PCSoft part numbering is not stable across exports (queries can be Part 4 or Part 6,
> procedure sets Part 5 or Part 7). Keying on the number silently dropped whole sections (the
> real `QRY_*` queries and the entire server/global procedure layer, including HFSQL trigger
> procedures). After splitting, you MUST run, in addition to the page/schema/queries steps:
> `pcsoft-procs-to-scope.py` (server/global procedures, incl. triggers) and
> `pcsoft-reports-to-stub.py` (reports).
>
> **Review what was _not_ captured.** When any page fails to group into an element, the splitter
> writes **`pre-convert/_discarded.md`** (grouped by breadcrumb Type, with page ranges) and warns
> on the console. Most entries are the cover, table of contents, and section dividers — but if any
> Type there names a real element kind, that element was not converted. Open `_discarded.md`,
> surface it to the developer, and ask whether they want to keep any of it before moving on — do
> not silently discard.
>
> **Re-sync review.** After a conversion (or whenever the source PDF changes), run
> **`wxkanban-agent wxconversion --review`** to compare `pre-convert/` (source) against `rebuild/`
> (generated) and list what is **missing**, **stale** (a source changed since it was generated),
> **orphaned** (generated with no source), or flagged for review (`_discarded.md`). It changes
> nothing — present the findings to the developer as choices (regenerate / keep / delete) and act on
> their selection.
>
> If `project.get_command_prompt` is **not available as a tool**, the wxKanban MCP isn't
> connected to your AI client — a setup issue, not billing. Register it and restart: run
> `/wxAI-project-init` (writes `.mcp.json`) or `node scripts/init.mjs`, then restart your AI
> client and approve the `wxkanban` server (Claude Code: `/mcp`). Only an explicit **401 /
> subscription error** from the fetch is a token/subscription problem — re-run `kit-configure`
> or renew at https://wxperts.com/account/billing.

<!-- wxkanban:redaction-rule v1 -->

## Credential redaction — MANDATORY, and it binds YOU, not just the scripts

Legacy applications hardcode database credentials as string literals. Conversion output is committed
as rebuild source material and read into AI context on every later session, so a credential copied
into an artifact is disclosed to everyone with repository access **and** to the model provider.

The `scripts/` in this skill redact automatically — every one of them writes through
`wxconv_redact.write_text()`, which replaces credential values with stable `[[CRED-nn]]` tokens and
records each finding in `_redactions.md`.

**That covers the scripts. It does not cover artifacts you write yourself.** Any file you author
from legacy source — an analysis JSON, a summary table, a scope document, a quoted code excerpt in
chat — bypasses those scripts entirely. The one confirmed credential leak in the field arrived
exactly this way, in an `analysis/*.json` that no script produces.

**So, whenever you write anything derived from legacy source:**

1. **Record the finding.** Note that a credential is hardcoded, which procedure or file it is in, and
   the line. This is genuine rebuild signal — the migration needs to know which code paths carry
   credentials, and the owner needs to know which accounts to rotate.
2. **Write the value as a token,** never the literal: `"password": "[[CRED-01]]"`. Reuse the same
   token for the same value so one credential in twelve places still reads as one credential.
3. **Never drop the element to comply.** Do not omit a credential-bearing procedure, field or module
   from your output in order to avoid writing the value. Removing the finding is worse than the
   original problem: it hides a credential that still exists in the legacy source.
4. **Never reproduce a value in chat either** — not truncated, not masked. A partial mask is a
   disclosure.

### Checking what is already exposed

Artifacts produced before redaction existed are **already disclosed** and rewriting them does not
undo that — rotation is the only remedy. To inventory them:

```
python scripts/pcsoft-doc-split.py --scan-only <output-dir>
```

Read-only: it reports file, line and key, and changes nothing.

### Repository hygiene

- **`analysis/*.json` and other ad-hoc extracts are regenerable — gitignore them** rather than
  committing them. This is the confirmed leak site.
- **The generated technical-documentation export is itself a credential-bearing artifact.** Keep it
  in a controlled store the conversion reads from, not committed at repository root.
- **Turn the gate on in CI:** add `--fail-on-secrets` to any pipeline invocation. Redaction always
  runs, but the flag makes a credential literal fail the build. That gate is the layer that still
  holds when everything else has drifted.

## What this skill produces (summary)

From one PCSoft Technical-Documentation PDF: per-element Markdown under `pre-convert/` (plus
`_discarded.md` listing anything not captured, for review), regenerated React/Tailwind/shadcn pages
under `rebuild/pages/` (WLanguage behavior wired as handler stubs), a target-DB schema + Mermaid ER
diagram under `rebuild/db/`, and under `rebuild/scopes/` a queries scope, a **server/global
procedures scope** (the backend WLanguage business-logic layer, including HFSQL trigger procedures —
these have no UI and are NOT scaffolded as pages), and a reports stub. When conversion is done, hand
off to **`/wxConversionScope`** to generate Scope-of-Project documents from the result.
