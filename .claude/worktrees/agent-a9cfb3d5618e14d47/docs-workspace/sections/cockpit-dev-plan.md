---
id: cockpit-dev-plan
part: dev-cockpit
audience: customer
sources: vscode-extension/src/providers/cockpitTreeProvider.ts, vscode-extension/src/types.ts, mcp-server/src/utils/cockpit-summary.ts
---

# Development Plan

The **Development Plan** row is your project's build roadmap as a checklist. Its label counts the finished scopes, for example **Development Plan (7/12)**: 7 of 12 scopes are done. The row appears once your project has scopes with specs, and only while the Cockpit can read your project (signed in and reachable).

Expand it to see one row per scope, in foundation-up build order. Scopes that others depend on come first.

Each row shows a mark, the scope number, and the title, with the state beside it:

| Mark | State | Meaning |
| --- | --- | --- |
| ✓ | **done** | Every task in the scope is complete |
| ◐ | **partial** | Some tasks are complete, some are not |
| ○ | **todo** | No task in the scope is complete yet |

A scope with no tasks counts as **done** when its spec status is released or done, and as **todo** otherwise.

The checklist is read-only. It updates as tasks are completed. To work on a scope, use the **N Scopes unfinished** row. See [Scopes](cockpit-scopes.md).

## How it differs from Scopes unfinished

| | Development Plan | Scopes unfinished |
| --- | --- | --- |
| Shows | Every scope, finished or not | Only scopes with remaining work |
| Order | Foundation-up build order | Active scope first, then by number |
| Detail | One state per scope | Each incomplete task |
| Actions | None | Check Out, Check In, Open Related Spec |
