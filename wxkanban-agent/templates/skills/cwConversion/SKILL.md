---
name: cwConversion
description: >-
  Convert a legacy SoftVelocity / PCSoft **Clarion** desktop application into a modern React +
  Tailwind + shadcn/ui rebuild scaffold by parsing its raw source — the dictionary text export
  (.txd), the application text export (.txa), and any hand-coded or generated Clarion modules
  (.clw/.inc/.equ). Use this when a developer has a Clarion app (Clarion 6 through 11) and wants
  per-element Markdown, regenerated stack-native page components (Clarion WINDOW controls → shadcn,
  with embed code wired as handler stubs), a target-DB schema + ER diagram from the dictionary, a
  queries scope from the VIEW/browse definitions, a server/business-logic scope from procedures and
  embeds, and a reports stub from REPORT structures. It is deterministic and token-efficient: the
  heavy mechanical work runs in bundled Python scripts, the model orchestrates and reviews.
---

# cwConversion — Clarion source (TXA/TXD/.clw) → modern rebuild scaffold

> **The full step-by-step methodology for this skill is delivered by wxKanban at runtime.**
>
> To run the conversion, call the MCP tool **`project.get_command_prompt`** with
> `{ "command": "cwconversion" }`, then follow the returned instructions exactly. They drive the
> deterministic conversion scripts bundled locally in this skill's **`scripts/`** directory
> (`clarion-app-split.py`, `clarion-window-to-react.py`, `clarion-dict-to-sql.py`,
> `clarion-views-to-scope.py`, `clarion-procs-to-scope.py`, `clarion-reports-to-stub.py`,
> `render.mjs`) and reference **`references/clarion-gaps.md`**.
>
> **Input precedence.** Pass `--txd` (dictionary) + `--txa` (application) when you have the clean
> exports; if either is absent the splitter falls back to the generated `.clw` set, so a binary
> `.app`/`.dct` handover converts with `--clw "<dir>/*.clw"` alone. Pass the **whole** `.clw` set —
> including the generated `*_BC*.clw` business-class modules, which carry the dictionary's foreign-key
> graph as `AddRelationLink` calls (recovered into real FK constraints when there is no `.txd`).
>
> **`--txd` means the *text* TXD export, NOT an XML `.dctx`.** A modern Clarion dictionary export
> (`*.dctx`, header `<?xml ...><Dictionary ... DctxFormat="N">`) is **XML** and is not understood by the
> `--txd` parser — passing it yields **zero tables** *and* suppresses the `--clw` table/FK fallback, so
> you silently get a windows-only conversion. When the only dictionary you have is XML `.dctx`, **omit
> `--txd`** and let the dictionary + FK graph be recovered from the generated `*_BC*.clw` modules via
> `--clw`. Symptom of getting this wrong: `pre-convert/` has no `*.table.md` and no `_schema.md`.
>
> **Windows path gotcha.** Pass **Windows-style** paths to the scripts (`E:/App/src/*.clw`, forward
> slashes fine). Git-Bash/MSYS `/e/...` paths silently fail Python's `glob`/`os.path` — the script
> runs with an empty file set and **no error**.
>
> **Review what was _not_ captured.** Unclassified blocks land in **`pre-convert/_discarded.md`**;
> open it, surface anything real to the developer, and decide before continuing — never silently
> discard. **Re-sync check:** `wxkanban-agent cwconversion --review` compares `pre-convert/` (source)
> against `rebuild/` (generated) and lists what is missing, stale, or orphaned.
>
> If `project.get_command_prompt` is **not available as a tool**, the wxKanban MCP isn't connected to
> your AI client — a setup issue, not billing. Register it and restart: run `/wxAI-project-init`
> (writes `.mcp.json`) or `node scripts/init.mjs`, then restart your AI client and approve the
> `wxkanban` server (Claude Code: `/mcp`). Only an explicit **401 / subscription error** from the
> fetch is a token/subscription problem — re-run `kit-configure` or renew at
> https://wxperts.com/account/billing.

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
python scripts/clarion-app-split.py --scan-only <output-dir>
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

From a Clarion app's text exports plus its hand-coded/generated modules: per-element Markdown under
`pre-convert/` (`*.table.md`, `*.page.md` + `*.controls.md`, `*.report.md`, `*.view.md`, `*.proc.md`,
`_schema.md`, `_project.md`, `index.md`, and `_discarded.md` for review), regenerated
React/Tailwind/shadcn pages under `rebuild/pages/` (embed code wired as handler stubs), a target-DB
schema + Mermaid ER diagram under `rebuild/db/` (with **real FK constraints** when the relation graph
is recovered), and under `rebuild/scopes/` a queries scope (VIEW/browse), a server/business-logic
scope (procedures + embeds + dictionary referential-integrity), and a reports stub. When conversion
is done, hand off to **`/cwConversionScope`** to generate Scope-of-Project documents from the result.

> **Sibling skill:** `wxConversion` does the same job for PCSoft **WinDev/WebDev** apps starting from
> a generated technical-documentation **PDF**. `cwConversion` is the **Clarion** counterpart and
> starts from **raw text source** instead — same `pre-convert/` → `rebuild/` shape, only the parsers
> differ.
