# wxKanban — Secrets, Tokens, and Rollback Runbook (Spec 028 / T033)

Operator procedures for credential rotation across the whole system: the main
app (`wxkanban.wxperts.com`), the hosted MCP service (`mcp.wxperts.com`), the
marketing Lambda, and CI. Complements the IaC under [./README.md](./README.md).

> **Region is `us-east-2`.** Verified 2026-08-13: `aws apprunner list-services
> --region us-east-1` returns **zero** services. Earlier revisions of this file
> showed `us-east-1` ARNs; that was wrong and would send an operator looking at
> an empty console.
>
> **Live App Runner services are `wxKanban`, `wxkanban-mcp-prod`, `ebusiness`.**
> `wxkanban-mcp-staging` **no longer exists** — earlier revisions told you to
> update it. There is no staging environment to validate a rotation in.

Read [§7 Pre-flight](#7-pre-flight--read-before-rotating-anything) before
rotating anything.

---

## 1. RDS Postgres credential rotation

Symptom: scheduled rotation, suspected leak, or App Runner reports
`DATABASE_URL` auth failures.

> **There are FIVE consumers, not two.** Earlier revisions of this section
> listed only the two MCP services. Following it as written strands the main
> app, the marketing Lambda, and CI on a dead credential. All five must be
> updated before the old credential is retired.

**Note there are two distinct Postgres roles.** The app runs as `wxkanban_app`
(`DATABASE_URL`); CI runs as `wxkanban_ci_readonly`
(`SCHEMA_DRIFT_DATABASE_URL`). They rotate independently — rotating one does
not require rotating the other. Role/password DDL:
[../docs/db-analysis/h9-least-privilege-role.sql](../docs/db-analysis/h9-least-privilege-role.sql).

1. **Mint the replacement credential** in RDS console (or via `aws rds
   modify-db-instance --master-user-password ...` if rotating the master).
   Capture the new connection string.
2. **Update every consumer.** Do not retire the old credential until all are
   done.

   | # | Consumer | How to update |
   | --- | --- | --- |
   | 1 | App Runner `wxKanban` (main app) | Console → Configuration → Edit. **Env is `ConfigurationSource: API`** — no file in this repo lists it. Read current values first with `aws apprunner describe-service`; `update-service` **REPLACES the whole env map**, so a partial write silently wipes `JWT_SECRET`, `STRIPE_API_KEY`, etc. |
   | 2 | App Runner `wxkanban-mcp-prod` | Same. Also managed by `infra/apprunner.tf` → `terraform.tfvars` (gitignored). |
   | 3 | Marketing Lambda `wxkanban-beta-intake` | `aws lambda update-function-configuration --environment ...` — see [../marketing/site/deploy/DEPLOY-aws.md](../marketing/site/deploy/DEPLOY-aws.md). Built from the repo `.env` by `build-lambda-env.mjs`. |
   | 4 | GitHub repo secret `SCHEMA_DRIFT_DATABASE_URL` | Only if rotating the CI role. Consumed by `.github/workflows/auditfences.yml`. |
   | 5 | Local `.env` | Developer machines. **Currently points at PRODUCTION** — see [§7](#7-pre-flight--read-before-rotating-anything). |

3. **Wait for healthy state.** Each App Runner service has min=1; the
   replacement task starts before the old one is torn down. Expected
   user-visible downtime: **0 s**. Watch for `Service became healthy`.
4. **Verify all five**, not just the MCP:

   ```bash
   curl -fsS https://mcp.wxperts.com/health | jq      # {"status":"ok","dbConnected":true,...}
   curl -fsS https://wxkanban.wxperts.com/health | jq
   aws apprunner list-services --profile Andy --region us-east-2 \
     --query 'ServiceSummaryList[].[ServiceName,Status]' --output text
   ```

   Then exercise the marketing Lambda and re-run the CI workflow.
5. **Retire the old credential** in RDS only once every consumer is healthy.

**Restart is mandatory, not optional.** The app builds three separate
connection pools plus a long-lived LISTEN/NOTIFY connection at module load
(`src/server/db/client.ts`, `src/server/lib/db.ts`, `src/db/client.ts`,
`src/server/lib/pgNotifyListener.ts`). An env change without a restart has no
effect. A malformed URL calls `process.exit(1)` rather than degrading.

If the new credential is wrong, the deploy fails and App Runner keeps the old
task serving. Roll back by reverting the env var; no DB action required.

---

## 2. API token revocation

Symptom: user reports a leaked `WXKANBAN_API_TOKEN`, or an admin needs to
deprovision a consumer.

> **⚠️ There is currently NO working supported revocation path.** Every route
> this section previously documented has been removed or broken:
>
> - The **Admin UI tile was deleted** (spec 028 Phase 11, 2026-05-23) — see the
>   comment at `src/client/components/Dashboard/DashboardProjectGrid.tsx:339`.
> - The **MCP tools** `project_create_api_token` / `project_revoke_api_token`
>   issue SQL against table `apitokens`, which migration
>   `src/db/migrations/0022_spec028_unify_tokens.sql` **dropped**. They throw
>   `relation "apitokens" does not exist` at runtime. The `create` handler also
>   passes no `projectId`, so it could not mint an acceptable token anyway.
> - `ApiTokenService.listProjectTokens` / `.revokeToken` exist but have **zero
>   callers**.
>
> Until those are fixed, revocation is a manual database operation.

### Manual revocation (the only working path today)

The auth middleware reads `revokedat` from `mcpapitokens` on **every** request
(see [mcp-server/src/middleware/auth.ts](../mcp-server/src/middleware/auth.ts)),
so an `UPDATE` takes effect on the next call with no deploy and no cache wait.

Identify the token by its `tokenprefix` — the 12-char prefix a user can quote
safely — then:

```sql
-- Revoke ONE token, identified by the prefix the user reported
UPDATE mcpapitokens SET revokedat = now()
WHERE tokenprefix = '<prefix>' AND revokedat IS NULL;

-- Revoke ALL tokens for a project (suspected mass leak)
UPDATE mcpapitokens SET revokedat = now()
WHERE projectid = '<project-uuid>' AND revokedat IS NULL;
```

Verify: the next request carrying that token returns `401 invalid-token` and
writes an `mcprequestaudit` row with `outcome=auth-failed`.

### Minting a replacement

The only working mint path is the **kit-download flow**, which issues a fresh
token and returns it in the `X-API-Token` header
(`src/server/routes/kitRoutes.ts`). Communicate it over a secure channel
(1Password, Slack DM). Never email it.

### Two things that make this worse than it looks

- **Tokens never expire.** `createToken` never sets `expiresat`, so the
  `or(isNull(expiresat), ...)` branch always matches.
- **Minting does not revoke the predecessor.** Every historical kit download
  for a project left behind another still-valid credential. A genuine
  "rotate this project's token" therefore means the project-wide `UPDATE`
  above, not just issuing a new one.

### Sharp edge — the token is also an encryption key

`WXKANBAN_API_TOKEN` is the AES-256-GCM key for `DATABASE_URL_ENCRYPTED`
(`mcp-server/src/config.ts`, `mcp-server/src/utils/embedded-crypto.ts`, via
`scryptSync(apiToken, 'wxkanban-kit-salt', 32)`). Rotating the token makes any
embedded encrypted DB URL **undecryptable** unless it is re-encrypted in the
same operation. `ai-settings.json` carries such a blob.

### Consumers to update after rotating a token

Resolution precedence is `.wxai/project.json` → `.env` → legacy
`.wxkanban-project.json`.

| Location | Notes |
| --- | --- |
| `.wxai/project.json` (`kit.apiToken`) + root `.env` | Both written atomically by `wxkanban-agent kit:configure --token <new>` |
| `ai-settings.json` | **git-tracked** — carries a token and a `DATABASE_URL_ENCRYPTED` blob keyed to it |
| VS Code SecretStorage `wxkanban.apiToken:<projectId>` | **Fails stickily.** SecretStorage wins once seeded; updating `.env` alone will NOT fix the extension until `clearToken` runs |
| Per-AI-tool MCP config copies | `.claude/settings.json`, `.cursor/mcp.json`, `_wxAI-global/settings.json` if the `mcpServers` block was copied |

---

## 3. Rolling back a bad MCP deploy

Symptom: a deploy passes App Runner's health check but breaks a tool in
production (e.g. handler regression, schema mismatch).

1. **AWS Console → App Runner → `mcp-prod` → Deployments tab.**
2. **Identify the last-known-good deployment** (the one before the bad
   release tag).
3. **Click "Redeploy"** on that row. App Runner re-runs the build at the
   previous commit and replaces the running task on success.
4. **Verify** with `curl https://mcp.wxperts.com/health` — `version` field
   should match the previous release.
5. **Open a hotfix branch** off the last-known-good tag, land the
   correction, retag, and `make deploy-mcp-prod TAG=vX.Y.Z` to re-roll
   forward.

App Runner retains deployment history; there is no manual rollback
artifact to manage.

> **There is no staging service any more.** `wxkanban-mcp-staging` was
> removed; `make deploy-mcp-staging` targets nothing. The previous guidance
> here — rebuild staging from `main`, force-push a `staging-rollback` branch —
> no longer applies. **Every MCP deploy and every rotation lands directly in
> production with no rehearsal environment.** Roll forward via the hotfix path
> above, or roll back through App Runner's deployment history.

---

## 4. Captured ARNs (for the Makefile)

Capture the App Runner ARNs in `.env` (NOT committed). Region is
**`us-east-2`** — earlier revisions of this file showed `us-east-1`, which
resolves to nothing:

```bash
MCP_PROD_ARN=arn:aws:apprunner:us-east-2:<account>:service/wxkanban-mcp-prod/...
```

Resolve the live ARN rather than copying a stale one:

```bash
aws apprunner list-services --profile Andy --region us-east-2 \
  --query 'ServiceSummaryList[].[ServiceName,ServiceArn]' --output text
```

`make deploy-mcp-prod TAG=vX.Y.Z` reads that variable via the Makefile's
`include .env` directive. `make deploy-mcp-staging` targets a service that no
longer exists.

---

## 5. Application secret rotation

Everything below was disclosed and is in scope for rotation. The secrets are
**not** homogeneous — a flat "rotate them all" list is how this goes wrong, so
they are sorted by blast radius. Work top-down and verify between tiers.

### Tier 1 — rotate freely (no restart, no rebuild)

All read per-call, so a new value takes effect immediately.

| Secret | Consumers | Verify |
| --- | --- | --- |
| `GEMINI_API_KEY` | main app (LLM provider, embeddings, image provider), **MCP server**, kit | Trigger an embedding or AI call |
| `GROQ_API_KEY` | main app, **MCP server** (feedback triage), kit | Trigger feedback triage |
| `STRIPE_PUBLISHABLE_KEY` | 4 server sites, all per-request | Load the payment form |
| `TRELLO_API_SECRET` | `src/server/lib/oauth.ts` | Trello OAuth connect |

`STRIPE_PUBLISHABLE_KEY` is fetched by the client from the server at runtime —
there is **no `VITE_STRIPE_*` build-time variable**, so no frontend rebuild is
needed.

### Tier 2 — rotate, then RESTART (the env change is inert until you do)

These are captured at module-import time. This is the most likely way a
rotation silently half-lands: the console shows the new value, and the running
process keeps using the old one.

| Secret | Why a restart is required | Rotation hazard |
| --- | --- | --- |
| `STRIPE_WEBHOOK_SECRET` | Snapshotted into a frozen config object at import; the verifier reads that snapshot, never `process.env` | **No dual-secret support exists**, so Stripe's 24h old+new overlap is unusable. Sequence: add new secret in Stripe → deploy/restart → verify → delete old. Webhooks signed with the other secret return 400; Stripe retries ~3 days, so they are delayed, not lost |
| `STRIPE_API_KEY` | Client memoized in a module-level variable, no invalidation path | — |
| `SMTP_PASS` / `SMTP_USER` / `SMTP_HOST` | Transporter memoized | **If `SMTP_HOST` is momentarily unset, `sendEmail` silently logs and returns success instead of throwing.** Mail is dropped with no error surfaced. Never leave the host blank mid-edit |
| `MONDAY_CLIENT_SECRET` | One import-time reader, two per-call readers | Without a restart the paths **disagree** — OAuth exchange fails on one and succeeds on the other |
| `DATABASE_URL` | Three connection pools + a LISTEN/NOTIFY connection, all at module load | See [§1](#1-rds-postgres-credential-rotation). Malformed URL → `process.exit(1)` |
| `ENCRYPTION_KEY` | Validated at import | **Must be EXACTLY 32 bytes** — see [§7](#7-pre-flight--read-before-rotating-anything). Only reaches `externalconnections.credentialsencrypted`, which nothing currently decrypts |

### Tier 3 — user-visible impact

| Secret | Impact |
| --- | --- |
| `JWT_SECRET` | **Instant, total logout.** Every session cookie fails verification on the next request. No grace period and no residual — every user signs in once more. Must be ≥32 chars or the API exits at boot |

**Collateral damage most people miss:** password-reset, email-verification, and
email-change links are JWTs signed with the same secret and are verified
*before* the DB row is consulted. Rotating kills every in-flight link. Expect a
support spike on "my reset link says invalid" for up to **24h** (the link TTL).
Rotate in a low-traffic window and be ready to re-issue links.

### Tier 4 — tooling is broken

| Secret | Status |
| --- | --- |
| `WXKANBAN_API_TOKEN` | No working revocation path — see [§2](#2-api-token-revocation). Manual SQL only. Also an encryption key for `DATABASE_URL_ENCRYPTED` |
| `API_KEY` | Startup-required but **gates nothing over HTTP** — the transport strips client-supplied `apiKey` from `_meta`, so the comparison is always self-vs-self. Rotating it only requires that every process against the same server uses the same value |

### Also in scope — committed credentials

`ai-settings.json` is **git-tracked** (9 commits, back to 2026-03-02) and holds
a live-shaped `WXKANBAN_API_TOKEN` plus a `DATABASE_URL_ENCRYPTED` blob. Since
the token is the key for that blob, the pair is equivalent to the production DB
URL in cleartext for anyone with repo access.

Mitigating: the repo is **private**, and `ai-settings.json` is **excluded** from
kit sync (`scripts/upgrade-kit.mjs`), so it does not reach the public release.
Severity is "credential in private history", not "public leak". Rotate the
token, re-encrypt the blob, and consider the history compromised.

---

## 6. DO NOT ROTATE — `SETTINGS_ENCRYPTION_KEY`

**Rotating this key destroys data. It does not merely make data unreadable.**

It protects one column, `companies.settings`, via one read site
(`src/server/services/SettingsService.ts`). The failure is silent because the
decrypt error is swallowed:

```ts
catch { logger.error("Failed to decrypt company settings — treating as empty"); return []; }
```

So after a rotation without re-encryption:

1. The app **starts normally** — no boot failure, no alarm.
2. Every `getCompanySettings()` returns `[]`. One log line. **No user-facing
   error.**
3. The next `addSetting` / `updateSetting` / `deleteSetting` writes a blob built
   from that empty array, **overwriting the original ciphertext**.

Step 3 is irrecoverable, and it happens for every company on their first
settings write after the rotation.

**There is no rotation tooling and the format cannot express two keys.** The
ciphertext is `iv:authTag:ciphertext` with no key id or version, and the
decrypter rejects anything that is not exactly three parts. Supporting two keys
would need trial-decryption (viable — a GCM auth-tag failure is a reliable
discriminator) or a format change. Neither exists.

Rotating this key requires a decrypt-old/re-encrypt-new migration to be built
first. That work is **not** covered here.

---

## 7. Pre-flight — read before rotating anything

**Ordering.** Reuse the sequence from
[../specs/019-agent-orchestrator-kit/r0-secrets-scrub-runbook.md](../specs/019-agent-orchestrator-kit/r0-secrets-scrub-runbook.md)
(§ "Rotation ordering"): provision the new credential → update **every**
consumer → verify each → revoke the old → only then scrub history. Revoking
before every consumer is updated is what causes an outage.

**Key length.** `src/server/lib/crypto.ts` uses the env var as **raw AES key
bytes** (`Buffer.from(key, 'utf-8')`), so `ENCRYPTION_KEY` must be **exactly 32
bytes**. But `src/server/config.ts` validates only `min(32)`. A 33-character
key **passes startup validation and then throws `Invalid key length` at the
first encrypt** — surfacing later, under load, far from the change. Generate
exactly 32 and prove it with one encrypt before declaring success.

`JWT_SECRET` and `SETTINGS_ENCRYPTION_KEY` have their own rules: `JWT_SECRET`
must be ≥32 chars (boot fails otherwise); `SETTINGS_ENCRYPTION_KEY` is
correctly validated as exactly 32 — and must not be rotated at all ([§6](#6-do-not-rotate--settings_encryption_key)).

**App Runner env writes replace the whole map.** `update-service` does not
merge. Always read the current env with `describe-service`, modify in memory,
and write the complete map back. A partial write silently wipes `DATABASE_URL`,
`JWT_SECRET`, `STRIPE_API_KEY`, and everything else.

**No staging environment exists** to rehearse in — `wxkanban-mcp-staging` is
gone. Rotations land straight in production.

**Local `.env` points at PRODUCTION.** Until that changes, a developer machine
holds live production credentials, and rotating them means updating every
developer's `.env` too. Repointing local at a non-prod database is the
structural fix and is tracked separately.

---

## 8. Out of scope for this runbook

- DB-level disaster recovery (snapshots, point-in-time restore) — covered
  by RDS automated snapshots; restore procedure is RDS-standard.
- ACM cert renewal — fully automatic via DNS validation; no operator action
  required while the Route53 records exist.
- Multi-region failover — explicitly deferred (Spec 028 Scope Boundary OUT).
- The `SETTINGS_ENCRYPTION_KEY` re-encrypt migration ([§6](#6-do-not-rotate--settings_encryption_key)).
- Moving production secrets into AWS Secrets Manager and repointing local
  `.env` at a non-prod database — the structural fix that would make most of
  this runbook unnecessary.

---

## Known defects this runbook works around

File these; do not fix them inline during a rotation.

- `pmsystemconnections.accesstoken` / `.refreshtoken` are stored **plaintext**
  despite `// Encrypted` schema comments and a code comment claiming "Encrypted
  at rest in production". Live SOC 2 finding, already recorded at
  `project-documentation/SOC2_SECURITY_AUDIT_2026-06-22.md:88`.
- MCP token tools query the dropped `apitokens` table; `create` passes no
  `projectId`.
- API tokens never expire, and minting does not revoke the predecessor.
- `config.ts` validates `ENCRYPTION_KEY` as `min(32)` where the crypto requires
  exactly 32.
- `infra/apprunner.tf` injects `ENCRYPTION_KEY` and `JWT_SECRET` into the MCP
  service, which reads neither. Dead config.
- `SessionService.ts` and the `sessions` table are dead code — no migration
  creates the table and nothing imports the service.
