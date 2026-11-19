---
id: cockpit-install
part: dev-cockpit
audience: customer
sources: vscode-extension/package.json, vscode-extension/README.md, vscode-extension/src/extension.ts, vscode-extension/src/services/auth.ts, vscode-extension/src/services/projectContext.ts, vscode-extension/src/services/kitUpdate.ts, vscode-extension/src/services/commandsInstall.ts, vscode-extension/src/providers/cockpitTreeProvider.ts, gettingStartedInstructions.md
---

# Installing and linking the Cockpit

The Dev Cockpit is a VS Code extension named **wxKanban Dev Cockpit**, published by wxperts. It adds a **wxKanban** icon to the activity bar on the left of VS Code. Click the icon to open the **Dev Cockpit** view. The view title shows the Cockpit version, for example **Dev Cockpit v0.2.43**.

## 1. Install the extension

The Cockpit normally installs with the kit. If the wxKanban icon is missing:

1. Open the Extensions panel.
2. Search for **wxKanban Dev Cockpit** and click **Install**.

VS Code keeps the extension up to date for you. The kit setup installs it from the VS Code Marketplace; the kit does not carry its own copy. If VS Code's `code` command is not available, the kit setup skips this step, prints the manual steps, and saves them in a file named `INSTALL-DEV-COCKPIT.txt` in your project folder.

The Cockpit starts when the folder you open in VS Code contains a `.wxkanban-project.json` file. That file holds your project ID and comes with the kit. For the full first-time setup, see [Getting Started](getting-started.md).

## 2. Sign in or relink the project

The Cockpit reads your project through a project-scoped wxKanban API token. On first run it picks up the token from the kit's own settings, if the kit has one, and stores it in VS Code's secure storage. Each project keeps its own token.

You get a token from the project's **Kit** tab in the web app: every **Download Kit** creates a new one, writes it into the kit, and shows it once on the page. For the exact steps, see [Getting Started](getting-started.md), section 5.

If the Cockpit shows **Sign in to wxKanban**, it found no token. To enter one:

1. Click **Sign in to wxKanban**, or open the Command Palette and run **wxKanban: Sign In / Relink Project**.
2. Paste the API token for the project ID shown in the prompt.
3. The Cockpit says **token saved** and refreshes.

Run the same command any time you need to replace the token, for example after the old one was revoked. You must have the project folder open first. If not, the Cockpit asks you to open a folder that contains `.wxkanban-project.json`.

## 3. Install the kit

If the folder has no kit, run **wxKanban: Install Kit in This Folder**. The Cockpit also shows a **No kit installed — Install** row when it is running in a folder with no kit, and offers **Install kit** or **Not now** when it starts there.

The install:

1. Asks for the project ID this folder should connect to.
2. Asks for a project-scoped API token, and saves it. To get one, download the kit once from the project's **Kit** tab in the web app and copy the token it shows; see [Getting Started](getting-started.md), section 5.
3. Downloads the kit for that project.
4. Opens a terminal named **wxKanban Kit Install** that unpacks the kit into the folder and runs the kit setup.

Everything that writes to your folder runs in that terminal, so you can watch it. If the server rejects the token, the Cockpit says so. Check that the token belongs to this project.

Each kit is stamped with one project's ID. Do not reuse a kit from another project.

## 4. Install the slash commands

The kit's slash commands, such as [`/buildscope`](cmd-buildscope.md), must be copied into Claude Code's command folder before Claude Code can run them. When any are missing or out of date, the Cockpit shows a row near the top:

- **Install wxKanban slash commands**, with "N not installed — click to install", or
- **Update wxKanban slash commands**, with "N outdated — click to update".

Click the row, or run **wxKanban: Install Slash Commands (.claude/commands)**. The Cockpit copies only the files that are missing or changed and reports how many it installed and updated. Reload VS Code to pick up new commands. When everything is current, the row disappears and the command says the slash commands are already up to date.

When the Cockpit starts and finds missing commands, it also shows a one-time message with an **Install** button.

Next: [The Cockpit at a glance](cockpit-at-a-glance.md).
