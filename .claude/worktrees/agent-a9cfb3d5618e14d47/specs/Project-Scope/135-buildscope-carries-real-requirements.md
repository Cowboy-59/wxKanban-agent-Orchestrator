# SCOPE-135: buildscope Carries the Author's Real Requirements

**Scope Number**: 135
**Status**: `draft`
**Created**: 2026-09-25
**Depends On**: SCOPE-124 (write-first buildscope contract; T020 named this defect and left it untouched); SCOPE-029 (scope-quality preflight extracted to `shared/preflight`)
**Source**: wxKanban feedback `523f65ed-e375-4ab3-91f1-08bc7f0333ad` (origin project `68cf2d4b-fb8e-442f-8290-3aa3fd2be701`, active scope SCOPE-033); prior reports `a02e6ec5` (same origin project); SCOPE-126 hand repair (2026-08-13). **Amendment A (2026-10-04):** the buildscope sweep of the Cockpit "Incoming from customers" queue — `56b8f6d2`, `7874b04b`, `c4e40bb5`, `ff0eb155`, `84f98f9c`, `17b7ae98`, `e0eddf34`, `01b1ed0e` **Amendment B (2026-10-25):** customer report package 2026-10-25 (kit write-safety brainstorm, `docs/brainstorms/2026-10-25-kit-write-safety.md` decision 5e); feedback `78db3b03`, `8a5cd85b`
**Amendments**: A (2026-10-04) — edit base, numbering, slug and title, gate vs advisory checklist, honest templateOnly, kit worker edits in place (FR-011..FR-016); **B (2026-10-25) — surgical edits: requirements and scenarios editable per named item, byte-identical elsewhere, diff before write, stale-base refusal, amendment log (FR-017..FR-022)**

> **Authored by hand, on purpose.** `project.buildscope` cannot carry the approved Functional
> Requirements, User Scenarios, or technical sections of any scope — which is the defect this scope
> fixes. A live `project.buildscope --quick` call for this very scope on 2026-09-25 returned
> FR-001..FR-006 boilerplate and four needs-clarification blockers, scoring 71. The content
> below is the section-by-section interactive review, approved in full on 2026-09-25.
>
> **Terminology.** "needs-clarification marker" in this document means the bracketed, upper-case
> clarification token the generator emits. It is written in lower case here because the preflight
> matches the upper-case token anywhere in a document — including inside prose that describes it.

---

## Overview

buildscope carries the author's real requirements: it accepts functional requirements, user
scenarios, and the Data / API / Frontend / Entities sections as structured inputs and renders them
verbatim (with an explicit "None" allowed); it replaces generic FR and scenario boilerplate with
honest blocking markers when they are omitted; it makes the preflight warn when stored scopes still
carry that boilerplate; and it corrects the create_specs contract documentation to match the single
gate that validatescope and create_specs already share.

**Amendment A (2026-10-04)** extends this to five more buildscope defects found in the customer queue:
an edit merges into the author's current file instead of the stored copy; a new scope number accounts
for the caller's unpushed local specs; slugs fold accented letters and the H1 carries a short title;
the checklist separates what the gate enforces from what it only advises; `templateOnly` reports what
actually ran; and the kit worker writes an edit back to the file it read.

| Defect | Field reports | Requirement |
|--------|---------------|-------------|
| Edit merges into the stored copy, not the author's file | 56b8f6d2, ff0eb155 | FR-011, FR-016 |
| Score 100 beside unticked "required" checklist boxes | 7874b04b | FR-014 |
| New scope number collides with an unpushed local spec | c4e40bb5, ff0eb155 | FR-012, FR-016 |
| Accented letters dropped from slugs; whole description in the H1 | 84f98f9c, a02e6ec5, a17783bb | FR-013 |
| `templateOnly` reports `template_only` when no template ran | 17b7ae98 | FR-015 |

### Core Design

| Element | Value |
|---------|-------|
| **Primary Actor** | Scope author — a developer or AI agent running buildscope via the kit CLI or MCP |
| **Secondary Actors** | create_specs consumers (spec fan-out); consumer-project operators reading the tool descriptions |
| **Key Value** | The interview's requirements survive into the scope document, and a draft passes the gate only when it is genuinely complete |
| **Scope Boundary** | buildScope inputs and rendering; preflight boilerplate detection; the create_specs contract text in three places; MCP schema, kit CLI, and buildscope prompt carry the new fields |

---

## Business Problem

`project.buildscope` (quick and guided) has no inputs for functional requirements, user scenarios,
data requirements, API routes, frontend components, or key entities. Whatever the interview
produced, the draft carries six generic FRs ("Primary workflow support", "Business rule
enforcement", …) and three generic scenarios, which pass the preflight silently, plus four
needs-clarification sections, which the preflight blocks. The generator's own output fails the
generator's own gate (reported at 64 quick / 86 guided), while the silently-passing filler FRs are
what `createSpecs` fans out from.

The cost is paid on every scope:

- Every buildscope draft needs hand repair before create_specs — field reports `523f65ed` and
  `a02e6ec5`, and SCOPE-126, which needed 16 real FRs hand-promoted out of the Clarifications table.
- An unrepaired draft passes with filler, and createSpecs builds specs for "Business rule
  enforcement" while dropping the real requirements. Nothing errors.
- Governance mandates buildscope, yet buildscope cannot produce an implementation-ready scope.

Separately, three documents describe the create_specs preflight as stricter than it is — literal
`## Business Problem`, `## Actors` with `- Primary:` lines, and `## Success Metrics`. The gate is one
function (`runPreflight`) shared by validatescope and create_specs, and it accepts a Core Design
table and `## Success Criteria`. The reporter followed the description and restructured a scope that
already scored 100.

---

## Actors

- Primary: Scope author — a developer or AI agent running buildscope through the kit CLI or MCP
- Secondary: create_specs consumers performing spec fan-out; consumer-project operators who read the MCP tool descriptions and kit prompts

---

## Scope Boundary

- `buildScope` / `buildScopeContent` / `assessBuildScopeInput` in `mcp-server/src/utils/project-kit.ts`: six new optional inputs, verbatim rendering, blocking markers in place of boilerplate, a response that names omitted inputs.
- `runPreflight` in `shared/preflight/src/check.ts`: a warning-only boilerplate-FR detector.
- The create_specs contract text in `mcp-server/src/server.ts`, `mcp-server/src/prompts/createspecs.md`, and `wxkanban-agent/core/orchestrator/command-handlers/createspecs.ts`.
- MCP input schema (Zod and advertised JSON schema), kit CLI, and `mcp-server/src/prompts/buildscope.md` carry the new fields.
- The stale SCOPE-124 T020 fixture and skipped test are regenerated and un-skipped.
- Amendment A: the edit base and title rule (`buildScope`, `resolveEditTarget`, `scope-merge.ts` title regex); scope numbering (`generateNextSpecNumber`); slug and H1 (`generateShortName`, `buildScopeContent`); warning-only completeness checks in `runPreflight`; the gate/advisory split in `buildChecklistContent`; the `templateOnly` status; and the kit worker `wxkanban-agent/workers/ai/buildscope-worker.ts`.

## Out of Scope

- Changing `runPreflight`'s pass/fail rules or score arithmetic (beyond the warning-only detectors in FR-007 and FR-014).
- Server-side AI synthesis or inference of FRs, scenarios, tables, routes, components, or entities.
- Rewriting scopes already stored in any project.
- ~~Merging the six structured inputs of FR-001..FR-003 on an edit — they stay create-only.~~ **Reversed by Amendment B (2026-10-25):** functional requirements and user scenarios are editable per named item (FR-017, FR-018). The four technical sections stay whole-section replace through the existing merge. (Amendment A changes only the edit's base document (FR-011) and its title rule; it adds no new merge regions.)
- Renumbering or renaming scopes that already collided; FR-012 prevents new collisions only.

---

## User Scenarios & Testing

### US1 — Author supplies the interview's requirements

**Actor**: Scope author (AI agent in guided buildscope)

**Scenario**:
1. The agent completes discovery with eight real FRs, three scenarios, two new tables, three routes, and one component.
2. It calls `project.buildscope` with `functionalRequirements[]`, `userScenarios[]`, `dataRequirements`, `apiRoutes`, `frontendComponents`, and `keyEntities`.
3. The draft renders those exact FRs and scenarios; no generic FR-001..006 or US1..3 text appears.

**Expected outcome**: The draft passes validatescope and the create_specs preflight with zero blocking issues and zero hand edits.

### US2 — Author declares a section not affected

**Actor**: Scope author

**Scenario**:
1. A backend-only scope passes `frontendComponents: "None"` and `keyEntities: "None"`.
2. Those sections render "None — not affected by this scope." with no marker.

**Expected outcome**: An explicit None never blocks; an omitted section still does.

### US3 — Author omits requirements (quick mode)

**Actor**: Scope author

**Scenario**:
1. `buildscope --quick "…"` runs with no FR or scenario inputs.
2. The FR and User Scenarios sections carry needs-clarification markers naming the input to supply.
3. The response has `canProceedToCreateSpecs: false` and names the missing inputs.

**Expected outcome**: An incomplete draft is blocked honestly and never passes with filler.

### US4 — Legacy draft with boilerplate FRs is validated

**Actor**: Scope author validating a scope generated before this change

**Scenario**:
1. validatescope runs on a document still carrying "Primary workflow support" / "Business rule enforcement".
2. The preflight returns a warning naming the boilerplate FR titles.

**Expected outcome**: The author learns the FRs are filler before createSpecs fans out from them.

### US5 — Author reads the contract and trusts it

**Actor**: Consumer-project operator

**Scenario**:
1. The operator reads the create_specs tool description.
2. It lists the accepted forms — including Core Design table rows and `## Success Criteria` — and says validatescope runs the same gate.

**Expected outcome**: A scope scoring 100 in validatescope is never restructured to satisfy create_specs.

### US6 — Author edits a mature local scope (Amendment A)

**Actor**: Scope author editing a hand-authored scope whose stored copy is older and shorter

**Scenario**:
1. The author runs `buildscope --edit-spec-number 010` to change the actors.
2. The kit sends the local `specs/Project-Scope/010-*.md` text as `currentScopeContent`.
3. The server merges the actor change into that text and returns it; the kit writes it back to the same file.

**Expected outcome**: Every authored section, acceptance criterion, and scenario survives; only the actors line changes.

### US7 — Author creates a scope while local specs are unpushed (Amendment A)

**Actor**: Scope author in a project whose specs 018–020 exist only on disk

**Scenario**:
1. The author runs buildscope for a new scope; the kit sends `localSpecNumbers` from `specs/` and `specs/Project-Scope/`.
2. The server takes the highest of the stored and local numbers and returns 021, with the numbers it treated as taken.

**Expected outcome**: The new scope never reuses a number that exists anywhere in the project.

---

### US8 — Author changes one acceptance line (Amendment B)

**Actor**: Scope author with a mature local scope (8 FRs, 4 scenarios)

**Scenario**:
1. The author runs `buildscope --edit-spec-number 146` asking to replace FR-003's second acceptance line, with a reason.
2. The kit sends the local file, the named edit, and the reason.
3. The server returns the merged draft, a before/after diff showing only that line, and a byte-identity verdict for everything else.
4. The kit shows the diff and asks; the author confirms.
5. The kit writes the file; the scope's Amendment Log gains one entry with the date, the reason, and the replaced line.

**Expected outcome**: Exactly one line changes in the body, one Amendment Log entry is added, and nothing is written before the confirm. Today this edit returns "unchanged — no fields were supplied" and drops the request (`project-kit.ts:1702`).

### US9 — The stored copy moved on since the author's file was synced (Amendment B)

**Actor**: Second developer on the same team, editing from a laptop that has not pulled a colleague's pushed change

**Scenario**:
1. Developer A pushes an edit to SCOPE-146.
2. Developer B, whose local file predates that push, runs an edit.

**Expected outcome**: The edit is refused before any draft is returned, naming the stored copy's last update (when, and by whom when known) and telling B to bring the newer copy down first. B's file is untouched.

### US10 — An edit that would disturb unnamed text is refused (Amendment B)

**Actor**: Scope author (or an AI session) whose edit request would, through a merge defect, reflow or drop text outside the named item

**Scenario**:
1. The author names FR-002 for replacement.
2. The merge produces a document in which a line outside FR-002 differs.

**Expected outcome**: The tool refuses and returns no draft, naming the first differing line outside the named items. Nothing is written.

## Functional Requirements

### FR-001 — `functionalRequirements` input

buildScope MUST accept `functionalRequirements: { title, requirement, acceptanceCriteria: string[] }[]` and render each as `### FR-00N — <title>`, the requirement text, and `- [ ]` acceptance criteria, numbered in the order supplied.

**Acceptance Criteria**:
- [ ] Eight supplied FRs render as FR-001..FR-008 with their exact titles, text, and criteria.
- [ ] The input schema rejects an entry with an empty title, empty requirement, or zero acceptance criteria, naming the index.

### FR-002 — `userScenarios` input

buildScope MUST accept `userScenarios: { title, actor, steps: string[], expectedOutcome }[]` and render each as `### US<N> — <title>` with Actor, numbered steps, and Expected outcome.

**Acceptance Criteria**:
- [ ] Supplied scenarios render verbatim; no generic US1..3 text appears.
- [ ] The input schema rejects a scenario with zero steps.

### FR-003 — Data / API / Frontend / Entities section inputs

buildScope MUST accept `dataRequirements`, `apiRoutes`, `frontendComponents`, and `keyEntities` as markdown strings rendered verbatim under their headings. A value of `None`, or starting with `None`, renders as "None — not affected by this scope." or preserves the author's reason when one follows — never a marker.

**Acceptance Criteria**:
- [ ] A section with supplied markdown carries no needs-clarification marker.
- [ ] `"None"` and `"None — backend only"` both pass the preflight with no placeholder hit.
- [ ] An omitted section still renders the existing blocking marker.

### FR-004 — No boilerplate in generator output

When `functionalRequirements` or `userScenarios` is omitted, the section MUST carry a needs-clarification marker naming the input to supply. The generic FR-001..006 and US1..3 text MUST be removed from `buildScopeContent`.

**Acceptance Criteria**:
- [ ] Output never contains "Primary workflow support", "Business rule enforcement", "Visibility for affected actors", "Integration alignment", "History and traceability", or "Reporting and operational review".
- [ ] Quick mode with no FR input returns `canProceedToCreateSpecs: false`.

### FR-005 — Response names what is missing

When a draft is blocked only because inputs were omitted, the buildScope response MUST list those inputs by parameter name in `nextSteps` (for example: "Supply functionalRequirements and apiRoutes (or 'None') and rerun").

**Acceptance Criteria**:
- [ ] The quick-mode reproduction of report 523f65ed lists every omitted input by name.

### FR-006 — Guided interview asks for requirements

In guided mode, `assessBuildScopeInput` MUST raise questions for missing `functionalRequirements` and `userScenarios`, and the interview MUST NOT return a draft until both are supplied.

**Acceptance Criteria**:
- [ ] A guided call with actors, metrics, and boundaries but no FRs returns `draft_interview` with a `functionalRequirements` question.

### FR-007 — Preflight warns on boilerplate FRs

`runPreflight` MUST add a warning — not a block, and no score change — when the document contains the known boilerplate FR titles, naming each title found.

**Acceptance Criteria**:
- [ ] The SCOPE-126 pre-repair shape produces the warning; `isValid` and `score` are unchanged from today.

### FR-008 — One stated contract

The create_specs tool description (`mcp-server/src/server.ts`), `mcp-server/src/prompts/createspecs.md`, and `wxkanban-agent/core/orchestrator/command-handlers/createspecs.ts` MUST describe the accepted forms `runPreflight` actually enforces — `## Actors` or Core Design Primary Actor / Secondary Actors rows; `## Success Metrics` or `## Success Criteria`; Business Problem falling back to Overview — and state that validatescope runs the same gate.

**Acceptance Criteria**:
- [ ] A test asserts `validateScopeContent(x)` and `createSpecsPreflight(x)` return identical results across the fixture set.
- [ ] No document states that `## Business Problem` or `## Actors` is required.

### FR-009 — Every entry point carries the new fields

The MCP input schema (Zod and advertised JSON schema), the kit CLI (array fields as JSON strings), and `mcp-server/src/prompts/buildscope.md` MUST carry the six new inputs. The prompt MUST instruct the agent to pass the approved Sections 2–4 through these inputs rather than hand-editing the returned draft.

**Acceptance Criteria**:
- [ ] A kit CLI buildscope with the new flags produces the same document as the equivalent MCP call.

### FR-010 — Stale fixture retired

The SCOPE-124 T020 `it.skip` test and `mcp-server/tests/fixtures/buildscope-rich-template.md` MUST be regenerated against the new behavior and un-skipped.

**Acceptance Criteria**:
- [ ] `mcp-server/tests/project-kit-scope-flow.test.ts` has zero skipped tests.

### FR-011 — An edit merges into the author's current document (Amendment A)

buildScope MUST accept `currentScopeContent` — the text of the caller's local scope file. On an edit, when it is supplied, it is the merge base in place of the stored copy, and no stored record is required for the edit to proceed. When it is omitted, the edit merges into the stored copy and the response says so, naming the stored copy's size and last update and telling the caller to pass `currentScopeContent` to edit their own file. On an edit, the H1 is retitled only when the new optional `title` input is supplied — `featureDescription` on an edit describes the change, not the scope.

**Acceptance Criteria**:
- [ ] The 56b8f6d2 reproduction (authored file with 13 sections, 35 acceptance criteria and 4 scenarios; stored copy with none of them) edited with `currentScopeContent` returns every authored section, criterion, and scenario, and changes only the supplied regions.
- [ ] An edit without `currentScopeContent` returns a message naming the stored copy as the base it merged into.
- [ ] An edit with `currentScopeContent` succeeds when the project has no stored record for that number.
- [ ] An edit whose `featureDescription` describes the change leaves the H1 untouched.

### FR-012 — Numbering sees the caller's unpushed specs (Amendment A)

buildScope MUST accept `localSpecNumbers: string[]` — the numbers present in the caller's `specs/NNN-*` folders and `specs/Project-Scope/NNN-*` files. A new scope's number MUST be one past the highest of the stored and local numbers, zero-padded to the widest width already in use (at least 3 digits). The response MUST return `takenSpecNumbers` (the sorted union it counted) and `numberingBasis` (`database` or `database+local`). When `localSpecNumbers` is omitted, the response MUST say the number was counted from stored specs only and may collide with unpushed local work.

**Acceptance Criteria**:
- [ ] The c4e40bb5 reproduction (stored 001–017, local 018–020) assigns 021.
- [ ] A create without `localSpecNumbers` carries the "stored specs only" note.
- [ ] A project that numbers with four digits (`0051`) is given a four-digit number.

### FR-013 — Readable slug and title (Amendment A)

`generateShortName` MUST fold accented letters to their base letters (é→e, à→a, ñ→n, ü→u) instead of dropping them, remove elided articles with their apostrophe (`l'`, `d'`), and skip common articles and prepositions in English, French, Spanish, Italian, Portuguese, and German. The generated H1 MUST read `# Scope NNN: <title>` — the optional `title` input, or else the first clause of `featureDescription` capped at 8 words — and the metadata line MUST read `**Scope Number**`. The merge title rule MUST accept both the `# Spec NNN:` and `# Scope NNN:` forms.

**Acceptance Criteria**:
- [ ] "Écran de paramètres accessible" yields `ecran-parametres-accessible`; "Report attività un interruttore mese" yields `report-attivita-interruttore-mese`.
- [ ] A 60-word `featureDescription` yields an H1 title of at most 8 words, or exactly the supplied `title`.
- [ ] Every ASCII slug fixture already in the test suite is unchanged.

### FR-014 — The checklist agrees with the gate (Amendment A)

`runPreflight` MUST add warning-only checks — no score and no pass/fail change — for: no FR headings; FRs carrying no acceptance criteria; fewer than 3 user scenarios. `buildChecklistContent` MUST split its items into "Gate — blocks create_specs" (derived only from what `runPreflight` decides) and "Advisory — not enforced by the gate". The buildscope response MUST list every unticked advisory item in a new `advisories` field, and its message MUST mention them when the gate passes.

**Acceptance Criteria**:
- [ ] The 7874b04b reproduction (0 acceptance criteria, 0 scenarios) returns `canProceedToCreateSpecs: true`, lists both gaps in `advisories`, and its checklist shows them under Advisory — never as unticked Gate items.
- [ ] No checklist shows an unticked Gate item while `isValid` is true.

### FR-015 — `templateOnly` reports what actually ran (Amendment A)

When `templateOnly` is set but no legacy template is available, buildScope MUST return status `drafted` and state that `templateOnly` was ignored. The `quick` and `templateOnly` descriptions (Zod and advertised schema) MUST state that neither bypasses the create_specs quality gate.

**Acceptance Criteria**:
- [ ] On the hosted server, a `templateOnly` call returns `drafted` with the "ignored" note.
- [ ] Both schema copies carry the "does not bypass the gate" wording.

### FR-016 — The kit worker edits the file it was given (Amendment A)

On `--edit-spec-number`, `wxkanban-agent/workers/ai/buildscope-worker.ts` MUST locate the local `specs/Project-Scope/NNN-*.md`, send its text as `currentScopeContent`, and write the merged result back to that same file — never to a differently-slugged path. On a create, it MUST send `localSpecNumbers` gathered from `specs/` and `specs/Project-Scope/`. It MUST parse JSON-string values for the array inputs (`functionalRequirements`, `userScenarios`, `secondaryActors`, `successMetrics`, `localSpecNumbers`) so CLI flags reach the server as arrays.

**Acceptance Criteria**:
- [ ] A kit edit of a scope whose local slug differs from the stored title rewrites the local file in place and creates no second file.
- [ ] A kit create in a project with local-only 018–020 writes scope 021.

### FR-017 — An edit carries functional requirements and user scenarios (Amendment B)

On an edit (`editSpecNumber`), `functionalRequirements` and `userScenarios` MUST take part in the merge instead of being dropped (today `project-kit.ts:1572-1585` passes neither to the merge, `ScopeEditFields` in `scope-merge.ts:37-53` has no field for them, and `hasEdit` ignores them). Supplying them as whole arrays replaces the whole section, as on a create. An edit that supplies only these inputs MUST NOT report "no fields were supplied". The four technical sections (`dataRequirements`, `apiRoutes`, `frontendComponents`, `keyEntities`) MUST be passed to the merge too: supplied, each replaces its whole section. Today they are accepted by the schema and used on a create, but an edit never passes them, so they are dropped the same way.

**Acceptance Criteria**:
- [ ] An edit supplying only `functionalRequirements` returns `draft_updated` with the new FR section, not "unchanged".
- [ ] An edit supplying only `userScenarios` replaces the scenarios section and nothing else.
- [ ] `missingInputs` on an edit lists nothing the edit did not touch.
- [ ] An edit supplying only `dataRequirements` (or `apiRoutes`, `frontendComponents`, `keyEntities`) replaces that section and nothing else, and does not report "no fields were supplied".

### FR-018 — Edits by named item (Amendment B)

buildScope MUST accept `edits: [{ op, target, content? }]` where `op` is `add`, `replace` or `remove` and `target` names one item: an FR (`FR-003`), a user scenario (`US2`), or one acceptance line (`FR-003/AC2`). `add` appends with the next free number. `remove` MUST NOT renumber anything: the removed item keeps its heading and number with the body "Removed (Amendment <letter>, <date>) — <reason>", so references from specs, tasks and code fences stay valid. A `target` that does not exist is refused, naming the items that do.

**Acceptance Criteria**:
- [ ] `replace FR-003/AC2` changes exactly that line.
- [ ] `add` to a scope with FR-001..FR-008 creates FR-009.
- [ ] `remove FR-004` leaves FR-005..FR-008 numbered as before and FR-004 as a "Removed" stub.
- [ ] `replace FR-099` on a scope with 8 FRs is refused and lists FR-001..FR-008.
- [ ] The item parser reuses the FR/US heading rules of `shared/preflight/src/completeness.ts` (no second, diverging parser).

### FR-019 — Everything not named stays byte-identical, checked by the tool (Amendment B)

After merging, buildScope MUST compare the draft with the base outside the named items (and outside the Amendment Log entry it adds) and MUST refuse — returning no draft — when any byte differs there, naming the first differing line. Line endings (CRLF/LF) are preserved.

**Acceptance Criteria**:
- [ ] A one-item edit on a CRLF file returns a draft identical to the base outside that item and the log entry.
- [ ] A forced merge defect in a test (a reflowed line outside the target) is refused with the line named.

### FR-020 — Diff before write; nothing written until confirmed (Amendment B)

Every edit response MUST include a before/after diff of the changed lines. The kit worker (`workers/ai/buildscope-worker.ts`, which today overwrites the file immediately, `:181-198`) MUST show that diff and write the scope and checklist only after an explicit confirmation. Unattended runs confirm with `--yes`, which is recorded in the Amendment Log entry. A declined confirm leaves both files untouched.

**Acceptance Criteria**:
- [ ] A kit edit without confirmation writes nothing (file hashes unchanged).
- [ ] A confirmed edit writes exactly the diffed change.
- [ ] `--yes` writes and the log entry states it was confirmed unattended.

### FR-021 — Edits work on the current local file and refuse a newer stored copy (Amendment B)

The local scope file MUST carry the hash of the stored copy it was last synced with (written by the kit on push and on create). On an edit, when the stored copy's hash differs from that synced hash, buildScope MUST refuse before drafting, naming the stored copy's last update. "Stored copy" MUST mean the stored **scope document**: today `pushNewSpec` stores `spec.md` as the content (`dbpush.ts:640`) and `pushExistingSpec` never refreshes it, so this FR also requires the push to store and refresh the scope document text itself. A file with no synced hash (written before this amendment) is treated as current, and the response says the staleness check was skipped.

**Acceptance Criteria**:
- [ ] US9 is refused; the local file is unchanged.
- [ ] After a push, the stored content equals the local scope file and its hash equals the synced hash in the file.
- [ ] A pre-amendment file edits normally with a "staleness check skipped" note.

**Design (decided by Andy 2026-10-28)**:
- The stored copy is the `projectdocuments` row with doctype `scope` and title = the scope's file name (the `push-scope-doc.ts` convention). `projectspecifications.content` keeps holding `spec.md`; an edit with no `currentScopeContent` merges into the scope row and falls back to `projectspecifications.content` only when no scope row exists. Scope and spec numbers diverge (SCOPE-114 → SPEC-115/116), so a spec row is not the scope's home.
- The synced hash is line 1 of the local file: `<!-- wxkanban:synced sha256=<hex> at=<ISO date> -->`. The hash is SHA-256 over the file without that line, CRLF normalised to LF. One implementation in `@wxkanban/preflight`, used by the kit and the server.
- dbpush syncs every `specs/Project-Scope/NNN-*.md` on every run: it pushes a file whose text differs from its synced hash (or that has none) and then writes the new marker; a file unchanged since its last sync is not re-sent. The first run after this ships pushes all scopes once and adds the marker line to each (a one-time diff).
- A create writes no marker: nothing is stored until the first push, so there is nothing to be stale against.

### FR-022 — Every amendment is logged automatically (Amendment B)

Each confirmed edit MUST append one entry to a `## Amendment Log` section (created at the end of the scope if absent): date, amendment letter if supplied, the `reason` input, the items touched, and the **replaced text verbatim**. `reason` is optional (changed by Andy 2026-10-28 from "required", so kits already in the field keep editing): an edit without one is logged with "Reason: No reason given". When the kit wrote with `--yes`, the entry says the write was unattended. Earlier log entries are never changed.

**Acceptance Criteria**:
- [ ] US8 leaves one log entry carrying the replaced acceptance line verbatim.
- [ ] Two successive edits leave two entries; the first is byte-identical after the second.
- [ ] An edit with no `reason` is logged with "Reason: No reason given" (not refused).

---

## Data Requirements

None — no schema change. Scope documents remain returned for the client to write and are persisted by create_specs / dbpush exactly as today.

## API Routes

No HTTP route changes. MCP tool contract changes:

| Tool | Change |
|------|--------|
| `project.buildscope` | Six optional inputs: `functionalRequirements[]`, `userScenarios[]`, `dataRequirements`, `apiRoutes`, `frontendComponents`, `keyEntities` (Zod and advertised JSON schema). Amendment A adds three more optional inputs (`currentScopeContent`, `localSpecNumbers[]`, `title`) and four response fields (`takenSpecNumbers`, `numberingBasis`, `advisories`, `editBase`) |
| `project.create_specs` | Description text only (FR-008); the gate is unchanged |
| `project.validatescope` | No input change; the boilerplate warning arrives through the shared `runPreflight` |

## Frontend Components

None — no web app or Cockpit UI calls buildscope with inputs; the Cockpit only installs the command and help entries.

## Key Entities

None — no domain entity is introduced or modified.

### Files affected

| Area | File |
|------|------|
| Generator | `mcp-server/src/utils/project-kit.ts` (`buildScopeContent`, `assessBuildScopeInput`, `buildScope`) |
| Gate | `shared/preflight/src/check.ts` (FR-007 warning) |
| MCP surface | `mcp-server/src/server.ts` (buildscope schema; create_specs description) |
| Prompts | `mcp-server/src/prompts/buildscope.md`, `mcp-server/src/prompts/createspecs.md` (hosted build regenerates `registry.ts`) |
| Kit | `wxkanban-agent/core/orchestrator/command-handlers/buildscope.ts`, `createspecs.ts`, `core/policy/adapters/mcp-adapter.ts` (pass-through check) |
| Tests | `mcp-server/tests/project-kit-scope-flow.test.ts`, `mcp-server/tests/fixtures/buildscope-rich-template.md`, a new gate-parity test |
| Amendment A | `mcp-server/src/utils/scope-merge.ts` (title rule), `wxkanban-agent/workers/ai/buildscope-worker.ts` (edit in place, local numbers, JSON array flags), `shared/preflight/src/check.ts` (FR-014 warnings) |

`wxkanban-agent/create-specs-from-scope.ts` needs no change; its FR-heading printout remains a second line of defense.

---

## Success Metrics

1. The reproduction of report 523f65ed (guided, full interview supplied via the new inputs) scores 100 with 0 blocking issues and 0 hand edits (baseline: 86 with 4 blockers).
2. 0 of the 6 boilerplate FR titles and 0 generic US text appear in any buildscope output — a test over quick, guided, and templateOnly modes.
3. 100% of drafts omitting FRs or scenarios return `canProceedToCreateSpecs: false` with every omitted input named in `nextSteps` (today 0% are blocked for omitted FRs).
4. `validateScopeContent` and `createSpecsPreflight` return identical `score`, `isValid`, and `blockingIssues` on 100% of the fixture set, including a Core-Design-table-only scope and a `## Success Criteria` scope.
5. 0 documents still claim `## Business Problem` or `## Actors` is required — grep across the three contract sites and the built `dist/` output.
6. The FR-007 warning fires on 1 of 1 SCOPE-126 pre-repair samples, and `score` / `isValid` are unchanged on 100% of existing `specs/Project-Scope/*.md` in a dry-run.
7. `mcp-server/tests/project-kit-scope-flow.test.ts` runs with 0 skipped tests and the mcp-server scope suites stay green.
8. After deploy, a live `project.buildscope` call against the hosted MCP returns the supplied FRs — the version number alone does not count (App Runner silent-rollback trap).
9. The 56b8f6d2 reproduction preserves 100% of authored sections, acceptance criteria, and scenarios when edited with `currentScopeContent` (baseline: 3 sections, 24 acceptance criteria, and 3 scenarios lost).
10. The c4e40bb5 reproduction assigns 021 (baseline: 018, already taken locally).
11. 0 accented-letter truncations across a slug fixture of French, Spanish, Italian, Portuguese, and German titles (baseline: `cran-de-param-tres`).
12. 0 buildscope responses where `isValid` is true and the checklist shows an unticked Gate item (baseline: 7874b04b, score 100 beside six unticked "required" boxes).
13. 0 hosted `templateOnly` calls report `template_only` when no template ran (baseline: every call, reproduced 2026-10-04).
14. Amendment B: a one-line edit to a scope changes exactly one body line plus one Amendment Log entry (US8), measured by diff.
15. Amendment B: 0 bytes change outside named items across the regression suite (FR-019).
16. Amendment B: 0 files written by a declined or stale edit (FR-020, FR-021).

---

## Constraints

- MUST NOT change `runPreflight`'s pass/fail rules or score arithmetic; FR-007 is warning-only.
- MUST NOT synthesize or infer FR, scenario, data, route, component, or entity content server-side — render what is given, or a marker.
- All six new inputs MUST be optional in the schema, so v1.7.x kits in the field that send none of them keep working and receive honest blocked drafts instead of filler.
- MUST keep existing response field names (`filePath`, `checklistPath`, `status` values) unchanged; `buildscope-worker.ts` reads them.
- The edit path (`--edit-spec-number` / `scope-merge.ts`) changes only as FR-011 and FR-013 state: its base document and its title rule. No new merge regions.
- New response fields are additive; `buildscope-worker.ts` in kits already in the field must keep working against the new server.
- Code fences use `[SCOPE 135 / Tnnn]` and follow the SPEC folder number assigned at createSpecs.
- Direct edits in fenced files rather than `implement` MODIFY (known mojibake defect).

## Notes

- **Integration context:** this scope must align with the SCOPE-124 write-first contract (buildscope returns content and persists nothing) and the SCOPE-029 extraction of the preflight into `shared/preflight`. It closes the open item SCOPE-124 T020 recorded: "`canProceedToCreateSpecs` is false … the boilerplate defect … is untouched."
- **Release:** ships as one batch across all three channels — app/MCP push (which auto-deploys MCP), kit release, and the VSIX if the Cockpit help catalog documents buildscope inputs.
- **Behavior change for release notes:** quick-mode buildscope without FRs is now blocked instead of passing with filler.
- **Reporter follow-up:** answer `523f65ed` only after Success Metric 8 passes live. The origin project is the same one behind `a02e6ec5`, `ff0eb155`, and `ac139158` (SCOPE-124) — a repeat reporter. Credit the "second defect" analysis while correcting it: the two gates were already identical; our documentation was wrong.
- **Amendment A reporter follow-up:** the same live-verification rule applies. Answer the triaged reports after their own reproduction passes on the hosted server: 56b8f6d2 and 7874b04b (FR-011/FR-014), c4e40bb5 (FR-012), 84f98f9c, a02e6ec5, e0eddf34 (FR-001..FR-004, FR-013), 17b7ae98 (FR-004, FR-015), ff0eb155 (FR-011/FR-012), 01b1ed0e (FR-001..FR-004), 523f65ed (the whole scope).
- **Risks:** agents may still hand-edit drafts instead of passing inputs — FR-009's prompt change is the mitigation, and the regenerated hosted `registry.ts` must be verified in the built bundle. JSON-string CLI flags are awkward to quote in Windows PowerShell; accepted because MCP is the primary path.

---

## Open Questions

- ~~Merge support for the new inputs on `--edit-spec-number` was deferred on 2026-09-25 and is a candidate follow-on scope.~~ Answered by Amendment B (2026-10-25): FR-017..FR-022.

## Clarifications

### Session 2026-09-25

| # | Question | Decision |
|---|----------|----------|
| 1 | When FRs / scenarios are omitted, emit a blocking marker or keep boilerplate with a warning? | Blocking marker. Quick drafts without FRs stop passing. |
| 2 | Route as a new spec, amend SCOPE-124, or out of band? | New scope (SCOPE-135); SCOPE-124 is closed work. |
| 3 | Are the new inputs mergeable on edit? | Not answered at approval; kept create-only as drafted. Recorded under Open Questions. |
| 4 | Are there really two heading contracts? | No — `validateScopeContent` and `createSpecsPreflight` both call `runPreflight`. The defect is three documents overstating the contract. |

### Session 2026-10-04 — Amendment A

| # | Question | Decision |
|---|----------|----------|
| 1 | Specify the five defects outside SCOPE-135 as an amendment or a new scope? | Amend SCOPE-135 — same file, same reporters, one release batch. |
| 2 | A scope with 0 acceptance criteria and 0 scenarios scores 100 — block or advise? | Advise. The gate is unchanged; `runPreflight` warns, the checklist splits Gate from Advisory, and the response lists `advisories`. |
| 3 | How does a hosted server avoid numbers used only on the caller's disk? | The caller sends `localSpecNumbers`; the server counts past both and returns the numbers it treated as taken. |
| 4 | Answer the reports that are already fixed and live now, or with the batch? | Now — 7dfc7c13, a17783bb, and a6734641 were resolved on 2026-10-04. |

### Session 2026-10-25 — Amendment B

| # | Question | Decision |
|---|----------|----------|
| 1 | New scope or amend SCOPE-135? | Amend SCOPE-135 — it owns buildscope's inputs (kit write-safety brainstorm, decision 3). |
| 2 | Reversing SCOPE-135's "stay create-only" line openly? | Yes — struck through and marked reversed, not deleted. |
| 3 | Does `remove` renumber? | No — removed items stay as numbered stubs so references hold (owner, 2026-10-25). |
| 4 | How does an unattended run confirm? | `--yes`, recorded in the log entry (owner, 2026-10-25). |
| 5 | Why hand-written? | `buildscope --edit` drops added FRs — the defect FR-017 fixes (owner approved hand-writing, 2026-10-25). |
