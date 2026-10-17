---
description: wxBrainstorm — talk through a customer suggestion, feature request, or idea with a panel of the eleven wxG-O-D agent roles. It asks what to brainstorm before searching the app, then checks what already exists, discusses one item at a time at your level, records only the summary you approve (docs/brainstorms/), and on your go hands the agreed items to /buildscope. Never writes scopes, specs, or code itself.
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

# wxBrainstorm — customer ideas, talked through by the panel

Takes one idea or customer suggestion (or several) and talks it through with you. The panel is the
eleven agent roles from wxG-O-D (Lead Architect in the chair, plus the Domain Analyst, Legacy
Analyst, and the Database, Backend, Frontend, DevOps, Security, QA, Migration, and Documentation
engineers). Only the roles the idea touches speak, and every point ends with the panel's
recommendation and one plain question for you.

This command runs the **`wxBrainstorm` skill**. Invoke the skill, then follow its workflow:

1. **Seat the panel.** The eleven roles are introduced. The Lead Architect chairs.
2. **Ask what to brainstorm, before searching anything.** You give the idea: pasted as the customer
   wrote it, a feedback report ID, or your own words. Then where it came from and what you want out
   of it. The topic is restated in one line and confirmed before the app is touched.
3. **Search for what already exists.** Code, scopes, specs, help, and earlier brainstorms, aimed at
   the confirmed topic. Results come back as Built, Partly built, Planned, Decided before, or Not
   found, each with its evidence.
4. **The panel's first look.** One line from each role that applies, then a numbered agenda: the need
   behind the request, who would use it, reuse or build new, the smallest useful version, the
   panel's risks, and fit and priority.
5. **Brainstorm.** One item at a time, plain text, at your level (`--level=amateur|junior|senior`).
6. **Close and record.** You approve a summary (Agreed, Added, Changed, Declined, Parked). Only then
   is it written, to `docs/brainstorms/YYYY-MM-DD-<topic>.md`.
7. **Hand off (optional).** On your go, `/buildscope --from-md <record>` then `/validateScope`, each
   under its own rules. It can also draft a plain-words reply to the customer; the draft is shown
   only, never sent.

## Usage

```bash
/wxBrainstorm                                             # asks what to brainstorm
/wxBrainstorm customers keep asking to export the board to Excel
/wxBrainstorm --level=amateur                             # explains every idea in plain terms
/wxBrainstorm --resume                                    # continue an open brainstorm
```

## Boundaries

- **Asks before it searches.** The topic is confirmed before any code, scope, or doc is read.
- **Writes only** `docs/brainstorms/` and your `~/.wxai/god-learnings.md` (shared with wxG-O-D), and
  only after you approve a summary.
- **Never writes scopes, specs, or code,** and never commits, pushes, or sends anything to a customer.
- **No personal data in records.** A customer is referred to by feedback ID or date, never by name or
  email.

## Where it shows up

- **Dev Cockpit**: listed under **Standard** commands.
- Records land in `docs/brainstorms/`, one file per topic.

## See also

- `/wxG-O-D`: plans a whole project or a new product, with its own brainstorm. Use wxBrainstorm for
  a single idea in a project that already exists.
- `/buildscope`: where an agreed idea becomes a scope.

Full reference: `.claude/skills/wxBrainstorm/SKILL.md`.
