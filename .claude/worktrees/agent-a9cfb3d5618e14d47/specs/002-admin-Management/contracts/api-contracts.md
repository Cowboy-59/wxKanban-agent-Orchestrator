# API Contracts: Admin & Company Management System

**Feature**: 002-admin-management
**Created**: 2026-02-14
**Version**: 1.0
**Status**: Draft

---

## Overview

This document specifies the REST API endpoints for the Admin & Company Management feature. All endpoints follow REST conventions and return JSON responses. All timestamps are in ISO 8601 format (UTC). All monetary values use DECIMAL(12,2) format.

**Base URL**: `/api`
**Authentication**: Bearer token in Authorization header (JWT)
**Response Format**: JSON with standard envelope:

```json
{
  "success": true,
  "data": {
    /* response body */
  },
  "error": null,
  "timestamp": "2026-02-14T12:00:00Z"
}
```

---

## Company Management Endpoints

### 1. Create Company (Register)

**Endpoint**: `POST /api/company`

**Authentication**: None (public endpoint, pre-authentication)

**Request Body**:

```json
{
  "name": "Acme Corporation",
  "contactemail": "billing@acme.com",
  "address": "123 Main St, New York, NY 10001",
  "phone": "+1-555-0100",
  "billingplan": "CONSULTANT"
}
```

**Request Validation**:

- `name`: Required, 1-255 characters
- `contactemail`: Required, valid email, must be unique globally
- `address`: Optional, 1-1000 characters
- `phone`: Optional, valid phone format
- `billingplan`: Required, one of ['FREE', 'SMALL_BUSINESS', 'CONSULTANT', 'ENTERPRISE']

**Response (201 Created)**:

```json
{
  "success": true,
  "data": {
    "companyid": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Acme Corporation",
    "contactemail": "billing@acme.com",
    "billingplan": "CONSULTANT",
    "activeflag": false,
    "verifiedat": null,
    "createdat": "2026-02-14T12:00:00Z"
  }
}
```

**Error Responses**:

- `400 Bad Request`: Missing required fields or validation failed
  ```json
  { "error": "contactemail is not a valid email address" }
  ```
- `409 Conflict`: Email already registered
  ```json
  { "error": "contactemail is already in use" }
  ```

**Side Effects**:

- Sends verification email to contactemail
- Creates company with activeflag=false until verified
- Creates admin user account (email=contactemail)

---

### 2. Get Company Profile

**Endpoint**: `GET /api/company`

**Authentication**: Required (Admin or TeamManager role)

**Response (200 OK)**:

```json
{
  "success": true,
  "data": {
    "companyid": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Acme Corporation",
    "contactemail": "billing@acme.com",
    "address": "123 Main St, New York, NY 10001",
    "phone": "+1-555-0100",
    "billingplan": "CONSULTANT",
    "hourlyrate": "150.00",
    "logourl": "https://s3.amazonaws.com/companies/550e8400-logo.png",
    "activeflag": true,
    "verifiedat": "2026-02-14T13:00:00Z",
    "createdat": "2026-02-14T12:00:00Z",
    "updatedat": "2026-02-14T13:00:00Z",
    "usercount": 5,
    "projectcount": 3,
    "totalhoursthismonth": 120.5
  }
}
```

**Authorization**:

- Admin: Can view own company
- TeamManager: Can view own company
- Developer: 403 Forbidden

---

### 3. Update Company Profile

**Endpoint**: `PATCH /api/company`

**Authentication**: Required (Admin role only)

**Request Body** (all fields optional):

```json
{
  "name": "Acme Corporation Updated",
  "address": "456 Oak Ave, Boston, MA 02101",
  "phone": "+1-555-0200",
  "hourlyrate": "175.50"
}
```

**Response (200 OK)**:

```json
{
  "success": true,
  "data": {
    "companyid": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Acme Corporation Updated",
    "address": "456 Oak Ave, Boston, MA 02101",
    "phone": "+1-555-0200",
    "hourlyrate": "175.50",
    "updatedat": "2026-02-14T14:00:00Z"
  }
}
```

**Side Effects**:

- Logs change to CompanyAuditLog
- Updates updatedat timestamp
- Notifies all users of profile change (optional email)

---

### 4. Deactivate Company

**Endpoint**: `DELETE /api/company`

**Authentication**: Required (Admin role only)

**Request Body**:

```json
{
  "reason": "Business closed"
}
```

**Response (200 OK)**:

```json
{
  "success": true,
  "data": {
    "companyid": "550e8400-e29b-41d4-a716-446655440000",
    "activeflag": false,
    "deactivatedat": "2026-02-14T15:00:00Z"
  }
}
```

**Side Effects**:

- Sets activeflag=false
- Logs deactivation to CompanyAuditLog with reason
- All users immediately lose access (cannot login)
- All projects archived
- Data preserved for 90 days
- Sends notification email to all admins

---

## User and Role Management Endpoints

### 5. Invite User(s)

**Endpoint**: `POST /api/company/users`

**Authentication**: Required (Admin role only)

**Request Body (Single User)**:

```json
{
  "email": "john.doe@example.com",
  "role": "Developer"
}
```

**Request Body (Bulk Import - CSV)**:

```json
{
  "emails": [
    { "email": "john.doe@example.com", "role": "Developer" },
    { "email": "jane.smith@example.com", "role": "TeamManager" },
    { "email": "bob.jones@example.com", "role": "Developer" }
  ]
}
```

**Request Validation**:

- `email`: Valid email format, not already registered in this company
- `role`: One of ['Admin', 'TeamManager', 'Developer']

**Response (201 Created)**:

```json
{
  "success": true,
  "data": {
    "invited": [
      {
        "invitationid": "660e8400-e29b-41d4-a716-446655440001",
        "email": "john.doe@example.com",
        "role": "Developer",
        "status": "pending",
        "expireseat": "2026-02-21T12:00:00Z",
        "invitedat": "2026-02-14T12:00:00Z"
      }
    ],
    "failed": [],
    "totalinvited": 1
  }
}
```

**Error Responses**:

- `400 Bad Request`: Invalid email or role
- `409 Conflict`: User already registered in company

**Side Effects**:

- Creates UserInvitation records
- Sends invitation email with 7-day join link
- Logs invitation to CompanyAuditLog

---

### 6. List Company Users

**Endpoint**: `GET /api/company/users?role=Developer&status=active`

**Authentication**: Required (Admin or TeamManager role)

**Query Parameters**:

- `role`: Optional filter (Admin, TeamManager, Developer)
- `status`: Optional filter (active, inactive, all) - default: active
- `limit`: Optional pagination (default 50, max 1000)
- `offset`: Optional pagination offset (default 0)

**Response (200 OK)**:

```json
{
  "success": true,
  "data": {
    "users": [
      {
        "userid": "550e8400-e29b-41d4-a716-446655440000",
        "email": "john.doe@example.com",
        "role": "Developer",
        "activeflag": true,
        "joinedat": "2026-02-10T10:00:00Z",
        "lastloginedat": "2026-02-14T09:00:00Z",
        "payrate": null,
        "tracktimeflag": true
      }
    ],
    "total": 5,
    "limit": 50,
    "offset": 0
  }
}
```

---

### 7. Update User (Role, Status, Billing)

**Endpoint**: `PATCH /api/company/users/{userid}`

**Authentication**: Required (Admin role only)

**Request Body** (all optional):

```json
{
  "role": "TeamManager",
  "activeflag": true,
  "payrate": "200.00",
  "tracktimeflag": true
}
```

**Response (200 OK)**:

```json
{
  "success": true,
  "data": {
    "userid": "550e8400-e29b-41d4-a716-446655440000",
    "email": "john.doe@example.com",
    "role": "TeamManager",
    "activeflag": true,
    "payrate": "200.00",
    "tracktimeflag": true
  }
}
```

**Authorization**: Admin only

**Side Effects**:

- Logs change to CompanyAuditLog
- If activeflag changed: sends notification email
- If role changed: applies new access controls immediately

---

### 8. Deactivate User

**Endpoint**: `POST /api/company/users/{userid}/deactivate`

**Authentication**: Required (Admin role only)

**Request Body**:

```json
{
  "reason": "Employee left company"
}
```

**Response (200 OK)**:

```json
{
  "success": true,
  "data": {
    "userid": "550e8400-e29b-41d4-a716-446655440000",
    "activeflag": false,
    "deactivatedat": "2026-02-14T15:00:00Z"
  }
}
```

**Side Effects**:

- Sets activeflag=false
- User immediately loses login access
- Time entries preserved for billing
- Logs deactivation to CompanyAuditLog

---

### 9. Get User Profile

**Endpoint**: `GET /api/company/users/{userid}`

**Authentication**: Required (Admin, or user viewing self)

**Response (200 OK)**:

```json
{
  "success": true,
  "data": {
    "userid": "550e8400-e29b-41d4-a716-446655440000",
    "email": "john.doe@example.com",
    "role": "Developer",
    "activeflag": true,
    "payrate": null,
    "tracktimeflag": true,
    "timezone": "America/New_York",
    "joinedat": "2026-02-10T10:00:00Z",
    "lastloginedat": "2026-02-14T09:00:00Z",
    "assignedprojects": [
      { "projectid": "...", "name": "Project A", "role": "TeamMember" }
    ]
  }
}
```

---

## Project and User Assignment Endpoints

### 10. Add User to Project

**Endpoint**: `POST /api/projects/{projectid}/users`

**Authentication**: Required (Admin or Lead on project)

**Request Body**:

```json
{
  "userid": "550e8400-e29b-41d4-a716-446655440000",
  "role": "TeamMember"
}
```

**Request Validation**:

- `userid`: Must exist and belong to same company
- `role`: One of ['Lead', 'TeamMember', 'Observer']

**Response (201 Created)**:

```json
{
  "success": true,
  "data": {
    "projectuserid": "770e8400-e29b-41d4-a716-446655440001",
    "userid": "550e8400-e29b-41d4-a716-446655440000",
    "projectid": "660e8400-e29b-41d4-a716-446655440000",
    "role": "TeamMember",
    "assignedat": "2026-02-14T12:00:00Z"
  }
}
```

**Side Effects**:

- User added to project immediately
- User sees project in their dashboard
- Notification email sent to user
- Logs assignment to CompanyAuditLog

---

### 11. List Project Users

**Endpoint**: `GET /api/projects/{projectid}/users`

**Authentication**: Required (Project member)

**Response (200 OK)**:

```json
{
  "success": true,
  "data": {
    "users": [
      {
        "userid": "550e8400-e29b-41d4-a716-446655440000",
        "email": "john.doe@example.com",
        "role": "Lead",
        "assignedat": "2026-02-10T10:00:00Z"
      }
    ],
    "total": 3
  }
}
```

---

### 12. Remove User from Project

**Endpoint**: `DELETE /api/projects/{projectid}/users/{userid}`

**Authentication**: Required (Admin or Lead on project)

**Response (200 OK)**:

```json
{
  "success": true,
  "data": {
    "projectuserid": "770e8400-e29b-41d4-a716-446655440001",
    "userid": "550e8400-e29b-41d4-a716-446655440000",
    "removedat": "2026-02-14T15:00:00Z"
  }
}
```

**Side Effects**:

- User loses access to project
- Time entries preserved
- Notification email sent to user
- Logs removal to CompanyAuditLog

---

## Billing and Rate Management Endpoints

### 13. Get Billing Rates

**Endpoint**: `GET /api/company/billing/rates`

**Authentication**: Required (Admin role only)

**Query Parameters**:

- `projectid`: Optional - get rates for specific project

**Response (200 OK)**:

```json
{
  "success": true,
  "data": {
    "companyrate": "150.00",
    "projectrates": [
      {
        "projectid": "660e8400-e29b-41d4-a716-446655440000",
        "name": "Project A",
        "rate": "200.00"
      }
    ],
    "userrates": [
      {
        "userid": "550e8400-e29b-41d4-a716-446655440000",
        "email": "john.doe@example.com",
        "rate": "250.00"
      }
    ]
  }
}
```

---

### 14. Update Billing Rates

**Endpoint**: `PATCH /api/company/billing/rates`

**Authentication**: Required (Admin role only)

**Request Body**:

```json
{
  "type": "company|project|user",
  "id": "660e8400-e29b-41d4-a716-446655440000", // projectid or userid, omit for company
  "rate": "175.50"
}
```

**Response (200 OK)**:

```json
{
  "success": true,
  "data": {
    "rateapplied": "175.50",
    "previousrate": "150.00",
    "updatedat": "2026-02-14T12:00:00Z"
  }
}
```

**Side Effects**:

- Logs rate change to CompanyAuditLog
- Affects future time entries (historical entries use rate at time of entry)

---

### 15. Generate Invoice

**Endpoint**: `POST /api/company/billing/invoices`

**Authentication**: Required (Admin role only)

**Request Body**:

```json
{
  "startdate": "2026-02-01",
  "enddate": "2026-02-28",
  "projectid": null,
  "clientemail": "billing@client.com",
  "description": "February 2026 Services"
}
```

**Request Validation**:

- `startdate`, `enddate`: Valid date format
- `projectid`: Optional (null = company-wide invoice)
- `clientemail`: Valid email if provided
- `description`: Optional, max 1000 characters

**Response (201 Created)**:

```json
{
  "success": true,
  "data": {
    "invoiceid": "880e8400-e29b-41d4-a716-446655440000",
    "invoicenumber": "INV-2026-001",
    "totalamount": "18000.00",
    "hoursworked": "120.00",
    "downloadurl": "https://s3.amazonaws.com/invoices/880e8400.pdf",
    "generatedat": "2026-02-14T12:00:00Z"
  }
}
```

**Side Effects**:

- Marks all included TimeEntry records with invoiced=true
- Generates PDF and uploads to S3
- Logs invoice generation to CompanyAuditLog
- Optionally sends email if clientemail provided

---

### 16. Get Billing Reports

**Endpoint**: `GET /api/company/billing/reports?type=revenue&startdate=2026-01-01&enddate=2026-02-28`

**Authentication**: Required (Admin role only)

**Query Parameters**:

- `type`: Required (revenue, hours, profitability, teamproductivity)
- `startdate`: Required (YYYY-MM-DD format)
- `enddate`: Required (YYYY-MM-DD format)
- `projectid`: Optional
- `userid`: Optional
- `format`: Optional (json, csv, excel) - default: json

**Response (200 OK - JSON)**:

```json
{
  "success": true,
  "data": {
    "reporttype": "revenue",
    "period": { "start": "2026-01-01", "end": "2026-02-28" },
    "summary": {
      "totalrevenue": "36000.00",
      "totalhours": "240.00",
      "averagehourlyrrate": "150.00"
    },
    "bymonth": [
      {
        "month": "2026-01",
        "revenue": "18000.00",
        "hours": "120.00"
      }
    ],
    "byproject": [
      {
        "projectid": "...",
        "name": "Project A",
        "revenue": "24000.00",
        "hours": "160.00"
      }
    ]
  }
}
```

**Response (200 OK - CSV)**:

```
Month,Project,Revenue,Hours,Rate
2026-01,Project A,18000.00,120.00,150.00
```

---

## Admin Dashboard Endpoints

### 17. Get Dashboard Summary

**Endpoint**: `GET /api/company/dashboard`

**Authentication**: Required (Admin or TeamManager)

**Response (200 OK)**:

```json
{
  "success": true,
  "data": {
    "company": {
      "name": "Acme Corporation",
      "plan": "CONSULTANT",
      "usercount": 5,
      "activeprojects": 3
    },
    "thismonth": {
      "billablehours": 120.5,
      "revenue": "18075.00",
      "invoices": 1,
      "averageuserproductivity": "24.1 hours"
    },
    "team": [
      {
        "userid": "550e8400-e29b-41d4-a716-446655440000",
        "email": "john.doe@example.com",
        "hoursthisweek": 38.5,
        "projectcount": 2,
        "lastactive": "2026-02-14T09:00:00Z"
      }
    ],
    "projects": [
      {
        "projectid": "660e8400-e29b-41d4-a716-446655440000",
        "name": "Project A",
        "completion": 75,
        "hoursthismonth": 85.0,
        "usercount": 3
      }
    ],
    "activities": [
      {
        "timestamp": "2026-02-14T12:00:00Z",
        "action": "invoice_generated",
        "description": "Invoice INV-2026-001 generated ($18000.00)"
      }
    ]
  }
}
```

---

### 18. Configure Email Notifications

**Endpoint**: `PATCH /api/company/notifications`

**Authentication**: Required (Admin role only)

**Request Body**:

```json
{
  "emailsummary": {
    "enabled": true,
    "frequency": "daily",
    "time": "06:00",
    "recipients": ["admin@acme.com", "billing@acme.com"]
  }
}
```

**Response (200 OK)**:

```json
{
  "success": true,
  "data": {
    "emailsummary": {
      "enabled": true,
      "frequency": "daily",
      "time": "06:00",
      "recipients": 2,
      "nextsendtime": "2026-02-15T06:00:00Z"
    }
  }
}
```

---

## Error Response Format

All error responses follow standard format:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email is required",
    "details": {
      "field": "contactemail",
      "constraint": "required"
    }
  },
  "timestamp": "2026-02-14T12:00:00Z"
}
```

### Standard HTTP Status Codes

| Status | Meaning               | When Used                                    |
| ------ | --------------------- | -------------------------------------------- |
| 200    | OK                    | Successful GET/PATCH request                 |
| 201    | Created               | Successful POST request                      |
| 204    | No Content            | DELETE successful with no response body      |
| 400    | Bad Request           | Validation error, malformed request          |
| 401    | Unauthorized          | Missing or invalid authentication token      |
| 403    | Forbidden             | User lacks required role/permission          |
| 404    | Not Found             | Resource does not exist                      |
| 409    | Conflict              | Duplicate email, unique constraint violation |
| 429    | Too Many Requests     | Rate limit exceeded                          |
| 500    | Internal Server Error | Unhandled server error                       |
| 503    | Service Unavailable   | Server temporarily unavailable               |

---

## Authentication & Authorization

### Bearer Token Format

```
Authorization: Bearer {jwt_token}
```

### JWT Claims

```json
{
  "sub": "userid",
  "email": "john@example.com",
  "companyid": "550e8400-e29b-41d4-a716-446655440000",
  "role": "Admin",
  "iat": 1708011600,
  "exp": 1708098000
}
```

### Role-Based Access Control Matrix

| Endpoint                            | Admin | TeamManager | Developer | Public |
| ----------------------------------- | ----- | ----------- | --------- | ------ |
| POST /company                       | ✓     | -           | -         | ✓      |
| GET /company                        | ✓     | ✓           | -         | -      |
| PATCH /company                      | ✓     | -           | -         | -      |
| DELETE /company                     | ✓     | -           | -         | -      |
| POST /company/users                 | ✓     | -           | -         | -      |
| GET /company/users                  | ✓     | ✓           | -         | -      |
| PATCH /company/users/{id}           | ✓     | -           | -         | -      |
| POST /company/users/{id}/deactivate | ✓     | -           | -         | -      |
| POST /projects/{id}/users           | ✓     | ✓           | -         | -      |
| GET /projects/{id}/users            | ✓     | ✓           | ✓         | -      |
| DELETE /projects/{id}/users/{id}    | ✓     | ✓           | -         | -      |
| GET /company/billing/rates          | ✓     | -           | -         | -      |
| PATCH /company/billing/rates        | ✓     | -           | -         | -      |
| POST /company/billing/invoices      | ✓     | -           | -         | -      |
| GET /company/billing/reports        | ✓     | -           | -         | -      |
| GET /company/dashboard              | ✓     | ✓           | -         | -      |

---

## Rate Limiting

- **Default**: 100 requests per minute per user
- **Elevated**: Bulk operations (POST with arrays) allow 10 requests per minute
- **Response Header**: `X-RateLimit-Remaining`, `X-RateLimit-Reset`

---

## Pagination

All list endpoints support pagination:

**Query Parameters**:

- `limit`: Items per page (default 50, max 1000)
- `offset`: Starting position (default 0)

**Response**:

```json
{
  "data": [
    /* items */
  ],
  "total": 150,
  "limit": 50,
  "offset": 50
}
```

---

## Data Export

Reports can be exported to multiple formats:

**CSV Export**:

- `GET /api/company/users?format=csv`
- Response: `text/csv` with headers
- Filename: `company_users_20260214.csv`

**Excel Export**:

- `GET /api/company/users?format=excel`
- Response: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Filename: `company_users_20260214.xlsx`

---

---

## Subscription & Plan Management Endpoints

### 19. Get Subscription Status

**Endpoint**: `GET /api/company/subscription`

**Auth**: Required — Admin only

**Response (200 OK)**:

```json
{
  "success": true,
  "data": {
    "billingplan": "CONSULTANT",
    "subscriptionstatus": "ACTIVE",
    "seatslimit": 999,
    "seatsused": 12,
    "nextbillingdate": "2026-03-14T00:00:00Z",
    "monthlyprice": 29.95,
    "overage": null
  }
}
```

**Notes**: `overage` is non-null for ENTERPRISE only — `{ "includedseats": 25, "extraseats": 5, "overagecost": 25.00 }`

**Error Responses**:

- `401 Unauthorized`: Not authenticated
- `403 Forbidden`: User is not ADMIN

---

### 20. Upgrade Subscription Plan

**Endpoint**: `PATCH /api/company/subscription`

**Auth**: Required — Admin only

**Request Body**:

```json
{
  "billingplan": "ENTERPRISE",
  "paymentmethodid": "pm_stripe_token_here"
}
```

**Request Validation**:

- `billingplan`: Required, one of ['FREE', 'SMALL_BUSINESS', 'CONSULTANT', 'ENTERPRISE']
- `paymentmethodid`: Required for CONSULTANT or ENTERPRISE; omit for FREE/SMALL_BUSINESS
- Downgrade validation: current seat count must be within new plan limit

**Response (200 OK)**:

```json
{
  "success": true,
  "data": {
    "billingplan": "ENTERPRISE",
    "subscriptionstatus": "ACTIVE",
    "seatslimit": 9999,
    "effectiveat": "2026-02-19T12:00:00Z"
  }
}
```

**Error Responses**:

- `400 Bad Request`: Seat count exceeds new plan limit (include `{ "currentseats": 8, "newlimit": 5 }`)
- `402 Payment Required`: Stripe payment failed
- `403 Forbidden`: User is not ADMIN

---

## Admin Dashboard Endpoint

### 21. Get Admin Dashboard Data

**Endpoint**: `GET /api/admin/dashboard`

**Auth**: Required — Admin only (TEAM members receive 403)

**Query Parameters**:

- `refresh=true` — bypass 5-minute cache and force fresh data

**Response (200 OK)**:

```json
{
  "success": true,
  "data": {
    "subscription": {
      "billingplan": "CONSULTANT",
      "subscriptionstatus": "ACTIVE",
      "seatsused": 12,
      "seatslimit": 999
    },
    "team": {
      "total": 12,
      "active": 10,
      "pending": 2,
      "byRole": { "Admin": 2, "TeamManager": 3, "Developer": 7 }
    },
    "projects": [
      {
        "projectid": "uuid",
        "name": "Client Portal",
        "assignedcount": 4,
        "taskcount": 28,
        "status": "active",
        "percentcomplete": 65
      }
    ],
    "financials": {
      "billablehoursthismonth": 142.5,
      "estimatedrevenue": 4268.75,
      "outstandinginvoices": 2,
      "mrr": 29.95
    },
    "digestpreview": {
      "asof": "2026-02-19T00:00:00Z",
      "hourstracked": 8.5,
      "activemembers": 6,
      "topproject": "Client Portal"
    },
    "activityfeed": [
      {
        "type": "user_joined",
        "actor": "jane@acme.com",
        "timestamp": "2026-02-19T09:00:00Z"
      }
    ],
    "cacheduntil": "2026-02-19T12:05:00Z"
  }
}
```

**Tier Gating Behavior**:

- `financials` section: present for CONSULTANT+, omitted for FREE/SMALL_BUSINESS
- `activityfeed` section: present for all tiers
- Response includes `lockedfeatures` array listing which sections are locked for current plan:

```json
{
  "lockedfeatures": [
    { "feature": "invoicing", "requiresplan": "CONSULTANT" },
    { "feature": "reports", "requiresplan": "CONSULTANT" }
  ]
}
```

**Error Responses**:

- `403 Forbidden`: User is not ADMIN — `{ "error": "Admin access required" }`

---

### 22. Check Feature Access (Tier Gate)

**Endpoint**: `GET /api/company/feature/:featurename`

**Auth**: Required — Any authenticated user

**Path Parameters**:

- `featurename`: One of `invoicing`, `reports`, `pm_integrations`, `time_billing`, `team_manager`, `sso`

**Response (200 OK — feature accessible)**:

```json
{
  "success": true,
  "data": {
    "feature": "invoicing",
    "accessible": true,
    "requiredplan": "CONSULTANT",
    "currentplan": "CONSULTANT"
  }
}
```

**Response (200 OK — feature locked)**:

```json
{
  "success": true,
  "data": {
    "feature": "invoicing",
    "accessible": false,
    "requiredplan": "CONSULTANT",
    "currentplan": "FREE",
    "upgradeurl": "/settings/billing/upgrade"
  }
}
```

**Notes**: Returns 200 (not 403) so the client can render the locked state UI. The 403 is reserved for direct API calls to locked feature endpoints.

---

**Total Endpoints Documented**: 22 endpoints covering company management, user administration, project assignment, billing, dashboard, subscription management, and tier gating.
