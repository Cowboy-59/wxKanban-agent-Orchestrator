# Task Breakdown: wxKanban Manual

**Feature**: wxKanban Manual
**Spec**: 141
**Date Generated**: 2026-10-18
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | T001 [v1-tonight] Manual parts structure and section front matter (FR-001) | high | todo |
| 2 | T002 [v1-tonight] Edition filter: Customer and Internal builds, fail closed (FR-002) | high | todo |
| 3 | T003 [v1-tonight] Command Reference generator: read the sources (FR-003) | high | todo |
| 4 | T004 [v1-tonight] Generator: links, labels, called-by, exclude list, stage map (FR-003) | high | todo |
| 5 | T005 [v1-tonight] Generator output: pages, three indexes, commands.json (FR-003) | high | todo |
| 6 | T006 [v1-tonight] Generator fixture test (FR-003) | high | todo |
| 7 | T007 [v1-tonight] Drift check and Internal Known drift page (FR-004) | high | todo |
| 8 | T008 [v1-tonight] Leak scan with planted-leak test and path guard (FR-005, SOC 2 CC6.1) | high | todo |
| 9 | T009 [v1-tonight] Part 1 Getting Started content (FR-006) | high | todo |
| 10 | T010 [v1-tonight] Part 2 The Process content, sections 2.1-2.11 (FR-007) | high | todo |
| 11 | T011 [v1-tonight] Part 3 Web App: regroup the 17 sections, text only (FR-008) | high | todo |
| 12 | T012 [v1-tonight] Part 4 Dev Cockpit content, sections 4.1-4.10 (FR-009) | high | todo |
| 13 | T013 [v1-tonight] Appendix and Internal Not in this Manual page (FR-010) | high | todo |
| 14 | T014 [v1-tonight] Manual build pipeline with version stamp (FR-011) | high | todo |
| 15 | T015 [v1-tonight] Serve /manual before the SPA fallback (FR-011) | high | todo |
| 16 | T016 [v1-tonight] In-app Help menu Manual item (FR-011) | high | todo |
| 17 | T017 [v1-tonight] Redirects and repointed links (FR-012) | high | todo |
| 18 | T018 [v1-tonight] Endpoint test: /manual and redirects (metric 5) | high | todo |
| 19 | T019 [v1-tonight] Cold-agent run: 0 blockers (FR-016, metric 1) | high | todo |
| 20 | T020 [v1-tonight] Owner read-through of the Customer edition (release gate) | high | todo |
| 21 | T021 [v1.1] Demo-company seed (FR-015) | medium | todo |
| 22 | T022 [v1.1] Part 3 new sections, 3B Consultants, demo screenshots (FR-008) | medium | todo |
| 23 | T023 [v1.1] Part 4 sections 4.11-4.12 and stamped screenshots (FR-009) | medium | todo |
| 24 | T024 [v1.1] Retire dead help components (FR-013) | medium | todo |
| 25 | T025 [v1.1] Freshness: source flags, commands.json block, nightly line, wxRefreshHelp (FR-014) | medium | todo |
| 26 | T026 [v1.1] Cold-agent run: 0 wrong or silent (FR-016, metric 1) | medium | todo |
| 27 | T027 [Amendment] Dev Cockpit opens the Manual (FR-017) | high | todo |

## Task Details

### T001 — T001 [v1-tonight] Manual parts structure and section front matter (FR-001)

Turn docs-workspace/config.json's flat section_order into ordered parts (Part 1 Getting Started, Part 2 The Process, Part 3 Web App, Part 4 Dev Cockpit, Part 5 Command Reference, Appendix, Internal). Define section front matter: id (fixed, unique, lowercase, becomes the /manual URL path), audience (customer|internal), sources (files the section describes). Add front matter to the 17 existing sections. A section without an id fails the build.

### T002 — T002 [v1-tonight] Edition filter: Customer and Internal builds, fail closed (FR-002)

One build step produces an Internal edition (every section) and a Customer edition (customer-tagged sections only, :::internal blocks removed). A section with no audience tag is internal. Outputs go to separate folders; Internal output folder under docs-workspace/ is git-ignored.

### T003 — T003 [v1-tonight] Command Reference generator: read the sources (FR-003)

New .mjs script that reads _wxAI/commands/*.md (front matter description, ## Purpose, ## Usage), the shipped skills (scripts/sync-to-orchestrator.mjs allowlist), mcp-server/src/prompts/*.md (server-side steps for 15 commands), the CLI registry (wxkanban-agent capabilities.ts / cli-adapter.ts plus the workflow-engine.ts handler switch) and vscode-extension/package.json contributes.commands, into one in-memory command model. No model calls.

### T004 — T004 [v1-tonight] Generator: links, labels, called-by, exclude list, stage map (FR-003)

Detect references between commands and label each: Confirmed (a step runs it), Likely (a suggested next step), Mention (a related/see-also list). Invert into calledBy. Apply the exclude list (brainstorm row 13 archive list plus runqa, runhuman, prepareRelease, finalizeRelease, createtesttasks, pipeline-agent) to the Customer view. Assign stage from a generator-owned stage map labeled Likely until command front matter supplies stage.

### T005 — T005 [v1-tonight] Generator output: pages, three indexes, commands.json (FR-003)

Write one Markdown section per command into docs-workspace/sections/reference/ (purpose, where it runs, stage, arguments + example, calls, called by, plan badge), plus index pages By stage, A-Z and By where it runs, plus commands.json. Customer view never includes command body text, MCP tool names or file paths. Output is deterministic: two runs on the same input are byte-identical.

### T006 — T006 [v1-tonight] Generator fixture test (FR-003)

Vitest test with a small fixture command set and known links (Confirmed, Likely, Mention, a missing target, an excluded command) asserting the model, calledBy inversion, exclusion and deterministic output.

### T007 — T007 [v1-tonight] Drift check and Internal Known drift page (FR-004)

Report references to commands that do not exist (e.g. /scope-validate) and CLI commands with no handler into the Internal page Known drift. Fail the build only when drift appears in customer-visible content.

### T008 — T008 [v1-tonight] Leak scan with planted-leak test and path guard (FR-005, SOC 2 CC6.1)

Scan the built Customer edition HTML and PDF text for .env, DATABASE_URL, connection strings, amazonaws/App Runner names, sk_live / AKIA key formats, non-allowlisted emails, internal paths (src/server/, mcp-server/) and fence markers; any hit fails the build with file and line. A planted-leak test proves the build fails. Fail if Internal output lands under public/ or _wxAI/.

### T009 — T009 [v1-tonight] Part 1 Getting Started content (FR-006)

Build Part 1 from gettingStartedInstructions.md: keep sections 1-5, expand section 6 step 2, rewrite section 7 to buildscope, validateScope, createSpecs, implement, then stages advance on their own as gates clear (SPEC-123), add section 7b two ways to start (new project, /wxG-O-D, /wxConversion, /cwConversion, /vbConversion), move section 8 to Appendix B. Name no excluded command.

### T010 — T010 [v1-tonight] Part 2 The Process content, sections 2.1-2.11 (FR-007)

Write 2.1 road at a glance, 2.2 scopes and specs, 2.3 Design, 2.4 Implementation, 2.5 QA, 2.6 Human Testing, 2.7 Beta, 2.8 Release, 2.9 Converting an existing app, 2.10 When something goes wrong, 2.11 Who does what, from SPEC-123 and the G.O.D. N8c reference plus wxAI-training lessons. Stage sections in six columns (for / you do / AI does / commands / leaves when / common blockers). 2.6: the AI never signs. 2.8: the user deploys. Every command links to its Part 5 page.

### T011 — T011 [v1-tonight] Part 3 Web App: regroup the 17 sections, text only (FR-008)

Group the 17 existing sections into 3A Everyone and 3C Company admins, tag them customer, and remove every pre-scope screenshot (they hold real data under pixel boxes). The Customer edition contains 0 images created before this scope.

### T012 — T012 [v1-tonight] Part 4 Dev Cockpit content, sections 4.1-4.10 (FR-009)

Write 4.1 install and link, 4.2 at a glance, 4.3 System Health (each line: meaning and fix, morning summary), 4.4 Scopes (check out / check in), 4.5 Development Plan, 4.6 Git, 4.7 Kit updates, 4.8 Change Impact, 4.9 Feedback, 4.10 Help in the Cockpit, from vscode-extension/package.json and cockpitTreeProvider.ts.

### T013 — T013 [v1-tonight] Appendix and Internal Not in this Manual page (FR-010)

Write A Glossary (terms linked to where they are explained), B Troubleshooting by symptom (fixes that name a command must resolve in commands.json), C Where to get help; Internal I-2 Not in this Manual listing each excluded command with its reason.

### T014 — T014 [v1-tonight] Manual build pipeline with version stamp (FR-011)

One command runs: generator, edition filter, build_docs.py HTML + PDF for each edition, drift check, leak scan, then copies the Customer site and PDF to public/manual/ (lowercase). Every page shows the app version and build date. Fails on any check failure.

### T015 — T015 [v1-tonight] Serve /manual before the SPA fallback (FR-011)

Express serves public/manual as static at /manual/* and /manual/wxKanban-Manual.pdf, public and logged in, registered before the single-page app * fallback in the production server entry.

### T016 — T016 [v1-tonight] In-app Help menu Manual item (FR-011)

Add a Manual item to the in-app Help menu in AppShell.tsx that opens /manual.

### T017 — T017 [v1-tonight] Redirects and repointed links (FR-012)

301 /gettingStartedInstructions.html to /manual/getting-started and /help.pdf, /help.<lang>.pdf to the Manual PDF; repoint the links at LandingPage.tsx and AppShell.tsx to the Manual.

### T018 — T018 [v1-tonight] Endpoint test: /manual and redirects (metric 5)

Run the built server and verify /manual returns 200 logged out and logged in, the PDF downloads, and each old URL returns 301 to its target. Grep the built client bundle for the Manual menu item.

### T019 — T019 [v1-tonight] Cold-agent run: 0 blockers (FR-016, metric 1)

An AI with no project memory gets only the Customer edition and a fresh kit and follows it from install to a released scope; log every point where the Manual was wrong, vague or silent; fix blockers before release, carry the rest to T026.

### T020 — T020 [v1-tonight] Owner read-through of the Customer edition (release gate)

The owner reads the built Customer edition once before it is pushed. Nothing is pushed before this sign-off; the owner pushes.

### T021 — T021 [v1.1] Demo-company seed (FR-015)

Seed one demo company with fake people, projects, scopes, tasks and invoices for the screen walk: marked demo (fixed configured company id), no Stripe customer, no email, excluded from customer metrics, idempotent, removable in one command, asks before writing to production, example.com addresses only, no DDL. Follows the onboarding video tool's demo-data rule.

### T022 — T022 [v1.1] Part 3 new sections, 3B Consultants, demo screenshots (FR-008)

Add sections for account, billing and subscription, audit log, database diagram, admin overview and pending tasks, phase pages, scope analysis, process flow, Overview interview, team dashboard, and 3B Consultants (today's screens); recapture every Part 3 image from the demo company.

### T023 — T023 [v1.1] Part 4 sections 4.11-4.12 and stamped screenshots (FR-009)

Write 4.11 Project Agent and 4.12 Settings and extras; add hand-taken Cockpit screenshots, each stamped with the Cockpit version it shows.

### T024 — T024 [v1.1] Retire dead help components (FR-013)

After a build confirms nothing uses them, archive HelpPage.tsx, HelpPanel.tsx, ContextualHelp.tsx, GET /api/help/cli-commands, scripts/build-help-pdf.ts and scripts/check-getting-started-sync.mjs; verify the wxkanbanhelp table, /docs and the FAQ still work.

### T025 — T025 [v1.1] Freshness: source flags, commands.json block, nightly line, wxRefreshHelp (FR-014)

Extend .husky/pre-push so a change to a section's listed sources flags that section; block the push when commands.json is stale; add Manual: N stale sections to the nightly report; extend /wxRefreshHelp to all Manual parts, clearing only what was fixed.

### T026 — T026 [v1.1] Cold-agent run: 0 wrong or silent (FR-016, metric 1)

A fresh cold-agent run logs 0 points where the Manual was wrong or silent; fix everything carried from T019.
