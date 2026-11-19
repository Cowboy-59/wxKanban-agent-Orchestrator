# Task Breakdown: Brainstorm Analyze Mode

**Feature**: Brainstorm Analyze Mode
**Spec**: 156 (implements SCOPE-156)
**Date Generated**: 2026-11-08
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | T001 The `--analyze` switch and sitting entry (FR-001) | high | done |
| 2 | T002 Feature groups first, with Unplaced (FR-002) | high | done |
| 3 | T003 Analyzer plan: difficulty, model, time limit, owner's go (FR-003) | high | done |
| 4 | T004 wxUIUXCodeReview `--collect-only` (FR-004) | high | done |
| 5 | T005 wxConversionParity `--collect-only` (FR-004) | high | done |
| 6 | T006 analyzecode / wxICA `--collect-only`, steps 0-2 only (FR-004) | medium | done |
| 7 | T007 One subagent per analyzer, "not checked" on failure (FR-005) | high | done |
| 8 | T008 Findings helper: record, merge, fingerprint, evidence hash, guards (FR-006, FR-008, FR-009, FR-011) | high | done |
| 9 | T009 Item-by-item review, close blocked while undecided (FR-007) | high | done |
| 10 | T010 Saved report and data file, written at collect, updated per decision (FR-008) | high | done |
| 11 | T011 Re-run comparison (FR-009) | high | done |
| 12 | T012 Hand-off to `/buildscope --from-md` and the ledger (FR-010) | medium | done |
| 13 | T013 Opt-in database check, names and counts only (FR-011) | high | done |
| 14 | T014 Cross-app pass and converter scope proposals (FR-012) | medium | done |
| 15 | T015 Pause and resume without re-running analyzers (FR-013) | medium | done |
| 16 | T016 Panel conduct in every brainstorm (FR-014) | medium | done |
| 17 | T017 Help reference and manual page (FR-001, FR-015) | medium | done |
| 18 | T018 Ship through the kit (FR-015) | high | done |
| 19 | T019 Unit tests for the findings helper (FR-006, FR-008, FR-009, FR-011, FR-012) | high | done |
| 20 | T020 Owner verification runs: trial conversion, re-run, cross-app, conduct (SC-1 – SC-6) | high | todo |
| 21 | T021 Done means wired: consumer end-to-end check (SC-7, FR-015) | critical | todo |

## Task Details

### T001 — The `--analyze` switch and sitting entry
Add `--analyze`, `--dir <app folder>` (default current repo), `--conversion`, and `--cross-app` to
`.claude/skills/wxBrainstorm/SKILL.md` § Arguments, and a branch at the top of the Workflow that hands
an analyze sitting to the new `references/analyze.md`. A `--dir` that does not exist stops with one
plain error line before anything runs. FR-001.

### T002 — Feature groups first, with Unplaced
In `references/analyze.md`: the panel proposes feature groups from the app's screens, routes and
scopes; the owner approves or adjusts; no finding is shown before approval. One named read point for
the future feature list (used instead of the proposal when it exists). Findings the panel cannot place
go under "Unplaced", never dropped. FR-002.

### T003 — Analyzer plan
Classify each analyzer with `_wxAI/routing/difficulty.mjs`, take its model from
`_wxAI/routing/tiers.mjs`, and show the list (analyzer, class, model, time limit, default 30 min)
before launch; nothing launches without the owner's go on that list. wxDBAnalyze appears only when the
database check is on (T013); wxConversionParity only with `--conversion`. FR-003.

### T004 — wxUIUXCodeReview `--collect-only`
In `mcp-server/src/prompts/wxuiuxcodereview.md` (served) and `.claude/skills/wxUIUXCodeReview/SKILL.md`
(stub argument list): with `--audit --collect-only`, one pass over every surface, every finding
written to a findings file in the helper's input shape, zero questions, zero file edits. Interactive
mode stays the default and unchanged. Hosted prompt registry regenerates on build. FR-004.

### T005 — wxConversionParity `--collect-only`
In `mcp-server/src/prompts/wxconversionparity.md` and `.claude/commands/wxConversionParity.md`: one
pass over every element (instead of "one element at a time" with stops), all three detection levels,
findings written to a findings file, zero questions, zero edits. Interactive mode unchanged. FR-004.

### T006 — analyzecode / wxICA `--collect-only`
In `wxkanban-agent/templates/skills/wxICA/SKILL.md` and `.claude/commands/analyzecode.md`: with
`--collect-only`, run step 0 (drift audit), step 1 (explore) and step 2 (present candidates) and write
the results to a findings file; never enter step 3 (grilling). Interactive mode unchanged. FR-004.

### T007 — One subagent per analyzer
In `references/analyze.md`: each analyzer runs in its own subagent with its T003 model and time
limit. An analyzer that errors, times out, or asks for input is recorded "not checked" with the reason
and the sitting continues. The report always lists checked and not-checked analyzers. FR-005.

### T008 — Findings helper
New `.claude/skills/wxBrainstorm/scripts/analyze-findings.mjs` (plain Node, no dependencies), fenced
`[SCOPE 156 / T008]`: normalize analyzer findings into the FR-006 record; merge duplicates crediting
every analyzer; compute fingerprint and evidence hash per FR-009; refuse to write any value that looks
like a credential (outside redaction tokens), personal data, or a database row value; keep only names
and counts from wxDBAnalyze. Subcommands: `merge`, `compare`, `cross-app`, `check`. FR-006, FR-008,
FR-009, FR-011.

### T009 — Item-by-item review
In `references/analyze.md`: present findings by feature, list by list; the owner answers keep, explain,
not needed, or discuss in plain text. Declined findings keep their reason. The sitting cannot close
while any finding has no decision (`analyze-findings.mjs check` enforces it). FR-007, SOC 2 CC7.1.

### T010 — Saved report and data file
Write `docs/brainstorms/analyze/YYYY-MM-DD-<label>.json` and `.md` in the analyzed app's repo as soon
as findings are collected; update both after each decision with date and who decided. The `.md` uses
the brainstorm record format so `/buildscope --from-md` reads it. The owner sets the app label at the
first sitting; never the customer's name. FR-008, SOC 2 CC7.2.

### T011 — Re-run comparison
On a re-run, `analyze-findings.mjs compare` against the latest saved data file marks each finding new,
fixed, still open, or previously declined; a declined finding returns only when its evidence hash
changed. The review shows only new, still-open, and changed-evidence declined items. FR-009.

### T012 — Hand-off to scopes and the ledger
Offer `/buildscope --from-md <report>` for the agreed items, running it only on the owner's go each
time. Record each decision through `_wxAI/askgate/ledger.mjs` when the app's repo has it; otherwise
the report says the ledger is not installed there. Analyze never writes a scope. FR-010.

### T013 — Opt-in database check
At the start of a sitting ask once whether to check the database (default no). When yes, run
wxDBAnalyze through its read-only guard only, never `--apply` or `--dry-run`. First, on a real
database, record what wxDBAnalyze's output actually contains (scope risk: Unknown) in this task's
notes. Keep only table and column names and counts; the report states whether the database was
checked. FR-011, SOC 2 CC6.1.

**Notes, real-output check (2026-11-08).** The latest real wxDBAnalyze run is
`docs/db-analysis/2026-08-02T14-05-57-593Z.md` (14,101 lines) and its `.snapshot.json`, against the
production database. The snapshot keys are `declaredTables[]`, `liveTables[]`,
`capabilityExtensions.*`, `neverAnalyzedCount`, `statementsUnavailable`, `bloatUnavailable`,
`freezeMaxAge` and `freezeMaxAgeAssumed`, which are names and counts only. The report holds table and
column names and row counts in its prose. Every `sample` in `dimensions/maintenance.ts` and
`performance.ts` is a list of table names, not row values. `analyze-findings.mjs guard` passes
(`ok: true`, 0 problems) on both files. No row values were found. The helper still strips `sample`,
`values`, `rows` and `example` keys. The check reused the saved run and did not connect to production
again. Risk: Unknown → Confirmed (names and counts only).

### T014 — Cross-app pass
`/wxBrainstorm --analyze --cross-app --dir <app>,<app>[,...]` in wxKanban: read each app's latest data
file (never write into them), group by `analyzer | rule` with `analyze-findings.mjs cross-app`; a rule
in 2+ apps becomes one proposed converter scope listing the apps by owner-set labels; the owner reviews
each proposal like any finding. FR-012.

### T015 — Pause and resume
`/wxBrainstorm --resume` detects an open analyze sitting (`sittingClosed: false`) and continues from
the next undecided finding, reading the saved data file; analyzers are not run again. FR-013.

### T016 — Panel conduct in every brainstorm
Write into `references/panel.md` and `references/conduct.md`: the panel proposes the complete version
split into must-have and optional, and asks only real choices (money, security, client data, anything
irreversible). FR-014.

### T017 — Help reference and manual page
Update `docs-workspace/sections/reference/cmd-wxbrainstorm.md` and `docs-workspace/commands.json` for
`--analyze`, `--dir`, `--conversion`, `--cross-app`; note `--collect-only` on the wxUIUXCodeReview,
wxConversionParity and analyzecode reference pages; rebuild `public/manual/`. FR-001, FR-015.

### T018 — Ship through the kit
Confirm `wxBrainstorm` and `wxUIUXCodeReview` stay in `CLAUDE_SKILLS_ALLOWLIST` and that the sync
copies `references/analyze.md` and `scripts/analyze-findings.mjs`; confirm the wxICA template and the
two command stubs ship; run the kit sync dry-run and list the shipped paths. No push or publish
without Andy. FR-015.

### T019 — Unit tests for the findings helper
`tests/unit/brainstormAnalyzeFindings.test.ts` (Vitest): fingerprint unchanged when a block moves by
N lines; merge credits both analyzers; compare yields new / fixed / still open / previously declined;
declined returns only on evidence change; credential, personal-data and row-value writes refused;
cross-app proposes only for 2+ apps; `check` blocks close with an undecided finding.

### T020 — Owner verification runs
With Andy: trial `--analyze --conversion` on the first of the 14 conversions (SC-1, SC-2), a re-run
after one fix (SC-3), a cross-app pass on two analyzed apps (SC-4), the database check on and off
(SC-5), and the scheduler conduct test (SC-6). Record results in `tests.md` § Evidence.

### T021 — Done means wired
After the kit is published (Andy's call), in a kit consumer repo run `/wxBrainstorm --analyze` from the
real entrance to a saved report, and confirm wxConversionParity's collect-only text is present in the
consumer install. This check passing marks the scope done. SC-7, FR-015.
