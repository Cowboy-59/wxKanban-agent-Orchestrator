# Research & Design Decisions: Admin & Company Management

**Feature**: 002-admin-management
**Created**: 2026-02-14
**Purpose**: Document research, design rationale, and key decisions

---

## Multi-User Team Architecture Decision

### Research Topic

How should wxKanban scale from single-user to multi-user team environment?

### Options Considered

**Option A: Company-based isolation (CHOSEN)**

- One company = one organizational unit with multiple users
- Users isolated by company (cannot access data from other companies)
- Supports team collaboration within company boundary
- Billing aggregated at company level
- **Rationale**: Cleanest isolation model, familiar from Monday.com/Asana architecture, easy to audit

**Option B: Team-based isolation**

- One team = one organizational unit
- User can belong to multiple teams with different roles
- More flexible but adds complexity
- **Rationale**: Deferred for Phase 2; company-based sufficient for MVP

**Option C: No isolation (rejected)**

- Single global user pool
- Would require complete redesign of billing and privacy model
- **Rationale**: Unacceptable for multi-tenant SaaS

### Decision Outcome

Implement **Option A**: Company-based isolation with single company per user account. Users can be invited to multiple companies with separate contexts. Each company completely isolated.

**Impact on Architecture**:

- All queries filtered by `companyid` in WHERE clause
- Foreign key constraints enforce company isolation
- JWT token includes `companyid` for request context
- Audit logs track company-level changes

---

## Rate Hierarchy Design

### Research Topic

How should system handle conflicting billing rates when user assigned to project within company?

### Rate Scenarios

- Company default: $150/hour (all projects, all users)
- Project override: $200/hour (only users on this project)
- User override: $250/hour (only this user, all projects)
- **Conflict**: User assigned to $200 project but has $250 user rate

### Hierarchy Decision

**Strict precedence**: User rate > Project rate > Company rate

- User-specific rate always takes precedence (consultant with premium rate)
- Project rate overrides company default (high-priority client project)
- Company rate is fallback default
- **Rationale**: Business-driven: higher-priority overrides lower. Easy to understand, deterministic.

### Implementation Details

- Rate effective on TimeEntry creation date (not current date)
- Enables historical invoicing with rates from entry date
- Changes to rates don't affect historical entries
- Audit trail tracks all rate modifications

---

## Role-Based Access Control (RBAC) Design

### Research Topic

What role structure best serves team collaboration and administrative separation?

### Option Considered

**Three-role model (CHOSEN)**

1. **Admin**: Full company control (users, projects, billing, reports)
2. **TeamManager**: Team coordination (projects, user assignment, dashboards) but NO billing access
3. **Developer**: Task/time tracking only (view own projects, create tasks, track time)

**Rationale**:

- Separates billing concerns from team management
- Prevents accidental billing changes by non-finance teams
- Still allows operational control by team leads
- Simple for developers (no admin UI concerns)
- Matches Monday.com/Asana typical roles

### Alternative Considered: Permission-based model

- More granular (view projects, edit projects, manage users, etc.)
- **Rejected**: Too complex for MVP, can be added later as enhancement

---

## User Invitation Workflow Design

### Research Topic

How should system handle user onboarding and email-based invitations?

### Key Decisions

**1. Email Verification for Registration**

- Company verification required before any feature access
- Link valid for 7 days (standard)
- **Rationale**: Prevents typos in billing email

**2. Invitation Tokens**

- 256-bit cryptographically random tokens
- Valid for 7 days from issue
- Can be resent (generates new token)
- **Rationale**: Standard for SaaS invitation patterns

**3. Pre-Assignment of Roles**

- Admin can pre-assign role during invitation (instead of default)
- Role applied when user claims invitation
- **Rationale**: Reduces onboarding friction; user joins with correct permissions

**4. Role Configuration Options**

- All users must explicitly be added by Admin (no self-signup)
- Prevents unauthorized access to company data
- **Rationale**: Enterprise-grade access control

---

## Data Migration Strategy

### Research Topic

How should legacy userprofile/company data migrate to new wxKanban structure?

### Migration Approach

**Phase A: Schema setup (immediate)**

1. Create wxkanban schema (separate from public schema with legacy tables)
2. Define new entities with mappings to legacy fields
3. Set up migration scripts

**Phase B: Incremental migration (after validation)**

1. Create legacy_mapping table with: {legacyid → newuuid, entitytype, mappedat}
2. Migrate user data: userprofile → company + user tables
3. Migrate projects: projects → project table
4. Migrate tasks: projecttasks → task table (legacy PM source tracked)
5. Preserve all audit trails via migration log

**Phase C: Validation & rollback capability**

1. Data checksums before/after migration
2. Foreign key validation queries
3. Backups available for 30 days
4. Rollback procedures documented

**Decisions**:

- Never delete legacy data (retained for compliance)
- Maintain read-only connection to legacy tables during transition
- Provide query-time lookups: legacy_id → new_uuid
- Migration is one-way (no sync back to legacy system)

---

## Invoice Generation & Delivery

### Research Topic

How should system generate, store, and deliver invoices?

### Key Decisions

**1. Invoice Number Format**

- Format: `INV-YYYY-NNN` (e.g., INV-2026-001, INV-2026-002)
- Unique per company (different companies can reuse numbers)
- Automatically incremented
- **Rationale**: Human-readable, company-scoped, industry standard

**2. Invoice Generation**

- Use Puppeteer for PDF rendering (HTML template → PDF)
- Company branding incorporated (logo, company name, address)
- Line-item breakdown by user and project
- **Rationale**: Flexible template system, no external dependencies

**3. PDF Storage**

- Upload to AWS S3 (or equivalent cloud storage)
- Generate signed download URLs (valid for 30 days)
- After 30 days, URL expires but PDF retained in S3
- **Rationale**: Scalable, secure, long-term retention

**4. Email Delivery**

- Optional: Send invoice email to billing contact
- Use Resend/SendGrid for reliability
- 99% delivery requirement
- **Rationale**: Standard SaaS practice, tested providers

**5. Duplicate Prevention**

- Mark TimeEntry records with invoiced=true after invoice generation
- Query prevents re-billing of already-invoiced entries
- If invoice regenerated, only includes un-invoiced entries
- **Rationale**: Critical for billing accuracy, prevents disputes

---

## Email Notification Strategy

### Research Topic

How should system notify administrators about company activity?

### Daily Summary Email Design

- **Scheduled**: Administrator-configurable time (default 6am)
- **Frequency**: Daily, Weekly (Monday), or Monthly (1st)
- **Recipients**: Multiple admin emails per company
- **Content**:
  - Active projects and completion status
  - Billable hours tracked
  - Team activity feed
  - Top contributors by hours
  - Revenue summary
  - Outstanding invoices

**Rationale**: Keeps admins informed without dashboard login; reduces surprise issues

### Alert Emails

- Invitation expiring in 48 hours
- Payment method expiring soon
- Company deactivation initiated
- Suspicious access attempts (future)

---

## Data Integrity & Audit Trail

### Research Topic

How should system ensure data integrity and support audit/compliance?

### Audit Trail Implementation

- CompanyAuditLog table captures all company-level changes
- Fields: timestamp, action, changedby user, before/after state (JSON)
- Immutable: only INSERT, never UPDATE/DELETE
- Retained indefinitely (7-year minimum for tax compliance)

**Use Cases**:

- Billing disputes: "What rate was applied on 2026-02-10?"
- Access control audits: "Who changed this user's role?"
- Compliance: "Show all changes to company billing setup"

### Data Preservation Rules

- Time entries preserved even after user deactivation (for invoicing)
- Projects preserved even after removal from project (for historical queries)
- Invoices preserved permanently (accounting records)
- Users preserved even when deactivated (for audit trail)

---

## Performance Considerations

### Research Topic

How should system optimize for common query patterns?

### Key Performance Decisions

**1. Denormalized Metrics**

- Dashboard caches key metrics (user count, billable hours, revenue)
- Updated daily batch job (vs. real-time calculation)
- Acceptable staleness: 24 hours
- **Rationale**: Complex calculations; dashboard load < 3 seconds

**2. Database Indexes**

- (companyid) on all company-scoped tables for filtering
- (userid, companyid) for cross-user queries
- (timestamp) on audit logs for date-range queries
- (invoicedat) on timeentry for billing queries
- **Rationale**: Most queries filter by company first

**3. Report Caching**

- Report results cached for 1 hour
- Identical requests within 1 hour return cached result
- Cache invalidated on new time entry/invoice
- **Rationale**: Reports are expensive; users often rerun same report

**4. Connection Pooling**

- Min 5, Max 20 connection pool (configurable)
- Connection timeout 30 seconds
- Query timeout 30 seconds
- **Rationale**: Prevent connection exhaustion under load

---

## Security Considerations

### Research Topic

What security measures protect company and user data?

### Key Decisions

**1. Company Isolation (Technical)**

- All queries filtered by companyid from JWT token
- Application-level filtering (in addition to database FK)
- Cannot override company in request body
- **Rationale**: Defense in depth

**2. Sensitive Data Protection**

- Tokens and credentials encrypted at rest (AES-256-GCM)
- Passwords hashed with bcrypt (min 10 rounds)
- No sensitive data in audit logs (logs contain hashed versions)
- **Rationale**: Industry standard security practices

**3. Rate Limiting**

- 100 requests/minute per user (prevents brute force)
- 10 requests/minute for bulk operations (prevents CSV bomb)
- IP-based temporary block after 5 failed auth attempts
- **Rationale**: Prevent abuse

**4. API Key Rotation**

- JWT tokens valid for 24 hours
- Refresh tokens stored server-side (not in JWT)
- Token revocation on logout (immediate)
- **Rationale**: Limit exposure window

---

## Billing & Revenue Tracking

### Research Topic

How should system track company financial performance?

### Financial Metrics Implemented

- **Revenue**: SUM(hours × applicable rate)
- **Billable vs. Non-billable**: Tracked per timeentry
- **Utilization**: billable_hours / total_hours
- **Monthly Recurring Revenue (MRR)**: Active subscriptions × plan price
- **Project Profitability**: revenue - (allocated_hours × rate)

**Report Types**:

1. Revenue by month
2. Hours by user
3. Project profitability
4. Team utilization

---

## Operational Decisions

### Monitoring & Alerting

- Monitor invoice generation success rate (should be 100%)
- Monitor email delivery success rate (should be >99%)
- Alert on failed user invitations
- Alert on payment processing failures

### Backup & Recovery

- Daily automated backups (7-day retention)
- Backup tested weekly with restoration
- RTO (Recovery Time Objective): 1 hour
- RPO (Recovery Point Objective): 1 day

### Deployment Strategy

- Blue-green deployment for zero downtime
- Canary releases for new features
- Feature flags for gradual rollout
- Automatic rollback on error detection

---

## Future Enhancements (Out of Scope)

- **Phase 2**: Team/department hierarchies
- **Phase 2**: Custom workflows and approval processes
- **Phase 3**: Advanced analytics and predictive insights
- **Phase 3**: Mobile app
- **Phase 4**: Multi-currency billing
- **Phase 4**: Compliance modules (SOC 2, GDPR reporting)

---

## Design Rationale Summary

| Decision                     | Rationale                            | Risk Mitigation                     |
| ---------------------------- | ------------------------------------ | ----------------------------------- |
| Company-based isolation      | Clean, familiar model                | All queries filtered by companyid   |
| Strict rate hierarchy        | Deterministic, business-driven       | Audit trail tracks all rate changes |
| Three-role RBAC              | Balance security and usability       | Permission matrix tested in QA      |
| 7-day invitation links       | Standard SaaS practice               | Email reminder before expiration    |
| Data never deleted           | Compliance and audit trail           | Soft deletes via flags (activeflag) |
| Invoice number per company   | Simpler than global sequence         | Prefix prevents collisions          |
| Puppeteer PDF generation     | Flexible templates, no external deps | Template testing for all scenarios  |
| Daily email summaries        | Balance information flow             | Configurable frequency per user     |
| JWT token in Bearer header   | Standard REST security               | 24-hour expiration + refresh tokens |
| Company metrics cached daily | Performance (dashboard < 3s)         | Acceptable 24-hour staleness        |

---

---

## Subscription Tier Naming Convention

### Research Topic

What values should `billingplan` store in the database, and how should tiers be distinguished for feature gating?

### Decision

**Uppercase enum strings** stored directly in `companies.billingplan`:

| Value | Display Name | Price |
|---|---|---|
| FREE | Free | $0/month |
| SMALL_BUSINESS | Small Business | $0/month |
| CONSULTANT | Consultant | $29.95/month |
| ENTERPRISE | Enterprise | $59.95/month + $5/user >25 |

**Rationale**: Uppercase values are unambiguous in code, no case-sensitivity issues, clear distinction from prior 'Free'/'Professional'/'Enterprise' values. SMALL_BUSINESS is a free tier with basic invoicing — distinct from FREE which has no invoicing.

**Migration note**: Existing data using 'Free'/'Professional'/'Enterprise' values must be migrated to uppercase equivalents before new features deploy.

---

## Role-Conditional Navigation (AppShell) Design

### Research Topic

How should the UI distinguish admin-only navigation from team-member navigation without duplicating layout code?

### Decision

**Single AppShell component** with sidebar nav rendered conditionally based on `user.usertype` and `company.billingplan` from AuthContext.

**Admin nav items (usertype = ADMIN)**:
1. Dashboard, 2. Team Members, 3. Projects, 4. PM Integrations (tier-gated), 5. Time & Billing (tier-gated), 6. Invoices (tier-gated), 7. Reports (tier-gated), 8. Settings

**Team nav items (usertype = TEAM)**:
1. Dashboard, 2. Time Tracking, 3. PM Integrations, 4. Projects (assigned)

**Rationale**: One shell avoids duplication. Role-conditional rendering is simpler to maintain than two separate layouts. Subscription data needed at nav-render time is already in AuthContext.

---

## Tier-Gated Feature Pattern (Visible-But-Locked)

### Research Topic

Should locked features be hidden from ineligible users or shown with upgrade prompts?

### Decision

**Visible-but-locked pattern**: Locked sections always appear in sidebar nav. Content area renders a locked state with:
- Section heading + grayed icon
- Feature description (value proposition)
- Badge: "Requires CONSULTANT" (or "Requires ENTERPRISE")
- "Upgrade Plan" CTA → routes to plan upgrade flow

**Rejected alternative**: Hide sections from nav entirely.
- **Rationale for rejection**: Upsell opportunity lost. Users don't know what features they're missing. Upgrade path is invisible.

**Server-side enforcement**: Locked feature API endpoints return `403 Forbidden` with `{ "error": "Feature requires CONSULTANT plan", "upgrade": true }` — client-side hiding is supplementary only.

**Reusable component**: `UpgradeLock` wraps any section with the locked state. Takes `requiredPlan` and `featureName` props.

---

## User Classification Model (post-clarify decision)

**Updated**: 2026-02-19 — resolved via speckit.clarify Q1

### Research Topic

How should wxKanban classify users for navigation, access control, and feature gating? Two competing models existed in the spec artifacts: `usertype` (ADMIN/TEAM) in spec.md vs. `role` (Admin/TeamManager/Developer) in data-model.md.

### Decision

**Three-tier `usertype` field — single classification source**:

| Value | Nav Shell | Description |
|---|---|---|
| `ADMIN` | 8-item admin shell (all active) | Full control: billing, team management, settings, all tier-gated features |
| `TEAM_MANAGER` | 8-item admin shell + 3 role-locked | Can manage projects and team members within scope; Time & Billing / Invoices / Reports role-locked ("Requires Admin"); assignable by ADMIN on CONSULTANT+ plans only |
| `TEAM_MEMBER` | 4-item basic shell | Can track time and view assigned projects; no billing, no admin |

**Rationale**: Three-tier model enables TEAM_MANAGER delegation without granting billing access. Cleaner than a separate `role` field. Single field drives both nav and API authorization.

**Removed**: The `role` (Admin/TeamManager/Developer) field from data-model.md. All role logic consolidated into `usertype`.

**Role-lock vs tier-lock distinction**:
- **Tier-locked**: Feature requires a higher subscription plan → shows "Requires CONSULTANT" badge with "Upgrade Plan" CTA
- **Role-locked**: Feature requires ADMIN usertype → shows "Requires Admin" message, no upgrade path (TEAM_MANAGER has correct plan, wrong usertype)

**Components**: `UpgradeLock.tsx` for tier-locks, `RoleLock.tsx` for role-locks (parallel component).

---

**All design decisions documented and justified. Ready for implementation planning.**
