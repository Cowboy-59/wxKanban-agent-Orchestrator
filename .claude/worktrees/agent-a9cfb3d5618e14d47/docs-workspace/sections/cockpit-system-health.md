---
id: cockpit-system-health
part: dev-cockpit
audience: customer
sources: vscode-extension/src/providers/cockpitTreeProvider.ts, vscode-extension/src/services/healthCheck.ts, vscode-extension/src/services/projectContext.ts, vscode-extension/src/services/nightlySummary.ts, vscode-extension/src/extension.ts, gettingStartedInstructions.md, _wxAI/skills/wxPreTest/SKILL.md
---

# System Health

**System Health** is the first row in the Cockpit. It answers two questions: is this folder linked to your wxKanban project, and can the kit reach the hosted wxKanban service? The check needs no sign-in, so it works even before you enter a token. It runs when VS Code opens the project and on every refresh.

The header rolls the checks into one verdict:

| Header | Meaning |
| --- | --- |
| **System Health — OK** | Everything answered. Shows the service version, or "connected". Stays collapsed. |
| **System Health — degraded** | The service answered, but reports that its database is down. Opens by itself and shows "action needed". |
| **System Health — offline** | The service did not answer. Opens by itself and shows "action needed". |

When the result is degraded or offline at startup, VS Code also shows a warning with a **Retry** button. The header is hidden when no project is linked, because the tree already says **No wxKanban project linked**.

## Orchestrator

- **linked**: the open folder has a valid `.wxkanban-project.json`, with a well-formed project ID. Your folder is wired to your wxKanban project.
- **not linked**: no valid project file was found.

**Fix:** open the folder that holds `.wxkanban-project.json`, not a parent or child folder. If the file is missing, get a fresh kit for this project. See [Installing and linking the Cockpit](cockpit-install.md).

## MCP connection

- **reachable**, with the version, for example "reachable · v1.2.3": the hosted service answered its health check. Hover the line to see the address it checked.
- **unreachable**, with a reason: "timeout" means no answer within 5 seconds. "HTTP" and a number means the service answered with an error. Any other text is the network error.

While it is unreachable, kit commands and the Cockpit cannot sync.

**Fix:**

1. Check your network connection.
2. Check the `mcpBaseUrl` value in `.wxkanban-project.json`, if your file has one. The tooltip shows the address being used.
3. Click **Retry** on the warning, or run **wxKanban: Refresh Cockpit**.
4. If Claude Code still cannot connect after a restart, re-run the kit setup with `node scripts/init.mjs`, restart VS Code, and approve **wxkanban** again. See [Troubleshooting](troubleshooting.md).

## Database

This line appears only when the MCP connection is reachable.

- **connected**: the hosted service reports that its database is up.
- **down**: the service reports its database is down. Writes will fail until it recovers.
- **unknown**: the service did not report its database state.

**Fix:** there is nothing to fix on your machine. Wait and refresh. If it stays down, ask for help. See [Where to get help](get-help.md).

## The nightly morning summary

If your project runs nightly tests ([`/preTest`](cmd-pretest.md) with `--nightly`), the last run's summary appears as a card just below System Health. The title gives the result, such as **Nightly run — 42 passed, 2 failed**. The description is the time the run finished. Click the title to open the full morning summary.

The card stays collapsed when everything passed. It opens by itself on a warning or a failure. Expand it to see these lines:

| Line | What it tells you | What to do when it is not OK |
| --- | --- | --- |
| **Results** | Passed, failed, flaky, and not run, out of the total | Read the **Failed** lines |
| **Failed: item** | One failed item, with its task when one was created | Open the task and fix the cause |
| **Flaky** | Items that failed once, then passed on a re-run | Look for timing or test data problems |
| **Permission check** | Whether every sampled admin page refused a normal user | A **FAILED** line names the pages a normal user could reach. Fix their access rules |
| **Setup problem** | The run could not be set up as configured | Correct the nightly configuration |
| **Observations** | New and open findings that are not pass or fail | Review them when you have time |
| **Coverage**, **Time**, **Cleanup** | How much was tested this cycle, how long it took, and what test data was removed | A cleanup warning means test data was meant to be removed but was not |
| **Evidence** | Compliance evidence written after a fully green run, or why there is none | Nothing, unless you expected evidence |
| **Not tested** | What this run did not cover | Decide whether it needs a manual check |

**Nightly run — refused** means the run stopped before touching anything, because the app or database address was on the production list or not on the UAT list. Nightly runs never touch production. Correct the addresses in the nightly configuration. **Nightly run — summary unreadable** means the summary file could not be read, so the card has no lines. The next nightly run writes a new summary.
