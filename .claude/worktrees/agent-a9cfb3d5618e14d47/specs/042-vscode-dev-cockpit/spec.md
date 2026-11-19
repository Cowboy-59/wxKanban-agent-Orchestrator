# Spec 042: VS Code Dev Cockpit

**Spec Number**: 042
**Status**: `implementation` (all 34 tasks complete 2026-05-28; ready for QA)
**Created**: 2026-05-28
**Source Scope**: `specs/Project-Scope/042-vscode-dev-cockpit.md`
**Plan**: [plan.md](plan.md) | **Tasks**: [tasks.md](tasks.md)
**Depends On**: 028 (Hosted MCP Deployment — MCP transport + project-scoped API tokens), 019 (Agent Orchestrator Kit — download/init/upgrade flows, McpClient, project resolution), 026 (Code Fencing), 029 (Dbpush Blocking Contract — dbpush completion as a refresh trigger)
**Downstream**: bug-report scope (next; consumes the reserved bug-panel slot)

---

## Overview

A read-only VS Code sidebar — the **Dev Cockpit** — that shows the currently linked project's *remaining work* without leaving the editor. It lists the project's in-flight scopes, each with its incomplete tasks and a remaining count, with the active scope pinned at the top. It stays live in both directions: new scopes/specs/tasks appear right after a `dbpush`, and remaining counts drop as tasks are completed (including when the AI finishes a batch during `implement`). It reads exclusively through the hosted, project-scoped **MCP**.

## Business Problem

The kit already creates and stores everything to wxKanban, but there is no in-editor view of what's unfinished. To see what's left in a scope during a larger development section, a developer must keep the web app open alongside VS Code and flip between them — a constant context-switch that breaks flow and makes it easy to lose track of remaining work. The platform needs the IDE itself to answer "what's left to finish in this project?" so the developer never leaves the editor. MCP is chosen as the transport (over the app REST API) for client security: it is the already-hosted, token-native, audited channel, so no new HTTP surface is exposed to customers.

## Actors

- **Primary**: The developer using the kit — opens the project in VS Code and wants to see, at a glance, what remains in each scope and pick up the next piece of work.
- **Secondary**: The AI assistant (Claude Code) working in the IDE — completes task batches during `implement` and creates items during `dbpush`; the cockpit reflects its progress live (US2, FR-006).
- **Secondary**: Other contributors (another developer, or a web-app user) — their task completions and newly created items surface in the cockpit through the catch-all refresh path (FR-006).

## Core Design

| Element | Value |
|---|---|
| **Primary Actor** | The developer using the kit (kit author today; any kit developer generally) |
| **Secondary Actors** | The AI assistant (Claude Code) — completes/creates work the cockpit reflects live; other contributors (another developer or web-app user) whose changes surface via the catch-all refresh |
| **Key Value** | Single pane of glass — the IDE both builds (via the kit) and shows what's left, live; no web-app/IDE flipping |
| **Transport** | MCP only (hosted, token-native, audited — chosen for client security); single-project scope; no app REST API exposure |
| **Scope Boundary** | IN: extension shell + Activity Bar sidebar; project resolution/linking; project-scoped API-token auth in SecretStorage (+ token bootstrap from the kit); single-project MCP read coverage with strict scoping + within-customer scope-leak fix; remaining-work-per-scope view (active scope pinned); live auto-refresh both directions; graceful empty/error states; read-only task detail + "open related spec/file"; install/update/activate via the kit lifecycle. OUT: bug queue + bug-fix handoff (→ next scope; reserved slot only); any write actions; monorepo restructure; new DB tables/migrations; cross-project or list-all-projects reads; exposing the app REST API; VS Code Marketplace distribution; output-channel/telemetry; unlink/kit-removal cleanup; extension↔backend version-compatibility handling. |

---

## Functional Requirements

### A. Extension Shell & Activation

**FR-001 — Extension shell and sidebar**
The extension contributes a "wxKanban" container in the VS Code Activity Bar with a "Dev Cockpit" view.
- Activating the extension adds the wxKanban container and the Dev Cockpit view.
- The view renders without error when a project is linked.
- Ships as a self-contained sibling `vscode-extension/` folder (own `package.json`/`tsconfig`/lockfile); no monorepo restructure and no root build changes.

**FR-011 — Auto-activate on a linked workspace**
Once installed, the cockpit activates on its own when the workspace is a linked project.
- Activation is keyed on the workspace containing a linked project (e.g. `workspaceContains` `.wxkanban-project.json` / on startup); no manual command needed.
- After install + the normal reload, opening the project shows the cockpit live.

### B. Project Linking & Authentication

**FR-002 — Project resolution / linking**
The cockpit determines which wxKanban project the open workspace maps to, mirroring the server's resolution order.
- Resolves `projectId` using: explicit setting → `WXKANBAN_PROJECT_ID` (env/`.env`) → walk-up to the nearest `.wxkanban-project.json` top-level `projectId`.
- The resolved `projectId` must be a valid UUID; lifecycle stage and active scope are read from `.wxai/project.json`.
- The stale test fixture (`tools/.wxkanban-project.json`, `projectId: test-project-123`) and any invalid id are rejected and treated as "not linked."

**FR-003 — Authentication via project-scoped API token**
The cockpit authenticates with a long-lived project-scoped API token, not a browser session.
- The token is stored in VS Code SecretStorage (never plaintext settings or files).
- On first run / right after kit init, the cockpit imports the token from the kit's location (`.wxai/project.json` `kit.apiToken` or `WXKANBAN_API_TOKEN`) into SecretStorage.
- Requests send `Authorization: Bearer <token>`.
- A missing/invalid/expired token drives the "sign-in needed" state (FR-007).

### C. MCP Read Coverage & Scoping

**FR-004 — MCP read coverage for the current project, strictly scoped**
The MCP serves the cockpit's reads for the current linked project only — it never lists or returns other projects.
- For the current project, the MCP returns its scopes/specs with their tasks grouped by phase, plus each task's status (by extending `project.list_open_items`, or a small project-scoped cockpit read tool — decided in the plan).
- All reads are bounded to the token's project and customer; the known within-customer scope-leak is fixed so a token can never see a sibling project under the same customer.
- No list-all-projects or cross-project tool is added — single-project by design.
- Existing MCP tools are unaffected (additive).

### D. Cockpit View & Detail

**FR-005 — Remaining-work-per-scope view**
For the linked project, the cockpit shows the in-flight scopes, each with its unfinished work.
- Each scope node shows a count of incomplete tasks and lists them under that scope. (Amended 2026-05-28 — see Constraints & Notes: `projecttasks` has no per-task phase column and "no new DB tables" is an explicit boundary, so tasks group by scope, not by phase.)
- "Incomplete" is defined against the project task status set (exact statuses confirmed in the plan); completed tasks are excluded.
- The active scope (from `.wxai/project.json`) is pinned/highlighted at the top, with the project's other scopes below it.
- Data comes from the current-project MCP read tool (FR-004); no new data model is introduced.

**FR-008 — Read-only item detail**
Selecting an item shows its detail in a panel.
- Clicking a task opens its detail (title, description, status, phase) read-only, sourced from the MCP payload.
- An action to open the related spec/file in the editor is available.
- No edits are possible from the detail panel in v1.

### E. Live Refresh

**FR-006 — Live auto-refresh, both directions**
The cockpit updates on its own as work is created and completed.
- After a `dbpush` completes in the IDE, newly created scopes/specs/tasks appear without manual action.
- When a task is completed — including the AI finishing a batch during `implement` — the remaining count drops without manual action.
- Primary mechanism is a local in-IDE signal that triggers a re-query of MCP; a light MCP poll is the fallback for changes made elsewhere; a manual refresh control is always available.

### F. Resilience

**FR-007 — Graceful empty and error states**
The cockpit never fails silently or shows wrong data.
- No project resolved → "no project linked" with brief instructions to link.
- No/invalid token → "sign-in needed" with how to authenticate.
- Linked with nothing unfinished → an "all caught up" empty state (not an error).
- MCP unreachable → a clear error with a retry action.

### G. Kit Lifecycle Distribution

**FR-009 — Install the extension during kit init (new project)**
When a kit is downloaded and initialized for a new project, the bundled extension is installed into VS Code automatically.
- The extension (packaged as a `.vsix`) is included in the kit download payload.
- The init step installs it (e.g. via `code --install-extension`) with no manual step, handling/prompting the reload required to activate it.
- After init + reload, the extension is present and enabled.

**FR-010 — Update the extension on a checked-in kit upgrade**
When a kit upgrade is accepted/checked in, the bundled extension is updated to the version shipped with that kit.
- Accepting a kit upgrade installs/updates the extension to the matching version.
- The installed extension version stays in sync with the kit (tracked alongside `kitVersion`).
- An unchanged extension version is a no-op (no needless reinstall).

**FR-012 — Opportunistic version check + self-heal at refresh time**
Whenever the kit emits a cockpit refresh (on `dbpush`/`implement` completion), it also verifies the installed cockpit matches the version bundled with the kit, and updates it if it does not — so a stale cockpit self-heals even if the user never re-ran init/upgrade (FR-009/FR-010).
- Reads the installed version via `code --list-extensions --show-versions` (matching `wxperts.wxkanban-dev-cockpit@x.y.z`) and compares to the bundled VSIX version (`vscode-extension/package.json` → `version`).
- If missing or older, installs the bundled `.vsix` (`code --install-extension <vsix> --force`); if equal, no-op (no reinstall, no reload prompt). A newer-installed-than-bundled cockpit is left untouched — never downgrades.
- Strictly best-effort, exactly like `emitCockpitRefresh` (FR-006): `code` not on PATH, no window open, or a non-VS-Code consumer must never affect the triggering command's exit status. Disabled by `WXKANBAN_NO_COCKPIT_REFRESH` or the dedicated `WXKANBAN_NO_COCKPIT_UPDATE`.
- Throttled to at most once per kit process/session (the bundled version cannot change mid-process), so it does not shell out on every `dbpush`.
- Complements FR-009/FR-010 (the init/upgrade install path) rather than replacing them; same bundled artifact, same version-sync intent.

---

## Success Criteria

- **SC-1**: Opening the linked project shows the current project's remaining work (incomplete tasks grouped by scope, active scope pinned) within a few seconds (target < 3s), with the web app closed.
- **SC-2**: After a `dbpush` completes in the IDE, newly created scopes/specs/tasks appear in the cockpit within a few seconds, no manual refresh.
- **SC-3**: When a task is completed (including the AI finishing a batch during `implement`), its scope's remaining count drops without a manual refresh.
- **SC-4**: An access test confirms a token for one project cannot surface another project's or a sibling project's data through any cockpit read path.
- **SC-5**: A fresh kit download + init installs and activates the extension with no manual install step; an accepted kit upgrade updates it to the kit-matched version.
- **SC-6**: Each failure state — no project linked, sign-in needed, all caught up, MCP unreachable — shows a clear message instead of wrong or blank data.

---

## Key Entities

None. The cockpit is read-only and introduces no new DB tables or migrations; it consumes existing scopes/specs/tasks via MCP.

---

## Constraints & Notes

- KISS, read-only v1; no write actions.
- No monorepo restructure (sibling `vscode-extension/` folder); no new DB tables; single-project only.
- MCP-first transport chosen for client security; the within-customer scope-leak is fixed as part of this scope.
- Project-scoped token in SecretStorage only — never logged or written in cleartext.
- Code-fencing (spec 026): all top-level code in `vscode-extension/` carries `[SCOPE 042 / Tnn]` fences; `auditfences` CI must cover the new folder.
- Orchestrator-first; distribution internal (`.vsix`, not Marketplace); TypeScript 100% (no `any`), Pino logging on the MCP side, no `console.log`.
- Deferred to next scope: the bug queue + "select a bug → AI fixes it" handoff (reserved UI slot only).
- Renamed from "mono-repo-VS-Code"; the monorepo approach was explicitly rejected. Compliance frameworks inactive — no compliance section required.

### Amendments (2026-05-28, during implementation)

- **FR-005 grouping → by scope, not by phase.** `projecttasks` has no per-task phase column (tasks link to a spec via `specId`; lifecycle phases live in the separate `projectphases` table), and "no new DB tables/migrations" is an explicit OUT boundary. So the cockpit groups incomplete tasks under their owning scope, active scope pinned. SC-1 already stated "grouped by scope"; FR-005 and the Overview were aligned to match.
- **FR-006 refresh mechanism (T020) → emitted VS Code command.** The kit pings `vscode://wxperts.wxkanban-dev-cockpit/refresh` (best-effort `code --open-url`) on `dbpush`/`implement` completion; the extension registers a URI handler. A visible-only 30s poll (T022) is the fallback for out-of-IDE changes; hosted-MCP streamable-HTTP push was evaluated and not adopted for v1.
- **FR-004 read tool (T001) → dedicated `project.cockpit_summary`** rather than enriching `project.list_open_items`. Reads are bound to the token's project via `selectScoped` plus an explicit scope assertion.
- **FR-009/FR-010 distribution insertion point → `scripts/init.mjs`.** A single version-aware install step there covers both fresh install and upgrade, because `upgrade-kit.mjs` re-runs `init.mjs`. The `.vsix` is rebuilt from mirrored source by `build-release.mjs` and only the artifact is packed.

### Amendments (2026-05-29, post-implementation defect)

- **FR-006 / SC-3 were only half-implemented — added T036 + T037.** Validation against the live DB found 34 spec-042 tasks marked `done` in tasks.md but still `todo` in `projecttasks`, so the cockpit's remaining count never dropped. Root cause: T021 shipped the *refresh ping* (`emitCockpitRefresh`) but the write-back it pings for was never built — `implement` never wrote `projecttasks.status`, and `dbpush` explicitly **deferred** task-status sync (`pushExistingSpec`: "Task status sync deferred — needs T-ID → UUID resolution on the MCP side"; `taskStatusUpdated` was a stub always 0). Net: task status was written only once, at create time, frozen at the tasks.md status of first push.
  - **T037** implements the deferred write-back: kit `syncTaskStatuses()` resolves DB task UUIDs via `project.cockpit_summary` (no markdown T-ID needed) and flips completed tasks to `done` via `project.update_task_status`. Wired into `dbpush` (`pushExistingSpec`) and `implement` batch-completion so "completing tasks (grouped or single) dbpushes automatically." Best-effort: a missing token / unreachable MCP never fails the command.
  - **T036** scope-binds `project.update_task_status` (was a raw `db.update(...).where(eq(id))` with no project filter — a within-customer write-side leak, the same class T003 fixed on the read side, and a spec-028 T011 direct-`db.update` violation). Now routes through `scoped.updateScoped`.
  - The 34 stale rows were reconciled to `done` out-of-band (`scripts/reconcile-task-status.mjs`); spec 024's 10 remaining are legitimate (`- [ ]` unchecked in its tasks.md).

### Amendment 2026-06-03 — Help / Commands section

The Dev Cockpit gains a **"Help — Commands"** section at the bottom of the tree that lists the kit's slash commands with a one-line excerpt of what each does, so users (especially career-changers learning the lifecycle) can discover the vocabulary without leaving the editor.

- **FR-H1 — Command catalog from the project.** The section is sourced **dynamically** from the project's `_wxAI/commands/*.md` files (the actual slash commands shipped to the workspace), so it auto-updates as commands change — no hand-maintained list. Each command's excerpt is extracted from the file's front-matter `description:`, else the first `## Purpose` paragraph, else the first body line. `ENFORCEMENT_SUMMARY`/`README` docs are skipped.
- **FR-H2 — Standard vs Extended grouping.** Commands split into two collapsible sub-groups: **Standard** (the core lifecycle set — buildscope, createspecs, implement, wxConversion, dbpush, validatescope, createtesttasks, runqa, runhuman, prepareRelease, finalizeRelease) and **Extended** (every remaining `_wxAI` command).
- **FR-H3 — Always available, offline.** The section renders in every cockpit state (including no-token / unreachable-MCP), since it reads local files only; it is omitted only when no `_wxAI/commands` directory is found.
- **FR-H4 — Click opens the command doc.** Clicking a command opens its `_wxAI/commands/<name>.md` doc; if the file can't be opened, the excerpt is shown in an info message. Read-only — the section never mutates anything.

### Amendment 2026-06-08 — Opportunistic cockpit self-update (FR-012, T038)

FR-009/FR-010 install/update the cockpit only at kit init and at an accepted kit upgrade. That leaves a gap: a developer who installed an older `.vsix` by hand, or skipped the upgrade re-run, keeps running a stale cockpit indefinitely. **FR-012** closes it by piggybacking on the existing `emitCockpitRefresh` hook (T021) — already fired on every `dbpush`/`implement` completion — to also compare the installed cockpit version against the bundled VSIX and `--force` install the bundle when the installed copy is missing or older. It is best-effort and once-per-process (same disable env as the refresh ping, plus `WXKANBAN_NO_COCKPIT_UPDATE`), never downgrades a newer installed cockpit, and is a true no-op when versions match. Implemented in `core/orchestrator/cockpit-refresh.ts` alongside `emitCockpitRefresh` (**T038**).

### Amendment 2026-06-08 — Help / Videos section

The Dev Cockpit gains a **"Help — Videos"** section at the bottom of the tree (a sibling of "Help — Commands"), surfacing the how-to videos already published on the public landing-page Docs (Scope 044). It lets a developer discover and watch a walkthrough without leaving the editor — reinforcing the kit's educational mission for career-changers learning the lifecycle.

- **FR-V1 — Catalog from the public docs index.** The section is sourced from the public, unauthenticated docs index (`GET /api/help/docs`, Scope 044), filtered to docs that carry a video. Scope 044's index response is extended to include `videourl` (the same public-read S3 URL already exposed on the `/api/help/docs/:slug` detail endpoint — no new exposure) so the cockpit can filter client-side. Each item shows the doc title plus a single-line, shortened version of its `summary`.
- **FR-V2 — Public host, configurable.** The docs index/page host defaults to `https://wxkanban.wxperts.com` and is overridable via `WXKANBAN_DOCS_BASE_URL` (mirroring the `WXKANBAN_MCP_BASE_URL` precedence). The fetch is unauthenticated — the docs index is public — so the section is independent of the project token.
- **FR-V3 — Best-effort, offline-tolerant.** The catalog is fetched best-effort and cached until the next refresh; any failure (offline, non-2xx, malformed body, or no videos) silently omits the section and never affects the rest of the cockpit. Unlike "Help — Commands" (local files), this section requires network reachability to the docs host.
- **FR-V4 — Click opens the docs page in the browser.** Clicking a video opens its public `/docs/<slug>` page (embedded player + poster + written walkthrough, Scope 044's `DocsVideoPlayer`) in the external browser via `vscode.env.openExternal`. Read-only — the section never mutates anything.
