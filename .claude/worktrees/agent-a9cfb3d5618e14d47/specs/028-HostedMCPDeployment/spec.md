# Spec 028: Hosted MCP Deployment — Eliminate Consumer DB Port Requirement

## Overview

# Spec 028: Hosted MCP Deployment — Eliminate Consumer DB Port Requirement

**Spec Number**: 028
**Status**: `approved`
**Created**: 2026-05-13
**Depends On**: 019-agent-orchestrator-kit (the MCP server we're hosting), 027-KitRuntimeHygiene (the `resolveServiceUrl` precedence we already depend on)
**Source**: in-conversation buildscope, 2026-05-13

---

## Overview

Today every wxKanban-agent kit consumer must open a network path to a Postgres database. The MCP server runs locally on the consumer's machine and connects directly to `DATABASE_URL`. This is the source of three recurring problems:

1. **Corporate firewalls block outbound Postgres.** Most enterprise environments forbid arbitrary outbound DB connections from dev laptops; only HTTPS (443) is reliably open. Consumers stall at install.
2. **Credential distribution is awkward.** The kit currently supports an `DATABASE_URL_ENCRYPTED` + `WXKANBAN_API_TOKEN` pattern to avoid raw creds on dev machines, but it still leaks the connection topology to every consumer.
3. **The kit ships a stateful service (mcp-server) as part of the consumer install.** That's an operational burden — `setup-mcp.mjs` builds and spawns it; every consumer becomes a partial sysadmin.

This spec moves `mcp-server` out of the consumer install and onto wxKanban-operated infrastructure (AWS App Runner, behind `mcp.wxperts.com` on 443). Consumers connect over HTTPS using an existing-pattern API token (`WXKANBAN_API_TOKEN`) scoped per project. The kit gains a one-line configuration switch; `setup-mcp.mjs` becomes optional and is deprecated for the v1 path.

The architectural premise is already in place — spec 027 wired every client through `resolveServiceUrl(...)`, the auth field `WXKANBAN_API_TOKEN` is already plumbed through `lifecycle-client.ts`, and `WXKANBAN_PROJECT_ID` already scopes every call. This spec is the deployment + auth-enforcement work to make that boundary real over the public internet.

The spec ships:

- A **hosted MCP service** at `mcp.wxperts.com:443` on AWS App Runner, fronted by ACM cert + Route53, identical Postgres backend as today.
- **API token enforcement at the MCP layer**: every request must carry a valid `WXKANBAN_API_TOKEN`; the token resolves to `(customerId, projectId)`; the MCP filters all DB reads/writes by that scope.
- **A `wxkanban-agent kit:configure` command** that writes the consumer's `MCP_BASE_URL` + `WXKANBAN_API_TOKEN` + `WXKANBAN_PROJECT_ID` into `.wxai/project.json` (or `.env`, configurable).
- **`setup-mcp.mjs` deprecation path** — script still runs and warns; emits a "use hosted MCP" upgrade message; removes itself from `kit:start` default flow when hosted config is present.
- **Token issuance + rotation surface** — admin UI in wxKanban for minting/revoking project tokens; tokens stored hashed at rest.
- **Per-request audit logging** — every hosted-MCP call writes a `mcprequestaudit` row (token id, project id, tool, duration, outcome) for observability and tenant-scoping verification.

**This spec is hosted-only by design.** The encrypted-DATABASE_URL self-host fallback is retired; air-gapped customers are explicitly out of scope at v1 (a follow-on spec would re-introduce a sealed self-host appliance if there's demand).

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actors** | wxKanban-agent kit consumers (developers running `implement`/`buildscope`/etc); wxKanban admin (mints + revokes project tokens); the hosted MCP service itself (validates tokens, enforces project scope, writes audit rows). |
| **Key Value** | Consumers need only outbound HTTPS (443) — corporate firewalls become a non-issue. DB credentials never leave wxKanban infrastructure. The kit ships as a pure client; no consumer-side stateful service. |
| **Scope Boundary (IN)** | App Runner deployment of `mcp-server`; `mcp.wxperts.com` + ACM cert + Route53; token auth middleware in `mcp-server`; project-scoped query enforcement; admin UI for token issuance/revocation/rotation; `kit:configure` command; `setup-mcp.mjs` deprecation; per-request audit table + write path; updated `docs/`, README, CHANGELOG for kit v0.4.0; rate-limit middleware (basic, per token). |
| **Scope Boundary (OUT)** | A self-hosted appliance path; mTLS / client certs; OAuth/OIDC / SSO; DB-per-tenant isolation; multi-region deployment; per-tool fine-grained authorization (token = all tools); rate-limit tiers / billing meters; a public marketplace of tokens; cross-region disaster recovery automation; any change to existing wxKanban auth (this is kit-MCP auth only). |

---

## Functional Requirements

### FR-001 — Hosted endpoint
The MCP service is deployed to AWS App Runner and reachable at exactly **`https://mcp.wxperts.com`** (port 443, TLS 1.2+). HTTP on 80 redirects to HTTPS. A staging endpoint **`https://staging.mcp.wxperts.com`** is provisioned the same way for pre-production. Route53 + ACM-issued cert; no self-signed paths in production.

- Production traffic: `mcp.wxperts.com` → App Runner production service.
- Staging traffic: `staging.mcp.wxperts.com` → App Runner staging service.
- Health endpoint `GET /health` (already exists in `mcp-server`) is publicly reachable and returns 200 + JSON `{ status, dbConnected, version, uptime }` without authentication.
- Every other route requires the auth middleware in FR-003.

### FR-002 — App Runner deployment surface
The deployment matches the pattern already in production for `wxkanban.wxperts.com`: **App Runner source-code mode** building directly from the GitHub repo. No Dockerfile, no ECR. Actual env vars live in the App Runner console per project memory `reference_apprunner_env_vars` (ConfigurationSource: API).

- **Source mode**: source-code (GitHub connection), reading `apprunner-mcp.yaml` from the repo root for both production and staging service slots (env vars in the console differentiate them).
- **Runtime**: Node 22 (matches existing `wxkanban.wxperts.com` service for consistency).
- **Build commands**: `npm install && npm run build` (the existing `mcp-server` build pipeline already produces `mcp-server/dist/index-http.js`).
- **Run command**: `node mcp-server/dist/index-http.js`.
- **Network port**: `8080` (App Runner standard).
- **Instance**: 1 vCPU / 2 GB / min 1 / max 5 (revisit at scale).
- **Environment variables (in console only, not in yaml)**:
  - `DATABASE_URL` — RDS Postgres
  - `MCP_HTTP_PORT` — `8080`
  - `NODE_ENV` — `production`
  - `MCP_AUTH_REQUIRED` — `true` (this spec sets it; default-off for back-compat in local dev)
  - `MCP_RATE_LIMIT_PER_MINUTE` — `60` (per token; FR-007)
- **Deploy trigger**: auto-deploy on push to `main` for staging; tag-based deploy for production via `make deploy-mcp-prod TAG=vX.Y.Z` which calls `aws apprunner start-deployment`.

### FR-003 — Token auth middleware
Every request to `mcp.wxperts.com` (except `/health`) carries an API token in the `Authorization: Bearer <token>` header. The middleware:

1. Parses the bearer token. Missing → `401 Unauthorized` + `{error: "missing-token"}`.
2. Hashes the token (SHA-256) and looks it up in the `mcpapitokens` table (FR-009).
3. Token not found / revoked / expired → `401 Unauthorized` + `{error: "invalid-token"}`.
4. Token resolves to `(customerId, projectId, scopes[])`. Attaches to the request context.
5. Continues to the route handler.

The middleware is **always on in production** (`MCP_AUTH_REQUIRED=true`). In local dev a developer can set `MCP_AUTH_REQUIRED=false` to bypass for testing — never permitted in production by deployment policy.

### FR-004 — Project-scope enforcement at the data layer
Every DB query that reads or writes consumer data carries the request-context's `projectId` and `customerId`. A new module `mcp-server/src/db/scoped-query.ts` wraps the existing query builders and:

- Refuses to issue a query that doesn't include a `projectid` (or equivalent FK) filter when the table has one.
- Refuses cross-customer joins.
- Logs a `scope-violation` event to `mcprequestaudit` and returns `403 Forbidden` on any attempted scope escape.

All existing tool handlers in `mcp-server/src/server.ts` are migrated to use the scoped wrapper. The migration is a one-time refactor — handlers that bypass it cannot be merged (verified by a CI test that greps for direct `db.select/insert/update` calls outside the wrapper).

### FR-005 — `WXKANBAN_API_TOKEN` resolution precedence (consumer side)
The kit reads the token in this order:
1. `WXKANBAN_API_TOKEN` env var.
2. `apiToken` field in `.wxai/project.json`.
3. `apiToken` field in `.wxkanban-project.json` (legacy).

If none is set and `MCP_BASE_URL` points at a hosted endpoint (`https://*`), the kit fails loud with: `"Missing WXKANBAN_API_TOKEN. Run \`wxkanban-agent kit:configure --token <token>\` after minting one in the wxKanban admin UI."`

If `MCP_BASE_URL` is `http://localhost:*`, the kit warns once per session that local MCP is deprecated but proceeds (back-compat for v0.3.x users mid-migration).

### FR-006 — `kit:configure` command
A new command:

    wxkanban-agent kit:configure --token <t> [--project-id <p>] [--mcp-url <url>] [--write-to .env|.wxai]

Writes the three required fields (`MCP_BASE_URL`, `WXKANBAN_API_TOKEN`, `WXKANBAN_PROJECT_ID`) to the configured destination:

- `.wxai/project.json` (default) — values go into a new `kit` block.
- `.env` — values appended/updated as env-var lines.
- Token is **never echoed** to the terminal; the script confirms by showing only the first and last 4 characters.

The command exits `0` on success, `1` on validation failure (token doesn't match the expected format, project ID doesn't exist server-side), `2` on filesystem error.

### FR-007 — Rate limiting
Per-token rate limit, enforced by the auth middleware:

- Default: **60 requests per minute** per token (`MCP_RATE_LIMIT_PER_MINUTE`).
- Burst: 10 requests can fire within 1 second before throttling kicks in.
- Implementation: in-memory token-bucket per token id (no Redis dependency at v1; revisit if multi-instance).
- Throttled requests return `429 Too Many Requests` with `Retry-After: <seconds>` header.
- Throttle events log to `mcprequestaudit` with `outcome: throttled`.

Rate limit is intentionally generous for v1 — covers normal `implement` / `auditfences` usage with headroom; high-volume `runqa` flows would hit it and require a tier bump in a future spec.

### FR-008 — Per-request audit logging
Every request to `mcp.wxperts.com` writes a row to a new `mcprequestaudit` table (schema in Section 4) with: `requestid`, `tokenid`, `customerid`, `projectid`, `tool`, `methodpath`, `durationms`, `outcome` (`success` / `auth-failed` / `throttled` / `scope-violation` / `error`), `errorcode`, `createdat`.

- Health-check requests are NOT logged (would dominate the volume).
- Audit writes happen asynchronously (don't block the response).
- Retention: 90 days, then archived to S3 (a sibling spec; out of scope here).

### FR-009 — `mcpapitokens` table
A new DB table storing issued tokens, hashed at rest. Schema in Section 4. Includes:

- `id` (uuid v7), `customerid`, `projectid`, `tokenhash`, `tokenprefix` (first 8 chars, for display), `name` (human label), `issuedby` (admin user id), `issuedat`, `expiresat` (nullable), `revokedat` (nullable), `lastusedat`.
- Unique on `tokenhash`.
- Index on `(customerid, projectid)` for fast lookup.
- Tokens are 32-byte random hex strings prefixed with `wxk_live_` (production) or `wxk_test_` (staging) — distinguishes accidentally-pasted-wrong tokens in logs.

### FR-010 — Admin UI: token issuance + revocation + rotation
A new view in the wxKanban admin UI (under existing project admin):

- **Issue token**: enter human-readable name, click "Issue". Shows the raw token ONCE, copy-to-clipboard, then never again.
- **List tokens** per project: shows name, prefix, issued-by, issued-at, last-used-at, status (active / revoked / expired).
- **Revoke token**: immediate revocation; the next request using it returns 401.
- **Rotate**: issue a new token, mark the old one for revocation in 7 days (overlap window), surface the new token to the operator.
- Only company admins + project owners can issue/revoke; enforced via existing wxKanban role checks.

### FR-011 — `setup-mcp.mjs` deprecation
The script remains in the repo but:

- Prints a top-of-run warning: `"setup-mcp.mjs is deprecated — wxkanban-agent v0.4.0 uses hosted MCP. Run \`wxkanban-agent kit:configure\` instead."`
- If `MCP_BASE_URL` is set and points to an `https://` endpoint, the script exits 0 immediately without spawning a local MCP.
- The npm `kit:start` script is updated to check for hosted config first; if present, it only starts the gateway (no MCP).
- A new `kit:start:legacy` preserves the old behavior for v0.3.x consumers mid-migration.
- Removal scheduled for kit v0.5.0 (separate spec).

### FR-012 — `verify-install.ts` updates
The install verification gate gains:

- A `hosted-mcp-reachable` step: HTTPS GET `https://mcp.wxperts.com/health`, expect 200.
- A `token-valid` step: a sentinel authenticated call (e.g. `POST /call` with `{tool: 'project.help', args: {}}` and the configured token); expects 200.
- The existing local-MCP steps become conditional on `MCP_BASE_URL` pointing at `localhost`.

### FR-013 — CORS + security headers
The hosted MCP enforces:
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- CORS: deny by default; the `Origin` header is ignored for `/call` (server-to-server). The kit never makes browser-origin requests.

### FR-014 — Logging + observability
- Pino structured logs (per CLAUDE.md) at `info` for every request (tool, duration, outcome).
- CloudWatch log group: `/aws/apprunner/mcp-wxperts-com/<service>`.
- App Runner service auto-rotates logs; no in-process log file at v1.
- `/health` includes the deployed `version` (git short sha) so a quick `curl` confirms which build is live.

### FR-015 — Deployment automation
- `apprunner-mcp.yaml` declares the source-code-mode service shape (runtime, build + run commands, port). Sibling to existing `apprunner.yaml` for `wxkanban.wxperts.com`.
- `infra/route53.tf` (or equivalent) declares the DNS + ACM-issued cert.
- `infra/secrets-rotation-runbook.md` documents the manual DB credential rotation procedure.
- A `Makefile` target `make deploy-mcp-staging` and `make deploy-mcp-prod` invokes `aws apprunner start-deployment` against the corresponding service ARN. Staging also auto-deploys on every push to `main` via App Runner's GitHub source connection; the staging target is for forcing an out-of-band redeploy. Production is tag-gated.

---

## User Scenarios & Testing

### US1 — New consumer onboards to hosted MCP (happy path)

**Actor**: New developer at a customer org, installing the kit for the first time.

**Scenario**:
1. Developer runs `npm install wxkanban-agent@^0.4.0`.
2. Their company admin (Actor: admin) mints a project token in the wxKanban admin UI; copies the displayed token ONCE.
3. Admin sends the token + project ID via the company's secret-sharing channel.
4. Developer runs `wxkanban-agent kit:configure --token wxk_live_<...> --project-id <pid>`.
5. The command writes the three fields into `.wxai/project.json`. Token is never echoed in full to the terminal (FR-006).
6. Developer runs `wxkanban-agent verify` — `hosted-mcp-reachable` and `token-valid` both pass (FR-012).
7. Developer runs `wxkanban-agent implement 026/T010` (a real spec/task in their repo). The implement worker calls `resolveServiceUrl('mcp')` → reads `MCP_BASE_URL=https://mcp.wxperts.com` → POSTs `/call` with `Authorization: Bearer wxk_live_...`. The hosted MCP validates, scopes to (customerId, projectId), runs the tool.

**Expected outcome**: A complete spec/task implementation roundtrip without any DB credentials on the developer's machine, without any local MCP process, and without any port other than 443 used.

### US2 — Existing v0.3.x consumer migrates to hosted (US1's predecessor)

**Actor**: Existing customer dev who's been running local MCP + local DB credentials.

**Scenario**:
1. Developer upgrades to v0.4.0: `npm install wxkanban-agent@^0.4.0`.
2. On next `npm run kit:start`, `setup-mcp.mjs` prints the deprecation warning (FR-011) but proceeds (back-compat).
3. Admin issues a hosted-MCP token.
4. Developer runs `wxkanban-agent kit:configure --token <t> --project-id <p>` — writes the three fields.
5. Developer runs `npm run kit:start` again. Because `MCP_BASE_URL` now points to `https://mcp.wxperts.com`, `setup-mcp.mjs` exits 0 without spawning local MCP (FR-011).
6. Developer's existing `DATABASE_URL` env var is now unused; the migration guide recommends removing it.
7. Developer runs `wxkanban-agent kit:stop` to clean up the old local MCP — works via legacy `.mcp-server.pid` path from spec 027.

**Expected outcome**: Zero-downtime migration; no schema changes on the consumer side; old creds become inert.

### US3 — Admin mints + rotates a project token

**Actor**: Company admin in the wxKanban UI.

**Scenario**:
1. Admin navigates to project → Settings → API Tokens.
2. Clicks "Issue token", enters name "Andy's laptop". Token displayed once.
3. Two months later, admin clicks "Rotate" on Andy's token. UI:
   - Mints a new token with the same scope.
   - Marks the old token to be revoked in 7 days.
   - Shows the new token once.
4. Admin sends the new token to Andy via secret channel. Andy runs `wxkanban-agent kit:configure --token <new>` — overwrites the old field.
5. On day 7, the old token starts returning 401. If Andy missed the rotation, his next call fails with `{error: "invalid-token"}`; he reaches out, admin sees `lastusedat` to confirm Andy's the affected user.

**Expected outcome**: Token rotation without downtime; old tokens have a defined sunset window; admin has audit visibility.

### US4 — Missing token (loud failure)

**Actor**: Developer who forgot to run `kit:configure`.

**Scenario**:
1. Developer runs `wxkanban-agent implement 026/T010`.
2. The implement worker resolves `MCP_BASE_URL=https://mcp.wxperts.com` from defaults (or from `.wxai/project.json`).
3. No `WXKANBAN_API_TOKEN` is set.
4. The kit fails fast (FR-005):
   ```
   ERROR: Missing WXKANBAN_API_TOKEN.
   Run `wxkanban-agent kit:configure --token <token>` after minting one in the wxKanban admin UI.
   ```

**Expected outcome**: No request goes over the wire; the error message names the exact fix.

### US5 — Invalid / revoked token

**Actor**: Developer whose token was rotated and the old one is now revoked.

**Scenario**:
1. Developer runs `wxkanban-agent implement 026/T010` with the old (revoked) token.
2. Hosted MCP middleware (FR-003) hashes the token, looks it up — finds the revoked record.
3. Returns `401 Unauthorized` + `{error: "invalid-token"}`.
4. The kit surfaces:
   ```
   ERROR: MCP rejected token (401 invalid-token).
   The token may have been rotated or revoked. Run `wxkanban-agent kit:configure --token <new>` with the current token.
   ```
5. Audit log row written with `outcome: auth-failed`, `tokenid: <rotated-token-id>`.

**Expected outcome**: Clear failure; admin has audit trail of who tried what; no leaked information about whether the token exists vs is wrong.

### US6 — Scope violation attempt

**Actor**: Developer with a valid token for project A, attempting to query project B (bug or attack).

**Scenario**:
1. Developer crafts a tool call with `args.projectId = "<some-other-projectid>"`.
2. Auth middleware resolves the token → context = (customerId=X, projectId=A).
3. The scoped-query wrapper (FR-004) detects the requested `projectId` ≠ context `projectId`. Logs `scope-violation`. Returns `403 Forbidden` + `{error: "scope-violation"}`.
4. The kit surfaces: `ERROR: MCP rejected request (403 scope-violation). Your token is scoped to a different project.`
5. Audit row written with `outcome: scope-violation`, `errorcode: cross-project`. Admin alerting can trigger on these.

**Expected outcome**: Cross-tenant queries fail closed; admin sees the attempt; no DB row from project B is read or written.

### US7 — Rate limit exceeded

**Actor**: Developer running a stress test (e.g. `runqa` in a tight loop) that exceeds 60 req/min.

**Scenario**:
1. Token bucket drains; the 61st request in 60s returns `429 Too Many Requests` + `Retry-After: 12`.
2. The kit's HTTP client honors `Retry-After` and surfaces:
   ```
   WARN: MCP throttled (60 req/min limit). Retrying in 12s...
   ```
3. After the retry window, requests resume.
4. Audit rows recorded with `outcome: throttled`. Admin can see throttle events per token.

**Expected outcome**: Graceful throttling; no failed-on-the-floor requests under bursty workloads (kit retries); admin can spot tokens that need a higher tier.

### US8 — Hosted MCP unreachable (transient outage)

**Actor**: Developer whose call hits an App Runner deployment window.

**Scenario**:
1. `fetch('https://mcp.wxperts.com/call', ...)` errors with connection refused or 502/503.
2. The kit's MCP client logs the error and surfaces:
   ```
   ERROR: MCP not reachable at https://mcp.wxperts.com/call (HTTP 503).
   The hosted MCP service may be deploying. Run `curl https://mcp.wxperts.com/health` to check service status, or retry in 30s.
   ```
3. If the kit was mid-`implement` and had not yet written files, no partial state lands.
4. The kit does NOT auto-retry HTTP 5xx (App Runner deploys are short; retry-by-hand is fine at v1).

**Expected outcome**: Honest error; pointer to the `/health` endpoint for self-diagnosis; no half-committed state.

### US9 — Local-dev override (developer working on mcp-server itself)

**Actor**: wxKanban developer iterating on the MCP server code locally.

**Scenario**:
1. Developer sets `MCP_BASE_URL=http://localhost:3002` and starts a local MCP via `MCP_AUTH_REQUIRED=false node mcp-server/dist/index-http.js`.
2. Runs kit commands; auth middleware is bypassed because `MCP_AUTH_REQUIRED=false` (FR-003).
3. The kit warns once per session: `"WARN: MCP_BASE_URL points at localhost; hosted MCP recommended."`
4. Developer iterates without needing a real token.

**Expected outcome**: Local-dev path stays usable for kit/MCP-server maintainers; never permitted in production (deployment policy gate).

### US10 — App Runner deploy + rollback

**Actor**: wxKanban operator deploying a new MCP build.

**Scenario**:
1. Operator pushes a change to `main`. App Runner's GitHub source connection auto-triggers a staging build (`npm install && npm run build`), then deploys; staging endpoint cuts over. (Out-of-band: `make deploy-mcp-staging` forces an immediate redeploy.)
2. Operator hits `https://staging.mcp.wxperts.com/health` — confirms `version: <new sha>`.
3. Operator runs `wxkanban-agent verify --mcp https://staging.mcp.wxperts.com` against the staging endpoint.
4. Smoke pass → operator tags the commit (`git tag v0.4.0 && git push --tags`) and runs `make deploy-mcp-prod TAG=v0.4.0`.
5. Production `version` field flips; old version is held by App Runner's deployment history for 1-click rollback if `/health` flips to unhealthy.

**Expected outcome**: Safe deploy with explicit staging gate; rollback is a console-click operation.

### Integration test mapping (quickstart.md)

QA tasks cover:

- **QT-1** (US1): full happy-path roundtrip — kit:configure → verify → implement against a staging MCP.
- **QT-2** (US2): migration smoke — setup-mcp.mjs exits 0 when hosted config present; legacy still works without it.
- **QT-3** (US3): admin token issuance, list, revoke, rotate via the admin UI.
- **QT-4** (US4, US5): missing/invalid/revoked token error paths.
- **QT-5** (US6): scope-violation rejection + audit row.
- **QT-6** (US7): rate-limit kicks in at 60 req/min + Retry-After header.
- **QT-7** (US8): hosted MCP returning 5xx surfaces a clean error.
- **QT-8** (US10): staging deploy + smoke; rollback rehearsal.

---

## Data Model

Two new tables, following wxKanban DB conventions (lowercase, no underscores, UUID v7 PKs).

### `mcpapitokens` — issued API tokens (hashed at rest)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid v7 | PK |
| `customerid` | uuid | FK → `companies.id` |
| `projectid` | uuid | FK → `companyprojects.id` |
| `tokenhash` | text | SHA-256 hex of the raw token. Indexed unique. |
| `tokenprefix` | text | First 12 chars of the raw token (`wxk_live_a3f9`) for display. NOT a credential. |
| `name` | text | Human label, e.g. `"Andy's laptop"` |
| `issuedbyid` | uuid | FK → `userprofiles.id` (admin who minted) |
| `issuedat` | timestamptz | |
| `expiresat` | timestamptz | nullable; null = no expiry |
| `revokedat` | timestamptz | nullable; null = active |
| `revokedbyid` | uuid | FK → `userprofiles.id`, nullable |
| `lastusedat` | timestamptz | updated by auth middleware on each successful call |
| `createdat` | timestamptz | |

**Indexes:**
- Unique on `tokenhash`
- `(customerid, projectid)` for fast scope lookup
- `(projectid, revokedat)` for listing active tokens per project

**Constraints:**
- FK on `customerid` cascades on company delete
- FK on `projectid` cascades on project delete
- A token is **active** iff `revokedat IS NULL AND (expiresat IS NULL OR expiresat > NOW())`

### `mcprequestaudit` — append-only request audit log

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid v7 | PK |
| `requestid` | uuid | Per-request correlation ID (also returned in response headers) |
| `tokenid` | uuid | FK → `mcpapitokens.id`, nullable (NULL for auth-failed-before-resolution) |
| `customerid` | uuid | nullable for unauthenticated calls |
| `projectid` | uuid | nullable for unauthenticated calls |
| `tool` | text | MCP tool name (e.g. `project.buildscope`); nullable for non-`/call` routes |
| `methodpath` | text | e.g. `POST /call`, `GET /tools` |
| `durationms` | integer | total wall-clock time |
| `outcome` | text | enum: `success`, `auth-failed`, `throttled`, `scope-violation`, `error` |
| `errorcode` | text | e.g. `invalid-token`, `cross-project`, `tool-not-found` |
| `responsestatus` | integer | HTTP status returned |
| `clientip` | text | nullable; useful for abuse triage |
| `useragent` | text | nullable |
| `createdat` | timestamptz | |

**Indexes:**
- `(tokenid, createdat)` for per-token timeline
- `(projectid, createdat)` for per-project audit views
- `(outcome, createdat)` for alerting queries

**Constraints:**
- Append-only by service convention; no UPDATE/DELETE in handlers
- Retention: 90 days; archived to S3 by a separate job (out of scope for this spec)

## Token Format

- Raw token: `wxk_<env>_<32-byte-hex>` — e.g. `wxk_live_a3f9b1c2…` (74 chars total).
- `<env>` is `live` for production, `test` for staging.
- The `wxk_` prefix lets log scrubbers + secret scanners catch leaks deterministically.
- Tokens are generated server-side via `crypto.randomBytes(32).toString('hex')`.
- `tokenhash = sha256(token).digest('hex')`.

## HTTP API Contracts

### Authentication

All routes except `/health` require:
```
Authorization: Bearer wxk_live_a3f9b1c2…
```

Error responses (all JSON, all include `requestid` header for support):

| Status | Body | Meaning |
|--------|------|---------|
| `401` | `{"error": "missing-token"}` | No `Authorization` header |
| `401` | `{"error": "invalid-token"}` | Token not found, revoked, or expired |
| `403` | `{"error": "scope-violation", "detail": "<safe message>"}` | Query attempted outside (customerid, projectid) scope |
| `429` | `{"error": "rate-limited", "retryAfterSec": 12}` + `Retry-After: 12` header | Token bucket exhausted |
| `500` | `{"error": "internal", "requestid": "..."}` | Unexpected server error |
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

### Admin API: token management

Mounted under `/admin/projects/:projectid/tokens` on the existing wxKanban app server (NOT on mcp-server — admin auth is wxKanban-session-based, not MCP-token-based).

| Method | Path | Body | Returns |
|--------|------|------|---------|
| `POST` | `/admin/projects/:projectid/tokens` | `{name: string, expiresInDays?: number}` | `{id, token, prefix, name, expiresat}` — **token shown once** |
| `GET` | `/admin/projects/:projectid/tokens` | — | `[{id, prefix, name, issuedat, lastusedat, revokedat, expiresat}]` |
| `POST` | `/admin/projects/:projectid/tokens/:id/revoke` | — | `{revokedat}` |
| `POST` | `/admin/projects/:projectid/tokens/:id/rotate` | `{name?: string, overlapDays?: number}` (default 7) | `{newToken: {id, token, prefix, ...}, oldRevokeAt}` |

All admin endpoints require: authenticated wxKanban session + role check (`COMPANY_ADMIN` or `PROJECT_OWNER` for `:projectid`).

## Consumer-side Configuration

`.wxai/project.json` gains an optional `kit` block:

```json
{
  "lifecycleStage": "Implementation",
  "activeScope": "027",
  "kit": {
    "mcpBaseUrl": "https://mcp.wxperts.com",
    "apiToken": "wxk_live_a3f9b1c2…",
    "projectId": "01926a90-…"
  }
}
```

- `kit.mcpBaseUrl` → consumed by `resolveServiceUrl('mcp')` (extends spec 027 FR-008 precedence: runtime-state file → `kit` block → env var → default)
- `kit.apiToken` → consumed by the HTTP client when calling MCP
- `kit.projectId` → consumed by every command for scope tagging

Alternative `.env` form (for shops that prefer env-var distribution):

```bash
MCP_BASE_URL=https://mcp.wxperts.com
WXKANBAN_API_TOKEN=wxk_live_a3f9b1c2…
WXKANBAN_PROJECT_ID=01926a90-…
```

Env vars always take precedence over `.wxai/project.json`'s `kit` block (matches existing precedence model).

## Infra Contracts

### `apprunner-mcp.yaml` (declarative service shape — version-controlled at repo root, sibling to existing `apprunner.yaml`)

```yaml
version: 1.0
runtime: nodejs22
build:
  commands:
    build:
      - npm install
      - npm run build
run:
  command: node mcp-server/dist/index-http.js
  network:
    port: 8080
  env:
    - name: NODE_ENV
      value: production
```

Matches the pattern of the existing `apprunner.yaml` (which deploys `wxkanban.wxperts.com`) — source-code mode, Node 22, no Dockerfile.

**Env vars listed in the yaml are placeholders only.** Per project memory `reference_apprunner_env_vars`, the App Runner service is `ConfigurationSource: API`, so the yaml `env` block is **ignored** at runtime — the real values (`DATABASE_URL`, `MCP_AUTH_REQUIRED`, `MCP_HTTP_PORT`, `MCP_RATE_LIMIT_PER_MINUTE`) live in the App Runner console.

The two App Runner service slots (prod + staging) both point at the same `apprunner-mcp.yaml`; they differ only in the env-var values set in the console (production `wxk_live_*` token namespace, staging `wxk_test_*`).

### `infra/route53` (Terraform or CDK — pick one in implementation)

- Hosted zone: `wxperts.com` (already exists)
- A-records via App Runner aliases:
  - `mcp.wxperts.com` → production App Runner service
  - `staging.mcp.wxperts.com` → staging App Runner service
- ACM cert: SAN cert covering both names; auto-renewed; validated via DNS

### `Makefile` deploy targets

```makefile
# Staging auto-deploys from `main` via the App Runner GitHub source connection;
# this target is only needed to force a redeploy out-of-band.
deploy-mcp-staging:
	aws apprunner start-deployment --service-arn $(MCP_STAGING_ARN)

# Production is tag-gated. The tag itself is the deploy artifact.
deploy-mcp-prod:
	@test -n "$$TAG" || (echo "TAG=vX.Y.Z required"; exit 1)
	@git tag --list "$$TAG" | grep -q "^$$TAG$$" || (echo "tag $$TAG does not exist locally"; exit 1)
	aws apprunner start-deployment --service-arn $(MCP_PROD_ARN)
```

No Docker. No ECR. App Runner pulls source straight from GitHub via the configured source connection, builds with `npm install && npm run build`, and runs `node mcp-server/dist/index-http.js`. Production deploys are tag-gated (`make deploy-mcp-prod TAG=v0.4.0`); staging auto-deploys from `main`.

## New / Modified Modules

| File | Purpose |
|------|---------|
| `mcp-server/src/middleware/auth.ts` | New. Bearer token validation, scope context attach. |
| `mcp-server/src/middleware/rate-limit.ts` | New. Per-token bucket. |
| `mcp-server/src/middleware/audit.ts` | New. Per-request audit row write (async). |
| `mcp-server/src/middleware/security-headers.ts` | New. HSTS, CSP, etc. |
| `mcp-server/src/db/scoped-query.ts` | New. Wraps Drizzle queries with scope enforcement. |
| `mcp-server/src/db/schema/mcpapitokens.ts` | New. |
| `mcp-server/src/db/schema/mcprequestaudit.ts` | New. |
| `mcp-server/src/server.ts` | Modified. Every tool handler migrated to scoped-query wrapper. |
| `mcp-server/src/index-http.ts` | Modified. Wire all 4 middlewares before `/call`. |
| `wxkanban-agent/core/orchestrator/command-handlers/kit-configure.ts` | New. `kit:configure` command handler. |
| `wxkanban-agent/core/context/runtime-state.ts` | Modified. Extend `resolveServiceUrl` to read `.wxai/project.json` `kit` block. |
| `wxkanban-agent/core/http/mcp-client.ts` | New (or extracted). Single HTTP client that adds `Authorization: Bearer` from configured token, retries 429 with `Retry-After`. All call sites route through it. |
| `wxkanban-agent/workers/ai/buildscope-worker.ts` | Modified. Use `mcp-client` instead of raw `fetch`. |
| `wxkanban-agent/services/lifecycle-api/lifecycle-client.ts` | Modified. Use `mcp-client`. |
| `wxkanban-agent/scripts/setup-mcp.mjs` | Modified. Deprecation warning + early-exit when `MCP_BASE_URL` is `https://`. |
| `wxkanban-agent/scripts/verify-install.ts` | Modified. New hosted-MCP-reachable + token-valid steps. |
| `src/server/routes/admin/tokens.ts` | New. Admin API for token CRUD. |
| `src/client/pages/admin/ProjectTokensPage.tsx` | New. Admin UI for tokens. |
| `apprunner-mcp.yaml` | New. Sibling to existing `apprunner.yaml`; declares the MCP service shape (source-code mode, Node 22). |
| `infra/route53.tf` | New (or CDK equivalent). |
| `infra/secrets-rotation-runbook.md` | New. |
| `Makefile` | New / extended with deploy targets. |

---

## Acceptance Criteria

Spec 028 is `Released` when all of the following hold:

### A-1 — Hosted endpoint is live (FR-001, FR-002)
- `https://mcp.wxperts.com/health` returns 200 with the documented JSON shape, including the deployed `version` (git short sha).
- `https://staging.mcp.wxperts.com/health` likewise.
- ACM cert valid; HSTS header present; HTTP-on-80 redirects to HTTPS.
- App Runner service shows `Running` with the env vars from FR-002 set in the console (verified by manual screenshot in the deployment runbook).

### A-2 — Auth middleware blocks unauthenticated calls (FR-003)
- `curl https://mcp.wxperts.com/call -d '{"tool":"project.help","args":{}}'` returns 401 + `{"error":"missing-token"}`.
- A revoked token returns 401 + `{"error":"invalid-token"}`.
- A valid token reaches the handler and the response includes `requestid` in headers.
- `MCP_AUTH_REQUIRED=false` is rejected by a deployment policy check (CI fails the merge if production config sets it to false).

### A-3 — Project-scope enforcement works (FR-004)
- A token scoped to project A, calling a tool with `args.projectId = B`, returns 403 + `{"error":"scope-violation"}`.
- The audit log records the attempt with `outcome: scope-violation`.
- A CI grep verifies no handler in `mcp-server/src/server.ts` calls `db.select/insert/update/delete` outside `scoped-query.ts`. Build fails on regression.
- Manual cross-tenant test: a developer with project-A token cannot read or write project-B rows (covered by QT-5).

### A-4 — Token issuance + revocation + rotation (FR-009, FR-010)
- Admin can mint a token via the UI; token displayed once.
- Token shows up in the list with correct prefix, name, issued-by.
- Revoke flips `revokedat`; the next request returns 401 within ≤ 5s.
- Rotate issues a new token AND schedules old-token revocation 7 days out (configurable).
- `lastusedat` updates on every successful authenticated call.

### A-5 — Consumer-side discovery + configuration (FR-005, FR-006)
- `wxkanban-agent kit:configure --token <t> --project-id <p>` writes the three fields atomically to `.wxai/project.json` `kit` block.
- Token is never echoed in full (only prefix + last 4) to the terminal.
- `resolveServiceUrl('mcp')` returns `https://mcp.wxperts.com` when the `kit` block is set; falls through to env / default otherwise.
- Missing-token error message names the exact fix command.

### A-6 — Rate limit (FR-007)
- 60 successful requests in 60 seconds → 61st returns 429 + `Retry-After: <seconds>` header.
- The kit's MCP client honors `Retry-After` and retries successfully after the wait.
- Throttle events appear in `mcprequestaudit` with `outcome: throttled`.

### A-7 — Audit logging (FR-008)
- Every authenticated request writes exactly one `mcprequestaudit` row.
- `/health` requests do NOT write rows (verified by volume check).
- Audit writes are async (handler returns before the row is committed; measured: handler 95th percentile ≤ 50ms overhead).
- A row exists for every distinct `outcome` value at least once after the QT-1..QT-7 suite runs.

### A-8 — Local-MCP deprecation path (FR-011)
- `setup-mcp.mjs` prints the deprecation warning on every run.
- When `MCP_BASE_URL` starts with `https://`, the script exits 0 within 1s without spawning local MCP.
- `npm run kit:start` invokes the hosted path when configured, the legacy path under `kit:start:legacy`.
- A v0.3.x consumer can upgrade to v0.4.0 without any code changes (verified by QT-2).

### A-9 — Install verification (FR-012)
- `verify-install.ts` gains the `hosted-mcp-reachable` step that hits the configured `MCP_BASE_URL/health`.
- The `token-valid` step issues a real authenticated call and reports pass/fail.
- Local-MCP steps are conditional on `MCP_BASE_URL` being `http://localhost:*`.

### A-10 — Deployment runbook + Makefile (FR-015)
- `make deploy-mcp-staging` builds, pushes, deploys with zero manual steps beyond `make`.
- `make deploy-mcp-prod TAG=vX.Y.Z` is tag-gated and refuses to run without `TAG`.
- `infra/secrets-rotation-runbook.md` documents DB cred rotation (steps, expected downtime ≤ 0s, rollback).

### A-11 — Tests pass
- Unit tests for `auth.ts`, `rate-limit.ts`, `audit.ts`, `scoped-query.ts`, `mcp-client.ts`, `kit-configure.ts`.
- Integration tests for QT-1 through QT-8.
- Existing 210 kit tests stay green.
- Existing mcp-server tests pass after the scoped-query migration (3 currently-failing tests from spec 027 work era are pre-existing DB-env failures, not regressions — separate fix).

### A-12 — Documentation
- `wxkanban-agent/docs/hosted-mcp.md` — full reference: configuration, auth, error codes, rate limits, deployment.
- `README.md` updated: "Hosted MCP (recommended)" replaces "MCP server (local)" as the primary install path.
- `CHANGELOG.md` v0.4.0 entry covers all spec 028 deliverables + migration notes for v0.3.x consumers.
- Admin UI screenshots in `docs/admin/project-tokens.md`.

### A-13 — Dogfood
- This repo's own kit is reconfigured to use `https://staging.mcp.wxperts.com` for at least one full sprint of `implement` invocations.
- `mcprequestaudit` shows a clean track record (no `scope-violation`, no unexpected `error` outcomes).

## Out of Scope

- **Self-hosted appliance path.** Air-gapped customers blocked at v1. A future spec ("MCP Appliance") would re-introduce a sealed self-host distribution if there's demand.
- **mTLS / client certs.** Token-only auth at v1.
- **OAuth/OIDC / SSO integration.** Admin UI sessions use existing wxKanban auth; MCP-token issuance is admin-gated but not federated.
- **DB-per-tenant.** Shared DB with row-level scoping continues at v1.
- **Multi-region deployment.** Single App Runner region (the one currently hosting the wxKanban app). Geo-failover deferred.
- **Per-tool authorization (scoped tokens).** All tokens grant access to all tools at v1. Per-tool scopes are a follow-on if needed.
- **Rate-limit tiers / billing meters.** Single tier (60 req/min) at v1.
- **Public token marketplace / customer self-service issuance.** Admin-only at v1.
- **Token revocation push to consumer (e.g. webhook).** Revocation is pull-based — the next call fails. No proactive notification.
- **Encrypted-DATABASE_URL distribution.** Retired with this spec. The pattern remains in code for the v0.3.x legacy path until kit v0.5.0.
- **Browser-origin requests / CORS for a hosted UI.** The hosted MCP serves server-to-server kit calls only. A future wxKanban web UI talking directly to MCP would be a separate spec with its own CORS + CSRF design.
- **Cross-region DR automation.** Manual failover documented in the runbook; automation is a follow-on.

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| App Runner outage takes down all consumers simultaneously | Low | High | Single region at v1 is acknowledged risk; `/health` endpoint + clear error message (US8) lets consumers self-diagnose. Multi-region failover is a follow-on. SLA target: 99.5% at v1. |
| Token leak via accidentally-committed `.wxai/project.json` | Medium | Medium | Token has `wxk_live_` prefix so secret scanners catch it. Templates `.gitignore.snippet` (spec 027) now includes `.wxai/project.json`. Admin UI surfaces unusual `lastusedat` patterns. |
| Rate limit too strict for `runqa` or batch workflows | Medium | Medium | 60 req/min is a starting point; trivially adjustable per-token via DB column (deferred to follow-on UI). Document the limit prominently. |
| Scope-violation bug leaks data across tenants | Low | Critical | The `scoped-query.ts` wrapper is the single chokepoint. CI grep enforces no handler bypasses it. Pen-test rehearsal as part of A-3. |
| App Runner deploy causes 30–60s blip; consumers' in-flight `implement` fails mid-write | Medium | Medium | `implement` writes are atomic (spec 026 tmp+rename). Failed AI call leaves no partial state. Document "retry after deploy" in error messages (US8). |
| `mcprequestaudit` growth at high consumer count fills the DB | Medium | Medium | 90-day retention with S3 archival defined (out of scope here). Index on `(outcome, createdat)` keeps alerting queries fast. |
| Long-lived tokens are stolen and used for weeks | Low | High | `lastusedat` visible to admins; UI shows unusual access patterns. Rotation flow (FR-010) is one-click. Token format (`wxk_live_*`) deterministically detected by secret scanners (GitHub, GitLab, AWS Secrets Manager). |
| Encrypted-DATABASE_URL fallback creates ambiguity during migration window | Low | Low | Deprecation warning fires every `setup-mcp.mjs` run. v0.5.0 removal is a separate, scheduled spec. |
| Per-token in-memory rate-limit breaks at multi-instance scale | Low | Medium | App Runner at v1 runs 1 instance; min=1/max=5. At max scale a token could get 5× its limit before back-pressure. Acceptable at v1; revisit with Redis-backed limit when min ≥ 2. |
| Admin UI exposes too much (token raw value reappears in audit) | Low | High | Token raw value is shown ONCE at issue + ONCE at rotate (FR-010); never stored on disk; never logged. Audit logs reference `tokenid` only, never the raw value. |
| DB write to `mcprequestaudit` slows down request path | Low | Medium | Async write; handler returns before commit. Measured A-7 ≤ 50ms overhead. If exceeded, switch to fire-and-forget into a queue (out of scope at v1). |

## Dependencies

- **Spec 019** — Orchestrator Kit. Provides the consumer-side command gateway that calls into MCP.
- **Spec 026** — Code Fencing. Every new module fenced by `implement 028/T<...>`. CI's `auditfences --strict` gates the PR.
- **Spec 027** — Kit Runtime Hygiene. `resolveServiceUrl` precedence is extended (not replaced) by the `kit` block in `.wxai/project.json`.
- **Existing wxKanban auth** — admin role checks for token issuance. No change to consumer-side wxKanban auth; this is purely MCP-token auth.
- **AWS infra** — App Runner service slots (2: prod + staging) provisioned via source-code mode against the existing GitHub source connection; ACM cert; Route53 hosted zone (all in the same AWS account as `wxkanban.wxperts.com`).

## Out-of-Band Issues to Track Separately

- **Removal of `setup-mcp.mjs`** scheduled for kit v0.5.0; create a placeholder spec to track once 028 ships.
- **`mcprequestaudit` S3 archival** — separate operational spec; needed before audit table volume becomes an issue (~ 6 months at expected scale).
- **Per-tool authorization** — follow-on spec; will need a token-scope column on `mcpapitokens` and a scope-check in the auth middleware.
- **Redis-backed rate limit** — needed when App Runner min-instances increases above 1. Track as a future spec.
- **Status page** — resolved during buildscope: consumers self-diagnose via `curl https://mcp.wxperts.com/health` (returns `{status, version, dbConnected, uptime}`). A dedicated `status.wxperts.com` is a follow-on if outage-communication needs grow (third-party page like Statuspage or self-hosted Uptime Kuma).

---

## Amendment 2026-05-23 — Phase 11: Token Store Unification

**Status**: confirmed 2026-05-23
**Trigger**: Bug report `BUG-REPORT-wxkanban-kit-v1.1.0-init.md` root cause #3 — kit-download-injected `WXKANBAN_API_TOKEN` works against the hosted MCP only after manual re-mint via the admin UI. Investigation showed two parallel token tables: `apitokens` (kit-download path, `projectKitAuth` consumer) and `mcpapitokens` (admin mint + MCP auth). Same token format, incompatible stores. The original spec 028 introduced `mcpapitokens` (FR-009) without retiring `apitokens` or wiring `KitProxyService` to it — leaving the cutover half-finished. Phase 11 finishes it.

### FR-016 — `mcpapitokens` becomes the single token store

After this phase, `apitokens` is removed from the schema. `mcpapitokens` is the only table any token-issuing or token-validating code reads or writes. The kit's shipped `.env` token, the (soon-deleted) admin-minted token, and the `projectKitAuth`-validated token are all the same row in the same table.

### FR-017 — Migration: copy live `apitokens` rows, drop personal tokens

Migration `0022_spec028_unify_tokens.sql` runs in this order:

1. Insert one `mcpapitokens` row per non-revoked `apitokens` row where `projectid IS NOT NULL`. Copy `tokenhash`, `tokenprefix` (derive from hash if absent), `name`, `customerid` ← `apitokens.companyid`, `issuedbyid` ← `apitokens.userid`, `issuedat` ← `apitokens.createdat`, `lastusedat`, `expiresat`. `revokedat` left null (already filtered).
2. **Personal/user-level tokens (`apitokens.projectid IS NULL`) are NOT migrated.** They are dropped in this cutover per the explicit decision logged 2026-05-23. Consumers of those tokens must mint a project-scoped one via the kit-download flow.
3. Drop the `apitokens` table.

The migration is one-way; rollback requires restoring from backup. A pre-migration count of personal-token rows is emitted to the migration log so we know post-hoc how many were dropped.

### FR-018 — `ApiTokenService` rewires to `mcpapitokens`

`src/server/services/ApiTokenService.ts` keeps its public surface (`createToken`, `validateToken`, `listUserTokens`, `revokeToken`, etc.) so callers don't churn. Internal storage moves to `mcpapitokens`. `createToken`'s signature changes: `projectId` becomes required (no default to undefined). Calls that previously omitted it fail at compile time and must be updated to pass a real project id.

`KitProxyService.writePerProjectFiles` already has a project context, so the call site update is mechanical.

### FR-019 — `projectKitAuth` reads from the unified store

`src/server/middleware/projectKitAuth.ts` switches from the old `apiTokenService.validateToken` (which queried `apitokens`) to the new unified lookup (which queries `mcpapitokens`). After this, the same token shipped in `.env` authenticates against MCP **and** against `/api/projects/:id/kit/upgrade` + `/api/projects/:id/kit/latest-version`. Bug report #3 closed.

### FR-020 — Admin Mint Token UI / route deletion

After FRs 016-019 land, the admin Mint UI is no longer the only way to get a working MCP token — every kit download produces one. The admin route + UI are deleted in this same phase:

- `src/server/routes/admin/tokens.ts` deleted, route un-mounted from `app.ts` / `index.ts`.
- Any admin-UI page that calls those endpoints removed (or stripped of the mint controls).
- Rotation/recovery falls back to `kit-configure` (orchestrator CLI) or re-downloading the kit.

### A-14 — Token store unified (acceptance for Phase 11)

1. `apitokens` table no longer exists in the schema (drizzle introspection returns no `apitokens` table).
2. `KitProxyService.writePerProjectFiles` produces a token that succeeds against both `https://mcp.wxperts.com/call` and `https://wxkanban.wxperts.com/api/projects/:id/kit/upgrade` without any manual mint step.
3. All callers of `apiTokenService` continue to compile and pass tests.
4. No code path references `apitokens` (`grep -r "apitokens" src/` returns nothing in `.ts` outside of historical comments or migration files).
5. `src/server/routes/admin/tokens.ts` deleted; `/api/admin/projects/:projectid/tokens` returns 404.
6. The bug-report repro (download kit → extract → `init.mjs` → `upgrade-kit.mjs`) succeeds end-to-end with no admin intervention.

### Phase 11 Risks (added to Risks & Mitigations above)

| Risk | Mitigation |
| --- | --- |
| Migration drops live personal tokens a customer was actively using | Pre-migration query lists the count; if non-zero and surprising, abort and surface. Decision today is "drop"; the abort gate is the out if the count is bigger than expected. |
| `mcpapitokens.projectid` is NOT NULL — any future user-level token use case can't fit the unified store | Out of scope per FR-017 decision. Revisit if a real user-level need surfaces. |
| Hosted-MCP code in `mcp-server/` validates against `mcpapitokens` and may expect fields not populated by the copy (e.g. missing `tokenprefix`) | Migration computes `tokenprefix = substr(tokenhash, 1, 12)`-style fallback if the source row lacks it; smoke test queries with a migrated token before merge. |
| Some caller of `ApiTokenService.createToken` doesn't have a project context (breaks compilation after FR-018 signature change) | Audit at the start of implementation; rewrite callers to pass `projectId` or, if a caller is genuinely project-less, delete that code path (it's broken by design under unified-store semantics anyway). |

---

## Amendment 2026-06-02 — Phase 12: Write-First Artifacts + Per-Workspace Project Isolation

**Status**: confirmed 2026-06-02
**Trigger**: Two field issues surfaced while running the kit against the hosted MCP:

1. **Artifacts persist to the DB but never reach the developer's disk.** `project.create_specs` (with `generateLifecycle: true`) writes `spec.md`/`plan.md`/`tasks.md`/`lifecycle.json` via `writeSpecArtifacts` → `resolveWorkspaceRoot()` **inside the MCP server** ([mcp-server/src/server.ts](../../mcp-server/src/server.ts) `writeSpecArtifacts`), and `project.buildscope` writes the scope file via `writeFileSync` **inside the MCP server** ([mcp-server/src/utils/project-kit.ts](../../mcp-server/src/utils/project-kit.ts)). On the hosted MCP those files land on the **server container**, not the developer's machine — so the DB is updated but the local workspace is not. This also inverts the intended ordering: DB is written before (and instead of) the local files.
2. **Concurrent VS Code windows risk operating on the wrong project.** The kit resolves the API token **env-first** (`WXKANBAN_API_TOKEN` over workspace `.wxai/project.json`) and caches a process-wide singleton MCP client; if the token is configured globally/user-level, two windows open on different projects can share one token (one project), and per-call `projectId` then mismatches the token.

This phase fixes both **without changing the project-scoped token model** (decision 2026-06-02: keep one token per project; resolve it per-workspace).

### FR-021 — Write-first: the client authors files, the server persists DB only

Artifact authorship MUST move to the client (kit CLI / VS Code extension), and the MCP server MUST stop writing files to its own filesystem:

- For `createspecs` and `buildscope`, the client MUST write the artifact files (`specs/<NNN>-<slug>/spec.md`, `plan.md`, `tasks.md`, `lifecycle.json`, and `specs/Project-Scope/<NNN>-<slug>.md`) to the **local workspace filesystem FIRST**, then call the MCP tool to persist the same content to the DB.
- `writeSpecArtifacts` (server) and the `buildscope` server-side `writeFileSync` MUST be removed (or hard-guarded to no-op on the hosted server). `project.create_specs` and `project.buildscope` become **DB-only** persistence endpoints; their responses still return the canonical content/paths the client wrote.
- The DB record remains the source of truth for cross-host pull; this phase only fixes *who writes the working-copy files and in what order* (local-first), it does not change the pull-on-open sync behavior.

### FR-022 — Per-workspace token + projectId, sent on every call

Token and projectId resolution MUST be workspace-local and per-call, so concurrent windows for different projects cannot cross-contaminate:

- The client MUST resolve **both** the API token and the projectId from **workspace-local config** (`.wxai/project.json` / `.wxkanban-project.json` for the resolved workspace root) at startup. A global/user-level `WXKANBAN_API_TOKEN` MUST NOT override a workspace-local token when one is present (workspace-local takes precedence; global env is only a fallback when no workspace token exists).
- Every MCP tool call MUST carry the resolving workspace's `projectId` in its arguments. No process-wide singleton may serve two different workspace roots with one cached token/projectId; the client MUST key any cached MCP client by workspace root (or resolve per call).
- The server-side token↔projectId match check ([mcp-server/src/db/scoped-query.ts](../../mcp-server/src/db/scoped-query.ts)) is unchanged and remains the backstop: a per-call projectId that disagrees with the token's project is rejected with `scope-mismatch` rather than silently mis-stored.

### A-15 — Write-first + isolation (acceptance for Phase 12)

1. Running `createspecs`/`buildscope` against the **hosted** MCP produces the spec/plan/tasks/lifecycle/scope files in the **developer's** workspace (not only the DB), authored by the client.
2. No `writeFileSync`/`mkdirSync` of spec/scope artifacts remains in `mcp-server/` for the `create_specs` / `buildscope` paths.
3. With two VS Code windows open on different projects on one machine, artifacts from each window land in that window's project — verified by the DB `projectid` matching each workspace's `.wxai/project.json`.
4. A workspace-local token is used even when a global `WXKANBAN_API_TOKEN` is exported; the global value is used only when the workspace has no token.
5. Every persisting MCP call includes the workspace's `projectId`; a deliberately mismatched projectId is rejected with `scope-mismatch` (no cross-project write).

### Phase 12 Risks

| Risk | Mitigation |
| --- | --- |
| Removing server-side file writes breaks a local/dev flow that relied on them | Local dev runs the same client path; the client now always authors files. Verify the local (non-hosted) createspecs still produces files via the client before merge. |
| Workspace-local token precedence change surprises a user who relied on a global env token | Global env still works as a fallback when no workspace token exists; document the precedence change in the kit release notes. |
| A caller still depends on the server-written files appearing on the server | Audit `mcp-server/` for readers of those paths; none should exist (DB is the source of truth). |

---

## Amendment A — Corporate-network transports (stdio fallback + Streamable HTTP)

**Added 2026-06-29.** Approved by Andy.

**Context.** High-trust corporate networks (e.g. American Litho, behind a **Cisco Secure Access** TLS-inspection proxy) cannot connect Claude Code to the hosted MCP. Verified evidence: `GET /health` → 200 and the kit's `POST /call` work (short request/response passes the proxy), but `GET /sse` returns no data and times out — the proxy **buffers/breaks the long-lived SSE stream**. TLS trust, token, and `.mcp.json` are already correct (Cisco root CA trusted via `NODE_EXTRA_CA_CERTS`). This is the classic enterprise failure mode and affects every customer behind a buffering/inspecting proxy. ("Can't get skills / can't push data" are downstream of the same SSE failure: when the MCP connection drops, no `project.*` tools appear and no writes go through.)

**Decision — two transports that avoid long-lived SSE:**

1. **SHIPPED — local stdio MCP bridge (client-side fallback).** A kit-bundled MCP server, `wxkanban-agent/apps/command-gateway/bin/wxai-mcp-stdio.mjs`, speaks MCP to Claude Code over **stdio** (zero network on the editor side) and reaches the hosted MCP only via the existing request/response endpoints: `tools/list` → `GET /tools`, `tools/call` → `POST /call` (with the same bearer auth; the server injects `_meta.mcpScope` on `/call`). It applies the same corporate-CA trust as the kit and self-checks `/health` on startup. **No server change, no IT change** — it works wherever `/health` returns 200. Selected by `init.mjs` probe-and-pick: if `/sse` (or `/mcp`) can't connect but `/health` is 200, write the stdio-bridge `.mcp.json` (`type:"stdio"`). Documented in `wxAI-project-init` (§2.1).

2. **SHIPPED — server-side Streamable HTTP transport `/mcp` (clean default).** Added the MCP Streamable HTTP transport in **stateless + `enableJsonResponse` mode** (plain `application/json` request/response, no `text/event-stream`, no long-lived stream) alongside `/sse`/`/messages`/`/call` in `mcp-server/src/index-http.ts`. Capable clients use `.mcp.json` `type:"http"`, `url:".../mcp"` directly. Per-request server+transport via a new `createRequestServer()` factory in `server.ts` (the SDK `Server`/`Protocol` holds a single `private _transport`, so per-request stateless transports cannot share the module-level singleton without racing); the factory reuses the `tools/call` + `tools/list` handlers (which don't close over the server instance) and keeps its own built-in `initialize`. Mirrors `/call`'s `_meta.mcpScope` injection so write/scoped tools get a real scope — which the SSE path does **not** (this closes that transport's `scope-required` defect, `bug-reports/2026-05-28-…`). **Verified live** on `mcp.wxperts.com`: `initialize` → 200 `application/json`; scope-guarded `list_open_items` returns data (not `scope-required`); additive — `/sse` + `/call` unchanged.

**Scope boundary:** transport-only. A self-hosted / on-prem appliance and offline/air-gap bundles remain **OUT** (Scope Boundary OUT, above) — not needed for the proxy/SSE problem, since egress to the host already works.
