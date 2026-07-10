# Hosted MCP — Reference

Comprehensive reference for the hosted MCP endpoint at `mcp.wxperts.com`,
introduced in kit v0.4.0 by spec 028. For step-by-step migration from
v0.3.x, see [hosted-mcp-migration.md](./hosted-mcp-migration.md).

---

## Configuration

### Preferred: `.wxai/project.json` `kit` block

```json
{
  "lifecycleStage": "Implementation",
  "activeScope": "027",
  "kit": {
    "mcpBaseUrl": "https://mcp.wxperts.com",
    "apiToken": "9bB7UUaP0FebtuVsib999l4WB0Eplf2dfZJ6DF2njS0",
    "projectId": "01926a90-…"
  }
}
```

Written atomically by `wxkanban-agent kit:configure`. Add `.wxai/project.json`
to `.gitignore` — the `kit.apiToken` field is a secret.

### Alternative: `.env`

```bash
MCP_BASE_URL=https://mcp.wxperts.com
WXKANBAN_API_TOKEN=9bB7UUaP0FebtuVsib999l4WB0Eplf2dfZJ6DF2njS0
WXKANBAN_PROJECT_ID=01926a90-…
```

Pass `--write-to=.env` to `kit:configure` to use this form. Env vars always
take precedence over the `kit` block.

### Resolution precedence (`resolveMcpBaseUrl()`)

The MCP is hosted-only. There is **no local MCP** and **no localhost
fallback** — resolution always yields a hosted URL:

1. `WXKANBAN_MCP_BASE_URL` / `MCP_BASE_URL` / `MCP_HTTP_URL` env var (staging override)
2. `.wxai/project.json` `kit.mcpBaseUrl`
3. `.wxkanban-project.json` `mcpBaseUrl` (written by `init.mjs`)
4. `https://mcp.wxperts.com` (hosted default)

---

## Authentication

### Token format

A raw token is a **URL-safe base64 (base64url) string of ~43 characters** —
the output of `crypto.randomBytes(32).toString('base64url')`. It carries **no
`wxk_live_` / `wxk_test_` prefix**; production vs. staging is a property of the
issuing environment, not the token string. Example:

```
9bB7UUaP0FebtuVsib999l4WB0Eplf2dfZJ6DF2njS0
```

The kit's HTTP client (`core/http/mcp-client.ts`) rejects obviously-malformed
tokens at construction time.

### Minting

Admin UI: **wxkanban.wxperts.com → Admin → Projects → `<project>` → API tokens**.
Requires `COMPANY_ADMIN` or `PROJECT_OWNER` role for the project.

The raw token is displayed **once** in a modal with a copy-to-clipboard
button. After dismissal, only a short display prefix (e.g. `9bB7UUaP`) and the
hashed value remain in the database.

### Rotation

The admin UI's **Rotate** action mints a replacement token and schedules
the old token's revocation `overlapDays` days later (default 7). During
the overlap window both tokens work; after it, only the new one. This
lets you update consumers without downtime.

### Revocation

The admin UI's **Revoke** action flips `revokedat` to `now()`. The next
request carrying that token returns `401 invalid-token`. Effective on
the next call; there is no propagation delay.

---

## HTTP API contracts

### Headers

Every request to a non-`/health` route must carry:

```
Authorization: Bearer 9bB7UUaP0FebtuVsib999l4WB0Eplf2dfZJ6DF2njS0
```

Every response carries `X-Request-Id` (also written to the audit row's
`requestid` column for support traceability).

### Error responses

| Status | Body | Meaning |
|--------|------|---------|
| `401` | `{"error": "missing-token"}` | No `Authorization` header |
| `401` | `{"error": "invalid-token"}` | Token unknown, revoked, or expired |
| `403` | `{"error": "scope-violation"}` | Caller tried to act on another project |
| `429` | `{"error": "rate-limited", "retryAfterSec": N}` + `Retry-After: N` | Token bucket exhausted |
| `500` | `{"error": "internal", "requestid": "…"}` | Unexpected server error |
| `503` | `{"error": "unavailable"}` | App Runner deploy in progress or DB unreachable |

### `GET /health` (unauthenticated)

```json
{
  "status": "ok",
  "version": "<git short sha>",
  "uptime": "<seconds>",
  "dbConnected": true
}
```

Use this in monitoring + the kit's `verify-install` `hosted-mcp-reachable`
step.

---

## Rate limiting

- **Default**: 60 requests/minute per token, with a 10-request burst budget.
- **Storage**: in-process; multi-instance deployments need a shared bucket
  (out of scope for v1; spec 028 ships single-instance).
- **Behavior on throttle**: 429 + `Retry-After: <seconds>` header. The kit's
  `mcp-client.ts` honors `Retry-After` and retries exactly once.
- **Audit**: every throttled request writes an `mcprequestaudit` row with
  `outcome = 'throttled'`.

### Asking for a higher tier

v1 has no self-service tier upgrade. If your normal kit usage trips the
60/min cap repeatedly (visible via `mcprequestaudit` rows over a day), ask
an admin to bump `MCP_RATE_LIMIT_PER_MINUTE` for your service in the App
Runner console. Future spec work may add per-project rate-limit profiles.

---

## Deployment + rollback

The hosted service runs on AWS App Runner with two slots:

- `mcp.wxperts.com` — production (tag-gated deploys)
- `staging.mcp.wxperts.com` — staging (auto-deploys from `main`)

### Deploy a release tag

```bash
git tag v0.4.0
git push origin v0.4.0
make deploy-mcp-prod TAG=v0.4.0
```

The `make deploy-mcp-prod` target refuses to run without a `TAG=` argument
and verifies the tag exists locally before calling
`aws apprunner start-deployment`.

### Force a redeploy of `main` on staging

```bash
make deploy-mcp-staging
```

(Staging usually auto-deploys on push to `main`; this is only needed to
force a redeploy out-of-band.)

### Rolling back a bad deploy

See [`infra/secrets-rotation-runbook.md`](../../infra/secrets-rotation-runbook.md)
§3 "Rolling back a bad MCP deploy".

### DB credential rotation

See [`infra/secrets-rotation-runbook.md`](../../infra/secrets-rotation-runbook.md)
§1 "RDS Postgres credential rotation".

---

## Audit log

Every authenticated request writes one row to `mcprequestaudit`:

| Column | Meaning |
|---|---|
| `requestid` | Per-request UUID; echoed in `X-Request-Id` response header |
| `tokenid` | `mcpapitokens.id` of the resolved token (NULL on auth-failed) |
| `customerid` / `projectid` | Resolved scope (NULL on auth-failed) |
| `tool` | MCP tool name (e.g. `project.buildscope`) on `/call` requests |
| `methodpath` | e.g. `POST /call`, `GET /tools` |
| `durationms` | Wall-clock time |
| `outcome` | one of: `success`, `auth-failed`, `throttled`, `scope-violation`, `error` |
| `errorcode` | e.g. `invalid-token`, `cross-scope`, `tool-not-found` |
| `responsestatus` | HTTP status returned |
| `clientip` / `useragent` | Best-effort identifiers for abuse triage |

`/health` is exempt from the audit log to keep volume sane. The audit
write is async; handlers return before the row commits.

---

## Local development against the hosted MCP

Set `MCP_AUTH_REQUIRED=false` to bypass the auth middleware while running
the MCP server locally. This is for developers working ON the MCP server
itself, not for kit consumers. Production deployments MUST set
`MCP_AUTH_REQUIRED=true` (the runbook documents this; CI should also
enforce it).
