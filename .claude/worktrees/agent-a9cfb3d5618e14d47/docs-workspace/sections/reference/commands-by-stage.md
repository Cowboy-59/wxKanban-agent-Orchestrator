---
id: commands-by-stage
part: command-reference
audience: customer
sources: docs-workspace/tooling/manual/command-reference.mts
generated: true
---

# Commands by stage

Which commands you use at each stage of a scope.

## Design

| Command | What it does |
|---|---|
| [/analyzescope](cmd-analyzescope.md) | Audit one scope doc (holes, ambiguity, internal contradictions) or all scopes (cross-scope conflicts), and persist a findings report. |
| [/buildscope](cmd-buildscope.md) | Interactive agent for building Scope of Project markdown files with proper structure and wxKanban integration. |
| [/buildstack](cmd-buildstack.md) | Update the project's Stack & Style document (stack.md) from VS Code — a guided, default-first interview that revises the target stack and look-and-feel, then persists the ProjectStack document. |
| [/createSpecs](cmd-createspecs.md) | full spec pipeline (capture → specify → clarify → plan → tasks → lifecycle) via the MCP project.create_specs tool. |
| [/research](cmd-research.md) | Research & PRD generation — landscape research, synthesis, and a phased PRD for a feature. |
| [/scope-flow-map](cmd-scopeflowmap.md) | Build one overall Mermaid dependency map of the whole wxKanban build from specs/Project-Scope/*.md — showing how scopes connect across different processes and flows, including connections that no single scope doc refl… |
| [/validateScope](cmd-validatescope.md) | Validate Scope of Project documents against wxKanban quality criteria |
| [/wxBrainstorm](cmd-wxbrainstorm.md) | talk through a customer suggestion, feature request, or idea with a panel of the eleven wxG-O-D agent roles. |
| [/wxBrand](cmd-wxbrand.md) | capture a product you have already built into a brand instruction document, ingest a completed one, or start from a blank template; validate it and report every failure with its measurement; then execute it into real… |
| [/wxDesigner](cmd-wxdesigner.md) | read a scope/spec, design the screen it calls for using the project's existing theme tokens, preview it in the browser, iterate, then SAVE to a page.md carrying the design spec plus ready-to-use TSX. |
| [/wxG-O-D](cmd-wxgod.md) | Guru of Development: reads your project tree or named folders (plus ProjectOverview.md, stack.md, and any WinDev/VB6/Clarion conversion output), goes over the findings with you section by section at your level (--leve… |

## Implementation

| Command | What it does |
|---|---|
| [/analyzecode](cmd-analyzecode.md) | Run the wxICA architecture review on the current codebase — mechanical drift audit followed by judgment-driven deepening candidates. |
| [/compliance-scan](cmd-compliancescan.md) | Retroactive compliance analysis. |
| [/dbpush](cmd-dbpush.md) | Validate all local spec files, tasks, and lifecycle data, then push everything to the MCP Project Hub database. |
| [/implement](cmd-implement.md) | Execute implementation tasks for a spec using the MCP Project Hub. |
| [/wxConversionParity](cmd-wxconversionparity.md) | Audit a BUILT conversion against the original legacy app — what did the rebuild lose? |
| [/wxDBAnalyze](cmd-wxdbanalyze.md) | Senior-DBA review of a project's database — schema integrity, referential integrity, data health, performance/index strategy, and maintenance/bloat today (Phase 2 Batch A), with conventions, security, availability and… |
| [/wxUIUXCodeReview](cmd-wxuiuxcodereview.md) | Combined code + UI/UX review of a diff, PR, branch, the current changes, or a whole codebase (--audit) — targeted at the stack declared in stack.md, not wxKanban's defaults. |

## QA

| Command | What it does |
|---|---|
| [/autofix-tests](cmd-autofixtests.md) | Automatically detect failing tests, analyze root causes, and apply fixes without human intervention. |
| [/preTest](cmd-pretest.md) | Verify a scope before the operator ever sees it — clone the schema, apply the scope's pending DDL to the clone, seed it, boot the real app, drive every route and screen the scope touched, repair within a bounded loop,… |
| [/test-sweep](cmd-testsweep.md) | Analyze every function, procedure, and MCP tool handler in the app, produce a full test plan, build the test harness, write and run the tests, and report issues + successes with a ranked remediation action list. |
| [/wxCreateTestPlan](cmd-wxcreatetestplan.md) | Build a requirement-traceable test plan for the stack declared in stack.md (routes/services/commands, data tables, UI page-to-page flows, and any tool surface) — then optionally --Execute it through three signoff gate… |

## Human Testing → Release

| Command | What it does |
|---|---|
| [/wxHelpGenerate](cmd-wxhelpgenerate.md) | turn a live web app into end-user help by walking it screen by screen, then publish a linked HTML help site + a PDF manual; with --teach, also one AI-agnostic lesson per process for users to learn the app in their own… |

## Conversion

| Command | What it does |
|---|---|
| [/cwConversion](cmd-cwconversion.md) | Convert a legacy SoftVelocity / PCSoft Clarion desktop app into a modern React + Tailwind + shadcn/ui rebuild scaffold by parsing its raw source (TXA/TXD/.clw) — per-element Markdown, regenerated stack-native windows… |
| [/cwConversionScope](cmd-cwconversionscope.md) | Generate Scope-of-Project documents from a Clarion app already converted by /cwConversion — acting as a Systems & Business Analyst, one scope per window/report plus overall Program, Database, and Backend/API scopes, B… |
| [/vbConversion](cmd-vbconversion.md) | Convert a legacy Visual Basic 6 (Classic VB) desktop app into a modern React + Tailwind + shadcn/ui rebuild scaffold by parsing its text source (.vbp/.frm/.bas/.cls/.ctl) — per-element Markdown, regenerated forms (bou… |
| [/vbConversionScope](cmd-vbconversionscope.md) | Generate Scope-of-Project documents from a VB6 app already converted by /vbConversion — acting as a Systems & Business Analyst, one scope per form/report plus overall Program, Database, and Backend/API scopes, BuildSc… |
| [/wxConversion](cmd-wxconversion.md) | Convert a legacy PCSoft WinDev / WebDev app into a modern React + Tailwind + shadcn/ui rebuild scaffold by working FROM its generated technical-documentation PDF — per-element Markdown, regenerated stack-native pages… |
| [/wxConversionScope](cmd-wxconversionscope.md) | Generate Scope-of-Project documents from a PCSoft app already converted by /wxConversion — acting as a Systems & Business Analyst, one scope per page/report plus overall Program, Database, and Backend/API scopes, Buil… |

## Any stage

| Command | What it does |
|---|---|
| [/ai-session](cmd-aisession.md) | Open and manage the **spec-level AI session** that captures all AI-driven dev work for a given spec. |
| [/consultant-hub](cmd-consultanthub.md) | Open or navigate to the Consultant Work Hub for the authenticated user, optionally filtered to a single project. |
| [/remote](cmd-remote.md) | hand where the work stands to this repo's Project Agent so you can carry on from your phone (HANDOFF REMOTE). |
| [/rescue-tokens](cmd-rescuetokens.md) | Use when user hits rate limits, quota exceeded errors, context exceeds 40%, or exhibits token waste symptoms (long conversations, wrong model, verbose output, MCP bloat, cache invalidation, expensive files, too many r… |
| [/track-time](cmd-tracktime.md) | Start or stop a **manual** consultant time-tracking session on a task. |
| [/watermark](cmd-watermark.md) | manually stamp or verify the wxKanban generated-output watermark on a Markdown file. |
| [/web-artifacts-builder](cmd-webartifactsbuilder.md) | Suite of tools for creating elaborate, multi-component claude.ai HTML artifacts using modern frontend web technologies (React, Tailwind CSS, shadcn/ui). |
| [/wxAI-project-init](cmd-wxaiprojectinit.md) | Sets up a local directory structure for a wxKanban project by fetching scaffold data |
| [/wxLedger](cmd-wxledger.md) | the decision ledger. check validates decisions/ledger.yaml, check --global scans the shared learnings for project names, paths and customer data, search finds the approved decision that answers a question, import prop… |
| [Check In Scope](cmd-cockpit-wxkanbancockpitcheckinscope.md) | Check In Scope. |
| [Check Out Scope](cmd-cockpit-wxkanbancockpitcheckoutscope.md) | Check Out Scope. |
| [Community Help (live chat)](cmd-cockpit-wxkanbancockpitopenchat.md) | Community Help (live chat). |
| [Install Kit in This Folder](cmd-cockpit-wxkanbancockpitinstallkit.md) | Install Kit in This Folder. |
| [Install Kit Update](cmd-cockpit-wxkanbancockpitupgradekit.md) | Install Kit Update. |
| [Install Slash Commands (.claude/commands)](cmd-cockpit-wxkanbancockpitinstallcommands.md) | Install Slash Commands (.claude/commands). |
| [Install the Change Impact hook for Claude Code](cmd-cockpit-wxkanbanimpactinstallhook.md) | Install the Change Impact hook for Claude Code. |
| [My Feedback](cmd-cockpit-wxkanbancockpitmyfeedback.md) | My Feedback. |
| [Open Related Spec / File](cmd-cockpit-wxkanbancockpitopenspec.md) | Open Related Spec / File. |
| [Open the Manual](cmd-cockpit-wxkanbancockpitopenmanual.md) | Open the Manual. |
| [Push Feedback to Claude Chat](cmd-cockpit-wxkanbancockpitpushfeedbacktochat.md) | Push Feedback to Claude Chat. |
| [Re-run the Kit Version Check](cmd-cockpit-wxkanbancockpitrecheckkit.md) | Re-run the Kit Version Check. |
| [Refresh Autopilot](cmd-cockpit-wxkanbanautopilotrefresh.md) | Refresh Autopilot. |
| [Refresh Cockpit](cmd-cockpit-wxkanbancockpitrefresh.md) | Refresh Cockpit. |
| [Remove the Change Impact hook for Claude Code](cmd-cockpit-wxkanbanimpactuninstallhook.md) | Remove the Change Impact hook for Claude Code. |
| [Report a Bug / Suggest a Feature](cmd-cockpit-wxkanbancockpitsubmitfeedback.md) | Report a Bug / Suggest a Feature. |
| [Show Change Impact](cmd-cockpit-wxkanbanimpactshowpanel.md) | Show Change Impact. |
| [Show Project Agent Output](cmd-cockpit-wxkanbancockpitshowprojectagentoutput.md) | Show Project Agent Output. |
| [Sign In / Relink Project](cmd-cockpit-wxkanbancockpitsignin.md) | Sign In / Relink Project. |
| [Start Project Agent](cmd-cockpit-wxkanbancockpitstartprojectagent.md) | Start Project Agent. |
| [Stop Project Agent](cmd-cockpit-wxkanbancockpitstopprojectagent.md) | Stop Project Agent. |
| [Toggle Recording Theme (wxLight / wxDark)](cmd-cockpit-wxkanbancockpittoggletheme.md) | Toggle Recording Theme (wxLight / wxDark). |
| [View Feedback Detail](cmd-cockpit-wxkanbancockpitshowfeedbackdetail.md) | View Feedback Detail. |
| [wxkanban-agent archive:files](cmd-cli-archive-files.md) | Moves files to the project archive instead of deleting them. |
| [wxkanban-agent auditfences](cmd-cli-auditfences.md) | Checks that every code unit carries its scope and task fence. |
| [wxkanban-agent kit:configure](cmd-cli-kit-configure.md) | Sets the kit's connection to your wxKanban project. |
| [wxkanban-agent kit:status](cmd-cli-kit-status.md) | Shows the installed kit version and whether an update is waiting. |
| [wxkanban-agent scaffold:frontend](cmd-cli-scaffold-frontend.md) | Scaffolds the frontend from the project's Stack & Style choices. |
