# SCOPE-125: Conversion Credential Redaction — Legacy Secrets Must Not Reach Converted Artifacts

**Spec Number**: 125
**Status**: `draft`
**Created**: 2026-08-10
**Last Reviewed**: 2026-08-10
**Depends On**: SPEC-019 (Agent Orchestrator Kit — owns the three conversion skill families, the three-tree sync, and the kit release path)
**Related**: SCOPE-026 (Code Fencing — every new top-level declaration here must be fenced). SCOPE-082 (Generated-Output Watermark — `stamp_markdown` lives inside the one function FR-007 refactors, and must survive it). SCOPE-124 (Idempotent Spec Persistence — its kit release is outstanding; FR-015 rides or waits for it). SCOPE-015 (AI Interaction — adjacent SecretProvider work; explicitly out of scope here).
**Source**: wxKanban feedback ref `f99e80aa-4afc-4d78-9541-ca0bf310fd7b` (severity high, status triaged; origin project `b9f9cbc7-2be9-48ca-a483-227a958e4b2c`, repo MCP-API, kit v1.7.49). Reported by an AI session performing a secrets-egress review. No credential values appear in the report or in this scope.

---

## Overview

The three legacy-application conversion pipelines — `wxConversion` (PCSoft WinDev/WEBDEV),
`vbConversion` (VB6), and `cwConversion` (Clarion) — treat legacy source text as inert data and copy
it into their output unmodified. It is not inert. Legacy applications on all three platforms
routinely hardcode database credentials as string literals, so the pipelines reproduce those literals
into Markdown, SQL, TSX, and JSON artifacts.

Verified in the kit source on 2026-08-10: a grep for `redact|scrub|secret|credential|sanitiz` across
all eighteen conversion scripts returns exactly one hit — `sanitize()` at
`vbConversion/scripts/vb6-data-to-sql.py:145`, which sanitises SQL *identifiers* and is unrelated.
**There is no redaction stage anywhere in any conversion family.**

In `wxConversion/scripts/pcsoft-doc-split.py` the path is direct and unbroken:
`clean_text(doc[i].get_text())` at line 203 applies only a mojibake repair, the result becomes
`pages[].body` at line 208, and every emitted file is assembled from those bodies and written through
`write()` at line 235. Whatever the PDF page contained, the `.md` contains.

What makes this different from an ordinary secret leak is where the secret lands. Conversion output
is *project data*, not configuration. It is committed deliberately, because it is the rebuild source
material. Every filename-based protection — `.env` deny rules, `*.pem` patterns, gitignore
conventions — is keyed on files nobody intends to commit. This arrives in files everybody intends to
commit, and is then read routinely during implementation work, which sends it to the model provider
on every session that touches a conversion artifact.

The developer receives no signal at any point. There is no warning, no summary, and no record.

This scope inserts a credential-redaction boundary into all three families. Credential **values** are
replaced with stable placeholder tokens at the point of extraction. The **fact and location** of each
hardcoded credential is preserved and reported, because "this procedure connects with a hardcoded
credential" is genuine rebuild signal that the migration needs. The scope covers both producers of
conversion artifacts — the Python emitters and the AI itself — introduces the shared write funnel the
emitters never had, and provides a scan mode so developers who have already converted can discover
what is already exposed.

## Business Problem

**Who has the problem.** The legacy-migration developer running a conversion against their own
application. This is wxKanban's beachhead segment, not an edge case.

**What happens today.** The developer points the conversion skill at their source or generated
documentation. Credential literals are copied verbatim into the output. They commit the output,
because that is what the output is for. They then read it in AI sessions for weeks.

**Three compounding exposures**, as reported:

1. Secrets committed to git history.
2. Secrets sent to the model provider on every session that reads a conversion artifact — this has
   already occurred, so affected legacy accounts require rotation regardless of any fix shipped here.
3. Filename-based protections do not help, because the leak arrives in ordinary project data files
   read routinely during implementation.

**Confirmed instance.** In the reporting project, credential literals extracted from WEBDEV source
are present as quoted string assignments in git-tracked `analysis/domains.json` (six locations,
including a UID) and `analysis/procedures.json` (two locations), committed since `1ab3d5c`. Neither
file is gitignored. The 2.4 MB source documentation PDF is also tracked at repository root.

**Cost.** Every legacy account behind those literals requires rotation. Rotation is the only real
remedy — history rewrite does not help, because the credential exists in the legacy source whatever
git history says.

**Why now.** This is a kit-level defect. Every project using the conversion skills against
credential-bearing legacy source has the same exposure, and the conversion families are the
beachhead offering. It is also directly relevant to the SOC 2 posture (CC6.1, CC7.1).

## Actors

Primary: The legacy-migration developer running `/wxConversion`, `/vbConversion`, or `/cwConversion` against their own application's source or generated technical documentation.

Secondary: The kit maintainer, who must ship this to every consumer via kit release and keep nine module copies from drifting; the security reviewer or SOC 2 auditor, who needs evidence that the toolchain does not manufacture secret sprawl; and the downstream AI session, a non-human consumer of conversion artifacts and the vector by which an unredacted artifact becomes an egress event.

**Key value.** A developer can convert a credential-bearing legacy application and commit the output
without leaking a secret — and learns, in the same run, exactly which legacy procedures hardcode
credentials, so they can be rotated and rebuilt properly.

## Scope Boundary

In scope:

- A shared redaction module, one copy per conversion-family `scripts/` directory, across all three
  trees (`.claude/`, `_wxAI/skills/`, `wxkanban-agent/templates/skills/`).
- Wiring into all eighteen extraction and emission scripts per tree, including introducing a write
  funnel where none currently exists.
- A `_redactions.md` sidecar recording token, source artifact, line, and matched **key** — never a
  value.
- A prominent console summary line and an opt-in `--fail-on-secrets` non-zero exit.
- A `--scan-only` mode reporting credential literals in *existing* conversion output without
  modifying it.
- A redaction rule in each family's `SKILL.md`, binding the AI-driven extraction path.
- Repository hygiene guidance covering ad-hoc `analysis/*.json` output and the source documentation
  PDF.
- A byte-parity guard preventing drift across the nine module copies.
- A kit release delivering all of the above to consumers.

## Out of Scope

- **Credential rotation.** This scope surfaces what must be rotated; it cannot rotate a legacy
  account. Rotation remains a human action and remains necessary regardless of this fix.
- **Git history rewrite.** Out for the same reason — the credential exists in the legacy source
  whatever git history says. Rotation ranks above history rewrite in every case.
- **wxKanban's own runtime secret handling.** SecretProvider, environment-variable encryption, and
  AES-256-GCM at rest are separate concerns under SCOPE-015. This scope touches only the conversion
  toolchain.
- **General-purpose secret scanning.** This is not a gitleaks competitor. Patterns target the
  credential shapes these three legacy platforms actually emit.
- **Modifying any consumer repository.** No consumer `.gitignore` is altered and no consumer history
  is rewritten. The reporting project's own remediation is theirs to perform.
- **Any wxKanban application surface.** No table, no route, no React component, no new command.

## User Scenarios

### US1 — Convert a credential-bearing WinDev app (primary path)

A developer points `/wxConversion` at a generated PCSoft technical-documentation export from an app
whose HFSQL connection blocks hardcode `..User` and `..Password` literals.

1. `pcsoft-doc-split.py` runs. As each PDF page is cleaned, the redaction stage matches credential
   keys followed by quoted literals and replaces each value with a stable token.
2. The same literal value encountered on twelve pages receives the **same** token, so the output
   still says "these twelve procedures share one credential" — a materially different finding from
   "there are twelve credentials."
3. Every emitted `.md` — element files, `_discarded.md`, `index.md` — is free of credential values.
4. A `_redactions.md` sidecar is written listing, per finding: token, source artifact, line, and
   matched key name. No values.
5. The console prints the existing per-kind report plus a new line naming the count and sidecar path.

Expected: the developer commits `pre-convert/` with no credential value in it, and holds a list of
legacy accounts to rotate.

### US2 — Find what a previous conversion already leaked (remediation path)

A developer converted months ago and has since read those artifacts in dozens of AI sessions. They
run the conversion script with `--scan-only` against their existing output directory.

1. No file is modified. Nothing is rewritten and nothing is redacted in place.
2. The scan walks existing artifacts — `pre-convert/*.md`, `rebuild/scopes/*.md`, `analysis/*.json`,
   emitted `.sql` and `.tsx` — applying the same pattern set.
3. It reports every match by file, line, and matched key, with a count, and exits non-zero if
   `--fail-on-secrets` is also passed.
4. The report states plainly that anything found has already been disclosed to the model provider and
   to anyone with repository access, and that rotation is the only remedy — redacting the file now
   does not undo the disclosure.

Expected: an accurate exposure inventory and a correctly-framed instruction, rather than false
comfort from a tool that silently cleaned the files.

### US3 — The AI session performs ad-hoc extraction (the confirmed-leak path)

A developer asks the conversion skill for a domain breakdown. The AI writes `analysis/domains.json`
and `analysis/procedures.json` directly — no script involved, no write funnel, nothing the Python fix
touches. This is exactly how the reported leak occurred: verified 2026-08-10, neither filename
appears anywhere in the kit, no script produces them, and no `SKILL.md` names them.

1. Each family's `SKILL.md` carries a binding redaction rule: any artifact the AI authors from legacy
   source is subject to the same constraint as script output — record that a credential is hardcoded,
   never reproduce its value.
2. The AI emits a placeholder token and appends the finding to `_redactions.md` alongside the
   script-produced entries.
3. The rule is stated positively — preserve the finding — so the AI does not comply by dropping
   credential-bearing procedures from the analysis entirely and quietly losing the signal.

Expected: the artifact class that actually leaked is covered, and that coverage does not depend on
the artifact having a producer script.

### US4 — Redaction must not damage the conversion (edge case)

The redaction stage sits inside `clean_text()`, which runs **before** breadcrumb parsing, page
classification, and element grouping. It is upstream of the logic that decides what the conversion
produces at all.

1. A converted project is processed with redaction active and disabled. The element manifest — file
   names, kinds, page ranges, `_discarded.md` contents — is identical.
2. `Password = Arg.SomeValue` and `..User = sConfigUser` are **not** redacted. Only quoted literals
   are, so parameter passing and variable references survive intact and the analytical signal about
   which procedures handle credentials is preserved.
3. Patterns do not run in DOTALL, so an unterminated quote cannot swallow the remainder of a page and
   blank out real content.
4. Clarion's `OWNER('...')` attribute — which carries the full connection string and matches no
   `key = value` shape — is caught by its own pattern.

Expected: conversion fidelity is unchanged and no real content is destroyed. A redaction stage that
silently ate page bodies would be a worse defect than the one it fixes.

## Functional Requirements

| ID | Requirement | Why it exists |
|---|---|---|
| FR-001 | Shared redaction module | One implementation, nine deployed copies |
| FR-002 | Platform-aware pattern set | Three platforms leak in three different shapes |
| FR-003 | Stable token allocation | "One credential in 12 places" is not "12 credentials" |
| FR-004 | wxConversion wiring | The reported family; has a real funnel |
| FR-005 | vbConversion wiring | Leaks at the file-read boundary |
| FR-006 | cwConversion wiring | Needs the `OWNER()` pattern |
| FR-007 | Write funnel for emitters lacking one | Six of nine named files have no funnel |
| FR-008 | `_redactions.md` sidecar | The finding is the deliverable; the value never is |
| FR-009 | Console summary and `--fail-on-secrets` | Silence is the current failure mode |
| FR-010 | `--scan-only` remediation mode | The installed base is already exposed |
| FR-011 | `SKILL.md` AI guardrail | Covers the path that actually leaked |
| FR-012 | Three-tree parity guard | Nine copies, no canonical source |
| FR-013 | Conversion fidelity regression guard | The stage sits upstream of classification |
| FR-014 | Repository hygiene posture | `analysis/*.json` is the confirmed leak site |
| FR-015 | Kit release and consumer reach | No reach to the reporter without it |

### FR-001 — Shared redaction module

A module `wxconv_redact.py` exposes redaction, scanning, and token state, and is importable by every
conversion script using the same `sys.path` insertion pattern already used for `wxkanban_watermark`.

- [ ] Exposes `redact(text, state) -> (text, findings)`, a reusable token/state object, and a
      `scan()` entry point used by FR-010.
- [ ] Zero third-party dependencies — `re` only. Must import where PyMuPDF is absent, since scan mode
      reads no PDFs.
- [ ] Ships with unit tests covering each pattern class, mirroring
      `shared/watermark/python/test_wxkanban_watermark.py`.
- [ ] Never writes a file and never prints a credential value. It returns data; callers decide output.

### FR-002 — Platform-aware pattern set

- [ ] **Keyed quoted literal** — a credential key followed by an assignment and a quoted literal.
      Keys: `password`, `pwd`, `passwd`, `uid`, `userid`, `user id`, `user`, `login`, `apikey`,
      `api_key`, `api-key`, `token`, `secret`, `data source`, `initial catalog`, `connectionstring`,
      `connection string`. Assignment forms `=`, `:=`, `:`. Case-insensitive.
- [ ] **Clarion `OWNER()` attribute** — in `.txa`/`.dct` this carries the entire connection string
      including credentials and matches no `key = value` shape. Its own pattern, applied in
      `clarion-app-split.py` and `clarion-dict-to-sql.py`.
- [ ] **Positional credential arguments** — WLanguage `HDescribeConnection` / `HOpenConnection` and
      VB6 ADO `.Open` pass credentials as bare positional quoted literals with no key at all.
      Named-function patterns redact the credential-bearing argument positions.
- [ ] **Only quoted literals are redacted.** `Password = Arg.Something`, `..User = sConfigUser`, and
      any unquoted right-hand side are left untouched.
- [ ] Patterns do not use DOTALL. An unterminated quote cannot consume the rest of a page.
- [ ] The pattern set is data in one reviewable table, not literals scattered across scripts, so
      adding a shape is a data change.

Residual risk, which FR-008 requires stating to developers: a credential in a literal with no key and
no recognised enclosing function — an unconventionally-named variable, or a value assembled by
concatenation — will not match. This is a mitigation, not a guarantee.

### FR-003 — Stable token allocation

- [ ] Identical credential values map to the identical token across the whole run, including across
      files.
- [ ] Distinct values always receive distinct tokens.
- [ ] Token format is visually obvious as a placeholder and survives Markdown, JSON, SQL, and TSX
      without escaping. **Resolved at implementation: `[[CRED-nn]]`, not `<<CRED-nn>>`.** Angle
      brackets are unsafe — `<CRED-01>` parses as a raw HTML tag in GitHub-flavoured Markdown and can
      be swallowed by the renderer, and Markdown is this pipeline's primary output format, including
      the findings sidecar itself.
- [ ] The value-to-token map lives only in memory for the run's duration and is **never** serialised
      to disk. There is no `--redaction-map` flag; a flag that writes plaintext secrets to disk is a
      footgun whose git-worktree guard fails on worktrees, submodules, and plain directories later
      placed under version control.

### FR-004 — wxConversion wiring

- [ ] Primary redaction applied inside `clean_text()` in `pcsoft-doc-split.py`, immediately after the
      mojibake repair and before breadcrumb parsing, so no page body ever holds a literal.
- [ ] Defence-in-depth re-scrub at the top of `write()`, the single funnel for every emitted file.
- [ ] `pcsoft-page-to-react.py`, `pcsoft-schema-to-sql.py`, `pcsoft-procs-to-scope.py`,
      `pcsoft-queries-to-scope.py` and `pcsoft-reports-to-stub.py` scrub at their emission points.
- [ ] Findings from all six scripts accumulate into one `_redactions.md`.

### FR-005 — vbConversion wiring

- [ ] Redaction applied at the `read_text()` boundary in `vb6-project-split.py`, covering `.frm`,
      `.bas`, and `.cls` before any parsing.
- [ ] All six family scripts scrub at emission: `vb6-form-to-react.py`, `vb6-data-to-sql.py`,
      `vb6-procs-to-scope.py`, `vb6-queries-to-scope.py`, `vb6-reports-to-stub.py`, and the splitter.
- [ ] The existing `sanitize()` in `vb6-data-to-sql.py` is left alone — it sanitises SQL identifiers
      and is unrelated. The name collision is nominal only; no renaming.

### FR-006 — cwConversion wiring

- [ ] Redaction applied at the `read_text()` boundary in `clarion-app-split.py` and at the
      `open().read()` sites in `clarion-dict-to-sql.py`.
- [ ] The `OWNER()` pattern is active for this family. It is the most common Clarion credential leak
      and will fire on essentially every Clarion conversion.
- [ ] `clarion-window-to-react.py`, `clarion-procs-to-scope.py`, `clarion-views-to-scope.py` and
      `clarion-reports-to-stub.py` scrub at emission.

### FR-007 — Write funnel for emitters lacking one

Only `pcsoft-doc-split.py` has a `write()`. Others emit through bare `open(path, "w").write(...)` —
verified at `pcsoft-schema-to-sql.py:283-284`, `pcsoft-page-to-react.py:825-826`, and
`clarion-dict-to-sql.py:272-273`.

- [ ] A shared `write_text(path, text, state)` helper is introduced and every bare emission site is
      routed through it.
- [ ] The helper applies redaction, accumulates findings, and preserves existing behaviour —
      including the `stamp_markdown` watermark call for `.md` paths, which must not be lost in the
      refactor (SCOPE-082 regression risk).
- [ ] After the change, no conversion script writes a file except through the helper. Verifiable by
      grep, and asserted in CI — this is what stops the next emitter from reintroducing the leak.

### FR-008 — `_redactions.md` sidecar

- [ ] Written to the conversion output directory whenever findings exist; not written when there are
      none.
- [ ] Each row records token, source artifact, line number, and matched key name.
- [ ] **No credential value appears in the sidecar, ever** — not truncated, not hashed, not partially
      masked. A partial mask is a disclosure.
- [ ] Carries a header stating that (a) rotation is required for every account listed, (b) redaction
      does not undo prior disclosure, and (c) pattern matching is a mitigation, not a guarantee, so
      unmatched shapes may remain.
- [ ] Watermarked via `stamp_markdown`, consistently with every other emitted `.md`.

### FR-009 — Console summary and `--fail-on-secrets`

- [ ] Every run prints a summary line alongside the existing per-kind report, naming the count and
      the sidecar path.
- [ ] When findings exist the line is visually prominent. Its absence is the current defect.
- [ ] `--fail-on-secrets` is accepted by every conversion script, **defaults off**, and causes exit
      non-zero when one or more findings exist.
- [ ] Redaction itself is unconditional. No flag disables it.

### FR-010 — `--scan-only` remediation mode

- [ ] Accepted by the splitter script of each family. Reads existing artifacts, applies the pattern
      set, writes and modifies nothing.
- [ ] Covers `.md`, `.json`, `.sql`, `.tsx`, and `.html` under the target directory; skips binaries
      and `node_modules`.
- [ ] Reports file, line, and matched key — never a value — to stdout, and honours
      `--fail-on-secrets`.
- [ ] Output states that findings represent already-disclosed credentials and that rotation is the
      only remedy.
- [ ] Exits 0 with an explicit "no credential literals found" when clean, so a silent exit is never
      mistaken for a skipped run.

### FR-011 — `SKILL.md` AI guardrail

- [ ] Each of the three `SKILL.md` files gains a redaction rule binding **AI-authored** artifacts,
      not only script output.
- [ ] The rule is stated positively: record that a credential is hardcoded, at which procedure and
      line, using a placeholder token — never reproduce the value, and never drop the
      credential-bearing element from the analysis in order to comply.
- [ ] The rule explicitly covers ad-hoc artifacts with no producer script, naming `analysis/*.json`
      as the known case.
- [ ] Applied across all three trees, so consumers receive it on kit upgrade.
- [ ] The rule block carries a **rule-version marker**, so a consumer's `SKILL.md` can be identified
      as predating the redaction rule (checked by FR-012).
- [ ] **This rule is the fast-feedback layer, not the control of record.** Its absence or staleness
      must not leave the AI-authored path uncovered: FR-010's scanner plus FR-009's gate must catch
      the same literal with no `SKILL.md` involvement at all. Testable — run the scanner against an
      artifact written with the rule absent and assert the literal is still reported.

**Why the demotion:** FR-011 is delivered by *modifying* a file the consumer may have customised, and
that delivery is changing underneath this scope (see C-12). FR-010 and FR-009 ship as a *new* file,
which every upgrade path places cleanly. An instruction file is the least reliable thing the kit
ships, so it cannot be the only thing standing between an AI session and a committed credential.

### FR-012 — Three-tree parity guard

- [ ] `auditfences` gains a check that all copies of `wxconv_redact.py` are byte-identical, failing
      with the diverging paths named when they are not.
- [ ] The check runs in CI under `--strict` and fails hard — there is no local warn-only mode.
- [ ] The check also covers `wxkanban_watermark.py`, which has the same nine-copy exposure today and
      no guard at all.
- [ ] The check's inventory includes `Bugs/pcsoft-page-to-react_PATCHED.py`, a fourth divergent copy
      outside all three trees (verified 2026-08-10: `56f95a35` against live `60572c2e`).
- [ ] The same check compares each family's `SKILL.md` **rule-version marker** (FR-011) against the
      version the kit ships. A consumer whose marker is absent or behind gets a message naming the
      redaction guardrail specifically, and stating that the AI-authored path is relying on the
      scanner alone — not a generic stale-file notice they have no reason to read.
- [ ] Marker checking is **detection only**. It never rewrites a consumer's `SKILL.md`.

### FR-013 — Conversion fidelity regression guard

- [ ] A regression test asserts that for a fixture input, the element manifest — file names, kinds,
      page ranges, `_discarded.md` contents — is byte-identical with redaction active and inactive.
- [ ] A fixture containing synthetic credential literals in each supported shape verifies that each
      pattern fires.
- [ ] A negative fixture verifies that unquoted right-hand sides such as `Password = Arg.Something`
      are **not** redacted.
- [ ] Fixtures are synthetic. No real customer source and no real credential is committed as test
      data.

### FR-014 — Repository hygiene posture

- [ ] The conversion `SKILL.md` files document that ad-hoc `analysis/*.json` output is regenerable
      and should be gitignored rather than committed.
- [ ] Guidance covers the source documentation PDF — a generated technical-doc export is itself a
      credential-bearing artifact, and committing it at repository root is the same exposure by
      another route.
- [ ] Guidance only. No consumer `.gitignore` is altered by this scope.
- [ ] **Enabling `--fail-on-secrets` in CI is the documented recommendation, with the invocation
      shown** — not a passing mention. FR-009 keeps the flag defaulted off so a first run does not
      hard-stop a developer who merely wants to see output, but the CI gate is the layer that holds
      when everything else drifts: it does not depend on the `SKILL.md` rule having survived an
      upgrade, does not depend on anyone reading a console summary, and catches a credential literal
      in a committed artifact whether a script or an AI session wrote it.

### FR-015 — Kit release and consumer reach

- [ ] A kit release is cut and published, carrying the redaction module, the wiring, and the
      `SKILL.md` rule for all three families.
- [ ] Release assets are **explicitly verified present** on GitHub Releases across both channels —
      "release cut" alone is not sufficient evidence of reach.
- [ ] A consumer running kit upgrade receives the module on disk in all three family directories.
- [ ] Feedback `f99e80aa-4afc-4d78-9541-ca0bf310fd7b` is answered and closed with the shipped version
      named, and the reply states which parts of the report verification confirmed and which two it
      corrected.

## Data Requirements

None. This scope introduces no table, no column, and no migration. Nothing touches PostgreSQL.

The only persisted artifact is `_redactions.md`, a per-conversion Markdown sidecar written to the
developer's own output directory. It is not a wxKanban record and is never transmitted.

## API Routes

None. This is offline CLI tooling. No Express endpoint is added, changed, or removed.

Confirmed with the product owner that no wxKanban application surface is expected — including no
event capture of redaction counts. Capturing redaction events for the audit trail (CC7.2) would pull
MCP into a scope that is otherwise pure offline tooling, and was deliberately excluded.

## Frontend Components

None. No React surface, no Cockpit indicator, nothing renders.

No new command is added either — three existing skills gain flags and a rule, so the command surface
is unchanged and nothing new needs surfacing in the Cockpit.

## Integration Context

This scope must align with several existing kit mechanisms:

- **`stamp_markdown` (SCOPE-082)** — the watermark call currently lives inside
  `pcsoft-doc-split.py`'s `write()`, the exact function FR-007 refactors into a shared helper. Losing
  it would silently un-watermark every conversion artifact.
- **`auditfences` (SCOPE-026)** — extended by FR-012 with the byte-parity check, running in CI under
  `--strict`.
- **Code fencing (SCOPE-026)** — all new top-level Python declarations require `[SCOPE NNN / Tnnn]`
  fences written by `implement`, never by hand.
- **`sync-to-orchestrator.mjs`** — mirrors `.claude/` and `_wxAI/` into the kit and normalises CRLF
  to LF. Scripts must be LF-clean in all three trees or the parity guard fails on line endings rather
  than content.
- **Kit release path (SPEC-019)** — the only route by which this reaches the reporter.

**Toolchain inventory.** Per family `scripts/` directory, across three families and three trees: one
new `wxconv_redact.py`; the family splitter gains redaction at the read/clean boundary plus the
funnel and flags; five remaining emitters are routed through the shared funnel; `SKILL.md` gains the
AI rule; `wxkanban_watermark.py` is unchanged but added to the parity guard. Totals: **54 script
edits, 9 new module copies, 9 `SKILL.md` edits, 1 `auditfences` check**, plus fixtures and a release.

**Module contract.** `redact(text, state) -> (text, findings)` where state owns the value-to-token map
for the run and findings carry token, key name and line but never a value; `scan(text, path) ->
findings`, read-only, for FR-010; and `write_text(path, text, state)`, the shared funnel, which
applies redaction, accumulates findings, and preserves `stamp_markdown` for `.md` paths.

## Compliance Requirements

SOC 2 is active for this project. Three controls apply directly.

| Control | Requirement | How this scope satisfies it |
|---|---|---|
| **CC6.1** | Secrets management solution | The toolchain no longer manufactures hardcoded-secret sprawl in project data. FR-008's explicit limit statement matches this control's own guidance that the presence of a secrets call proves nothing about hardcoded values elsewhere. |
| **CC6.1** | Different credentials per environment | Legacy applications typically share one production credential across all environments. FR-008's rotation instruction is where that surfaces to the developer. |
| **CC7.1** | Vulnerability findings tracked to resolution | `_redactions.md` gives each finding an owner, a location, and a closure action. FR-009's `--fail-on-secrets` prevents silent ageing. |

## Success Metrics

1. **Zero credential values survive a conversion** — running the full pattern set over every artifact
   produced by converting a credential-bearing fixture returns **0 matches**, across `.md`, `.json`,
   `.sql`, `.tsx` and `.html`, including `_discarded.md` and `index.md`. Measured by `--scan-only`
   over the redacted output: exit 0, zero findings.
2. **No conversion script writes a file outside the funnel** — **0** occurrences of a bare
   `open(..., "w")` write across all 54 scripts, asserted by grep in CI.
3. **Nine module copies stay byte-identical** — `auditfences --strict` exits **0** with all copies of
   `wxconv_redact.py` and `wxkanban_watermark.py` matching. A single diverging byte fails the build
   and names the paths.
4. **Conversion output is otherwise unchanged** — the element manifest is **byte-identical** between
   a redacted and an unredacted run of the same fixture. Any diff other than a credential value is a
   failure.
5. **The analytical signal survives** — on a fixture with N known hardcoded credentials across M
   procedures sharing K distinct values: exactly **N** findings reported, exactly **K** distinct
   tokens allocated, all **M** procedures still present with their credential-handling code intact,
   and **0** unquoted right-hand sides redacted.
6. **The developer is told every time** — **100%** of runs producing findings emit both the console
   summary line and `_redactions.md` with matching counts; **0%** disclose a value through either,
   including truncated or partially-masked forms.
7. **Existing exposure is discoverable** — `--scan-only` against a fixture reproducing the reported
   leak shape (literals in `analysis/*.json` with no producer script) reports **every** literal with
   file, line and key, and states that rotation is required.
8. **The fix reaches the people who have the problem** — a kit release is cut, release assets are
   explicitly verified present on both channels, `--version` reports the bumped version, a consumer
   upgrade delivers the module to all **3** family directories, and feedback `f99e80aa` is closed
   with the shipped version named.

Metric 5 exists because metrics 1 and 6 are both satisfiable by an over-aggressive scrubber that
deletes credential-bearing content outright. Metric 5 is the only one such an implementation fails.

## Constraints

**C-1 — UTF-8 corruption hazard (highest implementation risk).** `pcsoft-doc-split.py` lines 51-57
hold a mojibake-repair table whose keys are raw multi-byte UTF-8 sequences (verified at byte level
2026-08-10: `\342\200\231` = U+2019, `\302\240` = NBSP). Any encoding-lossy rewrite of that file
silently destroys the table — nothing throws, every subsequent conversion simply emits mojibake, and
the failure surfaces weeks later as unreadable output. The standing field observation that the
orchestrator's MODIFY path corrupts UTF-8 across all files it touches makes this a live risk across a
54-file change. After any tooling-driven edit of this file the MOJIBAKE table must be byte-verified
against its pre-edit state; if the MODIFY path is used at all, this file is excluded from it and
edited directly.

**C-2 — Nine copies, no canonical source.** Accepted deliberately, consistent with how
`wxkanban_watermark.py` is maintained. FR-012's byte-parity guard is the mitigation. A shared-source
refactor is a future scope, not this one.

**C-3 — A fourth divergent copy exists.** `Bugs/pcsoft-page-to-react_PATCHED.py` differs from the
live script and sits outside all three trees. It is folded into the FR-012 guard inventory rather
than left as an unguarded third state.

**C-4 — Rotation is the only remedy, and this scope cannot perform it.** Every credential already in
a committed artifact has been disclosed to the model provider and to anyone with repository access.
Redaction is forward-looking only. This must be stated in `_redactions.md` and in scan-mode output,
not only in this document — the artifacts are what developers actually read.

**C-5 — Pattern matching is a mitigation, not a guarantee.** Concatenated values, unconventionally
named variables, and encoded literals will not match. Overstating coverage is worse than the current
state, because it converts an unknown risk into a false assurance.

**C-6 — No third-party dependencies.** `re` only. Conversion runs on customer machines that may be
offline or restricted, and scan mode must import without PyMuPDF.

**C-7 — Fencing and numbering.** New top-level declarations require fences written by `implement`,
never by hand. Fence labels must be `Tnnn` — an `FR-nnn` label silently fails the `T\d+` regex and
registers as unfenced. This is SCOPE-125, implemented by **SPEC-125**: 125 was verified free in both
namespaces (local `specs/` folders and the DB both top out at 124), so the two numbers are aligned
1:1 following the SCOPE-106 precedent. Fences read `[SCOPE 125 / Tnnn]`.

**C-8 — Line endings (CORRECTED at implementation, 2026-08-10).** `sync-to-orchestrator.mjs`
normalises CRLF to LF on the way into the kit, and development happens on Windows. The original
wording — "scripts must be LF-clean in all three trees" — was **wrong**: an audit of all 27 conversion
scripts found every one of them is **CRLF** in every tree today. CRLF in source is the working
convention; normalising them to LF would have been a pointless sweep that touched every file for no
benefit. The real requirement is that line endings are **consistent across the three trees**, so the
FR-012 byte-parity guard compares content rather than line endings, and any new file is written CRLF
to match its neighbours.

**C-9 — Test data is synthetic, always.** No real customer source, no real credential, and no real
generated documentation PDF enters the repository as a fixture. The reported leak included a 2.4 MB
tracked source PDF; committing our own would repeat the defect while testing the fix for it.

**C-10 — Release sequencing.** FR-015 requires a cut release. A kit release is already outstanding
from SCOPE-124 and prior field reports remain unanswered. This fix rides that release or waits for
it — it cannot reach the reporter otherwise.

**C-11 — Consumer repositories are not modified.** FR-014 is guidance only. The reporting project's
own remediation — untracking `analysis/*.json`, deciding the PDF's home, rotating the affected
accounts — is theirs to perform.

**C-12 — ⚠ WARNING: the `SKILL.md` rule may not reach the consumers who need it most.** FR-011 is
delivered by *modifying* a file, and modified-file delivery is changing underneath this scope.

**Today**, the shipped upgrade blindly extracts the archive over the project root, so the rule arrives
by overwriting whatever the consumer has. It works — but only because of the very defect SCOPE-121
exists to fix. Relying on it means relying on a bug that is being removed.

**After SCOPE-121 lands**, preserve-and-report means a consumer who has customised their conversion
`SKILL.md` receives the rule as a `.kit-<version>.new` sidecar instead. At the CLI they are stopped
and told, which is fine. On the **Cockpit one-click path** — which uses the `--yes` logged override
deliberately kept so that path survives — the upgrade proceeds and the notice is a log line they may
never read. The redaction guardrail would then be inactive for exactly the customers most engaged with
the conversion skills, and nothing would say so.

**Mitigation:** FR-010's scanner plus FR-009's gate cover the AI-authored path with no `SKILL.md`
involvement, and ship as a *new* file that overlay and preserve-and-report both place cleanly.
FR-012's marker check makes a stale rule loud and specific. FR-011 is therefore explicitly demoted to
fast-feedback and **must not be treated as sufficient on its own**.

**Do not resolve this by carving security-control files out of SCOPE-121's preserve-and-report.** That
guarantee erodes the moment it takes exceptions, and SCOPE-121's own reasoning applies directly: an
auto-merge onto a working conversion artifact reproduces the silent-wrong-output failure it is fixing.
The marker check reaches the same outcome without granting the upgrader permission to overwrite. If
force-update semantics for kit-owned security files are ever wanted, that is a **SCOPE-121 decision**
and must be taken there, not assumed here.

## Open Questions

1. **Should scan mode take an arbitrary path rather than a fixed artifact-type list?** Broader
   coverage, but it will walk `node_modules` and binaries unless filtered. Currently specified as a
   fixed set of extensions.
2. **Should the FR-013 fixture be committed or generated at test time?** Committed is simpler to
   reason about; generated means nothing credential-shaped ever enters the repository, even
   synthetic. Currently specified as synthetic and committed.
3. **Is `Bugs/pcsoft-page-to-react_PATCHED.py` retained or retired?** Folded into the FR-012 guard
   per decision, but it carries a validated patch for the control-prefix bug that may not exist
   elsewhere — retiring it without confirming that patch has landed would lose it.
4. **Does the positional-argument pattern (FR-002) need extending beyond the named functions?** The
   current list covers WLanguage `HDescribeConnection` / `HOpenConnection` and VB6 ADO `.Open`.
   Other credential-taking calls may exist per platform and will surface during implementation.
5. **Does redaction belong in `wxConversionScope` / `vbConversionScope` / `cwConversionScope`?** Those
   generate scope documents from already-converted output. If the conversion output is clean they
   inherit clean input, but they were not audited in this scope.

## Notes

**On the report.** The source report is high quality: accurate line references, correct root cause,
and no credential values disclosed anywhere in it. Verification confirmed the core claim exactly —
`clean_text` at line 60 and `write` at line 235 in `pcsoft-doc-split.py`, and no redaction stage in
any family.

Two findings correct it, and both changed this scope:

1. **The confirmed leak has no producer script.** `analysis/domains.json` and
   `analysis/procedures.json` appear nowhere in the kit. A Python-only fix would have shipped, been
   declared done, and not prevented the one leak that can actually be pointed at. This is why FR-011
   is a first-class requirement rather than an addendum.
2. **Six of the nine named files have no write funnel.** The report's "add the `write()`-level scrub
   for consistency" applies only to `pcsoft-doc-split.py`. The rest emit through bare
   `open(path, "w").write(...)`, so there was nothing to hook. FR-007 is work the report prices at
   zero.

One gap was also found in the proposed regex: it omits bare `user`, while WinDev HFSQL connection
code uses `..User` alongside `..Password`. The username half of the most common WinDev pattern would
have passed through. FR-002 adds it.

**Implementation found two more pattern defects (2026-08-10), both caught by testing rather than
review:**

1. **JSON key-value pairs did not match.** In JSON the key is itself quoted (`"uid": "sa"`), putting
   the closing quote between the key and the separator. JSON is the exact format of the confirmed
   leak, so the scanner would have shipped blind to the artifact class that actually leaked.
2. **Hungarian notation did not match** — `gsPassword`, `gsUser`, `m_sPassword`, `txtPassword`. The
   leading word-boundary anchor required the key to start an identifier, excluding the dominant VB6
   naming style. Found by an **end-to-end conversion run against a realistic `.bas` file**, not by
   the unit tests: those had been written from the same wrong assumption as the pattern, so they
   confirmed it. Fixed with a camelCase-aware start check rather than by dropping the anchor, which
   would have over-redacted `fluid = "water"`.

The lesson worth carrying: a test suite written from the same mental model as the code validates the
model, not the behaviour. FR-013's fixtures must be built from representative legacy source, not from
the pattern table.

**On why this is not a small fix.** The report reads as "add a regex." It is not, because credential
handling has no owner: eighteen scripts per tree each emit independently, several through bare
`open().write()`, one artifact class has no producer at all, and the whole thing exists in three
synchronised trees plus one divergent copy. The regex is the smallest part of the work.

**On dogfooding.** wxKanban ships the conversion skills and also uses them. The parity guard, the
funnel, and the fixtures all get exercised here first.

**Residual implementation risk.** FR-007's funnel refactor across 54 files is where this goes wrong,
and C-1 means the single most dangerous file to touch is also the one that must change first.

**Amendment, 2026-08-10 — layering of the AI-authored path.** The scope as first written had FR-011
carrying that path alone. That was wrong for a *delivery* reason rather than a design reason: an
instruction file is the least reliable thing the kit ships, because it arrives by modifying something
the consumer may have edited. The path is now covered twice, deliberately, because the two layers fail
differently:

| Layer | Role | Survives a kit upgrade? |
|---|---|---|
| FR-010 scanner + FR-009 gate | **Control of record** — catches the value however it was written | Yes — ships as a new file |
| FR-011 `SKILL.md` rule | Fast feedback — prevents the write rather than detecting it | Only if the consumer has not customised the file |
| FR-012 marker check | Detector — makes a stale rule loud and specific | Yes — runs from kit-shipped code |

See C-12 for the full warning.
