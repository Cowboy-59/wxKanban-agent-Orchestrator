# Data Model: Company Registration & Subscription Management

<<<<<<< HEAD
**Feature**: Spec 003 (Registration) | **Date**: 2026-02-17 | **Updated**: 2026-06-10 | **Status**: Synced with Drizzle Schema

> **Note**: This document was updated to match the actual Drizzle ORM schema definitions in `src/db/schema/`. All table names, primary keys, field names, and types reflect the live codebase.
=======
**Feature**: Spec 003 (Registration) | **Date**: 2026-02-17 | **Status**: Phase 1 Design
>>>>>>> origin/014-sysadmin-platform-admin

---

## Overview

<<<<<<< HEAD
This document defines the 7 entities used by the registration and subscription management feature, including relationships, validation rules, and state transitions. Two additional entities (`emailverificationtokens`, `invitationbatches`) were added to reflect schemas present in the codebase but absent from the original design document.
=======
This document defines the 5 core entities required for the registration and subscription management feature, including relationships, validation rules, and state transitions.
>>>>>>> origin/014-sysadmin-platform-admin

---

## Entity Definitions

<<<<<<< HEAD
### 1. companies

Represents an organization registered with wxKanban. Stores company information, subscription tier, billing contact, and configuration settings.

**Schema file**: `src/db/schema/company.ts`
**Table**: `companies`

| Field | Type | Constraints | Purpose |
|-------|------|-------------|---------|
| `id` | UUID | PRIMARY KEY, defaultRandom() | Unique company identifier |
| `name` | VARCHAR(255) | NOT NULL | Company display name (duplicates allowed) |
| `address` | TEXT | NULLABLE | Physical address |
| `contactemail` | VARCHAR(255) | NOT NULL, UNIQUE | Primary billing/contact email |
| `phone` | VARCHAR(20) | NULLABLE | Company phone number |
| `billingplan` | VARCHAR(50) | NOT NULL, DEFAULT 'FREE' | Subscription tier: FREE, SMALL_BUSINESS, CONSULTANT, ENTERPRISE |
| `subscriptionstatus` | VARCHAR(20) | NOT NULL, DEFAULT 'ACTIVE' | Subscription status: ACTIVE, PAYMENT_REQUIRED, CANCELLED, PAUSED |
| `maxusers` | INTEGER | NOT NULL, DEFAULT 5 | Max users allowed for tier |
| `hourlyrate` | NUMERIC(10,2) | NULLABLE | Default hourly billing rate for the company |
| `logourl` | VARCHAR(1024) | NULLABLE | URL to company logo image |
| `activeflag` | BOOLEAN | NOT NULL, DEFAULT true | Whether company account is active |
| `digestconfig` | JSONB | NULLABLE | Email digest configuration settings |
| `settings` | TEXT | NULLABLE | General company settings (JSON string) |
| `verifiedat` | TIMESTAMP | NULLABLE | When company was verified |
| `createdat` | TIMESTAMP | NOT NULL, defaultNow() | Account creation date |
| `updatedat` | TIMESTAMP | NOT NULL, defaultNow() | Last modification date |

**Validation Rules**:
- `name`: 1–255 characters; duplicates allowed (different companies may share names)
- `contactemail`: Valid email format (RFC 5322); must be unique across all companies
- `billingplan`: One of `FREE`, `SMALL_BUSINESS`, `CONSULTANT`, `ENTERPRISE`
- `subscriptionstatus`: One of `ACTIVE`, `PAYMENT_REQUIRED`, `CANCELLED`, `PAUSED`
- `maxusers`: Defaults per tier — FREE: 1, SMALL_BUSINESS: 5, CONSULTANT/ENTERPRISE: unlimited (set to large integer)
- `phone`: Optional; E.164 or 10–20 characters if provided

**Indexes**:
- PRIMARY KEY: `id`
- UNIQUE: `contactemail`

**State Transitions**:
```
FREE / SMALL_BUSINESS (no payment):
  → ACTIVE immediately on registration

CONSULTANT / ENTERPRISE (paid):
  ACTIVE → PAYMENT_REQUIRED  (invoice payment failed)
  PAYMENT_REQUIRED → ACTIVE  (payment succeeded)
  ACTIVE → CANCELLED         (admin cancels)
  CANCELLED → ACTIVE         (reactivation)
=======
### 1. company

Represents an organization registered with wxKanban. Stores company information, subscription tier, billing address, and integration settings.

**Table**: `company`

| Field | Type | Constraints | Purpose |
|-------|------|-----------|---------|
| `companyid` | UUID v7 | PRIMARY KEY, NOT NULL | Unique company identifier |
| `companyname` | VARCHAR(255) | NOT NULL, UNIQUE | Legal company name |
| `billingemail` | VARCHAR(255) | NOT NULL | Primary contact email for invoices |
| `billingaddress` | TEXT | NOT NULL | Full billing address (street, city, state, zip) |
| `billingcountry` | VARCHAR(2) | NOT NULL | ISO country code (e.g., 'US') |
| `billingphone` | VARCHAR(20) | NOT NULL | Company phone number |
| `subscriptiontier` | ENUM | NOT NULL, DEFAULT 'FREE' | Pricing tier: FREE, CONSULTANT, ENTERPRISE |
| `maxusers` | INTEGER | NOT NULL, DEFAULT 5 | Max users allowed for tier (5 for FREE, unlimited for CONSULTANT/ENTERPRISE) |
| `stripecustomerid` | VARCHAR(255) | NULLABLE, UNIQUE | Stripe customer ID (cus_...) - only for paid tiers |
| `stripesubscriptionid` | VARCHAR(255) | NULLABLE, UNIQUE | Stripe subscription ID (sub_...) - only for paid tiers |
| `subscriptionstatus` | ENUM | NULLABLE | Subscription status: ACTIVE, PAYMENT_REQUIRED, CANCELLED, PAUSED |
| `subscriptionstarteddate` | TIMESTAMP | NULLABLE | When subscription became active |
| `subscriptionrenewdate` | TIMESTAMP | NULLABLE | Next billing cycle date |
| `usersaddedthiscycle` | INTEGER | DEFAULT 0 | Overage tracking for ENTERPRISE tier (for +$5/user calculation) |
| `securityclassification` | VARCHAR(50) | DEFAULT 'public' | Data classification for compliance (public, internal, confidential) |
| `createdat` | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Account creation date |
| `updatedat` | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Last modification date |

**Validation Rules**:
- `companyname`: 2-255 characters, alphanumeric + spaces/hyphens
- `billingemail`: Valid email format (RFC 5322)
- `billingphone`: E.164 format or 10-20 characters
- `subscriptiontier`: Must be one of three values (enum constraint)
- `maxusers`: Must match tier defaults (5 for FREE, unlimited for others)
- `stripecustomerid`: Only set if tier is CONSULTANT or ENTERPRISE
- `stripesubscriptionid`: Only set if subscription is active
- `billingcountry`: ISO 3166-1 alpha-2 code (case-insensitive, stored uppercase)

**Indexes**:
- PRIMARY KEY: `companyid`
- UNIQUE: `companyname`, `billingemail`, `stripecustomerid`, `stripesubscriptionid`
- REGULAR: `subscriptiontier` (filter by tier for analytics)
- REGULAR: `subscriptionstatus` (query active subscriptions)

**State Transitions**:
```
Creation:
  FREE (no payment) → ACTIVE

Paid Tier:
  ACTIVE → PAYMENT_REQUIRED (invoice payment failed)
  PAYMENT_REQUIRED → ACTIVE (payment succeeded)
  ACTIVE → CANCELLED (admin cancels or trial expires)
  CANCELLED → ACTIVE (reactivation after manual intervention)
>>>>>>> origin/014-sysadmin-platform-admin
```

---

<<<<<<< HEAD
### 2. userprofiles

Represents a team member account within a company. Stores authentication credentials, role, billing rates, and account configuration.

**Schema file**: `src/db/schema/userprofiles.ts`
**Table**: `userprofiles`

| Field | Type | Constraints | Purpose |
|-------|------|-------------|---------|
| `id` | UUID | PRIMARY KEY, defaultRandom() | Unique user identifier |
| `profileid` | BIGINT | NULLABLE | Legacy numeric profile identifier |
| `emailaddr` | VARCHAR(80) | NOT NULL, UNIQUE | User email address (used for login) |
| `fullname` | VARCHAR(80) | NULLABLE | User's full display name |
| `password` | VARCHAR(256) | NOT NULL | bcrypt hash of password (12+ rounds) |
| `active` | BOOLEAN | NOT NULL, DEFAULT true | Whether account is active |
| `securitylevel` | INTEGER | NOT NULL, DEFAULT 7 | Numeric security level (7 = standard user) |
| `usertype` | VARCHAR(50) | NOT NULL, DEFAULT 'TEAM_MEMBER' | Permission level — see UserType enum |
| `companyid` | UUID | NOT NULL, FK → companies.id (RESTRICT) | Company this user belongs to |
| `payrate` | NUMERIC(10,2) | NULLABLE | User's hourly pay rate |
| `payratemethod` | VARCHAR(20) | NULLABLE | Pay rate method (hourly, salary, etc.) |
| `profiletype` | VARCHAR(20) | NULLABLE | Profile classification |
| `responsibility` | VARCHAR | NULLABLE | User's primary responsibility description |
| `basepercentage` | NUMERIC(10,2) | NULLABLE | Base billing percentage |
| `tracktime` | BOOLEAN | DEFAULT true | Whether time tracking is enabled for user |
| `timezone` | VARCHAR(50) | DEFAULT 'UTC' | User's timezone |
| `dashboardconfig` | JSONB | NULLABLE | User dashboard layout/configuration |
| `joinedat` | TIMESTAMP | defaultNow() | When user joined the company |
| `lastloginedat` | TIMESTAMP | NULLABLE | Last successful login timestamp |
| `devcycleid` | BIGINT | NULLABLE | Associated development cycle ID |
| `startchat` | BOOLEAN | DEFAULT true | Whether AI chat is enabled for user |
| `allowoutsideteams` | BOOLEAN | DEFAULT false | Whether user can access outside their teams |
| `clientid` | VARCHAR(500) | NULLABLE | OAuth client ID (for integrations) |
| `clientsecret` | VARCHAR(500) | NULLABLE | OAuth client secret (for integrations) |

**UserType Enum**:
```typescript
type UserType = "TEAM_MEMBER" | "TEAM_MANAGER" | "ADMIN" | "SYSADMIN";
```

| Value | Description |
|-------|-------------|
| `TEAM_MEMBER` | Regular team member with limited permissions |
| `TEAM_MANAGER` | Team manager with project/phase control permissions |
| `ADMIN` | Company administrator with full company-level access |
| `SYSADMIN` | Platform-level administrator with cross-tenant access |

**Validation Rules**:
- `emailaddr`: Valid email format, max 80 characters, globally unique
- `password`: bcrypt hash (12+ rounds), never stored in plaintext
- `usertype`: Must be one of the four UserType values
- `securitylevel`: Integer; default 7 for standard users; set explicitly on registration
- `active`: Set to `true` on registration; set to `false` to deactivate account
- First user created during company registration MUST have `usertype = 'ADMIN'` and `active = true`, `securitylevel = 7`

**Indexes**:
- PRIMARY KEY: `id`
- UNIQUE: `emailaddr`
- FOREIGN KEY: `companyid` → `companies.id`

**Special Rules**:
- First user created during registration MUST have `usertype = 'ADMIN'`
- Company cannot operate with 0 ADMIN users
- `clientid` / `clientsecret` are for PM system OAuth integrations, not user authentication

---

### 3. userinvitations

Represents pending invitations sent to team members. Tracks invitation status, expiry, and acceptance.

**Schema file**: `src/db/schema/userinvitation.ts`
**Table**: `userinvitations`

| Field | Type | Constraints | Purpose |
|-------|------|-------------|---------|
| `id` | UUID | PRIMARY KEY, defaultRandom() | Unique invitation identifier |
| `companyid` | UUID | NOT NULL, FK → companies.id (CASCADE) | Company sending invitation |
| `email` | VARCHAR(255) | NOT NULL | Email address being invited |
| `token` | VARCHAR(255) | NOT NULL, UNIQUE | Secure token for acceptance link |
| `status` | VARCHAR(50) | DEFAULT 'pending' | Invitation status (see values below) |
| `expiresat` | TIMESTAMP | NOT NULL | Expiration date (7 days from creation) |
| `invitedat` | TIMESTAMP | NOT NULL, defaultNow() | When invitation was sent |
| `acceptedat` | TIMESTAMP | NULLABLE | When invitation was accepted |
| `usertype` | VARCHAR(20) | DEFAULT 'TEAM_MEMBER' | Role to assign on acceptance |

**Status Values**:
- `pending` — Email sent, awaiting acceptance
- `accepted` — Invitation link clicked, user created/joined
- `expired` — 7 days passed without action
- `revoked` — Admin cancelled invitation before acceptance

**Validation Rules**:
- `email`: Valid email format; cannot be currently active user in company
- `token`: Unique secure token (crypto.randomBytes); used in invitation link URL
- `status`: One of `pending`, `accepted`, `expired`, `revoked`
- `expiresat`: Calculated as `invitedat + 7 days`
- `usertype`: One of `TEAM_MEMBER`, `TEAM_MANAGER`, `ADMIN`, `SYSADMIN`
- Only one active `pending` invitation per email address per company

**Indexes**:
- PRIMARY KEY: `id`
- UNIQUE: `token`
- FOREIGN KEY: `companyid` → `companies.id`

**Special Rules**:
- Accept invitation only if `status = 'pending'` and `expiresat > now()`
- Scheduled job marks `status = 'expired'` when `expiresat < now()` and `status = 'pending'`
- Revoking sets `status = 'revoked'`; prevents future acceptance

---

### 4. sessions

Represents authenticated user sessions. Stores JWT tokens and expiry for session management.

**Schema file**: `src/db/schema/session.ts`
**Table**: `sessions`

| Field | Type | Constraints | Purpose |
|-------|------|-------------|---------|
| `id` | UUID | PRIMARY KEY, defaultRandom() | Unique session identifier |
| `userid` | UUID | NOT NULL, FK → userprofiles.id (CASCADE) | User account for this session |
| `token` | VARCHAR(1024) | NOT NULL | JWT or session token |
| `expiresat` | TIMESTAMP | NOT NULL | Token expiration date/time |
| `createdat` | TIMESTAMP | NOT NULL, defaultNow() | Session creation (login) time |
| `updatedat` | TIMESTAMP | NOT NULL, defaultNow() | Last session update time |

**Validation Rules**:
- `userid`: Must reference an existing, active `userprofiles` record
- `token`: JWT or opaque token string; max 1024 characters
- `expiresat`: Must be in the future at creation time
- Expired sessions (`expiresat < now()`) are considered invalid

**Indexes**:
- PRIMARY KEY: `id`
- FOREIGN KEY: `userid` → `userprofiles.id`

**Special Rules**:
- New session created on each login
- Logout: delete or expire session record
- Cleanup: delete sessions where `expiresat < now()`

---

### 5. companyauditlogs

Represents audit trail for compliance and security monitoring. Tracks all significant actions at company level.

**Schema file**: `src/db/schema/companyauditlog.ts`
**Table**: `companyauditlogs`

| Field | Type | Constraints | Purpose |
|-------|------|-------------|---------|
| `id` | UUID | PRIMARY KEY, defaultRandom() | Unique audit log entry |
| `companyid` | UUID | NOT NULL, FK → companies.id (CASCADE) | Which company context |
| `action` | VARCHAR(100) | NOT NULL | Action type (e.g. COMPANY_CREATED, USER_INVITED) |
| `changedby` | UUID | NULLABLE, FK → userprofiles.id (SET NULL) | User who performed action (null = system) |
| `previousvalue` | JSONB | NULLABLE | State before the change |
| `newvalue` | JSONB | NULLABLE | State after the change |
| `description` | TEXT | NULLABLE | Human-readable description of the action |
| `timestamp` | TIMESTAMP | NOT NULL, defaultNow() | When the action occurred |

**Action Values** (examples):
- `COMPANY_CREATED` — New company registered
- `SUBSCRIPTION_UPGRADED` — Tier changed to higher plan
- `SUBSCRIPTION_DOWNGRADED` — Tier changed to lower plan
- `SUBSCRIPTION_CANCELLED` — Subscription cancelled
- `USER_CREATED` — New user account created
- `USER_INVITED` — Invitation sent to email
- `INVITATION_ACCEPTED` — Invitation accepted, user joined
- `USER_REMOVED` — User removed from company
- `ROLE_CHANGED` — User role updated
- `PAYMENT_PROCESSED` — Successful payment recorded
- `PAYMENT_FAILED` — Payment attempt failed
- `SETTINGS_UPDATED` — Company settings changed

**JSONB Examples**:

**COMPANY_CREATED** (`newvalue`):
```json
{
  "name": "Acme Corp",
  "billingplan": "FREE",
  "contactemail": "billing@acme.com"
}
```

**SUBSCRIPTION_UPGRADED** (`previousvalue` / `newvalue`):
```json
{ "billingplan": "FREE" }
{ "billingplan": "CONSULTANT" }
```

**USER_INVITED** (`newvalue`):
```json
{
  "email": "jane@acme.com",
  "usertype": "TEAM_MANAGER",
  "invitationId": "uuid-here",
  "expiresat": "2026-02-24T13:52:00Z"
=======
### 2. user

Represents a team member account within a company. Stores authentication credentials, role, and account status.

**Table**: `user`

| Field | Type | Constraints | Purpose |
|-------|------|-----------|---------|
| `userid` | UUID v7 | PRIMARY KEY, NOT NULL | Unique user identifier |
| `companyid` | UUID v7 | FOREIGN KEY → company.companyid, NOT NULL | Company this user belongs to |
| `email` | VARCHAR(255) | NOT NULL, UNIQUE | User email (used for login) |
| `passwordhash` | VARCHAR(256) | NOT NULL | bcrypt hash of password (cost 10+) |
| `firstname` | VARCHAR(100) | NULLABLE | User's first name |
| `lastname` | VARCHAR(100) | NULLABLE | User's last name |
| `role` | ENUM | NOT NULL, DEFAULT 'DEVELOPER' | Permission level: ADMIN, MANAGER, DEVELOPER |
| `status` | ENUM | NOT NULL, DEFAULT 'PENDING' | Account status: PENDING, ACTIVE, SUSPENDED, DEACTIVATED |
| `emailverified` | BOOLEAN | NOT NULL, DEFAULT FALSE | Whether email has been verified |
| `emailverifiedat` | TIMESTAMP | NULLABLE | When email verification was completed |
| `stripecustomerid` | VARCHAR(255) | NULLABLE | Stripe customer ID (if user can manage billing) |
| `lastloginat` | TIMESTAMP | NULLABLE | Last successful login timestamp |
| `lastloginip` | VARCHAR(45) | NULLABLE | IP address of last login (IPv4 or IPv6) |
| `createdbyid` | UUID v7 | FOREIGN KEY → user.userid, NULLABLE | User who created this account (admin or system) |
| `createdat` | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Account creation date |
| `updatedat` | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Last modification date |
| `deletedat` | TIMESTAMP | NULLABLE | Soft delete timestamp (null = active) |

**Validation Rules**:
- `email`: Valid email format, max 255 characters, unique per company (allow same email in different companies)
- `passwordhash`: 60 characters (bcrypt SHA-512), cannot be empty
- `firstname`/`lastname`: 1-100 characters if provided
- `role`: ADMIN (company settings, team management), MANAGER (project oversight), DEVELOPER (task execution)
- `status`:
  - PENDING: Email not verified yet, no access to app
  - ACTIVE: Fully operational account
  - SUSPENDED: Temporarily disabled (payment issue)
  - DEACTIVATED: Permanently disabled (user left company)
- `emailverified`: Set to true only after email verification link clicked

**Indexes**:
- PRIMARY KEY: `userid`
- UNIQUE: `email` (per company - consider composite: `(companyid, email)`)
- FOREIGN KEY: `companyid` (find all users in company)
- FOREIGN KEY: `createdbyid` (audit trail)
- REGULAR: `status` (find active users, count for license checking)
- REGULAR: `role` (find admins for notifications)

**Special Rules**:
- First user created during registration MUST have role=ADMIN
- ADMIN users cannot be deleted (soft delete only)
- Company cannot operate with 0 ADMIN users
- Email must be unique within a company (allow duplication across companies)

---

### 3. userinvitation

Represents pending invitations sent to team members. Tracks invitation status, expiry, and acceptance.

**Table**: `userinvitation`

| Field | Type | Constraints | Purpose |
|-------|------|-----------|---------|
| `invitationid` | UUID v7 | PRIMARY KEY, NOT NULL | Unique invitation identifier |
| `companyid` | UUID v7 | FOREIGN KEY → company.companyid, NOT NULL | Company sending invitation |
| `invitedemail` | VARCHAR(255) | NOT NULL | Email address being invited |
| `invitedby` | UUID v7 | FOREIGN KEY → user.userid, NOT NULL | User who sent invitation (ADMIN) |
| `invitetoken` | VARCHAR(255) | NOT NULL, UNIQUE | Secure token for acceptance link (crypto.randomBytes(32).toString('hex')) |
| `tokenhash` | VARCHAR(255) | NULLABLE | Hash of invitetoken (bcrypt, for DB storage) |
| `role` | ENUM | NOT NULL, DEFAULT 'DEVELOPER' | Role to be assigned if accepted: ADMIN, MANAGER, DEVELOPER |
| `status` | ENUM | NOT NULL, DEFAULT 'PENDING' | Invitation status: PENDING, ACCEPTED, EXPIRED, DECLINED, REVOKED |
| `invitedAt` | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | When invitation was sent |
| `expiresAt` | TIMESTAMP | NOT NULL | Expiration date (7 days from creation) |
| `acceptedAt` | TIMESTAMP | NULLABLE | When invitation was accepted |
| `acceptedbyid` | UUID v7 | FOREIGN KEY → user.userid, NULLABLE | User account created from this invitation |
| `customMessage` | TEXT | NULLABLE, MAX 500 CHARS | Optional personalized message in email |
| `createdat` | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Record creation timestamp |
| `updatedat` | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Last update timestamp |

**Validation Rules**:
- `invitedemail`: Valid email format, cannot be currently active user in company
- `invitetoken`: 64-character hex string (generated with crypto.randomBytes(32))
- `tokenhash`: bcrypt hash of invitetoken (never store plaintext)
- `role`: Must be valid permission level
- `status`:
  - PENDING: Email sent, awaiting acceptance
  - ACCEPTED: Invitation link clicked, user created
  - EXPIRED: 7 days passed without action
  - DECLINED: User rejected invitation (if feature added later)
  - REVOKED: Admin cancelled invitation before acceptance
- `expiresAt`: Calculated as `createdAt + 7 days`
- `customMessage`: Max 500 characters, optional

**Indexes**:
- PRIMARY KEY: `invitationid`
- UNIQUE: `invitetoken` (for verification)
- FOREIGN KEY: `companyid` (list all invitations for company)
- FOREIGN KEY: `invitedby` (audit: who invited whom)
- FOREIGN KEY: `acceptedbyid` (link invitation to user account)
- REGULAR: `status` (find pending, expired invitations)
- REGULAR: `invitedemail` (prevent duplicate invitations to same email)
- REGULAR: `expiresAt` (scheduled cleanup of expired invitations)

**Special Rules**:
- Only one active PENDING invitation per email address per company
- Accept invitation only if status=PENDING and expiresAt > now()
- Expired invitations (expiresAt < now()) cannot be accepted
- Revoking invitation prevents future acceptance

**Cleanup**:
- Scheduled job: Mark status=EXPIRED if expiresAt < now() and status=PENDING
- Scheduled job: Delete expired invitations older than 30 days (archive to audit log first)

---

### 4. session

Represents authenticated user sessions. Tracks JWT refresh tokens and revocation for multi-device session management.

**Table**: `session`

| Field | Type | Constraints | Purpose |
|-------|------|-----------|---------|
| `sessionid` | UUID v7 | PRIMARY KEY, NOT NULL | Unique session identifier |
| `userid` | UUID v7 | FOREIGN KEY → user.userid, NOT NULL | User account for this session |
| `companyid` | UUID v7 | FOREIGN KEY → company.companyid, NOT NULL | Company context |
| `tokenfamily` | UUID v7 | NOT NULL | Family ID for token rotation (detects reuse) |
| `refreshtokenhash` | VARCHAR(255) | NOT NULL | bcrypt hash of refresh token (never plaintext) |
| `accesstokenexpiry` | INTEGER | NOT NULL | Access token expiry in seconds (900 = 15 min) |
| `refreshtokenexpiry` | TIMESTAMP | NOT NULL | Refresh token expiry date (7 days) |
| `revokedat` | TIMESTAMP | NULLABLE | When token was revoked (null = active) |
| `devicename` | VARCHAR(255) | NULLABLE | Device identifier (parsed from User-Agent: "iPhone Safari", "Chrome Desktop") |
| `ipaddress` | VARCHAR(45) | NOT NULL | IP address of login (IPv4 or IPv6) |
| `useragent` | TEXT | NOT NULL | Full User-Agent string for device tracking |
| `lastusedAt` | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Last activity on this session |
| `createdat` | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Session creation (login) time |

**Validation Rules**:
- `userid`: Must exist and be ACTIVE status
- `tokenfamily`: UUID v7, immutable (groups tokens from same login)
- `refreshtokenhash`: bcrypt hash, 60 characters, never plaintext
- `accesstokenexpiry`: 900 seconds (15 minutes, immutable)
- `refreshtokenexpiry`: ISO timestamp, 7 days from creation
- `revokedat`: NULL (active) or timestamp (revoked)
- `devicename`: Parsed User-Agent string (max 255 chars)
- `ipaddress`: Valid IPv4 (xxx.xxx.xxx.xxx) or IPv6 (::-notation)

**Indexes**:
- PRIMARY KEY: `sessionid`
- FOREIGN KEY: `userid` (list all sessions for user)
- FOREIGN KEY: `companyid` (session audit per company)
- REGULAR: `tokenfamily` (revoke entire family on reuse detection)
- REGULAR: `revokedat` (find active vs revoked sessions)
- REGULAR: `lastusedAt` (track session activity)

**Special Rules**:
- Only one session per login attempt (new session on each login)
- Reuse detection: If same token family used twice = possible theft → revoke entire family
- Logout: Mark `revokedat = now()` (immediate)
- Access token always short-lived (15m, cannot be revoked)
- Refresh token revocation immediately prevents new access tokens
- Token rotation: Each refresh creates new `sessionid` and `tokenfamily`

**Cleanup**:
- Delete sessions older than 30 days + revoked
- Keep active sessions indefinitely (until explicit logout or 7-day expiry)

---

### 5. companyauditlog

Represents audit trail for compliance and security monitoring. Tracks all significant actions at company and user level.

**Table**: `companyauditlog`

| Field | Type | Constraints | Purpose |
|-------|------|-----------|---------|
| `auditlogid` | UUID v7 | PRIMARY KEY, NOT NULL | Unique audit log entry |
| `companyid` | UUID v7 | FOREIGN KEY → company.companyid, NOT NULL | Which company (context for all actions) |
| `userid` | UUID v7 | FOREIGN KEY → user.userid, NULLABLE | User who performed action (null = system) |
| `action` | VARCHAR(100) | NOT NULL | Action type (enum-like: COMPANY_CREATED, SUBSCRIPTION_UPGRADED, USER_CREATED, USER_INVITED, INVITATION_ACCEPTED, USER_DELETED, PAYMENT_PROCESSED, PAYMENT_FAILED, TOKEN_REVOKED) |
| `resourcetype` | VARCHAR(50) | NOT NULL | Entity type affected (company, user, userinvitation, subscription, payment) |
| `resourceid` | UUID v7 | NULLABLE | ID of affected resource |
| `details` | JSONB | NULLABLE | Additional context (old values, new values, error messages) |
| `ipaddress` | VARCHAR(45) | NULLABLE | IP address from which action was initiated |
| `status` | VARCHAR(20) | DEFAULT 'success' | success or failure |
| `errormessage` | TEXT | NULLABLE | Error details if status=failure |
| `createdat` | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Action timestamp |

**Validation Rules**:
- `action`: Predefined enum (COMPANY_CREATED, SUBSCRIPTION_UPGRADED, USER_CREATED, etc.)
- `resourcetype`: Entity name (company, user, userinvitation, subscription)
- `resourceid`: Must correspond to resourcetype
- `details`: JSONB structure varies per action (see examples below)
- `status`: 'success' or 'failure'
- `errormessage`: Only populated if status='failure'

**Details JSONB Examples**:

**COMPANY_CREATED**:
```json
{
  "companyName": "Acme Corp",
  "tier": "FREE",
  "billingEmail": "billing@acme.com"
}
```

**SUBSCRIPTION_UPGRADED**:
```json
{
  "oldTier": "FREE",
  "newTier": "CONSULTANT",
  "price": 19.95,
  "stripeSubscriptionId": "sub_123..."
}
```

**USER_CREATED**:
```json
{
  "email": "john@acme.com",
  "role": "DEVELOPER",
  "invitationId": "inv_123...",
  "createdVia": "invitation_acceptance"
}
```

**USER_INVITED**:
```json
{
  "invitedEmail": "jane@acme.com",
  "role": "MANAGER",
  "expiresAt": "2026-02-24T13:52:00Z",
  "invitationId": "inv_456..."
}
```

**PAYMENT_PROCESSED**:
```json
{
  "stripeInvoiceId": "in_123...",
  "amount": 1995,
  "currency": "usd",
  "tier": "CONSULTANT",
  "subscriptionId": "sub_123..."
}
```

**PAYMENT_FAILED**:
```json
{
  "stripeInvoiceId": "in_123...",
  "amount": 1995,
  "failureReason": "card_declined",
  "retryAfter": "2026-02-17T23:59:59Z"
>>>>>>> origin/014-sysadmin-platform-admin
}
```

**Indexes**:
<<<<<<< HEAD
- PRIMARY KEY: `id`
- FOREIGN KEY: `companyid` → `companies.id`
- FOREIGN KEY: `changedby` → `userprofiles.id`

**Special Rules**:
- Append-only (never update or delete audit log entries)
- `changedby` is NULL for system-initiated actions
=======
- PRIMARY KEY: `auditlogid`
- FOREIGN KEY: `companyid` (audit trail per company)
- FOREIGN KEY: `userid` (actions by user)
- REGULAR: `action` (filter by action type)
- REGULAR: `resourcetype` (filter by entity)
- REGULAR: `createdat` (sort by date for dashboards)
- COMPOSITE: `(companyid, createdat DESC)` (company activity timeline)

**Special Rules**:
- Append-only (never update or delete audit logs)
- Automatic timestamps (no manual entry)
- Track ALL registration-related actions
- Include error details for debugging
>>>>>>> origin/014-sysadmin-platform-admin
- Retain indefinitely (compliance requirement)

---

<<<<<<< HEAD
### 6. emailverificationtokens

Stores hashed JWT tokens for email address verification. One-time use with 24-hour expiry and brute-force protection.

**Schema file**: `src/db/schema/emailverificationtoken.ts`
**Table**: `emailverificationtokens`

| Field | Type | Constraints | Purpose |
|-------|------|-------------|---------|
| `id` | UUID | PRIMARY KEY, defaultRandom() | Unique token record identifier |
| `userid` | UUID | NOT NULL, FK → userprofiles.id (CASCADE) | User whose email is being verified |
| `tokenhash` | TEXT | NOT NULL | Hashed verification token (never store plaintext) |
| `expiresat` | TIMESTAMP (with timezone) | NOT NULL | Token expiration (24 hours from creation) |
| `createdat` | TIMESTAMP (with timezone) | defaultNow() | When token was created |
| `attemptcount` | INTEGER | DEFAULT 0 | Number of verification attempts (brute-force guard) |

**Validation Rules**:
- `tokenhash`: bcrypt or SHA-256 hash of the plaintext token sent in email
- `expiresat`: 24 hours from `createdat`
- `attemptcount`: Max 5 attempts per token; token invalidated after limit reached
- One active token per user at a time (previous tokens should be deleted on re-send)

**Indexes**:
- PRIMARY KEY: `id`
- FOREIGN KEY: `userid` → `userprofiles.id`

**Special Rules**:
- Token is single-use; delete after successful verification
- If user requests new verification email, delete old token and create new one
- Tokens older than 24 hours are invalid regardless of `attemptcount`

---

### 7. invitationbatches

Tracks bulk team member invitation operations (CSV uploads). Records metadata for invitation campaigns and progress.

**Schema file**: `src/db/schema/invitationbatch.ts`
**Table**: `invitationbatches`

| Field | Type | Constraints | Purpose |
|-------|------|-------------|---------|
| `batchid` | UUID | PRIMARY KEY, defaultRandom() | Unique batch identifier |
| `projectid` | UUID | NOT NULL, FK → companyprojects.id (CASCADE) | Project context for the batch |
| `userid` | UUID | NOT NULL, FK → userprofiles.id (CASCADE) | Admin who initiated the batch |
| `totalcount` | INTEGER | NOT NULL | Total invitations in batch |
| `successcount` | INTEGER | NOT NULL, DEFAULT 0 | Successfully sent invitations |
| `failedcount` | INTEGER | NOT NULL, DEFAULT 0 | Failed invitations after retries |
| `status` | VARCHAR(50) | NOT NULL, DEFAULT 'queued' | Batch processing status |
| `createdat` | TIMESTAMP | NOT NULL, defaultNow() | When batch was created |
| `completedat` | TIMESTAMP | NULLABLE | When batch finished (success or failure) |

**Status Values**:
- `queued` — Batch created, waiting to be processed
- `processing` — Invitations currently being sent
- `completed` — All invitations processed (check `failedcount` for partial failures)
- `failed` — Batch processing failed entirely

**Validation Rules**:
- `totalcount`: Must be ≥ 1 and ≤ 50 (per FR-053 bulk upload limit)
- `successcount + failedcount` ≤ `totalcount`
- `completedat`: Set when `status` transitions to `completed` or `failed`

**Indexes**:
- PRIMARY KEY: `batchid`
- UNIQUE INDEX: `batchid` (explicit)
- INDEX: `projectid`, `userid`, `status`, `createdat`
- FOREIGN KEY: `projectid` → `companyprojects.id`
- FOREIGN KEY: `userid` → `userprofiles.id`

---

## Entity Relationships

```
companies (1) ──────────────────────────────────────────┐
     │                                                   │
     ├──── userprofiles (N) ──── sessions (N)            │
     │          │                                        │
     │          ├──── emailverificationtokens (N)        │
     │          │                                        │
     │          └──── invitationbatches (N) ─────────────┤
     │                                                   │
     ├──── userinvitations (N)                           │
     │                                                   │
     └──── companyauditlogs (N)                          │
                                                         │
          [companyprojects FK in invitationbatches] ─────┘
```

**Relationships**:
1. `companies → userprofiles`: One company has many users (1:N); FK `companyid` on `userprofiles`
2. `companies → userinvitations`: One company has many invitations (1:N); FK `companyid` on `userinvitations`
3. `companies → companyauditlogs`: One company has many audit entries (1:N); FK `companyid` on `companyauditlogs`
4. `userprofiles → sessions`: One user can have many active sessions (1:N); FK `userid` on `sessions`
5. `userprofiles → emailverificationtokens`: One user has verification tokens (1:N); FK `userid` on `emailverificationtokens`
6. `userprofiles → invitationbatches`: Admin user initiates batches (1:N); FK `userid` on `invitationbatches`
7. `userprofiles → companyauditlogs`: User actions recorded in audit log (1:N); FK `changedby` on `companyauditlogs`
8. `companyprojects → invitationbatches`: Batch scoped to a project (1:N); FK `projectid` on `invitationbatches`
=======
## Entity Relationships

```
company (1) ──────────┐
                      │
          ┌───────────┴──────────┬───────────┐
          │                      │           │
       user (N)            userinvitation  companyauditlog
          │                (N)
          │
       session (N)
     [FK: userid]
```

**Relationships**:
1. **company → user**: One company has many users (1:N)
2. **company → userinvitation**: One company has many invitations (1:N)
3. **company → companyauditlog**: One company has many audit entries (1:N)
4. **user → userinvitation** (invitedby): User can send many invitations (1:N)
5. **userinvitation → user** (acceptedbyid): Invitation links to user (when accepted)
6. **user → session**: One user can have many active sessions (1:N, one per device)
7. **user → companyauditlog**: User actions recorded in audit log
>>>>>>> origin/014-sysadmin-platform-admin

---

## State Machines

### Company Subscription State

```
                    ┌─────────────┐
                    │ NEW/CREATED │
                    └──────┬──────┘
                           │
<<<<<<< HEAD
              [FREE or SMALL_BUSINESS selected]
                           │
                    ┌──────▼──────┐
                    │    ACTIVE   │◄─────────────┐
                    └──────┬──────┘              │
                           │              [Payment succeeds]
                  [Upgrade to paid tier]         │
                           │                     │
                    ┌──────▼──────────────┐       │
                    │  PAYMENT_REQUIRED   ├───────┘
                    └──────┬──────────────┘
                           │
                  [Max retries reached]
=======
                    [User selects FREE]
                           │
                    ┌──────▼──────┐
                    │    ACTIVE   │◄─────────┐
                    └──────┬──────┘           │
                           │         [Payment succeeds]
                    [Upgrade to paid]        │
                           │                 │
                    ┌──────▼──────────┐      │
                    │ PAYMENT_REQUIRED├──────┘
                    └──────┬──────────┘
                           │
                    [Max retries reached]
>>>>>>> origin/014-sysadmin-platform-admin
                           │
                    ┌──────▼──────┐
                    │  CANCELLED  │
                    └─────────────┘
```

### User Account State

```
┌──────────┐
<<<<<<< HEAD
│  active  │ true on creation (email verification optional)
│  = true  │
└────┬─────┘
     │
  [Admin deactivates user]
     │
┌────▼──────┐
│  active   │
│  = false  │ (account disabled, cannot login)
└───────────┘
=======
│ PENDING  │ (Email not verified)
└────┬─────┘
     │ [Email verification link clicked]
     │
┌────▼──────┐
│  ACTIVE   │ (Can login, access app)
└────┬──────┘
     │
   [Paths]:
     │
     ├─► SUSPENDED (Payment issue, temp disable)
     │    └─► ACTIVE (Payment recovered)
     │
     └─► DEACTIVATED (User leaves company, soft delete)
>>>>>>> origin/014-sysadmin-platform-admin
```

### Invitation State

```
┌─────────┐
<<<<<<< HEAD
│ pending │ (Email sent, awaiting action)
=======
│ PENDING │ (Email sent, awaiting action)
>>>>>>> origin/014-sysadmin-platform-admin
└────┬────┘
     │
   [Paths]:
     │
<<<<<<< HEAD
     ├─► accepted  (User clicked link, joined company)
     │
     ├─► expired   (7 days passed without action)
     │
     └─► revoked   (Admin cancelled before acceptance)
=======
     ├─► ACCEPTED (User clicked link, account created)
     │
     ├─► EXPIRED (7 days passed)
     │
     ├─► REVOKED (Admin cancelled)
     │
     └─► DECLINED (User rejected - if feature added)
>>>>>>> origin/014-sysadmin-platform-admin
```

### Session State

```
<<<<<<< HEAD
┌────────────────────────────┐
│ ACTIVE (expiresat > now()) │
└────────────┬───────────────┘
             │
  [Logout or expiresat < now()]
             │
┌────────────▼───────────────┐
│ INVALID / DELETED          │
└────────────────────────────┘
```

### Invitation Batch State

```
┌────────┐   [worker picks up]   ┌────────────┐
│ queued ├──────────────────────►│ processing │
└────────┘                       └─────┬──────┘
                                       │
                          ┌────────────┴────────────┐
                          │                         │
                   ┌──────▼──────┐         ┌────────▼──────┐
                   │  completed  │         │    failed     │
                   └─────────────┘         └───────────────┘
=======
┌────────┐
│ ACTIVE │ (Valid refresh token, user can get access tokens)
└────┬───┘
     │
  [Logout or token expired]
     │
┌────▼────────┐
│ REVOKED     │ (Cannot issue new access tokens)
└─────────────┘
>>>>>>> origin/014-sysadmin-platform-admin
```

---

## Validation Rules Summary

### Business Rules
<<<<<<< HEAD
1. **Company Registration**: `contactemail` must be unique; `billingplan` determines `maxusers` default
2. **User Creation**: First user MUST have `usertype = 'ADMIN'` and `active = true`; `emailaddr` must be globally unique
3. **Invitations**: Max 1 active (`pending`) invitation per email per company; 7-day expiry enforced
4. **Subscriptions**: FREE = 1 user, SMALL_BUSINESS = 5 users, CONSULTANT/ENTERPRISE = unlimited
5. **Sessions**: New session per login; expired sessions are invalid
6. **Audit Trail**: All material actions logged in `companyauditlogs`; append-only; retained indefinitely
7. **Email Verification**: Max 5 attempts per token; 24-hour expiry; single-use

### Data Integrity
1. Foreign keys enforced (no orphaned records)
2. UNIQUE constraint on `contactemail` (companies), `emailaddr` (userprofiles), `token` (userinvitations)
3. NOT NULL constraints on all required fields
4. Cascade deletes: `userinvitations`, `sessions`, `emailverificationtokens`, `companyauditlogs` cascade on company/user delete
5. SET NULL: `companyauditlogs.changedby` set to NULL if user is deleted

### Security
1. Passwords always bcrypt hashed (12+ rounds); never stored in plaintext
2. Invitation tokens stored as plaintext in `token` field; consider hashing in future
3. Email verification tokens stored as hash (`tokenhash`); plaintext only in email link
4. `clientsecret` in `userprofiles` is for PM system OAuth; must be encrypted at rest
5. Audit logs never contain password hashes or full tokens
=======
1. **Company Registration**: Email must be unique, tier determines user limits
2. **User Creation**: First user MUST be ADMIN, email must be unique per company
3. **Invitations**: Max 1 active (PENDING) invitation per email per company, 7-day expiry
4. **Subscriptions**: FREE tier has 5-user limit, CONSULTANT/ENTERPRISE unlimited
5. **Sessions**: One session per login, token rotation on each refresh
6. **Audit Trail**: All material actions logged, append-only, retained indefinitely

### Data Integrity
1. Foreign keys enforced (no orphaned records)
2. Unique constraints on business identifiers (email, Stripe IDs, tokens)
3. NOT NULL constraints on required fields
4. Enums enforced for status/role fields
5. Timestamps immutable (created, not updated)

### Security
1. Passwords always bcrypt hashed (cost 10+)
2. Tokens always hashed in DB (bcrypt), plaintext only in JWT
3. No sensitive data in audit logs (password hashes, full tokens)
4. IP address and User-Agent logged for session tracking
5. Soft deletes (deleted users retained for audit trail)
>>>>>>> origin/014-sysadmin-platform-admin

---

## Migration Strategy

<<<<<<< HEAD
**Existing tables** (already in production):
- `companies` ✅
- `userprofiles` ✅
- `userinvitations` ✅
- `sessions` ✅
- `companyauditlogs` ✅
- `emailverificationtokens` ✅
- `invitationbatches` ✅

All tables are live. No new migrations required for spec 003 core entities. Any schema additions (e.g., Stripe fields, token family tracking) require a new migration via `db:generate` → human-approved `db:migrate`.
=======
**Phase 1 (Week 1)**:
- [ ] Create `company` table with Stripe fields
- [ ] Create `user` table with auth fields
- [ ] Create `userinvitation` table with token fields
- [ ] Create `session` table with refresh token tracking
- [ ] Create `companyauditlog` table with JSONB details

**Phase 2 (Week 2)**:
- [ ] Add indexes for performance
- [ ] Create audit trigger functions
- [ ] Create materialized view for company metrics
- [ ] Add referential integrity checks

**Phase 3 (Week 3)**:
- [ ] Create background jobs for cleanup (expired invitations, sessions)
- [ ] Add monitoring views
- [ ] Seed test data for E2E testing
>>>>>>> origin/014-sysadmin-platform-admin

---

## Summary

<<<<<<< HEAD
| Entity | Table | PK | Rows/Company | Retention | Key Indexes |
|--------|-------|----|-------------|-----------|-------------|
| companies | `companies` | `id` | 1 | Permanent | UNIQUE contactemail |
| userprofiles | `userprofiles` | `id` | 5–500 | Permanent | UNIQUE emailaddr, FK companyid |
| userinvitations | `userinvitations` | `id` | 10–1000 | 30+ days | UNIQUE token, FK companyid |
| sessions | `sessions` | `id` | 1–10 | Until expiry | FK userid |
| companyauditlogs | `companyauditlogs` | `id` | 100–10K | Permanent | FK companyid, changedby |
| emailverificationtokens | `emailverificationtokens` | `id` | 0–1 active | 24 hours | FK userid |
| invitationbatches | `invitationbatches` | `batchid` | 0–100 | 30+ days | FK projectid, userid |

---

_Updated 2026-06-10: Synced with actual Drizzle schema definitions in `src/db/schema/`_
_Original: Phase 1 Design 2026-02-17_
=======
| Entity | Rows/Company | Retention | Queries | Indexes |
|--------|-------------|-----------|---------|---------|
| company | 1 | Permanent | 2-3 per request | 3 |
| user | 5-500 | Permanent (soft delete) | 3-5 per request | 3 |
| userinvitation | 10-1000 | 30+ days | 2-3 per action | 5 |
| session | 1-10 | 7-30 days | 1-2 per login | 4 |
| companyauditlog | 100-10K | Permanent | Batch queries | 4 |

**Total Storage** (100-user company, 1 year): ~2-5MB (audit logs dominate)

---

_Phase 1 Design | Data Model Complete_
_Ready for: API Contracts, Quickstart Guide, Task Generation_
>>>>>>> origin/014-sysadmin-platform-admin
