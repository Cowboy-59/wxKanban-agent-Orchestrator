# Review and brainstorm — going over the findings with the user

Used in plan mode between the evidence intake (step 4) and the interview (step 5). The levels below
also apply in new-project mode. Every brainstorm, in either mode, is run by the wxBrainstorm skill
(§ Brainstorming: run by wxBrainstorm).

The user reads the findings one section at a time, corrects them, and talks through G.O.D.'s
suggestions. What they settle becomes Confirmed input to the plan. Many users have never run a
development project, so the review is also where they learn how one works. Pace and explanation
follow the user's level.

**The whole review is plain text.** Every question is asked in chat and answered in the user's own
words. Never use choice menus (`AskUserQuestion`) anywhere in the review or a brainstorm.

## Levels

Use `--level=amateur|junior|senior` if it was passed (also `--amateur`, `--junior`, `--senior`;
"amature" is accepted too). Otherwise ask at the start of the review, in one plain sentence. Keep
the level in `docs/GOD-State.json` (`"level"`) so a resumed review keeps it.

| Level | Who | How G.O.D. walks each item |
|-------|-----|----------------------------|
| **Amateur** | New to development projects | Walk every item using the amateur pattern below. Explain each idea in simple terms the first time it appears, and teach the good practice behind it |
| **Junior** | Has been through some of this | Same walk-through. Shorter explanation for anything the user has already met; full explanation only for what's new to them |
| **Senior** | Has done this several times | Walk through the suggestions, one line each, and let the user ask from there |

At every level, **"explain"** gets the longer version: background, an example, the trade-offs, and
how it would be built. Then go back to the short form.

**Moving up.** When an amateur has closed two or three sections without needing basic terms
explained again, or a junior is skipping the explanations, suggest the next level in one sentence.
The user decides; never change level on your own.

### The amateur pattern

For each item, in this order. Each part is one or two short sentences:

1. **Where we are**: a breadcrumb, such as "Section 1 › Area 1 (web sign-in) › point 4 of 8".
2. **What it is**: plain words, no jargon. If a technical term is unavoidable, explain it in one
   clause ("single sign-on, meaning signing in with an account you already have, such as Google").
3. **Why it matters**: the benefit or the risk in business terms (support calls, security, cost,
   time), not technical terms.
4. **My suggestion**: the recommendation, plainly, with one reason.
5. **Good practice** (optional, one line): the general lesson behind it, so the user learns it once
   and recognises it later.
6. **Your call**: one plain question the user can answer in their own words.

Stop there and wait. No option tables, no lists of alternatives, unless the user asks ("what else
could we do?") or says "explain".

### Getting started (amateur and junior)

Before section 1, tell the user how the review works, in six short lines:

- First, two quick questions: is it commercial, and will it be web-based or installed?
- Then we'll go through five sections: what's built, the business rules, what isn't built, the top
  risks, and the decisions needed.
- For each one, tell me whether it looks right, needs changes, or whether you'd like to talk it
  through.
- Say "explain" any time you want more detail. Say "done" when you've finished with a section.
- Nothing gets written until you approve a summary at the end of each section.
- The scratch pad shows where we are. In VS Code, open `docs/GOD-Scratchpad.md` and press `Ctrl+K V`
  to keep its preview beside the chat.

At senior level, give only the last line.

## The scratch pad

`docs/GOD-Scratchpad.md` is a one-screen live view of the review, kept beside the chat so the user
never loses their place. It is a **display, not a record**: it mirrors what is on screen, and the
plan never reads it. Decisions are recorded only after the user approves a brainstorm's summary
(§ Brainstorming: run by wxBrainstorm). While wxBrainstorm runs a topic, it uses this same scratch pad.

- **Create it** when the review starts, right after the level is set. Tell the user how to open it
  beside the chat: in VS Code, open the file and press `Ctrl+K V` ("Markdown: Open Preview to the
  Side"); in other editors, open it in a second window. The preview refreshes on its own whenever
  the file changes.
- **Contents**, top to bottom:
  1. The "how this works" lines (amateur and junior), and the level.
  2. The five sections, each marked open, in progress, or closed.
  3. **Where we are**: the breadcrumb.
  4. The areas of the current section, each with its status.
  5. The current list, each item with its status (Agreed · Changed · Added · Suggestion ·
     Parked → Area N).
  6. **Waiting**: items noted for the end of the list, and items parked in other areas.
  7. **Agreed so far, not yet recorded**: one line per decision since the last approved summary.
- **Update it** at the end of every turn where the position, a status, or the list changed. Side
  questions ("question") don't change it.
- **Keep it to one screen.** When a section closes and its summary is approved, collapse that
  section to one line ("Section 1: closed, 9 decisions recorded") and move on.
- **Never put** secrets, file contents, or anything not already shown in the chat in it.

## Opening questions

Three questions open the conversation in both modes, because their answers change what is planned,
what it costs to run, and what the rest of the discussion is about:

- **Plan mode:** right after the level is set and the scratch pad is up, before section 1.
- **New-project mode:** as agenda items 1 to 3 of the idea brainstorm (`new-project.md` § N2b).

Ask them in plain text, one at a time and in this order, and settle all three before going on. When
the evidence already answers one, show the answer with its source for the user to confirm. For
example: "The code bills each customer monthly (`src/billing/invoice.ts`), so it is commercial.
Correct?"

1. **Who is it for?** "Are you building this for your own organization (an internal build), or for a
   customer (consulting)?" A `--customer` naming another organization suggests consulting; confirm
   it.
2. **Commercial or not?** "Will this be a commercial application, sold or licensed to other
   businesses or the public, or is it for your own organization's use?" In consulting, ask it about
   the customer: will the customer sell it, or use it themselves?
3. **Web-based or installed?** Ask this whatever the earlier answers were: "Will people use it in a
   web browser, with the system hosted on a server (web-based), or will it be installed on each
   computer or on your own office server (installation)?" "Both" is a valid answer. For an existing
   system, ask about the system being planned, and say what it is today: "Today it is installed on
   each PC (a WinDev desktop app). Will the new system be installed as well, or web-based?"

At amateur level, explain what each answer means for the build before asking. For example:
"commercial means other businesses pay to use it, so it needs sign-up, billing, and each customer's
data kept apart."

**Recording.** Show each answer as a one-line summary. Once the user approves it, append it to
`docs/GOD-Brainstorm.md` as a decision, with the source "review (opening), YYYY-MM-DD" in plan mode
or "brainstorm (idea), YYYY-MM-DD" in new-project mode. Also record it in `docs/GOD-State.json` as
`buildFor` (`internal` / `consulting`), `commercial` (`true` / `false`), and `delivery` (`web`,
`installed`, or `both`), so a resume never asks again.

**What the answers change:**

| Answer | What it adds |
|---|---|
| Internal build | The build-vs-buy or competitors topic below, taken up right after these questions. |
| Consulting | Nothing extra: the customer has already decided to build, and G.O.D. does not reopen that. |
| Commercial | The commercial items below. The customer forecast and the planned price (interview PD3 and PD4, or NP8 and NP9 in new-project mode), which size the cost projection and its margin. |
| Web-based, or both | The projected SaaS cost, `docs/GOD-SaaS-Cost.md` (`database-options.md` § Projected SaaS cost): the five lowest-cost providers or mixes of providers, plus AWS. |
| Installed, or both | The installed-app items below. An installed-only system gets no cost projection. Its database follows the Internal office column, or a local database per installation for a single-user app. |
| Not commercial | Nothing extra. The system is sized for the user's own organization (D2, D4). |
| A delivery different from today's (plan mode) | A major decision: list it in section 5, Decisions needed, with an `ADR-` and what it changes. |

**Commercial items:**

- customer sign-up and onboarding
- each customer's data kept apart from every other customer's, with an `ADR-` for how (one shared
  database with a customer key on every row, or a database per customer)
- subscriptions or licenses, and billing through a payment provider, so card data stays with the
  provider
- plans and their limits
- an admin view of customers
- terms of service, a privacy policy, and a support channel
- update delivery, plus license activation for an installed app

**Installed-app items:**

- the installer and packaging
- code signing
- update delivery
- the supported operating systems
- where the data lives (`database-options.md`)

If `stack.md` names a web stack for an installed system, raise an `ADR-` for how it ships as an
installed one: a packaged web app or a native desktop stack. Never change `stack.md` quietly.

**Build vs buy, or competitors (internal builds only).** Take this up as the first topic after the
opening questions, before anything is designed. Never raise it in consulting.

- **Not commercial: build or buy?** Research, with the web tools, three to five products or online
  services that already do what the overview (or the existing system) does. For each one, give what
  it covers of the features and what it lacks, its published price with the date checked and the
  page, who owns the data, and how far it can be changed to fit. Then recommend build, buy, or buy
  and extend, with the reason, and record the decision as an `ADR-`.
- **Commercial: competitors.** Research three to five products that already sell to the same
  customers. For each one, give what it offers, its published price, and its gaps. Then ask what
  will make this product the one customers choose. If there is no clear answer, say plainly that
  this is the biggest risk to the product. The differences settle which features come first.
- Never invent a product, a feature, or a price. Without web access, say so, list what should be
  compared, and record an `ASSUMP-`.
- At amateur level, explain why the question comes first: building what can be bought is the most
  expensive mistake a project can make.

**How each mode uses the items.** In new-project mode, each item becomes a `FEAT-` marked
**Proposed** for the design discussion (`new-project.md` § N4), never MVP by default. In plan mode,
check each one against the evidence:

- an item that exists goes in section 1, with its citation
- an item that is missing goes in section 3, Not built, as a Suggestion for the user to decide,
  never assumed

## The five sections

Present the intake results as five sections, in this order:

| # | Section | What it holds |
|---|---------|---------------|
| 1 | **Built and working** | What exists and works today, area by area, each with its caveats |
| 2 | **Business rules** | Every rule pulled out of the code, and the best-practice rules proposed beside them, area by area (`business-rules.md`) |
| 3 | **Not built** | What the evidence, scopes, or specs call for that does not exist yet |
| 4 | **Top risks** | The P0 and P1 candidates, in plain words |
| 5 | **Decisions needed** | The questions only the user can answer, each with G.O.D.'s recommendation |

Rename a section when the project calls for it. In conversion mode, section 1 becomes "What the
legacy app does". Keep the order and the count.

Section 1 opens with the area **Who uses it**: the user personas, drafted from the evidence (roles,
permissions, and the screens each role reaches) in the format of `document-templates.md` § 1
(management plan § 3.1). Personas the evidence cannot show (an approver who signs off on paper, a
customer who only receives emails) are added as Proposed for the user to confirm.

Section 2 follows its own order inside each area, decisions first and the ordinary rules offered as
one group (`business-rules.md` § Discussing them). Its areas come from the register,
`docs/GOD-Business-Rules.md`, which the intake wrote. If the project has no code, section 2 holds
only the best-practice proposals.

Inside a section, number the **areas** (one row each: what's there, its caveats or gaps, and the
evidence behind it, labelled Likely or Assumed where it isn't confirmed). Keep each area to a few
lines; the full detail goes in the documents later. At amateur level, add one plain sentence per
section saying what the section is for.

Before showing section 1, save the five sections to `docs/GOD-Review.md`. These are G.O.D.'s
working notes from the intake, kept so that a `/clear` doesn't lose them. Update the file only when
the user corrects a section.

## For each section

1. Show the section.
2. Ask, in plain text: does it look right, does anything need changing, or would they like to talk
   it through?
3. Follow their answer:
   - **Looks right**: move to the next section.
   - **Changes**: correct the section, show it again, and ask again.
   - **Wants to talk it through**: note the topic for the brainstorm offer after the review, say so
     in one line ("Noted: we can brainstorm that once we have looked through everything."), and carry
     on with the section. Never start a brainstorm mid-review (§ Offering the brainstorm).

## Offering the brainstorm

G.O.D. looks through everything before it offers a brainstorm. Never start one in the middle of the
review: when all five sections are done, G.O.D. has read every finding with the user, and only then
asks.

1. **List the topics** gathered on the way, numbered: each point the user said they wanted to talk
   through (noted during the sections), each item in section 5 (Decisions needed), the top risks from
   section 4, and any business-rule area left undecided. Add G.O.D.'s own recommendation of the one
   or two topics most worth discussing, with one line of reason each.
2. **Ask, in plain text,** whether the user wishes to brainstorm, and let them choose:
   - **yes**, and which topics (any from the list, in the order they pick, or one of their own), or
   - **no**, and continue to the interview.
   At amateur level, add one line on what a brainstorm is: "the panel talks a topic through from
   every side before anything is decided; nothing is written until you approve the summary."
3. **Each chosen topic goes to wxBrainstorm** (below), one at a time. After each, show the list again
   with each topic's status and ask the same question: another topic, or continue.
4. **No is a full answer.** Record nothing for the brainstorm and go on to the interview. The topics
   stay noted in the state file, so a later `--resume` can offer them again.

In new-project mode the same rule holds: G.O.D. reviews the whole overview and drafts the rules
before it asks (N2). Under `--create` it does not stop at that question: the brainstorm is offered at
the design review pause (N6), the run's one stop, after G.O.D. has looked through the whole design.

## Brainstorming: run by wxBrainstorm

G.O.D. does not run a brainstorm of its own. Every brainstorm (each topic the user chooses at the
offer above, the idea brainstorm in new-project mode N2b, and the design brainstorm at the review pause N6) is run
by the **wxBrainstorm** skill in embedded mode: read `.claude/skills/wxBrainstorm/SKILL.md` (its
§ Embedded in wxG-O-D) with its `references/panel.md` and `references/conduct.md`, and follow them.

- **Hand it:** the topic (the section or area, the idea, or the design), the user's level, the agenda
  when G.O.D. has one (N2b), and the evidence G.O.D. already holds. G.O.D. plays the Lead Architect,
  so it chairs the panel of the eleven roles.
- **The discussion** follows wxBrainstorm's rules: plain text, one item at a time at the user's pace,
  the agenda relisted with statuses before every "which next?", new points noted and added at the
  end, "question" answered and set aside, nothing written while a topic is open. G.O.D.'s scratch pad
  (above) stays the user's one view.
- **Closing:** wxBrainstorm's summary (Agreed · Added · Changed · Declined · Parked), then G.O.D.'s
  three choices: add it to the plan, the scope, and the specs; add it to the plan only; or change it
  first. On either "add", wxBrainstorm writes its record in `docs/brainstorms/` and the learnings
  file; then append each decision to `docs/GOD-Brainstorm.md`, one row per item, with:
  - the section and area (or "idea" / "design")
  - the decision
  - its kind (Agreed / Added / Changed / Declined / Parked)
  - whether it goes to the scope and specs
  - the source "brainstorm (review | idea | design), YYYY-MM-DD" and the record's path
- **wxBrainstorm's hand-off step never runs inside G.O.D.** What happens to items marked for the
  scope and specs is decided below (§ What the decisions do).
- **No wxBrainstorm in this project** (an older kit): say so, suggest updating the kit, and continue
  the review without a brainstorm. Never improvise one.

## Learning from decisions

G.O.D. learns from the decisions users approve, so its suggestions get better from one project to
the next.

**Where:** one file per user, across all their projects:

- Windows: `%USERPROFILE%\.wxai\god-learnings.md`
- macOS and Linux: `~/.wxai/god-learnings.md`

Create the folder if it's missing. It's the only file G.O.D. writes outside the project's `docs/`.

**When it's written:** by wxBrainstorm, when the user approves a brainstorm's summary (either "add"
answer), following its `references/conduct.md` § Learning from decisions. G.O.D. never writes it a
second time. Nothing is learned while a brainstorm is open. The rules below are the ones both follow.

**What's written:** the general pattern behind each Agreed, Added, or Changed item. Parked items are
skipped.

- **Group by topic,** for example: Sign-in and accounts · Email · Second sign-in check · Secrets and
  vault · Desktop helpers · Subscription · Assistant · Deployment · Data.
- **Each entry has:**
  - the **pattern**, in one or two plain sentences
  - **Instead of**: G.O.D.'s original suggestion, when the user changed it. This is the most useful
    thing to learn.
  - **Chosen** (how many times), **Declined** (how many times, when a later project went the other
    way), and **Last** (date)
- **Merge, don't duplicate.** If a pattern is already there, update its counts. If this project went
  another way, record it as declined, with a few words on why if the user gave a reason.
- **General only.** Never write project or customer names, people, file paths, scope or spec
  numbers, data, or secrets. Generic technology names are fine (Google Authenticator, SMTP). If a
  pattern can't be stated without project detail, leave it out.

**How it's used:**

- Read the file at the start of the review, and again before each suggestion.
- When a learning fits, make it the suggestion and say where it came from. At amateur level, say
  "suggested because you chose this on an earlier project".
- If this project's evidence argues against it, say that too.
- A learning is only a suggestion. The user decides again on every project, and the learning never
  counts as a decision or as evidence.

**The user stays in charge.** The first time the file is written, tell the user where it is. They can
read, edit, or clear it at any time. G.O.D. never copies it into a project or sends it anywhere.

## What the decisions do

- **Every item in `docs/GOD-Brainstorm.md` counts as Confirmed** (source: the brainstorm).
  - It is an interview answer, so the interview (step 5) pre-fills from it and skips what it settles.
  - Where an item contradicts the evidence, the item stands and the evidence is noted as superseded.
  - The exception is evidence of a safety or data-loss problem. Raise that as a GAP instead.
- **Items marked for the scope and specs are carried out after the plan is delivered** (step 12).
  - One item at a time, with the user's go before each.
  - For each item, G.O.D. runs `/buildscope` (to amend the affected scope, or create a new one), then
    `/validateScope`, then `/createSpecs`.
  - Each command follows **all** of its own rules and gates. G.O.D. never edits a scope or spec file
    itself.

## Checkpoints

A long review fills the conversation, and a full conversation slows G.O.D. down and loses detail.
So the review is built to be cleared and resumed at safe points.

**When:**

1. Between slices of the business-rule extraction, when it spans more than one conversation
   (`business-rules.md` § Extracting them).
2. After the intake reports are saved (`docs/GOD-Intake/`) and `docs/GOD-Review.md` is written,
   before section 1.
3. After each section summary (or split-out area) is approved and recorded.
4. Whenever the user says the conversation is getting long.

**What G.O.D. does at a checkpoint:**

1. Bring `docs/GOD-State.json` up to date, with `nextAction` naming the **next item** in plain
   words (for example, "Section 1 › Area 1 › internal install › point 1: one install is one
   company").
2. Bring the scratch pad up to date.
3. Tell the user, in plain text:

   > Checkpoint saved. Type `/clear`, then `/wxG-O-D --resume`, and we'll carry on with: <the next
   > item>.

   At amateur level, add one line on why: "a long conversation slows me down and can make me lose
   detail; everything we've done is saved."

G.O.D. can't clear the conversation itself; only the user can type `/clear`. The user may choose to
keep going instead. In that case, continue normally and offer again at the next checkpoint.

## Resume

After each section closes, write `docs/GOD-State.json` with:

- `"mode": "plan"` and `"phase": "review"`
- the `"level"`
- `"buildFor"`, `"commercial"`, and `"delivery"`, once the opening questions are settled
- `"rulesExtraction"` (slices and slices done), while the business-rule extraction is unfinished
- the sections already closed
- `nextAction`, in plain words

`/wxG-O-D --resume` then:

1. Re-reads `docs/GOD-Review.md`, `docs/GOD-Brainstorm.md`, and `docs/GOD-Scratchpad.md`.
2. Shows where the review stands: each section closed or open, with the decisions so far. Then
   brings the scratch pad up to date and reminds the user how to open it.
3. Continues with `nextAction`, the next open item, at the saved level. Relist the current list
   first, so the user sees where they are.

Resume doesn't re-read `docs/GOD-Intake/`. Those reports are read when the plan is written (step
6), or when a point under discussion needs a specific citation.

Once the review is finished, set `"phase": "interview"`. Set it to `"done"` after delivery.
