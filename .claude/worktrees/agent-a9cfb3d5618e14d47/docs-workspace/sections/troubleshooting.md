---
id: troubleshooting
part: appendix
audience: customer
sources: gettingStartedInstructions.md, vscode-extension/src/services/healthCheck.ts, vscode-extension/src/services/kitUpdate.ts, vscode-extension/src/providers/cockpitTreeProvider.ts, vscode-extension/package.json, mcp-server/src/prompts/wxgod/references/new-project.md, docs-workspace/commands.json, wxkanban-agent/core/orchestrator/workflow-engine.ts
---

# Troubleshooting

Find what you see on your screen, then follow the fix. Each entry gives the cause, the fix, and where to read more. If none of these match, see [Where to get help](get-help.md).

## `claude` command not found

**What you see:** you type `claude` or `claude --version` in the terminal and get "not recognized" or "command not found".

**Why:** the terminal was opened before Claude Code was installed, so it does not know the new command yet. On Windows, it can also mean you ran the Mac install command instead of the PowerShell one.

**Fix:**

1. Close the terminal and open a new one. If that does not help, close and reopen VS Code.
2. On Windows, make sure you ran the PowerShell install (`irm https://claude.ai/install.ps1 | iex`), not the Mac one.
3. Run `claude --version` again to check.

**See also:** [Getting Started](getting-started.md), step 3.

## Claude Code panel not showing

**What you see:** there is no **Claude** icon at the top right of VS Code, or the chat panel does not open.

**Why:** the panel can stay hidden until a file is open, and older versions of VS Code may not show it.

**Fix:**

1. Open a file, not just the folder.
2. Update VS Code to the latest version.
3. Or open the Command Palette (`Ctrl+Shift+P`, Mac: `Cmd+Shift+P`) and run **Claude Code: Open**.

**See also:** [Getting Started](getting-started.md), step 3.

## MCP won't connect, or the MCP light is red

**What you see:** in the Cockpit, **System Health** shows **offline** or **degraded** and opens by itself. The **MCP connection** line has a red icon and reads **unreachable**, with a reason. Or your AI assistant cannot reach wxKanban after a restart.

**Why:** the MCP is the connection between your AI assistant and wxKanban. "timeout" means the hosted service did not answer within 5 seconds. "HTTP" and a number means it answered with an error. Any other text is a network error. If **Orchestrator** reads **not linked**, the folder you opened is not linked to a project at all. If **Database** reads **down**, the hosted service is up but its database is not.

**Fix:**

1. Check your network connection.
2. If **Orchestrator** reads **not linked**, open the folder that holds `.wxkanban-project.json`, not a parent or child folder.
3. Run **wxKanban: Refresh Cockpit** from the Command Palette, or click **Retry** on the warning.
4. If your AI assistant still cannot connect after a restart, re-run `node scripts/init.mjs` in the terminal from your project folder. Then restart VS Code, open Claude Code's list of MCP servers, and approve **wxkanban** again.
5. If **Database** reads **down**, there is nothing to fix on your machine. Wait a few minutes and refresh. If it stays down, ask for help.

**See also:** [System Health](cockpit-system-health.md).

## Cockpit sidebar is empty

**What you see:** the wxKanban sidebar shows no scopes. Instead you may see one of these rows:

| Row | Cause | Fix |
| --- | --- | --- |
| **No wxKanban project linked** | The open folder has no `.wxkanban-project.json`. | Open the folder you unzipped the kit into, then refresh. |
| **Sign in to wxKanban** | No API token is stored for this project. | Click the row, or run **wxKanban: Sign In / Relink Project**, and enter your token. The token comes from the project's **Kit** tab in the web app; see [Getting Started](getting-started.md), section 5. |
| **Cannot reach wxKanban — click to retry** | The Cockpit could not load your project. | Click the row to retry. If it keeps failing, see the MCP entry above. |
| **No kit installed — Install** | The folder has no kit. | Click the row to connect the folder to a project, download the kit, and run its setup. |
| **All caught up — no remaining work** | Nothing is wrong. Every task in the project is complete. | Nothing to do. |

**Fix, in order:**

1. Make sure `.wxkanban-project.json` is in the folder you opened.
2. Run **wxKanban: Sign In / Relink Project** from the Command Palette.
3. Run [**wxKanban: Refresh Cockpit**](cmd-cockpit-wxkanbancockpitrefresh.md).

**See also:** [Installing and linking the Cockpit](cockpit-install.md) and [The Cockpit at a glance](cockpit-at-a-glance.md).

## Kit tasks don't run when the folder opens

**What you see:** the kit does not update itself or start the orchestrator when you open the project folder.

**Why:** VS Code asks before it runs tasks on folder open. If you clicked anything other than **Allow**, or never saw the prompt, the tasks stay off.

**Fix:** open the Command Palette and run **Tasks: Manage Automatic Tasks in Folder**, then choose **Allow Automatic Tasks in Folder**. Close and reopen the folder. Or run the kit setup by hand: `node scripts/init.mjs` in the terminal, from your project folder.

**See also:** [Getting Started](getting-started.md), step 6.

## PowerShell vs CMD confusion

**What you see:** an install command fails with a syntax error, or a command that worked for someone else does nothing for you. This happens on Windows.

**Why:** Windows has two different command shells, PowerShell and CMD, and they use different syntax. The `irm ... | iex` install command only works in PowerShell.

**Fix:**

1. Look at the prompt. If it starts with `PS`, as in `PS C:\>`, you are in PowerShell. If it shows only `C:\>`, you are in CMD.
2. Use the PowerShell commands from this Manual in PowerShell. In VS Code, the terminal opens in PowerShell by default.
3. Never mix PowerShell and CMD syntax in one command.

**See also:** [Getting Started](getting-started.md), steps 2 and 3.

## Kit update failed, or keeps saying waiting

**What you see:** one of these rows at the top of the Cockpit.

**Kit update waiting — Install**, with "held back: uncommitted changes in the working tree".

- **Why:** a newer kit is ready, but you have changes that are not committed yet. The update overwrites files in your folder, so the Cockpit will not start it on its own.
- **Fix:** commit or stash your changes, then click the row. You can also click it right away and confirm in the terminal, but commit first if you can.

**Kit update check failed**, with a reason.

- **Why:** the kit could not check for a newer release. This is not the same as being up to date. Your kit version is unknown.
- **Fix:** click the row, or run [**wxKanban: Re-run the Kit Version Check**](cmd-cockpit-wxkanbancockpitrecheckkit.md). The check runs in a terminal where you can read any error. Check your network if the error is a connection problem.

**The update started but failed in the terminal.**

- **Why:** the update runs in a terminal named **wxKanban Kit Upgrade**, and the error is shown there.
- **Fix:** read the error, fix its cause (often the network), then run [**wxKanban: Install Kit Update**](cmd-cockpit-wxkanbancockpitupgradekit.md) again.

**See also:** [Kit updates](cockpit-kit-updates.md).

## My scope is stuck in a stage

**What you see:** a scope stays in the same stage for a long time, even though the work seems done.

**Why:** scopes move to the next stage on their own, but only when the stage they are in is clear. Nobody presses an Advance button. Something is still blocking the gate. Ask your AI assistant what is blocking the scope. It reads the scope's stage and blockers from wxKanban through the MCP. What each stage needs:

| Stage | What it needs before the scope moves on |
| --- | --- |
| **Implementation** | The scope has tasks, and none is open. |
| **QA** | No open tasks, at least one machine test, and none of the scope's machine tests unsigned or failing. |
| **Human Testing** | No open tasks, and a tester's sign-off on every released human test. |
| **Beta** | No open tasks, and every test the scope owns is clear. |
| **Release** | Nothing. Release is the final stage, and a scope never leaves it. The separate release check, before you deploy, needs every earlier stage complete and every forced test clear across the project; see [Release](process-release.md). |

**Fix, for the most common blockers:**

- **A scope with no machine tests stays in QA.** Its test plan was probably never filed. [`/implement`](cmd-implement.md) files it when the scope's tasks are done. If it is missing, run [`/wxCreateTestPlan`](cmd-wxcreatetestplan.md) for the scope.
- **A machine test has not been proven yet.** Each machine test needs a passing run, which records its sign-off. Run [`/wxCreateTestPlan`](cmd-wxcreatetestplan.md) `SCOPE-NNN --Execute`, or let the nightly run do it (set up with [`/preTest`](cmd-pretest.md) `--nightly`). Either one is enough.
- **A test failed on its last run.** A failing test holds the scope until a run passes it. Fix the cause, then run the plan again.
- **The data tests did not run.** If no database proven not to be production was available, the create, read, update and delete gate is reported as blocked and its tests stay unproven. Accept the disposable database that `/wxCreateTestPlan` offers, then run it again.
- **Smoke tests fail.** Run [`/autofix-tests`](cmd-autofixtests.md). It confirms each fix with you. Then run the smoke test again.
- **Human tests need a person's sign-off.** Your testers run them and sign them off in the web app. The AI never signs off a human test, so this stage waits for people.
- **A fix is needed in Beta.** [`/implement`](cmd-implement.md) does not run on a scope in Beta or Release. Make the fix as a new scope with [`/buildscope`](cmd-buildscope.md); the new scope travels the normal road. See [Beta](process-beta.md).

**See also:** [When things go wrong](process-when-things-go-wrong.md), [QA](process-qa.md), and [User tests](testing-user.md).

## A scope disappeared from the Cockpit

**What you see:** a scope you are still working on is no longer listed under **N Scopes unfinished**, or the Cockpit says **All caught up — no remaining work**, but the scope has not reached Release.

**Why:** the Cockpit lists only scopes that still have incomplete tasks, and it shows a scope's status, not its stage. A scope whose tasks are all done can still be waiting in QA or Human Testing for its tests or sign-offs. With no open tasks, it drops out of the list.

**Fix:** ask your AI for the scope's stage. It reports the stage, what would advance the scope, and what is blocking it. You can also check the scope in the web app.

**See also:** [Scopes](cockpit-scopes.md) and [When something goes wrong](process-when-things-go-wrong.md).

## A command says "No handler registered"

**What you see:** you run a command from the kit's terminal tool and get "No handler registered for command" followed by the command's name.

**Why:** that command is not part of the current kit. A few older commands are still listed by the kit's terminal tool, but nothing runs them. Their work is now done other ways: QA tests come from `/wxCreateTestPlan`, human tests are signed off in the web app, and scopes move through Beta and Release on their own.

**Fix:** do not run that command again. Look up what runs today in the Command Reference: [Commands by stage](commands-by-stage.md) or [Commands A to Z](commands-a-z.md).

**See also:** [How the process works](process-overview.md).
