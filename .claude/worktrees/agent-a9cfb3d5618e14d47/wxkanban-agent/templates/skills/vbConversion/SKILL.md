---
name: vbConversion
description: >-
  Convert a legacy **Visual Basic 6** (Classic VB / VB6) desktop application into a modern React +
  Tailwind + shadcn/ui rebuild scaffold by parsing its text source — the project (.vbp), forms
  (.frm/.frx), standard modules (.bas), class modules (.cls), and user controls (.ctl). Use this when
  a developer has a VB6 app and wants per-element Markdown, regenerated stack-native page components
  (VB6 form controls → shadcn, with event code wired as handler stubs), a reconstructed data-access
  scope (VB6 has no declarative dictionary — the model is recovered from Data-control RecordSource,
  bound DataFields, and code SQL), a business-logic scope from modules/classes, and a reports stub.
  Deterministic and token-efficient: the mechanical work runs in bundled Python scripts.
---

# vbConversion — Visual Basic 6 source → modern rebuild scaffold

> **The full step-by-step methodology for this skill is delivered by wxKanban at runtime.**
>
> To run the conversion, call the MCP tool **`project.get_command_prompt`** with
> `{ "command": "vbconversion" }`, then follow the returned instructions exactly. They drive the six
> deterministic conversion scripts bundled locally in this skill's **`scripts/`** directory
> (`vb6-project-split.py`, `vb6-form-to-react.py`, `vb6-data-to-sql.py`, `vb6-queries-to-scope.py`,
> `vb6-procs-to-scope.py`, `vb6-reports-to-stub.py`) and reference **`references/vb6-gaps.md`**.
>
> **Scope: VB6 / Classic VB only** — not VB.NET, VBScript/ASP, or VBA-in-Office directly (export
> Access/Excel macros with `Application.SaveAsText` first, then they parse like `.bas`/`.frm`).
>
> **Inputs.** The `.vbp` lists the forms/modules/classes/references and the third-party `Object=` OCX
> controls; pass the project and let the splitter follow its relative paths, or use `--src "<dir>/*"`.
>
> **VB6 has no data dictionary** — the data model (Stage 3) is inferred from the Data-control
> `RecordSource`, the bound `DataField`s, and code SQL; column **types and the primary key must be
> confirmed against the `.mdb`** (the form binding carries names only). Jet data is exported (JSON/CSV)
> and loaded with the generated DDL.
>
> **Windows path gotcha.** Pass **Windows-style** paths (`E:/App/src/*.frm`). Git-Bash/MSYS `/e/...`
> paths silently fail Python's `glob`/`os.path` — empty file set, **no error**.
>
> **Review what was _not_ captured** in `pre-convert/_discarded.md`. **Re-sync check:**
> `wxkanban-agent vbconversion --review` compares `pre-convert/` against `rebuild/` and lists what is
> missing, stale, or orphaned.
>
> If `project.get_command_prompt` is **not available as a tool**, the wxKanban MCP isn't connected to
> your AI client — a setup issue, not billing. Run `/wxAI-project-init` (writes `.mcp.json`) or
> `node scripts/init.mjs`, restart your AI client, approve the `wxkanban` server (Claude Code:
> `/mcp`). Only an explicit **401 / subscription error** is a token problem — re-run `kit-configure`
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

### A credential is not always in a credential-shaped field

Two shapes found in the field defeat a reader who only checks field names — and the second defeats
the scripts too, so **you are the control that catches it**:

- **The field names the credential in a word the scan does not know.** `SMSPortal_Authorization` is
  as credential-bearing as `Password`, and so is anything named for a bearer token, a signature or
  an auth header. Treat the name, not the matcher, as the test.
- **The field is innocuous and only an adjacent comment gives it away.** When the real field was not
  wired up yet, a developer routes the value through whatever field was to hand and leaves the
  intended one behind in a comment:

  ```
  MyMessage.Subject = "<uuid-shaped value>"
  //CompanyDetail.SMSPortal_Authorization
  ```

  The assignment reads as a subject line; the comment is the only evidence. This is a recurring
  workaround, not a one-off — the same shape turned up independently in two conversions of the same
  legacy codebase family. `wxconv_redact` now redacts the bare-field-reference form of it, but a
  comment carrying prose around the field name is deliberately left alone to avoid blanking out real
  captions and subjects. **Whenever a comment near a literal names a credential-shaped field, treat
  the literal as a credential** regardless of what it was assigned to.

### Checking what is already exposed

Artifacts produced before redaction existed are **already disclosed** and rewriting them does not
undo that — rotation is the only remedy. To inventory them:

```
python scripts/vb6-project-split.py --scan-only <output-dir>
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

Per-element Markdown under `pre-convert/` (forms → `*.page.md` + `*.controls.md`, modules/classes →
`*.proc.md`, `_project.md`, `_discarded.md`), regenerated React/Tailwind/shadcn pages under
`rebuild/pages/` (bound fields → a typed `record`, event code → handler stubs, OCX flagged as gaps),
a reconstructed schema + ER diagram under `rebuild/db/`, and under `rebuild/scopes/` a queries scope,
a business-logic scope (Win32 `Declare` flagged non-portable), and a reports stub. When done, hand off
to **`/vbConversionScope`** to generate Scope-of-Project documents.

> **Sibling skills:** `wxConversion` (PCSoft WinDev/WebDev, from a PDF) and `cwConversion` (Clarion,
> from TXA/TXD/.clw). Same `pre-convert/` → `rebuild/` shape — only the parsers differ.
