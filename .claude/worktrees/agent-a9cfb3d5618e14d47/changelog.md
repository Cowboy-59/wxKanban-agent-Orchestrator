# Changelog

All notable changes to the Claude Project Starter Kit will be documented here.

## Format Guide

- Entries are organized chronologically by date: `### Month Day, Year`
- Group related changes under section headings: `#### Section Name`
- Focus on key changes, new features, and functional improvements
- This is NOT a dump of git commits - document meaningful changes only

---

### Week of October 25 – November 1, 2026 (open until the final release)

Releases this week: none cut yet.

#### SPEC-150 — GO REMOTE is retired; HANDOFF REMOTE replaces it (kit, unreleased)

- **Retired: GO REMOTE and the plain `.env` bridge mode.** The remote bridge now runs only as the project's Project Agent, started from the Dev Cockpit or with `npm run remote`, which now takes the same project-agent path.
- **Replacement: HANDOFF REMOTE** (or `/remote`, SPEC-149). It hands where the work stands to the already-connected Project Agent, which posts it to the project's room; it launches nothing.
- **No longer read:** `YAPPCHATT_ROOM`, `YAPPCHATT_TOKEN`, `YAPPCHATT_EMAIL`, their `WXKANBAN_*` aliases, `WXKANBAN_REMOTE_SEED` and `WXKANBAN_REMOTE_RESUME`. The kit shows one notice when your `.env` still sets them and never edits `.env`; you can delete them.
- G.O.D. now offers HANDOFF REMOTE when it runs unattended, instead of starting the old bridge.

---

### Week of October 18 – 25, 2026 (open until the final release)

Releases this week: app 1.5.344 → 1.5.352, kit v1.7.83 → v1.7.85, Cockpit 0.2.44 → 0.2.46.

#### SPEC-147 — Security: every System Administrator change is now recorded (Oct 25, app 1.5.352)

- **New: a durable record of every change a System Administrator makes.** Suspending a company, changing a user's role, resetting a password, deleting a company, editing settings, sending a newsletter, editing marketing content — all 87 SysAdmin routes that change data now leave one audit entry with who, what, when, the target, and the values before and after. Before this, none of them did.
- **Secrets never reach the record:** passwords, tokens, invite links and secret settings are stored as `[REDACTED]`.
- **New page: SysAdmin → Audit trail** (`/sysadmin/audit`), filterable by action, target, person and date. The Dashboard's Audit link, which led nowhere, now opens it.
- A route that changes data can no longer ship without being recorded: the build fails if one is missing from the list.
- Records are filed under the System Administrator's own company, so customers' audit views are unchanged.

#### SPEC-146 — Security: compliance and audit routes locked to the right role (Oct 25, app 1.5.351)

- **Fixed: any signed-in user could change the shared compliance rules.** Deleting, re-extracting or uploading the framework rule documents (SOC2, HIPAA, HITRUST, GDPR, NIST SSDF, ISO 27001), which every customer's compliance checks read, now needs a System Administrator. Nothing had been misused; the rows were all platform-owned.
- **Fixed: wxKanban's own self-audit, its results and its reports were open to every login.** Running, listing, downloading and approving them is now System Administrator only. Customers keep reading the framework rules and their compliance tasks; wxKanban's internal documents are no longer listed to them.
- **Fixed: another company's ADMIN could change a project's compliance frameworks** by naming its id. A project's settings now answer only to its own company (a consulting company with an engagement can read them, not change them).
- **Fixed: re-extracting a rule document duplicated its tasks.** It now replaces them, and refuses an extraction that finds none rather than emptying a framework.
- **Fixed: document search never ran** (another route was registered ahead of it).
- The Compliance tab no longer shows customers the Audit and Reports tabs or the Upload, Extract and Delete buttons. Every refusal is logged and every System Administrator change is recorded in the audit log.
- Verified on production: all 22 routes refuse anonymous callers, every role gets the expected answer, and the rules library is unchanged (565 tasks).

#### SPEC-037 — Consultants: assignment fix and "All projects" (Amendment A, Oct 25)

- **Fixed: a second whole-project assignment was refused.** Adding a whole project to an engagement that already had any active assignment failed with "An active assignment with these identifiers already exists", naming a different project. The duplicate check now matches the full project + scope + task, as the spec always required (FR-030).
- **New: "All projects" checkbox** on the Add assignment dialog's Whole project tab. One click grants the consulting company a whole-project assignment on every **active** project the client owns now, skipping ones it already has, and reports "N added; M already assigned". It is a one-time add, not a standing grant: projects created later are added the usual way (FR-031). One notification goes to the consulting company for the whole batch, and each row is audited to both companies.
- **Fixed: whole-project assignments were labelled "task"** on the engagement page (and "task undefined…" in the sub-assignment list). They now read "whole project" (T082).
- Verified live on production (HAS Enterprises → Wxperts LLC: 29 added, 1 skipped, re-run added nothing).

#### SPEC-044 — wxConversion Stage 3: schema parser keeps every source row (Amendment FR-011, Oct 25) — built, ships with the next kit release

- **Contributed fix from a customer (ShopMaster, feedback `2634b849`).** The schema step (`pcsoft-schema-to-sql.py`) now reads Array, JSON and UUID fields as their own records (array dimension, element type, width and format kept) instead of letting them swallow the field beside it, which had silently corrupted 79 records in their 303-table export. Every field keeps where it came from (source line, PDF pages, printed name). Anything unresolved, including cut-off or repeated column names, stops the run with exit 3 and a full list in `_unmapped-types.json`, rather than producing a schema with quiet gaps.
- **`--type-map` now answers Array, JSON and UUID too**, by exact label (`"Array of 7 Time (hhmm)=text"`) or for a whole family (`"Array=text"`), so a project with array fields can finish Stage 3 once the developer has chosen a target.
- **The refusal says what to do next again**: each unmapped type with a ready-to-paste `--type-map` line, the valid keys, and where to correct name problems.
- Composite keys whose names the PDF cut to the same text no longer block (their indexes are named from their columns).
- Fixed a regression found while applying the patch: a stray `#` line that is not a composite key swallowed the next real field.
- All three copies of the skill updated together; 241 skill tests pass.

#### SPEC-145 — Remote auto-start (Oct 25)

- **"Allow remote" switch** per project on the Kit tab (company ADMIN, or the project's TEAM_MANAGER). Off by default; the server refuses a remote start when it is off (`remote_not_allowed`), and every change is audited.
- **The Cockpit starts the project's remote on open** where it is allowed, shows Starting → Live with one notification, and reports a refusal or failure with its reason on the status bar, no pop-ups. Stop now ends the whole process tree on Windows.
- Kit: the bridge prints a ready line only once it is really connected, a fixed refusal line, and stops cleanly.

#### SPEC-144 — Company YappChatt account (Oct 24)

- Each company gets its own YappChatt account and group; project rooms are owned by it, and only Room Approvers' answers count as decisions.
- **Security: the chat login now needs the project's kit token** and refuses an email outside the company (closes a hole where any email got a session). Membership syncs automatically when users or consulting engagements change.
- Team chat panel in the Cockpit.

#### SPEC-142 / SPEC-143 — Decision Memory and agent model routing (Oct 23–24)

- **Decision ledger + Ask Gate:** owner-approved decisions are kept in an append-only ledger and answer repeat questions before they reach a person; `/wxLedger` to check, search and import.
- **KAIN may answer a parked question for the owner** in a project-agent room; the owner reviews each answer (Amendment A).
- **Agent model routing:** every spawned subagent gets a model from its task's difficulty class instead of always the most expensive one, with per-run usage capture and reports.

#### SPEC-136 — G.O.D. (`/wxG-O-D`) (Oct 18–24)

- Brainstorms are run by the wxBrainstorm panel; plan mode asks which topics to brainstorm after the review instead of mid-review.
- **Seamless `--create`:** after the design is approved, the run no longer stops for questions: low-risk ones become logged assumptions, high-risk ones park only their own unit, and all are reviewed together at the end (Amendment A).
- Offers one fresh start (`/clear` then `--resume`) before the build, to keep long runs lean (Amendment C).

#### SPEC-141 — wxKanban Manual (Oct 18)

- **The Manual v1** — one guide for the web app, the Dev Cockpit, the scope-to-release process and every command — published at `/manual`, with a generated Command Reference. Two cold read-throughs fixed every blocker found; the Cockpit opens it directly.

#### Other

- SPEC-137 Change Impact Amendment B and SPEC-140 nightly full test run (Oct 18).
- SPEC-127: test-adapter resolution now reports every application type a project declares (a Web + Mobile project's Mobile half was silently ignored) (Oct 24).

#### Still to add before the final release

- _(kit write-safety batch: SCOPE-124 Amendment C, SCOPE-135 Amendment B, SCOPE-019 Amendment B — specified, not built)_

---

### June 17, 2026

#### Spec 058 — Scope Branch Check-out / Check-in

- **Optimistic scope claiming for multi-developer teams.** A developer "checks out" a scope (spec) to signal they're working it; teammates see the claim and a conflict warning before duplicating effort. The model is **optimistic, not a lock** — a claim is a coordination signal (two nullable columns `claimedbyid` / `claimedat` on `projectspecifications`), never a hard gate. Nothing blocks the filesystem or git; the claim just makes parallel work visible.
- **Two MCP tools** (`project.checkout_scope`, `project.checkin_scope`): free → claim; already-held → conflict naming the holder + timestamp; `force:true` re-claims and audits the override (forcing user + displaced holder). Check-in clears the claim — a developer may release their own; **forcing the release of another developer's claim is ADMIN-only** (TEAM_MANAGER may not). Single-member companies short-circuit to a no-op (no one to coordinate with). CONSULTANT-plan callers are limited to scopes their active engagement grants (SCOPE-037 guard). New audit events: `scope_checked_out` / `scope_checked_in` / `scope_checkout_forced`.
- **Cockpit (VS Code) integration**: check-out/check-in commands drive a `wxAIGit branch`/`merge` (creating/merging a `scope/NNN-*` branch), falling back to showing the exact command when **`wxAIGit` is not installed** — the extension depends on `wxAIGit` for the git side. A `FileDecorationProvider` colors scope tree nodes by claim state (mine / others' / free) with a lock badge, and editor read-only (FR-008) makes a scope's spec docs editable only by the holder. `cockpit_summary` now returns `claimedBy` / `claimedAt` plus `viewerUserId` / `claimsEnabled`.
- **Git-hook trap** (shipped to consumer projects via the kit): `.husky/post-checkout` and `post-merge` call `scripts/wxkanban-scope-hook.mjs` — switching to a `scope/NNN-*` branch auto-claims it (warns but never steals on collision); merging it releases the claim. Best-effort and non-blocking — an unreachable MCP never breaks the git operation. Disable with `WXKANBAN_NO_GIT_HOOKS=1`.
- **Bug fixed during E2E verification**: forced check-in gated on `auth.role`, which defaults to `editor` on the HTTP/git-hook paths, so ADMIN force-release was always denied. Now resolves the acting user's real `usertype` from `userprofiles` (`isCallerAdmin`), correctly allowing ADMIN/SYSADMIN while still denying TEAM_MANAGER. Verified via a two-identity test against the live hosted MCP.
- **Amendment B — `wxAIGit` is now real and kit-distributed.** Manual testing revealed the git half (branch on checkout, merge on checkin) never ran: the repo's `wxAIGit.cmd` was orphaned (dead `_wxAI-global/...` path) and no project shipped a working `wxAIGit`, so FR-005's one-click branch creation always hit the "run it yourself" fallback. Built a real `wxAIGit` with exactly `branch --create` (create+switch) and `merge --source-branch` (local merge into the integration branch — no auto-push), cross-platform (`wxAIGit.cmd` for Windows/Git-Bash + a POSIX `wxAIGit`), backed by `scripts/wxaigit/*.sh`. The kit now installs these into every project (`KitGenerationService`), so a fresh install gets working one-click branch/merge; the Cockpit resolves the project-local launcher by absolute path so it works regardless of PATH.

---

### May 27, 2026

#### Spec 037 — Consultants Management (Engagement Core)

- **Feature-complete consulting engagement model.** A Client Company can engage a Consulting Company to do scoped work on its projects without granting team-member access. Two new domain entities: Engagement (Company-to-Company contractual link with active/paused/disabled/ended lifecycle) and Sub-Assignment (Consulting Company's internal distribution to its members). Time tracking lives in the Consulting Company's tenant per FR-015; B2B invoicing delivers to a dedicated `companies.billingemail` field. Consultants do not count against the Client's seat cap.
- **17 new API endpoints** under `/api/engagements/*`: invite + accept (existing-user and auto-provision branches), lifecycle controls, assignment CRUD (scope-level and task-level, mixed), sub-assignment CRUD with "needs reassignment" queue on member deactivation, aggregate billing visibility for Client, B2B invoice generation with retry queue.
- **Frontend additions**: `ConsultantsPanel` on the Team Members page (role-aware: shows engagements where caller is Client AND engagements where caller is Consulting Co.), `EngagementsWidget` on admin dashboard, `EngagementDetailPage` with role-gated assignment/sub-assignment editors, `ConsultantProvisionForm` for solo-consultant onboarding, tenant-context chip in the sidebar.
- **Pending-modifications queue (FR-005 AC4)**: assignment changes attempted while engagement is paused/disabled are queued and applied on the next return-to-active transition.
- **Visibility middleware** wired into existing `tasks.ts`, `consultantHub.ts`, `timeTracking.ts`, `projects.ts` phase endpoints, and `specificationLifecycle.ts` so Consulting Members see engagement-covered tasks and cannot manually advance lifecycle phases (FR-013 AC2).
- **kit dbpush bugs fixed**: header-aware tasks.md parser (handles 4-column and 5-column tables), accepts both `1` and `T001` in the # column, skips rows from secondary verification-matrix tables, normalizes free-form status (`N/A`, `partial`, `cancelled`) to the MCP enum, truncates >255-char titles. Previously 0 tasks landed per dbpush; now 77 land for 037.
- **41 new unit tests** (Phase 15): state machine 100% branch coverage, company invariants (FR-028 at-least-one-ADMIN), engagement permission isolation (≥15 negative scenarios for SC-3), audit trail coverage (SC-7), billing confidentiality contract (SC-4 / FR-016).
- **APP_VERSION** progression 1.5.42 → 1.5.49 across the implementation push.

---

### April 4, 2026
- **Version Bump** - Updated APP_VERSION from 1.2.5 to 1.2.6.
- **MCP Runtime Hardening + Buildscope Contract** - Enforced deterministic setup-mcp startup behavior, central MCP DB config precedence, HTTP port normalization, and resilient existing-server detection. Updated buildscope to require filename.md in guided mode with interactive follow-up for all remaining fields. Synced Spec 011 (spec/plan/tasks) and CLI help/env templates to match permanent fix gates.
- **FR-024 Init Memory Bootstrap** - Require project kit init to create memories/repo/spec-first-rule.md when missing, preserve existing file, and document this behavior in Spec 011 success criteria. Also bumps app version to 1.2.5.
- **SPEC-FIRST Development Rule** - Document mandatory workflow: read spec, check plan, stop if not documented, ask user, update spec before implementing. Added to CLAUDE.md (root), AI.md (project kit template), and memory (/memories/repo/spec-first-rule.md)
- **Fix MCP Build** - Initialize EMBEDDED_DATABASE_URL with required EmbeddedCredentials fields (encrypted, iv, authTag, version) to satisfy TypeScript interface validation. Prevents recurring build error in mcp-server.

- Bump App Version - Updated APP_VERSION from 1.2.2 to 1.2.4

### April 1, 2026

- **🔧 MCP Help Improvements** - Unified alias-driven help output with --all/--git/--docs modes and alphabetical command sorting

### March 31, 2026
- **🐛 App Runner Root Route** - Serve built SPA assets in production and preserve JSON 404 responses for unknown API routes.
- **📚 Spec Cleanup** — Remove spec 017 directory (merged into 018), update 011 scope file, refresh AI.md and tools/AI.md MCP tool references, add noise exclusions to .gitignore
- **♻️ Buildscope Refactor** — buildscope writes local markdown to specs/Project-Scope without DB dependency or projectId; kit MCP and CLI bridge updated for parity
- **✨ Spec 018 Backend** — Gateway with LLM routing + guardrails, drift event tracking, parity gate management, MCP update adoption workflow, CLIBridgeRouter, shared gateway types
- **🔧 MCP Tooling** — Add parity checker script, CI parity workflow, health/control scripts, MCP server gateway/auth/schema updates
- **✨ MCP DB Schema** — Add mcpdriftevents, mcpparityconfig, mcpupdateadoptions Drizzle tables + migration 0016, consolidate baseline snapshot
- **🔧 Stop Tracking Plugin Cache Artifacts** — Untrack `_wxAI-global/plugins/cache`, add ignore rules for cache dirs, MCP temp files (`.mcp-server.pid`, `Dockerfile.mcp-test`, `temp_*.txt`), and local scope scratch files

### March 30, 2026

- **🐛 Align CLI Help Surface and Kit Runtime Output** - Synced user-facing wxai help sections with createspecs-first flow, added generated help inventory tooling, and fixed kit preflight/env runtime handling for downloads.

### March 20, 2026

- Renamed wxAIGit skill to wxAIGit in settings.json\n- Updated git-guard.sh error messages and token references\n- Removed wxAIGit foundation references from wxAIGit.md

### February 24, 2026

- **✨ Add Project Document Management** - New schema for project documents with full CRUD service

### February 15, 2026

- **🔧 Remove Beads Integration** - Removed all beads sync, hooks, skills, docs, and TODO validation. Removed ccusage from statusline
- **✨ Beads Removed ** - Beads completely removed from all logic, projects
- **✨ CPL Per-Machine Config** - Layout now configured in ~/.cpl.conf with auto-detected display resolution and Zed app. Supports dual-monitor setups with independent editor/Claude placement
- **📚 Beads Docs Update** - SKILL.md updated for v0.50.3: bd todo, bd rename, bd find-duplicates, bd children, bd q, bd reopen, bd defer/undefer, bd stale, bd count, bd lint, bd query, bd orphans, bd promote, and decision issue type
- **✨ Configurable Layout** - Monitor geometry and slot count now configurable in cpl-app.applescript
- **✨ Single-Monitor Support** - Zed positioning with editorShare split; works alongside Claude slots
- **✨ Zed Window Positioning** - Explicit Zed placement via System Events in both and zed modes
- **🐛 PATH-based Claude Resolution** - Use `claude` via PATH instead of hardcoded `~/.local/bin/claude`
- **📚 CPL Docs** - Comprehensive permissions guide, layout config reference, troubleshooting table

- **✨ CPL Version-Tracked Sync** - CPL source moved into repo with `sync-cpl.sh` for all-or-nothing install/update with version tracking
- **✨ CPL Picker Improvements** - Floating window for reliable Spotlight focus, dynamic terminal-only directory options (~, ~/projects), persistent last-used selection
- **🐛 CPL Shell Directory Fix** - Shell now stays in project directory after exiting Claude (cd before launch instead of inside script)

### February 3, 2026

- **✨ Python Pre-Commit Validation** - pre-wxAIGit hook now runs pyright/mypy type checking for Python projects
- **✨ Language-Aware Rule Sync** - sync-starter-kit detects project type and uses -py.md rule variants for Python projects

- **✨ Python Support** - sync-starter-kit and wxAIGit now detect and support Python projects
- **✨ Beads Integration** - Issue tracking with merge driver and starter kit template
- **✨ CLAUDE.md Template** - Interactive creation from starter kit during sync

### January 14, 2026

### January 14, 2026

#### wxAIGit Script Architecture

- **Script-based operations**: Moved wxAIGit from inline validation to atomic bash scripts
- **New scripts**: Added wxAIGit-checkpoint.sh, wxAIGit-commit.sh, wxAIGit-merge.sh
- **Pre-wxAIGit hook**: Added validation hook that runs before wxAIGit skill
- **Simplified pre-commit**: Project hook now blocks direct commits, forces wxAIGit usage

---

### January 9, 2026

#### Git Hooks Cleanup

- **Removed global hooks**: Deleted `~/.git-hooks/` concept - project hooks are authoritative
- **Interactive hook install**: `sync-starter-kit.sh` now prompts to install/update hooks (not just report)
- **Deleted pre-merge-commit**: Removed orphaned TODO bead detection (manual discovery preferred)

#### Logging Migration (Adze → Pino)

- **block-console-log.sh**: Updated to check for `pino` dependency instead of `adze`
- **constitution.md**: Section IV now references Pino
- **development-guidelines.md**: Updated logging examples to Pino syntax

#### wxAIGit Token Enforcement

- **Restored create-token.sh**: Component hook for token-based git-guard bypass
- **Added documentation**: `project-documentation/token-based-hook-enforcement.md`

---

### January 7, 2026

#### Beads Upgrade (0.37.0 → 0.46.0)

- **Switched to homebrew-core**: Changed from tap `steveyegge/beads` to `brew install beads` (avoids stale tap issues)
- **New features documented**: `--notes` on create, `--blocked-by`/`--depends-on` aliases, `--reason` on delete
- **"beads state" trigger phrase**: New skill trigger for viewing non-closed beads grouped by status
- **Fixed autonomy wording**: Changed "USER ONLY" to "requires explicit user request" (AI can do when asked)

#### wxAIGit Enhancements

- **Detailed merge triggers**: "merge to main", "merge from X" for clarity
- **Auto-rename wt-\* branches**: First meaningful commit renames worktree branch to descriptive name
- **Beads sync post-commit**: Added post-commit beads sync step

#### Documentation

- **beads-setup.md**: Simplified install (no tap), updated daily usage commands
- **beads-update.md**: Fixed package name for version check, added sync warning for master mode

---

### January 5, 2026

#### Skills Added

- **TanStack skill**: Added mfing-bible-of-tanstack skill with comprehensive references (server-functions, routes, query, auth, api-routes, loading-states, debugging, anti-patterns)
- **Beads skill**: Added beads workflow skill

#### Rules Restructure

- **New `_claude-project/rules/` directory**: Moved rules from deprecated `airules/` location
- **Integrations subfolder**: Created `_claude-project/rules/integrations/` for tool-specific rules (ClaudeChrome, exa, ref)
- **Deleted `airules/`**: Removed deprecated rules directory

#### ClaudeChrome Update

- **Generic auth cookies**: Changed "OAuth cookies" to "Auth cookies" (removed Clerk-specific reference)

#### Sync Script Enhancements

- **Browser extension detection**: Detects ClaudeChrome via native messaging hosts
- **MCP auto-install**: Added `install_mcp()` for Ref, exa, shadcn-ui with interactive prompts
- **Interactive choices**: `[i]nstall / [r]emove / [s]kip` for missing MCP rules

#### Pull-from-project Improvement

- **Dynamic project discovery**: Lists projects with `.claude/rules/` from ~/projects via AskUserQuestion

---

### December 28, 2025

#### wxAIGit Bead Notes Automation

- **Auto bead notes update**: wxAIGit checkpoint/commit now auto-updates active-now bead notes
- **Simplified beads-workflow.md**: Notes auto-updated by wxAIGit, manual update rarely needed
- **New Stop hook**: `bead-comment-reminder.sh` triggers on session stop
- **New script**: `fix-claude-lsp.sh` for LSP troubleshooting

#### LSP Reminder Removal

- **Removed Section XI (LSP-First)** from constitution.md - pulled from project
- **Removed `lsp-reminder.sh` hook** from settings.json and hooks folder
- **Simplified bashtools.md** - condensed to table format, removed redundant examples

#### Beads Context Recovery Enhancement

- **New `active-now-reminder.sh` hook**: UserPromptSubmit hook reminds AI to claim a bead before code changes
- **Bug fix**: Close sequence now removes `active-now` label before closing beads (prevents impossible state)
- **Context Recovery Protocol**: Enhanced Session Recovery section with:
  - Rule: Non-trivial code changes require `active-now` bead
  - Field usage table: `design`/`acceptance` (immutable), `notes` (replace), `comments` (append)
  - Structured notes format for session recovery
  - Update triggers for maintaining current status
- **Removed stale reference**: Removed `@airules/beads.md` from sync-starter-kit template

---

### December 26, 2025

#### wxAIGit Beads Integration

- **Added `bd sync` to wxAIGit**: Pre/post-commit beads sync when `.beads/` exists
- **Removed Session Close Protocol**: Conflicted with wxAIGit workflow, now integrated directly
- **pull-from-project enhanced**: Now compares git hooks in addition to AIRules

#### Pre-commit Hook

- **node_modules exclusion**: Added `--glob '!**/node_modules/**'` to TypeScript validation

#### Sync Script Fix

- **Exit Code Fix**: `sync-starter-kit.sh` now exits 0 for both success cases (all synced / changes available)
- **UX Improvement**: Prevents Claude Code from showing red "Error" text on successful sync operations
- **Visual Indicators**: Added ✓ and ⚠ prefixes to distinguish outcomes

#### Beads Hook-Based Integration

- **Replaced `bd prime`**: Custom hook injection replaces upstream `bd prime` command
- **New Hook System**: `beads-inject.sh` checks for `.beads/` and injects `beads-workflow.md`
- **Deleted `airules/beads.md`**: Workflow now lives in `_claude-global/hooks/beads-workflow.md`
- **Updated beads-setup.md**: Documents hook approach, opting out, release scanning workflow
- **Workflow Improvements**: Added session close protocol, `bd close --suggest-next` (v0.37), TodoWrite clarification

---

### December 25, 2025

#### AIRules System Restructure

- **Constitution/Projectrules Split**: Separated global enforcement rules (constitution.md) from project-specific rules (projectrules.md)
- **Development Guidelines Cleanup**: Consolidated documentation standards, removed duplicates, demoted "MUST" language to guidance
- **Import Order Optimization**: Reordered AGENTS.md imports for LLM recency bias - constitution.md now loads last
- **New Console.log Hook**: `block-console-log.sh` blocks console.log in Adze projects (PreToolUse on Edit/Write)
- **Folder Rename**: `_git-hooks/` → `_git-hooks-project/` for naming consistency
- **Removed**: `_specify/` folder (replaced by Opus 4.5 plan mode), `Documentation.md` (merged into dev-guidelines)
- **Added**: `beads.md` (issue tracking), `ClaudeChrome.md` (browser automation), `projectrules.md` (template)
- **Header Comments**: Added "what belongs here" comments to constitution, dev-guidelines, projectrules
- **TypeScript Enforcement**: Zero tolerance via pre-commit hook, removed manifest system from wxAIGit skill

#### Complete Sync System

- **`/sync-global` Command**: Sync between `_claude-global/` and `~/.claude/`
  - Master mode detection via `.claude/master.txt`
  - Whitelist approach for watched folders/files
  - Executable bash script at `.claude/scripts/sync-global.sh`
- **`/sync-starter-kit` Command**: Sync starter kit → any project
  - Syncs AIRules/, git hooks, audits CLAUDE.md/AGENTS.md
  - Path mapping: `airules/` → `AIRules/`, `_git-hooks-project/` → `.git/hooks/`
  - Intelligent AGENTS.md merge (preserves enabled/disabled state)
  - Executable bash script at `~/.claude/scripts/sync-starter-kit.sh`
- **`/pull-from-project` Command**: Pull project changes → starter kit (master only)
  - Compares project AIRules/ with kit airules/
  - Shows diffs, asks which files to pull
- **README**: Added Master Workflow section documenting maintainer commands
- **Hooks Fix**: Made `architect_enforcer.sh` resilient to missing transcript

#### Global Config Cleanup

- **Removed Unused Skills**: Deleted skills no longer in use:
  - dispatching-parallel-agents, feature-documentation-cleanup, frontend-design
  - receiving-code-review, requesting-code-review, root-cause-tracing
  - skill-creator, subagent-driven-development, systematic-debugging, verification-before-completion
- **Removed Output Styles**: Deleted CriticalReview.md, task-adaptive.md
- **Removed Agents**: Deleted code-reviewer.md agent
- **Removed Commands**: Deleted code-review.md command
- **Cleaned wxAIGit**: Removed backup files and analysis document, updated ENFORCEMENT.md

#### New Hooks

- **architect_enforcer.sh**: UserPromptSubmit hook for principal engineer persona
- **dev-server-guard.sh**: Prevents AI from starting/killing dev server

#### Settings Updates

- Added `typescript-lsp@claude-plugins-official` plugin

---

#### Folder Naming Convention Overhaul

- **Underscore Prefix Convention**: Renamed all "dot-" folders to use underscore prefix for cleaner naming:
  - `dot-Claude(Global)` → `_claude-global`
  - `dot-Claude(Project)` → `_claude-project`
  - `dot-git-hooks(Project)` → `_git-hooks`
  - `dot-specify(Project)` → `_specify`
  - `AIRules` → `airules`
- **Removed Gemini Support**: Deleted `_gemini/` folder (no longer supporting Google Gemini CLI)
- **Typo Fix**: Corrected `project-documenation` → `project-documentation`

#### Documentation Restructure

- **README.md Rewrite**: Transformed from example project README to dual-purpose documentation that:
  - Documents the starter kit itself
  - Serves as a template for real projects
  - Includes file classification (synced vs template vs project-specific)
  - Has dedicated "For AI Agents" section
- **Changelog Format**: Established changelog as living document for this starter kit

#### AIRules Cleanup

- **Removed Obsolete Rules**: Deleted unused rule files:
  - `context7.md` (no longer used)
  - `linear.md` (no longer used)
  - `Playwright.md` (no longer used)
- **AGENTS.md Updates**: Updated all import paths to reflect new folder names

#### Sync System Planning

- **Phase 2 Planning Document**: Created `project-documentation/sync-system-planning.md` with:
  - File classification scheme (core/synced vs template vs project-specific)
  - Workflow design (pull from project → starter kit → push to others)
  - Registry concept for managing multiple projects
  - AI-assisted sync considerations

---

### September 19, 2025

#### Major Project Structure Reorganization

- **Agent Configuration Restructure**: Organized agent files into `dot-Claude(Global)/Agents/` structure
- **AI Rules System**: Created comprehensive `AIRules/` directory with specialized configuration files
- **Command Framework**: Added structured command system for standardized workflows
- **Specify Integration**: Implemented `.specify/` configuration with constitution, templates, and scripts
- **Global Configuration**: Added `dot-Claude(Global)/` with agent definitions, commands, and utilities
- **Project Commands**: Created `dot-Claude(Project)/commands/` for project-specific workflows

#### Configuration Enhancements

- **CLAUDE.md Simplification**: Streamlined to focus on importing AGENTS.md
- **AGENTS.md Creation**: Centralized agent guidance file with modular rule imports
- **Binary Tools**: Added `bin/cl` utility script for YOLO/SAFE mode toggling
