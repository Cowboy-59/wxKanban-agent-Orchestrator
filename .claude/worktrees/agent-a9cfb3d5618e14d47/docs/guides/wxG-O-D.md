# wxG-O-D — Guru of Development: User Guide

G.O.D. is your project planner. Point it at a project, or give it a `ProjectOverview.md`, and it
reads the material, goes over its findings with you, asks you what is still open, and writes a
complete development plan into `docs/`, with a PDF of each document. For a new project it can also
build the application, running the wxKanban commands for you from the design you approved.

You run it with one command, `/wxG-O-D`, in your AI client (Claude Code, Cursor, or another
supported client).

---

## Contents

1. [What G.O.D. does](#1-what-god-does)
2. [Before you start](#2-before-you-start)
3. [Which command do I run?](#3-which-command-do-i-run)
4. [Options](#4-options)
5. [The four modes](#5-the-four-modes)
6. [Working with G.O.D. during a run](#6-working-with-god-during-a-run)
7. [What you get](#7-what-you-get)
8. [Pausing and resuming](#8-pausing-and-resuming)
9. [Running unattended from your phone](#9-running-unattended-from-your-phone)
10. [What G.O.D. will never do](#10-what-god-will-never-do)
11. [After G.O.D.: next commands](#11-after-god-next-commands)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. What G.O.D. does

| Feature | What it means for you |
|---|---|
| **Reads all the evidence** | Your code, documents, database scripts, screenshots, notes, `ProjectOverview.md`, `stack.md`, and any WinDev/WebDev, VB6, or Clarion conversion output. It skips gitignored files and wxKanban kit files on its own. |
| **Pulls out every business rule** | Every rule found in the code is listed with the file it came from. Rules are read in full, never sampled. G.O.D. also proposes best-practice rules beside them, clearly labeled as proposals. |
| **Labels how sure it is** | Every finding is marked **Confirmed**, **Likely**, **Assumed**, **Unknown**, **Conflicting**, or **Deprecated**, with a file citation. Nothing it finds is dropped without a status. |
| **Reviews the findings with you** | Section by section, in plain text, at your experience level. Nothing is written until you approve each summary. |
| **Interviews you** | It asks only what the evidence could not answer, such as users, data size, hosting, compliance, start date, and team. Anything you leave unanswered gets a stated default. |
| **Estimates AI delivery time** | It gives two options: the quickest team size, and the most AI agents your machine can run. A script does the arithmetic, so the same input always gives the same numbers. |
| **Recommends a database and hosting** | It compares internal office, cloud, and distributed hosting and picks one, with the reason. |
| **Draws the data model** | It draws an entity diagram (ERD) with suggestions for keeping the data consistent. |
| **Projects hosting cost** | For a web-based system it researches the five lowest-cost providers or combinations, plus AWS, at the time of the run. For a commercial app it adds your price and margin. This document is for you only and never goes to the customer. |
| **Writes the plan** | It writes a customer document, a management plan, a build roadmap, and process and design diagrams, each rendered to PDF. |
| **Builds a new project** *(optional)* | After you approve the design, it runs `/buildscope`, `/validateScope`, `/createSpecs`, and `/implement` for you. With `--create` it carries the project all the way to release. |
| **Learns your preferences** | It remembers the general patterns you choose, never project details, and uses them to make better suggestions on your next project. |

---

## 2. Before you start

- **The wxKanban MCP server must be connected.** G.O.D. fetches its instructions from wxKanban when
  it runs. If it isn't connected, see [Troubleshooting](#12-troubleshooting).
- **Node.js** runs G.O.D.'s helper scripts. They are installed with the kit in
  `.claude/skills/wxG-O-D/scripts/`.
- **PDF rendering** needs `marked`, `puppeteer`, and `mermaid` in the project. If one is missing,
  G.O.D. prints the `npm install` line. The Markdown documents are still complete without the PDFs.
- **For a new project**, put a `ProjectOverview.md` in the project. It should cover what the system
  is, who uses it, the main features, the data, any outside systems, and how you will know it worked.
  G.O.D. reviews it and tells you which parts are thin or missing.
- **Optional:** a `stack.md` at the project root tells G.O.D. your target technology. Without one,
  it recommends a stack.

---

## 3. Which command do I run?

| Your situation | Run |
|---|---|
| I have an existing project and want a plan for it | `/wxG-O-D` |
| I only want G.O.D. to look at certain folders | `/wxG-O-D --dir=legacy/src,legacy/docs` |
| I am converting a WinDev, VB6, or Clarion app | `/wxG-O-D` (it finds the conversion output on its own) |
| I have an idea for a new project, written up as an overview | `/wxG-O-D ProjectOverview.md` |
| I want to talk the idea through before any design | `/wxG-O-D ProjectOverview.md --brainstorm` |
| I want G.O.D. to design it, check with me once, then build it all | `/wxG-O-D --create ProjectOverview.md` |
| I only want the build roadmap updated | `/wxG-O-D --roadmap` |
| My run was paused, or I cleared the conversation | `/wxG-O-D --resume` |
| I am new to software projects and want everything explained | Add `--level=amateur` to any of the above |

---

## 4. Options

| Option | What it does | Default |
|---|---|---|
| `--dir=<dir>,<dir>...` | Read only these folders. Separate them with commas, or repeat `--dir`. Paths can be relative or absolute; quote any with spaces. | The whole project, minus gitignored and kit files |
| `--customer="<name>"` | The customer name used in document titles | From `ProjectOverview.md`, else `package.json`, else the folder name |
| `<file>` or `--overview=<file>` | Start from a `ProjectOverview.md`. G.O.D. then asks whether the project is new. | None |
| `--brainstorm` | Brainstorm the idea right after the overview review, before any design | You are asked |
| `--level=amateur\|junior\|senior` | How much G.O.D. explains. Also accepted: `--amateur`, `--junior`, `--senior`. | You are asked at the start of the review |
| `--create` | Design the project, pause once for your review, then build and carry it through to release. Needs an overview. | Off |
| `--cap=<n>` | Use at most this many AI agents at once. `--cap=1` builds one piece at a time. | The most your machine can run |
| `--resume` | Continue a paused run from `docs/GOD-State.json` | — |
| `--roadmap` | Write only the build roadmap, `docs/DEVELOPMENT-PLAN.md`, and its PDF | — |

### Examples

```bash
/wxG-O-D                                                   # the whole project
/wxG-O-D --customer="Acme Freight"
/wxG-O-D --dir=legacy/src,legacy/docs,db/scripts           # only these folders
/wxG-O-D --dir="customer files/specs","customer files/screens"
/wxG-O-D --level=amateur                                   # explain every idea in plain terms
/wxG-O-D ProjectOverview.md                                # review it; if new, design and then build
/wxG-O-D --overview=docs/ProjectOverview.md --customer="Acme Freight"
/wxG-O-D ProjectOverview.md --brainstorm                   # brainstorm the idea before any design
/wxG-O-D --create ProjectOverview.md                       # design, one review, then build it all
/wxG-O-D --create ProjectOverview.md --cap=2               # ...with at most 2 agents at once
/wxG-O-D --resume                                          # continue a paused run
/wxG-O-D --roadmap                                         # only docs/DEVELOPMENT-PLAN.md and its PDF
```

`/dev-plan` still works for one more release. It runs `/wxG-O-D --roadmap`.

---

## 5. The four modes

### Plan mode — assess what you have (the default)

Use this for an existing codebase, a set of customer documents, or a legacy app you are converting.

1. **Setup.** G.O.D. creates `docs/` and checks how many AI agents your machine can run at once.
2. **Context.** It reads `ProjectOverview.md` and `stack.md` if they exist.
3. **Inventory.** It lists every file it will treat as evidence in `docs/GOD-Inventory.json`. It
   lists secret files such as `.env` files, keys, and certificates by name only and never opens them.
4. **Intake.** Read-only helpers read the evidence in parallel. Each report is saved in
   `docs/GOD-Intake/`, so clearing the conversation never loses it.
5. **Review, brainstorm, and interview.** G.O.D. goes over all five sections of the findings with
   you ([section 6](#6-working-with-god-during-a-run)). Only after the last one does it list the
   topics worth talking through and ask whether you wish to brainstorm any of them. You choose which,
   or none. Then it asks what is still open.
6. **Plan.** It writes the documents, renders the PDFs, and gives you a short summary: the
   recommended team size, the database and hosting pick, the top blockers, and the open questions.

Plan mode **only plans**. It writes no code and does not touch your scopes or specs. The one
exception: after delivery, items you marked "for the scope and specs" during the review can be
carried out through `/buildscope`, `/validateScope`, and `/createSpecs`, one at a time, each only
when you say go.

### New-project mode — from an overview to a built project

Use this when you pass a `ProjectOverview.md` and confirm the project is new.

```text
review the overview → is it new? → brainstorm the idea (optional) → interview
  → full design and documents → PAUSE: you review and brainstorm
  → choose a style, and design or build each screen → you approve
  → /buildscope per scope → /validateScope → /createSpecs → wxDesigner for chosen screens
  → /implement per spec (runs /wxCreateTestPlan) → reviews, smoke test → full test overnight
  → QA, user acceptance, help, beta, release
```

- **Overview review.** G.O.D. rates each part of your overview as **Stated**, **Thin**, or
  **Missing**, and points out contradictions.
- **The design pause.** G.O.D. writes `docs/GOD-Design-Summary.md`: the project in one paragraph,
  every feature (marked Stated or Proposed), the users, the design, the build plan, and a numbered
  list of points to discuss. You can brainstorm the project, request specific changes, approve it, or
  stop with the plan only.
- **Style and screens.** When you approve, you pick one visual style for every screen. Then, for
  each scope that has a screen, you choose **Design it** (you shape it in `wxDesigner` with a live
  browser preview) or **Let it build** (`/implement` creates it from the spec and the style).
- **Building.** G.O.D. runs each wxKanban command under all of that command's own rules. Every
  approval those commands ask for is still **yours** to give.
- **Testing.** During the build, each scope gets a **smoke test** only (`/wxCreateTestPlan --Execute`
  to Gate 1). Once every scope's full test plan is filed, G.O.D. schedules the **full test
  overnight** (`/preTest --nightly --install --full-first`): the first night runs every test item,
  and each item it proves is signed off. QA clears from those overnight results.

### `--create` — design once, then G.O.D. finishes the job

Everything in new-project mode, with three differences:

- **The design review is the only pause G.O.D. adds.** Brainstorm and change the design there as much
  as you like. After you approve it, G.O.D. does not ask "proceed?" again.
- **G.O.D. answers the commands' questions from your approved design.** Each answer is logged in
  `docs/GOD-State.json` with where in the design it came from. If the design does not cover a
  question, G.O.D. asks you instead of guessing.
- **It builds phase by phase** through `docs/DEVELOPMENT-PLAN.md`, running independent pieces in
  parallel, up to your machine's limit or your `--cap`. A piece never starts before the pieces it
  depends on are built, and a phase never starts before the previous phase passes its exit gate.

It also:

- repairs what a failing command leaves, logs the repair, and reports the defect to wxKanban;
- **commits each finished piece locally**, never including changes that were already in your tree
  before the run started;
- carries every scope through code review, the smoke test, the overnight full test, QA, user
  acceptance, help, beta, and release.

What you are still asked:

- any decision the design does not cover;
- anything that would touch production;
- **your testers' sign-offs on the human tests.** These are the one planned pause after approval;
- any stop caused by a G.O.D. defect.

**Pushing and deploying stay with you.** When the run ends, every scope is in Release and the last
commit is made, ready for you to push.

### `--roadmap` — only the build roadmap

G.O.D. reads your specs (and any earlier G.O.D. plan) and rewrites `docs/DEVELOPMENT-PLAN.md` and
its PDF. It keeps any status edits you made by hand and tells you what changed. It writes nothing
else.

---

## 6. Working with G.O.D. during a run

### Your level

| Level | Best for | How G.O.D. talks to you |
|---|---|---|
| **Amateur** | You are new to development projects | It explains every idea in plain words the first time, says why it matters to the business, gives its suggestion, and teaches the good practice behind it |
| **Junior** | You have done some of this | Same, but shorter for anything you have already seen |
| **Senior** | You have done this many times | One line per suggestion; you ask about whatever you want |

G.O.D. may suggest moving up a level once you stop needing the basics explained. You decide; it
never changes your level on its own.

### The opening questions

Before anything else, G.O.D. asks three questions, one at a time, and pre-fills what the evidence
already shows:

1. **Who is it for?** Your own organization (an internal build), or a customer (consulting)?
2. **Commercial or not?** Will it be sold or licensed to others, or used by your own organization?
3. **Web-based or installed?** Used in a browser and hosted on a server, installed on each computer
   or an office server, or both?

The answers change what gets planned. For example, a commercial app needs sign-up, billing, and each
customer's data kept separate. A web-based app gets a projected hosting cost.

### The five review sections (plan mode)

| # | Section | What is in it |
|---|---|---|
| 1 | **Built and working** | What exists and works today, starting with who uses it. In a conversion, this is "What the legacy app does". |
| 2 | **Business rules** | Every rule found in the code, plus the best-practice rules G.O.D. proposes |
| 3 | **Not built** | What is called for but does not exist yet |
| 4 | **Top risks** | The most serious problems, in plain words |
| 5 | **Decisions needed** | Questions only you can answer, each with G.O.D.'s recommendation |

For each section, tell G.O.D. whether it **looks right** or **needs changes**. If you want to talk
a point through, say so: G.O.D. notes it and keeps going. There is no brainstorm in the middle of
the review.

### Brainstorming: offered once, after everything

When all five sections are done, G.O.D. lists the topics gathered on the way (the points you
wanted to talk through, the decisions needed, the top risks, and any business rule left open) and
recommends the one or two most worth discussing. Then it asks whether you wish to brainstorm.

- **Yes:** pick the topics, in any order, or name one of your own. Each topic is talked through by
  the **wxBrainstorm** panel: the eleven agent roles, chaired by the Lead Architect.
- **No:** G.O.D. goes on to the interview. The topics stay saved, so `--resume` can offer them again.

In new-project mode the same holds: G.O.D. reviews the whole overview before it asks. Under
`--create`, the brainstorm is offered at the design review, the run's one pause.

### Things you can say at any time

| Say | What happens |
|---|---|
| **explain** | You get the longer version: background, an example, the trade-offs, and how it would be built |
| **done** | You have finished with this section; G.O.D. shows the summary |
| **question** ... | Start a message with "question" to ask a side question. G.O.D. answers it and changes nothing. It becomes part of the project only if you then say to add it. |
| **brainstorm more** | During a brainstorm: take the next topic, or one you name |
| **continue** | Move on along the current path |
| **stop** | G.O.D. saves its place and stops. Resume later with `--resume`. |

### How decisions get written

- **The whole conversation is plain text.** You answer in your own words; there are no menus.
- **One item at a time.** G.O.D. finishes the current item before taking up a new one. A new idea
  that comes up is added to the end of the list, or parked under the area it belongs to.
- **Before each "which next?"**, G.O.D. shows the full list with each item's status: Agreed,
  Changed, Added, Suggestion, or Parked.
- **Nothing is written while you brainstorm.** At the end of a section, G.O.D. shows a summary of what
  was agreed, added, changed, and parked. You choose:
  - **Add it to the plan, scope, and specs**
  - **Add it to the plan only**
  - **Change the summary first**
- Approved decisions are recorded in `docs/GOD-Brainstorm.md`, and each brainstorm's full record in
  `docs/brainstorms/`.

### The scratch pad

G.O.D. keeps `docs/GOD-Scratchpad.md` up to date as a one-screen view of where you are: the
sections, the current list, what is waiting, and what has been agreed but not yet recorded. In VS
Code, open the file and press **`Ctrl+K V`** to keep its preview beside the chat. The scratch pad
only displays the conversation. The plan never reads it.

---

## 7. What you get

Everything lands in `docs/`. The Markdown files are the editable source; each PDF is made from its
Markdown file.

| File | Who it is for | What it is |
|---|---|---|
| `GOD-Customer-Plan.md` + `.pdf` | **The customer** | The final document to read and sign off: scope, time to completion, database and hosting, roadmap, risks, decisions |
| `GOD-Management-Plan.md` + `.pdf` | Your delivery team | Every register, decision, and work package, with the estimate |
| `DEVELOPMENT-PLAN.md` + `.pdf` | Your delivery team | The build roadmap: start here, status, dependency map, phases, exit gates. Under `--create`, it also records progress. |
| `GOD-Process-Design-Flow.md` + `.pdf` | Both | Process, design, workflow, ERD, and (for conversions) migration diagrams |
| `GOD-SaaS-Cost.md` + `.pdf` | **You only** (internal) | Projected hosting cost for a web-based system: the five lowest-cost options plus AWS, and price and margin for a commercial app |
| `GOD-Business-Rules.md` | Both | Every business rule found, plus the proposed best-practice rules and the decision on each |
| `GOD-Estimate.md`, `GOD-Estimate-Input.json` | Your delivery team | The AI time estimate; you can run it again |
| `GOD-Review.md`, `GOD-Brainstorm.md` | You | The findings as reviewed, and the decisions you approved |
| `GOD-Scratchpad.md` | You | The live view of the review |
| `GOD-Inventory.json` | You | Every file read as evidence, and what was left out and why |
| `GOD-Intake/` | You | The full evidence reports, with citations |
| `GOD-State.json` | G.O.D. | The checkpoint that `--resume` reads |
| `GOD-Design-Summary.md`, `GOD-Scope-Map.md`, `god-scopes/` | You (new projects) | The design for review, the scope map, and one scope draft per scope |

### Time to completion

The estimate gives two options:

- **Option 1, the quickest team:** the team size with the fewest working days.
- **Option 2, the machine maximum:** the most AI agents your machine can run.

More agents is not always faster. Past a point, extra agents wait on other work or on review. The
estimate's team-size table shows where that happens.

### Re-rendering a PDF after you edit the Markdown

```bash
node .claude/skills/wxG-O-D/scripts/build-devplan-pdf.mjs docs/<file>.md docs/<file>.pdf
```

Never edit a PDF directly; edit the Markdown and render it again.

---

## 8. Pausing and resuming

A full run is longer than one AI conversation can hold, so G.O.D. saves checkpoints in
`docs/GOD-State.json`. At a checkpoint it tells you exactly what to type:

> Checkpoint saved. Run `/clear`, then `/wxG-O-D --resume` to continue with: [the next step].
> (Or `/compact` to keep this conversation going in condensed form.)

- `/wxG-O-D --resume` reports where the run stands and continues from the next step. It never asks
  again what you have already answered.
- Running `/wxG-O-D` with no options while a run is unfinished asks whether to resume or start fresh.
- In other AI clients, start a new chat and run `/wxG-O-D --resume`.
- If a run stopped on a defect, `--resume` first tells you what stopped it and asks whether it has
  been fixed.

---

## 9. Running unattended from your phone

If your project's **Remote Session Bridge** is set up, G.O.D. offers once, right after you approve
the plan, to keep going without you at the editor. The bridge is set up when the repo-root `.env`
has `YAPPCHATT_ROOM`, `YAPPCHATT_EMAIL`, and `YAPPCHATT_TOKEN`. If you say yes:

- G.O.D. keeps running and sends every question to your phone, with numbered answers.
- After each piece of work it posts a one-line position, such as `Phase 1 · S03 Orders · implement started`.
- Ask **"where are we?"** to get the current position and the next step.

Words you can use in the chat room:

| Word | What it does |
|---|---|
| `STATUS` | Reports whether the session is working or idle |
| `STOP` / `CONTINUE` | Pause the current turn, then resume it |
| `VERBOSE` / `CONCISE` | More or less detail in messages |
| `PUSH`, then `CONFIRMED` or `NO` | The only way a push can happen: you request it, review it, and confirm |
| `CANCEL REMOTE` | End remote mode. Continue in the editor with `/wxG-O-D --resume`. |

---

## 10. What G.O.D. will never do

- **Push or deploy.** It never runs `git push` and never deploys. Under `--create` it only commits
  locally.
- **Touch production.** It never points a command at a production database, host, or account.
- **Open your secrets.** It lists `.env` files, keys, and certificates by name only. No credential,
  token, or personal data appears in any document or in chat. They are cited by location only.
- **Invent facts.** Every claim has a file citation or a confidence label. Best-practice rules are
  always marked as proposed.
- **Sign off a human test.** Only your testers can do that.
- **Write outside `docs/` in plan mode.** The one other file it writes is your learnings file
  (`%USERPROFILE%\.wxai\god-learnings.md`, or `~/.wxai/god-learnings.md` on macOS and Linux), which
  holds general patterns only, never project details.
- **Skip a command's own rules.** It runs the real wxKanban commands under all of their rules. Without
  `--create`, every approval they ask for is yours.
- **Use too many agents.** It never runs more AI agents at once than your machine can handle or your
  `--cap` allows.

---

## 11. After G.O.D.: next commands

| Command | When |
|---|---|
| `/buildscope` | Turn a work package into a scope |
| `/validateScope` | Check a scope's quality before creating specs |
| `/createSpecs` | Turn a scope into specs and tasks |
| `/wxDesigner` | Design a screen before it is built |
| `/implement` | Build a spec. It runs `/wxCreateTestPlan`. |
| `/wxUIUXCodeReview` | Review the code and screens once they are built |
| `/wxCreateTestPlan --Execute` | Run the tests (G.O.D. runs it to the smoke gate) |
| `/preTest --nightly` | Schedule the full test overnight |
| `/wxBrainstorm` | Talk one idea or customer suggestion through with the panel, at any time |
| `/wxConversionParity` | Compare a converted app with the legacy one |
| `/wxDBAnalyze` | Check the live PostgreSQL database for orphans, indexes, and integrity |
| `/wxHelpGenerate` | Build the end-user help site and PDF manual |
| `/buildstack` | Change your target stack or visual style |

---

## 12. Troubleshooting

| Problem | What to do |
|---|---|
| `project.get_command_prompt` is not available, and no other `project.*` tools are either | The wxKanban MCP isn't connected. Run `/wxAI-project-init` (or `node scripts/init.mjs`), restart your AI client, and approve the `wxkanban` server (Claude Code: `/mcp`). |
| Other `project.*` tools work, but `get_command_prompt` is missing | This is a server-side problem, not your setup. Report it through Cockpit feedback. |
| A 401 or subscription error | Re-run `kit-configure`, or renew at https://wxperts.com/account/billing. |
| PDFs did not render | Run the `npm install` line G.O.D. printed, then render again ([section 7](#7-what-you-get)). The Markdown files are complete either way. |
| G.O.D. stopped and asked you to report a defect | Report it through Cockpit feedback with the text G.O.D. gave you. Once it is fixed, `/wxG-O-D --resume` continues from that point. |
| `/implement` refuses because of the project's stage or because more than one spec is active | Your kit is out of date. Update the kit, then run `/wxG-O-D --resume`. |
| An important folder seems to have been skipped | It may be gitignored. Name it with `--dir`. |
| The plan is wrong about something | Say so during the review. If the run has finished, correct the Markdown and re-render, or run G.O.D. again. A re-run reads the earlier documents and keeps their IDs. |
