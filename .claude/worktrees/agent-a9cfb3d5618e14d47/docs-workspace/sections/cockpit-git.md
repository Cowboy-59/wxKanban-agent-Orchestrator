---
id: cockpit-git
part: dev-cockpit
audience: customer
sources: vscode-extension/src/providers/cockpitTreeProvider.ts, vscode-extension/src/services/gitStatus.ts, vscode-extension/src/services/kitUpdate.ts
---

# Git

## The commits-to-push line

The **Git — N commits to push** row counts the commits on your current branch that are not on its upstream branch yet. Its description reads "not yet deployed".

It tells you that work you committed is still only on your machine. Your teammates cannot see it until you push. "Not yet deployed" is the Cockpit's wording only: wxKanban never builds or deploys your application. Whether a push deploys anything depends on your own pipeline.

Expand the row to see the subject line of each unpushed commit, newest first. The Cockpit lists up to 10. If there are more, the last line reads **…and N more**.

## When the row is hidden

The row does not appear when:

- every commit is pushed,
- the project folder is not a git repository,
- the current branch has no upstream branch, or
- git is not installed.

So a missing row does not always mean "all pushed". If you expect the row and it is not there, check that your branch tracks a remote branch.

## What it does not do

The row is read-only. The Cockpit never commits or pushes for you. Push when you are ready, in your usual way.

The row counts commits only. It does not show files you changed but have not committed. Uncommitted changes matter elsewhere: they hold back an automatic kit update. See [Kit updates](cockpit-kit-updates.md).

The count updates on the next refresh after you commit or push.
