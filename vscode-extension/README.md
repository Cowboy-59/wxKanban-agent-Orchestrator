# wxKanban Dev Cockpit

A read-only VS Code sidebar that shows the current wxKanban project's remaining
work per scope — incomplete tasks grouped by scope, active scope pinned — so you
can see what's left to finish without leaving the editor.

## What it does

- **Dev Cockpit** view in the Activity Bar: in-flight scopes (active scope pinned)
  → their incomplete tasks, each with a remaining count and status.
- Click a task to open a read-only detail panel (title, description, status, scope).
- Open the related spec/file for a scope from its context menu.
- Reads through the project-scoped MCP; the token lives in VS Code SecretStorage.

## Linking

The cockpit activates when the open folder contains a `.wxkanban-project.json`.
On first run it bootstraps the project's API token from the kit's locations
(`.wxai/project.json` → `.env` → legacy file) into SecretStorage. If no token is
found, use **wxKanban: Sign In / Relink Project** to enter one.

## Live refresh

The view stays current without manual action:

- **Primary — emitted command.** After a `dbpush` or `implement` completes, the
  kit pings `vscode://wxperts.wxkanban-dev-cockpit/refresh` (via `code
  --open-url`) and the cockpit re-queries MCP immediately. Set
  `WXKANBAN_NO_COCKPIT_REFRESH=1` to disable the ping.
- **Fallback — light poll.** While the view is visible it re-queries every 30s
  and repaints only when the remaining-work signature actually changed, so work
  changed outside this IDE still surfaces. (Hosted-MCP streamable-HTTP *push*
  was evaluated per T022 and not adopted for v1 — the poll is the fallback.)
- **Manual.** The refresh button in the view title bar forces a re-query.

## Install / update

**Primary — VS Code Marketplace.** Open the Extensions panel, search
**"wxKanban Dev Cockpit"** (publisher `wxperts`), and click Install. VS Code
keeps it up to date automatically — new versions install in the background with
no action needed. This is the recommended path for all customers.

**Fallback — bundled `.vsix` (offline / locked-down machines).** The extension
also ships as a `.vsix` inside the kit download payload and can be installed by
`scripts/init.mjs` when the Marketplace is unavailable:

- Fresh kit init runs `code --install-extension` for the bundled `.vsix`, then
  prompts you to reload the window to activate it.
- A kit upgrade re-runs `init.mjs`, which reinstalls only when the bundled
  version differs from what's installed (an unchanged version is a no-op).
- If the `code` CLI isn't on PATH the install is skipped with a manual-install
  hint — it never fails the kit init.

## Building

- `npm run build` — esbuild bundle to `dist/extension.js`.
- `npm run check-types` — `tsc --noEmit`.
- `npm test` — vitest unit suite (project resolution, token bootstrap, MCP
  client). The remaining-work read + cross-project isolation are covered on the
  server side in `mcp-server/tests/cockpit-summary.test.ts`. Install/activate and
  the live-refresh round-trip are verified manually in an Extension Development
  Host (they require the `code` CLI + a running editor).
- `npm run package` — produce the `.vsix` (what the kit ships).

Spec: `specs/042-vscode-dev-cockpit/spec.md` (charter:
`specs/Project-Scope/042-vscode-dev-cockpit.md`).
