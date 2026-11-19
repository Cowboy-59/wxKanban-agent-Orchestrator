---
id: glossary
part: appendix
audience: customer
sources: CONTEXT.md, gettingStartedInstructions.md, CLAUDE.md, docs-workspace/commands.json, mcp-server/src/prompts/wxgod/references/new-project.md, vscode-extension/src/providers/cockpitTreeProvider.ts, vscode-extension/src/services/healthCheck.ts, docs-workspace/sections/help.md, docs-workspace/sections/team.md, docs-workspace/sections/projects.md, docs-workspace/sections/testing-user.md
---

# Glossary

These are the words you meet most often in wxKanban. Each one links to the section that explains it best.

**Change Impact** — Everything a change reaches: other code, other scopes, shared database tables, and human test sign-offs. Each link is labeled with how sure the kit is, and you see it at the moment of change. See [Change Impact](cockpit-change-impact.md).

**Code fence** — A pair of one-line comments, BEGIN and END, that the kit puts around each piece of code it writes. The fence names the scope and task that produced the code, so every line traces back to its spec. See [Implementation](process-implementation.md).

**Consultant** — A company on the Consultant plan that does scoped work for other companies. Its members see only the projects and work assigned to them, and they do not count against the client's seats. See [Team Members](team.md).

**Dev Cockpit** — The wxKanban sidebar in VS Code. It shows your project's remaining work by scope, with the active scope pinned first, plus System Health, kit updates, feedback, and help. See [The Dev Cockpit](part-dev-cockpit.md).

**Engagement** — The working relationship between a client company and a consulting company. It can be active, paused, disabled, or ended, and it controls what the consultants can see. See [Team Members](team.md).

**Feedback report** — A bug report or a suggestion you send from VS Code with **wxKanban: Report a Bug / Suggest a Feature**. You follow it, and answer the team's questions about it, in **My Feedback**. See [Feedback](cockpit-feedback.md).

**Forced test** — A test whose force-test setting is on. An administrator sets it for a scope and can change it for a single test. The project-wide release check waits on every forced test, machine or human, anywhere in the project. A scope's own stages wait on every test the scope owns, forced or not. See [Release](process-release.md).

**Human test** — A test a person runs by hand in the web app, such as checking that a screen does what the spec says. It counts only when a tester signs it off. See [User tests](testing-user.md).

**Kit** — The commands, scripts, and orchestrator that wxKanban generates for one project. You download it from the project's **KIT** link in the web app and unzip it into your project folder. Every project needs its own kit. See [Getting Started](getting-started.md).

**Machine test** — A test the computer runs and checks by itself, with no person involved. A scope cannot leave QA while any of its machine tests is unsigned or failing. See [Automated tests (QA)](testing-qa.md).

**Manual** — This book. It covers the web app, the Dev Cockpit, the process from scope to release, and every command the kit ships. It is separate from the short Help cards in the app and from the videos on the Help & Tutorials page. See [Where to get help](get-help.md).

**MCP** — The connection between your AI assistant and wxKanban. Through it, the AI reads and updates your project: its scopes, specs, tasks, and tests. The Cockpit's **MCP connection** line shows whether it is working. MCP stands for Model Context Protocol. See [System Health](cockpit-system-health.md).

**Nightly run** — A test run that happens overnight, with nobody watching, against a test copy of your app and never production. It tests what the day's changes reached first, and you read its morning summary in the Cockpit. You set it up with [`/preTest`](cmd-pretest.md). See [QA](process-qa.md).

**Orchestrator** — The part of the kit that runs your commands in the right order and enforces the stage rules. In the Cockpit, **Orchestrator: linked** means your folder is connected to your wxKanban project. See [How the process works](process-overview.md).

**Plan (subscription)** — Your company's wxKanban subscription: Single User, Small/Medium Business, Consultant, or Enterprise. Your plan decides which features you can use. See [Help & plan features](help.md).

**Project Overview** — The document that describes your project as a whole: what it is and what it is for. You can draft it in the web app with help from an AI interview, and the planning commands read it as background. See [Projects](projects.md).

**Released test** — A human test your testers can open. A scope's human tests are released when the scope enters Human Testing, which happens once its machine tests pass. Until then, testers see "Not ready for you yet". See [User tests](testing-user.md).

**Scope** — A Scope of Project document that describes one feature: what it must do and why. You write it with [`/buildscope`](cmd-buildscope.md). Nothing gets built until it is scoped. See [Scopes and specs](process-scopes-specs.md).

**SCOPE-NNN and SPEC-NNN** — Two separate number series. SCOPE-NNN names a scope, and SPEC-NNN names a spec built from a scope. A large scope can split into several specs, each taking the next spec number, so SCOPE-047 and SPEC-047 can be two unrelated things. Always write the prefix. See [Scopes and specs](process-scopes-specs.md).

**Sign-off** — The record that a test passed for one version. A human test's sign-off is always a person's, in their name. The AI never signs off a human test. See [User tests](testing-user.md).

**Smoke test** — The first of the three gates when a scope's test plan runs: every part responds without crashing, and nothing is written. You run the plan with [`/wxCreateTestPlan`](cmd-wxcreatetestplan.md) and its `--Execute` option, and the run stops after each gate. `/preTest` runs the same gate for one scope. See [QA](process-qa.md).

**Spec** — The implementation specification built from a scope by [`/createSpecs`](cmd-createspecs.md), with its plan and task list. If something is not in the spec, add it to the spec before you build it. See [Scopes and specs](process-scopes-specs.md).

**Stack & Style** — Your project's chosen technology stack and look and feel. The kit feeds it into generated scopes, specs, and code so they match your stack. You set it when you create a project and change it later with [`/buildstack`](cmd-buildstack.md). See [Stack Profiles](stack-profiles.md).

**Stage** — One of the six steps every scope goes through: Design, Implementation, QA, Human Testing, Beta, and Release. Each scope moves to its next stage on its own as soon as the stage it is in is clear. See [How the process works](process-overview.md).

**Stage gate** — The check that keeps a scope in its stage until that stage's conditions are met, such as every task complete and every test passed. Whatever stops the gate from clearing is a blocker. See [How the process works](process-overview.md).

**Task** — One unit of work inside a spec, with a status, an assignee, and optional time tracking. Tasks can also come from a connected tool such as Jira, Monday.com, Asana, or Trello. See [My Tasks](tasks.md).

**Test plan** — The list of a scope's tests, both machine and human, filed by `/wxCreateTestPlan`. [`/implement`](cmd-implement.md) files it for you when a scope's tasks are done. See [QA](process-qa.md).

**UAT** — User acceptance testing: people checking that the work does what its users need. In wxKanban this is the Human Testing stage. A test version marked **In UAT** is the one your testers are working on. See [Human Testing](process-human-testing.md).

**Version (of the tests)** — The version of your application that a round of testing belongs to. Every test run, result, and sign-off is recorded against one version, and a new version starts a new round on its own. Machine tests are run again for every version. A tester's sign-off carries forward to the next version, unless the change reaches the code that test covers; then the test is marked "Please test this again". The QA view shows each version's state: **In build**, **In UAT**, **In production**, or **Superseded**. See [Automated tests (QA)](testing-qa.md).
