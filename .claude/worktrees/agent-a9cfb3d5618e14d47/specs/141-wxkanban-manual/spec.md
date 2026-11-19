# Spec 141: wxKanban Manual

## Overview

# Scope 141: wxKanban Manual

**Scope Number**: 141
**Status**: `draft`
**Created**: 2026-10-18
**Depends On**: None
**Source**: `specs/Project-Scope/141-wxkanban-manual.md`

## Overview
A single wxKanban Manual, built from the existing help into a public Customer edition (/manual, HTML + PDF, also reachable from the in-app Help menu) and a repo-only Internal edition. It covers getting started, the scope-to-release process, the web app, the Dev Cockpit, and a generated reference of every shipped command showing what it calls and what calls it. It documents only what works today, is guarded against leaking internal detail, and ships text-first tonight (v1-tonight) with demo-company screenshots and freshness checks this week (v1.1). Help for wxKanban is spread across eight surfaces fed by five separate sources (the docs-workspace User Guide, the in-app plan-aware Help, the database-backed /docs and FAQ, the Getting Started guide, and the slash-command files), and none of them covers the web app, the Dev Cockpit and the process together. The command reference (help.md / wxHelp.md) has been stale since 2026-06-28 and lists commands that do not exist; the Cockpit's Standard list shows five commands with nothing behind them; six CLI commands shown in the session banner have no handler; "which command calls which" exists only in prose, with 15 commands keeping their real steps in server prompts. A new customer developer therefore cannot learn the path from install to first release, or trust a command lookup, without contacting support, and the operator cannot see the command chains either. The help is needed now.

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actor** | Customer developer new to the wxKanban kit |
| **Secondary Actors** | wxperts operator (Internal edition), Company admin, Consultant, Prospect reading the public Manual logged out |
| **Key Value** | A new customer developer goes from install to first release with no support contact, and can look up any command and trust what it calls and what calls it. |
| **Scope Boundary** | In scope (brainstorm rows 1-6, 7R, 8-11, 11R, 4R, 12R): docs-workspace becomes the single Manual source organized in parts (Part 1 Getting Started, Part 2 The Process, Part 3 Web App, Part 4 Dev Cockpit, Part 5 Command Reference, Appendix, Internal pages); one build producing a Customer edition and an Internal edition with fail-closed tagging; a generated Command Reference and commands.json; a drift check; a leak scan with a planted-leak test; publishing the Customer edition at /manual (public and in-app) with a PDF; redirects from the old Getting Started and help PDF URLs; and, in v1.1, retiring the dead help components, freshness checks, a demo-company seed and screenshots, the new Part 3 sections, Part 4 screenshots, and a full cold-agent run. |

## Out of Scope
Kit cleanup and archiving of commands, front-matter normalization, the new generated /help, repointing createSpecs to dbpush, fixing the Cockpit Standard list and dead CLI entries, the kit README link, and the consultant feature changes (all Scope A, released later together). Translation into the other 5 languages, deep links from in-app Help and the Cockpit, the Cockpit reading commands.json, and automated Cockpit screenshot capture (next release). SCOPE-092 translation of database help records. The wxkanbanhelp table, the public /docs media pages (SCOPE-044) and the FAQ (SCOPE-066), which stay as they are. Internal ops chapters (fences, release runbook, kit publishing) and SysAdmin and distributor sign-up screens (later, Internal edition).

## User Scenarios & Testing

### US1 — First release from the Manual alone
**Actor**: New customer developer
**Scenario**:
1. Opens /manual and follows Part 1 to install the prerequisites, generate the kit and wire it into the project
2. Follows Part 2 Design: runs /buildscope, /validateScope, /createSpecs
3. Runs /implement and reads in Part 2.4 what it runs (code review, test plan)
4. Sees the scope sitting in QA and reads Part 2.5: a scope with no machine tests stays in QA; checks that /implement Phase 5 filed its test plan and fixes it
5. Watches the scope advance on its own through Human Testing, Beta and Release as each gate clears
**Expected outcome**: The scope reaches Release with 0 support contacts.

### US2 — Look up a command
**Actor**: Customer developer
**Scenario**:
1. Opens Part 5 and the By stage index
2. Opens the implement page
**Expected outcome**: The page shows purpose, stage, arguments, calls (wxUIUXCodeReview, wxConversionParity, wxCreateTestPlan, preTest) and called by (wxG-O-D), all matching the command files and server prompts.

### US3 — An internal detail slips into a customer section
**Actor**: wxperts operator
**Scenario**:
1. Writes a paragraph saying the local .env points at production inside a customer-tagged section
2. Runs the Manual build
**Expected outcome**: The Customer build fails and names the file and line; the Internal build succeeds.

### US4 — A retired command is still installed
**Actor**: Customer developer
**Scenario**:
1. Types /wxAI-qa in their AI
2. Searches the Manual for it
**Expected outcome**: The Customer edition does not list it; Part 2.5 explains how QA actually works (test plan, smoke test, overnight run, gates).

### US5 — A prospect reads before buying
**Actor**: Logged-out visitor
**Scenario**:
1. Clicks Manual from the landing page
2. Reads Part 2
**Expected outcome**: The full Customer edition is readable with no login wall and contains no internal content.

### US6 — A command changes
**Actor**: wxperts operator
**Scenario**:
1. Adds a step to createSpecs that runs another command
2. Rebuilds the Manual
**Expected outcome**: The createSpecs page and the called-by list of the other command update with no hand edit; at release there are 0 stale generated sections.

## Functional Requirements

### FR-001 — [v1-tonight] One source, in parts
docs-workspace/ is the single Manual source, ordered as Part 1 Getting Started, Part 2 The Process, Part 3 Web App, Part 4 Dev Cockpit, Part 5 Command Reference, Appendix, and Internal pages. Every section carries front matter with a fixed id, an audience (customer or internal) and its sources.
**Acceptance Criteria**:
- [ ] The config lists the parts in this order
- [ ] Every section has a unique id, and that id becomes its URL path under /manual
- [ ] A section without an id fails the build

### FR-002 — [v1-tonight] Two editions, fail closed
One build produces an Internal edition containing every section and a Customer edition containing only customer-tagged sections, with any :::internal block removed. A section with no audience tag is treated as internal.
**Acceptance Criteria**:
- [ ] The Internal edition contains every section
- [ ] The Customer edition contains only customer-tagged sections and no :::internal block content
- [ ] An untagged section appears in the Internal edition only

### FR-003 — [v1-tonight] Generated Command Reference
A script reads _wxAI/commands/*.md, the shipped skills, mcp-server/src/prompts/*.md, the CLI registry and vscode-extension/package.json contributes.commands, and writes one page per command, three indexes (By stage, A-Z, By where it runs) and commands.json, with no model calls. Commands on the brainstorm row 13 archive list and the six CLI commands with no handler are excluded from the Customer edition.
**Acceptance Criteria**:
- [ ] Every shipped command outside the exclude list has a page
- [ ] Each page shows purpose, where it runs, stage (labeled Likely until front matter supplies it), arguments with an example, calls and called by
- [ ] Each link is labeled Confirmed (a step runs it), Likely (a suggested next step) or Mention (a see-also list)
- [ ] The Customer view never includes command body text, MCP tool names or file paths
- [ ] A fixture test with a small command set and known links passes
- [ ] Two runs on the same input produce identical output

### FR-004 — [v1-tonight] Drift check
Each build reports references to commands that do not exist and CLI commands with no handler, and writes them to the Internal page Known drift.
**Acceptance Criteria**:
- [ ] The /scope-validate references and the six CLI commands with no handler appear in the Known drift page
- [ ] The build fails only when drift appears in customer-visible content
- [ ] Drift in Internal-only content is reported without failing the build

### FR-005 — [v1-tonight] Leak scan (SOC 2 CC6.1)
The built Customer edition, HTML and PDF text, is scanned for internal detail and any hit fails the build. The build also fails if Internal edition output lands under public/ or _wxAI/.
**Acceptance Criteria**:
- [ ] Patterns cover .env, DATABASE_URL, connection strings, amazonaws and App Runner names, key formats such as sk_live and AKIA, email addresses outside an allowlist, internal paths such as src/server/ and mcp-server/, and code fence markers
- [ ] A planted-leak test inserts a fake secret into a customer-tagged section and the build fails
- [ ] Writing Internal output under public/ or _wxAI/ fails the build

### FR-006 — [v1-tonight] Part 1 Getting Started
Part 1 is built from gettingStartedInstructions.md and revised: sections 1-5 kept, section 6 step 2 expanded, section 7 rewritten to the real path, a new section 7b on the two ways to start, and section 8 moved to Appendix B.
**Acceptance Criteria**:
- [ ] Section 7 follows buildscope, validateScope, createSpecs, implement, then states that a scope advances through QA, Human Testing, Beta and Release on its own as each gate clears
- [ ] Section 7b covers a new project (/buildscope, or /wxG-O-D for a whole plan) and converting an existing app (/wxConversion, /cwConversion, /vbConversion)
- [ ] No command on the exclude list is named

### FR-007 — [v1-tonight] Part 2 The Process
Part 2 has sections 2.1 The road at a glance, 2.2 Scopes and specs, 2.3 Design, 2.4 Implementation, 2.5 QA, 2.6 Human Testing, 2.7 Beta, 2.8 Release, 2.9 Converting an existing app, 2.10 When something goes wrong, and 2.11 Who does what. Each stage section uses six columns: what it is for, what you do, what the AI does, commands, leaves when, common blockers.
**Acceptance Criteria**:
- [ ] Every gate rule matches SPEC-123 and the G.O.D. N8c reference
- [ ] Section 2.6 states that a sign-off is a person's attestation and the AI never signs
- [ ] Section 2.8 states that the user deploys and wxKanban never deploys
- [ ] Every command named links to its Part 5 page
- [ ] No command on the exclude list is named

### FR-008 — Part 3 Web App
v1-tonight: the 17 existing sections, grouped as 3A Everyone and 3C Company admins, as text only, with the pre-scope screenshots removed. v1.1: new sections for account (sign up, password reset, invitations, email change), billing and subscription, audit log, database diagram, admin overview and pending tasks, phase pages, scope analysis, process flow, the Overview interview and the team dashboard; a 3B Consultants group documenting today's consultant screens; and demo-company screenshots.
**Acceptance Criteria**:
- [ ] v1-tonight: the Customer edition contains 0 images created before this scope
- [ ] v1.1: every customer-facing screen route listed in the brainstorm record has a section
- [ ] v1.1: every Part 3 image comes from the demo company

### FR-009 — Part 4 Dev Cockpit
v1-tonight: sections 4.1 Installing and linking through 4.10 Help inside the Cockpit, as text. v1.1: sections 4.11 Project Agent and 4.12 Settings and extras, plus hand-taken screenshots stamped with the Cockpit version they show.
**Acceptance Criteria**:
- [ ] v1-tonight: each System Health line (Orchestrator, MCP connection, Database, morning summary) has a meaning and a fix
- [ ] v1-tonight: check out and check in of a scope is explained
- [ ] v1.1: every Part 4 image carries a Cockpit x.y.z stamp

### FR-010 — [v1-tonight] Appendix and Internal pages
The Appendix has A Glossary, B Troubleshooting by symptom and C Where to get help. The Internal edition adds I-1 Known drift and I-2 Not in this Manual, listing each excluded command with the reason.
**Acceptance Criteria**:
- [ ] Every glossary term links to the section that explains it
- [ ] Every troubleshooting fix that names a command resolves to an entry in commands.json
- [ ] I-2 lists every command on the exclude list with its reason

### FR-011 — [v1-tonight] Publish at /manual
The app serves the Customer edition at /manual/<part>/<section> and its PDF from /manual, both logged out and from a Manual item in the in-app Help menu, with the app version and build date on every page. The routes are registered before the single-page app fallback.
**Acceptance Criteria**:
- [ ] /manual returns 200 logged out and logged in
- [ ] The path is lowercase manual everywhere
- [ ] Every page shows the app version and build date
- [ ] The PDF downloads from /manual
- [ ] The in-app Help menu has a Manual item that opens /manual

### FR-012 — [v1-tonight] Redirects
Old help URLs redirect to the Manual: /gettingStartedInstructions.html to /manual/getting-started, and /help.pdf and /help.<lang>.pdf to the Manual PDF. The links at LandingPage.tsx and AppShell.tsx point to the Manual.
**Acceptance Criteria**:
- [ ] Each old URL returns 301 to its Manual target
- [ ] The landing page and app shell links open the Manual

### FR-013 — [v1.1] Retire dead help
Archive HelpPage.tsx, HelpPanel.tsx and ContextualHelp.tsx, GET /api/help/cli-commands, scripts/build-help-pdf.ts and scripts/check-getting-started-sync.mjs, after confirming with a build that nothing uses them.
**Acceptance Criteria**:
- [ ] A client and server build with them removed passes
- [ ] The wxkanbanhelp table, /docs and the FAQ still work

### FR-014 — [v1.1] Freshness
A change to a file listed in a section's sources flags that section through the .husky/pre-push help-stale marker; a stale commands.json blocks the push; the nightly run reports the stale-section count; /wxRefreshHelp covers all Manual parts and clears only what was fixed.
**Acceptance Criteria**:
- [ ] Changing a listed source flags only that section on the same push
- [ ] A stale commands.json blocks the push with the command to fix it
- [ ] The nightly report shows Manual: N stale sections

### FR-015 — [v1.1] Demo-company seed
A seed creates one demo company with fake people, projects, scopes, tasks and invoices for the screen walk, following the onboarding video tool's demo-data rule.
**Acceptance Criteria**:
- [ ] The demo company is marked as demo and has no Stripe customer, receives no email and is excluded from customer metrics
- [ ] Running the seed twice changes nothing
- [ ] One command removes the demo company and all its data
- [ ] The seed asks for the owner's yes before writing to production
- [ ] Only example.com email addresses are used

### FR-016 — Cold-agent run
An AI with no project memory, given only the Customer edition and a fresh kit, follows the Manual from install to a released scope and logs every point where the Manual was wrong, vague or silent.
**Acceptance Criteria**:
- [ ] v1-tonight: the run reaches a released scope with 0 blockers
- [ ] v1.1: a fresh run logs 0 points where the Manual was wrong or silent

### FR-017 — [Amendment 2026-10-18] The Dev Cockpit opens the Manual
Added at the owner's request after v1 shipped. The Cockpit shows a **Manual** row in its help area and offers the palette command **wxKanban: Open the Manual**; both open the Customer edition at `<app URL>/manual/` in the browser, using the same app URL setting the Cockpit already uses for kit downloads. A single link, not the per-command deep links, which stay in the next release.
**Acceptance Criteria**:
- [ ] The Cockpit tree shows a Manual row next to Community Help, in every state
- [ ] Clicking it, or running **wxKanban: Open the Manual**, opens `/manual/` on the configured app URL
- [ ] The Cockpit is published to the Marketplace with this change

## Data Requirements
None for v1-tonight. v1.1 demo-company seed (FR-015) inserts rows into existing tables only (companies, users, projects, scopes/specs, tasks, invoices) with no DDL; schema changes are manual under SCOPE-117 and none is needed. How the demo company is marked is decided in the spec; the leading option is a fixed, configured company id, which needs no new column.

## API Routes
| Method | Path | Description |
|---|---|---|
| GET | /manual/* | Serves the built Customer edition (static), public and logged in; registered before the SPA fallback |
| GET | /manual/wxKanban-Manual.pdf | Customer edition PDF |
| GET | /gettingStartedInstructions.html | 301 to /manual/getting-started |
| GET | /help.pdf, /help.:lang.pdf | 301 to the Manual PDF |
| GET | /api/help/cli-commands | v1.1: removed (dead, nothing uses it) |

## Frontend Components
- AppShell.tsx: a Manual item in the in-app Help menu opening /manual; the existing Getting Started link repointed to /manual/getting-started.
- LandingPage.tsx: the Getting Started / docs link repointed to /manual.
- No React renderer for the Manual: it is static HTML served by the app, like public/help.html.
- v1.1: HelpPage.tsx, HelpPanel.tsx and ContextualHelp.tsx archived (unused).

## Success Criteria
1. Metric 1 - First release from the Manual alone: v1-tonight gate = a cold-agent run (an AI with no project memory, given only the Customer edition and a fresh kit) reaches a released scope with 0 blockers; v1.1 = 0 points where the Manual is wrong or silent on a fresh cold run.
2. Metric 2 - Every shipped command has a correct entry (v1-tonight): 100% of kit commands outside the exclude list have a Part 5 page, 0 drift findings in customer-visible content, and the generator fixture test passes.
3. Metric 3 - Nothing internal leaks (v1-tonight): the output scan reports 0 hits on the built Customer edition and the planted-leak test fails the build every time; v1.1 extends this to new screenshots, which come only from the demo company.
4. Metric 4 - It stays current: v1-tonight = 0 stale generated sections at release; v1.1 = a changed source flags its section on the same push and the nightly report carries the stale-section count.
5. Metric 5 - It is reachable (v1-tonight): /manual returns 200 logged out and logged in, and /gettingStartedInstructions.html, /help.pdf and /help.<lang>.pdf each return 301 to the right Manual target.
6. Metric 6 - No real data in any picture (v1.1): 100% of Part 3 and Part 4 screenshots come from the demo company and 0 pre-scope redacted images remain.

## Key Entities
These are files, not database tables:
- **Manual Section**: id (fixed, becomes the URL path), part, audience (customer | internal), sources (files it describes), body.
- **Edition**: Customer (public, filtered) or Internal (repo-only, everything).
- **Command Entry** (commands.json): name, kind (slash | skill | cli | cockpit), purpose, stage with confidence, where it runs, arguments, calls[], calledBy[], audience, excluded flag with reason.
- **Link**: target command and label (Confirmed | Likely | Mention | Drift).

## Constraints
- Documents only what works today (brainstorm row 7R): archived-to-be commands and the six dead CLI commands are excluded from the Customer edition; when Scope A lands, Part 5 is regenerated. No dependency on Scope A.
- Release target: tonight or first thing 2026-10-19 for v1-tonight; v1.1 this week. Cut order if time runs short: Part 4 detail first, then Part 3 grouping polish; Parts 1, 2 and 5, the leak scan and /manual are never cut.
- The owner pushes; App Runner deploys the app and MCP on push; nothing ships before the owner's single read-through of the Customer edition.
- The local .env DATABASE_URL is production: the v1.1 demo seed asks before writing, makes no DDL (SCOPE-117), never uses drizzle-kit push.
- The manual path is lowercase everywhere. New scripts are .mjs; never emit tsc output into src/. /manual routes are registered before the SPA * fallback.
- Compliance (SOC 2): CC6.1 maps to FR-005 leak scan; CC8.1 is met by tracked tasks through createSpecs/implement and an owner-approved push.

## Notes
- Converted from docs/brainstorms/2026-10-18-wxkanban-manual.md.
- Integration context: reuses the docs-workspace pipeline (config.json, wxHelpGenerate build_docs.py, tooling/topdf.mjs) and folds in gettingStartedInstructions.md; reads the command files, shipped skills, server prompts, CLI registry and Cockpit package; process facts come from SPEC-123 and the G.O.D. N8c reference; the SCOPE-084 in-app Help stays the short layer and public/help.html is kept; the demo-data gate follows SCOPE-139's video.mjs rule; supersedes only SCOPE-016's unbuilt manual and contextual-help parts, while SCOPE-092, SCOPE-044 and SCOPE-060's dependency on SCOPE-016 are unaffected.

## Clarifications

### Session 2026-10-18
| # | Question | Decision |
|---|----------|----------|
| 1 | Does the Manual absorb SCOPE-092? | No. SCOPE-092 translates database help records; it stays its own scope (row 11R). |
| 2 | Does it supersede SCOPE-016? | Only its unbuilt manual and contextual-help parts; the wxkanbanhelp table stays (row 11R). |
| 3 | Where do screenshots come from? | A demo-company seed in v1.1; there is no UAT environment. |
| 4 | When does it ship? | v1-tonight by first thing 2026-10-19; v1.1 this week (row 4R). |
| 5 | Is fixing broken commands part of it? | No. The Manual documents only what works; fixes ship with Scope A and the consultant changes (rows 7R, 12R). |


## Business Problem

Describe the concrete customer or operator pain point this scope solves. Replace this paragraph with specific language describing the current friction, the desired outcome, and why this work is being prioritized now.

## Actors

- Primary: Operator who initiates this workflow as part of their daily responsibilities and depends on the result for downstream decisions.
- Secondary: Reviewing engineer, dependent service, or stakeholder who consumes or validates the output produced by this scope.

## Success Metrics

1. Outcome 1 — replace with a concrete target that includes a number, percentage, or timing threshold (e.g., "Reduce X by 30%" or "Complete Y within 2 minutes").
2. Outcome 2 — replace with a second measurable metric covering reliability, throughput, or operator-visible behavior.
3. Outcome 3 — replace with a third measurable metric covering correctness, audit, or downstream impact.

## Scope Boundary

This scope covers the specific files, modules, or workflows listed here. Replace this paragraph with the concrete set of code surfaces, screens, or APIs that this iteration changes. Reference paths where helpful.

## Out of Scope

Items deliberately deferred to future scopes. Replace this paragraph with the concrete list of things this iteration does NOT change, including any cross-cutting concerns (publishing, migration, UI polish) that need their own scope.

## Open Questions

None at this time. Add open questions as they arise during scope review; resolve each one with a written decision before promoting the scope.

## Functional Requirements

### FR-001 — Replace with first requirement title

Describe the requirement in concrete behavioral terms. The system MUST do something specific, observable, and testable.

**Acceptance Criteria**:
- [ ] criterion 1 — what the operator can do
- [ ] criterion 2 — what the system persists or exposes

## Phase

**Current Phase**: design
**Priority**: high

## Status

- **Date**: 2026-10-18
- **Phase**: design
