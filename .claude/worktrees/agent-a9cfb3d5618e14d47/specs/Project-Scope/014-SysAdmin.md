add# SysAdmin Specification

## Overviewab

The **SysAdmin** (System Administrator) is the platform-level administrator who owns and manages the entire wxKanban SaaS platform. Unlike company-level **ADMIN** users who manage their own organizations, the SysAdmin has cross-tenant visibility and control over all companies, users, and system-wide settings.

## Role Definition

### SysAdmin vs Company Admin

| Aspect | SysAdmin (Platform Level) | ADMIN (Company Level) |
|--------|---------------------------|----------------------|
| **Scope** | All companies/tenants | Single company only |
| **User Management** | All users across platform | Company users only |
| **Billing** | Platform revenue, all subscriptions | Own company subscription only |
| **System Settings** | Global configuration, feature flags | Company settings only |
| **Audit Access** | System-wide audit logs | Company audit logs only |

## Core Responsibilities

### 1. Client/Customer Management (Companies)

The SysAdmin manages all client companies on the platform:

- **Company Lifecycle Management**
  - View all registered companies with status (Active, Suspended, Trial, Cancelled)
  - Create companies manually (on behalf of clients)
  - Suspend/activate company accounts
  - Delete companies (with data retention policies)
  - Extend trials, modify subscription tiers

- **Company Analytics**
  - Company growth metrics (new signups, churn)
  - Revenue per company
  - Usage statistics (projects, tasks, users)
  - Health scores (engagement, feature adoption)

### 2. User Management (Cross-Tenant)


Manage all users across the platform:

- **Global User Directory**
  - Search users by email, name, company
  - View user activity across all companies
  - Reset passwords for any user
  - Disable/enable user accounts globally

- **Support Functions**
  - View user's project access and permissions
  - Transfer user between companies
  - Merge duplicate accounts

### 3. System Health & Monitoring

Enhanced system diagnostics beyond company-level admin:

- **Platform Metrics**
  - Total active users, companies, projects
  - Database performance and growth trends
  - API usage statistics and rate limiting
  - Error rates and system alerts

- **Infrastructure Monitoring**
  - Server health across all instances
  - Background job queue status
  - Email delivery statistics
  - Third-party integration health (Stripe, Mailgun, PM systems)

### 4. Security & Compliance

- **Security Monitoring**
  - Failed login attempts across platform
  - Suspicious activity detection
  - IP blocking and rate limiting management
  - Session management (view/kill active sessions)

- **Compliance & Audit**
  - GDPR: Data export/deletion requests
  - HIPAA audit trails (if applicable)
  - SOC2 compliance reporting
  - Data retention policy enforcement

### 5. Subscription Management & Billing Operations

- **Subscription Analytics**
  - Real-time subscription metrics (Free, Consultant, Enterprise counts)
  - Revenue recognition and forecasting
  - Failed payment tracking with retry schedules
  - Expired subscription reports with grace period management

- **Automated Email Campaigns**
  - Configurable email templates for billing events
  - Automated dunning sequences for failed payments
  - Pre-expiration warning emails (7 days, 1 day before)
  - Post-expiration grace period notifications
  - Reactivation campaigns for churned subscribers

- **Manual Billing Operations**
  - Apply credits or discounts to companies
  - Force immediate billing retry
  - Extend grace periods manually
  - Issue refunds and process adjustments

- **Free Tier Management**
  - Enable/disable free subscriptions globally
  - Set maximum number of free subscriptions allowed
  - View free tier usage and limits
  - Convert free subscribers to paid with incentives

- **Pricing Management**
  - Configure subscription tier pricing (Consultant, Enterprise)
  - Set promotional pricing for new subscribers
  - Manage pricing tiers and feature bundles
  - Schedule price changes with effective dates

### 6. Marketing Campaign Management

- **Campaign Creation & Planning**
  - AI-powered campaign assistant for strategy and content
  - Campaign templates (welcome series, re-engagement, product launches)
  - Multi-channel campaigns (email, in-app, social)
  - Budget allocation and cost tracking
  - Audience targeting and segmentation

- **AI Campaign Assistant**
  - Natural language chat interface for campaign ideation
  - Automatic content generation (subject lines, body copy, CTAs)
  - Campaign timing recommendations
  - Competitive analysis and market insights
  - A/B test suggestions

- **Financial Projections**
  - Projected campaign costs (creative, distribution, tools)
  - Expected conversion rates and revenue impact
  - ROI calculations with confidence intervals
  - Customer acquisition cost (CAC) projections
  - Lifetime value (LTV) impact estimates

- **Campaign Analytics**
  - Real-time performance dashboards
  - Conversion tracking and attribution
  - Revenue impact analysis
  - A/B test results and statistical significance
  - Campaign comparison and benchmarking

### 7. System Configuration


- **Global Settings**
  - Feature flags (enable/disable features globally)
  - Default subscription tiers and pricing
  - Email template management
  - System maintenance mode
  - **Email automation rules and scheduling**
  - **Free tier availability and limits**
  - **Pricing configuration and promotional rates**
  - **Marketing campaign defaults and branding**

- **Integration Management**

  - Configure global PM system integrations
  - Manage API keys for third-party services
  - Webhook configuration
  - **Email service provider configuration (Mailgun/SendGrid)**

- **Marketing & Campaign Tools**
  - Campaign management platform integrations
  - Analytics provider configuration (Google Analytics, Mixpanel)
  - Social media API connections
  - AI service configuration for campaign assistance


## SysAdmin Dashboard Features


### Navigation Structure

```
/sysadmin/dashboard         → Overview/Analytics
/sysadmin/companies         → Company Management
/sysadmin/users             → Global User Directory
/sysadmin/billing           → Revenue & Subscriptions
/sysadmin/audit             → System Audit Logs
/sysadmin/health            → System Health & Monitoring
/sysadmin/settings          → Global Configuration
/sysadmin/marketing        → Marketing Campaigns
/sysadmin/support          → Support Tools

```

### Dashboard Components

1. **Platform Overview Widgets**
   - Active companies count with trend
   - Total users (MAU/DAU)
   - Monthly recurring revenue (MRR)
   - System health status
   - Recent signups and churn alerts
   - **System-wide project count** (total projects across all companies)
   - **Subscription breakdown** (Free vs Paid counts with percentages)
   - **Expired/Expiring subscriptions** (count and list view)


2. **Company Management Table**
   - Sortable/filterable company list
   - Quick actions (suspend, impersonate, view details)
   - Subscription status indicators
   - Last activity timestamps

3. **Real-time Activity Feed**
   - New company registrations
   - Failed payment alerts
   - Security events (suspicious logins)
   - System errors and warnings

4. **Revenue Dashboard**
   - MRR, ARR, churn rate
   - Revenue by subscription tier
   - Failed payment recovery
   - Trial-to-paid conversion rates
   - Expired subscriptions tracking with renewal alerts

5. **Subscription Tier & Pricing Controls**
   - Free tier enable/disable toggle
   - Free subscription limit configuration
   - Pricing management for paid tiers
   - Promotional pricing setup
   - New subscriber pricing rules


6. **Subscription Management & Email Automation**
   - Subscription status overview (Free vs Paid breakdown)
   - Failed payment detection and automated retry logic
   - Email template configuration for:
     - Failed payment notifications
     - Subscription expiration warnings (7-day, 1-day)
     - Renewal confirmation emails
     - Trial expiration reminders
   - Bulk email campaigns to subscriber segments
   - Email delivery tracking and bounce management

7. **Marketing Campaign Management**
   - Campaign creation wizard with AI chat assistant
   - Campaign templates (email, social, content marketing)
   - Projected cost estimation and budget planning
   - Expected ROI calculations and conversion projections
   - Campaign scheduling and automation
   - Performance metrics (impressions, clicks, conversions, revenue)
   - A/B test results and optimization recommendations




## Technical Implementation

### Database Schema Additions

```typescript
// SysAdmin user type (extends existing users table)
enum UserType {
  TEAM_MEMBER = 'TEAM_MEMBER',
  TEAM_MANAGER = 'TEAM_MANAGER', 
  ADMIN = 'ADMIN',
  SYSADMIN = 'SYSADMIN',  // New platform-level role
}

// System settings table
interface SystemSettings {
  id: string;
  key: string;
  value: any;
  category: 'security' | 'billing' | 'features' | 'maintenance';
  updatedAt: Date;
  updatedBy: string; // sysadmin user id
}

// Company status tracking
enum CompanyStatus {
  ACTIVE = 'ACTIVE',
  TRIAL = 'TRIAL',
  SUSPENDED = 'SUSPENDED',
  CANCELLED = 'CANCELLED',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
}
```

### API Endpoints

```
GET    /api/sysadmin/dashboard          → Platform metrics
GET    /api/sysadmin/companies          → List all companies
POST   /api/sysadmin/companies          → Create company
PATCH  /api/sysadmin/companies/:id      → Update company status
DELETE /api/sysadmin/companies/:id      → Delete company

GET    /api/sysadmin/users              → Global user search
GET    /api/sysadmin/users/:id/activity → Cross-company activity
POST   /api/sysadmin/users/:id/reset    → Force password reset
POST   /api/sysadmin/users/:id/disable  → Disable account

GET    /api/sysadmin/audit              → System audit logs
GET    /api/sysadmin/billing            → Revenue analytics
GET    /api/sysadmin/billing/expired    → Expired subscriptions list
GET    /api/sysadmin/billing/failed     → Failed payment reports
POST   /api/sysadmin/billing/retry      → Retry failed payment

GET    /api/sysadmin/subscription-tiers     → List subscription tiers config
PATCH  /api/sysadmin/subscription-tiers/:id → Update tier pricing/limits
GET    /api/sysadmin/free-tier              → Free tier status and limits
PATCH  /api/sysadmin/free-tier              → Update free tier settings
POST   /api/sysadmin/free-tier/convert      → Bulk convert free to paid

GET    /api/sysadmin/health             → System health diagnostics
GET    /api/sysadmin/settings           → Global settings
PATCH  /api/sysadmin/settings           → Update settings

GET    /api/sysadmin/stats              → Platform statistics (projects, users, subscriptions)

GET    /api/sysadmin/emails/templates     → List email templates

PATCH  /api/sysadmin/emails/templates/:id → Update email template

POST   /api/sysadmin/emails/send          → Send bulk email campaign
GET    /api/sysadmin/emails/delivery      → Email delivery status

GET    /api/sysadmin/marketing/campaigns        → List all campaigns
POST   /api/sysadmin/marketing/campaigns        → Create new campaign
GET    /api/sysadmin/marketing/campaigns/:id    → Campaign details
PATCH  /api/sysadmin/marketing/campaigns/:id    → Update campaign
POST   /api/sysadmin/marketing/campaigns/:id/launch → Launch campaign
POST   /api/sysadmin/marketing/campaigns/:id/pause  → Pause campaign

GET    /api/sysadmin/marketing/ai-chat          → AI campaign assistant chat
POST   /api/sysadmin/marketing/ai-chat          → Send message to AI assistant
POST   /api/sysadmin/marketing/generate         → AI generate campaign content

GET    /api/sysadmin/marketing/templates        → Campaign templates
GET    /api/sysadmin/marketing/analytics        → Campaign performance analytics
GET    /api/sysadmin/marketing/roi              → ROI calculations and projections

```


### Security Considerations

1. **Authentication**
   - SysAdmin requires separate login flow or elevated authentication
   - Mandatory 2FA for all SysAdmin accounts (SMS or TOTP)
   - **TOTP Authenticator Apps**: Google Authenticator, Microsoft Authenticator, Authy support
   - **SMS 2FA**: Via Twilio

   - Backup recovery codes for account recovery
   - IP whitelist option for SysAdmin access
   - Session timeout: 15 minutes idle, 4 hours max



2. **Audit Trail**
   - Every SysAdmin action logged with before/after state
   - Immutable audit logs (append-only)
   - Real-time alerts for sensitive actions (delete company, modify billing)

3. **Data Isolation**
   - SysAdmin can view cross-tenant data but exports are logged
   - No direct database modification without audit trail
   - Read-only mode option for support staff

## Implementation Phases


### Phase 1: Foundation
- [ ] Add SYSADMIN to UserType enum
- [ ] Create requireSysAdmin middleware
- [ ] Create initial SysAdmin user (CLI or seed)
- [ ] Basic SysAdmin dashboard shell

### Phase 2: Company Management
- [ ] Company listing with filters
- [ ] Company status management (suspend/activate)
- [ ] Company detail view with analytics
- [ ] Manual company creation flow

### Phase 3: User Management
- [ ] Global user search
- [ ] User account management (reset password, disable)
- [ ] Cross-company activity view
- [ ] User transfer between companies

### Phase 4: System Monitoring
- [ ] Enhanced system health dashboard
- [ ] Platform analytics (MRR, churn, growth)
- [ ] Audit log viewer with filtering
- [ ] Real-time alerts and notifications

### Phase 5: Subscription Tier & Pricing Management
- [ ] Free tier enable/disable controls
- [ ] Free subscription limit configuration
- [ ] Pricing management interface
- [ ] Promotional pricing setup
- [ ] New subscriber pricing rules

### Phase 6: Subscription Management & Email Automation
- [ ] Subscription statistics dashboard (Free vs Paid breakdown)
- [ ] Expired subscription tracking and alerts
- [ ] Failed payment monitoring with retry logic
- [ ] Email template management system
- [ ] Automated dunning email sequences
- [ ] Bulk email campaign tools
- [ ] Email delivery tracking

### Phase 7: Marketing Campaign Management
- [ ] Campaign creation interface with AI assistance
- [ ] Campaign template library
- [ ] Projected cost and ROI calculator
- [ ] Campaign performance tracking
- [ ] A/B testing framework
- [ ] Audience segmentation tools

### Phase 8: Advanced Features
- [ ] Global settings management
- [ ] Data export/compliance tools
- [ ] Support ticket integration




## UI/UX Guidelines

- **Visual Distinction**: SysAdmin dashboard uses distinct color scheme (purple/indigo vs company admin's blue)
- **Warning Indicators**: Clear warnings when performing destructive actions
- **Breadcrumb Navigation**: Always show context (e.g., "SysAdmin > Companies > Acme Corp")
- **Search-First**: Heavy emphasis on search for finding companies/users quickly
- **Responsive**: Full functionality on tablet for on-the-go support

## Success Metrics

- Support ticket resolution time (target: <2 hours)
- Customer churn rate (target: <5% monthly)
- Platform uptime (target: 99.9%)
- Time to diagnose issues (target: <15 minutes)
