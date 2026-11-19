# Task Breakdown: Hosted MCP Deployment — Eliminate Consumer DB Port Requirement

**Feature**: Hosted MCP Deployment
**Spec**: 028
**Date Generated**: 2026-05-13
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| #  | Task | Priority | Status |
|----|------|----------|--------|
| 1  | T001: Create `mcpapitokens` Drizzle schema + migration (relocated 2026-05-19 from `mcp-server/src/db/schema/` to canonical `src/db/schema/mcpapitokens.ts` + `src/db/migrations/0020_spec028_mcpapitokens.sql`) | high | done |
| 2  | T002: Create `mcprequestaudit` Drizzle schema + migration (`src/db/schema/mcprequestaudit.ts` + `src/db/migrations/0021_spec028_mcprequestaudit.sql`) | high | done |
| 3  | T003: Schema validation tests (Vitest) for both tables (`tests/schema/hosted-mcp.test.ts`, 11 assertions passing) | high | done |
| 4  | T004: Apply migrations to the wxKanban DB via the spec-026 `apply-*` pattern (`scripts/apply-spec028-migration.ts` — applied 2026-05-19; both tables verified present with all 6 expected indexes) | high | done |
| 5  | T005: `mcp-server/src/middleware/auth.ts` — bearer token validation + scope context attach | high | done |
| 6  | T006: `mcp-server/src/middleware/rate-limit.ts` — per-token bucket (60/min default) | high | done |
| 7  | T007: `mcp-server/src/middleware/audit.ts` — async per-request audit row write | high | done |
| 8  | T008: `mcp-server/src/middleware/security-headers.ts` — HSTS, nosniff, no-referrer | medium | done |
| 9  | T009: `mcp-server/src/db/scoped-query.ts` — Drizzle wrapper that refuses cross-scope queries | high | done |
| 10 | T010: Migrate every handler in `mcp-server/src/server.ts` to use `scoped-query` (22 server.ts sites + gateway.ts + project-kit.ts legacy escape-hatched; CI grep gate now passes; tsc clean; 23/23 middleware tests still pass) | high | done |
| 11 | T011: Wire all 4 middlewares into `mcp-server/src/index-http.ts` before `/call` + `scripts/check-no-direct-db.sh` CI scope check | high | done |
| 12 | T012: Unit tests — auth + rate-limit + audit + scoped-query (23/23 passing) | high | done |
| 13 | T013: Admin API — `POST/GET/POST-revoke/POST-rotate /admin/projects/:id/tokens` (`src/server/routes/admin/tokens.ts` + mount in `index2.ts`) | high | done |
| 14 | T014: Admin role-check — `COMPANY_ADMIN` or `PROJECT_OWNER` for `:projectid` (`src/server/middleware/requireProjectAdminOrOwner.ts`) | high | done |
| 15 | T015: `src/client/pages/admin/ProjectTokensPage.tsx` — list/issue/revoke/rotate UI | high | done |
| 16 | T016: `src/client/components/admin/TokenDisplayModal.tsx` (copy-to-clipboard, ack-checkbox-gated close, no re-display) | high | done |
| 17 | T017: Admin API role-check integration tests (`tests/integration/admin-tokens.test.ts`, 6/6 passing); full HTTP integration + UI unit tests deferred to follow-up | high | partial |
| 18 | T018: `wxkanban-agent/core/http/mcp-client.ts` — Bearer-aware HTTP client with 429-retry | high | done |
| 19 | T019: Extend `resolveServiceUrl` to read `.wxai/project.json` `kit` block | high | done |
| 20 | T020: `core/orchestrator/command-handlers/kit-configure.ts` — write three fields atomically | high | done |
| 21 | T021: Refactor `workers/ai/buildscope-worker.ts` to use `mcp-client` | medium | done |
| 22 | T022: Refactor `services/lifecycle-api/lifecycle-client.ts` to use `mcp-client` | medium | done |
| 23 | T023: `scripts/verify-install.ts` — `hosted-mcp-reachable` + `token-valid` steps | medium | done |
| 24 | T024: Unit tests for `mcp-client` + `kit-configure` (11/11 passing); integration test deferred | high | partial |
| 25 | T025: `scripts/setup-mcp.mjs` — deprecation warning + early-exit when `MCP_BASE_URL` is `https://` | high | done |
| 26 | T026: `package.json` — `kit:start` hosted-path branching + new `kit:start:legacy` (new router: `scripts/kit-start.mjs`) | high | done |
| 27 | T027: `wxkanban-agent/docs/hosted-mcp-migration.md` — v0.3.x → v0.4.0 consumer migration guide | medium | done |
| 28 | T028: Smoke test — v0.3.x consumer upgrades to v0.4.0 without code changes (`wxkanban-agent/tests/integration/migration-smoke.test.ts`, 4/4 passing — kit-start.mjs routing decision + kit:configure round-trip) | medium | done |
| 29 | T029: `apprunner-mcp.yaml` at repo root (source-code mode, Node 22) | high | done |
| 30 | T030: Provision prod + staging App Runner services (operator task — AWS console; **BLOCKED**, awaiting operator) | high | blocked |
| 31 | T031: Route53 records + ACM SAN cert for `mcp.wxperts.com` + `staging.mcp.wxperts.com` (operator task — AWS console; **BLOCKED**, awaiting operator) | high | blocked |
| 32 | T032: `Makefile` — `deploy-mcp-staging` + `deploy-mcp-prod` (tag-gated) | medium | done |
| 33 | T033: `infra/secrets-rotation-runbook.md` — DB cred rotation procedure + token revocation + deploy rollback | medium | done |
| 34 | T034: `wxkanban-agent/templates/.gitignore.snippet` — add `.wxai/project.json` (kit-block holds token) | medium | done |
| 35 | T035: `wxkanban-agent/docs/hosted-mcp.md` — full reference doc | medium | done |
| 36 | T036: `wxkanban-agent/README.md` + `CHANGELOG.md` v0.7.0 entry + `package.json` version bump (0.6.2 → 0.7.0; spec said 0.4.0 but kit had already moved past that) | medium | done |
| 37 | T037: QT-1 integration test — full happy-path roundtrip against staging MCP | high | blocked-live-infra |
| 38 | T038: QT-2 integration test — `setup-mcp.mjs` exits 0 when hosted configured (covered by T028 migration smoke for the routing decision; full process-spawn smoke still blocked on live-infra) | high | partial |
| 39 | T039: QT-3 integration test — admin token issuance / list / revoke / rotate (role-check covered by `tests/integration/admin-tokens.test.ts`; full HTTP roundtrip blocked on live-server fixture) | high | partial |
| 40 | T040: QT-4 integration test — missing / invalid / revoked token error paths (auth-middleware unit covers missing/invalid; revoked/expired/audit-outcome assertions are blocked-live-infra) | high | partial |
| 41 | T041: QT-5 integration test — scope-violation rejection + audit row (scoped-query unit test covers in-process cross-scope reject; live-DB row-count diff blocked) | high | partial |
| 42 | T042: QT-6 integration test — rate-limit at 60 req/min + `Retry-After` honored (rate-limit + mcp-client retry-once unit-tested in Phases 2 + 4; full N-req sustained test blocked-live-infra) | high | partial |
| 43 | T043: QT-7 integration test — hosted MCP 5xx surfaces clean error (no auto-retry) (covered by `wxkanban-agent/tests/unit/mcp-client.test.ts`'s 5xx assertion) | high | done |
| 44 | T044: QT-8 integration test — staging deploy + smoke + rollback rehearsal (operator-only; documented as manual procedure in `infra/secrets-rotation-runbook.md` §3) | high | blocked-live-infra |
| 45 | T045: Reconfigure this repo to use `https://staging.mcp.wxperts.com` (dogfood A-13) | medium | todo |
| 46 | T046: Verify `mcprequestaudit` clean track record after one sprint of `implement` calls | medium | todo |
| 47 | T047: Late-bound AC verification + `lifecycle.json` flip to Released + `projectlifecycle.md` regen | low | todo |
| 48 | T048: Flip `KIT_DOWNLOAD_SOURCE` default to `orchestrator` in production (`src/server/routes/kitRoutes.ts:288`); confirm staging baked clean for 7 days first | high | todo |
| 49 | T049: Rebuild the orchestrator-published kit archive (`Cowboy-59/wxKanban-agent-Orchestrator`) without `mcp-server/` and without `pg`/`drizzle-orm` runtime deps; cut new release tag (`v1.1.0`) | high | todo |
| 50 | T050: Update `KitGenerationService` env+settings generation (`generateEnvFile`, `generateAiSettings`) to emit `WXKANBAN_MCP_BASE_URL`+`WXKANBAN_API_TOKEN`+`WXKANBAN_PROJECT_ID` only; remove `DATABASE_URL_ENCRYPTED` block and the `EMBEDDED_DATABASE_URL` patch step at lines 334-354 | high | todo |
| 51 | T051: After 7-day KitProxy bake, delete `src/server/services/KitGenerationService.ts` AND `src/server/services/KitEncryptionService.ts`; remove route wiring + dead imports | high | todo |
| 52 | T052: Migration drop `projectkits` + `projectkitfiles` tables in a follow-up PR after T051 lands; retain rollback window per R14 implementation note | medium | todo |
| 53 | T053: Extend `KitProxyService.serveUpgrade()` UPGRADE_STRIP to include `mcp-server/**` (defense in depth — upstream archive shouldn't have it post-T049, but strip server-side too) | medium | todo |
| 54 | T054: Implement `scripts/upgrade-kit.mjs` v1.1.0 cutover step: stop legacy MCP PID, remove `mcp-server/`, `scripts/setup-mcp.mjs`, `scripts/mcp-health-check.mjs`, `.mcp-server.pid`; add `mcpBaseUrl` field handling in `.wxkanban-project.json` | high | todo |
| 55 | T055: Add `wxkanban-agent/scripts/check-no-pg-in-kit.sh` (or extend `mcp-server/scripts/check-no-direct-db.sh`) to fail CI if a kit archive contains `pg` or `drizzle-orm` in `package.json`/`package-lock.json`, or contains `mcp-server/src/db/connection.ts` | medium | todo |
| 56 | T056: Consumer-machine smoke verification — clean Windows VM (no route to wxKanban Postgres) downloads v1.1.0 kit, runs `init.mjs`, completes a `buildscope` round-trip against `mcp.wxperts.com`, exits 0 | high | todo |
| 57 | T057: Spec 011 (NewProject AI Settings template) — replace `MCP_HTTP_PORT`+`API_KEY` block with `WXKANBAN_MCP_BASE_URL`+`WXKANBAN_API_TOKEN`+`WXKANBAN_PROJECT_ID` block pointing at `https://mcp.wxperts.com` | medium | todo |
| 58 | T058: Close BUG-20 follow-up bug report — add a Resolution section to `specs/019-agent-orchestrator-kit/bug-reports/2026-05-20-bug-20-followup.md` linking to merged PR(s) for T048–T056 | low | todo |

## Dependencies

- **Phase 1 (T001–T004)** before everything else — schema must exist before middlewares can read tokens.
- **Phase 2 (T005–T012)** depends on Phase 1. T009 (`scoped-query`) gates T010 (handler migration). T011 wires the middleware stack.
- **Phase 3 (T013–T017)** depends on Phase 1 (tokens table). Can run parallel with Phase 2.
- **Phase 4 (T018–T024)** depends on Phase 2 (server-side endpoints must respond per spec). T020 (`kit-configure`) can land before any AWS deploy.
- **Phase 5 (T025–T028)** depends on Phase 4 (resolver + client must exist before deprecation branching is meaningful).
- **Phase 6 (T029–T033)** runs parallel with Phase 4. T030 + T031 are manual AWS operator tasks; T033 documents them.
- **Phase 7 (T034–T036)** depends on Phases 2–6 complete.
- **Phase 8 (T037–T044)** runs alongside feature phases as they land. T044 needs Phase 6 (real staging deploy).
- **Phase 9 (T045–T046)** depends on Phase 7 complete (released kit + live hosted MCP).
- **T047** last (lifecycle close + status flip + projectlifecycle.md regeneration).
- **Phase 10 (T048–T058)** — v1.1.0 Kit Cutover, removes consumer-side MCP per spec 019 update 2026-05-20. Depends on:
  - T029–T031 (hosted MCP live) — must be reachable before consumers can stop bundling local MCP.
  - T025–T028 (hosted-mode client + migration smoke) — kit-side hosted path must work end-to-end.
  - Phase 9 dogfood (T045–T046) — wxKanban itself running against staging hosted MCP for one sprint.
  - T049 and T050 must land in lockstep (single coordinated release) — v1.1.0 archives are incompatible with the old injection code and vice versa.
  - T051 → T052 (cannot drop tables until code is deleted).
  - T056 (smoke) gates T058 (close BUG-20).

---

## Task Details

### T001 — `mcpapitokens` schema

**Target files**: `src/db/schema/mcpapitokens.ts` + auto-generated migration
**Spec refs**: Data Model section, FR-009
**Acceptance**:
- All 13 columns per Data Model section.
- Unique index on `tokenhash`.
- Indexes on `(customerid, projectid)` and `(projectid, revokedat)`.
- FK on `customerid` (cascade), `projectid` (cascade), `issuedbyid` (set null), `revokedbyid` (set null).

### T002 — `mcprequestaudit` schema

**Target files**: `src/db/schema/mcprequestaudit.ts` + migration
**Spec refs**: Data Model section, FR-008
**Acceptance**:
- All columns per Data Model.
- Indexes on `(tokenid, createdat)`, `(projectid, createdat)`, `(outcome, createdat)`.
- Append-only by service convention (no UPDATE/DELETE in handlers).

### T003 — Schema validation tests

**Target files**: `tests/schema/hosted-mcp.test.ts`
**Acceptance**:
- Structural introspection (column presence/types/notNull/defaults) per the spec-026 pattern.
- Verifies unique constraint on `tokenhash`.
- Verifies enum-style values for `outcome` (`success`, `auth-failed`, `throttled`, `scope-violation`, `error`).

### T004 — Apply migrations to wxKanban DB

**Target files**: `scripts/apply-spec028-migration.ts`
**Acceptance**:
- Follows the spec-026 pattern (pg.Client + transaction, splits on `--> statement-breakpoint`).
- Idempotent (re-runs safely).
- Both tables verified present after run.

### T005 — Auth middleware

**Target files**: `mcp-server/src/middleware/auth.ts`
**Spec refs**: FR-003
**Acceptance**:
- Parses `Authorization: Bearer <token>`; missing → 401 `{error: "missing-token"}`.
- SHA-256 hashes the token, looks up in `mcpapitokens` (active only).
- Not found / revoked / expired → 401 `{error: "invalid-token"}`.
- Active token: attaches `(customerId, projectId, scopes)` to request context; updates `lastusedat`.
- Bypassed entirely when `MCP_AUTH_REQUIRED=false` (local dev only; never set in production).

### T006 — Rate-limit middleware

**Target files**: `mcp-server/src/middleware/rate-limit.ts`
**Spec refs**: FR-007
**Acceptance**:
- Per-token token-bucket (key: `tokenId`).
- Default: 60 requests/minute; configurable via `MCP_RATE_LIMIT_PER_MINUTE`.
- Burst: 10 requests/second before throttling.
- Throttled: 429 + `Retry-After: <seconds>` header + body `{error: "rate-limited", retryAfterSec}`.
- Audit row written with `outcome: throttled`.

### T007 — Audit middleware

**Target files**: `mcp-server/src/middleware/audit.ts`
**Spec refs**: FR-008
**Acceptance**:
- Writes one `mcprequestaudit` row per request (except `/health`).
- Write is async; handler returns before commit completes.
- Captures `requestid`, `tokenid`, `customerid`, `projectid`, `tool`, `methodpath`, `durationms`, `outcome`, `errorcode`, `responsestatus`, `clientip`, `useragent`.
- Handler overhead 95th percentile ≤ 50ms (verified by test fixture).

### T008 — Security headers middleware

**Target files**: `mcp-server/src/middleware/security-headers.ts`
**Spec refs**: FR-013
**Acceptance**:
- Sets `Strict-Transport-Security: max-age=31536000; includeSubDomains`.
- Sets `X-Content-Type-Options: nosniff`.
- Sets `Referrer-Policy: no-referrer`.
- CORS: deny by default; `Origin` ignored for server-to-server `/call` route.

### T009 — Scoped query wrapper

**Target files**: `mcp-server/src/db/scoped-query.ts`
**Spec refs**: FR-004
**Acceptance**:
- Wraps Drizzle query builders (select/insert/update/delete).
- Refuses to issue a query without a `projectid` filter when the table has one.
- Refuses cross-customer joins.
- Returns 403 `{error: "scope-violation"}` and writes `mcprequestaudit` row with `outcome: scope-violation` on attempted escape.
- Single chokepoint — direct `db.*` calls outside this module are forbidden (CI check in T011).

### T010 — Migrate handlers to scoped-query

**Target files**: `mcp-server/src/server.ts` (every tool handler)
**Spec refs**: FR-004
**Acceptance**:
- Every existing handler refactored to use the scoped wrapper.
- Manual smoke: each tool still functions against a real token.
- CI grep test passes (no direct `db.select/insert/update/delete` outside `scoped-query.ts`).

### T011 — Wire middlewares + CI scope-check

**Target files**: `mcp-server/src/index-http.ts`, `mcp-server/scripts/check-no-direct-db.sh`
**Acceptance**:
- Middleware chain (in order): security-headers → audit (timing-only at this point) → rate-limit → auth → audit (outcome write).
- Skipped for `/health` (no auth, no audit).
- CI script greps `mcp-server/src/server.ts` for direct `db.select/insert/update/delete`; build fails on any match outside `scoped-query.ts`.

### T012 — MCP middleware unit tests

**Target files**: `mcp-server/tests/middleware/{auth,rate-limit,audit,scoped-query}.test.ts`
**Acceptance**:
- Auth: missing / invalid / revoked / expired / valid paths, plus `MCP_AUTH_REQUIRED=false` bypass.
- Rate-limit: bucket exhaustion, refill, burst tolerance.
- Audit: row written for every outcome class; async confirmation.
- Scoped-query: rejects cross-scope; allows in-scope; cross-customer join blocked.

### T013 — Admin API for tokens

**Target files**: `src/server/routes/admin/tokens.ts`
**Spec refs**: HTTP API Contracts section, FR-010
**Acceptance**:
- 4 endpoints per the contracts table (POST, GET, POST-revoke, POST-rotate).
- All return the documented JSON shapes.
- POST issuance returns the raw token ONCE in the response; never persisted in plain form.
- POST-rotate creates the new token and schedules old-token revocation (default 7 days; `overlapDays` overridable).

### T014 — Admin role-check middleware

**Target files**: extends existing `src/server/middleware/role-check.ts` or similar
**Acceptance**:
- Requires authenticated wxKanban session + `COMPANY_ADMIN` role OR `PROJECT_OWNER` for the route's `:projectid`.
- Returns 403 on insufficient role.

### T015 — ProjectTokensPage UI

**Target files**: `src/client/pages/admin/ProjectTokensPage.tsx`
**Spec refs**: FR-010
**Acceptance**:
- Lists active + revoked + expired tokens with prefix, name, issued-by, issued-at, last-used-at.
- "Issue token" form (name input + optional expiry); on success shows the raw token ONCE in a modal.
- "Revoke" action with confirmation.
- "Rotate" action with `overlapDays` input; shows new token ONCE.
- Only renders for users with admin role (link hidden otherwise).

### T016 — Token-display-once modal

**Target files**: `src/client/components/admin/TokenDisplayModal.tsx`
**Acceptance**:
- Modal shows the raw token with a copy-to-clipboard button.
- Confirmation checkbox: "I have copied this token to a secure location."
- Closing the modal removes the token from React state; no re-display path.
- Browser console / network tab show the token in the response ONLY at issue/rotate time.

### T017 — Admin API + UI tests

**Target files**: `tests/integration/admin-tokens.test.ts`, `tests/unit/ProjectTokensPage.test.tsx`
**Acceptance**:
- API: each endpoint returns the documented shape; role-check rejects non-admin; rotate flow verified.
- UI: modal renders raw token; copy-to-clipboard works; closing modal clears state.

### T018 — `mcp-client.ts`

**Target files**: `wxkanban-agent/core/http/mcp-client.ts`
**Spec refs**: FR-005, new modules table
**Acceptance**:
- Single HTTP client used by every kit call into MCP.
- Reads token via the FR-005 precedence (env → `kit` block → `.wxkanban-project.json` legacy).
- Adds `Authorization: Bearer <token>` to every request.
- On 429: reads `Retry-After`, surfaces a one-line WARN, retries once after the indicated delay.
- On 5xx: surfaces the documented error message (including the `/health` curl suggestion); does NOT auto-retry.
- On missing token + `https://` base URL: fails fast with the FR-005 error string.

### T019 — Extend `resolveServiceUrl`

**Target files**: `wxkanban-agent/core/context/runtime-state.ts`
**Spec refs**: spec 027 FR-008 extension; spec 028 Consumer-side Configuration
**Acceptance**:
- New precedence: runtime-state file → `.wxai/project.json` `kit.mcpBaseUrl` → env var → default.
- Unit tests cover the new tier.

### T020 — `kit:configure` command

**Target files**: `wxkanban-agent/core/orchestrator/command-handlers/kit-configure.ts`
**Spec refs**: FR-006
**Acceptance**:
- Accepts `--token`, `--project-id`, `--mcp-url` (default `https://mcp.wxperts.com`), `--write-to .env|.wxai`.
- Atomic write (tmp + rename) to the chosen destination.
- Token never echoed in full; only first 4 + last 4 chars.
- Validates token format (`wxk_(live|test)_[a-f0-9]{64}`); rejects malformed.
- Exit codes per spec: 0/1/2.

### T021 — `buildscope-worker.ts` refactor

**Target files**: `wxkanban-agent/workers/ai/buildscope-worker.ts`
**Acceptance**:
- Replaces direct `fetch(${mcpUrl}/call, ...)` with `mcpClient.callTool(...)`.
- Behavior unchanged on the happy path.
- Existing buildscope tests still pass.

### T022 — `lifecycle-client.ts` refactor

**Target files**: `wxkanban-agent/services/lifecycle-api/lifecycle-client.ts`
**Acceptance**:
- Same pattern as T021.
- Removes the now-unused `fetch` import + inline URL construction.

### T023 — `verify-install.ts` hosted-MCP steps

**Target files**: `wxkanban-agent/scripts/verify-install.ts`
**Spec refs**: FR-012
**Acceptance**:
- New step `hosted-mcp-reachable`: HTTPS GET `${MCP_BASE_URL}/health`, expect 200, parse `{status, version}`.
- New step `token-valid`: POST `/call` with sentinel `{tool: "project.help", args: {}}` + configured token; expect 200.
- Existing local-MCP steps become conditional (only run when `MCP_BASE_URL` is `http://localhost:*`).

### T024 — mcp-client + kit-configure tests

**Target files**: `wxkanban-agent/tests/unit/mcp-client.test.ts`, `wxkanban-agent/tests/unit/kit-configure.test.ts`, `wxkanban-agent/tests/integration/hosted-mcp-roundtrip.test.ts`
**Acceptance**:
- mcp-client unit: 429-retry, 5xx error path, missing-token failure, token-precedence resolution.
- kit-configure unit: atomic write, token redaction in stdout, malformed-token rejection.
- Integration: end-to-end against a mock MCP server (no real network).

### T025 — `setup-mcp.mjs` deprecation

**Target files**: `scripts/setup-mcp.mjs`
**Spec refs**: FR-011
**Acceptance**:
- Deprecation warning prints on every run.
- When `MCP_BASE_URL` starts with `https://`, the script exits 0 within 1s without spawning local MCP.
- Existing behavior preserved when `MCP_BASE_URL` is unset or `http://localhost:*`.

### T026 — `package.json` kit:start branching

**Target files**: `package.json`
**Acceptance**:
- `kit:start` invokes a new `scripts/kit-start.mjs` that checks for `kit` block / env var → routes to hosted (gateway only) or legacy (mcp + gateway) path.
- `kit:start:legacy` preserves the spec-027 `setup-mcp && setup-gateway` chain.
- `kit:start:mcp` and `kit:start:gateway` (from spec 027) continue to work for direct invocation.

### T027 — Migration guide

**Target files**: `wxkanban-agent/docs/hosted-mcp-migration.md`
**Acceptance**:
- Documents the v0.3.x → v0.4.0 upgrade path: install → admin mints token → `kit:configure` → remove `DATABASE_URL` from env.
- Includes a troubleshooting section keyed off the FR-005 + FR-011 error messages.

### T028 — Migration smoke test

**Target files**: `wxkanban-agent/tests/integration/migration-smoke.test.ts`
**Acceptance**:
- Simulates a v0.3.x consumer environment (no `kit` block, `DATABASE_URL` set, local MCP path).
- After running `kit:configure`, `kit:start` switches to hosted path; old MCP processes cleaned up via `kit-stop.mjs` (spec 027).

### T029 — `apprunner-mcp.yaml`

**Target files**: `apprunner-mcp.yaml` (repo root, sibling to `apprunner.yaml`)
**Spec refs**: Infra Contracts section
**Acceptance**:
- Source-code mode, Node 22, `npm install && npm run build`, run `node mcp-server/dist/index-http.js`, port 8080.
- Env block lists `NODE_ENV: production` only (placeholder; real env vars set in App Runner console per project memory).

### T030 — Provision App Runner services (operator task)

**Target files**: documented step in `infra/secrets-rotation-runbook.md` (T033) — manual AWS Console action
**Acceptance**:
- Production service: source = wxKanban GitHub repo, branch `main`, config file `apprunner-mcp.yaml`, tag-deploy mode.
- Staging service: same source, branch `main`, auto-deploy mode.
- Both services pointed at the production RDS Postgres (same DB; project scoping enforces isolation).
- Env vars set in console: `DATABASE_URL`, `MCP_HTTP_PORT=8080`, `MCP_AUTH_REQUIRED=true`, `MCP_RATE_LIMIT_PER_MINUTE=60`, `NODE_ENV=production`.
- ARNs captured in repo's `.env.example` (`MCP_PROD_ARN`, `MCP_STAGING_ARN`) for Makefile use.

### T031 — Route53 + ACM (operator task)

**Target files**: documented in `infra/secrets-rotation-runbook.md`
**Acceptance**:
- ACM SAN cert covering `mcp.wxperts.com` + `staging.mcp.wxperts.com`; DNS-validated; auto-renewed.
- Route53 A-records (App Runner aliases) for both names point at the corresponding App Runner services.
- HTTPS `curl https://mcp.wxperts.com/health` returns 200 from any IP.

### T032 — Makefile deploy targets

**Target files**: `Makefile`
**Acceptance**:
- `make deploy-mcp-staging` runs `aws apprunner start-deployment --service-arn $(MCP_STAGING_ARN)`.
- `make deploy-mcp-prod TAG=vX.Y.Z` checks the tag exists locally, then runs `aws apprunner start-deployment --service-arn $(MCP_PROD_ARN)`. Refuses without `TAG`.
- Both targets exit non-zero on AWS CLI failure.

### T033 — Secrets-rotation runbook

**Target files**: `infra/secrets-rotation-runbook.md`
**Acceptance**:
- Step-by-step DB credential rotation (App Runner console env update, expected downtime ≤ 0s due to App Runner deploy model).
- Token revocation procedure (admin UI; immediate effect).
- Rollback procedure for a bad MCP deploy (App Runner console: deployment history → previous version).

### T034 — `.gitignore.snippet` update

**Target files**: `wxkanban-agent/templates/.gitignore.snippet`
**Acceptance**:
- Adds `.wxai/project.json` (the `kit` block now contains a secret token).
- Documents the v0.4.0 reason for the new entry.

### T035 — `docs/hosted-mcp.md`

**Target files**: `wxkanban-agent/docs/hosted-mcp.md`
**Acceptance**:
- Configuration walkthrough (`kit:configure` + env-var alternative).
- Auth reference (token format, where to mint, how to rotate).
- Error code reference (one entry per documented HTTP API Contracts row).
- Rate-limit explanation + how to request a higher tier (out-of-band for v1: contact admin).
- Deployment + rollback walkthrough cross-referencing `infra/secrets-rotation-runbook.md`.

### T036 — README + CHANGELOG + version bump

**Target files**: `wxkanban-agent/README.md`, `wxkanban-agent/CHANGELOG.md`, `wxkanban-agent/package.json`
**Acceptance**:
- README "Setup" section now leads with hosted MCP; local MCP becomes the "self-hosted (legacy)" path.
- CHANGELOG v0.4.0 entry covers every FR + migration notes.
- `package.json` version → `0.4.0`.

### T037 — QT-1 integration test

**Target files**: `wxkanban-agent/tests/integration/spec028-qt1.test.ts`
**Acceptance**:
- Uses a mock-or-staging MCP server (decision in test infra).
- Roundtrip: `kit:configure` writes config → `verify-install` passes → simulated `implement` call hits MCP with Bearer token.

### T038 — QT-2 integration test

**Target files**: `wxkanban-agent/tests/integration/spec028-qt2.test.ts`
**Acceptance**:
- With `MCP_BASE_URL=https://...` set, `setup-mcp.mjs` exits 0 in ≤ 1s without spawning.
- With it unset, legacy spawn path still works (uses spec-027 lifecycle).

### T039 — QT-3 integration test

**Target files**: `tests/integration/admin-tokens-flow.test.ts`
**Acceptance**:
- Full admin flow: login as admin → POST issue → token returned once → GET list → revoke → confirm 401 on next call.
- Rotate: new token issued, old token's `revokedat` scheduled 7 days out.

### T040 — QT-4 integration test

**Target files**: `mcp-server/tests/integration/auth-error-paths.test.ts`
**Acceptance**:
- Missing token → 401 + correct body.
- Invalid token (random string) → 401.
- Revoked token → 401.
- Expired token → 401.
- All cases logged to `mcprequestaudit` with `outcome: auth-failed`.

### T041 — QT-5 integration test

**Target files**: `mcp-server/tests/integration/scope-violation.test.ts`
**Acceptance**:
- Token scoped to project A; call with `args.projectId = B` → 403 + `{error: "scope-violation"}`.
- Audit row written with `outcome: scope-violation`, `errorcode: cross-project`.
- No DB row from project B was read or written (verified by row-count diff).

### T042 — QT-6 integration test

**Target files**: `mcp-server/tests/integration/rate-limit.test.ts`
**Acceptance**:
- 60 successful requests in 60s → 61st returns 429.
- `Retry-After` header present and matches body's `retryAfterSec`.
- mcp-client (kit side) honors `Retry-After`; second test call after wait succeeds.

### T043 — QT-7 integration test

**Target files**: `wxkanban-agent/tests/integration/hosted-mcp-5xx.test.ts`
**Acceptance**:
- Mock MCP returns 503 with documented body.
- Kit's mcp-client surfaces the FR-005 error message (including `/health` curl suggestion).
- Kit does NOT auto-retry 5xx (verified by request count).

### T044 — QT-8 integration test

**Target files**: documented as a manual smoke in `infra/secrets-rotation-runbook.md`
**Acceptance**:
- Operator deploys to staging, hits `/health`, sees new git sha.
- Runs `wxkanban-agent verify --mcp https://staging.mcp.wxperts.com` — passes.
- Rolls back via App Runner console; `/health` flips back to previous sha.

### T045 — Dogfood reconfigure

**Target files**: this repo's `.wxai/project.json`
**Acceptance**:
- `kit:configure --mcp-url https://staging.mcp.wxperts.com --token wxk_test_... --project-id <this-repo's-id>`.
- One sprint of `implement` calls (spec 028 tasks themselves) hit staging.
- Manual confirmation in audit log.

### T046 — Verify clean audit track record

**Target files**: query against `mcprequestaudit` (no code; verification task)
**Acceptance**:
- After T045 sprint, `SELECT outcome, count(*) FROM mcprequestaudit WHERE projectid = '<this-repo>' GROUP BY outcome` shows `success` dominates; no `scope-violation`; no unexpected `error`.

### T047 — Lifecycle close

**Target files**: `specs/028-HostedMCPDeployment/lifecycle.json`, `specs/projectlifecycle.md`
**Acceptance**:
- All A-1 through A-13 verified.
- `lifecycle.json` phase flipped to `released`.
- `projectlifecycle.md` regenerated with updated phase distribution charts.
- `projectdocuments` row for `lifecycle` doctype upserted per CLAUDE.md convention.

---

## Phase 10 — v1.1.0 Kit Cutover (Consumer-Side MCP Removal)

Added 2026-05-20 to execute the spec 019 update (Decisions #1/#2/#3, R14, R15, R17). Closes BUG-20 follow-up by removing the consumer-side `pg.Pool` path entirely. The hosted MCP itself (Phases 1–8) is unchanged.

### T048 — Flip `KIT_DOWNLOAD_SOURCE` default to `orchestrator`

**Target files**: `src/server/routes/kitRoutes.ts` (line 288 feature-flag branch), App Runner env var
**Spec refs**: 019 R14 AC#6 (bake gate)
**Acceptance**:
- 7 consecutive days of clean staging traffic on `KIT_DOWNLOAD_SOURCE=orchestrator` (zero `kit proxy failure` warns in logs, zero `X-Kit-Source: legacy-db` requests in audit).
- Production env var flipped to `orchestrator` in App Runner console (`reference_apprunner_env_vars` memory).
- `X-Kit-Source` response header now reports `orchestrator-proxy` instead of `legacy-db` for new downloads.
- Rollback: flip the env var back; no code change needed.

### T049 — Rebuild orchestrator kit archive without `mcp-server/`

**Target files**: `Cowboy-59/wxKanban-agent-Orchestrator` repo release pipeline; `wxkanban-agent/package.json` (drop `pg`, `drizzle-orm` if present)
**Spec refs**: 019 Decision #1, R14 AC#4, R14 AC#7 (dogfood)
**Acceptance**:
- The archive published as `v1.1.0` contains NO `mcp-server/` directory.
- The archive's `package.json` does NOT depend on `pg` or `drizzle-orm`.
- `kit.tar.gz` + `kit.zip` + `.sha256` sidecars published to the GitHub release.
- Archive size shrinks (current v0.1.0 was 5.5 MB / 8.6 MB with bundled MCP; expect ~50% reduction).

### T050 — Update KitGenerationService env+settings generation

**Target files**: `src/server/services/KitGenerationService.ts`
**Spec refs**: 019 Decision #3, R14 AC#4, R14 Implementation step 3
**Acceptance**:
- `generateEnvFile()` emits `WXKANBAN_MCP_BASE_URL`+`WXKANBAN_API_TOKEN`+`WXKANBAN_PROJECT_ID`; removes `DATABASE_URL_ENCRYPTED` line.
- `generateAiSettings()` removes the `DATABASE_URL_ENCRYPTED` field from the `mcpServers.wxkanban.env` block; adds `WXKANBAN_MCP_BASE_URL`.
- The `EMBEDDED_DATABASE_URL` patch block at lines 334-354 is removed.
- `KitEncryptionService` import removed (no longer used by this file).
- All existing kit-download tests pass with new env shape.

### T051 — Delete KitGenerationService + KitEncryptionService after bake

**Target files**: `src/server/services/KitGenerationService.ts`, `src/server/services/KitEncryptionService.ts`, `src/server/routes/kitRoutes.ts` (cleanup unused imports + legacy branch)
**Spec refs**: 019 R14 AC#6
**Acceptance**:
- After 7 days of clean `orchestrator`-source downloads (T048 baked), both files deleted in a single PR.
- All references in `kitRoutes.ts` removed; the legacy `if (KIT_DOWNLOAD_SOURCE !== 'orchestrator')` branch deleted.
- `KIT_DOWNLOAD_SOURCE` env var removed from App Runner.
- TypeScript compile clean; no dead imports.

### T052 — Drop projectkits + projectkitfiles tables

**Target files**: new Drizzle migration `src/db/migrations/0022_spec028_drop_legacy_kit_tables.sql`
**Spec refs**: 019 R14 Implementation §"DB schema"
**Acceptance**:
- Migration runs after T051 merges (separate PR for rollback safety per R14 risk #4).
- Drops `projectkitfiles` first (FK), then `projectkits`.
- Schema for both tables removed from `src/db/schema/`.
- Applied via spec-026 `apply-*` pattern (`scripts/apply-spec028-kit-tables-drop.ts`).

### T053 — Extend UPGRADE_STRIP for mcp-server defense

**Target files**: `src/server/services/KitProxyService.ts` (UPGRADE_STRIP_FILES constant near line 93)
**Spec refs**: 019 R15 AC#2
**Acceptance**:
- `UPGRADE_STRIP_FILES` (or equivalent glob list) includes `mcp-server/**` so any archive that accidentally still contains it gets stripped server-side during upgrade.
- Unit test asserts that an upgrade archive seeded with a stray `mcp-server/` directory is empty of that directory after `serveUpgrade()`.

### T054 — `upgrade-kit.mjs` v1.1.0 cutover step

**Target files**: kit-shipped `scripts/upgrade-kit.mjs` (in the orchestrator repo)
**Spec refs**: 019 R15 AC#5
**Acceptance**:
- If `fromVersion < 1.1.0`, the script stops `.mcp-server.pid`'s process, then deletes `mcp-server/`, `scripts/setup-mcp.mjs`, `scripts/mcp-health-check.mjs`, `.mcp-server.pid`.
- After extract, writes `mcpBaseUrl: "https://mcp.wxperts.com"` into `.wxkanban-project.json` if absent.
- Final summary prints `file count removed (legacy cleanup): N`.
- Skipped entirely when `fromVersion >= 1.1.0` (no-op).

### T055 — CI guard: forbid `pg`/`drizzle-orm` in kit

**Target files**: new `wxkanban-agent/scripts/check-no-pg-in-kit.sh` (or extend `mcp-server/scripts/check-no-direct-db.sh`); wire into kit-build CI
**Spec refs**: 019 R14 §risk; BUG-20 follow-up §"Resolution path" item 5
**Acceptance**:
- Script fails (exit 1) if any of: (a) `package.json` in kit archive depends on `pg`, (b) `package.json` depends on `drizzle-orm`, (c) kit archive contains a file path matching `mcp-server/src/db/connection.ts`.
- Wired into the orchestrator release CI so a future regression that re-bundles `mcp-server/` is caught before publish.

### T056 — Consumer-machine smoke verification

**Target files**: `wxkanban-agent/tests/manual/consumer-no-db-route.md` (runbook); operator-executed
**Spec refs**: 019 R3 AC#4; BUG-20 follow-up §"Reproduction" inverse
**Acceptance**:
- Clean Windows VM (no NAT/VPN route to wxKanban Postgres) provisioned.
- Downloads v1.1.0 kit via `GET /api/projects/:id/kit/download`.
- Extracts; runs `node scripts/init.mjs` → exits 0; no `[startup.db.check.fail]` in stderr.
- Runs `wxkanban-agent buildscope --feature-description "smoke test" --dry-run` → round-trips through `mcp.wxperts.com`; returns valid `ScopeDraft` JSON.
- `mcprequestaudit` row visible with `outcome: success`, `tool: project.buildscope`.

### T057 — Spec 011 NewProject AI Settings template

**Target files**: `specs/011-NewProjectProvisioning/spec.md` (AI Settings template subsection)
**Spec refs**: 019 R17 AC#6
**Acceptance**:
- Template's `mcpServers.wxkanban.env` block replaced: was `MCP_HTTP_PORT`+`API_KEY`+`DATABASE_URL` (plaintext); now `WXKANBAN_MCP_BASE_URL`+`WXKANBAN_API_TOKEN`+`WXKANBAN_PROJECT_ID`.
- `mcpServers.wxkanban.url` (or equivalent) set to `https://mcp.wxperts.com`.
- Cross-reference to spec 028 FR-003 (auth) and spec 019 R3 (client contract) added.

### T058 — Close BUG-20 follow-up bug report

**Target files**: `specs/019-agent-orchestrator-kit/bug-reports/2026-05-20-bug-20-followup.md`
**Spec refs**: BUG-20 follow-up §"Asks #2"
**Acceptance**:
- Status changed from `open` to `resolved`.
- New "Resolution" section added linking PRs that merged T048, T049, T050, T051, T053, T054, T055, and T056.
- Resolution section confirms a fresh kit download on a no-DB-route Windows machine completes `init.mjs` and a `buildscope` round-trip successfully.
