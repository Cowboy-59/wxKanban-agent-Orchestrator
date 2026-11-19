# wxKanban Kit Setup Guide

**Kit version:** v1.7.11  
**Project ID:** cfe3c7a1-5057-43cb-a712-1ea230f7733e  
**MCP Server:** https://mcp.wxperts.com

This guide covers how to set up the wxKanban kit on a new developer machine for this project.

---


## Step 2 — Install Node dependencies

In the VS Code integrated terminal:

```
npm install
```

---

## Step 3 — Run the kit upgrade script

This checks for the latest kit version, downloads it, starts the orchestrator, and verifies the MCP connection:

```
node scripts/upgrade-kit.mjs
```

Expected output confirms:
- Kit version upgraded (or already current)
- Hosted MCP at `https://mcp.wxperts.com` is reachable ✓
- API token validated ✓
- `.mcp.json` written with the correct Streamable HTTP transport (`type: "http"`, `<mcpBaseUrl>/mcp`, literal bearer token)

> `upgrade-kit.mjs` doesn't write `.mcp.json` itself — it delegates to `scripts/init.mjs`, which writes/refreshes the file (and also runs automatically when VS Code opens the folder). A fresh kit download already ships a pre-filled `.mcp.json`, so it is usually present before you run anything.

---

## Step 4 — Install the Dev Cockpit VS Code extension

### Option A — VS Code Command Palette (recommended)

1. Open the Command Palette: `Cmd + Shift + P`
2. Select **Extensions: Install from VSIX**
3. Navigate to the project folder → `vscode-extension` → select `wxkanban-dev-cockpit-0.2.4.vsix`

### Option B — Terminal (requires `code` CLI)

First install the `code` CLI if you haven't already:
1. `Cmd + Shift + P` → **Shell Command: Install 'code' command in PATH**

Then run:

```
code --install-extension "/path/to/Proactive-By-DDES/vscode-extension/wxkanban-dev-cockpit-0.2.4.vsix"
```

---

## Step 5 — Restart Claude Code and approve the MCP server

1. Close and reopen VS Code
2. Open Claude Code in the terminal or sidebar
3. Run `/mcp` and approve the **wxkanban** server when prompted
4. The MCP connection is one-time approval — it persists after that

---

## Step 6 — Allow automatic VS Code tasks

When the project folder opens, VS Code will prompt:

> *"This workspace has tasks configured to run on folder open. Allow?"*

Click **Allow** (or **Allow and remember**). This enables the three startup tasks:

| Task | What it does |
|---|---|
| wxKanban: Check for Kit Update | Compares installed version against latest available |
| wxKanban: Start Orchestrator | Starts the orchestrator HTTP gateway |
| wxKanban: Install Copilot Extension | Installs/updates the Dev Cockpit extension |

Each task opens as its own terminal tab on every folder open.

---

## Step 7 — Verify the setup

Run the health check:

```
npm run kit:health
```

Expected output:
```
✓ Hosted MCP  https://mcp.wxperts.com  healthy
```

The orchestrator gateway is only required from Implementation phase onward — it is not needed during Design phase.

---

## Troubleshooting

**MCP not connecting after restart:**
- Run `node scripts/init.mjs` to re-register the MCP server
- Then restart Claude Code and re-approve via `/mcp`

**Kit tasks not running on folder open:**
- Open Command Palette → **Tasks: Manage Automatic Tasks in Folder**
- Set to **Allow Automatic Tasks in Folder**

**`code` command not found:**
- `Cmd + Shift + P` → **Shell Command: Install 'code' command in PATH**
- Restart Terminal after installing

**Gitea push/pull failing from VS Code terminal:**
- Always use Mac's native Terminal app for git push/pull to this repo
- VS Code's integrated terminal conflicts with Gitea HTTP authentication
