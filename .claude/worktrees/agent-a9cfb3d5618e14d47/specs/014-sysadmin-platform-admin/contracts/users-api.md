# API Contract: SysAdmin User Management

**Spec:** 014 - SysAdmin Platform Administration  
**Endpoint Base:** `/api/sysadmin/users`  
**Authentication:** Required (JWT + SysAdmin role)  
**Authorization:** requireSysAdmin middleware

---

## Endpoints

### 1. Search Users Globally

**GET** `/api/sysadmin/users`

Search across all companies for users.

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `q` | string | No | Search query (email, name, or partial match) |
| `companyid` | UUID | No | Filter by specific company |
| `usertype` | string | No | Filter by role: `TEAM_MEMBER`, `TEAM_MANAGER`, `ADMIN` |
| `status` | string | No | Filter by status: `active`, `inactive`, `all` (default: `all`) |
| `page` | integer | No | Page number (default: 1) |
| `limit` | integer | No | Items per page (default: 20, max: 100) |
| `sortBy` | string | No | Sort field: `name`, `email`, `company`, `lastlogin` (default: `name`) |
| `sortOrder` | string | No | `asc` or `desc` (default: `asc`) |
| `lastLoginSince` | date | No | Filter users who logged in since date (ISO 8601) |
| `lastLoginBefore` | date | No | Filter users who logged in before date (ISO 8601) |
| `createdSince` | date | No | Filter users created since date |

**Response** (200 OK):

```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "fullname": "John Doe",
        "emailaddr": "john@acme.com",
        "usertype": "ADMIN",
        "active": true,
        "company": {
          "id": "660e8400-e29b-41d4-a716-446655440001",
          "companyname": "Acme Corporation",
          "status": "active"
        },
        "lastloginedat": "2024-06-20T14:30:00Z",
        "joinedat": "2024-01-15T10:00:00Z",
        "securitylevel": 7,
        "tracktime": true
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1247,
      "totalPages": 63,
      "hasNext": true,
      "hasPrev": false
    },
    "filters": {
      "query": "john",
      "companyid": null,
      "usertype": null,
      "status": "active"
    }
  }
}
```

**Error Responses**:

- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Not SysAdmin role

---

### 2. Get User Detail

**GET** `/api/sysadmin/users/:id`

Get comprehensive user information across all companies.

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | UUID | Yes | User ID |

**Response** (200 OK):

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "fullname": "John Doe",
      "emailaddr": "john@acme.com",
      "usertype": "ADMIN",
      "active": true,
      "securitylevel": 7,
      "payrate": 75.00,
      "payratemethod": "hourly",
      "tracktime": true,
      "timezone": "America/New_York",
      "joinedat": "2024-01-15T10:00:00Z",
      "lastloginedat": "2024-06-20T14:30:00Z",
      "allowoutsideteams": false,
      "dashboardconfig": {
        "widgets": ["tasks", "time", "projects"]
      }
    },
    "company": {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "companyname": "Acme Corporation",
      "status": "active",
      "subscriptiontier": "pro"
    },
    "activity": {
      "totalLogins": 145,
      "totalTasksCompleted": 89,
      "totalHoursLogged": 347.5,
      "currentProjects": 5,
      "lastActivity": "2024-06-20T16:45:00Z"
    },
    "loginHistory": [
      {
        "timestamp": "2024-06-20T14:30:00Z",
        "ip": "192.168.1.100",
        "userAgent": "Mozilla/5.0...",
        "success": true
      }
    ],
    "projectAccess": [
      {
        "projectid": "770e8400-e29b-41d4-a716-446655440002",
        "projectname": "Q2 Marketing Campaign",
        "role": "manager",
        "assignedat": "2024-03-01T00:00:00Z"
      }
    ],
    "auditTrail": [
      {
        "action": "password_reset",
        "performedby": "SysAdmin Jane",
        "timestamp": "2024-05-15T10:30:00Z",
        "reason": "User request via support ticket #1234"
      }
    ]
  }
}
```

**Error Responses**:

- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Not SysAdmin role
- `404 Not Found` - User does not exist

---

### 3. Reset User Password

**POST** `/api/sysadmin/users/:id/reset-password`

Force reset a user's password (generates temporary password).

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | UUID | Yes | User ID |

**Request Body**:

```json
{
  "reason": "User forgot password - support ticket #1234",
  "notifyUser": true,
  "requireChange": true,
  "temporaryPassword": null
}
```

**Request Fields**:

- `reason`: Required, reason for password reset (audit trail)
- `notifyUser`: Optional, send email with new password (default: true)
- `requireChange`: Optional, require password change on login (default: true)
- `temporaryPassword`: Optional, custom temp password (auto-generated if null)

**Response** (200 OK):

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "emailaddr": "john@acme.com"
    },
    "temporaryPassword": "TempPass123!",
    "passwordResetRequired": true,
    "notificationSent": true,
    "message": "Password reset successfully. User must change password on next login."
  }
}
```

**Error Responses**:

- `400 Bad Request` - Missing required reason
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Not SysAdmin role
- `404 Not Found` - User does not exist

---

### 4. Update User Status

**PUT** `/api/sysadmin/users/:id/status`

Enable or disable a user account globally.

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | UUID | Yes | User ID |

**Request Body**:

```json
{
  "active": false,
  "reason": "Security concern - suspicious activity detected",
  "effectiveImmediately": true,
  "terminateSessions": true,
  "notifyUser": true,
  "customMessage": "Your account has been temporarily disabled. Please contact support@wxkanban.com."
}
```

**Request Fields**:

- `active`: Required, new status (true/false)
- `reason`: Required when disabling, max 500 chars
- `effectiveImmediately`: Optional, default: true
- `terminateSessions`: Optional, invalidate all active sessions (default: true)
- `notifyUser`: Optional, send email notification (default: true)
- `customMessage`: Optional, custom message in notification

**Response** (200 OK):

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "emailaddr": "john@acme.com",
      "previousStatus": "active",
      "newStatus": "inactive",
      "effectiveAt": "2024-06-21T10:30:00Z"
    },
    "sessionsTerminated": 3,
    "notificationSent": true,
    "auditRecord": {
      "id": "880e8400-e29b-41d4-a716-446655440003",
      "action": "user_disabled",
      "reason": "Security concern - suspicious activity detected",
      "performedby": "SysAdmin User",
      "timestamp": "2024-06-21T10:30:00Z"
    }
  }
}
```

**Error Responses**:

- `400 Bad Request` - Missing required reason or invalid status
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Not SysAdmin role
- `404 Not Found` - User does not exist

---

### 5. Transfer User Between Companies

**POST** `/api/sysadmin/users/transfer`

Transfer a user from one company to another.

**Request Body**:

```json
{
  "userid": "550e8400-e29b-41d4-a716-446655440000",
  "fromCompanyid": "660e8400-e29b-41d4-a716-446655440001",
  "toCompanyid": "770e8400-e29b-41d4-a716-446655440002",
  "reason": "Company merger - employee transfer",
  "preserveData": true,
  "newRole": "TEAM_MANAGER",
  "notifyUser": true,
  "transferProjects": ["project-id-1", "project-id-2"]
}
```

**Request Fields**:

- `userid`: Required, user to transfer
- `fromCompanyid`: Required, current company (for validation)
- `toCompanyid`: Required, destination company
- `reason`: Required, reason for transfer
- `preserveData`: Optional, keep user's tasks/time entries (default: true)
- `newRole`: Optional, new usertype in destination company (default: keep current)
- `notifyUser`: Optional, send email notification (default: true)
- `transferProjects`: Optional, array of project IDs to transfer access

**Response** (200 OK):

```json
{
  "success": true,
  "data": {
    "transfer": {
      "id": "990e8400-e29b-41d4-a716-446655440004",
      "userid": "550e8400-e29b-41d4-a716-446655440000",
      "fromCompany": {
        "id": "660e8400-e29b-41d4-a716-446655440001",
        "companyname": "Acme Corporation"
      },
      "toCompany": {
        "id": "770e8400-e29b-41d4-a716-446655440002",
        "companyname": "NewCorp Inc"
      },
      "status": "completed",
      "transferredAt": "2024-06-21T10:30:00Z"
    },
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "newCompanyid": "770e8400-e29b-41d4-a716-446655440002",
      "newRole": "TEAM_MANAGER"
    },
    "dataPreserved": {
      "tasks": 45,
      "timeEntries": 127,
      "projects": 2
    },
    "notificationSent": true
  }
}
```

**Error Responses**:

- `400 Bad Request` - Validation error or user not in fromCompany
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Not SysAdmin role
- `404 Not Found` - User or company does not exist
- `409 Conflict` - User already in destination company

---

### 6. Get User Activity

**GET** `/api/sysadmin/users/:id/activity`

Get cross-company activity timeline for a user.

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | UUID | Yes | User ID |

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `period` | string | No | Time period: `7d`, `30d`, `90d`, `1y`, `all` (default: `30d`) |
| `activityTypes` | string | No | Comma-separated: `login`, `task`, `project`, `time`, `all` |

**Response** (200 OK):

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "fullname": "John Doe"
    },
    "period": "30d",
    "summary": {
      "totalLogins": 24,
      "tasksCompleted": 18,
      "tasksCreated": 12,
      "projectsJoined": 2,
      "hoursLogged": 127.5,
      "meetingsAttended": 8
    },
    "timeline": [
      {
        "timestamp": "2024-06-20T14:30:00Z",
        "type": "task_completed",
        "description": "Completed task 'Update landing page'",
        "project": "Q2 Marketing Campaign",
        "metadata": {
          "taskid": "aa0e8400-e29b-41d4-a716-446655440005",
          "hoursLogged": 3.5
        }
      },
      {
        "timestamp": "2024-06-20T09:15:00Z",
        "type": "login",
        "description": "Login from 192.168.1.100",
        "metadata": {
          "ip": "192.168.1.100",
          "userAgent": "Mozilla/5.0..."
        }
      }
    ],
    "byCompany": [
      {
        "companyid": "660e8400-e29b-41d4-a716-446655440001",
        "companyname": "Acme Corporation",
        "activityCount": 45,
        "lastActivity": "2024-06-20T14:30:00Z"
      }
    ]
  }
}
```

**Error Responses**:

- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Not SysAdmin role
- `404 Not Found` - User does not exist

---

### 7. Bulk User Operations

**POST** `/api/sysadmin/users/bulk`

Perform bulk operations on multiple users.

**Request Body**:

```json
{
  "operation": "disable",
  "userids": [
    "550e8400-e29b-41d4-a716-446655440000",
    "660e8400-e29b-41d4-a716-446655440001"
  ],
  "reason": "Company Acme Corp suspended - disabling all users",
  "notifyUsers": false
}
```

**Operations**:

- `disable` - Deactivate multiple accounts
- `enable` - Reactivate multiple accounts
- `reset-password` - Force password reset for all
- `transfer` - Transfer all to new company (requires `toCompanyid`)

**Response** (200 OK):

```json
{
  "success": true,
  "data": {
    "operation": "disable",
    "totalRequested": 2,
    "successful": 2,
    "failed": 0,
    "results": [
      {
        "userid": "550e8400-e29b-41d4-a716-446655440000",
        "status": "success",
        "previousStatus": "active",
        "newStatus": "inactive"
      }
    ],
    "auditRecord": {
      "id": "bb0e8400-e29b-41d4-a716-446655440006",
      "bulkOperation": true,
      "affectedUsers": 2,
      "performedby": "SysAdmin User",
      "timestamp": "2024-06-21T10:30:00Z"
    }
  }
}
```

**Error Responses**:

- `400 Bad Request` - Invalid operation or user list
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Not SysAdmin role
- `413 Payload Too Large` - Too many users (max: 100 per request)

---

## Common Response Patterns

### Success Response Structure
```json
{
  "success": true,
  "data": { ... },
  "meta": { ... }
}
```

### Error Response Structure
```json
{
  "success": false,
  "error": {
    "code": "USER_NOT_FOUND",
    "message": "User does not exist",
    "details": null
  }
}
```

---

## Rate Limiting

- **Search**: 60 requests per minute
- **User detail**: 100 requests per minute
- **Password reset**: 10 requests per minute
- **Status updates**: 30 requests per minute
- **Transfers**: 10 requests per minute
- **Bulk operations**: 5 requests per minute (max 100 users per request)

---

*This API contract was generated as part of the wxAI pipeline Phase 3: Plan*
