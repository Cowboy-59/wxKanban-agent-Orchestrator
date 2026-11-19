# Task Breakdown: App UI String Extraction

**Feature**: App UI String Extraction
**Spec**: 052
**Date Generated**: 2026-06-13
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | T001 Extract strings: app shell + layout + navigation | high | todo |
| 2 | T002 Extract: auth — login, registration, settings entry | high | todo |
| 3 | T003 Extract: dashboard + admin dashboard surfaces | high | todo |
| 4 | T004 Extract: projects, tasks, Kanban views | high | todo |
| 5 | T005 Extract: time tracking + invoices | medium | todo |
| 6 | T006 Extract: consultant / engagement / work-hub surfaces | medium | todo |
| 7 | T007 Extract: audit + compliance surfaces | medium | todo |
| 8 | T008 Extract: SysAdmin surfaces | low | todo |
| 9 | T009 Extract: settings, integrations, help, notes panels | medium | todo |
| 10 | T010 Verify no hardcoded strings remain + extract en-US keys into bundle | high | todo |

## Task Details

### T001 — Extract strings: app shell + layout + navigation

Sweep the app chrome that wraps every authenticated view — `src/client/components/layout/*` (app shell, sidebar/navigation, top bar, breadcrumbs, user menu). Move every hardcoded user-facing label, tooltip, and menu item onto spec 051's translation hook and author the matching en-US keys. This is high priority because the chrome is visible on every screen, so it is the most observable proof the locale layer is live.

### T002 — Extract: auth — login, registration, settings entry

Refactor the unauthenticated/entry surfaces — login, registration, and the settings entry point (e.g. `src/client/pages/Login.tsx`, `Register.tsx`, and the profile/settings landing). All field labels, button text, validation copy, and helper text resolve through the hook. Per scope 046 US1, the login screen following the user's preference is a named demo case, so this surface is high priority.

### T003 — Extract: dashboard + admin dashboard surfaces

Sweep the user Dashboard and `src/client/pages/AdminDashboard.tsx` (and their cards/panels — `ProjectOverviewCard`, `ReportLinkCard`, `CreateProjectModal`, lifecycle/phase labels). Extract headings, empty-state copy, button labels, and the "not created" / status strings onto the hook with en-US keys. High priority as these are the primary post-login landing surfaces.

### T004 — Extract: projects, tasks, Kanban views

Refactor the core work surfaces — project lists/detail, task detail, and the Kanban board/column/card components under `src/client/pages/` and `src/client/components/` (project, task, and board views). Column titles, action buttons, filters, and status labels resolve through the hook; methodology/lifecycle terms (phase names) stay English per the protected-term list. High priority as the most-used app area.

### T005 — Extract: time tracking + invoices

Sweep the time tracking and invoicing surfaces — timer controls, time-entry forms, billable toggles, and the invoice list/detail/generation views. Extract labels, units, and action copy onto the hook with en-US keys; do not extract monetary values or methodology terms. Medium priority.

### T006 — Extract: consultant / engagement / work-hub surfaces

Refactor the consultant management, engagement, and work-hub components (the Consultants Management surface shipped in spec 037 and related panels). Move headings, table headers, status pills, and action buttons onto the hook with en-US keys. Medium priority.

### T007 — Extract: audit + compliance surfaces

Sweep the audit report and compliance views (e.g. the Audit Report surface linked from `AdminDashboard`, audit-log panels, and compliance status displays). Extract labels and descriptive copy onto the hook; keep methodology/lifecycle terms English. Medium priority.

### T008 — Extract: SysAdmin surfaces

Refactor the internal SysAdmin pages — e.g. `src/client/pages/SysAdmin/*` (feedback queue/decision panel, metrics dashboard, user/company admin). Lowest priority because these are internal-admin surfaces that can lag end-user-facing areas; still swept onto the hook with en-US keys for guardrail completeness.

### T009 — Extract: settings, integrations, help, notes panels

Sweep the remaining configuration and support surfaces — profile/settings panels (beyond the auth entry point), PM-system integration/connection screens, help/documentation panels, and notes panels. Extract all labels, descriptions, and action copy onto the hook with en-US keys. Medium priority.

### T010 — Verify no hardcoded user-facing strings remain in swept areas + extract en-US keys into the bundle

Run spec 051's hardcoded-string guardrail across every area swept in T001–T009 and confirm it passes clean (and flags a deliberately planted bare string). Consolidate and verify that every extracted string has a corresponding en-US key in the bundle so the framework resolves real values, and confirm switching a demo locale visibly changes resolved strings app-wide. This is the closeout/verification task that proves FR-001 is realized in bulk. High priority.
