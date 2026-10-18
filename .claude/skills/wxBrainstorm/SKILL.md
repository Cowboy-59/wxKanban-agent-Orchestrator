---
name: wxBrainstorm
description: Brainstorm a customer suggestion, feature request, or new idea with a panel of the eleven wxG-O-D agent roles (Lead Architect, Domain Analyst, Legacy Analyst, Database, Backend, Frontend, DevOps, Security, QA, Migration, and Documentation engineers). It seats the panel, then asks what to brainstorm and confirms the topic BEFORE searching anything in the application; only then does it search the code, scopes, specs, help, and earlier brainstorms for what already exists. It discusses the idea one item at a time as plain text at the user's level (--level=amateur|junior|senior), each item closing on the panel's recommendation, and writes nothing until the user approves a summary, which is recorded in docs/brainstorms/. On the user's go it hands the agreed items to /buildscope and /validateScope under their own rules, and can draft a plain-words reply to the customer. Use this skill when asked to brainstorm, talk through, weigh up, or decide on a customer idea, suggestion, or feature request, to work through several customer suggestions, or to run wxBrainstorm. It never writes scopes, specs, or code itself, and never commits or pushes.
---

# wxBrainstorm: customer ideas, talked through by the panel

wxBrainstorm takes one idea or customer suggestion (or a handful) and talks it through with the user.
The panel is the eleven agent roles from wxG-O-D, chaired by the Lead Architect. The result is a set of
decisions the user approved, recorded in `docs/brainstorms/`, and, if they choose, a scope built from
them.

It is the stand-alone version of the brainstorm inside wxG-O-D. Use wxG-O-D to plan a whole project
or a new product. Use wxBrainstorm for a single idea, at any time, in a project that already exists.
If the "idea" turns out to be a whole new product, say so and suggest `/wxG-O-D` instead.

**References**, both read in full at step 1:

- `references/panel.md`: the eleven roles, what each asks of an idea, when each speaks, and when the
  panel must stop and flag rather than guess.
- `references/conduct.md`: levels and the amateur pattern, the scratch pad, the discussion rules,
  closing, the record format, the shared learnings file, and pause and resume.

## Arguments

- free text: the idea or suggestion. It is still confirmed at step 2 before anything is searched.
- `--level=amateur|junior|senior` (also `--amateur`, `--junior`, `--senior`)
- `--resume`: continue an open brainstorm (`references/conduct.md` § Pausing and resuming)

```text
/wxBrainstorm
/wxBrainstorm customers keep asking to export the board to Excel
/wxBrainstorm --level=amateur
/wxBrainstorm --resume
```

## Workflow

### 1. Seat the panel

Read `references/panel.md` and `references/conduct.md`. Then introduce the panel in two or three
lines. Name the eleven roles, say that only the ones the topic touches will speak, and say that the
Lead Architect chairs and gives the panel's recommendation on every point. At amateur level, add one
line on what a panel is for: "each role looks at the idea from its own side, so problems show up
before anything is built."

With `--resume`, go to `references/conduct.md` § Pausing and resuming instead.

### 2. Ask what to brainstorm, before searching anything

**Do not search the application yet.** No Grep, Glob, or Read of the project's code, scopes, specs, or
docs, and no capability or feedback search, until the topic is confirmed. The search is aimed at the
topic. Searching first spends effort on the wrong thing and colors the question with what happens to
be in the code.

In one plain-text turn, ask:

- **What is the idea or suggestion?** It can be pasted as the customer wrote it, given as a feedback
  report ID, or described in the user's own words.
- **Where did it come from, and how many asked?** (optional) One customer, several, or an internal
  idea. This weighs the priority later.
- **What do you want out of this?** Decide whether to do it at all, shape how it should work, or rank
  several suggestions against each other.
- If `--level` was not passed, ask in one short line how to pitch it: amateur, junior, or senior.
  Senior if they don't say.

When the user answers:

- **Feedback reports.** If they gave report IDs or said "the feedback queue", fetch only those
  reports now, with the wxKanban MCP feedback tools when they are connected. Reading the request is
  not searching the application. Without the MCP, ask the user to paste them.
- **Several suggestions.** Group duplicates and near-duplicates, show the groups as a numbered list,
  and ask which to take first. Brainstorm one group at a time. Each group is its own topic and its
  own record. **Search one group at a time too:** run step 3 for a group only when that group is
  about to be discussed, never for all the groups up front.
- **Confirm.** Restate the topic in one line, in plain words, with the need behind it as you
  understand it. For example: "Topic: customers want their board in Excel. The need seems to be
  sharing status with people who don't have a login. Correct?" Wait for a yes or a correction.

Free text passed as an argument is the answer to the first question. Still confirm it.

### 3. Search the application for what already exists

Now search, scoped to the confirmed topic only. With several groups, search only the group being
discussed now.

- **Code.** Grep the project (ripgrep honors `.gitignore`) for the topic's terms: screens, routes,
  tables, settings, and their synonyms. Skip `node_modules/` and build output. Skip the kit's own
  folders (`_wxAI/`, `.claude/`, `.wxai/`, `wxkanban-agent/`) in a consumer project, where they are
  tooling and not the app. In the wxKanban repo itself they ARE the product, so search them there.
  Read each match far enough to be sure what it does.
- **Scopes and specs.** `specs/Project-Scope/*.md` and `specs/*/spec.md`: is it already planned, or
  half-built? Write `SCOPE-NNN` and `SPEC-NNN` in full, because the two counters overlap.
- **Help.** The user-facing help or docs. If the feature exists but customers can't find it, that is
  the real finding.
- **Earlier brainstorms.** `docs/brainstorms/`: was this decided before? A **Declined** decision with
  its reason matters most.
- **wxKanban MCP, when connected.** `project.search_capabilities` (the capability index) and open
  feedback, for other customers asking the same thing.

Show the result as **What already exists**, with one row per finding:

| Item | Status | Evidence | Confidence |
|---|---|---|---|

- **Status** is one of: Built · Partly built · Planned (`SCOPE-NNN`) · Decided before (record) · Not
  found.
- **Evidence** is the location (`path:line`, a scope, or a record).
- **Confidence** uses G.O.D.'s labels: **Confirmed** (read it), **Likely**, **Assumed**, **Unknown**,
  or **Conflicting** (two places disagree).

"Not found" is not proof of absence. Say what was searched, and label it **Unknown** when the search
was narrow. Then lead with what it changes:

- **Already built:** say so first. The topic may really be about how customers find it, which is a
  matter for the Frontend and Documentation roles.
- **Decided before:** show the earlier decision and its reason, and ask whether something has changed
  since.
- **Planned:** name the scope. The brainstorm may shape that scope rather than start a new one.

**What changing it would reach (Change Impact).** When the topic would change existing work (rows
marked Built, Partly built, or Planned), show what changing that work would reach, so the panel
weighs it:

- For each scope: `node _wxAI/impact/scope-impact.mjs NNN --no-cache`. It lists the specs that
  implement the scope, the code fenced to it, and the scopes that depend on it.
- For the code files found: `node _wxAI/impact/change-impact.mjs --changed "<file>,<file>" --no-write
  --no-cache --summary`. Show its **Affected** table with each link's confidence, **Confirmed** or
  **Likely**, exactly as printed, and its "Not checked yet" line.

Show it as **What changing it would reach**, after the table above. This is for the discussion
only: both commands are read-only as run here, and nothing is recorded or added to a scope unless
the user later takes the topic to a scope (step 7). If `_wxAI/impact/` is not in this project,
say the impact check is not available in this kit and continue.

This step writes nothing.

### 4. The panel's first look, and the agenda

- Read the learnings file (`references/conduct.md` § Learning from decisions).
- Each role the topic touches gives its one-line take: **Benefit**, **Risk**, or **Question**
  (`references/panel.md` § How the panel speaks). Name the roles sitting out in one line.
- Build the numbered agenda, in this order:
  1. **The need behind the request.** The Domain Analyst leads it. This item always comes first,
     because customers ask for a solution and the panel's job is to find the problem behind it.
  2. **Who would use it, and how often.** Who asked, and who else it would serve.
  3. **Reuse or build new.** From step 3: extend what exists, finish what is planned, or start fresh.
  4. **The smallest useful version.** The least that solves the need.
  5. **Each Risk or Question the panel raised,** in priority order, and every stop-and-flag item from
     `references/panel.md` first among them.
  6. **Fit and priority.** Now, later, or not at all, with the reason. Always last.
- Create the scratch pad (`references/conduct.md` § The scratch pad) and tell the user how to open it.
- Show the agenda and ask which item to start with. Recommend item 1.

### 5. Brainstorm

Follow `references/conduct.md` § Discussion rules, one item at a time, at the user's level. Each item
ends with the chair's recommendation and one plain question. Relist the agenda with statuses before
every "which next?".

### 6. Close and record

Follow `references/conduct.md` § Closing the topic: the summary (Agreed · Added · Changed · Declined ·
Parked), then the user's choice. On either "record" answer, write
`docs/brainstorms/YYYY-MM-DD-<topic-slug>.md` (§ Recording), then update the learnings file. Tell the
user where the record is.

### 7. Hand off (only on "take it to a scope")

For the agreed items marked **To scope? yes**, one scope at a time and with the user's go before each:

1. Run `/buildscope` with the record as its input (`--from-md docs/brainstorms/<file>.md`). Its own
   reuse check decides whether to amend an existing scope or create one. Follow **all** its rules and
   its interactive steps. wxBrainstorm never writes or edits a scope itself.
2. Run `/validateScope` on the result.
3. Offer `/createSpecs`, but run it only if the user asks.

After each one, update the record: set the item's **To scope?** to `done (SCOPE-NNN)` and fill in
**Next step**. If a command fails or stops at a gate, stop and say exactly where. Never work around it.

**A reply to the customer (optional).** When the idea came from a customer, offer to draft a reply in
plain words: what was decided and, for a declined idea, why. Leave out internal detail, and give no
dates or promises the user didn't agree. Show it in chat only. Never send it, and never change a
feedback report's status, unless the user says so. Then do it only through the wxKanban MCP feedback
tools.

## Embedded in wxG-O-D

wxG-O-D hands every brainstorm to this skill instead of running one of its own: talking a review
section through in plan mode, the idea brainstorm in new-project mode, and the design brainstorm at
the review pause. G.O.D. passes the topic, the user's level, and the evidence it already holds (intake
reports, findings, the overview, the design). G.O.D. plays the Lead Architect, so it chairs the panel.
Then:

- **Step 1:** seat the panel in one line; G.O.D. has already introduced itself.
- **Step 2:** do not ask the three questions. Restate the topic G.O.D. passed in one line, with the
  need behind it, and confirm it.
- **Step 3:** cite G.O.D.'s evidence first, and search the application only for what that evidence
  does not cover. In new-project mode there is no application yet: say so and skip the code search.
- **Step 4:** when G.O.D. passes an agenda (for the idea brainstorm: the opening questions, the
  business rules, the personas, the review's thin rows and its challenges), use it in that order
  instead of the standard agenda; give the panel's first look as written. Otherwise build the
  standard agenda.
- **Step 5:** as written, except the scratch pad: use G.O.D.'s `docs/GOD-Scratchpad.md` instead of
  `docs/brainstorms/Scratchpad.md`, so the user keeps one view of where they are.
- **Step 6:** show the summary as written, then offer G.O.D.'s three choices instead of this skill's:
  add it to the plan, the scope, and the specs; add it to the plan only; or change it first. On
  either "add", write the record as usual (source: "wxG-O-D review", "wxG-O-D idea" or "wxG-O-D
  design"). G.O.D. then appends each decision to `docs/GOD-Brainstorm.md`, one row per item with the
  record's path, because its interview and plan read that file. The learnings file is written once,
  here.
- **Step 7 never runs.** G.O.D.'s own rules decide what happens to items marked for the scope and
  specs, after the plan is delivered.
- **Pausing:** G.O.D.'s checkpoints and `--resume` carry the brainstorm. A mid-topic pause writes the
  record as open (§ Pausing and resuming), and G.O.D.'s state file names the next item.

## Rules

- **Ask before searching.** Step 2 always completes, with the topic confirmed, before step 3 begins.
- **Plain text, no menus,** for the whole brainstorm.
- **Writes only** `docs/brainstorms/` (the scratch pad and the records) and the user's
  `~/.wxai/god-learnings.md`. Nothing is written until a summary is approved, except the scratch pad,
  which only mirrors the chat.
- **Never writes scopes, specs, tasks, or code.** `/buildscope`, `/validateScope`, and `/createSpecs`
  run only on the user's go, under their own rules.
- **Never commits, pushes, or deploys.**
- **No secrets or personal data.** Never open `.env` files, keys, or certificates. Never copy a
  customer's name, email, phone, or account details into a record, the scratch pad, or chat. Refer to
  the source by its feedback ID or a date.
- **Facts are cited, suggestions are labeled.** A claim about the app cites step 3. Anything else is
  **Assumed**. Never present a proposal as something the app already does.
