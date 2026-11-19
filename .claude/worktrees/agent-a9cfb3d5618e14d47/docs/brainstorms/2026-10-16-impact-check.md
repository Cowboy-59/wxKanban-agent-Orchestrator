# Brainstorm: Impact check — dependency map and blast radius at the moment of change

- **Status:** closed
- **Opened / last updated:** 2026-10-16 / 2026-10-16
- **Source:** customer meeting notes, 2026-10-16 (group 1 of 4)
- **Asked for by:** one customer
- **Level:** senior

## The request

The customer described a recurring problem. Fixing one fault either breaks other code or uncovers
downstream faults that were hidden, and the AI does not look at the wider system before it changes a
line. They proposed three things:

- a dependency map of every module listing its ingress (what it depends on) and egress (what depends
  on it), ideally predicted before coding, kept as a sheet the AI can read (they suggested Excel)
- a protocol in which, before debugging or changing any code, the AI checks the map, predicts the
  blast radius, and proceeds defensively
- making that protocol standard practice

**The need behind it, as agreed:** whenever someone makes or proposes a change, show them the
dependent items it would affect, and either get their agreement or at least notify them.

## What already exists

| Item | Status | Evidence | Confidence |
|---|---|---|---|
| Module import graph: finds every file that depends on a changed file, through any chain of imports. Also handles migrations (tables altered), config, and env | Built (runs after the change, to choose retests) | `_wxAI/skills/wxCreateTestPlan/scripts/impact-graph.mjs` | Confirmed |
| Graph reads `.ts .tsx .js .jsx .mjs` only, and follows relative and `~/` imports only (an `@/` alias is treated as an outside package) | Limitation | `impact-graph.mjs:34`, `:85` | Confirmed |
| `project.report_change_impact`: flags which human test sign-offs a change invalidates | Built | `mcp-server/src/tools/test-lifecycle.ts:177`; `src/server/services/TestImpactService.ts:109` | Confirmed |
| /preTest step 0: maps changed code to requirements and test items | Built (runs after the change) | `.claude/commands/preTest.md:42` | Confirmed |
| Scope-to-scope dependencies: `project.set_scope_dependencies`, scope-flow-map, analyzescope cross-scope mode | Built (scope level only) | `mcp-server/src/server.ts:2152`; `.claude/skills/scope-flow-map/`; SCOPE-073 | Confirmed |
| Code fencing: maps every code unit to its scope and task | Built | SCOPE-026; `auditfences` | Confirmed |
| Cockpit file watcher that reacts to saves and calls the MCP | Built | `vscode-extension/src/services/scopeDepsWatcher.ts` (SCOPE-073 / T010) | Confirmed |
| Cockpit Explorer badges (FileDecorationProvider) | Built | `vscode-extension/src/providers/scopeDecorations.ts` (SCOPE-058 / T013) | Confirmed |
| Cockpit webview panels | Built | `vscode-extension/src/providers/detailPanel.ts` and two others | Confirmed |
| Stack adapters, plus a generator that builds a per-project adapter from `stack.md` | Built | `_wxAI/adapters/` (SCOPE-127): `wxkanban-express.md`, `dotnet-wpf.md`, `generate-adapter.mjs` | Confirmed |
| A step that checks dependents BEFORE changing code (`/implement`, `/autofix-tests`, any debug flow) | Not found | `implement.md:29-54` orders tasks only; `autofix-tests.md:38-51` says only "ensure fix doesn't break other tests" | Confirmed |
| A saved, readable map of each module's ingress and egress | Not found | No madge or dependency-cruiser; nothing writes the graph to a file | Confirmed |
| CodeLens, diagnostics (Problems), status bar items in the Cockpit | Not found | None of those VS Code APIs is used in `vscode-extension/src` | Confirmed |

**Measured in this repo:**
- 360 client-to-server calls are plain URL strings (`fetch("/api/…")`). None is an import edge.
- 61 server files import the schema; 39 use raw SQL strings.
- There are 0 `@/` alias imports.

**Stacks the kit offers** (`src/shared/stack-defaults.ts:113`), web only:
- 11 backends across 7 languages
- 10 frontends, all JS/TS, including `.vue`, `.svelte`, and `.astro` file types
- 8 databases, including MongoDB and Redis

Desktop and mobile have their own lists.

## Panel

Spoke: Lead Architect (chair), Domain Analyst, Backend, Database, Frontend, Security, QA,
Documentation · Sat out: Legacy, DevOps, Migration

## Decisions

| # | Item | Decision | Kind | To scope? | Date |
|---|---|---|---|---|---|
| 1 | The need | At the moment of a change, show the dependent items it would affect; the user agrees, or is at least notified. Three entry points: development changes (AI and human edits, bug fixes, `/implement`, `/autofix-tests`), scope generation (`/buildscope` creating or amending a scope), and wxBrainstorm (shown in the discussion only; written only when the user adds it to a scope or creates one). One shared impact check serves all three, so the list is the same wherever the change starts | Agreed | yes | 2026-10-16 |
| 2 | Who and how often | Every kit user, not only the customer who asked. Every change at the three entry points | Agreed | yes | 2026-10-16 |
| 3 | Reuse or build new | Reuse where possible, build what is needed to extend. **Reuse:** `impact-graph.mjs`, `report_change_impact`, fences, scope dependencies and scope-flow, the Cockpit watcher, badges, and panels, the SCOPE-127 adapters. **Build:** move `impact-graph.mjs` out of wxCreateTestPlan into one shared kit script (it must land in both kit script locations, since customers run the orchestrator's copy), add the forward direction, the new link types, the hook, the Cockpit views, and the `/buildscope` and wxBrainstorm steps | Agreed | yes | 2026-10-16 |
| 4 | Release shape | A minimal first release (shared script, hook in notify mode, `/buildscope` step, wxBrainstorm step, status bar), with the rest in later releases | Agreed, then replaced by 4b | — | 2026-10-16 |
| 4b | Release shape (replaces 4) | **One complete release for the whole area, no partial.** A partial release only starts more suggestions to finish what was already agreed. It includes every item below | Changed | yes | 2026-10-16 |
| 5a + 5b | What counts as a link | Eight link types, each with a confidence label: (1) imports, both directions, resolving tsconfig and Vite aliases (Confirmed); (2) which exported function is used, via TypeScript find-references (Confirmed); (3) client URL to server route, matching call URLs to Express route paths and mount prefixes (Likely); (4) code to table, read or write: Drizzle calls (Confirmed), raw SQL table names (Likely); (5) table to table through foreign keys (Confirmed); (6) migration to tables (already built; Confirmed); (7) named strings (MCP tool names, event and job names, env vars, config keys), from definition to use (Likely); (8) code to scope through fences (Confirmed). The fast file-level check runs for every notify; the precise function-level check runs at the "ask" moment. **Shared table** = a table one scope's code writes and another scope's code reads or writes, worked out through fences. Every report states which link types it checked | Agreed | yes | 2026-10-16 |
| 5c | Where the protocol lives | A Claude Code PreToolUse hook runs the check before every AI Edit/Write. `/buildscope` and wxBrainstorm get an impact step. Not a document the AI may never load | Agreed | yes | 2026-10-16 |
| 5d | The view | `.wxai/impact.json` (plus a readable summary) is what the AI reads; the hook writes it and the Cockpit watches it. People get every VS Code layer: a status bar count (click for details), Explorer badges on every file the change reaches, Problems entries on the changed code, CodeLens on every fence ("used by N files · N scopes"), and the "agree" panel (affected list, a small diagram, Agree / Cancel or Undo). The panel opens by itself only at the ask moment, otherwise on click | Agreed | yes | 2026-10-16 |
| 5e | A map predicted before coding | Folded into 1. At scope generation the code may not exist yet, so the impact there is scope level plus the code already fenced to those scopes. The customer's hand-kept Excel sheet is replaced by a map generated from the code and the VS Code views | Changed | yes | 2026-10-16 |
| 5f | Agree or just notify | **Notify** on every change. **Ask to agree** when a change reaches another scope's code, touches a shared table, or undoes a human test sign-off. **Always stop** on possible data loss (a drop, a destructive migration), even unattended. **Unattended runs** (wxG-O-D `--create`, overnight) never wait: they log each crossing, continue, and list them at the next checkpoint; under the Remote Session Bridge the question goes to the phone. `/buildscope` amend always asks; wxBrainstorm shows only. **AI edits:** the hook denies with the impact list as the reason, so Claude must stop and ask in chat, then records the yes so the edit goes through. This works even in bypass mode, and must be proven in a live run. **Human edits:** VS Code cannot block a save, so the panel opens on save with Agree or Undo; unanswered crossings stay in the status bar. **Who decides:** the project owner, with one setting in `.wxai/project.json` (`notify` / `boundaries` (default) / `always`). Every Agree is logged (who, when, the list) as change-management evidence (SOC 2 CC8.1) | Added | yes | 2026-10-16 |
| 5g | Which stacks | Every stack the kit offers is covered in the one release. **All JS/TS stacks natively, Confirmed**, adding `.vue`, `.svelte`, and `.astro` files, plus Drizzle and raw SQL. **Every other offered stack** (Python, Ruby, Go, Java, PHP, .NET, desktop, mobile) through a new "links" section in its SCOPE-127 stack adapter, labeled Likely until that adapter passes a proof fixture (a small sample project), then Confirmed. **A generic text-match fallback** for anything else, labeled Likely: never "not supported", never "0 affected". MongoDB is reported as collections, with the foreign-key link marked as not applicable | Added | yes | 2026-10-16 |
| 6 | Fit and priority | Now, as **one new umbrella scope** that references SCOPE-026, -058, -073, -111, and -127 rather than amendments spread across them (`/buildscope`'s reuse check has the final say). It follows the in-flight releases; the pending push was done 2026-10-16 (`6d26edcc`) | Agreed | yes | 2026-10-16 |
| P1 | Overnight testing (group 4) | Overnight testing could choose each night's functions from the impact list (what the day's changes reached) instead of a blind rotation | Parked → group 4 | no | 2026-10-16 |

## Risks to carry into the scope

- **Hook "ask" in bypass mode.** Bypass has silently skipped gates in this project before. Use "deny with reason" and prove it in a live run, not only in tests.
- **Two kit script locations.** The shared impact script must ship where customers' entry points look for it.
- **`/buildscope`'s method is served from the MCP server.** Its impact step reaches users only after a push, and a push deploys.
- **Hook performance.** Scanning up to 5,000 files before every AI edit is too slow. Cache the import index in `.wxai/` and update it as files change.
- **Three release channels.** App and MCP (push), kit (orchestrator release), Cockpit (VSIX publish). Publish all three together.
- **A partial list that looks complete is worse than none.** Every report states which link types it checked and labels every link with its confidence.

## Open items

None for group 1. Groups 2 (skill files as onboarding), 3 (generated onboarding videos), and 4
(overnight automated testing) from the same meeting are still to be brainstormed, each in its own
record.

## Next step

**Done (SCOPE-137):**

- `/buildscope --from-md` built the new umbrella scope
  `specs/Project-Scope/137-change-impact-check.md`, plus its checklist.
- `/validateScope` passed: valid, score 93, no blocking issues.
- Every decision row above marked "yes" is carried into SCOPE-137.

**Clarifications from the `/buildscope` interview:**

- The canonical terms are **Change Impact** and **Impact Boundary**, now in `CONTEXT.md`. "Blast
  radius" already means secret rotation there.
- A self-agreement on a hand edit is recorded as an acknowledgment, not an independent approval
  (SOC 2 CC5.2).
- The agreement log lives in wxKanban, through the MCP, with an offline queue.
- It reuses the `events` table, so no DDL is needed. The app gets a Change Impact tab.

**Not yet done:**

- `/createSpecs` (only on request).
- The scope exists only on disk until `create_specs` runs.
