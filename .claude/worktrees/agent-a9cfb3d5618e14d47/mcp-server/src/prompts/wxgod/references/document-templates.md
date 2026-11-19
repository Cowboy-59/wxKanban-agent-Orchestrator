# wxG-O-D document templates

Four documents, plus a fifth for a web-based system, written in this order (each feeds the next), all in `docs/`:

| # | File | Audience | Purpose |
|---|------|----------|---------|
| 1 | `GOD-Management-Plan.md` | Delivery team | The full G.O.D. analysis: every register, decision, and work package |
| 2 | `DEVELOPMENT-PLAN.md` | Delivery team | The build roadmap, written by G.O.D.'s roadmap step (§ 2 below); under `--create` also the progress record |
| 3 | `GOD-Process-Design-Flow.md` | Both | The diagrams (see `flow-diagrams.md`) |
| 4 | `GOD-Customer-Plan.md` | **The customer** | The final document: summary, timeline, database, roadmap, risks, decisions |
| 5 | `GOD-SaaS-Cost.md` | The user only; **internal, never customer-facing** | Web-based systems only, in either mode: the projected hosting cost, the five lowest-cost options plus AWS, and for a commercial app the price and margin (§ 5 below) |

Supporting files, kept in `docs/` so each can be re-run after edits:

- `GOD-Inventory.json`, written by `scripts/inventory.mjs`: the evidence file list.
- `GOD-Estimate-Input.json`, written by the skill.
- `GOD-Estimate.md`, written by `scripts/estimate-ai-time.mjs`.
- `GOD-Business-Rules.md`, the `BR-` register: every rule pulled out of the code plus the
  best-practice proposals, with their decisions (`business-rules.md`).
- Under `--create` only: `GOD-Decisions.md`, the live decision queue (§ 6), and
  `GOD-Run-Report.md`, written when each sitting ends (§ 7).

IDs are shared across all of these documents. `WP-007` means the same work package everywhere, and the
same goes for `GAP-`, `RISK-`, `ADR-`, `ASSUMP-`, `UI-`, `RI-`, `BR-`, `UP-`, and `Q-` IDs.

---

## 1. Management plan: `docs/GOD-Management-Plan.md`

Section numbers are fixed so references stay valid between revisions. A section that does not apply
keeps its heading and one line saying why. Never drop a section silently.

```markdown
# <Customer> — Development Management Plan

**Prepared:** <YYYY-MM-DD> · **Revision:** <n> · **Mode:** Standard | Conversion (<WinDev/WebDev | VB6 | Clarion | mixed>)
**Evidence:** <--dir list> · ProjectOverview.md · <conversion folders found> · <scope count> scopes

> Confidence labels: **Confirmed** · **Likely** · **Assumed** · **Unknown** · **Conflicting** · **Deprecated**.
> IDs are stable across revisions; a retired item keeps its ID with status Retired.
> Customer-facing summary: `GOD-Customer-Plan.md`. Roadmap: `DEVELOPMENT-PLAN.md`. Diagrams: `GOD-Process-Design-Flow.md`.

## 1. Executive Assessment
Objective · current-state confidence (High / Medium / Low, and why) · recommended delivery strategy ·
top five blockers and risks · major decisions required · recommended first increment.

## 2. Documentation and Artifact Intake Register
| ID | Artifact | Location | Type | Date/Version | Scope | Reliability | Coverage | Key Findings | Gaps/Conflicts |
Coverage is one of: Full · Sampled (n of N files) · Listed only · Unreadable (reason).
Open with the inventory's mode line and exclusion counts (gitignored, kit files, build folders,
lockfiles), so the reader knows what was not looked at. Then list each `secret`-bucket file by path
as "present, not opened".
Then three short lists: missing materials · contradictions · areas needing source, DB, runtime, or stakeholder validation.

## 3. System Understanding Report
Current architecture · functional areas and critical workflows · business rules (the register's
summary table by area, its open decisions, and a link to `GOD-Business-Rules.md`) · data model and
systems of record · integrations and operational dependencies · security and authorization model ·
infrastructure and deployment · technical debt · known unknowns.
3.1 User personas: one row per kind of person who uses the system. A persona is a person with goals;
    a role is a set of permissions. Each persona maps to one role.
    | ID | Persona | Role | Goals | Top tasks (3 to 5) | How often | Comfort with computers | Device and setting | Needs (accessibility, language) | Source |
    The source is the evidence (roles, permissions, and screens per role in the code), the overview,
    or "Proposed". The top tasks are the end-to-end journeys the test plan must cover. A persona's
    device and setting (a phone in a warehouse, a desktop in an office) shapes its screens. Cite evidence and label confidence in every subsection.
Link to the diagrams rather than repeating them.

## 4. Conversion Review
Standard mode: "Not applicable: no legacy artifacts or conversion output found."
Conversion mode, in this order:
4.1  Conversion inputs found: type(s), `pre-convert/` element counts by kind, `rebuild/` pages, db, and
     scopes counts, `_discarded.md` entries, `_redactions.md` (count only, never values),
     `--review` drift (missing / stale / orphaned), and the parity report if present.
4.2  Scope review: one row per conversion scope in `specs/Project-Scope/`:
     | Scope | Covers (pages, reports, procedures) | KEEP / MODERNIZE / DROP decisions | Findings (holes, ambiguity, missing acceptance criteria) | Maps to WP | Disposition |
     Then a coverage check: every `pre-convert/` element maps to at least one scope. List any that don't as GAPs.
4.3  Window and UI Artifact Inventory (persona table).
4.4  UI Conversion Specifications for material windows (persona format). Other windows stay as inventory rows.
4.5  Conversion Gap Register (persona table).
4.6  Legacy Artifact Traceability: legacy element → `pre-convert/` file → `rebuild/` artifact → scope → WP → disposition.
4.7  Characterization baseline plan for the critical workflows.
4.8  Data migration mapping (from `rebuild/db/` schema and ER): | Source Entity | Target Entity | Mapping Rule | Transformation | Validation | Reconciliation | Exceptions |
4.9  Migration strategy recommendation (persona § Choose Migration Strategy).
4.10 Conversion readiness gates. Tick a box only with evidence.

Scope decisions map onto persona dispositions: KEEP → Preserve, MODERNIZE → Modernize, DROP → Retire.
A recorded decision is evidence (Confirmed). Do not reopen it unless other evidence contradicts it; if it does, raise a GAP.

## 5. Gap and Risk Register
| ID | Category | Finding | Evidence | Impact | Likelihood | Priority | Resolution | Owner | Required Before |
P0 to P3 as the persona defines them.

## 6. Decision and Assumption Logs
6.1 ADR index: | ADR ID | Decision Needed | Options | Recommendation | Rationale | Decision Owner | Deadline | Status |
6.2 Assumption register: | ID | Assumption | Why Needed | Validation Method | Risk if Wrong | Owner | Status |
Interview answers the user didn't give are recorded here as Assumed, along with the default used.

## 7. Target Architecture
Architecture style and boundaries · API, event, and file contracts · authentication and authorization ·
background work · observability · environments · design rationale and tradeoffs.
7.1 Deployment and database: the full three-model comparison from `database-options.md`, the
    recommendation, and the ADR it rests on. For a web-based system, name the ★ option from
    `GOD-SaaS-Cost.md`; its prices stay in that document.
7.2 Data model and referential integrity (see `data-integrity.md`): the table list, a pointer to the
    ERD in `GOD-Process-Design-Flow.md` § 5, and the full `RI-` suggestion table.

## 8. Development Plan
| Phase | Objective | Deliverables | Dependencies | Risks | Exit Criteria | Release Gate |
Must match `DEVELOPMENT-PLAN.md` exactly: same phases, same WPs.

## 9. Agent Work Package Backlog
Full persona format for every P0 and P1 package and every package in the first two phases.
Later P2 and P3 packages may use a condensed row and get expanded when their phase is next:
| WP | Title | Phase | Role | Complexity | Risk | Uncertainty | Depends on | Acceptance (one line) |
Every package carries Complexity (XS / S / M / L / XL) and Uncertainty (low / medium / high).
The estimator reads both. Split XL packages where possible: one agent should finish a package.

## 10. Dependency and Execution Plan
| Work Package | Depends On | Can Run in Parallel With | Integration Order | Blocking Condition |
Then the full `GOD-Estimate.md` content (options, summary, phase milestones, team-size sweep, critical
path, method), pasted verbatim.

## 11. Test and Quality Strategy
## 12. Release, Migration, and Rollback Plan
## 13. Open Questions
| Q-ID | Question | What it changes | Blocks | Ask whom |
Only questions whose answer changes scope, architecture, priority, risk, sequencing, or acceptance.

## Revision History
| Rev | Date | Change | Evidence added |
```

---

## 2. Development plan: `docs/DEVELOPMENT-PLAN.md`

The build roadmap: the page a developer reads first when returning to the project. It answers
"where am I, what's built, what do I build next, and what's in the way." It used to come from the
separate `dev-plan` skill; that skill is retired and this section is its replacement. The server's
deterministic `devplan` document (the Dev Cockpit "Development Plan" panel) is a different thing
and is not touched.

**Units.** What a row in the plan is depends on how G.O.D. was run:

| Run | One unit is | Dependency edges come from |
|-----|-------------|----------------------------|
| Plan mode | A work package (`WP-`), grouped by the management plan's phases | The management plan § 10 |
| New-project mode and `--create` | A scope from `docs/GOD-Scope-Map.md` (`S01`, `S02`…) | The scope map's `dependsOn` |
| `--roadmap` | An implementation spec (`specs/###-*/`) | Each spec's explicit "depends on" lines, plus implicit ones the prose proves (a shared table, a service one produces and another consumes) |

In plan mode, if the project also has `specs/###-*/` folders, include them as units too. WP IDs,
phases, and dependency edges must match the management plan exactly: the two documents are one plan
seen two ways. Every edge traces to evidence; never invent one.

**Status vocabulary** (use everywhere):

| Marker | Emoji | Mermaid classDef | Meaning |
|--------|-------|------------------|---------|
| `[x]`  | 🟢 | `done`     | built and verified |
| `[~]`  | 🟡 | `partial`  | in progress or partially built |
| `[ ]`  | 🔴 | `todo`     | not started (scoped) |
| `[ ]`  | ⚪ | `unscoped` | not yet scoped: needs `/buildscope` and `/createSpecs` first |

**Pipeline column (new-project mode and `--create` only).** The status table carries one more
column, the unit's place in the pipeline, which G.O.D. updates as each command completes. This is
what makes the plan the progress record:

| Pipeline value | Set when | Colour |
|----------------|----------|--------|
| `draft` | The scope draft exists in `docs/god-scopes/` | `unscoped` |
| `scoped SCOPE-NNN` | `/buildscope` wrote the scope file | `todo` |
| `validated` | `/validateScope` passed and the requirements check passed | `todo` |
| `specified SPEC-NNN` | `/createSpecs` wrote the spec(s) and the tasks landed | `todo` |
| `designed` | wxDesigner saved `page.md` (only for scopes marked "design it") | `todo` |
| `designed (screens held)` | `--create`: G.O.D. saved the design itself, and the screen tasks wait for the user's review (`new-project.md` § N11 item 2.3) | `todo` |
| `implementing` | `/implement` started | `partial` |
| `parked` | `--create`: a high-risk question for this unit waits in the decision queue (§ 6) | `partial` |
| `screens held` | `--create`: every task is `done` except the held screen tasks | `partial` |
| `implemented` | Its tasks are `done` and its test plan exists | `done` |

Every value is copied from the command's own output, never predicted. On `--resume`, check each
value against the command's artifacts and believe the artifacts.

**Mermaid classDef block** (paste verbatim, then style each node):

```text
flowchart TD
  classDef done fill:#2ecc71,stroke:#1e8449,color:#0b3d20
  classDef partial fill:#f1c40f,stroke:#b7950b,color:#3a2f00
  classDef todo fill:#e74c3c,stroke:#922b21,color:#fff
  classDef unscoped fill:#95a5a6,stroke:#5d6d7e,color:#fff,stroke-dasharray:4 3
```

Diagram rules that keep it renderable:

- One `subgraph P0[Phase 0 - Foundation] ... end` per phase. Avoid `·`, `&`, parentheses, and `/`
  inside `subgraph` titles and node labels; use ` - ` and " and " instead (they break the parser in
  some versions). Node labels are a short ID plus a short title, e.g. `S011[011 Auth and AuthZ]`.
- Apply a class to every node: `S005[005 AI Chat Panel]:::todo`.
- An arrow `A --> B` means **B depends on A** (build A first). Fan out with `&` between node IDs:
  `S003 --> S001 & S011 & S017`.

**Skeleton.** Keep the section order: the "read me first on re-entry" purpose depends on it being
front-loaded.

```markdown
# <Project> — Development Plan

**Last Updated:** <date> · **Phase:** <lifecycle phase> · **Snapshot date:** <source date>

> **This file is the editable source of truth.** Change any step, then run
> `node .claude/skills/wxG-O-D/scripts/build-devplan-pdf.mjs docs/DEVELOPMENT-PLAN.md docs/DEVELOPMENT-PLAN.pdf`
> to regenerate the PDF. Flip a step's status by changing its marker: `[ ]` not started ·
> `[~]` in progress · `[x]` done. Outside a `--create` run this is a snapshot; the live status is
> the project's dashboard.

---

## ▶ START HERE
- **Where I am:** <current phase, one line>
- **What's deployed:** <what is live and what is not>
- **Single next action:** <the one next thing>
- **Nearest blocker:** <the closest thing in the way, e.g. an unscoped unit on the path>

---

## Status at a glance
<table: Unit | Title | State (emoji + %) | Pipeline (new-project and --create only) | Remaining>

Legend: 🟢 built · 🟡 partial · 🔴 not started · ⚪ not scoped.

---

## Dependency map
<one-line how-to-read, then the mermaid flowchart grouped into phase subgraphs>

**Critical path — the units that unblock the most:** <2 to 4 bullets>

---

## Phase 0 … N
Per phase: a one-line intent, a checkbox list of its units (status marker + short remaining), and
an **Exit gate:** line saying what "done enough to move on" means, in checkable terms.

---

## How to regenerate the PDF
`node .claude/skills/wxG-O-D/scripts/build-devplan-pdf.mjs docs/DEVELOPMENT-PLAN.md docs/DEVELOPMENT-PLAN.pdf`
```

**Phasing heuristic (foundation-up).** Order phases so each depends only on earlier ones. A
reliable default:

1. **Foundation**: identity and auth, transport, the core data model.
2. **The shippable slice**: the set of features that can go live first (mark it LAUNCH).
3. **Differentiator layer**: the interdependent feature cluster that defines the product.
4. **Security and compliance**, then **packaging and delivery**, then **operations and extras**.
5. **Release**: review, tests, QA, user acceptance, help, beta, and release, as
   `new-project.md` § N8c orders them. Each stage's exit gate is the scope's own automatic advance
   (SPEC-123) and the test gate it needs, so the plan shows who clears it (the overnight run, the
   testers). It is not a build phase. Under `--create`,
   N8c carries it out per scope, and the § N11 phase loop never scopes it.

Derive the actual grouping from this project's units and edges; never hard-code another project's
phases. Surface, never drop, a unit referenced as a dependency that has no scope or spec yet: mark it
`unscoped` (grey, dashed) and call it out as a blocker if it sits on the launch path.

**Exit gates.** Each phase's exit gate is the condition `--create` checks before the next phase
starts (`new-project.md` § N11). Write it so a read-only check can decide it: "every unit in the
phase is `implemented` with its test plan filed, and <the phase's own condition>". A gate that
needs a human judgment says whose.

---

## 4. Customer document: `docs/GOD-Customer-Plan.md`

The final document the customer reads and signs off. It is written for a business owner and their IT
lead, so use plain language. A term that needs explaining gets one clause of explanation, not a
glossary. No internal tooling names: no kit, no orchestrator, no `SCOPE-` numbers, no file paths
except in the appendix.

Every number comes from the working documents. Do not round, restate, or re-derive the estimate;
copy the tables from `GOD-Estimate.md`.

```markdown
# <Customer> — <Project name> Development Plan

**Prepared for:** <Customer> · **Prepared by:** <from interview> · **Date:** <YYYY-MM-DD> · **Version:** <n>

## 1. Summary
One page. What we will build or convert (two sentences) · the recommended approach · time to
completion for the two options, the quickest team and the most agents our build machine can run at
once (expected to pessimistic range), and **which one we recommend and why** · the recommended database and
hosting · the three most important risks · the decisions we need from you.

## 2. What We Reviewed
Plain summary of the evidence: how many files, which folders, which conversion outputs and scopes, and
the project overview. State the coverage honestly. If something was sampled, say so.

## 3. Your System Today
A short description of the current system, plus the current-state diagram.

## 4. The New System
Target design in plain terms, plus the target design-flow diagram. What stays the same for users,
what improves, and what is retired (with each retirement's approval status). Then the business rules
that change, in plain words and with the reason for each: two to five points, the most important
first. Business rules still waiting for a decision go in § 9.

## 5. How We Will Deliver It
The delivery-process diagram. For each phase: what you will see at the end of it, and what you need
to approve before the next phase starts (the exit gate in business terms).

## 6. Time to Completion
One paragraph on the delivery model: AI agents do the build work in parallel, and a human engineer
reviews and approves each piece before anything builds on it.
Then, copied from `GOD-Estimate.md`: the options line, the summary table, and the phase milestones
table. The estimate gives two options:
- Option 1, the quickest team: the team size that finishes soonest.
- Option 2, the machine maximum: the most agents our build machine can run at once.
- When both are the same team, there is one option. Say so.
Then the recommendation, in one or two sentences: Option 1 when the machine can run it, otherwise
Option 2. Say why more agents are not always quicker, using the last sentence of the estimate's
Team-size sweep, in plain words (for example: "Past
4 agents, extra agents mostly wait on the dependency chain and add coordination overhead, so 5
agents finish a day later"). If the options are limited by human review, a second reviewer helps
more than more agents. Say so.
Then the critical path in plain words, and what is not included (customer sign-off time, access
delays, holidays).

## 7. Database and Hosting Recommendation
The side-by-side table (Internal office · Cloud · Distributed) from `database-options.md`, with the
recommended column marked **★ Recommended**. Below it: why, in three to five bullets tied to the
customer's own answers. If this is a conversion, add a line on how the legacy data moves.
Then **Your data model**: the core ERD, plus two to five plain-language referential-integrity points,
highest severity first (see `data-integrity.md` § In the customer document).

## 8. Risks and How We Manage Them
The P0 and P1 risks in plain language: | Risk | What could happen | How we prevent it | What we do if it happens |

## 9. Decisions We Need From You
| Decision | Options | Our recommendation | Needed by |

## 10. Assumptions
What the plan and estimate rest on, especially anything marked Assumed. "If this turns out
differently, the estimate changes by …" where you can say it.

## 11. Next Steps
The first increment, what happens in week one, and what we need from you to start (access, data
samples, contacts, sign-offs).

## Appendix: Working Documents
The management plan, development plan, process and design flows, and estimate, each with its file
name. These hold the full detail behind this summary.
```

---

## 5. Projected SaaS cost: `docs/GOD-SaaS-Cost.md`

Written in either mode for a web-based system (or one both web-based and installed). The research
procedure is `database-options.md` § Projected SaaS cost. It is an **internal** document, never
customer-facing: it holds the planned price and margin. Never copy a figure from it into the
customer document, which keeps cost tiers, and never list it in that document's appendix. Write it
in plain language all the same.

```markdown
# <Customer> — <Project name> Projected SaaS Cost

> **Internal — not for customers.** Holds pricing and margin.

**Prices checked:** <YYYY-MM-DD> · **Currency:** US dollars per month, before tax · **Region:** <region, and why>

> An estimate, not a quote. List prices change: check them again before you rely on a figure.

## 1. Summary
The ★ recommended option and its monthly cost at launch and after 12 months; the cheapest option
and AWS beside it; and in two or three sentences why the recommendation, including who runs what.

## 2. What It Is Sized For
| Measure | Launch | After 12 months | Source |
Rows: named users · peak users · paying customers (commercial only) · database size · file storage ·
data transfer out · email per month. The source is an interview answer or an `ASSUMP-` ID.

## 3. What It Needs
| Item | Why the design needs it | Launch size | 12-month size |

## 4. The Options
| | Option 1 | Option 2 | Option 3 | Option 4 | Option 5 | AWS (reference) | Today (if known) |
Rows: provider or mix · app hosting · database · file storage · data transfer · email · other ·
**total per month at launch** · **total per month after 12 months** · **per year after 12 months** ·
who runs what (managed or self-run) · meets the recovery target (D6) · meets the service level (D8) ·
watch out for.
Ranked by the 12-month total. Mark one column **★ Recommended**. The Today column appears only for
an existing hosted system whose current bill the user gave or the evidence shows. A commercial app adds a row:
**cost per paying customer per month**, at launch and after 12 months.

## 5. Options Ruled Out
| Provider | Why it does not qualify |

## 5a. Price and Margin (commercial only)
| | ★ Option, launch | ★ Option, 12 months | AWS, launch | AWS, 12 months |
Rows, per plan when there are several: cost per paying customer · planned price · margin per
customer · margin % of price. Then the break-even line: about N paying customers cover the monthly
total. With no planned price: the break-even price only, and the line "No planned price given."

## 6. Sources
| Provider | Item | Price used | Page | Checked on |
Every price in § 4 appears here. A price that could not be researched says "not researched" and why.

## 7. Assumptions
Each `ASSUMP-` behind a number, and what changes if it is wrong ("at 50 customers instead of 10,
the recommended option costs about …").
```

Render it with the others (`SKILL.md` step 11).

---

## 6. Decision queue: `docs/GOD-Decisions.md` (`--create` only)

For the user, not the customer. It is the live view of `decisionQueue` in the state file
(`new-project.md` § N11, The decision queue), written as each item is added and as each is answered
and applied. The two must always match. Markdown only: no PDF.

```markdown
# <Project> — Decisions Taken and Waiting (G.O.D. `--create`)

Approved design: <planApprovedAt> · Sitting <n> · <N> open (<p> parked, <r> to review, <a> assumed)

## Parked — waiting for you
| # | Unit | Asked by | Question | G.O.D. recommends | Why high-risk | Blocks |
|---|------|----------|----------|-------------------|---------------|--------|
| DQ-02 | S06 Refunds | /implement | May a refund exceed the original charge? | No: cap at the amount charged | Money | S06, S08 |

## Data loss — answer each by its number ("all recommended" never covers these)
| # | Unit | Change denied | What could be lost | approve.mjs command |
|---|------|---------------|--------------------|---------------------|

## Designs to review — the screen tasks wait, nothing else does
| # | Unit | Design | Screen tasks held |
|---|------|--------|-------------------|
| DQ-03 | S05 Bookings | specs/005-bookings/page.md | T012, T013 |

## Assumed — taken so the run could go on
| # | Unit | Asked by | Question | Answer taken | Cost to undo |
|---|------|----------|----------|--------------|--------------|
| DQ-01 | S04 Exports | /createSpecs | ISO or locale dates in exports? | ISO 8601 | One task |

## Answered and applied
| # | Answer | Source | Applied |
|---|--------|--------|---------|
```

One row per item, one line each. A question is written so the user can answer it without opening
anything else. Never put a secret value or personal data in a row.

---

## 7. Run report: `docs/GOD-Run-Report.md` (`--create` only)

For the user, written when each sitting ends (`new-project.md` § N11, Sittings). Each sitting adds a
new section at the top, so earlier sittings stay readable. Markdown only: no PDF.

```markdown
# <Project> — Run Report (G.O.D. `--create`)

## Sitting <n> — <start> to <end>
**Where it stopped:** <"No unit is ready" or "You said stop">. <One plain sentence: what everything is waiting on.>

### 1. Built
| Unit | SCOPE | SPEC | Pipeline status | Commit |
|------|-------|------|-----------------|--------|

### 2. Phase gates
| Phase | Gate | Status (passed / gate open, and why) |
|-------|------|--------------------------------------|

### 3. Gate answers G.O.D. gave
Totals by command, and the few that shaped the build most, each with its source in the design.
The full list is `gateLog` in `docs/GOD-State.json`.

#### 3a. Questions answered from the ledger
Always present. One row per `gateLog` entry sourced from the ledger. When there are none, write
"None this sitting."
| Ledger ID | Unit | Asked by | Question | Answer used |
|-----------|------|----------|----------|-------------|

#### 3b. Assumptions logged
Always present. One row per entry in `decisions/assumptions.yaml` added this sitting. When there
are none, write "None this sitting."
| Time | Unit | Question | Default chosen | Agent | Reviewed |
|------|------|----------|----------------|-------|----------|

#### 3c. KAIN's answers awaiting your review
Always present. One row per pending entry from `node _wxAI/askgate/kain.mjs list --json` (SPEC-142
Amendment A): KAIN answered these acting as you, the work went on, and none is a decision until you
approve it. When there are none, write "None awaiting review." Close with: review them with
`/wxLedger review`, or `KR-nnnn approve | change: <answer> | reject` in the room.
| Reply | Queue item | Unit | Question | KAIN answered |
|-------|------------|------|----------|---------------|

### 4. Decisions for you
The decision review: every open item from `docs/GOD-Decisions.md`, numbered, the parked items
first, then the designs to review, then the assumptions, each with the recommendation or the
assumption taken, and what it blocks or costs to undo. Answer by number, or "all recommended",
except the data-loss items, which are listed apart and answered only by their own numbers.

### 5. Repairs and defects filed
| Unit | Command | What G.O.D. wrote or fixed | Defect filed |
|------|---------|----------------------------|--------------|

### 6. Skipped, and known gaps met
The N6c known skips, the steps they skipped, and the Beta fixes listed (`new-project.md` § N8c
step 10).

### 6a. Model tier proposals
From `docs/agent-cost-report.md` (SPEC-143). Evidence only; the owner approves, and G.O.D. changes nothing. When there are none, write "None this sitting."
| Class | From | To | Comparisons | Cost per task (from, to) | First-pass % (from, to) | Flag |
|-------|------|----|-------------|--------------------------|-------------------------|------|

### 7. Your next steps
1. Answer section 4.
2. Review and push the local commits (G.O.D. never pushes).
3. The overnight full test: scheduled, or what is missing to schedule it.
4. Human tests: who signs which, by persona.
5. Run `/wxG-O-D --resume` to start the next sitting.
```

---

## Explorer brief (step 4)

Give this to each read-only Explore agent, with `<dir>` filled in:

```text
You are a read-only evidence analyst for a development-planning engagement.
Folder: <folder>   (sub-area: <path>, if the folder was split)
Your files are the entries in docs/GOD-Inventory.json whose "path" starts with "<folder>/" (or, for
"(root files)", the entries with no "/"). Read only those. Never open an entry whose bucket is
"secret"; report it as present. Anything not in the inventory is gitignored or a wxKanban kit file
and is out of scope.
Do not create, edit, move, or delete anything.

Return Markdown with these parts:
1. Intake register rows:
   | Artifact | Location | Type | Date/Version | Scope | Reliability | Coverage | Key Findings | Gaps/Conflicts |
2. Findings. Each one gets a file:line citation and a confidence label (Confirmed / Likely / Assumed /
   Unknown / Conflicting / Deprecated). Group them under: business workflows and rules · roles and
   permissions · data entities, keys, volumes, and systems of record · integrations and external
   dependencies · UI artifacts (windows, pages, dialogs, reports, menus) · configuration, deployment,
   hosting, and operations · security observations · technical debt and dead code · existing tests.
3. Deployment signals: anything that shows where and how the system runs today (servers, sites,
   offices, cloud services, connection strings by location only, user counts, data sizes).
4. Conversion output, if present (pre-convert/, rebuild/, _discarded.md, conversion scopes): counts by
   kind, plus anything not captured or out of step.
5. What you could not read or chose not to, and why. If you sampled, say which files and how many of how many.
6. Contradictions between files.

Rules: cite, don't paraphrase from memory. Never copy a secret: credentials, tokens, keys,
connection-string values, and personal data are reported by location only. If a value looks like a
credential, or a nearby comment names a credential field, treat it as one.
```

---

## Estimate input: `docs/GOD-Estimate-Input.json`

Build it from section 9 of the management plan. One entry per work package; the IDs, phases, and
dependencies must match the plan exactly.

```json
{
  "customer": "<Customer>",
  "startDate": "<YYYY-MM-DD from the interview; omit if unknown>",
  "teams": "sweep",
  "sweep": { "from": 2, "to": 12 },
  "maxAgents": 5,
  "machine": {
    "checked": "<YYYY-MM-DD>",
    "cpu": "<CPU model>",
    "threads": 16,
    "totalGB": 63.8,
    "freeGB": 28.5,
    "threadsPerAgent": 2,
    "gbPerAgent": 5,
    "reserveGB": 12,
    "headroomGB": 4,
    "byCpu": 8,
    "byMemoryMax": 10,
    "byMemoryNow": 4,
    "cap": 5,
    "machineMax": 5,
    "limitedBy": "your cap",
    "rightNow": 4
  },
  "reviewers": 1,
  "hoursPerDay": 8,
  "workDaysPerWeek": 5,
  "coordinationOverheadPerExtraAgent": 0.1,
  "workPackages": [
    {
      "id": "WP-001",
      "title": "Repository, CI and environments",
      "phase": "2 - Architecture and delivery foundation",
      "complexity": "S",
      "uncertainty": "low",
      "dependsOn": []
    }
  ]
}
```

`"teams": "sweep"` schedules every team size from `sweep.from` to `sweep.to`. The `sweep` block is
optional: without it the range is 2 to 12, and it always reaches `maxAgents`. `maxAgents` and
`machine` are written by `machine-capacity.mjs --write` (step 7), so don't type them by hand unless
the agents will run on another machine (then record it as an ASSUMP). The estimator only echoes
`machine` in the report. A list such as `"teams": [2, 3]` still works: it schedules only those
sizes, with no options.

Optional: `rates` overrides the complexity table (`{ "M": { "agent": 5, "review": 1 } }`), and a
per-package `agentHours` / `reviewHours` overrides its complexity. Use an override only with a
stated reason, and record that reason as an ASSUMP.
