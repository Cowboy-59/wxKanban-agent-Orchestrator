# SOC 2 Evidence Pack — wxKanban

**Date:** 2026-08-02
**Framework:** SOC 2 Trust Services Criteria — Common Criteria (Security)
**Supersedes as status-of-record:** [`SOC2_SECURITY_AUDIT_2026-06-22.md`](./SOC2_SECURITY_AUDIT_2026-06-22.md)
(that document remains the point-in-time June assessment and its evidence is not restated here)

**Method.** Three sources, merged:

1. **Application layer** — the June 2026 static audit across five applications.
2. **Data layer** — an automated read-only analysis of the production database
   (`docs/db-analysis/latest.md`, 440 findings), plus hand verification of every finding acted on.
3. **Access-path review, 2026-08-02** — a targeted code review that began as a follow-up to a data
   finding and produced the most serious item in this pack.

**Evidence discipline.** Every status below is marked with how it was established. Items carried
from June without re-verification today are labelled as such and must not be read as current.

> **Status legend:** ☑ remediated · ☐ open · ◐ partially addressed
> **Verified legend:** `live` = executed against production today · `code` = re-read in source
> today · `June` = carried from the June audit, **not** re-verified

---

## 1. Executive summary

**The governing fact of this assessment:**

> **0 of 129 production tables have row-level security enabled.**
> *(verified `live`, 2026-08-02)*

Every tenant boundary in this system is enforced by application code. There is no database-level
backstop. That is a legitimate architectural choice and it is common — but it has a specific
consequence for control design: **a single missing check in a single handler is a cross-tenant data
exposure, and nothing underneath will catch it.**

On 2026-08-02 that is exactly what was found, confirmed by execution against production, and closed
the same day. It was not caught by the database analysis, by the drift gate, by the fence audit, or
by the test suite. It was found by reading the access path.

**Amendment, same day.** The statement "enforced by application code" was still too generous. The
one file that *named itself* the tenant-isolation control —
`src/middleware/company-isolation.ts` — was never mounted on a route, never called, and would not
have filtered a query if it had been. It has been deleted rather than left to be mistaken for
evidence. What actually enforces the boundary is **211 hand-written `companyid` predicates spread
across 54 files**, with no shared helper and therefore no single place to audit, test, or fix. See
NEW-5.

This pack should be read as: the controls that exist are mostly sound; the **detection** layer
underneath them is thin, and three of the four new findings below are detection gaps rather than
access gaps.

### Posture at a glance

| Severity | Remediated | Open | Total |
|---|---|---|---|
| Critical | 2 | 1 | 3 |
| High | 2 | 7 | 9 |
| Medium | 1 | 11 | 12 |
| New (2026-08-02) | 4 | 3 | 7 |

---

## 2. Finding of record — cross-tenant feedback disclosure

**ID:** NEW-1 · **CC6.1 / CC6.3** · **Critical** · **☑ remediated 2026-08-02** · verified `live`

### What it was

`project.list_my_feedback` accepted a `projectId` parameter from the caller and never validated it
against the caller's token.

The mechanism is worth stating precisely, because the scoping wrapper that should have prevented it
was working correctly:

1. All VS Code feedback is stored centrally in one Wxperts-owned "sink" project by design.
2. `resolveSinkScope` rebinds **any** caller's scope to that sink — unconditionally, with no
   ownership check on the caller.
3. `scoped-query` then correctly enforced `projectid = sink`, which **every tenant's row satisfies**.
4. The actual tenancy decision was therefore deferred to a post-fetch JavaScript filter comparing
   `context.originProjectId` — a value inside an unconstrained JSON column — against the
   caller-supplied parameter.
5. Passing the sink's own ID, a hardcoded public constant in the source, set `showAllInProject`
   and returned everything.

### Proof of exposure

Executed against production, 2026-08-02, from a token bound to project `ba924193…`:

| Request | Result before fix |
|---|---|
| `projectId = 68cf2d4b…` (another company's project) | Returned that project's feedback in full — titles, bodies, reproduction steps, internal process notes, a private repository name |
| `projectId = <sink id>` | Returned **81 items across 15 distinct origin projects** |

**Data in scope:** 86 feedback submissions from **8 named customer companies** (69 of 86 belonging
to parties other than Wxperts).

### Root-cause classification

This is a recurrence of **H-2**, the cross-tenant IDOR cluster remediated in June for
`notes`, `timeTracking` and `projects` via a project-access assertion. Feedback shipped later, under
a different scope, and never received the equivalent check. **A remediated finding class reappearing
in new code is a control-design failure, not a coding mistake** — the June remediation fixed the
instances it found and did not establish a rule that new handlers had to satisfy.

### Remediation

`mcp-server/src/utils/project-access.ts` — a company-level, default-deny authorisation check
executed **before** the sink rebind. Deployed in APP 1.5.291, `origin/main` `f7e96456`.

**Verified in production after deployment:**

| Test | Result |
|---|---|
| Cross-tenant request (token `ba924193…` → project `68cf2d4b…`) | **Denied** — `scope-violation: the requested project is not accessible to this token` |
| Legitimate access (token `ba924193…` → own project) | **Succeeds** — no regression |

### Exploitation history: **cannot be determined**

The audit trail recorded only the project the caller's **token** was bound to, never the project
they **requested** — the one field that distinguishes an escalation from an ordinary call. Across
387,805 audit rows there is no way to reconstruct which project any caller asked for.

**This pack therefore states that prior exploitation cannot be ruled out.** It does not state that
no exploitation occurred, because that claim is not supported by available evidence. See NEW-2.

---

## 3. New findings, 2026-08-02

| ID | Criterion | Sev | Finding | Status |
|---|---|---|---|---|
| NEW-1 | CC6.1 / CC6.3 | Critical | Cross-tenant feedback disclosure (§2) | ☑ closed |
| NEW-2 | CC7.2 | High | Audit trail could not record the **requested** project, making exploitation of NEW-1 unprovable in either direction | ☑ closed |
| NEW-3 | CC7.2 | Medium | **Blocked cross-tenant attempts are recorded as `outcome: success`, HTTP 200** | ☐ open |
| NEW-4 | CC8.1 | High | `db:drift` / `auditfences --schema` are **table-level only** and cannot detect column drift | ☐ open |
| NEW-5 | CC6.1 | High | **0 of 129 tables have row-level security** — no database-level tenant isolation. Amended: the named middleware control was **dead code, now deleted**. **H-9 landed 2026-08-02, so this is now UNBLOCKED** — the app connects as a non-owner and policies will apply without `FORCE` | ☐ open (unblocked, ready to start) |
| NEW-6 | CC7.2 | Medium | 19,976 audit rows carry **no tool attribution** (JSON-RPC transports recorded `tool: null`) | ☑ closed forward |
| NEW-7 | CC8.1 / A1.2 | High | Declared column `projecttimeentries.phaseid` absent from production, causing intermittent `42703` failures | ☑ closed |
| NEW-8 | CC6.1 / CC6.3 | **Critical** | **`_meta` was an unenforced trust boundary.** Handlers read both identity (`role`) and tenancy (`mcpScope`) out of caller-supplied JSON-RPC metadata. On `/mcp` and `/messages` a valid token could forge either — escalating to `admin` or claiming another tenant's project outright | ☑ closed |

### NEW-2 — audit trail omitted the requested project · ☑ closed · verified `live`

**Was:** `mcprequestaudit` recorded `projectid` from the caller's token only.
**Now:** `requestedprojectid` added (migration `0061`) and confirmed writing in production. The
blocked attempt from §2 is recorded as `ba924193 / 68cf2d4b` and is detectable with a one-line
predicate:

```sql
select * from mcprequestaudit
 where requestedprojectid is not null
   and requestedprojectid is distinct from projectid;
```

**Limitation of record:** historic rows are `NULL` and were deliberately **not** backfilled. A
fabricated value in an audit column is worse than a null, because it reads as evidence.

### NEW-3 — denials are audited as successes · ☐ **open** · verified `live`

MCP returns JSON-RPC errors inside an HTTP 200 body, and the audit middleware derives `outcome` from
`res.statusCode`. `scope-violation` is only assigned on HTTP 403, which this path never produces.

The blocked cross-tenant attempt in §2 is recorded as `outcome: success, responsestatus: 200`.

**Consequence:** attempts remain detectable via the project mismatch (NEW-2), but anyone filtering
`outcome = 'scope-violation'` to find attacks receives an empty set. The enum value exists and is
never populated on this path.

**Fix:** handlers should set `req.mcpAudit.outcome` explicitly rather than relying on status code.

### NEW-4 — the drift gate cannot see column drift · ☐ **open** · verified `live`

`npm run db:drift` and its CI counterpart `auditfences --schema` compare **tables only**. Its own
success line reads *"every declared **TABLE** exists."*

**Demonstrated 2026-08-02:** the gate exited **0** while two declared columns were missing from
production, one of which (NEW-7) was actively causing errors.

This matters beyond convenience: SCOPE-117 exists specifically to eliminate schema drift, and its
July reconciliation compared tables while the surviving gap was a column. **A green gate has been
reported as coverage it does not provide.** Recorded in
`specs/117-production-schema-integrity/schema-change-log.md`.

### NEW-5 — no database-level tenant isolation · ☐ open (architectural, sequenced) · verified `live`

0 of 129 tables have RLS. Combined with NEW-1 and H-2, the pattern is that tenant isolation depends
entirely on each handler remembering to check. Two separate handler families have now failed to.

This is not a demand to adopt RLS — it is a statement that **the current control has no second
layer**, which should be either accepted explicitly with compensating detection, or changed.

**Amended 2026-08-02** after direct investigation. Three facts change how this should be actioned.

**1. The named isolation control was dead code.** `src/middleware/company-isolation.ts` documented
itself as "Enforces company-based data isolation … Preventing cross-company data access." It was
never mounted on any route and `enforceCompanyFilter` was never called — the only references
outside the file were stale hashes in the fence baseline, and it had not been touched since
2026-02-17. It would not have isolated anything had it been mounted: it read `req.companyid`,
regex-checked the format, reassigned it to itself, and called `next()` without touching a query.
**Deleted 2026-08-02.** Actual enforcement is 211 hand-written `eq(x.companyid, …)` predicates
across 54 files, with no helper or choke point. This is the specific mechanism behind SCOPE-043.

**2. Naive RLS adoption would have been inert.** The app connects as `ccscowboy`, which is *not* a
Postgres superuser and does *not* hold `BYPASSRLS` (`rds_superuser` carries neither attribute) — so
that common bypass does not apply. However **`ccscowboy` owns 115 of the 129 public tables**, and
RLS does not apply to a table's owner unless `FORCE ROW LEVEL SECURITY` is also set. Enabling RLS
without either a non-owner role or `FORCE` would have produced policies that enforce nothing while
this pack recorded "RLS adopted" — the same failure shape as item 1, one layer down, and the same
shape as NEW-4 (a green gate reported as coverage it does not provide).

**3. The tenant key is not uniform.** `projectid` 42 tables · `companyid` 27 · `userid` 20 ·
`customerid` 4. A single `companyid` policy reaches 27 tables; the 42 `projectid` tables need
join-based policies, carrying a subquery on every row access including hot paths such as
`mcprequestaudit` (387k rows).

**Decision — sequenced, not deferred.** RLS is blocked on **H-9**: a non-owner least-privilege
application role is what makes policies bite without `FORCE` gymnastics, so doing RLS first means
doing it twice. Order of work: (a) remove the misleading control — **done**; (b) H-9 least-privilege
role; (c) RLS on the 27 `companyid` tables, measured; (d) separate decision on the 42 `projectid`
tables once the cost is observed. RLS also requires `SET LOCAL` per **transaction** — per-connection
context leaks between requests under a pool.

### NEW-7 — schema drift causing production errors · ☑ closed

`projecttimeentries.phaseid` was declared in application code but absent from production. Drizzle
projects every declared column, so unqualified reads failed `42703` while partial selects
succeeded — producing intermittent, endpoint-specific 500s rather than a clean outage. Applied
2026-08-02 (migration `0062`), verified present. Found by the database analyzer; **not** found by
the drift gate (NEW-4).

---

## 4. Carried findings — June 2026 audit

### Critical

| ID | Finding | Status | Verified |
|---|---|---|---|
| C-1 | Production DB credentials committed in cleartext | **☑ remediated** — the `wxKanban` role no longer exists in the database; only `ccscowboy` remains | `live` |
| C-2 | Committed admin JWT bearer tokens | **☑ remediated 2026-08-03** — both files deleted. **Severity downgraded to Low on re-verification:** both tokens were expired (2026-02-24 and 2026-03-03) *and* neither signature validates against the current `JWT_SECRET`, so the secret had already been rotated. Residual harm was disclosure of an admin email, user/company UUIDs and plan tier on a public URL — not an auth bypass | `live` |

### High

| ID | Finding | Criterion | Status | Verified |
|---|---|---|---|---|
| H-1 | Stripe `/setup-intent` and `/process` unauthenticated, trusting body `companyId` | CC6.1/CC6.3 | **☑ remediated 2026-08-03** — all three routes deleted (`/validate` was a third unauthenticated route the June audit missed). Confirmed reachable in production first: `POST /api/payment/setup-intent` returned `400 Validation failed`, not the `503` disabled-path short-circuit. No client code called them — registration uses `/registration/subscribe`, existing customers use `/subscription/update-card` — so deletion removed the surface rather than gating dead handlers | `live` |
| H-2 | Project sub-resource IDOR cluster | CC6.1/CC6.3 | **◐ partial** — original instances remediated June; **same class recurred** in feedback (NEW-1) and is now closed. No rule prevents the next recurrence | `code` |
| H-3 | MCP role authorization dead — every token treated as `editor` | CC6.1/CC6.3 | **☑ remediated 2026-08-03** — and it was **worse than written up**. `role` was only forced to `editor` on `/call`; `/mcp` spread the client's `_meta` and `/messages` passed it through verbatim, so on those two transports **`_meta.role` was caller-controlled** — `role: "admin"` reached admin-gated tools, including `project.upgrade_mcp`, which installs code. Fixed by making the server replace `mcpScope`/`role`/`userId`/`apiKey` in `_meta` on all three transports | `code` |
| H-4 | `link_doc_to_task` bypasses tenant scoping | CC6.1 | **☑ remediated 2026-08-03** — confirmed a cross-tenant **write**, not just a read: task and document were fetched by caller-supplied UUID with no tenancy predicate, then both rows updated. Now routed through `scoped.selectScoped`/`updateScoped`. These were the **only two unscoped writes in the entire MCP tool surface** (52 scoped calls vs 8 raw); zero remain | `code` |
| NEW-8 | **SSE transport let a caller forge its entire tenancy scope** | CC6.1/CC6.3 | **☑ remediated 2026-08-03** — found while fixing H-3. `getRequestScope()` reads the whole `McpScope` out of `_meta.mcpScope`, and `POST /messages` passed the client body to the transport untouched. Any holder of a valid token could open `GET /sse` and then post `_meta.mcpScope = {projectId: <victim>, customerId: <victim>, authMode: 'token'}`, and every scoped-query check would accept it as its own resolved scope — full cross-tenant read **and** write. Closed by the same trusted-`_meta` rule, which also gives the SSE path a real scope for the first time | `code` |
| H-5 | Shell injection via server-supplied `branchName` | CC6.1/CC8.1 | ☐ open | `June` — **not re-verified** |
| H-6 | PM/OAuth access tokens stored plaintext | CC6.1/CC6.7 | **☐ open** — `pmSystemService.ts` still inserts and reads `accesstoken` raw; no use of the existing `encryptToken` | `code` |
| H-7 | JWT in `localStorage` + unsanitized markdown + mermaid `loose` | CC6.1/CC6.7/CC7.1 | ☐ open | `June` — **not re-verified** |
| H-8 | Database TLS verification disabled | CC6.7 | **☐ open** — `rejectUnauthorized: false` at `src/db/client.ts:31` and `mcp-server/src/db/connection.ts:8` | `code` |
| H-9 | Production services connect as an `rds_superuser` role | CC6.1 | **☑ remediated 2026-08-02** — both production services now connect as `wxkanban_app`: DML-only, owns nothing, `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`, no `CREATE` on schema or database. Verified by live connection census: zero AWS sources remain on `ccscowboy`. See §H-9 detail below | `live` |

### H-9 detail — least-privilege database roles · ☑ remediated 2026-08-02 · verified `live`

Applied via `docs/db-analysis/h9-least-privilege-role.sql`, which carries the full script,
the verification queries, and the rollback.

**One role: `wxkanban_app`.**

| Granted | Withheld |
|---|---|
| `SELECT/INSERT/UPDATE/DELETE` on all 129 public tables | `SUPERUSER`, `CREATEDB`, `CREATEROLE`, `BYPASSRLS` |
| `USAGE, SELECT` on all 18 sequences | `CREATE` on schema `public` — so it owns nothing there |
| `CONNECT` on `"wxKanban"` only (8 other databases share the instance) | `TRUNCATE`, `REFERENCES`, `TRIGGER` |
| `CREATE` on the *database*, for `wxktest_*` clone schemas | any DDL against `public` |

Scope was measured, not assumed: all 133 raw-SQL sites under `src/server` were checked and
the application issues **zero** DDL at runtime — no `CREATE`/`DROP`/`ALTER`/`TRUNCATE`/`GRANT`.
The only DDL is the `/preTest` clone engine, confined to `wxktest_*` schemas.

**Note the distinction that carries the control:** `CREATE ON DATABASE` (granted, permits
`CREATE SCHEMA`) is not `CREATE ON SCHEMA public` (withheld). The role can build its own
clone schemas but cannot create anything in `public`, so it owns nothing there and the RLS
precondition holds.

**A two-role design was applied and then deliberately reversed the same day.** The first
version added `wxkanban_test` — same clone ability but read-only on `public` — so that a seed
escaping its clone would fail with a hard `42501` rather than silently write production (the
clone `search_path` is `<clone>,public`, with production as the *fallback*). That is the
stronger posture and it was working. It was dropped because wxKanban ships as a kit and
adopters will run a **single connection string**: mandating two roles would mean the author's
instance runs a configuration no customer runs, leaving the path everyone else is on
untested. The write-isolation guarantee is therefore code-level — `tests/seeds/harness.ts`
refuses any schema outside `wxktest_` and verifies `current_schema()` — which is precisely
the protection a customer has. Recorded here because it is a *reduction* in control strength
chosen for a stated reason, not an oversight.

**Verification — automated checks plus live traffic.** All **129 of 129** tables usable
(`SELECT/INSERT/UPDATE/DELETE`), **18/18** sequences, **0** tables owned in `public`,
`CREATE`-on-`public` **false** while `CREATE`-on-database is **true**, all four role
privilege booleans **false**, default privileges recorded for **both** table owners. Then
exercised through real routes against both owner families — signin reading `userprofiles`
and the Consultant Dashboard reading `customers`/`externalconnections` — because the two
families fail independently and only real traffic touches both.

The verification queries themselves are part of the evidence: they are written to survive the
three traps below, and `docs/db-analysis/h9-least-privilege-role.sql` carries them so the
check is reproducible rather than a one-off.

**Post-cutover connection census** (the actual proof, not the config):

| Role | Source | Connections |
|---|---|---|
| `wxkanban_app` | `3.143.196.191` — app service | 12 |
| `wxkanban_app` | `3.129.176.46` — hosted MCP | 3 |
| `ccscowboy` | operator workstation only | 1 |

**Zero AWS sources remain on `ccscowboy`.** It is retained as table owner and as the role
that applies schema changes by hand under SCOPE-117 — not demoted, but no longer reachable
from the internet-facing tier.

**Three latent traps were found and are documented in the script**, each of which would have
produced a false "all clear" at cutover:

1. `ccscowboy` and `postgres` are *siblings* — both members of `rds_superuser`, neither a
   member of the other. No single session can grant everything, and `SET ROLE` cannot bridge
   it. The work splits across two sessions by necessity.
2. `information_schema.table_privileges` only shows rows where the querying role is grantor
   or grantee, so it **hides every cross-owner grant** — it reported nothing for `customers`
   while the raw `relacl` showed the grant present. All checks use `has_table_privilege()`.
3. `has_*_privilege()` with a constructed name string fails on catalog relations because the
   planner may evaluate the function before the schema filter. Checks pass OIDs instead.

**This unblocks NEW-5.** With the application connecting as a non-owner, RLS policies will
apply without `FORCE ROW LEVEL SECURITY` on all 129 tables.

### Medium

M-1 … M-11 carried from June, **not re-verified**, except:

| ID | Finding | Status | Verified |
|---|---|---|---|
| M-9 | No rate limit on `/api/auth/signin` | **☐ open** — the route has `validateBody` only | `code` |
| M-12 | No account lockout on login | **☑ remediated** (3 attempts → 15-min lock, APP 1.5.131) | `June` |
| M-3 | Hosted MCP secrets are plain App Runner env vars, none in Secrets Manager | ☐ open | `June` |

---

## 5. Control coverage — what was and was not assessed

An auditor's first question about an automated assessment is what it could not see. Stated plainly:

### Assessed by measurement

| Area | How |
|---|---|
| Schema integrity, declared vs deployed | Automated, full — 129 tables |
| Referential integrity, orphans, cross-tenant row consistency | Automated, full |
| Data health (empty tables, null density) | Automated, full |
| Index strategy and unused indexes | Automated — **degraded**, see below |
| Maintenance, vacuum, transaction-ID wraparound | Automated, full |
| Connecting-role privilege and role chain | Live query, today |
| Row-level-security coverage | Live query, today |
| The `list_my_feedback` access path | Manual code review + live execution |

### **Not** assessed

| Area | Why it matters |
|---|---|
| **Database roles, grants, `PUBLIC` grants, default privileges** | The security dimension of the analyzer is not built. Only the connecting role was checked, by hand |
| **Encryption at rest / key management** | Not examined in this pass |
| **Every other MCP tool taking a caller-supplied `projectId`** | NEW-1 was found in one handler. `answer_feedback` and `manage_my_feedback` were checked and are sound. **The remaining tools were not audited** |
| Application access paths generally | Only the feedback path was reviewed today |
| H-4, H-5, H-7 and M-1…M-11 | Carried from June without re-verification |

### Assessment quality caveat

**88 of 129 tables have never been analyzed**, so any finding reasoning about table size or index
usage is degraded — the analyzer's own findings read *"row count unknown"* in places, and the
`unused-index` counts should not be acted on until statistics exist.

**Scoped honestly:** the 88 are the *small* tables — the largest holds **50 rows**, most hold 2–50.
They have never been analyzed because autovacuum's threshold is `50 + 10% of rows`, which a 20-row
table never reaches. That is autovacuum behaving correctly, not a maintenance failure. The large
tables — `mcprequestaudit` at 387k rows — **are** analyzed, merely stale (the report quoted an
estimate of 386,423 against an exact count of 387,658).

This caveat therefore bounds the *analyzer's* precision, not the database's health. Remediation is
`ANALYZE`, the first item in [`docs/db-analysis/FIX-LIST.md`](../docs/db-analysis/FIX-LIST.md).

### Tooling reliability

The automated analyzer produced six critical findings. On verification: **two were correct**, one
was **misdiagnosed with a remediation that would have caused a production outage** (an inferred
foreign key pointed at the wrong parent table), and three were a **deliberate architectural pattern
misread as data exposure**. A separate real problem of comparable size — 35,385 orphaned rows,
still accruing — was not raised at all.

This is recorded because an evidence pack that cites an automated tool must also state that tool's
observed accuracy. No finding in this pack rests on automated output alone.

---

## 6. Recommended order

1. **NEW-3** — populate `outcome` on scope violations. Small, and without it NEW-1's detection is
   half-built.
2. ~~**H-9** — least-privilege application role.~~ **☑ DONE 2026-08-02.** Both production
   services now connect as `wxkanban_app`; zero AWS sources remain on `ccscowboy`. This was a
   hard prerequisite for NEW-5, which is now unblocked. See the H-9 detail section above.
3. ~~**C-2** — remove the committed tokens.~~ **☑ DONE 2026-08-03.** Both files deleted. The
   signing secret was *not* reused: neither leaked token validates against the current
   `JWT_SECRET`, and both had expired months earlier. Downgraded Critical → Low in hindsight.
4. ~~**H-1** — authenticate the payment endpoints.~~ **☑ DONE 2026-08-03**, by deleting them.
   `/validate`, `/setup-intent` and `/process` were all unauthenticated and all unreferenced by
   client code. Applied out of band, not through `implement` — there is no scope covering them.
5. **NEW-4** — extend the drift gate to columns, or stop treating a green run as coverage.
6. **H-8, H-6** — TLS verification; encrypt PM tokens at rest.
7. **H-2 follow-through** — audit the remaining MCP tools that accept a caller-supplied
   `projectId`. NEW-1 demonstrates the class is not closed. **Partly addressed 2026-08-03:** the
   scoped-query wrapper is now used by every write in the tool surface (H-4 was the last hold-out),
   and `_meta` can no longer be forged (NEW-8). What remains is the read side and any handler that
   resolves a project outside the wrapper.
8. **NEW-5** — RLS on the 27 `companyid` tables. **H-9 has landed, so this is ready to start.**
   The 42 `projectid` tables are a separate call once the join-policy cost is measured. Note
   RLS also needs `SET LOCAL` per *transaction* — per-connection context leaks under a pool.
9. **Wire the dormant direct-DB gate** — `mcp-server/scripts/check-no-direct-db.sh` exists (written
   for Spec 028 / T011 to enforce exactly the rule H-4 broke) but is referenced by **no package
   script and no CI workflow**, so it has never run. Same shape as SCOPE-118: a control that
   exists, is documented as enforcement, and gates nothing.

---

## 7. Reproducing this evidence

```sql
-- NEW-5: RLS coverage
select count(*) as public_tables,
       count(*) filter (where relrowsecurity) as with_rls
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r';

-- H-9: connecting role privilege chain
select current_user,
       (select rolcreaterole from pg_roles where rolname = current_user) as can_create_role,
       (select rolcreatedb   from pg_roles where rolname = current_user) as can_create_db;
select r.rolname as member_of
  from pg_auth_members m
  join pg_roles r on r.oid = m.roleid
  join pg_roles u on u.oid = m.member
 where u.rolname = current_user;

-- NEW-2: cross-project requests, now detectable
select tool, projectid, requestedprojectid, outcome, createdat
  from mcprequestaudit
 where requestedprojectid is not null
   and requestedprojectid is distinct from projectid
 order by createdat desc;

-- Assessment caveat: tables never analyzed
select count(*) from pg_stat_user_tables where last_analyze is null and last_autoanalyze is null;
```

All queries are read-only. The database probes supporting this pack were executed under
`default_transaction_read_only = on`, set and independently verified before each run.

**Related artifacts**

- [`docs/db-analysis/FIX-LIST.md`](../docs/db-analysis/FIX-LIST.md) — prioritised remediation plan
- [`docs/db-analysis/latest.md`](../docs/db-analysis/latest.md) — full 440-finding run
- [`specs/117-production-schema-integrity/schema-change-log.md`](../specs/117-production-schema-integrity/schema-change-log.md) — applied schema changes
- [`SOC2_SECURITY_AUDIT_2026-06-22.md`](./SOC2_SECURITY_AUDIT_2026-06-22.md) — June assessment
