# Spec 125: Conversion Credential Redaction

**Spec Number**: 125
**Feature**: Conversion Credential Redaction
**Status**: `planned`
**Phase**: implementation
**Priority**: high
**Created**: 2026-08-10
**Umbrella Scope**: SCOPE-125 (`specs/Project-Scope/125-conversion-credential-redaction.md`)
**Source**: wxKanban feedback ref `f99e80aa-4afc-4d78-9541-ca0bf310fd7b` (severity high; origin project `b9f9cbc7-2be9-48ca-a483-227a958e4b2c`, repo MCP-API, kit v1.7.49)

---

## Overview

The three legacy-application conversion pipelines — `wxConversion` (PCSoft WinDev/WEBDEV),
`vbConversion` (VB6), and `cwConversion` (Clarion) — treat legacy source text as inert data and copy
it into their output unmodified. It is not inert: legacy applications on all three platforms
routinely hardcode database credentials as string literals, so the pipelines reproduce those literals
into Markdown, SQL, TSX, and JSON artifacts.

Verified 2026-08-10: a search for redaction across all eighteen conversion scripts returns exactly
one hit, an unrelated SQL-identifier sanitiser. There is no redaction stage anywhere in any family.
In `pcsoft-doc-split.py` the path is direct — page text is cleaned for character encoding only,
becomes the page body, and every emitted file is assembled from those bodies.

This spec inserts a credential-redaction boundary into all three families. Credential **values** are
replaced with stable placeholder tokens at extraction. The **fact and location** of each hardcoded
credential is preserved and reported, because that is required output for both the rebuild and the
rotation that must follow. It covers both producers of conversion artifacts — the Python emitters and
the AI session itself — introduces the shared write boundary the emitters never had, and adds a
read-only scan mode so already-converted projects can discover existing exposure.

## Business Problem

Conversion output is committed project data, not configuration. It is committed deliberately, because
it is the rebuild source material, and is then read routinely during implementation — sending any
credential it contains to the model provider on every session that touches it.

Every filename-based protection (environment-file deny rules, key-file patterns, gitignore
convention) is keyed on files nobody intends to commit. This exposure arrives in files everybody
intends to commit, and the developer receives no signal at any point: no warning, no summary, no log.

Confirmed instance: credential literals extracted from WEBDEV source are present as quoted string
assignments in two git-tracked artifacts in the reporting project, committed since `1ab3d5c`, neither
gitignored, alongside a tracked 2.4 MB source documentation PDF. Every legacy account behind those
literals requires rotation, and rotation is the only real remedy — history rewrite does not help,
because the credential exists in the legacy source whatever git history says.

This is a kit-level defect. Every project using the conversion skills against credential-bearing
legacy source has the same exposure, and the conversion families are the beachhead offering.

## Actors

- Primary: The legacy-migration developer running a conversion against their own application's source or generated technical documentation.
- Secondary: The kit maintainer shipping this to consumers and preventing drift across nine module copies; the security reviewer or SOC 2 auditor needing evidence the toolchain does not manufacture secret sprawl; and the downstream AI session, a non-human consumer of conversion artifacts and the vector by which an unredacted artifact becomes an egress event.

## Success Metrics

1. Zero credential values survive a conversion — scanning every artifact produced from a
   credential-bearing fixture returns **0 matches** across `.md`, `.json`, `.sql`, `.tsx` and
   `.html`, including `_discarded.md` and `index.md`.
2. **0** occurrences of a bare `open(..., "w")` write remain across all **54** conversion scripts,
   asserted by grep in CI.
3. `auditfences --strict` exits **0** with all **9** copies of the redaction module and all **9** of
   the watermark module byte-identical; a single diverging byte fails the build.
4. The element manifest is **byte-identical** between a redacted and an unredacted run of the same
   fixture — any diff other than a credential value is a failure.
5. On a fixture with N credentials across M procedures sharing K distinct values: exactly **N**
   findings, exactly **K** distinct tokens, all **M** procedures retained with credential-handling
   code intact, and **0** unquoted right-hand sides redacted.
6. **100%** of runs producing findings emit both the console summary and the sidecar with matching
   counts; **0%** disclose a value through either, including truncated or masked forms.
7. Scan mode reports **every** literal in a fixture reproducing the reported leak shape, with file,
   line and key, and states that rotation is required.
8. Kit release cut, assets **explicitly verified** present on both channels, and a consumer upgrade
   delivers the module to all **3** family directories.

## Scope Boundary

- A shared redaction module, one copy per conversion-family `scripts/` directory across all three
  trees (`.claude/`, `_wxAI/skills/`, `wxkanban-agent/templates/skills/`).
- Wiring into all eighteen extraction and emission scripts per tree, including introducing a write
  funnel where none exists.
- A findings sidecar recording token, artifact, line and matched key — never a value.
- A prominent console summary and an opt-in `--fail-on-secrets` non-zero exit.
- A `--scan-only` mode reporting literals in existing output without modifying it.
- A redaction rule in each family's `SKILL.md`, binding the AI-driven extraction path.
- Repository hygiene guidance for ad-hoc analysis output and source documentation exports.
- A byte-parity guard across the nine module copies.
- A kit release delivering all of the above to consumers.

## Out of Scope

- **Credential rotation.** This spec surfaces what must be rotated; it cannot rotate a legacy
  account. Rotation remains a human action and remains necessary regardless.
- **Git history rewrite.** The credential exists in the legacy source whatever git history says.
- **wxKanban's own runtime secret handling.** SecretProvider and encryption at rest are SCOPE-015.
- **General-purpose secret scanning.** Patterns target the shapes these three platforms emit.
- **Modifying any consumer repository.** No consumer gitignore is altered and no history rewritten.
- **Any wxKanban application surface.** No table, route, component, command, or MCP event capture.

## Open Questions

1. Should scan mode accept an arbitrary path rather than a fixed artifact-type list? Broader coverage,
   but it walks `node_modules` and binaries unless filtered.
2. Should the fidelity fixture be committed or generated at test time? Generated means nothing
   credential-shaped ever enters the repository, even synthetic.
3. Is `Bugs/pcsoft-page-to-react_PATCHED.py` retained or retired? It carries a validated patch for the
   control-prefix bug that may not exist elsewhere.
4. Does the positional-argument pattern need extending beyond the named functions? Other
   credential-taking calls may exist per platform.
5. Do the three `*ConversionScope` skills need auditing? They consume already-converted output and
   were not reviewed here.

## Functional Requirements

### FR-001 — Shared redaction module

`wxconv_redact.py` exposes `redact(text, state) -> (text, findings)`, a reusable token/state object,
and a `scan()` entry point, importable via the same `sys.path` pattern used for `wxkanban_watermark`.

- Zero third-party dependencies (`re` only); must import where PyMuPDF is absent.
- Ships unit tests covering each pattern class.
- Never writes a file and never prints a credential value.

### FR-002 — Platform-aware pattern set

- **Keyed quoted literal**: credential key + assignment + quoted literal. Keys include `password`,
  `pwd`, `passwd`, `uid`, `userid`, `user id`, `user`, `login`, `apikey`, `api_key`, `api-key`,
  `token`, `secret`, `data source`, `initial catalog`, `connectionstring`, `connection string`.
  Assignment forms `=`, `:=`, `:`. Case-insensitive.
- **Clarion owner attribute**: `OWNER('...')` carries the full connection string and matches no
  `key = value` shape; requires its own pattern.
- **Positional credential arguments**: WLanguage `HDescribeConnection` / `HOpenConnection` and VB6 ADO
  `.Open` pass credentials as bare positional quoted literals with no key.
- **Only quoted literals are redacted.** Unquoted right-hand sides are left untouched.
- Patterns do not use DOTALL; an unterminated quote cannot consume the rest of a page.
- The pattern set is data in one reviewable table, not literals scattered across scripts.

### FR-003 — Stable token allocation

Identical values map to identical tokens across the whole run including across files; distinct values
always get distinct tokens; the token format survives Markdown, JSON, SQL and TSX without escaping;
and the value-to-token map lives only in memory and is never serialised to disk. There is no
`--redaction-map` flag.

**Token form is `[[CRED-nn]]`, not `<<CRED-nn>>`** (decided at implementation, T003). Angle brackets
are unsafe here: `<CRED-01>` parses as a raw HTML tag in GitHub-flavoured Markdown and can be
swallowed by the renderer, and Markdown is this pipeline's primary output format — including the
findings sidecar itself. Double square brackets render literally in Markdown and need no escaping in
JSON, SQL or TSX. Asserted by `test_token_is_safe_in_markdown_json_sql_and_tsx`.

### FR-004 — wxConversion wiring

Primary redaction inside `clean_text()` in `pcsoft-doc-split.py`, after the mojibake repair and before
breadcrumb parsing. Defence-in-depth re-scrub at the top of `write()`. The five remaining family
emitters scrub at their emission points. Findings accumulate into one sidecar.

### FR-005 — vbConversion wiring

Redaction at the `read_text()` boundary in `vb6-project-split.py` covering `.frm`, `.bas` and `.cls`
before parsing. All six family scripts scrub at emission. The existing identifier `sanitize()` is left
alone; the name collision is nominal only.

### FR-006 — cwConversion wiring

Redaction at the `read_text()` boundary in `clarion-app-split.py` and the read sites in
`clarion-dict-to-sql.py`. The owner-attribute pattern is active for this family — the most common
Clarion credential leak. The four remaining emitters scrub at emission.

### FR-007 — Write funnel for emitters lacking one

A shared `write_text(path, text, state)` helper is introduced and every bare emission site routed
through it. The helper applies redaction, accumulates findings, and preserves the `stamp_markdown`
watermark call for `.md` paths. After the change no conversion script writes a file except through
the helper — verifiable by grep and asserted in CI.

### FR-008 — Findings sidecar

Written when findings exist; not written when there are none. Records token, artifact, line and
matched key. **No credential value appears, ever** — not truncated, not hashed, not partially masked.
Carries a header stating that rotation is required, that redaction does not undo prior disclosure, and
that pattern matching is a mitigation rather than a guarantee. Watermarked consistently with other
emitted Markdown.

### FR-009 — Console summary and fail gate

Every run prints a summary line naming the count and sidecar path, visually prominent when findings
exist. `--fail-on-secrets` is accepted by every conversion script, defaults off, and exits non-zero
when findings exist. Redaction itself is unconditional; no flag disables it.

### FR-010 — Read-only scan mode

`--scan-only` reads existing artifacts, applies the pattern set, and modifies nothing. Covers `.md`,
`.json`, `.sql`, `.tsx` and `.html`; skips binaries and `node_modules`. Reports file, line and key,
honours `--fail-on-secrets`, states that findings are already-disclosed and rotation is the only
remedy, and exits 0 with an explicit clean message when nothing is found.

### FR-011 — AI-authored artifact rule

Each family's `SKILL.md` gains a rule binding AI-authored artifacts, not only script output. Stated
positively: record that a credential is hardcoded, at which procedure and line, using a placeholder
token — never reproduce the value, and never drop the credential-bearing element in order to comply.
Explicitly covers ad-hoc artifacts with no producer script. Applied across all three trees.

**This rule is the fast-feedback layer, not the control of record.** It prevents the AI writing a
credential value in the first place, which is the better developer experience. But it is delivered by
modifying a file the consumer may have customised, so its arrival cannot be assumed (see C-12). The
control of record for the AI-authored path is FR-010's scanner combined with FR-009's gate, which
catch a credential literal regardless of who wrote the artifact and are delivered as a *new* file that
upgrade always places cleanly.

- The rule block carries a **rule-version marker**, so a consumer's `SKILL.md` can be identified as
  predating the redaction rule.
- Absence or staleness of the rule must not leave the AI-authored path uncovered — FR-010 plus FR-009
  must catch the same literal with no `SKILL.md` involvement at all. This is testable: run the scanner
  against an artifact written with the rule absent and assert the literal is still reported.
- Where the rule is stale, the consumer must receive a message naming the redaction guardrail
  specifically — not a generic changed-file notice (FR-012).

### FR-012 — Copy parity guard

`auditfences` gains a byte-identity check across all copies of the redaction module, failing with the
diverging paths named. Runs in CI under `--strict` and fails hard — no local warn-only mode. Also
covers `wxkanban_watermark.py`, which has the same nine-copy exposure and no guard today, and
includes `Bugs/pcsoft-page-to-react_PATCHED.py`, a fourth divergent copy outside all three trees.

The same check compares each family's `SKILL.md` **rule-version marker** (FR-011) against the version
the kit ships. A consumer whose marker is absent or behind gets a message naming the redaction
guardrail and stating that the AI-authored path is relying on the scanner alone — rather than a
generic stale-file notice they have no reason to read. Detection only; this check never rewrites a
consumer's `SKILL.md`.

### FR-013 — Fidelity regression guard

A regression test asserts the element manifest is byte-identical with redaction active and inactive.
A positive fixture verifies each pattern fires; a negative fixture verifies unquoted right-hand sides
are not redacted. Fixtures are synthetic — no real customer source and no real credential is
committed as test data.

### FR-014 — Repository hygiene posture and the CI gate

The `SKILL.md` files document that ad-hoc analysis output is regenerable and should be gitignored
rather than committed, and cover the source documentation export as a credential-bearing artifact in
its own right. Guidance only; no consumer gitignore is altered.

**Enabling `--fail-on-secrets` in CI is the documented recommendation, not a passing mention.**
FR-009 keeps the flag defaulted off so a first conversion run does not hard-stop a developer who
merely wants to see output. But the CI gate is the layer that holds when everything else drifts: it
does not depend on the `SKILL.md` rule having survived an upgrade, does not depend on the developer
reading a console summary, and catches a credential literal in a committed artifact whether a script
or an AI session wrote it. The guidance must say so plainly and show the invocation.

### FR-015 — Release and verified reach

A kit release is cut carrying the module, wiring and rule for all three families. Release assets are
explicitly verified present on GitHub Releases across both channels — "release cut" alone is not
sufficient evidence. A consumer upgrade delivers the module to all three family directories. Feedback
`f99e80aa-4afc-4d78-9541-ca0bf310fd7b` is answered and closed with the shipped version named, stating
which parts of the report verification confirmed and which two it corrected.

## Data Requirements

None. This spec introduces no table, no column and no migration; nothing touches PostgreSQL. The only
persisted artifact is the findings sidecar, a per-conversion Markdown file written to the developer's
own output directory. It is not a wxKanban record and is never transmitted.

## API Routes

None. This is offline CLI tooling; no Express endpoint is added, changed or removed. Capturing
redaction counts as a project event for the audit trail was considered and deliberately excluded, as
it would pull MCP into a scope that is otherwise pure offline tooling.

## Frontend Components

None. No React surface and no Cockpit indicator. No new command is added either — three existing
skills gain flags and a rule, so the command surface is unchanged and nothing needs surfacing in the
Cockpit.

## Integration Context

This work must align with several existing kit mechanisms:

- **`stamp_markdown` (SCOPE-082)** — the watermark call lives inside the exact function FR-007
  refactors into a shared helper; losing it would silently un-watermark every conversion artifact.
- **`auditfences` (SCOPE-026)** — extended by FR-012 with the byte-parity check, running in CI under
  `--strict`.
- **Code fencing (SCOPE-026)** — all new top-level Python declarations require fences written by
  `implement`, never by hand.
- **`sync-to-orchestrator.mjs`** — mirrors `.claude/` and `_wxAI/` into the kit and normalises CRLF to
  LF, which is why C-8 requires LF-clean scripts in all three trees.
- **Kit release path (SPEC-019)** — the only route by which this reaches the reporter.

## Compliance Requirements

SOC 2 is active for this project.

| Control | Requirement | Satisfied by |
|---|---|---|
| CC6.1 | Secrets management solution | The toolchain no longer manufactures hardcoded-secret sprawl in project data. FR-008's explicit limit statement matches this control's guidance that a secrets call proves nothing about hardcoded values elsewhere. |
| CC6.1 | Different credentials per environment | Legacy apps share one production credential across environments; FR-008's rotation instruction is where that surfaces. |
| CC7.1 | Vulnerability findings tracked to resolution | The sidecar gives each finding an owner, location and closure action; FR-009's gate prevents silent ageing. |

A HITRUST SDLC change record for this work is published at
`docs/HITRUST-Change-Record-SCOPE-125.html`. HITRUST is **not** an enabled framework for this
project — that record is advance documentation, not assessment evidence.

## Constraints

- **C-1 (highest risk).** `pcsoft-doc-split.py` lines 51-57 hold a mojibake-repair table whose keys
  are raw multi-byte UTF-8 (verified at byte level: `\342\200\231` = U+2019, `\302\240` = NBSP). An
  encoding-lossy rewrite destroys it silently — nothing throws, conversions emit mojibake weeks later.
  This file is excluded from any tooling MODIFY path, or byte-verified after every edit.
- **C-2.** Nine copies with no canonical source, accepted deliberately; FR-012 is the mitigation.
- **C-3.** A fourth divergent copy exists in `Bugs/`; folded into the FR-012 guard inventory.
- **C-4.** Rotation is the only remedy for already-disclosed credentials and this spec cannot perform
  it. Must be stated in the sidecar and scan output, not only in documentation.
- **C-5.** Pattern matching is a mitigation, not a guarantee; concatenated and unconventionally-named
  values will not match.
- **C-6.** No third-party dependencies; conversion runs on offline or restricted customer machines.
- **C-7.** Fences written by `implement` only, labelled `[SCOPE 125 / Tnnn]`. An `FR-nnn` label fails
  the `T\d+` regex and registers as unfenced.
- **C-8 (corrected at implementation).** Every conversion script in all three trees is **CRLF**
  today — verified across all 27 files. `sync-to-orchestrator.mjs` normalises CRLF to LF on the way
  into the kit, so CRLF in source is the working convention, not a defect. The original wording here
  ("scripts must be LF-clean in all three trees") was wrong and would have caused a pointless
  normalisation sweep. The real requirement: line endings must be **consistent across the three
  trees**, so the FR-012 byte-parity guard compares content rather than line endings. New files must
  be written CRLF to match.
- **C-9.** Test data is synthetic always; committing a real source export would repeat the defect.
- **C-10.** FR-015 depends on a kit release; one is already outstanding from SCOPE-124.
- **C-11.** Consumer repositories are not modified.
- **C-12 — ⚠ WARNING: the `SKILL.md` rule may not reach the consumers who need it most.** FR-011 is
  delivered by *modifying* a file, and modified-file delivery is changing underneath this spec.
  **Today**, the shipped upgrade blindly extracts the archive over the project root, so the rule
  arrives by overwriting whatever the consumer has — it works, but only because of the very defect
  SCOPE-121 exists to fix. **After SCOPE-121 lands**, preserve-and-report means a consumer who has
  customised their conversion `SKILL.md` receives the rule as a `.kit-<version>.new` sidecar instead.
  At the CLI they are stopped and told. On the **Cockpit one-click path**, which uses the `--yes`
  logged override deliberately kept so that path survives, the upgrade proceeds and the notice is a
  log line they may never read — leaving the redaction guardrail inactive for exactly the customers
  most engaged with the conversion skills.
  **Mitigation, and why FR-011 is not the control of record:** FR-010's scanner plus FR-009's gate
  cover the AI-authored path without any `SKILL.md` involvement, and ship as a *new* file that overlay
  and preserve-and-report both deliver cleanly. FR-012's marker check makes a stale rule loud and
  specific. **Do not treat FR-011 as sufficient on its own**, and do not resolve this by carving
  security-control files out of SCOPE-121's preserve-and-report — that guarantee erodes the moment it
  takes exceptions, and the marker check achieves the same outcome without granting the upgrader
  permission to overwrite. If force-update semantics are ever wanted for kit-owned security files,
  that is a SCOPE-121 decision and must be made there, not assumed here.

## Notes

Two claims in the source report did not survive verification, and both changed the design.

**The confirmed leak has no producer script.** The two artifacts named in the report appear nowhere in
the kit — no script writes them, no `SKILL.md` names them. An AI session authored them ad hoc. A
Python-only fix would have shipped, been declared complete, and not prevented the one leak that can be
pointed at. FR-011 exists because of this.

**Six of the nine named files have no write funnel.** The report's "add the scrub to `write()` for
consistency" applies only to `pcsoft-doc-split.py`; the rest emit through bare
`open(path, "w").write(...)`. FR-007 is a refactor the report priced at zero.

A gap was also found in the proposed pattern: it omits bare `user`, while WinDev HFSQL uses `..User`
alongside `..Password`, so the username half of the commonest pattern would have passed through.
Positional forms match no `key = value` shape at all.

**Two further pattern defects were found during implementation, both by tests rather than review:**

1. **JSON key-value pairs did not match.** In JSON the key is itself quoted (`"uid": "sa"`), so the
   closing quote sat between the key and the separator. JSON is the exact format of the confirmed
   field leak, so the scanner would have shipped blind to the artifact class that actually leaked.
   Fixed by allowing an optional closing quote after the key.
2. **Hungarian notation did not match** — `gsPassword`, `gsUser`, `m_sPassword`, `txtPassword`. The
   leading `\b` required the key to start an identifier, which excludes the dominant VB6 naming
   style. **This was found by an end-to-end conversion run, not by the unit tests**, because the
   tests had been written from the same wrong assumption as the pattern and therefore agreed with
   it. Fixed with a camelCase-aware start check (`_key_start_ok`) rather than dropping the anchor,
   which would have redacted `fluid = "water"`.

The second is the more instructive: a test suite written by the same author as the code, from the
same mental model, validates the model rather than the behaviour. Only a realistic end-to-end run
against representative legacy source exposed it.

Residual implementation risk: FR-007's funnel refactor across 54 files is where this goes wrong, and
C-1 means the most dangerous file to touch is also the one that must change first.

**Layering, after the C-12 amendment.** The AI-authored path is covered twice, deliberately, because
the two layers fail differently:

| Layer | Role | Survives a kit upgrade? |
|---|---|---|
| FR-010 scanner + FR-009 gate | **Control of record** — catches the value however it was written | Yes — ships as a new file |
| FR-011 `SKILL.md` rule | Fast feedback — prevents the write rather than detecting it | Only if the consumer has not customised the file |
| FR-012 marker check | Detector — makes a stale rule loud and specific | Yes — runs from kit-shipped code |

The original design had FR-011 carrying this path alone. That was wrong for a delivery reason rather
than a design reason: an instruction file is the least reliable thing the kit ships.
