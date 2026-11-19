# Plan: Hosted MCP Deployment — Eliminate Consumer DB Port Requirement

**Spec Number**: 028
**Date**: 2026-05-13

## Implementation Plan

### Phase 1 — DB Schema (T001–T004)
Two new tables (`mcpapitokens`, `mcprequestaudit`) on the existing wxKanban Postgres. Migration applied via the spec-026 `apply-*` script pattern. Nothing else can land until tokens have a place to live.

### Phase 2 — MCP Middlewares + Scoped Query (T005–T012)
Four middlewares (auth, rate-limit, audit, security-headers) plus the `scoped-query.ts` wrapper that becomes the only legal path to the DB from tool handlers. T010 migrates every handler in `mcp-server/src/server.ts` — a one-time refactor. T011 wires the stack and adds the CI grep gate.

### Phase 3 — Admin Token Surface (T013–T017)
API endpoints + role-check + React page for issuing, listing, revoking, rotating tokens. Token shown ONCE; never re-displayed. Runs in parallel with Phase 2 (different codebase).

### Phase 4 — Kit Consumer Client (T018–T024)
`mcp-client.ts` becomes the single Bearer-aware HTTP client for everything the kit does against MCP. `kit:configure` writes the three required fields. Refactors `buildscope-worker` and `lifecycle-client` to route through the new client. `verify-install` gains the hosted-MCP-reachable + token-valid steps.

### Phase 5 — Deprecation Path (T025–T028)
`setup-mcp.mjs` warns + early-exits when hosted is configured. `kit:start` branches between hosted (gateway only) and legacy (mcp + gateway). Migration guide for v0.3.x consumers. Smoke test proves zero-code-change upgrade.

### Phase 6 — Infra & Deployment (T029–T033)
`apprunner-mcp.yaml` declares the service shape (matches existing wxKanban pattern). T030 + T031 are manual AWS operator tasks (App Runner provisioning + Route53 + ACM); documented in T033's runbook. Makefile deploy targets are thin wrappers around `aws apprunner start-deployment`.

### Phase 7 — Templates, Docs, Version Bump (T034–T036)
`.gitignore.snippet` adds `.wxai/project.json` (the `kit` block now holds a secret). `docs/hosted-mcp.md` full reference. README leads with hosted as the primary install path. CHANGELOG v0.4.0 + package.json version bump.

### Phase 8 — QT Integration Tests (T037–T044)
QT-1 through QT-8 mapping 1:1 to user scenarios. Run alongside corresponding feature phases as they land. T044 (deploy + rollback rehearsal) needs Phase 6 complete.

### Phase 9 — Dogfood (T045–T046)
Reconfigure this repo to use `staging.mcp.wxperts.com`. Verify `mcprequestaudit` shows a clean track record after one sprint of `implement` calls.

### Phase 10 — Lifecycle Close (T047)
AC verification, lifecycle.json flip to `released`, projectlifecycle.md regen.

## Critical Path

T001–T004 → T005–T011 → T018–T020 → T029 → T030–T031 (manual ops) → T032 → T036 → T045 → T047.

Phase 3 (admin tokens), Phase 4 (kit client), Phase 5 (deprecation), Phase 7 (docs), Phase 8 (tests) hang off the critical path but don't extend it provided the corresponding earlier phases are done.

## Known Issues

### Issue P-1 — Manual operator tasks in Phase 6
T030 (App Runner provisioning), T031 (Route53 + ACM cert) are AWS Console operations, not code. They block Phase 8 QT-8 (deploy rehearsal) and Phase 9 (dogfood). The runbook (T033) ships first so the operator can execute these confidently. If the operator can't action them, the spec stalls at T030 — no code workaround.

### Issue P-2 — `MCP_AUTH_REQUIRED=false` is a production foot-gun
The auth middleware (T005) bypasses entirely when `MCP_AUTH_REQUIRED=false`. This is intentional for local dev (US9) but must NEVER be set in the production App Runner console. Mitigation: a deployment policy check (CI grep + the AWS console env-var review during T030) refuses to merge a config that sets it false in prod. Documented in T033's runbook.

### Issue P-3 — In-memory rate-limit doesn't scale past min=1 instance
App Runner instances are 1 vCPU / 2 GB / min=1 / max=5. Per-token rate-limit lives in process memory; at max-scale a token could legitimately get 5× its nominal limit before any single instance starts throttling. Acceptable at v1 (App Runner won't auto-scale up unless traffic justifies it). Revisit with Redis-backed limit if min ≥ 2 ever becomes the steady state. Tracked in Out-of-Band Issues.

### Issue P-4 — Audit-table volume at scale
Every authenticated request writes one row. At 60 req/min per token, 100 tokens, sustained = 360k rows/hour. 90-day retention = ~780M rows. Index plan is sound but eventually needs S3 archival (out of scope; tracked). Risk window: ~6 months at expected growth.

### Issue P-5 — Token leak via committed `.wxai/project.json`
The `kit` block holds a secret. T034 adds the file to `.gitignore.snippet`, but customers might commit it before applying the template. Mitigation: token prefix `wxk_live_*` lets GitHub / GitLab / AWS Secrets Manager secret scanners catch leaks; admin UI surfaces unusual `lastusedat` patterns; rotation is one-click.

### Issue P-6 — Single-region single point of failure
App Runner in one AWS region. Outage of that region takes down all consumers. v1 SLA target: 99.5%. Multi-region failover deferred. Document in `infra/secrets-rotation-runbook.md` and call out in README.

### Issue P-7 — Existing mcp-server tests have pre-existing DB-env failures
3 tests in `mcp-server/tests/` currently fail because they need a real `DATABASE_URL`. Spec 027's `kit-hygiene.test.ts` (which we added) passes (15/15). These pre-existing failures are not a regression introduced by spec 028 but they may obscure new failures during Phase 2 — mitigate by running only the new test files during dev, and fixing the DB-env tests separately.

## Dependencies on Other Specs

- **Spec 019** — Orchestrator Kit (consumer-side gateway, CLI).
- **Spec 026** — Code Fencing. Every new module fenced via `implement 028/T<...>`. CI's `auditfences --strict` gates the PR.
- **Spec 027** — Kit Runtime Hygiene. `resolveServiceUrl` precedence extended (not replaced) by the `kit` block. `kit-stop.mjs` handles cleanup of legacy MCP processes during migration.

## Out-of-Band Issues to Track Separately

- **`setup-mcp.mjs` removal** scheduled for kit v0.5.0 (placeholder spec needed once 028 ships).
- **`mcprequestaudit` S3 archival** — separate operational spec; needed before ~6 months of audit volume.
- **Per-tool authorization (scoped tokens)** — follow-on; adds token-scope column + middleware check.
- **Redis-backed rate limit** — needed when App Runner min-instances increases above 1.
- **Dedicated `status.wxperts.com`** — resolved during buildscope by pointing consumers at the `/health` endpoint; a real status page (Statuspage / Uptime Kuma) is a follow-on if outage-communication needs grow.
- **Self-hosted MCP appliance** — explicitly out of scope; if customer demand surfaces, becomes its own spec.
