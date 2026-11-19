# Scope 156: Brainstorm Analyze Mode

**Scope Number**: 156
**Status**: `draft`
**Created**: 2026-11-09
**Depends On**: None
**Source**: `specs/Project-Scope/156-brainstorm-analyze-mode.md`
**Implemented By**: SPEC-156 (`specs/156-brainstorm-analyze-mode/`)

## Overview
An analyze mode for wxBrainstorm. In one sitting the panel looks at one built app or conversion: it first proposes the app's feature groups for the owner's approval, then the existing analyzers run, each in its own subagent and without stopping for answers. The panel merges their results into must fix, gaps and optional improvements by feature, and the owner decides each item by item. Agreed items go to /buildscope on the owner's go; everything, including declined items and their reasons, is saved in the app's own repo so a re-run shows what changed. A cross-app pass in wxKanban turns a gap repeated across apps into one converter scope. The database check runs only when turned on, read-only, and never keeps row values. The same scope sets how the panel works in every brainstorm: it proposes the complete version and asks only real choices. The owner has about 20 built apps and future conversions; the first job is 14 customer conversions. There is no single pass that looks at a built app and reports what is wrong, what is missing, and what would make it more useful. The analyzers exist but each runs alone; two of them (wxUIUXCodeReview --audit and wxConversionParity) stop for an answer at every element, so they cannot run inside a subagent; and nothing brings their findings together, puts them in front of the owner for a decision, or carries them to scopes. Any gap the tools do not connect depends on the owner remembering it. This scope covers /wxBrainstorm --analyze with optional --dir <app folder> and --conversion: one app per sitting. Panel-proposed feature groups approved by the owner before any finding is shown (read from the feature list once it exists). Running the existing analyzers, each in its own subagent, model chosen by the D-0001 router and shown before launch. Collect-only modes for wxUIUXCodeReview --audit and wxConversionParity; analyzecode limited to read-only steps 0-2. Merging findings into must fix, gaps and optional improvements grouped by feature; item-by-item owner review. Saved report and data file in the analyzed app's repo under docs/brainstorms/analyze/; re-run comparison. Hand-off of agreed findings to /buildscope; ledger entries through ledger.mjs where installed. Opt-in, read-only, aggregate-only database check. Cross-app pass in wxKanban producing converter scope proposals. Pause and resume without re-running analyzers. Panel conduct for every brainstorm: complete proposal (must-have and optional), only real choices asked. Shipping all of the above to kit consumers. It excludes: fixing any finding (analyze never edits the analyzed app). Time estimates and development plans (that is G.O.D. plan mode). The Platform Self-Audit. A Cockpit button or a new server route. The feature list itself (build step 5 of the 2026-11-08 brainstorm); analyze uses it once it exists. Writing scopes directly; only /buildscope writes scopes, on the owner's go.

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actor** | Owner (CTO) |
| **Secondary Actors** | The brainstorm panel (eleven wxG-O-D roles, Lead Architect chairing), The existing analyzers (wxUIUXCodeReview, wxConversionParity, analyzecode, analyzescope, compliance-scan, wxDBAnalyze), Kit consumer projects (current apps and customer conversions) |
| **Key Value** | The owner has about 20 built apps and future conversions; the first job is 14 customer conversions. There is no single pass that looks at a built app and reports what is wrong, what is missing, and what would make it more useful. The analyzers exist but each runs alone; two of them (wxUIUXCodeReview --audit and wxConversionParity) stop for an answer at every element, so they cannot run inside a subagent; and nothing brings their findings together, puts them in front of the owner for a decision, or carries them to scopes. Any gap the tools do not connect depends on the owner remembering it. |
| **Scope Boundary** | /wxBrainstorm --analyze with optional --dir <app folder> and --conversion: one app per sitting. Panel-proposed feature groups approved by the owner before any finding is shown (read from the feature list once it exists). Running the existing analyzers, each in its own subagent, model chosen by the D-0001 router and shown before launch. Collect-only modes for wxUIUXCodeReview --audit and wxConversionParity; analyzecode limited to read-only steps 0-2. Merging findings into must fix, gaps and optional improvements grouped by feature; item-by-item owner review. Saved report and data file in the analyzed app's repo under docs/brainstorms/analyze/; re-run comparison. Hand-off of agreed findings to /buildscope; ledger entries through ledger.mjs where installed. Opt-in, read-only, aggregate-only database check. Cross-app pass in wxKanban producing converter scope proposals. Pause and resume without re-running analyzers. Panel conduct for every brainstorm: complete proposal (must-have and optional), only real choices asked. Shipping all of the above to kit consumers. Out of scope: fixing any finding (analyze never edits the analyzed app). Time estimates and development plans (that is G.O.D. plan mode). The Platform Self-Audit. A Cockpit button or a new server route. The feature list itself (build step 5 of the 2026-11-08 brainstorm); analyze uses it once it exists. Writing scopes directly; only /buildscope writes scopes, on the owner's go. |


## User Scenarios & Testing

### US1 — Analyze one conversion (main path)

**Actor**: Owner (CTO)

**Scenario**:
1. Owner runs /wxBrainstorm --analyze --conversion --dir <app folder>.
2. The panel proposes the app's feature groups; the owner approves or adjusts them.
3. The panel shows the analyzers it will run, each with its difficulty class and model; the owner gives the go.
4. Each analyzer runs in its own subagent in collect-only mode.
5. The panel presents must fix, gaps and optional improvements grouped by feature; the owner goes item by item (keep, explain, not needed, discuss).

**Expected outcome**: Every finding ends with a decision (agreed and marked for a scope, declined with a reason, or parked with who must answer it). The report and data file are saved in the app's repo under docs/brainstorms/analyze/. /buildscope is offered for the agreed items and runs only on the owner's go.

### US2 — Re-run after fixes

**Actor**: Owner (CTO)

**Scenario**:
1. Owner runs analyze again on the same app.
2. Each finding is compared with the saved data file by fingerprint and evidence hash.
3. Each finding is marked new, fixed, still open, or previously declined.

**Expected outcome**: The owner reviews only new items, still-open items, and any declined item whose evidence changed; a declined item with unchanged evidence is not brought up again.

### US3 — Cross-app pass

**Actor**: Owner (CTO)

**Scenario**:
1. In wxKanban, the owner names the app folders to compare.
2. The pass reads their saved data files without writing into them.
3. Findings with the same fingerprint rule are grouped across apps.

**Expected outcome**: A gap found in two or more apps is proposed as one converter scope listing the apps by their owner-set labels; a gap found in one app stays with that app.

### US4 — Database check turned on

**Actor**: Owner (CTO)

**Scenario**:
1. At the start of a sitting the owner says yes to the database check.
2. wxDBAnalyze runs through its read-only guard.
3. Analyze keeps only table and column names and counts.

**Expected outcome**: The findings hold no row values. The report says the database check was on for that sitting; with it off, the report says the database was not checked.

### US5 — An analyzer fails or stops (edge case)

**Actor**: Owner (CTO)

**Scenario**:
1. One analyzer errors, runs out of time, or asks for input despite collect-only mode.
2. The sitting continues with the other analyzers.

**Expected outcome**: The report lists that analyzer as "not checked" with the reason, never as "nothing found".

### US6 — A long review is paused

**Actor**: Owner (CTO)

**Scenario**:
1. The owner pauses halfway through the findings.
2. Later the owner runs /wxBrainstorm --resume.

**Expected outcome**: The review continues from the next undecided finding without running the analyzers again, because the findings were saved when collected.

### US7 — A normal brainstorm under the new panel conduct

**Actor**: Owner (CTO)

**Scenario**:
1. The owner brings a request such as "I need a scheduler for jobs".
2. The panel proposes the complete set: must-have (hourly, daily, weekly, monthly with drill-down) and optional extras (such as holidays or run history).
3. The owner reacts item by item.

**Expected outcome**: The panel asks only real choices (money, security, client data, anything irreversible) and asks no question about which schedule types are wanted.

## Functional Requirements

### FR-001 — The analyze switch

/wxBrainstorm accepts --analyze with optional --dir <app folder> (default: the current repo) and --conversion (adds wxConversionParity to the analyzers).

**Acceptance Criteria**:
- [ ] A --dir that does not exist stops with one plain error line before anything runs.
- [ ] The switch is listed in the skill's arguments and in the help catalog.

### FR-002 — Feature groups come first

Before any analyzer runs, the panel proposes the app's feature groups from its screens, routes and scopes, and the owner approves or adjusts them. When a feature list exists, the groups are read from it instead.

**Acceptance Criteria**:
- [ ] No finding is shown before the feature groups are approved.
- [ ] A finding the panel cannot place goes under "Unplaced" and is never dropped.

### FR-003 — Analyzer plan and models

Before launch, each analyzer is classified with _wxAI/routing/difficulty.mjs and assigned its model from _wxAI/routing/tiers.mjs (D-0001); the list is shown with each class and model. Only heavy work runs on the session model.

**Acceptance Criteria**:
- [ ] The plan shows every analyzer with its class and model before launch.
- [ ] Nothing launches without the owner's go on that list.

### FR-004 — Collect-only mode

wxUIUXCodeReview --audit and wxConversionParity each gain a collect-only mode: one pass, every finding written, no stops. Their interactive mode stays the default. analyzecode runs only its read-only steps 0-2.

**Acceptance Criteria**:
- [ ] In collect-only mode, neither tool asks a question or edits a file.
- [ ] Their interactive mode is unchanged.
- [ ] analyzecode in analyze mode performs no step beyond step 2.

### FR-005 — One subagent per analyzer, failures reported

Each analyzer runs in its own subagent with a time limit.

**Acceptance Criteria**:
- [ ] An analyzer that errors, times out, or asks for input is listed as "not checked" with the reason, and the sitting continues with the others.
- [ ] The report always lists which analyzers were checked and which were not.

### FR-006 — Findings merged

Every finding becomes one record with: feature, list (must fix / gap / optional), the analyzer(s), location, evidence and confidence label.

**Acceptance Criteria**:
- [ ] The same problem reported by two analyzers shows once, crediting both.
- [ ] The panel's own ideas are labeled Assumed unless cited.

### FR-007 — Item-by-item review

The owner goes through each finding in plain text: keep, explain, not needed, or discuss.

**Acceptance Criteria**:
- [ ] The sitting cannot close while a finding has no decision.
- [ ] A declined finding keeps its reason (SOC 2 CC7.1).

### FR-008 — Saved report and data file

Findings are written to docs/brainstorms/analyze/YYYY-MM-DD-<app>.md and .json in the analyzed app's repo when collected, then updated with each decision.

**Acceptance Criteria**:
- [ ] The files contain no credential value (existing redaction tokens only), no personal data, and no row values.
- [ ] Each decision records its date and who decided it (SOC 2 CC7.2).

### FR-009 — Re-run comparison

Each finding gets a stable fingerprint (analyzer, rule, location, defined to survive line moves) and an evidence hash.

**Acceptance Criteria**:
- [ ] A re-run marks each finding new, fixed, still open, or previously declined.
- [ ] A declined finding is brought up again only when its evidence hash changed.

### FR-010 — Hand-off to scopes

Agreed findings go to /buildscope --from-md <report>, with the owner's go before each run.

**Acceptance Criteria**:
- [ ] Each decision goes to the ledger through _wxAI/askgate/ledger.mjs when the app's repo has it; otherwise the report says the ledger is not installed there.
- [ ] Analyze never writes a scope itself.

### FR-011 — Database check, opt-in

wxDBAnalyze is off by default and runs only when the owner says yes for that sitting.

**Acceptance Criteria**:
- [ ] It runs only through its read-only guard, never with --apply or --dry-run.
- [ ] Analyze keeps only table and column names and counts and drops any value an analyzer returns.
- [ ] The report says whether the database was checked.

### FR-012 — Cross-app pass

Run in wxKanban on the app folders the owner names, the pass reads their saved data files and never writes into them.

**Acceptance Criteria**:
- [ ] A fingerprint rule found in two or more apps becomes one proposed converter scope listing the apps by their owner-set labels, never the customer's name.
- [ ] The owner reviews each proposal like any other finding.

### FR-013 — Pause and resume

/wxBrainstorm --resume continues an analyze sitting from the next undecided finding.

**Acceptance Criteria**:
- [ ] Resume does not run the analyzers again.

### FR-014 — Panel conduct in every brainstorm

The panel proposes the complete version, split into must-have and optional, and asks only real choices (money, security, client data, anything irreversible); this is written into references/panel.md and references/conduct.md.

**Acceptance Criteria**:
- [ ] A test brainstorm on "a scheduler for jobs" produces a must-have and optional list and asks no question about schedule types.

### FR-015 — Ships in the kit

The analyze switch and both collect-only modes reach kit consumers.

**Acceptance Criteria**:
- [ ] A kit consumer repo with the updated kit can run /wxBrainstorm --analyze end to end.
- [ ] wxConversionParity's collect-only mode is confirmed present in a consumer install.

## Data Requirements

No database tables and no schema change. Files only:

- `docs/brainstorms/analyze/YYYY-MM-DD-<app>.json` in the analyzed app's repo, holding: app label and sitting date; the analyzers, each marked checked or "not checked" with a reason; whether the database was checked; the approved feature groups; and the findings.
- Each finding: fingerprint, evidence hash, feature, list (must fix / gap / optional), reporting analyzer(s), location, evidence, confidence label, status (new / fixed / still open / previously declined), decision with reason, date and who decided, and the scope it went to if any.
- A readable report beside it, `docs/brainstorms/analyze/YYYY-MM-DD-<app>.md`, in the brainstorm record format so /buildscope can read it with --from-md.

## API Routes

None — everything runs locally in the editor; nothing new on the server.

## Frontend Components

None — a chat flow; the brainstorm scratch pad shows where the sitting is. A Cockpit button is out of scope.

## Success Criteria

1. Trial run: --analyze --conversion on the first of the 14 conversions finishes in one sitting with feature groups approved before any finding is shown, every analyzer marked checked or not checked with a reason, every finding decided, and the report and data file saved in that app's repo.
2. No stops: wxUIUXCodeReview and wxConversionParity each finish one collect-only pass on the trial app with zero questions and zero file edits; their interactive runs behave as today.
3. Re-run accuracy: on a second run after at least one fix, each changed finding is marked fixed, new or still open correctly, and no declined finding returns unless its evidence changed.
4. Cross-app pass: on at least two analyzed apps sharing a known gap, the gap is proposed as one converter scope listing both apps; a gap in only one app is not proposed.
5. Client data: with the database check on, a search of the saved report and data file finds zero row values and zero credential values; with it off, the report says database not checked.
6. Panel conduct: a test brainstorm on a scheduler for jobs produces a must-have and optional list and asks no question about schedule types.
7. Done means wired: the scope ends with one end-to-end check in which a kit consumer repo with the updated kit runs /wxBrainstorm --analyze from the real entrance to a saved report; that check passing marks the scope done.

## Key Entities

- **Analyze sitting**: one app, one analyze pass, reviewed item by item.
- **Finding**: one merged issue, gap or improvement, with its fingerprint and decision.

Skill and command changes:
- wxBrainstorm: --analyze switch and sitting flow in SKILL.md; panel conduct in references/panel.md and references/conduct.md; new references/analyze.md for the analyze steps, the finding record and the re-run rules.
- wxUIUXCodeReview and wxConversionParity: a collect-only flag each, interactive mode unchanged.
- analyzecode: a way to run only its read-only steps 0-2.
- Help catalog lists the switch; files ship through the kit.

## Constraints

- MUST deliver only the behavior described within the scope boundary: /wxBrainstorm --analyze with optional --dir <app folder> and --conversion: one app per sitting. Panel-proposed feature groups approved by the owner before any finding is shown (read from the feature list once it exists). Running the existing analyzers, each in its own subagent, model chosen by the D-0001 router and shown before launch. Collect-only modes for wxUIUXCodeReview --audit and wxConversionParity; analyzecode limited to read-only steps 0-2. Merging findings into must fix, gaps and optional improvements grouped by feature; item-by-item owner review. Saved report and data file in the analyzed app's repo under docs/brainstorms/analyze/; re-run comparison. Hand-off of agreed findings to /buildscope; ledger entries through ledger.mjs where installed. Opt-in, read-only, aggregate-only database check. Cross-app pass in wxKanban producing converter scope proposals. Pause and resume without re-running analyzers. Panel conduct for every brainstorm: complete proposal (must-have and optional), only real choices asked. Shipping all of the above to kit consumers.
- MUST keep the following work out of scope for this iteration: Fixing any finding (analyze never edits the analyzed app). Time estimates and development plans (that is G.O.D. plan mode). The Platform Self-Audit. A Cockpit button or a new server route. The feature list itself (build step 5 of the 2026-11-08 brainstorm); analyze uses it once it exists. Writing scopes directly; only /buildscope writes scopes, on the owner's go.
- MUST preserve guided, reviewable workflow decisions instead of relying on undocumented implementation assumptions.
- MUST keep user-visible outcomes aligned with the measurable success criteria defined in this scope.

## Notes

- Integration context: Converted from docs/brainstorms/2026-11-08-build-process-smoothing.md, rows 7 and 10 (ledger D-0136 and D-0139), with the gap 1-6 answers and the database choice (b) from this buildscope interview. Boundary with G.O.D. plan mode: analyze finds what is wrong or missing in a built app; G.O.D. plans what to build. Analyze never estimates time or writes a plan. Reuse check: no existing scope covers this. SCOPE-075 looks for reuse across projects; SCOPE-077 analyzes a scope automatically when it changes. Reuses: wxBrainstorm (SKILL.md, references/panel.md, references/conduct.md), the brainstorm record format, _wxAI/askgate/ledger.mjs, _wxAI/routing/difficulty.mjs and tiers.mjs (D-0001), wxDBAnalyze's read-only connection guard (.claude/commands/wxDBAnalyze.md:82-84), the conversion credential redaction tokens (CONTEXT.md, Credential Redaction), and the kit skill allowlist (scripts/sync-to-orchestrator.mjs:245-256). Build step 1 of 6 in the 2026-11-08 build order; depends on nothing new.
- Constraints and risks: Constraints: Read-only on the analyzed app: never edits its code, schema or data; writes only docs/brainstorms/analyze/ in that repo, plus the ledger through ledger.mjs where installed. No git, commit, push or deploy in any repo. Never opens .env files, keys or certificates; credentials appear only as existing redaction tokens. Database check opt-in per sitting, through the read-only guard, names and counts only. Customer names and contacts never go into findings, reports, the ledger or chat. The cross-app pass names each app by a short label the owner sets at that app's first sitting, never the customer's name. The cross-app pass reads other repos' saved data files and never writes into them. No way around Change Impact or Ask Gate hard stops is added. Plain text, no menus, as in every brainstorm. Risks: An analyzer still stops or hangs in collect-only mode: handled by FR-005 (time limit, marked "not checked"). wxDBAnalyze output may include row values (Unknown): handled by FR-011 (analyze drops values); the spec checks the real output. A large app's sitting runs long: handled by FR-013 (pause and resume without re-running). Fingerprint drift on file moves makes a fixed finding look new: the spec defines a fingerprint that survives line moves. Glossary terms (CONTEXT.md): Analyze sitting; Finding. Compliance requirements (SOC 2): CC7.1: every finding is tracked to a decision; a sitting cannot close with one undecided (FR-007, FR-009). CC7.2: every decision carries its date and who decided it, in the report, the data file and the ledger (FR-008, FR-010). CC6.1: the database check is read-only and opt-in (FR-011).
- Customer-visible or operator-visible history should be limited to outcomes that materially affect workflow review and support.

## Clarifications

### Session 2026-11-09

| # | Question | Decision |
|---|----------|----------|
| 1 | What business problem does this solve? | The owner has about 20 built apps and future conversions; the first job is 14 customer conversions. There is no single pass that looks at a built app and reports what is wrong, what is missing, and what would make it more useful. The analyzers exist but each runs alone; two of them (wxUIUXCodeReview --audit and wxConversionParity) stop for an answer at every element, so they cannot run inside a subagent; and nothing brings their findings together, puts them in front of the owner for a decision, or carries them to scopes. Any gap the tools do not connect depends on the owner remembering it. |
| 2 | Who are the primary and secondary actors? | Primary actor: Owner (CTO). Secondary actors: The brainstorm panel (eleven wxG-O-D roles, Lead Architect chairing), The existing analyzers (wxUIUXCodeReview, wxConversionParity, analyzecode, analyzescope, compliance-scan, wxDBAnalyze), Kit consumer projects (current apps and customer conversions). |
| 3 | What is in scope? | /wxBrainstorm --analyze with optional --dir <app folder> and --conversion: one app per sitting. Panel-proposed feature groups approved by the owner before any finding is shown (read from the feature list once it exists). Running the existing analyzers, each in its own subagent, model chosen by the D-0001 router and shown before launch. Collect-only modes for wxUIUXCodeReview --audit and wxConversionParity; analyzecode limited to read-only steps 0-2. Merging findings into must fix, gaps and optional improvements grouped by feature; item-by-item owner review. Saved report and data file in the analyzed app's repo under docs/brainstorms/analyze/; re-run comparison. Hand-off of agreed findings to /buildscope; ledger entries through ledger.mjs where installed. Opt-in, read-only, aggregate-only database check. Cross-app pass in wxKanban producing converter scope proposals. Pause and resume without re-running analyzers. Panel conduct for every brainstorm: complete proposal (must-have and optional), only real choices asked. Shipping all of the above to kit consumers. |
| 4 | What is out of scope? | Fixing any finding (analyze never edits the analyzed app). Time estimates and development plans (that is G.O.D. plan mode). The Platform Self-Audit. A Cockpit button or a new server route. The feature list itself (build step 5 of the 2026-11-08 brainstorm); analyze uses it once it exists. Writing scopes directly; only /buildscope writes scopes, on the owner's go. |
| 5 | How is success measured? | Trial run: --analyze --conversion on the first of the 14 conversions finishes in one sitting with feature groups approved before any finding is shown, every analyzer marked checked or not checked with a reason, every finding decided, and the report and data file saved in that app's repo. No stops: wxUIUXCodeReview and wxConversionParity each finish one collect-only pass on the trial app with zero questions and zero file edits; their interactive runs behave as today. Re-run accuracy: on a second run after at least one fix, each changed finding is marked fixed, new or still open correctly, and no declined finding returns unless its evidence changed. Cross-app pass: on at least two analyzed apps sharing a known gap, the gap is proposed as one converter scope listing both apps; a gap in only one app is not proposed. Client data: with the database check on, a search of the saved report and data file finds zero row values and zero credential values; with it off, the report says database not checked. Panel conduct: a test brainstorm on a scheduler for jobs produces a must-have and optional list and asks no question about schedule types. Done means wired: the scope ends with one end-to-end check in which a kit consumer repo with the updated kit runs /wxBrainstorm --analyze from the real entrance to a saved report; that check passing marks the scope done. |
| 6 | What existing workflow must this align with? | Converted from docs/brainstorms/2026-11-08-build-process-smoothing.md, rows 7 and 10 (ledger D-0136 and D-0139), with the gap 1-6 answers and the database choice (b) from this buildscope interview. Boundary with G.O.D. plan mode: analyze finds what is wrong or missing in a built app; G.O.D. plans what to build. Analyze never estimates time or writes a plan. Reuse check: no existing scope covers this. SCOPE-075 looks for reuse across projects; SCOPE-077 analyzes a scope automatically when it changes. Reuses: wxBrainstorm (SKILL.md, references/panel.md, references/conduct.md), the brainstorm record format, _wxAI/askgate/ledger.mjs, _wxAI/routing/difficulty.mjs and tiers.mjs (D-0001), wxDBAnalyze's read-only connection guard (.claude/commands/wxDBAnalyze.md:82-84), the conversion credential redaction tokens (CONTEXT.md, Credential Redaction), and the kit skill allowlist (scripts/sync-to-orchestrator.mjs:245-256). Build step 1 of 6 in the 2026-11-08 build order; depends on nothing new. |
| 7 | What constraints or risks matter right now? | Constraints: Read-only on the analyzed app: never edits its code, schema or data; writes only docs/brainstorms/analyze/ in that repo, plus the ledger through ledger.mjs where installed. No git, commit, push or deploy in any repo. Never opens .env files, keys or certificates; credentials appear only as existing redaction tokens. Database check opt-in per sitting, through the read-only guard, names and counts only. Customer names and contacts never go into findings, reports, the ledger or chat. The cross-app pass names each app by a short label the owner sets at that app's first sitting, never the customer's name. The cross-app pass reads other repos' saved data files and never writes into them. No way around Change Impact or Ask Gate hard stops is added. Plain text, no menus, as in every brainstorm. Risks: An analyzer still stops or hangs in collect-only mode: handled by FR-005 (time limit, marked "not checked"). wxDBAnalyze output may include row values (Unknown): handled by FR-011 (analyze drops values); the spec checks the real output. A large app's sitting runs long: handled by FR-013 (pause and resume without re-running). Fingerprint drift on file moves makes a fixed finding look new: the spec defines a fingerprint that survives line moves. Glossary terms (CONTEXT.md): Analyze sitting; Finding. Compliance requirements (SOC 2): CC7.1: every finding is tracked to a decision; a sitting cannot close with one undecided (FR-007, FR-009). CC7.2: every decision carries its date and who decided it, in the report, the data file and the ledger (FR-008, FR-010). CC6.1: the database check is read-only and opt-in (FR-011). |
