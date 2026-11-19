# Parallel Task Breakdown: Landing Page → Registration → Dashboard
## All 3 Pieces, Parallel Execution

**Created**: 2026-02-18
**Approach**: Parallel development with minimal cross-team dependencies
**Duration**: ~5 weeks
**Team Capacity**: 3 parallel workstreams

---

## EXECUTION MODEL

```
WEEK 1: Foundation (All 3 Streams)
  Stream A: Landing Page UI
  Stream B: Registration APIs
  Stream C: Dashboard Core

WEEK 2: Integration (All 3 Streams)
  Stream A: Theme System + Polish
  Stream B: Email Verification
  Stream C: Team Management APIs

WEEK 3: Features (All 3 Streams)
  Stream A: Testing + Optimization
  Stream B: Personnel Invitations
  Stream C: Dashboard UI

WEEK 4+: Integration & Polish (Cross-stream)
  - End-to-end flows
  - Testing
  - Optimization
```

---

# STREAM A: LANDING PAGE (Weeks 1-3)

## A1: Theme System Foundation (Week 1)

### A1.1 Create Theme Utilities
**File**: `src/client/lib/themePreference.ts`
**Complexity**: Low
**Time**: 1-2 hours
**Status**: Ready to start

```typescript
// Export functions:
- getSystemTheme(): 'light' | 'dark'
- getStoredTheme(): 'light' | 'dark' | null
- saveTheme(theme: 'light' | 'dark'): void
- initializeTheme(): 'light' | 'dark'
```

**Acceptance Criteria:**
- ✅ Gets system preference via `prefers-color-scheme` media query
- ✅ Reads stored preference from localStorage
- ✅ Initializes to system preference on first visit
- ✅ Persists user selection to localStorage
- ✅ No TypeScript errors

**Dependencies**: None

---

### A1.2 Create ThemeProvider Context
**File**: `src/client/components/ThemeProvider.tsx`
**Complexity**: Medium
**Time**: 2-3 hours
**Status**: Ready to start

```typescript
// Export:
- ThemeProvider (React Context Provider)
- useTheme() hook returning { theme, toggleTheme }
- Apply theme to document root (data-theme attribute or <html class>)
```

**Acceptance Criteria:**
- ✅ React Context provides theme to all children
- ✅ Custom hook `useTheme()` works correctly
- ✅ Theme applies to `<html>` or `<body>` element
- ✅ Theme persists across page reloads
- ✅ No prop drilling needed in components

**Dependencies**: A1.1 (Theme utilities)

---

### A1.3 Create ThemeToggle Component
**File**: `src/client/components/ThemeToggle.tsx`
**Complexity**: Low
**Time**: 1-2 hours
**Status**: Ready to start

```typescript
// Simple button component with sun/moon icon
// Calls toggleTheme() on click
// Shows current theme visually
```

**Acceptance Criteria:**
- ✅ Button toggles between light/dark
- ✅ Icon changes (sun ↔ moon)
- ✅ Switches instantly (no page reload)
- ✅ 44px+ touch target on mobile
- ✅ Tooltip explaining "Toggle theme"

**Dependencies**: A1.2 (ThemeProvider)

---

### A1.4 Apply Theme to Existing Public Pages
**Files**:
- `src/client/pages/LoginPage.tsx`
- `src/client/pages/RegistrationPage.tsx`
- `src/client/pages/VerificationPage.tsx`

**Complexity**: Medium
**Time**: 2-3 hours
**Status**: Ready to start

**Changes:**
- Wrap in `ThemeProvider` at App.tsx level
- Add `ThemeToggle` to page headers
- Test theme switching on all pages

**Acceptance Criteria:**
- ✅ All 4 pages render in light and dark mode
- ✅ Contrast ratios meet WCAG 2.1 AA (4.5:1)
- ✅ Theme persists when navigating between pages
- ✅ No visual glitches or unthemed elements

**Dependencies**: A1.2, A1.3

---

## A2: Landing Page Components (Week 1-2)

### A2.1 Create HeroSection Component
**File**: `src/client/components/LandingPage/HeroSection.tsx`
**Complexity**: Medium
**Time**: 3-4 hours
**Status**: Ready to start

```typescript
// Displays:
- Background image (data center, optimized)
- Hero headline: "wxKanban is a full project management system..."
- Subheadline
- CTA buttons: "Start Free" + "Learn More"
- SOC2/HITRUST badges overlay
```

**Acceptance Criteria:**
- ✅ Background image optimized (< 200KB, responsive srcset)
- ✅ Headline and subheadline readable (contrast 4.5:1+)
- ✅ CTA buttons prominent and clickable
- ✅ SOC2/HITRUST badges visible and clear
- ✅ Mobile responsive (no horizontal scroll, text readable)
- ✅ Image loads without blocking text
- ✅ Badges have alt text for accessibility

**Dependencies**: A1.2 (ThemeProvider for theming)

---

### A2.2 Create FeaturesList Component
**File**: `src/client/components/LandingPage/FeaturesList.tsx`
**Complexity**: Low
**Time**: 1-2 hours
**Status**: Ready to start

```typescript
// Display 5-6 features as cards:
- AI-Powered (task suggestions, optimization)
- Secure (SOC2, HITRUST, GDPR)
- Integrated (Jira, Monday, Asana, Trello)
- Time Tracking (billable hours, invoicing)
- Collaborative (team management)
- 6-Phase Lifecycle (quality methodology)

// Each card: Icon + heading + description
```

**Acceptance Criteria:**
- ✅ 6 feature cards displayed in grid
- ✅ Icons match features
- ✅ Text clear and concise
- ✅ Mobile: cards stack vertically
- ✅ Desktop: 3 columns or 2x3 grid
- ✅ Dark/light mode support

**Dependencies**: A1.2 (ThemeProvider)

---

### A2.3 Create PricingTiers Component
**File**: `src/client/components/LandingPage/PricingTiers.tsx`
**Complexity**: Medium
**Time**: 3-4 hours
**Status**: Ready to start

```typescript
// Display 4 tier cards:
1. FREE ($0, 1-3 users)
2. SMALL/MED ⭐ ($0, 5 users, "Most Popular" badge)
3. CONSULTANT ($19.95/person, unlimited)
4. ENTERPRISE ($59.95 + $5/user, 25+ users)

// Each card:
- Price display
- User limit
- Feature list (checkmarks)
- Action buttons: "Start Free" or "Register"
```

**Acceptance Criteria:**
- ✅ All 4 tiers displayed with correct pricing
- ✅ Small/Med has "Most Popular" badge
- ✅ Feature lists match spec (FR-004)
- ✅ Buttons route to `/registration?tier=X`
- ✅ Mobile: stack vertically, tappable buttons (44px+)
- ✅ Desktop: 4 columns or 2x2 grid
- ✅ Hover effects on desktop

**Dependencies**: A1.2 (ThemeProvider)

---

### A2.4 Create ComplianceSection Component
**File**: `src/client/components/LandingPage/ComplianceSection.tsx`
**Complexity**: Low
**Time**: 1-2 hours
**Status**: Ready to start

```typescript
// Display trust signals:
- SOC2 badge + "Enterprise-grade security"
- HITRUST badge + "Healthcare compliant"
- GDPR badge + "Privacy compliant"
- Brief paragraph about compliance
```

**Acceptance Criteria:**
- ✅ 3 badges displayed clearly
- ✅ Badges have alt text
- ✅ Compliance messaging clear
- ✅ Mobile responsive
- ✅ Dark/light mode support

**Dependencies**: A1.2 (ThemeProvider)

---

### A2.5 Create HowBuilt Modal Component
**File**: `src/client/components/LandingPage/HowBuiltModal.tsx`
**Complexity**: Medium
**Time**: 2-3 hours
**Status**: Ready to start

```typescript
// Modal dialog showing 6-phase lifecycle:
1. Design/Plan/Clarify → Create tasks
2. Coding/Implementation
3. QA Testing (SOC2/HITRUST)
4. User Testing with feedback
5. Beta Release with feedback
6. Release

// Display as timeline or card flow
// Include brief description of each phase
```

**Acceptance Criteria:**
- ✅ Modal opens from hero "click HERE" link
- ✅ 6 phases clearly displayed
- ✅ Descriptions match overvirew.md
- ✅ Close button (X) works
- ✅ Mobile scrollable if needed
- ✅ Dark/light mode support

**Dependencies**: A1.2 (ThemeProvider)

---

## A3: LandingPage Main Component (Week 2)

### A3.1 Create LandingPage.tsx
**File**: `src/client/pages/LandingPage.tsx`
**Complexity**: Low
**Time**: 2-3 hours
**Status**: Depends on A2.1-A2.5

```typescript
// Assemble all components:
- Header (nav links, Login/Register, ThemeToggle)
- HeroSection
- FeaturesList
- PricingTiers
- ComplianceSection
- Footer (links, social, legal)

// Route handling:
- If authenticated, redirect to /dashboard
- Tier button clicks navigate to /registration?tier=X
```

**Acceptance Criteria:**
- ✅ All sections visible, proper spacing
- ✅ Responsive on mobile/tablet/desktop
- ✅ Authenticated users redirected
- ✅ Tier selection passes to registration
- ✅ Scroll-to-section navigation works
- ✅ Dark/light mode works throughout

**Dependencies**: A2.1-A2.5 (All components)

---

## A4: Testing & Optimization (Week 3)

### A4.1 Unit Tests for Theme System
**File**: `src/client/__tests__/themePreference.test.ts`
**Complexity**: Low
**Time**: 1-2 hours
**Status**: Depends on A1.1

```typescript
// Test:
- getSystemTheme() returns correct preference
- localStorage read/write works
- initializeTheme() respects stored preference
- Theme toggle in ThemeProvider works
```

**Acceptance Criteria:**
- ✅ All functions tested
- ✅ localStorage mocked correctly
- ✅ prefers-color-scheme mocked
- ✅ 100% code coverage

**Dependencies**: A1.1, A1.2

---

### A4.2 E2E Tests - Landing Page Journey
**File**: `tests/e2e/landing-page.spec.ts` (Playwright)
**Complexity**: Medium
**Time**: 3-4 hours
**Status**: Depends on A3.1

```typescript
// Test scenarios:
1. Visit landing page, see all sections
2. Select tier, navigate to /registration?tier=X
3. Toggle theme, refresh, theme persists
4. Mobile responsive (375px viewport)
5. Authenticated user redirects to /dashboard
6. Click "How Built", see modal with 6 phases
7. All buttons clickable, CTAs work
```

**Acceptance Criteria:**
- ✅ All scenarios pass
- ✅ Tests run in CI/CD
- ✅ No flaky tests
- ✅ Mobile viewport tested

**Dependencies**: A3.1, A1.4

---

### A4.3 Accessibility Audit
**Checklist**: `project-documentation/A11Y_CHECKLIST.md`
**Complexity**: Low
**Time**: 2-3 hours
**Status**: Depends on A3.1

**Review:**
- ✅ Heading hierarchy (h1 → h2 → h3)
- ✅ Alt text on images
- ✅ Contrast ratios (4.5:1 for normal, 3:1 for large)
- ✅ Keyboard navigation (Tab key works)
- ✅ Form labels associated
- ✅ Color not only indicator

**Acceptance Criteria:**
- ✅ WCAG 2.1 Level AA pass
- ✅ Lighthouse accessibility score 90+
- ✅ Screen reader tested (NVDA/JAWS)

**Dependencies**: A3.1

---

### A4.4 Performance Optimization
**Tasks**:
- Hero image optimization (WebP, srcset, lazy loading)
- Bundle analysis
- Core Web Vitals check
- Lighthouse audit

**Complexity**: Medium
**Time**: 2-3 hours
**Status**: Depends on A3.1

**Acceptance Criteria:**
- ✅ LCP < 3 seconds
- ✅ CLS < 0.1
- ✅ FID < 100ms
- ✅ Lighthouse score 90+

---

---

# STREAM B: REGISTRATION (Weeks 1-3)

## B1: Registration API Enhancements (Week 1)

### B1.1 Add Email Verification Endpoint
**File**: `src/server/routes/auth.ts` (add to existing)
**Complexity**: Medium
**Time**: 2-3 hours
**Status**: Ready to start

```typescript
// Endpoint: POST /api/auth/send-verification-email
// Body: { email: string }
// Returns: { success: boolean, message: string }

// Functionality:
- Generate JWT token (24-hour expiry)
- Send email with verification link
- Token stored securely (can't be plain JWT, use hash)
```

**Acceptance Criteria:**
- ✅ Verification email sent to user email
- ✅ Email arrives within 2 minutes
- ✅ Email contains clickable verification link
- ✅ Token valid for exactly 24 hours
- ✅ Resend capability works

**Dependencies**: None (uses existing email service)

---

### B1.2 Add Email Verification Handler Endpoint
**File**: `src/server/routes/auth.ts`
**Complexity**: Medium
**Time**: 2-3 hours
**Status**: Ready to start

```typescript
// Endpoint: GET /api/auth/verify-email?token=X
// Returns: { success: boolean, message: string }

// Functionality:
- Decode token
- Check expiry
- Update user.emailverified = true
- Clear token from database
```

**Acceptance Criteria:**
- ✅ Valid token → user email verified
- ✅ Expired token → error message
- ✅ Invalid token → error message
- ✅ User cannot log in until verified
- ✅ Dashboard shows verification banner if not verified

**Dependencies**: B1.1

---

### B1.3 Update Registration Success Flow
**File**: `src/server/services/RegistrationService.ts`
**Complexity**: Low
**Time**: 1-2 hours
**Status**: Ready to start

```typescript
// After registration complete:
- Send verification email automatically
- Mark user.emailverified = false
- Do NOT create session yet (require verification first)
```

**Acceptance Criteria:**
- ✅ Registration response says "check email to verify"
- ✅ Verification email sent automatically
- ✅ User cannot access dashboard until verified

**Dependencies**: B1.1

---

### B1.4 Add Tier Pre-Selection Support to Registration
**File**: `src/server/routes/auth.ts` (registration endpoint)
**Complexity**: Low
**Time**: 1 hour
**Status**: Ready to start

```typescript
// Endpoint: POST /api/auth/register
// Query param: ?tier=CONSULTANT (optional)

// Functionality:
- Read tier parameter if present
- Pre-fill subscription_tier in request body
- Validate tier matches allowed values
```

**Acceptance Criteria:**
- ✅ Accepts ?tier=FREE|CONSULTANT|ENTERPRISE
- ✅ Validates tier value
- ✅ Defaults to FREE if not provided
- ✅ Pre-selects tier in RegistrationPage form

**Dependencies**: None

---

## B2: Stripe Webhook Integration (Week 1-2)

### B2.1 Implement Stripe Webhook Endpoint
**File**: `src/server/routes/webhooks.ts` (new file)
**Complexity**: Medium-High
**Time**: 3-4 hours
**Status**: Ready to start

```typescript
// Endpoint: POST /api/webhooks/stripe
// Events to handle:
- customer.subscription.updated → Update local subscription
- invoice.payment_succeeded → Log successful charge
- invoice.payment_failed → Alert admin
- customer.subscription.deleted → Mark cancelled

// Functionality:
- Verify webhook signature (Stripe secret)
- Parse event data
- Update database
- Log events
```

**Acceptance Criteria:**
- ✅ Webhook signature verified
- ✅ All events handled correctly
- ✅ Database updated in real-time
- ✅ Logging complete
- ✅ Tested with Stripe CLI

**Dependencies**: None (existing Stripe setup)

---

### B2.2 Update RegistrationService to Create Stripe Subscription
**File**: `src/server/services/RegistrationService.ts`
**Complexity**: Medium
**Time**: 2-3 hours
**Status**: Ready to start

**Changes:**
- After successful payment, create Stripe subscription
- Store subscription ID in companies table
- Handle subscription creation errors

**Acceptance Criteria:**
- ✅ Subscription created in Stripe for paid tiers
- ✅ Subscription ID stored in database
- ✅ Billing cycle starts correctly
- ✅ Errors handled gracefully

**Dependencies**: B2.1 (webhook handling)

---

## B3: Personnel/Team Invitation System (Week 2-3)

### B3.1 Create Invitation Database Schema
**File**: `src/db/schema/userinvitation.ts`
**Complexity**: Low
**Time**: 1-2 hours
**Status**: Ready to start

**Schema:**
```typescript
interface UserInvitation {
  id: uuid
  company_id: uuid (FK)
  email: string
  role: 'ADMIN' | 'MANAGER' | 'DEVELOPER'
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'CANCELLED'
  created_at: timestamp
  expires_at: timestamp (7 days from creation)
  accepted_at?: timestamp
  sender_user_id: uuid (FK to user who sent)
  personal_message?: string
}
```

**Acceptance Criteria:**
- ✅ Schema matches spec (FR-055)
- ✅ Indexes on (company_id, email, status)
- ✅ Timestamps in UTC
- ✅ Constraints prevent duplicates

**Dependencies**: None

---

### B3.2 Create Invitation API Endpoint
**File**: `src/server/routes/invitations.ts` (new file)
**Complexity**: Medium-High
**Time**: 4-5 hours
**Status**: Depends on B3.1

```typescript
// Endpoints:

// POST /api/invitations/send
// Body: { emails: string[], role: 'ADMIN'|'MANAGER'|'DEVELOPER', message?: string }
// Returns: { success, invited: email[], errors: { email, reason }[] }

// POST /api/invitations/send-bulk
// Body: CSV file upload (max 50 emails)
// Returns: { success, invited, errors }

// GET /api/invitations/pending
// Returns: array of pending invitations for company

// POST /api/invitations/:id/resend
// Sends new invitation link

// POST /api/invitations/:id/cancel
// Cancels pending invitation
```

**Acceptance Criteria:**
- ✅ Single email invitation works
- ✅ Bulk CSV upload works (50 max)
- ✅ Duplicate prevention (shows warning)
- ✅ Emails sent within 1 minute
- ✅ 7-day expiration set
- ✅ Resend generates new token
- ✅ Cancel prevents acceptance

**Dependencies**: B3.1

---

### B3.3 Create Invitation Email Template
**File**: `src/server/templates/invitation-email.html`
**Complexity**: Low
**Time**: 1-2 hours
**Status**: Ready to start

**Template includes:**
- Company name
- Inviter name
- Invited role with description
- Personal message (if provided)
- "Accept Invitation" button with link
- Expiration date
- Alternative sign-in instructions

**Acceptance Criteria:**
- ✅ Email renders correctly in Gmail, Outlook
- ✅ Link works (invitation-id encoded)
- ✅ Branding consistent (wxKanban logo)
- ✅ Mobile-friendly

**Dependencies**: None

---

### B3.4 Create Invitation Acceptance Flow
**File**: `src/server/routes/invitations.ts` + `src/client/pages/AcceptInvitationPage.tsx`
**Complexity**: Medium
**Time**: 3-4 hours
**Status**: Depends on B3.2

**Backend:**
```typescript
// GET /api/invitations/:token/details
// Returns: { company_name, role, inviter_email, expires_at }

// POST /api/invitations/:token/accept
// Creates user account (if new) or adds to company (if existing)
// Returns: { success, user_id, company_id }
```

**Frontend:**
```typescript
// Page: /accept-invitation/:token
// Shows: Company name, role, inviter
// Button: "Create Account" or "Join Company"
// Form: password (if new user), or just confirmation (if existing)
```

**Acceptance Criteria:**
- ✅ New user → create account, auto-join company
- ✅ Existing user → confirm, auto-join company
- ✅ Expired invitation → error message
- ✅ Already joined → message says "already in company"
- ✅ User redirected to dashboard after acceptance

**Dependencies**: B3.2, B3.3

---

### B3.5 Implement Invitation Expiration Job
**File**: `src/server/jobs/expire-invitations.ts` (new file)
**Complexity**: Low
**Time**: 1-2 hours
**Status**: Depends on B3.1

**Job:**
- Runs daily at midnight UTC
- Marks invitations with `expires_at < now()` as EXPIRED
- Logs expired invitations

**Acceptance Criteria:**
- ✅ Job runs automatically
- ✅ Status updated to EXPIRED
- ✅ Expired links no longer work
- ✅ Admin can still resend

**Dependencies**: B3.1

---

## B4: Registration UI Updates (Week 2-3)

### B4.1 Update RegistrationPage Component
**File**: `src/client/pages/RegistrationPage.tsx`
**Complexity**: Low
**Time**: 1-2 hours
**Status**: Depends on B1.4

**Changes:**
- Read `?tier=X` query parameter
- Auto-select tier in TierSelector if present
- Add verification message to success screen

**Acceptance Criteria:**
- ✅ Query param `?tier=CONSULTANT` pre-selects Consultant
- ✅ Invalid tier param ignored (defaults to FREE)
- ✅ Success screen says "verify email"
- ✅ Verification link in email works

**Dependencies**: B1.1, B1.2, B4.1

---

### B4.2 Create Verification Page Component
**File**: `src/client/pages/VerificationPage.tsx`
**Complexity**: Medium
**Time**: 2-3 hours
**Status**: Depends on B1.2

```typescript
// Page loads from email link: /verify-email?token=X

// Shows:
- "Verifying your email..." (while processing)
- Success: "Email verified! Redirecting to dashboard..."
- Error: "Verification failed. [Resend link]?"

// Auto-redirects to dashboard or login on success
```

**Acceptance Criteria:**
- ✅ Processes token from URL
- ✅ Shows loading state
- ✅ Success page displays
- ✅ Redirects to dashboard after 2 seconds
- ✅ Error handling clear
- ✅ Resend link option

**Dependencies**: B1.2

---

## B5: Testing (Week 3)

### B5.1 Integration Tests - Full Registration Flow
**File**: `tests/integration/registration-complete.test.ts`
**Complexity**: High
**Time**: 4-5 hours
**Status**: Depends on B1, B2, B3, B4

**Test scenarios:**
1. Register with FREE tier → no payment → email verification
2. Register with CONSULTANT tier → Stripe payment → email verification
3. Verify email → gain dashboard access
4. Send invitation → accept invitation → new user joins company
5. Bulk invite via CSV → all emails invited

**Acceptance Criteria:**
- ✅ All scenarios pass end-to-end
- ✅ Database state correct after each step
- ✅ Emails sent and received (mock)
- ✅ Stripe integration tested (test mode)

**Dependencies**: B1-B4

---

### B5.2 E2E Tests - Registration Journey (Playwright)
**File**: `tests/e2e/registration-flow.spec.ts`
**Complexity**: High
**Time**: 4-5 hours
**Status**: Depends on B4

**Test journey:**
1. Land on registration page (from landing page with ?tier=)
2. Fill company info
3. Select tier
4. (If paid) Stripe payment
5. Create admin account
6. Receive verification email
7. Click email link
8. Dashboard loads

**Acceptance Criteria:**
- ✅ Full flow works start to finish
- ✅ Mobile viewport tested (375px)
- ✅ Desktop viewport tested (1920px)
- ✅ No errors in console

**Dependencies**: B4

---

---

# STREAM C: ADMIN DASHBOARD (Weeks 1-3)

## C1: Dashboard Core APIs (Week 1)

### C1.1 Create Company Service APIs
**File**: `src/server/services/CompanyService.ts`
**Complexity**: Medium
**Time**: 2-3 hours
**Status**: Ready to start

```typescript
// Functions:
- getCompanyById(companyId): Company
- getCompanyStats(companyId): { activeUsers, projects, tasks, etc. }
- updateCompanyInfo(companyId, data): Company
- getCompanyTeamMembers(companyId): User[]
- getCompanySubscription(companyId): Subscription
```

**Acceptance Criteria:**
- ✅ All queries work correctly
- ✅ Data validated
- ✅ Proper error handling
- ✅ No N+1 queries

**Dependencies**: None

---

### C1.2 Create Team Member Management APIs
**File**: `src/server/routes/team.ts` (new file)
**Complexity**: Medium-High
**Time**: 3-4 hours
**Status**: Ready to start

```typescript
// Endpoints:

// GET /api/team
// Returns: { members: User[], pending: Invitation[] }

// POST /api/team/invite
// Body: { email, role }
// Returns: { success, invitation_id }

// POST /api/team/:userId/remove
// Returns: { success }

// PATCH /api/team/:userId/role
// Body: { role: 'ADMIN'|'MANAGER'|'DEVELOPER' }
// Returns: { success, user }
```

**Acceptance Criteria:**
- ✅ Get team members works
- ✅ Invite endpoint works (delegates to B3.2)
- ✅ Remove user works
- ✅ Change role works
- ✅ Last admin cannot be removed
- ✅ Admin cannot remove self

**Dependencies**: B3.2 (invitation system)

---

### C1.3 Create Subscription Management APIs
**File**: `src/server/services/SubscriptionService.ts`
**Complexity**: High
**Time**: 3-4 hours
**Status**: Ready to start

```typescript
// Functions:
- getSubscription(companyId): Subscription
- upgradeTier(companyId, newTier): Subscription
- downgradeTier(companyId, newTier): Subscription
- cancelSubscription(companyId): Subscription
- calculateProratdCharge(companyId, newTier): number

// Use Stripe API for changes
```

**Acceptance Criteria:**
- ✅ Upgrade works (Stripe + database)
- ✅ Downgrade prevented if users exceed limit
- ✅ Proration calculated correctly
- ✅ Billing email sent
- ✅ Error handling (Stripe failures)

**Dependencies**: None (uses existing Stripe)

---

## C2: Dashboard UI Components (Week 1-2)

### C2.1 Create Sidebar Navigation
**File**: `src/client/components/Dashboard/Sidebar.tsx`
**Complexity**: Medium
**Time**: 2-3 hours
**Status**: Ready to start

```typescript
// Sidebar sections:
- Dashboard (icon, "Overview")
- Projects (icon, "Projects" + count)
  - Expandable list of active projects
- Team (icon, "Team Members")
- Integrations (icon, "PM Connections")
- Settings (icon, "Settings")
- Billing (icon, "Billing & Subscription")

// Mobile: Hamburger menu, slides in from left
// Desktop: Always visible, collapse/expand toggle
```

**Acceptance Criteria:**
- ✅ Navigation links work
- ✅ Active section highlighted
- ✅ Mobile: hamburger menu works
- ✅ Desktop: collapse/expand works
- ✅ Icons clear and intuitive

**Dependencies**: None

---

### C2.2 Create Dashboard Header
**File**: `src/client/components/Dashboard/Header.tsx`
**Complexity**: Low
**Time**: 1-2 hours
**Status**: Ready to start

```typescript
// Header shows:
- Company name (left)
- Subscription tier badge (center)
- User profile + logout (right)
- Theme toggle

// Sticky at top
// Responsive on mobile
```

**Acceptance Criteria:**
- ✅ Company name displays
- ✅ Tier badge shows correct plan
- ✅ User dropdown works
- ✅ Logout works
- ✅ Theme toggle works
- ✅ Mobile responsive

**Dependencies**: A1.2 (ThemeProvider)

---

### C2.3 Create Dashboard Overview Tab
**File**: `src/client/components/Dashboard/OverviewTab.tsx`
**Complexity**: Medium
**Time**: 2-3 hours
**Status**: Ready to start (already partially done)

**Sections:**
- Company stats cards (subscription status, user count, projects)
- Onboarding checklist
- Quick actions buttons

**Acceptance Criteria:**
- ✅ Stats cards fetch correct data (C1.1)
- ✅ Checklist shows progress
- ✅ Quick action buttons work
- ✅ Loading state displays
- ✅ Error state handled

**Dependencies**: C1.1 (Company service)

---

### C2.4 Create Team Tab - Members List
**File**: `src/client/components/Dashboard/TeamTab.tsx`
**Complexity**: Medium
**Time**: 3-4 hours
**Status**: Ready to start

```typescript
// Display table:
- Email | Role | Status (Active/Pending) | Joined | Actions
- Filter by status
- Search by email
- Sort by any column

// Actions column:
- Change Role (dropdown)
- Remove (button, confirm dialog)
- Resend (for pending)
```

**Acceptance Criteria:**
- ✅ Table displays all team members
- ✅ Filter works
- ✅ Search works
- ✅ Sort works
- ✅ Actions work (delegates to C1.2)
- ✅ Mobile: table responsive or becomes accordion

**Dependencies**: C1.2 (Team service)

---

### C2.5 Create Team Tab - Invite Form
**File**: `src/client/components/Dashboard/InviteForm.tsx`
**Complexity**: Medium
**Time**: 3-4 hours
**Status**: Ready to start

```typescript
// Form sections:
1. Email entry (single or bulk)
   - Text input for single email
   - CSV file upload for bulk
   - Paste comma-separated list
2. Role selection (ADMIN, MANAGER, DEVELOPER)
   - Radio buttons with descriptions
3. Personal message (optional)
   - Textarea
4. Submit button
5. Confirmation: "Invitations sent to X emails"

// Validation:
- Valid email format
- No duplicates
- No existing team members
- Max 50 at a time
```

**Acceptance Criteria:**
- ✅ Single email invitation works
- ✅ CSV upload works (parse, validate)
- ✅ Bulk paste works
- ✅ Validation errors show clearly
- ✅ Success message displays
- ✅ Form resets after submit

**Dependencies**: B3.2 (Invitation API)

---

### C2.6 Create Billing Tab
**File**: `src/client/components/Dashboard/BillingTab.tsx`
**Complexity**: Medium
**Time**: 3-4 hours
**Status**: Ready to start

```typescript
// Sections:
1. Current Plan
   - Tier name (FREE/CONSULTANT/ENTERPRISE)
   - Monthly cost
   - Next billing date
   - Upgrade/Downgrade buttons

2. Billing Contact
   - Email (editable)
   - Address fields (editable)

3. Payment Method
   - Last 4 digits + brand
   - Expiration date
   - Update button (Stripe portal)

4. Billing History
   - Table of past invoices
   - Download links

5. Subscription Actions
   - Change Plan button
   - Cancel Subscription button
```

**Acceptance Criteria:**
- ✅ Current plan displays correctly
- ✅ Upgrade/Downgrade buttons work (C1.3)
- ✅ Contact info editable
- ✅ Payment method editable (Stripe portal)
- ✅ Invoices list displays
- ✅ Download links work

**Dependencies**: C1.3 (Subscription service)

---

### C2.7 Create Settings Tab
**File**: `src/client/components/Dashboard/SettingsTab.tsx`
**Complexity**: Low
**Time**: 1-2 hours
**Status**: Ready to start

```typescript
// Sections:
1. Company Information
   - Name (editable)
   - Address (editable)
   - Phone (editable)
   - Logo (upload, optional)

2. Preferences
   - Theme preference (light/dark/auto)
   - Email notifications (on/off)

3. Danger Zone
   - Delete company (with confirmation)
```

**Acceptance Criteria:**
- ✅ Company info editable and saves
- ✅ Preferences toggle work
- ✅ Delete button shows confirmation
- ✅ Error handling

**Dependencies**: C1.1 (Company service)

---

## C3: Dashboard Assembly (Week 2)

### C3.1 Create Main Dashboard Layout
**File**: `src/client/pages/Dashboard.tsx`
**Complexity**: Low
**Time**: 1-2 hours
**Status**: Depends on C2.1-C2.7

**Assembles:**
- Header (C2.2)
- Sidebar (C2.1)
- Tab content (C2.3-C2.7)
- Route handling for sub-pages

**Acceptance Criteria:**
- ✅ All tabs display correctly
- ✅ Navigation between tabs works
- ✅ Authentication check (redirects if not logged in)
- ✅ Mobile responsive

**Dependencies**: C2.1-C2.7

---

### C3.2 Add Route to App.tsx
**File**: `src/client/App.tsx`
**Complexity**: Low
**Time**: 30 minutes
**Status**: Depends on C3.1

**Add route:**
```typescript
<Route path="/dashboard" element={<Dashboard />} />
```

**Acceptance Criteria:**
- ✅ Route loads dashboard
- ✅ Auth middleware checks token
- ✅ Redirects to login if not authenticated

**Dependencies**: C3.1

---

## C4: Integration with Registration (Week 2-3)

### C4.1 Update Registration Success Flow
**File**: `src/client/pages/RegistrationPage.tsx`
**Complexity**: Low
**Time**: 1 hour
**Status**: Depends on B4.2, C3.1

**Change:**
- After email verification, redirect to `/dashboard` instead of login

**Acceptance Criteria:**
- ✅ Verification → dashboard (no extra login)
- ✅ Admin logged in automatically
- ✅ Token stored in localStorage/cookie

**Dependencies**: B4.2, C3.1

---

## C5: Testing (Week 3)

### C5.1 Unit Tests - Dashboard Components
**File**: `tests/unit/dashboard/*.test.tsx`
**Complexity**: Medium
**Time**: 3-4 hours
**Status**: Depends on C2

**Test:**
- Component rendering
- Data fetching
- User interactions (filters, sorts, etc.)
- Error states

**Acceptance Criteria:**
- ✅ All components tested
- ✅ 80%+ code coverage
- ✅ Mocked API calls

**Dependencies**: C2.1-C2.7

---

### C5.2 Integration Tests - Dashboard Flows
**File**: `tests/integration/dashboard-flows.test.ts`
**Complexity**: High
**Time**: 4-5 hours
**Status**: Depends on C1, C2, C3

**Test scenarios:**
1. View dashboard overview
2. Invite team member → member appears in list
3. Change member role → role updates
4. Remove member → member disappears
5. Upgrade plan → tier updates, page refreshes

**Acceptance Criteria:**
- ✅ All flows work end-to-end
- ✅ Database state correct
- ✅ API calls correct

**Dependencies**: C1-C3

---

### C5.3 E2E Tests - Dashboard Journey (Playwright)
**File**: `tests/e2e/dashboard.spec.ts`
**Complexity**: High
**Time**: 4-5 hours
**Status**: Depends on C3

**Test journey:**
1. Login to dashboard
2. View overview
3. Go to Team tab
4. Invite user
5. Change user role
6. Go to Billing tab
7. View subscription info
8. Go to Settings tab

**Acceptance Criteria:**
- ✅ Full flow works
- ✅ Mobile and desktop
- ✅ No console errors

**Dependencies**: C3

---

---

# INTEGRATION POINTS (Cross-Stream)

## Week 2-3: Connect All Streams

### I1: Landing Page → Registration
**Dependency**: A3 (Landing page), B4 (Registration updates)
**Task**: Tier selection from landing page flows to registration pre-selection
**Test**: E2E from landing page through registration

---

### I2: Registration → Dashboard
**Dependency**: B (Registration), C (Dashboard)
**Task**: After email verification, user lands in dashboard
**Test**: Full registration → verification → dashboard flow

---

### I3: Dashboard → Team Invitations (via B3)
**Dependency**: B3 (Invitations), C2.5 (Invite form)
**Task**: Invite form delegates to invitation API and email system
**Test**: Invite from dashboard → email → acceptance

---

### I4: Theme System (Landing → All Public Pages → Dashboard)
**Dependency**: A1 (Theme system), B4 (Registration), C (Dashboard)
**Task**: Theme persists across landing, registration, login, dashboard
**Test**: Toggle theme on landing → verify it applies to all pages

---

---

# TIMELINE SUMMARY

```
WEEK 1:
├─ A1-A2: Landing page components + theme system
├─ B1-B2: Registration APIs + email verification
└─ C1-C2: Dashboard APIs + UI components

WEEK 2:
├─ A3-A4: LandingPage assembly + optimization
├─ B3-B4: Personnel invitations + Registration UI updates
└─ C3-C4: Dashboard assembly + integration with registration

WEEK 3:
├─ A4: Testing + accessibility + performance
├─ B5: Integration tests + E2E tests
└─ C5: Dashboard testing

WEEK 4+: Integration + Polish
├─ I1-I4: Cross-stream integration tests
├─ Full E2E testing (landing → registration → dashboard)
├─ Performance optimization
└─ Bug fixes + final polish
```

---

# TASK TRACKING

| Task | Stream | Status | Owner | Notes |
|------|--------|--------|-------|-------|
| A1.1 | A | Ready | — | No dependencies |
| A1.2 | A | Ready | — | Depends on A1.1 |
| A1.3 | A | Ready | — | Depends on A1.2 |
| B1.1 | B | Ready | — | No dependencies |
| B1.2 | B | Ready | — | Depends on B1.1 |
| C1.1 | C | Ready | — | No dependencies |
| C1.2 | C | Ready | — | No dependencies |
| A2.1 | A | Ready | — | Depends on A1.2 |
| ... | ... | ... | ... | ... |

---

# NEXT STEP: Start Tasks

Which stream would you like to begin with?

- **Option 1**: Start with Stream A (Landing Page) - independent, can demo first
- **Option 2**: Start with Stream B (Registration) - foundational, enables other work
- **Option 3**: Start with Stream C (Dashboard) - dependent on B, but core feature
- **Option 4**: Start all 3 in parallel (A1 + B1 + C1 this week)

Choose, and I'll create the first batch of detailed implementation specs.

