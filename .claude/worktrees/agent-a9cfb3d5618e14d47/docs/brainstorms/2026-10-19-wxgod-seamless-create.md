# Brainstorm: wxG-O-D `--create` runs for hours without stopping — questions wait for the end

- **Date:** 2026-10-19
- **Owner:** Andy
- **Status:** Decisions agreed. Resume steps 1 to 5 done 2026-10-19: spec amended, T042–T051 filed, method edited, checks green, and a two-round cold read with its fixes. Uncommitted. Step 6 (release) waits for Andy's word.
- **Target:** SCOPE-136 / SPEC-136, **Amendment A (2026-10-19)**. Additive only: nothing existing is removed.

## The request

"Review the skill. We don't need to run it. We need to review and check the process flow to make it much
better." A `--create` run should be able to go for about 4 hours. Questions that come up along the way are
collected for the end and do not stop the whole system.

## What was reviewed

- `.claude/skills/wxG-O-D/SKILL.md` (stub)
- `mcp-server/src/prompts/wxgod.md`
- `mcp-server/src/prompts/wxgod/references/new-project.md`, `review-and-brainstorm.md`, `interview.md`
- `.claude/skills/wxBrainstorm/SKILL.md` § Embedded in wxG-O-D
- `specs/136-wxgod-development-manager/spec.md` (FR-001 to FR-036, clarifications 1 to 36)
- `docs/brainstorms/2026-10-18-wxkanban-manual.md`, open items (Beta questions 3 and 6)

## What stops a `--create` run today

| # | Stop | Where |
|---|------|-------|
| 1 | Any decision the approved design does not cover is "asked, never guessed" | new-project.md N11 (gate rule, item 4); FR-015 |
| 2 | Each checkpoint ends the turn and asks for `/clear`. CP5 fires before every spec | N9; FR-016 |
| 3 | `/buildscope`, `/createSpecs` and `/implement` run in the main conversation, which fills the context | N9 "keep context small" |
| 4 | A phase exit gate that cannot be cleared stops everything | N11 2.6 |
| 5 | A Change Impact data-loss denial asks mid-run | N11 step 1 |
| 6 | Any failure in G.O.D.'s own scripts stops the run | wxgod.md Rules, "Stop and report a defect" |
| 7 | wxDesigner needs a person at the browser, but `--create` "answers SAVE itself" | N11 2.3 |
| 8 | The overnight machine-test gate and the testers' sign-offs mean one sitting never reaches Release | N8c steps 6, 8, 9 |

## Defects found in the method

| # | Defect | Where |
|---|--------|-------|
| X1 | Beta has no fix path: N8c step 10 sends Beta fixes through `/implement`, which refuses Beta. Beta also passes straight through, because its exit rule is already met (Manual open items 3 and 6) | N8c step 10 |
| X2 | Stale known-gaps row: "`/preTest` is only partly built — not part of N8c". N8c step 6 now runs `/preTest --nightly` (SPEC-140 shipped) | new-project.md, known-gaps table, `/preTest` row |
| X3 | N2 and N6 use `AskUserQuestion` menus. The review rules forbid menus, and the phone bridge cannot show them | N2, N6, N12 |
| X4 | A parallel helper waiting on a question (`asking`) holds its agent slot | N8b |
| X5 | `stoppedAt` holds a single stop. With a decision queue, resume has to handle several parked items | N10 |

## Decisions

| # | Decision | Kind |
|---|----------|------|
| 1 | **Hybrid decision queue.** After approval, a question the approved design does not cover is classified. **Low-risk:** G.O.D. takes the recommended answer, logs it as an assumption (`DQ-nn`, `kind: assumed`, with what it costs to undo) and continues. **High-risk:** the question is parked (`kind: parked`). Only the unit it belongs to, and the units that depend on it through the scope map's `dependsOn` edges, wait. Everything else continues. High-risk means any of: possible data loss, the shape of a shared table, money or billing, security, auth or permissions, legal or compliance, anything touching production, anything that contradicts an approved decision, or anything costly to reverse (more than about one unit of rework). Every item goes to `docs/GOD-Decisions.md` (live) and to `decisionQueue` in `GOD-State.json`. | Agreed |
| 2 | **Checkpoints do not stop a `--create` run.** Save the checkpoint and keep going. The client compacts on its own; after any compaction, re-read the state file before the next action, as the bridge rule already says. `/clear` is offered only at the end of a sitting. Amends FR-016 for `--create`. | Agreed |
| 3 | **Pipeline commands in helpers under `--create`.** `/buildscope`, `/validateScope`, `/createSpecs` and `/implement` each run in a helper agent with the existing return-the-question protocol (N8b). G.O.D. answers from the design or adds the question to the queue (decision 1). The main conversation holds the state, the logs and the tables. `/buildscope` and `/createSpecs` stay one at a time, so SCOPE and SPEC numbers never race. wxDesigner stays in the main conversation (browser). | Agreed |
| 4 | **Stuck phase gate.** The gate is parked as a high-risk item, and the phase stays "gate open" in the plan, with no gate commit. **Next-phase units that do not depend on any unit behind the stuck gate (transitively, by `dependsOn`) may start.** Units that do depend on it wait. Amends N11 items 2.6 and 3. | Changed (recommendation was to wait) |
| 5 | **Change Impact data-loss denial:** parked as high-risk. The unit waits and the others continue. The answer is still recorded only with `approve.mjs` once the user gives it. | Agreed |
| 6 | **G.O.D. script failures after approval:** the run stops only when continuing is unsafe (the state file cannot be written or read back, or the inventory or estimate is corrupt). Other failures, such as a PDF render, are logged in `repairs`, reported, and the run continues. Before approval, the stop rule stands as written. Amends FR-022. | Agreed |
| 7 | **"Design it" screens under `--create`:** G.O.D. runs wxDesigner, drafts the design and SAVEs it, then parks that scope's **screen tasks** for the end-of-run review. The scope's other tasks and all other units keep going. After the user approves or changes the design, the screen tasks are implemented. Amends N11 2.3 and FR-024. | Agreed |
| 8 | **No time budget.** No `--hours` flag. A sitting ends when no unit is ready and no helper is still running: everything is done, parked, or waiting on overnight tests or testers. The sitting runs built → code review → fixes → smoke test passed → nightly run scheduled, as far as the parked items allow. | Changed (recommendation was `--hours`) |
| 9 | **Readiness check at the N6 pause, before Approve.** List everything the run will later need that only the user can supply: UAT target and test logins (`/preTest --nightly`), test keys for each integration in the design, Claude in Chrome and Python (`/wxHelpGenerate`), database reach (`/wxDBAnalyze`), kit version (per-spec `/implement`, FR-017), a clean git tree, and the bridge. The user supplies each one now, or it is recorded as a known skip. | Agreed |
| 10 | **End-of-sitting run report and decision review.** Write `docs/GOD-Run-Report.md`: what was built, the gate answers (summary), the assumptions taken with their cost to undo, the parked questions with their recommendations and blocked units, repairs, defects filed, and the user's next steps (push, overnight run, testers). Then present every queued item at once, numbered, in plain text. The user can answer "all recommended". On `--resume`: an answered parked item releases its units and the run continues. A reversed assumption becomes a fix task through N8c step 5. | Agreed |
| 11 | **Beta (X1): a known gap for now.** Add it to the known-gaps table. Under `--create`, Beta passes through and Beta fixes are listed in the run report. The product decision stays with the Manual's open items 3 and 6. | Agreed |
| 12 | **X2:** correct the stale `/preTest` row. | Agreed |
| 13 | **X3:** under the bridge, N2 and N6 ask in numbered plain text. In the editor, menus stay where they are now. | Agreed |
| 14 | **X4:** add a `parked` implement status. A parked helper is ended, its slot is freed for the next ready unit, and on release the unit is re-run through `/implement`, which picks up its own remaining tasks. | Agreed |
| 15 | **X5:** resume reads `decisionQueue` as well as `stoppedAt`. It first shows the answered and unanswered items, applies the answers, then continues from `nextAction`. | Agreed |

## Resume — the actions, in order

Start with `git status` and `git log -3`, since another session may share the tree. Leave alone what other
sessions own: `docs/Facebook*.pdf`, the uncommitted SPEC-043 specs, `mcp-server/src/server.ts`.

1. **Spec first (SPEC-136 Amendment A).** In `specs/136-wxgod-development-manager/spec.md`:
   - add FR-037 to FR-043 (decision queue · checkpoints keep going · helpers for the pipeline · stuck gate
     and independent units · readiness check · run report and decision review · design-it parks screen
     tasks), plus the Beta known gap
   - amend FR-014, FR-015, FR-016, FR-018, FR-022, FR-024 and FR-029 with the amendment note
   - add a clarification session "2026-10-19 — seamless `--create`" carrying decisions 1 to 15 as Q37 onward
   - add a user scenario, US11: a 4-hour unattended run that ends with a decision review
   - add the matching tasks T040 onward to `tasks.md`
   - add one amendment line to `specs/Project-Scope/136-wxgod-development-manager.md`
2. **File the tasks** in wxKanban: `project.create_task` against SPEC-136, project
   `ba924193-0335-4080-9fa6-33cd6b81300a`.
3. **Edit the method** (direct edits; these are prompt Markdown, not fenced code):
   - `new-project.md`:
     - the N6 readiness check, and N6b design-it under `--create`
     - N8b (`parked` status, helpers for the pipeline)
     - N9 (`--create` keeps going)
     - N10 (`decisionQueue`, the `parked` status, resume)
     - N11 (decision queue, stuck gate, independent units, script failures, sitting end, run report)
     - N12 (numbered plain text, the queue posted to the room)
     - known gaps (Beta row added, `/preTest` row fixed)
   - `wxgod.md`: Modes, the Output table (`GOD-Decisions.md`, `GOD-Run-Report.md`), the Rules (`--create` bullets, stop-and-report, checkpoint), Resources
   - `document-templates.md`: templates for `GOD-Decisions.md` and `GOD-Run-Report.md`
   - `.claude/skills/wxG-O-D/SKILL.md` stub description: one clause on queued questions; keep it within the description limits
4. **Check:** run the mcp-server prompt-registry tests and build, and grep for leftover "asked, never guessed"
   and "stop the turn" wording that now contradicts the amendment.
5. **Cold read-through:** a helper with no context reads the amended `wxgod.md` and `new-project.md` and walks
   a 4-hour `--create` run on paper, listing every place it would still stop or meet a contradiction. Fix
   what it finds.
6. **Report.** No commit or push without Andy's word. Release path when told: push (MCP auto-deploys; probe
   `wxgod/references/new-project` live), then a kit release for the stub, then the Cockpit help catalog if
   it changes.
