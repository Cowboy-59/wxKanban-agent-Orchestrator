# Quickstart: Hosted MCP Deployment — Eliminate Consumer DB Port Requirement

**Spec Number**: 028

## Setup

1. Review the spec: `specs/028-HostedMCPDeployment/spec.md`
2. Review the plan: `plan.md` (especially **Known Issues** P-1 — manual AWS ops)
3. Review tasks: `tasks.md`
4. Confirm dependencies: spec 019 + 026 + 027 are all `Released`.
5. AWS access required for T030, T031, T044: App Runner console, Route53, ACM. Coordinate with whoever holds the wxKanban AWS root.

## Development

1. Pick the lowest-numbered open task from `tasks.md`. Tasks must be completed in dependency order (see `plan.md`).
2. Run the task through the orchestrator:

       wxkanban-agent implement 028/T<nnn>

   This will fence every new module under `[SCOPE 028 / T<nnn>]` (spec 026 dogfood).
3. For mcp-server tasks (Phase 2), test against a local Postgres + `MCP_AUTH_REQUIRED=false`:

       cd mcp-server
       MCP_AUTH_REQUIRED=false DATABASE_URL=... npx tsx src/index-http.ts

4. For kit tasks (Phase 4, 5), develop against a mock MCP (test fixtures) or against staging once T030 is done.
5. Run the affected test layer:

       cd wxkanban-agent && npm test
       cd mcp-server && npm test

6. Mark the task done — `implement` does this automatically on exit 0.

## AWS Operator Steps (T030–T031)

These cannot be automated — they're console actions. The runbook (T033) is the authoritative guide; abridged here:

1. **App Runner — production service**:
   - Source: GitHub connection (existing wxKanban repo), branch `main`, config file `apprunner-mcp.yaml`.
   - Deployment mode: Manual (tag-gated).
   - Instance: 1 vCPU / 2 GB, min 1 / max 5.
   - Env vars (in console): `DATABASE_URL`, `MCP_HTTP_PORT=8080`, `MCP_AUTH_REQUIRED=true`, `MCP_RATE_LIMIT_PER_MINUTE=60`, `NODE_ENV=production`.
   - Capture the service ARN → repo `.env.example` as `MCP_PROD_ARN`.

2. **App Runner — staging service**: same as prod except deployment mode = Automatic (on push to `main`); ARN captured as `MCP_STAGING_ARN`.

3. **ACM cert**: request a SAN cert covering `mcp.wxperts.com` + `staging.mcp.wxperts.com`; DNS-validate via Route53.

4. **Route53 records**: A-record aliases pointing each subdomain at the corresponding App Runner service.

5. **Smoke**: `curl https://mcp.wxperts.com/health` → 200 + JSON.

## Verification

1. Run `wxkanban-agent auditfences --strict` — every new module fenced.
2. Run all QT integration tests (T037–T044) — every one must pass.
3. Confirm all 13 acceptance criteria (A-1 through A-13) in `spec.md` pass.
4. Confirm `mcprequestaudit` shows a clean dogfood run (T046).

## Dogfood Check (Phase 9 — T045/T046)

After kit v0.4.0 ships and the staging MCP is live:

1. Reconfigure this repo:

       wxkanban-agent kit:configure \
         --mcp-url https://staging.mcp.wxperts.com \
         --token wxk_test_... \
         --project-id <this-repo's wxKanban project id>

2. Run one sprint of `implement` calls against staging (e.g., implement spec-028 tasks themselves).
3. Query `mcprequestaudit`:

       SELECT outcome, count(*) FROM mcprequestaudit
        WHERE projectid = '<this-repo>'
        GROUP BY outcome;

4. Expect: `success` dominates; zero `scope-violation`; zero unexpected `error`.

If the dogfood is clean, A-13 passes and T047 (lifecycle close) can proceed.

## Integration Test Scenarios (from spec.md)

| ID | Scenario | Covering Task |
|----|----------|---------------|
| QT-1 | Full happy-path roundtrip — `kit:configure` → `verify` → `implement` against staging | T037 |
| QT-2 | `setup-mcp.mjs` exits 0 when hosted configured; legacy still works | T038 |
| QT-3 | Admin token issuance / list / revoke / rotate via UI | T039 |
| QT-4 | Missing / invalid / revoked token error paths | T040 |
| QT-5 | Scope-violation rejection + audit row | T041 |
| QT-6 | Rate-limit at 60 req/min + `Retry-After` honored by mcp-client | T042 |
| QT-7 | Hosted MCP 5xx surfaces clean error (no auto-retry) | T043 |
| QT-8 | Staging deploy + smoke + rollback rehearsal | T044 |

## Migration Guide for v0.3.x Consumers

Documented in `wxkanban-agent/docs/hosted-mcp-migration.md` (T027). Summary:

1. `npm install wxkanban-agent@^0.4.0`
2. Admin mints a token for your project in the wxKanban UI → Settings → API Tokens
3. `wxkanban-agent kit:configure --token wxk_live_... --project-id <pid>`
4. (Optional) Remove `DATABASE_URL` from your `.env` — it's now unused.
5. `npm run kit:start` — `setup-mcp.mjs` exits 0; only the gateway spawns locally.

If anything fails, fall back to v0.3.x behavior with `npm run kit:start:legacy`.
