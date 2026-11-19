---
id: cockpit-scopes
part: dev-cockpit
audience: customer
sources: vscode-extension/src/providers/cockpitTreeProvider.ts, vscode-extension/src/commands/scopeCheckout.ts, vscode-extension/src/commands/openSpec.ts, vscode-extension/src/providers/scopeDecorations.ts, vscode-extension/src/providers/readonlyConfig.ts, vscode-extension/src/services/projectContext.ts, vscode-extension/src/types.ts, vscode-extension/package.json, vscode-extension/README.md, CONTEXT.md
---

# Scopes

## Unfinished scopes

The **N Scopes unfinished** row holds every scope that still has incomplete tasks. Its description reads "remaining work". Expand it to see one row per scope, labeled with the scope number and title, for example **#042  VS Code Dev Cockpit**. Scopes with no remaining work are not listed.

Each scope row shows:

- **N left**: the number of incomplete tasks.
- Who has it checked out, when someone does: **N left · you**, or **N left · Name**.

Expand a scope to see its incomplete tasks. Each task shows its status. Click a task to open a read-only detail panel with its title, description, status, and scope.

## The pinned active scope

The kit records one scope as the project's active scope. The Cockpit pins it: it is listed first, with a filled star icon. The other scopes follow in number order, with a layers icon.

## Stage and status

Hover a scope row to see its tooltip: the scope number and title, its **status**, "(active scope)" when it is the active one, and who has it checked out. The Cockpit shows no other stage information for a scope. To see where a scope stands in the lifecycle, see [The Process](part-the-process.md).

## Check Out and Check In

In a project with more than one member, checking out a scope tells your team that you are working on it. Right-click a scope row to see the choices.

**Why check out:**

- Your teammates see the claim on the scope row, so nobody duplicates your work.
- Spec documents are read-only in the editor unless you hold the scope's claim. Checking out makes that scope's spec documents editable for you. The documents of scopes you do not hold stay read-only.
- The Cockpit creates and switches to a branch for the scope.

**To check out a scope:**

1. Right-click the scope and choose **wxKanban: Check Out Scope**. This is offered on scopes that are free or held by someone else.
2. If someone else holds it, a warning names them and when they checked it out: "You may be duplicating effort." Choose **Check out anyway** only if you mean to take it over.
3. The Cockpit creates and switches to the scope's branch through the kit's git helper, wxAIGit. If wxAIGit is not available, the Cockpit shows the exact command so you can copy it and run it yourself.

A badge marks claimed scopes: a pencil for scopes you hold, a lock for scopes someone else holds.

**To check in a scope:**

1. Right-click the scope and choose **wxKanban: Check In Scope**. This is offered on scopes you hold, and on scopes someone else holds.
2. The claim is released.
3. The Cockpit asks: "Merge the branch back into the integration branch?" Choose **Merge now** or **Not now**.

Both commands need a linked project and a signed-in token. A consultant who has not been granted the scope gets a message instead of a claim.

**Single-member projects:** no claim is needed. Check Out only creates the branch, and Check In reports that there is nothing to release. Spec documents stay editable.

## Open the related spec

Click the inline button on a scope row, or run **wxKanban: Open Related Spec / File**. The Cockpit opens the scope's detailed spec. If the scope has no spec yet, it opens the scope document instead. If neither exists, it says no spec file was found.
