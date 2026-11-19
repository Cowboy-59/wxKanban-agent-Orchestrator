---
id: project-detail
part: web-app
audience: customer
sources: 
---
# Inside a project

Opening a project takes you to its workspace — the single place where all of that project's work lives. Here you see every **scope** (a unit of work) organized by the six-phase lifecycle, switch between different views of that work, and open the project's generated documents and analyses. You reach this screen by clicking a project on the [Dashboard](dashboard.md) or in the [Projects](projects.md) list.

## What you're looking at

At the top is the project **name** and its current **phase badge**, with a **← Projects** link back to the list. On the right are project-level actions: an **Audit** dropdown (choose the compliance framework to audit against — No Audit, GDPR, HIPAA, HITRUST, SOC2), **Archive**, and **Delete**. Archive and Delete change or remove the project, so wxKanban asks you to confirm first — read the dialog before agreeing.

Two rows of tabs sit below the title:

- **Document tabs:** *Lifecycle · Development Plan · Portfolio Analyzer · Compliance · Learnings · Kit* — each opens a different generated view or report for the project (described below).
- **VIEWS:** *Matrix · Kanban · Stack · Theme · Bug Reports* — each shows the project's scopes a different way.

## The scope board (Kanban view)

The default **Kanban** view lays out every scope as a card in a column for its lifecycle phase: **Phase 1 Design & Tasks**, **Phase 2 Implementation**, **Phase 3 QA Testing**, **Phase 4 Human Testing** (optional), **Phase 5 Beta & Feedback** (optional), and Release. Each column header shows how many scopes it holds. A scope card shows its number and title (e.g. *#0004 Main Promotion Splash*), an outstanding-task count, a state badge (**Draft**, **Planned**, …), a green progress bar with a "7/7 done" tasks tally, and quick links: **Scope Process Flow**, **Scope Analysis**, and a document count. Empty phases show a dashed **Empty** placeholder.

Human Testing and Beta are labeled **optional** because the board lets an administrator or a manager drag a scope card forward past them. Dragging forward past Design & Tasks, Implementation, or QA is blocked for everyone except an administrator. Each scope still advances through its stages on its own as its gates clear; see [The road at a glance](process-overview.md).

Above the board: **Search scopes…** filters cards by text, the **All statuses** dropdown filters by scope state, **Show deferred** includes scopes that were set aside, and the scope count (e.g. "73 scopes") confirms how many match.

## The other views

- **Matrix** — the same scopes as a table, one row per scope with columns for each phase's status. Best for a dense, spreadsheet-style read of where everything stands.
- **Stack** — the project's technology stack & style (frameworks, libraries, look-and-feel). This is what new work inherits unless overridden. Company-wide defaults live in [Stack Profiles](stack-profiles.md).
- **Theme** — the project's visual theme; company-wide defaults live in [Theme Profiles](theme-profiles.md).
- **Bug Reports** — bug reports captured for this project. If none exist yet, an **Install / get endpoint** action seeds a bug-trapping scope so the app can start collecting them.

## The document tabs

Each of these opens a generated, always-current view of the project:

- **Lifecycle** — the project's lifecycle report: how its scopes are distributed across the six phases, shown with charts. Refreshes automatically as scopes and tasks change.
- **Development Plan** — the build roadmap: what's built, what's next, and what's blocking, grouped foundation-first with a dependency map and critical path.
- **Portfolio Analyzer** — answers **"Has the company already built this?"** It searches your other projects for scopes that overlap this one, so you can reuse work instead of rebuilding it. Includes a scope-flow view and a **Download PDF**.
- **Compliance** — the audit workspace: enable **Compliance Frameworks** (GDPR, HIPAA, HITRUST, SOC2), configure audit settings, and review audit **Documents**, **Tasks**, and **Audit Reports** for the project.
- **Learnings** — the compound-learnings report: decisions, fixes, and compliance controls captured after work is completed. It's empty until learnings have been recorded for the project.
- **Kit** — the **AI Project Kit** for this project: a ready-to-download, AI-ready development environment (with its version and status) that connects an AI coding tool to this project's specs and rules.

## Change Impact: how the kit checks AI edits

The kit checks every edit an AI makes, through its edit tools or the command line, for what else it affects. The **Kit** tab's **Change Impact mode** panel sets how strict that check is for the whole project:

- **Notify** — the developer is told what an edit affects; nobody is asked.
- **Boundaries** (the default) — the developer is asked before an edit that reaches another scope's code or undoes a signed-off test.
- **Always** — the developer is asked whenever an edit affects anything else.

Whatever the mode, an edit that could lose data (dropping a table or a column) is stopped until the developer agrees to it specifically. Only the **project owner** or a **company administrator** can change the mode; everyone else sees which mode is set, who set it, and when. Every developer's kit picks up a change within an hour, and a mode a developer typed into their own kit settings is ignored once the owner has chosen one.

Each agreement and approval is kept in the scope's **Change Impact log**: expand a scope row to see each change that crossed an Impact Boundary, who agreed to it or approved it, when, and in their own words. The log is read-only; records cannot be edited or deleted.

## Common tasks

1. **Find a scope:** type in **Search scopes…** or switch to the **Matrix** view for a table.
2. **See only certain scopes:** use the **All statuses** dropdown, or toggle **Show deferred**.
3. **Check build order and blockers:** open the **Development Plan** tab.
4. **Avoid rebuilding something:** open **Portfolio Analyzer** and search for similar past work.
5. **Turn on a compliance framework:** open **Compliance**, enable the framework, and configure the audit.
6. **Download the project's AI environment:** open the **Kit** tab.
7. **Set how strictly the kit checks AI edits** (owner or company administrator): open the **Kit** tab and choose a **Change Impact mode**.
8. **See which changes crossed an Impact Boundary for a scope:** expand the scope row and read its **Change Impact log**.
9. **Archive or delete a project:** use the buttons at the top right — and confirm in the dialog.

## Fields and what they show

- **Phase badge** — the project's current lifecycle phase.
- **Audit dropdown** — which compliance framework the project is audited against (No Audit by default).
- **Phase column count** — number of scopes in that lifecycle phase.
- **Scope card state (Draft / Planned / …)** — where that unit of work stands.
- **Progress bar / "n/n done"** — completed vs. total tasks for the scope.
- **Scope Process Flow / Scope Analysis links** — open the scope's generated flow diagram and analysis.
- **Show deferred** — includes scopes that were intentionally set aside.
- **Scope count** — number of scopes matching the current search/filter.
- **Kit version & status** — the downloadable AI environment's version and readiness.
