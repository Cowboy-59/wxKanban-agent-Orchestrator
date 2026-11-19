# Spec 156: Brainstorm Analyze Mode

**Implements**: SCOPE-156 (`specs/Project-Scope/156-brainstorm-analyze-mode.md`, FR-001 – FR-015,
SC-1 – SC-7). Fences for this spec are `[SCOPE 156 / Tnnn]`.
**Depends on**: nothing new. Reuses wxBrainstorm (`.claude/skills/wxBrainstorm/`), the brainstorm
record format, `_wxAI/askgate/ledger.mjs`, `_wxAI/routing/difficulty.mjs` + `tiers.mjs` (D-0001),
wxDBAnalyze's read-only connection guard (`.claude/commands/wxDBAnalyze.md` § Safety), the conversion
credential redaction tokens (CONTEXT.md, Credential Redaction), and the kit skill allowlist
(`scripts/sync-to-orchestrator.mjs`, `CLAUDE_SKILLS_ALLOWLIST`).
**Source**: `docs/brainstorms/2026-11-08-build-process-smoothing.md` rows 7 and 10 (ledger D-0136,
D-0139), gap 1-6 answers and database choice (b) from the SCOPE-156 buildscope interview.
**Created**: 2026-11-08

## Overview

`/wxBrainstorm --analyze` looks at one built app or conversion in one sitting. The panel first
proposes the app's feature groups for the owner's approval. Then the existing analyzers run, each in
its own subagent, without stopping for answers. The panel merges their results into must fix, gaps
and optional improvements grouped by feature, and the owner decides each item in turn. Agreed items
go to `/buildscope --from-md` on the owner's go. Everything, including declined items and their
reasons, is saved in the analyzed app's own repo, so a re-run shows what changed. A cross-app pass in
wxKanban turns a gap repeated across apps into one converter scope proposal. The database check runs
only when turned on, read-only, and never keeps row values. The same spec sets the panel's conduct in
every brainstorm: propose the complete version, ask only real choices.

## Business Problem

The owner has about 20 built apps and future conversions; the first job is 14 customer conversions.
There is no single pass that looks at a built app and reports what is wrong, what is missing, and what
would make it more useful. The analyzers exist but each runs alone. Two of them (wxUIUXCodeReview
`--audit` and wxConversionParity) stop for an answer at every element, so they cannot run inside a
subagent. Nothing brings their findings together, puts them in front of the owner for a decision, or
carries them to scopes. Any gap the tools do not connect depends on the owner remembering it.

## Actors

- Primary: Owner (CTO), who runs the sitting and decides every finding.
- Secondary: The brainstorm panel (eleven wxG-O-D roles, Lead Architect chairing).
- Secondary: The existing analyzers (wxUIUXCodeReview, wxConversionParity, analyzecode/wxICA,
  analyzescope, compliance-scan, wxDBAnalyze).
- Secondary: Kit consumer projects (current apps and customer conversions).

## Success Metrics

1. Trial run: `--analyze --conversion` on the first of the 14 conversions finishes in 1 sitting, with
   feature groups approved before any finding is shown, 100% of analyzers marked checked or not
   checked with a reason, 100% of findings decided, and the report and data file saved in that app's
   repo.
2. No stops: wxUIUXCodeReview and wxConversionParity each finish 1 collect-only pass on the trial app
   with 0 questions and 0 file edits; their interactive runs behave as today.
3. Re-run accuracy: on a 2nd run after at least 1 fix, 100% of changed findings are marked fixed, new
   or still open correctly, and 0 declined findings return unless their evidence hash changed.
4. Cross-app pass: on 2 or more analyzed apps sharing a known gap, the gap is proposed as 1 converter
   scope listing both apps; a gap in only 1 app is not proposed.
5. Client data: with the database check on, a search of the saved report and data file finds 0 row
   values and 0 credential values; with it off, the report says the database was not checked.
6. Panel conduct: a test brainstorm on "a scheduler for jobs" produces a must-have and optional list
   and asks 0 questions about schedule types.
7. Done means wired: 1 end-to-end check in which a kit consumer repo with the updated kit runs
   `/wxBrainstorm --analyze` from the real entrance to a saved report. That check passing marks the
   scope done; the task list alone does not.

## Scope Boundary

- `/wxBrainstorm --analyze` with optional `--dir <app folder>` and `--conversion`: one app per sitting.
- Panel-proposed feature groups approved by the owner before any finding is shown (read from the
  feature list once it exists).
- The existing analyzers, each in its own subagent, model chosen by the D-0001 router and shown
  before launch.
- A `--collect-only` mode for wxUIUXCodeReview `--audit`, wxConversionParity, and analyzecode
  (analyzecode limited to its read-only steps 0-2).
- Merging findings into must fix, gaps and optional improvements grouped by feature; item-by-item
  owner review.
- Saved report and data file in the analyzed app's repo under `docs/brainstorms/analyze/`; re-run
  comparison.
- Hand-off of agreed findings to `/buildscope --from-md`; ledger entries through `ledger.mjs` where
  installed.
- Opt-in, read-only, aggregate-only database check.
- Cross-app pass in wxKanban producing converter scope proposals.
- Pause and resume without re-running analyzers.
- Panel conduct for every brainstorm: complete proposal (must-have and optional), only real choices
  asked.
- Shipping all of the above to kit consumers.

## Out of Scope

- Fixing any finding: analyze never edits the analyzed app's code, schema or data.
- Time estimates and development plans (that is G.O.D. plan mode).
- The Platform Self-Audit.
- A Cockpit button or a new server route.
- The feature list itself (build step 5 of the 2026-11-08 brainstorm); analyze reads it once it
  exists.
- Writing scopes directly; only `/buildscope` writes scopes, on the owner's go.

## Open Questions

| # | Question | Answer (approved by Andy 2026-11-08) |
|---|----------|--------------------------------------|
| 1 | Per-analyzer time limit (FR-005)? | 30 minutes default, shown on the analyzer plan, changeable there by the owner for the sitting. |
| 2 | How is the cross-app pass started (FR-012)? | `/wxBrainstorm --analyze --cross-app --dir <app>,<app>[,...]`, run in wxKanban only. |
| 3 | Does wxDBAnalyze's real output carry row values? (Scope risk, Unknown) | T013 checks real output first; analyze strips values either way (FR-011). |
| 4 | Where will the feature list live? | Decided by the later feature-list scope; until it ships the panel proposes groups (FR-002). T002 leaves one named read point. |

## Functional Requirements

### FR-001 — The analyze switch (SCOPE-156 FR-001)

`/wxBrainstorm` accepts `--analyze`, with optional `--dir <app folder>` (default: the current repo)
and `--conversion` (adds wxConversionParity to the analyzers).

**Acceptance Criteria**:
- [ ] A `--dir` that does not exist stops with one plain error line before anything runs.
- [ ] The switch is listed in the skill's Arguments and in the help reference
      (`docs-workspace/sections/reference/cmd-wxbrainstorm.md`, `commands.json`, the built manual page).

### FR-002 — Feature groups come first (SCOPE-156 FR-002)

Before any analyzer runs, the panel proposes the app's feature groups from its screens, routes and
scopes, and the owner approves or adjusts them. When a feature list exists, the groups are read from
it instead.

**Acceptance Criteria**:
- [ ] No finding is shown before the feature groups are approved.
- [ ] A finding the panel cannot place goes under "Unplaced" and is never dropped.

### FR-003 — Analyzer plan and models (SCOPE-156 FR-003, D-0001)

Before launch, each analyzer is classified with `_wxAI/routing/difficulty.mjs` and given its model
from `_wxAI/routing/tiers.mjs`. The list is shown with each analyzer's class, model and time limit.
Only heavy work runs on the session model.

**Acceptance Criteria**:
- [ ] The plan shows every analyzer with its class and model before launch.
- [ ] Nothing launches without the owner's go on that list.

### FR-004 — Collect-only mode (SCOPE-156 FR-004)

wxUIUXCodeReview `--audit` and wxConversionParity each gain `--collect-only`: one pass, every finding
written to a findings file, no stops. Their interactive mode stays the default. analyzecode
`--collect-only` runs only wxICA steps 0-2 (drift audit, explore, present candidates) and never enters
the grilling loop (step 3).

**Acceptance Criteria**:
- [ ] In collect-only mode, neither tool asks a question or edits a file.
- [ ] Their interactive mode is unchanged.
- [ ] analyzecode in collect-only mode performs no step beyond step 2.

### FR-005 — One subagent per analyzer, failures reported (SCOPE-156 FR-005)

Each analyzer runs in its own subagent with a time limit (Open Question 1).

**Acceptance Criteria**:
- [ ] An analyzer that errors, times out, or asks for input is listed as "not checked" with the
      reason, and the sitting continues with the others.
- [ ] The report always lists which analyzers were checked and which were not.

### FR-006 — Findings merged (SCOPE-156 FR-006)

Every finding becomes one record with: feature, list (must fix / gap / optional), the analyzer(s),
location, evidence and confidence label (Confirmed / Likely / Assumed / Unknown / Conflicting).

**Acceptance Criteria**:
- [ ] The same problem reported by two analyzers shows once, crediting both.
- [ ] The panel's own ideas are labeled Assumed unless cited.

### FR-007 — Item-by-item review (SCOPE-156 FR-007, SOC 2 CC7.1)

The owner goes through each finding in plain text: keep, explain, not needed, or discuss.

**Acceptance Criteria**:
- [ ] The sitting cannot close while a finding has no decision.
- [ ] A declined finding keeps its reason (SOC 2 CC7.1).

### FR-008 — Saved report and data file (SCOPE-156 FR-008, SOC 2 CC7.2)

Findings are written to `docs/brainstorms/analyze/YYYY-MM-DD-<label>.md` and `.json` in the analyzed
app's repo as soon as they are collected, then updated with each decision.

**Acceptance Criteria**:
- [ ] The files contain no credential value (existing redaction tokens only), no personal data, and no
      row values; a write that would include one is refused by the findings helper.
- [ ] Each decision records its date and who decided it (SOC 2 CC7.2).

### FR-009 — Re-run comparison (SCOPE-156 FR-009)

Each finding gets a stable fingerprint and an evidence hash, computed by the findings helper:

- **Fingerprint** = SHA-256 of `analyzer | rule | path | anchor`, where `path` is repo-relative with
  forward slashes, and `anchor` is the enclosing symbol (function, component, route, table, form or
  element name) when the analyzer gives one, else the flagged line's text with whitespace collapsed
  and capped at 120 characters. Line numbers never enter the fingerprint, so a finding survives line
  moves.
- **Evidence hash** = SHA-256 of the normalized evidence text (flagged snippet plus message,
  whitespace collapsed).

**Acceptance Criteria**:
- [ ] A re-run marks each finding new, fixed, still open, or previously declined.
- [ ] A declined finding is brought up again only when its evidence hash changed.
- [ ] Moving a flagged block by any number of lines leaves its fingerprint unchanged.

### FR-010 — Hand-off to scopes (SCOPE-156 FR-010, SOC 2 CC7.2)

Agreed findings go to `/buildscope --from-md <report>`, with the owner's go before each run.

**Acceptance Criteria**:
- [ ] Each decision goes to the ledger through `_wxAI/askgate/ledger.mjs` when the app's repo has it;
      otherwise the report says the ledger is not installed there.
- [ ] Analyze never writes a scope itself.

### FR-011 — Database check, opt-in (SCOPE-156 FR-011, SOC 2 CC6.1)

wxDBAnalyze is off by default and runs only when the owner says yes for that sitting.

**Acceptance Criteria**:
- [ ] It runs only through its read-only guard, never with `--apply` or `--dry-run`.
- [ ] Analyze keeps only table and column names and counts, and drops any value an analyzer returns.
- [ ] The report says whether the database was checked.

### FR-012 — Cross-app pass (SCOPE-156 FR-012)

Run in wxKanban on the app folders the owner names (Open Question 2), the pass reads their saved data
files and never writes into them. Findings are grouped across apps by `analyzer | rule`.

**Acceptance Criteria**:
- [ ] A rule found in two or more apps becomes one proposed converter scope listing the apps by their
      owner-set labels, never the customer's name.
- [ ] The owner reviews each proposal like any other finding.

### FR-013 — Pause and resume (SCOPE-156 FR-013)

`/wxBrainstorm --resume` continues an analyze sitting from the next undecided finding.

**Acceptance Criteria**:
- [ ] Resume does not run the analyzers again.

### FR-014 — Panel conduct in every brainstorm (SCOPE-156 FR-014)

The panel proposes the complete version, split into must-have and optional, and asks only real choices
(money, security, client data, anything irreversible). Written into `references/panel.md` and
`references/conduct.md`.

**Acceptance Criteria**:
- [ ] A test brainstorm on "a scheduler for jobs" produces a must-have and optional list and asks no
      question about schedule types.

### FR-015 — Ships in the kit (SCOPE-156 FR-015)

The analyze switch and the collect-only modes reach kit consumers.

**Acceptance Criteria**:
- [ ] A kit consumer repo with the updated kit runs `/wxBrainstorm --analyze` end to end.
- [ ] wxConversionParity's collect-only mode is confirmed present in a consumer install.

## User Scenarios & Testing

- **US1 — Analyze one conversion (main path)**: `--analyze --conversion --dir <app>` → feature groups
  approved → analyzer plan approved → collect-only subagents → item-by-item review → report and data
  file saved → `/buildscope` offered for agreed items. (FR-001 – FR-008, FR-010)
- **US2 — Re-run after fixes**: findings compared by fingerprint and evidence hash; only new, still
  open, and changed-evidence declined items are reviewed. (FR-009)
- **US3 — Cross-app pass**: a gap in 2+ apps becomes one converter scope proposal. (FR-012)
- **US4 — Database check on**: names and counts only; report states the check was on. (FR-011)
- **US5 — An analyzer fails or stops**: listed "not checked" with the reason, never "nothing found".
  (FR-005)
- **US6 — A long review is paused**: resume continues from the next undecided finding. (FR-013)
- **US7 — A normal brainstorm under the new conduct**: complete must-have and optional proposal, only
  real choices asked. (FR-014)

## Data Requirements

No database tables and no schema change. Files only, in the analyzed app's repo:

- `docs/brainstorms/analyze/YYYY-MM-DD-<label>.json`: `label`, `sittingDate`, `analyzers[]`
  (`id`, `class`, `model`, `checked`, `notCheckedReason`), `databaseChecked`, `featureGroups[]`,
  `findings[]`, `sittingClosed`.
- Each finding: `fingerprint`, `evidenceHash`, `feature`, `list` (`must-fix` / `gap` / `optional`),
  `analyzers[]`, `location`, `evidence`, `confidence`, `status` (`new` / `fixed` / `still-open` /
  `previously-declined`), `decision` (`keep` / `not-needed` / `parked` / null), `reason`,
  `decidedAt`, `decidedBy`, `scope`.
- `docs/brainstorms/analyze/YYYY-MM-DD-<label>.md`: the readable report in the brainstorm record
  format, so `/buildscope --from-md` can read it.

## API Routes

None. Everything runs locally in the editor; nothing new on the server. The two analyzers'
methodology is served by the existing `project.get_command_prompt` tool, whose prompt text changes.

## Frontend Components

None. A chat flow; the brainstorm scratch pad shows where the sitting is.

## Compliance

Active framework: SOC 2 (loaded 2026-11-08 via `project.get_compliance_context`, phase Design).

- **CC7.1** (findings tracked to resolution): every finding ends with a decision; a sitting cannot
  close with one undecided (FR-007, FR-009).
- **CC7.2** (audit trail of all changes): every decision carries its date and who decided it, in the
  report, the data file, and the ledger (FR-008, FR-010).
- **CC6.1 / CC6.3** (least privilege): the database check is opt-in per sitting and read-only through
  wxDBAnalyze's guard (FR-011); analyze writes only `docs/brainstorms/analyze/` in the analyzed repo.

## Constraints

- Read-only on the analyzed app: never edits its code, schema or data; writes only
  `docs/brainstorms/analyze/` there, plus the ledger through `ledger.mjs` where installed.
- No git, commit, push or deploy in any repo.
- Never opens `.env` files, keys or certificates; credentials appear only as existing redaction tokens.
- Customer names and contacts never go into findings, reports, the ledger or chat. Apps are named by a
  short label the owner sets at the app's first sitting.
- The cross-app pass reads other repos' data files and never writes into them.
- No way around Change Impact or Ask Gate hard stops is added.
- Plain text, no menus, as in every brainstorm.

## Risks

- An analyzer still stops or hangs in collect-only mode → FR-005 time limit, marked "not checked".
- wxDBAnalyze output may include row values (Unknown) → FR-011 strips values; T013 checks real output.
- A large app's sitting runs long → FR-013 pause and resume without re-running.
- Fingerprint drift on file moves → FR-009 fingerprint excludes line numbers; a file rename still
  reads as fixed + new, which the report notes.
- The two analyzer prompts are served by the hosted MCP, which deploys on push to main → their
  collect-only text goes live only when Andy pushes.
