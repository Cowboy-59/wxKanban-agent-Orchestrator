# Spec 042: VS Code Dev Cockpit

**Spec Number**: 042
**Status**: `draft`
**Created**: 2026-05-28
**Depends On**: spec 028 (Hosted MCP Deployment — MCP transport + project-scoped API tokens), spec 019 (Agent Orchestrator Kit — download/init/upgrade flows, McpClient, project resolution), spec 026 (Code Fencing), spec 029 (Dbpush Blocking Contract — dbpush completion as a refresh trigger)
**Related Scopes (downstream)**: bug-report scope (next; consumes the reserved bug-panel slot)
**Source**: `specs/Project-Scope/042-vscode-dev-cockpit.md`

---

## Overview

Adds a read-only VS Code sidebar — the **Dev Cockpit** — that shows the currently linked project's *remaining work* without leaving the editor. Today the kit creates and stores everything to wxKanban, but there is no in-editor view of what's unfinished, so a developer must keep the web app open alongside VS Code and flip between them. The cockpit collapses that into one pane: the IDE both builds (via the kit) and shows what's left.

The cockpit lists the project's in-flight scopes, each with its incomplete tasks grouped by phase and a remaining count, with the active scope pinned at the top. It stays live in both directions — new scopes/specs/tasks appear right after a `dbpush`, and remaining counts drop as tasks are completed (including when the AI finishes a batch during `implement`). It reads exclusively through the hosted, token-scoped **MCP**, which was chosen for client security so the app's REST API never has to be exposed to customers.

Bug reporting and the "select a bug → AI fixes it" handoff are **deferred to the next scope**; the cockpit reserves a UI slot for them but does not implement them here.

### Core Design

| Element | Value |
|---|---|
| **Primary Actor** | The developer using the kit (kit author today; any kit developer generally) |
| **Secondary Actors** | The AI assistant (Claude Code) — completes/creates work the cockpit reflects live; other contributors (another developer or web-app user) whose changes surface via the catch-all refresh |
| **Key Value** | Single pane of glass — no more web-app + IDE flipping; the IDE shows what's left to finish, live |
| **Transport** | MCP only (hosted, token-native, audited — chosen for client security). No app REST API exposure. Single-project scope. |
| **Scope Boundary** | **IN**: extension shell + Activity Bar sidebar; project resolution/linking; project-scoped API-token auth in SecretStorage (+ token bootstrap from the kit); single-project MCP read coverage with strict scoping + within-customer scope-leak fix; remaining-work-per-scope view (active scope pinned); live auto-refresh both directions (dbpush build-up, implement work-down; local in-IDE signal + poll fallback + manual refresh); graceful empty/error states; read-only task detail + "open related spec/file"; install/update/activate via the kit lifecycle. **OUT**: bug queue + bug-fix handoff (→ next scope; reserved slot only); any write actions; monorepo restructure; new DB tables/migrations; cross-project or list-all-projects reads; exposing the app REST API; VS Code Marketplace distribution; output-channel/telemetry; unlink/kit-removal cleanup; extension↔backend version-compatibility handling. |

---

## User Scenarios & Testing

### US1 — See what's left, first thing (primary / happy path)

**Actor**: The developer using the kit

**Scenario**:
1. The developer opens VS Code on the wxKanban project in the morning.
2. The cockpit sidebar auto-detects the linked project and lists the in-flight scopes.
3. Each scope shows its remaining work — the incomplete tasks grouped under that scope and phase, with a count — and the active scope is pinned at the top.
4. The developer scans it, picks the next task, and never opens the web app.

**Pass condition**: Within a few seconds of opening the editor (target < 3s), the developer can see exactly what's unfinished per scope, with the web app closed.

---

### US2 — The cockpit stays live as work is built and finished

**Actor**: The developer using the kit (and the AI working in their IDE)

**Scenario**:
1. The developer runs `dbpush`; newly created scopes/specs/tasks appear in the cockpit without manual refresh.
2. Through the day, tasks are completed via the normal `implement` flow — including the AI finishing a batch of tasks.
3. As each task completes, its scope's remaining count drops in the cockpit on its own.
4. A manual refresh is always available as a fallback.

**Pass condition**: The cockpit mirrors the project as it's built up and worked down — items show up as they're created and fall away as they're finished — with no manual refresh needed, whether the change was made by the developer, the AI in their IDE, or elsewhere.

---

### US3 — Nothing linked yet / can't authenticate (edge case)

**Actor**: The developer using the kit

**Scenario**:
1. The developer opens a folder that isn't linked to a project, or a fresh clone where the project/token config isn't present, or where resolution would otherwise pick up the stale test fixture.
2. Instead of showing wrong data or a cryptic error, the cockpit shows a clear "no project linked" (or "sign-in needed") state with brief instructions.

**Pass condition**: The project-resolution and auth failure modes are handled gracefully and tell the developer what to do, rather than failing silently or showing another project's data.

---

## Functional Requirements

### FR-001 — Extension shell and sidebar
The extension contributes a "wxKanban" container in the VS Code Activity Bar with a "Dev Cockpit" view.
**Acceptance Criteria**:
- [ ] Activating the extension adds the wxKanban container and the Dev Cockpit view.
- [ ] The view renders without error when a project is linked.
- [ ] Ships as a self-contained sibling `vscode-extension/` folder (own `package.json`/`tsconfig`/lockfile); no monorepo restructure and no root build changes.

### FR-002 — Project resolution / linking
The cockpit determines which wxKanban project the open workspace maps to, mirroring the server's resolution order.
**Acceptance Criteria**:
- [ ] Resolves `projectId` using: explicit setting → `WXKANBAN_PROJECT_ID` (env/`.env`) → walk-up to the nearest `.wxkanban-project.json` top-level `projectId`.
- [ ] The resolved `projectId` must be a valid UUID; lifecycle stage and active scope are read from `.wxai/project.json`.
- [ ] The stale test fixture (`tools/.wxkanban-project.json`, `projectId: test-project-123`) and any invalid id are rejected and treated as "not linked."

### FR-003 — Authentication via project-scoped API token
The cockpit authenticates with a long-lived project-scoped API token, not a browser session.
**Acceptance Criteria**:
- [ ] The token is stored in VS Code SecretStorage (never plaintext settings or files).
- [ ] On first run / right after kit init, the cockpit imports the token from the kit's location (`.wxai/project.json` `kit.apiToken` or `WXKANBAN_API_TOKEN`) into SecretStorage.
- [ ] Requests send `Authorization: Bearer <token>`.
- [ ] A missing/invalid/expired token drives the "sign-in needed" state (FR-007).

### FR-004 — MCP read coverage for the current project, strictly scoped
The MCP serves the cockpit's reads for the current linked project only — it never lists or returns other projects.
**Acceptance Criteria**:
- [ ] For the current project, the MCP returns its scopes/specs with their tasks grouped by phase, plus each task's status (by extending `project.list_open_items`, or a small project-scoped cockpit read tool — decided in the plan).
- [ ] All reads are bounded to the token's project and customer; the known within-customer scope-leak is fixed so a token can never see a sibling project under the same customer.
- [ ] No list-all-projects or cross-project tool is added — single-project by design.
- [ ] Existing MCP tools are unaffected (additive).

### FR-005 — Remaining-work-per-scope view
For the linked project, the cockpit shows the in-flight scopes, each with its unfinished work.
**Acceptance Criteria**:
- [ ] Each scope node shows a count of incomplete tasks and lists them grouped by phase.
- [ ] "Incomplete" is defined against the project task status set (exact statuses confirmed in the plan); completed tasks are excluded.
- [ ] The active scope (from `.wxai/project.json`) is pinned/highlighted at the top, with the project's other scopes below it.
- [ ] Data comes from the current-project MCP read tool (FR-004); no new data model is introduced.

### FR-006 — Live auto-refresh, both directions
The cockpit updates on its own as work is created and completed.
**Acceptance Criteria**:
- [ ] After a `dbpush` completes in the IDE, newly created scopes/specs/tasks appear without manual action.
- [ ] When a task is completed — including the AI finishing a batch during `implement` — the remaining count drops without manual action.
- [ ] Primary mechanism is a local in-IDE signal that triggers a re-query of MCP; a light MCP poll is the fallback for changes made elsewhere; a manual refresh control is always available.

### FR-007 — Graceful empty and error states
The cockpit never fails silently or shows wrong data.
**Acceptance Criteria**:
- [ ] No project resolved → "no project linked" with brief instructions to link.
- [ ] No/invalid token → "sign-in needed" with how to authenticate.
- [ ] Linked with nothing unfinished → an "all caught up" empty state (not an error).
- [ ] MCP unreachable → a clear error with a retry action.

### FR-008 — Read-only item detail
Selecting an item shows its detail in a panel.
**Acceptance Criteria**:
- [ ] Clicking a task opens its detail (title, description, status, phase) read-only, sourced from the MCP payload (reuse the summary payload, or a small get-task tool — plan decides).
- [ ] An action to open the related spec/file in the editor is available.
- [ ] No edits are possible from the detail panel in v1.

### FR-009 — Install the extension during kit init (new project)
When a kit is downloaded and initialized for a new project, the bundled extension is installed into VS Code automatically.
**Acceptance Criteria**:
- [ ] The extension (packaged as a `.vsix`) is included in the kit download payload.
- [ ] The init step installs it into VS Code (e.g. via `code --install-extension`) with no manual step, handling/prompting the reload required to activate it.
- [ ] After init + reload, the extension is present and enabled.

### FR-010 — Update the extension on a checked-in kit upgrade
When a kit upgrade is accepted/checked in, the bundled extension is updated to the version shipped with that kit.
**Acceptance Criteria**:
- [ ] Accepting a kit upgrade installs/updates the extension to the matching version.
- [ ] The installed extension version stays in sync with the kit (tracked alongside `kitVersion`).
- [ ] An unchanged extension version is a no-op (no needless reinstall).

### FR-011 — Auto-activate on a linked workspace
Once installed, the cockpit activates on its own when the workspace is a linked project.
**Acceptance Criteria**:
- [ ] Activation is keyed on the workspace containing a linked project (e.g. `workspaceContains` `.wxkanban-project.json` / on startup); no manual command needed.
- [ ] After install + the normal reload, opening the project shows the cockpit live.

---

## Technical Sections

### Data / Schema — none
No new tables, no migrations. The cockpit is read-only and consumes existing scopes/specs/tasks.

### MCP (the only backend change)
- Extend the current-project read path to return the project's scopes/specs with their tasks grouped by phase, plus task status (enrich `project.list_open_items` or add a dedicated tool — plan decides).
- Enforce strict project + customer scoping on that path and fix the within-customer scope-leak (the security reason MCP was chosen).
- Task detail (FR-008): reuse the summary payload client-side, or add a tiny get-task tool.
- Auth: existing bearer project-scoped API token (`mcpapitokens`); no new auth mechanism.

### Extension structure (the new package)
- Sibling `vscode-extension/` folder with its own `package.json`, `tsconfig`, lockfile — mirroring how `mcp-server/` already coexists.
- `package.json` contributions: a "wxKanban" Activity Bar container; a "Dev Cockpit" tree view + a detail webview; commands (refresh, open related spec/file, sign-in/relink); activation keyed on `.wxkanban-project.json`.
- `extension.ts` registers the tree provider, the webview provider, and the commands.
- Providers: a `CockpitTreeProvider` (active scope pinned → scopes → phases → incomplete tasks) and a read-only `DetailWebviewProvider`.
- Services: an `McpClient` wrapper (reuse the kit's existing McpClient pattern — bearer auth, envelope unwrap, 429 retry — rather than writing a new HTTP layer); a `projectContext` resolver (port the server's precedence); token bootstrap into SecretStorage; a local refresh-signal listener.
- Build: esbuild for the extension host bundle; a minimal webview UI importing only the shared TYPES from `src/shared/types` (no reuse of the React app's browser-coupled components).

### Kit install / upgrade hook
- The packaged `.vsix` is bundled into the kit download payload.
- Init (new project): the kit installs it and handles/prompts the reload.
- Upgrade (checked-in): on an accepted upgrade, reinstall/update to the kit-matched version; unchanged version is a no-op.
- Insertion points: the existing kit download/init flow and the upgrade flow (confirmed in the plan).

---

## Success Criteria

1. Opening the linked project in VS Code shows the current project's remaining work — incomplete tasks grouped by scope, active scope pinned at top — within a few seconds (target < 3s), with the web app closed.
2. After a `dbpush` completes in the IDE, the newly created scopes/specs/tasks appear in the cockpit within a few seconds, with no manual refresh.
3. When a task is completed — including the AI finishing a batch during an `implement` run — its scope's remaining count drops in the cockpit without a manual refresh.
4. The cockpit authenticates using the project-scoped token from SecretStorage, and an access test confirms a token for one project cannot surface another project's or a sibling project's data.
5. A fresh kit download + init installs and activates the extension with no manual install step; an accepted kit upgrade updates it to the kit-matched version.
6. Each failure state — no project linked, sign-in needed, all caught up, MCP unreachable — shows a clear message instead of wrong or blank data.

---

## Constraints & Notes

### Constraints
- **KISS, read-only v1** — simplest approach that delivers the view; no write actions.
- **No monorepo restructure** — sibling `vscode-extension/` folder; no changes to the root build or tsconfig.
- **No new DB tables or migrations** — reads existing data only.
- **Single-project only** — MCP reads bounded to the current linked project; no cross-project or list-all-projects.
- **MCP-first transport, chosen for client security** — the app REST API is never exposed to customers; MCP is the hosted, token-native, audited channel.
- **Security** — project-scoped token in SecretStorage only, never logged or written in cleartext; the within-customer scope-leak is fixed as part of this scope.
- **Code-fencing (spec 026)** — all top-level code in `vscode-extension/` carries `[SCOPE 042 / Tnn]` fences, and `auditfences` CI must cover the new folder.
- **Orchestrator-first** — changes routed through `wxkanban-agent` rather than hand-authored (noting the CLI bootstrap is currently rough, so in-conversation/direct-import may be needed).
- **Distribution is internal** — `.vsix` bundled with the kit, not the VS Code Marketplace.
- **Standards** — TypeScript 100% (no `any`), Pino logging on the MCP side, no `console.log`.

### Deferred (explicitly out of v1)
- The bug queue and the "select a bug → AI fixes it" handoff — reserved UI slot, delivered by the next scope.
- Any write actions — may arrive with that bug scope.
- A VS Code output channel / telemetry for extension logs.
- Cleanup on unlink/kit removal; extension↔backend version-compatibility handling.

### Dependencies / planning caveats (resolve in plan.md)
- Whether the hosted MCP can push notifications (streamable-HTTP) for cross-source live refresh; otherwise local signal + light poll.
- The exact local in-IDE refresh signal (file-watch vs. a command emitted by `implement`/`dbpush`).
- Confirming the task→scope linkage is reliable (a past bug dropped spec linkage) and defining which task statuses count as incomplete.
- Confirming the kit download/init and upgrade flows are the right insertion points, and handling the reload-to-activate step.
- Enrich `project.list_open_items` vs. a new cockpit tool; get-task vs. reuse the payload.
- Multi-root workspace: which folder's `.wxkanban-project.json` wins.

### Notes
- Renamed from "mono-repo-VS-Code" to `042-vscode-dev-cockpit`; the monorepo approach was explicitly rejected in favor of a sibling folder.
- Compliance frameworks are inactive for this project, and the cockpit only surfaces existing project data through an already-scoped token, so no compliance section is needed.
- Origin: 2026-05-28 buildscope session. The driving pain is eliminating the web-app/IDE context-switch during larger development sections; MCP transport chosen over HTTP for client security.
