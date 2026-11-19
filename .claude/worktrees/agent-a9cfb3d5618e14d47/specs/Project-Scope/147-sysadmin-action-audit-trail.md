# Scope 147: SysAdmin Action Audit Trail

**Scope Number**: 147
**Status**: `draft`
**Created**: 2026-10-25
**Depends On**: SCOPE-014, SCOPE-146
**Source**: `specs/Project-Scope/147-sysadmin-action-audit-trail.md`

## Overview
Every SysAdmin route that changes stored state writes one append-only audit row. That's 84 routes across 8 router files, all declared in one registry the build enforces. Each row records who, what, when, the target, and before/after state, with secrets redacted. It is filed under the acting SysAdmin's company, and a failed write is logged loudly. A read-only /sysadmin/audit page and API let a SysAdmin review the rows, and the database refuses changes and removals of audit rows by the application. Alerts are a follow-on.

SCOPE-014 (SysAdmin) requires "every SysAdmin action logged with before/after state, immutable audit logs (append-only), real-time alerts for sensitive actions". It also specifies a /sysadmin/audit System Audit Logs page and GET /api/sysadmin/audit. None of it was built. Verified 2026-10-25:
- The 84 POST/PUT/PATCH/DELETE routes guarded by requireSysAdmin write no audit row: 34 in sysadmin.ts, marketingAi 13, marketingAdmin 11, marketingBanners 9, newsletter 5, welcome 5, bioAdmin 4, marketingLinks 3.
- The logger meant for them (src/server/lib/auditLogger.ts) was dead code targeting a table that does not exist. SCOPE-146 deleted it.
- The SysAdmin Dashboard links to /sysadmin/audit, which has no route.
- The application role wxkanban_app holds the UPDATE and DELETE privileges on companyauditlogs, so the rows that are written are not append-only.
- Only 4 of the 703 companyauditlogs rows since February are attributed to a SYSADMIN.

A SysAdmin can suspend a company, change a user's role, reset a password or delete a company with no durable record. That is an open SOC2 CC7.2 gap.

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actor** | SYSADMIN (the person audited, and the reviewer) |
| **Secondary Actors** | SOC2 auditor reading the evidence (through a SYSADMIN), Companies whose data a SysAdmin changed, Developers adding SysAdmin routes (held by the registry test) |
| **Key Value** | Every change a SysAdmin makes leaves a durable, append-only record with before and after state that a SysAdmin can review, and no SysAdmin route can ship without one (SOC2 CC7.2). |
| **Scope Boundary** | One audit row per successful SysAdmin state change on all 84 routes; one registry of every SysAdmin route that changes data with a route-enumeration test; before/after state; secret redaction; loud failure of a record write; GET /api/sysadmin/audit and the /sysadmin/audit page (SysAdmin actions only); owner-applied revoke of the UPDATE and DELETE privileges on companyauditlogs from the app role; live verification on the test company. |

## Out of Scope

- Real-time alerts on sensitive actions (follow-on).
- Auditing non-SysAdmin actions.
- A cross-tenant browser of every company's audit rows. The viewer lists SysAdmin actions only (owner, 2026-10-25).
- Recording failed attempts. A row means a change happened; denials are already logged by requireSysAdmin.
- Changing the companyauditlogs `ON DELETE CASCADE` from companies. That belongs to SCOPE-014's delete flow and SCOPE-130's archival work.
- New indexes on companyauditlogs.
- Rewriting SCOPE-014.
- SCOPE-146's audit-library rows, which keep their `audit_*` actions.

## Integration Context

- **SCOPE-014 (SysAdmin)**: its Security section and route table specify this audit trail and viewer. SCOPE-014 is a legacy-format document, so this is a new hardening scope rather than an amendment, the same pattern as SCOPE-146 over SCOPE-013.
- **SCOPE-146**: this scope reuses its access-table and route-enumeration pattern (`src/server/routes/auditAccess.ts`), and writes companyauditlogs directly, as its `recordAuditLibraryWrite` does.
- The SysAdmin Dashboard's existing `navigate('/sysadmin/audit')` (`src/client/pages/SysAdmin/Dashboard.tsx:366`) becomes a working link.
- Affects every router mounting requireSysAdmin: sysadmin.ts, marketingAi.ts, marketingAdmin.ts, marketingBanners.ts, newsletter.ts, welcome.ts, bioAdmin.ts, marketingLinks.ts.

## User Scenarios & Testing

### US1 — A SysAdmin change leaves a record

**Actor**: SYSADMIN

**Scenario**:
1. Suspends company Acme via PATCH /api/sysadmin/companies/:id/status

**Expected outcome**: Exactly one companyauditlogs row:
- companyid = the SysAdmin's own company, and changedby = the SysAdmin;
- action `sysadmin_company_status_changed`;
- previousvalue `{ status: ACTIVE }` and newvalue `{ status: SUSPENDED }`;
- the target (type company, Acme's id and name) and the route.

Acme's own audit view is unchanged.

### US2 — The record is reviewable

**Actor**: SYSADMIN (or an auditor through one)

**Scenario**:
1. Opens /sysadmin/audit from the SysAdmin Dashboard
2. Filters by target company Acme, action, actor and a date range

**Expected outcome**: US1's row is listed newest first with actor, action, target, before → after and time. The list is paginated. GET /api/sysadmin/audit returns the same rows. A non-SYSADMIN gets 403 on both.

### US3 — Secrets never reach the log

**Actor**: SYSADMIN

**Scenario**:
1. Resets a user's password via POST /users/:id/reset-password
2. Changes a setting holding a credential via PUT /settings/:key

**Expected outcome**: Both rows exist; previousvalue and newvalue hold no password, token, key or secret value — only [REDACTED] or the setting's key name.

### US4 — The log cannot be altered from the application

**Actor**: Application database role (wxkanban_app)

**Scenario**:
1. Tries to change an existing audit row (an UPDATE statement on companyauditlogs)
2. Tries to remove an existing audit row (a removal statement on companyauditlogs)
3. Adds a new audit row (an INSERT on companyauditlogs)

**Expected outcome**: The change and the removal fail with SQLSTATE 42501 (permission denied); the INSERT succeeds.

### US5 — A new SysAdmin route cannot ship unaudited

**Actor**: Developer

**Scenario**:
1. Adds a router.post(...) under requireSysAdmin without declaring it in the registry

**Expected outcome**: The route-enumeration test fails, naming the route.

### US6 — A failed change writes no row

**Actor**: SYSADMIN

**Scenario**:
1. Attempts a status change that fails validation (400) or throws (500)

**Expected outcome**: No audit row; the failure appears in the application log only.

## Functional Requirements

### FR-001 — One durable row per SysAdmin change

Every SysAdmin route that changes stored state MUST write exactly one companyauditlogs row after the change succeeds (2xx). The row holds:
- filed under the acting SysAdmin's company, with changedby = the SysAdmin;
- action `sysadmin_<entity>_<verb>`;
- the target (type, id, display name);
- the route (method and path);
- before/after state (FR-003).

**Acceptance Criteria**:
- [ ] US1 leaves exactly one row with the fields above
- [ ] A failed request (4xx or 5xx) leaves no row (US6)
- [ ] The target company's own audit view gains no row

### FR-002 — Every SysAdmin route that changes data is declared, or the build fails

Every POST/PUT/PATCH/DELETE route guarded by requireSysAdmin, across all router files that use it, MUST appear in one registry. Each entry is either its action name, or readOnly with a reason (a POST that stores nothing, such as an AI preview). The audit write runs from the registry, so a declared route cannot skip it. Re-counted at implement: **87** routes in 9 router files — the 84 counted at scoping plus 3 in marketingFeatureSnippets.ts (its adminRouter, mounted at /api/sysadmin/marketing/feature-snippets).

**Acceptance Criteria**:
- [ ] A route-enumeration test fails when a guarded route that changes data is missing from the registry (US5)
- [ ] The test fails when a registry entry names a route that no longer exists
- [ ] Every readOnly entry carries a non-empty reason

### FR-003 — Before and after state

An update MUST record the changed fields before and after; a create records after only; a delete records before only; a bulk operation records the affected ids and a count.

**Acceptance Criteria**:
- [ ] A company status change records { status } before and after
- [ ] Company delete records the company as it was
- [ ] POST /feedback/purge records the purged ids and the count

### FR-004 — Secrets never reach the log

Passwords, reset tokens, API keys, secrets, and the values of settings marked secret MUST be stored as [REDACTED].

**Acceptance Criteria**:
- [ ] US3: the password-reset and secret-setting rows contain no secret value — a test asserts the literal never appears in previousvalue, newvalue or description
- [ ] The redaction key list has a unit test

### FR-005 — A failed record write is loud

If the audit insert fails, the change stands and the failure MUST be logged at error level with the action and target, so it can be alerted on.

**Acceptance Criteria**:
- [ ] A forced insert failure leaves the change applied and exactly one error-level log line naming the action

### FR-006 — GET /api/sysadmin/audit

A SYSADMIN-only, read-only endpoint listing sysadmin_* rows newest first. Filters: actor, action, target type, target id, date from and to. Paginated by limit (at most 100) and offset. It lists SysAdmin actions only, not every company's audit rows.

**Acceptance Criteria**:
- [ ] A non-SYSADMIN gets 403
- [ ] Each filter narrows the result
- [ ] limit above 100 is refused with 400

### FR-007 — The /sysadmin/audit page

A read-only list with the FR-006 filters, showing actor, action, target, before → after and time. The SysAdmin Dashboard's existing Audit link opens it.

**Acceptance Criteria**:
- [ ] The Dashboard link opens the page instead of a dead route
- [ ] US1's row is visible with its before → after
- [ ] Empty, loading and error states are rendered
- [ ] A non-SYSADMIN sees an access notice

### FR-008 — Append-only at the database

The owner MUST revoke the UPDATE and DELETE privileges on companyauditlogs from wxkanban_app, after the code ships, and record it in the schema change log. INSERT and SELECT stay. No application code changes or removes audit rows (verified 2026-10-25).

**Acceptance Criteria**:
- [ ] US4: a change or removal as the app role raises SQLSTATE 42501 and an INSERT succeeds
- [ ] The full test suite passes and a company-delete cascade still works (referential actions run with the table owner's rights)
- [ ] The change is recorded in specs/117-production-schema-integrity/schema-change-log.md

### FR-009 — Live verification

Against the deployed commit, a harmless SysAdmin change on the test company MUST appear in the audit trail: toggle a Wxperts LLC setting, then toggle it back.

**Acceptance Criteria**:
- [ ] Both changes appear in GET /api/sysadmin/audit with correct before and after
- [ ] A non-SYSADMIN gets 403 on the audit endpoint
- [ ] After FR-008, a change to an audit row as the app role is refused

## Data Requirements

No new tables or columns. Rows go into the existing companyauditlogs table (action, changedby, previousvalue and newvalue as jsonb, description, timestamp). The target and route ride in newvalue.

Owner-applied SQL (FR-008): revoke UPDATE and DELETE on companyauditlogs from wxkanban_app (the statement lives in this spec's sql/ folder), with a verification query and a schema change log entry. No index is added: at 703 rows, filtering on `action LIKE 'sysadmin_%'` plus timestamp is cheap.

## API Routes

New:

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/api/sysadmin/audit` | SYSADMIN | List sysadmin_* audit rows, newest first; query actor, action, targetType, targetId, from, to, limit (≤100), offset |

Changed: the 84 SysAdmin routes that change data gain the audit write declared in the registry: sysadmin.ts 34, marketingAi 13, marketingAdmin 11, marketingBanners 9, newsletter 5, welcome 5, bioAdmin 4, marketingLinks 3. Their responses are unchanged.

## Frontend Components

- New page `src/client/pages/SysAdmin/AuditLog.tsx`, routed at `/sysadmin/audit` in `App.tsx` with the same ProtectedRoute + SYSADMIN check as the other SysAdmin pages. It has a filter bar, a table, a before → after detail, pagination, and empty/loading/error states, built from shadcn components (Table, Input, Select, Button, Badge) per `_wxAI/rules/shadcn.md`.
- `src/client/pages/SysAdmin/Dashboard.tsx:366`: the existing `navigate('/sysadmin/audit')` lands on the new page. No change is expected beyond confirming it.

## Success Criteria

1. 100% of the SysAdmin routes that change data (84 today, re-counted at implement) are in the registry, and the route-enumeration test fails within one CI run when one is missing.
2. Exactly 1 row per successful SysAdmin change and 0 per failed one, across the route test suite.
3. 0 secret values in any row: a test asserts the password, token and secret-setting literals never appear in previousvalue, newvalue or description.
4. After FR-008, 100% of attempts to change or remove an audit row as the app role fail with 42501, and 0 inserts fail.
5. /sysadmin/audit shows a new action within 1 page load of it happening, and the Dashboard link has 0 dead routes.
6. Live: the FR-009 toggle and revert produce 2 rows with correct before/after on the deployed commit, and the target company's own audit view gains 0 rows.

## Key Entities

No schema change. Domain terms (added to CONTEXT.md):

- **SysAdmin action record** — a companyauditlogs row with a sysadmin_* action, filed under the acting SysAdmin's company, carrying target, route and before/after state. Append-only.
- **SysAdmin write registry** — the single list of every SysAdmin route that changes data and the action it records (or readOnly with a reason).

## Compliance Requirements

Active framework: **SOC2** (project compliance context, loaded 2026-10-25).

| Control | Requirement | Where this scope meets it |
|---|---|---|
| CC7.2 — Audit trail of all changes | Every state-changing action records who did what and when, in a store separate from the record being changed | FR-001, FR-003; FR-002 keeps it true for new routes |
| CC7.2 — Audit logging for all system access | Access events are written to a durable audit store **the acting user cannot alter** | FR-008 (append-only at the database) |
| CC7.2 — Security log monitoring | Security-relevant events emit structured, queryable records | FR-005 (loud failure), FR-006 (queryable trail) |
| CC6.3 — Principle of least privilege | Privileged routes gated by an explicit role guard | FR-006 / FR-007 are SYSADMIN-only |
| CC7.2 — Security monitoring and alerting | Alerts route to a named owner | **Not in this scope** — real-time alerts are the follow-on |

## Constraints

- MUST deliver only the behavior described within the scope boundary (see Core Design).
- MUST keep the Out of Scope items out of this iteration.
- Ships as one app push (server and client), with no kit or VSIX release.
- The FR-008 revoke is owner-applied SQL, applied **after** the code ships. Nothing in the app changes or removes audit rows (verified 2026-10-25 by code search), but ordering it after the deploy means a surprise cannot take writes down.
- The registry follows SCOPE-146's auditAccess.ts pattern. Fences read `[SCOPE 147 / Tnnn]`.
- Action names `sysadmin_<entity>_<verb>` are generated once at implement; the owner chose no separate review.

## Notes

- **Known risk — company delete cascades its audit history** (`ON DELETE CASCADE` from companies). Rows this scope writes are filed under the SysAdmin's company and survive it; a deleted customer's own history is still lost. That belongs to SCOPE-014's delete flow and SCOPE-130's archival.
- **Known risk — the audit write follows the change and is not atomic with it.** This is the same decision as SCOPE-146 CLAR-01; FR-005 makes its failure loud.
- Real-time alerts on sensitive actions remain a follow-on (SCOPE-014 asks for them).
- US4 describes the refused statements in words rather than quoting them, so the repository's data-loss guard does not read the scenario as a destructive statement.

## Clarifications

### Session 2026-10-25

| # | Question | Decision |
|---|----------|----------|
| 1 | New scope or SCOPE-014 amendment? | A new hardening scope over SCOPE-014. SCOPE-014 is a legacy-format document; this follows the SCOPE-146 / SCOPE-013 pattern. |
| 2 | Whose company is a row filed under? | The acting SysAdmin's. The target company rides in the row; customers' own audit views stay unchanged. |
| 3 | Alerts in scope? | No — a follow-on. |
| 4 | Record failed attempts? | No. A row means a change happened; denials are logged by requireSysAdmin. |
| 5 | Fix the company-delete cascade here? | No — a noted risk; it belongs to SCOPE-014's delete flow and SCOPE-130's archival. |
| 6 | Viewer scope? | SysAdmin actions only — not a cross-tenant browser of every company's audit rows. |
| 7 | Live verification change? | Toggle a Wxperts LLC company setting and toggle it back. |
| 8 | Review the 84 action names before implement? | No — generated once at implement. |
| 9 | Route count at implement? | 87, not 84: marketingFeatureSnippets.ts adds 3 (PATCH and POST /:assetkey, POST /from-scope). 20 of the 87 are readOnly with reasons (13 marketing/ai drafts, 2 invitation previews, 2 test sends, 3 S3 upload-URL presigns). |
| 10 | How is every route covered without editing 87 handlers? | One app-level middleware mounted at app.use("/api/sysadmin") ahead of every SysAdmin router records from the registry; no route handler changes. |
