# Feature Specification: Company Registration & Subscription Management

**Feature Branch**: `003-registration`
**Created**: 2026-02-17
**Status**: Draft
**Input**: User requirement: "Company registration with subscription tiers (FREE/SMALL_BUSINESS/CONSULTANT/ENTERPRISE), payment setup via Stripe, and admin onboarding including personnel invitation system"

---

## Amendment 2026-06-05 — Tier model & pricing (SUPERSEDES tier/pricing details below)

The public subscription model has changed. Where the requirements and acceptance
scenarios below reference the FREE tier or older prices, the following governs:

- **No free public tier.** FREE is no longer offered on signup. New companies
  default to **SINGLE_USER**. FREE remains a *valid internal value* only — for
  legacy companies and billing-exempt/internal accounts — and is never selectable
  in the registration UI. A `?tier=FREE` link falls back to SINGLE_USER.
- **Default signup tier**: SINGLE_USER (1 seat). Was FREE.
- **Tiers & monthly prices** (canonical source: `stripeConfig.pricing` in
  `src/server/lib/stripe.ts`; repriced 2026-05-30):
  - SINGLE_USER — $19.95 — 1 seat
  - SMALL_BUSINESS — $29.95 — up to 25 seats
  - CONSULTANT — $39.95 — up to 999 seats
  - ENTERPRISE — $59.95 — 25 seats + $5/active seat over 25 (overage)
- **Paid-tier gating** is unchanged: SINGLE_USER/SMALL_BUSINESS/CONSULTANT/
  ENTERPRISE all require Stripe payment confirmation before activation
  (PENDING → ACTIVE via webhook) unless CC processing is disabled.
- **DB default**: `companies.billingplan` column default changed FREE → SINGLE_USER
  (migration `0026_default_single_user.sql`). The app always sets the plan
  explicitly at registration; the column default is a safety net.

Implementation: `src/server/routes/auth.ts` (register zod schema + default),
`src/server/services/RegistrationService.ts` (tier type, seats, price, validation),
`src/client/pages/RegistrationPage.tsx` (default tier + `?tier` validation).

> Note: code comments reference "spec 023 FR-001" for pricing, but no `023`
> spec folder exists; subscription/pricing requirements live here (003) and in
> `005-Time-and-Billing`.

---

## Overview

The Company Registration & Subscription Management System enables organizations to sign up for wxKanban, select appropriate subscription tiers based on team size and feature needs, configure billing via Stripe payment processing, and establish administrative roles for managing team members. This feature provides the foundation for multi-user team collaboration with clear subscription boundaries and admin responsibilities.

**Target Users**: Company founders, business owners, team leads, IT administrators

**Core Value**: Enable quick company onboarding with frictionless payment setup, clear subscription tier expectations, and streamlined admin user creation to begin team collaboration immediately

**Key Capabilities**:

- Streamlined company information collection (name, address, contact details)
- Four subscription tier options with clearly defined user limits and features
- Stripe payment integration for paid tiers with secure tokenization
- Admin account creation as first user with role assignment
- Admin Dashboard with quick-start guidance and team personnel management
- Personnel invitation system with email notifications and acceptance workflow
- Invitation record tracking and expiration management

---

## User Scenarios & Testing

### Primary User Story 1: Company Registration with Tier Selection

**As a** business owner or team lead looking to use wxKanban,
**I need to** register my company, provide basic information, and select a subscription tier,
**So that** my organization can begin collaborating on task management immediately with clear cost expectations.

**Acceptance Scenarios**:

1. **Given** I visit the wxKanban landing page, **When** I click a tier's CTA button (e.g. "Start Free", "Register"), **Then** I am navigated to `/registration?tier=<TIER>` and the multi-step registration form opens at the Company Information step, with the selected tier pre-applied

2. **Given** I am on the registration page, **When** the form loads, **Then** I see the selected tier displayed in the header (e.g. "Setting up your Consultant account") and the progress bar reflects the steps for my tier:
   - **FREE / SMALL_BUSINESS**: Company → Admin (2 steps)
   - **CONSULTANT / ENTERPRISE**: Company → Payment → Admin (3 steps)

3. **Given** I complete company information (FREE or SMALL_BUSINESS tier), **When** I click "Next", **Then** no payment step is shown — I proceed directly to admin account setup

4. **Given** I complete company information (CONSULTANT or ENTERPRISE tier), **When** I click "Next", **Then** I am presented with a Stripe-powered payment form requesting credit card information

5. **Given** I enter valid credit card details, **When** I click "Activate Plan", **Then** payment is processed securely and subscription becomes active immediately upon success

6. **Given** payment processing fails, **When** I receive an error message, **Then** I can retry payment or select a different plan without losing my company information

7. **Given** my subscription is activated, **When** I proceed to final registration step, **Then** I am directed to create my personal admin account (email + password)

### Primary User Story 2: Admin Account Creation and Initial Onboarding

**As a** company administrator registering for wxKanban,
**I need to** create my personal admin account with full administrative privileges,
**So that** I can immediately begin inviting team members and configuring company settings.

**Acceptance Scenarios**:

1. **Given** my company subscription is activated, **When** I create my admin account (email, password), **Then** my account is created with "ADMIN" role automatically assigned

2. **Given** my admin account is created, **When** email verification is sent, **Then** I receive verification email within 2 minutes to my registered email address

3. **Given** I click the email verification link, **When** I verify my email address, **Then** my account becomes fully active and I can access the Admin Dashboard

4. **Given** I access the Admin Dashboard for the first time, **When** the page loads, **Then** I see:
   - Company name and subscription tier
   - Number of active users (initially 1: myself)
   - Quick-start checklist: "Invite team members", "Configure projects", "Set billing rates"
   - Welcome message with access to personnel management and company settings

5. **Given** I am a new admin, **When** I explore the system, **Then** all navigation options are enabled and I have no usage restrictions

### Primary User Story 3: Personnel Invitation System

**As a** company administrator,
**I need to** invite team members by email and track their acceptance status,
**So that** my team can access wxKanban with proper role assignments and project access.

**Acceptance Scenarios**:

1. **Given** I am logged into the Admin Dashboard, **When** I navigate to "Invite Team Members", **Then** I see a form requesting:
   - Email address (or multiple emails in bulk format)
   - Role assignment (Admin, Manager, Developer)
   - Optional message to include in invitation email

2. **Given** I enter a valid email address, **When** I submit the invitation, **Then**:
   - An invitation record is created with status "PENDING"
   - Invitation email is sent within 1 minute
   - Invitation link includes 7-day validity period
   - Email includes company name, role, and personalized message (if provided)

3. **Given** I invite multiple team members, **When** I upload a CSV file with up to 50 emails, **Then**:
   - System validates all email addresses
   - All valid invitations are sent within 5 minutes
   - Invalid email addresses are reported with specific errors
   - System prevents duplicate invitations to same email

4. **Given** team members receive invitations, **When** they click the invitation link, **Then** they see:
   - Company name and subscription tier
   - Their assigned role
   - Option to create account or sign in if they already have wxKanban account

5. **Given** an invited user has no wxKanban account, **When** they click "Create Account", **Then**:
   - They create personal account (password set)
   - They are automatically added to the company with assigned role
   - Their account becomes active immediately
   - They are redirected to Admin Dashboard with company context

6. **Given** an invited user already has wxKanban account, **When** they click "Accept Invitation", **Then**:
   - They are added to the company with assigned role
   - Invitation status changes to "ACCEPTED"
   - They can switch between companies they belong to

7. **Given** an invitation is pending for 7 days, **When** the expiration date passes, **Then**:
   - Invitation status changes to "EXPIRED"
   - Invitation link no longer functions
   - Admin can view expired invitations and resend if needed

8. **Given** I view the personnel management page, **When** page loads, **Then** I see a table showing:
   - All team members with status (Active, Pending, Expired)
   - Email addresses and assigned roles
   - Date invited and date accepted (if applicable)
   - Action buttons: "Resend" (for pending/expired), "Remove User", "Change Role"

### Primary User Story 4: Subscription Tier Limits and Enforcement

**As a** a company user on the Free tier,
**I need to** understand user limits and see clear messaging when I reach tier limits,
**So that** I know when to upgrade and understand what features become available.

**Acceptance Scenarios**:

1. **Given** I have Free tier with ≤5 users, **When** I invite a 6th user, **Then** I receive message:
   - "Free tier limited to 5 users. Upgrade to Consultant to add more team members."
   - I am shown upgrade pricing and can proceed with upgrade immediately

2. **Given** I have Consultant tier, **When** I view available PM system integrations, **Then** I see:
   - Multiple PM system connections enabled (Jira, Monday.com, Asana, Trello)
   - No user limits beyond practical system limits
   - Feature comparison showing Consultant capabilities

3. **Given** I have Free tier, **When** I attempt to add multiple PM system connections, **Then** I see messaging:
   - "Basic PM integration only. Upgrade to Consultant for multiple PM system connections."
   - Option to upgrade tier

4. **Given** I upgrade from Free to Consultant mid-month, **When** payment is processed, **Then**:
   - Subscription tier immediately changes
   - Prorated billing is calculated (if applicable)
   - New features become available instantly
   - Invoice reflects both plan charges

5. **Given** Free tier is selected, **When** I invite users, **Then** the system enforces hard limit:
   - 6th invitation is rejected at submission
   - User sees count: "4 of 5 users used"
   - Clear upgrade path is presented

### Primary User Story 5: Admin Dashboard and Company Settings

**As a** company administrator,
**I need to** view company information, manage subscription, and configure basic settings,
**So that** I can maintain proper company details and manage billing relationships.

**Acceptance Scenarios**:

1. **Given** I access company settings, **When** page loads, **Then** I see:
   - Company name, address, phone number (all editable)
   - Billing contact email (editable)
   - Current subscription tier (Free / Consultant / Enterprise)
   - Billing cycle dates and next renewal date
   - Option to upgrade/downgrade plan

2. **Given** I edit company information, **When** I save changes, **Then** changes are persisted immediately and confirmation message appears

3. **Given** I have Consultant or Enterprise subscription, **When** I view company settings, **Then** I see:
   - Current billing method (last 4 digits of card, expiration)
   - Option to update billing method
   - Button to manage subscription (upgrade/downgrade/cancel)
   - Link to billing history and past invoices

4. **Given** I want to upgrade from Consultant to Enterprise, **When** I click "Upgrade Plan", **Then**:
   - I see comparison of features
   - I confirm the new monthly cost
   - Payment is processed (using existing payment method)
   - Subscription tier updates immediately

5. **Given** I access the Admin Dashboard, **When** the page loads, **Then** I see:
   - Company name and subscription tier badge
   - Active team members count
   - Current month's billable hours summary (if applicable)
   - Quick-start checklist progress
   - Recent team activity feed (invitations sent, users joined)

### Edge Cases and Resolutions

**Edge Case 1: Payment Method Failure**

- **Scenario**: During registration, Stripe payment processing fails due to declined card
- **Expected Behavior**: User sees specific error from Stripe (e.g., "Card declined", "Insufficient funds"). User can:
  - Retry with same card
  - Use different payment method
  - Contact Stripe support for assistance
  - Switch to Free tier (if attempting paid tier)
- **Recovery**: Registration data is preserved; user doesn't need to re-enter company information

**Edge Case 2: Duplicate Company Registration**

- **Scenario**: Someone attempts to register a company with same name as existing company
- **Expected Behavior**: System allows (different companies can have same name). Company IDs are unique. Billing emails must be unique to prevent accidental account collisions.

**Edge Case 3: Invitation to Existing User in Same Company**

- **Scenario**: Admin invites user who is already active in the company
- **Expected Behavior**: System detects and prevents duplicate invitation. Admin sees message: "User [email] already active in company" with option to change role instead

**Edge Case 4: Tier Downgrade with Excess Users**

- **Scenario**: Company has 8 Consultant users (allowed), admin downgrades to Free (max 5 users)
- **Expected Behavior**: System prevents downgrade until users are removed. Message: "Cannot downgrade to Free tier with 8 users. Free tier supports max 5 users. Remove users first."

**Edge Case 5: Expired Invitation Acceptance**

- **Scenario**: User receives invitation, waits 8 days, then clicks link
- **Expected Behavior**: Invitation link returns clear message: "Invitation expired on [date]. Contact [admin email] to request new invitation." Admin retains ability to resend invitation.

**Edge Case 6: Email Verification Timeout**

- **Scenario**: Admin creates account but doesn't verify email for 30 days
- **Expected Behavior**: Account remains unverified but functional. Admin can still access dashboard but gets persistent banner: "Please verify your email address [link]" until verified. After 90 days, account can be flagged for reactivation.

**Edge Case 7: Payment During Trial or Renewal**

- **Scenario**: User attempts payment while system is processing renewal billing
- **Expected Behavior**: System detects concurrent payment attempt and prevents duplicate charge. User sees: "Payment currently processing. Please wait and refresh page in 30 seconds."

**Edge Case 8: Stripe Account Disconnection**

- **Scenario**: Stripe API key becomes invalid or Stripe connection drops
- **Expected Behavior**: System logs error. Free tier users unaffected. Paid tier users attempting to upgrade see: "Payment processing temporarily unavailable. Try again in 5 minutes or contact support."

---

## Functional Requirements

### Company Registration & Validation (FR-001 to FR-010)

**FR-001**: System MUST display a company registration form requesting:
- Company name (required, 1-255 characters)
- Billing contact email (required, valid email format)
- Physical address (required, min 10 characters)
- Phone number (required, valid phone format)
- Optional: company description or notes

**FR-002**: System MUST validate all required fields are present and correctly formatted before allowing progression.

**FR-003**: System MUST check for duplicate companies:
- Company name duplicates are allowed (different entities)
- Billing email must be unique (prevent account collision)
- Display appropriate error if billing email already registered

**FR-004**: System MUST offer four subscription tiers during registration:

- **FREE Tier**: No charge, 1 user, 1 project, single PM integration, basic time tracking
- **SMALL_BUSINESS Tier**: No charge, ≤5 users, single company, basic invoicing, team management
- **CONSULTANT Tier**: $29.95/month, unlimited users, multiple PM connections, invoice generation, API access
- **ENTERPRISE Tier**: $59.95/month + $5/user over 25 users, 25 included users, unlimited features, dedicated support, SLA guarantee

**FR-005**: System MUST collect and store company registration data securely (encrypted at rest).

**FR-006**: Landing page MUST display tier comparison before users initiate registration, with clear feature matrix showing:
- User limits per tier
- Supported PM system connections
- Billing features
- Support tier

**FR-007**: System MUST NOT require payment information for FREE or SMALL_BUSINESS tier registrations.

**FR-008**: System MUST require valid payment method for CONSULTANT or ENTERPRISE tier registrations before allowing company activation.

**FR-009**: System MUST provide clear pricing display on the landing page including:
- Monthly recurring charge
- Per-user overage costs (if applicable)
- CTA button that navigates to `/registration?tier=<TIER>` with the tier pre-selected

**FR-010**: Tier is selected on the landing page before registration begins. Users who want to change tier may navigate back to the landing page pricing section.

### Stripe Payment Integration (FR-011 to FR-025)

**FR-011**: System MUST integrate with Stripe API for secure payment processing.

**FR-012**: System MUST collect credit card information via Stripe-hosted form (no raw card data stored locally).

**FR-013**: System MUST validate card information with Stripe before processing payment:
- Card expiration must be in future
- Card must pass Stripe validation checks
- 3D Secure verification (if required by Stripe)

**FR-014**: System MUST process payment using Stripe Payment Intent API:
- Create payment intent with correct amount (tier monthly cost × 1/12 if applicable)
- Handle payment status: requires_payment_method, succeeded, requires_action
- Securely store Stripe Customer ID for recurring billing

**FR-015**: System MUST handle payment processing errors gracefully:
- Card declined: Display "Card declined. Try another payment method."
- Insufficient funds: Display "Card has insufficient funds. Try another method."
- Expired card: Display "Card has expired. Use different card."
- Rate limit: Display "Payment system temporarily busy. Try again in 30 seconds."
- Network error: Display "Payment processing error. Retry or contact support."

**FR-016**: System MUST not charge customer again if payment succeeds but confirmation page fails to load (idempotency key prevents duplicate charges).

**FR-017**: System MUST store Stripe subscription ID for recurring billing and allow:
- Viewing subscription status
- Updating payment method
- Upgrading/downgrading plan
- Canceling subscription

**FR-018**: System MUST calculate prorated charges correctly when changing tiers mid-month:
- Formula: (Days remaining in cycle / Total days in cycle) × New plan monthly price
- Apply credit from previously paid balance if downgrading

**FR-019**: System MUST retry failed recurring charges per Stripe's retry schedule (3 automatic retries over 3 days).

**FR-020**: System MUST generate invoice after successful payment and:
- Email invoice to billing contact email
- Make invoice available in user dashboard
- Store invoice reference (Stripe invoice ID)

**FR-021**: System MUST handle Stripe webhook events:
- customer.subscription.updated: Update local subscription tier/status
- invoice.payment_succeeded: Log successful recurring charge
- invoice.payment_failed: Alert admin of failed payment
- customer.subscription.deleted: Preserve data but mark subscription as cancelled

**FR-022**: System MUST not allow Stripe API key/secret to be exposed in client-side code (server-side only).

**FR-023**: System MUST enable Stripe test mode for development environment with separate test credentials.

**FR-024**: System MUST provide customers with Stripe Customer Portal link to manage subscription and payment method directly.

**FR-025**: System MUST log all payment-related events (success, failure, retry, refund) for audit trail.

### Admin Account Creation (FR-026 to FR-035)

**FR-026**: System MUST display admin account creation form after subscription activation requesting:

- Email address (required, valid format, pre-populated with billing email from step 1, editable)
- Password (required, 12+ characters, must include: uppercase, lowercase, number, special character)
- Optional: first name, last name

**FR-027**: System MUST validate all admin account fields before creation.

**FR-028**: System MUST assign "ADMIN" role automatically to the first user created during registration.

**FR-029**: System MUST send verification email to admin's registered email address within 2 minutes of account creation.

**FR-030**: System MUST require email verification before admin dashboard becomes fully accessible:
- Verification link valid for 24 hours
- User can request new verification link if needed
- Dashboard accessible after verification complete

**FR-031**: System MUST ensure admin account password is securely hashed (bcrypt, 12 salt rounds minimum) and never stored in plaintext.

**FR-032**: System MUST prevent admin from using password that matches email address or common patterns (password123, admin, etc.).

**FR-033**: System MUST associate admin account with company automatically (admin.companyid = newly created company.companyid).

**FR-034**: System MUST allow admin to reset forgotten password via email link sent to registered email address.

**FR-035**: System MUST force password change on first login if password was auto-generated or set by system administrator.

### Admin Dashboard & Company Settings (FR-036 to FR-050)

**FR-036**: System MUST display Admin Dashboard after email verification with sections:
- Company overview (name, subscription tier, renewal date)
- Team summary (active users, pending invitations, user count vs. tier limit)
- Quick-start checklist (Invite members, Configure projects, Set billing rates)
- Recent activity feed (last 10 events: invitations sent, users joined, settings changed)

**FR-037**: System MUST display company settings page allowing admin to view and edit:
- Company name, address, phone number, description
- Billing contact email (with ownership verification if changing)
- Current subscription tier and next renewal date

**FR-038**: System MUST display subscription management section showing:
- Current plan (Free / Consultant / Enterprise)
- Monthly recurring charge (if applicable)
- Current billing period and next renewal date
- "Upgrade", "Downgrade", "Cancel Subscription" buttons (as appropriate)

**FR-039**: System MUST display payment method section showing:
- Last 4 digits and card brand (Visa, Mastercard, etc.)
- Card expiration month/year
- "Update Payment Method" button linked to Stripe customer portal

**FR-040**: System MUST enforce role-based access control on admin settings:
- Only ADMIN users can view/edit company settings, manage subscriptions, manage team members
- MANAGER users can view (read-only) company overview
- DEVELOPER users cannot access admin area

**FR-041**: System MUST store audit log of settings changes including:
- Field changed, old value, new value, timestamp, user email

**FR-042**: System MUST display warning when subscription payment is about to fail (e.g., card expired):
- Show 7-day warning banner in dashboard
- Include link to update payment method
- Send email notification to billing contact 3 days before renewal

**FR-043**: System MUST allow admin to upgrade subscription tier mid-month with immediate effect:
- New tier features become available instantly
- Prorated charge applied to next invoice
- Confirmation sent via email

**FR-044**: System MUST allow admin to downgrade subscription tier with conditions:
- If current user count exceeds new tier limit, prevent downgrade until users removed
- Downgrade effective on next billing cycle
- Confirmation sent via email with refund/credit details (if applicable)

**FR-045**: System MUST allow admin to cancel subscription with conditions:
- Confirmation required (prevents accidental cancellation)
- Access remains until end of current billing period
- Data preserved for compliance and historical access (if needed)
- Confirmation sent via email

**FR-046**: System MUST display company information in consistent location across all pages (dashboard header or sidebar) showing:
- Company name
- Subscription tier badge (Free / Consultant / Enterprise)
- User icon with email
- Logout button

**FR-047**: System MUST enforce subscription tier limits:

- FREE tier: maximum 1 user
- SMALL_BUSINESS tier: maximum 5 users (invitation form blocks 6th user)
- CONSULTANT tier: unlimited users (no hard limit enforced)
- ENTERPRISE tier: 25 included users, unlimited with per-user overage charge

**FR-048**: System MUST provide notification when company approaches user limit:
- FREE tier: notify at 4 users ("4 of 5 users. Upgrade to add more.")
- Provide direct upgrade link

**FR-049**: System MUST disable tier-restricted features for lower tiers:

- FREE tier: single PM connection, 1 project, no invoicing
- SMALL_BUSINESS tier: single company, basic invoicing, no multiple PM connections
- CONSULTANT tier: multiple PM connections, full invoicing, API access; hide advanced reporting
- ENTERPRISE tier: all features enabled

**FR-050**: System MUST track subscription changes in audit log:
- Timestamp, admin email, action (upgrade/downgrade/cancel)
- Previous and new tier
- Reason (if provided by admin)

### Personnel Invitation System (FR-051 to FR-075)

**FR-051**: System MUST display "Invite Team Members" form accessible from Admin Dashboard with fields:
- Email address(es) (single or bulk upload)
- Role selection (ADMIN, MANAGER, DEVELOPER) with role descriptions
- Optional: personalized message

**FR-052**: System MUST validate email addresses before sending invitations:
- Check valid email format
- Prevent duplicate invitations to same email (show warning)
- Prevent invitations to existing company members (show warning)
- Display validation errors clearly

**FR-053**: System MUST support bulk email entry via:
- Comma-separated list pasted directly
- CSV file upload (single column with email addresses, max 50 emails per upload)
- Line-by-line text entry

**FR-054**: System MUST prevent inviting same person to same role twice:
- If user already invited with same role, show: "Invitation already sent to [email]. Send new one?"
- If user invited with different role, show: "User already invited as [previous role]. Update to [new role]?"

**FR-055**: System MUST create invitation record with fields:
- invitation_id (UUID)
- company_id (FK)
- email_address
- invited_role (ADMIN, MANAGER, DEVELOPER)
- created_at (timestamp)
- expires_at (7 days from creation)
- status (PENDING / ACCEPTED / EXPIRED / CANCELLED)
- sender_email (admin who sent invitation)
- personal_message (optional)

**FR-056**: System MUST generate unique invitation link that:
- Contains invitation_id encoded in URL parameter
- Is valid for exactly 7 days from creation
- Expires automatically after 7 days
- Cannot be reused after acceptance

**FR-057**: System MUST send invitation email within 1 minute of creation containing:
- Company name
- Inviter name/email
- Invited user's assigned role with role description
- Personalized message (if provided)
- "Accept Invitation" button/link
- Expiration date ("This invitation expires on [date]")
- Alternative: "Sign in to accept" (for existing wxKanban users)

**FR-058**: System MUST identify whether invitee already has wxKanban account:
- If no account: invitation link leads to account creation flow
- If account exists: invitation link leads to acceptance flow (no password creation)

**FR-059**: System MUST create user account automatically if invitee has no wxKanban account:
- Invitation link leads to "Create Account" page
- Required: password (same validation as admin account)
- Optional: full name
- Upon account creation, user automatically added to company with invited role
- User sees confirmation: "Welcome to [Company Name]!"

**FR-060**: System MUST allow existing wxKanban users to accept invitation with one click:
- Invitation link leads to "Accept Invitation" page
- Shows company name, assigned role, and company admin email
- User clicks "Join Company" to accept
- User can now switch between companies they belong to

**FR-061**: System MUST track invitation acceptance with fields:
- accepted_at (timestamp when invitation accepted)
- user_id (FK to created user)
- status updated to ACCEPTED

**FR-062**: System MUST mark invitations as EXPIRED after 7 days automatically:
- Scheduled job runs daily to mark expired invitations
- Expired invitations cannot be accepted via link
- Admin can view expired invitations and resend if needed

**FR-063**: System MUST allow admin to resend expired or pending invitations:
- New invitation link generated
- New 7-day expiration period starts
- Email resent with same content
- Original invitation marked CANCELLED
- New invitation record created

**FR-064**: System MUST prevent invitations to company-internal email addresses:
- If company domain is configured, accept [email]@[company-domain]
- Prevent external emails for admin role (if policy configured)

**FR-065**: System MUST display Personnel Management table showing all team members and pending invitations:
- Columns: Email, Role, Status (Active / Pending / Expired), Invited On, Accepted On (if applicable), Actions
- Filter by status: All / Active / Pending / Expired
- Search by email
- Sort by any column

**FR-066**: System MUST provide action buttons in Personnel Management:
- **Resend** (for Pending or Expired): Resends invitation with new expiration
- **Remove User** (for Active): Removes user from company (data preserved, user loses access immediately)
- **Change Role** (for Active): Updates user's role in company (effective immediately)
- **Cancel Invitation** (for Pending): Cancels pending invitation (invitee cannot join via link)

**FR-067**: System MUST require confirmation before destructive actions:
- Remove User: "Are you sure? This cannot be undone. User will lose access to all projects."
- Cancel Invitation: "Are you sure? User cannot accept invitation after cancellation. You can resend a new invitation."

**FR-068**: System MUST enforce role-based access to personnel management:
- ADMIN: Can invite users, change roles, remove users, manage all team members
- MANAGER: Cannot access personnel management (read-only view of team members)
- DEVELOPER: Cannot access personnel management

**FR-069**: System MUST prevent last admin from being removed:
- If removing last ADMIN user, show: "Cannot remove last ADMIN user. Assign another user as ADMIN first."
- Allow ADMIN to demote themselves if another ADMIN exists

**FR-070**: System MUST prevent admins from removing themselves:
- Show: "You cannot remove yourself from the company. Contact another admin to remove your access."

**FR-071**: System MUST send notification email to user when:
- They are invited to a company
- Their role is changed
- They are removed from a company

**FR-072**: System MUST allow invited user to view pending invitations before accepting:
- Upon clicking invitation link, user sees company details before confirmation
- User can see assigned role and admin contact before joining

**FR-073**: System MUST track personnel changes in audit log:
- Timestamp, admin email, action (invite, accept, remove, change role)
- User email, role (old and new)
- Reason (if provided)

**FR-074**: System MUST prevent role escalation attacks:
- Users cannot change their own role
- Users cannot create new ADMIN accounts directly
- Role changes only via admin action (logged in audit trail)

**FR-075**: System MUST handle user who is invited while already in company:
- If email already exists in company: Show "User already in company with [role] role"
- Offer to update role instead
- Do not create duplicate user records

### Success Criteria

The following measurable outcomes will indicate successful feature implementation:

1. **Registration Completion Rate**: At least 90% of users who start registration complete it within 1 session
2. **Payment Success Rate**: Stripe payment processing succeeds for 98%+ of valid payment methods
3. **Email Delivery**: 99%+ of verification and invitation emails are delivered within 2 minutes
4. **Invitation Acceptance**: 80%+ of pending invitations are accepted within 7-day window
5. **Tier Enforcement**: 100% of tier-restricted features are properly gated (FREE users cannot access CONSULTANT+ features)
6. **Support Load**: Registration-related support requests <5% of total support volume (indicates good UX)
7. **Admin Dashboard Load Time**: Dashboard loads and displays all content within 2 seconds
8. **Payment Security**: Zero unauthorized access to payment credentials; all PCI compliance requirements met
9. **Audit Trail Completeness**: 100% of registration and subscription events logged with full context
10. **User Limit Enforcement**: 100% accuracy in enforcing per-tier user limits (no over-invitations allowed)

---

## Key Entities

- **Company**: Organization account with billing information, subscription tier, team members, and settings
- **Subscription**: Billing relationship with Stripe, recurring charges, plan tier, renewal dates
- **User**: Individual account (admin, manager, developer) associated with one or more companies
- **Invitation**: Time-limited offer for user to join company, tracks status and role assignment
- **Payment Method**: Stripe-stored credit card or payment source for company billing
- **Admin Dashboard**: Company-level view showing team summary, active projects, quick-start guidance
- **Audit Log**: Record of all registration, subscription, and personnel management events

---

## Assumptions

1. All users have valid email addresses they control and can receive emails at
2. Stripe API is available and stable (99.9%+ uptime)
3. Email delivery service (SendGrid, AWS SES, etc.) is operational and reliable
4. Company names do not require uniqueness (different companies can have identical names)
5. Subscription tiers are fixed and non-negotiable (no custom pricing for initial release)
6. Payment method is always credit card (no ACH, PayPal, or other methods in MVP)
7. Billing is monthly recurring (not annual or other periods)
8. Free tier never expires (no trial period with automatic upgrade)
9. Admin can be removed and role can be transferred to another user
10. Users can belong to multiple companies (separate dashboards per company)
11. Invitation email addresses are case-insensitive for matching
12. All timestamps are in UTC
13. Regulatory compliance (GDPR, CCPA) is handled separately from registration feature

---

## Scope

### In Scope

- Multi-step company registration form with validation
- Four subscription tier options (Free, Small/Medium Business, Consultant, Enterprise)
- Stripe payment integration for paid tiers
- Admin account creation and email verification
- Admin Dashboard with company overview and quick-start checklist
- Company settings management (edit company info, manage subscription)
- Payment method management (view, update)
- Personnel invitation system with email notifications
- Bulk email upload for invitations (CSV support)
- Invitation tracking and expiration
- Role assignment during invitation (Admin, Manager, Developer)
- Personnel management table (view, resend, remove, change role)
- Audit logging of registration and subscription events
- Tier-based feature gating (Free vs. Consultant vs. Enterprise)
- User limit enforcement per tier
- Subscription upgrade/downgrade mid-month
- Prorated billing for tier changes
- Stripe webhook handling for subscription events

### Out of Scope

- Advanced billing (annual plans, custom pricing, volume discounts)
- Multiple payment methods (ACH, PayPal, wire transfer)
- Stripe Connect for marketplace payments
- Custom company branding during registration
- SAML/SSO authentication for company users
- Role-based access control for all features (only registration and admin management in scope)
- Advanced analytics on registration funnel
- A/B testing registration flow
- Multi-language support for registration forms
- Compliance certifications (SOC 2, ISO 27001) - handled separately
- Refund/chargeback processing workflow
- Team hierarchies or approval workflows
- Single sign-on (SSO) for company domains
- Mobile app registration flow
- OAuth2 company creation (Google, Microsoft logins)

---

## Dependencies & Constraints

### External Dependencies

- **Stripe API**: Payment processing, subscription management, webhook events
- **Email Service**: Delivery of verification and invitation emails (SendGrid, AWS SES, Mailgun, etc.)
- **Company Domain DNS**: Optional email domain verification for company-internal invitations

### Technical Constraints

- Stripe API rate limits (100 requests per second)
- Email delivery rate limits (varies by provider, typically 1000-5000 per day)
- Invitation link expiration must be enforced consistently across database and in-memory caches
- Payment processing must be PCI-DSS compliant (no raw card data on servers)

### Business Constraints

- Pricing tiers are fixed during MVP (no negotiations)
- Stripe fees (~2.9% + $0.30 per transaction) are absorbed by company
- Free tier has hard cap of 5 users (prevents abuse)
- Enterprise tier requires negotiation for volume discounts (handled outside system)
- Refunds are handled manually (not automated)
- Subscription cancellation is effective immediately for Free tier, end-of-cycle for paid

### Regulatory Constraints

- GDPR compliance for EU users (data processing agreement, right to deletion)
- CCPA compliance for California users
- PCI-DSS Level 1 compliance for payment processing
- Terms of Service and Privacy Policy (required before registration)

---

## Implementation Notes

### Session 2026-02-19 (continued)

- **DB table**: Admin users stored in `userprofiles` (UUID PK). Variable alias `users` in ORM code maps to `userprofiles` table.
- **usertype field**: `userprofiles.usertype varchar(50)`. Value `"ADMIN"` set automatically on registration.
- **Admin user defaults on registration**: `active = true`, `securitylevel = 7` — set explicitly in `registerCompany` insert and enforced as schema defaults.
- **Tier stored in company**: `companies.billingplan varchar(50)` stores the subscription tier (e.g. `"SMALL_BUSINESS"`). This is the `currenttier` for the company.
- **Registration flow**: Tier is pre-selected on the landing page via `?tier=` URL param. Registration form always starts at Company Info step. No TierSelector step in the form.
  - FREE / SMALL_BUSINESS: Company Info → Admin Credentials
  - CONSULTANT / ENTERPRISE: Company Info → Stripe Payment → Admin Credentials
- **SMALL_BUSINESS tier**: No payment required, status `ACTIVE` immediately, max 5 users.
- **FREE tier**: No payment required, status `ACTIVE` immediately, max 1 user.
- **Tier enum**: `"FREE" | "SMALL_BUSINESS" | "CONSULTANT" | "ENTERPRISE"`
- **Backend registration**: `POST /api/auth/register` with full company + admin payload calls `registerCompany` (creates company record + admin user), then issues JWT via `signToken`. Returns `{success, message, company, admin, nextStep}`.
- **billingEmail**: Required field (both front end and server validation). Admin email field on step 3 pre-populates with billing email entered in step 1.
- **Route file**: `src/server/routes/auth.ts` | **Service**: `src/server/services/RegistrationService.ts`
- **Frontend page**: `src/client/pages/RegistrationPage.tsx` | **Company form**: `src/client/components/CompanyInfoForm.tsx` | **Admin form**: `src/client/components/AdminAccountForm.tsx`
- **Password hashing**: All password operations use bcrypt (12 rounds) via `src/server/lib/password.ts`. `src/server/lib/crypto.ts` contains a PBKDF2 implementation that is NOT used for passwords (only for token encryption). `RegistrationService` and `userService` must both import from `password.ts`.
- **Login API endpoint**: `POST /api/auth/signin` (NOT `/api/auth/login`). Auth routes mounted at `/api/auth` in `src/server/index.ts`.
- **Verification email**: Sent non-blocking after `registerCompany` succeeds in `src/server/routes/auth.ts`. Token stored in `emailverificationtoken` table (requires migration). If table missing, email silently fails but registration succeeds.
- **Dark mode**: All registration/login/dashboard pages use Tailwind `dark:` classes. `darkMode: 'class'` in `tailwind.config.js`. Default is dark — `<html class="dark">` in `index.html`. ThemeProvider sets `dark:` class on `<html>` via `applyTheme()`.
- **Vite port**: Client runs on `http://localhost:5173` (Vite default), NOT port 3000.

---

## Clarifications

### Session 2026-02-17

- Q: Should Free tier have time-limited trial or unlimited duration? → A: Unlimited duration. Free tier never expires. Users can use forever or upgrade anytime.
- Q: Can users belong to multiple companies? → A: Yes. Users can accept invitations to multiple companies and switch between them. Completely isolated dashboards per company.
- Q: What happens if a user is invited to same company twice with different roles? → A: Second invitation updates the role for that email. First invitation is marked cancelled.
- Q: Should registration step require terms of service acceptance? → A: Yes, before final confirmation. Link to full Terms and Privacy Policy required.
- Q: Can Free tier downgrade to even more restricted tier? → A: No. Free is lowest tier. Enterprise can downgrade to Consultant, Consultant to Free.
- Q: Should admin account email be same as billing contact email? → A: Can be different people. System allows separate emails.
- Q: How long should verification link be valid? → A: 24 hours. User can request new link anytime.
- Q: Should system require billing address or only address field? → A: Address field (flexible). Full billing address not strictly required for SaaS.

---

## Resolved Questions

All specification questions have been addressed and incorporated into the functional requirements:

1. **Subscription Tier Structure** [FR-004]: **RESOLVED** - Three tiers with specific user limits and pricing defined
2. **Stripe Integration** [FR-011-FR-025]: **RESOLVED** - Full Stripe API integration for secure payment processing
3. **Admin First User** [FR-028]: **RESOLVED** - First registered user automatically assigned ADMIN role
4. **Email Verification** [FR-030]: **RESOLVED** - 24-hour verification window required before dashboard access
5. **Invitation Expiration** [FR-062]: **RESOLVED** - 7-day validity period with automatic expiration and resend capability
6. **Personnel Management** [FR-065-FR-075]: **RESOLVED** - Complete CRUD operations on team members with audit trail

---
