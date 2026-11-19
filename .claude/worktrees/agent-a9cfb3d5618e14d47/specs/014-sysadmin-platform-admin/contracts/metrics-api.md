# API Contract: SysAdmin Metrics & Monitoring

**Spec:** 014 - SysAdmin Platform Administration  
**Endpoint Base:** `/api/sysadmin/metrics`  
**Authentication:** Required (JWT + SysAdmin role)  
**Authorization:** requireSysAdmin middleware

---

## Endpoints

### 1. Platform Overview Metrics

**GET** `/api/sysadmin/metrics/platform`

Get high-level platform metrics and KPIs.

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `period` | string | No | Time period: `24h`, `7d`, `30d`, `90d`, `1y`, `all` (default: `30d`) |

**Response** (200 OK):

```json
{
  "success": true,
  "data": {
    "period": "30d",
    "generatedAt": "2024-06-21T10:30:00Z",
    "companies": {
      "total": 156,
      "active": 142,
      "trial": 8,
      "suspended": 4,
      "cancelled": 2,
      "newThisPeriod": 12,
      "churnedThisPeriod": 2,
      "growthRate": "+6.8%"
    },
    "users": {
      "total": 2847,
      "active": 2156,
      "newThisPeriod": 145,
      "churnedThisPeriod": 23,
      "averagePerCompany": 18.2,
      "growthRate": "+4.5%"
    },
    "projects": {
      "total": 892,
      "active": 756,
      "completedThisPeriod": 134,
      "newThisPeriod": 89
    },
    "tasks": {
      "total": 45678,
      "completedThisPeriod": 8934,
      "createdThisPeriod": 9234,
      "completionRate": 96.7
    },
    "revenue": {
      "mrr": 45678.00,
      "arr": 548136.00,
      "previousMrr": 42345.00,
      "mrrGrowth": "+7.9%",
      "outstandingInvoices": 12345.00,
      "failedPayments": 3
    },
    "engagement": {
      "dailyActiveUsers": 892,
      "weeklyActiveUsers": 1567,
      "monthlyActiveUsers": 2156,
      "dauMauRatio": 0.41,
      "averageSessionDuration": 47
    }
  }
}
```

**Error Responses**:

- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Not SysAdmin role

---

### 2. Database Health Metrics

**GET** `/api/sysadmin/metrics/database`

Get database performance and health indicators.

**Response** (200 OK):

```json
{
  "success": true,
  "data": {
    "timestamp": "2024-06-21T10:30:00Z",
    "connectionPool": {
      "total": 20,
      "active": 8,
      "idle": 12,
      "waiting": 0,
      "utilization": 40.0
    },
    "queryPerformance": {
      "queriesPerSecond": 145.2,
      "averageQueryTime": 12.3,
      "slowQueries": 2,
      "slowQueryThreshold": 100
    },
    "tableSizes": [
      {
        "table": "userprofiles",
        "rowCount": 2847,
        "size": "2.4 MB",
        "indexSize": "1.1 MB"
      },
      {
        "table": "companies",
        "rowCount": 156,
        "size": "0.3 MB",
        "indexSize": "0.1 MB"
      },
      {
        "table": "tasks",
        "rowCount": 45678,
        "size": "45.6 MB",
        "indexSize": "12.3 MB"
      }
    ],
    "storage": {
      "totalSize": "128.5 MB",
      "indexSize": "34.2 MB",
      "freeSpace": "871.5 MB",
      "growthRate": "+5.2 MB/month"
    },
    "health": {
      "status": "healthy",
      "lastVacuum": "2024-06-20T02:00:00Z",
      "lastAnalyze": "2024-06-20T02:30:00Z",
      "bloatRatio": 1.08
    }
  }
}
```

**Error Responses**:

- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Not SysAdmin role

---

### 3. Job Queue Status

**GET** `/api/sysadmin/metrics/jobs`

Get background job queue status and processing metrics.

**Response** (200 OK):

```json
{
  "success": true,
  "data": {
    "timestamp": "2024-06-21T10:30:00Z",
    "queues": [
      {
        "name": "email",
        "pending": 12,
        "processing": 3,
        "completed": 4567,
        "failed": 23,
        "averageProcessingTime": 2.3,
        "oldestJob": "2024-06-21T10:25:00Z"
      },
      {
        "name": "analytics",
        "pending": 0,
        "processing": 1,
        "completed": 890,
        "failed": 2,
        "averageProcessingTime": 45.7,
        "oldestJob": null
      },
      {
        "name": "billing",
        "pending": 3,
        "processing": 0,
        "completed": 1234,
        "failed": 0,
        "averageProcessingTime": 1.8,
        "oldestJob": "2024-06-21T10:28:00Z"
      }
    ],
    "workers": {
      "total": 4,
      "active": 4,
      "utilization": 78.5
    },
    "recentFailures": [
      {
        "jobid": "job-123",
        "queue": "email",
        "error": "SMTP connection timeout",
        "failedAt": "2024-06-21T10:15:00Z",
        "retries": 3
      }
    ]
  }
}
```

**Error Responses**:

- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Not SysAdmin role

---

### 4. Integration Health

**GET** `/api/sysadmin/metrics/integrations`

Get health status of third-party integrations.

**Response** (200 OK):

```json
{
  "success": true,
  "data": {
    "timestamp": "2024-06-21T10:30:00Z",
    "integrations": [
      {
        "name": "Stripe",
        "type": "payment",
        "status": "healthy",
        "lastCheck": "2024-06-21T10:29:00Z",
        "responseTime": 245,
        "successRate": 99.8,
        "lastError": null,
        "apiVersion": "2024-04"
      },
      {
        "name": "Mailgun",
        "type": "email",
        "status": "healthy",
        "lastCheck": "2024-06-21T10:29:30Z",
        "responseTime": 123,
        "successRate": 98.5,
        "lastError": null,
        "apiVersion": "v3"
      },
      {
        "name": "SendGrid",
        "type": "email",
        "status": "degraded",
        "lastCheck": "2024-06-21T10:28:00Z",
        "responseTime": 2345,
        "successRate": 87.2,
        "lastError": "2024-06-21T09:45:00Z - Rate limit exceeded",
        "apiVersion": "v3"
      },
      {
        "name": "AWS S3",
        "type": "storage",
        "status": "healthy",
        "lastCheck": "2024-06-21T10:29:45Z",
        "responseTime": 89,
        "successRate": 99.99,
        "lastError": null,
        "apiVersion": "v2"
      }
    ],
    "overallStatus": "degraded",
    "alerts": [
      {
        "integration": "SendGrid",
        "severity": "warning",
        "message": "Response time elevated (>2s)",
        "since": "2024-06-21T09:30:00Z"
      }
    ]
  }
}
```

**Error Responses**:

- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Not SysAdmin role

---

### 5. API Usage Statistics

**GET** `/api/sysadmin/metrics/api`

Get API usage and performance statistics.

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `period` | string | No | Time period: `24h`, `7d`, `30d` (default: `24h`) |

**Response** (200 OK):

```json
{
  "success": true,
  "data": {
    "period": "24h",
    "timestamp": "2024-06-21T10:30:00Z",
    "requests": {
      "total": 45678,
      "successful": 45345,
      "failed": 333,
      "successRate": 99.3
    },
    "byEndpoint": [
      {
        "endpoint": "GET /api/projects",
        "requests": 12345,
        "avgResponseTime": 45.2,
        "p95ResponseTime": 123.4,
        "errors": 12
      },
      {
        "endpoint": "POST /api/tasks",
        "requests": 5678,
        "avgResponseTime": 78.9,
        "p95ResponseTime": 234.5,
        "errors": 23
      }
    ],
    "byCompany": [
      {
        "companyid": "550e8400-e29b-41d4-a716-446655440000",
        "companyname": "Acme Corp",
        "requests": 4567,
        "avgResponseTime": 56.7
      }
    ],
    "rateLimiting": {
      "hits": 45,
      "blocked": 3
    },
    "errors": [
      {
        "code": 429,
        "count": 45,
        "message": "Too Many Requests"
      },
      {
        "code": 500,
        "count": 12,
        "message": "Internal Server Error"
      }
    ]
  }
}
```

**Error Responses**:

- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Not SysAdmin role

---

### 6. Real-time Alerts

**GET** `/api/sysadmin/metrics/alerts`

Get current system alerts and warnings.

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `severity` | string | No | Filter: `critical`, `warning`, `info`, `all` (default: `all`) |
| `acknowledged` | boolean | No | Filter by acknowledged status (default: false) |

**Response** (200 OK):

```json
{
  "success": true,
  "data": {
    "timestamp": "2024-06-21T10:30:00Z",
    "alerts": [
      {
        "id": "alert-001",
        "severity": "warning",
        "category": "integration",
        "title": "SendGrid Response Time Elevated",
        "message": "SendGrid API response time >2s for 15 minutes",
        "source": "metrics",
        "createdAt": "2024-06-21T09:30:00Z",
        "acknowledged": false,
        "acknowledgedBy": null,
        "acknowledgedAt": null
      },
      {
        "id": "alert-002",
        "severity": "info",
        "category": "database",
        "title": "Database Vacuum Completed",
        "message": "Scheduled vacuum job completed successfully",
        "source": "system",
        "createdAt": "2024-06-21T02:00:00Z",
        "acknowledged": true,
        "acknowledgedBy": "SysAdmin",
        "acknowledgedAt": "2024-06-21T02:05:00Z"
      }
    ],
    "summary": {
      "critical": 0,
      "warning": 1,
      "info": 1,
      "total": 2,
      "unacknowledged": 1
    }
  }
}
```

**Error Responses**:

- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Not SysAdmin role

---

### 7. Acknowledge Alert

**POST** `/api/sysadmin/metrics/alerts/:id/acknowledge`

Acknowledge a system alert.

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Alert ID |

**Request Body**:

```json
{
  "note": "Investigating SendGrid issue - checking rate limits"
}
```

**Response** (200 OK):

```json
{
  "success": true,
  "data": {
    "alert": {
      "id": "alert-001",
      "acknowledged": true,
      "acknowledgedBy": "SysAdmin User",
      "acknowledgedAt": "2024-06-21T10:35:00Z",
      "note": "Investigating SendGrid issue - checking rate limits"
    }
  }
}
```

**Error Responses**:

- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Not SysAdmin role
- `404 Not Found` - Alert does not exist

---

## Common Response Patterns

### Success Response Structure
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2024-06-21T10:30:00Z",
    "cached": false,
    "cacheExpires": null
  }
}
```

### Error Response Structure
```json
{
  "success": false,
  "error": {
    "code": "METRICS_UNAVAILABLE",
    "message": "Metrics service temporarily unavailable",
    "details": null
  }
}
```

---

## Rate Limiting

- **Platform metrics**: 30 requests per minute
- **Database metrics**: 10 requests per minute (expensive queries)
- **Job queue**: 60 requests per minute
- **Integration health**: 30 requests per minute
- **API statistics**: 10 requests per minute
- **Alerts**: 60 requests per minute

---

## Caching Strategy

- **Platform metrics**: Cached for 5 minutes
- **Database metrics**: Cached for 1 minute
- **Job queue**: Real-time (no cache)
- **Integration health**: Cached for 1 minute
- **API statistics**: Cached for 5 minutes
- **Alerts**: Real-time (no cache)

---

*This API contract was generated as part of the wxAI pipeline Phase 3: Plan*
