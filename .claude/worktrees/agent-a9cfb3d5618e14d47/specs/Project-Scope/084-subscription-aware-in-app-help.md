# Spec 084: Subscription-aware in-app Help system

**Spec Number**: 084
**Status**: `draft`
**Created**: 2026-07-03
**Depends On**: None
**Source**: `specs/Project-Scope/084-subscription-aware-in-app-help.md`

## Overview

A subscription-aware Help system for wxKanban: one Help surface that documents every feature and app area and adapts what it shows to the viewer's plan — marking each feature *included*, *not included*, or *upgrade-required* — using the same tier model that governs access. It includes an interactive tier selector, an in-app Help page that reads `projectdocuments` doctype `help` and defaults to the viewer's plan, and a public standalone interactive HTML rendering.

**Why:** Users cannot tell in-product what their subscription plan includes, how each area works, or what upgrading unlocks. Nav items and features appear that are actually gated to higher plans, with no explanation — driving support load ("is X in my plan?") and hiding upgrade value. There is no single per-feature/per-area reference that reflects real entitlements.

## Actors

| Element | Value |
| --- | --- |
| **Primary Actor** | Signed-in wxKanban user (any plan) looking up how a feature works and whether their plan includes it |
| **Secondary Actors** | Company ADMIN evaluating upgrade value; wxKanban support/marketing team (deflect tickets, upgrade funnel); Prospect viewing the public standalone Help |
| **Key Value** | One always-accurate, plan-aware reference for what each area does and whether the viewer's plan includes it |

## Scope Boundary

In scope:
- A per-feature/per-area Help catalog covering Dashboard, Projects, My Tasks/Kanban, PM Integrations, Team Management, Time Tracking & Billing, Invoices, Reports, Work Hub, Stack/Theme Profiles, FAQ, Settings, and the 6-phase lifecycle/orchestrator + audit.
- Per-plan availability across the four public plans (Single User, Small/Medium Business, Consultant, Enterprise) shown as included / not included / upgrade-required, naming the unlocking plan. Small/Medium Business is the authoritative baseline; Time Tracking & Billing (and Invoices, Reports) are Consultant+.
- An interactive tier selector.
- An in-app Help page/route reachable from the dashboard nav for all tiers, defaulting to the viewer's plan, reading `projectdocuments` doctype `help`.
- A public standalone self-contained interactive HTML rendering (delivered like the getting-started guide).
- Persistence of the Help content as a single canonical `doctype='help'` row on the wxKanban project.
- Availability data derived from or verified against the code tier model (`TierEnforcementService` feature flags + nav `requiredPlan`).

## Out of Scope

- Any change to entitlement or gating behavior — Help is descriptive only.
- Billing / checkout flows.
- Localization of the Help (documented follow-on, like the getting-started guide).
- Real app screenshots in v1 (icon/diagram visuals now; screenshots are a fast follow).
- Per-project generated Help rows (v1 is a single global row).

## Open Questions

- None blocking. Reconciliation of the `TierEnforcementService` inconsistencies (`time_tracking` flag on `SMALL_BUSINESS`; missing `pm_integration` on `SMALL_BUSINESS`) is tracked as a separate code bug outside this scope.

## User Scenarios & Testing

### US1 — Look up a feature on my plan

**Actor**: Signed-in user (any plan)

**Scenario**:
1. The user opens the Help page from the dashboard nav.
2. The Help defaults to the user's own plan and shows every area with a plain-language description and its status on that plan.
3. For a feature not in the user's plan, the Help shows *upgrade-required* and names the plan that unlocks it.

**Expected outcome**: 100% of dashboard nav areas plus tier-gated features are documented, each with a correct per-plan status.

### US2 — Compare plans / evaluate an upgrade

**Actor**: Company ADMIN (or prospect on the public page)

**Scenario**:
1. The actor changes the tier selector to another plan.
2. The availability matrix updates live to show what that plan includes and what it adds over the current plan.

**Expected outcome**: The per-plan availability shown matches the authoritative tier mapping for all four public plans with zero discrepancies.

### US3 — Help stays truthful as tiers change

**Actor**: wxKanban maintainer

**Scenario**:
1. A tier's entitlements change in code.
2. A verification step compares the Help catalog against the code tier model and fails if they diverge.

**Expected outcome**: Drift between the Help and real entitlements is caught automatically rather than shipping silently.

## Functional Requirements

### FR-001 — Feature/area catalog
The system MUST document every top-level app area and feature — Dashboard, Projects, My Tasks/Kanban, PM Integrations, Team Management, Time Tracking & Billing, Invoices, Reports, Work Hub, Stack/Theme Profiles, FAQ, Settings, and the 6-phase lifecycle/orchestrator + audit — in plain language (what it does, how to use it).

**Acceptance Criteria**:
- [ ] Every dashboard nav area and every tier-gated feature has a catalog entry.
- [ ] Each entry has a plain-language description and how-to.

### FR-002 — Per-plan availability
The system MUST show, for each feature, its status on each of the four public plans (Single User, Small/Medium Business, Consultant, Enterprise) as *included*, *not included*, or *upgrade-required*, naming the plan that unlocks a gated feature. Small/Medium Business is the authoritative baseline; **Time Tracking & Billing is Consultant+** (explicitly not in Single User or Small Business).

**Acceptance Criteria**:
- [ ] Availability is shown for all four plans for every feature.
- [ ] Time Tracking & Billing, Invoices, and Reports show as Consultant+ (not in Single User / Small Business).

### FR-003 — Interactive tier selector
The system MUST let the reader pick a plan and update the catalog live; locked features MUST show an upgrade prompt naming the unlocking plan.

**Acceptance Criteria**:
- [ ] Changing the selected plan updates every feature's status without a page reload.
- [ ] Locked features render an upgrade call-to-action.

### FR-004 — In-app Help page
The system MUST provide a Help route reachable from the dashboard nav for all tiers, defaulting to the viewer's own plan, rendering content read from `projectdocuments` doctype `help`.

**Acceptance Criteria**:
- [ ] The Help nav link is visible to all four plan types.
- [ ] On load, the selector is pre-set to the authenticated viewer's plan.

### FR-005 — Public standalone rendering
The system MUST provide a public, self-contained interactive HTML rendering (delivered like the getting-started guide) so prospects can view the plan-aware Help without signing in.

**Acceptance Criteria**:
- [ ] The standalone page works with no backend and no external assets.
- [ ] It exposes the same tier selector and availability data.

### FR-006 — Persistence
The system MUST store the Help content as a single canonical `doctype='help'` row on the wxKanban project (`specid` NULL, `isgenerated=true`), upserted idempotently.

**Acceptance Criteria**:
- [ ] Re-running generation updates the same row rather than creating duplicates.
- [ ] The row is marked generated.

### FR-007 — Single source of truth / drift check
The per-plan availability MUST be derived from or verified against the code tier model (`TierEnforcementService` feature flags + nav `requiredPlan`), with an automated check that fails on divergence.

**Acceptance Criteria**:
- [ ] A check compares catalog availability to the code tier model and reports discrepancies.
- [ ] The authoritative customer-facing mapping (Small Business baseline; Time & Billing Consultant+) is the source of record where code and pricing disagree.

### FR-008 — Descriptive only
The system MUST NOT change any entitlement or gating behavior; Help is descriptive.

**Acceptance Criteria**:
- [ ] No changes to `companies.billingplan`, `TierEnforcementService`, or nav gating logic.

## Data Requirements

- **Reuses** the existing `projectdocuments` table. This scope adds one project-level row: `doctype='help'`, `specid=NULL`, `projectid` = the wxKanban project, `isgenerated=true`, `title='Help'`, `content` = the generated Help catalog. Upserted via the same pattern as the `ProjectLifecycle` document (match on `projectid` + `doctype` + `specid IS NULL`).
- The tier→feature availability matrix is **static application data** (a typed catalog in code), not a database table.
- **Explicitly forbidden by scope:** no new entitlement/billing tables; no schema or data changes to `companies`, `billingplan`, or any gating table.

## API Routes

- `GET /api/help` — returns the current Help document content (doctype `help`) plus the authenticated viewer's plan, for the in-app Help page. Auth required; available to all tiers.
- `POST /api/admin/help/regenerate` — (ADMIN) regenerates the doctype `help` content from the code tier model and upserts the `projectdocuments` row. Mirrors the `ProjectLifecycle` regenerate endpoint.
- Static asset (no API): `/help.html` — the public self-contained interactive HTML, served from `public/` like `/gettingStartedInstructions.html`.
- No changes to existing gating/entitlement endpoints.

## Frontend Components

- `src/client/pages/HelpPage.tsx` — new in-app Help route (`/help`); fetches `GET /api/help`, defaults the tier selector to the viewer's plan, renders the catalog + availability matrix.
- `src/client/components/help/TierSelector.tsx` — plan picker (four public plans) driving the availability view.
- `src/client/components/help/FeatureCard.tsx` — per-feature card: description + per-plan status (included / not included / upgrade-required with unlocking plan).
- `src/client/components/help/HelpCatalog.tsx` — groups features by area.
- Modify `src/client/components/layout/AppShell.tsx` — add a Help nav link (all tiers); register the `/help` route in `src/client/App.tsx`.
- `public/help.html` — standalone interactive rendering, generated by a build script (like the getting-started page). Not a React component.

## Success Criteria

1. 100% of dashboard nav areas plus tier-gated features are documented in the Help catalog (coverage = documented ÷ total).
2. Zero discrepancies between the Help's per-plan availability and the authoritative tier mapping across all four public plans, verified by an automated check.
3. The in-app Help page auto-selects the viewer's own plan correctly for 100% of the four plan types across test accounts.
4. At least a 30% reduction in "is X in my plan?" support tickets within 60 days of launch.

## Key Entities

- **HelpFeature** — a documented app area/feature: id, area/category, title, plain-language description, how-to. Static catalog in code.
- **PlanAvailability** — for a HelpFeature × Plan: status (`included` | `not_included` | `upgrade_required`) plus the unlocking plan when gated. Derived from the code tier model.
- **Plan** — one of the four public plans (Single User, Small/Medium Business, Consultant, Enterprise); Small/Medium Business is the authoritative baseline.
- **ProjectDocument (existing, reused)** — the `doctype='help'` row storing the generated Help content.

## Constraints

- MUST deliver only the behavior in the scope boundary; Help is descriptive and changes no entitlement logic.
- MUST keep out of scope: entitlement/gating changes; billing/checkout; localization (follow-on); real screenshots in v1 (icon/diagram visuals now); per-project generated Help rows (v1 is one global row).
- MUST source per-plan availability from a single source with an automated drift check, not a hand-maintained divergent copy.
- MUST treat the `TierEnforcementService` inconsistencies (`time_tracking` flag on `SMALL_BUSINESS`; missing `pm_integration` on `SMALL_BUSINESS`) as separate code bugs to reconcile; the Help follows the customer-facing nav/pricing mapping.

## Notes

- **Integration context:** Mirrors the getting-started guide delivery (`public/` static self-contained HTML) and the `ProjectLifecycle` plumbing for `projectdocuments` (doctype, upsert, admin viewer/iframe, regenerate endpoint). The in-app Help page follows AppShell nav conventions and the existing `NavLink` tier-gating pattern; the tier model lives in `TierEnforcementService` + client `lib/billingPlan`. The standalone HTML may later adopt the i18n approach used for the getting-started guide.
- **Production-data risk:** the app's production DB is the same as the local `.env` DB, so writing the `doctype='help'` row touches production data.

## Clarifications

### Session 2026-07-03

| # | Question | Decision |
|---|----------|----------|
| 1 | Which tiers does the Help present? | The four public plans (Single User, Small/Medium Business, Consultant, Enterprise); internal FREE tier is not shown. |
| 2 | How is Help surfaced? | An in-app Help page/route reading `projectdocuments` doctype `help`, plus a public standalone interactive HTML. |
| 3 | Screenshots in v1? | No — icon/diagram visuals now; real screenshots are a documented follow-on. |
| 4 | Where is the content stored? | One global `doctype='help'` row on the wxKanban project. |
| 5 | Authoritative tier mapping? | Small/Medium Business is the baseline; Time Tracking & Billing (and Invoices, Reports) are Consultant+ — not in Single User or Small Business. |
