# Implementation Plan: wxKanban Public Landing Page

**Branch**: `005-specs-004-landingpage` | **Date**: 2026-02-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-specs-004-landingpage/spec.md`

---

## Summary

The wxKanban Landing Page is a public-facing marketing page serving as the entry point for prospective and returning users. The feature introduces:
1. A modern, responsive landing page component with hero section, pricing tiers, and compliance trust signals
2. A new theme system (light/dark mode) that detects OS preference, persists across sessions, and applies consistently across all public pages (landing, login, registration, verification)
3. Tier pre-selection mechanism: pricing tier CTAs on the landing page pass the selected tier to the registration page via URL query parameter

**Technical Approach**: Frontend-only feature. No database schema changes, no new API endpoints. Reuses existing tier definitions from TierSelector and registration flows. Theme system is implemented as a React Context + localStorage combination, applied retroactively to existing public pages.

---

## Technical Context

**Language/Version**: TypeScript 4.8+ (React 18+)
**Primary Dependencies**: React, Vite, Tailwind CSS, shadcn/ui, TanStack Query
**Storage**: localStorage (theme preference only; no database changes)
**Testing**: Vitest (unit), Playwright (E2E)
**Target Platform**: Web (desktop + mobile responsive)
**Project Type**: Web application (frontend + existing backend)
**Performance Goals**: LCP < 3 seconds (hero image optimized), Core Web Vitals green across all pages
**Constraints**:
- WCAG 2.1 Level AA contrast in both light and dark modes
- 44px minimum touch target on mobile
- Theme toggle must not require page reload
- Must work with existing `/login`, `/registration`, `/dashboard` routes
**Scale/Scope**: Single page component + theme system propagation to 3 existing pages + responsive design across all viewports

---

## Constitution Check

**GATE: Must pass before Phase 0 research**

### Applicable Constitutional Rules

1. **I. Unified Full-Stack Architecture**: ✅ COMPLIANT
   - Using React 18+ with TypeScript (required)
   - Using Express backend (referenced, no changes)
   - Using PostgreSQL/Drizzle (no changes needed)
   - Custom JWT auth (referenced, no changes)

2. **III. Database & Naming Conventions**: ✅ COMPLIANT
   - No new database tables or schema changes
   - No naming convention violations (frontend-only code)

3. **IV. Code Quality & Styling**: ✅ COMPLIANT
   - All new code in TypeScript with functional components
   - Existing testing patterns (Vitest + Playwright) will be extended
   - Follow established file organization (src/client/pages/ and src/client/components/)

4. **V. Security & Data Protection**: ✅ COMPLIANT
   - Theme preference stored in localStorage (no sensitive data)
   - All tier/pricing data read from existing components and API
   - No hardcoded values (use TierSelector.tsx as source of truth)

5. **VI. Early Development Philosophy**: ✅ COMPLIANT
   - Landing page is new (no legacy compatibility needed)
   - Theme system is new (no need to preserve old themes)
   - Breaking changes acceptable for theme system introduction

6. **VII. Project Lifecycle Management**: ✅ COMPLIANT
   - Following 6-phase workflow (Design → Implementation → QA → Human Testing → Beta → Release)
   - This plan is Phase 1: Design completion

**Constitution Check Result**: ✅ **PASS** - No violations detected

---

## Project Structure

### Documentation (this feature)

```
specs/005-specs-004-landingpage/
├── spec.md                 # Feature specification ✅ Complete
├── checklists/
│   └── requirements.md     # Quality checklist ✅ Complete
├── plan.md                 # This file (Phase 1)
├── research.md             # Phase 0 output (generated below)
├── data-model.md           # Phase 1 output (no new entities)
├── quickstart.md           # Phase 1 output (test scenarios)
└── contracts/              # Phase 1 output (no new API endpoints)
```

### Source Code (repository)

```
src/
├── client/
│   ├── pages/
│   │   └── LandingPage.tsx          # NEW
│   ├── components/
│   │   ├── ThemeToggle.tsx          # NEW (theme system)
│   │   ├── ThemeProvider.tsx        # NEW (React Context)
│   │   └── [existing pages updated]  # MODIFIED (theme support)
│   └── lib/
│       └── themePreference.ts       # NEW (localStorage utilities)
│
tests/
├── integration/
│   └── landing-page.test.ts         # NEW (user journey tests)
└── e2e/
    └── landing-page.spec.ts         # NEW (Playwright E2E)
```

**Structure Decision**: Web application (Option 2) — Frontend components + existing backend

---

## Phase 0: Outline & Research

### Technical Unknowns Identified

No NEEDS CLARIFICATION items remain from the spec. All critical decisions have been made and documented:
- ✅ Tier pre-selection scope: IN SCOPE (URL query parameter)
- ✅ Enterprise tier pricing: $99.95/month (verified from TierSelector.tsx)
- ✅ Theme system scope: All 4 public pages (landing, login, registration, verification)
- ✅ Browser API usage: `prefers-color-scheme`, localStorage

### Research Results

**Decision 1: Theme Persistence Strategy**
- **Decision**: localStorage + React Context (optional consumer pattern)
- **Rationale**:
  - localStorage allows persistence without database changes
  - React Context enables theme consumption across components without prop drilling
  - Aligns with existing TanStack Query + Context API state management pattern in the project
  - No server-side session storage needed for unauthenticated visitors
- **Alternatives Considered**:
  - CSS media queries alone → insufficient for persistence across sessions
  - Server-side theme preference → requires database changes (violates early dev philosophy)
  - URL parameter → fragile, lost on navigation

**Decision 2: Tier Pre-Selection Implementation**
- **Decision**: URL query parameter (`?tier=CONSULTANT`) + RegistrationPage.tsx enhancement
- **Rationale**:
  - Minimal coupling between landing page and registration page
  - No database changes required
  - Follows REST patterns (query parameter for optional state)
  - RegistrationPage can ignore parameter if not provided (backward compatible)
- **Alternatives Considered**:
  - Route state (React Router) → requires tight integration
  - sessionStorage → lost if user closes tab
  - LocalStorage → could pollute global state

**Decision 3: Hero Background Image Optimization**
- **Decision**: Next.js Image component (or equivalent lazy loading + srcset)
- **Rationale**:
  - Aligns with existing Vite + React stack
  - Enables responsive image sizes (mobile vs desktop)
  - WebP fallback for older browsers
  - Prevents image from blocking hero text visibility during load
- **Alternatives Considered**:
  - Raw `<img>` tag → no optimization
  - CSS background image → cannot be lazy-loaded

**Decision 4: Compliance Badges in Hero**
- **Decision**: SVG or PNG badges rendered as DOM elements overlaid on background image
- **Rationale**:
  - Allows independent theme styling for badges
  - Can be a React component for reusability
  - Text alternatives can be provided via `aria-label` for accessibility
- **Alternatives Considered**:
  - Burned into the image → impossible to theme, inaccessible
  - CSS pseudo-elements → cannot accommodate complex badges

**Phase 0 Output**: ✅ Complete — All unknowns resolved, design decisions documented

---

## Phase 1: Design & Contracts

### 1. Data Model: Entities & State

**Entity 1: Landing Page Configuration** (Static/Environment)
```
- Layout sections: hero, compliance, pricing, features
- No database entity needed
- Content can be configured via environment variables or hardcoded strings
- Compliance badge URLs/paths hardcoded
```

**Entity 2: Theme Preference** (Client-side)
```
- Type: "light" | "dark"
- Storage: localStorage key "theme"
- Scope: Global application state (React Context)
- No database persistence needed
```

**Entity 3: Subscription Tiers** (Referenced, not new)
```
- Source: TierSelector.tsx (FREE, CONSULTANT, ENTERPRISE)
- Landing page DISPLAYS these tiers
- Landing page DOES NOT create or modify tiers
- Backend source: /api/payment/validate (tier definitions)
```

**Validation Rules**:
- Theme preference must be "light" or "dark"
- Tier parameter must match one of: FREE, CONSULTANT, ENTERPRISE
- No new database validations needed

---

### 2. API Contracts

**No new API endpoints required.**

Landing page **consumes** existing endpoints:
- `GET /` → renders landing page (new route)
- `POST /api/payment/validate` → called by TierSelector to fetch tier definitions
- `GET /login` → target of "Sign In" CTA
- `GET /registration` → target of tier CTAs (with optional `?tier=X` parameter)
- `GET /dashboard` → redirect target for authenticated users

**Tier Pre-Selection Parameter** (enhancement to existing `/registration` route):
```http
GET /registration?tier=CONSULTANT
```
- Query parameter `tier` (optional)
- Valid values: FREE, CONSULTANT, ENTERPRISE
- RegistrationPage will pre-select the tier if parameter is present

---

### 3. Contract Tests

No contract tests needed for Phase 1 (existing endpoints are already tested in spec-003).

Phase 1 focus: Integration tests validating user journey through landing page → registration flow.

---

### 4. Test Scenarios (from User Stories)

**Scenario 1: Prospect Evaluation Journey**
- Visitor lands on `/`
- Sees hero with compliance badges, hero headline
- Scrolls to pricing section
- Clicks "Start Consultant" → navigates to `/registration?tier=CONSULTANT`
- TierSelector pre-selects "Consultant"
- Visitor completes registration

**Scenario 2: Theme Preference Persistence**
- Visitor opens landing page
- OS preference is dark mode → page renders in dark mode
- Visitor toggles to light mode (manually)
- Preference saved to localStorage
- Visitor navigates to `/login` → login page also renders in light mode
- Visitor closes browser, returns next day
- Landing page loads in light mode (preference persisted)

**Scenario 3: Authenticated User Redirect**
- User is logged in and navigates to `/`
- Browser redirects to `/dashboard` (middleware/auth check)
- Landing page never renders

**Scenario 4: Mobile Responsive**
- Visitor opens landing page on mobile (375px width)
- Navigation collapses to hamburger menu
- Tier cards stack vertically
- All CTAs remain tappable (44px+)
- Text remains readable (no horizontal scroll)

---

### 5. Quickstart Test Scenarios (Integration Tests)

Create `quickstart.md` with these test narratives:

```markdown
# Landing Page Quickstart: Integration Test Scenarios

## Test 1: Visitor Discovers Pricing
- Open http://localhost:3000/
- Verify hero section displays
- Scroll to pricing section
- Verify all 3 tiers visible with correct pricing ($0, $19.95, $99.95)
- Consultant tier shows "Most Popular" badge
- Click "Start Consultant" button
- Verify redirect to /registration?tier=CONSULTANT
- Verify TierSelector pre-selects Consultant
- ✅ PASS

## Test 2: Theme Toggle Persists
- Open http://localhost:3000/
- Verify page renders in system default theme
- Click theme toggle button
- Verify entire page switches to opposite theme instantly (no reload)
- Reload page
- Verify theme preference persists from previous selection
- Navigate to http://localhost:3000/login
- Verify login page uses same theme preference
- ✅ PASS

## Test 3: Authenticated User Redirects
- Login to application (create session/token)
- Navigate to http://localhost:3000/
- Verify automatic redirect to /dashboard
- Verify landing page never renders
- ✅ PASS

## Test 4: Mobile Responsiveness
- Open http://localhost:3000/ on mobile viewport (375px)
- Verify navigation menu collapses to hamburger icon
- Expand hamburger menu
- Verify all navigation items visible
- Scroll to pricing section
- Verify tier cards stack vertically (not side-by-side)
- Click any tier button
- Verify button tappable with 44px+ touch target
- Verify no horizontal scroll
- ✅ PASS
```

**Output**: quickstart.md (Phase 1 deliverable)

---

### 6. Update Agent Context

Run the PowerShell script to update the agent-specific context file:

```bash
pwsh .specify/scripts/powershell/update-agent-context.ps1 -AgentType claude
```

This updates `CLAUDE.md` (or equivalent agent context file) with:
- New technologies: React Context for theming, localStorage API
- New file locations: src/client/pages/LandingPage.tsx, src/client/lib/themePreference.ts
- Recent changes: Theme system introduction, landing page feature
- Keeps existing patterns intact

---

## Phase 1 Deliverables

✅ **Phase 0: Research (Complete)**
- All technical unknowns researched and documented above
- Design decisions justified

✅ **Phase 1: Design (Complete)**
- data-model.md (3 entities: landing page config, theme preference, referenced tiers)
- contracts/ (no new endpoints; enhanced `/registration` with optional `?tier` parameter)
- quickstart.md (4 integration test scenarios)
- Agent context updated (CLAUDE.md)

---

## Constitution Check (Post-Design)

**Re-evaluated after Phase 1 design**:

1. **TypeScript Quality**: ✅ New components will be pure TypeScript + React
2. **Testing**: ✅ Integration tests use Vitest/Playwright (existing project patterns)
3. **Architecture**: ✅ Theme Context follows React best practices (no prop drilling)
4. **Database**: ✅ No schema changes, no Drizzle ORM modifications
5. **Security**: ✅ No sensitive data in localStorage, no API key exposure
6. **Naming**: ✅ camelCase for TypeScript, no underscores

**Constitution Check Result**: ✅ **PASS** — Design compliant with all rules

---

## Phase 2: Task Planning Approach

_The /tasks command will execute this approach — NOT executed during /plan_

### Task Generation Strategy

Tasks will be created in test-driven order:

1. **Setup & Configuration Tasks**
   - Create theme utilities (themePreference.ts)
   - Create ThemeProvider context and hook

2. **Component Tasks (TDD)**
   - Write contract test for LandingPage component
   - Implement LandingPage component
   - Write contract test for ThemeToggle
   - Implement ThemeToggle component

3. **Integration Tasks**
   - Create Landing Page route at `/`
   - Add theme provider wrapper to App.tsx
   - Add theme detection to existing public pages (LoginPage, RegistrationPage, VerificationPage)
   - Update RegistrationPage to accept `?tier` query parameter

4. **Test Tasks**
   - Write integration tests for landing page journey
   - Write E2E tests (Playwright) for theme persistence, mobile responsiveness
   - Write E2E test for tier pre-selection flow

5. **Polish Tasks**
   - Accessibility audit (WCAG 2.1 AA)
   - Performance optimization (image optimization, bundle size)
   - Responsive design polish (mobile-first testing)

### Estimated Output

25-30 tasks in tasks.md (generated by /tasks command), covering:
- 3-5 setup/infrastructure tasks
- 4-6 component development tasks (LandingPage, ThemeToggle, LandingPageHero, PricingTiers, FeaturesList, ComplianceSection)
- 4-5 integration tasks (routes, theme propagation)
- 6-8 test tasks (unit, integration, E2E)
- 2-3 polish/optimization tasks

---

## Complexity Tracking

_No constitution violations or deviations from standard patterns_

| Item | Status | Notes |
|------|--------|-------|
| Database Changes | None | Feature is frontend-only |
| New API Endpoints | None | Reuses `/registration?tier=X` pattern |
| Architecture Changes | Minimal | Adds React Context for theme (standard pattern) |
| Test Coverage | Comprehensive | Unit, integration, and E2E planned |

---

## Progress Tracking

**Phase Status**:
- [x] Phase 0: Research complete (/plan command) — 2026-02-18
- [x] Phase 1: Design complete (/plan command) — 2026-02-18
- [ ] Phase 2: Task planning complete (/tasks command)
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: QA Testing complete
- [ ] Phase 6: Human Testing & Beta complete
- [ ] Phase 7: Release complete

**Gate Status**:
- [x] Initial Constitution Check: PASS (2026-02-18)
- [x] Post-Design Constitution Check: PASS (2026-02-18)
- [x] All NEEDS CLARIFICATION resolved (spec clarification Q1 resolved)
- [x] Phase 0 Research complete
- [x] Phase 1 Design complete (data model, contracts, quickstart, agent context)

**Next Step**: Run `/speckit.tasks` to generate tasks.md

---

_Based on Constitution v1.2.0 — See `.specify/memory/constitution.md`_
