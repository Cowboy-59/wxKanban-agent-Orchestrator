# Brainstorm: The wxKanban Manual (web app, Dev Cockpit, process, and every command)

- **Status:** closed
- **Opened / last updated:** 2026-10-18 / 2026-10-18
- **Source:** internal
- **Asked for by:** the product owner, for customers and internal operators
- **Level:** senior, explain mode (plain-KISS)
- **Next item:** none. Hand-off: `/buildscope --from-md` for Scope B (the Manual) now; Scope A (kit cleanup + consultant changes) later

## The request

One Manual that covers all of wxKanban: the web app, the Dev Cockpit, the lifecycle process, and
every command, including which other commands each one calls or includes. Start from the existing
help and review it section by section.

## What already exists

| Item | Status | Evidence | Confidence |
|---|---|---|---|
| User Guide (HTML site + PDF), 17 sections | Built: web app only, English only, screenshots stale (2026-07-29) | `docs-workspace/sections/*.md`, `docs-workspace/wxKanban-User-Guide.pdf`; `/wxHelpGenerate` → `/wxRegenHelp`; `.wxai/help-stale.json` | Confirmed |
| In-app Help, priced by plan | Built: 30 features, 10 full articles, 6 languages (SCOPE-084) | `src/shared/help/catalog.ts`, `articles.ts`, `guides.ts` | Confirmed |
| Lifecycle explained to users | Partly built: 4 lines plus developer training | `src/shared/help/guides.ts:35-40`, `.claude/commands/wxAI-training.md` | Confirmed |
| Cockpit user guide | Not found: the README covers install and themes only | `vscode-extension/README.md` | Confirmed |
| Cockpit command list | Built: 5 Standard entries have no command behind them | `vscode-extension/src/services/helpCatalog.ts:29-59` | Confirmed |
| Command reference | Built but stale since 06-28; lists commands that don't exist | `_wxAI/commands/help.md`, `wxHelp.md` | Confirmed |
| "Which command calls which" | Not found as data; 15 commands keep their steps on the server | `mcp-server/src/prompts/*.md` | Confirmed |
| Getting Started guide | Built: 9 sections (07-22) | `gettingStartedInstructions.md` | Confirmed |
| Help PDFs in `public/` | Built: stale since 07-07, nothing links to them | `public/help*.pdf` | Confirmed |
| CLI stage commands | Listed but no handler: runqa, runhuman, prepareRelease, finalizeRelease, createtesttasks, pipeline-agent | `wxkanban-agent/core/orchestrator/workflow-engine.ts:657-691` | Confirmed |
| Stage advance | Automatic per scope when a gate clears; no Advance button (SPEC-123) | `mcp-server/src/prompts/wxgod/references/new-project.md:531-560` | Confirmed |
| Planned scopes | SCOPE-016 Online Help (never started), SCOPE-092 help i18n (planned), SCOPE-138 Teaching, SCOPE-139 Videos | `specs/Project-Scope/` | Confirmed |
| Decided before | Nothing on a manual; declined learner progress tracking and AI footage (10-16) | `docs/brainstorms/2026-10-16-*.md` | Confirmed |

**Change Impact:** SCOPE-084 has 9 fenced files (in-app Help); SCOPE-138 has 6 (SCOPE-139 depends on
it); SCOPE-016 and SCOPE-092 have no code.

## Panel

Spoke: Lead Architect (chair), Domain, Frontend, Backend, DevOps, Security, QA, Migration,
Documentation · Sat out: Legacy, Database

## Decisions

| # | Item | Decision | Kind | To scope? | Date |
|---|---|---|---|---|---|
| 1 | The need | One place to learn the path and look up any command, accurate to what actually runs. Done when (a) a new user goes install → first release with the Manual alone, and (b) every command shows purpose, stage, calls and called-by, all matching the source | Agreed | yes (B) | 2026-10-18 |
| 2 | Audience | One source, two editions: Internal = everything, Customer = customer-tagged only. Untagged content stays OUT of the Customer edition. A command's audience comes from what ships in the kit. Plan tier is a badge (SCOPE-084 catalog), not an edition | Agreed | yes (B) | 2026-10-18 |
| 3 | Base | `docs-workspace/` becomes the Manual (single source), organized in parts. `gettingStartedInstructions.md` folds into Part 1. In-app Help stays the short layer. Database-backed help (`/docs` FAQ, videos, sessions) stays media-only | Agreed | yes (B) | 2026-10-18 |
| 4 | Smallest useful version | v1 = Parts 1–5 + Appendix, both editions, English; every section gets a fixed ID. Next release after v1 approval: 6 languages + deep links (in-app Help cards → Part 3, Cockpit command entries → Part 5, build check that every link resolves in the Customer edition). Then automated Cockpit capture. Later: Cockpit stage links, Internal ops chapters | Changed (panel had deep links later, languages unordered) | yes (B) | 2026-10-18 |
| 5 | Contents | Part 1 Getting Started: keep §1–5; expand §6 Step 2; rewrite §7 to the real path (buildscope → validateScope → createSpecs → implement → stages advance on their own as gates clear); add §7b two ways to start (new project, `/wxG-O-D`, conversion); §8 → Appendix; `/help` filters by stage. Part 2 The Process (new): 2.1 road at a glance · 2.2 scopes and specs · 2.3 Design · 2.4 Implementation · 2.5 QA · 2.6 Human Testing (the AI never signs) · 2.7 Beta · 2.8 Release (you deploy) · 2.9 Conversions · 2.10 When something goes wrong · 2.11 Who does what; stage sections in six columns (for / you do / AI does / commands / leaves when / common blockers), written from G.O.D. N8c + `wxAI-training`. Part 3 Web App by role: 3A Everyone (account expanded; phase pages, scope analysis, process flow, Overview interview; new Team dashboard), 3B Consultants (new; documents today's screens, updated after the consultant work), 3C Admins (Theme Studio; new Billing & subscription, Audit log, Database diagram, Admin overview & pending tasks); SysAdmin and distributor sign-up → Internal edition later; all recaptured on a demo company. Part 4 Dev Cockpit (new): 4.1 install & link · 4.2 at a glance · 4.3 System Health · 4.4 Scopes · 4.5 Dev Plan · 4.6 Git · 4.7 Kit updates · 4.8 Change Impact · 4.9 Feedback · 4.10 Help in the Cockpit · 4.11 Project Agent · 4.12 Settings; hand screenshots stamped with the Cockpit version. Part 5 Command Reference (generated): 34 slash commands, shipped skills without command files, CLI, 21 Cockpit commands; MCP tools in the Internal edition only; indexes By stage · A–Z · By where it runs; one page per command. Appendix: Glossary · Troubleshooting by symptom · Where to get help. Internal only: Known drift (generated) · Archive register | Agreed | yes (B) | 2026-10-18 |
| 6 | Command reference | Generated, zero model tokens, from `_wxAI/commands`, shipped skills, `mcp-server/src/prompts/*.md`, the CLI registry, and the Cockpit's `package.json` `contributes.commands`. Entry: name, purpose, where it runs, stage, arguments + example, calls, called-by, plan badge (Internal adds MCP tools, scripts, body, paths, known problems). Link labels: Confirmed (runs it) / Likely (leads to) / Mention (see also) / Drift (fails the check). Output: `sections/reference/*.md` + indexes + `commands.json`, the first command registry. Parser fixture test. One overall chain diagram lives in Part 2 | Agreed | yes (A: `commands.json` + front matter; B: generator and pages) | 2026-10-18 |
| 7 | Command drift | Fix the drift FIRST, as its own release (Scope A) before the Manual: remove dead CLI entries (and from the session banner), fix the Cockpit Standard list, archive dead and replaced commands, ship `/preTest` in the kit, fix `/scope-validate` and other bad references, fix `wxAI-project-init`'s title, normalize front matter (`description`, `stage`, `audience`) on every surviving command. A generator drift check runs on every Manual build | Changed (panel had documenting what works in v1, fixing next release) | yes (A) | 2026-10-18 |
| 8 | Leak guard | Three layers: inline `:::internal` blocks dropped from the Customer build; the generator's customer view never uses command-file body text; an output scan of the built Customer edition (HTML + PDF text) that fails the build on secrets, env/DB/AWS names, key patterns, non-allowlisted emails, internal paths and fence markers, proven by a planted-leak test. Screenshots from a demo company with fake data, replacing pixel-box redaction. The owner reads the v1 Customer edition once before publishing | Agreed | yes (B) | 2026-10-18 |
| 9 | Keeping it current | Part 5 regenerates; a check blocks the push when `commands.json` is stale (same pattern as `check-getting-started-sync`). Parts 1–4: per-section `sources:` front matter feeds the existing `.husky/pre-push` help-stale marker (a reminder, no block). Cockpit screenshots: version stamp checked against the Cockpit version. Drift and leak checks block every build. The nightly run reports "Manual: N stale sections". `/wxRefreshHelp` covers all five parts and clears only what was fixed | Agreed | yes (B) | 2026-10-18 |
| 10 | Where it lives | Customer edition: HTML + PDF at the app's `/manual/<part>/<section>`, reachable both public (logged out) and from the in-app Help menu; linked from the landing site, `/docs`, the Cockpit, and the kit README (the kit carries the link, not the file). Internal edition: repo-only build under `docs-workspace/`; the build fails if it lands in `public/` or `_wxAI/`. Version and build-date stamp on every page. Lowercase `manual` path. English first; 6 languages in the next release; Part 5 translated through per-entry overlays keyed by command and content hash | Changed (panel had public only) | yes (B) | 2026-10-18 |
| 11 | What it replaces | `gettingStartedInstructions.html` redirects to `/manual/getting-started`; `LandingPage.tsx:239` and `AppShell.tsx:410` repointed; `check-getting-started-sync.mjs` retired. `wxKanban-User-Guide.pdf` becomes the Customer PDF. Archive `public/help*.pdf` + `scripts/build-help-pdf.ts`, `HelpPage.tsx`, `HelpPanel.tsx` / `ContextualHelp.tsx` + `GET /api/help/cli-commands` (confirm with a build first). Keep `public/help.html` and `/docs` media. Kit README command section → link to Part 5. SCOPE-016 superseded; SCOPE-092 absorbed (via `/buildscope`'s reuse check) | Agreed | yes (B) | 2026-10-18 |
| 12 | Fit and priority | Scope A (kit fix and cleanup) first, then release the Manual now (Scope B): the help is needed now. The consultant work follows and may be built alongside a later round of kit fixes. Release A needs a clean-consumer kit install test. v1 includes small app changes (`/manual` route, redirects) | Changed (panel had consultants first) | yes | 2026-10-18 |
| 13 | Commands not relevant to the kit | Rule: a command with no live caller is archived and removed from the kit. Archive + remove: the replaced `wxAI-*` pipeline (pipeline, -agent, -normalizer, -mandatory-database, specify, clarify, plan, tasks, analyze, checklist, implement, -gate, -normalizer), `dev-plan`, `help`, `wxHelp`; the broken `wxAI-qa`, `-humantest`, `-beta`, `-release` and CLI runqa, runhuman, prepareRelease, finalizeRelease, createtesttasks, pipeline-agent, plus dead handlers `wxht.ts`, `pipeline-agent.ts`; old governance `wxAI-session-start` (the MCP tool stays), `-scope-check`, `-todo-import`, `-constitution`, `-lifecycle`, `-training` (mine its lessons for Part 2); kit sync `sync-cpl`, `sync-starter-kit`, `sync-global`, `wxAI-sync-global`, `_wxAI/scripts/sync-global.sh`; audit `audit-check`, `-run`, `-report`, `-tasks`; `scope-import`, `suspend-task`, `autofix-translation`; `task-push` and `task-done` after `createSpecs`'s next step is repointed to `dbpush`. Remove from the kit but keep in this repo: `wxRefreshHelp`, `wxRegenHelp`, `help-catalog`, `pull-from-project`, `marketing-feature-set`. Keep: `wxAI-project-init` (live), `remote` (for everyone), `consultant-hub` / `track-time` / `ai-session` (for everyone), `web-artifacts-builder` (SOC 2 artifacts). Reach: CLI registry + tests, Cockpit `commandsInstall.ts` / `helpCatalog.ts`, app `KitGenerationService.ts` / `KitManager.tsx`, install/setup scripts, `CLAUDE.md`, `_wxAI/rules/projectrules.md`, MCP `help-context.ts`, G.O.D.'s known-problems table. Reuse `archive:files` if it fits | Added | yes (A) | 2026-10-18 |
| 14 | Consultant features | consultant-hub, track-time, ai-session need fixing and updating; used heavily on a project in November | Parked → separate topic | no | 2026-10-18 |
| 15 | `/help` | A new generated `/help`: the Standard list from `commands.json`, filtered by stage, plus the Manual link | Added | yes (A) | 2026-10-18 |
| D1 | Document broken commands as they are | A Manual that lists dead commands teaches the broken path | Declined | no | 2026-10-18 |
| D2 | Two separately written manuals | Double the upkeep; they drift apart | Declined | no | 2026-10-18 |
| D3 | Login-only Manual | Hides the best sales asset; the leak scan guards the content | Declined | no | 2026-10-18 |
| D4 | Database-backed help as the Manual source | Not in git, can't be diffed, can't take generated content | Declined | no | 2026-10-18 |
| D5 | Pixel-box screenshot redaction | One layout change and the box misses; replaced by demo-company screenshots | Declined | no | 2026-10-18 |
| 7R | Command drift (**replaces row 7**) | The Manual ships FIRST and documents only what works today. The Customer edition leaves out every command on row 13's archive list and the 6 dead CLI commands (still installed until the kit release). Part 1 §7 and Part 2 teach the real path, which works today. The generator ships with the Manual, using its own stage map (labeled Likely) and row 13's list as its exclude list until front matter is normalized. Drift is reported in the Internal edition (Known drift) and blocks the build only when it appears in customer-visible content. The fixes move to the kit + consultant release | Changed | yes (B now; fixes in A) | 2026-10-18 |
| 11R | Scope boundary (**replaces row 11's last sentence**) | Found at `/buildscope`'s reuse check: SCOPE-092 translates the DATABASE help records (`/docs` videos, FAQ, guides), which row 3 keeps separate, so the Manual does NOT absorb it; SCOPE-092 stays its own scope. The Manual supersedes only SCOPE-016's UNBUILT manual and contextual-help parts (`HelpPage.tsx`, `HelpPanel.tsx` / `ContextualHelp.tsx`, `/api/help/cli-commands`). The `wxkanbanhelp` table stays: it is live and used by SCOPE-044 `/docs`, the FAQ and SCOPE-092, and SCOPE-060 depends on SCOPE-016 | Changed | yes (B) | 2026-10-18 |
| 4R | Release date and split (**refines row 4**) | Target: tonight or first thing 2026-10-19. v1-tonight = Part 1 revised, Part 2 full, Part 5 generated, Part 3 the 17 existing sections TEXT ONLY (old real-data screenshots removed), Part 4 text only (4.1–4.10), Appendix, two editions + leak scan + planted-leak test, `/manual` (public + logged in) + PDF + the 2 redirects; a cold-agent run with only blockers fixed. v1.1 this week = demo-company seed (in production, tagged demo, no Stripe/email/metrics, idempotent, removable, asks first), recaptured screenshots, ~10 new Part 3 sections, Part 4 screenshots + 4.11–4.12, stale flags + pre-push block + nightly line, remaining cold-run findings. Metrics: tonight gate = 1 (0 blockers), 2, 3, 4 (0 stale generated), 5; v1.1 = 1 (0 wrong/silent), 4 (same-push flags), 6 (100% demo-company screenshots) | Changed | yes (B) | 2026-10-18 |
| 16 | Cold-agent run tonight (**refines row 4R, metric 1**) | Found during `/implement`: a real fresh-kit-to-released run can't finish tonight (release needs a person's human-test sign-off and the overnight machine-test run) and would write to production (no UAT). Tonight's gate becomes a cold READ-THROUGH: an agent with no project context reads only the published Customer edition and walks install → release on paper, logging blockers; blockers are fixed and pushed. The real end-to-end run moves to v1.1 (T026) in the demo company. Owner: "t019 -- yes push it" | Changed | yes (B) | 2026-10-18 |
| 12R | Fit and priority (**replaces row 12**) | Two tracks. NOW: create and release the Manual (Scope B), including `commands.json` from the Manual build, the `/manual` route and the redirects. AFTER, as ONE release: kit fix and cleanup (Scope A: archiving, front-matter normalization, new `/help`, `createSpecs` → `dbpush`, Cockpit reads `commands.json`, dead CLI entries) bundled WITH the consultant changes (row 14). Section 3B documents today's consultant screens and is updated in that release | Changed | yes | 2026-10-18 |

## Open items

- Item 14, consultant features: its own brainstorm, then built and released together with Scope A
  (kit cleanup) as one release (row 12R). November is the hard date.
- **Product questions from cold read-through round 2 (2026-10-18), for the owner.** The Manual can only
  describe these once the product's truth is decided; 3 and 6 look like real bugs:
  - (2) Human testers have no running build: nothing says what app they test against or how they reach it.
  - (3) Beta passes straight through: its exit rule (no open task, every owned test clear) is already met
    when the scope leaves Human Testing, so beta users get no window.
  - (4) Two models fight: the web-app board lets admins and managers drag scope cards forward and labels
    Human Testing and Beta "optional", while SPEC-123 says stages advance only on their own. Stage names
    also differ ("QA Testing", "Beta & Feedback", "Beta Release").
  - (6) A Beta fix becomes a new scope starting in Design, but the release check needs every earlier
    stage of the project complete, so the original scope may never ship until the fix scope does.
  Round 2 also listed 10 vague and 6 silent items (sign-up walkthrough, deploy checklist, git init,
  beta distribution, command descriptions with internal jargon — the last belongs to Scope A's
  front-matter normalization).
- Confirmed during the Part 3 and 4 walks: where a scope's stage and blockers show (phase pages or the Cockpit), and what the Project Agent does for a customer.

## Next step

Take to scope (row 12R): `/buildscope --from-md docs/brainstorms/2026-10-18-wxkanban-manual.md`.
**First, Scope B, the wxKanban Manual** (rows 1–6, 7R, 8–11, 11R, 12R): released now. It does not depend on
Scope A, and supersedes only SCOPE-016's unbuilt parts; SCOPE-092 stays separate (row 11R). Then `/validateScope`.
**Later, Scope A, kit cleanup + consultant changes** (rows 13, 15, the fix half of 7R, 14): one release.

- Scope B: **done (SCOPE-141)**, `specs/Project-Scope/141-wxkanban-manual.md`, validated 2026-10-18 (score 93, no blocking issues). `/createSpecs` done 2026-10-18: SPEC-141 `planned` (preflight 100), 26 tasks, `specs/141-wxkanban-manual/`. Next: `/implement` 141, v1-tonight tasks T001–T020 first.
- Scope A: not started
