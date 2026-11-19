# wxBrainstorm Guide

How to talk through a customer suggestion, feature request, or your own idea with the wxBrainstorm
panel, and turn what you decide into a recorded decision and, if you want, a scope.

- **Command:** `/wxBrainstorm`
- **Runs in:** your AI assistant (Claude Code, Cursor, BLACKBOX AI), or from the Dev Cockpit under
  **Standard** commands
- **Stage:** any. It is usually used in Design, before `/buildscope`
- **Writes:** only `docs/brainstorms/`, the decision ledger, and your personal learnings file, and only
  after you approve a summary. It never writes scopes, specs, or code, and never commits or pushes.

---

## 1. What it is

wxBrainstorm takes one idea (or a handful of related customer suggestions) and works through it with
a panel of eleven roles, the same agent roles wxG-O-D uses to build software:

| Role | Looks at the idea from this side |
|---|---|
| **Lead Architect** (chair) | Where it lives, whether it fits the existing design. Gives the panel's recommendation on every point |
| **Domain Analyst** | The real need behind the request, the workflow and business rules it changes |
| **Legacy Analyst** | What the old system did, for converted or legacy apps |
| **Database Engineer** | New data, backfills, volume, reporting |
| **Backend Engineer** | APIs, jobs, integrations, what happens on failure |
| **Frontend Engineer** | Which screen, how users find it, accessibility |
| **DevOps Engineer** | Running cost, new services, monitoring, safe deployment |
| **Security Engineer** | Who may see or do it, cross-customer data leaks, abuse cases |
| **QA Engineer** | How it is tested, what working behavior it could break |
| **Migration Engineer** | Moving existing data or customers to the new way, rollback |
| **Documentation Engineer** | Help pages, release notes, how it is explained to customers |

Only the roles your topic touches speak. The Lead Architect and Domain Analyst always do. The others
that sit out are named in one line, so you can call one in.

The output is a short record of **what you decided and why**, kept in `docs/brainstorms/`. That record
stops the same suggestion being argued again next month, and it can be handed straight to
`/buildscope`.

---

## 2. When to use it (and when not to)

**Use wxBrainstorm when:**

- a customer asks for something and you need to decide whether to do it, and how
- several customers have sent overlapping suggestions and you want to group and rank them
- you have your own idea for an existing project and want it challenged before you scope it
- a feedback report needs a decision, not just a fix

**Use something else when:**

| Situation | Use instead |
|---|---|
| The "idea" is a whole new product or a full project plan | `/wxG-O-D` (it runs wxBrainstorm inside itself where it needs one) |
| You already know exactly what to build | `/buildscope` directly |
| It is a plain bug with an obvious fix | Fix it through `/implement` |
| You want to audit an existing scope for holes | `/analyzescope` |

If the topic turns out to be a whole new product partway through, the panel will say so and suggest
`/wxG-O-D`.

---

## 3. Starting it

```text
/wxBrainstorm                                             # asks what to brainstorm
/wxBrainstorm customers keep asking to export the board to Excel
/wxBrainstorm --level=amateur                             # explains every idea in plain terms
/wxBrainstorm --resume                                    # continue an open brainstorm
```

| Argument | What it does |
|---|---|
| free text | The idea. It is still restated and confirmed before anything is searched |
| `--level=amateur` (or `--amateur`) | New to development projects. Every idea is explained in plain terms, with the good practice behind it |
| `--level=junior` (or `--junior`) | Some experience. Short explanations for familiar terms, full ones for new ones |
| `--level=senior` (or `--senior`) | Experienced. One line per role, then the recommendation. You ask from there. **This is the default** |
| `--resume` | Lists open brainstorms and continues the one you pick |

If you don't pass a level, you are asked once. No answer means senior. When you are clearly comfortable
at your level, the panel may suggest moving up, but it never changes level on its own.

---

## 4. How a session runs

### Step 1: The panel is seated

A two- or three-line introduction of the eleven roles. Nothing else happens yet.

### Step 2: You say what to brainstorm, before anything is searched

wxBrainstorm deliberately **does not look at your code, scopes, or docs until the topic is confirmed**.
Searching first wastes effort on the wrong thing and colors the question with whatever happens to be
in the code.

You are asked, in one turn:

1. **What is the idea?** Paste it as the customer wrote it, give a feedback report ID, or describe it in
   your own words.
2. **Where did it come from, and how many asked?** (optional) One customer, several, or internal. This
   weighs the priority later.
3. **What do you want out of this?** Decide whether to do it at all, shape how it should work, or rank
   several suggestions.

Then the topic is restated in one line, with the need behind it:

> Topic: customers want their board in Excel. The need seems to be sharing status with people who
> don't have a login. Correct?

Answer **yes** or correct it. This one line is the most important moment of the session: a request for
"Excel export" and a need for "share status with outsiders" lead to very different designs.

**Several suggestions at once?** They are grouped (duplicates and near-duplicates together), shown as
a numbered list, and you pick which group goes first. Each group is its own topic and its own record,
and each is searched only when its turn comes.

**Feedback report IDs?** With the wxKanban MCP connected, only those reports are fetched. Without it,
you are asked to paste them.

### Step 3: What already exists

Now the panel searches, aimed only at the confirmed topic: the code, `specs/Project-Scope/*.md`,
`specs/*/spec.md`, the help, earlier brainstorms, and (with the MCP connected) the capability index and
open feedback from other customers.

You get a table like this:

| Item | Status | Evidence | Confidence |
|---|---|---|---|
| CSV export of a task list | Built | `src/server/routes/tasks.ts:212` | Confirmed |
| Shareable read-only board link | Planned (`SCOPE-0NN`) | scope doc | Likely |
| Excel (.xlsx) output | Not found | searched routes, services, help | Unknown |

- **Status:** Built · Partly built · Planned (`SCOPE-NNN`) · Decided before (record) · Not found
- **Confidence:** Confirmed (it was read) · Likely · Assumed · Unknown · Conflicting (two places
  disagree)

"Not found" is never treated as proof. A narrow search is labeled **Unknown**.

What the table changes is said first:

- **Already built:** the real topic may be that customers can't find it, a job for the help and the
  screen, not new code.
- **Decided before:** the earlier decision and its reason are shown, and you are asked what has changed.
- **Planned:** the brainstorm may shape that scope rather than start a new one.

When the topic would change existing work, you also see **What changing it would reach**: the specs,
code, and dependent scopes affected, from the kit's Change Impact tools. This is for the discussion
only. Nothing is recorded.

### Step 4: The panel's first look, and the agenda

Each role that applies gives one line, labeled **Benefit**, **Risk**, or **Question**. Then a numbered
agenda, always in this order:

1. **The need behind the request** (always first: customers ask for a solution, the panel finds the
   problem behind it)
2. **Who would use it, and how often**
3. **Reuse or build new**
4. **The smallest useful version**
5. **Each risk or question the panel raised**, with any stop-and-flag items first
6. **Fit and priority**: now, later, or not at all (always last)

You pick where to start. Item 1 is recommended.

### Step 5: The brainstorm itself

One item at a time, in plain text, at your pace. Every item ends with **the chair's recommendation and
one plain question**. Answer in your own words. There are no menus.

Before every "which next?", the whole agenda is shown again with each item's status:

| Status | Meaning |
|---|---|
| **Suggestion** | Not discussed yet |
| **Agreed** | You accepted the recommendation |
| **Changed** | You decided something different from what was asked or recommended |
| **Added** | A new item that came up during the discussion |
| **Declined** | Decided against, with the reason |
| **Parked → \<where\>** | Belongs elsewhere, usually a separate topic |

At amateur level each item follows a fixed pattern: where we are, what it is, why it matters, the
panel's take, the suggestion, the good practice behind it, and your call.

### Step 6: Close and record

When you say you are done, or every item has a status, you get a summary grouped as **Agreed**,
**Added**, **Changed**, **Declined**, and **Parked**. Then you choose, in plain words:

- **record it and take the agreed items to a scope**
- **record it only** (decisions kept, nothing scoped yet)
- **change the summary first** (fix it, see it again, choose again)

**This is the first point at which anything is written.** On either "record" answer:

1. The record is written to `docs/brainstorms/YYYY-MM-DD-<topic>.md`.
2. Each Agreed, Added, Changed, and Declined decision is added to the decision ledger
   (`decisions/ledger.yaml`) through the kit's ledger script. Parked items are logged as open questions.
3. The general patterns behind your choices are added to your personal learnings file.

You are told where the record is and how many ledger entries were written.

### Step 7: Hand-off to a scope (optional)

Only if you chose "take it to a scope", and with your go before each one:

1. `/buildscope --from-md docs/brainstorms/<file>.md`. Its own reuse check decides whether to amend an
   existing scope or create a new one, and all its interactive steps still apply.
2. `/validateScope` on the result.
3. `/createSpecs` is offered, but run only if you ask.

The record is updated as each item lands: **To scope?** becomes `done (SCOPE-NNN)`. If any command
fails or stops at a gate, the session stops and says exactly where. It never works around it.

**Reply to the customer.** When the idea came from a customer, you can ask for a plain-words draft
reply: what was decided and, for a declined idea, why. It is shown in chat only. It is never sent, and
the feedback report's status is never changed, unless you say so.

---

## 5. Talking to the panel

These work at any point during step 5:

| You type | What happens |
|---|---|
| **explain** | The longer version of the current point: background, an example, the trade-offs, how it would be built. Then back to the short form |
| **question** ... (as the first word) | A side question. It is answered, then the brainstorm returns to where it was. It is not a decision and not added to the agenda unless you then say to add it |
| **Security, what worries you?** | Calls a role by name. That role answers in its own voice, then hands back to the chair |
| **what else could we do?** | Shows the alternatives (normally held back to keep each turn short) |
| A new idea mid-item | Noted in one line, the current item is finished first, then the new one is added to the end as **Added** |
| **pause** / "this is getting long" | Offers to save the brainstorm as open (see section 7) |

When roles disagree, both sides are shown and the Lead Architect gives the recommendation and the
trade-off. The panel never hides disagreement.

### When the panel stops and flags

The panel will raise these plainly as a **Risk**, with a recommendation, rather than quietly design
around them:

- the idea conflicts with an existing business rule or how the app behaves today
- it could lose or corrupt existing data, or cannot be undone
- it changes who can see or do what, or touches another customer's data
- it depends on a system or service the app does not have
- it has grown beyond what the customer actually asked for

---

## 6. The scratch pad

`docs/brainstorms/Scratchpad.md` is a one-screen live view of the session: the topic, your level, who
is speaking, **where we are**, the agenda with statuses, items waiting for the end of the list, and
what has been agreed but not yet recorded.

Open it beside the chat so you never lose your place: in VS Code, open the file and press `Ctrl+K V`.

It is a **display, not a record**. Nothing reads it as a decision. When a topic closes it is reset to
one line naming the record.

---

## 7. Pausing and resuming

A long brainstorm fills the conversation and slows it down. Pause after a topic closes, or whenever it
feels long.

**To pause mid-topic:** say so. Saving is a write, so you are asked first. On yes, the record is
written with **Status: open**, the decisions so far, the remaining agenda, and the next item. You are
then told:

> Saved. Type `/clear`, then `/wxBrainstorm --resume`, and we'll carry on with: \<next item\>.

**To resume:** run `/wxBrainstorm --resume`. You get the list of open brainstorms (topic, date opened,
next item) and pick one. The decisions so far and the agenda are shown again, the scratch pad is
recreated, and the session continues at the saved level. The search is not repeated unless you ask,
or the record is more than a week old, in which case a refresh is offered because the app may have
changed.

---

## 8. What gets written, and where

| File | When | Contents |
|---|---|---|
| `docs/brainstorms/Scratchpad.md` | Throughout the session | Live view only; mirrors what is on screen |
| `docs/brainstorms/YYYY-MM-DD-<topic>.md` | After you approve the summary (or agree to pause) | The record: request, what already exists, panel, decisions, open items, next step |
| `decisions/ledger.yaml` | Right after the record, only on an approved summary | One entry per decision, written by `_wxAI/askgate/ledger.mjs`. Never edit this file by hand; a hook blocks it |
| `~/.wxai/god-learnings.md` (Windows: `%USERPROFILE%\.wxai\god-learnings.md`) | Right after the ledger | General patterns from your choices, shared with wxG-O-D, so future recommendations fit how you decide. Never holds project names, customers, paths, or scope numbers. You can read, edit, or clear it at any time |

### The record

```markdown
# Brainstorm: <topic>

- **Status:** open | closed
- **Opened / last updated:** YYYY-MM-DD / YYYY-MM-DD
- **Source:** <feedback report ID, "customer call", "sales demo", "internal">
- **Asked for by:** <how many customers, or which kind; never a name>
- **Level:** amateur | junior | senior
- **Next item:** <while open>

## The request
## What already exists
## Panel
## Decisions
| # | Item | Decision | Kind | To scope? | Date |
## Open items
## Next step
```

Later sessions on the same topic update the same file. Earlier decision rows are never rewritten: a
reversed decision is a new row that says what it replaces.

---

## 9. Ground rules

- **Asks before it searches.** The topic is always confirmed first.
- **Plain text, no menus,** for the whole session.
- **Nothing is written until you approve a summary,** apart from the scratch pad.
- **Never writes scopes, specs, tasks, or code.** `/buildscope`, `/validateScope`, and `/createSpecs`
  run only on your go, under their own rules.
- **Never commits, pushes, deploys, or sends anything to a customer.**
- **No personal data.** Customers are referred to by feedback ID or date, never by name, email, or
  phone. `.env` files, keys, and certificates are never opened.
- **Facts are cited, suggestions are labeled.** A claim about the app points to where it was found.
  Anything else is marked **Assumed**.

---

## 10. Tips for a good session

- **Paste the customer's words, not your summary of them.** The Domain Analyst works out the need
  behind the request; your summary may already have chosen a solution.
- **Spend the time on item 1.** Getting the need right makes the rest of the agenda short.
- **Say "Declined" out loud.** A recorded "no, because..." is as valuable as a "yes". It is what stops
  the same request being re-argued.
- **Keep one topic per session.** Park anything that drifts. A parked item becomes its own brainstorm
  later.
- **Use "question" freely.** Side questions never change the agenda or count as decisions.
- **Pause and `/clear` between topics.** A fresh session per topic is faster and keeps the panel focused.
- **Read earlier records before a release planning session.** `docs/brainstorms/` is the history of
  what was decided and why.

---

## 11. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| "The impact check is not available in this kit" | `_wxAI/impact/` is not installed in this project. The brainstorm continues without it; update the kit to get it |
| "The ledger is not installed" | `_wxAI/askgate/ledger.mjs` is missing. The record is still written; update the kit to get ledger entries |
| The ledger script refuses an entry | It rejects duplicates and empty approvers. The refusal is reported in plain words and not worked around; check whether the decision is already in the ledger |
| Feedback IDs can't be fetched | The wxKanban MCP is not connected. Paste the reports' text instead |
| `/buildscope` stops at a gate during hand-off | The session stops and says where. Resolve the gate, then rerun the hand-off for the remaining items |
| `--resume` lists nothing | No record has **Status: open**. Closed topics are reopened by starting a new brainstorm on the same subject; the earlier record is found in step 3 |

---

## Related

- `/wxG-O-D`: whole-project planning; runs wxBrainstorm for its review, idea, and design brainstorms
- `/buildscope`, `/validateScope`, `/createSpecs`: the hand-off chain
- Command reference: the in-app Help page for `/wxBrainstorm`
- Past records: `docs/brainstorms/`
