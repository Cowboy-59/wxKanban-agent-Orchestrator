# Analyze — one built app or conversion, in one sitting (SPEC-156)

`/wxBrainstorm --analyze` points the panel at an app that already exists, instead of at an idea. The
panel agrees the app's feature groups with the owner, runs the existing analyzers unattended, merges
what they find into one list grouped by feature, and goes through it with the owner one finding at a
time. Everything is saved in the analyzed app's own repo, so the next sitting shows what changed.

Read this file in full when SKILL.md's Workflow sends an analyze sitting here. The panel's roles and
conduct (`references/panel.md`, `references/conduct.md`) apply unchanged: plain text, no menus, one
item at a time, the chair closes every point.

**The helper.** Every merge, comparison, decision and close goes through
`scripts/analyze-findings.mjs` (in this skill's folder; plain Node, no dependencies). Its contract is
`specs/156-brainstorm-analyze-mode/contracts/analyze-findings.md`. Never hand-edit the data file: the
helper refuses credential values, personal data and database row values, and a hand edit skips that
guard. Below, `$H` means `node <this skill's folder>/scripts/analyze-findings.mjs`.

## Arguments

| Flag | Meaning |
|---|---|
| `--analyze` | Start an analyze sitting |
| `--dir <app folder>` | The app to analyze. Default: the current repo |
| `--conversion` | The app is a conversion: add wxConversionParity to the analyzers |
| `--cross-app --dir <app>,<app>[,...]` | Run in wxKanban only: the cross-app pass (§ 9) |
| `--resume` | Continue an open sitting (§ 8). Also finds open analyze sittings |

## Rules for the whole sitting

- **Read-only on the analyzed app.** Never edit its code, schema or data. The only things written
  there are `docs/brainstorms/analyze/` (the data file, the report, and the analyzers' findings files
  under `findings/`) and, through `ledger.mjs` alone, its decision ledger.
- **No git, commit, push or deploy** in any repo.
- **No secrets, no customer names.** Never open `.env` files, keys or certificates. Credentials
  appear only as existing redaction tokens. The app is named by a short label the owner sets at its
  first sitting (lowercase, letters, digits and hyphens), never the customer's name.
- **No new way around** Change Impact or Ask Gate hard stops.

## 1. Start the sitting (FR-001)

1. Resolve `--dir` (default: the current repo). If the folder does not exist, say so in one line,
   for example `No folder at D:\apps\billing. Nothing was run.`, and stop.
2. Look for `docs/brainstorms/analyze/*.json` in that folder.
   - Found one with `"sittingClosed": false`: offer to resume it (§ 8) instead of starting again.
   - Found closed ones: this is a re-run. Keep the latest one's path for § 6 and reuse its `label`.
   - None: ask the owner for the app's label in one line ("What short label should this app go by
     in the reports? For example `billing-app`. Not the customer's name.").
3. Ask once, in plain words, whether to check the database this sitting (§ 4). Default: no.
4. Seat the panel as in SKILL.md step 1, in two lines, adding: "This is an analyze sitting: the
   panel looks at what is built, not at a new idea."

## 2. Feature groups first (FR-002)

No finding is shown before the owner approves the feature groups.

- **The feature list read point.** If `docs/features.json` exists in the analyzed app, read the
  groups from it (its `features[].name`). That file is defined by the later feature-list scope. Until
  it exists, the panel proposes the groups.
- **Proposing.** Search the analyzed app's screens and pages, routes and API endpoints, and
  `specs/Project-Scope/*.md` titles. Propose 4 to 12 groups in a numbered list, one line each: the
  group name plus two or three examples of what is in it, with their evidence paths.
- Ask: "Are these the right feature groups? Change, merge or add any." Apply what the owner says and
  confirm the final list in one line.
- Findings that fit no group go under **Unplaced**. They are never dropped. The helper does this on
  its own (`feature` not in the groups → `Unplaced`).

## 3. The analyzer plan (FR-003)

Build the list of analyzers for this app:

| Analyzer | Runs as | When |
|---|---|---|
| wxUIUXCodeReview | `--audit --collect-only --out <dir>/docs/brainstorms/analyze/findings/wxUIUXCodeReview.json` | Always, when the app has a UI |
| analyzecode (wxICA) | `--collect-only --out …/findings/analyzecode.json` (steps 0-2 only) | Always |
| wxConversionParity | `--collect-only --out …/findings/wxConversionParity.json` | Only with `--conversion` |
| compliance-scan | read-only scan; the subagent writes its findings in the contract's input shape | When the app has compliance frameworks enabled |
| analyzescope | read-only; scopes vs code, written in the contract's input shape | When the app has `specs/Project-Scope/` |
| wxDBAnalyze | read-only guard only (§ 4) | Only when the owner said yes to the database check |

Classify each analyzer and resolve its model (D-0001):

```bash
node _wxAI/routing/difficulty.mjs --files <files it will read, roughly> --criteria 1 --touches <list>
node _wxAI/routing/tiers.mjs --difficulty <class>
```

Pass `--touches database` for wxDBAnalyze and `--touches security` for compliance-scan. Both come
out heavy, so they run on the session model. If the kit's `_wxAI/routing/` is not in the repo where
the sitting runs, say so and use `sonnet` for every analyzer, labeled "router not installed".

Show the plan as a table: analyzer, class, model, time limit (default **30 minutes** each), and what
it will write. Ask: "Run these? You can drop one or change a time limit." **Nothing launches without
the owner's go on this list.**

## 4. The database check, opt-in (FR-011, SOC 2 CC6.1)

- Only when the owner said yes at § 1, and only for this sitting.
- Run wxDBAnalyze through its read-only connection guard only (`/wxDBAnalyze`, or
  `npm run db:analyze` where the app has it). **Never `--apply`, never `--dry-run`.** If the guard
  refuses the connection, the database is "not checked" with that reason.
- The subagent converts each wxDBAnalyze finding into the contract's input shape with only `rule`,
  `table`, `column`, `count`, `message`, `list` and `confidence`. The helper keeps only those
  names and counts and drops any `sample`, `values`, `rows` or `example` an analyzer returns.
- What the real output holds (SPEC-156 T013, checked 2026-11-08 against a real production run's
  report and snapshot dated 2026-08-02): table and column names, row counts, and lists of table names
  in messages. No row values were found, and the helper's guard passes on both the report and its raw
  snapshot. The stripping stays in place anyway.
- The report always states whether the database was checked (`databaseChecked` in the data file).

## 5. Run the analyzers, one subagent each (FR-005)

- Launch one subagent per approved analyzer (Agent tool, `model` from § 3), all at once. Each one's
  prompt:
  - names the analyzer, its exact collect-only invocation and its `--out` path;
  - says the analyzed folder is read-only and that the findings file is the only file it may write;
  - says that if it would need to ask the owner anything, it writes the findings file with
    `"checked": false` and the reason, and stops.
- **Time limit.** When an analyzer is still running at its limit, stop it and record it as not
  checked: "timed out after 30 min".
- **Failures never read as clean.** An analyzer that errors, times out, asks for input, or writes no
  findings file is recorded with `"checked": false` and a plain reason. The sitting continues with
  the others. Write a stub findings file for it yourself:
  `{ "analyzer": "<id>", "checked": false, "notCheckedReason": "<why>", "findings": [] }`.
- Add `"class"` and `"model"` from § 3 to each findings file before merging, so the data file keeps
  them.

## 6. Merge and save at once (FR-006, FR-008, FR-009, SOC 2 CC7.2)

As soon as every analyzer has finished or been marked not checked:

```bash
$H merge --out <dir>/docs/brainstorms/analyze/<YYYY-MM-DD>-<label>.json --label <label> \
  --date <YYYY-MM-DD> --groups "<Group A>,<Group B>,..." [--db-checked] \
  <dir>/docs/brainstorms/analyze/findings/*.json
```

- Exit 2 means the guard refused a value: it prints the field and the kind (credential, personal
  data, row value). Fix the findings file it came from by replacing the value with a redaction token
  or a count, then merge again. Never work around the guard.
- **Re-run.** When § 1 found an earlier closed data file:
  `$H compare --previous <latest.json> --current <new.json> --out <new.json>`.
  The output marks each finding `new`, `still-open`, `fixed` or `previously-declined`. A declined
  finding returns for review only when its evidence changed (`resurface: true`); otherwise it keeps
  its decision and reason and stays quiet. Say the counts in one line. If a file was renamed, its
  findings show as fixed plus new; say so.
- Write the report `<YYYY-MM-DD>-<label>.md` beside the data file straight away (§ 10), then run
  `$H guard <report.md>`. Both files exist from this moment, so a crash or a pause loses nothing.
- **The panel's own ideas.** A Benefit, Risk or Question the panel adds becomes a finding too. Put it
  in a findings file with `"analyzer": "panel"` before the merge, or merge it into a re-run. Label it
  `Assumed` unless it cites evidence.

## 7. The review, one finding at a time (FR-007, SOC 2 CC7.1)

- Show the totals first: per list (must fix, gaps, optional) and per feature, plus the analyzers
  checked and not checked.
- Then go feature by feature, in the approved order, with **Unplaced** last. Within a feature: must
  fix, then gaps, then optional. On a re-run, review only `new`, `still-open`, and declined findings
  with `resurface: true`. List fixed findings in one line per feature.
- For each finding, one short block:
  - what it is, in plain words;
  - where it is, with its location and the analyzers that found it;
  - its confidence;
  - what the panel recommends (the chair, one or two sentences).

  Then ask: "Keep it, explain it, not needed, or talk it through?"
  - **keep** → `decision keep`. Ask in the same line whether it goes to a scope (§ 11).
  - **explain** → the relevant role explains at the owner's level, then asks again.
  - **not needed** → ask for the reason in one line. `decision not-needed` requires it.
  - **talk it through** → discuss as in `conduct.md` § Discussion rules, then ask again.
  - "later" or "park it" → `decision parked`.
- Record each answer right away:
  `$H decide --file <data.json> --fingerprint <fp> --decision <keep|not-needed|parked> --by owner [--reason "<why>"]`.
  Then update that finding's row in the report. Every decision carries its date and who decided.
- Relist the progress ("Board: 4 of 9 decided") before moving to the next feature.

## 8. Pausing and resuming (FR-013)

- Pause at any point. Every decision is already saved, so pausing writes nothing new. Say:

  > Saved. Type `/clear`, then `/wxBrainstorm --resume`, and we'll carry on with: <feature>, finding <n>.

- On `--resume`, list the open analyze sittings (data files with `"sittingClosed": false`) alongside
  the open brainstorm records, by label and date. Then re-read the chosen data file, show the totals
  and how many are decided, and continue at the next undecided finding (`$H check <data.json>` lists
  them in `undecided`). **Do not run the analyzers again.** If the data file is older than a week,
  say the app may have changed and offer a fresh sitting instead.

## 9. The cross-app pass (FR-012), in wxKanban only

`/wxBrainstorm --analyze --cross-app --dir <app>,<app>[,...]`

1. If this is not the wxKanban repo, say the cross-app pass runs in wxKanban and stop.
2. For each folder, take its latest `docs/brainstorms/analyze/*.json`. A folder with none is listed
   as "not analyzed yet" and left out. Fewer than two remaining apps → say so and stop.
3. `$H cross-app --app <label>=<path> --app <label>=<path> ...`. It only reads. **Never write into
   the apps' folders.**
4. Each proposal is one rule found in two or more apps: one proposed **converter scope** listing the
   apps by their labels. A rule found in only one app is never proposed.
5. Review each proposal as in § 7: keep, explain, not needed, or talk it through. Record the result
   in wxKanban's own `docs/brainstorms/analyze/<YYYY-MM-DD>-cross-app.md` (§ 10 format, no data file
   needed), and offer `/buildscope --from-md` for kept proposals (§ 11).

## 10. The report (`.md`)

The report uses the brainstorm record format (`conduct.md` § Recording), so `/buildscope --from-md`
can read it:

- **Header:**
  - `# Brainstorm: Analyze <label>`
  - Status: open, or closed once the sitting is closed
  - Opened / last updated
  - Source: `wxBrainstorm --analyze` (add `--conversion` if used)
  - Asked for by: owner
  - Level
  - Next item
- **The request:** "Analyze <label>: what is wrong, what is missing, what would make it more useful."
- **What already exists:** the feature groups table, then the analyzers table (analyzer, class,
  model, checked / not checked, reason). Then one line: "Database checked: yes / no".
- **Panel:** who spoke and who sat out.
- **Decisions:** one row per decided finding: #, item (feature, list, short title, location),
  decision (Agreed for keep, Declined for not needed with the reason, Parked), kind, To scope?, and
  date with who decided. On a re-run, also add a "Fixed since <previous date>" list.
- **Open items:** undecided findings, by feature.
- **Next step:** "Recorded only", or the `/buildscope` hand-off and its result.

Never rewrite an earlier decision row. A changed decision is a new row that says what it replaces.

## 11. Closing, the ledger and the hand-off (FR-010)

1. `$H check <data.json>`. Exit 2 means findings are undecided (or a decision is missing its date,
   decider or reason). List them and go back to § 7. **The sitting cannot close while any finding
   has no decision.**
2. Show the closing summary (`conduct.md` § Closing the topic) and get the owner's approval.
3. **Ledger.** If `_wxAI/askgate/ledger.mjs` exists in the analyzed app's repo, write one entry per
   decided finding, as `conduct.md` § Writing the ledger describes, run from that repo. Keep becomes
   Agreed, not needed becomes Declined, and parked becomes Parked. The source is
   `docs/brainstorms/analyze/<file>.md#<row>`. If the script is not there, write in the report's Next
   step: "Ledger not installed in this repo; decisions are recorded in this report only."
4. **Hand-off.** For kept findings marked To scope? yes, offer
   `/buildscope --from-md docs/brainstorms/analyze/<file>.md`, one run at a time, **only on the
   owner's go each time**. `/buildscope`'s own rules and reuse check apply. Analyze never writes a
   scope itself. After each run, set the finding's scope:
   `$H decide ... --decision keep --by owner --scope SCOPE-NNN` (re-records it with the scope).
   Update the report's To scope? to `done (SCOPE-NNN)`. This must happen before step 5, because
   `decide` refuses a closed sitting. If the owner declines the hand-off, say "Recorded only".
5. `$H close <data.json>`, then set the report's Status to closed.
6. Update the learnings file as `conduct.md` § Learning from decisions describes. Use general
   patterns only, never app labels.
