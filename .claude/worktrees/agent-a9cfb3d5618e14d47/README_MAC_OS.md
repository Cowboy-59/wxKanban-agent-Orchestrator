# wxKanban Kit — Mac Setup

On a Mac, VS Code won't auto-start the kit or install the Cockpit for you. Just run these steps in order, in the VS Code terminal (**Terminal → New Terminal**).

> Needs **kit v1.7.11+**. Older kits won't run on Mac. Need Node 20+ (`node -v`).

## 1. Install

```bash
npm install
```

## 2. Set up the kit (writes `.mcp.json`, connects to MCP)

```bash
node scripts/upgrade-kit.mjs
```

First time and it can't find `.mcp.json`? Run `node scripts/init.mjs` instead.

## 3. Check the connection

```bash
npm run kit:health
```

You want to see: `✓ Hosted MCP ... healthy`

## 4. Turn on the `code` command (Mac needs this once)

`Cmd + Shift + P` → **Shell Command: Install 'code' command in PATH** → reopen Terminal.

Check it worked:

```bash
code --version
```

## 5. Install the Dev Cockpit

`Cmd + Shift + P` → **Extensions: Install from VSIX…** → open the `vscode-extension/` folder → pick the newest `wxkanban-dev-cockpit-*.vsix`.

## 6. Approve the server

Quit and reopen VS Code → open Claude Code → run `/mcp` → **approve `wxkanban`**. (One time.)

Done. Re-run `npm run kit:health` to confirm.

## If something breaks

- **`env: node\r: ...`** → old kit, redo step 2 (need v1.7.11+).
- **`code: command not found`** → do step 4 again.
- **MCP won't connect** → `node scripts/init.mjs`, reopen VS Code, `/mcp` approve.
- **Cockpit didn't install** → do step 5 by hand.

Stuck? Email **admin@wxperts.com**.
