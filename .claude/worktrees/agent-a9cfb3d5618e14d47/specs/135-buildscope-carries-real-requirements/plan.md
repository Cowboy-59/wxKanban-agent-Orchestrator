# Implementation Plan: buildscope Carries the Author's Real Requirements

**Spec**: SPEC-135 (`9d837e3f-aea4-4c03-ada9-1650f404cf89`) · **Scope**: SCOPE-135 with Amendment A
**Fence label**: `[SCOPE 135 / Tnnn]` — the SPEC folder number equals the scope number here.

## Read this first

**Two delivery paths.** Everything in `mcp-server/` and `shared/preflight/` reaches customers when
`main` is pushed (the hosted MCP auto-deploys, and kit commands fetch the buildscope and createspecs
prompts from it). `wxkanban-agent/workers/ai/buildscope-worker.ts` (FR-016) and the kit copy of
`createspecs.ts` (FR-008) reach customers only through a kit release. The server half is
backward-compatible: an old kit that sends none of the new inputs gets an honest blocked draft, a
"stored specs only" numbering note, and, on an edit, a merge into the stored copy that says so.

**Behavior change for the release notes.** Guided buildscope now asks for functional requirements
and user scenarios before it returns a draft, and quick mode without them returns a blocked draft
instead of passing with filler.

## Architecture

### One generator, no inference (FR-001..FR-004)

`buildScopeContent` renders what it is given and nothing else. Each of the six inputs has exactly
two renderings: the supplied text, or a blocking marker that names the parameter to supply. The
four technical sections add a third: an explicit `None` renders as "None — not affected by this
scope." (or keeps the author's reason). The generic FR-001..006 and US1..3 text is deleted outright,
not made conditional, so no mode can emit it.

### The gate does not move (FR-007, FR-014)

`runPreflight`'s `isValid` and `score` are untouched. The new checks — boilerplate FR titles, no FR
headings, FRs without acceptance criteria, fewer than 3 scenarios — append to `warnings` only. The
checklist then splits into **Gate** items, computed solely from `runPreflight`'s result, and
**Advisory** items, computed from the document's FR, scenario and criteria counts. Because Gate items
come only from the gate, an unticked Gate item with `isValid: true` cannot happen by construction.
The response carries the unticked Advisory items as `advisories`.

### The edit base is whatever the caller has (FR-011, FR-016)

The hosted server cannot read the caller's disk, so the caller sends the file: `currentScopeContent`.
When present, it is the merge base and no stored record is required — identity then comes from the
stored title when a row exists, else from the document's own H1. When absent, the stored copy is the
base, as today, and the response names it (size, last update) in `editBase` and in the message.

The kit worker closes the loop: on `--edit-spec-number` it finds `specs/Project-Scope/NNN-*.md`,
sends its text, and writes the merged result back to that same path. The server's suggested path is
used only when no local file exists, so an edit can never fork the scope into a second slug.

`featureDescription` is required by the schema, and on an edit callers use it to describe the change
(ff0eb155 did exactly that). It therefore no longer retitles the H1; only the new `title` input does.

### Numbering counts both sides (FR-012)

`generateNextSpecNumber(projectId, localSpecNumbers)` returns the next number and the basis it used.
Width follows the widest number already in use (minimum 3), so a project numbering `0051` gets
`0052`. The response returns `takenSpecNumbers` and `numberingBasis`; without local numbers the
message says the count covered stored specs only.

### Slug and title (FR-013)

`generateShortName` normalizes to NFD and strips combining marks before tokenizing, removes elided
articles with their apostrophe, and skips a short multilingual stop list that leaves out every word
also meaningful in English. Single-letter tokens are kept (dropping them would turn "e-commerce"
into "commerce"), so ASCII input slugs exactly as before, which the existing fixtures prove. The H1 becomes `# Scope NNN: <title>`, with
`title` taken from the new input or the first clause of `featureDescription`, capped at 8 words. The
kit's `spec-md-parser` reads `# Spec NNN:` only from implementation `spec.md` files, and `dbpush`
never parses `specs/Project-Scope/`, so retitling scope documents breaks no parser. The merge title
rule accepts both forms.

### templateOnly says what ran (FR-015)

`template_only` is reported only when the legacy template file was found and used. Otherwise the
status is `drafted`, and the message says `templateOnly` was ignored.

## Task order

1. T004 (preflight) first — T010 and the tests consume its warnings.
2. T009 (slug/title) and T008 (numbering) — pure functions, independent.
3. T001–T003 (generator), then T010 (checklist), T011 (templateOnly), T007 (edit base).
4. T006 (schemas and prompt) once every input exists; T005 (contract text) alongside.
5. T012 (kit worker).
6. T013 (tests), T014 (verify). T015 (release) waits for Andy's go-ahead to push.

## Risks

- **Prompt registry.** The hosted build regenerates `registry.ts` from `mcp-server/src/prompts/*.md`.
  Verify the new buildscope wording in the built bundle, not just in the source.
- **Silent rollback.** App Runner has rolled back a release without saying so. Success Metric 8 is a
  live probe, never a version check.
- **Old kits on edit.** A v1.7.x worker still writes an edit to the server's suggested path. The
  server half reports the stored-copy base in the message; full protection needs the kit release.
