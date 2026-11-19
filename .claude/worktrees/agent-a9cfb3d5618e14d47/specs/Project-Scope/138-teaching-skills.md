# Scope 138: Teaching Skills

**Scope Number**: 138
**Status**: `draft`
**Created**: 2026-10-16
**Depends On**: SCOPE-137 (Change Impact — precise staleness for FR-006; must ship before or with this scope)
**Related Scopes**: SCOPE-084 (in-app help guides), SCOPE-044 (docs and help pages), SCOPE-127 (stack adapters — possible source of screen definitions)
**Implemented By**: SPEC-138 (`specs/138-teaching-skills/`)
**Source**: `specs/Project-Scope/138-teaching-skills.md` — converted from `docs/brainstorms/2026-10-16-teaching-skills.md`

## Overview

**Teaching Skills** let a new user learn each process of an app from their own AI, with no live
walkthrough call.

`/wxHelpGenerate --teach` walks the app's real screens and generates one AI-agnostic markdown lesson
per process. It is the same walk that produces the help site and the PDF. Each lesson:

- teaches step by step, as a tutor in any AI's chat, or as a coach when the AI can see the browser
- holds behavior only, never data

**Saving.** In **UAT** the learner saves freely. In **Production**, before every **Committing
Step**, the lesson asks **"Do you wish to save your changes?"**. An unknown environment counts as
Production.

**Staying current.** Each lesson carries its version and the app version it describes. SCOPE-137's
Change Impact flags only the lessons whose screens a change reaches, and `--teach --stale`
regenerates those, each with a "What changed" section.

**Desktop and mobile apps** are taught from their screen definitions and labeled as such.

**Delivery:**

- Kit customers hand the bundle to their own users.
- wxKanban users download "Learn wxKanban with your AI" from the Help page.

Generation is logged in wxKanban. This scope also becomes wxHelpGenerate's home: its existing
help-site and PDF behavior is documented here as the baseline.

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actor** | Lesson generator — a kit customer's developer, or wxperts for wxKanban |
| **Secondary Actors** | Learner — an end user in any AI |
| **Key Value** | Onboarding without live walkthrough calls, with lessons that are accurate because they come from what the screens really do. |
| **Scope Boundary** | IN: a --teach mode on wxHelpGenerate reusing its walk and inventory.json; the AI-agnostic lesson format (chat tutor base, generic coach mode); Committing Step marking and the UAT/Production save rule; environment detection (address lists in config.json; chat-only question; unknown = Production); lesson header and versioning; precise staleness and --teach --stale regeneration via SCOPE-137 Change Impact with a "What changed" section; the pre-write data check; desktop and mobile lessons generated from screen definitions, labeled as such; the delivery bundle with start-here.md; the "Learn wxKanban with your AI" Help-page download; the generation log in wxKanban; documenting wxHelpGenerate's existing help-site and PDF behavior as this scope's baseline; Cockpit Help text for --teach. |

## Business Problem

New users of an app are onboarded through live walkthrough calls. These don't scale, vary by
presenter, and aren't available when the user needs them. A customer (meeting 2026-10-16) proposed
AI skills per process that a user loads into their own AI to be taught the app.

wxKanban already has the hard part. wxHelpGenerate walks any web app and records what every element
really does in `inventory.json`. But it only produces reading material (a help site and a PDF), and:

- nothing generates per-process teaching lessons
- nothing keeps lessons current when screens change. The only staleness signal,
  `.wxai/help-stale.json`, is all-or-nothing and exists only in wxKanban's own repo
- nothing protects production data when a learner practises a process

## Out of Scope

- Usage logging and per-learner progress tracking. Lessons run in any AI and can't report back;
  progress tracking belongs in the customer's own app.
- The AI demonstrating a process by driving the browser ("watch me"). That belongs to group 3
  (video).
- Hosting kit customers' end-user lessons.
- wxAI-training, which teaches the development method and stays separate.
- Any database schema change.

## User Scenarios & Testing

### US1 — Generate lessons for a customer's web app

**Actor**: Kit customer's developer

1. Runs /wxHelpGenerate --teach on their app; the first run asks for the UAT and Production addresses and stores them.
2. The walk records every screen and what each control does, and marks Committing Steps.
3. It writes the help site, the PDF, docs/teaching-skills/<process>.md per process, and start-here.md, and builds a zip bundle.
4. The data check passes and the generation is logged in wxKanban.

**Expected outcome**: One lesson per process (SC-1), with no real data in any (SC-3).

### US2 — Learner in Production

**Actor**: End user with the bundle loaded into ChatGPT

1. Opens start-here.md and says they are new (amateur).
2. Picks Create an invoice; the lesson walks them through it step by step in chat.
3. Before the Save step it asks which environment they are in; they are not sure, so it treats it as Production.
4. It asks "Do you wish to save your changes?"; they say no, and it explains what Save would have done.

**Expected outcome**: Nothing is saved in Production without an explicit yes (SC-2, SC-6).

### US3 — Coach mode in UAT

**Actor**: Learner using Claude with browser access, on the UAT address

1. The lesson watches the page and confirms each step as the learner does it.
2. The address is on the UAT list, so the learner saves freely and sees the result.

**Expected outcome**: A full hands-on run with no save question in UAT.

### US4 — The app changes; only affected lessons regenerate

**Actor**: Customer's developer

1. A change to the Invoice screen lands; SCOPE-137 Change Impact flags the two lessons teaching it.
2. They run /wxHelpGenerate --teach --stale; only the Invoice screen is re-walked.
3. Those two lessons get new versions, each with "What changed since version X: an approval step was added".

**Expected outcome**: No other lesson is touched or flagged (SC-5).

### US5 — Desktop app and an unknown address

**Actor**: Developer and learner

1. The developer runs --teach on a WinDev-converted desktop app; lessons are generated from screen definitions and labeled "from definitions, not tested by clicking".
2. Separately, a learner opens a web lesson on an address on neither list; it is treated as Production and asks before every Committing Step.

**Expected outcome**: Honest labeling (SC-7) and the safe default on an unknown address (SC-6).

## Functional Requirements

### FR-001 — --teach mode on wxHelpGenerate

/wxHelpGenerate --teach reuses the same walk and inventory.json to write one Teaching Skill per process, alongside the help site and PDF.

**Acceptance Criteria**:
- [ ] One walk produces all three outputs.
- [ ] Lessons cover 100% of the inventory's processes, none missing, none extra (SC-1).
- [ ] A run without --teach behaves exactly as before.

### FR-002 — AI-agnostic lesson format

Each lesson is plain markdown any AI can follow: a chat tutor as the base, and coach mode described generically (if you can see the user's browser, watch the page and confirm each step). No step depends on a vendor tool; front matter is optional.

**Acceptance Criteria**:
- [ ] The same file completes in at least 3 AIs with no edits (SC-4).
- [ ] No vendor-specific tool names appear in lesson steps.

### FR-003 — Committing Steps and the save rule

The generator marks every Committing Step (save, submit, send, delete) from wxHelpGenerate's recorded button behavior. In UAT the lesson proceeds; in Production or an unknown environment it asks "Do you wish to save your changes?" and continues only on a yes.

**Acceptance Criteria**:
- [ ] 100% of the fixture's committing buttons are marked (SC-2).
- [ ] A no never saves.
- [ ] An unknown environment is treated as Production (SC-6).

### FR-004 — Environment detection

The first --teach run asks for the app's UAT and Production addresses and stores them in docs-workspace/config.json; each lesson carries them. In coach mode the lesson compares the page address to the lists; in chat-only mode, and for desktop and mobile apps, it asks the learner which environment they are in, and "unsure" means Production.

**Acceptance Criteria**:
- [ ] An address carrying a token or credentials is refused.
- [ ] The chat-only question is asked before the first Committing Step.
- [ ] Addresses not on either list are treated as Production.

### FR-005 — Lesson header and versioning

Each lesson states its version, the app version it was generated from, and the screen and element ids it teaches, and tells the learner which app version it describes, asking them to report any screen that looks different.

**Acceptance Criteria**:
- [ ] Every lesson has a valid header.
- [ ] A mismatch the learner reports is flagged in the chat, not guessed around.

### FR-006 — Precise staleness and --stale regeneration

Using SCOPE-137 Change Impact, a change flags only the lessons whose screens it reaches. /wxHelpGenerate --teach --stale re-walks only those screens, regenerates those lessons, bumps their versions, and opens each with "What changed since version X". This replaces the all-or-nothing .wxai/help-stale.json for teaching lessons.

**Acceptance Criteria**:
- [ ] SC-5 holds: 0 extra and 0 missed flags; only flagged lessons are regenerated.
- [ ] The What-changed section lists added, removed, and changed steps.

### FR-007 — Pre-write data check

Lessons hold behavior only, with made-up example values; screenshots go through the help site's existing check. Before any lesson is written, the generator fails on an email address, key, token, or real record value.

**Acceptance Criteria**:
- [ ] SC-3 holds on a fixture seeded with fake personal data.
- [ ] A failed check names the lesson and the pattern, never the value.
- [ ] No flag disables the check.

### FR-008 — Desktop and mobile lessons

For desktop and mobile app types, lessons are generated from screen definitions (conversion output, forms, page.md) instead of a walk, each labeled "from definitions, not tested by clicking".

**Acceptance Criteria**:
- [ ] SC-7 holds on a sample desktop app.
- [ ] These lessons always use the chat-only environment question.

### FR-009 — Delivery bundle and start-here

The generator writes docs/teaching-skills/<process>.md and start-here.md into the project and builds a zip bundle. start-here.md lists the lessons, explains the save rule, and asks the learner's level (amateur, junior, senior).

**Acceptance Criteria**:
- [ ] The bundle holds only checked lessons — no inventory, unchecked screenshots, or configuration.
- [ ] Lessons are written under docs/, never _wxAI/.

### FR-010 — Learn wxKanban with your AI download

The in-app Help page offers wxKanban's bundle, generated by running --teach on wxKanban each release, served by GET /api/help/teaching-skills/bundle.

**Acceptance Criteria**:
- [ ] SC-8 holds: the download matches the current release's lessons.
- [ ] The release checklist includes regenerating the bundle.

### FR-011 — Generation log

Each generation or regeneration is recorded in wxKanban through project.capture_event as teaching_skill_generated, with who, when, app version, screens, lessons written, and which were stale. No usage or learner data is recorded.

**Acceptance Criteria**:
- [ ] Every --teach run produces one record, queued offline when the MCP is unreachable.
- [ ] The record holds no learner identifiers.

### FR-012 — wxHelpGenerate scope home and Cockpit surfacing

This scope documents wxHelpGenerate's existing help-site and PDF behavior as its baseline, and the Cockpit Help entry for wxHelpGenerate is updated to name --teach and --teach --stale.

**Acceptance Criteria**:
- [ ] Baseline behavior is described in the specs.
- [ ] The Cockpit Help text names --teach.

### FR-013 — Shared Entry Path (Amendment A, 2026-10-18)

Lessons for an app reached through a portal (for example Workbench or wxHub) begin at the portal: the first steps sign in to the portal and open the app from it, and the environment check covers the portal's addresses as well as the app's. The Entry Path (direct, or a named portal with its sign-in address, the tile that opens the app, and the app address) is the shared `entryPath` in docs-workspace/config.json that SCOPE-140 defines. Lessons never contain credentials.

**Acceptance Criteria**:
- [ ] A portal-hosted app's lessons open with the portal sign-in and the hand-off to the app.
- [ ] The portal's addresses are classified by the same UAT and Production lists.
- [ ] No lesson contains a user name, password or authenticator code.

## Data Requirements

**No new table and no DDL.** One new event type, `teaching_skill_generated`, is added to the Zod
`ProjectEventTypeSchema` (the same schema SCOPE-137 extends) and stored in the existing `events`
table. Its `metadata` holds who, the app version, the screens, the lessons written, and which were
stale.

Files in the project (not the database):

- `docs-workspace/config.json` gains an `environments` block listing the UAT and Production
  addresses.
- `docs/teaching-skills/<process>.md` and `start-here.md` are written by the generator. Committing
  them is up to the customer.
- The bundle `.zip` is a build output and is gitignored.

## API Routes

MCP: no new tool — `project.capture_event` accepts `teaching_skill_generated`.
App: `GET /api/help/teaching-skills/bundle` — serves wxKanban's current teaching bundle; signed-in users; read-only.

## Frontend Components

App: a "Learn wxKanban with your AI" card on the Help page with the download, the bundle's version, and one line on how to load it into any AI.
Cockpit: the wxHelpGenerate Help entry mentions `--teach` and `--teach --stale`.

## Success Criteria

1. SC-1: A --teach run on wxKanban produces one Teaching Skill per process in its inventory — 100% coverage, none missing, none extra.
2. SC-2: 100% of Committing Steps are marked, and in Production every one gets the "Do you wish to save your changes?" question.
3. SC-3: 0 lessons written that contain an email, key, token, or real record value (data check plus a fixture seeded with fake personal data).
4. SC-4: The same lesson completes in at least 3 different AIs (Claude, ChatGPT, one more) with no edits.
5. SC-5: A change reaching one screen flags only the lessons teaching that screen (0 extra, 0 missed), and --stale regenerates only those, each with a "What changed" section.
6. SC-6: An unknown environment is treated as Production 100% of the time, in coach and chat-only mode.
7. SC-7: A desktop or mobile app gets lessons generated from screen definitions, each labeled "from definitions, not tested by clicking".
8. SC-8: The "Learn wxKanban with your AI" Help-page download matches the current release's lessons.

## Key Entities

**Teaching Skill** — AI-agnostic markdown lesson generated from a walk of real screens (or screen definitions for desktop and mobile); behavior only; versioned (CONTEXT.md).
**Committing Step** — a step that saves, submits, sends, or deletes; in Production preceded by "Do you wish to save your changes?" (CONTEXT.md).
**Environment list** — UAT and Production addresses in `docs-workspace/config.json`.
**Lesson header** — lesson version, app version, screen and element ids.
**Teaching bundle** — start-here.md plus the checked lessons, zipped.

## Constraints

**Delivery**

1. **One complete release, no partial.** It ships after SCOPE-137 or in the same release, never
   before.
2. **Two channels:** the kit (the generator) and an app + MCP push (the Help card, the bundle route,
   the event type). The Cockpit Help text goes in the next VSIX.
3. **The first `--teach` run on wxKanban is the release test.** Wrong lessons for wxKanban's own
   screens block the release.

**Technical**

4. **Kit sync mirrors the filesystem,** so generated lessons are written under `docs/`, never
   `_wxAI/`.
5. **Walking Production shows real records.** The pre-write data check is mandatory and no flag can
   skip it.
6. **wxHelpGenerate's walk rule stays:** never confirm an action that deletes or sends real data.
7. **No schema change.** The event type is Zod-only.

**Boundary**

8. **wxAI-training stays separate.**

## Compliance Requirements

### SOC 2

- **CC7.2:** generation is logged with who and when (FR-011).
- **Confidentiality:** no customer data in any lesson (FR-007).
- **Learner data:** no personal data about learners is collected.

## Notes

- Extends the wxHelpGenerate kit skill (`.claude/skills/wxHelpGenerate`, `_wxAI/skills/wxHelpGenerate`), which had no owning scope; this scope becomes its home.
- Customer questions for the reply (non-blocking): confirm that "teach" meant tutor plus coach, not the AI demonstrating; progress tracking belongs in their app.
- Converted from `docs/brainstorms/2026-10-16-teaching-skills.md` (group 2 of a customer meeting, 2026-10-16).

## Clarifications

### Session 2026-10-16

| # | Question | Decision |
|---|----------|----------|
| 1 | Reuse check | No existing scope covers it (closest: SCOPE-003 admin onboarding, SCOPE-062 theme generation, both < 0.70). New scope. |
| 2 | Terminology | Teaching Skill and Committing Step added to CONTEXT.md. |
| 3 | Desktop and mobile apps | (b) Generated from screen definitions, labeled "from definitions, not tested by clicking". |
| 4 | UAT / Production addresses | Asked on first run, stored in docs-workspace/config.json, carried by each lesson; tokenized addresses refused; unknown = Production. |
| 5 | Command shape | (a) A flag on wxHelpGenerate: --teach and --teach --stale; Cockpit Help updated. |
| 6 | Success criteria | SC-1 to SC-8 as listed. |

### Session 2026-10-18 (Amendment A)

| # | Question | Decision |
|---|----------|----------|
| 7 | Shared Entry Path (Amendment A, 2026-10-18) | Lessons for a portal-hosted app begin at the portal, using the shared `entryPath` in docs-workspace/config.json that SCOPE-140 defines; FR-013 added. Approved by the owner on 2026-10-18. |
