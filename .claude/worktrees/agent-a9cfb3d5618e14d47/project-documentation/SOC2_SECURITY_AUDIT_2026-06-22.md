# SOC 2 Security Audit — wxKanban (all applications)

**Date:** 2026-06-22
**Framework:** SOC 2 Trust Services Criteria — Common Criteria (Security)
**Method:** Read-only static analysis of source, fanned out across the five applications, every finding code-verified with file:line evidence.
**Scope:** wxKanban web backend (`src/server`, `src/db`), web frontend (`src/client`), MCP server (`mcp-server`), CLI orchestrator (`wxkanban-agent`), VS Code extension (`vscode-extension`), and cross-cutting infra/secrets (`infra`, repo-wide).

> Status legend: ☐ open · ◐ in progress · ☑ fixed/verified. All items open at time of writing.

---

## Severity summary

| Sev | Count | Theme |
|-----|-------|-------|
| 🔴 Critical | 2 | Committed production credentials in git |
| 🟠 High | 8 | Broken access control / multi-tenant isolation, plaintext token storage, XSS chain, DB TLS off, shell injection |
| 🟡 Medium | 11 | Missing role gates, secret management, error/audit leakage, weak KDF, rate limiting |
| 🟢 Low | ~10 | Hygiene, defense-in-depth, dead code |

---

## 🔴 CRITICAL — remediate before any audit / immediately

### C-1. Production database credentials committed in cleartext
- **App:** Infra/secrets · **Criterion:** CC6.1 · **Status:** ☐
- **Evidence (git-tracked):**
  - `mcp-server/decrypted-url.txt:1` — full prod URL (host `pgkanban.wxperts.com`, user `wxKanban`, password URL-encoded)
  - `mcp-server/restore-db-url.mjs:9` — same URL hardcoded
  - `mcp-server/fix-db-url.mjs:73,76` — prod password raw + encoded
- **Risk:** Anyone with repo read access has live prod DB credentials. Decoded password matches the live prod DB.
- **Live verification (2026-06-22):**
  - The leaked `wxKanban` credential **still authenticates** to prod (`AUTH_OK usr=wxKanban db=wxKanban`).
  - Tracked in git since **2026-03-27** (commit `72ce3473`), ~3 months. Repo is **private** (not internet-exposed), but accessible to all collaborators/clones/integrations over that window.
  - **Blast radius of rotation = effectively zero for prod:** hosted MCP prod (App Runner `wxkanban-mcp-prod`) connects as **`ccscowboy`**, NOT `wxKanban`. The `wxKanban` role is a leftover used only by the local dogfooding scripts. ⇒ **`wxKanban` can be dropped or rotated immediately with no prod coordination.**
  - **Privilege escalation:** `wxKanban` is a member of `ccscowboy`, which is a member of `rds_superuser`. Via role inheritance the leaked credential effectively holds **RDS superuser** (full DB admin) — see H-9.
- **Fix:** **DROP** the `wxKanban` role (nothing uses it) — or rotate it — **now**; revoke its `ccscowboy` membership regardless. Then delete the three files → purge from git history (`git filter-repo` / BFG). Never write decrypted URLs to disk.

### C-2. Committed admin JWT bearer tokens
- **App:** Infra/secrets · **Criterion:** CC6.1 / CC6.6 · **Status:** ☐
- **Evidence:** `public/kanban-redirect.html:6` (real HS256 token for `admin@wxperts.com`, ADMIN — and `public/` is web-served); `tests/test-create-user.cjs:11` (second hardcoded admin JWT for `devteam@alitho.com`).
- **Risk:** Leaks admin identity + token structure; if the signing secret was reused in prod, forgeable sessions.
- **Fix:** Remove hardcoded tokens, generate at runtime. Confirm the `JWT_SECRET` that signed these is not the prod secret; rotate if it is.

---

## 🟠 HIGH

### Access control / multi-tenant isolation

### H-1. Unauthenticated Stripe payment endpoints trusting body `companyId`
- **App:** Web backend · **CC6.1 / CC6.3** · ☐
- `src/server/routes/payment.ts:307` (`POST /setup-intent`) and `:359` (`POST /process`) have no `authenticateToken`/`requireAuth`; they read `companyId` from `req.body` (`:328`, `:380`).
- **Risk:** Attacker drives Stripe SetupIntents / subscription processing against arbitrary company IDs.
- **Fix:** Require auth + admin; derive/assert `companyId` from `req.companyid` (or bind to the registration session for the pre-account flow).

### H-2. Project sub-resource IDOR cluster (cross-tenant read/write/delete)
- **App:** Web backend · **CC6.1 / CC6.3** · ☐
- `src/server/routes/projects.ts` — sub-resource handlers query by path UUID with no company check: phases `:540`; phase tasks `:721/:753/:805`; specs `:824/:855/:891`; documents `:910`; scopes/scope-chat/task-gen `:1333–1597`. `companyid` is passed to services but used only for audit logging, not in WHERE (`ScopeService.ts:305`, `taskService.ts:264`).
- Related: `src/server/routes/notes.ts:170/225/282` (filter by note id only); `src/server/routes/timeTracking.ts` (`:140/317/375/436` — also a param bug: declares `:entryid` but reads `req.params.id`; list/summary/export `:265/518/631` take `projectid` with no tenant filter).
- **Risk:** Any authenticated user reaches another tenant's tasks/specs/scopes/docs/notes/time entries by UUID.
- **Fix:** Assert `project.companyid === req.companyid` per handler, or make `companyid` a mandatory WHERE filter in those services.

### H-3. MCP role-based authorization is dead — every token treated as `editor`
- **App:** MCP server · **CC6.1 / CC6.3** · ☐
- `mcp-server/src/index-http.ts:200-206` builds `_meta` without `role`/`userId`; `extractAuth` (`src/server.ts:2-13`) always returns `role='editor'`, so `checkPermission` (`src/auth/role-checker.ts:58-72`) cannot enforce the `PERMISSION_MATRIX`.
- **Risk:** Admin-only tools reachable by any consumer token — including `project.upgrade_mcp` (`src/server.ts:1573-1644`) which **downloads and installs code** (`installUpdate`).
- **Fix:** Populate `_meta.role`/`userId` from the authenticated `mcpScope` before dispatch; gate `upgrade_mcp` on a server-side admin check, not client-supplied role.

### H-4. MCP `link_doc_to_task` bypasses tenant scoping (cross-project write)
- **App:** MCP server · **CC6.1** · ☐
- `mcp-server/src/server.ts:1182-1219` — raw `db.select/update` on `projecttasks`/`projectdocuments` keyed only by client-supplied `taskId`/`documentId`, no `projectid` filter.
- **Risk:** Token for project A can link/mutate doc/task arrays on project B objects by UUID (the within-customer scope-leak class). This is the **only** scoped-query gap; the `scoped-query` wrapper closes it everywhere else.
- **Fix:** Route through `scoped.selectScoped`/`scoped.updateScoped`.

### H-5. Shell injection via server-supplied `branchName`
- **App:** VS Code extension · **CC6.1 / CC8.1** · ☐
- `vscode-extension/src/commands/scopeCheckout.ts:134` (helper `:56-67`) interpolates `result.branchName` (returned by the MCP server, typed `string?` with no validation — `types.ts:40`) into a command run via `exec()` (shell).
- **Risk:** Malicious/compromised MCP response (e.g. `feat/x; rm -rf $HOME`) → arbitrary command execution on the developer's machine.
- **Fix:** Validate `branchName` against `/^[A-Za-z0-9._\/-]{1,200}$/`; switch `exec` → `execFile`/`spawn` with args array, `shell:false`.

### Data protection / crypto

### H-6. PM / OAuth access tokens stored in plaintext
- **App:** Web backend · **CC6.1 / CC6.7** · ☐
- `src/server/services/pmSystemService.ts:107-157`, `src/server/routes/pmSystems.ts:319-325` insert `accesstoken`/`refreshtoken` raw; read raw at `pmSyncService.ts:387`. Working AES-256-GCM `encryptToken` (`lib/crypto.ts`) is used only by `SettingsService`.
- **Risk:** Contradicts the "encrypted at rest" control; DB compromise exposes third-party OAuth tokens.
- **Fix:** Encrypt before insert/update, decrypt on read, using `ENCRYPTION_KEY`.

### H-7. JWT in `localStorage` + unsanitized HTML rendering = XSS → account takeover
- **App:** Web frontend · **CC6.1 / CC6.7 / CC7.1** · ☐
- Token in localStorage: `src/client/context/AuthContext.tsx:162,197`, read in `src/client/lib/apiFetch.ts:7` and ~40 components; inconsistent keys `wxkanban_token` vs `token` (e.g. `pages/InvoicesPage.tsx:42`, `ReportsPage.tsx:48`, `BillingConfigPage.tsx:38`). Redundant — an httpOnly cookie already exists.
- Unsanitized markdown (no DOMPurify anywhere): `pages/DocsDetailPage.tsx:78`, `pages/SysAdmin/Docs.tsx:321`, `components/help/HelpPanel.tsx:313` render `marked.parse(...)` raw.
- Mermaid `securityLevel:"loose"` on DB-sourced content: `components/MermaidBlock.tsx:7`, `pages/DatabaseErdPage.tsx:61`, `pages/ScopeProcessFlowPage.tsx:58`, `pages/ScopeAnalysisPage.tsx:67` (ProjectOverviewTab uses `strict` correctly).
- **Fix:** Drop the localStorage token (rely on the cookie); pipe markdown through DOMPurify; set mermaid `strict` everywhere.

### Transport

### H-8. Database TLS certificate verification disabled
- **App:** Web backend + MCP server · **CC6.7** · ☐
- `ssl: { rejectUnauthorized: false }` at `src/db/client.ts:31`, `src/server/db/client.ts:31`, and `mcp-server/src/db/connection.ts:8` (config strips `sslmode`, `mcp-server/src/config.ts:233-235`).
- **Risk:** Accepts any certificate → MITM on the DB connection.
- **Fix:** `rejectUnauthorized: true` with the RDS CA bundle.

### H-9. Production services connect to the database as an RDS-superuser-privileged role
- **App:** Web backend + MCP server (runtime infra) · **CC6.1 (least privilege)** · ☐
- **Live verification (2026-06-22):** hosted MCP prod (App Runner `wxkanban-mcp-prod`) connects via `DATABASE_URL` as role **`ccscowboy`**, which is a member of **`rds_superuser`** (also `createrole`/`createdb`). The app prod DB is the same instance/role per project records. The leaked `wxKanban` role chains to the same superuser via `ccscowboy` membership.
- **Risk:** A compromise of any one service (or the leaked credential) yields full DB admin — drop tables, read/modify all tenants, manage roles. No blast-radius containment.
- **Fix:** Create a least-privilege application role (CRUD on the app schema only, no superuser/createrole/createdb), repoint app + MCP `DATABASE_URL` to it; reserve `ccscowboy`/superuser for migrations/admin only; revoke `wxKanban`'s `ccscowboy` membership.

---

## 🟡 MEDIUM

| ID | App | Criterion | Finding | Evidence |
|----|-----|-----------|---------|----------|
| M-1 | Web backend | CC6.3 | Admin/team write routes missing `requireAdmin`; any member can create users, promote to ADMIN, delete users, change settings, invite/seat-consume | `admin.ts:157/445/544/397`; `invitations.ts:143/244/612/644` |
| M-2 | Web backend | CC6.1 | Tenant scope keyed on wrong identifier — `billing.ts` reads `(req as any).user`/`.role` (never set); `invoices.ts:64` passes `req.userid` where service expects `companyid` | `billing.ts:53/82/91/129/138/178/217`, `invoices.ts:64` |
| M-3 | Infra | CC6.1 | **CONFIRMED (2026-06-22):** hosted MCP prod has `DATABASE_URL`, `API_KEY`, `JWT_SECRET`, `ENCRYPTION_KEY`, `GROQ_API_KEY` all as **plain** App Runner env vars — `RuntimeEnvironmentSecrets` is empty (nothing in Secrets Manager). Move all to Secrets Manager | `infra/apprunner.tf:23-50`; App Runner `wxkanban-mcp-prod` config |
| M-4 | Infra | CC6.1 / CC6.7 | No remote TF state backend → `tfstate` (sensitive DB URL/JWT/encryption key) written locally in plaintext | `infra/main.tf:18-24`, `infra/variables.tf:117-164` |
| M-5 | Web backend + MCP | CC7.2 | Internal error details leaked to clients (full response body on ≥400; raw `error.message` exposing DB/schema) | `request-logger.ts:68-79`; `mcp server.ts:2690-2694`, `index-http.ts:164-167/233-237` |
| M-6 | Web backend | CC6.7 | AES-256-GCM key used as raw UTF-8 string, no KDF; config only enforces `min(32)` | `src/server/lib/crypto.ts:11-15`, `config.ts:14` |
| M-7 | MCP server | CC6.1 | Auth-bypass flag fails open on misconfig (`MCP_AUTH_REQUIRED`); `list_open_items` preserves pre-scope behaviour under dev-bypass | `auth.ts:67-71`, `server.ts:1256-1266` |
| M-8 | MCP server | CC7.2 | DB audit/event log stores unredacted tool args + results (file logger redacts; DB path doesn't) | `gateway.ts:24`, `server.ts:567` |
| M-9 | Web backend + MCP | CC6.1 / availability | Rate limiting in-process only (per-container on multi-instance); **no rate limit on `/api/auth/signin` or `/forgot-password`** | `rate-limit.ts:19`; backend in-memory limiters |
| M-12 | Web backend | CC6.1 | **No account lockout / brute-force protection on login.** Failed-password attempts are unbounded — no failed-attempt counter, no lockout, no `lockeduntil`/`failedlogins` columns on `users`. **Requirement (Andy, 2026-06-22): lock the account after 3 consecutive failed password attempts.** | `routes/auth.ts` signin handler; `db/schema/userprofiles` (no lockout fields) |
| M-10 | CLI | CC6.1 | API tokens written plaintext to `.wxai/project.json`, which is **not** in `.gitignore` (only `.env` is) → risk of tokens committed to customer repos | `kit-configure.ts:42/52-79`, `wxkanban-agent/.gitignore` |
| M-11 | Web backend | CC6.1 | Duplicate/dead `crypto.ts` password hashing uses PBKDF2 @ 4096 iterations (comment says "use bcrypt"); live path correctly uses bcrypt cost 12 | `src/server/lib/crypto.ts:71-81` vs `lib/password.ts:4` |

---

## 🟢 LOW

- No client-side role gate on SysAdmin routes (`ProtectedRoute.tsx:9-29`) — server enforces; defense-in-depth only.
- Error telemetry captures full URL + query string (`errorCapture.ts:34`) — risky only if tokens/PII ever land in query params.
- Stray `console.*` in server (`KitGenerationService.ts:837/853-854`, dead `index2.ts`) and client (`ProjectWorkspacePage.tsx:1221`, `ReportsPage.tsx:73`, `KitManager.tsx:319`) — Pino-only rule; no secrets leaked.
- MCP `create_api_token` writes `apitokens` but auth reads `mcpapitokens` (`project-kit.ts:106-109`) → orphan credentials; actor recorded as `mcp-agent`/`unknown` instead of real user (`server.ts:2604/2100`).
- MCP CORS fully open (`index-http.ts:58`); non-constant-time + effectively-unused API-key compare (`server.ts:218`).
- Static KDF salt in `KitEncryptionService` (`:33/47`); hardcoded local-dev MCP key `wxkanban-mcp-local-dev-key` (`start-http.mjs:38`, `setup-mcp.mjs:188`).
- CLI `shell:true` spawns interpolating local paths (`cockpit-refresh.ts:25/116/155`, `pipeline-agent-run.ts:6/25-27`) — local-only, low exploitability.
- Weak common-password check (12-entry substring list, min length 8) — `lib/password.ts:40-65`, `registerSchema`.
- Dynamic table name interpolated into raw count query (internal schema introspection, not user input) — `ErDiagramGenerator.ts:295`.

---

## Verified correct (checked, no action)

- **JWT:** HS256 pinned, explicit `algorithms:["HS256"]` on verify (no `alg:none`/confusion), 24h expiry, secret ≥32 chars required via Zod, no hardcoded fallback (`lib/jwt.ts`, `config.ts:11`).
- **bcrypt** cost 12 on the real auth path; password change verifies current + rejects reuse (`lib/password.ts`).
- **Cookies:** `httpOnly`, `secure` in prod, `sameSite:"strict"`, 24h; signout clears with matching attributes.
- **Stripe webhook** signature verified on raw body, mounted before `express.json()` (`app.ts:66`, `webhooks.ts:47`).
- **forgot-password** generic response (no enumeration); reset/verify tokens one-time, SHA-256 hashed at rest, expiry-checked.
- **Error handler** leaks stack/message only in `NODE_ENV==="development"` (`app.ts:142`).
- **`lib/crypto.ts` token encryption:** AES-256-GCM, random 12-byte IV, auth tag verified (sound — issue is it's not applied to PM tokens).
- **SSRF / command injection / path traversal (backend):** outbound PM URLs are fixed provider endpoints; `spawn` uses fixed arg arrays; no user-controlled `sendFile`/`readFile`.
- **MCP `scoped-query` tenant binding** sound everywhere except H-4; feedback-sink cross-tenant routing deliberate + scoped; AES-256-GCM + scrypt + SHA-256-hashed tokens; security headers (HSTS/nosniff/no-referrer); no hardcoded prod secrets in MCP source.
- **CLI/extension transport:** no `rejectUnauthorized:false`/`NODE_TLS_REJECT_UNAUTHORIZED=0`; corporate-TLS implemented safely (system-CA merge); tokens masked in logs; webviews use strict CSP + `escapeHtml`; no `eval`/dynamic require; no remote-code postinstall hooks; paths confined to workspace root with UUID-validated projectId.
- **Infra:** `.gitignore` strong (`.env`, `*.key`, `*.pem`, tfstate/tfvars, PII dumps); no AWS/Stripe/LLM keys committed; IAM least-privilege (single scoped `secretsmanager:GetSecretValue`); ACM DNS-validated TLS on custom domains; no `0.0.0.0/0` security groups; CI workflow has no secret/injection surface.

---

## Recommended remediation order

1. **C-1, C-2** — rotate prod DB password + JWT secret; purge credential files and embedded JWTs from git history.
2. **H-1, H-2, M-2** — authenticate payment endpoints; close the IDOR cluster; fix `billing.ts`/`invoices.ts` tenant wiring.
3. **H-3, H-4** — fix MCP role plumbing + gate `upgrade_mcp`; scope `link_doc_to_task`.
4. **H-5** — validate `branchName` / drop `exec` in the extension.
5. **H-6, H-7, H-8** — encrypt PM tokens; remove localStorage JWT + add DOMPurify/mermaid-strict; enable DB cert verification.

---

*Generated from a multi-agent read-only audit on 2026-06-22. No code was modified during the audit.*
