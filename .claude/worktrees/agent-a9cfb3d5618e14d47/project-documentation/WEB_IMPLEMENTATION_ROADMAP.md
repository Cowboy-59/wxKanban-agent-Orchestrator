# wxKanban Web App Implementation Roadmap
## Landing Page → Registration → Dashboard

**Document Purpose**: Consolidate specs (overvirew.md, 003-Registration/spec.md, 004-LandingPage/plan.md) into aligned implementation plan
**Status**: Ready for Development
**Last Updated**: 2026-02-18

---

## EXECUTIVE SUMMARY

You are building **three critical user journeys** that represent the complete public → authenticated flow:

1. **Landing Page** (public) → Introduces product, displays pricing, allows tier selection
2. **Registration Flow** (public) → Guides companies through onboarding, payment setup, admin creation
3. **Admin Dashboard** (authenticated) → Central hub for managing company, team, projects

These three pieces are **interdependent** but can be developed in parallel once specs are aligned.

---

## PART 1: LANDING PAGE (specs/004-LandingPage/)

### End Result Desired

**A public-facing marketing page that:**
- Converts visitors into paying customers
- Shows wxKanban's value proposition (AI-powered, secure, integrated)
- Displays 4 subscription tiers with clear pricing
- Allows visitors to choose a tier and jump directly to registration
- Supports light/dark mode (system preference + manual toggle)
- Works responsively on mobile, tablet, desktop
- Displays trust signals (SOC 2, HITRUST badges)

### What Specs Say

**From overvirew.md:**
- Modern landing page with SEO features
- Logo of Wxperts + wxKanban
- 4 subscription panels (Free, Small/Med, Consultant, Enterprise) with "more info" + "Registration" buttons
- Central statement about AI development kit, PM integration, security
- "How wxKanban was built" link explaining 6-phase lifecycle
- Light and dark theme support

**From specs/004-LandingPage/plan.md:**
- Hero section with background image (data center with SOC2/HITRUST badges)
- Responsive design (mobile-first)
- Theme system: localStorage + React Context
- Tier pre-selection via URL query parameter (`?tier=CONSULTANT`)
- Integration with existing registration flow

### Key Components to Build

| Component | Purpose | Status |
|-----------|---------|--------|
| `LandingPage.tsx` | Main page component | Not started |
| `ThemeProvider.tsx` | React Context for theme management | Not started |
| `ThemeToggle.tsx` | Light/dark mode toggle button | Not started |
| `HeroSection.tsx` | Hero with background, headline, CTA | Not started |
| `PricingTiers.tsx` | 4 tier cards with "Most Popular" badge | Not started |
| `ComplianceSection.tsx` | SOC2/HITRUST badges + trust messaging | Not started |
| `FeaturesList.tsx` | Value propositions (AI, integration, security) | Not started |
| `HowBuilt.tsx` | 6-phase lifecycle explainer modal | Not started |
| `themePreference.ts` | localStorage utilities for theme | Not started |

### Acceptance Criteria (From plan.md)

- ✅ Hero section displays with optimized background image
- ✅ All 3 tiers visible with correct pricing ($0, $19.95, $59.95)
- ✅ "Most Popular" badge on Small/Med tier
- ✅ Clicking tier button → `/registration?tier=X`
- ✅ Theme toggle switches instantly (no reload)
- ✅ Theme preference persists across sessions
- ✅ Mobile responsive (44px+ touch targets, no horizontal scroll)
- ✅ Authenticated users redirect to `/dashboard` (never see landing page)
- ✅ WCAG 2.1 AA contrast in both light and dark modes

### Tech Stack

- React 18+ (Vite)
- TypeScript
- TailwindCSS
- React Router
- localStorage (theme preference only)

### Data Sources

- Tier pricing/limits: Reference from `specs/003-Registration/spec.md` (FR-004)
  - FREE: $0, ≤5 users
  - CONSULTANT: $19.95/month, unlimited users
  - ENTERPRISE: $59.95/month + $5/user (25+ users)
- Compliance info: Hardcoded (SOC2, HITRUST, GDPR)
- Feature list: From `overvirew.md` (AI development, PM integration, security)

---

## PART 2: REGISTRATION FLOW (specs/003-Registration/)

### End Result Desired

**A multi-step onboarding flow that:**
- Collects company information (name, billing email, address, phone)
- Allows tier selection with comparison matrix
- Processes Stripe payments for paid tiers
- Creates admin account (email, password)
- Sends verification email
- Routes to dashboard upon completion

### What Specs Say

**From specs/003-Registration/spec.md (742 lines of detailed requirements):**

**5 Primary User Stories:**
1. Company registration with tier selection (FR-001 to FR-010)
2. Admin account creation with email verification (FR-026 to FR-035)
3. Personnel invitation system (FR-051 to FR-075)
4. Subscription tier limits and enforcement (FR-131 to FR-162)
5. Admin dashboard and company settings (FR-036 to FR-050)

**Current Implementation Status:**
- ✅ `RegistrationPage.tsx` exists (4-step flow: company → tier → payment → admin)
- ✅ `CompanyInfoForm.tsx` exists
- ✅ `TierSelector.tsx` exists
- ✅ `StripePaymentForm.tsx` exists (partial)
- ✅ `AdminAccountForm.tsx` exists
- ⚠️ Missing: Email verification workflow
- ⚠️ Missing: Personnel/team invitation system
- ⚠️ Missing: Tier limit enforcement

### Key Requirements (Selected from spec)

| Requirement | Status | Notes |
|-------------|--------|-------|
| Company info validation (FR-002) | ✅ Exists | Email, address, phone validation |
| Duplicate billing email check (FR-003) | ❓ Unknown | Need to verify in API |
| Tier comparison matrix (FR-006) | ✅ In TierSelector | But not detailed comparison |
| No payment for FREE tier (FR-007) | ✅ Exists | Skips payment step |
| Stripe payment for paid tiers (FR-011-FR-025) | ⚠️ Partial | Form exists, webhook handling unknown |
| Email verification (FR-029-FR-030) | ❌ Missing | Link valid for 24 hours |
| Password strength validation (FR-032) | ✅ Should exist | Need to verify |
| Tier pre-selection via URL (landing page) | ❌ Missing | Needs `?tier=X` support |
| Personnel invitations (FR-051-FR-075) | ❌ Missing | Bulk email, expiration, role assignment |

### Key Components Status

| Component | Current State | Notes |
|-----------|---------------|-------|
| `RegistrationPage.tsx` | ✅ Exists | 4-step flow complete |
| `CompanyInfoForm.tsx` | ✅ Exists | Basic validation |
| `TierSelector.tsx` | ✅ Exists | With "Most Popular" badge |
| `StripePaymentForm.tsx` | ⚠️ Partial | Form exists, webhook unclear |
| `AdminAccountForm.tsx` | ✅ Exists | Email, password fields |
| **EMAIL VERIFICATION** | ❌ MISSING | Route, token, UI, email template |
| **PERSONNEL INVITATIONS** | ❌ MISSING | Invitation form, email, bulk upload, tracking |
| **TIER ENFORCEMENT** | ❌ MISSING | User limit checks, feature gating |

### Implementation Gaps to Address

1. **Email Verification Workflow**
   - Generate verification token (JWT, 24hr expiry)
   - Send verification email
   - Create verification endpoint (`/api/auth/verify-email?token=X`)
   - Update registration success flow to require verification before dashboard access

2. **Team/Personnel Invitation System**
   - Create invitation form in admin dashboard
   - Bulk CSV upload support
   - Email invitations with 7-day expiration
   - Invitation acceptance (new account or existing user)
   - Resend/cancel invitation functionality

3. **Tier Pre-Selection from Landing Page**
   - Update RegistrationPage to read `?tier=X` query parameter
   - Auto-select tier in TierSelector if parameter present

4. **Stripe Webhook Handling**
   - Webhook endpoint for payment events
   - Update subscription status in database
   - Retry failed charges per Stripe schedule

### Tech Stack

- React, TypeScript, TailwindCSS
- Stripe API + Payment Intent
- Email service (Mailgun, SendGrid, AWS SES)
- Express backend for API endpoints
- PostgreSQL + Drizzle ORM (schema already designed)

### Data Models (Already Defined)

From `specs/003-Registration/spec.md`:
- **Company**: name, billing email, address, phone, subscription tier, status
- **Subscription**: Stripe customer ID, subscription ID, tier, renewal date, status
- **User**: email, password (bcrypt), first/last name, role (ADMIN/MANAGER/DEVELOPER)
- **Invitation**: email, role, status (PENDING/ACCEPTED/EXPIRED), 7-day expiration

---

## PART 3: ADMIN DASHBOARD (Currently: AdminDashboard.tsx)

### End Result Desired

**The authenticated command center where admins:**
- See company overview (name, subscription tier, team member count)
- View and manage team members (invite, remove, change roles)
- Manage subscription (upgrade/downgrade, payment method)
- Access settings (company info, billing)
- See onboarding checklist
- Eventually: manage projects, time tracking, integrations, invoicing

### What Specs Say

**From specs/003-Registration/spec.md (FR-036 to FR-050):**
- Company overview with subscription status, team summary, checklist
- Edit company information (name, address, phone, email)
- View subscription details and renewal date
- Payment method management (last 4 digits, expiration, update)
- Upgrade/downgrade subscription
- Invite and manage team members
- Audit logs of all changes

**From specs/main/spec.md:**
- Project management with 6-phase lifecycle
- Time tracking on tasks
- PM system integrations (Jira, Monday.com, Asana, Trello)
- Invoice generation from billable time
- AI task suggestions

### Current Implementation Status

**AdminDashboard.tsx Overview Tab:**
- ✅ Company name and subscription tier display
- ✅ User limit progress bar (current users / tier limit)
- ✅ Subscription status, plan info
- ✅ Onboarding checklist (basic)

**AdminDashboard.tsx Tabs:**
- ✅ Overview (implemented above)
- ⚠️ Users tab (placeholder, says "coming soon")
- ⚠️ Billing tab (basic info, no actions)
- ⚠️ Settings tab (placeholder, says "coming soon")

**Missing Entirely:**
- ❌ Project management section
- ❌ Time tracking
- ❌ PM system integrations
- ❌ Invoicing
- ❌ Task list view
- ❌ Team member management (invite, remove, role change)

### Key Sections to Implement (Phase 1 - Core Admin)

| Section | Purpose | Status | Priority |
|---------|---------|--------|----------|
| **Sidebar Navigation** | Project list, team, settings | Needs building | HIGH |
| **Projects View** | List active projects with 6 phases | Not started | HIGH |
| **Team Management** | Invite, remove, change roles | In admin/dashboard, needs completion | HIGH |
| **Subscription Management** | Upgrade, downgrade, payment method | In billing tab, needs completion | MEDIUM |
| **Company Settings** | Edit company info, audit logs | In settings tab, needs completion | MEDIUM |
| **Onboarding Checklist** | Quick-start guide | Partially done | MEDIUM |
| **Integration Setup** | Connect Jira, Monday.com, etc. | Not started | LATER |
| **Time Tracking** | Task timer, duration logging | Not started | LATER |
| **Invoicing** | Generate from billable hours | Not started | LATER |

### Tech Stack

- React, TypeScript, TailwindCSS
- React Router for sub-routes
- TanStack Query (React Query) for data fetching
- Express backend APIs for company, team, projects
- PostgreSQL + Drizzle ORM

### Data Models Needed

- **Company** (already designed): subscription, team members, projects
- **Project**: name, description, 6 phases, owner, team
- **ProjectPhase**: 1-6 phases with status tracking
- **Task**: from PM system or internal, linked to project phase
- **User** (already exists): email, password, roles
- **TeamMember**: user linked to company with role (ADMIN/MANAGER/DEVELOPER)
- **Invitation** (already designed): pending team invitations
- **TimeEntry** (already designed): hours, task, billable flag
- **PMSystemConnection** (already designed): Jira/Monday/Asana/Trello credentials

---

## IMPLEMENTATION ORDER & DEPENDENCIES

### Phase 1: MVP (Get Web Working Fully)

**Recommended execution order:**

```
1. Landing Page (Independent)
   - LandingPage component
   - Theme system (ThemeProvider, ThemeToggle)
   - Pricing tiers display
   - HeroSection, ComplianceSection, FeaturesList

2. Registration Enhancement (Depends on Landing Page)
   - Add ?tier=X query param support to RegistrationPage
   - Email verification flow
   - Test tier pre-selection

3. Admin Dashboard Core (Depends on Registration)
   - Team/Personnel invitation system
   - Team management tab (invite, remove, role change)
   - Subscription management (upgrade/downgrade)
   - Company settings

4. Project Management Foundation (Depends on Dashboard)
   - Project list view
   - 6-phase lifecycle display
   - Task list placeholder
```

### Execution Timeline

**Week 1:** Landing Page + Theme System
- Build LandingPage component
- Implement ThemeProvider and ThemeToggle
- Add localStorage persistence
- Mobile responsive testing
- E2E tests for theme persistence and tier selection

**Week 2:** Registration Enhancement
- Add email verification flow (backend endpoint + UI)
- Support ?tier=X parameter in RegistrationPage
- Stripe webhook integration (if not complete)
- Integration tests for full registration → dashboard flow

**Week 3:** Admin Dashboard - Team Management
- Build personnel invitation form
- Implement team members table
- Add bulk email upload (CSV)
- Email invitation sending
- Invitation acceptance flow

**Week 4:** Admin Dashboard - Subscription + Settings
- Complete subscription upgrade/downgrade UI
- Payment method management
- Company settings page
- Audit logging

**Week 5+:** Projects & Beyond
- Project list and creation
- 6-phase lifecycle interface
- Task management skeleton
- Time tracking (later)
- PM integrations (later)

---

## SPEC REFERENCES & DEPENDENCIES

### Landing Page
- **Primary Spec**: `specs/004-LandingPage/plan.md` (complete)
- **Supporting**: `specs/overvirew.md` (vision)
- **Depends On**: None
- **Used By**: Registration flow (via tier selection)

### Registration
- **Primary Spec**: `specs/003-Registration/spec.md` (742 lines, comprehensive)
- **Supporting**: `specs/overvirew.md` (overview), `specs/003-Registration/Scope.md`
- **Depends On**: Landing page (optional tier pre-selection)
- **Used By**: Admin dashboard (initial company setup)

### Admin Dashboard
- **Primary Spec**: `specs/003-Registration/spec.md` (FR-036-FR-075, personnel/subscription mgmt)
- **Supporting**: `specs/main/spec.md` (projects, tasks, time tracking)
- **Depends On**: Registration completion
- **Used By**: Project management, team collaboration, integrations

---

## DECISION CHECKPOINTS

**Before Implementation, Confirm:**

1. ✅ Landing page positioning: Is it "most popular" for Small/Med or Consultant tier?
   - **Decision**: Small/Med Business (from user's earlier statement)

2. ✅ Theme system scope: Apply to all public pages or just landing?
   - **Decision**: All public pages (landing, login, registration, verification)

3. ✅ Email service: Which provider (Mailgun, SendGrid, AWS SES)?
   - **Decision**: Pending (check .env or existing integration)

4. ✅ Stripe setup: Is Stripe test mode configured?
   - **Decision**: Pending (check existing setup)

5. ✅ SpockAI integration: When does AI assistant appear?
   - **Decision**: Per earlier discussion - integrate into web app after core features work

6. ✅ Dark mode: Default to system preference or manual toggle?
   - **Decision**: Default dark mode (from user requirement)

---

## NEXT STEP

**You said:** "Create documentation aligned to end result desired, then we work on each piece"

**This document provides:**
- ✅ End result desired for each of 3 sections
- ✅ Spec references and current implementation status
- ✅ List of components to build
- ✅ Acceptance criteria
- ✅ Dependencies and implementation order
- ✅ Decision checkpoints

**Ready to proceed?**

Choose one:
- **Option A:** Start with Landing Page (independent, can build immediately)
- **Option B:** Start with Registration Enhancement (quick wins on existing code)
- **Option C:** Complete Admin Dashboard Core (consolidate team management)
- **Option D:** Tackle all 3 in parallel with clear task breakdowns

