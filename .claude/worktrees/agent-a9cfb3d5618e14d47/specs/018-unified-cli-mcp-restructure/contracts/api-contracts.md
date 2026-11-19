# API Contracts: Unified CLI and AI Gateway (Spec 018)

All endpoints require `Authorization: Bearer <token>` unless noted.
All responses are `Content-Type: application/json`.
Error format: `{ "error": string, "code": string, "requestId"?: string }`

---

## Gateway Endpoints

### POST /api/gateway/invoke

Mediates a free-form intent through the AI Gateway to MCP tool execution.

**Request Body:**
```json
{
  "intent": "string (required) — free-form natural language request",
  "outputMode": "structured | human (default: structured)",
  "context": {
    "projectId": "uuid (optional) — scopes tool lookup to a project"
  }
}
```

**Response 200 — success:**
```json
{
  "requestId": "string",
  "toolName": "string",
  "args": {},
  "result": {},
  "outputMode": "structured | human",
  "executedAt": "ISO8601"
}
```

**Response 200 — blocked by guardrails:**
```json
{
  "requestId": "string",
  "blocked": true,
  "reason": "string",
  "executedAt": "ISO8601"
}
```

**Response 422 — cannot map to allowed tool:**
```json
{
  "error": "Intent could not be mapped to an allowed MCP tool",
  "code": "GATEWAY_NO_TOOL_MATCH",
  "requestId": "string"
}
```

**Response 503 — both LLM providers failed:**
```json
{
  "error": "All providers failed policy or quality checks",
  "code": "GATEWAY_FAIL_CLOSED",
  "requestId": "string"
}
```

---

## Drift Event Endpoints

### GET /api/drift/events

List drift events with optional filters.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| projectId | uuid | Filter by project |
| severity | string | Comma-separated: critical,high,medium,low |
| status | string | open, resolved, suppressed |
| limit | integer | Default: 50, max: 200 |
| offset | integer | Default: 0 |

**Response 200:**
```json
{
  "total": 12,
  "events": [
    {
      "id": "uuid",
      "projectId": "uuid",
      "projectIdentifier": "string",
      "mcpVersionMain": "string",
      "mcpVersionKit": "string",
      "changedPaths": ["string"],
      "severity": "critical | high | medium | low",
      "githubFeedbackRef": "string | null",
      "resolvedStatus": "open | resolved | suppressed",
      "resolvedAt": "ISO8601 | null",
      "createdAt": "ISO8601"
    }
  ]
}
```

---

### GET /api/drift/events/:id

Get single drift event detail.

**Response 200:** Single event object (same shape as list item).

**Response 404:** `{ "error": "Drift event not found", "code": "DRIFT_NOT_FOUND" }`

---

### PATCH /api/drift/events/:id/resolve

Mark a drift event as resolved.

**Request Body:**
```json
{
  "note": "string (optional) — resolution description"
}
```

**Response 200:**
```json
{
  "id": "uuid",
  "resolvedStatus": "resolved",
  "resolvedAt": "ISO8601"
}
```

---

### GET /api/drift/summary

Aggregated drift health metrics.

**Response 200:**
```json
{
  "total": 12,
  "open": 3,
  "bySeverity": {
    "critical": 1,
    "high": 2,
    "medium": 7,
    "low": 2
  },
  "byProject": [
    { "projectIdentifier": "string", "open": 0 }
  ],
  "oldestUnresolvedDays": 14
}
```

---

## MCP Update Adoption Endpoints

### GET /api/updates/available

Check available MCP updates for a project.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| projectId | uuid | Required |

**Response 200 — update available:**
```json
{
  "version": "string",
  "currentVersion": "string",
  "commandChanges": ["string"],
  "behaviorImpacts": ["string"],
  "recommendation": "string",
  "publishedAt": "ISO8601"
}
```

**Response 200 — no update:**
```json
{
  "version": null,
  "currentVersion": "string",
  "upToDate": true
}
```

---

### GET /api/updates/changelog/:version

Full changelog detail for a specific MCP version.

**Response 200:**
```json
{
  "version": "string",
  "added": ["string"],
  "changed": ["string"],
  "fixed": ["string"],
  "breaking": ["string"],
  "publishedAt": "ISO8601"
}
```

---

### POST /api/updates/decide

Record a user's update adoption decision.

**Request Body:**
```json
{
  "projectId": "uuid (required)",
  "version": "string (required)",
  "decision": "accepted | deferred | rejected",
  "maintenanceWindow": {
    "start": "ISO8601",
    "end": "ISO8601",
    "tz": "IANA timezone string"
  }
}
```
`maintenanceWindow` is required when `decision` is `deferred`.

**Response 200:**
```json
{
  "id": "uuid",
  "projectId": "uuid",
  "version": "string",
  "decisionState": "accepted | deferred | rejected",
  "decidedAt": "ISO8601",
  "nextReminderAt": "ISO8601 | null"
}
```

---

### POST /api/updates/apply

Apply an accepted MCP update to a project.

**Request Body:**
```json
{
  "projectId": "uuid (required)",
  "version": "string (required)"
}
```

**Response 200:**
```json
{
  "projectId": "uuid",
  "version": "string",
  "applied": true,
  "appliedAt": "ISO8601",
  "postUpdateStatus": "healthy | warning | error",
  "postUpdateDetails": "string"
}
```

**Response 409 — not accepted:**
```json
{
  "error": "Update must be accepted before applying",
  "code": "UPDATE_NOT_ACCEPTED"
}
```

---

## Parity Gate Configuration Endpoints

### GET /api/parity/config

Get current parity CI gate configuration.

**Response 200:**
```json
{
  "id": "uuid",
  "gateMode": "advisory | mandatory",
  "advisoryStartedAt": "ISO8601 | null",
  "mandatoryActivatedAt": "ISO8601 | null",
  "rollbackAt": "ISO8601 | null",
  "rollbackBy": "uuid | null",
  "updatedAt": "ISO8601"
}
```

---

### PATCH /api/parity/config

Update parity gate mode. Requires ADMIN role.

**Request Body:**
```json
{
  "gateMode": "advisory | mandatory"
}
```

**Response 200:** Updated config object (same shape as GET response).

**Response 403:** `{ "error": "Admin role required", "code": "FORBIDDEN" }`

---

## Error Codes Reference

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `GATEWAY_NO_TOOL_MATCH` | 422 | Intent could not be mapped to an allowed MCP tool |
| `GATEWAY_FAIL_CLOSED` | 503 | All LLM providers failed; request not executed |
| `DRIFT_NOT_FOUND` | 404 | Drift event not found |
| `UPDATE_NOT_ACCEPTED` | 409 | Attempted to apply update before accepting |
| `FORBIDDEN` | 403 | Insufficient role for operation |
| `VALIDATION_ERROR` | 400 | Request body failed schema validation |
