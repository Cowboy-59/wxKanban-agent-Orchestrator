# Quality Checklist: Registration & Subscription Feature Requirements

**Feature Branch**: `003-registration`
**Last Updated**: 2026-02-17
**Owner**: [Team Lead]

This checklist ensures all functional and non-functional requirements are completed, tested, and validated for the Registration & Subscription Management feature.

---

## Registration Flow Requirements

### Company Information Collection
- [ ] **FR-001**: Registration form displays all required fields (name, email, address, phone)
- [ ] **FR-001**: Form includes optional description field
- [ ] **FR-002**: Email validation prevents invalid format entries
- [ ] **FR-002**: Phone number validation accepts standard formats
- [ ] **FR-002**: Company name field accepts 1-255 characters
- [ ] **FR-002**: Address field requires minimum 10 characters
- [ ] **FR-003**: Duplicate billing email check prevents account collision
- [ ] **FR-003**: Same company name can be registered twice (duplicates allowed)
- [ ] **FR-005**: All company data encrypted at rest (AES-256-GCM)

### Subscription Tier Selection
- [ ] **FR-004**: FREE tier option displayed with "$0/month" pricing
- [ ] **FR-004**: FREE tier clearly limited to "≤5 users"
- [ ] **FR-004**: CONSULTANT tier displays "$19.95/month" pricing
- [ ] **FR-004**: CONSULTANT tier shows "Unlimited users, multiple PM connections"
- [ ] **FR-004**: ENTERPRISE tier displays "$49.95/month + $5/additional user after 25"
- [ ] **FR-004**: ENTERPRISE tier shows "Unlimited features, dedicated support"
- [ ] **FR-006**: Feature comparison matrix available before tier selection
- [ ] **FR-006**: Matrix clearly shows which features available per tier
- [ ] **FR-009**: Pricing displays monthly charge, per-user overage, and first charge amount
- [ ] **FR-009**: Next billing date clearly shown for paid tiers
- [ ] **FR-010**: User can change tier selection during registration without restarting

---

## Stripe Payment Integration

### Payment Collection & Processing
- [ ] **FR-007**: FREE tier registration proceeds without payment form
- [ ] **FR-008**: Paid tier requires Stripe payment form completion
- [ ] **FR-012**: Stripe-hosted form collects card securely (no raw card data stored)
- [ ] **FR-013**: Card expiration validation prevents past-date cards
- [ ] **FR-013**: Card passes Stripe validation checks
- [ ] **FR-013**: 3D Secure verification initiated if required by Stripe
- [ ] **FR-014**: Payment Intent created with correct amount calculated
- [ ] **FR-014**: Stripe Customer ID stored securely for future billing
- [ ] **FR-016**: Idempotency key prevents duplicate charges on retry

### Payment Error Handling
- [ ] **FR-015**: "Card declined" error message displayed for declined cards
- [ ] **FR-015**: "Insufficient funds" error shown when card has no balance
- [ ] **FR-015**: "Card expired" error for expired cards
- [ ] **FR-015**: "Payment processing temporarily busy" shown for rate limits
- [ ] **FR-015**: Network error messages are user-friendly (not technical)
- [ ] **FR-015**: User can retry payment without losing company information
- [ ] **FR-015**: User can select different payment method on error

### Recurring Billing & Subscriptions
- [ ] **FR-017**: Stripe subscription ID stored for recurring charges
- [ ] **FR-017**: Subscription status accessible in company settings
- [ ] **FR-017**: Payment method can be updated via Stripe customer portal
- [ ] **FR-017**: Subscription can be upgraded or downgraded from dashboard
- [ ] **FR-018**: Prorated charges calculated correctly for mid-month upgrades
- [ ] **FR-018**: Credit applied correctly for mid-month downgrades
- [ ] **FR-019**: Failed charges retried per Stripe schedule (3 retries over 3 days)
- [ ] **FR-019**: Admin notified of failed recurring charges via email

### Invoicing & Webhooks
- [ ] **FR-020**: Invoice generated and emailed after successful payment
- [ ] **FR-020**: Invoice stored in customer dashboard
- [ ] **FR-020**: Stripe invoice ID referenced in system for reconciliation
- [ ] **FR-021**: Webhook handler listens for customer.subscription.updated
- [ ] **FR-021**: Webhook handler listens for invoice.payment_succeeded
- [ ] **FR-021**: Webhook handler listens for invoice.payment_failed
- [ ] **FR-021**: Webhook handler listens for customer.subscription.deleted
- [ ] **FR-021**: Subscription state synced with Stripe on webhook event
- [ ] **FR-022**: Stripe API keys not exposed in browser console/network
- [ ] **FR-022**: API keys stored securely in environment variables (server-side only)
- [ ] **FR-023**: Test mode credentials available for development environment
- [ ] **FR-024**: Customer Portal link accessible from company settings
- [ ] **FR-025**: All payment events logged in audit trail with timestamps

---

## Admin Account Creation

### Account Creation & Validation
- [ ] **FR-026**: Admin account form displays email, password, confirm password fields
- [ ] **FR-026**: Optional full name field included
- [ ] **FR-027**: Email validation enforces valid format
- [ ] **FR-027**: Password validation requires 8+ characters
- [ ] **FR-027**: Password requires uppercase letter
- [ ] **FR-027**: Password requires lowercase letter
- [ ] **FR-027**: Password requires numeric digit
- [ ] **FR-027**: Password requires special character
- [ ] **FR-027**: Confirm password must match password field exactly
- [ ] **FR-031**: Password hashed with bcrypt (12 salt rounds minimum)
- [ ] **FR-031**: Password never stored in plaintext (verified in database)
- [ ] **FR-032**: Password cannot match email address
- [ ] **FR-032**: Password "password123", "admin", common patterns rejected

### Email Verification
- [ ] **FR-029**: Verification email sent within 2 minutes of account creation
- [ ] **FR-029**: Email includes verification link
- [ ] **FR-029**: Verification link includes valid token
- [ ] **FR-030**: Verification link valid for 24 hours
- [ ] **FR-030**: Verification link expires after 24 hours (returns error message)
- [ ] **FR-030**: Dashboard partially accessible before verification (read-only mode)
- [ ] **FR-030**: User can request new verification link if expired
- [ ] **FR-034**: Password reset email sent for forgotten passwords
- [ ] **FR-034**: Reset link includes valid token
- [ ] **FR-034**: Reset link valid for 24 hours

### Role Assignment
- [ ] **FR-028**: First user created during registration automatically assigned ADMIN role
- [ ] **FR-033**: Admin account associated with company (admin.company_id = company.company_id)
- [ ] **FR-035**: Password change not forced on first login (unless auto-generated)

---

## Admin Dashboard & Company Settings

### Dashboard Display
- [ ] **FR-036**: Dashboard displays company name
- [ ] **FR-036**: Dashboard displays subscription tier (Free/Consultant/Enterprise)
- [ ] **FR-036**: Dashboard displays team member count
- [ ] **FR-036**: Dashboard displays pending invitation count
- [ ] **FR-036**: Dashboard displays quick-start checklist
- [ ] **FR-036**: Dashboard displays recent activity feed (last 10 events)
- [ ] **FR-046**: Company name visible in dashboard header
- [ ] **FR-046**: Subscription tier badge visible in header
- [ ] **FR-046**: User email and logout button accessible in header

### Company Settings
- [ ] **FR-037**: Company name field editable in settings
- [ ] **FR-037**: Address field editable in settings
- [ ] **FR-037**: Phone number field editable in settings
- [ ] **FR-037**: Description field editable in settings
- [ ] **FR-037**: Billing contact email editable in settings
- [ ] **FR-037**: All changes saved immediately upon click
- [ ] **FR-037**: Confirmation message shown after successful edit
- [ ] **FR-037**: Changes persisted in database

### Subscription Management
- [ ] **FR-038**: Current subscription tier displayed in settings
- [ ] **FR-038**: Next renewal date clearly shown
- [ ] **FR-038**: Monthly recurring charge displayed
- [ ] **FR-039**: Last 4 digits of credit card shown
- [ ] **FR-039**: Card brand displayed (Visa, Mastercard, etc.)
- [ ] **FR-039**: Card expiration date shown
- [ ] **FR-039**: "Update Payment Method" button links to Stripe portal
- [ ] **FR-042**: Payment failure warning displayed 7 days before renewal
- [ ] **FR-042**: Email notification sent 3 days before renewal
- [ ] **FR-043**: Upgrade button available in subscription section
- [ ] **FR-043**: Upgrade shows feature comparison
- [ ] **FR-043**: Upgrade shows new monthly cost
- [ ] **FR-043**: Upgrade immediately activates new tier (no delay)
- [ ] **FR-043**: Confirmation email sent after upgrade
- [ ] **FR-044**: Downgrade button available in subscription section
- [ ] **FR-044**: Downgrade prevents if user count exceeds new tier limit
- [ ] **FR-044**: Downgrade effective on next billing cycle (not immediately)
- [ ] **FR-044**: Confirmation email sent after downgrade with refund details
- [ ] **FR-045**: Cancel button available in subscription section
- [ ] **FR-045**: Cancellation requires confirmation (prevents accidents)
- [ ] **FR-045**: Access remains until end of current billing period
- [ ] **FR-045**: Confirmation email sent after cancellation

### Access Control & Tier Enforcement
- [ ] **FR-040**: Only ADMIN users can access company settings
- [ ] **FR-040**: MANAGER users cannot access settings (view only)
- [ ] **FR-040**: DEVELOPER users cannot access settings
- [ ] **FR-041**: Settings changes logged in audit trail
- [ ] **FR-047**: FREE tier allows maximum 5 users (enforced)
- [ ] **FR-047**: CONSULTANT tier allows unlimited users
- [ ] **FR-047**: ENTERPRISE tier allows unlimited users
- [ ] **FR-048**: Notification shown at 4 users (FREE tier)
- [ ] **FR-048**: Upgrade link provided in user limit warning
- [ ] **FR-049**: FREE tier cannot access multiple PM connections feature
- [ ] **FR-049**: CONSULTANT tier can access multiple PM connections
- [ ] **FR-049**: ENTERPRISE tier can access all features
- [ ] **FR-050**: Audit log records tier changes with admin email
- [ ] **FR-050**: Audit log records previous and new tier
- [ ] **FR-050**: Audit log includes timestamp

---

## Personnel Invitation System

### Invitation Form & Validation
- [ ] **FR-051**: "Invite Team Members" form accessible from Admin Dashboard
- [ ] **FR-051**: Form includes email address field
- [ ] **FR-051**: Form includes role selection (ADMIN, MANAGER, DEVELOPER)
- [ ] **FR-051**: Form includes optional message field
- [ ] **FR-051**: Role descriptions displayed with each option
- [ ] **FR-052**: Email validation checks for valid format
- [ ] **FR-052**: Duplicate invitation detection prevents sending twice to same email
- [ ] **FR-052**: Existing member detection prevents re-inviting active users
- [ ] **FR-052**: Validation errors displayed clearly with specific reasons
- [ ] **FR-053**: Comma-separated email list accepted and parsed correctly
- [ ] **FR-053**: CSV file upload supported (single column format)
- [ ] **FR-053**: CSV upload limited to 50 emails maximum
- [ ] **FR-053**: Line-by-line text entry supported

### Invitation Creation & Email
- [ ] **FR-055**: Invitation record created with all required fields
- [ ] **FR-055**: invitation_id generated as UUID
- [ ] **FR-055**: created_at timestamp recorded
- [ ] **FR-055**: expires_at set to 7 days from creation
- [ ] **FR-055**: status initialized as PENDING
- [ ] **FR-055**: sender_email recorded (inviting admin)
- [ ] **FR-056**: Unique invitation link generated (contains invitation_id)
- [ ] **FR-056**: Link valid for exactly 7 days
- [ ] **FR-056**: Link expires automatically after 7 days
- [ ] **FR-056**: Link cannot be reused after acceptance
- [ ] **FR-057**: Invitation email sent within 1 minute of creation
- [ ] **FR-057**: Email includes company name
- [ ] **FR-057**: Email includes inviter name/email
- [ ] **FR-057**: Email includes invited role and description
- [ ] **FR-057**: Email includes personalized message (if provided)
- [ ] **FR-057**: Email includes expiration date
- [ ] **FR-057**: Email includes "Accept Invitation" button/link

### Invitation Acceptance
- [ ] **FR-058**: System detects if invitee has existing wxKanban account
- [ ] **FR-058**: If no account: invitation link leads to account creation flow
- [ ] **FR-058**: If account exists: invitation link leads to acceptance flow
- [ ] **FR-059**: Account creation page requested password
- [ ] **FR-059**: Account creation form uses same password validation as admin
- [ ] **FR-059**: Optional full name field included in creation form
- [ ] **FR-059**: Upon account creation, user automatically added to company
- [ ] **FR-059**: New user assigned invited role (not admin by default)
- [ ] **FR-059**: Confirmation message shown: "Welcome to [Company Name]!"
- [ ] **FR-060**: Existing users see "Accept Invitation" page
- [ ] **FR-060**: Page shows company name and assigned role
- [ ] **FR-060**: Page shows company admin email contact
- [ ] **FR-060**: "Join Company" button adds user to company
- [ ] **FR-060**: User can now switch between companies they belong to

### Invitation Management
- [ ] **FR-061**: Acceptance timestamp recorded (accepted_at)
- [ ] **FR-061**: User ID stored after acceptance (user_id FK)
- [ ] **FR-061**: Status updated to ACCEPTED
- [ ] **FR-062**: Expired invitations marked daily by scheduled job
- [ ] **FR-062**: Expired invitations cannot be accepted via link
- [ ] **FR-062**: Admin can view expired invitations in Personnel Management
- [ ] **FR-063**: Resend option available for pending/expired invitations
- [ ] **FR-063**: Resend generates new invitation link (new 7-day window)
- [ ] **FR-063**: Original invitation marked CANCELLED
- [ ] **FR-063**: New invitation record created
- [ ] **FR-063**: Email resent with same content

### Personnel Management Table
- [ ] **FR-065**: Table displays all team members with columns: Email, Role, Status, Invited On, Accepted On
- [ ] **FR-065**: Status filter available: All, Active, Pending, Expired
- [ ] **FR-065**: Search by email implemented
- [ ] **FR-065**: Sorting available on all columns
- [ ] **FR-066**: "Resend" button available for Pending/Expired invitations
- [ ] **FR-066**: "Remove User" button available for Active members
- [ ] **FR-066**: "Change Role" button available for Active members
- [ ] **FR-066**: "Cancel Invitation" button available for Pending invitations
- [ ] **FR-067**: Confirmation dialog shown before Remove User action
- [ ] **FR-067**: Confirmation dialog shown before Cancel Invitation action
- [ ] **FR-067**: Destructive action warnings are clear and specific

### Role-Based Access Control
- [ ] **FR-068**: ADMIN users can access Personnel Management
- [ ] **FR-068**: MANAGER users cannot access Personnel Management
- [ ] **FR-068**: DEVELOPER users cannot access Personnel Management
- [ ] **FR-069**: System prevents removing last ADMIN user
- [ ] **FR-069**: Error message shown: "Cannot remove last ADMIN user"
- [ ] **FR-069**: ADMIN user can demote themselves if another ADMIN exists
- [ ] **FR-070**: Admins cannot remove themselves via Remove User
- [ ] **FR-070**: Error message shown: "You cannot remove yourself"

### Notifications & Audit Trail
- [ ] **FR-071**: Email sent to user when invited
- [ ] **FR-071**: Email sent to user when role changed
- [ ] **FR-071**: Email sent to user when removed from company
- [ ] **FR-072**: Invitation link shows company details before confirmation
- [ ] **FR-072**: User can view assigned role before accepting
- [ ] **FR-073**: Audit log records invitation creation
- [ ] **FR-073**: Audit log records acceptance
- [ ] **FR-073**: Audit log records role changes
- [ ] **FR-073**: Audit log records removals
- [ ] **FR-073**: Audit log includes timestamp, admin email, action
- [ ] **FR-074**: Users cannot change their own roles
- [ ] **FR-074**: Users cannot create new ADMIN accounts directly
- [ ] **FR-074**: Users cannot escalate privileges via any method
- [ ] **FR-075**: Duplicate invitations handled correctly (no duplicate users)
- [ ] **FR-075**: Email already in company shows "User already in company" message
- [ ] **FR-075**: Option to update role instead of inviting again

---

## Success Criteria

### Performance & Reliability
- [ ] Registration completion rate ≥ 90% for users who start process
- [ ] Payment success rate ≥ 98% for valid payment methods
- [ ] Email delivery success ≥ 99% within 2 minutes
- [ ] Invitation acceptance rate ≥ 80% within 7-day window
- [ ] Admin Dashboard loads in ≤ 2 seconds
- [ ] Invitation email delivery ≥ 99%

### Functional Correctness
- [ ] Tier-restricted features 100% properly gated (FREE cannot access CONSULTANT+ features)
- [ ] User limit enforcement 100% accurate (no over-invitations allowed)
- [ ] Payment handling has zero unauthorized access to credentials
- [ ] All PCI-DSS compliance requirements met
- [ ] Audit trail 100% complete for all registration/subscription events

### User Experience
- [ ] Registration-related support requests < 5% of total support volume
- [ ] New users successfully create company and invite first team member without assistance
- [ ] Tier comparison clearly understood (measured via user surveys)
- [ ] Error messages are helpful and actionable (not technical jargon)

---

## Testing Requirements

### Unit Tests
- [ ] Company registration validation logic
- [ ] Stripe payment processing logic
- [ ] Email notification sending logic
- [ ] Invitation expiration calculation
- [ ] Role-based access control logic
- [ ] Tier limit enforcement logic
- [ ] Audit log recording logic

### Integration Tests
- [ ] End-to-end registration flow (FREE tier)
- [ ] End-to-end registration flow (CONSULTANT tier with payment)
- [ ] End-to-end registration flow (ENTERPRISE tier with payment)
- [ ] Payment processing with successful charge
- [ ] Payment processing with declined card
- [ ] Email verification flow
- [ ] Invitation creation and acceptance
- [ ] Stripe webhook handling
- [ ] Subscription upgrade/downgrade flow
- [ ] Personnel management CRUD operations

### Security Tests
- [ ] XSS prevention on all input fields
- [ ] SQL injection prevention (parameterized queries)
- [ ] CSRF token validation on form submissions
- [ ] Rate limiting on payment attempts (prevent brute force)
- [ ] Stripe API key not exposed in client-side code
- [ ] Password hashing verified (bcrypt, not plaintext)
- [ ] Authorization checks on admin-only endpoints
- [ ] Invitation link tokens validated and expired correctly

### UAT Scenarios
- [ ] New business owner completes full registration with paid tier
- [ ] Admin invites 5 team members (bulk CSV upload)
- [ ] Team member accepts invitation and joins company
- [ ] Admin upgrades from FREE to CONSULTANT tier
- [ ] Admin views personnel management and changes a role
- [ ] Payment method update via Stripe customer portal
- [ ] Subscription renewal processed successfully

---

## Documentation

- [ ] User Guide: How to register company
- [ ] User Guide: How to invite team members
- [ ] User Guide: How to manage subscription
- [ ] Administrator Guide: Payment troubleshooting
- [ ] Technical Documentation: Stripe integration architecture
- [ ] Technical Documentation: Invitation link token generation
- [ ] API Documentation: Registration endpoints
- [ ] API Documentation: Subscription management endpoints

---

## Sign-Off

- [ ] Product Owner Review & Approval
- [ ] Quality Assurance Lead Review & Approval
- [ ] Security Review & Approval (payment processing, data handling)
- [ ] Customer Support Review & Approval (documentation, error messages)

**Approved By**: [Name] | **Date**: [Date]

**Implemented By**: [Team] | **Completion Date**: [Date]

---
