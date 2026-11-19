# Getting Started with wxKanban

**Welcome!** This guide takes you from a brand-new computer to a working wxKanban setup inside VS Code — even if you've never installed a developer tool before. Follow it top to bottom. Each step tells you *why* it exists, not just *what to click*, so you build the habit, not just the setup.

> **Time needed:** ~30–45 minutes the first time.
> **You do not need to be a programmer to finish this.** You need to be able to follow steps and copy-paste a few commands.

---

## 1. What is wxKanban (and why these tools)?

wxKanban is not a "click a button and get an app" generator. It's an **orchestration kit** that walks your project through a disciplined **6-phase lifecycle** — Design → Implementation → QA → Human Testing → Beta → Release — and only lets you take the *right* action at the *right* time. Specs get followed. Tests don't get skipped. Releases don't happen without QA. And there's always a single source of truth for exactly where your project stands.

The goal isn't to hand you code. It's to build your **judgment** — so you learn *how* to ship tested, audited software on a repeatable process.

To do that, four tools work together:

| Tool | Role | Think of it as… |
|---|---|---|
| **VS Code** | The editor where all your work happens | Your workshop |
| **Claude Code** *(or your preferred AI development agent)* | The AI assistant that lives inside VS Code | Your AI dev agent |
| **wxKanban Dev Cockpit** | A sidebar showing what's built / what's next | Your dashboard |
| **wxKanban hosted service** (mcp.wxperts.com) | The brain that enforces the lifecycle & stores your project | Your project's memory |

You'll install all four below.

---

## 2. Install the prerequisites

Install these three first. On Windows, do each install, then **close and reopen** VS Code / your terminal afterward so it picks up the changes.

### 2a. Node.js 20 LTS
wxKanban runs on Node.js. Get the **LTS** version (20 or newer).
- Download: **https://nodejs.org** → click the **LTS** button.
- Accept all defaults in the installer.
- **Verify** — open a terminal (see below) and run:
  ```
  node --version
  ```
  You should see something like `v20.x.x`.

### 2b. Git (Windows) / Git (Mac)
Git tracks changes to your project and lets Claude Code run scripts properly.
- **Windows:** https://git-scm.com/downloads/win — accept defaults.
- **Mac:** run `git --version` in Terminal; if it's missing, macOS offers to install it.

> **Why it matters on Windows:** without Git installed, Claude Code falls back to PowerShell and some scripts behave differently.

### 2c. Visual Studio Code
This is the editor everything runs inside.
- Download: **https://code.visualstudio.com** → install for your OS.
- On the Windows installer, tick **"Add to PATH"** and **"Open with Code"** options if offered.

**Opening a terminal inside VS Code:** press `` Ctrl+`  `` (backtick, top-left of your keyboard) — Mac: `` Cmd+`  ``. On Windows this is a **PowerShell** terminal by default. You'll type commands here.

---

## 3. Install Claude Code — if you use (or want to use) it

This is the piece to get right — Claude Code is how you'll actually *do* the work.

### 3a. Install the VS Code extension
1. In VS Code, open the Extensions panel: `Ctrl+Shift+X` (Mac: `Cmd+Shift+X`).
2. Search for **Claude Code**.
3. Install the one published by **Anthropic** (id: `anthropic.claude-code`).
4. Restart VS Code if it asks.

### 3b. Install the Claude Code command-line tool
The extension's chat panel works on its own, but the wxKanban kit also needs the `claude` command available in the terminal.

In the VS Code terminal:
- **Windows (PowerShell):**
  ```
  irm https://claude.ai/install.ps1 | iex
  ```
- **Mac / Linux:**
  ```
  curl -fsSL https://claude.ai/install.sh | bash
  ```
Then **close and reopen** the terminal and verify:
```
claude --version
```

### 3c. Sign in
Run `claude` in the terminal (or click the **Claude** icon in the top-right of VS Code) and choose one:
- **Claude Pro or Max subscription** (easiest for individuals) — a browser opens; sign in with your Claude.ai account.
- **Anthropic API key** (for teams / billing control) — create one at https://console.anthropic.com and paste it when prompted.

Your login is saved securely; you only do this once.

---

## 4. Recommended VS Code extensions

Beyond Claude Code, here are the extensions we actually use day to day. Install by searching the extension **id** in the Extensions panel (`Ctrl+Shift+X`). The **top two are required** for wxKanban; the rest are quality-of-life.

**Required for wxKanban**
| Extension | id | What it does |
|---|---|---|
| Claude Code | `anthropic.claude-code` | The AI assistant (from Step 3) |
| wxKanban Dev Cockpit | `wxperts.wxkanban-dev-cockpit` | Your project dashboard — auto-installs with the kit |

**Highly recommended for this stack (React / TypeScript / Node / Postgres)**
| Extension | id | What it does |
|---|---|---|
| ESLint | `dbaeumer.vscode-eslint` | Flags code problems as you type |
| Prettier ESLint | `rvest.vs-code-prettier-eslint` | Auto-formats your code on save |
| ES7+ React snippets | `rodrigovallades.es7-react-js-snippets` | Fast React boilerplate |
| npm Intellisense | `christian-kohler.npm-intellisense` | Autocompletes package imports |
| DotENV | `mikestead.dotenv` | Highlights `.env` config files |
| Git Graph | `mhutchie.git-graph` | Visual history of your commits |
| GitHub Pull Requests | `github.vscode-pull-request-github` | Review & manage PRs in-editor |
| Code Spell Checker | `streetsidesoftware.code-spell-checker` | Catches typos in code & docs |
| markdownlint | `davidanson.vscode-markdownlint` | Keeps Markdown docs clean |
| Thunder Client | `rangav.vscode-thunder-client` | Test your API endpoints without leaving VS Code |
| Docker | `ms-azuretools.vscode-docker` | Manage containers (for local Postgres, etc.) |
| Python + Pylance | `ms-python.python`, `ms-python.vscode-pylance` | For the conversion skills' Python helpers |
| Markdown PDF | `yzane.markdown-pdf` | Export any Markdown doc (like this one) to PDF |

> **Tip:** VS Code will also offer the project's own recommended extensions automatically when you open the wxKanban folder — click **Install** on that prompt.

---

## 5. Get your wxKanban project

1. Sign in to the **wxKanban web app** (your account URL, e.g. **wxkanban.com**).
2. **Create a project** (or open the one that was created for you). This registers your project in the hosted service and gives it a unique **Project ID**.
3. Click the **KIT** link on the project you just created (in project edit mode) and **generate a kit** for that project. It gives you a **zip file** to download. Create the directory you're going to do your development in, and unzip the contents into that directory. What you unzip contains:
   - `.wxkanban-project.json` — your Project ID + kit version
   - the `wxkanban-agent/` kit
   - the `vscode-extension/` Cockpit installer
4. In VS Code: **File → Open Folder…** and open that project folder.

> The kit is generated **per project** — it's stamped with that project's ID, so a kit downloaded for one project won't work for another. If you create a second project later, generate a fresh kit for it rather than copying this folder.

---

## 6. Wire wxKanban into your project

Do these inside VS Code, in the integrated terminal (`` Ctrl+`  ``), from your project folder.

> **A fresh kit is mandatory for every project you create.** Each new project gets its own kit — don't reuse a kit from another project.


### Step 1 — Install dependencies
The kit setup normally installs these for you. If it didn't, run:
```
npm install
```

### Step 2 — Install the Dev Cockpit extension
The Dev Cockpit is installed from the extensions automatically. If the **wxKanban** icon doesn't appear in the left activity bar, install it manually:
1. open extensions and search for wxKanban and follow the instructions

A **wxKanban** icon appears in the left activity bar — that's your Dev Cockpit.

### Step 3 — Allow the automatic tasks
When the folder opens, VS Code may ask *"This workspace has tasks configured to run on folder open. Allow?"* — click **Allow** (or **Allow and Remember**). These keep your kit up to date and start the orchestrator.

at the top of the Cockpit there will be a status for the Orchestrator and MCP , both should reflect ok.

You're set up. 🎉

---

## 7. Your first workflow

Open Claude Code and let it orient you, then follow the lifecycle. You **describe what you want in plain language** in Claude Code, and the kit handles the specs, code fencing, tasks, and audit trail.

1. **See where you are** — open the **Dev Cockpit** sidebar (the wxKanban icon). It shows remaining work per scope, with your active scope pinned. This updates live as work gets built.
2. **Design first (mandatory rule).** Before writing any code, you define *scope*. In Claude Code, run:
   ```
   /buildscope
   ```
   It interviews you section by section (you approve each step) to produce a proper Scope-of-Project document. Nothing gets built that isn't scoped first.
3. **Turn scope into specs & tasks:**
   ```
   /createSpecs
   ```
   This produces the specification, plan, and a task breakdown for the feature.
4. **Build it:**
   ```
   /implement
   ```
   The orchestrator implements tasks one at a time, wrapping each in its code fence and keeping the audit trail intact.
5. **Advance through the phases** — QA, Human Testing, Beta, Release — each with its own gated commands. The Cockpit and `/help` always show what's available *right now*.

> **Golden rule:** *If it's not in the spec, stop and add it to the spec first.* This one habit prevents most of the surprises that derail projects.

Type `/help` in Claude Code anytime to see every command available at your current phase.

---

## 8. Troubleshooting

**`claude` command not found**
Close and reopen the terminal after installing. On Windows, make sure you ran the PowerShell install (`irm … | iex`), not the Mac one.

**Claude Code icon / panel not showing**
Open a file (not just the folder). Update VS Code to the latest version. Or use Command Palette → **Claude Code: Open**.

**MCP won't connect after restart**
Re-register and re-approve:
```
node scripts/init.mjs
```
Then restart VS Code and run `/mcp` again to approve **wxkanban**.

**Cockpit sidebar is empty**
Make sure `.wxkanban-project.json` exists in the folder you opened, and that `npm run kit:health` reports healthy. Then use the Command Palette → **wxKanban: Refresh Cockpit**.

**Kit tasks not running on folder open**
Command Palette → **Tasks: Manage Automatic Tasks in Folder** → **Allow Automatic Tasks in Folder**.

**PowerShell vs CMD confusion (Windows)**
A prompt starting `PS C:\>` is PowerShell — use the `irm` install commands. Don't mix PowerShell and CMD syntax in one command.

---

## 9. Where to get help

- **In VS Code:** run `/help` in Claude Code for the full command list at your current phase.
- **Report a bug or suggest a feature:** Command Palette → **wxKanban: Report a Bug / Suggest a Feature** (routes straight into the wxKanban team's queue).
- **Claude Code docs:** https://code.claude.com/docs

---

*Generated for wxKanban onboarding — www.wxperts.com*
