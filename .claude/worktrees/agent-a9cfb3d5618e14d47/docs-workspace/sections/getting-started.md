---
id: getting-started
part: getting-started
audience: customer
sources: gettingStartedInstructions.md
---

# Getting Started

This guide takes you from a new computer to a working wxKanban setup inside VS Code, even if you have never installed a developer tool before. Follow it from top to bottom. Each step tells you *why* it exists, not just *what to click*, so you build the habit and not just the setup.

> **Time needed:** about 30 to 45 minutes the first time.
> **You do not need to be a programmer to finish this.** You need to be able to follow steps and copy and paste a few commands.

---

## 1. What is wxKanban, and why these tools?

wxKanban is not a "click a button and get an app" generator. It is an **orchestration kit** that walks your project through a disciplined **6-phase lifecycle**: Design, Implementation, QA, Human Testing, Beta, and Release. It only lets you take the *right* action at the *right* time. Specs get followed. Tests do not get skipped. Releases do not happen without QA. And there is always one source of truth for exactly where your project stands.

The goal is not to hand you code. It is to build your **judgment**, so you learn *how* to ship tested, audited software on a repeatable process.

Four tools work together to do that:

| Tool | Role | Think of it as |
| --- | --- | --- |
| **VS Code** | The editor where all your work happens | Your workshop |
| **Claude Code** *(or your preferred AI development agent)* | The AI assistant that lives inside VS Code | Your AI dev agent |
| **wxKanban Dev Cockpit** | A sidebar that shows what is built and what is next | Your dashboard |
| **wxKanban hosted service** | The service that enforces the lifecycle and stores your project | Your project's memory |

You install all four below.

---

## 2. Install the prerequisites

Install these three first. On Windows, do each install, then **close and reopen** VS Code and your terminal so they pick up the changes.

### 2a. Node.js 20 LTS

wxKanban runs on Node.js. Get the **LTS** version (20 or newer).

- Download: **https://nodejs.org**, then click the **LTS** button.
- Accept all defaults in the installer.
- **Check it:** open a terminal (see below) and run:
  ```
  node --version
  ```
  You should see something like `v20.x.x`.

### 2b. Git

Git tracks changes to your project and lets Claude Code run scripts properly.

- **Windows:** https://git-scm.com/downloads/win (accept the defaults).
- **Mac:** run `git --version` in Terminal. If Git is missing, macOS offers to install it.

> **Why it matters on Windows:** without Git installed, Claude Code falls back to PowerShell, and some scripts behave differently.

### 2c. Visual Studio Code

This is the editor everything runs inside.

- Download: **https://code.visualstudio.com** and install it for your operating system.
- In the Windows installer, check the **"Add to PATH"** and **"Open with Code"** options if they are offered.

**Opening a terminal inside VS Code:** press `` Ctrl+` `` (the backtick key, top left of your keyboard). On a Mac, press `` Cmd+` ``. On Windows this opens a **PowerShell** terminal by default. You type commands here.

---

## 3. Install Claude Code (if you use it, or want to)

This is the piece to get right. Claude Code is how you actually *do* the work.

### 3a. Install the VS Code extension

1. In VS Code, open the Extensions panel: `Ctrl+Shift+X` (Mac: `Cmd+Shift+X`).
2. Search for **Claude Code**.
3. Install the one published by **Anthropic** (id: `anthropic.claude-code`).
4. Restart VS Code if it asks.

### 3b. Install the Claude Code command-line tool

The extension's chat panel works on its own, but the wxKanban kit also needs the `claude` command in the terminal.

In the VS Code terminal:

- **Windows (PowerShell):**
  ```
  irm https://claude.ai/install.ps1 | iex
  ```
- **Mac or Linux:**
  ```
  curl -fsSL https://claude.ai/install.sh | bash
  ```

Then **close and reopen** the terminal and check it:

```
claude --version
```

### 3c. Sign in

Run `claude` in the terminal (or click the **Claude** icon at the top right of VS Code) and choose one:

- **Claude Pro or Max subscription** (easiest for individuals). A browser opens; sign in with your Claude.ai account.
- **Anthropic API key** (for teams or billing control). Create one at https://console.anthropic.com and paste it when asked.

Your login is saved securely. You only do this once.

---

## 4. Recommended VS Code extensions

Beyond Claude Code, these are the extensions we use day to day. To install one, search for its **id** in the Extensions panel (`Ctrl+Shift+X`). The **top two are required** for wxKanban. The rest make daily work easier.

**Required for wxKanban**

| Extension | id | What it does |
| --- | --- | --- |
| Claude Code | `anthropic.claude-code` | The AI assistant (from step 3) |
| wxKanban Dev Cockpit | `wxperts.wxkanban-dev-cockpit` | Your project dashboard. It installs with the kit. |

**Highly recommended for this stack (React, TypeScript, Node, Postgres)**

| Extension | id | What it does |
| --- | --- | --- |
| ESLint | `dbaeumer.vscode-eslint` | Flags code problems as you type |
| Prettier ESLint | `rvest.vs-code-prettier-eslint` | Formats your code when you save |
| ES7+ React snippets | `rodrigovallades.es7-react-js-snippets` | Fast React boilerplate |
| npm Intellisense | `christian-kohler.npm-intellisense` | Completes package imports |
| DotENV | `mikestead.dotenv` | Highlights environment settings files |
| Git Graph | `mhutchie.git-graph` | Shows the history of your commits |
| GitHub Pull Requests | `github.vscode-pull-request-github` | Review and manage pull requests in the editor |
| Code Spell Checker | `streetsidesoftware.code-spell-checker` | Catches typos in code and docs |
| markdownlint | `davidanson.vscode-markdownlint` | Keeps Markdown docs clean |
| Thunder Client | `rangav.vscode-thunder-client` | Test your API endpoints without leaving VS Code |
| Docker | `ms-azuretools.vscode-docker` | Manage containers (for a local Postgres, for example) |
| Python + Pylance | `ms-python.python`, `ms-python.vscode-pylance` | Needed by the conversion commands' Python helpers |
| Markdown PDF | `yzane.markdown-pdf` | Export any Markdown document to PDF |

> **Tip:** when you open your project folder, VS Code also offers the project's own recommended extensions. Click **Install** on that prompt.

---

## 5. Get your wxKanban project

**Sign up first, if you need to.** If your company does not have a wxKanban account yet, click **Register here** on the sign-in page. It opens the sign-up wizard for a new company. If your company already uses wxKanban, do not register again; ask your administrator to invite you. See [Signing in](login.md). The kit, the six-stage process, and the Dev Cockpit are included on every plan, starting with Single User. See [Help & plan features](help.md).

1. Sign in to the **wxKanban web app** (your account URL, for example **wxkanban.com**).
2. **Create a project**, or open the one that was created for you. This registers your project with the hosted service and gives it a unique **Project ID**.
3. In the project, click the **Kit** tab. Only a company administrator, or a user assigned to the project, sees the kit buttons.
4. Click **Generate Kit**. Wait until the status reads **Ready for download**.
5. Click **Download Kit**. wxKanban checks its own prerequisites first, then downloads a **zip file**.
6. **Copy your API token now.** Every download creates a new API token for this project and writes it into the kit, so the kit and the Cockpit normally find it on their own. The **Kit** tab shows the token once:
   - If you generated the kit during this visit, the green message shows the token with a **Copy Token** button.
   - The **Environment Setup** box shows it on the line that starts with `WXKANBAN_API_TOKEN=`.

   The page warns: "Save this token - it won't be shown again!" Keep it somewhere private. You need it if the Cockpit ever asks you to sign in, or if you install the kit from the Cockpit. If you lose it, click **Download Kit** again. Each download creates a fresh token.
7. Create the folder you will develop in, and unzip the file into it. The zip contains:
   - `.wxkanban-project.json`, which holds your Project ID and kit version
   - the kit itself: its commands, scripts, and orchestrator
   - the kit's settings, which hold your API token and the connection between Claude Code and wxKanban

   The Dev Cockpit is not in the zip. The kit setup installs it from the VS Code Marketplace (section 6).
8. In VS Code, choose **File > Open Folder...** and open that project folder.

> The kit is generated **per project**. It is stamped with that project's ID, so a kit downloaded for one project does not work for another. If you create a second project later, generate a new kit for it. Do not copy this folder.

---

## 6. Connect wxKanban to your project

Do these steps in order, in VS Code, with your project folder open.

> **Every project needs its own new kit.** Do not reuse a kit from another project.

### Step 1: Allow the automatic tasks

When the folder opens, VS Code may ask *"This workspace has tasks configured to run on folder open. Allow?"* Click **Allow** (or **Allow and Remember**).

> **On a Mac:** the kit's own Mac notes say VS Code does not start the kit for you there. Skip to Step 3 and run the setup by hand.

### Step 2: Let the kit setup run

Once you allow them, VS Code runs two tasks every time the folder opens:

- **wxKanban Kit — Install & Connect** sets up the kit. In order, it:
  1. installs the kit's dependencies, the first time only (this can take a few minutes);
  2. checks that it can reach the wxKanban hosted service;
  3. checks your API token;
  4. connects Claude Code to wxKanban by registering a server named **wxkanban** (see Step 6);
  5. installs the Change Impact hook (see [Change Impact](cockpit-change-impact.md));
  6. starts the orchestrator;
  7. installs the Dev Cockpit from the VS Code Marketplace;
  8. runs a health check.
- **Check kit version** checks whether a newer kit is available.

The tasks run in their own terminal tabs, which VS Code does not bring to the front unless a task fails. To watch, open the terminal panel (`` Ctrl+` ``) and pick the **wxKanban Kit — Install & Connect** terminal. When the setup worked, its last line reads `[init] ✓ kit ready`. If it ends with "health check failed", read the lines above it for the reason.

If the setup just installed the Cockpit, it tells you to reload the window: open the Command Palette (`Ctrl+Shift+P`, Mac: `Cmd+Shift+P`) and run **Developer: Reload Window**. If VS Code's `code` command is not available, the setup cannot install the Cockpit. It prints the manual steps instead and saves them in a file named `INSTALL-DEV-COCKPIT.txt` in your project folder.

### Step 3: Run the setup by hand, if it did not run

If you never saw the prompt, clicked something other than **Allow**, or are on a Mac, run the same setup yourself. Open the terminal (`` Ctrl+` ``) in your project folder and run:

```
node scripts/init.mjs
```

It does the same work as the automatic task and ends the same way. If it reports missing dependencies, run `npm install`, then run it again. To turn the automatic tasks on later, see [Troubleshooting](troubleshooting.md).

To check the connection at any time, run:

```
npm run kit:health
```

A healthy result ends with **✓ All services healthy.** In the Design stage it can instead end with **✓ Hosted MCP healthy.** and say the orchestrator is not required yet.

### Step 4: Check the Dev Cockpit

The **Dev Cockpit** is the wxKanban sidebar inside VS Code. You open it from the **wxKanban** icon in the activity bar, the column of icons on the far left of the VS Code window. Click the icon and the **Dev Cockpit** view opens. It shows what is built, what is next, and whether your project is connected.

If the Cockpit shows **Sign in to wxKanban**, click it and paste the API token you copied in section 5.

**Check that it is healthy.** The first line at the top of the Cockpit is **System Health**. On a healthy setup it reads **System Health — OK**, with the hosted service's version (or "connected") next to it. Click it to see each check:

| Line | Healthy value | What it means |
| --- | --- | --- |
| **Orchestrator** | linked | Your folder has a valid project file that links it to your wxKanban project |
| **MCP connection** | reachable | VS Code can reach the wxKanban hosted service |
| **Database** | connected | The hosted service reports that its database is up |

**Orchestrator** and **MCP connection** are the two that matter most: both must show their healthy value. When something is wrong, the header changes to **System Health — degraded** or **System Health — offline**, opens by itself, and is colored so you cannot miss it. To learn what each line means and how to fix it, see [System Health](cockpit-system-health.md).

**If the wxKanban icon does not appear:**

1. Open the Extensions panel (`Ctrl+Shift+X`, Mac: `Cmd+Shift+X`).
2. Search for **wxKanban Dev Cockpit** (id: `wxperts.wxkanban-dev-cockpit`) and install it.
3. Restart VS Code if it asks.
4. If the icon appears but the Cockpit is empty, make sure you opened the folder that holds `.wxkanban-project.json` (section 5). Then open the Command Palette (`Ctrl+Shift+P`, Mac: `Cmd+Shift+P`) and run **wxKanban: Sign In / Relink Project**, then **wxKanban: Refresh Cockpit**.

For a full tour of the sidebar, see [The Dev Cockpit](part-dev-cockpit.md).

### Step 5: Install the slash commands

The kit's slash commands, such as [`/buildscope`](cmd-buildscope.md), must be copied into Claude Code's command folder before Claude Code can run them. The Cockpit does this for you with one click.

When commands are missing, the Cockpit shows the message "N wxKanban slash commands aren't installed for Claude Code." (N is the number missing) with an **Install** button, and a row near the top of the sidebar: **Install wxKanban slash commands**, "N not installed — click to install".

1. Click **Install** on the message, or click the row. You can also run **wxKanban: Install Slash Commands (.claude/commands)** from the Command Palette.
2. The Cockpit reports how many commands it installed and updated.
3. Reload VS Code: run **Developer: Reload Window** from the Command Palette.

**When it worked:** the row is gone from the Cockpit, and running the install command again says the slash commands are already up to date. After a kit update the row can come back as **Update wxKanban slash commands**; click it the same way. See [Installing and linking the Cockpit](cockpit-install.md).

### Step 6: Approve the wxkanban server in Claude Code

The kit setup (Step 2) registers wxKanban with Claude Code as a project server named **wxkanban**. Claude Code connects to servers only when it starts, and asks you once before it uses a project's server.

1. Close and reopen VS Code after the kit setup has run.
2. Open Claude Code. When it asks about the **wxkanban** server, approve it.
3. If you missed the prompt, open Claude Code's list of MCP servers and approve **wxkanban** there. You only approve it once.

**When it worked:** [`/buildscope`](cmd-buildscope.md) starts its interview. If the server is not connected, the kit's commands tell you the wxKanban connection is not set up in your AI client. Run `node scripts/init.mjs`, restart VS Code, and approve **wxkanban** again.

The Cockpit's **MCP connection** line checks that VS Code can reach the hosted service. It does not tell you whether Claude Code has approved the server, so check both.

You are set up.

### Running terminal commands

A few commands run in the terminal instead of in Claude Code. In the [Command Reference](part-command-reference.md) their page says **Terminal (wxkanban-agent)**, for example `wxkanban-agent kit:status`. Run them from your project folder through the launcher in the kit's `bin` folder:

- **Windows (PowerShell):** `.\bin\wxkanban-agent.cmd kit:status`
- **Mac or Linux:** `bin/wxkanban-agent kit:status`

To list the terminal commands for your project's current stage, run the launcher with `--help`.

---

## 7. Your first workflow

Open Claude Code and describe what you want **in plain language**. The kit handles the specs, tasks, code fencing, and audit trail. Keep the **Dev Cockpit** open while you work. It shows the remaining work for each scope and updates as work gets built.

1. **Design first.** Before any code is written, you define a *scope*. In Claude Code, run [`/buildscope`](cmd-buildscope.md). It interviews you section by section, and you approve each section, to produce a Scope of Project document. Nothing gets built that is not scoped first.
2. **Check the scope.** Run [`/validateScope`](cmd-validatescope.md). It checks your scope document against the wxKanban quality criteria, so gaps are found before they become code.
3. **Turn the scope into specs and tasks.** Run [`/createSpecs`](cmd-createspecs.md). It produces the specification, the plan, and a task breakdown for the scope.
4. **Build it.** Run [`/implement`](cmd-implement.md). It works through the tasks and keeps the audit trail intact. When the tasks are done, it also runs a code and UI review of the changes and files the scope's test plan.

**After that, stages advance on their own, but two of them need you.** Each scope moves through **QA**, **Human Testing**, **Beta**, and **Release** by itself as soon as the gate for the stage it is in is clear. Nobody presses an Advance button. What clears the gates is work that people do:

- **QA** needs the scope's machine tests to pass and be signed off. Run the scope's test plan with [`/wxCreateTestPlan`](cmd-wxcreatetestplan.md) `SCOPE-NNN --Execute`, and verify its final gate yourself; the AI shows you the evidence and stops. Each test it proves is signed off as it runs, so this one command is enough; the nightly run is optional. The scope leaves QA when no task is open, it has at least one machine test, and none of its machine tests is unsigned or failing.
- **Human Testing** needs your testers. They run the human tests in the web app and sign each one off. The scope leaves when no task is open and every human test has a tester's sign-off.

Your part is to clear what blocks each gate: run the tests, fix failures, and have your testers sign off. A sign-off is always a person's, never the AI's. Deploying the release is also yours; wxKanban never deploys.

For what each stage needs and what blocks it, see [The Process](part-the-process.md).

> **Golden rule:** *If it is not in the spec, stop and add it to the spec first.* This one habit prevents most of the surprises that derail projects.

---

## 7b. Two ways to start

**A new project.** Start from an idea:

- Run [`/buildscope`](cmd-buildscope.md) to scope one feature, then follow the steps in section 7.
- Run [`/wxG-O-D`](cmd-wxgod.md) to plan a whole project. It reviews your project and its documents with you section by section, then writes a development plan.

**Converting an existing app.** Start from software you already have:

- [`/wxConversion`](cmd-wxconversion.md) for a WinDev or WebDev app
- [`/cwConversion`](cmd-cwconversion.md) for a Clarion app
- [`/vbConversion`](cmd-vbconversion.md) for a Visual Basic 6 app

Each one turns the legacy app into a modern rebuild scaffold. For the full path, see [Converting an existing app](process-conversions.md).

---

## 8. Troubleshooting

If something does not work, see [Troubleshooting](troubleshooting.md).

---

## 9. Where to get help

- **Report a bug or suggest a feature:** open the Command Palette and run **wxKanban: Report a Bug / Suggest a Feature**. Your report goes straight to the wxKanban team's queue.
- **Claude Code docs:** https://code.claude.com/docs

For every way to get help, see [Where to get help](get-help.md).
