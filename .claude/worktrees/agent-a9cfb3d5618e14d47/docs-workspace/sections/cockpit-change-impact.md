---
id: cockpit-change-impact
part: dev-cockpit
audience: customer
sources: vscode-extension/src/providers/impactViews.ts, vscode-extension/src/services/impactModel.ts, vscode-extension/src/services/impactRunner.ts, vscode-extension/package.json, vscode-extension/src/extension.ts, CONTEXT.md
---

# Change Impact

**Change Impact** is the set of code, scopes, shared tables, and human test sign-offs that a change reaches. The Cockpit checks it each time you save a file, and the kit checks it before Claude Code edits code. Change Impact is active only when your kit includes it. It does not appear in the Cockpit tree. It shows up in the status bar, the Explorer, the Problems panel, and the editor.

An **Impact Boundary** is a change that needs your agreement, not just a notice. That is a change that reaches another scope's code, touches a table that more than one scope uses, or would undo a human test sign-off.

## The status indicators

**Status bar.** An **Impact** item sits on the left of the status bar. Click it to open the impact panel.

| Status bar text | Meaning |
| --- | --- |
| **Impact** | No change checked yet |
| **Impact: N** | Your last change affects N other files |
| **Impact: N**, in warning color | The change crosses an Impact Boundary |
| **Impact: N · data loss**, in error color | The change could lose data |
| **Impact: broad** | Too many files depend on it to list |
| **Impact: agree?** | A save crossed an Impact Boundary and waits for your answer |
| **Impact: data loss?** | A save could lose data and waits for your answer |

**Explorer badges.** Files your change affects carry a ↯ badge. Hover it to see which change affects the file, through what, and how sure the check is.

**Problems panel.** The file you changed gets an information entry, for example "Change Impact: 3 file(s) affected · Impact Boundary". It also names the scopes the change reaches and warns of possible data loss.

**Code lens.** Above each code fence line, a lens names the fence's scope and task and says how many files and scopes use that code. Click it to pick one of those files and open it. A fence used by nothing outside its file says it is internal to the file.

## The impact panel

Run **wxKanban: Show Change Impact**, or click the status bar item. The panel shows:

- A verdict: **No impact found**, **This change affects other code**, **This change crosses an Impact Boundary**, or **Possible data loss**.
- The changed file, the project's Change Impact mode, and the number of affected files.
- A small diagram of the changed file and the scopes it reaches.
- **Possible data loss** and **Why it is a boundary** lists, when they apply.
- An **Affected** table: each file, what it is affected through, and the confidence. Click a file to open it.

**When it opens by itself.** After you save a file by hand, the panel opens on its own only when the change crosses an Impact Boundary or could lose data. A change that only affects other code never opens it.

**Answering.** VS Code cannot block a save, so you answer after it:

- **Agree** records your acknowledgment in wxKanban.
- **Undo my save** puts the file back as it was before this save.

For possible data loss, tick **I understand this change may lose data** before **Agree** is enabled. If wxKanban is unreachable, your answer is queued and sent when it is back. The status bar keeps asking until you answer.

## The Claude Code hook

The hook checks each edit Claude Code wants to make before it happens. It asks you at an Impact Boundary and stops on possible data loss. Claude Code then asks you in the chat. An edit the hook already settled is not asked about again when the file is saved.

The Cockpit installs the hook by itself when it is missing or out of date, and says so. You can also manage it from the Command Palette:

- **wxKanban: Install the Change Impact hook for Claude Code**
- **wxKanban: Remove the Change Impact hook for Claude Code**

Each command reports whether it worked.
