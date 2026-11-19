# wxKanban — Feature List

wxKanban is three products that work together: the **App** (the SaaS), the **Orchestrator Kit** (what customers install to run the methodology), and the **Dev Cockpit** (the VS Code companion). Feature maturity varies — some are generally available, some are in progress.

---

## Part 1 — The wxKanban App (SaaS)

### Task Management & Aggregation

- **Multi-PM aggregation** — pulls your assigned tasks from Jira, Monday.com, Asana, and Trello into one unified board, so you stop context-switching between tools.
- **Two-way sync** — status changes and notes you make in wxKanban push back to the source system (last-write-wins).
- **Orphan handling** — a task deleted or reassigned upstream is marked "orphaned" (hidden from active views) but its time entries are preserved for billing integrity.
- **Internal task boards** — Monday-style boards with customizable columns and statuses for projects that aren't wired to any external PM system.
- **Unified sort/filter** — by priority, due date, project, or source; internal vs external tasks are clearly distinguished.
- **Kanban lifecycle view** — a board that visualizes work across the 6-phase lifecycle.

### Time Tracking

- **Multi-task timers** — start, pause, and resume timers on one or more tasks, tracked separately to the minute.
- **Billable / non-billable** categorization on every entry, with a full timestamped history.
- **Manual entries & edits** for past work.
- **Runaway-timer guard** — a configurable inactivity threshold (default 8 hours) prompts you to confirm or trim the duration.

### Clients, Projects & Billing

- **Client / company records** — billing contact, default hourly rate, allocated hours; can be pulled from the PM system or entered manually.
- **Timesheets** — generated for a client or project over a date range.
- **Invoices** — computed from billable hours × rate; entries are stamped "invoiced" to prevent double-billing.
- **Download + email delivery** of invoices and timesheets, plus **CSV export** of all major entities for accounting tools.
- **Consultant Work Hub** — an invoice-ready billable preview and consultant-facing billing workflow.

### 6-Phase Project Lifecycle (the methodology core)

- **Enforced 6 phases** — Design → Implementation → QA → Human Testing → Beta → Release; phases cannot be skipped.
- **Numbered specs (Phase 1)** — sequential functional specs with draft / review / approved status; all must be approved to leave Design.
- **Traceability** — implementation tasks, test plans, and feedback all trace back to their originating spec.
- **Test plans (Phase 3)** mapped per spec with pass/fail tracking.
- **Feedback capture (Phases 4 & 5)** — testers and beta users file bug / enhancement / usability feedback that can generate a new Phase-1 spec; Phase 5 changes require explicit approval.
- **Phase-transition audit log** plus a **project health dashboard** (phase status, spec coverage, test results, open feedback).
- **Per-project Lifecycle & Dev-Plan docs** — generated "where am I / what next" overviews and a printable development plan.
- **Project Overview builder** — a managed, always-in-context project overview.

### AI Assistance

- **AI task proposals** — analyzes project context and suggests additional tasks (auto-triggered on project start, per-user opt-out); accept or reject each individually.
- **AI content generation** across the product (overview interviews, marketing copy, theme derivation), on a portable provider layer (Groq / Gemini / OpenAI-compatible — see Bring-Your-Own-LLM).

### Notes & Documentation

- Per-project and per-client notes (manual plus auto-generated session notes), timestamped and organized by tabs.

### Accounts, Multi-tenancy & Admin

- **Custom auth** — bcrypt + JWT, httpOnly cookies, email verification, password reset (no third-party identity provider).
- **Companies, projects, roles** — multi-tenant with company audit logs and ADMIN governance.
- **Invitations** — bulk user invitations with batches and dead-letter handling.
- **SysAdmin / Admin dashboard** — platform administration (companies, users, resync, daily digest, health).

### Subscription & Billing (the business layer)

- **Stripe subscriptions** — signup → payment, trials via SetupIntent, subscription lifecycle, webhook reconciliation, and a subscription-recovery / resync path for drift.
- **Distributor / affiliate** program support.

### Consulting Marketplace

- **Consultant profiles & management**, an **engagement / pre-sales** flow, **marketplace payments**, and **cross-engagement reporting** — turning the platform into a consulting marketplace, not just a personal tool.

### Branding & Theme Studio

- **Theme Studio** — build company theme profiles (colors, typography, radius) with live preview and WCAG contrast checks; projects pick a profile.
- **Borrow-a-Look** — paste a URL and derive a theme from a site you admire.
- **Business chrome + Header/Footer Designer** — design a theme's header and footer visually; they emit as real `Header.tsx` / `Footer.tsx` referenceable in a build.
- **Block Composer** — drag-drop branded page sections that execute to real React + Tailwind + shadcn code.
- **Stack & Style capture** — capture the target tech stack and look at project creation.

### Marketing Module

- **Lead capture / broad-signup** go-to-market, a **marketing dashboard**, **AI marketing assist** (copy), a **Banner Studio** (Gemini Imagen banners with tracked short links), **FAQ** management, a **Newsletter** (Mailgun sends), and a **feature-snippets** catalog.

### Localization

- **6-language internationalization** across nav, signup, public surfaces, and help content, with AI content localization.

### Help System

- **Subscription-aware in-app Help**, a `/docs` Help & Tutorials area (FAQ / videos / training sessions), a Getting-Started guide, and localized help content.

### Legacy App Conversion

- **wxConversion** (WinDev / WebDev → React/shadcn), **vbConversion** (VB6 →), and **cwConversion** (Clarion →) — convert legacy apps into modern rebuild scaffolds from their generated documentation.

### Observability, Security & Health

- **Automatic client + server bug trapping**, **customer bug trapping**, **infra / system health monitoring** (RDS / App Runner metrics → SysAdmin warnings plus CloudWatch alarms), and **SOC 2** controls work.
- **Generated-output watermark** on artifacts.

---

## Part 2 — The Orchestrator Kit (`wxkanban-agent`)

The Kit is what a customer installs to actually run the methodology on their own project. Design principle: it is a **workflow and validation engine, not an AI client** — the editor's AI generates, the Kit validates, fences, and audits.

- **Stage-gated CLI** — commands unlock by lifecycle stage: `buildscope`, `wxConversion`, `createSpecs` (Design); `implement`, `createtesttasks` (Implementation); `runqa` (QA); `runhuman` (Human Testing); `prepareRelease` / `finalizeRelease` (Beta / Release); plus cross-cutting `dbpush`, `pipeline-agent`, `auditfences`.
- **Interactive BuildScope** — section-by-section scope authoring with a strict quality preflight that blocks placeholder-heavy scopes.
- **Spec-first pipeline** — `createSpecs` fans a scope into numbered implementation specs (spec / plan / tasks / lifecycle).
- **Code fencing** — every top-level unit is wrapped in `[SCOPE NNN / Txxx]` BEGIN/END fences naming the authoring spec and task; `auditfences` verifies (CI runs `--strict`), so you always know what authored each line.
- **Capability Index & reuse** — a pgvector-backed semantic search so `buildscope` surfaces existing functionality before you build new (the reuse-check), plus scope analysis and a cross-app **Portfolio Capability Analyzer** (dedupe across apps).
- **Scope Flow & Validation** — automated scope validation and a cross-scope dependency flow map.
- **MCP server** — the hosted Model Context Protocol interface (`mcp.wxperts.com`) that exposes the Kit's operations to Claude and editors, with token↔project binding.
- **Bring-Your-Own-LLM / provider portability** — `LLM_PROVIDER` governs both server and Kit; customers can bring their own OpenAI-compatible endpoint.
- **Kit delivery & lifecycle** — customers get the Kit from GitHub Releases; auto-update (notify + confirm at session start), Connect bootstrap (auto-injects `.mcp.json` + init), and field-defect hardening (CLAUDE.md scaffolding gates).

---

## Part 3 — The Dev Cockpit (VS Code extension)

The Cockpit is the in-editor companion that surfaces the Kit and the lifecycle without the terminal.

- **Command surfacing** — every Kit command appears in a Cockpit UI backed by a help catalog, so users discover what to run at each stage.
- **Live build status** — the "where am I / what's next" devplan and lifecycle docs rendered in-editor.
- **Community live help (YappChatt)** — an in-Cockpit help chat brokered through the server.
- **Startup self-update & health** — the Cockpit updates itself at session start and runs a startup health check.
- **Bundled themes** — wxDark / wxLight (and a baked gruvbox) shipped in the VSIX, opt-in.
- **Feedback sink** — VS Code feedback routes centrally into the wxKanban Development project.
- **Project Agent** — each project's agent serves its company-owned YappChatt room; "HANDOFF REMOTE" hands where the work stands to it, to carry on from the phone.
- **Delivery** — published on the VS Code Marketplace (Marketplace-only; the Kit never re-bundles the VSIX).
