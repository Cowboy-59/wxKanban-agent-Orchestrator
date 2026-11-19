# New-project mode — from a ProjectOverview.md to a built project

Used when the user passes a `ProjectOverview.md` (step 0 of `SKILL.md`) and confirms the project is
**new**. G.O.D. reviews the overview, expands it into the full design and the usual documents, pauses
for review and brainstorming, and then — only on the user's go — drives the wxKanban pipeline:

```text
review overview → new project? → best-practice business rules drafted
  → brainstorm the idea? (commercial? web or installed? business rules, then more ⇄ continue) → interview → expand + documents (+ projected SaaS cost when web-based)
  → PAUSE: review + brainstorm (more ⇄ continue)
  → style for all screens + design-or-build per screen (N6b) → plan approved
  → /buildscope per scope → verify every scope → /createSpecs per scope → verify specs + tasks
  → wxDesigner for the screens chosen
  → /implement per spec, in parallel where the plan allows (runs /wxCreateTestPlan) → final verification
  → N8c: reviews, parity, tests, QA, UAT, help, beta, release (each scope advances its own stage)
```

With **`--create`** the same commands run phase by phase instead of all scopes first, the design
review in N6 is the only pause G.O.D. adds, and from then on G.O.D. completes the process itself
(N11). Either way, when the project's Project Agent is running, G.O.D. offers once to continue
unattended through HANDOFF REMOTE (N12).

**Without `--create`, G.O.D. orchestrates; it never substitutes.** Each pipeline step runs the real
command and follows **all** of that command's own rules, exactly as the command (or its
server-delivered prompt) states them: its compliance-context load, reuse check, interview, approval
gates, file outputs, numbering, and prohibitions. G.O.D. never writes a scope, spec, task, test
plan, or line of code itself (the only exceptions are the user-approved repairs in the last table,
including filing an approved fix as a task in N8c), never answers an approval gate on the user's
behalf, never adds `--quick`, never runs git, and never pushes.

**Under `--create`, G.O.D. completes the process.** The commands still run under all of their own
rules, but wherever one asks the user, G.O.D. answers from the approved design and logs the answer
(`gateLog`); it repairs what a failing command or kit gap leaves (`repairs`); and it commits each
finished unit locally. It never pushes, deploys, touches production, or signs off a human test
(N11). Where a step below says "with the user's OK" or "the user's call", under `--create` that is
G.O.D.'s logged decision from the approved design. What the design does not cover goes to the
**decision queue** (N11), not to the user mid-run. A low-risk item is taken as a logged assumption,
and a high-risk item is parked so only its own unit waits. The user answers the whole queue at once
when the sitting ends. Wherever a step below says something "is asked" or "stops" under `--create`,
N11 § The decision queue is what happens.

**Menus and the Project Agent.** Where a step below uses `AskUserQuestion`, a session running under
the Project Agent (N12) asks the same choices as numbered plain text instead, since the phone shows
no menus. In the editor the menus stay.

## N1. Read and review the overview

Read the passed file in full. Then run `inventory.mjs` (step 3 of `SKILL.md`) so you know whether
the project tree is really empty: existing code, specs, or scopes change the answer to N2. Run
`machine-capacity.mjs` as well (step 1 of `SKILL.md`): its machine maximum limits the implementing
agents (N8b) and pre-fills interview question T5. It does not limit the read-only helpers.

Review the overview as a principal architect and present the review in chat:

| Check | What to look for |
|---|---|
| Purpose and problem | Is the business problem stated, and is it specific? |
| Users and roles | Who uses it, how many, which roles and permissions? |
| Features | Each capability named; which are MVP and which are later? |
| Data | The main things the system stores; any data to import or migrate? |
| Integrations | Other systems, payment, email, identity, devices, files |
| Non-functional | Security, compliance, availability, performance, scale, offline use |
| Constraints | Budget, deadline, required stack or hosting, regulations |
| Success | How the customer will know it worked (measurable) |
| Out of scope | What it will deliberately not do |

For each row give **Stated** (quote the overview), **Thin** (mentioned, not usable yet), or
**Missing**, and list any contradictions. Label what the overview states as **Confirmed** (source:
the overview). Everything G.O.D. adds later is **Assumed** until the user approves it.

## N2. Ask whether this is a new project

Use `AskUserQuestion` (under the bridge, numbered plain text), pre-filling what the inventory found
("The tree holds 0 code files and no specs" or "The tree already holds 140 code files and 12
specs"):

- **New project — design and build it from this overview** → continue with N3.
- **Existing project — assess the code and folders too** → leave this mode; run the normal workflow
  (`SKILL.md` step 1 onward) with the overview as primary context.
- **Review only** → stop after the N1 review.

If the user says "new" but the inventory shows substantial existing code or specs, say so and ask
once more; never overwrite or renumber existing scopes or specs.

**With `--create`,** the user has already said "new": skip this question unless the inventory shows
substantial existing code or specs, in which case say so and ask it.

Create `docs/GOD-State.json` now (format in N10) with `"mode": "new-project"`, or `"mode": "create"`
under `--create`. Under `--create`, first read `git status --porcelain --untracked-files=all` and
record every file it shows in `preexistingChanges`, file by file. Leave out G.O.D.'s own files,
here and at every later re-read: the `docs/GOD-*` files (the N1 inventory has already written one),
`docs/god-scopes/`, `docs/DEVELOPMENT-PLAN.md` and its PDF, and this run's brainstorm records in
`docs/brainstorms/`. N6c R6 reads the list again after the user's clean-up.

Then draft the business rules. A new project has no code to pull rules out of, so write
`docs/GOD-Business-Rules.md` with the best-practice rules that fit the idea, area by area, each
labeled **Best practice (proposed)**, as `references/business-rules.md` says. Add the rules the
overview itself states, with the source "Overview". This is G.O.D.'s working draft: nothing in it is
Confirmed until the user approves it.

Then, for a new project, ask with `AskUserQuestion` (under the bridge, numbered plain text):

- **Brainstorm the idea first** — discuss the overview before any design is written (N2b).
- **Continue with the current path** — go to N3.

If the user passed `--brainstorm`, skip this question and go straight to N2b. Under `--create`
without `--brainstorm`, skip it and go to N3: the design review in N6 is where `--create` discusses
the idea.

## N2b. Brainstorm the idea (optional)

A design conversation held **before** anything is designed, so its conclusions shape the design
instead of revising it afterwards. Set `"phase": "idea-brainstorm"` in the state file.

- **Open with three questions: who it is for, commercial or not, then web-based or installed.** Ask
  them first, as agenda items 1 to 3, exactly as `references/review-and-brainstorm.md` § Opening questions
  says: its wording, the overview as the evidence for pre-filling them, its recording rules, and
  what each answer adds. Settle all three before the first "brainstorm more or continue". For an
  internal build, the build-vs-buy or competitors topic in that section comes next. For example:
  "The overview says salons will pay a monthly subscription, so it is commercial. Correct?"
- **Then the business rules.** After those (and build vs buy, for an internal build), the next
  agenda items are the business rules, one area at a time, as
  `references/business-rules.md` § Discussing them says: the rules the overview states, then the
  best-practice proposals, each adopted, changed, or declined by the user. A project with no code
  starts its discussion of the idea here, so these come before every other topic.
- **Then the user personas.** Draft the personas the idea needs from the overview and the roles it
  names, in the format of `references/document-templates.md` § 1 (management plan § 3.1), each
  marked Proposed. Go through them one at a time: who they are, what they need to get done, and on
  what device. Add the ones the overview missed (an approver, a customer's own staff, a support
  person). Agreed personas are recorded like any decision.
- **Agenda.** Start from the N1 review and number every item after those: each Thin or Missing
  row, each contradiction, and G.O.D.'s first three challenges or alternatives to the idea as written (a
  smaller first release, a different shape of product, a risk the overview underrates). The user may
  raise anything else instead.
- **Conduct.** Hand the brainstorm to wxBrainstorm (`references/review-and-brainstorm.md`
  § Brainstorming: run by wxBrainstorm) with this agenda, the overview, and the N1 review as its
  evidence; there is no application to search yet. As the Lead Architect, G.O.D. challenges
  assumptions and proposes alternatives, one topic at a time. Nothing goes into the planning
  documents yet.
- **Record.** When the user closes a topic, wxBrainstorm shows its summary and offers G.O.D.'s
  choices. Once they approve it, wxBrainstorm writes its record and the learnings file, and G.O.D.
  appends each decision to `docs/GOD-Brainstorm.md` with the agenda number and the source
  "brainstorm (idea), YYYY-MM-DD". Open items stay listed. Both files survive a `/clear`.
- **After each topic, or whenever the user pauses,** ask in plain text (no menu) whether to
  brainstorm more or continue:
  - **Brainstorm more** — take the next topic, or one the user names.
  - **Continue with the current path** — go to N3.

From here on, every decision in `docs/GOD-Brainstorm.md` counts as **Confirmed** (source:
brainstorm). The interview pre-fills from these decisions and skips the questions they settle, and
the design follows them. Where a decision contradicts the overview, the decision stands, and the
overview line is noted as superseded.

## N3. Interview

Run `references/interview.md` with the overview and `docs/GOD-Brainstorm.md` (if it exists) as the
evidence (pre-fill from them; ask only what they could not answer), plus these new-project questions. Same rules: batch choices, ask only questions
whose answer changes something, record the unanswered as `ASSUMP-` with the default.

| # | Question | What it drives | Default if unanswered |
|---|----------|----------------|-----------------------|
| NP1 | What must the first release (MVP) contain, and what can wait? | Phases, scope order | The overview's features, all MVP, flagged ASSUMP |
| NP2 | Which user roles exist, and what may each one do? | Actors, permissions, auth design | One admin role and one standard role |
| NP3 | Is there existing data to import (spreadsheets, an old system)? | Migration work packages | None |
| NP4 | Which outside systems must it talk to on day one? | Integration scopes | Only those the overview names |
| NP5 | Web-based (used in a browser, hosted on a server), installed (on each computer or an office server), or both? A mobile app as well? Any branding or style guide? | Stack, UI work packages, the projected SaaS cost (web-based), the installed-app items (installed) | From `stack.md`, else web-based |
| NP6 | Anything it must never do (compliance, data that may not leave a country)? | Constraints, hosting | Recorded as ASSUMP |
| NP7 | Will it be commercial (sold or licensed to others), or for your own organization's use? | The commercial items in N4; NP8 | Own use, flagged ASSUMP |
| NP8 | Commercial only: how many paying customers at launch and after 12 months, and about how many users each? | Sizing of the projected SaaS cost; cost per paying customer | One customer of the D2 size at launch, ten after 12 months, flagged ASSUMP |
| NP9 | Commercial only: what will each customer pay per month, per plan if there are several? | The price and margin in the projected SaaS cost (internal, never customer-facing) | None: the document shows the break-even price only |
| NP10 | Are you building this for your own organization (internal build), or for a customer (consulting)? | Build vs buy or competitors (internal builds only) | Consulting when `--customer` names another organization, else internal, flagged ASSUMP |

NP10, NP7, and NP5 are the brainstorm's opening questions (N2b). When the brainstorm settled them, show the
answers as Confirmed and do not ask again; when it was skipped, ask them here.

## N4. Expand the design

Turn the overview plus the answers into a full design. Number everything with the persona's ID
scheme and label every expansion **Assumed (proposed)** until approved.

- **User personas** (`UP-###`): the agreed personas, plus any still proposed, in the management
  plan § 3.1 format. Every feature names the personas it serves, and every persona's top tasks are
  covered by some feature. A persona with no feature, or a feature with no persona, is raised in N6.
- **Feature catalog** (`FEAT-###`): each feature with its purpose, actors, user stories, functional
  requirements (each testable, with acceptance criteria), the data it touches, and its priority
  (MVP / later).
- **Actors and permissions**: a role-by-capability table, with each persona's role.
- **Data model**: entities, fields, keys, and relationships, drawn as the ERD with the `RI-`
  suggestions from `references/data-integrity.md`, applied to the *designed* model.
- **Screens and navigation**: the main screens per role and how users move between them.
- **Integrations, security, and operations**: per the persona's Required Analysis Domains.
- **Architecture and database**: from `stack.md`, else recommended; the database choice per
  `references/database-options.md`.
- **Business rules**: every rule in `docs/GOD-Business-Rules.md`, assigned to the feature and scope
  that own its area. An approved rule becomes a functional requirement of that feature, with
  acceptance criteria, citing its `BR-` ID. A rule still only proposed stays in the register for the
  N6 discussion.
- **Commercial items** (commercial apps) and **installed-app items** (installed or both): the lists
  in `references/review-and-brainstorm.md` § Opening questions, with its `ADR-` rules. Each
  item becomes a `FEAT-` marked **Proposed** for the N6 discussion, never MVP by default.
- **Scope map**: the features grouped into **scopes** — the units `/buildscope` will build, one
  scope per run. Each scope is a coherent capability a team could build and test on its own.
  Foundation scopes (authentication, data model, application shell) come first. Give each scope a
  key (`S01`, `S02`…), its features, its dependencies on other scopes, and its build order. Do not
  assign SCOPE or SPEC numbers here — the pipeline commands assign them.

## N5. Write the documents

Write the standard set as `SKILL.md` steps 6 to 11 describe — management plan, estimate,
`DEVELOPMENT-PLAN.md` (step 8; its units are the scopes, with the Pipeline column from
`references/document-templates.md` § 2 set to `draft`), process and design flows, customer
document, PDFs — with these adaptations for a project that has no current system:

- Customer document § 2 "What We Reviewed" names the overview, the interview, and `stack.md`;
  § 3 "Your System Today" becomes "Starting Point" (what exists today, if anything, and what the new
  system replaces or connects to). Skip the persona's Conversion sections.
- Work packages map onto scopes: each scope is one or more work packages, and the estimate runs on
  them as usual. The scope map's `dependsOn` edges and the estimate input's dependency edges are one
  graph: the parallel schedule in N8b uses the same edges the estimate's team-size sweep used. If the
  two ever disagree, fix the plan and re-run the estimate before building.

**A web-based app (or both) also gets `docs/GOD-SaaS-Cost.md`**, the projected SaaS cost, researched
as `references/database-options.md` § Projected SaaS cost says and written per
`references/document-templates.md` § 5. Render it to PDF with the others. An installed-only app gets
none.

Then write the two pipeline inputs:

1. **`docs/GOD-Scope-Map.md`**: one table row per scope — key, title, features (`FEAT-`), depends on,
   build order, draft file, and status columns for SCOPE number, validation, SPEC numbers, and
   implementation (empty for now) — plus the dependency diagram in Mermaid.
2. **One scope draft per scope**, `docs/god-scopes/<key>-<slug>.md`. `/buildscope --from-md` reads
   this file and "extracts, does not invent", so anything missing from the draft is missing from the
   scope. Write every section, with these headings and shapes (they are the scope preflight's
   contract):

   ```markdown
   # <Scope title>

   ## Overview
   ## Business Problem
   ## Actors
   - Primary: <persona> (<role>) — <what they do>
   - Secondary: <persona> (<role>) — <what they do>
   ## Success Metrics
   - <at least three, each with a number, percentage, or time threshold>
   ## Scope Boundary
   ## Out of Scope
   ## Functional Requirements
   ### FR-001 <name>
   <the requirement> — Acceptance: <testable criteria>
   ## Data Requirements
   ## API Routes
   ## Frontend Components
   ## Integration Context
   ## Open Questions
   ```

   Plain `Primary:` / `Secondary:` (never bold), one metric per bullet, `## Out of Scope` as its own
   top-level heading, and no `TODO`/`TBD`. Real functional requirements, never placeholders such as
   "Business rule enforcement" — N7 checks this. Every approved business rule for the scope's area is
   one of them, citing its `BR-` ID, so `/buildscope` carries it into the scope. Each persona top
   task the scope serves is an end-to-end acceptance scenario in one of its requirements, so
   `/wxCreateTestPlan` tests it.

## N6. Pause for review, then brainstorm

**Stop here and present the design for discussion.** Write `docs/GOD-Design-Summary.md` and show
the same summary in chat. It is the agenda for the brainstorm, it is kept current through the
discussion, and `--resume` re-presents it after a `/clear`. In this order:

1. **The project in one paragraph**: what it is, who it is for, and the problem it solves. Say
   whether it is commercial or for the user's own organization, and whether it is web-based,
   installed, or both.
2. **Features**: one row per `FEAT-`, giving its name, what it does in one line, who uses it, MVP or
   later, the scope that builds it, and its origin — **Stated** (the overview says so) or **Proposed**
   (G.O.D. added it). Proposed features are the first thing to discuss.
3. **Users**: each persona (`UP-`), its top tasks and device, and the role it has, with what each
   role may do.
4. **Design**:
   - the key data entities and how they relate (a compact ERD)
   - the main screens per role, and how users move between them
   - the integrations
   - the architecture and stack
   - the database and hosting pick, with the reason
   - the business rules: the count by area, how many are approved and how many are still proposed,
     linking `docs/GOD-Business-Rules.md`
   - for a web-based app, the projected monthly hosting cost at launch and after 12 months for the
     ★ option, the cheapest option, and AWS, with the date the prices were checked, linking
     `docs/GOD-SaaS-Cost.md`. This summary is for the user, so figures are fine here; the customer
     document keeps cost tiers.
5. **Build plan**: the scopes in build order with their dependencies, the phases, and the
   estimate's two options (the quickest team and the machine maximum) with G.O.D.'s recommendation.
6. **For discussion**, numbered so the user can answer by number:
   - every open question, `ASSUMP-` default, and conflict
   - every business rule still proposed, grouped by area (`references/business-rules.md` § Discussing
     them), which comes first when the idea brainstorm was skipped
   - the top risks
   - G.O.D.'s own top three challenges or alternatives, each with its effect stated (for example,
     "an MVP without X ships about N days sooner").

Keep it to a few screens: one line per item, with links to the full documents for detail. Then link
the customer document and the scope map, and use `AskUserQuestion` (under the bridge, the same four
choices as numbered plain text):

- **Brainstorm the project** — an open discussion (below).
- **Request specific changes** — make them, then return here.
- **Approve the plan and start building** — go to N7, after the confirmation below.
- **Stop here, plan only** — finish as a normal G.O.D. run.

**Brainstorming** is a real design conversation, not a questionnaire. Act as the persona's principal
architect: challenge assumptions, propose alternatives (simpler MVPs, other architectures, features
the overview missed, risks it underrates), and explore whatever the user raises. Work through the
"For discussion" list unless the user steers elsewhere, one topic at a time. The brainstorm is run
by wxBrainstorm (`references/review-and-brainstorm.md` § Brainstorming: run by wxBrainstorm), with
the design documents as its evidence: nothing is applied while a topic is open. When the user closes
a topic, wxBrainstorm shows its summary. Once they approve it, apply it to the documents and record
it: an `ADR-` or decision-log row with source
"brainstorm, YYYY-MM-DD", a Revision History row, the scope map and scope drafts updated, the
estimate re-run when work packages change, and the cost projection re-researched when the sizing,
the stack, the commercial or delivery answer, or a hosting constraint (D5 to D7) changes. Keep `docs/GOD-Design-Summary.md` current: mark each
settled item with its decision and add new ones as they come up. wxBrainstorm writes its
record in `docs/brainstorms/`; append each decision to `docs/GOD-Brainstorm.md` as well, with the
source "brainstorm (design), YYYY-MM-DD" and the record's path.

After each topic, or whenever the user pauses, ask in plain text (no menu):

- **Brainstorm more** — take the next topic, or one the user names.
- **Continue with the current path** — re-render the PDFs, then return to the four-way choice above,
  showing what changed since the last summary.

Nothing proceeds without **Approve**.

On **Approve**, take the N6b choices first: the style for all screens and, per screen-bearing scope,
design it or let it build. They are the last step of the review and are settled before the plan is
approved for building. Under `--create`, run the N6c readiness check next. Then state exactly what
happens next — "N scopes, each through `/buildscope`
with its own section-by-section approval; then validation; then `/createSpecs` per scope; then the
screens you chose to design, in wxDesigner; then `/implement` per spec, up to N at a time where the
plan allows, each scope moving to Implementation on its own" (N is the run's agent limit, N8b).
Under `--create`, describe the phase-by-phase run in N11 instead, and say plainly what approving
authorizes: from here G.O.D. answers every command's gates itself from this design and logs each
answer, repairs what a failing command leaves, and commits each finished unit locally. It never
pushes, deploys, or touches production. Say how questions are handled. A question the design does
not cover does not stop the run: G.O.D. takes a low-risk one as a logged assumption and parks a
high-risk one so only its units wait. Every item comes back to the user, numbered, when the sitting
ends (N11 § The decision queue). The testers' sign-offs stay with the testers. Then ask once more to
proceed. On yes, record `"planApprovedAt"` in the state file. Without `--create`, make the bridge
offer (N12), then go to N7. Under `--create`, the bridge offer was already made in N6c (R7), so
there is no question after this yes. Go to N11 item 1, which sets up the run and hands off to the
bridge if it was accepted.

Under `--create`, this review is the one pause G.O.D. adds: brainstorming and change requests happen
here exactly as above, and nothing after the final confirmation (`planApprovedAt`) asks the user
anything until the sitting ends.

**Checkpoint CP1** (N9): the documents are on disk and the evidence intake is no longer needed.

## N6b. Style and screens — the last step of the brainstorm, before any build

Do this when the user chooses **Approve** in N6, before the plan is approved for building and
before N7. It is asked once per run; the answers go
into the scope map and the state file (`"style"`, and per scope `"screen": "designed" | "build" |
"none"` with the saved `page.md` path), so `--resume` never asks again.

1. **One style type for all screens.** Ask the user to pick the visual style the whole application
   will follow. Offer the catalog of named visual styles the design skill ships (for example bento,
   brutalism, glassmorphism, neumorphism, claymorphism, material, shadcn, editorial, terracotta) and,
   when the company has picked a design system in wxKanban's catalog, that design system as well.
   Describe each candidate in one plain sentence; do not assume the user knows the names. Record the
   choice in the project's Stack & Style document through **`/buildstack`** so `stack.md` Look & Feel
   carries it; every screen, designed or built, then follows it. If the user declines, the current
   `stack.md` look and feel stands and nothing else changes. Ask this **before** the first screen is
   designed or built.

2. **Design or build, for every scope that creates a page or screen — choose now, design later.**
   Go through the scope map in build order. For each scope that includes a page, screen, window,
   dialog, or form, ask in plain text:
   - **Design it** — the screen will be designed with the **`wxDesigner`** skill, which the user
     previews in the browser and iterates until they **SAVE** or **DISCARD**.
   - **Let it build** — `/implement` derives the screen from the spec and the chosen style when its
     turn comes.
   A scope with no screen is not asked. **Under `--create`**, say what "Design it" means while the
   user is away. G.O.D. drafts the design in wxDesigner and SAVEs it itself, then holds only that
   scope's screen tasks for the user's review when the sitting ends. Everything else keeps
   building (N11 item 2.3). Only the **choice** is recorded here. wxDesigner itself runs
   in N8, after `/createSpecs` for that scope and before `/implement`, because it reads the real
   scope and its implementing specs and writes `specs/<NNN-name>/page.md` into the spec folder,
   none of which exist yet. In a **conversion**, the screen evidence already exists
   (`pre-convert/*.controls.md`, `rebuild/pages/*.tsx`); tell the user so, and note those paths
   against the scope so wxDesigner starts from them. It is still run per scope, after that scope's
   specs are created.

Show the resulting table (scope, screens, choice, conversion evidence if any) once, then return to
the final confirmation in N6.

**Checkpoint CP1b** (N9): the style and screen choices are recorded in the state file.

## N6c. Readiness check — `--create` only, before the final confirmation

An unattended run must not discover halfway through that it needs something only the user can
give. Right after N6b, before the final confirmation in N6, list everything the run will later need
from the user, each with what needs it. Ask in plain text, numbered:

| # | Item | Needed by | How G.O.D. checks it |
|---|------|-----------|----------------------|
| R1 | UAT target and test logins | `/preTest --nightly` (N8c step 6) | The user names the test target the built app will run on and confirms the test logins will exist there. A new project may have nothing to check yet: record it as `pending`, and `/preTest --nightly` checks it when N8c reaches step 6 |
| R2 | Test keys for each integration in the design (payment, email, identity, and the rest) | `/implement` and the smoke test of those scopes | The key **names** are present in the repo `.env`, checked as N12 checks the bridge names. Never read or print a value. A name says nothing about whether a key is live. Where the provider marks test keys by prefix (Stripe `sk_test_` / `pk_test_`), check with a command that prints only `true` or `false` for the prefix. Otherwise the user confirms each key is a test key. A key not confirmed as a test key is recorded so: any work that would call it is parked as high-risk (money or production), never run |
| R3 | Claude in Chrome and Python | `/wxHelpGenerate` (N8c step 9) | The user confirms. Python: `python --version` |
| R4 | A test database | every step that connects to the **application's** database: the migrations and seeding `/implement` runs, the smoke test, `/wxDBAnalyze` (N8c step 3). Syncing tasks to wxKanban is not one of them | The user confirms the database the project's `.env` points at is a **test** database the run may write to. Never production. Without that confirmation, R4 is not a skip: every step that would connect to it is parked as high-risk (production), and the rest of the build goes on |
| R5 | Kit version and the Change Impact script | per-scope stages (v1.7.72) and the per-spec check (SPEC-136 FR-017) for `/implement`; `_wxAI/impact/unattended.mjs` (SCOPE-137) for N11 | `wxkanban-agent --version`, and the script exists |
| R6 | A clean git tree | the per-unit commits (N11) | Show `preexistingChanges` (recorded in N2). The user cleans them up now, or they stay listed and no commit includes them. After any clean-up, re-read it the same way and record the new list. G.O.D.'s own `docs/` files are not on the list |
| R7 | The Project Agent | an unattended run (N12) | The N12 check (the lock file only). When a project agent holds it, make the N12 offer **here**, so no question is left for after approval. Record the answer in `bridge` |

For each item, the user either supplies it now, or it is recorded as a **known skip** in the state
file (`readiness`, N10) with the step it affects. R1 may be `pending` (checked when its step comes),
and R2 and R4 are never skipped into an unsafe default: what they do not confirm is parked. Later, a known skip is skipped without asking and
listed in the run report. An item that does not apply (no integrations, an installed app with no
UAT target) is marked `n/a`. Then return to the final confirmation in N6.

## N7. Build the scopes

For each scope in build order, run **`/buildscope --from-md docs/god-scopes/<key>-<slug>.md`** and
follow that command completely, as its server-delivered prompt directs. That includes the compliance
check, the reuse check (a strong match stops for `[R]euse / [E]xtend / [V]iew / [P]roceed` — the
user's choice, never yours, except under `--create`), the section-by-section reviews with explicit
`[A]pprove`, the reconciliation step, and writing the files only after full approval. Never pass
`--quick`. **Under `--create`**, G.O.D. gives those answers itself: the reuse choice from the scope
map (an existing scope the design reuses or extends; otherwise proceed), the interview and the
section approvals from the scope draft and the approved design, each logged in `gateLog`. A section
that differs from the approved design is corrected, not approved. Under `--create` the command runs
in a helper agent (N8b, "Under `--create`, every pipeline command runs in a helper"), and a question
the design does not cover goes to the decision queue (N11).

After each scope, before the next one:

1. **Record it.** Read the SCOPE number and file the command produced. Confirm the file exists on
   disk (`specs/Project-Scope/NNN-*.md`), since the drafting tool itself persists nothing. Update
   the scope map and the state file.
2. **Validate it.** Run `/validateScope NNN` (it reads the file and sends its content; the server's
   verdict is authoritative). The scope passes when `isValid` is true, `blockingIssues` is empty, and
   the grade is A or A+. Otherwise fix it the way that command and `/buildscope --edit NNN` allow, and
   validate again.
3. **Check the requirements are real.** Read the scope's `## Functional Requirements` section itself,
   not the score. If it holds generic placeholders ("Business rule enforcement", "History and
   traceability") instead of the requirements approved in the session — a known gap: the drafting
   tool has no field that carries requirements — stop and show the user the difference. With their
   approval, put the approved requirements into that section, then validate again. Under
   `--create`, put them in without stopping (they are already approved) and log the repair. Never
   run `/createSpecs` on a scope with placeholder requirements; it fans out from that section.

Run `/scope-flow-map` or `project_set_scope_dependencies` only if the user asks; the dependency
order lives in the scope map.

**Checkpoint CP2** every three scopes, or sooner when the conversation is long.

## N8. Verify, create specs, verify again, implement

**Verify every scope.** Use a read-only subagent to produce one table: every `FEAT-` in the plan
mapped to a validated scope, every scope's score and grade, file on disk, and requirement check.
Any gap is fixed through N7 before going on. Show the table and ask to proceed (under `--create`,
show it and go on). Under `--create`, which scopes phase by phase, check only the `FEAT-`s of the
current phase's units. A feature of a later phase is not a gap yet. **Checkpoint CP3.**

**Create specs, one scope at a time.** Run `/createSpecs` for each scope in build order and follow
its prompt completely: `stack.md` and compliance first, one `project.create_specs` call per spec with
the full scope content and tasks authored as the prompt directs (each traced to an FR), the spec
files written to disk as the prompt requires, and `project.list_open_items` to confirm the tasks
landed. Within those rules:

- **SPEC number:** the next one free in both `specs/` on disk and the project's specs in wxKanban.
  Never reuse a number; SCOPE and SPEC numbers are separate sequences.
- **Phase:** pass a `phase` that does not leave the spec in `draft` (`"design"` gives `planned`).
  The stage advance below refuses while any non-optional spec is `draft`.
- **Traceability:** `/implement` reads the spec's `Implements SCOPE-NNN` line and the scope's
  `**Implemented By**` list. If the createSpecs run did not write them, show the user and add the
  missing line only with their OK. Under `--create`, add it and log the repair.

Then verify with a read-only subagent: every scope has its spec(s); each spec folder holds the files
the createSpecs prompt lists; the tasks exist in wxKanban. Under `--create`, check only the current
phase's units that are not parked. Regenerate `docs/DEVELOPMENT-PLAN.md`
(`SKILL.md` step 8) so it reflects the real specs, with each unit's Pipeline value set from the
commands' outputs. **Checkpoint CP4.**

**Design the screens the user chose (N6b).** For each scope recorded as `"screen": "designed"`, now
that its scope file and implementing specs exist, run the **`wxDesigner`** skill for that screen
under all of its own rules: it reads `specs/Project-Scope/NNN-*.md`, follows its `Implemented By`
line to every implementing spec, composes within the chosen style's theme tokens, previews in the
browser, and iterates with the user until they **SAVE** (`specs/<NNN-name>/page.md`, the design
specification plus ready-to-use TSX) or **DISCARD**. In a conversion, point it at the screen
evidence noted in N6b (`pre-convert/*.controls.md`, `rebuild/pages/*.tsx`) as prior art. A saved
`page.md` is what `/implement` builds from; a DISCARD leaves the screen to `/implement`, and the
state file records which. wxDesigner never writes into `src/`. Scopes recorded as `"build"` or
`"none"` are skipped. **Under `--create`**, nobody is at the browser. G.O.D. composes the design
within the chosen style and SAVEs it itself, then parks the scope's screen tasks for the review at
the end of the sitting (N11 item 2.3). wxDesigner still runs in the main conversation, never in a
helper. **Checkpoint CP4b** after the last design.

**Stage check — each scope advances itself.** Stages belong to scopes (SPEC-123). `/implement` runs
when the scope it names is in Implementation, QA, or Human Testing, and a scope leaves Design on its
own once `/createSpecs` has given it tasks. Confirm each scope with `project.scope_stage` (it returns
the stage, what would advance it, and the blockers). Nobody presses an Advance button for this. If
the installed kit refuses `/implement` with the **project's** stage rather than the scope's, the kit
predates per-scope stages (v1.7.72): without `--create`, stop and tell the user a kit update fixes
it; under `--create`, carry on as the known-gaps table says.

**Implement** in the development plan's build order, running independent specs in parallel as N8b
allows. For each spec run **`/implement NNN`**
and follow it completely: its stage and spec checks, `stack.md` first, its review phase, and its
Phase 5 `/wxCreateTestPlan` in plan mode with that command's own stops (the coverage summary
approval, the DBA constraint review, the filing-manifest confirmation). Without `--create`, never
approve a gate for the user, and never run `/wxCreateTestPlan --Execute` unless the user asks. Under
`--create`, answer those stops from the approved design and log each (N11); `--Execute` runs in N8c.
After each spec:

- Confirm its tasks are `done` and its test plan exists (`tests/testplans/<target>/TEST-PLAN.md`
  plus the record in wxKanban). Update the scope map, the state file, and the unit's Pipeline value
  in `docs/DEVELOPMENT-PLAN.md` (`implemented`).
- Follow `/implement`'s own next steps (such as syncing to the database). **Never run `git push`.**
  Under `--create`, commit the unit locally once it is `implemented` (N11).
- **Checkpoint CP5** before the next spec, or the next batch of parallel specs — implementation is
  the largest consumer of context. Under `--create` it saves and the run goes on (N9).

If `/implement` refuses a spec because more than one spec is active, the installed kit predates the
per-spec check (SPEC-136 FR-017: `/implement` verifies the spec it was given, so other active specs
no longer block it). Without `--create`, stop and tell the user: the fix is a kit update, after which
`--resume` continues from here. Do not change spec statuses to get around it, and do not fall back
to editing code yourself. Record it in the state file (`"stoppedAt"`, N10). Under `--create`, follow
the known-gaps table instead: never change spec statuses, but build the spec's tasks yourself as a
logged repair.

**Built:** a read-only subagent verifies every spec is implemented with its test plan (under
`--create`, every spec not parked or held, with the parked and held ones listed); update the
scope map, the management plan's Revision History, and the customer document's next steps; re-render
the PDFs; and summarize what was built and what remains open. Then continue with N8c, which carries
the built application through testing to release. Without `--create`, ask once in plain text
whether to continue to release or stop at built; under `--create`, continue.

## N8c. From built to released — the rest of the cycle

Every step runs an existing command under all of its own rules and gates, in this order. Without
`--create`, G.O.D. never fixes code itself and never answers a gate. Under `--create` it answers the
gates and decides the fixes from the approved design, logging each, and fixes code itself only as a
logged repair (N11). In every mode it never moves a stage by hand, never deploys, never pushes, and
never signs off a human test. Record each step in the state file (`"phase": "release-cycle"`,
`position.gate` naming the step) and in the development plan's Pipeline column. Under `--create`,
N8c runs per scope alongside the build (N11 item 5). `phase` stays `execute` until every build
phase's gate has passed, and each scope's own N8c step is kept in its `release` field (N10).

1. **Code and UI review.** Run `/wxUIUXCodeReview` on each scope's code, in build order. It is
   advisory: show its findings, including the accessibility (QR1) and language (QR2) checks it
   makes, and let the user decide which to fix. Under `--create`, G.O.D. decides: every must-fix,
   and each should-fix the approved design calls for.
2. **Conversion parity** (conversions only). Run `/wxConversionParity` to compare the rebuild with the
   legacy app: regressions and dropped defaults. Undecided differences are the user's call. Under
   `--create`, G.O.D. decides them from the recorded KEEP / MODERNIZE / DROP decisions. What those
   do not cover goes to the decision queue (N11).
3. **Database review** (PostgreSQL only). Run `/wxDBAnalyze` when it can reach the database. If it
   cannot connect or the engine is not PostgreSQL, record that and go on. Under `--create`, it runs
   only against the test database R4 confirmed. When R4 is `parked`, this step waits with the other
   database work.
4. **Compliance** (only when `project.get_compliance_context` shows enabled frameworks). Run
   `/compliance-scan`.
5. **Fixes.** Each fix the user approves from steps 1 to 4 is carried out through the pipeline.
   With the user's OK, add it as a task on the spec it belongs to (`project.create_task` with that
   spec), then run `/implement` on that spec. A change of scope goes through `/buildscope --edit` and
   `/createSpecs` instead. Under `--create`, G.O.D. files each fix it decided on the same way,
   without asking.
6. **Smoke test now; the full test overnight** (FR-036).
   - **First, the full test plan.** Confirm every scope's full plan was filed by `/wxCreateTestPlan`
     in plan mode (`/implement` Phase 5; `tests/testplans/<target>/TEST-PLAN.md` and the filed
     items). File any missing one before going on: the overnight run tests what the plan holds.
   - **Smoke test.** Run `/wxCreateTestPlan --Execute` per scope, in build order, and end at
     **Gate 1, the smoke signoff**. Do not continue to Gates 2 and 3 during the drive. Gate 1 is a
     machine gate: everything responds without crashing, read-only or mocked. It needs no UAT
     target and is not a human attestation. Gate 3, the user's own
     verification, is never run or answered by G.O.D. When smoke
     fails, run `/autofix-tests` (it confirms each fix with the user), then smoke again.
   - **Schedule the full test overnight.** Run `/preTest --nightly` (its check and plan, which write
     nothing). When the check passes, run `/preTest --nightly --install --full-first`: the first
     night runs every machine item in the plan, and each later night tests what the day's changes
     reached plus a rotation (SPEC-140). Each morning, read its summary: failures arrive as tasks,
     and go through step 5. The overnight run signs off each item it proves, which is what clears a
     scope's machine test gate (step 8). When the check refuses (no UAT target, no test accounts, a
     production address), say exactly what is missing and leave the full test as the user's next
     step: G.O.D. never points it at production and never works around the refusal. Under
     `--create` this does not stop the run: it is listed in the run report's next steps (N11).
   - Confirm the recorded gates with `project.test_gate_status`. Under `--create`, G.O.D. answers
     the smoke gate and confirms the fixes itself, logging each, and only ever against the run's own
     test target. A gate that would point at a production database, host, or account is never
     answered. Under `--create` it is parked as high-risk (N11), and only that scope waits.

**Stages advance per scope, on their own (SPEC-123).** Each scope moves to its next stage as soon as
the stage it is leaving is clear, and keeps going while each stage is clear. Nobody presses an
Advance button. After each step above, read `project.scope_stage` for every scope: it returns the
stage, what would advance it, and the blockers. Work the blockers with the steps above; what each
stage needs is listed below.

7. **Leave Implementation for QA.** Needs every Implementation task completed.
8. **QA, then leave it for Human Testing.** Leaving QA needs every QA task completed and passed, and
   the scope's machine test gate clear: no machine test it owns unsigned or failing, forced or not.
   A scope with no machine tests stays in QA, so make sure its test plan was filed (`/implement`
   Phase 5). The machine gate clears from the overnight results (step 6), not during the drive;
   save the state and pick up after the morning summary. Under `--create`, a scope waiting on the
   overnight results is not ready. The other scopes go on, and the wait counts toward the end of
   the sitting (N11). Steps 5 and 6 are how failures get fixed. Entering Human Testing is what
   releases the human tests to the testers.
9. **Human Testing (user acceptance), then leave it for Beta.** The testers run the released human
   tests in the web app. Tell the user who tests what (the personas' top tasks), using the data QR3
   allows. Run `/wxHelpGenerate` against the running application now to build the help site and PDF
   manual; it needs Claude in Chrome and Python, and if either is missing or N6c recorded a known
   skip, say so and go on. Leaving
   Human Testing needs no open tasks and a tester sign-off on every released human test; confirm
   with `project.test_gate_status`. Failures go back through step 5. **This is the run's pause in
   every mode:** a sign-off is a tester's attestation, so G.O.D. never makes one, under `--create`
   or under the bridge. Save the state, say who still has to sign what, and wait. Under
   `--create`, only that scope waits. The other scopes go on, and the wait counts toward the end of
   the sitting (N11).
10. **Beta, then leave it for Release.** Beta feedback reaches the project through the feedback
    channel, and each fix goes through step 5. Leaving Beta needs no open tasks. **A known gap**
    (last table): `/implement` refuses a scope in Beta, so step 5 has no path for a Beta fix, and
    a scope with no open tasks passes through Beta at once. Without `--create`, tell the user and
    list the fix. Under `--create`, let the scope pass through and list each Beta fix in the run
    report (N11).
11. **Release.** The release check needs every earlier stage complete and every forced test, of
    either kind, clear across the project; it promotes the test cycle to production. That promotion
    is a test-cycle record in wxKanban (SPEC-111). It deploys nothing and touches no production
    system, so reaching Release is not a production action. Before it, check
    the release phase's own work packages are done: the dependency license check for a commercial
    app, the service level (D8) monitoring, and the rollback plan. **Deploying is the user's:** G.O.D.
    lists the release steps from the management plan § 12 and never deploys or pushes. Under
    `--create`, G.O.D. does the license check itself. It writes the monitoring plan and the rollback
    plan as documents in the management plan § 12. Anything that sets them up on a real host is
    listed in the run report as the user's step, because it touches production.

The run ends when every scope is in the Release stage. Summarize what shipped and what remains
open, and update the plan, the scope map, and the customer document a last time. Under `--create`,
make the last local commit and tell the user the run is ready for them to push and deploy. Under
`--create`, a sitting usually ends well before this: on the overnight run, the testers, or the
parked items (N11 § Sittings). Each later `--resume` is a new sitting, and the run ends here.

## N8b. Parallel implementation — the plan governs concurrency

The development plan, not a kit-wide rule, decides which specs implement at the same time.

**The limit.** The run's agent limit is the lower of the machine maximum (`machine-capacity.mjs`)
and the user's cap (`--cap=<n>`, or the T5 answer). Record it in the state file as `"limit"`.
`--cap=1` means one spec at a time; there is no other serial switch.

**Which specs may run together.** A spec is *ready* when every unit its scope depends on (the scope
map's `dependsOn`, the same edges the estimate used) is `implemented`. Start ready specs in build
order until the limit is reached; start the next ready one as each finishes or is parked. Two units joined by a
dependency edge, directly or through others, never implement at the same time. Before starting two
ready specs together, compare the files their plans say they change; when they share a file, run
them one after the other instead and say why. A dependent unit waits, shown as waiting in the state
file, until its predecessors are `implemented`. A unit whose only open tasks are screen tasks parked
for the design review (`screens-parked`, N11 item 2.3) counts as `implemented` here. A unit that is
`parked` does not, and its dependents wait.

**How they run.** G.O.D. stays the only driver of the working tree (one driver per tree, SCOPE-132).

**Model tier (SPEC-143).** When G.O.D. starts a helper, it reads the tier table (`node _wxAI/routing/tiers.mjs`, which merges the kit default with the project's `models:` in `decisions/settings.yaml`) and starts the helper on the model for the work's difficulty and command. It never edits `models:` or `allowedProviders:`: only the owner changes them.

- **One ready spec, or a limit of 1:** `/implement` runs in the main conversation, as always
  (under `--create`, in a helper; see below).
- **Two or more ready specs:** run each one's `/implement NNN` as its own background helper agent
  (Claude Code: the Agent tool, in the background). Brief each helper to follow `/implement`
  completely, under all of its rules, and, wherever `/implement` or `/wxCreateTestPlan` asks the user
  anything (a gate, an approval, a confirmation, a question), to stop and return that exact question
  instead of answering it. Put each returned question to the user verbatim, naming its spec, one at
  a time, and send the user's answer back to the same helper (Claude Code: SendMessage). Never answer
  for the user, never merge two helpers' questions into one answer, and never let a helper push.
  Under `--create`, helpers still return every question rather than answering it, since only G.O.D.
  holds the approved design: G.O.D. answers each from the design, logs it, and sends it back. A
  question the design does not cover first goes through the ledger check (N11 § The decision queue,
  "Ledger first"), and only if the ledger does not answer it does it go to the decision queue (N11),
  never to the user mid-run.
  Helpers never commit; G.O.D. commits the unit when its helper returns `implemented`. Brief each
  helper to end its report with the list of files it changed, and to return a **Change Impact
  denial word for word**, as a question, never as a failure. Record each running helper's id and its
  pending question in the state file (the scope's `helper`, N10), so G.O.D. can still reach it after
  a compaction.
- **Under `--create`, every pipeline command runs in a helper,** even when only one unit is ready:
  `/buildscope`, `/validateScope`, `/createSpecs`, and `/implement`, each briefed as above. The main
  conversation keeps only the state file, the logs, and the tables, so it stays small for hours.
  `/buildscope` and `/createSpecs` run **one at a time** across the whole run, so SCOPE and SPEC
  numbers never race. Each scoping helper (`/buildscope`, `/validateScope`, `/createSpecs`) runs
  beside the implementing helpers. It runs no build or test, so the machine maximum does not count
  it, but the user's cap does. **wxDesigner stays in the main conversation** (it drives the
  browser). Without `--create`, the commands run as the rest of this section says.
- **Parked.** When a helper's question is parked (N11), end that helper and give its slot to the
  next ready unit. A waiting helper never holds a slot. When the parked item is answered, run the
  unit again from the step it was parked at, with the answer in the brief. For `/implement`, the
  new run picks up the unit's own remaining tasks.
- Keep the state file's per-spec `implement` status current (`waiting`, `running`, `asking`,
  `parked`, `implemented`) so a `--resume` knows which helpers were in flight. On resume, believe the
  artifacts: a spec whose tasks are not all `done` is re-run through `/implement`, which picks up its
  own remaining tasks. A `parked` unit stays parked until its queue item is answered. A
  `screens-parked` unit is not re-run: its only open tasks are the held screen tasks, which wait for
  their `review` item. Any unit with an open `review` item and other open tasks is re-run with
  `--task-filter todo`, after setting tasks left `in_progress` back to `todo` (N11 item 2.3). It is
  never re-run with plain `/implement`, whatever its recorded status.

**The kit side.** Parallel implementation needs the per-spec check (SPEC-136 FR-017). On an older
kit, `/implement` refuses while more than one spec is active; N8 says what to do.

## N9. Context checkpoints

A full run is far longer than one context window. At each checkpoint:

1. Bring `docs/GOD-State.json` up to date, including `nextAction` in plain words.
2. **Under `--create`, save and keep going.** A checkpoint does not stop the run, and G.O.D. does
   not ask for `/clear`. Post the one-line position (in the editor as in the room) and go on. The
   client compacts its own context when it fills. After any compaction, read the state file before
   the next action, exactly as `--resume` would, and never act on a remembered status. `/clear`
   plus `--resume` is offered only at the end of a sitting (N11 § Sittings).
3. **Otherwise,** tell the user, then stop the turn:

   > Checkpoint saved. Run `/clear`, then `/wxG-O-D --resume` to continue with: [the next action,
   > in plain words].
   > (Or `/compact` to keep this conversation going in condensed form.)

   Prefer `/clear` plus `--resume` at CP1, CP3, CP4, and CP5: the state file and the documents carry
   everything the next step needs. `/compact` suits CP2, inside the scope loop. Other AI clients:
   start a new chat and run `/wxG-O-D --resume`.

   **Under the bridge (N12)** nobody can type `/clear`. Save the checkpoint, post the one-line
   position to the room, and carry on; the session compacts its own context when it fills. After
   any compaction, read the state file before the next action, exactly as `--resume` would.

Under `--create`, also checkpoint after every phase exit gate (CP-G0, CP-G1…, N11). Every `--create`
checkpoint message also carries the Change Impact list: run `node _wxAI/impact/unattended.mjs
checkpoint` and include its output as written. It lists each crossing and each data-loss stop once,
and says 0 when there were none.

To keep context small throughout:

- Delegate reading to read-only subagents (intake, every verification table) and keep only their
  tables. Run at most 5 at once and never more than the user's cap; the machine maximum does not
  limit them (`SKILL.md` Rules, "At most 5 helpers at once").
  Never paste a full scope, spec, or document into chat; cite its path.
- On resume, read the state file first, then only the files the next action needs: the scope map
  and that one scope draft, or that one spec.
- Without `--create`, `/buildscope` and `/implement` interact with the user, so they run in the main
  conversation, never in a subagent (apart from the parallel `/implement` helpers in N8b). Under
  `--create`, G.O.D. answers their questions, so every pipeline command runs in a helper and the
  main conversation keeps only the state, the logs, and the tables (N8b).

## N10. The state file — `docs/GOD-State.json`

```json
{
  "mode": "create",
  "overview": "ProjectOverview.md",
  "customer": "Acme Freight",
  "level": "junior",
  "buildFor": "internal",
  "commercial": true,
  "delivery": "web",
  "limit": 4,
  "style": "editorial",
  "planApprovedAt": "2026-10-02",
  "phase": "execute",
  "position": { "planPhase": 1, "unit": "S03", "gate": "implement" },
  "nextAction": "Answer /implement 014's review-phase question, then start S04 when S02 is implemented",
  "stageAdvanced": true,
  "bridge": { "offeredAt": "2026-10-02T15:10:00Z", "accepted": false },
  "stoppedAt": null,
  "scopes": [
    {
      "key": "S01", "title": "Authentication and roles", "draft": "docs/god-scopes/S01-auth.md",
      "planPhase": 0, "dependsOn": [], "scopeNumber": "001", "scopeFile": "specs/Project-Scope/001-auth.md",
      "validation": { "isValid": true, "score": 100, "grade": "A+", "at": "2026-10-02" },
      "requirementsReal": true, "specs": ["001"],
      "screen": "designed", "pageMd": "specs/001-auth/page.md",
      "implement": "implemented", "testPlan": "tests/testplans/001-auth/TEST-PLAN.md",
      "helper": null
    }
  ],
  "phaseGates": [{ "planPhase": 0, "passedAt": "2026-10-02T18:40:00Z" }],
  "checkpoints": [{ "id": "CP1", "at": "2026-10-02T14:05:00Z" }],
  "preexistingChanges": ["notes/todo.md"],
  "gateLog": [
    { "at": "2026-10-02T16:12:00Z", "unit": "S01", "command": "/buildscope", "gate": "reuse check",
      "answer": "Proceed", "source": "GOD-Scope-Map.md: S01 reuses nothing" }
  ],
  "repairs": [
    { "at": "2026-10-02T16:30:00Z", "unit": "S01", "command": "/buildscope",
      "what": "Placeholder requirements replaced with the approved FRs", "file": "specs/Project-Scope/001-auth.md",
      "reported": "feedback filed" }
  ],
  "commits": [{ "unit": "S01", "sha": "3f2a9c1", "at": "2026-10-02T18:35:00Z" }],
  "readiness": [
    { "id": "R1", "item": "UAT target and test logins", "status": "supplied" },
    { "id": "R3", "item": "Claude in Chrome and Python", "status": "skip", "affects": "N8c step 9" },
    { "id": "R4", "item": "A test database", "status": "supplied" }
  ],
  "decisionQueue": [
    { "id": "DQ-01", "kind": "assumed", "at": "2026-10-02T17:02:00Z", "unit": "S04",
      "command": "/createSpecs", "question": "Export dates as ISO or as the user's locale?",
      "answer": "ISO 8601", "why": "Low-risk: one task to change", "undoCost": "one task",
      "blocks": [], "status": "open" },
    { "id": "DQ-02", "kind": "parked", "at": "2026-10-02T17:40:00Z", "unit": "S06",
      "command": "/implement", "question": "May a refund exceed the original charge?",
      "recommendation": "No: cap refunds at the amount charged", "why": "High-risk: money",
      "blocks": ["S06", "S08"], "resumeAt": "implement", "status": "open" }
  ],
  "sittings": [{ "n": 1, "startedAt": "2026-10-02T15:12:00Z", "endedAt": null }]
}
```

- `mode`: `new-project`, or `create` under `--create`.
- `position`: the plan phase, the unit, and the gate the run is at. It is what G.O.D. reports when
  asked where the run is, in the editor or from the phone.
- `buildFor` (`internal` / `consulting`), `commercial` (`true` / `false`), and `delivery` (`web`,
  `installed`, or `both`): the brainstorm's opening answers (N2b), or NP10, NP7, and NP5, so a resume
  never asks them again.
- `limit`: the run's agent limit (N8b). `style` and each scope's `screen` and `pageMd`: the N6b
  choices and outcomes, so a resume never asks them again.
- Each scope's `implement`: `waiting`, `running`, `asking`, `parked`, `screens-parked`, or
  `implemented` (N8b, N11). Its `release` (`--create`): the N8c step that scope has reached, for
  example `"smoke"` or `"waiting-overnight"`. Its `helper`: `null`, or `{ "id", "command", "question" }` while a
  helper runs for it. The `id` is the agent id that SendMessage needs, and `question` is the one it
  returned and is waiting on. After a compaction, G.O.D. reaches a waiting helper through this field.
  If the helper is gone, G.O.D. starts the unit's command again, and the command picks up its own
  remaining work.
- `stoppedAt`: `null`, or `{ "step", "unit", "gate", "defect" }` when the run stopped on a defect
  (`SKILL.md` Rules, "Stop and report a defect") or on a kit refusal. Resume starts there and first
  asks whether the cause has been fixed.
- `--create` only: `readiness` holds the N6c items, each `supplied`, `pending` (R1), `skip` (with
  the step it affects), `parked` (R2 or R4 not confirmed), or `n/a`. A `DQ-` item's `kind` is
  `assumed`, `parked`, or `review`. `decisionQueue` holds every `DQ-` item (N11 § The decision queue), mirrored in
  `docs/GOD-Decisions.md`. An item's `status` is `open`, `answered` (with the user's `answer`), or
  `done` once applied. `sittings` records when each sitting started and ended.
- A phase gate that cannot be cleared is recorded in `phaseGates` as
  `{ "planPhase", "status": "parked", "dq": "DQ-nn", "behind": ["S06"] }` until it passes (N11).
- `bridge`: whether the N12 offer was made and taken. The offer is made once per run.
- `--create` only (N11): `preexistingChanges` lists the files already changed in the tree when the run
  started (from `git status`), which no commit includes. `gateLog` holds every gate G.O.D. answered,
  with the command, the answer, and where in the approved design it came from. `repairs` holds every
  artifact G.O.D. wrote or fixed itself because a command failed or a kit gap blocked it, and whether
  the defect was filed. `commits` holds each local commit, by unit or phase gate.

`phase` is one of `idea-brainstorm`, `review`, `brainstorm`, `scopes`, `verify-scopes`, `specs`,
`verify-specs`, `stage-advance`, `implement`, `execute` (`--create`, N11), `release-cycle` (N8c), `done`. In `idea-brainstorm`, resume re-presents the
open items in `docs/GOD-Brainstorm.md` and asks "brainstorm more or continue". In `review` or
`brainstorm`, it re-presents `docs/GOD-Design-Summary.md` and its open items. **`/wxG-O-D --resume`** reads this file, reports where the run
stands (scopes built, validated, specified, implemented), re-reads only what the next action needs,
and continues from `nextAction`. Under `--create`, once the design is approved (`planApprovedAt` is set and `phase`
is `execute` or later), resume reads `decisionQueue` as well as `stoppedAt`, in this order. Before
approval, resume as in any other new-project run.

1. Run `node _wxAI/impact/unattended.mjs start --by wxG-O-D` before anything else.
2. If the last sitting has not ended (`endedAt` is `null`, as after a bridge handoff or
   `CANCEL REMOTE`), continue it. Any helper recorded in `scopes[].helper` that is gone is restarted
   as N10's `helper` field says. Go straight on from `nextAction`; nothing is asked mid-sitting.
3. Otherwise start a new sitting. Show the queue: the items answered since the last sitting, and
   those still open, numbered with their recommendations, so the user can answer them now or leave
   them.
4. Apply every answer (N11 § Sittings), and only then continue from `nextAction`. Keep the file accurate: it is the single record of progress, and
every pipeline command's own output stays authoritative over it — re-check a recorded status against
the command's artifacts on resume, and believe the artifacts.

## N11. `--create` — execute the development plan

`--create` runs everything above, with four differences. The design review in N6 is the only pause
G.O.D. adds, apart from the one-time fresh-start offer once the run is set up (item 1). The pipeline runs **phase by phase** through `docs/DEVELOPMENT-PLAN.md` instead of all
scopes first. Once the user approves the design, **G.O.D. completes the process itself**. And a
question that comes up after approval **never stops the run**: it goes to the decision queue, and
the user answers the whole queue when the sitting ends. A run can go for hours unattended. The plan
is both the schedule and the progress record.

**What the approval authorizes.** The user's approval at the end of N6 (`planApprovedAt`) lets
G.O.D. run any command the development process needs, through to every scope in Release:

- **It answers the gates.** Every command still runs under all of its own rules. Where one asks the
  user (an interview, a reuse choice, a section approval, a coverage, constraint, or filing
  confirmation, a fix confirmation), G.O.D. answers from the approved design: the design summary,
  the scope drafts, the business rules, the plan, and the recorded decisions. Log each answer in
  `gateLog` with its source, and post it as one line. A decision the approved design does not cover
  goes to the decision queue (below). It is never guessed silently and never asked mid-run. Answer
  interviews in full; never skip one with `--quick`, which leaves placeholder requirements.
- **Commands first, itself when blocked.** Use the real commands, so numbering, database records,
  cross-references, fences, and audit paths stay right. When a command fails, or a known kit gap
  blocks it (the last table), write or repair the artifact yourself the way the command would: the
  same file, number, cross-reference, task record, and code fence. Log it in `repairs` and the
  management plan's Revision History, file the defect with `project.submit_feedback` (`type: "bug"`,
  a stable title naming the command and the failure, no run-specific values), and keep going.
  **A Change Impact denial is never a failure to repair.** It is a question, and it is parked (item
  1). No repair, script, or other route may make an edit that a denial blocked.
- **G.O.D.'s own failures stop the run only when going on is unsafe.** After approval, stop
  (`SKILL.md` Rules, "Stop and report a defect") only when the state file cannot be written or read
  back, or when `GOD-Inventory.json`, `GOD-Estimate-Input.json`, or `GOD-Estimate.md` is corrupt.
  Without them the run cannot know where it is or what comes next. Any other failure of G.O.D.'s
  own scripts, such as a PDF render, is logged in `repairs`, reported the same way, and the run
  continues. A contradiction in this method found after approval is reported, and its decision is
  parked as high-risk, so only the units it touches wait.
- **Commits, never pushes.** The files `git status` showed before G.O.D. wrote anything are in
  `preexistingChanges` (N2), and no commit ever includes them. Commit each unit locally when it is
  `implemented`, and again at each passed phase exit gate, with a message naming the unit and its
  SCOPE and SPEC numbers; record each in `commits`. **A unit's commit holds only its own files:**
  the paths its helpers report they changed, its saved `page.md` (`pageMd`), the files in its
  `repairs` rows, and G.O.D.'s `docs/` files. Each later change to the unit (an N8c fix, an
  `/autofix-tests` change, the screen tasks built after review) gets its own commit, again by
  named paths. A file in `preexistingChanges` that a unit also changed is left out, and the run
  report lists it for the user to commit. It never includes another
  unit's files, a running helper's files, or a parked unit's half-built work, which waits for that
  unit's own commit. Stage those paths by name, never with `git add -A`. If a commit fails (a hook
  rejects it), log it in `repairs`, report it, and go on. The next commit for that unit retries it. Starting `--create` is the user delegating commit
  timing (the "delegates git timing" case in `_wxAI/rules/git.md`); it covers commits only. Never
  push, never deploy, and never point a command at a production database, host, or account.
- **People sign off human tests.** G.O.D. never signs off a human test or marks one passed.

1. **Up to approval:** N1, N2 (taken as new, N2 says when it still asks), N3, N4, N5, then N6 with
   its brainstorm and change requests, N6b, N6c (which makes the bridge offer), and the final
   confirmation. **Then set up the run before anything else:** set `"phase": "execute"`, start
   sitting 1 in `sittings`, write `nextAction` (the first unit of phase 0), and save the state file.
   **Change Impact (SCOPE-137).** Then run `node _wxAI/impact/unattended.mjs start --by wxG-O-D`, and
   again first thing after every `--resume` of a `--create` run (the marker holds for one session).
   If `start` fails, log it in `repairs`, report it, and go on. An edit the hook then denies is
   parked like a data-loss denial (below). Only then, if the bridge was accepted, hand off as N12
   says. The bridge session's `--resume` continues sitting 1, and the editor session does no further
   work.
   **Fresh start (Amendment C, FR-044).** If the bridge was not accepted, save the state file and
   post once: "The design is approved and the run is set up. To start the build in a fresh
   conversation, run `/clear`, then `/wxG-O-D --resume`. Reply **go** to continue here instead."
   Then end the turn. Every turn of the run re-sends this whole conversation, and the intake, the
   brainstorm and the design review are already in the files, so the build is cheaper started
   clean. On `--resume`, continue sitting 1 at `nextAction` (N10), running the Change Impact
   `start` first as after any `--resume`. On **go**, continue here. Ask this only once per run.
   An edit that crosses an Impact Boundary is then logged and goes ahead. One with possible data loss
   is still denied. It is parked as a high-risk item (§ The decision queue), with the `approve.mjs`
   command the denial names. That unit waits and the others go on. Once the user gives an answer,
   record it with that command. Never record an answer the user did not give.
2. **For each build phase of the development plan, in order.** The plan's Release phase
   (`references/document-templates.md` § 2, phasing heuristic item 5) is not a build phase. This
   loop never runs `/buildscope` for it, and N8c carries out its work packages (N8c step 11).
   1. **Scope** each unit in the phase, in dependency order, exactly as N7 says: `/buildscope
      --from-md`, record, `/validateScope`, and the requirements check, with G.O.D. answering the
      gates. Each runs in a helper (N8b), one `/buildscope` at a time. Set the Pipeline value as
      each completes (`scoped SCOPE-NNN`, then `validated`).
   2. **Specify** each unit as N8 says: `/createSpecs` in a helper, one at a time, then the
      read-only verification. Set `specified SPEC-NNN`. The scope leaves Design on its own once its
      specs have tasks.
   3. **Design** the screens marked "design it" in N6b, as N8 says, in the main conversation.
      Nobody is at the browser, so G.O.D. composes the design within the chosen style and SAVEs it
      itself. Then it parks that scope's **screen tasks** for the review at the end of the sitting.
      These are the tasks that build the designed page, screen, or form from `page.md`, named from
      the spec's `tasks.md`. Set each one `blocked` in wxKanban (`project.update_task_status`, whose
      statuses are `todo`, `in_progress`, `blocked`, and `done`), add a `DQ-` item of kind
      **`review`** for the design (§ The decision queue: it blocks no unit), and set the Pipeline
      value `designed (screens held)`. The scope's other tasks and every other unit go on: step 5
      builds them with `/implement NNN --task-filter todo` (`/implement`'s own argument, which
      filters its tasks by status, so the `blocked` screen tasks are left alone). While the
      `review` item is open, every `/implement` run for this unit uses that filter, and before
      each re-run, set any of its tasks left `in_progress` by an ended helper back to `todo`. If
      `/implement` Phase 5 does not file the test plan while tasks are held, the phase gate lists
      the missing test plan with the held tasks. The plan is filed when the screen tasks are built. When the unit's other tasks are `done`, its status is
      `screens-parked`, which counts as `implemented` for its dependents and its phase gate (N8b).
      Commit it then, and again when the screen tasks are built.
      When the user approves or changes the design at the review, set the screen tasks back to
      `todo` (re-running wxDesigner first if the design changed) and run `/implement NNN` to build
      them.
   4. **Stage check:** confirm with `project.scope_stage` that each unit's scope is in
      Implementation, as N8 says. Never move a stage by hand.
   5. **Implement** the phase's units as N8 and N8b say, independent units in parallel up to the
      limit. Set `implementing`, then `implemented`, then commit the unit. A unit whose question
      is parked is set `parked`, and its slot goes to the next ready unit.
   6. **Phase exit gate.** A read-only helper checks the gate written in the plan for this phase
      against the commands' artifacts: every unit `implemented` (or `screens-parked`, with those
      tasks listed on the gate as open), its tasks `done`, its test plan filed, and the phase's own
      condition. If it passes, mark the phase's gate in the plan with the date, record it in
      `phaseGates`, re-render the plan's PDF, commit, and take the phase's checkpoint (**CP-G0**
      after phase 0, **CP-G1** after phase 1, and so on).
      If it fails, work what is missing through the steps above (re-run `/implement` for open
      tasks, file a missing test plan, or repair), then check again. **When it cannot be cleared,
      park it.** This includes a gate that fails because a unit in the phase is parked, and a gate
      that needs a human judgment the design does not settle. Add a high-risk `DQ-` item saying
      exactly what is missing. Record the gate as parked in `phaseGates`, with the units behind it.
      Leave the phase "gate open" in the plan, with no gate mark and no gate commit. The **units
      behind the gate** are the units it fails on: those that are `parked` or not yet
      `implemented`. When it
      fails on the phase's own condition rather than on a unit, every unit in the phase is behind
      it. When the gate later clears, mark it, commit, and checkpoint as above.
3. **No unit starts before its dependencies pass.** A unit implements only after every unit it
   depends on is `implemented` (N8b). Normally a later phase starts only after the previous
   phase's exit gate passes. **The one exception is a parked gate:** a next-phase unit that does not
   depend on any unit behind it (through `dependsOn`, directly or through others) may start. A
   next-phase unit that does depend on one waits until the gate clears. Never start a unit on a
   failed gate that has not been parked.
4. **What is asked after approval: nothing, until the sitting ends.** Every question goes to the
   decision queue below, including a decision the approved design does not cover, a gate that
   would touch production, a Change Impact data-loss denial, and a gate that cannot be cleared. The
   exceptions are the testers' human-test sign-offs, which are theirs and never asked of the user,
   and an unsafe stop on G.O.D.'s own defect (above). G.O.D. never asks "proceed?" between units
   and never stops at a checkpoint (N9). The user can say stop at any time. G.O.D. then ends the
   sitting as § Sittings steps 1 and 2 say, and stops. **Every way G.O.D. stops the run** (the
   user's stop, an unsafe stop on G.O.D.'s own defect, the end of a sitting) first tells each
   running helper in `scopes[].helper` to stop and waits for it to end, records where each unit
   was, then runs `node _wxAI/impact/unattended.mjs stop`. No helper keeps editing the tree after
   the run has stopped, and unattended mode never outlives it. `CANCEL REMOTE` ends the bridge
   session itself, so G.O.D. gets no turn. Its helpers and the session's marker end with it, and
   the next `--resume` restarts those units (N10).
5. **N8c runs per scope, without waiting for the last gate.** Under `--create`, a scope enters N8c
   as soon as it is `implemented`, with no extra "proceed?". It runs steps 1, 2, 5, and 6 (review,
   parity, fixes, smoke test) for that scope, then the stage steps. Steps 3 (the database review)
   and 4 (compliance) are project-wide. They run once every unit that is not parked, and not behind
   a parked item, is `implemented`. They run again for the units implemented after that, once
   those units are released and built. The overnight scheduling in step 6 still waits until every
   scope's full test plan is filed (FR-036). While a unit is parked, the run report lists the
   overnight run as waiting on that item. A parked unit holds back only its own N8c and the
   overnight scheduling. The last build phase's exit gate is followed by N8's **Built** step. The run ends
   with every scope in Release, the last commit made, and the push and deploy left to the user. It usually takes more than one sitting (§ Sittings). Run
   `node _wxAI/impact/unattended.mjs stop` as the last step of the run, and also when a sitting
   ends.

### The decision queue

After approval, every question the approved design does not cover is **classified, never asked
mid-run**. A question can come back from a helper, a command gate, a review finding, a parity
difference, a failed phase gate, a Change Impact denial, or a contradiction in this method.

**Ledger first (SPEC-142).** Before a question is classified or added to the queue, run the Ask
Gate search: `node _wxAI/askgate/search.mjs "<the helper's question>" --root <repo root> --json`
(the repo ledger from the main repo path, then the global tier). If the result is `answered`, use
the entry's full text as the answer, send it back to the helper stating why it applies, record it
in `gateLog` with the ledger id (`"source": "ledger D-0012"`), and **never queue the question**:
it does not appear in `docs/GOD-Decisions.md`. A `context` result (entries with unknown evidence)
never answers: pass it to the classification below as background. If the script is absent or
fails, continue with the classification below and note the skip in `repairs`.

**Answers from the room (SPEC-142 Amendment A).** When the run is bridged to the project room, an
answer written there as `DQ-nn: …` is recorded by the bridge, which alone knows who wrote it: the
owner's answer goes to the ledger, KAIN's goes to the owner's review list
(`decisions/kain-replies.yaml`). You then receive a `[decision]` message naming the item, who
answered, and the units to resume. **Never record a room answer yourself** (never run
`route.mjs answer` for it), and never treat a KAIN answer as approved: go on with it, but it is not
a decision and is never reused for another question. A `[decision]` message saying the owner
changed or rejected a KAIN answer lists units to recheck: recheck them before the unit is called
implemented.

**High-risk** is any question that involves:

- possible data loss
- the shape of a shared table: one that more than one unit reads or writes
- money or billing
- security, authentication, or permissions
- legal or compliance
- anything that touches production
- anything that contradicts an approved decision
- anything costly to reverse: more than about one unit of rework

**Low-risk** is everything else.

- **Low-risk: assume and go on.** Take G.O.D.'s recommended answer, the one most consistent with
  the approved design and the usual practice. Log it as `DQ-nn` with `kind: assumed`, the question,
  the answer, why it is low-risk, and what it would cost to undo ("one task", "one screen"). Post it
  as one line, and continue. Also append it to `decisions/assumptions.yaml` (`time`, `question`,
  `defaultChosen`, `agent`, `reviewed: false`). Never write `decisions/ledger.yaml`: an owner's
  answer reaches it only through `node _wxAI/askgate/ledger.mjs append`.
- **High-risk: park it.** Log it as `DQ-nn` with `kind: parked`, the question, G.O.D.'s
  recommendation, why it is high-risk, the step to resume at, and the units it blocks. The blocked
  units are the unit it belongs to and every unit that depends on that unit through the scope map's
  `dependsOn`, directly or through others. A parked gate blocks the next-phase units step 3 names.
  Set the unit `parked` and end its helper (N8b). **Everything else continues.** A high-risk
  question is never assumed.
- **A design to review: hold it.** A screen G.O.D. designed under `--create` (item 2.3) is logged
  as `DQ-nn` with `kind: review`, the `page.md` path, and the screen tasks held. It blocks no unit.
  Only those screen tasks wait, and they are built once the user approves or changes the design.

Every item is written at once to `decisionQueue` in the state file and to
**`docs/GOD-Decisions.md`** (`references/document-templates.md` § 6). That file is the live view,
kept current as the run goes, so the user can open it at any time. Under the bridge, each item is
also posted to the room as one line. A parked item does not wait for an answer there, and the run
goes on.

### Sittings, the run report, and the decision review

There is no time budget. A **sitting** ends when **no unit and no N8c step is ready, and no helper
is running**. A unit waiting to be scoped, specified, designed, or implemented counts as ready, and
so does an N8c step any scope can take. Everything is then done, parked, behind a parked item,
holding screens for review, waiting on a `pending` readiness item (R1), waiting on the overnight
tests (N8c step 8), or waiting on the testers (N8c step 9). So a sitting runs as far as the parked items allow: built,
code review, fixes, smoke test passed, and the nightly run scheduled.

When the sitting ends:

1. Bring the state file up to date, record the sitting's end in `sittings`, run
   `node _wxAI/impact/unattended.mjs stop`, and make the local commit for any finished unit.
2. Write **`docs/GOD-Run-Report.md`** (`references/document-templates.md` § 7), which covers:
   - what was built
   - the gate answers, as a summary
   - **every question answered from the ledger, with its ledger id** (the `gateLog` rows sourced
     `ledger D-nnnn`), and **every assumption in `decisions/assumptions.yaml`**. Both lists are
     always present: when one is empty, write "None this sitting."
   - **every KAIN answer awaiting the owner's review** (`node _wxAI/askgate/kain.mjs list --json`,
     template § 3c), always present, "None awaiting review." when empty
   - every assumption taken, with its cost to undo
   - every parked question, with G.O.D.'s recommendation and the units it blocks
   - the repairs and the defects filed
   - the known skips from N6c
   - the Beta fixes listed (N8c step 10)
   - the cost report's proposals section (SPEC-143): run `node _wxAI/routing/report.mjs`, then copy the "Proposals" section of `docs/agent-cost-report.md` into the report for the owner to approve. G.O.D. only lists proposals; it never applies one
   - the user's next steps: the push, the overnight run, and who has to sign which human test
3. **The decision review.** Present every open queue item at once, in plain text, numbered: the
   parked items first, then the designs to review (each with its `page.md` path), then the
   assumptions. Each item gives the question in one line, G.O.D.'s recommendation or the
   assumption taken, and what it blocks or costs to undo. Under the bridge, post the same list to
   the room as one message. Say that the user can answer by number, change only some ("all
   recommended, except 2: …"), or answer "all recommended". **A Change Impact data-loss item is the
   exception.** "All recommended" never covers it, because its answer is recorded with
   `approve.mjs` as the user's own. List those items apart, and take each one only as an answer to
   its own number.
4. Then offer `/clear` and `/wxG-O-D --resume` for the next sitting, or keep going now if the user
   answers in this conversation.

**Applying the answers**, at once when the user answers now, or on `--resume`. First run
`node _wxAI/impact/unattended.mjs start --by wxG-O-D` and open the next sitting in `sittings`, so no
released unit runs before the marker is on. On `--resume`, N10 has already done both. Then:

- **A parked item answered:** record the answer (a data-loss item through `approve.mjs`; a design
  item as an `ADR-` or decision-log row), release its units, and run each one again from its
  `resumeAt` step (N8b). A parked gate is checked again.
- **A design reviewed:** on approval, set the screen tasks back to `todo` and run `/implement NNN`.
  On changes, run wxDesigner again with them in the main conversation, SAVE, then do the same.
- **An assumption kept:** mark it `done`.
- **An assumption reversed:** file the change as a fix task on the spec it touched, and run it
  through N8c step 5.
- Mark each applied item `done` in `decisionQueue` and `docs/GOD-Decisions.md`, then continue from
  `nextAction`.

Without `--create`, an overview keeps the ask-then-go behavior of N2 to N8.

## N12. Unattended under the Project Agent

The Project Agent is the project's Remote Session Bridge running in project-agent mode, the only
remote path there is. Wherever this file says "under the bridge", it means a run the Project Agent
has taken over through this section.

**The offer, once per run.** Right after the plan is approved (N6), check whether the project's
Project Agent is running. Under `--create` the offer is made earlier, in the N6c readiness check
(R7), so the run never waits on it after approval, and the handoff happens at the end of N11 item 1.
The check is one file: `.wxai/remote-session.lock` exists and its `owner` is `project agent`. Never
look in `.env` for this; the old room keys there are no longer used.

If the lock is missing or names another owner, say nothing about remote and continue in the editor
with checkpoints. If a project agent holds it, offer once, in plain text: "Your Project Agent is
running. I can hand this run to it, so it continues unattended and sends every question to your
phone. Want that?" Record the offer and the answer in the state file (`bridge`). Declining changes
nothing.

**Handing off, on yes.**

1. Save the state file with the current `position` and `nextAction`. Under `--create`, `phase` is
   already `execute` and sitting 1 is open (N11 item 1), so the agent's `--resume` continues the
   build and never re-opens the design review.
2. Hand over with HANDOFF REMOTE (`_wxAI/rules/remote.md`): write the summary fields to a temp file
   (names and counts only, never file contents or secrets) with the next step set to exactly
   `/wxG-O-D --resume`, and run
   `node wxkanban-agent/apps/remote-bridge/bin/handoff-remote.mjs --input <temp file>`. It prints one
   line.
3. If that line says the handoff **stopped** (Allow remote off, no company YappChatt account, or the
   agent not running), show the line as it is and carry on in the editor with checkpoints. Nothing
   was posted.
4. If it says the handoff was **written**, tell the developer: the agent will post it to the room
   and ask one question; answer "go" there and it runs `/wxG-O-D --resume`. List the room's control
   words: `STATUS`, `STOP`, `CONTINUE`, `VERBOSE` / `CONCISE`, `PUSH` → `CONFIRMED` / `NO`,
   `CANCEL REMOTE`. Add that "where are we?" gets the plan position.
5. **Stop driving from the editor.** One driver per working tree: from here the Project Agent runs
   G.O.D. End this turn and do no further work in the editor session.

**Under the Project Agent, G.O.D. drives and KAIN relays.**

- The handoff turn itself only reads: the agent runs nothing until the developer says go. Then it
  runs `/wxG-O-D --resume` and continues the plan from the state file.
- Every question G.O.D. asks and every request to do something outside the plan goes to the room as
  a message, verbatim, naming the unit and the gate. Ask in plain text with numbered options, since
  the phone shows no menus. This includes N2's and N6's choices whenever the session runs under the
  Project Agent. KAIN carries the question and the answer; it never answers for the developer and
  never changes the plan.
  - **Under `--create`,** nothing is asked mid-run (N11 item 4). G.O.D. posts each gate answer it
    gives and each decision-queue item as one line, so the developer can see it and say stop, and
    the run goes on without waiting. When the sitting ends, the decision review goes to the room as
    one numbered message (N11 § Sittings). The developer can answer by number or "all recommended",
    and the answers are applied at once. A data-loss item is listed apart and answered only by its
    own number. "All recommended" never covers it.
  - **Without `--create`,** every gate, approval, and choice a pipeline command asks goes to the
    room. The run waits for the answer, then continues.
- After every unit and every gate, update `position` and post it as one line, for example
  `Phase 1 · S03 Orders · implement started`. When the developer asks where the run is, answer with
  the position and `nextAction` from the state file. The room's `STATUS` word reports the session
  itself (project, working or idle).
- **Pushes:** G.O.D. never pushes. The session cannot push on its own; the only path is the
  developer's `PUSH` → pre-push review → `CONFIRMED`, recorded as KAIN's grant. A push attempted
  without that grant is refused: report it in the room and never retry it.
- **Stopping:** `STOP` interrupts a turn, and `CONTINUE` resumes it. `CANCEL REMOTE` ends remote
  mode; the state file keeps the position, and `/wxG-O-D --resume` in the editor continues from it.
- **Checkpoints** work as N9 says for the bridge: save, post, carry on.
- A defect stops the run as `SKILL.md` Rules say (under `--create`, only an unsafe one, N11). The
  stop is posted to the room with the text the developer should report through the Cockpit
  feedback.

## Known kit gaps

Without `--create`, a gap is surfaced to the user and never worked around. Under `--create`, G.O.D.
handles it as the last column says, logs it in `repairs` when it wrote or fixed something, and
reports a kit defect with `project.submit_feedback` (N11). Under `--create`, "stop" in the middle
column never applies. A gap the last column does not settle goes to the decision queue.

| Gap | What G.O.D. does | Under `--create` |
|---|---|---|
| A kit older than v1.7.72 gates `/implement` on the project's stage, not the named scope's | Stop and tell the user a kit update fixes it (N8) | Build the spec's tasks yourself the way `/implement` would, as a logged repair; report it |
| The scope drafting tool has no field for functional requirements, so they can come back as placeholders | The N7 requirements check, with the user's approval for the repair | Put the approved requirements in; log the repair |
| A spec or scope lacks its `Implements SCOPE-NNN` / `**Implemented By**` cross-reference | Show the user; add the line only with their OK (N8) | Add it; log the repair |
| `/createSpecs` defaults leave a spec in `draft`, which blocks the stage advance | Pass a `phase` that yields `planned` (N8) | Same |
| A kit older than SPEC-136 FR-017 lets `/implement` run only while exactly one spec is active | Stop and tell the user a kit update fixes it; never change spec statuses (N8, N8b) | Never change spec statuses; build the spec's tasks yourself as a logged repair; report it |
| The room's `STATUS` word reports the session, not the plan position | Post the position after every unit and gate, and answer "where are we?" from the state file (N12) | Same |
| SCOPE numbers can be counted from disk or from the database, and the two can disagree | Record the number the command assigned; never renumber | Same |
| Some command prompts still name `/scope-validate` and `/wxAI-pipeline` as next steps | Use `/validateScope` and `/createSpecs` | Same |
| A scope with no machine tests stops in QA (SPEC-123) | Make sure `/implement` Phase 5 filed its test plan, then run it (N8c steps 6 and 8) | Same |
| `runqa`, `runhuman`, `prepareRelease`, and `finalizeRelease` are listed but have no handler | Never run them; N8c uses the real commands and the per-scope advance | Same |
| `/wxAI-qa`, `/wxAI-humantest`, `/wxAI-beta`, and `/wxAI-release` need a prerequisites script that does not exist, and track only a local file | Never run them; the test gates come from `/wxCreateTestPlan` and `project.test_gate_status` | Same |
| `/preTest --nightly` refuses without a UAT target, test accounts, or a non-production address | N8c step 6 runs it (SPEC-140). When its check refuses, say what is missing and leave the full test as the user's next step | Same, and list it in the run report (N11). The N6c readiness check asks for these up front |
| Beta has no fix path: N8c step 10 sends Beta fixes through `/implement`, which refuses a scope in Beta, and Beta's exit rule (no open tasks) is already met, so a scope passes straight through | Tell the user and list each Beta fix (N8c step 10). The product decision is open (the Manual's open items 3 and 6) | Let the scope pass through Beta; list each Beta fix in the run report |
| `/wxDBAnalyze` reviews PostgreSQL only, and the kit may lack its database driver | Run it when it connects; otherwise record the skip (N8c step 3) | Same |
| No command deploys a release, checks dependency licenses, or tests accessibility automatically | The user deploys; the license check is a release work package done by hand; accessibility relies on `/wxUIUXCodeReview`'s advisory checks. Say so in the plan | The user still deploys. G.O.D. does the license check itself as the release work package |
| Review findings have no path to tasks | With the user's OK, G.O.D. adds each approved fix as a task on its spec, then runs `/implement` (N8c step 5) | G.O.D. decides the fixes (N8c step 1), files each as a task, and runs `/implement` |
