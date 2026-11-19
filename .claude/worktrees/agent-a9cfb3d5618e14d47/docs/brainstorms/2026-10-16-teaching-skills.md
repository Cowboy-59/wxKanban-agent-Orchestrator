# Brainstorm: Teaching skills — AI-taught onboarding generated from the real app

- **Status:** closed
- **Opened / last updated:** 2026-10-16 / 2026-10-16
- **Source:** customer meeting notes, 2026-10-16 (group 2 of 4)
- **Asked for by:** one customer
- **Level:** senior

## The request

From the meeting notes:

- Create AI "skills", saved as markdown files in a repo, for every process, so anyone can be
  onboarded without a live walkthrough call.
- The skills act as onboarding tools: a user downloads them, loads them into their AI, and the AI
  teaches them how to use the app.
- Markdown files work in both Claude and ChatGPT, so they are portable across AI tools.
- All the usual protocol applies: logging, delta management, and versioning.

**The need behind it, as agreed:** a new user learns each process of an app from their own AI, with
no live walkthrough call. The notes don't ask for the AI to drive the browser. "Teach" was read as
a chat tutor, with coaching when the AI can see the browser. Confirm this with the customer.

## What already exists

| Item | Status | Evidence | Confidence |
|---|---|---|---|
| wxAI-training: a hand-written teaching skill covering the lifecycle and the scope-first rule. It teaches the development method, not how to use an app | Built | `_wxAI/commands/wxAI-training.md` | Confirmed |
| wxHelpGenerate: walks any web app screen by screen and records what each element really does (a `behavior` field) in `inventory.json`, then writes an HTML help site and a PDF. It never confirms an action that deletes or sends real data | Built (ships in the kit; has no scope) | `.claude/skills/wxHelpGenerate/SKILL.md:74,102` | Confirmed |
| In-app per-feature numbered help guides | Built (wxKanban's own app) | `src/shared/help/guides.ts` (SCOPE-084) | Confirmed |
| Amateur, junior, and senior teaching levels | Built (inside wxG-O-D and wxBrainstorm only) | wxBrainstorm `references/conduct.md` | Confirmed |
| Works in several AIs: 60 of 60 command files are marked for Claude Code and Cursor, 58 for BlackboxAI; none for ChatGPT | Partly built | `_wxAI/commands/*.md` front matter | Confirmed |
| Versioning: one version for the whole kit, none per skill file | Partly built | Only the third-party `task-observer` skill has a `version:` field | Confirmed |
| Help staleness: `.husky/pre-push` writes `.wxai/help-stale.json` when UI paths change without help changes. It marks everything stale at once and lives in wxKanban's own repo only | Built (coarse) | `.husky/pre-push:137-151`; `_wxAI/commands/wxRefreshHelp.md` | Confirmed |
| Learning or usage logging | Not found | — | Confirmed |
| Generating per-process teaching skills for an app | Not found | — | Confirmed |
| A scope that owns wxHelpGenerate | Not found (mentioned only in SPEC-136) | `grep` of `specs/Project-Scope/` | Confirmed |

## Panel

**Spoke:** Lead Architect (chair), Domain Analyst, Documentation, Frontend, QA, Security, DevOps.
**Sat out:** Legacy, Database, Backend, Migration.

## Decisions

| # | Item | Decision | Kind | To scope? | Date |
|---|---|---|---|---|---|
| 1 | Need and shape | A new user learns each process of an app from their own AI, with no live walkthrough call. wxHelpGenerate walks the **actual screen** and generates a teaching skill from it. The skill holds behavior only, never real data. It teaches by walking the learner through the process step by step | Agreed | yes | 2026-10-16 |
| 1b | Save rule | **UAT:** the learner may save freely. **Production:** before any step that saves, submits, sends, or deletes, the skill stops and asks **"Do you wish to save your changes?"** and goes on only on a yes. The generator records the app's UAT and Production addresses. An unknown environment is treated as Production. Committing steps are marked from wxHelpGenerate's recorded button behavior | Added | yes | 2026-10-16 |
| 2 | Whose app | **Both:** wxKanban's own users (skills shipped by wxperts) and kit customers' end users (a kit command that generates skills for their app). One generator serves both, with no hand-written wxKanban set | Agreed | yes | 2026-10-16 |
| 3 | Reuse or build new | **Extend wxHelpGenerate**, so one walk produces the help site, the PDF, and the teaching skills. Reuse `inventory.json`. **Build:** the teaching-skill writer, the save-rule markers, the skill header, and the regeneration step | Agreed | yes | 2026-10-16 |
| 4 | Release | One complete release (the "complete the whole area" rule from group 1), sequenced **after SCOPE-137 or in the same release**, never before, because 5a depends on it. The first generator run on wxKanban itself is the release's real-world test | Agreed | yes | 2026-10-16 |
| 5a | Drift and delta management | **Skill header:** skill version, the app version it was generated from, and the screens and elements it teaches (wxHelpGenerate inventory ids). **Precise staleness:** a change whose Change Impact (SCOPE-137) reaches a screen flags only the skills that teach that screen. This replaces the all-or-nothing help-stale marker and works in customer projects. **Targeted regeneration:** only the flagged screens are re-walked; their skills are regenerated and their versions bumped. **Delta section:** each regenerated skill opens with "What changed since version X". **Offline honesty:** the skill says which app version it was written for and asks the learner to report any screen that looks different, so the AI flags the mismatch instead of guessing | Agreed | yes | 2026-10-16 |
| 5b | Portability | **AI-agnostic.** Plain markdown that any AI can follow (Claude, ChatGPT, Gemini, Copilot, and others). No step depends on a vendor's tools or skill format; front matter is optional. The **chat tutor** is the base and works everywhere. **Coach mode** ("if you can see the user's browser, watch the page and confirm each step") is described generically and used only when the AI has browser access. In chat-only mode the skill **asks which environment the learner is in** before the first committing step, and "unsure" counts as Production. No vendor-specific packaging | Agreed | yes | 2026-10-16 |
| 5c | Logging and versioning | Versioning as in 5a. A **generation log** in wxKanban: who generated or regenerated which skills, when, from which app version, for which screens, and which were flagged stale, recorded through `project.capture_event` (for example `teaching_skill_generated`) | Agreed | yes | 2026-10-16 |
| 5c-x | Usage and learner-progress logging | **Declined.** An AI-agnostic skill running in someone else's AI cannot report back without breaking 5b. Progress tracking belongs in the customer's own app (a "lesson completed" mark). This also keeps learners' personal data out of wxKanban | Declined | no | 2026-10-16 |
| 5d | No real data or secrets | Skills hold behavior only, and example values are made up, never copied from the screen. Screenshots, if included, get the same check as the help site. Before a skill is written, the generator **fails** if it finds an email address, a key, or a token pattern in it | Agreed | yes | 2026-10-16 |
| 5e | Delivery | **Kit customers:** the generator writes `docs/teaching-skills/<process>.md` and `start-here.md` into their repo (versioned in git) and builds a **zip bundle**. The customer distributes it to their own users; we don't host their users' lessons. **wxKanban's own users:** a "Learn wxKanban with your AI" download on the in-app Help page, regenerated each release. `start-here.md` lists the lessons, explains the save rule, and asks the learner's level (amateur, junior, or senior). The bundle contains only the checked skills: no inventory, unchecked screenshots, or configuration | Agreed | yes | 2026-10-16 |
| 6 | Fit and priority | **Now**, as **a new scope**, after SCOPE-137. No scope owns wxHelpGenerate today; this scope becomes its home, and wxHelpGenerate's help-site and PDF behavior is documented here | Agreed | yes | 2026-10-16 |
| C1 | Interim recommendation | The panel first recommended declining as "already possible with /buildscope (one hand-built scope per process)". This was replaced by building it, because generating skills from the real screen, plus the save rule, is something a hand-built scope does not give | Changed | — | 2026-10-16 |
| D1 | "Watch me" demonstration (the AI drives the browser and performs the process) | **Declined** for group 2. It is left to group 3 (video) | Declined | no | 2026-10-16 |

## Risks to carry into the scope

- **Stale lessons teach the wrong thing confidently.** 5a depends on SCOPE-137. Do not ship without it.
- **Walking a live Production screen shows real records.** The pre-write check (5d) is mandatory.
- **Chat-only AIs can't see the environment.** The save rule depends on asking the learner and
  defaulting to Production.
- **The skill set must not leak into a public kit release by accident.** Generated skills land in
  the customer's `docs/`, not in `_wxAI/` (kit sync mirrors the filesystem).

## Questions for the customer reply

- Confirm that "Claude teaches them" meant a tutor in chat, plus coaching when the AI can see the
  browser, not the AI demonstrating the process.
- Learner progress tracking, if they want it, belongs in their app. Offer to scope it there.

## Open items

None.

## Next step

**Done (SCOPE-138).** `/buildscope --from-md` built the new scope
`specs/Project-Scope/138-teaching-skills.md` and its checklist; `/validateScope` passed (valid, 100);
every "yes" decision above was carried into it.

**Interview clarifications:**

- The terms **Teaching Skill** and **Committing Step** were added to `CONTEXT.md`.
- Desktop and mobile lessons are generated from screen definitions and labeled as such.
- UAT and Production addresses are stored in `docs-workspace/config.json`; an unknown address counts
  as Production.
- The command is a flag: `/wxHelpGenerate --teach` and `--teach --stale`.

**Not yet done:** `/createSpecs` (on request). The scope exists only on disk until `create_specs`
runs.
