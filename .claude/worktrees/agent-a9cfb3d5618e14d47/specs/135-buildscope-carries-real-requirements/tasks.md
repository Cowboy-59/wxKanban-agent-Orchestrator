# Tasks: buildscope Carries the Author's Real Requirements

Source of truth for status is the DB (spec `9d837e3f-aea4-4c03-ada9-1650f404cf89`). Fences use
`[SCOPE 135 / Tnnn]`.

## Task table

| Task | Title | FRs | Priority | Status |
|---|---|---|---|---|
| T001 | Structured FR, scenario and technical-section inputs | FR-001..003 | high | done |
| T002 | Remove FR/US boilerplate; omitted inputs block and are named | FR-004, FR-005 | high | done |
| T003 | Guided interview asks for FRs and scenarios | FR-006 | high | done |
| T004 | Preflight warning-only detectors | FR-007, FR-014 | high | done |
| T005 | One stated create_specs contract | FR-008 | medium | done |
| T006 | Every entry point carries the new inputs | FR-009 | high | done |
| T007 | Edit merges into the author's current document | FR-011 | high | done |
| T008 | Numbering sees the caller's unpushed specs | FR-012 | high | done |
| T009 | Readable slug and title | FR-013 | high | done |
| T010 | Checklist splits Gate from Advisory; response lists advisories | FR-014 | high | done |
| T011 | templateOnly reports what ran | FR-015 | medium | done |
| T012 | Kit worker edits in place, sends local numbers, parses JSON arrays | FR-016 | high | done |
| T013 | Tests: retire stale fixture, cover every FR | FR-010 | high | done |
| T014 | Verify: builds, suites, corpus dry run, fences | — | high | done |
| T015 | Release and live verification; answer reporters | SM 8–13 | medium | todo |

## Details

### T001 — Structured inputs (FR-001..FR-003)
`buildScopeContent` renders `functionalRequirements[]` as `### FR-00N — <title>` with the requirement
and `- [ ]` criteria; `userScenarios[]` as `### US<N> — <title>` with Actor, numbered steps, Expected
outcome; the four technical sections verbatim, with `None` handled.
File: `mcp-server/src/utils/project-kit.ts`.

### T002 — No boilerplate (FR-004, FR-005)
Delete generic FR-001..006 and US1..3. An omitted input renders a blocking marker naming the
parameter; `nextSteps` names every omitted input. File: `project-kit.ts`.

### T003 — Guided interview (FR-006)
`assessBuildScopeInput` raises `functionalRequirements` and `userScenarios` questions and blocks the
draft until both are supplied. File: `project-kit.ts`.

### T004 — Preflight warnings (FR-007, FR-014)
`runPreflight` warns on the six boilerplate FR titles, on no FR headings, on FRs with no acceptance
criteria, and on fewer than 3 scenarios. No score or `isValid` change. File:
`shared/preflight/src/check.ts`.

### T005 — Contract text (FR-008)
`server.ts` create_specs description, `prompts/createspecs.md`, kit `createspecs.ts`.

### T006 — Schemas and prompt (FR-009)
Zod `BuildScopeInputSchema` + advertised JSON schema + `prompts/buildscope.md`.

### T007 — Edit base (FR-011)
`currentScopeContent` merge base; `editBase` in the response; `title`-only retitling.
Files: `project-kit.ts`, `scope-merge.ts`.

### T008 — Numbering (FR-012)
`localSpecNumbers`, width-preserving padding, `takenSpecNumbers`, `numberingBasis`. File: `project-kit.ts`.

### T009 — Slug and title (FR-013)
Diacritic folding, elided articles, stop words; `# Scope NNN: <title>`; `**Scope Number**`. Single-letter tokens are KEPT (dropping them turned "e-commerce" into "commerce"); the DB task description still says "drops 1-letter tokens" and is superseded by this line.
Files: `project-kit.ts`, `scope-merge.ts`.

### T010 — Gate vs Advisory (FR-014)
`buildChecklistContent` split; `advisories[]` in the response. File: `project-kit.ts`.

### T011 — templateOnly (FR-015)
Honest status; "does not bypass the gate" in both schema copies.

### T012 — Kit worker (FR-016)
`wxkanban-agent/workers/ai/buildscope-worker.ts`.

### T013 — Tests (FR-010)
`mcp-server/tests/project-kit-scope-flow.test.ts`, fixture, parity test, preflight tests, worker test.

### T014 — Verify
mcp-server `npm run build`, test suites, corpus dry run (SM 6), `auditfences` on touched files.

### T015 — Release (gated on Andy)
Push → MCP auto-deploy → live probe SM 8–13 → kit release → resolve triaged reporters.

## Amendment B — 2026-10-25

| Task | Title | FRs | Priority | Status |
|---|---|---|---|---|
| T016 | Edits carry FRs and user scenarios, by named item | FR-017, FR-018 | high | done |
| T017 | Everything not named stays byte-identical, checked by the tool | FR-019 | high | done |
| T018 | Diff before write; the kit writes only after confirmation | FR-020 | high | done |
| T019 | Stale-base refusal; the push stores the scope text itself | FR-021 | high | done |
| T020 | Every confirmed edit is logged in the scope's Amendment Log | FR-022 | medium | done |
| T021 | Amendment B verification and release with the write-safety batch | SM 14-16 | medium | todo |

### T016 — Edits carry FRs and user scenarios, by named item (FR-017, FR-018)
On an edit, functionalRequirements, userScenarios and the four technical sections (dataRequirements, apiRoutes, frontendComponents, keyEntities) take part in the merge (project-kit.ts 1572-1585 drops them today; ScopeEditFields and hasEdit in scope-merge.ts ignore them; 'no fields were supplied' must not fire). Add edits: [{op: add|replace|remove, target: FR-003 | US2 | FR-003/AC2, content}] to BuildScopeInputSchema and both advertised schemas. add takes the next free number; remove leaves a numbered 'Removed (Amendment X, date) — reason' stub; an unknown target is refused listing the items that exist. The item parser reuses the FR/US heading rules of shared/preflight/src/completeness.ts. Classification: heavy (more than 5 files).

### T017 — Everything not named stays byte-identical, checked by the tool (FR-019)
After the merge, compare draft and base outside the named items and the new Amendment Log entry; refuse with no draft when any byte differs, naming the first differing line. CRLF/LF preserved. Test with a forced merge defect. Classification: moderate.

### T018 — Diff before write; the kit writes only after confirmation (FR-020)
Every edit response carries a before/after diff. workers/ai/buildscope-worker.ts (overwrites immediately today, 181-198) shows the diff and writes scope and checklist only after an explicit confirm; --yes for unattended runs, recorded in the log entry; a decline leaves both files byte-identical. Add a diff helper (declare the diff package directly or a small line diff). Classification: moderate.

### T019 — Stale-base refusal; the push stores the scope text itself (FR-021)
The kit writes the stored copy's hash into the local scope file on push and create (synced hash); an edit refuses before drafting when the stored hash differs, naming the stored copy's last update. Fix what 'stored copy' is: pushNewSpec stores spec.md as content today (dbpush.ts 640) and pushExistingSpec never refreshes it — the push must store and refresh the scope document text. Pre-amendment files (no synced hash) edit with a 'staleness check skipped' note. Classification: heavy.

### T020 — Every confirmed edit is logged in the scope's Amendment Log (FR-022)
Append one entry per confirmed edit to ## Amendment Log (created at the end if absent): date, amendment letter if supplied, required reason, items touched, replaced text verbatim. An edit with no reason is logged with "No reason given" (Andy 2026-10-28; was "refused"). Earlier entries never change. Classification: moderate.

### T021 — Amendment B verification and release with the write-safety batch (SM 14-16)
Real-path regression tests (kit CLI → hosted MCP) for US8, US9, US10; mcp-server build and suites; auditfences on touched files. ~~Ships with the batch after SCOPE-124 Amendment C's identity/retire tasks (build order step 5).~~ **Ships on its own, ahead of SCOPE-124 Amendment C** (Andy 2026-10-28, "3 b"); SPEC-124 T028 must then move the stored scope copy's identity (projectdocuments doctype 'scope', found by title = file name) to (spec, kind).

**Local verification 2026-10-28:** mcp-server build clean; mcp-server 661 pass / 11 fail, none Amendment B (9 need a local `test` DB login, 1 missing-023 fixture, 1 stale SCOPE-136 prompt-registry text); kit 1071/1071; preflight 55/55; no type errors in touched files; auditfences: no new findings in touched files (same error count at HEAD), 3 hand-written fences with a hyphen instead of the required em dash fixed (scope-verify.ts T018, schemas.ts T016/T020). The T016-T019 edits applied by patch script outside the Impact hook were approved after the fact by Andy 2026-10-28 ("yes"). Remaining: push, then the real-path tests, live probe and the two replies. Live probe of the deployed buildscope edit (never the version string alone); answer 78db3b03 and 8a5cd85b after the probe. Classification: moderate.
