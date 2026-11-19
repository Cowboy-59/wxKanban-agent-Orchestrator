# Claude Rules Guide

The rules Andy has set for Claude in the wxKanban repo: first as a short list, then each one explained.

## Where the rules live

| Place | What is in it | When Claude reads it |
|---|---|---|
| `CLAUDE.md` (repo root) | The always-on core: stack, naming, fences, spec-first, AI behavior | Every session, automatically |
| `_wxAI/rules/*.md` | Longer rule files (constitution, git, minimal code, search-before-suggest, remote, token advisor, shadcn, compliance) | On demand, when the work enters that area. The kit also syncs these to customer projects |
| Claude's memory (`~/.claude/projects/.../memory/feedback_*.md`) | Rules Andy gave in conversation, each with the reason and the incident behind it | The index loads every session; the detail is opened when relevant |

When two places disagree, `CLAUDE.md` wins (see rule 2).

---

## Part 1: The short list

**Safety and release**

1. Never run git unless asked in the current message.
2. Never push until told. A push deploys production.
3. Publish one, publish all: app, kit, and Cockpit together.
4. If you bump a version, you build that artifact.
5. Batch by area: fix ALL, test ALL, release ALL.
6. "Version number" means `APP_VERSION` in `src/client/version.ts`.

**Planning and specs**

7. Spec first: no feature code without an approved spec.
8. Ask which scope a task belongs to before searching for it.
9. Every feature plan becomes a scope document.
10. `/buildscope` is always interactive, section by section.
11. Show review sections as plain text, not boxes or code blocks.
12. Respect scope boundaries: flag an unscoped dependency, don't design it.
13. After `/buildscope`, G.O.D. runs everything through to implement.
14. Always write `SCOPE-NNN` or `SPEC-NNN`, never a bare number.
15. Use the orchestrator; ask before going around it.
16. Code fences are written by the orchestrator only.

**Building**

17. Search before you suggest.
18. Write the smallest complete change (Minimal Code, KISS).
19. Answer a question before writing any code.
20. Endpoint-test every fix and feature.
21. Wire the entrance: a person must be able to reach and use it.
22. If a library seems broken, assume you are using it wrong.
23. New code is guilty until proven innocent.
24. TypeScript with no `any` or `@ts-ignore`; Pino, never `console.log`.
25. Database names are lowercase with no underscores; schema changes are applied by hand.
26. Every screen works in dark and light mode.
27. No toast messages.
28. Use shadcn components through the shadcn MCP.
29. A new command isn't done until it shows in the Dev Cockpit.
30. No backward compatibility in early development.
31. In this repo, use the direct database connection, not the MCP.
32. The kit is the workflow engine; the editor AI does the writing.
33. Server writes to the database; the kit pulls files down.
34. Load the compliance context before scoping, specifying, or implementing.

**Cost and context**

35. Pick a model for every subagent by difficulty.
36. Suggest token savings; never apply them on your own.
37. Suggest `/clear` after each finished task, or at about 80% context.
38. G.O.D. estimates time, never money.

**Communication**

39. Every explanation uses the plain-KISS method.
40. Give full absolute paths.
41. Status documents: table first, open items second, detail last.
42. "HANDOFF REMOTE" is a command, not a task.
43. Critical thinking is the real job; teach it, don't replace it.

---

## Part 2: Each rule explained

### Safety and release

**1. Never run git unless asked in the current message.**
Claude does not commit, push, merge, branch, or checkpoint on its own judgment, including at "good
stopping points". Permission doesn't carry over: an earlier "commit" in the same session doesn't cover
the next one. Source: `CLAUDE.md`, `_wxAI/rules/git.md`.

**2. Never push until told. A push deploys production.**
App Runner deploys from `main` automatically, so a push is a production release. Claude reports
"committed locally, holding push" and waits for "push it", "ship it", or "deploy it", even for
documentation-only changes. *Note:* the memory version of this rule says commits are fine once you
accept a change, but `CLAUDE.md` and rule 1 say commits also need an explicit ask. The stricter rule
applies until you change one of them. Source: memory `feedback_no_push_without_testing`.

**3. Publish one, publish all: app, kit, and Cockpit together.**
A release isn't finished when the website deploys. The kit and the Cockpit VSIX reach customers through
a separate GitHub release, so all three go out together (`sync-all-versions.mjs`, then
`sync-to-orchestrator.mjs --release`). Origin: on 2026-06-19 the app shipped 1.5.118 and the kit and
Cockpit were left behind. Source: memory `feedback_publish_one_publish_all`.

**4. If you bump a version, you build that artifact.**
A version number must always match a real, installable build. The pre-push hook bumps the manifest
numbers but builds nothing, so after a bump Claude rebuilds the VSIX or publishes the kit, even when
the code change was trivial. Source: memory `feedback_bump_means_build`.

**5. Batch by area: fix ALL, test ALL, release ALL.**
When work touches an area (the kit, billing, conversion), Claude makes a checklist of every open item
in that area, fixes them all, tests them all, and releases them as one batch. No drip of
single-defect releases. Several reports of the same defect are always fixed together. Source: memory
`feedback_batch_by_area_not_drip`.

**6. "Version number" means `APP_VERSION` in `src/client/version.ts`.**
`package.json` has its own version field, which isn't kept in sync. When you say "version no", Claude
edits `version.ts`. Source: memory `feedback_version_number_location`.

### Planning and specs

**7. Spec first: no feature code without an approved spec.**
The order is: draft the spec change, show it, wait for "approved", then write code. Even after a full
plan has been agreed in chat, the spec is updated first. Trivial work (a one-file bug fix, a version
bump, a comment) is exempt. Origin: a build error that recurred for three weeks because a requirement
was never in the spec. Source: `CLAUDE.md`, memory `feedback_spec_first_for_features`.

**8. Ask which scope a task belongs to before searching for it.**
You usually know the scope number. Claude asks "do you know which scope this is, or should I search?"
instead of spending turns grepping `specs/`. Source: memory `feedback_spec_lookup`.

**9. Every feature plan becomes a scope document.**
A plan is saved as `specs/Project-Scope/NNN-<name>.md` with the standard sections, not left in a
throwaway plan file, because the scope is what feeds `buildscope`, `createSpecs`, and `implement`.
Source: memory `feedback_plans_become_scopes`.

**10. `/buildscope` is always interactive, section by section.**
Claude presents each section with its reasoning, then stops and waits for you. It never bulk-generates
a scope. In practice every section review catches something that would otherwise cost rework later.
Source: memory `feedback_buildscope_interactive`.

**11. Show review sections as plain text, not boxes or code blocks.**
Section reviews (Overview, Requirements, and so on) are shown as plain prose with simple labels. ASCII
boxes and monospace blocks are harder to read. Source: memory `feedback_plain_text_sections`.

**12. Respect scope boundaries: flag an unscoped dependency, don't design it.**
If a feature leans on a capability that has no scope yet, Claude names it as a dependency and asks how
to sequence it. Its storage, schema, and API belong to its own scope. Source: memory
`feedback_respect_scope_boundaries`.

**13. After `/buildscope`, G.O.D. runs everything through to implement.**
Once a scope is approved, `createSpecs`, contracts, helpers, and implement all run through
`/wxG-O-D`, never through an ad-hoc workflow or agent fan-out of Claude's own. G.O.D. owns the
checkpoints, the decision ledger check, and the model per helper. Source: `CLAUDE.md`, memory
`feedback_god_runs_buildscope_to_implement`.

**14. Always write `SCOPE-NNN` or `SPEC-NNN`, never a bare number.**
Scopes and specs are numbered by two separate counters that overlap (SCOPE-047 is stack-style; SPEC-047
is the WinDev site integration). Every mention carries its prefix. Fence labels follow the SPEC folder.
Source: `CLAUDE.md`.

**15. Use the orchestrator; ask before going around it.**
Spec edits, code changes, and release actions belong in the `wxkanban-agent` workflow, which leaves an
audit trail. The CLI's startup is currently broken in this repo, so in practice Claude works in the
conversation and asks before making direct edits that would normally go through the kit. Source:
`CLAUDE.md`, memory `feedback_use_orchestrator`, `feedback_orchestrator_cli_broken`.

**16. Code fences are written by the orchestrator only.**
Every top-level code unit is wrapped in a `// [SCOPE NNN / Tnnn] BEGIN … END` fence naming the spec
and task that wrote it. Claude never hand-writes or hand-edits a fence. `auditfences` checks them
before a push. Source: `CLAUDE.md` (spec 026).

### Building

**17. Search before you suggest.**
Before proposing any feature, endpoint, table, or change, Claude searches the codebase for something
that already does it or gives a foundation. This prevents duplicate features and redundant work.
Source: `CLAUDE.md`, `_wxAI/rules/search-before-suggest.md`.

**18. Write the smallest complete change (Minimal Code, KISS).**
Claude takes the first option that fully works: don't build it, reuse what exists, use the standard
library, use an installed dependency, write one line, and only then write new code. There are no
"for later" abstractions or options, but nothing the task needs is skipped (callers, tests, fixtures).
Validation, data-loss protection, security, and accessibility are never cut. Every reply ends with a
"What I skipped" line. Your words: "use KISS and you will never go wrong." Source:
`_wxAI/rules/minimal-code.md`, memory `feedback_kiss_default`.

**19. Answer a question before writing any code.**
When you ask a question, Claude answers it. It may investigate and read files, but it doesn't change
code until you say "do it", "fix it", or "implement it". Source: `_wxAI/rules/constitution.md` §II.

**20. Endpoint-test every fix and feature.**
A green build and green unit tests aren't proof. Every new or changed route gets a test that calls the
real endpoint and checks the response. Origin: a dashboard shipped with two fatal bugs that 734 passing
tests never reached. Source: memory `feedback_endpoint_test_every_feature`.

**21. Wire the entrance: a person must be able to reach and use it.**
"It compiles" isn't "it works". Every feature needs a way in (a nav link), a way out (back), sensible
defaults, and complete behavior end to end, checked in the built bundle. Origin: one invitations page
needed four user-reported fixes that no automated check could see. Your words: "if I can't get to it,
it can't be used." Source: memory `feedback_wire_the_entrance`.

**22. If a library seems broken, assume you are using it wrong.**
Claude reads the official docs (Ref MCP) and looks for several independent bug reports before blaming
a library. Source: `_wxAI/rules/constitution.md` §II.

**23. New code is guilty until proven innocent.**
When something breaks, Claude checks the most recent changes first and trusts code that has been
stable for weeks. Then it reproduces, isolates, finds the root cause, fixes it, and adds a test.
Source: `_wxAI/rules/constitution.md` §IX.

**24. TypeScript with no `any` or `@ts-ignore`; Pino, never `console.log`.**
All code is fully typed, and all logging is structured Pino logging. The pre-commit hook checks for
`: any` and `as any`. Source: `CLAUDE.md`, `_wxAI/rules/constitution.md` §III–IV.

**25. Database names are lowercase with no underscores; schema changes are applied by hand.**
Tables are plural and concatenated (`timeentries`), keys are UUID v7 `id`, foreign keys are
`<parent>id`. There's no migration ledger: schema changes are written as reviewed SQL, applied by
hand, checked with `npm run db:drift`, and logged. `drizzle-kit push` is forbidden, because the local
`.env` points at production and it would drop live tables. Source: `CLAUDE.md`.

**26. Every screen works in dark and light mode.**
Every color class has a paired `dark:` variant. A light-only color is a critical error. Source:
`_wxAI/rules/constitution.md` §XII.

**27. No toast messages.**
Feedback is shown in context, next to what the user did. The one exception is "copied to clipboard".
Toasts found in a file being edited are migrated. Source: `_wxAI/rules/constitution.md` §VIII.

**28. Use shadcn components through the shadcn MCP.**
For React and Tailwind work, Claude uses shadcn components and whole blocks where they fit, and checks
the component's demo before using it. Source: `_wxAI/rules/shadcn.md`.

**29. A new command isn't done until it shows in the Dev Cockpit.**
A new kit command has to appear in the Cockpit Help panel under **Standard**, not only work as a slash
command, because the Cockpit is how users discover what the kit can do. Source: memory
`feedback_new_command_must_surface_in_cockpit`.

**30. No backward compatibility in early development.**
Replace completely, delete deprecated code, add no compatibility layers. Breaking changes beat
technical debt. Source: `_wxAI/rules/constitution.md` §VII.

**31. In this repo, use the direct database connection, not the MCP.**
This repo is wxKanban itself, so its own data work goes through `src/db/client.ts`, the app services,
or one-off scripts. The MCP server is the kit's remote interface for customers, and it runs here only
to test the kit. Source: memory `feedback_dogfood_the_kit`.

**32. The kit is the workflow engine; the editor AI does the writing.**
In VS Code, the kit validates, writes, fences, and audits, and never calls an AI itself. The user's
editor AI (Claude, Cursor, and so on) writes the content. Only the wxKanban web editor uses the kit's
own AI. Source: memory `feedback_kit_is_workflow_not_ai`.

**33. Server writes to the database; the kit pulls files down.**
The server runs in the cloud and can't see a user's laptop, so server content lands locally by the kit
pulling it on workspace open. The kit checks a hash first and offers Pull / Keep local / View diff,
never a silent overwrite. Source: memory `feedback_cross_host_file_writes`.

**34. Load the compliance context before scoping, specifying, or implementing.**
Before `buildscope`, `createSpecs`, or `implement`, Claude asks the MCP which compliance frameworks
(SOC 2 and others) are active and loads their rules. They live in the database, never as local files.
Source: `_wxAI/rules/compliance-context.md`.

### Cost and context

**35. Pick a model for every subagent by difficulty.**
Each subagent's task is classified with `_wxAI/routing/difficulty.mjs` (easy, moderate, heavy) and
given a model from `_wxAI/routing/tiers.mjs` (by default Haiku, Sonnet, Opus). Only heavy work runs on
the session model. The plan shows each agent's class and model before launch. Origin: one build ran 10
agents on Opus, about 20% of a week's usage. Decision D-0001: "choose cheaper models whenever a task
allows." Source: `CLAUDE.md`, memory `feedback_set_model_per_subagent`.

**36. Suggest token savings; never apply them on your own.**
When Claude spots a concrete saving (a scope that already exists, a document a script can generate,
an oversized context, repeated cold runs), it says so with an estimate and offers apply / skip /
silence-for-session. With no answer, nothing happens. Source: `CLAUDE.md`,
`_wxAI/rules/token-advisor.md` (SCOPE-093).

**37. Suggest `/clear` after each finished task, or at about 80% context.**
Every reply re-sends the whole conversation, and long sessions were about 74% of usage. When a task
finishes, Claude saves the state to memory and spec files first, then suggests `/clear`. Never in the
middle of a task, and never while a background agent is still due to report. Source: memory
`feedback_clear_at_80_percent_context`.

**38. G.O.D. estimates time, never money.**
G.O.D. gives AI-agent time to completion only. Build cost is set per project, outside the method.
Hosting cost is a separate thing and stays in. Source: memory `feedback_god_time_not_money`.

### Communication

**39. Every explanation uses the plain-KISS method.**
When you ask Claude to explain something: what it's for first, a real person in a real situation,
plain words and short sentences, a small table for any list, the name of the underlying pattern, and
end with the decision you need to make. Source: memory `feedback_explain_plain_kiss_method`.

**40. Give full absolute paths.**
When Claude says where something is, it gives the path from the drive root
(`e:\AI_Development\wxperts\wxKanban\...`). The repo has two migration folders, so a relative path is
easy to misread. Source: memory `feedback_full_paths`.

**41. Status documents: table first, open items second, detail last.**
Any long-running status or progress doc opens with a header and a status table, then "open: needs your
decision", then key numbers, then detail. No walls of long prose lines. Source: memory
`feedback_ledger_readability`.

**42. "HANDOFF REMOTE" is a command, not a task.**
"HANDOFF REMOTE" (any casing) or `/remote` hands where the work stands to the repo's Project Agent, so
the developer can carry on from the phone. Claude writes a summary (names and counts only, never file
contents or secrets) and runs the handoff writer, then reports its one output line. It launches nothing
and never posts to the room itself: the already-connected Project Agent posts it. Source: `CLAUDE.md`,
`_wxAI/rules/remote.md` (SCOPE-149).

**43. Critical thinking is the real job; teach it, don't replace it.**
Tools change every few years; reasoning through a broken system doesn't. Customer-facing kit content
leads with how professionals think about a problem, not with steps to follow, and avoids ceremony that
replaces judgment. Source: memory `feedback_core_philosophy`.

---

## Changing a rule

- **Always-on rules:** edit `CLAUDE.md`. Keep it short and free of dates so it stays cacheable.
- **Detailed rules:** edit the file in `_wxAI/rules/`. These ship to customer projects with the kit.
- **Personal working rules:** tell Claude "remember…" or "from now on…", and it updates its memory.
  To drop one, say so and it deletes the memory file.
