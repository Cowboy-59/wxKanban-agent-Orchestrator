# API Contract: SysAdmin Company Management

**Spec:** 014 - SysAdmin Platform Administration  
**Endpoint Base:** `/api/sysadmin/companies`  
**Authentication:** Required (JWT + SysAdmin role)  
**Authorization:** requireSysAdmin middleware

---

## Endpoints

### 1. List Companies

**GET** `/api/sysadmin/companies`

List all companies with pagination, filtering, and sorting.

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page` | integer | No | Page number (default: 1) |
| `limit` | integer | No | Items per page (default: 20, max: 100) |
| `status` | string | No | Filter by status: `pending`, `trial`, `active`, `suspended`, `cancelled` |
| `search` | string | No | Search by company name |
| `sortBy` | string | No | Sort field: `name`, `created`, `status`, `health` (default: `created`) |
| `sortOrder` | string | No | `asc` or `desc` (default: `desc`) |
| `minHealth` | integer | No | Minimum health score (0-100) |
| `subscriptionTier` | string | No | Filter by tier: `free`, `basic`, `pro`, `enterprise` |

**Response** (200 OK):

```json
{
  "success": true,
  "data": {
    "companies": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "companyname": "Acme Corporation",
        "status": "active",
        "subscriptiontier": "pro",
        "createdat": "2024-01-15T10:30:00Z",
        "analytics": {
          "totalusers": 25,
          "activeusers": 18,
          "totalprojects": 12,
          "healthscore": 85,
          "mrr": 299.00
        },
        "laststatuschange": {
          "from": "trial",
          "to": "active",
          "at": "2024-02-01T00:00:00Z",
          "by": "SysAdmin User"
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 156,
      "totalPages": 8,
      "hasNext": true,
      "hasPrev": false
    },
    "filters": {
      "status": "active",
      "search": null
    }
  }
}
```

**Error Responses**:

- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Not SysAdmin role

---

### 2. Get Company Detail

**GET** `/api/sysadmin/companies/:id`

Get detailed information about a specific company.

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | UUID | Yes | Company ID |

**Response** (200 OK):

```json
{
  "success": true,
  "data": {
    "company": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "companyname": "Acme Corporation",
      "primaryemail": "admin@acme.com",
      "phonenumber": "+1-555-123-4567",
      "status": "active",
      "subscriptiontier": "pro",
      "billingplan": "monthly",
      "maxusers": 50,
      "createdat": "2024-01-15T10:30:00Z",
      "updatedat": "2024-06-20T14:22:00Z"
    },
    "analytics": {
      "totalusers": 25,
      "activeusers": 18,
      "totalprojects": 12,
      "activeprojects": 8,
      "totaltasks": 347,
      "completedtasks": 289,
      "totalhourslogged": 1247.5,
      "lastactivityat": "2024-06-20T18:45:00Z",
      "healthscore": 85,
      "mrr": 299.00
    },
    "statusHistory": [
      {
        "id": "660e8400-e29b-41d4-a716-446655440001",
        "status": "active",
        "previousstatus": "trial",
        "changedby": {
          "id": "770e8400-e29b-41d4-a716-446655440002",
          "fullname": "Jane Smith",
          "emailaddr": "jane@wxkanban.com"
        },
        "reason": "Trial converted to paid subscription",
        "createdat": "2024-02-01T00:00:00Z"
      }
    ],
    "users": [
      {
        "id": "880e8400-e29b-41d4-a716-446655440003",
        "fullname": "John Doe",
        "emailaddr": "john@acme.com",
        "usertype": "ADMIN",
        "active": true,
        "lastloginedat": "2024-06-20T09:30:00Z"
      }
    ],
    "recentActivity": [
      {
        "type": "project_created",
        "description": "New project 'Q3 Marketing Campaign' created",
        "timestamp": "2024-06-19T16:20:00Z",
        "user": "Jane Doe"
      }
    ]
  }
}
```

**Error Responses**:

- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Not SysAdmin role
- `404 Not Found` - Company does not exist

---

### 3. Create Company

**POST** `/api/sysadmin/companies`

Create a new company manually (on behalf of a client).

**Request Body**:

```json
{
  "companyname": "New Company Inc",
  "primaryemail": "admin@newcompany.com",
  "phonenumber": "+1-555-987-6543",
  "subscriptiontier": "pro",
  "billingplan": "monthly",
  "maxusers": 25,
  "adminUser": {
    "fullname": "Admin User",
    "emailaddr": "admin@newcompany.com",
    "password": "temporaryPassword123"
  },
  "initialStatus": "active",
  "skipTrial": true,
  "notes": "Enterprise client - priority onboarding"
}
```

**Validation Rules**:

- `companyname`: Required, 2-100 characters
- `primaryemail`: Required, valid email format
- `phonenumber`: Optional, 10-20 characters
- `subscriptiontier`: Required, enum: `free`, `basic`, `pro`, `enterprise`
- `billingplan`: Required, enum: `monthly`, `annual`
- `maxusers`: Required, integer, 1-1000
- `adminUser`: Required object with `fullname`, `emailaddr`, `password`
- `initialStatus`: Optional, default: `trial`
- `skipTrial`: Optional, boolean (SysAdmin only)
- `notes`: Optional, max 500 characters

**Response** (201 Created):

```json
{
  "success": true,
  "data": {
    "company": {
      "id": "990e8400-e29b-41d4-a716-446655440004",
      "companyname": "New Company Inc",
      "status": "active",
      "subscriptiontier": "pro",
      "createdat": "2024-06-21T10:00:00Z"
    },
    "adminUser": {
      "id": "aa0e8400-e29b-41d4-a716-446655440005",
      "fullname": "Admin User",
      "emailaddr": "admin@newcompany.com",
      "usertype": "ADMIN"
    },
    "message": "Company created successfully. Admin user credentials sent via email."
  }
}
```

**Error Responses**:

- `400 Bad Request` - Validation errors
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Not SysAdmin role
- `409 Conflict` - Email already exists

---

### 4. Update Company Status

**PUT** `/api/sysadmin/companies/:id/status`

Update the status of a company (suspend, activate, cancel, etc.).

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | UUID | Yes | Company ID |

**Request Body**:

```json
{
  "status": "suspended",
  "reason": "Payment overdue - 3 failed attempts",
  "effectiveDate": "2024-06-21T00:00:00Z",
  "notifyUsers": true,
  "customMessage": "Your account has been temporarily suspended due to billing issues. Please contact support."
}
```

**Validation Rules**:

- `status`: Required, enum: `trial`, `active`, `suspended`, `cancelled`
- `reason`: Required when changing to `suspended` or `cancelled`, max 500 chars
- `effectiveDate`: Optional, default: immediate
- `notifyUsers`: Optional, boolean, default: true
- `customMessage`: Optional, max 1000 chars

**Status Transition Rules**:

| From | To | Allowed | Requires Reason |
|------|-----|---------|-----------------|
| pending | trial | ✅ | No |
| pending | active | ✅ | No |
| trial | active | ✅ | No |
| trial | cancelled | ✅ | Yes |
| active | suspended | ✅ | Yes |
| active | cancelled | ✅ | Yes |
| suspended | active | ✅ | No |
| suspended | cancelled | ✅ | Yes |
| cancelled | active | ✅ | No |
| any | deleted | ✅ SysAdmin only | Yes |

**Response** (200 OK):

```json
{
  "success": true,
  "data": {
    "company": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "previousStatus": "active",
      "newStatus": "suspended",
      "effectiveDate": "2024-06-21T00:00:00Z"
    },
    "statusRecord": {
      "id": "bb0e8400-e29b-41d4-a716-446655440006",
      "status": "suspended",
      "previousstatus": "active",
      "reason": "Payment overdue - 3 failed attempts",
      "changedby": "SysAdmin User",
      "createdat": "2024-06-21T10:30:00Z"
    },
    "notificationsSent": 25
  }
}
```

**Error Responses**:

- `400 Bad Request` - Invalid status transition or missing reason
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Not SysAdmin role
- `404 Not Found` - Company does not exist
- `409 Conflict` - Invalid status transition

---

### 5. Delete Company

**DELETE** `/api/sysadmin/companies/:id`

Soft delete a company (marks as deleted, retains data per retention policy).

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | UUID | Yes | Company ID |

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `reason` | string | Yes | Reason for deletion |
| `retentionDays` | integer | No | Data retention period (default: 90) |
| `notifyUsers` | boolean | No | Notify company users (default: true) |
| `immediate` | boolean | No | Delete immediately vs grace period (default: false) |

**Response** (200 OK):

```json
{
  "success": true,
  "data": {
    "company": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "status": "deleted",
      "deletedat": "2024-06-21T10:30:00Z",
      "dataretentionuntil": "2024-09-19T10:30:00Z"
    },
    "message": "Company scheduled for deletion. Data will be retained until 2024-09-19.",
    "notificationsSent": 25
  }
}
```

**Error Responses**:

- `400 Bad Request` - Missing required reason
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Not SysAdmin role
- `404 Not Found` - Company does not exist

---

### 6. Get Company Analytics

**GET** `/api/sysadmin/companies/:id/analytics`

Get detailed analytics for a specific company.

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | UUID | Yes | Company ID |

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `period` | string | No | Time period: `7d`, `30d`, `90d`, `1y` (default: `30d`) |
| `compare` | boolean | No | Include previous period comparison (default: false) |

**Response** (200 OK):

```json
{
  "success": true,
  "data": {
    "company": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "companyname": "Acme Corporation"
    },
    "period": "30d",
    "current": {
      "users": {
        "total": 25,
        "active": 18,
        "new": 3,
        "churned": 1
      },
      "projects": {
        "total": 12,
        "active": 8,
        "completed": 4,
        "new": 2
      },
      "tasks": {
        "total": 347,
        "completed": 289,
        "created": 45,
        "overdue": 12
      },
      "time": {
        "totalHours": 247.5,
        "billableHours": 198.0,
        "averagePerUser": 9.9
      },
      "engagement": {
        "loginFrequency": "daily",
        "featureAdoption": 0.75,
        "healthScore": 85
      }
    },
    "comparison": {
      "users": {
        "totalChange": "+14%",
        "activeChange": "+20%"
      },
      "healthScoreChange": "+5"
    },
    "trends": {
      "dailyActiveUsers": [
        { "date": "2024-05-22", "count": 15 },
        { "date": "2024-05-23", "count": 16 }
      ]
    }
  }
}
```

**Error Responses**:

- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Not SysAdmin role
- `404 Not Found` - Company does not exist

---

## Common Response Patterns

### Success Response Structure
```json
{
  "success": true,
  "data": { ... },
  "meta": { ... } // Optional: pagination, filters, etc.
}
```

### Error Response Structure
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": [
      { "field": "companyname", "message": "Company name is required" }
    ]
  }
}
```

---

## Rate Limiting

- **Standard**: 100 requests per minute per SysAdmin user
- **Bulk operations**: 10 requests per minute (create company, delete company)
- **Analytics**: 30 requests per minute (heavy queries)

---

*This API contract was generated as part of the wxAI pipeline Phase 3: Plan*
