# Quickstart: Unified CLI and AI Gateway (Spec 018)

## For Developers

### Submitting a Request via the AI Gateway

All CLI, IDE, and AI agent requests are mediated through the gateway before MCP tool execution.

**REST API (structured mode):**
```bash
POST /api/gateway/invoke
Content-Type: application/json
Authorization: Bearer <token>

{
  "intent": "List all open tasks for project wxKanban",
  "outputMode": "structured"
}
```

**Response (success):**
```json
{
  "requestId": "018-req-abc123",
  "toolName": "wxkanban_list_tasks",
  "args": { "projectId": "<uuid>", "status": "open" },
  "result": { ... },
  "executedAt": "2026-03-31T12:00:00Z"
}
```

**Response (guardrail block):**
```json
{
  "requestId": "018-req-xyz456",
  "blocked": true,
  "reason": "off-domain prompt detected",
  "executedAt": "2026-03-31T12:00:05Z"
}
```

**CLI invocation:**
```bash
bd gateway invoke "List all open tasks for project wxKanban" --output json
```

---

### Checking MCP Parity Status

**View current gate mode:**
```bash
curl -H "Authorization: Bearer <token>" /api/parity/config
```

**Response:**
```json
{
  "gatemode": "advisory",
  "advisoryStartedAt": "2026-03-31T00:00:00Z",
  "mandatoryActivatedAt": null
}
```

**Admin: Switch to mandatory mode:**
```bash
curl -X PATCH /api/parity/config \
  -H "Authorization: Bearer <admin-token>" \
  -d '{"gatemode": "mandatory"}'
```

---

### Viewing Drift Events

**List all open drift events:**
```bash
curl "/api/drift/events?status=open&severity=critical,high" \
  -H "Authorization: Bearer <token>"
```

**Resolve a drift event:**
```bash
curl -X PATCH /api/drift/events/<event-id>/resolve \
  -H "Authorization: Bearer <token>" \
  -d '{"note": "Parity restored in PR #42"}'
```

---

### Managing MCP Update Adoption

**Check available updates for a project:**
```bash
curl "/api/updates/available?projectId=<uuid>" \
  -H "Authorization: Bearer <token>"
```

**Response:**
```json
{
  "version": "1.4.2",
  "currentVersion": "1.4.0",
  "commandChanges": ["task_create now accepts dueDate", "task_delete removed"],
  "behaviorImpacts": ["task_create validation stricter on required fields"],
  "recommendation": "Recommended — fixes critical task sync bug"
}
```

**Accept an update:**
```bash
curl -X POST /api/updates/decide \
  -H "Authorization: Bearer <token>" \
  -d '{"projectId": "<uuid>", "version": "1.4.2", "decision": "accepted"}'
```

**Defer an update (with maintenance window):**
```bash
curl -X POST /api/updates/decide \
  -H "Authorization: Bearer <token>" \
  -d '{
    "projectId": "<uuid>",
    "version": "1.4.2",
    "decision": "deferred",
    "maintenanceWindow": {
      "start": "2026-04-15T02:00:00Z",
      "end": "2026-04-15T04:00:00Z",
      "tz": "America/New_York"
    }
  }'
```

**Apply an accepted update:**
```bash
curl -X POST /api/updates/apply \
  -H "Authorization: Bearer <token>" \
  -d '{"projectId": "<uuid>", "version": "1.4.2"}'
```

---

## For Platform Maintainers

### Running a Parity Check (CI)

Parity checks run automatically via GitHub Actions on every PR that touches MCP code. Workflow: `.github/workflows/parity-check.yml`

**Manual trigger:**
```bash
gh workflow run parity-check.yml --ref main
```

**Advisory mode:** Reports drift as a workflow artifact — merge is NOT blocked.

**Mandatory mode:** Critical or high severity drift will fail the job and block merge.

---

### Monitoring Drift Health

The drift summary endpoint provides aggregated visibility:

```bash
curl "/api/drift/summary" -H "Authorization: Bearer <token>"
```

**Response:**
```json
{
  "total": 12,
  "open": 3,
  "bySeverity": { "critical": 1, "high": 2, "medium": 7, "low": 2 },
  "byProject": [
    { "projectIdentifier": "wxKanban", "open": 1 },
    { "projectIdentifier": "project-kit-demo", "open": 2 }
  ],
  "oldestUnresolvedDays": 14
}
```

---

## For CI/CD Pipelines

### Parity Check Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PARITY_GATE_MODE` | `advisory` | Override gate mode (advisory / mandatory) |
| `PARITY_SEVERITY_THRESHOLD` | `high` | Minimum severity to gate on in mandatory mode |
| `MCP_MAIN_VERSION` | from package.json | Version of main MCP being checked |
| `MCP_KIT_VERSION` | from kit package.json | Version of project-kit MCP being checked |

### Sample Parity Report Artifact

Produced as `parity-report.json` in every parity check run:

```json
{
  "runAt": "2026-03-31T12:00:00Z",
  "gateMode": "advisory",
  "projectIdentifier": "wxKanban",
  "mcpVersionMain": "1.4.2",
  "mcpVersionKit": "1.4.0",
  "driftEvents": [
    {
      "severity": "high",
      "changedPaths": ["src/server/mcp/tools/task_create.ts"],
      "description": "task_create schema validation differs between main and kit"
    }
  ]
}
```
