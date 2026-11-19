# Plan: SysAdmin Action Audit Trail

**Spec Number**: 147
**Date**: 2026-10-25
**Scope**: `specs/Project-Scope/147-sysadmin-action-audit-trail.md` (validatescope 100)
**Ships**: one app push (server and client). The FR-008 revoke is applied by the owner **after** that deploy.

## Implementation Plan

### Phase 1 — The mechanism (T001, T002, T003)

1. **T001** — the registry plus the route-enumeration test. Write the test first, against today's routers: it should fail listing all 84, which is the to-do list for T004/T005.
2. **T002** — `recordSysAdminAction`. It records on `res.on('finish')` with `statusCode` 2xx only, so a route keeps its own response code paths, and a 4xx/5xx writes nothing by construction. Before-state comes from the registry entry's optional loader, which runs before the handler.
3. **T003** — redaction, applied inside T002 before any insert, so no route can bypass it.

### Phase 2 — Wiring (T004, T005)

Declare each route in the registry and mount the mechanism from it. Do it file by file: `sysadmin.ts` first, then the seven others.

### Phase 3 — Review surface (T006, T007)

The endpoint, then the page. Check that the Dashboard link lands on the page.

### Phase 4 — Verification (T008, T009, T010)

1. Route tests (T008).
2. Deploy (owner's push), then the live toggle-and-revert (T010).
3. The owner applies the revoke (T009); re-verify that a change to an audit row is refused.

## Gates

- The route-enumeration test is green; every `readOnly` entry has a reason.
- `auditfences` is clean on the touched files.
- Both bundles build, and the new page is present in the built client bundle.
- **Owner approval to push.** The revoke is applied only after the deploy is verified.

## Known Issues

- **The Change Impact boundary will gate each of the 8 router files**, and asks once per edit. Batch the approval request per file with the full list of routes being declared.
- **Not every route in those files is SysAdmin-guarded.** `marketingLinks.ts`, for example, also serves public link redirects. The registry covers only routes whose middleware chain includes `requireSysAdmin`; the enumeration test decides that from the router stack, not from the file.
- **AI generation routes** in `marketingAi.ts` may store nothing; declare each as `readOnly` with a reason, or record it if it persists a draft. Decide per route from the handler, never by name.
- **The company-delete cascade** (`ON DELETE CASCADE` from companies) still destroys a deleted customer's own history. Rows written here are filed under the SysAdmin's company and survive. Noted, not fixed.
- **Unit tests can hit the production DB** (memory). Route tests stub the service layer and the db client explicitly.
- **SysAdmin identity:** the acting SysAdmin's company is `req.companyid`. A SYSADMIN with no company would write no row; log an error-level line, as `recordAuditLibraryWrite` does in SCOPE-146.
- **Timestamps:** `companyauditlogs.timestamp` is `timestamp without time zone`, which reads shifted locally (memory). Filter `from`/`to` in UTC on the server.

## Compliance (SOC2)

| Control | Where it is met |
|---|---|
| CC7.2 audit trail | T002, T004, T005; kept true by T001 |
| CC7.2 store the actor cannot alter | T009 |
| CC7.2 log monitoring | T002 (loud failure), T006 |
| CC6.3 least privilege | T006 and T007 are SYSADMIN-only |
