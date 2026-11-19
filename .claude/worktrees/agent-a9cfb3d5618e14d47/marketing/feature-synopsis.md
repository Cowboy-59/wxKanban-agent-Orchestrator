# wxKanban — Feature Synopsis

**Last updated:** 2026-06-18
**One-liner:** A multi-platform task-management and time-tracking system that doubles as a guided, AI-assisted software-development lifecycle — the bridge for seasoned developers crossing from a proprietary platform to AI-built, full-stack development on open foundations they actually own.

wxKanban isn't "another Kanban board." It pairs everyday project management (tasks, time, billing, PM-tool sync) with a structured **6-phase lifecycle** and an AI orchestrator, so the judgment that makes a senior developer valuable — taking work from messy idea to tested, shipped, audited release — is captured, taught, and reinforced as you build.

> **Accuracy note (2026-06-18):** Sections 1–11 are built and shipping (verified against the codebase). Section 12 (WinDev/HFSQL crossing) is a **founder-led, done-*with*-you conversion service and method** — not an in-app, self-serve converter. Marketed as such.

---

## 1. Project & Task Management

- **Kanban views** for projects and tasks with a clear, lifecycle-aware layout.
- **Projects** as the unit of work, each moving through defined lifecycle phases.
- **Tasks** that originate in wxKanban *or* sync in from an external PM system.
- **Notes** — markdown annotations attached to tasks and projects.
- **Dashboards** for admins, teams, and consultants, with per-project overview, lifecycle, and audit report links.

## 2. The 6-Phase Lifecycle (the differentiator)

A structured quality methodology that carries every scope from idea to release:

**Design → Implementation → QA Testing → Human Testing → Beta → Release**

- **Stage gates** keep a scope from advancing until each phase's conditions are met.
- **Spec-first workflow** — features are specified, planned, and broken into tasks before code is written.
- **Auto-generated artifacts** per scope: spec, plan, tasks, tests, and quickstart.
- **Full audit report on every release** — the methodology is the product's teaching engine, not just process overhead.

## 3. AI-Assisted Development

- **AI-powered task suggestions and workflow optimization**, driven by your AI tool of choice.
- **Orchestrator kit (`wxkanban-agent`)** — a CLI + MCP workflow engine that scaffolds scopes, generates specs/tasks, validates and writes code with traceable code-fencing, and runs audits.
- **AI Spec Sessions** — persistent, multi-day AI consultation sessions that develop a spec with you over time, with the work tracked as billable time against the session.
- **Bring-your-own-AI:** the editor AI generates; the kit validates, writes, fences, and audits. Provider-configurable (Groq/Gemini/OpenAI).
- **VS Code Dev Cockpit** — a sidebar showing the current project's remaining work per scope, live as you build, without leaving the editor.
- **Scope check-out / check-in** — claim a scope to work on it; the editor surfaces which scopes are checked out and read-only, so multi-developer work doesn't collide.

## 4. PM-System Integration

- **Connect Jira, Monday.com, Asana, and Trello** via OAuth2.
- **Background sync** every 5–15 minutes; non-blocking on failure.
- **Inbound + outbound awareness** — tasks sync in from your PM system, and wxKanban specs/tasks push status back out.
- **Conflict resolution** — last-write-wins (wxKanban authoritative).

## 5. Time Tracking & Billing

- **Built-in timer** with client-side elapsed tracking; **inactivity prompt** after long-running sessions.
- **Billable flagging** per time entry.
- **Invoice generation** — PDF invoices from billable hours × rate; each time entry is marked invoiced once, so the same hours are never billed twice.

## 6. Teams, Roles & Multi-Tenancy

- **Company-based tenancy** — users, projects, and billing isolated per company.
- **Role-based access control** — ADMIN, TEAM_MANAGER, TEAM_MEMBER (with a platform-level SYSADMIN).
- **Team management** with invitations and seat tracking.

## 7. Consulting & Engagements (B2B)

- **Consulting companies** can perform scoped work *for* client companies under managed **engagements**.
- **Engagement- and assignment-level access grants**, with internal sub-assignment to consulting members who don't consume the client's seats.
- **B2B invoicing** — consulting companies bill clients for engagement work, delivered to the client's billing contact.
- Supporting surfaces for marketplace, pre-sales engagement, and cross-engagement reporting.

## 8. Compliance & Audit

- **Upload your SDLC documents** to be analyzed for compliance.
- **Assign SDLC controls to team members** to satisfy audit requirements.
- **AI-assisted audit compliance** checks across the lifecycle (GDPR / HIPAA / SOC 2 / HITRUST templates).
- **Per-project audit reports** and lifecycle summaries.
- **AES-256-GCM encryption at rest**; secrets in environment, never in code. (Positioned for SOC 2 / HIPAA / GDPR-aligned operation.)

## 9. Documentation & Help

- **Public Docs** — a logged-out documentation section on the landing site, with written guides and embedded how-to videos, managed by the platform team.
- **In-app help system** — searchable help articles and contextual guidance.

## 10. Platform Administration & Growth

- **SysAdmin dashboard** — cross-tenant visibility and control: companies, users, platform metrics, system health, and docs management.
- **User-feedback triage** — feedback (including from the VS Code extension) routed centrally for tagging, triage, and follow-up.
- **Built-in marketing & lead capture** — campaign management, lead funnel, and an in-app marketing asset library.
- **Subscription & billing operations** via Stripe.

## 11. Localization & Stack Profiles

- **Multi-language UI (i18n)** — full localization framework with per-user language preference; the platform speaks your users' language.
- **Stack Profiles** — reusable, company-wide tech-stack templates that set conventions for new projects and keep teams consistent.

## 12. The WinDev / HFSQL Conversion Bridge *(guided service & method — the beachhead)*

The proof-point and beachhead: wxKanban itself was built by converting a real WINDEV application to AI-built full-stack. This is delivered as a **guided, founder-led crossing done *with* you** — a proven method, not an in-app one-click converter.

- **Your data comes with you** — HFSQL generated to standard SQL and migrated into PostgreSQL, MS SQL, or MySQL you own.
- **Your logic becomes readable** — procedures and window/screen files converted to Markdown for AI to analyze and rebuild.
- **Your screens are captured** — screenshots preserve the exact look so the rebuilt app feels familiar.
- **AI rebuilds it as modern full-stack** — you keep the judgment, control, and ownership.

---

## Technology Foundation

| Layer | Technology |
|---|---|
| Backend | Express (Node.js 20 LTS), RESTful API |
| Frontend | React 18 + Vite, TailwindCSS + shadcn/ui |
| Database | PostgreSQL 15+ with Drizzle ORM (UUID v7 keys) |
| Auth | bcrypt + JWT, httpOnly cookies |
| AI | Provider-configurable (Groq / Gemini / OpenAI) |
| Integrations | OAuth2 + polling (Jira, Monday.com, Asana, Trello) |
| Billing | Stripe |
| Localization | Built-in i18n (per-user language preference) |
| Testing | Vitest + Playwright |

---

## Why It Matters

The hard part of building software was never the syntax — it was the **judgment**: knowing how to take an application from messy reality to a clean, tested, shipped, audited result. That judgment *is* the lifecycle, and it's exactly what AI-assisted development still demands. wxKanban hands seasoned developers the new tools and walks them across — so they level up instead of starting over, and never have to bet their career on one vendor's survival again.
