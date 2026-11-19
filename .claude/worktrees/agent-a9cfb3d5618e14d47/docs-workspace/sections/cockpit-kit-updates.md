---
id: cockpit-kit-updates
part: dev-cockpit
audience: customer
sources: vscode-extension/src/providers/cockpitTreeProvider.ts, vscode-extension/src/services/kitUpdate.ts, vscode-extension/src/services/gitStatus.ts, vscode-extension/src/extension.ts, vscode-extension/package.json
---

# Kit updates

The kit checks for a newer release when a session starts and saves the result in your project. The Cockpit reads that saved result. It compares the latest release with the kit version recorded in your `.wxkanban-project.json`, so an already-current kit is not reported as behind.

When the kit is current, the Cockpit shows no kit row. Otherwise it shows one of the rows below, near the top of the tree.

## Kit update available — Install

A newer kit is available. The description shows the change, for example "1.7.60 → 1.7.68 · click to install". The tooltip links to the release notes when there are any.

**To install it:** click the row, or run **wxKanban: Install Kit Update**. A terminal named **wxKanban Kit Upgrade** opens and runs the upgrade. It downloads the latest release, checks it, and applies it in place. You confirm in the terminal.

When the Cockpit starts and finds the kit behind, it starts this upgrade terminal by itself and shows a message saying which version it is installing. If the Cockpit itself was just updated, the message says it is bringing the kit up to match. Everything that changes your files runs in that visible terminal.

## Kit update waiting — Install

An update is available, but it was not started automatically. The description says why, for example "held back: uncommitted changes in the working tree". The upgrade overwrites files in your folder, so the Cockpit will not start it on its own over work you have not committed.

**What to do:**

1. Commit or stash your changes.
2. Click the row, or run **wxKanban: Install Kit Update**.

You can also click the row without committing. The upgrade still asks you to confirm in the terminal.

## Kit update check failed

The kit could not check for a newer release. The description gives the reason. This is not the same as being up to date: the latest version is unknown.

**What to do:** click the row, or run **wxKanban: Re-run the Kit Version Check**. A terminal named **wxKanban Kit Version Check** runs the check by hand, so you can see any error on screen. The Cockpit does not show a pop-up for this state. Look for the row.

## No kit installed — Install

The folder has no kit. Click the row, or run **wxKanban: Install Kit in This Folder**. See [Installing and linking the Cockpit](cockpit-install.md).

## Summary

| Row | Meaning | Command |
| --- | --- | --- |
| **Kit update available — Install** | A newer kit exists | **wxKanban: Install Kit Update** |
| **Kit update waiting — Install** | A newer kit exists, held back by uncommitted changes | Commit or stash, then **wxKanban: Install Kit Update** |
| **Kit update check failed** | The version is unknown | **wxKanban: Re-run the Kit Version Check** |
| **No kit installed — Install** | No kit in this folder | **wxKanban: Install Kit in This Folder** |
