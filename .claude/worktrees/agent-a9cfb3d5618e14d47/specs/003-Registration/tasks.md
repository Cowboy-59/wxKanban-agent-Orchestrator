# Implementation Tasks: Company Registration & Subscription Management

<<<<<<< HEAD
**Feature**: Spec 003 (Registration) | **Created**: 2026-02-17 | **Total Tasks**: 123
=======
**Feature**: Spec 003 (Registration) | **Created**: 2026-02-17 | **Total Tasks**: 120
>>>>>>> origin/014-sysadmin-platform-admin

---

## Overview

<<<<<<< HEAD
This document contains 123 implementation tasks organized by user story and development phase. Tasks are ordered for sequential execution with parallelization opportunities marked with `[P]`. Each task includes the exact file path and acceptance criteria.
=======
This document contains 120 implementation tasks organized by user story and development phase. Tasks are ordered for sequential execution with parallelization opportunities marked with `[P]`. Each task includes the exact file path and acceptance criteria.
>>>>>>> origin/014-sysadmin-platform-admin

### User Stories Summary

| Story | Title | Priority | Tasks |
|-------|-------|----------|-------|
| **US1** | Company Registration with Tier Selection | P1 | 12 tasks |
| **US2** | Admin Account Creation & Onboarding | P1 | 14 tasks |
| **US3** | Personnel Invitation System | P1 | 18 tasks |
<<<<<<< HEAD
| **US4** | Subscription Tier Limits & Enforcement | P2 | 13 tasks |
=======
| **US4** | Subscription Tier Limits & Enforcement | P2 | 10 tasks |
>>>>>>> origin/014-sysadmin-platform-admin
| **US5** | Admin Dashboard & Company Settings | P2 | 14 tasks |

### Dependency Graph

```
Phase 1: Setup & Infrastructure
    ↓
Phase 2: Foundational (Database + Auth)
    ↓
<<<<<<< HEAD
┌───────────────────────────────────────────┐
│   Phase 3-5: User Stories (P1 > P2)       │
├───────────────────────────────────────────┤
│ US1: Registration                         │ (blocks US2, US3, US4)
│ US2: Admin Onboarding                     │ (depends on US1, can parallel with US3)
│ US3: Invitations                          │ (depends on US1, can parallel with US2)
│ US4: Tier Limits                          │ (depends on US1)
│ US5: Dashboard & Settings                 │ (depends on US2)
└───────────────────────────────────────────┘
=======
┌───────────────────────────────────────┐
│   Phase 3-5: User Stories (P1 > P2)   │
├───────────────────────────────────────┤
│ US1: Registration                     │ (blocks US2, US4)
│ US2: Admin Onboarding                 │ (depends on US1)
│ US3: Invitations                      │ (depends on US2)
│ US4: Tier Limits                      │ (depends on US1)
│ US5: Dashboard & Settings             │ (depends on US2)
└───────────────────────────────────────┘
>>>>>>> origin/014-sysadmin-platform-admin
    ↓
Phase 6: Testing & Polish
```

### MVP Scope (Recommended)

**For MVP (Week 1)**: Implement US1, US2, US3 (core registration + invitations)
- 44 tasks total
- Enables full end-to-end company registration and team invitation
- Deferrable: US4 (tier enforcement), US5 (dashboard polish)

---

## Phase 1: Setup & Infrastructure

### Project Structure & Dependencies

- [ ] T001 Create Express backend directory structure with TypeScript config at `src/server/`
- [ ] T002 Create React frontend directory structure with Vite config at `src/client/`
- [ ] T003 [P] Install backend dependencies: express, drizzle-orm, stripe, mailgun-js, bullmq, ioredis, pino, bcryptjs, jsonwebtoken at `package.json`
- [ ] T004 [P] Install frontend dependencies: react, vite, @tanstack/react-query, @stripe/react-stripe-js, @stripe/stripe-js, tailwindcss, shadcn/ui at `package.json`
- [ ] T005 Configure TypeScript compiler for backend strictness at `tsconfig.json`
- [ ] T006 Configure Vite bundler with React plugin at `vite.config.ts`
- [ ] T007 Set up ESLint and Prettier for code quality at `.eslintrc.json` and `.prettierrc`
- [ ] T008 Create environment variable template at `.env.example`
- [ ] T009 Set up logging infrastructure with Pino at `src/lib/logger.ts`
- [ ] T010 Configure database connection with Drizzle ORM at `src/db/client.ts`

---

## Phase 2: Foundational (Database + Authentication)

### Database Schema & Migrations

- [ ] T011 Create `company` table schema in Drizzle at `src/db/schema/company.ts`
- [ ] T012 Create `user` table schema in Drizzle at `src/db/schema/user.ts`
- [ ] T013 [P] Create `userinvitation` table schema in Drizzle at `src/db/schema/userinvitation.ts`
- [ ] T014 [P] Create `session` table schema in Drizzle at `src/db/schema/session.ts`
- [ ] T015 [P] Create `companyauditlog` table schema in Drizzle at `src/db/schema/companyauditlog.ts`
- [ ] T016 Generate and apply database migrations at `src/db/migrations/0008_registration_tables.sql`
- [ ] T017 Create database indexes for performance at `src/db/migrations/0009_registration_indexes.sql`
- [ ] T018 Verify schema synchronization with data-model.md requirements

### Authentication & Session Management

- [x] T019 Create JWT token utilities (sign, verify, refresh) at `src/server/lib/jwt.ts`
- [x] T020 Create password hashing utilities (bcrypt) at `src/server/lib/password.ts`
- [x] T021 Implement authentication middleware for JWT validation at `src/server/middleware/auth.ts`
- [x] T022 Create session management service for refresh token tracking at `src/server/services/SessionService.ts`
- [x] T023 Implement CORS middleware for frontend-backend communication at `src/server/middleware/cors.ts`
- [x] T024 Create error handling middleware for API consistency at `src/server/middleware/errorHandler.ts`

### External Services Setup

- [x] T025 Configure Stripe SDK with test credentials at `src/server/lib/stripe.ts`
- [x] T026 Configure Mailgun SDK with test credentials at `src/server/lib/mailgun.ts`
- [x] T027 Configure Redis connection for job queue at `src/server/lib/redis.ts`
- [x] T028 Create BullMQ email job queue configuration at `src/server/jobs/emailQueue.ts`
- [x] T029 Implement email queue worker for sending invitations at `src/server/workers/emailWorker.ts`

---

## Phase 3: User Story 1 - Company Registration with Tier Selection

### US1 Backend Services

- [x] T030 [US1] Create RegistrationService for company creation logic at `src/server/services/RegistrationService.ts`
  - Validates company info
  - Creates company record
  - Logs to audit trail
  - Acceptance: Returns company with UUID, subscription tier, status

- [x] T031 [US1] Create PaymentService for Stripe integration at `src/server/services/PaymentService.ts`
  - Validates tier selection
  - Creates Stripe customer
  - Creates setup intent
  - Processes subscription creation
  - Acceptance: Returns Stripe subscription with status

- [x] T032 [US1] [P] Create AuditService for compliance logging at `src/server/services/AuditService.ts`
  - Logs all registration events
  - Tracks user actions
  - Stores in companyauditlog table
  - Acceptance: Audit entries created for COMPANY_CREATED, SUBSCRIPTION_CREATED

### US1 API Routes

- [x] T033 [US1] Implement `POST /api/auth/register` endpoint at `src/server/routes/auth.ts`
  - Validates input (company name, email, address, etc.)
  - Calls RegistrationService
  - Returns company + admin user data
  - Error handling for duplicate company name/email
  - Acceptance: 201 response with company and admin user

- [x] T034 [US1] Implement `POST /api/payment/validate` endpoint at `src/server/routes/payment.ts`
  - Validates tier selection
  - Returns pricing details
  - Calculates estimated cost
  - Acceptance: 200 response with tier details and pricing

- [x] T035 [US1] Implement `POST /api/payment/setup-intent` endpoint at `src/server/routes/payment.ts`
  - Creates Stripe SetupIntent
  - Returns clientSecret for frontend
  - Acceptance: 200 response with clientSecret

- [x] T036 [US1] Implement `POST /api/payment/process` endpoint at `src/server/routes/payment.ts`
  - Creates Stripe subscription
  - Processes first payment
  - Updates company subscription status
  - Handles 3D Secure if required
  - Acceptance: 200 response with subscription status

### US1 Frontend Components

- [x] T037 [US1] Create RegistrationPage component at `src/client/pages/RegistrationPage.tsx`
  - Multi-step form flow
  - Company info collection
  - Tier selection
  - Admin account creation
  - Acceptance: Form submission creates company

- [x] T038 [US1] [P] Create CompanyInfoForm component at `src/client/components/CompanyInfoForm.tsx`
  - Fields: company name, billing email, address, country, phone
  - Validation
  - Error display
  - Acceptance: Validates required fields

- [x] T039 [US1] [P] Create TierSelector component at `src/client/components/TierSelector.tsx`
  - Display 3 tiers (FREE, CONSULTANT, ENTERPRISE)
  - Show pricing and features
  - Selection state management
  - Acceptance: Allows tier selection

- [x] T040 [US1] [P] Create StripePaymentForm component at `src/client/components/StripePaymentForm.tsx`
  - Stripe CardElement integration
  - SetupIntent confirmation
  - Error handling
  - Loading states
  - Acceptance: Processes payment for paid tiers

- [x] T041 [US1] [P] Create AdminAccountForm component at `src/client/components/AdminAccountForm.tsx`
  - Email and password fields
  - Password strength validation
  - First name (required), last name (optional)
  - Acceptance: Creates admin user account

### US1 Integration & Testing

- [x] T042 [US1] Create contract test for `POST /api/auth/register` at `tests/contract/registration.test.ts`
  - Test valid FREE tier registration
  - Test valid CONSULTANT tier registration
  - Test duplicate company name error
  - Test duplicate email error
  - Acceptance: All contract tests pass

- [x] T043 [US1] [P] Create contract test for payment endpoints at `tests/contract/payment.test.ts`
  - Test tier validation
  - Test SetupIntent creation
  - Test subscription processing
  - Test payment decline handling
  - Acceptance: All payment contract tests pass

- [x] T044 [US1] [P] Create integration test for complete registration flow at `tests/integration/registration-flow.test.ts`
  - Test FREE tier registration to dashboard access
  - Test CONSULTANT tier registration with payment
  - Test payment failure recovery
  - Acceptance: Complete flow tests pass

---

## Phase 4: User Story 2 - Admin Account Creation & Onboarding

### US2 Backend Services

- [ ] T045 [US2] Create UserService for user account management at `src/server/services/UserService.ts`
  - Create user account
  - Verify email
  - Hash password with bcrypt
  - Assign role (ADMIN on registration)
  - Acceptance: Creates user with PENDING status until email verification

- [ ] T046 [US2] Create EmailService for transactional emails at `src/server/services/EmailService.ts`
  - Queue verification emails
  - Queue invitation emails
  - Template rendering (MJML + Handlebars)
  - Retry logic
  - Acceptance: Emails queued to BullMQ

- [ ] T047 [US2] [P] Create VerificationService for email verification tokens at `src/server/services/VerificationService.ts`
  - Generate verification tokens
  - Validate verification links
  - Track verification status
  - Expiry management
  - Acceptance: Tokens stored with 24-hour expiry

### US2 API Routes

- [ ] T048 [US2] Implement `POST /api/auth/verify-email` endpoint at `src/server/routes/auth.ts`
  - Validates verification token
  - Updates user status to ACTIVE
  - Returns success/error
  - Acceptance: 200 response marks user ACTIVE

- [ ] T049 [US2] Implement `POST /api/auth/login` endpoint at `src/server/routes/auth.ts`
  - Validates email + password
  - Creates session record
  - Returns access + refresh tokens
  - Sets HttpOnly cookie
  - Acceptance: 200 response with tokens, httpOnly cookie set

- [ ] T050 [US2] Implement `POST /api/auth/refresh` endpoint at `src/server/routes/auth.ts`
  - Validates refresh token
  - Checks token family for reuse detection
  - Issues new access + refresh tokens
  - Acceptance: 200 response with new tokens

- [ ] T051 [US2] [P] Implement `POST /api/auth/logout` endpoint at `src/server/routes/auth.ts`
  - Revokes refresh token
  - Clears cookie
  - Logs audit event
  - Acceptance: 200 response, refresh token blacklisted

- [ ] T052 [US2] Implement `GET /api/admin/dashboard` endpoint at `src/server/routes/admin.ts`
  - Returns company info + metrics
  - Lists team members
  - Shows onboarding status
  - Acceptance: 200 response with dashboard data

### US2 Frontend Components

- [ ] T053 [US2] Create VerificationPage component at `src/client/pages/VerificationPage.tsx`
  - Handles verification token from email link
  - Shows loading/success/error states
  - Auto-redirects to login on success
  - Acceptance: Verifies email and redirects

- [ ] T054 [US2] [P] Create LoginPage component at `src/client/pages/LoginPage.tsx`
  - Email + password form
  - Error handling
  - Redirect to dashboard on success
  - Acceptance: Authenticates user and sets tokens

- [ ] T055 [US2] [P] Create AdminDashboard component at `src/client/pages/AdminDashboard.tsx`
  - Displays company info
  - Shows team members list
  - Displays onboarding checklist
  - Welcome message
  - Acceptance: Shows dashboard metrics and onboarding progress

- [ ] T056 [US2] [P] Create MetricsCard component at `src/client/components/MetricsCard.tsx`
  - Display metric value
  - Show metric label
  - Handle loading state
  - Acceptance: Renders metric cards with values

- [ ] T057 [US2] Create OnboardingChecklist component at `src/client/components/OnboardingChecklist.tsx`
  - Show checklist items (invite team, create projects, set rates)
  - Track completion status
  - Update on user actions
  - Acceptance: Shows progress and enables/disables items

### US2 Email Templates

- [ ] T058 [US2] Create verification email template at `src/server/emails/verification.mjml`
  - Personalized greeting
  - Verification link
  - 24-hour expiry notice
  - Plain text fallback
  - Acceptance: Email renders correctly in all clients

- [ ] T059 [US2] [P] Create welcome email template at `src/server/emails/welcome.mjml`
  - Welcome message
  - Quick start guide
  - Link to dashboard
  - Plain text fallback
  - Acceptance: Email sent after verification

<<<<<<< HEAD
- [ ] T059b [US4] Create invoice email template at `src/server/emails/invoice.mjml`
  - Company name and billing details
  - Invoice number and date
  - Itemized charges (subscription tier, prorated amounts, overage fees)
  - Payment method last 4 digits
  - Total amount due
  - Link to billing history
  - Plain text fallback
  - Acceptance: Email sent after successful payment with invoice details

=======
>>>>>>> origin/014-sysadmin-platform-admin
### US2 Integration & Testing

- [ ] T060 [US2] Create contract test for auth endpoints at `tests/contract/auth.test.ts`
  - Test login endpoint
  - Test token refresh
  - Test logout
  - Test invalid credentials
  - Acceptance: All auth contract tests pass

- [ ] T061 [US2] [P] Create integration test for onboarding flow at `tests/integration/onboarding-flow.test.ts`
  - Test email verification
  - Test login after verification
  - Test dashboard access
  - Test token refresh
  - Acceptance: Complete onboarding flow tests pass

---

## Phase 5: User Story 3 - Personnel Invitation System

### US3 Backend Services

- [ ] T062 [US3] Create InvitationService for team member invitations at `src/server/services/InvitationService.ts`
  - Create invitation records
  - Generate invitation tokens
  - Send invitation emails
  - Track acceptance
  - Expiry management
  - Acceptance: Invitations created with 7-day expiry

- [ ] T063 [US3] Create BulkInvitationService for CSV processing at `src/server/services/BulkInvitationService.ts`
  - Parse CSV files
  - Validate email addresses
  - Queue bulk jobs
  - Track batch progress
  - Dead-letter queue for failures
  - Acceptance: Processes 50 emails with job queue

- [ ] T064 [US3] [P] Create EmailQueueMonitor for progress tracking at `src/server/services/EmailQueueMonitor.ts`
  - Tracks job status
  - Provides batch progress
  - Emits Socket.IO events
  - Logs failures
  - Acceptance: Real-time progress updates via Socket.IO

### US3 API Routes

- [ ] T065 [US3] Implement `POST /api/invitations/send` endpoint at `src/server/routes/invitations.ts`
  - Accepts single or multiple emails
  - Validates recipients (max 50)
  - Creates invitation records
  - Queues email jobs
  - Returns batch ID
  - Acceptance: 202 response with invitation IDs and batch ID

- [ ] T066 [US3] Implement `POST /api/invitations/send-bulk` endpoint at `src/server/routes/invitations.ts`
  - Accepts CSV file upload
  - Parses email and role
  - Validates format
  - Queues all invitations
  - Returns batch progress tracking
  - Acceptance: 202 response with queued count and batch ID

- [ ] T067 [US3] [P] Implement `GET /api/invitations/status/:batchId` endpoint at `src/server/routes/invitations.ts`
  - Returns batch progress
  - Shows sent/failed counts
  - Lists failed emails with reasons
  - Acceptance: 200 response with detailed progress

- [ ] T068 [US3] [P] Implement `POST /api/invitations/accept/:invitationToken` endpoint at `src/server/routes/invitations.ts`
  - Validates invitation token
  - Creates user account with invited email
  - Assigns invited role
  - Updates invitation status
  - Auto-logs in user
  - Acceptance: 201 response with new user account

- [x] T069 [US3] List invitations for company — DONE (covered ad-hoc): `GET /api/team` (team.ts:707-719) already returns pending `invitations` alongside `members`. No separate `/api/invitations` list needed; the gap is purely UI-side (see T076).

- [ ] T070 [US3] Implement cancel/revoke pending-invitation endpoint `POST /api/team/invitations/:invitationId/cancel` at `src/server/routes/team.ts`
  - GAP (FR-066 "Cancel Invitation"): no endpoint exists today to cancel a pending invite — admins can only wait for 7-day expiry or hand-delete the row
  - ADMIN-only (mirror guard at team.ts:967), company-scoped; 404 if invitation not in caller's company
  - Set `userinvitations.status = "cancelled"` (status value already used by `/invite` at team.ts:759); do NOT hard-delete
  - Cancelled token must fail the accept route
  - Acceptance: 200 `{ success: true }`, row flips to cancelled, accept link invalid

- [ ] T070b [US3] Implement resend pending-invitation endpoint `POST /api/team/invitations/:invitationId/resend` at `src/server/routes/team.ts`
  - GAP (FR-063/FR-066 "Resend" for Pending/Expired): existing `/:userId/reinvite` (team.ts:955) only works for an existing `users` row — a pending invitee has no user row, so pending invites cannot be resent today
  - ADMIN-only, company-scoped; new token + fresh 7-day `expiresat`, status back to `pending`, resend email (reuse token/email logic from `/:userId/reinvite` at team.ts:993-1022)
  - Acceptance: 200 `{ success, steps }`, invite re-sent with refreshed expiry

### US3 Frontend Components

- [ ] T071 [US3] Create InvitePage component at `src/client/pages/InvitePage.tsx`
  - Handles invitation token from email link
  - Shows company name + assigned role
  - Option to create account or login
  - Acceptance: Displays invitation details

- [ ] T072 [US3] Create InviteTeamPage component at `src/client/pages/InviteTeamPage.tsx`
  - Tab for single/bulk invitations
  - Form and CSV upload
  - Real-time progress tracking
  - Failed emails display
  - Acceptance: Invites team members with progress feedback

- [ ] T073 [US3] [P] Create SingleInviteForm component at `src/client/components/SingleInviteForm.tsx`
  - Email field
  - Role dropdown
  - Optional message
  - Submit button
  - Acceptance: Sends single invitation

- [ ] T074 [US3] [P] Create BulkInviteUpload component at `src/client/components/BulkInviteUpload.tsx`
  - CSV file input
  - Format validation
  - Preview table
  - Submit and cancel buttons
  - Acceptance: Accepts CSV and queues bulk invitations

- [ ] T075 [US3] [P] Create InvitationProgress component at `src/client/components/InvitationProgress.tsx`
  - Progress bar with percentage
  - Sent/failed/total counts
  - Real-time updates via Socket.IO
  - Failed email list
  - Acceptance: Shows real-time progress with Socket.IO updates

- [ ] T076 [US3] Surface Pending Invitations in the live team UI `src/client/components/Dashboard/TeamMembersTab.tsx` (supersedes the never-built `PersonnelManagementPage.tsx`)
  - GAP (FR-065/FR-066/FR-067): `GET /api/team` already returns `{ members, invitations }` (team.ts:707-719) but the tab discards `invitations` and renders active members only — admins cannot see outstanding invites
  - Render a "Pending Invitations" section (email, invited-on, expires-on, status)
  - ADMIN-only actions per pending invite: Resend → `POST /api/team/invitations/:invitationId/resend` (T070b); Cancel → `POST /api/team/invitations/:invitationId/cancel` (T070)
  - FR-067 confirm on Cancel: "Are you sure? User cannot accept invitation after cancellation. You can resend a new invitation."
  - NOTE already done: removing an active member works (trash icon → `POST /api/team/:userId/remove`). "Change Role" (FR-066) is a separate, not-requested gap — out of scope here
  - Acceptance: admin sees pending invites; Resend refreshes; Cancel (after confirm) removes from the pending list

- [ ] T077 [US3] [P] Create TeamMemberTable component at `src/client/components/TeamMemberTable.tsx`
  - Displays team members with columns: email, role, status, date joined
  - Action buttons
  - Sorting/filtering
  - Acceptance: Lists team members with actions

### US3 Invitation Templates

- [ ] T078 [US3] Create invitation email template at `src/server/emails/invitation.mjml`
  - Personalized greeting with company name
  - Assigned role
  - Invitation link (7-day expiry)
  - Acceptance scenarios (create account or login)
  - Plain text fallback
  - Acceptance: Email renders with working invitation link

- [ ] T079 [US3] [P] Create account-created email template at `src/server/emails/account-created.mjml`
  - Confirmation of account creation
  - Company context
  - Welcome message
  - Link to dashboard
  - Acceptance: Email sent after account creation from invitation

### US3 WebSocket Setup

- [ ] T080 [US3] [P] Implement Socket.IO server integration at `src/server/lib/socket.ts`
  - Initialize Socket.IO with Express
  - Handle client connections
  - Emit progress events
  - Acceptance: Socket.IO server running on Express

- [ ] T081 [US3] Create Socket.IO client hook for progress tracking at `src/client/hooks/useInvitationProgress.ts`
  - Subscribe to batch ID
  - Receive progress updates
  - Handle reconnection
  - Acceptance: Real-time progress updates in React

### US3 Integration & Testing

- [ ] T082 [US3] Create contract test for invitation endpoints at `tests/contract/invitations.test.ts`
  - Test single invitation
  - Test bulk CSV upload
  - Test invitation acceptance
  - Test expired invitation rejection
  - Acceptance: All invitation contract tests pass

- [ ] T083 [US3] [P] Create integration test for invitation flow at `tests/integration/invitation-flow.test.ts`
  - Test single invitation to account creation
  - Test bulk CSV to all invitations sent
  - Test Socket.IO progress updates
  - Test token expiry
  - Acceptance: Complete invitation flow tests pass

---

## Phase 6: User Story 4 - Subscription Tier Limits & Enforcement

### US4 Backend Services

- [ ] T084 [US4] Create TierLimitService for enforcing subscription constraints at `src/server/services/TierLimitService.ts`
  - Check user limits for tier
  - Enforce PM system connection limits
  - Track overage users (ENTERPRISE)
  - Generate tier upgrade messaging
  - Acceptance: Validates tier constraints

- [ ] T085 [US4] Create UpgradeService for plan changes at `src/server/services/UpgradeService.ts`
  - Upgrade/downgrade subscriptions
  - Calculate prorated billing
  - Update Stripe subscription
  - Update company tier
  - Acceptance: Processes tier changes with Stripe

### US4 API Routes

- [ ] T086 [US4] Implement tier limit validation in invitation endpoint at `src/server/routes/invitations.ts`
  - Check FREE tier 5-user limit
  - Check CONSULTANT/ENTERPRISE limits
  - Return limit error with upgrade path
  - Acceptance: Blocks invitations exceeding tier limits

- [ ] T087 [US4] [P] Implement `POST /api/subscription/upgrade` endpoint at `src/server/routes/subscription.ts`
  - Validates new tier
  - Processes payment
  - Updates Stripe subscription
  - Returns updated company data
  - Acceptance: 200 response with new subscription

- [ ] T088 [US4] [P] Implement `POST /api/subscription/downgrade` endpoint at `src/server/routes/subscription.ts`
  - Validates downgrade (users > limit warning)
  - Updates Stripe subscription
  - Returns updated company data
  - Acceptance: 200 response with downgrade confirmation

- [ ] T089 [US4] Implement `GET /api/subscription/features` endpoint at `src/server/routes/subscription.ts`
  - Returns tier-specific features
  - PM system connection count limits
  - User limits
  - Acceptance: 200 response with feature list

### US4 Frontend Components

- [ ] T090 [US4] Create TierLimitWarning component at `src/client/components/TierLimitWarning.tsx`
  - Display when limit reached
  - Show upgrade options
  - Link to upgrade flow
  - Acceptance: Shows limit message with upgrade button

- [ ] T091 [US4] [P] Create UpgradeFlowPage component at `src/client/pages/UpgradeFlowPage.tsx`
  - Display current vs new tier
  - Pricing comparison
  - Feature comparison
  - Confirm upgrade button
  - Acceptance: Enables tier upgrade from dashboard

- [ ] T092 [US4] [P] Create TierComparisonTable component at `src/client/components/TierComparisonTable.tsx`
  - Compare features across tiers
  - Highlight current tier
  - Show pricing
  - Acceptance: Displays tier features side-by-side

### US4 Integration & Testing

- [ ] T093 [US4] Create test for tier limit enforcement at `tests/integration/tier-limits.test.ts`
  - Test FREE tier 5-user limit
  - Test CONSULTANT unlimited users
  - Test ENTERPRISE overage tracking
  - Test PM system connection limits
  - Acceptance: Tier limit tests pass

<<<<<<< HEAD
### US4 Edge Case Handling

- [ ] T093a [US4] Implement concurrent payment prevention at `src/server/services/PaymentService.ts`
  - Detect concurrent payment attempts during renewal billing
  - Prevent duplicate charges using idempotency keys
  - Return "Payment currently processing" message with retry guidance
  - Acceptance: Duplicate payment attempts blocked with appropriate messaging

- [ ] T093b [US4] Implement Stripe disconnection fallback handling at `src/server/services/PaymentService.ts`
  - Detect invalid Stripe API key or connection drops
  - Log errors for monitoring
  - Return "Payment processing temporarily unavailable" for paid tier operations
  - Allow Free tier operations to continue unaffected
  - Acceptance: Graceful degradation when Stripe unavailable

---

## Phase 7: User Story 5 - Admin Dashboard & Company Settings

### US5 Backend Services

- [ ] T094 [US5] Create CompanyService for company settings management at `src/server/services/CompanyService.ts`
  - Update company info
  - Manage billing details
  - Track company metrics
  - Generate audit trail
  - Acceptance: Updates company records with validation

- [ ] T095 [US5] Create DashboardService for metrics aggregation at `src/server/services/DashboardService.ts`
  - Aggregate user count
  - Count active projects
  - Count tasks
  - Calculate onboarding progress
  - Acceptance: Returns dashboard metrics

### US5 API Routes

- [ ] T096 [US5] Implement `GET /api/admin/settings` endpoint at `src/server/routes/admin.ts`
  - Returns company settings
  - Billing information
  - Subscription details
  - Acceptance: 200 response with settings

- [ ] T097 [US5] [P] Implement `PATCH /api/admin/settings` endpoint at `src/server/routes/admin.ts`
  - Updates company name, address, phone, email
  - Validates input
  - Logs changes
  - Acceptance: 200 response with updated settings

- [ ] T098 [US5] [P] Implement `POST /api/admin/onboarding-complete` endpoint at `src/server/routes/admin.ts`
  - Marks onboarding as complete
  - Updates company record
  - Logs audit event
  - Acceptance: 200 response, onboarding marked complete

- [ ] T099 [US5] Implement `GET /api/admin/billing` endpoint at `src/server/routes/admin.ts`
  - Returns billing method details
  - Next renewal date
  - Past invoices
  - Acceptance: 200 response with billing info

- [ ] T100 [US5] [P] Implement `PATCH /api/admin/billing-method` endpoint at `src/server/routes/admin.ts`
  - Updates default payment method
  - Validates card
  - Logs changes
  - Acceptance: 200 response with updated method

### US5 Frontend Components

- [ ] T101 [US5] Create CompanySettingsPage component at `src/client/pages/CompanySettingsPage.tsx`
  - Display company info
  - Show billing details
  - Edit forms
  - Action buttons
  - Acceptance: Displays and allows editing of settings

- [ ] T102 [US5] [P] Create CompanyInfoForm component at `src/client/components/settings/CompanyInfoForm.tsx`
  - Fields: company name, address, phone, email
  - Edit/save toggle
  - Validation
  - Success/error messages
  - Acceptance: Saves company info changes

- [ ] T103 [US5] [P] Create BillingDetailsCard component at `src/client/components/settings/BillingDetailsCard.tsx`
  - Display card last 4 digits
  - Expiration date
  - Option to update method
  - Acceptance: Shows billing method details

- [ ] T104 [US5] Create SubscriptionSummaryCard component at `src/client/components/SubscriptionSummaryCard.tsx`
  - Current tier badge
  - Next renewal date
  - Renewal amount
  - Upgrade/downgrade buttons
  - Acceptance: Shows subscription summary

- [ ] T105 [US5] Create EnhancedDashboardMetrics component at `src/client/components/EnhancedDashboardMetrics.tsx`
  - Active users metric
  - Projects metric
  - Tasks metric
  - Week activity metric
  - Acceptance: Shows all dashboard metrics with real-time updates

- [ ] T106 [US5] [P] Create DashboardActivityFeed component at `src/client/components/DashboardActivityFeed.tsx`
  - Show recent invitations sent
  - Show users joined
  - Show project created
  - Timestamp and actor
  - Acceptance: Displays recent activity

### US5 Integration & Testing

- [ ] T107 [US5] Create contract test for settings endpoints at `tests/contract/admin.test.ts`
  - Test get settings
  - Test update settings
  - Test billing update
  - Acceptance: All admin contract tests pass

- [ ] T108 [US5] [P] Create integration test for dashboard flow at `tests/integration/dashboard-flow.test.ts`
  - Test dashboard access
  - Test metrics accuracy
  - Test settings update
  - Test onboarding completion
  - Acceptance: Complete dashboard flow tests pass

---

## Phase 8: Testing & Polish

### E2E Testing (Playwright)

- [ ] T109 Create E2E test for complete registration flow at `tests/e2e/registration.spec.ts`
  - Test FREE tier registration
  - Test CONSULTANT tier with payment (using test card)
  - Test email verification
  - Test admin dashboard access
  - Acceptance: E2E tests pass with real browser automation

- [ ] T110 [P] Create E2E test for invitation flow at `tests/e2e/invitations.spec.ts`
  - Test single invitation sending
  - Test bulk CSV upload
  - Test invitation acceptance
  - Test new user login
  - Acceptance: E2E invitation tests pass

- [ ] T111 [P] Create E2E test for team management at `tests/e2e/team-management.spec.ts`
  - Test invite multiple users
  - Test personnel list view
  - Test role change
  - Test user removal
Now I need to also update the MVP Scope section in tasks.md to reflect that US2 and US3 can be done in parallel. Let me update the tasks.md to fix the dependency graph and the MVP scope section.

Actually, looking at the current tasks.md, it already has US3 as dependent on US2. Let me check what I can update to reflect the parallel nature. 

Let me create a completeNow I need to also updated tasks.md file that shows US2 and US3 as parallel and update the MVP scope accordingly. update the tasks.md to properly reflect US2 and US3 as parallel dependencies in the Dependency Graph section and update the MVP Scope. Let me create the corrected file:

<create_file>
<path>specs/003-Registration/tasks.md</path>
<content>
# Implementation Tasks: Company Registration & Subscription Management

**Feature**: Spec 003 (Registration) | **Created**: 2026-02-17 | **Total Tasks**: 123

---

## Overview

This document contains 123 implementation tasks organized by user story and development phase. Tasks are ordered for sequential execution with parallelization opportunities marked with `[P]`. Each task includes the exact file path and acceptance criteria.

### User Stories Summary

| Story | Title | Priority | Tasks |
|-------|-------|----------|-------|
| **US1** | Company Registration with Tier Selection | P1 | 12 tasks |
| **US2** | Admin Account Creation & Onboarding | P1 | 14 tasks |
| **US3** | Personnel Invitation System | P1 | 18 tasks |
| **US4** | Subscription Tier Limits & Enforcement | P2 | 13 tasks |
| **US5** | Admin Dashboard & Company Settings | P2 | 14 tasks |

### Dependency Graph

```
Phase 1: Setup & Infrastructure
    ↓
Phase 2: Foundational (Database + Auth)
    ↓
┌─────────────────────────────────────────────────┐
│   Phase 3-5: User Stories (P1 > P2)              │
├─────────────────────────────────────────────────┤
│ US1: Registration         │ (blocks US2, US3,   │
│                           │        US4)          │
├───────────────────────────┴──────────────────────┤
│                  ↓                               │
│    ┌──────────────────┐    ┌─────────────────┐ │
│    │ US2: Admin       │    │ US3: Invitations│ │
│    │ Onboarding       │ || │ (can parallel    │ │
│    │                  │ || │  with US2)       │ │
│    └────────┬─────────┘    └────────┬────────┘ │
│             ↓                        ↓           │
│             └───────────┬────────────┘           │
│                         ↓                        │
│              US5: Dashboard & Settings           │
│              (depends on US2)                   │
└─────────────────────────────────────────────────┘
    ↓
Phase 6: Testing & Polish
```

### MVP Scope (Recommended)

**For MVP (Week 1)**: Implement US1, US2, US3 (core registration + invitations)
- US1 must complete first (12 tasks)
- US2 and US3 can run in parallel after US1 (14 + 18 = 32 tasks)
- **Total MVP: 44 tasks**
- Enables full end-to-end company registration and team invitation
- Deferrable: US4 (tier enforcement), US5 (dashboard polish)

---

## Phase 1: Setup & Infrastructure

### Project Structure & Dependencies

- [ ] T001 Create Express backend directory structure with TypeScript config at `src/server/`
- [ ] T002 Create React frontend directory structure with Vite config at `src/client/`
- [ ] T003 [P] Install backend dependencies: express, drizzle-orm, stripe, mailgun-js, bullmq, ioredis, pino, bcryptjs, jsonwebtoken at `package.json`
- [ ] T004 [P] Install frontend dependencies: react, vite, @tanstack/react-query, @stripe/react-stripe-js, @stripe/stripe-js, tailwindcss, shadcn/ui at `package.json`
- [ ] T005 Configure TypeScript compiler for backend strictness at `tsconfig.json`
- [ ] T006 Configure Vite bundler with React plugin at `vite.config.ts`
- [ ] T007 Set up ESLint and Prettier for code quality at `.eslintrc.json` and `.prettierrc`
- [ ] T008 Create environment variable template at `.env.example`
- [ ] T009 Set up logging infrastructure with Pino at `src/lib/logger.ts`
- [ ] T010 Configure database connection with Drizzle ORM at `src/db/client.ts`

---

## Phase 2: Foundational (Database + Authentication)

### Database Schema & Migrations

- [ ] T011 Create `company` table schema in Drizzle at `src/db/schema/company.ts`
- [ ] T012 Create `user` table schema in Drizzle at `src/db/schema/user.ts`
- [ ] T013 [P] Create `userinvitation` table schema in Drizzle at `src/db/schema/userinvitation.ts`
- [ ] T014 [P] Create `session` table schema in Drizzle at `src/db/schema/session.ts`
- [ ] T015 [P] Create `companyauditlog` table schema in Drizzle at `src/db/schema/companyauditlog.ts`
- [ ] T016 Generate and apply database migrations at `src/db/migrations/0008_registration_tables.sql`
- [ ] T017 Create database indexes for performance at `src/db/migrations/0009_registration_indexes.sql`
- [ ] T018 Verify schema synchronization with data-model.md requirements

### Authentication & Session Management

- [x] T019 Create JWT token utilities (sign, verify, refresh) at `src/server/lib/jwt.ts`
- [x] T020 Create password hashing utilities (bcrypt) at `src/server/lib/password.ts`
- [x] T021 Implement authentication middleware for JWT validation at `src/server/middleware/auth.ts`
- [x] T022 Create session management service for refresh token tracking at `src/server/services/SessionService.ts`
- [x] T023 Implement CORS middleware for frontend-backend communication at `src/server/middleware/cors.ts`
- [x] T024 Create error handling middleware for API consistency at `src/server/middleware/errorHandler.ts`

### External Services Setup

- [x] T025 Configure Stripe SDK with test credentials at `src/server/lib/stripe.ts`
- [x] T026 Configure Mailgun SDK with test credentials at `src/server/lib/mailgun.ts`
- [x] T027 Configure Redis connection for job queue at `src/server/lib/redis.ts`
- [x] T028 Create BullMQ email job queue configuration at `src/server/jobs/emailQueue.ts`
- [x] T029 Implement email queue worker for sending invitations at `src/server/workers/emailWorker.ts`

---

## Phase 3: User Story 1 - Company Registration with Tier Selection

### US1 Backend Services

- [x] T030 [US1] Create RegistrationService for company creation logic at `src/server/services/RegistrationService.ts`
  - Validates company info
  - Creates company record
  - Logs to audit trail
  - Acceptance: Returns company with UUID, subscription tier, status

- [x] T031 [US1] Create PaymentService for Stripe integration at `src/server/services/PaymentService.ts`
  - Validates tier selection
  - Creates Stripe customer
  - Creates setup intent
  - Processes subscription creation
  - Acceptance: Returns Stripe subscription with status

- [x] T032 [US1] [P] Create AuditService for compliance logging at `src/server/services/AuditService.ts`
  - Logs all registration events
  - Tracks user actions
  - Stores in companyauditlog table
  - Acceptance: Audit entries created for COMPANY_CREATED, SUBSCRIPTION_CREATED

### US1 API Routes

- [x] T033 [US1] Implement `POST /api/auth/register` endpoint at `src/server/routes/auth.ts`
  - Validates input (company name, email, address, etc.)
  - Calls RegistrationService
  - Returns company + admin user data
  - Error handling for duplicate company name/email
  - Acceptance: 201 response with company and admin user

- [x] T034 [US1] Implement `POST /api/payment/validate` endpoint at `src/server/routes/payment.ts`
  - Validates tier selection
  - Returns pricing details
  - Calculates estimated cost
  - Acceptance: 200 response with tier details and pricing

- [x] T035 [US1] Implement `POST /api/payment/setup-intent` endpoint at `src/server/routes/payment.ts`
  - Creates Stripe SetupIntent
  - Returns clientSecret for frontend
  - Acceptance: 200 response with clientSecret

- [x] T036 [US1] Implement `POST /api/payment/process` endpoint at `src/server/routes/payment.ts`
  - Creates Stripe subscription
  - Processes first payment
  - Updates company subscription status
  - Handles 3D Secure if required
  - Acceptance: 200 response with subscription status

### US1 Frontend Components

- [x] T037 [US1] Create RegistrationPage component at `src/client/pages/RegistrationPage.tsx`
  - Multi-step form flow
  - Company info collection
  - Tier selection
  - Admin account creation
  - Acceptance: Form submission creates company

- [x] T038 [US1] [P] Create CompanyInfoForm component at `src/client/components/CompanyInfoForm.tsx`
  - Fields: company name, billing email, address, country, phone
  - Validation
  - Error display
  - Acceptance: Validates required fields

- [x] T039 [US1] [P] Create TierSelector component at `src/client/components/TierSelector.tsx`
  - Display 3 tiers (FREE, CONSULTANT, ENTERPRISE)
  - Show pricing and features
  - Selection state management
  - Acceptance: Allows tier selection

- [x] T040 [US1] [P] Create StripePaymentForm component at `src/client/components/StripePaymentForm.tsx`
  - Stripe CardElement integration
  - SetupIntent confirmation
  - Error handling
  - Loading states
  - Acceptance: Processes payment for paid tiers

- [x] T041 [US1] [P] Create AdminAccountForm component at `src/client/components/AdminAccountForm.tsx`
  - Email and password fields
  - Password strength validation
  - First name (required), last name (optional)
  - Acceptance: Creates admin user account

### US1 Integration & Testing

- [x] T042 [US1] Create contract test for `POST /api/auth/register` at `tests/contract/registration.test.ts`
  - Test valid FREE tier registration
  - Test valid CONSULTANT tier registration
  - Test duplicate company name error
  - Test duplicate email error
  - Acceptance: All contract tests pass

- [x] T043 [US1] [P] Create contract test for payment endpoints at `tests/contract/payment.test.ts`
  - Test tier validation
  - Test SetupIntent creation
  - Test subscription processing
  - Test payment decline handling
  - Acceptance: All payment contract tests pass

- [x] T044 [US1] [P] Create integration test for complete registration flow at `tests/integration/registration-flow.test.ts`
  - Test FREE tier registration to dashboard access
  - Test CONSULTANT tier registration with payment
  - Test payment failure recovery
  - Acceptance: Complete flow tests pass

---

## Phase 4: User Story 2 - Admin Account Creation & Onboarding

### US2 Backend Services

- [ ] T045 [US2] Create UserService for user account management at `src/server/services/UserService.ts`
  - Create user account
  - Verify email
  - Hash password with bcrypt
  - Assign role (ADMIN on registration)
  - Acceptance: Creates user with PENDING status until email verification

- [ ] T046 [US2] Create EmailService for transactional emails at `src/server/services/EmailService.ts`
  - Queue verification emails
  - Queue invitation emails
  - Template rendering (MJML + Handlebars)
  - Retry logic
  - Acceptance: Emails queued to BullMQ

- [ ] T047 [US2] [P] Create VerificationService for email verification tokens at `src/server/services/VerificationService.ts`
  - Generate verification tokens
  - Validate verification links
  - Track verification status
  - Expiry management
  - Acceptance: Tokens stored with 24-hour expiry

### US2 API Routes

- [ ] T048 [US2] Implement `POST /api/auth/verify-email` endpoint at `src/server/routes/auth.ts`
  - Validates verification token
  - Updates user status to ACTIVE
  - Returns success/error
  - Acceptance: 200 response marks user ACTIVE

- [ ] T049 [US2] Implement `POST /api/auth/login` endpoint at `src/server/routes/auth.ts`
  - Validates email + password
  - Creates session record
  - Returns access + refresh tokens
  - Sets HttpOnly cookie
  - Acceptance: 200 response with tokens, httpOnly cookie set

- [ ] T050 [US2] Implement `POST /api/auth/refresh` endpoint at `src/server/routes/auth.ts`
  - Validates refresh token
  - Checks token family for reuse detection
  - Issues new access + refresh tokens
  - Acceptance: 200 response with new tokens

- [ ] T051 [US2] [P] Implement `POST /api/auth/logout` endpoint at `src/server/routes/auth.ts`
  - Revokes refresh token
  - Clears cookie
  - Logs audit event
  - Acceptance: 200 response, refresh token blacklisted

- [ ] T052 [US2] Implement `GET /api/admin/dashboard` endpoint at `src/server/routes/admin.ts`
  - Returns company info + metrics
  - Lists team members
  - Shows onboarding status
  - Acceptance: 200 response with dashboard data

### US2 Frontend Components

- [ ] T053 [US2] Create VerificationPage component at `src/client/pages/VerificationPage.tsx`
  - Handles verification token from email link
  - Shows loading/success/error states
  - Auto-redirects to login on success
  - Acceptance: Verifies email and redirects

- [ ] T054 [US2] [P] Create LoginPage component at `src/client/pages/LoginPage.tsx`
  - Email + password form
  - Error handling
  - Redirect to dashboard on success
  - Acceptance: Authenticates user and sets tokens

- [ ] T055 [US2] [P] Create AdminDashboard component at `src/client/pages/AdminDashboard.tsx`
  - Displays company info
  - Shows team members list
  - Displays onboarding checklist
  - Welcome message
  - Acceptance: Shows dashboard metrics and onboarding progress

- [ ] T056 [US2] [P] Create MetricsCard component at `src/client/components/MetricsCard.tsx`
  - Display metric value
  - Show metric label
  - Handle loading state
  - Acceptance: Renders metric cards with values

- [ ] T057 [US2] Create OnboardingChecklist component at `src/client/components/OnboardingChecklist.tsx`
  - Show checklist items (invite team, create projects, set rates)
  - Track completion status
  - Update on user actions
  - Acceptance: Shows progress and enables/disables items

### US2 Email Templates

- [ ] T058 [US2] Create verification email template at `src/server/emails/verification.mjml`
  - Personalized greeting
  - Verification link
  - 24-hour expiry notice
  - Plain text fallback
  - Acceptance: Email renders correctly in all clients

- [ ] T059 [US2] [P] Create welcome email template at `src/server/emails/welcome.mjml`
  - Welcome message
  - Quick start guide
  - Link to dashboard
  - Plain text fallback
  - Acceptance: Email sent after verification

- [ ] T059b [US4] Create invoice email template at `src/server/emails/invoice.mjml`
  - Company name and billing details
  - Invoice number and date
  - Itemized charges (subscription tier, prorated amounts, overage fees)
  - Payment method last 4 digits
  - Total amount due
  - Link to billing history
  - Plain text fallback
  - Acceptance: Email sent after successful payment with invoice details

### US2 Integration & Testing

- [ ] T060 [US2] Create contract test for auth endpoints at `tests/contract/auth.test.ts`
  - Test login endpoint
  - Test token refresh
  - Test logout
  - Test invalid credentials
  - Acceptance: All auth contract tests pass

- [ ] T061 [US2] [P] Create integration test for onboarding flow at `tests/integration/onboarding-flow.test.ts`
  - Test email verification
  - Test login after verification
  - Test dashboard access
  - Test token refresh
  - Acceptance: Complete onboarding flow tests pass

---

## Phase 5: User Story 3 - Personnel Invitation System

### US3 Backend Services

- [ ] T062 [US3] Create InvitationService for team member invitations at `src/server/services/InvitationService.ts`
  - Create invitation records
  - Generate invitation tokens
  - Send invitation emails
  - Track acceptance
  - Expiry management
  - Acceptance: Invitations created with 7-day expiry

- [ ] T063 [US3] Create BulkInvitationService for CSV processing at `src/server/services/BulkInvitationService.ts`
  - Parse CSV files
  - Validate email addresses
  - Queue bulk jobs
  - Track batch progress
  - Dead-letter queue for failures
  - Acceptance: Processes 50 emails with job queue

- [ ] T064 [US3] [P] Create EmailQueueMonitor for progress tracking at `src/server/services/EmailQueueMonitor.ts`
  - Tracks job status
  - Provides batch progress
  - Emits Socket.IO events
  - Logs failures
  - Acceptance: Real-time progress updates via Socket.IO

### US3 API Routes

- [ ] T065 [US3] Implement `POST /api/invitations/send` endpoint at `src/server/routes/invitations.ts`
  - Accepts single or multiple emails
  - Validates recipients (max 50)
  - Creates invitation records
  - Queues email jobs
  - Returns batch ID
  - Acceptance: 202 response with invitation IDs and batch ID

- [ ] T066 [US3] Implement `POST /api/invitations/send-bulk` endpoint at `src/server/routes/invitations.ts`
  - Accepts CSV file upload
  - Parses email and role
  - Validates format
  - Queues all invitations
  - Returns batch progress tracking
  - Acceptance: 202 response with queued count and batch ID

- [ ] T067 [US3] [P] Implement `GET /api/invitations/status/:batchId` endpoint at `src/server/routes/invitations.ts`
  - Returns batch progress
  - Shows sent/failed counts
  - Lists failed emails with reasons
  - Acceptance: 200 response with detailed progress

- [ ] T068 [US3] [P] Implement `POST /api/invitations/accept/:invitationToken` endpoint at `src/server/routes/invitations.ts`
  - Validates invitation token
  - Creates user account with invited email
  - Assigns invited role
  - Updates invitation status
  - Auto-logs in user
  - Acceptance: 201 response with new user account

- [x] T069 [US3] List invitations for company — DONE (covered ad-hoc): `GET /api/team` (team.ts:707-719) already returns pending `invitations` alongside `members`. No separate `/api/invitations` list needed; the gap is purely UI-side (see T076).

- [ ] T070 [US3] Implement cancel/revoke pending-invitation endpoint `POST /api/team/invitations/:invitationId/cancel` at `src/server/routes/team.ts`
  - GAP (FR-066 "Cancel Invitation"): no endpoint exists today to cancel a pending invite — admins can only wait for 7-day expiry or hand-delete the row
  - ADMIN-only (mirror guard at team.ts:967), company-scoped; 404 if invitation not in caller's company
  - Set `userinvitations.status = "cancelled"` (status value already used by `/invite` at team.ts:759); do NOT hard-delete
  - Cancelled token must fail the accept route
  - Acceptance: 200 `{ success: true }`, row flips to cancelled, accept link invalid

- [ ] T070b [US3] Implement resend pending-invitation endpoint `POST /api/team/invitations/:invitationId/resend` at `src/server/routes/team.ts`
  - GAP (FR-063/FR-066 "Resend" for Pending/Expired): existing `/:userId/reinvite` (team.ts:955) only works for an existing `users` row — a pending invitee has no user row, so pending invites cannot be resent today
  - ADMIN-only, company-scoped; new token + fresh 7-day `expiresat`, status back to `pending`, resend email (reuse token/email logic from `/:userId/reinvite` at team.ts:993-1022)
  - Acceptance: 200 `{ success, steps }`, invite re-sent with refreshed expiry

### US3 Frontend Components

- [ ] T071 [US3] Create InvitePage component at `src/client/pages/InvitePage.tsx`
  - Handles invitation token from email link
  - Shows company name + assigned role
  - Option to create account or login
  - Acceptance: Displays invitation details

- [ ] T072 [US3] Create InviteTeamPage component at `src/client/pages/InviteTeamPage.tsx`
  - Tab for single/bulk invitations
  - Form and CSV upload
  - Real-time progress tracking
  - Failed emails display
  - Acceptance: Invites team members with progress feedback

- [ ] T073 [US3] [P] Create SingleInviteForm component at `src/client/components/SingleInviteForm.tsx`
  - Email field
  - Role dropdown
  - Optional message
  - Submit button
  - Acceptance: Sends single invitation

- [ ] T074 [US3] [P] Create BulkInviteUpload component at `src/client/components/BulkInviteUpload.tsx`
  - CSV file input
  - Format validation
  - Preview table
  - Submit and cancel buttons
  - Acceptance: Accepts CSV and queues bulk invitations

- [ ] T075 [US3] [P] Create InvitationProgress component at `src/client/components/InvitationProgress.tsx`
  - Progress bar with percentage
  - Sent/failed/total counts
  - Real-time updates via Socket.IO
  - Failed email list
  - Acceptance: Shows real-time progress with Socket.IO updates

- [ ] T076 [US3] Surface Pending Invitations in the live team UI `src/client/components/Dashboard/TeamMembersTab.tsx` (supersedes the never-built `PersonnelManagementPage.tsx`)
  - GAP (FR-065/FR-066/FR-067): `GET /api/team` already returns `{ members, invitations }` (team.ts:707-719) but the tab discards `invitations` and renders active members only — admins cannot see outstanding invites
  - Render a "Pending Invitations" section (email, invited-on, expires-on, status)
  - ADMIN-only actions per pending invite: Resend → `POST /api/team/invitations/:invitationId/resend` (T070b); Cancel → `POST /api/team/invitations/:invitationId/cancel` (T070)
  - FR-067 confirm on Cancel: "Are you sure? User cannot accept invitation after cancellation. You can resend a new invitation."
  - NOTE already done: removing an active member works (trash icon → `POST /api/team/:userId/remove`). "Change Role" (FR-066) is a separate, not-requested gap — out of scope here
  - Acceptance: admin sees pending invites; Resend refreshes; Cancel (after confirm) removes from the pending list

- [ ] T077 [US3] [P] Create TeamMemberTable component at `src/client/components/TeamMemberTable.tsx`
  - Displays team members with columns: email, role, status, date joined
  - Action buttons
  - Sorting/filtering
  - Acceptance: Lists team members with actions

### US3 Invitation Templates

- [ ] T078 [US3] Create invitation email template at `src/server/emails/invitation.mjml`
  - Personalized greeting with company name
  - Assigned role
  - Invitation link (7-day expiry)
  - Acceptance scenarios (create account or login)
  - Plain text fallback
  - Acceptance: Email renders with working invitation link

- [ ] T079 [US3] [P] Create account-created email template at `src/server/emails/account-created.mjml`
  - Confirmation of account creation
  - Company context
  - Welcome message
  - Link to dashboard
  - Acceptance: Email sent after account creation from invitation

### US3 WebSocket Setup

- [ ] T080 [US3] [P] Implement Socket.IO server integration at `src/server/lib/socket.ts`
  - Initialize Socket.IO with Express
  - Handle client connections
  - Emit progress events
  - Acceptance: Socket.IO server running on Express

- [ ] T081 [US3] Create Socket.IO client hook for progress tracking at `src/client/hooks/useInvitationProgress.ts`
  - Subscribe to batch ID
  - Receive progress updates
  - Handle reconnection
  - Acceptance: Real-time progress updates in React

### US3 Integration & Testing

- [ ] T082 [US3] Create contract test for invitation endpoints at `tests/contract/invitations.test.ts`
  - Test single invitation
  - Test bulk CSV upload
  - Test invitation acceptance
  - Test expired invitation rejection
  - Acceptance: All invitation contract tests pass

- [ ] T083 [US3] [P] Create integration test for invitation flow at `tests/integration/invitation-flow.test.ts`
  - Test single invitation to account creation
  - Test bulk CSV to all invitations sent
  - Test Socket.IO progress updates
  - Test token expiry
  - Acceptance: Complete invitation flow tests pass

---

## Phase 6: User Story 4 - Subscription Tier Limits & Enforcement

### US4 Backend Services

- [ ] T084 [US4] Create TierLimitService for enforcing subscription constraints at `src/server/services/TierLimitService.ts`
  - Check user limits for tier
  - Enforce PM system connection limits
  - Track overage users (ENTERPRISE)
  - Generate tier upgrade messaging
  - Acceptance: Validates tier constraints

- [ ] T085 [US4] Create UpgradeService for plan changes at `src/server/services/UpgradeService.ts`
  - Upgrade/downgrade subscriptions
  - Calculate prorated billing
  - Update Stripe subscription
  - Update company tier
  - Acceptance: Processes tier changes with Stripe

### US4 API Routes

- [ ] T086 [US4] Implement tier limit validation in invitation endpoint at `src/server/routes/invitations.ts`
  - Check FREE tier 5-user limit
  - Check CONSULTANT/ENTERPRISE limits
  - Return limit error with upgrade path
  - Acceptance: Blocks invitations exceeding tier limits

- [ ] T087 [US4] [P] Implement `POST /api/subscription/upgrade` endpoint at `src/server/routes/subscription.ts`
  - Validates new tier
  - Processes payment
  - Updates Stripe subscription
  - Returns updated company data
  - Acceptance: 200 response with new subscription

- [ ] T088 [US4] [P] Implement `POST /api/subscription/downgrade` endpoint at `src/server/routes/subscription.ts`
  - Validates downgrade (users > limit warning)
  - Updates Stripe subscription
  - Returns updated company data
  - Acceptance: 200 response with downgrade confirmation

- [ ] T089 [US4] Implement `GET /api/subscription/features` endpoint at `src/server/routes/subscription.ts`
  - Returns tier-specific features
  - PM system connection count limits
  - User limits
  - Acceptance: 200 response with feature list

### US4 Frontend Components

- [ ] T090 [US4] Create TierLimitWarning component at `src/client/components/TierLimitWarning.tsx`
  - Display when limit reached
  - Show upgrade options
  - Link to upgrade flow
  - Acceptance: Shows limit message with upgrade button

- [ ] T091 [US4] [P] Create UpgradeFlowPage component at `src/client/pages/UpgradeFlowPage.tsx`
  - Display current vs new tier
  - Pricing comparison
  - Feature comparison
  - Confirm upgrade button
  - Acceptance: Enables tier upgrade from dashboard

- [ ] T092 [US4] [P] Create TierComparisonTable component at `src/client/components/TierComparisonTable.tsx`
  - Compare features across tiers
  - Highlight current tier
  - Show pricing
  - Acceptance: Displays tier features side-by-side

### US4 Integration & Testing

- [ ] T093 [US4] Create test for tier limit enforcement at `tests/integration/tier-limits.test.ts`
  - Test FREE tier 5-user limit
  - Test CONSULTANT unlimited users
  - Test ENTERPRISE overage tracking
  - Test PM system connection limits
  - Acceptance: Tier limit tests pass

### US4 Edge Case Handling

- [ ] T093a [US4] Implement concurrent payment prevention at `src/server/services/PaymentService.ts`
  - Detect concurrent payment attempts during renewal billing
  - Prevent duplicate charges using idempotency keys
  - Return "Payment currently processing" message with retry guidance
  - Acceptance: Duplicate payment attempts blocked with appropriate messaging

- [ ] T093b [US4] Implement Stripe disconnection fallback handling at `src/server/services/PaymentService.ts`
  - Detect invalid Stripe API key or connection drops
  - Log errors for monitoring
  - Return "Payment processing temporarily unavailable" for paid tier operations
  - Allow Free tier operations to continue unaffected
  - Acceptance: Graceful degradation when Stripe unavailable

=======
>>>>>>> origin/014-sysadmin-platform-admin
---

## Phase 7: User Story 5 - Admin Dashboard & Company Settings

### US5 Backend Services

- [ ] T094 [US5] Create CompanyService for company settings management at `src/server/services/CompanyService.ts`
  - Update company info
  - Manage billing details
  - Track company metrics
  - Generate audit trail
  - Acceptance: Updates company records with validation

- [ ] T095 [US5] Create DashboardService for metrics aggregation at `src/server/services/DashboardService.ts`
  - Aggregate user count
  - Count active projects
  - Count tasks
  - Calculate onboarding progress
  - Acceptance: Returns dashboard metrics

### US5 API Routes

- [ ] T096 [US5] Implement `GET /api/admin/settings` endpoint at `src/server/routes/admin.ts`
  - Returns company settings
  - Billing information
  - Subscription details
  - Acceptance: 200 response with settings

- [ ] T097 [US5] [P] Implement `PATCH /api/admin/settings` endpoint at `src/server/routes/admin.ts`
  - Updates company name, address, phone, email
  - Validates input
  - Logs changes
  - Acceptance: 200 response with updated settings

- [ ] T098 [US5] [P] Implement `POST /api/admin/onboarding-complete` endpoint at `src/server/routes/admin.ts`
  - Marks onboarding as complete
  - Updates company record
  - Logs audit event
  - Acceptance: 200 response, onboarding marked complete

- [ ] T099 [US5] Implement `GET /api/admin/billing` endpoint at `src/server/routes/admin.ts`
  - Returns billing method details
  - Next renewal date
  - Past invoices
  - Acceptance: 200 response with billing info

- [ ] T100 [US5] [P] Implement `PATCH /api/admin/billing-method` endpoint at `src/server/routes/admin.ts`
  - Updates default payment method
  - Validates card
  - Logs changes
  - Acceptance: 200 response with updated method

### US5 Frontend Components

- [ ] T101 [US5] Create CompanySettingsPage component at `src/client/pages/CompanySettingsPage.tsx`
  - Display company info
  - Show billing details
  - Edit forms
  - Action buttons
  - Acceptance: Displays and allows editing of settings

- [ ] T102 [US5] [P] Create CompanyInfoForm component at `src/client/components/settings/CompanyInfoForm.tsx`
  - Fields: company name, address, phone, email
  - Edit/save toggle
  - Validation
  - Success/error messages
  - Acceptance: Saves company info changes

- [ ] T103 [US5] [P] Create BillingDetailsCard component at `src/client/components/settings/BillingDetailsCard.tsx`
  - Display card last 4 digits
  - Expiration date
  - Option to update method
  - Acceptance: Shows billing method details

- [ ] T104 [US5] Create SubscriptionSummaryCard component at `src/client/components/SubscriptionSummaryCard.tsx`
  - Current tier badge
  - Next renewal date
  - Renewal amount
  - Upgrade/downgrade buttons
  - Acceptance: Shows subscription summary

- [ ] T105 [US5] Create EnhancedDashboardMetrics component at `src/client/components/EnhancedDashboardMetrics.tsx`
  - Active users metric
  - Projects metric
  - Tasks metric
  - Week activity metric
  - Acceptance: Shows all dashboard metrics with real-time updates

- [ ] T106 [US5] [P] Create DashboardActivityFeed component at `src/client/components/DashboardActivityFeed.tsx`
  - Show recent invitations sent
  - Show users joined
  - Show project created
  - Timestamp and actor
  - Acceptance: Displays recent activity

### US5 Integration & Testing

- [ ] T107 [US5] Create contract test for settings endpoints at `tests/contract/admin.test.ts`
  - Test get settings
  - Test update settings
  - Test billing update
  - Acceptance: All admin contract tests pass

- [ ] T108 [US5] [P] Create integration test for dashboard flow at `tests/integration/dashboard-flow.test.ts`
  - Test dashboard access
  - Test metrics accuracy
  - Test settings update
  - Test onboarding completion
  - Acceptance: Complete dashboard flow tests pass

---

## Phase 8: Testing & Polish

### E2E Testing (Playwright)

- [ ] T109 Create E2E test for complete registration flow at `tests/e2e/registration.spec.ts`
  - Test FREE tier registration
  - Test CONSULTANT tier with payment (using test card)
  - Test email verification
  - Test admin dashboard access
  - Acceptance: E2E tests pass with real browser automation

- [ ] T110 [P] Create E2E test for invitation flow at `tests/e2e/invitations.spec.ts`
  - Test single invitation sending
  - Test bulk CSV upload
  - Test invitation acceptance
  - Test new user login
  - Acceptance: E2E invitation tests pass

- [ ] T111 [P] Create E2E test for team management at `tests/e2e/team-management.spec.ts`
  - Test invite multiple users
  - Test personnel list view
  - Test role change
  - Test user removal
  - Acceptance: Team management E2E tests pass

### Performance & Security

- [ ] T112 Run TypeScript type checking at package.json script
  - Ensure zero TypeScript errors
  - Acceptance: `npm run check-types` passes

- [ ] T113 [P] Run ESLint on all code at package.json script
  - Fix linting errors
  - Acceptance: `npm run lint` passes

- [ ] T114 [P] Run Prettier for code formatting at package.json script
  - Auto-format all files
  - Acceptance: `npm run format` completes

- [ ] T115 Verify no hardcoded secrets in codebase
  - Grep for API keys, passwords
  - All secrets in .env
  - Acceptance: No secrets found in code

- [ ] T116 [P] Test Stripe webhook signature verification at `tests/integration/stripe-webhooks.test.ts`
  - Verify webhook signature validation
  - Test invoice.paid webhook
  - Test payment failure webhook
  - Acceptance: Webhook tests pass

- [ ] T117 [P] Test password hashing with bcrypt at `tests/unit/password.test.ts`
  - Test password creation
  - Test password verification
  - Test cost factor
  - Acceptance: Password tests pass

### Documentation & Cleanup

- [ ] T118 Update CLAUDE.md with registration patterns at `CLAUDE.md`
  - Document new services
  - Document API endpoints
  - Document auth flow
  - Document email templates
  - Acceptance: CLAUDE.md updated

- [ ] T119 [P] Create API documentation at `docs/api-registration.md`
  - Document all endpoints
  - Include request/response examples
  - Include error codes
  - Acceptance: API docs complete

- [ ] T120 [P] Create deployment checklist at `docs/deployment-checklist.md`
  - Environment variables
  - Stripe setup
  - Mailgun setup
  - Database migrations
  - Acceptance: Deployment guide complete

---

## Implementation Strategy

### Task Dependencies

```
Setup (T001-T010) → Foundation (T011-T029) →
<<<<<<< HEAD
                      └─→ US1 (T030-T044)
                            │
          ┌─────────────────┼─────────────────┐
          ↓                 ↓                 ↓
    US2 (T045-T061)   US3 (T062-T083)   US4 (T084-T093)
    (can parallel     (can parallel        (depends
     with US3)        with US2)            on US1)
          ↓                 ↓                 
          └────────┬────────┘                 
                   ↓                          
           US5 (T094-T120)                   
           (depends on US2)                  
                   ↓                          
          Polish (T109-T120)                  
=======
                      ├→ US1 (T030-T044)
                      │   ├→ US2 (T045-T061)
                      │   │   ├→ US3 (T062-T083)
                      │   │   └─→ US4 (T084-T093)
                      │   └─→ US5 (T094-T120)
                      └→ Polish (T109-T120)
>>>>>>> origin/014-sysadmin-platform-admin
```

### Parallel Opportunities

<<<<<<< HEAD
**Phase 2 → Phase 3 (after US1 complete)**:
- US2 (Admin Onboarding) and US3 (Invitations) can run in parallel
- Both require only Phase 2 (database + auth) completion

=======
>>>>>>> origin/014-sysadmin-platform-admin
**Backend Services** (can run in parallel after T029):
- T031 (PaymentService)
- T032 (AuditService)
- T047 (VerificationService)

**Frontend Components** (can run in parallel):
- T037-T041 (Registration components)
- T053-T057 (Onboarding components)
- T071-T077 (Invitation components)

**Testing** (can run in parallel with implementation):
- T042-T044 (US1 tests)
- T060-T061 (US2 tests)
- T082-T083 (US3 tests)

### MVP Scope (Recommended for Week 1)

**Complete these 44 tasks for MVP**:
- Phase 1: T001-T010 (10 tasks, 8 hours)
- Phase 2: T011-T029 (19 tasks, 16 hours)
- Phase 3 (US1): T030-T044 (15 tasks, 20 hours)
- **Total**: 44 tasks, ~44 hours (~1 week for 1-2 developers)

<<<<<<< HEAD
**Week 1 Parallel Execution**:
- After US1 (T030-T044) completes, US2 and US3 can run in parallel:
  - US2: T045-T061 (17 tasks)
  - US3: T062-T083 (22 tasks)

**Deferrable to Week 2**:
- Phase 6 (US4): T084-T093 (13 tasks) - Tier enforcement
=======
**Deferrable to Week 2**:
- Phase 4 (US2): T045-T061 (17 tasks) - Onboarding refinements
- Phase 5 (US3): T062-T083 (22 tasks) - Invitation polish
- Phase 6 (US4): T084-T093 (10 tasks) - Tier enforcement
>>>>>>> origin/014-sysadmin-platform-admin
- Phase 7 (US5): T094-T108 (15 tasks) - Dashboard features
- Phase 8: T109-T120 (12 tasks) - E2E & polish

### Testing Approach

**Unit Tests**: Create as you implement services (T042, T060, T082, T116, T117)
**Integration Tests**: Create after completing each user story (T044, T061, T083, T093, T108)
**E2E Tests**: Create at end of feature (T109, T110, T111)
**Contract Tests**: Validate API against OpenAPI specs (T042, T043, T060, T082, T107)

---

## Task Checklist Statistics

| Category | Count |
|----------|-------|
| Setup & Infrastructure | 10 |
| Database & Auth | 19 |
| US1: Registration | 15 |
| US2: Admin Onboarding | 17 |
| US3: Invitations | 22 |
<<<<<<< HEAD
| US4: Tier Limits | 13 |
| US5: Dashboard | 15 |
| Testing & Polish | 12 |
| **Total** | **123** |
=======
| US4: Tier Limits | 10 |
| US5: Dashboard | 15 |
| Testing & Polish | 12 |
| **Total** | **120** |
>>>>>>> origin/014-sysadmin-platform-admin

**By Complexity**:
- Simple: 40 tasks (setup, components, templates)
- Medium: 60 tasks (services, endpoints, integration)
- Complex: 20 tasks (payment, webhooks, queue system)

---

## Execution Timeline

| Phase | Duration | Developer(s) |
|-------|----------|--------------|
| Phase 1 (Setup) | 8 hours | 1 |
| Phase 2 (Foundation) | 16 hours | 2 (can parallelize) |
| Phase 3 (US1) | 20 hours | 2 (can parallelize) |
<<<<<<< HEAD
| Phase 4 (US2) | 18 hours | 2 (can parallelize with US3) |
| Phase 5 (US3) | 24 hours | 2 (can parallelize with US2) |
=======
| Phase 4 (US2) | 18 hours | 2 (can parallelize) |
| Phase 5 (US3) | 24 hours | 2 (can parallelize) |
>>>>>>> origin/014-sysadmin-platform-admin
| Phase 6 (US4) | 12 hours | 1 |
| Phase 7 (US5) | 16 hours | 2 (can parallelize) |
| Phase 8 (Polish) | 12 hours | 1-2 |
| **Total (Sequential)** | **136 hours** | ~2 weeks @ 40 hrs/week |
| **Total (Optimized)** | **60-80 hours** | ~1 week with full parallelization |

---

## Success Criteria

**All tasks complete when**:
- ✅ All TypeScript compiles without errors
- ✅ All API contract tests pass
- ✅ All integration tests pass
- ✅ All E2E tests pass with Playwright
- ✅ Zero console.log (Pino logging only)
- ✅ No hardcoded secrets in code
- ✅ ESLint and Prettier clean
- ✅ All 5 user stories independently testable
- ✅ CLAUDE.md updated with new patterns
- ✅ Deployment checklist complete

---

_Phase 2 Design Complete | Ready for Implementation_
_Run `npm run dev:server` and `npm run dev:client` to start development_
_Follow quickstart.md for local testing setup_
