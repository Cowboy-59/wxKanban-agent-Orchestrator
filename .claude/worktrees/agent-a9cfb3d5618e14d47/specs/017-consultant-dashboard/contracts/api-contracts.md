# API Contracts: Consultant Dashboard (Spec 017)

## Overview

This document defines the API contracts for the Consultant Dashboard feature, including request/response schemas, error codes, and authentication requirements.

## Authentication

All endpoints require Bearer token authentication:
```
Authorization: Bearer <jwt_token>
```

Role-based access control:
- **Consultant**: Access to own dashboard, customers, connections
- **Team Manager**: Additional access to TEAM-scoped connections and audit logs
- **Admin**: View-only access to reports

## Base URL

```
/api/consultant
```

## Endpoints

### Dashboard

#### GET /api/consultant/dashboard

**Description**: Fetch complete dashboard summary data

**Response**:
```json
{
  "projects": [
    {
      "id": "uuid",
      "name": "Project Name",
      "status": "active",
      "completionPercentage": 75,
      "taskCounts": {
        "todo": 5,
        "inProgress": 3,
        "done": 12
      },
      "priority": "high",
      "deadline": "2026-03-25T00:00:00Z"
    }
  ],
  "todayTime": {
    "hours": 6.5,
    "entries": 4,
    "runningTimer": {
      "projectId": "uuid",
      "startedAt": "2026-03-18T09:00:00Z",
      "duration": 3600
    }
  },
  "weeklyTime": {
    "hours": 32.5,
    "days": 5
  },
  "earnings": {
    "currentPeriod": {
      "startDate": "2026-03-01",
      "endDate": "2026-03-31",
      "hours": 120,
      "amount": 6000.00,
      "currency": "USD"
    },
    "hourlyRate": 50.00,
    "unbilledHours": 8
  },
  "upcomingDeadlines": [
    {
      "id": "uuid",
      "title": "Task Title",
      "projectId": "uuid",
      "projectName": "Project Name",
      "dueDate": "2026-03-20T00:00:00Z",
      "priority": "high"
    }
  ],
  "connectionHealth": {
    "total": 5,
    "healthy": 4,
    "warning": 1,
    "error": 0
  }
}
```

**Error Responses**:
- `401 Unauthorized`: Invalid or missing token
- `403 Forbidden`: User is not a consultant

---

### Projects

#### GET /api/consultant/projects

**Description**: List all projects assigned to consultant

**Query Parameters**:
- `status` (optional): Filter by status ('active', 'completed', 'archived')
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20, max: 100)

**Response**:
```json
{
  "projects": [
    {
      "id": "uuid",
      "name": "Project Name",
      "description": "Project description",
      "status": "active",
      "customerId": "uuid",
      "customerName": "Customer Name",
      "startDate": "2026-01-01",
      "endDate": "2026-06-30",
      "completionPercentage": 75,
      "taskCounts": {
        "todo": 5,
        "inProgress": 3,
        "done": 12
      },
      "priority": "high",
      "totalHours": 120,
      "billableHours": 115
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 15,
    "hasMore": false
  }
}
```

#### GET /api/consultant/projects/:id/tasks

**Description**: Get tasks for a specific project

**Path Parameters**:
- `id`: Project UUID

**Query Parameters**:
- `status` (optional): Filter by task status
- `priority` (optional): Filter by priority

**Response**:
```json
{
  "projectId": "uuid",
  "projectName": "Project Name",
  "tasks": [
    {
      "id": "uuid",
      "title": "Task Title",
      "description": "Task description",
      "status": "in_progress",
      "priority": "high",
      "dueDate": "2026-03-20T00:00:00Z",
      "assignedAt": "2026-03-15T00:00:00Z",
      "estimatedHours": 8,
      "loggedHours": 5.5
    }
  ]
}
```

**Error Responses**:
- `404 Not Found`: Project not found or not assigned to consultant

---

### Time Entries

#### POST /api/consultant/time-entries

**Description**: Create new time entry (manual or timer start)

**Request Body**:
```json
{
  "projectId": "uuid",
  "startTime": "2026-03-18T09:00:00Z",
  "endTime": null,
  "duration": null,
  "description": "Working on feature X",
  "isTimer": true,
  "billable": true
}
```

**Response**:
```json
{
  "id": "uuid",
  "projectId": "uuid",
  "projectName": "Project Name",
  "consultantId": "uuid",
  "startTime": "2026-03-18T09:00:00Z",
  "endTime": null,
  "duration": null,
  "description": "Working on feature X",
  "isTimer": true,
  "billable": true,
  "status": "running",
  "createdAt": "2026-03-18T09:00:00Z"
}
```

#### PATCH /api/consultant/time-entries/:id

**Description**: Update time entry (stop timer or edit)

**Path Parameters**:
- `id`: Time entry UUID

**Request Body**:
```json
{
  "endTime": "2026-03-18T17:00:00Z",
  "duration": 28800,
  "description": "Updated description"
}
```

**Response**:
```json
{
  "id": "uuid",
  "projectId": "uuid",
  "startTime": "2026-03-18T09:00:00Z",
  "endTime": "2026-03-18T17:00:00Z",
  "duration": 28800,
  "description": "Updated description",
  "isTimer": true,
  "billable": true,
  "status": "completed",
  "updatedAt": "2026-03-18T17:00:00Z"
}
```

#### GET /api/consultant/time-entries/today

**Description**: Get today's time entries for consultant

**Response**:
```json
{
  "date": "2026-03-18",
  "totalHours": 6.5,
  "entries": [
    {
      "id": "uuid",
      "projectId": "uuid",
      "projectName": "Project Name",
      "startTime": "2026-03-18T09:00:00Z",
      "endTime": "2026-03-18T12:00:00Z",
      "duration": 10800,
      "description": "Morning work",
      "billable": true
    }
  ],
  "runningTimer": null
}
```

---

### Earnings

#### GET /api/consultant/earnings

**Description**: Get earnings summary for current period

**Query Parameters**:
- `period` (optional): 'current', 'last', or date range
- `groupBy` (optional): 'day', 'week', 'month'

**Response**:
```json
{
  "currentPeriod": {
    "startDate": "2026-03-01",
    "endDate": "2026-03-31",
    "hours": 120,
    "amount": 6000.00,
    "currency": "USD"
  },
  "hourlyRate": 50.00,
  "unbilledHours": 8,
  "unbilledAmount": 400.00,
  "historical": [
    {
      "period": "2026-02",
      "hours": 140,
      "amount": 7000.00
    }
  ],
  "breakdown": [
    {
      "projectId": "uuid",
      "projectName": "Project Name",
      "hours": 45,
      "amount": 2250.00
    }
  ]
}
```

---

### Customers

#### GET /api/consultant/customers

**Description**: List all customers for consultant

**Response**:
```json
{
  "customers": [
    {
      "id": "uuid",
      "name": "Customer Name",
      "company": "Company Inc",
      "email": "contact@company.com",
      "phone": "+1234567890",
      "billingAddress": "123 Main St",
      "taxId": "TAX123456",
      "connectionCount": 3,
      "createdAt": "2026-01-15T00:00:00Z"
    }
  ],
  "total": 5
}
```

#### POST /api/consultant/customers

**Description**: Create new customer

**Request Body**:
```json
{
  "name": "Customer Name",
  "company": "Company Inc",
  "email": "contact@company.com",
  "phone": "+1234567890",
  "billingAddress": "123 Main St, City, Country",
  "taxId": "TAX123456"
}
```

**Validation Rules**:
- `name`: Required, 2-255 characters
- `email`: Required, valid email format
- `company`: Optional, max 255 characters
- `phone`: Optional, valid phone format
- `taxId`: Optional, max 50 characters

**Response**:
```json
{
  "id": "uuid",
  "name": "Customer Name",
  "company": "Company Inc",
  "email": "contact@company.com",
  "phone": "+1234567890",
  "billingAddress": "123 Main St, City, Country",
  "taxId": "TAX123456",
  "consultantId": "uuid",
  "createdAt": "2026-03-18T00:00:00Z"
}
```

#### GET /api/consultant/customers/:id

**Description**: Get customer details

**Response**:
```json
{
  "id": "uuid",
  "name": "Customer Name",
  "company": "Company Inc",
  "email": "contact@company.com",
  "phone": "+1234567890",
  "billingAddress": "123 Main St, City, Country",
  "taxId": "TAX123456",
  "consultantId": "uuid",
  "connections": [
    {
      "id": "uuid",
      "name": "Jira Production",
      "systemType": "jira",
      "status": "connected",
      "healthStatus": "healthy"
    }
  ],
  "createdAt": "2026-01-15T00:00:00Z",
  "updatedAt": "2026-03-10T00:00:00Z"
}
```

#### PATCH /api/consultant/customers/:id

**Description**: Update customer information

**Request Body**:
```json
{
  "name": "Updated Name",
  "email": "newemail@company.com"
}
```

**Response**: Updated customer object

---

### Connections

#### GET /api/consultant/customers/:id/connections

**Description**: List system connections for customer

**Response**:
```json
{
  "customerId": "uuid",
  "customerName": "Customer Name",
  "connections": [
    {
      "id": "uuid",
      "name": "Jira Production",
      "systemType": "jira",
      "status": "connected",
      "credentialScope": "PERSONAL",
      "lastSyncAt": "2026-03-18T08:00:00Z",
      "healthStatus": "healthy"
    }
  ]
}
```

#### POST /api/consultant/customers/:id/connections

**Description**: Create new system connection

**Request Body**:
```json
{
  "name": "Jira Production",
  "systemType": "jira",
  "apiEndpoint": "https://jira.company.com/api",
  "credentials": {
    "apiToken": "xxx",
    "username": "user@company.com"
  },
  "credentialScope": "PERSONAL"
}
```

**Validation Rules**:
- `name`: Required, 2-255 characters
- `systemType`: Required, enum value
- `apiEndpoint`: Required, valid URL
- `credentials`: Required, object with required fields per system type
- `credentialScope`: Required, 'PERSONAL' or 'TEAM'

**Response**:
```json
{
  "id": "uuid",
  "customerId": "uuid",
  "consultantId": "uuid",
  "name": "Jira Production",
  "systemType": "jira",
  "apiEndpoint": "https://jira.company.com/api",
  "credentialScope": "PERSONAL",
  "status": "disconnected",
  "healthStatus": "unknown",
  "createdAt": "2026-03-18T00:00:00Z"
}
```

#### POST /api/consultant/customers/:id/connections/test

**Description**: Test connection credentials without saving

**Request Body**: Same as create connection

**Response**:
```json
{
  "success": true,
  "message": "Connection successful",
  "responseTime": 245,
  "systemInfo": {
    "version": "8.20.0",
    "serverTime": "2026-03-18T10:00:00Z"
  }
}
```

#### GET /api/consultant/connections/:id

**Description**: Get connection details (respects credential scope)

**Response**:
```json
{
  "id": "uuid",
  "customerId": "uuid",
  "customerName": "Customer Name",
  "consultantId": "uuid",
  "name": "Jira Production",
  "systemType": "jira",
  "apiEndpoint": "https://jira.company.com/api",
  "credentials": {
    "apiToken": "xxx",
    "username": "user@company.com"
  },
  "credentialScope": "PERSONAL",
  "status": "connected",
  "lastSyncAt": "2026-03-18T08:00:00Z",
  "lastSyncResult": {
    "itemsAdded": 5,
    "itemsUpdated": 12
  },
  "healthStatus": "healthy",
  "healthCheckedAt": "2026-03-18T09:00:00Z",
  "createdAt": "2026-03-18T00:00:00Z",
  "updatedAt": "2026-03-18T08:00:00Z"
}
```

**Note**: Credentials only included if:
- Current user is the connection owner, OR
- Current user is Team Manager/Leader and scope is TEAM

#### PATCH /api/consultant/connections/:id

**Description**: Update connection (edit credentials, respecting scope)

**Request Body**:
```json
{
  "name": "Updated Name",
  "apiEndpoint": "https://new-jira.company.com/api",
  "credentials": {
    "apiToken": "new-token"
  }
}
```

**Authorization**: Only owner can edit PERSONAL connections. Owner, Team Manager, or Team Leader can edit TEAM connections.

#### DELETE /api/consultant/connections/:id

**Description**: Delete connection (owner or Team Manager only)

**Response**:
```json
{
  "success": true,
  "message": "Connection deleted successfully"
}
```

#### POST /api/consultant/connections/:id/sync

**Description**: Trigger manual data sync

**Request Body**:
```json
{
  "syncType": "incremental"
}
```

**Response**:
```json
{
  "syncId": "uuid",
  "status": "running",
  "message": "Sync started successfully",
  "estimatedDuration": 30
}
```

**Rate Limiting**: 10 syncs per hour per connection, 50 per hour per user

#### GET /api/consultant/connections/:id/sync-history

**Description**: Get sync history for connection (last 10 syncs)

**Response**:
```json
{
  "connectionId": "uuid",
  "history": [
    {
      "id": "uuid",
      "syncType": "incremental",
      "status": "completed",
      "startedAt": "2026-03-18T08:00:00Z",
      "completedAt": "2026-03-18T08:00:30Z",
      "itemsProcessed": 17,
      "itemsAdded": 5,
      "itemsUpdated": 12,
      "itemsFailed": 0
    }
  ]
}
```

#### GET /api/consultant/connections/:id/audit-log

**Description**: Get credential audit log (owner or Team Manager)

**Response**:
```json
{
  "connectionId": "uuid",
  "connectionName": "Jira Production",
  "entries": [
    {
      "id": "uuid",
      "userId": "uuid",
      "userName": "John Doe",
      "action": "view",
      "actionResult": "success",
      "ipAddress": "192.168.1.1",
      "userAgent": "Mozilla/5.0...",
      "details": {},
      "createdAt": "2026-03-18T10:00:00Z"
    }
  ]
}
```

#### POST /api/consultant/connections/:id/test

**Description**: Test connection without syncing

**Response**:
```json
{
  "success": true,
  "message": "Connection successful",
  "responseTime": 245
}
```

#### GET /api/consultant/connections/:id/health

**Description**: Get connection health status and history

**Response**:
```json
{
  "current": {
    "status": "healthy",
    "checkType": "automatic",
    "responseTimeMs": 245,
    "checkedAt": "2026-03-18T09:00:00Z"
  },
  "history": [
    {
      "status": "healthy",
      "checkType": "automatic",
      "responseTimeMs": 245,
      "checkedAt": "2026-03-18T08:45:00Z"
    }
  ]
}
```

#### GET /api/consultant/dashboard/connection-health

**Description**: Get connection health summary for dashboard widget

**Response**:
```json
{
  "total": 5,
  "healthy": 4,
  "warning": 1,
  "error": 0,
  "connections": [
    {
      "id": "uuid",
      "name": "Jira Production",
      "healthStatus": "healthy",
      "lastSyncAt": "2026-03-18T08:00:00Z"
    }
  ]
}
```

---

### Reporting

#### GET /api/consultant/projects/:id/time-entries

**Description**: Get detailed time entries for project

**Query Parameters**:
- `startDate`: Filter start date
- `endDate`: Filter end date
- `billable`: Filter by billable status

**Response**:
```json
{
  "projectId": "uuid",
  "projectName": "Project Name",
  "entries": [
    {
      "id": "uuid",
      "startTime": "2026-03-18T09:00:00Z",
      "endTime": "2026-03-18T12:00:00Z",
      "duration": 10800,
      "description": "Feature development",
      "billable": true,
      "billingRate": 50.00,
      "billingAmount": 150.00
    }
  ],
  "totalHours": 45,
  "totalAmount": 2250.00
}
```

#### GET /api/consultant/projects/:id/billing

**Description**: Get billing details for project

**Response**:
```json
{
  "projectId": "uuid",
  "projectName": "Project Name",
  "billingPeriod": {
    "startDate": "2026-03-01",
    "endDate": "2026-03-31"
  },
  "summary": {
    "totalHours": 45,
    "billableHours": 42,
    "billingRate": 50.00,
    "totalAmount": 2100.00,
    "minimumTimeUnit": "15min"
  },
  "breakdown": [
    {
      "date": "2026-03-18",
      "hours": 6.5,
      "amount": 325.00
    }
  ]
}
```

#### POST /api/consultant/reports/export

**Description**: Export time/billing report (PDF/CSV)

**Request Body**:
```json
{
  "projectId": "uuid",
  "startDate": "2026-03-01",
  "endDate": "2026-03-31",
  "format": "pdf",
  "includeDetails": true
}
```

**Response**:
```json
{
  "downloadUrl": "https://storage.wxkanban.com/reports/uuid.pdf",
  "expiresAt": "2026-03-19T00:00:00Z",
  "fileSize": 245760
}
```

---

## Error Codes

### HTTP Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | OK | Request successful |
| 201 | Created | Resource created successfully |
| 400 | Bad Request | Invalid request body or parameters |
| 401 | Unauthorized | Missing or invalid authentication |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 409 | Conflict | Resource conflict (e.g., duplicate name) |
| 422 | Unprocessable Entity | Validation error |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |

### Error Response Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      }
    ]
  }
}
```

### Business Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `VALIDATION_ERROR` | Input validation failed | 422 |
| `UNAUTHORIZED_ACCESS` | Not authorized for this resource | 403 |
| `CONNECTION_NOT_FOUND` | Connection does not exist | 404 |
| `CUSTOMER_NOT_FOUND` | Customer does not exist | 404 |
| `PROJECT_NOT_FOUND` | Project not found or not assigned | 404 |
| `DUPLICATE_CONNECTION` | Connection with this name already exists | 409 |
| `INVALID_CREDENTIALS` | Failed to authenticate with external system | 400 |
| `SYNC_IN_PROGRESS` | Another sync is already running | 409 |
| `RATE_LIMIT_EXCEEDED` | Too many sync requests | 429 |
| `ENCRYPTION_ERROR` | Failed to encrypt/decrypt credentials | 500 |
| `SCOPE_VIOLATION` | Attempted access outside credential scope | 403 |

## Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| POST /connections/:id/sync | 10 | 1 hour per connection |
| POST /connections/:id/sync | 50 | 1 hour per user |
| POST /customers/:id/connections/test | 20 | 1 hour per user |
| All other endpoints | 1000 | 1 hour per user |

Rate limit headers:
```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 8
X-RateLimit-Reset: 1647600000
```

## Pagination

List endpoints support pagination with these parameters:
- `page`: Page number (1-based, default: 1)
- `limit`: Items per page (default: 20, max: 100)

Response includes:
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "hasMore": true,
    "totalPages": 8
  }
}
```

## Versioning

API version is included in the URL path:
```
/api/v1/consultant/...
```

Current version: v1

## Changelog

### v1.0.0 (2026-03-18)
- Initial release
- Dashboard, projects, time tracking
- Customer and connection management
- Sync and audit features
