# Spec 136: wxG-O-D Development Process Manager

**Spec Number**: 136
**Status**: `planned`
**Created**: 2026-10-03
**Source**: `specs/Project-Scope/136-wxgod-development-manager.md` (SCOPE-136, hand-authored, approved 2026-10-03)
**Depends On**: SCOPE-081 (dev-plan judgment half folds in), SCOPE-102 (Remote Session Bridge), SCOPE-132 (KAIN), SPEC-030 (FR-004 amended by FR-017), SCOPE-043 (feedback channel), SCOPE-019 (kit, hosted prompts, release path), SCOPE-047 (Stack & Style), SCOPE-114 (design-system catalog), the wxDesigner skill
**Related, unchanged**: SCOPE-123 (per-scope stage progression), SCOPE-019 R6a (the kit never calls AI), SCOPE-093 (read-on-demand)
**Amendment A (2026-10-19)**: a seamless `--create` run. Questions the approved design does not cover are queued for the end of the sitting instead of stopping the run (FR-037 to FR-043; amends FR-014, FR-015, FR-016, FR-018, FR-020, FR-022, FR-024, FR-029). Source: `docs/brainstorms/2026-10-19-wxgod-seamless-create.md`

## Overview

wxG-O-D, the Guru of Development, is the kit command that manages a project's development process
from first evidence to implemented build. In plan mode it turns a customer's folders, documents,
database scripts, and conversion output into a signed-off development plan: every finding traced to
a file and labeled by confidence, a deterministic time-to-completion for every team size, a database
and hosting recommendation, an ERD with integrity suggestions, and the build roadmap, each as
Markdown and PDF. In new-project mode it expands a ProjectOverview.md into a reviewed design and then
drives buildscope, validateScope, createSpecs, and implement scope by scope, under each command's
own gates, with checkpoints a cleared context can resume from; with `--create` it executes that plan
phase by phase to a built application. When the project's Remote Session Bridge is configured, the
run continues unattended with KAIN relaying each gate to the developer's phone. The method itself is
served by the hosted MCP under the key `wxgod`, with its reference documents fetched on demand, so
the kit ships only a stub, the scripts, and the command, and a method fix reaches every subscriber on
their next run.

| Element | Value |
|---------|-------|
| **Modes** | Plan mode: assess and plan, build nothing. New-project mode: design, review, then drive the pipeline on the user's go. `--create`: design, one review pause, then execute the development plan to a built app |
| **Driver model** | G.O.D. drives; KAIN monitors and relays questions and action requests to the developer, and carries the answer back. KAIN never answers for the developer and never takes the plan over |
| **Delivery** | `project.get_command_prompt` key `wxgod` plus path keys `wxgod/references/<name>`; stub skill, three scripts, and byte-identical thin command in the kit |

## Business Problem

A wxperts consultant lands on a customer engagement with a pile of evidence: legacy source, a
conversion output, documents, screenshots, database scripts, or just a ProjectOverview.md for a
brand-new idea. Turning that into a plan the customer will sign is manual and uneven. Estimates are
gut feel, the database and hosting choice is argued by opinion, nothing traces back to a file, and
the customer gets a different-shaped document every time.

For a new project the gap is worse. The consultant hand-drives buildscope, validateScope,
createSpecs, and implement one scope at a time with no checkpoint, so a long build runs out of
context and loses its place. The kit's own rule that only one spec may be active at a time then
serializes the whole build regardless of how many agents the machine could run. Measured
2026-10-03: this project has **68** specs in `planned`, `tasks_generated`, or `implementing`, so
`resolveSpecVerification` (which requires exactly one) already returns "missing spec" for every
MCP-path implement here.

The method was about to ship as a 150 KB skill inside every kit download. A subscriber whose
subscription lapsed would keep a working copy on disk, and every fix to the method would need every
consumer to update their kit. Serving it from the hosted MCP, the way buildscope and createSpecs
already are, removes both problems.

## Actors

- Primary: the subscribed kit user running `/wxG-O-D` in their own project, a wxperts consultant or a customer's developer alike; the command behaves the same for both.
- Secondary: the customer or business owner who receives and signs the customer plan; KAIN, which monitors an unattended run and relays every question and action request to the developer's phone; the wxperts admin who edits the method in `mcp-server/src/prompts/` and redeploys the hosted MCP.

## Success Metrics

1. SC-1: A kit release asset contains 0 lines of the G.O.D. method: the stub, 4 scripts (3 plus the renderer FR-010 moves in), and the command only, verified by diffing the published archive.
2. SC-2: A method fix edited in the MCP prompt tree reaches a subscriber's next run within 1 deploy and 0 kit updates.
3. SC-3: In a plan-mode run on a real conversion repo, 100% of findings carry a citation or a confidence label, and 0 secret values appear in the documents or the chat, checked by the redaction scan.
4. SC-4: The estimate is reproducible: the same `GOD-Estimate-Input.json` yields a byte-identical `GOD-Estimate.md` on 2 consecutive runs.
5. SC-5: A `--create` run on a test overview reaches the last phase exit gate after the one design review pause, with 100% of scopes, specs, and tasks authored by their own command or listed in the run's `repairs` log, 100% of gate answers in `gateLog`, 0 pushes, and the development plan's unit statuses match the pipeline's records at the end, with 0 hand-written artifacts.
6. SC-6: With 2 independent units in one phase, both reach `implementing` at the same time and neither is refused by the kit, while 2 dependent units never overlap.
7. SC-7: A `--resume` after a cleared context continues at the recorded unit and gate in 100% of trials, with 0 repeated or skipped units.
8. SC-8: Under the bridge, 100% of the questions G.O.D. asks reach the phone and the run continues after the answer, and a push without a grant is refused in 100% of attempts.
9. SC-9 (Amendment A): After approval, a `--create` sitting asks the user 0 questions until it ends. 100% of the questions the design does not cover are in `docs/GOD-Decisions.md` and `decisionQueue`. Every high-risk item is parked, never assumed. A parked item holds only its own unit and the units that depend on it.

## Scope Boundary

In scope:

- The G.O.D. method served by the hosted MCP under `wxgod`, with nine reference documents served under path keys and fetched only when a step needs them.
- The kit shipping a stub skill, the three deterministic scripts, and the thin command, and nothing else of the method.
- Plan mode: inventory, parallel intake, section-by-section review at the user's level, interview, deterministic estimate for every team size (quickest team and machine maximum), database and hosting recommendation, ERD with referential-integrity suggestions, and the four documents as Markdown and PDF.
- The build roadmap (START HERE orientation, phase exit gates, PDF renderer) folded in from the dev-plan skill; the `/dev-plan` alias for one release.
- New-project mode: overview review, optional brainstorm, design, review pause, then driving buildscope, validateScope, createSpecs, and implement with checkpoints and `--resume`.
- `--create`: executing the development plan phase by phase, unit by unit, to a built application.
- Lifting the kit's one-active-spec rule so the plan governs which units implement concurrently.
- Running under the Remote Session Bridge with KAIN as monitor and relay when the bridge is configured.
- The registry builder serving sub-documents by path, reusable by every future hosted skill.
- Defects in a run reported through the Cockpit feedback to the wxKanban Dev project.
- At the end of the brainstorm: one style type chosen for all screens from the named visual-style catalog or a company design system, recorded in `stack.md`; and, for every screen-bearing scope, the choice to design the screen with wxDesigner or let `/implement` build it. The design itself runs per scope after its `/createSpecs` and before its `/implement`.

## Out of Scope

- G.O.D. writing scopes, specs, tasks, test plans, or code itself. It only runs the real commands.
- Changes to how buildscope, validateScope, createSpecs, or implement interview, gate, or write. Their rules are inherited, not edited.
- Serving the scripts from the MCP. They stay on disk in the kit.
- A web-app or Cockpit surface for the plan documents. They are files in `docs/`.
- Moving the project from Design to Implementation. The user does that in the web app; G.O.D. waits.
- Per-scope stage progression (SCOPE-123) and the SCOPE-081 server-side `devplan` document.
- A new approval model. KAIN's ask-to-verify gate and recorded grants (SCOPE-132) are used as they are.

## Open Questions

None open. The one question the scope deferred to createSpecs is decided here:

- **`/dev-plan` alias deprecation notice** (decided 2026-10-03 at createSpecs): the alias prints one
  deprecation line in chat every time it runs, naming `/wxG-O-D` as the replacement, and the help
  catalog and the Cockpit command list mark it deprecated. No Cockpit first-use event is added; the
  alias lives one release, so tracking first use buys nothing.

## Functional Requirements

### Hosted delivery

**FR-001 — Method served by the MCP.** `project.get_command_prompt` with key `wxgod` returns the
full method; the kit holds no copy.
- The stub `SKILL.md` and the thin command contain no step of the method.
- A lapsed subscriber receives the entitlement refusal and nothing else.
- An unreachable MCP fails with the standard "MCP not connected" guidance, never a stall.

**FR-002 — References by path key.** Each reference document is served under
`wxgod/references/<name>` and fetched only when its step is reached.
- The registry lists the nine keys: `god-persona`, `new-project`, `review-and-brainstorm`,
  `document-templates`, `interview`, `database-options`, `data-integrity`, `flow-diagrams`, and
  `business-rules` (added by FR-027).
- A plan-mode run never fetches `new-project`.
- A flat key such as `god-persona` resolves to nothing.

**FR-003 — Registry builder walks subfolders.** `mcp-server/scripts/build-prompts.mjs` keys every
`.md` under `src/prompts/` by its path, forward slashes, no extension.
- The registry test covers a nested key.
- The hosted build regenerates the registry on deploy (`prebuild`).

**FR-004 — Kit ships stub, scripts, and command.** `.claude/skills/wxG-O-D/` holds the stub and
`scripts/` (`inventory.mjs`, `machine-capacity.mjs`, `estimate-ai-time.mjs`); `_wxAI/commands` and
`.claude/commands` hold the byte-identical thin command.
- The sync allowlist ships exactly those files.
- A diff of the published release asset shows no `references/` folder and no method text.

### Plan mode

**FR-005 — Inventory decides the evidence.** `inventory.mjs` honors `.gitignore`, skips kit files
and build output, lists secret files by path only, and validates `--dir`.
- A missing `--dir` folder stops the run.
- `docs/GOD-Inventory.json` records every exclusion and why.

**FR-006 — Cited, labeled findings.** Every finding carries a file citation or one of Confirmed,
Likely, Assumed, Unknown, Conflicting, Deprecated; intake reports are saved verbatim under
`docs/GOD-Intake/`.
- A finding with neither is a defect.
- A cleared context loses no report.

**FR-007 — Review at the user's level, plain text.** The four finding sections are reviewed one at
a time at amateur, junior, or senior level, with no choice menus, and nothing is written until the
user approves a section summary.
- `docs/GOD-Scratchpad.md` mirrors the chat and nothing else.
- An approved summary records whether it goes to the plan only or to plan, scope, and specs.

**FR-008 — Deterministic estimate.** `machine-capacity.mjs` sets the machine maximum;
`estimate-ai-time.mjs` schedules every team size and reports the quickest team and the machine
maximum with a recommendation.
- The same input gives the same numbers; no duration is estimated by hand.
- A cycle or unknown dependency in the graph fails the run.
- `--cap=<n>` is the user's limit; `--cap=1` is the serial switch (see FR-018).

**FR-009 — Database, ERD, and documents.** The plan recommends one of internal office, cloud, or
distributed hosting with the database to match, draws the ERD with referential-integrity
suggestions, and writes the customer plan, management plan, roadmap, and flows as Markdown and PDF.
- All three hosting columns are filled before one is recommended.
- A Mermaid parse failure fails its render.
- No credential value or personal datum appears in a document or in chat.

### Roadmap fold-in

**FR-010 — G.O.D. owns the roadmap.** The judgment half of SCOPE-081 — the START HERE orientation,
per-phase exit gates, and the PDF renderer — moves under G.O.D.'s scripts and method.
- `/wxG-O-D` produces `docs/DEVELOPMENT-PLAN.md` and its PDF with no separate skill installed.
- SCOPE-081's server-side `devplan` document is unchanged.
- The renderer ships as a fourth script, `.claude/skills/wxG-O-D/scripts/build-devplan-pdf.mjs`
  (amends FR-004's file list); the template becomes § 2 of the `document-templates` reference, so
  the reference keys stay the FR-002 names.
- `/wxG-O-D --roadmap` writes only the roadmap; the `/dev-plan` alias runs it.

**FR-011 — dev-plan retired from the kit.** The kit stops shipping dev-plan as its own skill;
`/dev-plan` becomes a thin alias that runs G.O.D.'s roadmap step for one release, then is removed.
- The help catalog and the Cockpit list the alias as deprecated with the replacement named.
- The alias prints one deprecation line in chat each time it runs (Open Questions decision).

### New-project mode and `--create`

**FR-012 — Overview review and brainstorm.** Given a ProjectOverview.md, G.O.D. reviews it, asks
whether the project is new, and offers to brainstorm first; `--brainstorm` skips the offer.
- Every brainstorm decision is in `docs/GOD-Brainstorm.md` with its date.
- Nothing is written during a brainstorm except the scratch pad.

**FR-013 — Design and scope map.** G.O.D. expands the overview into roles, data model and ERD,
screens, integrations, architecture, database, a scope map in build order, and one scope draft per
scope.
- Each feature is marked as stated by the user or proposed by G.O.D.
- `docs/GOD-Design-Summary.md` carries the numbered discussion list.

**FR-014 — `--create` executes the development plan.** After one design review pause, G.O.D. runs
the plan phase by phase and unit by unit in dependency order: buildscope, validateScope,
createSpecs, implement with its test plan, then the phase exit gate.
- No unit starts before its dependencies' gates pass.
- Each unit's status in the plan flips as the pipeline completes it; the plan is the progress record.
- The run ends at the last phase's exit gate.
- Without `--create`, an overview keeps today's behavior: G.O.D. asks whether the project is new and
  drives the pipeline only after the user says go.
- *Amended 2026-10-19 (Amendment A):* a phase exit gate that cannot be cleared no longer holds the
  whole next phase. Next-phase units that do not depend on the units behind it may start (FR-040).
  A run is worked in sittings: a sitting ends when no unit is ready and no helper is running, with
  the run report and the decision review (FR-042). The run is complete when the last phase's exit
  gate has passed and N8c has carried every scope as far as it can go.

**FR-015 — Orchestrates; under `--create`, completes the process (amended 2026-10-04).** In plan
mode and in new-project mode without `--create`, G.O.D. writes no scope, spec, task, test plan, or
code; it runs the real commands under all of their rules and gates, never answers a gate, never adds
`--quick`, and never pushes. Once `--create` starts, that is, once the user approves the design at
its one review pause, G.O.D. may run any command needed to complete the development process, and:
- It answers every command's gates itself (interviews, reuse checks, section approvals, coverage and
  filing confirmations, fix confirmations) from the approved design, and logs each answer with its
  source in `GOD-State.json` (`gateLog`). A decision the approved design does not cover is asked,
  never guessed.
- It uses the real commands first, so numbering, database records, cross-references, fences, and
  audit paths stay right. When a command fails or a known kit gap blocks it, G.O.D. writes or
  repairs the artifact itself the way the command would, logs it in `GOD-State.json` (`repairs`) and
  the management plan's Revision History, files the defect with `project.submit_feedback`, and keeps
  going.
- It commits each finished unit and each passed phase exit gate locally. Starting `--create` is the
  user delegating commit timing; it covers commits only, and never includes changes that were in the
  tree before the run started.
- It never pushes, never deploys, and never touches a production database, host, or account. Those
  stay with the user; under the bridge a push still needs KAIN's recorded grant (FR-021).
- It never signs off a human test. A tester's sign-off is an attestation, not a command gate.
- It does not move stages by hand. Each scope advances on its own as its tasks and tests clear
  (SPEC-123); G.O.D. reads `project.scope_stage` and works each blocker.
- Every artifact in `specs/` and `src/` was authored by its own command, or is listed in `repairs`.
- *Amended 2026-10-19 (Amendment A):* "a decision the approved design does not cover is asked,
  never guessed" now means it goes to the decision queue (FR-037). A low-risk decision is taken as a
  logged assumption. A high-risk decision is parked until the user answers it. Nothing high-risk is
  ever assumed. The user still sees and answers every item at the end of the sitting (FR-042).

**FR-016 — Checkpoint and resume.** Long runs save `docs/GOD-State.json` at each unit and gate and
ask the user to clear the context and run `--resume`.
- Resume continues at the exact unit and gate.
- No unit is repeated or skipped.
- *Amended 2026-10-19 (Amendment A):* under `--create`, a checkpoint saves and the run keeps going
  (FR-038). `/clear` is offered only at the end of a sitting. Resume reads `decisionQueue` as well as
  `stoppedAt`. It first shows the answered and unanswered items, applies the answers, and then
  continues from `nextAction`.

### Parallel implementation

**FR-017 — Implement verifies the named spec.** The kit's spec verification
(`wxkanban-agent/core/policy/resolve-spec-verification.ts`) checks the spec being implemented, by
number, instead of requiring exactly one spec in `planned`, `tasks_generated`, or `implementing`
across the project.
- Two specs in `implementing` do not block either.
- A spec with no tasks or no documents still blocks.
- SPEC-030 FR-004 is amended to say so; its unit test changes with it.

**FR-018 — The plan governs concurrency.** G.O.D. runs independent units in parallel up to the
machine maximum and the user's cap, and holds dependent units until their predecessors' gates pass.
- Two units that share a dependency edge never implement at the same time.
- The estimate's team-size sweep and the actual run use the same dependency graph.
- `--cap=1` forces serial implementation; no new flag.
- Read-only helpers (step 4 intake, business-rule slices, new-project verification tables, roadmap
  gathering) are not implementation units. They run at most 5 at once and never more than the
  user's cap (`--cap`, T5). The machine maximum does not limit them: it models the local build,
  test, browser, and Docker load, which they never create. *(Amended 2026-10-10, feedback
  053e872b.)*
- *Amended 2026-10-19 (Amendment A):* a unit whose question is parked has the implement status
  `parked`. Its helper is ended and its slot goes to the next ready unit. When the item is answered,
  the unit is run again from the step it was parked at. For `/implement`, that run picks up the
  unit's own remaining tasks. Under `--create`, the pipeline commands also run in helpers (FR-039).

### Bridge and KAIN

**FR-019 — Runs under the bridge when configured.** When the repo `.env` carries the SCOPE-102 room
settings and the launcher exists, G.O.D. offers to run unattended under the Remote Session Bridge;
otherwise it runs in the editor with checkpoints.
- The offer is made once per run; declining changes nothing.

**FR-020 — G.O.D. drives, KAIN relays.** KAIN monitors the run and relays every question and every
request for an extra action to the developer's phone, carrying the answer back; it never answers for
them and never takes the plan over.
- `STATUS` reports the plan position (phase, unit, gate).
- One driver per working tree, per SCOPE-132 FR-026.
- *Amended 2026-10-19 (Amendment A):* under the bridge, the questions G.O.D. asks before approval
  (N2's new-project question and the N6 choices) are asked in numbered plain text, because the phone
  shows no menus. In the editor the menus stay. Under `--create`, the decision review at the end of
  the sitting (FR-042) is posted to the room as one numbered list.

**FR-021 — Inherited bridge rules.** Minimal seed, `CANCEL REMOTE` as kill switch, and no push
without a recorded grant through KAIN's gate apply unchanged.
- A push attempt without a grant is refused and reported, never retried silently.

### Defects

**FR-022 — Stop and report.** On a script failure or a contradiction in the method, G.O.D. stops at
that step, states what failed, and asks the developer to report it through the Cockpit feedback,
which lands in the wxKanban Dev project (SCOPE-043).
- No improvised workaround.
- The state file records the stop point so the run resumes after the fix.
- Under `--create` (amended 2026-10-04), a failing pipeline command or a known kit gap is not a stop:
  G.O.D. repairs, logs, and reports it as FR-015 says, and the run continues. A failure of G.O.D.'s
  own scripts, or a contradiction in this method, still stops the run.
- *Amended 2026-10-19 (Amendment A):* after approval under `--create`, a failure of G.O.D.'s own
  scripts stops the run only when continuing is unsafe: the state file cannot be written or read
  back, or the inventory or the estimate is corrupt. Any other failure, such as a PDF render, is
  logged in `repairs`, reported, and the run continues. A contradiction in the method found after
  approval is a question the design does not cover. It is reported and parked as high-risk
  (FR-037), so only the units it touches wait. Before approval, the stop rule stands as written.

### Style and screens (end of the brainstorm, before the build)

**FR-023 — One style type for all screens, chosen before any is designed.** At the end of the
brainstorm, before the plan is approved for building, G.O.D. offers a choice of style type for the
whole application from the catalog of named visual styles the design skill ships (bento, brutalism,
glassmorphism, neumorphism, material, shadcn, editorial, and the rest), or a design system the
company has already picked (SCOPE-114). The choice is recorded in the project's Stack & Style
document (`stack.md` Look & Feel, SCOPE-047) so every screen, designed or built, follows it.
- The choice is asked once per run, before the first screen is designed or built.
- Declining keeps the current `stack.md` look and feel; nothing else changes.
- wxDesigner designs within the chosen style's tokens; `/implement` builds within them.

**FR-024 — Design or build, per screen-bearing scope: choose at the brainstorm, design after
createSpecs.** For every scope in the plan that creates a page or screen, G.O.D. asks at the end of
the brainstorm whether the screen will be **designed** with the **wxDesigner** skill or **left to
build**. The design itself runs after `/createSpecs` for that scope and before its `/implement`,
because wxDesigner reads the real scope and its implementing specs and writes
`specs/<NNN-name>/page.md` into the spec folder. The user previews in the browser, iterates, and
SAVEs or DISCARDs. "Let it build" means `/implement` derives the screen from the spec and the chosen
style.
- Every screen-bearing scope gets the choice; a scope with no screen is not asked.
- wxDesigner never runs before the scope's specs exist; it runs once per designed scope, between
  createSpecs and implement.
- In a conversion, the screen evidence already exists (`pre-convert/*.controls.md`,
  `rebuild/pages/*.tsx`); G.O.D. notes those paths against the scope and wxDesigner starts from them.
  It is still run per scope, after that scope's specs are created.
- A saved `page.md` is what `/implement` builds from; a DISCARD or "let it build" leaves the screen to
  `/implement`.
- The per-scope choice, the design outcome, and the saved `page.md` path are recorded in the scope
  map and the state file, so `--resume` does not ask again.
- wxDesigner runs under all of its own rules: scope and spec as input, the project's theme tokens
  only, and never a write into `src/`.
- *Amended 2026-10-19 (Amendment A):* under `--create`, nobody is at the browser. G.O.D. drafts and
  SAVEs the design, then parks only that scope's screen tasks for the end-of-sitting review
  (FR-043).

### Commercial, delivery, and projected cost (start of the brainstorm or review, both modes)

**FR-025 — Commercial and delivery questions open the conversation, in both modes.** Two
plain-text questions come first: will the application be commercial (sold or licensed to others) or
for the user's own organization, and will it be web-based or installed (or both). In new-project
mode they open the idea brainstorm; in plan mode they open the review, before section 1, pre-filled
from the evidence and asked about the system being planned. One shared definition serves both modes
(`review-and-brainstorm.md` § Commercial and delivery). When they were not settled there, the
interview asks them (NP7 and NP5 in new-project mode, PD1 and PD2 in plan mode).
- Both answers are asked for a commercial app as well as an internal one.
- A commercial answer adds the commercial items: customer sign-up, each customer's data kept
  separate, subscriptions or licenses with billing, plans and limits, and update delivery. A
  commercial system is also sized for its customer forecast (NP8 / PD3).
- An installed answer adds packaging, signing, and update delivery, and gets no cost projection.
- New-project mode turns the items into Proposed features. Plan mode checks each against the
  evidence: present ones are cited in section 1, missing ones are suggestions in section 2. A
  delivery different from today's is a decision with an ADR.
- The answers are recorded in `docs/GOD-Brainstorm.md` and the state file; a resume never asks again.

**FR-026 — Projected SaaS cost for a web-based system.** For a web-based system (or both), in either
mode, G.O.D. researches current list prices at run time and writes `docs/GOD-SaaS-Cost.md` and its PDF: the five
lowest-cost qualifying options, each a single provider or a mix of providers, plus AWS as the
reference option, sized at launch and at 12 months, with one ★ Recommended.
- Every price carries its source page and the date checked; none comes from memory. Without web
  access the prices are marked not researched, never guessed.
- It is a separate document: the customer document and the database comparison keep cost tiers.
- A commercial app's projection adds the cost per paying customer at each point.
- An existing hosted system shows today's monthly bill beside the options when the user gives it or
  the evidence shows it; it is never guessed.

### Business rules (every mode)

**FR-027 — Every business rule is pulled out of existing code.** In plan mode, for any project with
code, converted or not, G.O.D. reads every code, database, and conversion file in full (never
sampled), extracts each business rule in plain, testable words, and writes the register
`docs/GOD-Business-Rules.md` with stable `BR-` IDs, citations, where each rule is enforced today,
and a confidence label. The rules are discussed in review section 2, Business rules, area by area.
- A coverage table accounts for every inventoried code, database, and conversion file; an unread
  file is a GAP, and the extraction is never called complete until coverage is 100%.
- One rule enforced in several places is one entry; disagreeing implementations are Conflicting;
  a rule enforced only in the screen is flagged for server enforcement.
- A large system spans checkpoints; the state file records the slices done, and resume continues
  with the next one.
- Decisions first in each area (Conflicting, screen only, falls short of best practice, best
  practice proposed); the ordinary rules are offered for approval as one group.
- Rules to change or adopt become work, with acceptance criteria citing their `BR-` IDs.

**FR-028 — Best-practice business rules are proposed in every mode.** G.O.D. proposes the rules a
well-run business of this kind usually has but the code or overview lacks, each labeled "Best
practice (proposed)" with the risk it prevents. A project with no code yet starts its brainstorm with
them, right after the commercial and delivery questions.
- A best-practice rule is never presented as something the system does, and is Confirmed only once
  the user adopts it.
- Next to each legacy rule that falls short, the better rule is proposed.
- In new-project mode, each adopted rule becomes a functional requirement in the scope draft for
  its area, citing its `BR-` ID, so `/buildscope --from-md` carries it; when the idea brainstorm is
  skipped, the proposals are discussed in the N6 design review.

### Planning additions (2026-10-04 review of gaps)

**FR-029 — From built to released with the existing commands.** After the last spec is implemented,
G.O.D. carries the application through the rest of the cycle (new-project § N8c), running only
commands that exist, ship to consumer projects, and work, each under its own rules: `/wxUIUXCodeReview`,
`/wxConversionParity` (conversions), `/wxDBAnalyze` (PostgreSQL, when it connects),
`/compliance-scan` (enabled frameworks), `/wxCreateTestPlan --Execute` with `/autofix-tests`, and
`/wxHelpGenerate`. Each scope advances through Implementation, QA, Human Testing, Beta, and Release
on its own as its tasks and tests clear (SPEC-123, amended 2026-10-04); G.O.D. confirms each stage
with `project.scope_stage` and the test gates with `project.test_gate_status` before going on.
- Approved fixes from reviews and tests are filed as tasks on their spec, then run through
  `/implement`. Without `--create`, the user approves each fix and G.O.D. never fixes code itself.
  Under `--create`, G.O.D. decides (every must-fix, and should-fix items within the approved design),
  logs each decision in `gateLog`, and fixes code itself only as an FR-015 repair.
- Commands that do not work are never run and are listed as known gaps: `runqa`, `runhuman`,
  `prepareRelease`, `finalizeRelease` (no handler), `/wxAI-qa`, `/wxAI-humantest`, `/wxAI-beta`,
  `/wxAI-release` (missing prerequisites script), and `/preTest` (partly built).
- G.O.D. never moves a stage by hand, deploys, or pushes, and never signs off a human test; the run
  ends when every scope is in Release.
- Under `--create` it continues from built without an extra "proceed?"; otherwise it asks once.
- *Amended 2026-10-19 (Amendment A):* `/preTest` is no longer a known gap. N8c step 6 runs
  `/preTest --nightly` (SPEC-140), so it leaves the list above. **Beta is a known gap for now:**
  N8c step 10 sends Beta fixes through `/implement`, which refuses a scope in Beta, and Beta's exit
  rule is already met, so a scope passes straight through. Under `--create`, Beta passes through
  and its fixes are listed in the run report (FR-042). The product decision stays with the Manual's
  open items 3 and 6 (`docs/brainstorms/2026-10-18-wxkanban-manual.md`).

**FR-030 — Internal build or consulting; build vs buy for internal builds only.** A third opening
question comes first: is the user building for their own organization (internal build) or for a
customer (consulting)? For an internal build only, the first topic after the opening questions is
build vs buy (not commercial: three to five existing products compared, then build, buy, or buy and
extend, recorded as an ADR) or competitors (commercial: three to five products selling to the same
customers, and what will make this one chosen). It is never raised in consulting.
- Every product, feature, and price cited comes from research with its page and date; none is
  invented.
- The answer is pre-filled from `--customer` and recorded as `buildFor` in the state file.

**FR-031 — User personas.** G.O.D. defines the user personas: each a kind of person with goals, top
tasks, frequency, comfort with computers, device and setting, and needs, mapped to one role
(management plan § 3.1, `UP-` IDs). Plan mode drafts them from the evidence as the first area of
review section 1; new-project mode drafts them from the overview and discusses them in the idea
brainstorm after the business rules.
- Every feature names the personas it serves, and every persona's top tasks are covered by a
  feature; a gap either way is raised in the design review.
- Scope drafts name the persona and role on the Actors lines, and each top task the scope serves is
  an end-to-end acceptance scenario, so the test plan covers it.

**FR-032 — Price and margin, in the internal cost document only.** For a commercial app, the
projected SaaS cost adds the planned price per customer per month (PD4 / NP9), the margin per
customer and as a percentage, and the approximate break-even customer count, for the recommended
option and AWS, at launch and after 12 months.
- `docs/GOD-SaaS-Cost.md` is internal and never customer-facing; no figure from it is copied into
  the customer document, which keeps cost tiers.
- With no planned price, only the break-even price is shown; a price is never invented.

**FR-033 — Service level (SLA).** Interview question D8 asks the uptime, support hours, and response
and fix times promised to users. With D6 it sets the hosting's redundancy, the monitoring and
on-call work, and the providers that qualify in the cost projection; it is stated in the management
plan and, as the level the hosting is built to meet, in the customer document.

**FR-034 — Quality and readiness questions.** The interview asks for the accessibility standard
(QR1, default WCAG 2.2 AA for commercial or public apps), the languages, currencies, date formats,
and time zones (QR2), and the data allowed for testing and demos (QR3, default made-up data; a
masked copy of real data only with written approval). A commercial app gets a dependency license
check in its release phase, with licenses that require sharing source code flagged.

**FR-035 — Brainstorms run through wxBrainstorm.** Every brainstorm G.O.D. holds (talking a review
section through in plan mode, the idea brainstorm in new-project mode, and the design brainstorm at the
review pause) is run by the **wxBrainstorm** skill in embedded mode: its panel of the eleven roles,
chaired by the Lead Architect, and its discussion rules. G.O.D. passes the topic, the user's level and
the evidence it already holds, so wxBrainstorm confirms the topic in one line and searches only beyond
that evidence. wxBrainstorm writes its record in `docs/brainstorms/`; G.O.D. adds the approved
decisions to `docs/GOD-Brainstorm.md`, which the interview and the plan keep reading. G.O.D.'s own
brainstorm rules are removed. wxBrainstorm's hand-off step (`/buildscope`) does not run inside G.O.D.;
G.O.D.'s rules for what the decisions do still apply.
- G.O.D. looks through everything first and then offers the brainstorm once, letting the user
  choose: in plan mode after all five review sections (the topics noted on the way, the decisions
  needed, the top risks, undecided rule areas, with G.O.D.'s recommendation); in new-project mode
  after the overview review and the drafted rules (N2), or at the design review under `--create`. No
  brainstorm starts mid-review.
- No brainstorm rules remain in `review-and-brainstorm.md` beyond the offer and the hand-off to
  wxBrainstorm.
- Every approved decision appears both in a `docs/brainstorms/` record and in `docs/GOD-Brainstorm.md`.
- A project whose kit lacks wxBrainstorm is told to update the kit; the review continues without a
  brainstorm.

**FR-036 — Smoke test in the drive; the full test overnight.** In the built-to-released cycle (N8c),
G.O.D. no longer runs the full test plan through all its gates during the drive. It first confirms
every scope's full test plan has been filed by `/wxCreateTestPlan` (plan mode, run by `/implement`
Phase 5), then runs `/wxCreateTestPlan --Execute` per scope and ends at Gate 1, the smoke signoff.
After that it schedules the full test overnight with `/preTest --nightly --install --full-first`
(SPEC-140): the first night runs every machine test item, and later nights test what each day's
changes reached plus the rotation. The nightly run signs off each item it proves, so a scope's QA gate
clears from the overnight results. G.O.D. never points the overnight run at production: when the
nightly check refuses, it says what is missing and leaves the full test as the user's next step.
- During the drive only Gate 1 runs; Gates 2 and 3 are not run by G.O.D.
- The overnight run is scheduled only after every scope's full test plan exists.
- QA is left from the overnight results, never by hand.

### Seamless `--create` (Amendment A, 2026-10-19)

The owner's request: a `--create` run should be able to go for about four hours. Questions that come
up along the way are collected for the end and do not stop the whole system. Decisions 1 to 15 of
`docs/brainstorms/2026-10-19-wxgod-seamless-create.md` are recorded in Clarifications Q37 to Q51.

**FR-037 — The decision queue.** Under `--create`, after approval, a question the approved design
does not cover is classified. It is not asked mid-run.
- **Low-risk:** G.O.D. takes its recommended answer and logs it as an assumption (`DQ-nn`,
  `kind: assumed`), stating what it would cost to undo. The run continues.
- **High-risk:** the question is parked (`kind: parked`). Only the unit it belongs to waits, with
  the units that depend on that unit through the scope map's `dependsOn` edges, directly or through
  others. Everything else continues.
- **High-risk** means any of the following: possible data loss; the shape of a shared table; money
  or billing; security, auth, or permissions; legal or compliance; anything that touches production;
  anything that contradicts an approved decision; or anything costly to reverse (more than about one
  unit of rework).
- Every item goes to `docs/GOD-Decisions.md`, which is kept current as the run goes, and to
  `decisionQueue` in `GOD-State.json`. A high-risk item is never assumed.
- A Change Impact data-loss denial is parked as high-risk. Its unit waits and the others continue.
  The answer is still recorded only with `approve.mjs`, once the user has given it. A denial is
  never treated as a failure to repair, and no repair may make an edit that a denial blocked.
  "All recommended" never covers a data-loss item: the user answers it by its own number.
- A third kind, `review`, holds a design G.O.D. saved under `--create` (FR-043). It blocks no unit.

**FR-038 — Checkpoints do not stop a `--create` run.** A checkpoint saves the state file, and the
run keeps going. The client compacts its own context when it fills. After any compaction, G.O.D.
re-reads the state file before the next action, as the bridge rule already says. `/clear` is offered
only at the end of a sitting (FR-042). Amends FR-016 for `--create`.

**FR-039 — The pipeline commands run in helpers under `--create`.** `/buildscope`,
`/validateScope`, `/createSpecs`, and `/implement` each run in a helper agent. The helpers use the
N8b return-the-question protocol: a helper returns each question instead of answering it. G.O.D.
answers it from the approved design, or adds it to the queue (FR-037).
- The main conversation holds the state file, the logs, and the tables, and none of the commands'
  conversations.
- `/buildscope` and `/createSpecs` run one at a time, so SCOPE and SPEC numbers never race. A
  scoping helper runs no build or test, so it counts toward `--cap` but not toward the machine
  maximum.
- wxDesigner stays in the main conversation, because it drives the browser.
- Helpers never commit and never push. G.O.D. commits each unit, staging by name only the paths
  that unit's helpers report and G.O.D.'s `docs/` files. A failed commit is a logged repair.
- The state file records each running helper's id and pending question, so a compaction never
  loses one.

**FR-040 — A stuck phase gate parks; independent units go on.** When a phase exit gate cannot be
cleared, it is parked as a high-risk item. The phase stays "gate open" in the plan, and the gate
gets no commit.
- The units behind the gate are the units it fails on: a unit that is not implemented, or is
  parked. When the gate fails on the phase's own condition rather than on a unit, every unit in the
  phase is behind it.
- Next-phase units that do not depend on any unit behind the gate (through `dependsOn`, directly or
  through others) may start. Units that do depend on one wait.
- When the gate later clears, it is marked, committed, and checkpointed as usual.
- Amends N11 items 2.6 and 3, and FR-014.

**FR-041 — Readiness check before Approve.** At the N6 pause, before Approve, G.O.D. lists
everything the run will later need that only the user can supply:
- the UAT target and test logins for `/preTest --nightly`
- test keys for each integration in the design
- Claude in Chrome and Python for `/wxHelpGenerate`
- database reach for `/wxDBAnalyze`
- the kit version (per-scope stages, v1.7.72, and the per-spec check, FR-017)
- a clean git tree
- the Remote Session Bridge

The user supplies each one now, or it is recorded as a known skip (`readiness` in the state file).
A known skip is skipped later without asking. G.O.D. checks that a key's name is present and never
reads or prints its value. Refined by the cold read-through (T051):
- **Integration keys:** a test key is confirmed by a true/false prefix check where the provider
  marks test keys (Stripe `sk_test_`), otherwise by the user. Work that would call an unconfirmed
  key is parked as high-risk.
- **Database:** the item is a confirmed **test** database for every command that connects
  (`/implement`, the smoke test, `/wxDBAnalyze`). Without that confirmation, the database work is
  parked as high-risk (production), never skipped.
- **Kit:** the kit item includes the Change Impact script.
- **UAT target:** a target that does not exist yet is recorded as `pending` and checked when N8c
  reaches it.
- **Bridge:** the bridge offer is made here, so nothing is asked after Approve.
- **Pre-run changes:** they are recorded when the state file is first created, before G.O.D.
  writes anything.

**FR-042 — The end of a sitting: run report and decision review.** There is no time budget and no
`--hours` flag. A sitting ends when no unit is ready and no helper is running: everything is done,
parked, or waiting on the overnight tests or the testers. A sitting runs built → code review →
fixes → smoke test passed → nightly run scheduled, as far as the parked items allow. Then:
- G.O.D. writes `docs/GOD-Run-Report.md`: what was built; a summary of the gate answers; the
  assumptions taken, with their cost to undo; the parked questions, with G.O.D.'s recommendation and
  the units each one blocks; the repairs; the defects filed; and the user's next steps (push, the
  overnight run, the testers).
- It then presents every queued item at once, numbered, in plain text. The user can answer "all
  recommended".
- An answered parked item releases its units, and the run continues. A reversed assumption becomes
  a fix task through N8c step 5. Answers given now apply at once. Answers given later apply on
  `--resume`. The Change Impact marker is turned on before any released unit runs.
- Under `--create`, a scope enters N8c as soon as it is implemented, so a parked unit holds back only
  its own release cycle. The overnight scheduling still waits for every scope's full test plan
  (FR-036). A sitting ends when no unit and no N8c step is ready and no helper is running. The
  plan's Release phase is carried out by N8c, never by the build-phase loop.
- Every way the run stops ends unattended mode (`unattended.mjs stop`).

**FR-043 — "Design it" screens under `--create`.** G.O.D. runs wxDesigner, drafts the design within
the chosen style, and SAVEs it. It then holds that scope's **screen tasks** for the end-of-sitting
review, as a queue item of kind `review` that blocks no unit. The scope's other tasks and all other
units keep going.
- The screen tasks are held as `blocked` in wxKanban, and `/implement` runs with
  `--task-filter todo`, so it builds the other tasks.
- For its dependents, a unit whose only open tasks are parked screen tasks counts as implemented.
  Its phase exit gate lists those tasks as open and still passes.
- After the user approves or changes the design, the screen tasks return to `todo` and `/implement`
  builds them.
- Amends N11 2.3 and FR-024.

### Fresh start before the build (Amendment C, 2026-10-24)

Decided by the owner, 2026-10-24. A `--create` run is driven from one conversation for hours, and
every turn of the driver re-sends that whole conversation. A run that starts in the conversation
that held the intake, the brainstorm and the design review carries all of it into every helper
dispatch and handoff. /usage showed long sessions as the largest share of the owner's usage. G.O.D.
cannot clear its own conversation (`/clear` is typed by the user), but everything it needs is in its
files, so it can stop once, at the cheapest moment, and resume clean.

**FR-044 — Offer a fresh start once, after the run is set up.** Under `--create`, after N11 item 1
has set up the run (state saved with `phase: execute`, sitting 1 open, `nextAction` set) and the
Change Impact marker step, and only when the run is **not** handed to the bridge (a bridge session
starts fresh already), G.O.D. checkpoints and posts once: "The design is approved and the run is
set up. To start the build in a fresh conversation, run `/clear`, then `/wxG-O-D --resume`. Reply
**go** to continue here instead." Then it ends the turn.
- On `--resume`, N10 continues sitting 1 at `nextAction`, running the Change Impact `start` first as
  after any `--resume`.
- On **go** (or any reply that is not a question), it continues in this conversation.
- This is the only extra stop; nothing after it asks for `/clear` mid-sitting (FR-038 unchanged).
- Amends N11 item 1, FR-038 and the "Checkpoint before the context runs out" rule.

**Acceptance Criteria**:
- [ ] A `--create` run not handed to the bridge stops exactly once after set-up, with that message, and the state file already holds `phase: execute` and `nextAction`.
- [ ] `/clear` then `/wxG-O-D --resume` starts the first unit of phase 0 with no question asked.
- [ ] A run handed to the bridge never shows the offer.

## User Scenarios & Testing

### US1 — Plan for an existing system

A consultant runs `/wxG-O-D --customer="Acme Freight"` in a repo holding a WinDev conversion output
and the customer's documents. G.O.D. fetches the method, inventories the tree, runs the intake
helpers, reviews the four finding sections with the consultant at junior level, asks only the open
interview questions, and writes the customer plan, management plan, roadmap, and flows as Markdown
and PDF in `docs/`.

**Expected**: every finding carries a file citation or a confidence label; the estimate shows the
quickest team and the machine maximum with a recommendation; no secret value appears in a document
or in chat.

### US2 — Create an app from an overview

A developer runs `/wxG-O-D --create ProjectOverview.md`. G.O.D. reviews the overview, designs the
system, writes the plan documents and the scope map, and pauses once for the design review. On
approval it executes the development plan phase by phase: buildscope, validateScope, createSpecs,
implement with its test plan for each unit, independent units in parallel, with each unit's status
updated in the plan as it completes.

**Expected**: every pipeline command runs under its own gates; the roadmap shows live status; the
app builds to the last phase's exit gate; no artifact in `specs/` or `src/` was written by G.O.D.

### US3 — Unattended under the bridge

The same developer has the Remote Session Bridge configured and leaves the desk. G.O.D. offers to
run under the bridge, the developer accepts, and KAIN relays each gate question and each request for
an extra action to the phone, carrying the answer back.

**Expected**: the run continues between answers; `STATUS` reports the plan position; `CANCEL
REMOTE` stops it; a push is never made without a recorded grant.

### US4 — Resume after a cleared context

A long `--create` run checkpoints to `docs/GOD-State.json`; the developer clears the context and
runs `/wxG-O-D --resume`.

**Expected**: G.O.D. continues at the exact unit and gate it stopped at, with no unit repeated or
skipped.

### US5 — The method changes

A wxperts admin fixes a wording defect in a reference document under `mcp-server/src/prompts/wxgod/`
and redeploys the hosted MCP.

**Expected**: the next run on every subscriber's machine gets the fix with no kit update; a lapsed
subscriber gets a clear entitlement message and no method.

### US6 — A defect in the run

A script fails, or the method contradicts itself mid-run.

**Expected**: G.O.D. stops at that step, states exactly what failed, and asks the developer to
report it through the Cockpit feedback, which lands in the wxKanban Dev project. It never improvises
around the defect, and the state file records the stop point so the run resumes after the fix.
*(Amended 2026-10-19: after approval under `--create`, only an unsafe failure stops the run. Other
failures are logged and the run continues. A method contradiction is parked, per FR-022.)*

### US7 — Style once, design or build each screen

At the end of the brainstorm for a new project with four screen-bearing scopes, G.O.D. asks the
developer to pick a style type for the whole application; they choose "editorial". For each of the
four scopes it then asks: design the screen with wxDesigner, or let it build. The developer picks
design for two and build for two. Later, after `/createSpecs` has run for each of the two designed
scopes, G.O.D. runs wxDesigner; the developer iterates in the browser and SAVEs both `page.md` files.

**Expected**: `stack.md` records the editorial look and feel before a screen is designed or built;
wxDesigner runs only after each designed scope's specs exist, and before its `/implement`; the two
saved `page.md` files are what `/implement` builds from; the other two screens are derived from their
specs in the same style; after a `--resume` none of the four scopes is asked again.

### US8 — Commercial web app, projected hosting cost

A developer runs `/wxG-O-D ProjectOverview.md --brainstorm` for a booking app they plan to sell to
salons. The brainstorm opens by asking whether it is commercial (yes) and whether it is web-based or
installed (web-based). The interview asks for the customer forecast: 3 salons at launch, 40 after 12
months.

**Expected**: the design summary lists signup, separate data per salon, subscription billing, and
plans as Proposed features; `docs/GOD-SaaS-Cost.md` shows five qualifying options and AWS at both
sizes, with the cost per salon, a ★ Recommended option, and a dated source for every price; the
customer document's database table still shows cost tiers only.

### US9 — Existing desktop app moving to the web

A developer runs `/wxG-O-D` on a WinDev conversion. Before section 1 of the review, G.O.D. says the
app is installed on each PC today and has no billing code, and asks the two questions; the
developer answers "not commercial" and "web-based".

**Expected**: the delivery change is listed in Decisions needed with an ADR; `docs/GOD-SaaS-Cost.md` is
written in step 6 with five options and AWS, with no customer forecast and no Today column unless
the developer gives today's bill; after a `--resume` neither question is asked again.

### US10 — Business rules from a converted app

A developer runs `/wxG-O-D` on a WinDev conversion with 312 element documents. The intake reads
all 312 across two conversations, with a checkpoint between slices, and finds 540 rules in 14
areas. In review section 2, G.O.D. starts with Invoicing: 3 conflicting rules, 11 enforced only in
the screen, and 2 that fall short of best practice ("a posted invoice can be deleted"), each with the
better rule proposed. Then it offers the other 38 Invoicing rules for approval as a group.

**Expected**: the coverage table lists all 312 files; every rule cites its source; the decisions
land in `docs/GOD-Brainstorm.md`; rules to change appear as work with `BR-` IDs in the acceptance
criteria; on a new project with no code, the brainstorm instead opens with best-practice rules for the
overview's features, and each adopted rule is a functional requirement in a scope draft.

### US11 — A four-hour unattended `--create` run that ends with a decision review (Amendment A)

A developer runs `/wxG-O-D --create ProjectOverview.md` for an app with nine scopes in three phases.
At the N6 pause, the readiness check lists what the run will need later. The developer adds the UAT
target and the test logins, and says the database is out of reach today, which is recorded as a
known skip. They approve and leave. During the run:
- `/createSpecs` for S04 asks which of two date formats an export uses. That is low-risk, so G.O.D.
  takes the ISO format and logs `DQ-01` (cost to undo: one task).
- `/implement` for S06 asks whether a refund may exceed the original charge. That is money, so it is
  high-risk. G.O.D. parks it as `DQ-02`, ends S06's helper, and starts the next ready unit. S08
  depends on S06 and waits. S07 does not depend on S06 and goes on.
- Phase 1's exit gate fails on S06, so the gate is parked. Phase 2's S09 depends only on phase-0
  units, so it starts.
- S05's screen is designed in wxDesigner and SAVEd. Its screen tasks are held as `DQ-03` (kind
  `review`), and the rest of S05 is built.
Checkpoints save and the run keeps going.

**Expected**: about four hours later, no unit is ready and no helper is running. G.O.D. writes
`docs/GOD-Run-Report.md` and presents `DQ-01` to `DQ-03` together, numbered, with a recommendation
each. The developer answers "all recommended, except 2: refunds may not exceed the charge". S06 and
S08 resume, the phase-1 gate clears and is committed, and S05's screen tasks are built. The developer
was asked 0 questions between approval and the review.

## Data Requirements

None. No new table. The run's state lives in `docs/GOD-State.json` and the plan documents, on
purpose: the plan is a file the customer and the developer both read. FR-017 changes a query against
the existing `projectspecifications`, `projecttasks`, and `projectdocuments` tables; no column is
added.

## API Routes

None new. `project.get_command_prompt` is unchanged; its key space grows by `wxgod` and the nine
path keys. Its tool description in `mcp-server/src/server.ts` lists `wxgod` (one-line edit; not yet
made as of 2026-10-03).

## Frontend Components

None in the web app. The Cockpit help catalog (`vscode-extension/src/services/helpCatalog.ts`)
gains the dev-plan deprecation note and keeps the existing `/wxG-O-D` entry.

## Key Entities

- **Development plan** — `docs/DEVELOPMENT-PLAN.md`: the build roadmap, and under `--create` the execution schedule and progress record.
- **Unit** — one scope in the plan's build order; carries its phase, dependency edges, and pipeline status.
- **Checkpoint** — `docs/GOD-State.json`: mode, level, current phase, unit, gate, next action, and the per-scope design-or-build choice.
- **Hosted method** — the `wxgod` prompt and its nine reference documents in the MCP registry.
- **Stub skill** — the shipped `.claude/skills/wxG-O-D/` with `SKILL.md` and `scripts/` only.
- **Decision queue** (Amendment A) — `decisionQueue` in `GOD-State.json` and its live view
  `docs/GOD-Decisions.md`. Each `DQ-nn` item is `assumed`, `parked`, or `review`, with its question, its unit,
  G.O.D.'s recommendation, the cost to undo, the units it blocks, and the answer once given.
- **Run report** (Amendment A) — `docs/GOD-Run-Report.md`, written at the end of each sitting.

### Files affected

- `mcp-server/src/prompts/wxgod.md`, `mcp-server/src/prompts/wxgod/references/*.md` (the method; the only copy); `new-project.md` § N6b carries FR-023 and FR-024; `review-and-brainstorm.md` § Commercial and delivery (shared by both modes), `new-project.md` § N2b and N3 to N5, `interview.md` (PD1 to PD3), and `wxgod.md` steps 5, 6, and 12 carry FR-025; `database-options.md` § Projected SaaS cost and `document-templates.md` § 5 carry FR-026; the new `business-rules.md` reference, `wxgod.md` steps 4 to 6, review section 2, `new-project.md` § N2, N2b, and N4 to N6, and `document-templates.md` (management plan § 3, customer document § 4) carry FR-027 and FR-028
- `mcp-server/scripts/build-prompts.mjs`, `mcp-server/tests/prompts/registry.test.ts`
- `mcp-server/src/server.ts` (tool description, one line)
- `.claude/skills/wxG-O-D/SKILL.md` (stub), `.claude/skills/wxG-O-D/scripts/*.mjs`
- `.claude/commands/wxG-O-D.md`, `_wxAI/commands/wxG-O-D.md` (byte-identical)
- `.claude/skills/dev-plan/` (`SKILL.md`, `references/plan-template.md`, `scripts/build-devplan-pdf.mjs`) folds into G.O.D.; `.claude/commands/dev-plan.md` and `_wxAI/commands/dev-plan.md` become the alias
- `scripts/sync-to-orchestrator.mjs` (skill allowlist: `dev-plan`, `wxG-O-D`)
- `wxkanban-agent/core/policy/resolve-spec-verification.ts`, `wxkanban-agent/core/policy/adapters/mcp-adapter.ts`, `wxkanban-agent/tests/unit/policy/mcp-adapter.test.ts`, `wxkanban-agent/tests/unit/mcp-adapter.test.ts`
- `specs/030-*/spec.md` (FR-004 amendment)
- `vscode-extension/src/services/helpCatalog.ts`
- `wxkanban-agent/CHANGELOG.md`
- Amendment A: `new-project.md` § N6 (readiness check), N6b, N8b, N9, N10, N11, N12, and the
  known-gaps table; `wxgod.md` Modes, Output table, Rules, and Resources; `document-templates.md`
  §§ 6 and 7 (`GOD-Decisions.md`, `GOD-Run-Report.md`); the stub `SKILL.md` description

## Integration Context

- Aligns with SCOPE-019's hosted command prompts: same `project.get_command_prompt` path, same stub shape, same MCP-unavailable guidance.
- Extends SCOPE-081: the judgment half of dev-plan moves here; the deterministic server `devplan` stays.
- Extends SCOPE-102 and SCOPE-132: the bridge is the runtime for an unattended run; KAIN is monitor and relay; its gate, seed policy, and one-driver rule are inherited.
- Amends SPEC-030 FR-004 (FR-017 here).
- Uses SCOPE-043's feedback channel for run defects.
- Follows SCOPE-093's read-on-demand rule for references.
- Uses the wxDesigner skill as it is for per-screen design (FR-024); its SAVE writes `specs/<NNN-name>/page.md`, which `/implement` already consumes.
- Writes the chosen style type into `stack.md` Look & Feel through the Stack & Style document (SCOPE-047), so `buildscope`, `createSpecs`, and `implement` pick it up through their existing `stack.md` injection; a company design system from SCOPE-114 is an accepted source for that choice.

## Constraints

- The method is edited only in `mcp-server/src/prompts/`. A copy of the method that reappears under `.claude/skills/` is a defect, because it drifts and ships.
- A hosted MCP redeploy is needed before subscribers receive the `wxgod` prompt, and before every later method change. Until then the stub refers to a key the server does not serve.
- The hosted MCP is reachable at the start of every run. There is no offline copy, by design.
- References are fetched one at a time when a step needs them. Fetching all of them at once (about 150 KB) is prohibited by the method.
- Scripts stay on disk and stay plain Node with no dependencies.
- The estimate is machine-specific. When the agents will run elsewhere, the user sets the maximum by hand (interview T5).
- G.O.D. never pushes. Under the bridge a push reaches KAIN's gate and needs a recorded grant.
- Under `--create`, G.O.D. commits locally, per unit and per phase gate, and nothing else in git.
- Only one driver per working tree (SCOPE-132 FR-026).

## Risks

- **Silent rollback of the MCP deploy** has happened before. Mitigation: after deploy, probe `get_command_prompt` with `wxgod` and one reference key before announcing the release (T006).
- **Lifting the one-active-spec rule** removes a guard SPEC-030 added on purpose. Mitigation: the per-spec check still blocks a spec with no tasks or documents, and the plan's dependency graph is the new guard against collisions.
- **Two drivers on one tree.** Mitigation: G.O.D. is the only driver; KAIN relays; SCOPE-132 FR-026 refuses a second session.
- **`--create` runs for hours.** Mitigation: checkpoints at every unit and gate, and the bridge for unattended answers.
- **G.O.D. answers the gates under `--create`,** so a wrong answer carries into later units. Mitigation: answers come only from the approved design, each is logged with its source, a decision outside the design is asked, the user can stop the run at any time, each unit is a local commit that can be rolled back, and nothing reaches production without the user's push. *(Amended 2026-10-19: a decision outside the design is queued, not asked mid-run, FR-037.)*
- **A low-risk assumption turns out wrong** (Amendment A). Later units build on it until the decision review. Mitigation: only low-risk items are assumed, and the high-risk list is broad and includes anything costly to reverse. Each assumption states its cost to undo. All of them are reviewed together before the user pushes. A reversed one becomes a fix task through N8c step 5.
- **A method copy reappears on disk** (an author restores the full skill for convenience). Mitigation: the constraint above, the release-asset diff in SC-1, and the delivery-map note in the kit docs.

## Compliance Requirements

SOC 2 is active for this project (loaded via `project.get_compliance_context`, phase Design,
2026-10-03). Controls that bear on this spec:

- **CC6.1 Authentication and authorization design** — access to the method is the entitlement check on `project.get_command_prompt`; the scripts and stub carry no credential and check nothing themselves.
- **CC6.1 Secrets management** — secret files are listed by path and never opened; no value appears in a document or chat; conversion credential tokens stay as tokens.
- **CC6.3 Principle of least privilege** — FR-017 narrows verification to the named spec; it does not widen who may call implement.
- **CC7.2 Audit trail of all changes** — every scope, spec, task, and code change made during `--create` is authored by its own command and recorded by that command's existing audit path, or is a repair logged in `GOD-State.json` (`repairs`); every gate G.O.D. answers is logged with its source (`gateLog`); each unit is a local commit; `GOD-State.json` and `GOD-Brainstorm.md` record who approved what and when.
- **CC8.1 Review approval before merge; formal change management** — in a `--create` run, the user's approval of the design (`planApprovedAt`) is the change approval: G.O.D. answers command gates within it and asks anything outside it. *(Amended 2026-10-19: anything outside it is queued, FR-037. A low-risk item is a logged assumption with its cost to undo. A high-risk item, which includes security, auth, compliance, money, and production, is parked until the user answers it. The user reviews every item before any push.)* It commits locally and never pushes or deploys; a push needs the user, and under the bridge KAIN's recorded grant. Without `--create`, every gate stays with the command that owns it.
- **CC5.2 Separation of duties** — the developer approves the design and pushes, G.O.D. executes within that approval, testers sign off human tests, and KAIN relays but cannot approve.
- **CC3.2 Threat modeling for new capability** — the unattended `--create` run under the bridge is the new capability; the kill switch, the one-driver rule, and the push gate are its controls.
- **P1.1 Privacy** — customer documents cite personal data by location only.

## Clarifications

### Session 2026-10-03 (from SCOPE-136)

| # | Question | Decision |
|---|----------|----------|
| 1 | Who is the actor — consultant, customer developer, or both? | Both, as the subscribed kit user; the command behaves the same for each. |
| 2 | Is hosted delivery about non-subscribers? | No. It is about lapsed subscriptions losing access on the next run and fixes reaching everyone without a kit update. |
| 3 | Where do run defects go? | Through the Cockpit feedback to the wxKanban Dev project (SCOPE-043). |
| 4 | Does the dev-plan skill fold into G.O.D.? | Yes; `/dev-plan` is an alias for one release. |
| 5 | Does G.O.D. run under KAIN / the bridge? | Yes, when configured. G.O.D. drives; KAIN monitors and relays. |
| 6 | Is there a `--create` flag? | Yes. Design, one review pause, then execute the plan to a built app. |
| 7 | Accept the one-active-spec limit or lift it? | Lift it (FR-017, FR-018). |
| 8 | A `--serial` flag? | No. `--cap=1` does it. |
| 9 | Learnings file and Cockpit help entry? | Learnings file stays in; the existing help entry is enough. |
| 10 | Screens: designed or built? | One style type for all screens first (FR-023); then per screen-bearing scope, design with wxDesigner or let it build; design runs after that scope's createSpecs and before its implement (FR-024). |
| 11 | `/dev-plan` deprecation: Cockpit first-use line or help catalog only? (createSpecs, 2026-10-03) | One chat line every time the alias runs, plus deprecated marks in the help catalog and Cockpit list; no first-use event. |

### Session 2026-10-04 (wxG-O-D update)

| # | Question | Decision |
|---|----------|----------|
| 12 | What should the idea brainstorm ask first? | Commercial or not, then web-based or installed. For web-based, research and calculate hosting costs for the five lowest-cost providers or mixes, plus AWS (FR-025, FR-026). |
| 13 | A commercial app: what follows? | The web-or-installed question as well, plus the sell-side design items; a web-based commercial app gets the same cost research, sized for customer growth (FR-025). |
| 14 | Where do the researched prices go? | A separate projected SaaS cost document, `docs/GOD-SaaS-Cost.md`. The customer document keeps cost tiers (FR-026). |
| 15 | Existing projects too? | Yes. The plan-mode review opens with the same two questions, pre-filled from the evidence, and any web-based system gets the cost projection (FR-025, FR-026). |
| 16 | Pull business rules from converted code? | Yes, from all of it, read in full and never sampled, and discuss them in the brainstorm (FR-027). |
| 17 | Ordinary (not converted) codebases too? | Yes, every existing codebase gets the same extraction (FR-027). |
| 18 | Best-practice rules? | Proposed in every mode beside the extracted ones; a project with no code starts its brainstorm with them (FR-028). |
| 19 | A money estimate for the build? | No. Cost is decided per project; G.O.D. estimates time only. |
| 20 | Build vs buy and competitors? | Only for an internal build, never in consulting (FR-030). |
| 21 | User personas? | Yes, in both modes (FR-031). |
| 22 | Price and margin? | Yes, for commercial apps, in the separate cost document, which is internal and not customer-facing (FR-032). |
| 23 | SLA? | Yes (FR-033). |
| 24 | Accessibility, languages, test and demo data, license check? | Yes, all four (FR-034). |
| 25 | Carry a project past implement? | Yes, with the existing commands only, to the Release stage; broken lifecycle commands are listed as gaps, not used (FR-029). |

### Session 2026-10-04 — `--create` completes the process (amends FR-015, FR-022, FR-029)

Andy: "once the --create starts it can create and run any command to complete the development process."

| # | Question | Decision |
|---|----------|----------|
| 26 | Under `--create`, who answers each command's approval gates? | G.O.D., from the design the user approved at the review pause. Each answer is logged with its source; only a decision the design does not cover is asked (FR-015). |
| 27 | May G.O.D. write scopes, specs, tasks, and code itself? | Commands first. When a command fails or a kit gap blocks it, G.O.D. writes or repairs the artifact itself the way the command would, logs it, reports the defect, and keeps going (FR-015, FR-022). |
| 28 | Does "any command" include git? | Commits yes, push no. G.O.D. commits each finished unit locally and never pushes, since a push deploys to production (FR-015). |
| 29 | Stage advances under SPEC-123? | Each scope advances on its own; G.O.D. reads `project.scope_stage` and works the blockers. Human-test sign-offs stay with the testers (FR-015, FR-029). |

### Session 2026-10-10 — read-only helpers are not bound by the machine maximum (amends FR-018)

Feedback 053e872b: on an 18 GB machine the machine maximum computed to 1, so step 4 intake ran one helper at a time across 9 areas, although its helpers run no builds or tests.

| # | Question | Decision |
|---|----------|----------|
| 30 | Does the machine maximum limit read-only helpers? | No. It models local build, test, browser, and Docker load. Read-only helpers run at most 5 at once (FR-018). |
| 31 | Does the user's `--cap` still limit them? | Yes. A cap is often set for plan usage limits, and helpers use the plan too (FR-018). |

### Session 2026-10-18 — brainstorms through wxBrainstorm; smoke test now, full test overnight (FR-035, FR-036; amends FR-012 and the N8c testing step)

| # | Question | Decision |
|---|----------|----------|
| 32 | Who runs G.O.D.'s brainstorms? | The wxBrainstorm skill, embedded; G.O.D.'s own brainstorm rules are removed (FR-035). Owner request, 2026-10-18. |
| 33 | Where do decisions go? | wxBrainstorm's record in `docs/brainstorms/`, and `docs/GOD-Brainstorm.md` as G.O.D.'s index for the interview (FR-035). |
| 34 | What testing runs during the drive? | A smoke test only: `/wxCreateTestPlan --Execute` ending at Gate 1 (FR-036). |
| 35 | When does the full test run? | Overnight, scheduled with `/preTest --nightly --install --full-first` once every scope's full test plan is filed; the first night runs every machine item (FR-036, SPEC-140 Amendment A). |
| 36 | When is the brainstorm offered? | Once G.O.D. has looked through everything: after the five review sections in plan mode, after the overview review in new-project mode; the user chooses whether and which topics. Owner, 2026-10-18 (FR-035). |

### Session 2026-10-19 — seamless `--create` (Amendment A: FR-037 to FR-043; amends FR-014, FR-015, FR-016, FR-018, FR-020, FR-022, FR-024, FR-029)

Owner request: "Review the skill. We don't need to run it. We need to review and check the process flow to make it much better." A `--create` run should be able to go for about four hours. Questions that come up along the way are collected for the end and do not stop the whole system. Record: `docs/brainstorms/2026-10-19-wxgod-seamless-create.md`.

| # | Question | Decision |
|---|----------|----------|
| 37 | What happens to a question the approved design does not cover? | A hybrid queue. A low-risk question is taken with G.O.D.'s recommended answer and logged as an assumption with its cost to undo. A high-risk question is parked: only its unit and that unit's dependents wait. Every item is in `docs/GOD-Decisions.md` and `decisionQueue` (FR-037). |
| 38 | Do checkpoints stop a `--create` run? | No. Save and keep going, and re-read the state file after any compaction. `/clear` is offered only at the end of a sitting (FR-038). |
| 39 | Where do the pipeline commands run under `--create`? | Each in a helper, with the return-the-question protocol. `/buildscope` and `/createSpecs` run one at a time. wxDesigner stays in the main conversation (FR-039). |
| 40 | A phase exit gate cannot be cleared? | It is parked as high-risk and the phase stays "gate open" with no gate commit. Next-phase units that do not depend on a unit behind it may start (FR-040). Owner changed the recommendation, which was to wait. |
| 41 | A Change Impact data-loss denial? | Parked as high-risk. The unit waits, the others continue, and the answer is recorded only with `approve.mjs` once the user gives it (FR-037). |
| 42 | G.O.D.'s own script fails after approval? | The run stops only when continuing is unsafe: the state file, the inventory, or the estimate cannot be trusted. Anything else is logged in `repairs`, reported, and the run continues. Before approval, the stop rule stands (FR-022). |
| 43 | "Design it" screens under `--create`? | G.O.D. drafts and SAVEs the design in wxDesigner, then parks that scope's screen tasks for the end-of-sitting review. Everything else keeps going (FR-043). |
| 44 | A time budget (`--hours`)? | No. A sitting ends when no unit is ready and no helper is running (FR-042). Owner changed the recommendation, which was `--hours`. |
| 45 | What can the run need later that only the user can supply? | Ask for it at the N6 pause, before Approve, as a readiness check. Each item is supplied now or recorded as a known skip (FR-041). |
| 46 | How does a sitting end? | With `docs/GOD-Run-Report.md` and a review of every queued item at once, numbered, in plain text. "All recommended" is an answer (FR-042). |
| 47 | Beta has no fix path (X1)? | A known gap for now. Under `--create`, Beta passes through and its fixes are listed in the run report. The product decision stays with the Manual's open items 3 and 6 (FR-029). |
| 48 | The stale `/preTest` known-gaps row (X2)? | Corrected: N8c step 6 runs `/preTest --nightly` (FR-029). |
| 49 | Menus under the bridge (X3)? | Under the bridge, N2 and N6 ask in numbered plain text. In the editor the menus stay (FR-020). |
| 50 | A helper waiting on a question holds its slot (X4)? | Add the `parked` implement status. The helper is ended and its slot freed. On release, the unit is run again through `/implement`, which picks up its remaining tasks (FR-018). |
| 51 | `stoppedAt` holds a single stop (X5)? | Resume reads `decisionQueue` too. It shows the answered and unanswered items, applies the answers, then continues from `nextAction` (FR-016). |
| 52 | What did the cold read-through (T051) change beyond decisions 1–15? *(Pending owner confirmation.)* | **Bridge:** the bridge offer moves into the readiness check, so nothing is asked after Approve, and the run is set up (`phase: execute`, sitting 1, Change Impact on) before the handoff. **Safety:** a live integration key or an unconfirmed test database parks the work instead of being skipped. A Change Impact denial is never repaired around. "All recommended" never covers a data-loss item. Every stop ends the helpers and unattended mode. **Held designs:** a self-saved design is a third queue kind, `review`, which blocks no unit, and its screen tasks are held as `blocked` and skipped with `/implement --task-filter todo`. **Release cycle:** N8c runs per scope as each is implemented, and the plan's Release phase is not a build phase. **Units and commits:** a phase gate fails on the units behind it, and each unit commits only its own named paths. Helper ids are kept in the state file. |

## Phase

**Current Phase**: design
**Priority**: high

## Status

- **Date**: 2026-10-03
- **Phase**: design
- **Done before this spec**: FR-001 to FR-004 code is in the tree (commit `64738521`); the hosted deploy probe (T006) is not yet done.
- **Amendment A (2026-10-19)**: FR-037 to FR-043, US11, SC-9, and Q37 to Q51 added; tasks T042 to T051. The method is edited in the tree. It is not yet exercised by a real run (T029).
- **Amendment C (2026-10-24)**: FR-044, a one-time fresh-start offer (`/clear`, then `--resume`) once a `--create` run is set up and not handed to the bridge; task T052. Method edited in the tree (new-project.md N11 item 1 and intro, wxgod.md checkpoint rule); live after the hosted MCP deploy. (Amendment B is SCOPE-136's parallel-runs amendment, in the scope file.)
