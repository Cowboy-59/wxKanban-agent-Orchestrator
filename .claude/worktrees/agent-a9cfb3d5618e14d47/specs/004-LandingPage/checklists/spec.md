# Feature Specification: wxKanban Public Landing Page

**Feature Branch**: `005-specs-004-landingpage`
**Created**: 2026-02-18
**Status**: Draft
**Input**: User description from specs/004-LandingPage/Scopt.md

---

## Feature Summary

The wxKanban Landing Page is the public-facing entry point for the platform. It serves as the primary marketing surface for enterprise and professional teams evaluating a SaaS task management solution. The page must communicate the core value proposition, establish security credibility through recognized compliance certifications (SOC 2 and HITRUST), present the subscription tier options for self-service purchase decisions, and direct visitors to authentication actions (login or registration). The page supports both light and dark display modes across all viewports, and this theme preference must be applied consistently to all public-facing pages (landing, login, registration, verification). The visual design uses a data center environment as the hero imagery to evoke infrastructure-grade reliability and enterprise trustworthiness.

**Target Visitors**:
- Decision-makers evaluating the platform for their team (pricing-focused)
- Developers or consultants returning to sign in (direct CTA)
- New company administrators ready to register (conversion-focused)

**Core Conversion Goal**: Move visitors from awareness to action — either initiating company registration or signing in — with confidence established through compliance signaling and clear tier pricing.

---

## User Scenarios and Testing

### Primary User Story 1: Prospect Evaluating for Purchase

**As a** team lead or IT administrator visiting wxKanban for the first time,
**I need to** quickly understand what the platform does, what it costs, and whether it meets our security standards,
**So that** I can make a confident purchasing decision or bring it forward for approval.

**Acceptance Scenarios**:

1. **Given** a visitor lands on the root URL, **When** the page loads, **Then** they immediately see a hero section with the product name, a one-sentence value proposition, and a data center background image that includes both the SOC 2 and HITRUST compliance marks.

2. **Given** a visitor scrolls past the hero, **When** they reach the pricing section, **Then** they see all three subscription tiers (Free, Consultant, Enterprise) displayed side-by-side with pricing, feature highlights per tier, and a primary call-to-action button for each tier that initiates registration.

3. **Given** a visitor clicks the call-to-action on any pricing tier, **When** the registration flow begins, **Then** the page navigates to `/registration`.

4. **Given** a visitor is on the landing page, **When** they view the compliance section, **Then** they can see both SOC 2 and HITRUST certification marks with a brief description of what each certification means for data security.

### Primary User Story 2: Returning User Seeking Login

**As a** registered company administrator or team member,
**I need to** quickly find the sign-in button from the landing page,
**So that** I can access my dashboard without navigating through marketing content.

**Acceptance Scenarios**:

1. **Given** a registered user lands on the root URL, **When** the page loads, **Then** they see a clearly labeled "Sign In" button in the navigation bar without needing to scroll.

2. **Given** a user clicks "Sign In", **When** they are redirected, **Then** the login page loads and the URL reflects `/login`.

3. **Given** a user is already authenticated, **When** they navigate to the landing page root URL, **Then** they are automatically redirected to their dashboard.

### Primary User Story 3: Theme Preference

**As any** visitor,
**I need to** experience the page in my preferred display mode (light or dark),
**So that** the interface matches my system preferences and is comfortable to view.

**Acceptance Scenarios**:

1. **Given** a visitor's operating system or browser is set to dark mode, **When** they load the landing page, **Then** the page renders in dark mode automatically.

2. **Given** a visitor is on the landing page, **When** they toggle the theme switcher in the navigation, **Then** the entire page switches between light and dark mode immediately without a page reload.

3. **Given** a visitor sets a theme preference on the landing page, **When** they navigate to the login or registration page, **Then** the same theme is applied to those pages.

4. **Given** a visitor returns to the site in a new session, **When** the page loads, **Then** their previously selected theme preference is restored.

### Primary User Story 4: Mobile Visitor

**As a** visitor accessing the site on a mobile device,
**I need to** the page to be fully readable and usable on a small screen,
**So that** I can evaluate the product and find the sign-in or registration action regardless of my device.

**Acceptance Scenarios**:

1. **Given** a visitor opens the landing page on a mobile device (320px to 768px width), **When** the page renders, **Then** all content is readable without horizontal scrolling and the navigation collapses to a mobile-friendly menu.

2. **Given** a visitor on mobile views the pricing section, **When** the page renders, **Then** the tier cards stack vertically with full readability, and each tier's CTA button is tappable with a minimum 44px touch target.

3. **Given** a visitor on mobile views the hero section, **When** the page renders, **Then** the data center image and compliance badges are visible and not cropped in a way that obscures the SOC 2 or HITRUST marks.

---

## Functional Requirements

### Navigation Bar

**FR-001**: The landing page MUST display a persistent navigation bar at the top of the viewport containing: the wxKanban product name or logo, a "Sign In" button, and a "Get Started" or "Register" button.

**FR-002**: The navigation bar MUST remain visible (sticky) as the visitor scrolls down the page.

**FR-003**: The navigation bar MUST include a theme toggle control (light/dark mode switcher) accessible without scrolling.

**FR-004**: The navigation bar MUST collapse into a mobile-friendly menu (hamburger or equivalent) on viewports narrower than 768px, with all navigation items accessible from the collapsed menu.

**FR-005**: Clicking "Sign In" MUST navigate the visitor to the existing `/login` route.

**FR-006**: Clicking "Get Started" or "Register" MUST navigate the visitor to the existing `/registration` route.

**FR-007**: A visitor who is already authenticated MUST be redirected from the landing page root URL to `/dashboard` automatically.

### Hero Section

**FR-008**: The landing page MUST display a hero section as the first visible content area, featuring a full-width background image depicting a data center environment.

**FR-009**: The hero section background image MUST visually incorporate both the SOC 2 and HITRUST compliance certification marks. These marks MUST be rendered within or directly alongside the hero image in a manner that communicates verified security posture.

**FR-010**: The hero section MUST include a headline communicating the primary value proposition of the platform (e.g., unified task management and time tracking for professional teams).

**FR-011**: The hero section MUST include a sub-headline or descriptive sentence that expands on the headline without technical jargon.

**FR-012**: The hero section MUST include at least one primary call-to-action button directing visitors to registration.

**FR-013**: The hero section MUST be readable in both light and dark mode, with sufficient contrast between text and the background image.

### Compliance and Trust Section

**FR-014**: The landing page MUST include a dedicated section explicitly presenting wxKanban's compliance certifications: SOC 2 and HITRUST.

**FR-015**: Each compliance certification displayed MUST include the official certification mark or badge alongside a brief plain-language description (one to two sentences) of what that certification means for customer data security and privacy.

**FR-016**: The compliance section MUST be visible without requiring the visitor to seek it out — it MUST appear above the fold on desktop or within the first two visible scroll sections on any device.

**FR-017**: The compliance section content MUST adapt to both light and dark modes without loss of badge legibility.

### Pricing and Subscription Tiers Section

**FR-018**: The landing page MUST display a pricing section presenting all three subscription tiers: Free, Consultant, and Enterprise.

**FR-019**: Each tier card MUST display: the tier name, the monthly price (or "Free" as applicable), the user capacity or limit, and a bulleted list of key features included in that tier.

**FR-020**: The pricing display MUST match the tier definitions established in the registration system: Free ($0, up to 5 users), Consultant ($19.95/month, unlimited users), Enterprise ($99.95/month, unlimited users with advanced features).

**FR-021**: Each tier card MUST include a call-to-action button labeled according to the tier: "Get Started Free" for the Free tier, "Start Consultant" for the Consultant tier, and "Contact Sales" or "Get Enterprise" for the Enterprise tier.

**FR-022**: Clicking a tier-specific call-to-action MUST navigate the visitor to the registration flow at `/registration` with the selected tier passed as a URL query parameter (e.g., `/registration?tier=CONSULTANT`). The RegistrationPage MUST accept and process this parameter to pre-select the corresponding tier in the TierSelector component on load. If the `?tier` parameter is absent, invalid, or malformed, the RegistrationPage MUST load normally with the default tier selected (graceful degradation).

**FR-023**: One tier MUST be visually differentiated as the recommended or most popular option (consistent with the existing "Most Popular" indicator on the Consultant tier in the registration flow).

**FR-024**: The pricing section MUST render correctly in both light and dark mode, with tier cards maintaining distinct visual separation and readable text in both modes.

**FR-025**: The pricing section MUST display tier cards in a three-column grid layout on desktop and a single-column stacked layout on mobile.

### Features and Value Proposition Section

**FR-026**: The landing page MUST include a section summarizing the core feature categories of the platform. These categories MUST reflect capabilities already specified in existing features: multi-platform PM integration, time tracking and billing, invoicing, AI-assisted task management, and the 6-phase project lifecycle methodology.

**FR-027**: Each feature category MUST be presented with a short label and one to two sentences of plain-language description. No technical implementation details MUST appear in this section.

**FR-028**: The features section MUST adapt to both light and dark modes.

### Theme System

**FR-029**: The landing page MUST detect and apply the visitor's operating system or browser dark mode preference (via the `prefers-color-scheme` media feature) as the default theme on first visit.

**FR-030**: The landing page MUST provide a manual theme toggle control visible in the navigation bar that allows the visitor to switch between light mode and dark mode at any time.

**FR-031**: The visitor's manually selected theme preference MUST be persisted across sessions so that returning visitors are shown their preferred theme without needing to toggle again.

**FR-032**: The theme preference set on the landing page MUST apply consistently to all public-facing pages in the application: landing page, login page, registration page, and email verification page.

**FR-033**: Theme switching MUST occur without a full page reload — the transition MUST be immediate and not cause visible layout shifts.

**FR-034**: In dark mode, all text MUST maintain sufficient contrast against dark backgrounds. In light mode, all text MUST maintain sufficient contrast against light backgrounds. Both modes MUST meet WCAG 2.1 Level AA contrast requirements.

### Authentication Call-to-Action (CTA)

**FR-035**: The landing page MUST present at least two opportunities for a visitor to initiate registration: one in the navigation bar and one in the hero section, with additional opportunities in the pricing tier cards.

**FR-036**: The landing page MUST present at least one clearly visible "Sign In" link or button accessible without scrolling (in the navigation bar).

**FR-037**: The landing page MUST NOT require a visitor to log in or create an account to view pricing, compliance information, or feature descriptions.

### Performance and Accessibility

**FR-038**: The landing page MUST load to first visible content in under 3 seconds on a standard broadband connection.

**FR-039**: The hero background image MUST be optimized for web delivery so it does not become the primary cause of slow page load. The compliance marks and text overlay MUST remain visible during image load.

**FR-040**: All interactive elements (buttons, navigation links, theme toggle) MUST be keyboard-navigable and include appropriate accessible labels.

**FR-041**: The compliance certification marks MUST include text alternatives so that visitors using assistive technology receive equivalent information.

---

## Key Entities

**Landing Page Configuration**: A logical representation of the landing page content — hero copy, compliance badge references, feature descriptions, and any CMS-controlled content. Not a database entity; content may be static or configurable via environment-level settings.

**Theme Preference**: A visitor-level preference (light or dark mode) persisted in the browser's local storage. Not tied to a user account record; applies to unauthenticated visitors as well as authenticated users on public pages.

**Subscription Tier (referenced, not new)**: The existing Free, Consultant, and Enterprise tier definitions from the registration system (spec-003). The landing page reads and displays these tier definitions; it does not create or modify them. The pricing displayed on the landing page MUST match the authoritative tier configuration in the system.

**Compliance Certification (display-only)**: The SOC 2 and HITRUST certification marks and their descriptive copy. These are display assets (images + text); no entity is stored in the database. They are displayed to signal external audit and certification status to prospective customers.

---

## Success Criteria

1. **Visitor Conversion Rate**: At least 15% of unique visitors who view the pricing section initiate the registration flow (click a tier CTA) within the same session.

2. **Sign-In Discoverability**: 100% of usability test participants can locate and click "Sign In" without scrolling or assistance, within 5 seconds of landing on the page.

3. **Compliance Visibility**: 100% of usability test participants can identify both the SOC 2 and HITRUST certifications on the hero or compliance section without being prompted to find them.

4. **Theme Persistence**: The visitor's theme preference persists across sessions with 100% consistency — a visitor who selected dark mode returns to dark mode on subsequent visits without any toggle action.

5. **Theme Coverage**: Light and dark mode renders correctly across all four public-facing pages (landing, login, registration, verification) with zero visible contrast failures in either mode.

6. **Page Load Performance**: The landing page achieves a Largest Contentful Paint (LCP) score under 3 seconds on a simulated broadband connection, as measured by Lighthouse or equivalent tooling.

7. **Mobile Usability**: All primary CTAs (Sign In, tier-specific Get Started buttons) are tappable on a 375px-wide viewport with no overlap or clipping.

8. **Pricing Accuracy**: The prices and feature lists displayed on the landing page match the values returned by the `/api/payment/validate` endpoint with zero discrepancies at time of release.

9. **Accessibility Compliance**: The landing page achieves a WCAG 2.1 Level AA audit score, with all interactive elements keyboard-accessible and all images carrying text alternatives.

10. **Tier Pre-Selection Flow**: Visitors who click a specific tier CTA on the landing page arrive at the registration flow with that tier pre-selected on the tier selection step. The landing page passes the tier via URL query parameter (`?tier=CONSULTANT`), and the registration page automatically selects that tier in the TierSelector component.

---

## Assumptions

1. The landing page is served at the application root URL (`/`). Authenticated users visiting this URL are redirected to `/dashboard`. Unauthenticated users see the public landing page.

2. The existing `/login` and `/registration` routes are fully functional and will not require modification as part of this feature. The landing page links to them as-is.

3. The registration page will need to be updated to accept and process a `?tier=CONSULTANT` URL query parameter and pre-select the corresponding tier in the TierSelector component on load. This update is in scope for the landing page feature and is a prerequisite for FR-022.

4. SOC 2 and HITRUST certification marks are official, licensed assets that the organization holds authorization to display. Obtaining or verifying these assets is outside the scope of this feature specification.

5. The three subscription tiers (Free, Consultant, Enterprise) and their pricing are the canonical tiers from spec-003. The landing page does not define pricing; it reflects the authoritative configuration already established.

6. A theme toggle mechanism (light/dark) does not currently exist in the application. This feature introduces it for the first time. Subsequent features (admin dashboard, task board, etc.) will inherit the same preference mechanism but may require their own implementation work.

7. The data center background image is a design asset to be sourced or licensed for production use. This specification does not prescribe a specific image but requires it to be a high-resolution photograph or illustration of a data center environment that can accommodate compliance mark overlays.

8. Feature descriptions on the landing page are marketing copy and do not need to match the exact functional requirement language from existing specs. They must be accurate but written for a non-technical audience.

9. The landing page is a single public page, not a multi-page marketing site. No blog, documentation, or support center links are in scope for this feature.

10. Analytics integration (page view tracking, conversion events) is desirable but not required for the initial release of this feature.

---

## Clarifications Resolved

### Session 2026-02-18

**Q1 — Tier Pre-Selection Scope**: ✅ **RESOLVED**
- **Decision**: Yes — tier pre-selection is in scope
- **Implementation**: Landing page will pass tier via `?tier=CONSULTANT` URL parameter; RegistrationPage must accept and use this parameter to pre-select the tier
- **Scope Impact**: Both landing page and registration page updates required

**Q2 — Tier Parameter Validation & Invalid Values**: ✅ **RESOLVED**
- **Question**: What should happen if user navigates to `/registration?tier=INVALID` or the parameter is malformed?
- **Answer**: Option A — Silently ignore invalid `?tier` parameter; load RegistrationPage with default tier
- **Rationale**: Graceful degradation provides best user experience. Invalid parameters are rare (only manual URL edits or analytics/tracking tools). Users can always select a tier manually if needed.
- **Impact on FR-022**: Updated to explicitly state that invalid/absent parameters result in loading with default tier selected

---

## Critical Files for Reference

- `src/client/components/TierSelector.tsx` — Authoritative tier definitions, pricing ($0, $19.95, $99.95), and feature lists
- `src/client/pages/RegistrationPage.tsx` — May need update for tier pre-selection (Q1)
- `src/client/pages/LoginPage.tsx` — Target route for "Sign In" CTA
- `src/client/pages/VerificationPage.tsx` — One of 4 public pages needing theme mode support
- `.specify/templates/spec-template.md` — Spec structure reference
