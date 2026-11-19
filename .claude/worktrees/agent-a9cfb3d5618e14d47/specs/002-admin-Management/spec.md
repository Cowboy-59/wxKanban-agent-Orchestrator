# Feature Specification: Admin & Company Management System

**Feature Branch**: `002-admin-management`
**Created**: 2026-02-14
**Revised**: 2026-02-19
**Status**: Draft
**Input**: Scope.md — Company registration, subscription tiers (FREE/SMALL_BUSINESS/CONSULTANT/ENTERPRISE), admin dashboard with role-conditional navigation and tier-gated features.

---

## Overview

The Admin & Company Management System enables wxKanban to operate as a multi-user, team-based SaaS product. Companies register, choose a subscription plan, and gain access to team management, project oversight, billing configuration, and financial reporting based on their tier. Administrators see a purpose-built dashboard with role-conditional navigation; team members see a task-focused view.

**Target Users**: Company administrators, team managers, billing personnel, team members

**Core Value**: Enable team collaboration with clear role hierarchies, plan-gated capabilities, and administrative oversight of team activity and company financials. Subscription tiers align pricing to organizational scale.

**Key Capabilities**:

- Company registration with subscription tier selection
- Role-conditional navigation: ADMIN and TEAM_MANAGER see admin shell (8 items); TEAM_MANAGER has billing/invoices/reports role-locked; TEAM_MEMBER sees task-focused shell (4 items)
- Tier-gated features with visible upgrade prompts for locked capabilities
- User invitation, role management, and team manager delegation
- Billing rate configuration and invoice generation (tier-dependent)
- Admin dashboard with daily digest and project drill-down
- Daily 6am summary email with project and team metrics

---

## Subscription Tiers

| Tier | Price | Max Users | Payment Required | Status on Register |
|---|---|---|---|---|
| FREE | $0/month | 5 | No | ACTIVE immediately |
| SMALL_BUSINESS | $0/month | 5 | No | ACTIVE immediately |
| CONSULTANT | $29.95/month | Unlimited | Yes (Stripe) | PENDING until paid |
| ENTERPRISE | $59.95/month + $5/user over 25 | 25 included | Yes (Stripe) | PENDING until paid |

Tier is stored in `companies.billingplan`.

---

## User Scenarios & Testing

### Primary User Story 1: Company Registration and Plan Selection

**As a** business owner setting up wxKanban,
**I need to** register my company, choose a subscription plan appropriate to my team size, and optionally provide payment details,
**So that** my team can access the platform with the right feature set for our needs.

**Acceptance Scenarios**:

- **Given** no wxKanban account exists, **When** I complete company registration with FREE plan, **Then** company is ACTIVE immediately with no payment step
- **Given** I select CONSULTANT plan during registration, **When** I submit, **Then** I am directed to payment before account activation
- **Given** I complete CONSULTANT plan payment via Stripe, **When** payment succeeds, **Then** company status changes to ACTIVE and admin dashboard is accessible
- **Given** I complete registration, **When** verification email is sent, **Then** I receive the email within 5 minutes
- **Given** I verify my email, **When** I click the link, **Then** company is fully activated and admin dashboard becomes accessible
- **Given** my verification link has expired (24 hours), **When** I try to log in, **Then** I see an "Unverified account" screen with a "Resend verification email" button and a "Verify Now" bypass option
- **Given** I click "Verify Now" (admin bypass), **When** the action fires, **Then** company is activated immediately without requiring email link click

### Primary User Story 2: Admin Dashboard — Tier-Gated View

**As a** company administrator,
**I need to** access a dashboard showing my subscription status, team summary, and project overview, with tier-appropriate features visible,
**So that** I can manage my company and understand what capabilities my current plan includes.

**Acceptance Scenarios**:

- **Given** I am an ADMIN on FREE plan, **When** I access the dashboard, **Then** I see: Subscription Card, Team Members, Project Overview, and Daily Digest Preview; Invoices and Reports sections show upgrade prompts
- **Given** I am an ADMIN on CONSULTANT plan, **When** I access the dashboard, **Then** all sections are fully accessible with no locked features
- **Given** I am an ADMIN on FREE plan and I view the Invoices section, **When** I see the locked state, **Then** I see a badge "Requires CONSULTANT" and an "Upgrade Plan" button
- **Given** I click "Upgrade Plan" from a locked section, **When** the action fires, **Then** I am routed to billing/plan upgrade flow
- **Given** I am logged in as ADMIN, **When** I view the sidebar, **Then** I see nav items: Dashboard, Team Members, Projects, PM Integrations, Time & Billing, Invoices, Reports, Settings
- **Given** I am logged in as a TEAM_MEMBER, **When** I view the sidebar, **Then** I see nav items: Dashboard, Time Tracking, PM Integrations, Projects (assigned only) — NO billing, team management, or reports
- **Given** I am logged in as a TEAM_MANAGER, **When** I view the sidebar, **Then** I see all 8 admin nav items but Time & Billing, Invoices, and Reports render as role-locked with "Requires Admin" message

### Primary User Story 3: Team Member Invitation and Role Assignment

**As a** company administrator,
**I need to** invite team members by email and assign roles,
**So that** each person has appropriate access and I can delegate project management to Team Managers.

**Acceptance Scenarios**:

- **Given** I am ADMIN, **When** I invite a user by email, **Then** an invitation email with a 7-day valid link is sent and user status shows "pending"
- **Given** I invite 50 users via CSV bulk upload, **When** processing completes, **Then** all valid invitations are sent within 2 minutes
- **Given** user receives invitation, **When** they click the link and set a password, **Then** they join the company and see their assigned projects
- **Given** an invitation email is sent, **When** the recipient clicks the "Accept Invitation" link, **Then** it opens the registered `/accept-invitation/:token` acceptance page (never a 404/blank), with the origin being the configured production `CLIENT_URL` and not `localhost` (see FR-110, FR-111)
- **Given** I assign Team Manager role (CONSULTANT+), **When** the user logs in, **Then** they see project management options but no billing or global team management
- **Given** an invitation expires after 7 days, **When** the invited user tries to use the link, **Then** they see "expired" message and admin can resend

### Primary User Story 4: Project Overview and Drill-Down

**As a** company administrator,
**I need to** view a project summary grid showing all projects by team member and status, and drill into any project for task-level detail,
**So that** I can monitor team progress and provide guidance via notes.

**Acceptance Scenarios**:

- **Given** I view the Projects section, **When** the page loads, **Then** I see a grid: project name | assigned member | task count | status | % complete
- **Given** I click a project row, **When** the drill-down opens, **Then** I see tasks with status, progress by date, and assigned team member
- **Given** I view a task in the drill-down, **When** I submit a note, **Then** the note is saved and visible to the assigned team member
- **Given** daily 6am trigger fires, **When** email is sent to admin, **Then** email contains active projects, billable hours tracked yesterday, team activity summary

### Primary User Story 5: Billing and Invoice Management (CONSULTANT+)

**As a** company administrator on CONSULTANT or ENTERPRISE plan,
**I need to** configure billing rates and generate invoices from tracked time,
**So that** I can accurately bill clients for work performed.

**Acceptance Scenarios**:

- **Given** I set company default rate to $150/hour, **When** no project or user override exists, **Then** all time entries use $150/hour for billing
- **Given** I set a project-specific rate of $200, **When** a user without personal rate override tracks time on that project, **Then** billing uses $200/hour
- **Given** a user has a personal rate of $250, **When** they track time on any project, **Then** their rate ($250) takes precedence over project and company rates
- **Given** I generate an invoice for January, **When** the PDF is generated, **Then** only billable time entries from January are included, previously invoiced entries are excluded, and invoice number is INV-2026-NNN format
- **Given** I am on FREE plan and navigate to Invoices, **When** the page loads, **Then** I see a locked state with "Requires CONSULTANT" badge and upgrade CTA

### Edge Cases

**EC-1: Seat Limit Reached**
- FREE or SMALL_BUSINESS company at 5 users tries to invite a 6th
- Expected: Invite action blocked with message "Team size limit (5) reached for your plan. Upgrade to CONSULTANT for unlimited members."

**EC-2: Payment Failure on Activation**
- User selects CONSULTANT plan but Stripe payment fails
- Expected: Company remains PENDING. User returned to payment screen with error. No charge applied. Can retry or choose lower tier.

**EC-3: Role Demotion**
- Admin is demoted to Developer
- Expected: Immediate loss of admin capabilities (billing, team management, reports). Project access and time tracking preserved. Cannot re-grant own admin role.

**EC-4: User Removed from Project Mid-Work**
- Team member removed from project while timer is running
- Expected: Access removed immediately. Time entries up to removal preserved and billable. No new entries for that project.

**EC-5: ENTERPRISE Per-User Overage**
- ENTERPRISE company has 30 users (5 over included 25)
- Expected: Billing shows base $59.95 + $25 overage = $84.95. Seat count visible in Subscription Card with overage indicator.

**EC-6: Team Manager on FREE Plan**
- Admin tries to assign Team Manager role on FREE plan
- Expected: Action blocked. "Team Manager role requires CONSULTANT plan" shown with upgrade prompt.

**EC-7: Locked Feature Access Attempt**
- FREE plan admin navigates directly to /reports URL
- Expected: Reports page renders in locked state with upgrade prompt, not 403 or blank page.

---

## Functional Requirements

### Company Registration and Subscription (FR-001 to FR-020)

**FR-001**: System MUST allow users to register a new company by providing company name, billing contact email, physical address, and phone number.

**FR-002**: System MUST validate all required registration fields are present and email is in valid format before proceeding.

**FR-003**: System MUST offer four subscription tiers during registration: FREE ($0, 5 users, no payment), SMALL_BUSINESS ($0, 5 users, no payment), CONSULTANT ($29.95/month, unlimited users, Stripe payment required), ENTERPRISE ($59.95/month + per-user overage, 25 included users, Stripe payment required).

**FR-004**: System MUST allow FREE and SMALL_BUSINESS companies to complete registration without a payment step; company status is set to ACTIVE immediately upon email verification.

**FR-005**: System MUST require Stripe payment completion before activating CONSULTANT or ENTERPRISE companies; company status remains PENDING until payment succeeds.

**FR-006**: System MUST send verification email to company contact within 5 minutes of registration. Verification link expires after 24 hours. Admin can resend from the login screen (generates new token, invalidates previous). Admin can also bypass email verification via a "Verify Now" action on the unverified account page without clicking the email link.

**FR-007**: System MUST activate company only after email verification is confirmed OR admin bypass is used; company is inaccessible before verification.

**FR-008**: System MUST enforce user seat limits per tier: FREE and SMALL_BUSINESS are capped at 5 users; CONSULTANT at unlimited; ENTERPRISE at 25 included with unlimited overage.

**FR-009**: System MUST block invitation of additional users when a seat-limited plan is at capacity, with a message identifying the limit and suggesting an upgrade.

**FR-010**: System MUST allow administrators to change billing plan; downgrading to a seat-limited plan requires team to be within the new limit before downgrade succeeds.

**FR-011**: System MUST calculate ENTERPRISE per-user overage billing: base price + $5 for each user beyond 25.

**FR-012**: System MUST allow company administrators to update company profile (name, address, contact email, phone) at any time.

**FR-013**: System MUST maintain audit trail of all company profile changes with timestamp and acting user.

**FR-014**: System MUST allow administrators to deactivate the company account (soft delete, no data destruction).

**FR-015**: System MUST immediately prevent all users of a deactivated company from signing in.

**FR-016**: System MUST preserve all data when company is deactivated: users, projects, tasks, time entries, invoices remain intact.

**FR-017**: System MUST allow company reactivation within 90 days of deactivation without data loss.

**FR-018**: System MUST send alert notifications for: payment failure, plan expiry approaching (14 days), seat limit reached (100% utilization).

**FR-019**: System MUST allow administrators to configure and update company default hourly billing rate.

**FR-020**: System MUST allow administrators to upload company logo for use in generated invoices.

---

### Role-Conditional Navigation and Dashboard Shell (FR-021 to FR-035)

**FR-021**: System MUST use a single application shell with sidebar navigation that adapts its items and locked states based on `usertype` (ADMIN, TEAM_MANAGER, TEAM_MEMBER).

**FR-022**: System MUST display the following sidebar navigation items for ADMIN users (all active): Dashboard, Team Members, Projects, PM Integrations, Time & Billing, Invoices, Reports, Settings.

**FR-023**: System MUST display the following sidebar navigation items for TEAM_MANAGER users (same 8-item admin shell as ADMIN): Dashboard, Team Members, Projects, PM Integrations, Time & Billing, Invoices, Reports, Settings. Time & Billing, Invoices, and Reports MUST render as role-locked (not tier-locked) for TEAM_MANAGER — visible in nav but locked with "Requires Admin" message instead of an upgrade prompt.

**FR-023a**: System MUST display the following sidebar navigation items for TEAM_MEMBER users: Dashboard, Time Tracking, PM Integrations, Projects (assigned only). No billing, team management, reports, or settings items shown.

**FR-024**: System MUST require `usertype`, `company.billingplan`, `company.subscriptionstatus`, and seat usage data to be available in user context at login for dashboard rendering.

**FR-025**: System MUST display a Subscription Card widget on the admin dashboard showing: plan name, status (ACTIVE/PENDING/SUSPENDED), seat usage (X of Y), next billing date (paid plans), and plan upgrade link.

**FR-026**: System MUST display seat overage indicator on Subscription Card for ENTERPRISE companies exceeding 25 included users.

**FR-027**: System MUST display a Team Members panel on the admin dashboard showing: member list with role, status, last active date, with Invite and Manage actions.

**FR-028**: System MUST display a Project Overview panel showing a summary grid: project name, assigned member, task count, status, percent complete.

**FR-029**: System MUST display a Daily Digest Preview widget showing a miniature view of the content that will be included in the next 6am summary email.

**FR-030**: System MUST allow admin to drill down into any project from the Project Overview panel to see task-level status, progress by date, and team member assignments.

**FR-031**: System MUST allow admin to add notes to tasks from within the project drill-down view; notes must be visible to the assigned team member.

**FR-032**: System MUST automatically refresh dashboard metrics every 5 minutes without requiring page reload.

**FR-033**: System MUST allow administrator to configure dashboard widget order (reorder, hide/show widgets). Widget preferences MUST be stored per-user in `users.dashboardconfig` as a JSON object and retrieved at login. API: GET/PATCH `/api/user/dashboard/config`.

**FR-034**: System MUST display an activity feed showing up to 10 recent company events: users joined, projects created, invoices generated, team member status changes.

**FR-035**: System MUST route users to appropriate dashboard view on login based on their usertype: ADMIN and TEAM_MANAGER see the admin overview dashboard; TEAM_MEMBER sees the task-focused view.

---

### Tier-Gated Features and Upgrade Prompts (FR-036 to FR-055)

**FR-036**: System MUST render all subscription-gated sections as visible but locked for users on ineligible plans — sections are never hidden from navigation.

**FR-037**: System MUST display a locked state for each ineligible section containing: section title, grayed icon, feature description, tier badge ("Requires CONSULTANT"), and "Upgrade Plan" button.

**FR-038**: System MUST route users clicking "Upgrade Plan" to the billing/plan upgrade flow.

**FR-039**: System MUST gate PM Integrations: FREE and SMALL_BUSINESS plans are limited to 1 PM connection; after the first connection is configured, the "Add Integration" action is locked with a seat-limit message and upgrade prompt.

**FR-040**: System MUST gate Time Tracking billing rates: FREE and SMALL_BUSINESS users see basic time view without billing rate configuration; CONSULTANT and ENTERPRISE users see full billing rate management.

**FR-041**: System MUST gate Invoicing: FREE plan shows Invoices section in full locked state (Requires CONSULTANT); SMALL_BUSINESS shows basic invoice view with limits; CONSULTANT and ENTERPRISE have full PDF invoice generation.

**FR-042**: System MUST gate Reports: FREE and SMALL_BUSINESS show Reports section in locked state (Requires CONSULTANT); CONSULTANT has basic reports; ENTERPRISE has advanced analytics.

**FR-043**: System MUST gate Team Manager role assignment: FREE and SMALL_BUSINESS cannot assign Team Manager role; CONSULTANT and ENTERPRISE can assign Team Manager per project.

**FR-044**: System MUST gate SSO/SAML configuration: only ENTERPRISE plan can access SSO configuration in Settings.

**FR-045**: System MUST enforce locked feature restrictions server-side: locked actions return 403 with upgrade message, not just hidden in the UI.

**FR-046**: System MUST allow ENTERPRISE administrators to configure SSO/SAML settings when fully unlocked.

**FR-047**: System MUST allow CONSULTANT and ENTERPRISE administrators to assign Team Manager role to users; Team Managers can manage assigned projects and team members but cannot access billing.

**FR-048**: System MUST allow CONSULTANT and ENTERPRISE administrators to configure multiple PM system connections (Jira, Monday.com, Asana, Trello).

**FR-049**: System MUST allow CONSULTANT and ENTERPRISE administrators to configure per-user and per-project billing rate overrides.

**FR-050**: System MUST allow CONSULTANT and ENTERPRISE to generate full PDF invoices with company branding; invoice number format INV-YYYY-NNN.

**FR-051**: System MUST mark all time entries included in an invoice with invoiced=true to prevent duplicate billing.

**FR-052**: System MUST prevent re-billing of time entries already marked as invoiced.

**FR-053**: System MUST generate financial reports for CONSULTANT+ plans: revenue by month, billable vs. non-billable hours, per-user productivity.

**FR-054**: System MUST generate advanced analytics for ENTERPRISE plans: project profitability, year-to-date comparison, custom report builder with save/template capability.

**FR-055**: System MUST display upgrade prompt for any action attempted by a lower-tier user that requires a higher plan, including direct URL navigation to locked routes.

---

### User and Role Management (FR-056 to FR-085)

**FR-056**: System MUST enforce three `usertype` values: ADMIN (full company control, all sections), TEAM_MANAGER (project/team management, no billing — CONSULTANT+ only; billing/invoices/reports role-locked), TEAM_MEMBER (own tasks and time only, 4-item nav).

**FR-057**: System MUST define ADMIN permissions: invite users, assign projects, deactivate users, modify billing rates, generate reports, update company profile, manage team structure, assign TEAM_MANAGER usertype.

**FR-058**: System MUST define TEAM_MANAGER permissions (CONSULTANT+ only): assign users to projects, remove users from projects, view team dashboards, create and modify projects. No billing access, no global user management, cannot modify billing rates or generate invoices.

**FR-059**: System MUST define TEAM_MEMBER permissions: view assigned projects, create tasks, track time, view own time entries. Cannot see other users' data or modify projects.

**FR-060**: System MUST validate usertype-based access on all endpoints, returning 403 with appropriate message for unauthorized attempts.

**FR-061**: System MUST allow administrators to invite new users by email address.

**FR-062**: System MUST support bulk user invitations by CSV file upload (email list).

**FR-063**: System MUST generate unique 7-day-valid invitation tokens and send invitation emails.

**FR-064**: System MUST track invitation status: pending, accepted, expired.

**FR-065**: System MUST allow administrator to resend expired invitations.

**FR-066**: System MUST allow invitees to complete profile (name, timezone) and set password during onboarding.

**FR-067**: System MUST send welcome email after successful account creation.

**FR-068**: System MUST allow pre-assignment of `usertype` (ADMIN, TEAM_MANAGER, TEAM_MEMBER) during invitation.

**FR-069**: System MUST allow administrators to deactivate users; deactivated users cannot log in and all time entry history is preserved.

**FR-070**: System MUST allow administrators to reactivate deactivated users.

**FR-071**: System MUST store and enforce user billing properties: activeflag, payrate, tracktimeflag (can disable time tracking without deactivating login).

**FR-072**: System MUST track timezone per user for scheduling and date boundary calculations.

**FR-073**: System MUST track lastloginedat timestamp on each successful authentication.

**FR-074**: System MUST allow administrators to export user list: name, email, role, status, join date, last login.

**FR-075**: System MUST support bulk user deactivation.

**FR-076**: System MUST support assigning multiple users to a single project (many-to-many).

**FR-077**: System MUST allow users to have different roles on different projects (Lead, Team Member, Observer).

**FR-078**: System MUST preserve time entries when a user is removed from a project; user loses future access but billing history is intact.

**FR-079**: System MUST track project-user assignment and removal dates.

**FR-080**: System MUST display workload summary per user: assigned project count, total hours, utilization percentage.

**FR-081**: System MUST support billing rate hierarchy: user-specific rate > project-specific rate > company default rate, resolved automatically.

**FR-082**: System MUST apply the billing rate effective at time entry creation: the resolved rate (via user > project > company hierarchy) MUST be stored in `timeentries.entryrate` at creation time. Invoice generation reads `entryrate` directly — rate changes after entry creation do not affect existing entries.

**FR-083**: System MUST maintain audit trail of all rate changes: timestamp, previous rate, new rate, changed by whom.

**FR-084**: System MUST allow bulk assignment operations (add multiple users to a project in a single action).

**FR-085**: System MUST allow administrators to view full assignment history for any project or user over a date range.

---

### Email Notifications and Daily Summary (FR-086 to FR-100)

**FR-086**: System MUST send daily summary email at administrator-configured time (default 6:00 AM). Configuration stored in `companies.digestconfig` JSON column (send time, frequency, recipients). Updated via PATCH `/api/company/settings`.

**FR-087**: System MUST include in daily email: active project status, billable hours tracked yesterday, team member activity, pending time approvals.

**FR-088**: System MUST support email digest frequency configuration: daily, weekly (Monday), monthly (1st).

**FR-089**: System MUST support multiple email recipients for daily summary.

**FR-090**: System MUST allow administrators to unsubscribe from or modify email frequency at any time.

**FR-091**: System MUST send alert emails for critical events: invitation expiry (48 hours), payment method failure, company deactivation.

**FR-092**: System MUST retry failed transactional emails with exponential backoff: 5 minutes, 30 minutes, 4 hours. After 3 failures, mark permanently failed and alert admin.

**FR-093**: System MUST track daily email delivery status per recipient (sent, failed, bounced).

**FR-094**: System MUST send team member a notification when admin adds a note to their task.

**FR-095**: System MUST send admin a notification when a team member completes a task.

**FR-096**: System MUST notify admin when seat limit is reached (100% utilization) for seat-capped plans.

**FR-097**: System MUST notify admin 14 days before CONSULTANT or ENTERPRISE subscription renewal date.

**FR-098**: System MUST notify all active users when company subscription is suspended (payment failure).

**FR-099**: System MUST allow administrators to configure which alert notifications are enabled per event type.

**FR-100**: System MUST include drill-down data in weekly/monthly summaries: top projects by hours, top contributors by productivity, revenue summary.

### Admin Dashboard — Project Creation and Per-Project Documents (FR-101 to FR-105)

**FR-101**: System MUST display a "New" button in the Project Overview panel header (next to the "All projects" link) that opens the existing `CreateProjectModal` for inline project creation from the admin dashboard. Button is visible to ADMIN users only.

**FR-102**: System MUST display three document links (Project Overview, Project Lifecycle, Audit Report) inside each project card in the Project Overview panel — not as a separate column. Each link navigates to the project-specific document route: `/projects/:id/overview`, `/projects/:id/lifecycle`, `/projects/:id/audit`.

**FR-103**: System MUST return per-project document status from `GET /api/admin/doc-status`. Response format: `{ projects: { [projectId]: { projectOverview: string|null, projectLifecycle: string|null, auditReport: string|null } } }` where values are ISO timestamps (last updated) or null (not created).

**FR-104**: Each document link inside a project card MUST show "not created" (indigo, `text-xs`) when the corresponding `projectdocuments` record does not exist for that project, or the last-updated timestamp when it does.

**FR-105**: The Project Overview panel MUST no longer use a two-column layout with a separate right column for report links. All report links are embedded per-project within each `ProjectOverviewCard`.

**FR-106**: The Project Overview panel rendered on TeamDashboard (for TEAM_MEMBER and TEAM_MANAGER users) MUST use the same visual layout as the AdminDashboard Project Overview panel — identical `ProjectOverviewCard` component rendering with lifecycle phase progress, the three per-project document links (ProjectOverview, ProjectLifecycle, AuditReport) embedded inside each card, and the same Active / Branched section grouping. Implementation MUST extract the shared rendering into a single reusable `DashboardProjectGrid` component used by both dashboards; any future layout changes MUST update the shared component, not one dashboard in isolation.

**FR-107**: The `DashboardProjectGrid` component MUST hide admin-only controls when rendered for non-admin users: the "New" project-creation button MUST NOT appear for TEAM_MANAGER or TEAM_MEMBER users, and the inline edit pencil on each `ProjectOverviewCard` MUST NOT appear unless the viewer is an ADMIN. The cards themselves (phase progress, document-status badges, read-only doc links) remain visible to all roles.

**FR-108**: The per-project document-status endpoint that powers the "not created" badges on report links (currently `GET /api/admin/doc-status` per FR-103) MUST be accessible to any authenticated user who can see at least one project, returning status only for projects the caller has visibility into. If retaining the `/api/admin/` path would enforce an admin-only gate, the endpoint MUST be relocated or duplicated under a non-admin path so TeamDashboard can consume it.

**FR-109**: The SysAdminDashboard is explicitly OUT OF SCOPE for FR-106/107/108 — it presents cross-tenant platform metrics, not per-company projects, and MUST NOT display a per-company project grid.

**FR-110** (Invitation link integrity — regression checks, 2026-06-12): The invitation email "Accept Invitation" link MUST resolve to a **registered client route** that renders the acceptance page. The link path MUST be `/accept-invitation/:token` (the route served by `InviteAcceptPage`), NOT `/invite/:token` (which has no route). Any change to the acceptance route MUST update the email link builders in `invitations.ts` in the same change. Acceptance: a freshly sent invitation's link, opened in a browser, loads the acceptance form (not a 404 / blank / landing redirect) and validates the token via `GET /api/team/invite/:token`.

**FR-111** (Invitation link base URL — regression check, 2026-06-12): The invitation link's origin MUST be the configured production frontend (`CLIENT_URL`), never the development fallback. In any non-development environment, `CLIENT_URL` MUST be set to the real app origin (e.g. `https://wxkanban.com`); an emitted invitation link MUST NOT contain `localhost`. Acceptance: in a production-like config, the rendered `acceptLink` begins with the configured `CLIENT_URL` and the link is reachable by an external recipient.

**FR-112** (Invitation seat-cap query reliability — regression check, 2026-06-12): The invitation flow's seat-cap lookup (`select billingplan, maxusers from companies …`) MUST run through the pooler-safe shared DB client used by the rest of the app (`~/server/db/client.js`), not the legacy `lib/db.ts` pool whose production strict-TLS config fails against the Supabase pooler. A failed invitation MUST surface a user-friendly message, never a raw DB error/SQL string in the UI. Acceptance: sending an invitation in production succeeds; on failure the modal shows a generic message and the SQL/params are logged server-side only.

---

## Success Criteria

1. **Registration Flow**: Company registration and activation completes in under 2 minutes for FREE/SMALL_BUSINESS; under 3 minutes for CONSULTANT/ENTERPRISE (including payment step).

2. **Tier Gating Accuracy**: 100% of tier-gated features correctly block access server-side for ineligible plans; no locked feature is accessible by direct URL navigation without upgrade.

3. **Dashboard Load**: Admin dashboard loads with all widgets populated within 3 seconds on first visit; metrics refresh every 5 minutes without page reload.

4. **Role Separation**: TEAM member navigation contains zero admin-only items (billing, team management, reports); ADMIN navigation contains all 8 items; verified by role-switching tests.

5. **Invitation Efficiency**: Administrator can invite 50 team members in under 5 minutes using bulk CSV import.

6. **Billing Accuracy**: Generated invoices match calculated billable hours within ±1 minute margin; zero duplicate billing of already-invoiced time entries.

7. **Email Delivery**: Daily summary emails deliver within 5 minutes of scheduled time with 99% success rate.

8. **Upgrade Prompt Coverage**: Every locked feature renders a visible upgrade prompt with tier badge and CTA; no locked feature shows a blank page or 404.

9. **Seat Limit Enforcement**: FREE and SMALL_BUSINESS plans cannot exceed 5 users; ENTERPRISE per-user overage calculated correctly within ±$0.01.

10. **Report Performance**: Financial reports for 1,000+ time entries generate in under 10 seconds.

---

## Key Entities

### Company

- `id` (UUID, primary key)
- `name` (text, required)
- `address`, `contactemail`, `phone` (contact fields)
- `billingplan` (enum: FREE, SMALL_BUSINESS, CONSULTANT, ENTERPRISE)
- `subscriptionstatus` (enum: ACTIVE, PENDING, SUSPENDED)
- `maxusers` (integer, derived from billingplan)
- `hourlyrate` (decimal, company default billing rate)
- `digestconfig` (JSON, nullable — digest send time, frequency, recipients list)
- `logourl` (optional, for invoice branding)
- `verifiedat`, `createdat`, `updatedat` (timestamps)

**Relationships**: One-to-Many with User, Project, Invoice, CompanyAuditLog

### User (Enhanced)

- `id` (UUID, primary key)
- `companyid` (UUID FK → companies)
- `usertype` (enum: ADMIN, TEAM_MANAGER, TEAM_MEMBER)
- `activeflag` (boolean — can login)
- `payrate` (decimal — user-specific billing override)
- `tracktimeflag` (boolean — can create time entries)
- `timezone` (text, default UTC)
- `dashboardconfig` (JSON, nullable — widget order and visibility preferences)
- `joinedat`, `lastloginedat` (timestamps)

**Relationships**: Many-to-One with Company, One-to-Many with ProjectUser

### ProjectUser (Junction)

- `id` (UUID, primary key)
- `projectid` (UUID FK), `userid` (UUID FK)
- `role` (enum: Lead, TeamMember, Observer)
- `assignedat`, `removedat` (timestamps)
- Unique constraint: (projectid, userid)

### UserInvitation

- `id` (UUID, primary key)
- `companyid` (UUID FK), `email`, `token`
- `status` (enum: pending, accepted, expired)
- `expireseat`, `invitedat`, `acceptedat` (timestamps)
- Unique constraint: (companyid, email)

### CompanyAuditLog

- `id` (UUID, primary key)
- `companyid` (UUID FK), `action` (text)
- `changedby` (UUID FK → users, nullable)
- `previousvalue`, `newvalue` (JSON, nullable)
- `timestamp` (auto-set)

---

## Assumptions

1. **Single shell, three usertypes**: One navigation shell serves ADMIN, TEAM_MANAGER, and TEAM_MEMBER. ADMIN and TEAM_MANAGER share the 8-item admin shell; TEAM_MANAGER has billing/invoices/reports role-locked. TEAM_MEMBER sees 4-item basic shell. `usertype` is the sole classification field — no separate `role` field.
2. **Visible-but-locked pattern**: Tier-gated features are never hidden; they render in a locked state with upgrade prompts. Role-locked features (billing for TEAM_MANAGER) show "Requires Admin" instead of an upgrade prompt. Both apply in nav and page content.
3. **Tier names are database values**: `billingplan` stores exact string values FREE, SMALL_BUSINESS, CONSULTANT, ENTERPRISE (uppercase).
4. **Context at login**: `company.billingplan`, `company.subscriptionstatus`, `company.maxusers`, and current seat count are loaded into user session context at login and available without additional API calls.
5. **SMALL_BUSINESS is free but distinct**: SMALL_BUSINESS has identical pricing to FREE but different feature access (basic invoicing included); this tier is for small teams wanting basic billing without paying.
6. **TEAM_MANAGER is CONSULTANT+**: `usertype=TEAM_MANAGER` can be assigned by ADMIN only on CONSULTANT or ENTERPRISE plans. The usertype value exists in the database for all users but assignment is tier-gated.
7. **PM Integration count**: One PM connection is permitted for FREE and SMALL_BUSINESS; after the first connection is created, adding another is blocked at the UI with an upgrade prompt. Server-side enforcement also applies.
8. **Email service available**: System has Mailgun (already integrated) for invitations, notifications, and daily summaries.
9. **Stripe available**: Payment processing via Stripe is already available in the codebase for CONSULTANT and ENTERPRISE activations.
10. **Historical billing rates**: `timeentries.entryrate` stores the resolved rate at entry creation (user > project > company hierarchy). Invoice generation reads `entryrate` directly — no rate history table needed. Rate changes do not affect existing entries.

---

## Dependencies and Constraints

### External Services

- **Mailgun**: Required for invitations, notifications, daily summaries (already integrated)
- **Stripe**: Required for CONSULTANT/ENTERPRISE plan payment processing (already integrated)
- **PDF Generation**: Required for invoice rendering with company branding

### Technical Constraints

- All queries must include `companyid` filter to enforce company data isolation
- UUID v7 primary keys required for all new tables (consistency with existing schema)
- No `any` TypeScript types; 100% type-safe codebase
- Server-side enforcement of all tier gates (client-side is supplementary only)

### Business Constraints

- Billing audit trail required for 7 years (tax compliance)
- GDPR: User PII deletable on request; transaction records (without PII) retained per tax law
- Seat limit enforcement must be consistent between UI and API

---

## Clarifications

### Session 2026-02-19

**Q1: Single shell vs separate admin/team layouts?**
**A**: Single shell with role-conditional sidebar nav and section content. One app, different views based on `usertype`.

**Q2: Locked feature handling — hide or show with upgrade prompt?**
**A**: Show with upgrade prompt. Locked sections are always visible in nav but render a locked state with tier badge and "Upgrade Plan" CTA. No hidden routes.

**Q7: Email verification link validity and recovery flow (FR-006/FR-007)?**
**A**: Verification links expire after 24 hours. If expired, the login screen detects unverified account status and shows "Resend verification email" link. Resend generates a new token and invalidates the previous one. ADMIN can also bypass email verification entirely via a direct "Skip Verification / Verify Now" action on the unverified account page (admin self-bypass, no email click required).

**Q6: Email digest configuration storage (FR-086 — admin-configurable send time)?**
**A**: `companies.digestconfig` JSON column (stores send time, frequency, recipients list). Updated via PATCH `/api/company/settings` in the Settings page. Company-scoped — same digest schedule applies to all admin recipients in the company.

**Q5: Widget preference storage for FR-033 (dashboard widget reorder/hide)?**
**A**: `dashboardconfig` JSON field on users table. Per-user widget order and visibility stored as JSON object. Retrieved at login with user context — no additional query needed. No separate table required.

**Q4: Rate snapshot mechanism for historical billing (FR-082)?**
**A**: `entryrate` field on TimeEntry table. At entry creation, system resolves user > project > company rate hierarchy and stores the resolved value. Invoice generation reads `entryrate` directly — no historical lookup table needed.

**Q3: How does `usertype` map to navigation shells with three-tier roles?**
**A**: Three `usertype` values: `ADMIN`, `TEAM_MANAGER`, `TEAM_MEMBER`. `ADMIN` and `TEAM_MANAGER` both use the admin shell (8 items: Dashboard, Team Members, Projects, PM Integrations, Time & Billing, Invoices, Reports, Settings). For `TEAM_MANAGER`, Time & Billing, Invoices, and Reports are **role-locked** (not tier-locked) — visible in nav but render a locked state with "Requires Admin" instead of an upgrade prompt. `TEAM_MEMBER` uses the basic shell (4 items: Dashboard, Time Tracking, PM Integrations, Projects assigned). Separate `role` field (Admin/TeamManager/Developer) removed — `usertype` is the sole classification field.

---

## Amendment A — Company VAT number (2026-10-09)

**Status**: Approved by Andy, 2026-10-09. Q1 = registration number; FR-012c included.

Adds an optional VAT registration number to the company record. It can be viewed and edited
everywhere the company profile is edited today. This amendment covers storing and showing the
number. It does not calculate tax.

### Clarifications — Session 2026-10-09

**Q1: Is "VAT" a registration number or a rate?**
**A**: A registration number, stored as text (for example `DE123456789`). It is not a VAT rate.

**Q2: Is the format validated?**
**A**: No. Formats differ by country. The value is trimmed and capped at 50 characters, and
empty input is stored as NULL. There is no VIES lookup.

**Q3: Where is it shown?**
**A**: On every surface that edits the company profile today:

| Surface | Route | Who | Endpoint |
|---------|-------|-----|----------|
| Company Information section | `/admin/settings` | ADMIN | `GET/PUT /api/admin/settings` |
| Company tab | `/settings` | ADMIN | `GET/PUT /api/admin/settings` |
| Company detail panel + Edit Company | SysAdmin dashboard | SysAdmin | `GET/PATCH /api/sysadmin/companies/:id` |

Note: the SCOPE-023 doc (Chunk H.5) calls `src/client/pages/SettingsPage.tsx` dead and unrouted.
That is no longer true. `App.tsx` routes `/settings` to it, and ADMINs see its Company tab, so
both settings pages are live and both get the field.

### Functional Requirements (Amendment A)

**FR-012** (amended): System MUST allow company administrators to update company profile (name,
address, contact email, phone, VAT number) at any time.

**FR-012a**: The company record MUST carry an optional VAT registration number,
`companies.vatnumber` (VARCHAR(50), nullable). Every write path trims the input. Empty input is
stored as NULL. A value longer than 50 characters is rejected with 400. No format validation.

**FR-012b**: An ADMIN MUST be able to view and edit the VAT number in Company Information on
`/admin/settings` and on the Company tab of `/settings`. A SysAdmin MUST be able to see it on the
company detail panel and edit it in Edit Company. The API carries it as `vatNumber` on
`/api/admin/settings` and as `vatnumber` on `/api/sysadmin/companies/:id`, following each
endpoint's existing casing.

**FR-012c**: `PUT /api/admin/settings` MUST require usertype ADMIN (the existing `requireAdmin`
middleware). Today it checks only that the caller is signed in, so any TEAM_MEMBER of the company
can change the company name, contact email, invoice email, address and phone. That contradicts
FR-012 and FR-057. `GET` stays open to any signed-in user of the company.

### Deployment order (MANDATORY)

`companies` is read on nearly every authenticated request, and Drizzle lists every declared
column in its SELECTs. If `vatnumber` is declared in `src/db/schema/company.ts` before the column
exists, the whole application returns 500. The local `.env` points at production, so local
development would fail too. (This is the same hazard recorded for SCOPE-132's
lifecycle timestamps.)

1. Andy applies `src/db/migrations/0071_scope002_company_vatnumber.sql` by hand. It is additive
   and nullable with no default, so PostgreSQL only updates metadata and does not rewrite the table.
2. Verify the column through `information_schema.columns`, confirm `npm run db:drift` exits 0, and
   record the change in `specs/117-production-schema-integrity/schema-change-log.md`.
3. Only after that, declare the column and ship the code.

### Out of scope

- Showing the VAT number on invoices or PDFs.
- Validating the number against VIES.
- Calculating tax. SCOPE-023 already excludes VAT logic.
- Collecting the number at registration.
- The FR-013 audit trail for profile changes. `PUT /api/admin/settings` writes no audit row
  today. That is an existing gap and this amendment does not change it.
- `customers.taxid` (SCOPE-119). That field belongs to a consultant's customer record, which is a
  different record.

---

**Status**: Ready for Planning Phase (`/speckit.plan`)
**Next Steps**: Generate `plan.md` with implementation design, then `tasks.md` for execution
