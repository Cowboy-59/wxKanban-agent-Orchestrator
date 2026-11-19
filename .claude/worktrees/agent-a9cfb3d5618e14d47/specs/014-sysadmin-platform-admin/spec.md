# Specification: SysAdmin Platform Administration System

**Spec Number:** 014  
**Branch:** 014-sysadmin-platform-admin  
**Status:** In Progress  
**Created:** 2025-01-20  
**Last Updated:** 2025-01-20

---

## Overview

The **SysAdmin** (System Administrator) is the platform-level administrator who owns and manages the entire wxKanban SaaS platform. Unlike company-level **ADMIN** users who manage their own organizations, the SysAdmin has cross-tenant visibility and control over all companies, users, and system-wide settings.

### SysAdmin vs Company Admin

| Aspect | SysAdmin (Platform Level) | ADMIN (Company Level) |
|--------|---------------------------|----------------------|
| **Scope** | All companies/tenants | Single company only |
| **User Management** | All users across platform | Company users only |
| **Billing** | Platform revenue, all subscriptions | Own company subscription only |
| **System Settings** | Global configuration, feature flags | Company settings only |
| **Audit Access** | System-wide audit logs | Company audit logs only |

---

## User Stories

### US1: Company Lifecycle Management (P1)
**As a** SysAdmin, **I want** to view and manage all registered companies **so that** I can monitor platform health and support clients.

**Acceptance Criteria:**
- View all companies with filters (Active, Suspended, Trial, Cancelled)
- Create companies manually on behalf of clients
- Suspend/activate company accounts
- Delete companies with data retention policies
- Extend trials and modify subscription tiers

### US2: Global User Directory (P1)
**As a** SysAdmin, **I want** to search and manage all users across the platform **so that** I can provide support and maintain security.

**Acceptance Criteria:**
- Search users by email, name, company
- View user activity across all companies
- Reset passwords for any user
- Disable/enable user accounts globally
- Transfer users between companies
- Merge duplicate accounts

### US3: System Health Monitoring (P2)
**As a** SysAdmin, **I want** to view platform metrics and health indicators **so that** I can proactively address issues.

**Acceptance Criteria:**
- View total active users, companies, projects
- Monitor database performance and growth trends
- Track API usage statistics and rate limiting
- View error rates and system alerts
- Monitor background job queue status
- Track email delivery statistics
- Monitor third-party integration health

### US4: Subscription Tier Management (P2)
**As a** SysAdmin, **I want** to configure subscription tiers and pricing **so that** I can control platform monetization.

**Acceptance Criteria:**
- Enable/disable free tier
- Configure free subscription limits
- Manage pricing for each tier
- Set up promotional pricing
- Configure new subscriber pricing rules

### US5: Billing Automation & Dunning (P3)
**As a** SysAdmin, **I want** automated billing management **so that** revenue collection is optimized.

**Acceptance Criteria:**
- View subscription statistics (Free vs Paid breakdown)
- Track expired subscriptions with alerts
- Monitor failed payments with retry logic
- Manage email templates for billing communications
- Configure automated dunning email sequences
- Send bulk email campaigns
- Track email delivery metrics

### US6: Marketing Campaign Management (P3)
**As a** SysAdmin, **I want** AI-assisted campaign creation **so that** I can effectively market the platform.

**Acceptance Criteria:**
- Create campaigns with AI assistance
- Access campaign template library
- Calculate projected cost and ROI
- Track campaign performance
- Run A/B tests
- Segment audiences

---

## Functional Requirements

### FR1: Access Control
- SysAdmin role must be distinct from company ADMIN
- SysAdmin endpoints require `requireSysAdmin` middleware
- SysAdmin users bypass company-level restrictions
- All SysAdmin actions must be audited

### FR2: Company Management API
- `GET /api/sysadmin/companies` - List all companies with pagination and filters
- `POST /api/sysadmin/companies` - Create new company
- `PUT /api/sysadmin/companies/:id/status` - Update company status
- `DELETE /api/sysadmin/companies/:id` - Soft delete company
- `GET /api/sysadmin/companies/:id/analytics` - Company usage analytics

### FR3: User Management API
- `GET /api/sysadmin/users` - Global user search
- `GET /api/sysadmin/users/:id/activity` - Cross-company activity
- `POST /api/sysadmin/users/:id/reset-password` - Force password reset
- `PUT /api/sysadmin/users/:id/status` - Enable/disable account
- `POST /api/sysadmin/users/transfer` - Transfer between companies

### FR4: System Monitoring API
- `GET /api/sysadmin/metrics/platform` - Platform-wide metrics
- `GET /api/sysadmin/metrics/database` - Database health
- `GET /api/sysadmin/metrics/jobs` - Job queue status
- `GET /api/sysadmin/metrics/integrations` - Third-party health

### FR5: Settings Management API
- `GET /api/sysadmin/settings` - List system settings
- `PUT /api/sysadmin/settings/:key` - Update setting
- `GET /api/sysadmin/settings/:key/history` - Setting change history

---

## Data Model

### Core Entities

**SysAdmin User**
- Extends existing `userprofiles` table
- `usertype: 'SYSADMIN'` (new enum value)
- No company association (or system company)
- Highest security level (10)

**System Settings**
- Key-value storage for global configuration
- Categories: billing, features, security, integrations
- Audit trail for all changes

**Company Status History**
- Audit trail for company lifecycle changes
- Tracks: created, activated, suspended, deleted
- Includes reason and SysAdmin attribution

**Company Analytics**
- Materialized view of company usage metrics
- Updated periodically (nightly or real-time)
- Used for health scoring and reporting

---

