# Tasks: Change Impact Check

Source of truth for status is the DB (spec `3460f991-9583-49e0-98ec-e13ac836d18a`). Fences use
`[SCOPE 137 / Tnnn]`.

## Task table

| Task | Title | FRs | Priority | Status |
|---|---|---|---|---|
| T001 | Shared Change Impact engine | FR-001 | high | todo |
| T002 | Imports both directions, aliases, and SFC file types | FR-002 (1), FR-005 | high | todo |
| T003 | Function-level references and the cached index | FR-002 (2), FR-003 | high | todo |
| T004 | Client URL to server route links | FR-002 (3) | high | todo |
| T005 | Data links: code to table, foreign keys, migrations | FR-002 (4)–(6) | high | todo |
| T006 | Named-string links and code-to-scope via fences | FR-002 (7)–(8) | high | todo |
| T007 | Honest reports and every offered stack | FR-004, FR-005 | high | todo |
| T008 | Impact Boundary, data-loss detection and impactMode | FR-006, FR-007 | high | todo |
| T009 | Claude Code PreToolUse hook for AI edits | FR-008 | critical | todo |
| T010 | Unattended runs | FR-009 | high | todo |
| T011 | Cockpit views and the agree panel | FR-010 | high | todo |
| T012 | /buildscope impact step | FR-011 | medium | todo |
| T013 | wxBrainstorm impact step | FR-012 | medium | todo |
| T014 | Agreement log, offline queue, app tab | FR-013 | high | todo |
| T015 | Proof fixtures and the adapter validator rule | FR-014 | high | todo |
| T016 | Verify: live bypass-mode run, performance, suites, fences | SC-1..SC-8 | critical | todo |
| T017 | Release on all three channels and live verification | — | medium | todo |
| T018 | Amendment A: AI edits made through Bash | FR-008a | high | done |
| T019 | Amendment A: the owner sets impactMode in wxKanban | FR-007a | high | done |
| T020 | Amendment B: Git Bash drive paths judged | FR-008b | critical | done |
| T021 | Amendment B: a shared name reaches another scope only from its definition | FR-006a | high | done |
| T022 | Amendment C: Impact Boundary and agree-panel prompts also post to chat | FR-010a | high | todo |

## Details

### T001 — Shared Change Impact engine (FR-001)

Move `impact-graph.mjs` out of `_wxAI/skills/wxCreateTestPlan/scripts/` into one shared kit script that every entry point calls (hook, Cockpit, /buildscope, wxBrainstorm). Land it in **both** kit script locations (repo `scripts/` lineage and the orchestrator copy customers run). Write `.wxai/impact.json` plus a readable summary per run. `project.report_change_impact` retest selection must produce identical results on its existing tests after the move.

### T002 — Imports both directions, aliases, and SFC file types (FR-002 (1), FR-005)

Keep forward (depends-on) and reverse (dependents) import edges. Resolve tsconfig `paths` and Vite aliases (`@/`) — today `impact-graph.mjs:85` treats them as external packages. Read `.vue`, `.svelte`, `.astro` in addition to `.ts .tsx .js .jsx .mjs` (`impact-graph.mjs:34`).

### T003 — Function-level references and the cached index (FR-002 (2), FR-003)

TypeScript language-service find-references for which exported function is used, run at the ask moment only. Cache the import index in `.wxai/impact-index/` and refresh incrementally, including after changes made outside the editor (git checkout). Target SC-2: <= 2 s p95 added per AI edit on 5,000 files with a warm cache.

### T004 — Client URL to server route links (FR-002 (3))

Match client `fetch`/api URL strings (including template parts) to Express route paths with their mount prefixes. 360 such calls exist in this repo's `src/client`. Label Likely.

### T005 — Data links: code to table, foreign keys, migrations (FR-002 (4)–(6))

Drizzle reads (`from`, `query.x`) and writes (`insert`, `update`, `delete`) as Confirmed; raw SQL table names (`sql\``, `.unsafe(`, `client.query(` — 39 server files here) as Likely; table-to-table foreign keys from the schema; migration-to-tables from the existing `impact-graph.mjs` extraction (lines 179–238).

### T006 — Named-string links and code-to-scope via fences (FR-002 (7)–(8))

Link definition and use sites of MCP tool names, event and job names, env vars and config keys (Likely). Map every file and block to its scope through `[SCOPE nnn / Tnnn]` fences (Confirmed). Fences are read only, never written.

### T007 — Honest reports and every offered stack (FR-004, FR-005)

Every report lists checked and unchecked link types; an unread file type is reported as not read, never 0 affected. Add a `links` section to the SCOPE-127 adapter format and adapters for each offered stack (`src/shared/stack-defaults.ts:113`); generic text-match fallback (Likely); MongoDB reported as collections with foreign keys not applicable.

### T008 — Impact Boundary, data-loss detection and impactMode (FR-006, FR-007)

Boundaries: another scope's code (fences), a shared table (written by one scope, read or written by another), a human sign-off (`report_change_impact` with `dryRun: true`, which runs the same matching and writes nothing). Possible data loss: drop table or column, destructive migration, mass delete. `impactMode` notify | boundaries (default) | always in `.wxai/project.json`; data loss stops in every mode.

### T009 — Claude Code PreToolUse hook for AI edits (FR-008)

Kit-installed hook on Edit, Write, MultiEdit, NotebookEdit. Notify: pass the impact as context. Boundary: **deny with the impact list as the reason** (not `ask` — bypass mode has silently skipped gates here before); Claude asks in chat; the yes is recorded as an approval bound to file + change hash; the retried edit is allowed; approvals never carry over.

**As built (2026-10-17):** `_wxAI/impact/hook.mjs` (the hook), `approve.mjs` (records the developer's answer with their own words; `--data-loss` required for a data-loss change), `lib/approvals.mjs` (pending changes and single-use approvals, void after 30 minutes), `install-hook.mjs` (idempotent install, `--check`, `--uninstall`; touches only its own entry). The hook never answers allow or ask: no opinion leaves the normal permission flow untouched. Possible data loss is checked first, from the new content alone, so a slow impact check cannot let it through. Sign-offs are asked with the read-only dry run. **Customer install still to wire:** consumers run the orchestrator repo's `scripts/upgrade-kit.mjs` and `init.mjs`, so the `installHook` call goes there in T017 (cross-repo); the Cockpit also installs it on activation (T011). The live bypass-mode proof (SC-3) is T016.

### T010 — Unattended runs (FR-009)

Detect wxG-O-D `--create`, the Remote Session Bridge and other non-interactive runs: log each crossing as `change_impact_crossing` and continue; list all crossings at the next checkpoint; possible data loss always stops, relayed to the phone under the Remote Session Bridge.

**As built (2026-10-17):** a run is unattended when `WXAI_UNATTENDED=1` (the Remote Session Bridge sets it with `WXAI_REMOTE=1` on its SDK session; CI and other non-interactive runs set it themselves), or when `node _wxAI/impact/unattended.mjs start --by <who>` has written `.wxai/impact-unattended.json` (wxG-O-D `--create`, N11; re-run after every `--resume`). The marker binds to the first session that uses it and expires after 12 hours, so a crashed run cannot silence a later, attended session. Crossings and data-loss stops go to `.wxai/impact-crossings.jsonl`; `unattended.mjs checkpoint` lists everything since the last checkpoint exactly once and says 0 outright (wxG-O-D N9 includes it in every `--create` checkpoint). Under the bridge, a data-loss denial tells Claude to ask in the room, which relays to the phone. A non-interactive run that sets neither signal is treated as attended: it is denied at a boundary and stops, which fails safe.

### T011 — Cockpit views and the agree panel (FR-010)

Watcher on `.wxai/impact.json` (SCOPE-073 `scopeDepsWatcher` pattern); status bar count; Explorer badges (SCOPE-058 `scopeDecorations` FileDecorationProvider pattern); Information-level DiagnosticCollection; CodeLens on fence lines; agree panel webview (`detailPanel` pattern) with list, small diagram, Agree / Undo; opens by itself only at a boundary; views update within 3 s of a save.

**As built (2026-10-17):** `vscode-extension/src/services/impactModel.ts` (pure rules, unit-tested), `impactRunner.ts` (runs the kit scripts), `providers/impactViews.ts` (status bar, badges, Problems, fence CodeLens, agree panel, save listeners), registered in `extension.ts`; commands `wxkanban.impact.showPanel`, `installHook`, `uninstallHook`. A hand save is checked against the file as it was just before the save (new engine flag `--before`). Agree and Undo are recorded through the new `_wxAI/impact/acknowledge.mjs` as acknowledgments. Undo writes the pre-save content back; for a file the save created, it moves the file to the trash. A data-loss Agree needs an explicit "may lose data" tick. The CodeLens counts come from the new `_wxAI/impact/fence-usage.mjs` (one run per file, about 0.5 s). An AI edit the hook already settled is recognized by its content hash, so it is not asked again. The Cockpit installs the hook on activation when it is missing or stale (FR-008). Also fixed: the fence reader now takes only line-start comments, as auditfences does; fence text inside test strings had credited SCOPE-010/020/026/031/058. The facts cache moves to version 3. **Not done:** the owner-only rule for `impactMode` (FR-007) has no enforcement point. The Cockpit summary carries no role, so it stays a review rule on `.wxai/project.json`. The live 3-second timing check is in T016.

### T012 — /buildscope impact step (FR-011)

In `mcp-server/src/prompts/buildscope.md` (MCP-served, so live only after push): on edit or amend, list implementing specs, fenced code and dependent scopes, ask before writing, log the answer to the agreement log.

**As built (2026-10-17):** `_wxAI/impact/scope-impact.mjs NNN` lists the implementing specs (from `**Implemented By**`, `**Implements**: SCOPE-NNN`, or the older `**Parent Scope**: spec NNN`), the code fenced to the scope, and the scopes whose `**Depends On**` names it. Fences carry the SPEC folder number, so the fenced code is found through the implementing specs as well as the scope's own number. A legacy 1:1 scope with no scope file falls back to its spec folder. `--record` logs the answer as an approval with entry point `buildscope`, the developer's words, and the draft's hash. Edit Mode in `buildscope.md` runs it between drafting and writing. A "no" writes nothing. Under wxG-O-D `--create`, G.O.D. answers only when the approved design calls for the amendment. Older kits without the script list the same three things by hand and still ask.

**T013 as built (2026-10-17):** wxBrainstorm step 3 adds **What changing it would reach**, using `scope-impact.mjs NNN --no-cache` and `change-impact.mjs --changed … --no-write --no-cache --summary`. Both write nothing, which a test proves on a temp project. The engine CLI gained `--no-write` and `--summary`.

### T013 — wxBrainstorm impact step (FR-012)

`.claude/skills/wxBrainstorm/SKILL.md` step 3 runs the engine when a topic would change existing work and shows the impact list with confidence labels, in discussion only; nothing is written.

### T014 — Agreement log, offline queue, app tab (FR-013)

Extend the Zod `ProjectEventTypeSchema` (`mcp-server/src/utils/schemas.ts`) with `change_impact_ack`, `change_impact_approval`, `change_impact_crossing` and their metadata shape (no DDL — `events.type` is varchar(50)). Offline queue `.wxai/impact-queue.jsonl` with resend. Immutability test: no update/delete path. `GET /api/projects/:projectId/scopes/:scopeNumber/change-impact` and a read-only Change Impact tab in scope detail.

**As built (2026-10-17):** the route is `GET /api/projects/:id/scopes/:scopeid/change-impact` (scope UUID, matching the existing scope routes; the number is looked up and matched against each record's `metadata.scopes`). The app has no tabbed scope detail, so the log is a collapsible, read-only "Change Impact log" section in the expanded scope row of the project panel. A record the server refuses is set aside in `.wxai/impact-queue.rejected.jsonl` (kept, never deleted) so it cannot block the queue.

### T015 — Proof fixtures and the adapter validator rule (FR-014)

JS/TS fixture project with seeded links of all eight types (SC-1); one fixture per adapter; `_wxAI/adapters/validate-adapter.mjs` refuses the Confirmed label until that adapter's fixture passes (SC-8).

### T016 — Verify: live bypass-mode run, performance, suites, fences (SC-1..SC-8)

Live Claude Code run in bypass mode proving SC-3; SC-2 timing on a 5,000-file repo; SC-6 offline-queue test; SC-5 data-loss stop attended and unattended; full build and test suites; `auditfences` on the changed files.

### T017 — Release on all three channels and live verification (—)

Push app + MCP and probe the hosted MCP with a new event type (an App Runner rollback is silent); orchestrator kit release with the engine verified in the published asset; Cockpit VSIX publish verified in the downloaded package.

### T018 — Amendment A: AI edits made through Bash (FR-008a)

The hook also runs before Bash. `_wxAI/impact/lib/shell.mjs` reads the command (redirects, tee, sed -i, perl -i, cp/mv/install destinations, rm, truncate, git checkout/restore, PowerShell Set-Content/Out-File/Add-Content) and finds SQL sent through a database client, inline or by -f. Written files are judged like an edit at file level; SQL is checked for possible data loss. The approval binds to the exact command text. `HOOK_MATCHER` gains Bash, so existing installs report stale and are updated by init or the Cockpit.

### T019 — Amendment A: the owner sets impactMode in wxKanban (FR-007a)

Project settings control, owner or company administrator only (403 otherwise). Each change is an `impact_mode_set` event (no DDL). `project.cockpit_summary` returns the mode; the kit caches it in `.wxai/impact-mode.json`, refreshed by the hook at most hourly with a short timeout. A hand-edited local value is ignored when the owner value is known, and the report says so.

### T022 — Amendment C: Impact Boundary and agree-panel prompts also post to chat (FR-010a)

`providers/impactViews.ts`'s self-opening agree panel and `_wxAI/impact/unattended.mjs`'s crossing log each gain a chat post alongside their existing VS Code-native and status-bar/phone relay, carrying the same affected list and confidence labels FR-002 already produces, in the shape FR-008's hook already posts to chat for an attended AI edit. Whichever surface (VS Code panel or chat) the developer answers first resolves the prompt on both, via the same single-use approval record `approve.mjs`/`acknowledge.mjs` already key on file + change hash — no second approval path, no duplicate agreement-log entry. The on-click (not self-opening) agree panel case is unaffected. FR-009's "0 waits" guarantee for unattended runs is unaffected — the chat post there is informational, exactly as the existing status-bar/phone relay already is.
