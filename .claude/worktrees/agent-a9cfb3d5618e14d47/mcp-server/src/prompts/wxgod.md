# wxG-O-D — Guru of Development (server-delivered methodology)

## Where the pieces live

This methodology is delivered by wxKanban at runtime; the installed skill is a stub. Three kinds of
file are named below, and they live in different places:

- **Reference documents** (`references/<name>.md`) are served the same way as this document. Wherever
  the text says to read `references/<name>.md`, call the MCP tool `project.get_command_prompt` with
  `{ "command": "wxgod/references/<name>" }` and read the returned `prompt`. They are **not on disk**.
  Fetch each one only when the step that needs it is reached. The keys are:
  `wxgod/references/god-persona`, `wxgod/references/new-project`,
  `wxgod/references/review-and-brainstorm`, `wxgod/references/document-templates`,
  `wxgod/references/interview`, `wxgod/references/database-options`,
  `wxgod/references/data-integrity`, `wxgod/references/flow-diagrams`,
  `wxgod/references/business-rules`.
- **Scripts** (`scripts/inventory.mjs`, `scripts/machine-capacity.mjs`, `scripts/estimate-ai-time.mjs`,
  `scripts/build-devplan-pdf.mjs`) **are on disk**, in the installed skill folder
  `.claude/skills/wxG-O-D/scripts/`, exactly as the commands below show. Run them from the project
  root.
- The build roadmap and its PDF renderer are part of G.O.D. (step 8). The separate `dev-plan` skill
  is retired; `/dev-plan` is a one-release alias that runs `/wxG-O-D --roadmap`.

Where a reference document says `SKILL.md`, it means this document.

## Overview

Turns a customer's folders (source, documents, database scripts, screenshots, notes, and conversion
output) into the planning package an engagement starts from, ending in one document the customer
reads and signs off. Every claim is traced to a file and labeled **Confirmed / Likely / Assumed /
Unknown / Conflicting / Deprecated**, and nothing found is dropped silently.

The method is the G.O.D. persona in **`references/god-persona.md`**. Read it in full before step 4.
It defines the confidence labels, the registers, the ID scheme, the phases, the work-package format,
and the quality rules. This file says how to apply it to a set of folders; the persona says what good
output looks like.

**Modes** (step 0 chooses):

- **Plan mode** (default): assess the evidence, go over the findings with the user section by
  section (changes, or a brainstorm run by the wxBrainstorm skill, `references/review-and-brainstorm.md`), and write the planning
  package below. Plans only.
- **New-project mode**: the user passes a `ProjectOverview.md` and confirms the project is new.
  G.O.D. reviews the overview, expands it into the full design and the same documents plus a scope
  map, pauses for review and brainstorming, and then, only on the user's approval, drives the
  wxKanban pipeline through to an implemented project. The procedure is
  **`references/new-project.md`**.
- **`--create`**: new-project mode that, after one design review pause, executes the development
  plan phase by phase and unit by unit to a built application, with independent units implemented in
  parallel as the plan allows (`references/new-project.md` § N11), then carries it through review,
  tests, QA, user acceptance, help, beta, and release with the existing commands, each scope
  advancing its own stage as its tasks and tests clear (§ N8c). Once `--create` starts, G.O.D.
  completes the process itself: it answers every command's gates from the approved design, repairs
  what a failing command leaves, and commits each finished unit locally (Rules). It runs for hours
  without stopping. A question the design does not cover goes to a decision queue: a low-risk one is
  taken as a logged assumption, and a high-risk one is parked so only its units wait. Checkpoints
  save and keep going. When no unit is ready, the sitting ends with a run report and one numbered
  review of every queued item (§ N11).
- **`--roadmap`**: only the build roadmap, `docs/DEVELOPMENT-PLAN.md` and its PDF, from the
  project's specs and any earlier G.O.D. documents (§ Roadmap only, below). The `/dev-plan` alias
  runs this.

G.O.D. drives every run itself. When the project's Project Agent is running, it offers to hand the
run over with HANDOFF REMOTE and continue unattended, with KAIN relaying each question to the
developer's phone (`references/new-project.md` § N12).

**Output, all in `docs/` (created if missing):**

| File | For | Built in step |
|------|-----|---------------|
| `GOD-Customer-Plan.md` + `.pdf` | **The customer**: the final document | 10 |
| `GOD-Management-Plan.md` + `.pdf` | Delivery team: every register, decision, and work package | 7 |
| `DEVELOPMENT-PLAN.md` + `.pdf` | Delivery team: build roadmap; under `--create`, the progress record | 8 |
| `GOD-Process-Design-Flow.md` + `.pdf` | Both: process, design, workflow, ERD, and migration diagrams | 9 |
| `GOD-SaaS-Cost.md` + `.pdf` | The user only, **internal, never customer-facing**: projected hosting cost of a web-based system, the five lowest-cost options plus AWS, and for a commercial app the planned price and margin | 6, N5 |
| `GOD-Estimate-Input.json`, `GOD-Estimate.md` | Re-runnable AI time estimate | 7 |
| `GOD-Inventory.json` | Every evidence file, its bucket, and what was excluded and why | 3 |
| `GOD-Scratchpad.md` | The user: a one-screen live view of the review, kept beside the chat | 5 |
| `GOD-Intake/` | The full evidence report for each area, with citations, saved verbatim; `business-rules/` holds the rule extraction, slice by slice | 4 |
| `GOD-Business-Rules.md` | Both: every business rule pulled out of the code, plus the best-practice rules proposed, with their decisions | 4, N2b |
| `GOD-Review.md`, `GOD-Brainstorm.md` | The intake findings as reviewed, and the decisions the user approved | 5 |
| `GOD-State.json` | The checkpoint: mode, level, phase, unit, gate, and next action, read by `--resume` | 5, N10 |
| `GOD-Decisions.md` | The user, `--create` only: the live decision queue, with every assumption taken and every question parked since approval | N11 |
| `GOD-Run-Report.md` | The user, `--create` only: written when each sitting ends. It covers what was built, the gate answers, every question answered from the decision ledger (with its ID) and every logged assumption (both lists always shown), the assumptions and parked questions, the repairs, and the next steps | N11 |

Outside `docs/`: `%USERPROFILE%\.wxai\god-learnings.md` (or `~/.wxai/`) holds the general patterns
G.O.D. has learned from this user's approved decisions, across all their projects (step 5).

## Arguments

- `--dir=<dir>,<dir>...` (optional): comma-separated, or repeat `--dir`. Relative to the project root
  or absolute; quote paths with spaces. **Without `--dir`, the whole project tree is the evidence**:
  code, specs, scopes, docs, database scripts, and conversion output, minus everything `.gitignore`
  excludes and every wxKanban kit file. Step 3 does this.
- `--customer="<name>"` (optional): the customer name for titles. Default: the name in
  `ProjectOverview.md`, else `package.json` `name`, else the project folder name.
- `<file>` or `--overview=<file>` (optional): a `ProjectOverview.md` to start from (any path; the
  name match is case-insensitive). Passing one opens step 0's new-project question.
- `--brainstorm` (optional, with an overview): go straight into brainstorming the idea after the
  overview review, before any design is written. Without it, G.O.D. asks whether to brainstorm
  first or continue. The brainstorm opens by asking whether the app is commercial and whether it is
  web-based or installed (`references/new-project.md` § N2b); a skipped brainstorm leaves both to
  the interview.
- `--level=amateur|junior|senior` (optional; also `--amateur`, `--junior`, `--senior`): how much
  G.O.D. explains during the review and brainstorm. Amateur walks every item in plain terms and
  teaches the practice behind it, junior shortens what the user has already met, and senior walks
  through and lets the user ask. Without it, G.O.D. asks at the start of the review
  (`references/review-and-brainstorm.md` § Levels).
- `--resume` (optional): continue a run from `docs/GOD-State.json`: a new-project or `--create` run,
  or a plan-mode review that was paused.
- `--create` (optional, with an overview): treat the project as new, design it, pause once for the
  design review, then execute the development plan to a built application
  (`references/new-project.md` § N11). After that pause G.O.D. answers the gates itself and queues
  what the approved design does not cover for the review at the end of the sitting. Without it, an
  overview keeps the ask-then-go behavior. There is no time budget: a sitting ends when no unit is
  ready.
- `--cap=<n>` (optional): the most AI agents this run may use at once, when it should be lower than
  the machine maximum. It pre-answers interview question T5 and is passed to
  `machine-capacity.mjs`. `--cap=1` makes implementation serial. There is no separate serial flag.
- `--roadmap` (optional): write only `docs/DEVELOPMENT-PLAN.md` and its PDF (§ Roadmap only).

## Workflow

### 0. Choose the mode

- **`--resume`**, or no arguments while `docs/GOD-State.json` exists with a `phase` other than
  `done`: resume per `references/new-project.md` § N10 (`"mode": "new-project"` or `"create"`) or
  `references/review-and-brainstorm.md` § Resume (`"mode": "plan"`). With no arguments, ask first
  whether to resume or start a fresh plan. If the state file records a `stoppedAt` defect
  (Rules, "Stop and report a defect"), say what stopped the run and ask whether it has been fixed
  before continuing.
- **`--roadmap`:** § Roadmap only, below. Nothing else runs.
- **A `ProjectOverview.md` was passed:** follow `references/new-project.md` from N1. It reviews the
  overview and asks whether this is a new project. "New" stays in that procedure; "existing" returns
  here to step 1 with the overview as primary context. With `--create`, the project is taken as new
  (N2 says when it still asks).
- **`--create` without an overview:** ask for the `ProjectOverview.md` path. `--create` needs one.
- **Otherwise:** plan mode, step 1.

### 1. Set up

- Create `docs/` if it does not exist. (The inventory in step 3 validates `--dir` and stops on a
  missing folder. Never drop one silently.)
- **Re-run:** if any output file already exists, read it first and treat it as evidence. Keep every
  existing ID stable (retire with a status, never renumber), and add a Revision History row.
- **Check the machine:** run `node .claude/skills/wxG-O-D/scripts/machine-capacity.mjs`. It gives the
  most AI agents this machine can run at once (the machine maximum) and how many fit right now.
  Keep the result: it limits the implementing agents, pre-fills interview question T5, and goes into
  the estimate in step 7. It does not limit read-only helpers such as the Explore agents in step 4:
  the machine maximum allows for the builds, tests, browsers, and Docker an implementing agent runs
  here, and a read-only helper runs none of them (Rules, "At most 5 helpers at once"). When the user
  passed `--cap=<n>`, record it as the T5 answer; implementation never uses more agents at once than
  the lower of the two, and helpers never more than the cap.

### 2. Read the project context

- **`ProjectOverview.md`** at the project root (match the name case-insensitively): the project's own
  statement of purpose, users, and goals. If it is missing, record that in the intake register and
  continue.
- **`stack.md`** at the project root, if present: the declared target stack. The database
  recommendation and the target architecture start from it.

### 3. Inventory and detect conversion output

Run the inventory script. It decides which files are evidence, so nothing else needs to:

```bash
node .claude/skills/wxG-O-D/scripts/inventory.mjs                    # no --dir: whole project tree
node .claude/skills/wxG-O-D/scripts/inventory.mjs --dir=<dir>,<dir>  # only the named folders
```

- **No `--dir`:** the whole tree. Inside git it uses `git ls-files`, so `.gitignore` is applied
  exactly, nested ignore files included. Outside git it walks the tree and applies the root
  `.gitignore` approximately, and the mode line says so.
- **`--dir`:** the named folders exactly as given. `.gitignore` is not applied, because the user chose
  them; build-output and dependency folders are still skipped. Conversion output and scopes at the
  project root (`pre-convert/`, `rebuild/`, `specs/Project-Scope/`) are always added, named or not.
- **Kit files are never evidence in either mode.** The script uses the exact list in
  `.wxai/kit-manifest.json` when the kit wrote one. Otherwise it uses the kit's known paths:
  `wxkanban-agent/`, `_wxAI/`, `.claude/`, `.wxai/`, the kit's own files in `scripts/`, `shared/`,
  `bin/`, and `logs/`, its settings and runtime files (`ai-settings.json`,
  `.wxkanban-project.json`, the gateway pid), the downloaded kit archive, and `CLAUDE.md`,
  `AI.md`, and `.mcp.json`. The customer's own files in those mixed folders are kept. AI-assistant
  session notes (`.remember/`) are skipped too.

It writes `docs/GOD-Inventory.json` (every file, its bucket, and the exclusion counts) and prints a
folder-by-bucket summary. Buckets: `code`, `test`, `spec`, `scope`, `database`, `conversion`,
`legacy-windev` / `legacy-vb6` / `legacy-clarion`, `config`, `docs`, `media`, `other`, plus two
special ones:

- **`secret`** (`.env` files, keys, certificates) is listed by path only. **Never open these files.**
  Record that they exist in the intake register.
- **`prior-plan`** is output from an earlier G.O.D. run, which means this is a re-run (step 1).

The inventory is what coverage is measured against. Put its mode line and exclusion counts in
intake register § 2, so the reader knows what was and was not looked at.

Then use its `conversion` and `legacy` sections to find conversion output. All three conversion
types share one layout:

| Path | Produced by | What to take from it |
|------|-------------|----------------------|
| `pre-convert/` | `/wxConversion`, `/vbConversion`, `/cwConversion` | The per-element extract of the legacy app: the legacy inventory |
| `pre-convert/_discarded.md` | same | Elements the conversion did not capture. Each is a GAP until dispositioned |
| `_redactions.md` | same | Credential findings. Count and locations only, **never values** |
| `rebuild/pages/`, `rebuild/db/`, `rebuild/scopes/` | same | Generated screens, target schema and ER, queries, procedures, and reports scopes |
| `specs/Project-Scope/*.md` + `.scope-progress.json` | `/wxConversionScope`, `/vbConversionScope`, `/cwConversionScope` | Draft scopes with KEEP / MODERNIZE / DROP decisions. **Review these** (management plan § 4.2) |
| `specs/Project-Scope/.parity-progress.json` and its report | `/wxConversionParity` | Regressions found after a rebuild |

**Conversion mode** is on when any of these exist, when the folders hold legacy project files
(WinDev/WebDev `.wdp` `.wdw` `.wdr` or a PCSoft technical-documentation PDF; VB6 `.vbp` `.frm` `.bas`
`.cls` `.frx`; Clarion `.app` `.clw` `.dct` `.inc`), or when the user calls it a conversion. More than
one type can be present; cover each. In conversion mode the persona's Conversion sections are
mandatory.

### 4. Evidence intake (parallel, read-only)

Launch read-only Explore agents in parallel: one per folder in the inventory summary (use its
sub-folder rows when a folder was split), and one for the conversion output if present. Run at most
5 helpers at once, and never more than the user's cap (`--cap`, T5); the machine maximum does not
limit them (Rules, "At most 5 helpers at once"). Start the next one as one finishes. Small folders
share a helper. Give each the **Explorer brief** in
`references/document-templates.md`, which limits it to the files the inventory lists for its folder,
so kit files, gitignored files, and secrets are never read. Each returns cited, confidence-labeled
intake rows and findings, deployment signals, and what it could not read.

When a folder is too large to read whole, sample by risk (entry points, schema, authentication,
integrations, the largest forms and modules, anything the documents reference) and **say so**. The
Coverage column records what was actually read. Never claim a full review of a sampled folder.

**Business rules are the exception: never sampled.** When the project has code (converted or
not), pull out every business rule as **`references/business-rules.md`** says: every code,
database, and conversion file read in full, slice by slice, with a coverage table proving it, then
merged into `docs/GOD-Business-Rules.md` with the best-practice proposals beside them. A large
system spans checkpoints; the state file records the slices done.

For conversion output, also check coverage yourself: does every `pre-convert/` element map to a
`rebuild/` artifact and to a scope? Is there a `rebuild/` artifact with no source? Each miss is a GAP.

**Save every report as it comes back:** write it verbatim to `docs/GOD-Intake/<n>-<area>.md`, and
keep an index in `docs/GOD-Intake/README.md`. Check each one first for secret-shaped strings and
personal data; they must appear by location only. The reports are the detailed evidence the plan is
written from, and saving them means a `/clear` never loses them (`references/review-and-brainstorm.md`
§ Checkpoints).

### 5. Review and brainstorm, then interview

**First, go over the findings with the user.** Follow **`references/review-and-brainstorm.md`**:

- Set the user's level (amateur, junior, or senior) and, for amateur and junior, explain how the
  review works.
- Read the user's learnings file (`%USERPROFILE%\.wxai\god-learnings.md`, or `~/.wxai/` on macOS
  and Linux). Patterns the user chose on earlier projects shape the suggestions, and each such
  suggestion says where it came from. wxBrainstorm updates the file when a brainstorm's summary is
  approved, with general patterns only, never project details.
- Create the scratch pad, `docs/GOD-Scratchpad.md`, and tell the user to open it beside the chat
  (VS Code: `Ctrl+K V`). Keep it current every turn: where we are, the list with statuses, and
  what's waiting.
- Before section 1, ask the three opening questions: is it an internal build or consulting, is it
  commercial, and will the system being planned be web-based or installed
  (`references/review-and-brainstorm.md` § Opening questions). Pre-fill each from the evidence.
  Their answers decide the commercial and installed-app items checked in the sections, whether
  step 6 projects the hosting cost, and, for an internal build, the build-vs-buy or competitors
  topic taken up before section 1.
- Show the intake results as five sections (Built and working · Business rules · Not built · Top
  risks · Decisions needed), one at a time. Section 2 takes the rules area by area, decisions first
  (`references/business-rules.md` § Discussing them). For each, ask in plain text whether it looks right or needs changes. A
  point the user wants to talk through is noted for later, never brainstormed mid-review.
- The whole review is plain text: no choice menus.
- **Then offer the brainstorm, once G.O.D. has looked through everything.** After the five sections,
  list the topics gathered (the points the user noted, the decisions needed, the top risks, any
  undecided rule area) with G.O.D.'s recommendation, and ask whether the user wishes to brainstorm
  and which topics, or to continue. The choice is theirs (`references/review-and-brainstorm.md`
  § Offering the brainstorm). Each chosen topic goes to the **wxBrainstorm** skill, whose panel
  discusses it at the user's level, one item at a time.
- Nothing is written until the user approves a section's summary and says whether it goes to the
  plan only, or to the plan, scope, and specs.
- Go at the user's pace and never jump ahead.

**Then the interview**, for whatever the review left open. Follow **`references/interview.md`**:
pre-fill every answer the evidence and `docs/GOD-Brainstorm.md` already give, ask only what they
could not answer, batch the choice questions, and record anything unanswered as an `ASSUMP-` with
its default. This settles deployment (internal office, cloud, distributed), users, data size,
recovery targets, compliance, start date, agent hours per day, reviewer count, and how many agents
this machine can run.

### 6. Synthesize

Merge the intake reports (read them from `docs/GOD-Intake/`, not from memory), the approved decisions
in `docs/GOD-Brainstorm.md`, and the interview answers. Dedupe, mark disagreements **Conflicting**,
assign IDs, and rank P0 to P3. Then:

- **Phases and work packages** as the persona specifies, with discovery packages first wherever the
  evidence is thin. Give every package a Complexity (XS / S / M / L / XL) and an Uncertainty
  (low / medium / high). Base uncertainty on the confidence of the evidence behind the package.
- **Database:** follow `references/database-options.md`, filling in all three columns and picking
  the recommended one by its rules.
- **Data model:** follow `references/data-integrity.md`, building the ERD and the `RI-` suggestions.
- **Business rules:** every rule to change, adopt, or move onto the server becomes work in the work
  package for its area, with acceptance criteria citing its `BR-` IDs
  (`references/business-rules.md` § Where approved rules go).
- **Hosting cost:** when the system being planned is web-based (or both), research the projected
  SaaS cost and write `docs/GOD-SaaS-Cost.md` (`references/database-options.md` § Projected SaaS
  cost; template in `references/document-templates.md` § 5). An installed-only system gets none.
- Run the persona's **Planning Quality Rules** as a checklist. Anything missing becomes a GAP or an
  open decision, not an omission.

### 7. Estimate, then write the management plan

1. Write `docs/GOD-Estimate-Input.json` from the work packages (format in
   `references/document-templates.md`), using the interview's start date, hours per day, and
   reviewer count, with `"teams": "sweep"`.
2. Put the machine maximum into it:

   ```bash
   node .claude/skills/wxG-O-D/scripts/machine-capacity.mjs --write=docs/GOD-Estimate-Input.json
   ```

   Add `--cap=<n>` when the T5 answer is lower than the machine maximum. This sets `maxAgents` and
   records the machine it was checked on. If the agents will run on another machine, skip this and
   set `maxAgents` by hand (interview T5). Show the user the result. The estimator never reads the
   machine itself, so the same input always gives the same numbers.
3. Run the estimator:

   ```bash
   node .claude/skills/wxG-O-D/scripts/estimate-ai-time.mjs docs/GOD-Estimate-Input.json docs/GOD-Estimate.md
   ```

   It schedules the packages for every team size from 2 to 12 AI agents (further if the machine
   maximum is higher), plus human review lanes, over the dependency graph. Then it gives two options:

   - **Option 1, the quickest team:** the size with the fewest expected working days. On a tie, the
     smaller team.
   - **Option 2, the machine maximum:** the most agents this machine can run (`maxAgents`).

   If both are the same team, it shows one. It recommends Option 1 when it fits within the machine
   maximum, otherwise Option 2. More agents is not always quicker: past a point the extra agents
   wait on the dependency chain or on review, and each one adds coordination overhead. The report's
   team-size sweep shows where that happens.

   It writes the expected and pessimistic working days, the phase milestones, the critical path,
   and what limits each team size. Do the arithmetic only through this script. Never estimate
   durations by hand. If it reports a cycle or an unknown dependency, fix the plan and re-run it.
4. Write `docs/GOD-Management-Plan.md` per `references/document-templates.md`, with the estimate
   pasted into § 10.

### 8. Write the build roadmap

Write `docs/DEVELOPMENT-PLAN.md` per `references/document-templates.md` § 2 (it carries the skeleton,
the status vocabulary, the Mermaid conventions, the phasing heuristic, and the exit-gate rule):

- **Units:** the work packages from step 6, grouped by the management plan's phases. If the project
  also has `specs/###-*/` folders, include them, each with its state from its `tasks.md` (checked
  against unchecked) and its explicit dependencies.
- WP IDs, phases, and dependency edges must match the management plan exactly. The two documents are
  one plan seen two ways.
- Front-load it: the **▶ START HERE** block (where we are, what is deployed, the single next
  action, the nearest blocker), then the status table, then the dependency map with the critical
  path, then one section per phase ending in its **Exit gate**.
- Mark every unit referenced as a dependency but not yet scoped as `unscoped`, and call it out as a
  blocker when it sits on the launch path.

The PDF is rendered in step 11. The Markdown is the source of truth; the PDF is never edited by hand.

### 9. Write the process and design flows

Write `docs/GOD-Process-Design-Flow.md` per **`references/flow-diagrams.md`**: the delivery process,
the current-state context, the target design flow, the critical-workflow sequences, the ERD, and in
conversion mode the migration and cutover flow.

### 10. Write the customer document

Write `docs/GOD-Customer-Plan.md` per `references/document-templates.md` § Customer document. It is
the final deliverable, written for a business owner and their IT lead. Copy every number and
diagram from the working documents instead of re-deriving it. The time-to-completion section gives
the estimator's two options, the quickest team and the machine maximum, and its recommendation.

### 11. Render the PDFs

G.O.D.'s renderer handles Mermaid offline:

```bash
node .claude/skills/wxG-O-D/scripts/build-devplan-pdf.mjs docs/GOD-Customer-Plan.md docs/GOD-Customer-Plan.pdf
node .claude/skills/wxG-O-D/scripts/build-devplan-pdf.mjs docs/GOD-Management-Plan.md docs/GOD-Management-Plan.pdf
node .claude/skills/wxG-O-D/scripts/build-devplan-pdf.mjs docs/DEVELOPMENT-PLAN.md docs/DEVELOPMENT-PLAN.pdf
node .claude/skills/wxG-O-D/scripts/build-devplan-pdf.mjs docs/GOD-Process-Design-Flow.md docs/GOD-Process-Design-Flow.pdf
# web-based systems only:
node .claude/skills/wxG-O-D/scripts/build-devplan-pdf.mjs docs/GOD-SaaS-Cost.md docs/GOD-SaaS-Cost.pdf
```

A diagram that fails to parse fails its render. Fix the Mermaid (see the syntax cautions in
`references/flow-diagrams.md`) and re-run. If `marked`, `puppeteer`, or `mermaid` is missing, the
script prints the `npm install` line. Report it; the Markdown is still the deliverable.

### 12. Deliver

Give a short summary in chat:

- the objective as understood, and the current-state confidence
- the two options (the quickest team and the machine maximum) with their ranges, and which one is
  recommended and why
- the recommended database and hosting, and for a web-based system the projected monthly cost of the
  ★ option at launch and after 12 months, linking `docs/GOD-SaaS-Cost.md`
- the top P0 and P1 blockers
- the open questions that would change the plan

Link the customer document first, then the working documents and their PDFs.

If `docs/GOD-Brainstorm.md` has items marked for the scope and specs, list them and offer to carry
them out now, one at a time, with the user's go before each: `/buildscope` (to amend the affected
scope or create a new one), then `/validateScope`, then `/createSpecs`. Each command follows all of its
own rules and gates (`references/review-and-brainstorm.md` § What the decisions do).

Then suggest the commands that fit next: `/buildscope` to turn work packages into scopes, `/createSpecs` to finalize
the draft conversion scopes, `/wxConversionParity` after a rebuild, and `/wxDBAnalyze` once the data
is in a live PostgreSQL database (it counts the orphans this static review can only predict). Once
the build is done, the rest of the cycle is the sequence in `references/new-project.md` § N8c:
`/wxUIUXCodeReview`, a smoke test (`/wxCreateTestPlan --Execute` to Gate 1) with the full test scheduled overnight (`/preTest --nightly`), each scope advancing its own stage as its tasks
and tests clear, user acceptance testing, and `/wxHelpGenerate`.

## Roadmap only (`--roadmap`)

Used by the `/dev-plan` alias, and whenever the user wants just the roadmap.

1. If the user came in through the alias, the alias has already printed its one-line notice that
   `/dev-plan` is retired and `/wxG-O-D` owns the roadmap. Do not repeat it.
2. Read `docs/DEVELOPMENT-PLAN.md` if it exists, else `specs/DEVELOPMENT-PLAN.md` from an earlier
   `/dev-plan` run, as the previous version: keep its manual status edits and say what changed. The
   roadmap now lives in `docs/`; say so once when the old file was in `specs/`.
3. Gather the units: every `specs/###-*/` folder (its `spec.md` for what it is and what it depends
   on, its `tasks.md` for a rough percentage), plus the work packages and scope map from an earlier
   G.O.D. run when `docs/GOD-Management-Plan.md` or `docs/GOD-Scope-Map.md` exists. For a large spec
   set, use read-only helpers (at most 5 at once) and keep only their tables.
4. Write `docs/DEVELOPMENT-PLAN.md` as step 8 describes, render it as step 11 describes, and give the
   short read: the current phase, the single next action, the nearest blocker, and the links.

It writes nothing else: no scope, spec, management plan, or state file.

## Rules

- **Read-only over the evidence.** G.O.D. itself writes to `docs/` only, plus the user's learnings
  file in their user folder, which holds general patterns and never project details. In new-project
  mode the pipeline commands it runs write their own outputs (scopes, specs, tasks, test plans, code)
  under their own rules. Under `--create`, G.O.D. also writes the repairs and makes the local commits
  the `--create` rule below allows.
- **Only inventoried files are evidence.** Gitignored files, wxKanban kit files, and build or
  dependency folders are never read, and `secret`-bucket files are never opened. If something
  important seems to be missing, say so and suggest naming it with `--dir`. Don't go around the
  inventory.
- **Plans, never implements, in plan mode.** No code, no spec or scope edits, no database
  connections, no orchestrator runs. The one exception: after delivery, review items the user marked
  for the scope and specs, carried out only by running `/buildscope`, `/validateScope`, and
  `/createSpecs` under all of their own rules, one item at a time with the user's go.
- **"Question" first means a side question.** When a user message starts with "question" (any case),
  answer it only. It isn't a decision or a new item, changes nothing, and may or may not be part of
  the project. Then return to where the run was. It becomes part of the project only if the user
  then says to add it to the project information.
- **Brainstorming is run by wxBrainstorm and writes nothing until a summary is approved.** It is a
  text-only discussion at the user's pace and level (`references/review-and-brainstorm.md`
  § Brainstorming: run by wxBrainstorm). G.O.D. never runs a brainstorm of its own.
  - Plain-text questions, never choice menus.
  - One item at a time, finished before a new one is taken up.
  - The list of points shown again before every "which next?".
  - No file, document, or command touched until the user approves the section summary
    (`references/review-and-brainstorm.md`).
  - The one exception is the scratch pad (`docs/GOD-Scratchpad.md`), a display that only mirrors
    the chat.
- **In new-project mode without `--create`, orchestrates and never substitutes.** Only after the
  user approves the plan, and only by running `/buildscope`, `/validateScope`, `/createSpecs`, and
  `/implement` (which runs `/wxCreateTestPlan`), each following **all** of its own rules: compliance
  check, reuse check, interview, every approval gate, outputs, numbering, prohibitions. G.O.D. never
  writes a scope, spec, task, test plan, or code itself, except the user-approved repairs the
  known-gaps table in `references/new-project.md` names; never answers a gate for the user; never
  adds `--quick`; never runs git. A known kit gap is surfaced to the user, never worked around
  (`references/new-project.md`, last table).
- **Once `--create` starts, completes the process.** The user's approval of the design at the one
  review pause (`planApprovedAt`) authorizes G.O.D. to run any command the development process needs,
  through to every scope in Release (`references/new-project.md` § N11):
  - **It answers the gates itself.** Every command still runs under all of its own rules, and where
    one asks the user (an interview, a reuse choice, a section approval, a coverage or filing
    confirmation, a fix confirmation), G.O.D. answers from the approved design: the design summary,
    the scope drafts, the business rules, the plan, and the recorded decisions. It logs each answer
    with its source in `docs/GOD-State.json` (`gateLog`). It answers an interview in full rather
    than skipping it with `--quick`, which leaves placeholder requirements.
  - **Questions are queued, never asked mid-run.** A decision the approved design does not cover
    goes to the decision queue (`references/new-project.md` § N11). If it is low-risk, G.O.D.
    takes its recommended answer, logs the assumption with its cost to undo, and goes on. If it is
    high-risk, the question is parked, and only its unit and the units that depend on that unit
    wait. High-risk covers possible data loss, the shape of a shared table, money, security, auth,
    legal or compliance, production, a contradiction with an approved decision, or anything costly
    to reverse. A high-risk question is never assumed. Every item is in `docs/GOD-Decisions.md`.
    The user answers all of them at once when the sitting ends.
  - **Commands first, itself when blocked.** It uses the real commands, so numbering, database
    records, cross-references, fences, and audit paths stay right. When a command fails or a known
    kit gap blocks it, G.O.D. writes or repairs the artifact itself the way the command would, logs
    it in the state file (`repairs`) and the management plan's Revision History, files the defect with
    `project.submit_feedback` (a stable title naming the command and the failure, no run-specific
    values), and keeps going. A Change Impact denial is never a failure to repair. It is parked,
    and no repair may make an edit that a denial blocked.
  - **Commits, never pushes.** It commits each finished unit and each passed phase exit gate
    locally. Starting `--create` is the user delegating commit timing (the "delegates git timing"
    case in `_wxAI/rules/git.md`); it covers commits only. A commit never includes changes that were
    in the tree before the run started (`preexistingChanges` in the state file).
  - **Production stays with the user.** It never pushes, never deploys, and never points a command at
    a production database, host, or account.
  - **Testers sign off human tests.** A tester's sign-off is an attestation, not a command gate;
    G.O.D. never makes one.
  - **Stages advance themselves.** Each scope moves on as its tasks and tests clear (SPEC-123). G.O.D.
    reads `project.scope_stage` and works each blocker it reports; it never moves a stage by hand.
  - The user can say stop at any time: G.O.D. saves the state file, writes the run report, ends
    unattended mode (`unattended.mjs stop`), and stops (`references/new-project.md` § N11 item 4).
- **At most 5 helpers at once.** Any read-only helpers G.O.D. launches (the Explore agents in step 4,
  the business-rule slices, the roadmap's spec reading, the read-only checks in new-project mode) run
  at most 5 at a time, and never more than the user's cap (`--cap`, T5). The machine maximum from
  `scripts/machine-capacity.mjs` does not limit them. It allows for the builds, tests, browsers,
  Docker, and dev servers an implementing agent runs on this machine. A read-only helper only reads
  files and returns its findings, so it adds almost no load here. The machine maximum limits the
  implementing agents (next rule).
- **The plan governs concurrency.** Units implement in parallel only as
  `references/new-project.md` § N8b allows: independent units only, never more at once than the
  machine maximum or the user's cap (`--cap`, interview T5), and a unit never starts before every
  unit it depends on is implemented. The schedule uses the same dependency graph as the estimate.
  `--cap=1` makes it serial.
- **Stop and report a defect.** When a G.O.D. script fails, or this method contradicts itself or a
  reference document, stop at that step. Do not improvise around it, and do not continue with a
  guess. State exactly what failed: the step, the command or the two conflicting passages, and the
  output. Record the stop point in `docs/GOD-State.json` (`"stoppedAt"`: the step, unit, and gate,
  plus a one-line `"defect"`) so the run resumes there after the fix. Then ask the developer to report
  it through the Cockpit feedback (it lands in the wxKanban Dev project), with that text. A plan
  problem the method already handles, such as a dependency cycle the estimator reports, is not a
  defect: fix the plan as the step says. Under `--create`, a failing pipeline command or a known kit
  gap is not a stop: it is repaired, logged, and reported as the `--create` rule says, and the run
  continues. **After approval under `--create`, G.O.D.'s own failures stop the run only when going
  on is unsafe:** the state file cannot be written or read back, or the inventory or the estimate
  is corrupt. Any other script failure, such as a PDF render, is logged in `repairs`, reported, and
  the run continues. A contradiction in the method is reported and parked as high-risk, so only the
  units it touches wait (`references/new-project.md` § N11). Before approval, this rule applies as
  written.
- **Never pushes.** G.O.D. never runs `git push`, in the editor or under the bridge. Under the
  Project Agent a push request goes to KAIN's gate and needs the developer's recorded grant;
  a push without one is refused and reported, never retried (`references/new-project.md` § N12).
- **Checkpoint before the context runs out.** Long runs save `docs/GOD-State.json` and ask the user
  to `/clear` (or `/compact`) and `--resume`.
  - In plan mode, checkpoint after the intake is saved and after each approved section summary
    (`references/review-and-brainstorm.md` § Checkpoints).
  - In new-project mode, checkpoint at the points `references/new-project.md` § N9 names.
  - G.O.D. can't clear the conversation itself. It saves everything, then tells the user exactly
    what to type.
  - **Under `--create`, a checkpoint saves and the run keeps going.** It never asks for `/clear`
    mid-sitting. The client compacts its own context, and after any compaction G.O.D. re-reads the
    state file before the next action. `/clear` and `--resume` are offered only once the run is set
    up and before its first unit (§ N11 item 1, Amendment C: the build starts in a fresh
    conversation unless the user replies go), and when the sitting ends (§ N9, § N11).
- **No secrets in any document.** These documents go to a customer. Cite credentials, tokens, keys,
  connection-string values, and personal data by location only. Leave conversion `[[CRED-nn]]` tokens
  as tokens. If a literal looks like a credential, or a nearby comment names a credential field, treat
  it as one. Never echo a value in chat either, not even masked.
- **Evidence or a label.** Every claim carries a file citation or a confidence label. Never invent a
  business rule, contract, relationship, or dependency. A best-practice rule is a labeled proposal,
  "Best practice (proposed)", never presented as something the system does.
- **Nothing dropped silently.** An artifact that was not read, an element the conversion discarded, or
  a scope with no work package each appears somewhere with a status.
- **Recorded decisions stand.** A scope's KEEP / MODERNIZE / DROP decision is Confirmed evidence
  (Preserve / Modernize / Retire). Reopen one only when other evidence contradicts it, and then as a GAP.
- **Ask only questions whose answer changes something**: scope, architecture, priority, risk,
  sequencing, acceptance, the estimate, or the database choice.

## Resources

- `references/god-persona.md`: the G.O.D. method (read in full before step 4).
- `references/new-project.md`: new-project mode, from overview review to implemented project, with checkpoints and the state file; the `--create` readiness check (N6c), execution (N11) with its decision queue, sittings, and run report, parallel implementation and pipeline helpers (N8b), and the Remote Session Bridge (N12).
- `references/review-and-brainstorm.md`: going over the findings with the user (the opening questions for both modes, with build vs buy or competitors for internal builds, five sections, changes or brainstorm), the hand-off of every brainstorm to the wxBrainstorm skill, and the plan-mode resume.
- `references/document-templates.md`: the customer document, management plan, development plan (the build roadmap), projected SaaS cost, the `--create` decision queue and run report, explorer brief, and estimate input.
- `references/interview.md`: the post-scan questions and their defaults.
- `references/database-options.md`: the three-model comparison and how to pick one, and the projected SaaS cost research for a web-based system.
- `references/data-integrity.md`: the ERD and the referential-integrity suggestions.
- `references/business-rules.md`: pulling every business rule out of the code (never sampled), the best-practice rules proposed beside them, the `BR-` register, and how they are discussed and carried into the plan.
- `references/flow-diagrams.md`: which diagrams to draw, skeletons, and Mermaid syntax cautions.
- `scripts/inventory.mjs`: decides which files are evidence (step 3). Honors `.gitignore` and skips kit files. Plain Node; uses git when present.
- `scripts/machine-capacity.mjs`: how many AI agents this machine can run at once, from its CPU threads and memory (steps 1 and 7). Writes `maxAgents` into the estimate input. Plain Node, no dependencies.
- `scripts/estimate-ai-time.mjs`: the deterministic schedule for every team size, and the two options: the quickest team and the machine maximum (step 7). Plain Node, no dependencies.
- `scripts/build-devplan-pdf.mjs`: renders every G.O.D. Markdown document, Mermaid included, to PDF offline (step 11). Resolves `marked`, `puppeteer`, and `mermaid` from the project and prints the install line when one is missing.
