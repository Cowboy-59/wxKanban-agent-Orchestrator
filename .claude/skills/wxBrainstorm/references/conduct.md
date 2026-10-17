# Conduct — levels, the discussion rules, closing, recording, learning

Split out of wxG-O-D's `review-and-brainstorm.md` (Levels, The scratch pad, Brainstorm conduct,
Closing a section, Learning from decisions, Resume), adapted for a stand-alone brainstorm.

**The whole brainstorm is plain text.** Every question is asked in chat and answered in the user's
own words. Never use choice menus (`AskUserQuestion`) anywhere in a brainstorm.

## Levels

Use `--level=amateur|junior|senior` if it was passed (also `--amateur`, `--junior`, `--senior`).
Otherwise ask once, in the opening turn, beside the topic question (SKILL.md step 2). With no answer,
use **senior**.

| Level | Who | How each item is walked |
|-------|-----|-------------------------|
| **Amateur** | New to development projects | The amateur pattern below. Explain each idea in plain terms the first time it appears, and teach the good practice behind it |
| **Junior** | Has been through some of this | The same walk-through. Shorter explanations for anything already met; full ones only for what is new |
| **Senior** | Has done this several times | The panel's takes, one line each, then the recommendation. The user asks from there |

At every level, **"explain"** gets the longer version: background, an example, the trade-offs, and
how it would be built. Then go back to the short form.

**Moving up.** When an amateur has closed two or three items without needing basic terms explained
again, or a junior is skipping the explanations, suggest the next level in one sentence. The user
decides; never change level on your own.

### The amateur pattern

For each item, in this order. Each part is one or two short sentences:

1. **Where we are**: a breadcrumb, such as "Topic › item 3 of 7 (the smallest useful version)".
2. **What it is**: plain words, no jargon. If a technical term can't be avoided, explain it in one
   clause.
3. **Why it matters**: the benefit or risk in business terms (support calls, security, cost, time).
4. **The panel's take**: the roles that spoke, one line each.
5. **Our suggestion**: the chair's recommendation, plainly, with one reason.
6. **Good practice** (optional, one line): the general lesson behind it.
7. **Your call**: one plain question the user can answer in their own words.

Stop there and wait. No option tables or lists of alternatives unless the user asks ("what else
could we do?") or says "explain".

## The scratch pad

`docs/brainstorms/Scratchpad.md` is a one-screen live view of the brainstorm, kept beside the chat so
the user never loses their place. It is a **display, not a record**: it mirrors what is already on
screen, and nothing reads it as a decision. It is the one file updated while a brainstorm is open.

- **Create it** when the agenda is first shown (SKILL.md step 4). Tell the user how to open it beside
  the chat: in VS Code, open the file and press `Ctrl+K V`; in other editors, a second window.
- **Contents**, top to bottom: the topic in one line · the level · the panel (speaking / sitting out) ·
  **Where we are** (the breadcrumb) · the agenda, each item with its status · **Waiting** (items noted
  for the end of the list) · **Agreed so far, not yet recorded**.
- **Update it** at the end of every turn where the position, a status, or the agenda changed. Side
  questions don't change it.
- **Keep it to one screen.** When the topic closes and its summary is approved, reset it to one line
  ("Closed: <topic>, N decisions recorded in <file>").
- **Never put** secrets, customer contact details, or anything not already shown in chat in it.

## Discussion rules

- **Nothing is written.** While brainstorming, no file is created or edited, no document is changed,
  and no command is run. Writing happens only after the user approves a summary (below). The scratch
  pad is the one exception.
- **One item at a time, at the user's pace.** Never jump ahead to the next item or start building
  anything the user didn't ask for.
- **Every item carries the panel's take and the chair's recommendation** (`panel.md` § How the panel
  speaks). At amateur level, use the amateur pattern.
- **Relist before asking "which next?".** Every time, show the full agenda again with each item's
  status: **Agreed** · **Changed** · **Added** · **Declined** · **Suggestion** (not yet discussed) ·
  **Parked → <where>**.
- **Split by audience when the answer differs.** When an item works differently for different kinds
  of user or installation, take each one separately, in the order the user picks.
- **Finish the current item before taking up a new one.**
  - When something new comes up mid-item, note it in one line ("Noted: bulk export. I'll add it to
    the end of the list.").
  - Finish the current item, then add the new one to the end of the agenda, marked **Added**.
  - A point that belongs to a different topic entirely is **Parked → separate topic**, to be
    brainstormed on its own later.
- **"Question" means question and answer only.** A message whose first word is "question" (any case)
  is a side question.
  - Answer it at the user's level.
  - It is not a decision and not a new item. Don't add it to the agenda or change anything.
  - Return to where the brainstorm was and relist the agenda.
  - Only if the user then says to add it does it become an item, marked **Added**.
- **Ask in plain text.** End every turn with one clear question, never a menu.

## Closing the topic

When the user says they are done (or every item has a status), show a summary:

- **Agreed**: each decision, in one line.
- **Added**: new requirements or ideas that came out of the discussion.
- **Changed**: the request as the customer made it versus what was agreed, where they differ.
- **Declined**: what was decided against, each with its one-line reason. A declined idea is a
  decision too, and it stops the same suggestion being argued again next month.
- **Parked**: each parked item and where it went.

At amateur level, say in one sentence what a scope is: "a scope describes one piece of work; specs are
the detailed build instructions made from it."

Then ask, in plain text, which they want:

- **record it and take the agreed items to a scope** (SKILL.md step 7)
- **record it only**, so the decisions are kept but nothing is scoped yet
- **change the summary first**: fix it, show it again, and ask again

On either "record" answer, write the record (below). This is the first point at which anything is
written. Then update the learnings file.

## Recording

One file per topic: `docs/brainstorms/YYYY-MM-DD-<topic-slug>.md`, the date being the day the topic
opened. Create `docs/brainstorms/` if it is missing. Sections, in this order:

```markdown
# Brainstorm: <topic>

- **Status:** open | closed
- **Opened / last updated:** YYYY-MM-DD / YYYY-MM-DD
- **Source:** <where the idea came from: a feedback report ID, "customer call", "sales demo", "internal">
- **Asked for by:** <how many customers, or which kind of customer; never a name, email, or phone>
- **Level:** amateur | junior | senior
- **Next item:** <plain words, while open>

## The request
<the customer's suggestion, restated in plain words; quote the original only if it holds no personal data>

## What already exists
| Item | Status | Evidence | Confidence |
<the step-3 search table, as shown to the user>

## Panel
Spoke: <roles> · Sat out: <roles>

## Decisions
| # | Item | Decision | Kind | To scope? | Date |
<one row per item: Kind is Agreed / Added / Changed / Declined / Parked; To scope? is yes / no / done (SCOPE-NNN)>

## Open items
<anything not yet decided, with its status>

## Next step
<"Recorded only", or the /buildscope hand-off and its result (SCOPE-NNN)>
```

On a later session for the same topic, update the same file: append decision rows, refresh **Status**,
**Next item**, and **Open items**, and never rewrite an earlier decision row. A reversed decision is a
new row that says what it replaces.

**Privacy.** Customer suggestions often arrive with names, emails, or account details. Record the
source by reference only (a feedback ID, "customer call, YYYY-MM-DD") and never copy personal data,
credentials, or secrets into a record, the scratch pad, or chat.

## Learning from decisions

wxBrainstorm shares wxG-O-D's learnings file, so what the user decides in one place improves the
suggestions in both.

- **Where:** Windows `%USERPROFILE%\.wxai\god-learnings.md`; macOS and Linux `~/.wxai/god-learnings.md`.
  Create the folder if it is missing. It is the only file wxBrainstorm writes outside the project.
- **Read it** at the start of step 4, and again before each recommendation. When a learning fits,
  make it the recommendation and say where it came from ("suggested because you chose this on an
  earlier project"). If this project's evidence argues against it, say that too. A learning is only
  a suggestion. It never counts as a decision or as evidence.
- **Write it** only when the user approves the closing summary, right after the record is written.
  Record the general pattern behind each Agreed, Added, Changed, or Declined item; skip Parked ones.
  - **Group by topic** (for example: Sign-in and accounts · Notifications · Reporting · Permissions ·
    Billing · Data).
  - **Each entry has** the **pattern** in one or two plain sentences; **Instead of** (the panel's
    original recommendation, when the user changed it, which is the most useful thing to learn);
    **Chosen** (count), **Declined** (count, with a few words on why if given), and **Last** (date).
  - **Merge, don't duplicate.** If a pattern is already there, update its counts.
  - **General only.** Never write project or customer names, people, file paths, scope or spec
    numbers, data, or secrets. If a pattern can't be stated without project detail, leave it out.
- The first time the file is written, tell the user where it is. They can read, edit, or clear it
  at any time. Never copy it into a project or send it anywhere.

## Pausing and resuming

A long brainstorm fills the conversation and slows it down. Offer a pause after the topic closes,
or whenever the user says it is getting long.

- **Pausing mid-topic is a write, so ask first.** On the user's yes, write the record with
  **Status: open**, the decisions approved so far, the remaining agenda under **Open items**, and
  **Next item** in plain words. Then tell them:

  > Saved. Type `/clear`, then `/wxBrainstorm --resume`, and we'll carry on with: <next item>.

- **`--resume`**: list the records in `docs/brainstorms/` whose **Status** is open (topic, opened
  date, next item) and ask which one, in plain text. Then re-read it, show the decisions so far,
  relist the agenda with statuses, recreate the scratch pad, and continue with **Next item** at the
  saved level. Don't repeat the step-3 search unless the user asks or the record is older than a
  week. In that case, say the app may have changed since and offer to refresh it.
