# Week 2 Implementation Spec - Parallel Build
## Landing Page Components → Registration Enhancement → Dashboard UI

**Week 1 Status**: ✅ Complete (8 files, 1,250 lines)
**Week 2 Goals**: Component assembly across 3 streams
**Duration**: 7 days
**Approach**: Parallel execution (3 independent work streams)

---

## WEEK 2 TASK PRIORITY

### Stream A: Landing Page Components (6 tasks)
Build visual components that work with Week 1 theme system

1. **A2.1** - HeroSection component
2. **A2.2** - FeaturesList component
3. **A2.3** - PricingTiers component
4. **A2.4** - ComplianceSection component
5. **A3.1** - LandingPage main (assembly)
6. **A4.1** - Apply theme to public pages (LoginPage, RegistrationPage, VerificationPage)

### Stream B: Registration Enhancement (5 tasks)
Complete email verification flow & tie-ins

7. **B1.2** - Update user table integration (email verification complete)
8. **B2.1** - Stripe webhook handler
9. **B3.2** - Invitation API endpoint (send invitations)
10. **B4.1** - Update RegistrationPage (tier pre-selection support)
11. **B4.2** - Create VerificationPage component

### Stream C: Dashboard UI (6 tasks)
Build dashboard interface using Week 1 APIs

12. **C2.1** - Sidebar navigation
13. **C2.2** - Dashboard header
14. **C2.3** - Overview tab
15. **C2.4** - Team tab (members list)
16. **C2.5** - Team tab (invite form)
17. **C3.1** - Main Dashboard layout assembly

---

# STREAM A: LANDING PAGE COMPONENTS

## A2.1 - HeroSection Component

**File**: `src/client/components/LandingPage/HeroSection.tsx`
**Complexity**: Medium
**Time**: 3-4 hours
**Dependencies**: ThemeProvider (A1.2)

**What to Display**:
```
┌─────────────────────────────────────────┐
│  wxKanban                               │
│  Project Management System with AI      │
│                                         │
│  [Hero Image - Data Center]             │
│  [SOC2 & HITRUST Badges]                │
│                                         │
│  "wxKanban is a full project            │
│   management system developed around    │
│   AI with a starting kit..."            │
│                                         │
│  [Start Free] [Learn More]              │
└─────────────────────────────────────────┘
```

**Props**:
```typescript
interface HeroSectionProps {
  onStartClick?: () => void;
  onLearnMoreClick?: () => void;
}
```

**Key Features**:
- Background image (data center, optimized)
- Hero headline and subheadline
- SOC2/HITRUST badges overlay
- CTA buttons (Start Free, Learn More)
- Responsive: mobile 100vh, desktop with aspect ratio
- Dark/light mode support via data-theme

**Acceptance Criteria**:
- ✅ Image loads without blocking text (lazy loading)
- ✅ Headline readable on mobile (no overflow)
- ✅ Badges visible and accessible (alt text)
- ✅ Buttons clickable with 44px+ touch targets
- ✅ Works in light and dark mode
- ✅ No horizontal scroll on mobile

**Notes**:
- Use hero image from public/images or Unsplash
- Optimize to < 200KB
- Add srcset for responsive sizes

---

## A2.2 - FeaturesList Component

**File**: `src/client/components/LandingPage/FeaturesList.tsx`
**Complexity**: Low
**Time**: 2-3 hours
**Dependencies**: ThemeProvider

**Features to Display**:
```
1. AI-Powered
   Task suggestions, optimization

2. Secure
   SOC2, HITRUST, GDPR

3. Integrated
   Jira, Monday, Asana, Trello

4. Time Tracking
   Billable hours, invoicing

5. Collaborative
   Team management

6. 6-Phase Lifecycle
   Quality methodology
```

**Component Layout**:
- Grid: 3 columns (desktop), 2 columns (tablet), 1 column (mobile)
- Each card: Icon + heading + description
- Icons from lucide-react or heroicons

**Props**:
```typescript
interface Feature {
  icon: ReactNode;
  title: string;
  description: string;
}

interface FeaturesListProps {
  features?: Feature[];
}
```

**Acceptance Criteria**:
- ✅ 6 features displayed
- ✅ Icons clear and relevant
- ✅ Text concise (1-2 lines)
- ✅ Grid responsive
- ✅ Dark/light mode support
- ✅ Accessible (semantic HTML, alt text)

---

## A2.3 - PricingTiers Component

**File**: `src/client/components/LandingPage/PricingTiers.tsx`
**Complexity**: Medium
**Time**: 4-5 hours
**Dependencies**: ThemeProvider

**Tiers to Display**:
```
FREE ($0)
├─ 1-3 users
├─ Single PM integration
└─ [Start Free]

SMALL/MED ⭐ ($0)
├─ 5 users
├─ SOC2 & HITRUST
├─ ⭐ MOST POPULAR
└─ [Start Now]

CONSULTANT ($19.95/person)
├─ Unlimited users
├─ Multiple PM connections
├─ Invoicing
└─ [Register]

ENTERPRISE ($59.95 + $5/user)
├─ 25+ users
├─ Unlimited features
├─ Dedicated support
└─ [Contact Sales]
```

**Component Structure**:
```typescript
interface TierCard {
  name: string;
  price: number | string;
  userLimit: string;
  features: string[];
  isMostPopular?: boolean;
  ctaLabel: string;
  ctaHref: string;
}

interface PricingTiersProps {
  onTierSelect?: (tier: string) => void;
  tiers?: TierCard[];
}
```

**Key Features**:
- 4 tier cards in row (desktop) or stacked (mobile)
- "Most Popular" badge on Small/Med tier (blue highlight)
- Feature checkmarks (✓)
- CTA buttons link to `/registration?tier=X`
- Hover effects on desktop
- Price displayed prominently

**Button Routing**:
- FREE: `/registration?tier=FREE`
- SMALL/MED: `/registration?tier=CONSULTANT` (user said this is "most popular")
- CONSULTANT: `/registration?tier=CONSULTANT`
- ENTERPRISE: Contact sales page

**Acceptance Criteria**:
- ✅ All 4 tiers visible with correct pricing
- ✅ Small/Med highlighted as "Most Popular"
- ✅ Features listed accurately
- ✅ Buttons route correctly with ?tier parameter
- ✅ Mobile: cards stack, buttons full-width
- ✅ Desktop: hover effects visible
- ✅ Dark/light mode support

---

## A2.4 - ComplianceSection Component

**File**: `src/client/components/LandingPage/ComplianceSection.tsx`
**Complexity**: Low
**Time**: 1-2 hours
**Dependencies**: None

**Display**:
```
┌────────────────────────────────┐
│  Enterprise-Grade Security      │
│                                │
│  [SOC2] [HITRUST] [GDPR]       │
│  ✓ Compliant  ✓ Certified      │
│                                │
│  "Built with security in mind" │
└────────────────────────────────┘
```

**Props**:
```typescript
interface Compliance {
  icon: ReactNode;
  name: string;
  description: string;
}

interface ComplianceSectionProps {
  compliance?: Compliance[];
}
```

**Acceptance Criteria**:
- ✅ 3 badges displayed (SOC2, HITRUST, GDPR)
- ✅ Badges have alt text
- ✅ Compliance messaging clear
- ✅ Icons/badges accessible
- ✅ Mobile responsive
- ✅ Dark/light mode support

---

## A3.1 - LandingPage Main Component

**File**: `src/client/pages/LandingPage.tsx`
**Complexity**: Low
**Time**: 2-3 hours
**Dependencies**: A2.1-A2.4, ThemeToggle

**Structure**:
```
<LandingPage>
  <Header>
    <Logo>
    <Nav links />
    <ThemeToggle />
    <Login/Register buttons>
  </Header>

  <HeroSection />
  <FeaturesList />
  <PricingTiers />
  <ComplianceSection />
  <HowBuiltModal /> (shows 6-phase lifecycle)

  <Footer>
    <Links>
    <Social>
    <Legal>
  </Footer>
</LandingPage>
```

**Navigation**:
- Home (scrolls to top)
- Features (scroll to features section)
- Pricing (scroll to pricing section)
- Docs (external link)
- Login (routes to /login)
- Register (routes to /registration)

**Props**: None (top-level page component)

**Routing Logic**:
- If authenticated: Redirect to /dashboard
- If public: Show landing page

**Acceptance Criteria**:
- ✅ All sections visible, proper spacing
- ✅ Navigation links work
- ✅ Tier buttons route to registration with ?tier=
- ✅ Responsive on mobile/tablet/desktop
- ✅ Authenticated users redirected
- ✅ Dark/light mode works throughout
- ✅ Header sticky on scroll
- ✅ Mobile nav is hamburger menu

---

## A4.1 - Apply Theme to Public Pages

**Files to Modify**:
- `src/client/pages/LoginPage.tsx`
- `src/client/pages/RegistrationPage.tsx`
- `src/client/pages/VerificationPage.tsx`

**Changes**:
1. Import `useTheme` hook
2. Add `ThemeToggle` to page headers
3. Test dark/light mode switching
4. Verify contrast ratios (WCAG 2.1 AA)

**Acceptance Criteria**:
- ✅ Theme toggle appears on all 3 pages
- ✅ Dark/light switch works
- ✅ Theme persists between pages
- ✅ Contrast meets WCAG AA (4.5:1)
- ✅ No visual glitches

---

# STREAM B: REGISTRATION ENHANCEMENT

## B1.2 - User Table Integration (Email Verification)

**File**: `src/server/routes/auth.ts` (modify verify-email endpoint)
**Complexity**: Low
**Time**: 1-2 hours
**Dependencies**: B1.1 (email verification endpoint)

**Current State**:
- Endpoint exists but has TODO: Update user.emailverified = true

**What to Add**:
1. Import userprofile schema
2. Query user by email from token
3. Update user.emailverified = true
4. Return updated user

**Code Change**:
```typescript
// In GET /api/auth/verify-email endpoint, after token validation:
const user = await db
  .select()
  .from(userprofile)
  .where(eq(userprofile.id, tokenRecord[0].userid))
  .limit(1);

if (user.length === 0) {
  return res.status(404).json({ error: "User not found" });
}

await db
  .update(userprofile)
  .set({ emailverified: true })
  .where(eq(userprofile.id, tokenRecord[0].userid));
```

**Acceptance Criteria**:
- ✅ User marked as verified
- ✅ emailverified column exists in userprofile table
- ✅ Verified users can login
- ✅ Unverified users blocked from dashboard
- ✅ Error handling if user not found

---

## B2.1 - Stripe Webhook Integration

**File**: `src/server/routes/webhooks.ts` (new file)
**Complexity**: Medium-High
**Time**: 3-4 hours
**Dependencies**: None (uses existing Stripe setup)

**Endpoint**: `POST /api/webhooks/stripe`

**Events to Handle**:
1. `customer.subscription.updated` → Update subscription tier/status
2. `invoice.payment_succeeded` → Log successful charge
3. `invoice.payment_failed` → Alert admin
4. `customer.subscription.deleted` → Mark cancelled

**Implementation**:
```typescript
router.post('/stripe', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  try {
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    switch(event.type) {
      case 'customer.subscription.updated':
        // Update company subscription in DB
        break;
      case 'invoice.payment_succeeded':
        // Log payment
        break;
      case 'invoice.payment_failed':
        // Alert admin
        break;
      case 'customer.subscription.deleted':
        // Mark cancelled
        break;
    }

    res.json({received: true});
  } catch(error) {
    res.status(400).json({error: 'Webhook failed'});
  }
});
```

**Setup Required**:
1. Create webhooks.ts file
2. Register endpoint in main Express app
3. Get STRIPE_WEBHOOK_SECRET from Stripe dashboard
4. Add to .env

**Acceptance Criteria**:
- ✅ Webhook signature verified
- ✅ All events handled
- ✅ Database updated correctly
- ✅ Errors logged
- ✅ Tested with Stripe CLI

---

## B3.2 - Invitation API Endpoint (Send Invitations)

**File**: `src/server/routes/invitations.ts` (new file)
**Complexity**: Medium
**Time**: 3-4 hours
**Dependencies**: B1.1 (email service ready)

**Endpoint**: `POST /api/invitations/send`

**Implementation**:
```typescript
router.post('/send', validateBody(inviteSchema), async (req, res) => {
  const { email, role, message } = req.body;
  const companyId = req.user.companyId;

  // Create invitation
  const invitation = await db.insert(userinvitation).values({
    email,
    role,
    companyid: companyId,
    status: 'PENDING',
    expiresat: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    personalmessage: message,
  });

  // Send email
  await sendInvitationEmail({
    to: email,
    companyName: company.companyname,
    role,
    message,
    invitationLink: `${CLIENT_URL}/accept-invitation/${invitation.id}`,
  });

  res.json({ success: true, invitationId: invitation.id });
});
```

**Email Template**:
```html
<h2>You're invited to {{company}}</h2>
<p>Role: {{role}}</p>
<p>{{message}}</p>
<a href="{{link}}">Accept Invitation</a>
<p>Link expires: {{expiresAt}}</p>
```

**Acceptance Criteria**:
- ✅ Invitation created in database
- ✅ Email sent within 1 minute
- ✅ Link valid for 7 days
- ✅ Duplicate prevention works
- ✅ Error handling for invalid emails

---

## B4.1 - Update RegistrationPage Component

**File**: `src/client/pages/RegistrationPage.tsx` (modify)
**Complexity**: Low
**Time**: 1-2 hours
**Dependencies**: B1.4 (tier pre-selection in API)

**Changes**:
1. Read `?tier=X` from URL query params
2. Pass to TierSelector component to pre-select
3. Show verification email message on success

**Code**:
```typescript
const { tier } = useSearchParams(); // Get ?tier param

<TierSelector
  selectedTier={tier || 'FREE'}
  onSelect={handleTierSelect}
/>
```

**Acceptance Criteria**:
- ✅ ?tier=CONSULTANT pre-selects Consultant
- ✅ Invalid tier ignored (defaults to FREE)
- ✅ Success page says "verify email"
- ✅ Links to landing page work

---

## B4.2 - Create VerificationPage Component

**File**: `src/client/pages/VerificationPage.tsx` (new)
**Complexity**: Medium
**Time**: 2-3 hours
**Dependencies**: B1.2 (email verification handler)

**Route**: `/verify-email?token=X`

**Display States**:
```
Loading:
"Verifying your email..."

Success:
"✓ Email verified!
 Redirecting to dashboard..."
(Auto-redirect in 2 seconds)

Error:
"✗ Verification failed
 [Resend Link] [Back to Login]"
```

**Implementation**:
```typescript
export function VerificationPage() {
  const [status, setStatus] = useState('loading'); // loading|success|error
  const { token } = useSearchParams();

  useEffect(() => {
    const verify = async () => {
      try {
        await fetch(`/api/auth/verify-email?token=${token}`);
        setStatus('success');
        setTimeout(() => navigate('/dashboard'), 2000);
      } catch {
        setStatus('error');
      }
    };
    verify();
  }, [token]);

  return (
    <div>
      {status === 'loading' && <p>Verifying...</p>}
      {status === 'success' && <p>Verified! Redirecting...</p>}
      {status === 'error' && <p>Failed. <button>Resend</button></p>}
    </div>
  );
}
```

**Acceptance Criteria**:
- ✅ Processes token from URL
- ✅ Shows loading state
- ✅ Displays success/error
- ✅ Auto-redirects to dashboard
- ✅ Resend link option works
- ✅ Error messages clear

---

# STREAM C: DASHBOARD UI

## C2.1 - Sidebar Navigation

**File**: `src/client/components/Dashboard/Sidebar.tsx`
**Complexity**: Medium
**Time**: 2-3 hours
**Dependencies**: C1.1 (CompanyService)

**Sections**:
```
Dashboard
├─ Overview (icon, "Dashboard")

Projects
├─ Projects (icon, "Projects" + count)
├─ Expand/collapse

Team
├─ Team Members (icon, "Team")

Integrations
├─ PM Connections (icon, "Integrations")

Settings
├─ Company Settings (icon, "Settings")
├─ Billing (icon, "Billing")
```

**Features**:
- Desktop: Always visible, collapse toggle
- Mobile: Hamburger menu, slides in
- Active section highlighted
- Icons from lucide-react
- Responsive layout

**Props**:
```typescript
interface SidebarProps {
  activeSection?: string;
  onSectionClick?: (section: string) => void;
}
```

**Acceptance Criteria**:
- ✅ All sections navigable
- ✅ Active section highlighted
- ✅ Mobile hamburger works
- ✅ Icons clear
- ✅ Touch targets 44px+
- ✅ Scroll if needed
- ✅ Dark/light mode support

---

## C2.2 - Dashboard Header

**File**: `src/client/components/Dashboard/Header.tsx`
**Complexity**: Low
**Time**: 1-2 hours
**Dependencies**: ThemeProvider, C1.1

**Display**:
```
[Company Name]  [Tier Badge]  [Theme Toggle] [User ▼]
```

**Features**:
- Company name (left)
- Subscription tier badge (center) - Free/Consultant/Enterprise
- Theme toggle button
- User profile menu (dropdown)
- Logout option

**Props**:
```typescript
interface HeaderProps {
  companyName: string;
  subscriptionTier: string;
  userName: string;
  onLogout?: () => void;
}
```

**Acceptance Criteria**:
- ✅ Company name displays
- ✅ Tier badge shows correct plan
- ✅ Theme toggle works
- ✅ User dropdown works
- ✅ Logout works
- ✅ Mobile responsive
- ✅ Sticky at top

---

## C2.3 - Overview Tab

**File**: `src/client/components/Dashboard/OverviewTab.tsx`
**Complexity**: Medium
**Time**: 2-3 hours
**Dependencies**: C1.1 (CompanyService)

**Display**:
```
[Subscription Status Card]
├─ Status: Active
├─ Renewal: [date]

[User Limit Card]
├─ 2/5 users
├─ Progress bar
├─ Slots remaining

[Current Plan Card]
├─ FREE / CONSULTANT / ENTERPRISE
├─ [Upgrade Button]

[Onboarding Checklist]
├─ ☑ Email verified
├─ ☑ Admin created
├─ ☐ Invite team (optional)
├─ ☐ Connect PM systems (optional)
```

**API Calls**:
- `GET /api/company` (via CompanyService.getCompanyById)
- `GET /api/company/stats` (via CompanyService.getCompanyStats)

**Props**: None (uses auth context for companyId)

**Acceptance Criteria**:
- ✅ Stats cards fetch correct data
- ✅ User count shows x/max
- ✅ Progress bar accurate
- ✅ Checklist progresses
- ✅ Upgrade button routes to billing
- ✅ Loading state displays
- ✅ Error state handled

---

## C2.4 - Team Tab: Members List

**File**: `src/client/components/Dashboard/TeamMembersTab.tsx`
**Complexity**: Medium
**Time**: 3-4 hours
**Dependencies**: C1.2 (Team APIs)

**Display**:
```
[Invite Button]

[Table]
├─ Email | Role | Status | Joined | Actions
├─ user1@... | ADMIN | Active | Feb 18 | [Change Role] [Remove]
├─ user2@... | DEVELOPER | Pending | - | [Resend] [Cancel]
└─ ...

[Filters]
├─ All / Active / Pending / Expired
[Search by email]
[Sort by column]
```

**Table Columns**:
- Email (searchable)
- Role (dropdown to change)
- Status (Active/Pending/Expired)
- Joined date (if accepted)
- Actions (Resend/Change Role/Remove)

**API Calls**:
- `GET /api/team` (fetch members)
- `PATCH /api/team/:id/role` (change role)
- `POST /api/team/:id/remove` (remove user)

**Props**: None (uses auth context)

**Acceptance Criteria**:
- ✅ Table displays all members
- ✅ Filter works (All/Active/Pending)
- ✅ Search filters by email
- ✅ Sort works on columns
- ✅ Change role dropdown works
- ✅ Remove button shows confirm dialog
- ✅ Actions call correct APIs
- ✅ Mobile: table becomes accordion
- ✅ Loading/error states

---

## C2.5 - Team Tab: Invite Form

**File**: `src/client/components/Dashboard/InviteTeamTab.tsx`
**Complexity**: Medium
**Time**: 3-4 hours
**Dependencies**: B3.2 (Invitation API)

**Form**:
```
[Email Entry Section]
├─ Option 1: Single email input
├─ Option 2: CSV file upload (max 50)
├─ Option 3: Paste comma-separated

[Role Selection]
├─ ADMIN - Full access
├─ MANAGER - Manage team & projects
├─ DEVELOPER - View & manage own tasks

[Personal Message] (optional)
├─ Textarea

[Submit Button]
[Success: "Invitations sent to X emails"]
```

**Validation**:
- Valid email format
- No duplicates
- No existing team members
- Max 50 at a time

**CSV Parser**:
```
email@example.com
user@company.com
...
```

**API Calls**:
- `POST /api/team/invite` (single)
- `POST /api/team/invite-bulk` (CSV)

**Props**: None

**Acceptance Criteria**:
- ✅ Single email invitation works
- ✅ CSV upload parses correctly
- ✅ Bulk paste works (comma/newline-separated)
- ✅ Validation errors show clearly
- ✅ Duplicate prevention
- ✅ Success message displays
- ✅ Form resets after submit
- ✅ Max 50 email limit enforced
- ✅ Role descriptions visible

---

## C3.1 - Main Dashboard Layout

**File**: `src/client/pages/Dashboard.tsx` (modify)
**Complexity**: Low
**Time**: 1-2 hours
**Dependencies**: C2.1-C2.5, ThemeProvider

**Structure**:
```
<Dashboard>
  <Header />
  <Sidebar>
    <Routes>
      <Route path="overview" element={<OverviewTab />} />
      <Route path="team" element={<TeamTab />} />
      <Route path="billing" element={<BillingTab />} />
      <Route path="settings" element={<SettingsTab />} />
    </Routes>
  </Sidebar>
</Dashboard>
```

**Auth Check**:
- Verify token in localStorage
- Redirect to /login if not authenticated

**Mobile Layout**:
- Sidebar collapses
- Header with hamburger menu
- Content full-width

**Acceptance Criteria**:
- ✅ All tabs display correctly
- ✅ Navigation between tabs works
- ✅ Auth check prevents unauthorized access
- ✅ Mobile responsive
- ✅ Dark/light mode works
- ✅ Loading states for data fetch

---

# DEPENDENCIES & BLOCKERS

## Required for Week 2

1. **Email Service Provider**
   - Which: Mailgun, SendGrid, AWS SES, or other?
   - Setup sendEmail() function in lib/
   - Test email delivery

2. **Stripe Webhook Secret**
   - From Stripe dashboard
   - Added to .env as STRIPE_WEBHOOK_SECRET

3. **userprofile.emailverified Column**
   - Check if exists in database
   - If not: Create migration to add
   - Type: BOOLEAN, default false

4. **Image Assets**
   - Hero image for landing page
   - SOC2, HITRUST, GDPR badges
   - Company/feature icons

---

# ACCEPTANCE CRITERIA SUMMARY

| Stream | Component | Status | Tests |
|--------|-----------|--------|-------|
| **A** | HeroSection | Ready | Hero displays, mobile responsive |
| **A** | FeaturesList | Ready | 6 cards display correctly |
| **A** | PricingTiers | Ready | 4 tiers, buttons route correctly |
| **A** | ComplianceSection | Ready | Badges visible, accessible |
| **A** | LandingPage | Ready | All sections assemble, theme works |
| **A** | Public page theme | Ready | Theme toggle on all 3 pages |
| **B** | User verification | Ready | emailverified flag updates |
| **B** | Stripe webhook | Ready | Events handled, DB updated |
| **B** | Invite API | Ready | Emails sent, invitations created |
| **B** | Registration tier | Ready | ?tier param pre-selects |
| **B** | VerificationPage | Ready | Token processed, redirects |
| **C** | Sidebar | Ready | Navigation works, responsive |
| **C** | Header | Ready | Company info displays |
| **C** | Overview tab | Ready | Stats load correctly |
| **C** | Team list | Ready | Members display, actions work |
| **C** | Invite form | Ready | Emails sent, form validates |
| **C** | Dashboard | Ready | All tabs assemble |

---

# NEXT STEPS: WEEK 3

After Week 2 completes:
- Testing (unit, integration, E2E)
- Accessibility audit
- Performance optimization
- Bug fixes
- Landing → Registration → Dashboard full flow

---

# READY TO START WEEK 2?

**All 17 tasks ready to build.**

Which stream(s) would you like to start with?

- **Option A**: Stream A first (Landing page - visual components)
- **Option B**: Stream B first (Registration - backend integration)
- **Option C**: Stream C first (Dashboard - UI assembly)
- **Option D**: All 3 in parallel (like Week 1)

Your choice?

