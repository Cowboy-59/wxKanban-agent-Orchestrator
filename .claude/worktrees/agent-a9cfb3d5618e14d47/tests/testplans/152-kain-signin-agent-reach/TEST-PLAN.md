# Test Plan: K.A.I.N. Sign-in and Agent Reach (SPEC-152, SCOPE-132 Amendment F)

**Status**: items written, NOT filed (manifest-confirm gate pending). **Date**: 2026-10-29. **Spec**: `specs/152-kain-signin-agent-reach/spec.md` (FR-064 to FR-075). **Authors**: Principal QA Architect and Senior Database Engineer personas.

The JSON is authoritative: `test-items.json`. This file renders from it.

## 1. Scope

In scope: the sign-in route, device tokens and their lifecycle, `agentReach` and its four uses (grants, connect, MCP re-check, `list_agent_connections`), retiring company tokens and ticks, device lists and revoke, the client's Reachable-by line, the audit rows, docs and help, the cross-company release gate, and review fixes 1 to 3.

Out of scope (as the spec): second-factor sign-in, myndSynergy sign-in, SpokAI's own panel and store, the room protocol (Amendment E), a consent switch, a paste-a-token option. The rest of SCOPE-132 (Amendments A to E, other FRs) was declined at the Phase-2A gate (Option A).

## 2. Totals

- Items: **80** (cap 250). By area: API 12, AUTH 9, DB 18, FLOW 9, FN 14, MCP 9, SEC 4, UI 5.
- Gate: crud 20, smoke 31, ui-flow 8, unit 21. Layer: app 62, data 18. Tier: crud-nonprod 20, manual 3, playwright 5, unit-mocked 52.
- Variant: boundary 8, concurrency 4, happy 31, negative 19, permission 5, recovery 13. Priority: P1 55, P2 24, P3 1. Executor: human 3, machine 77.
- Data categories: concurrency 1, data-security 3, migration-rollback 2, performance-scale 1, referential-integrity 4, schema-constraint 3, transaction-integrity 4.
- Existing coverage: full 14, partial 16, none 50.
- Release gates (FR-075 tests 1, 3, 6): TC-MCP-003-N1 (supports tests 1 and 6); TC-MCP-004 (test 3 (MCP places)); TC-FLOW-001 (test 6 (blocks release)); TC-FLOW-002 (test 1 (blocks release)); TC-FLOW-003 (test 3 (blocks release; MCP places are TC-MCP-004, live state is TC-DB-015)); TC-DB-013 (supports test 6 (blocks release)); TC-DB-014 (test 1 against SQL (blocks release)); TC-DB-015 (test 3 against SQL (blocks release)).

## 3. Requirement traceability

| FR | Primary items | Also covered by |
|---|---|---|
| FR-064 | TC-AUTH-001, TC-AUTH-001-B1, TC-AUTH-001-N1, TC-AUTH-001-R1, TC-SEC-001, TC-SEC-002, TC-SEC-003, TC-SEC-004, TC-DB-010 | TC-FLOW-006 |
| FR-065 | TC-FN-001, TC-FN-002, TC-FN-002-N1, TC-FN-003, TC-FN-005, TC-AUTH-002, TC-AUTH-003, TC-AUTH-003-R1, TC-AUTH-004, TC-AUTH-005, TC-FLOW-006, TC-DB-001, TC-DB-002, TC-DB-003, TC-DB-004, TC-DB-005, TC-DB-006, TC-DB-007, TC-DB-008, TC-DB-011 | TC-DB-009, TC-DB-010, TC-DB-012 |
| FR-066 | TC-FN-010, TC-FN-010-N1, TC-FN-011, TC-FN-011-N1, TC-DB-017 | TC-FLOW-001, TC-FLOW-002, TC-FLOW-007, TC-FLOW-010, TC-FLOW-011, TC-DB-013, TC-DB-014, TC-DB-015 |
| FR-067 | TC-FN-015, TC-MCP-001, TC-MCP-001-N4, TC-MCP-003, TC-MCP-003-B1, TC-MCP-003-N1, TC-MCP-005, TC-DB-013, TC-DB-016 | TC-MCP-004, TC-FLOW-001, TC-FLOW-002, TC-FLOW-003, TC-FLOW-007, TC-FLOW-010, TC-DB-014, TC-DB-015 |
| FR-068 | TC-API-002, TC-API-002-C1 | TC-FLOW-005, TC-FLOW-012 |
| FR-069 | TC-API-020, TC-API-021, TC-MCP-001-N1, TC-UI-010, TC-DB-012 |  |
| FR-070 | TC-FN-011-N2, TC-API-002-N1, TC-API-002-R1, TC-MCP-001-R1, TC-MCP-004, TC-FLOW-007, TC-DB-015 | TC-MCP-001, TC-FLOW-002, TC-FLOW-003 |
| FR-071 | TC-API-030, TC-API-031, TC-API-031-P2, TC-API-031-C1, TC-UI-001, TC-UI-002, TC-UI-003, TC-DB-018 | TC-FLOW-006 |
| FR-072 | TC-FN-013, TC-API-040, TC-UI-011 |  |
| FR-073 | TC-FN-005-R1, TC-API-050, TC-DB-009 | TC-AUTH-001, TC-API-002, TC-FLOW-012, TC-DB-010 |
| FR-074 | TC-FN-070 |  |
| FR-075 | TC-FLOW-001, TC-FLOW-002, TC-FLOW-003, TC-FLOW-005, TC-FLOW-010, TC-FLOW-011, TC-FLOW-012, TC-DB-014 | TC-AUTH-001, TC-SEC-001, TC-AUTH-003, TC-AUTH-004, TC-API-002-C1, TC-API-020, TC-API-031-P2, TC-MCP-004, TC-FLOW-007, TC-DB-013, TC-DB-015 |

Unmapped FRs: none.

## 4. Fixture F152 and the expected reach

Loaded by `sql/seed-f152-parents.sql` and `sql/seed-f152-devices.sql`, removed by `sql/teardown-f152.sql`. Companies OWN (consulting), C1 and C2 (clients with active engagements E1 and E2 with OWN), NONE (no engagement).

| Project | Company | Allow remote | Assignment |
|---|---|---|---|
| P-OWN-1 | OWN | on | none |
| P-OWN-2 | OWN | off | none |
| P-C1-A | C1 | on | whole-Project under E1 (sub-assigned to OWN-SUB) |
| P-C1-B | C1 | on | **none** |
| P-C1-C | C1 | off | whole-Project under E1 |
| P-C1-D | C1 | on | scope-level 'S1' only |
| P-C2-A | C2 | on | whole-Project under E2 |
| P-NONE-1 | NONE | on | none |

| Person | Role | Expected reach |
|---|---|---|
| OWN-ADMIN | ADMIN of OWN | P-OWN-1, P-C1-A, P-C2-A |
| OWN-MGR | TEAM_MANAGER of OWN | P-C1-A, P-C2-A |
| OWN-MEMBER | TEAM_MEMBER of OWN | none |
| OWN-SUB | TEAM_MEMBER of OWN, sub-assigned to A-C1-A | P-C1-A |
| C1-ADMIN | ADMIN of C1 | P-C1-A, P-C1-B, P-C1-D |
| C1-MEMBER | TEAM_MEMBER of C1, on P-C1-A | P-C1-A |
| NONE-ADMIN | ADMIN of NONE | P-NONE-1 |

## 5. Review fixes being made now

- Fix 1: TC-SEC-002, TC-SEC-003, TC-SEC-004
- Fix 2: TC-FN-005, TC-FN-005-R1, TC-AUTH-003, TC-AUTH-003-R1, TC-AUTH-004, TC-AUTH-005, TC-DB-008, TC-DB-009
- Fix 3: TC-MCP-003, TC-MCP-003-B1, TC-MCP-003-N1, TC-DB-016

Fix 1 = sign-in rate limit and equal bcrypt cost. Fix 2 = password change/reset and device sign-out in one transaction, audit per company after commit. Fix 3 = MCP per-call reach reads one Project, uuid compares. At the time of reading, the working tree was partway through fix 2 (`auth.ts` already passes a transaction to `revokeAllForUser`; `AgentDeviceTokenService.ts` did not yet accept one) and fixes 1 and 3 had not landed (`signInUser` throws before bcrypt for an unknown email; the MCP `loadReachFacts` still reads every Project). Items tagged `review-fix-n` assert the agreed behavior and will fail until it lands.

## 6. Test levels and environments

| Layer | Framework | Tier | Items |
|---|---|---|---|
| Rule and service units | Vitest, db and services mocked at the edge | unit-mocked | FN, SEC, AUTH |
| Routes | Vitest + supertest over the real router | unit-mocked | API, AUTH |
| MCP | Vitest (mcp-server), execute() double | unit-mocked | MCP |
| Cross-company matrix | Vitest, one shared fixture, four places | unit-mocked then crud-nonprod | FLOW, DB |
| Data layer | SQL on a disposable clone | crud-nonprod | DB |
| Web UI | Playwright against a non-prod stack (no DOM runner exists, OP-3) | playwright | UI |
| Live | deployed app, SpokAI on phone and laptop | manual | FLOW-010 to 012 |

## 7. Entry and exit criteria

Entry: SPEC-152 code in the tree (done per tasks.md T001 to T012); review fixes 1 to 3 landed; OP-1 resolved before any `crud-nonprod` item runs.

Exit: every P1 item passes; the three release-gate items (test 1 `TC-FLOW-002` plus `TC-DB-014`; test 3 `TC-FLOW-003`, `TC-MCP-004`, `TC-DB-015`; test 6 `TC-FLOW-001`, `TC-DB-013`) pass with 0 over-reach and 0 post-event successes (SC-23, SC-24); `TC-FLOW-010` to `012` signed by the user after deploy; no open High finding (none today).

## 8. Risk register (plan-level)

| Risk | Mitigation in this plan |
|---|---|
| R-17 cross-tenant over-reach (Critical) | TC-FLOW-001/002/003, TC-DB-013/014/015/017; F-01, F-10 |
| R-18 lost phone | TC-API-031, TC-FLOW-006, TC-UI-002 |
| R-19 password guessing | TC-SEC-002/003/004, TC-AUTH-001-N1 |
| R-20 stranded K.A.I.N. | TC-API-020/021, TC-MCP-001-N1 |
| R-21 client cannot see who acted | TC-API-050, TC-FLOW-012 |
| Plan risk: gate tests green on fabricated facts | F-10; DB items on the clone |
| Plan risk: UI layer has no runner | F-18, OP-3 |

## 9. Data Architecture Under Test

Schema version: `specs/152-kain-signin-agent-reach/sql/0001-agentdevicetokens.sql` and `0002-retire-company-agent-tokens.sql`, applied to production by the owner on 2026-10-28/29 (tasks.md Evidence). Object inventory: table `agentdevicetokens` (10 columns), unique index `agentdevicetokens_tokenhash_key`, partial unique index `agentdevicetokens_user_device_live_key`, index `idx_agentdevicetokens_company`, CHECKs `chk_agentdevicetokens_revokereason` and `chk_agentdevicetokens_revoked`, FKs to `userprofiles` and `companies` (both ON DELETE CASCADE). Read-only dependencies: `userprofiles`, `companies`, `companyprojects`, `projectusers`, `projectphases`, `engagements`, `engagementassignments`, `subassignments`, `mcpapitokens`, `companyagenttokens`, `projectagentgrants`, `companyauditlogs`, `passwordresettokens`. Volumetrics: at most a few devices per person; 10000 rows is the 100x bound used in TC-DB-016.

## 10. Test Data Strategy

Generation: fixture F152 (deterministic ids with the `f1520000-` prefix) plus a bulk generator for scale. Anonymization: none; no production extract is used and none is allowed. Refresh: each run re-creates the clone or re-seeds and tears down by prefix; teardown failure is a finding. Passwords: placeholder hashes in the seed; sign-in items set a real bcrypt hash through the harness; the marker password `MARKER-9c1e7d-pw` is a literal that appears in no fixture.

## 11. Database Environment Matrix

| Environment | Engine | Use | Delta from production |
|---|---|---|---|
| Unit tier | none (mocks) | all unit-mocked items | no database |
| Disposable clone (OP-1, chosen 2026-10-30) | PostgreSQL 15+, cloned schema via clone-test-schema.mjs, faithful:true required | all crud-nonprod items | different schema name; roles are cluster-level (OP-4) |
| Production | PostgreSQL | never touched; the repo .env points here | n/a |

## 12. Performance Baselines

Single-Project reach at 100x (5000 Projects): p95 <= 20 ms and no Seq Scan on `companyprojects` or `engagementassignments`; buffers at 100x <= 3 x buffers at 1x. Token hash lookup and company device list on 10000 rows: index scans on the named indexes. These numbers are proposals (the spec sets no SLA); the gate may change them.

## 13. Open preconditions

- **OP-1** Disposable non-prod database target: CHOSEN by the owner 2026-10-30, a throwaway clone from `node _wxAI/skills/wxCreateTestPlan/scripts/clone-test-schema.mjs --create` (wxktest_<id>), proven faithful and non-prod before the first write, dropped after the run. Gates every `crud-nonprod` item (20).
- **OP-2** Review fixes 1 to 3 landed (done 2026-10-29; fix 1 limits are in spec FR-064: 30 per IP, 10 per email, 15 minutes, 429 `too_many_attempts`, body `retryAfter` 900, no Retry-After header).
- **OP-3** A DOM runner (jsdom or happy-dom plus Testing Library) added, or the UI items run in Playwright against a non-prod stack (5 items).
- **OP-4** The clone cluster has role `wxkanban_app` with production-equivalent default privileges (TC-DB-005).
- **OP-5** YappChatt is stubbed at the HTTP edge for every connect item; no real YappChatt, email or SMS call in any tier.
- **OP-6** TC-FLOW-010 to 012 need the release deployed together with SpokAI SCOPE-002 Amendment A, and the owner's phone and laptop.
- **OP-7** (optional) The owner runs the read-only orphan probes of TC-DB-017 against production by hand; the plan never connects to it.

## 14. Coverage honesty

Existing tests already covering an item are recorded in `existingCoverage` (full: 14, partial: 16). Variants and items not written, with reason codes:

| Item | Reason |
|---|---|
| TC-FN-001-R1 | DEFERRED-CAP: covered at the data layer by TC-DB-006 |
| TC-FN-002-R1 | DEFERRED-CAP: LOW; best-effort lastusedat failure (unhandled-rejection risk noted in FINDINGS F-14) |
| TC-FN-004 | DEFERRED-CAP: single UPDATE guard, exercised by TC-API-031 and TC-DB-007 |
| TC-AUTH-001-N5 | DEFERRED-SPEC: parity with web sign-in rests on CLAR-05; filed as a clarification, not a guessed assertion |
| TC-AUTH-006 | DEFERRED-SPEC: CLAR-03 (team reset only emails a link); asserting it would ratify the gap |
| TC-AUTH-007 | DEFERRED-CAP: covered by TC-FN-002-N1 and TC-DB-015 |
| TC-SEC-004-N1 | DEFERRED-CAP: statistical timing; TC-SEC-004 (call count) is the deterministic proof. Offered in the gate |
| TC-AUTH-002-R1 | DEFERRED-CAP: LOW; fail-closed path of one middleware |
| TC-FN-014 | DEFERRED-CAP: loader short-circuits are exercised by TC-DB-013 and TC-DB-015 |
| TC-API-001-N1 | N/A-SINGLE-PARTITION with TC-API-001 (empty list shape folds into its steps) |
| TC-API-001-R1 | DEFERRED-CAP: LOW; 500 body leak check |
| TC-API-002-N2 | DEFERRED-CAP: input validation largely covered by tests/backend/agentConnect.route.test.ts |
| TC-API-003 | DEFERRED-SPEC: yca_ minting belongs to the room protocol (Amendment E); connect only passes the flag |
| TC-API-022 | DEFERRED-CAP: LOW; retired list/revoke kept as before, SCOPE-134 suites to be searched |
| TC-API-031-R1 | DEFERRED-SPEC: CLAR-08 (audit failure policy) must be answered before this can assert anything |
| TC-MCP-002 | DEFERRED-CAP: defense in depth; isDeviceLive person match is exercised by TC-MCP-001 |
| TC-UI-002-R1 | DEFERRED-SPEC: error text unspecified; observed behavior would be ratified |
| TC-FLOW-013 | DEFERRED-CAP: lost-phone by hand; US5 is proven by TC-FLOW-006 and TC-UI-002 |
| TC-API-001 | DEFERRED-CAP: tests/backend/agentConnect.route.test.ts covers grants for a live device; the reach content is asserted by TC-FLOW-001 |
| TC-FN-020 | DEFERRED-CAP: LOW static scan; rows are kept but unread, enforced by TC-API-020/021 and review |
| TC-API-040-N1 | N/A-SINGLE-PARTITION: guardProject is the same 404 guard asserted by the SPEC-145 remote-access suite |

Merged under equivalence partitioning (one item per partition set, sources named in the step tags):

- merged TC-AUTH-001-N2 -> TC-AUTH-001-N1
- merged TC-AUTH-001-N3 -> TC-AUTH-001-N1
- merged TC-AUTH-001-N4 -> TC-AUTH-001-N1
- merged TC-SEC-002-B1 -> TC-SEC-002
- merged TC-SEC-003-R1 -> TC-SEC-002
- merged TC-SEC-003-N1 -> TC-SEC-003
- merged TC-FN-001-N1 -> TC-FN-001
- merged TC-AUTH-004-R1 -> TC-AUTH-003-R1
- merged TC-AUTH-005-R1 -> TC-AUTH-003-R1
- merged TC-FN-010-P1 -> TC-FN-010
- merged TC-FN-010-N2 -> TC-FN-010-N1
- merged TC-FN-011-P1 -> TC-FN-011
- merged TC-FN-012 -> TC-FN-011
- merged TC-FN-011-N3 -> TC-FN-011-N1
- merged TC-API-030-P1 -> TC-API-030
- merged TC-API-031-P1 -> TC-API-031
- merged TC-API-031-N1 -> TC-API-031-P2
- merged TC-API-020-P1 -> TC-API-020
- merged TC-API-021-P1 -> TC-API-021
- merged TC-API-051 -> TC-API-050
- merged TC-FN-070-N1 -> TC-FN-070
- merged TC-MCP-001-N2 -> TC-MCP-001
- merged TC-MCP-001-N3 -> TC-MCP-001
- merged TC-MCP-001-P1 -> TC-MCP-001-N4
- merged TC-MCP-005-N1 -> TC-MCP-005
- merged TC-MCP-005-N2 -> TC-MCP-005
- merged TC-UI-001-N1 -> TC-UI-001
- merged TC-FLOW-020 -> TC-UI-001
- merged TC-UI-012 -> TC-UI-010
- merged TC-FLOW-004 -> TC-FLOW-001

Backup-recovery (DBA category): DEFERRED-SPEC, no RPO/RTO is stated for this table (CLAR-10).

## 15. Items

| ID | Title | FR | Gate | Variant | Pri | Tier | Executor | Existing coverage |
|---|---|---|---|---|---|---|---|---|
| TC-AUTH-001 | POST /api/agent/signin returns 201, a kdt_ token once, and no cookie for valid credentials | FR-064 FR-073 FR-075 | smoke | happy | P1 | unit-mocked | machine | full |
| TC-AUTH-001-B1 | POST /api/agent/signin enforces email, password and deviceName length edges and rejects extra keys | FR-064 | smoke | boundary | P2 | unit-mocked | machine | partial |
| TC-AUTH-001-N1 | POST /api/agent/signin refuses bad password, unknown email, lock and inactive person; issues nothing | FR-064 | smoke | negative | P1 | unit-mocked | machine | partial |
| TC-AUTH-001-R1 | POST /api/agent/signin returns 500 sign-in failed and issues no token when token storage fails | FR-064 | smoke | recovery | P2 | unit-mocked | machine | none |
| TC-SEC-001 | A marker password appears in no response, audit call, log line or table across every sign-in outcome | FR-064 FR-075 | smoke | happy | P1 | unit-mocked | machine | partial |
| TC-SEC-002 | POST /api/agent/signin answers 429 past the per-IP limit, at the edge, and recovers after the window | FR-064 | smoke | negative | P1 | unit-mocked | machine | partial |
| TC-SEC-003 | POST /api/agent/signin answers 429 past the per-email limit from any IPs, lockout untouched | FR-064 | smoke | negative | P1 | unit-mocked | machine | none |
| TC-SEC-004 | An unknown email costs the same single bcrypt comparison as a known email with a wrong password | FR-064 | unit | negative | P1 | unit-mocked | machine | none |
| TC-FN-001 | issue() returns a kdt_ token, stores only its SHA-256, and replaces only the same device name | FR-065 | unit | happy | P1 | unit-mocked | machine | none |
| TC-FN-002 | verify returns the device and person for a live token and moves lastusedat once | FR-065 | unit | happy | P1 | unit-mocked | machine | none |
| TC-FN-002-N1 | verify() returns null with no write for no prefix, unknown, revoked, inactive or relocated devices | FR-065 | unit | negative | P1 | unit-mocked | machine | partial |
| TC-FN-003 | normalizeDeviceName trims, collapses whitespace and accepts 1 to 100 characters only | FR-065 | unit | boundary | P2 | unit-mocked | machine | none |
| TC-FN-005 | revokeAllForUser ends every live device of one person on the caller's transaction | FR-065 | unit | happy | P1 | unit-mocked | machine | none |
| TC-FN-005-R1 | auditRevokeAll writes one agent.device.revoked row per company after commit, none when empty | FR-073 | unit | recovery | P2 | unit-mocked | machine | none |
| TC-AUTH-002 | requireAgentDevice answers 401 missing-token without a bearer and device_signed_out otherwise | FR-065 | smoke | negative | P1 | unit-mocked | machine | full |
| TC-AUTH-003 | POST /api/auth/change-password signs out every K.A.I.N. device in the password transaction | FR-065 FR-075 | smoke | happy | P1 | unit-mocked | machine | none |
| TC-AUTH-003-R1 | A failed device sign-out rolls back the password change on all three password paths | FR-065 | smoke | recovery | P1 | unit-mocked | machine | none |
| TC-AUTH-004 | POST /api/auth/reset-password signs out all devices and spends the reset link in one transaction | FR-065 FR-075 | smoke | happy | P1 | unit-mocked | machine | none |
| TC-AUTH-005 | SysAdmin resetPassword signs out the user's devices on the same transaction, attributed to the admin | FR-065 | unit | happy | P1 | unit-mocked | machine | none |
| TC-FN-010 | computeAgentReach: own-company ADMIN reaches all Allow-remote Projects; members only assigned ones | FR-066 | unit | happy | P1 | unit-mocked | machine | full |
| TC-FN-010-N1 | showAll never widens reach; Allow-remote-off, ARCHIVED, other-company and inactive cases are dropped | FR-066 | unit | negative | P1 | unit-mocked | machine | partial |
| TC-FN-011 | computeAgentReach: consulting managers reach live whole-Project assignments; members sub-assigned | FR-066 | unit | happy | P1 | unit-mocked | machine | full |
| TC-FN-011-N1 | computeAgentReach grants nothing for scope/task assignments, other consultants or mismatched clients | FR-066 | unit | negative | P1 | unit-mocked | machine | full |
| TC-FN-011-N2 | computeAgentReach grants nothing for paused, disabled or ended engagements or removed assignments | FR-070 | unit | negative | P1 | unit-mocked | machine | full |
| TC-FN-013 | consultingCompaniesReaching returns distinct company names for live whole-Project active assignments | FR-072 | unit | happy | P2 | unit-mocked | machine | none |
| TC-FN-015 | The app and MCP computeAgentReach rules return identical sets on every generated fact set | FR-067 | unit | happy | P1 | unit-mocked | machine | full |
| TC-API-002 | POST /api/agent/connect mints a per-device MCP token as the person and audits agent.connect | FR-068 FR-073 | smoke | happy | P1 | unit-mocked | machine | full |
| TC-API-002-N1 | POST /api/agent/connect gives unreachable and nonexistent Projects the same 404 and creates nothing | FR-070 | smoke | negative | P1 | unit-mocked | machine | partial |
| TC-API-002-R1 | A room failure during connect mints no MCP token and revokes no earlier token | FR-070 | smoke | recovery | P2 | unit-mocked | machine | partial |
| TC-API-002-C1 | Two devices connecting to one Project each revoke only their own earlier MCP token | FR-068 FR-075 | smoke | concurrency | P1 | unit-mocked | machine | none |
| TC-API-020 | POST /api/company/agent-tokens answers 410 use_signin to an ADMIN (401/403 others), creates nothing | FR-069 FR-075 | smoke | happy | P1 | unit-mocked | machine | none |
| TC-API-021 | PUT/DELETE agent-access/:agentname answer 410 use_signin to an ADMIN; others get 404/403 first | FR-069 | smoke | happy | P1 | unit-mocked | machine | none |
| TC-API-030 | GET /api/agent/devices and /api/company/agent-devices list live devices per person and company | FR-071 | smoke | happy | P1 | unit-mocked | machine | partial |
| TC-API-031 | POST /api/agent/devices/:id/revoke signs a device out for its owner or company ADMIN, one audit row | FR-071 | smoke | happy | P1 | unit-mocked | machine | full |
| TC-API-031-P2 | Revoking another company's or member's device is 404, malformed id 400, no session 401; no change | FR-071 FR-075 | smoke | permission | P1 | unit-mocked | machine | full |
| TC-API-031-C1 | Two simultaneous revokes of one device give one 200, one 404 and exactly one audit row | FR-071 | smoke | concurrency | P2 | unit-mocked | machine | none |
| TC-FLOW-006 | A revoked phone gets device_signed_out, the laptop keeps working, and the phone can sign in again | FR-065 FR-064 FR-071 | smoke | recovery | P1 | unit-mocked | machine | none |
| TC-API-040 | GET /api/projects/:id/agent-access returns allowRemote, canManageRemote and reachableBy names | FR-072 | smoke | happy | P2 | unit-mocked | machine | full |
| TC-API-050 | Every K.A.I.N. audit row names person and device, no secret; agent.connect files under the Project | FR-073 | unit | happy | P2 | unit-mocked | machine | partial |
| TC-FN-070 | kain-contract.md and help state sign-in, device token, reach and error codes, not the token steps | FR-074 | unit | happy | P3 | unit-mocked | machine | none |
| TC-MCP-001 | authMiddleware admits a live device that still reaches the Project, else 401 with the right code | FR-067 FR-070 | smoke | happy | P1 | unit-mocked | machine | full |
| TC-MCP-001-N1 | authMiddleware answers 401 device_signed_out for retired names, revoked devices and inactive persons | FR-069 | smoke | negative | P1 | unit-mocked | machine | full |
| TC-MCP-001-N4 | authMiddleware fails closed on malformed agent-grant names and null issuer or project | FR-067 | unit | boundary | P2 | unit-mocked | machine | partial |
| TC-MCP-001-R1 | authMiddleware never admits a request when the device or reach query throws (observed failure mode) | FR-070 | smoke | recovery | P1 | unit-mocked | machine | none |
| TC-MCP-003 | The per-call MCP reach check reads only the one Project called, whatever the company's size | FR-067 | unit | happy | P1 | unit-mocked | machine | none |
| TC-MCP-003-B1 | The single-Project reach check compares uuids across case and refuses non-uuid ids without SQL error | FR-067 | unit | boundary | P2 | unit-mocked | machine | none |
| TC-MCP-003-N1 | The single-Project check and the full agentReach agree for every fixture person and Project | FR-067 | unit | negative | P1 | unit-mocked | machine | none |
| TC-MCP-004 | Each FR-070 event refuses the next MCP call and list_agent_connections call, minting nothing | FR-070 FR-067 FR-075 | smoke | recovery | P1 | unit-mocked | machine | partial |
| TC-MCP-005 | list_agent_connections lists a KAIN token's cross-company reach; other tokens see their Project | FR-067 | smoke | happy | P1 | unit-mocked | machine | full |
| TC-UI-001 | My K.A.I.N. devices lists name, signed-in and last-used, shows the empty text, fits 400 px | FR-071 | ui-flow | happy | P2 | playwright | machine | none |
| TC-UI-002 | Revoke asks 'Sign this device out?', posts to the revoke route on confirm, and removes the row | FR-071 | ui-flow | happy | P1 | playwright | machine | none |
| TC-UI-003 | The Company K.A.I.N. devices panel lists every member's devices with owner; absent for non-ADMIN | FR-071 | ui-flow | permission | P2 | playwright | machine | none |
| TC-UI-010 | Project and Settings screens show one Allow remote switch, no K.A.I.N. tick, no token panel | FR-069 | ui-flow | negative | P2 | playwright | machine | partial |
| TC-UI-011 | The 'Reachable by' line names the team, then consulting companies only, with the exact text | FR-072 | ui-flow | boundary | P2 | playwright | machine | none |
| TC-FLOW-001 | Tests 6 and 2: the four places admit exactly what agentReach returns for every fixture person | FR-075 FR-066 FR-067 | smoke | happy | P1 | unit-mocked | machine | partial |
| TC-FLOW-002 | Test 1: no engagement-less company, unassigned or Allow-remote-off Project in any of the four places | FR-075 FR-066 FR-067 FR-070 | smoke | negative | P1 | unit-mocked | machine | partial |
| TC-FLOW-003 | Test 3: each FR-070 event refuses the very next grants and connect call, minting nothing | FR-075 FR-070 FR-067 | smoke | recovery | P1 | unit-mocked | machine | partial |
| TC-FLOW-005 | Test 4: a phone and a laptop both connect to one Project and both stay live | FR-075 FR-068 | crud | concurrency | P1 | crud-nonprod | machine | none |
| TC-FLOW-007 | A client ADMIN turning Allow remote off stops the consultant on the next call in all four places | FR-070 FR-066 FR-067 FR-075 | crud | recovery | P1 | crud-nonprod | machine | none |
| TC-FLOW-010 | Test 7a: the consulting ADMIN on phone and laptop sees the same Projects, own first then each client | FR-075 FR-066 FR-067 | ui-flow | happy | P1 | manual | human | none |
| TC-FLOW-011 | Test 7b: a client member signed in on K.A.I.N. sees only their own company's Allow-remote Projects | FR-075 FR-066 | ui-flow | permission | P1 | manual | human | none |
| TC-FLOW-012 | Test 7c: '[KAIN] STATUS' from the phone gets a worker answer and carries the exact [KAIN] tag | FR-075 FR-068 FR-073 | ui-flow | happy | P2 | manual | human | none |
| TC-DB-001 | agentdevicetokens has 10 declared columns, 2 CHECKs, 4 indexes and the app privileges (column-level) | FR-065 | crud | happy | P2 | crud-nonprod | machine | none |
| TC-DB-002 | tokenhash is unique and at most one live row exists per person and device name | FR-065 | crud | negative | P1 | crud-nonprod | machine | none |
| TC-DB-003 | CHECK, NOT NULL and length limits reject a bad reason, half-revoked row, null column or long value | FR-065 | crud | boundary | P2 | crud-nonprod | machine | none |
| TC-DB-004 | userid/companyid FKs reject a missing parent with 23503; parent delete cascades (observed) | FR-065 | crud | negative | P1 | crud-nonprod | machine | none |
| TC-DB-005 | wxkanban_app cannot ALTER, DROP or TRUNCATE agentdevicetokens and holds only the granted privileges | FR-065 | crud | permission | P2 | crud-nonprod | machine | none |
| TC-DB-006 | issue() is atomic: a failed insert leaves the earlier live device live | FR-065 | crud | recovery | P1 | crud-nonprod | machine | none |
| TC-DB-007 | Concurrent same-name sign-ins and a revoke racing revokeAll leave one live row and one revoker | FR-065 | crud | concurrency | P1 | crud-nonprod | machine | none |
| TC-DB-008 | A password change and the device sign-out commit together on all three paths, and roll back together | FR-065 | crud | recovery | P1 | crud-nonprod | machine | none |
| TC-DB-009 | After a password change one agent.device.revoked audit row exists per company, written after commit | FR-073 FR-065 | crud | happy | P1 | crud-nonprod | machine | none |
| TC-DB-010 | A marker password and any raw token appear in no column of the K.A.I.N. tables or audit rows | FR-064 FR-065 FR-073 | crud | negative | P1 | crud-nonprod | machine | none |
| TC-DB-011 | Rolling back 0001 drops only agentdevicetokens, leaves other tables intact, and the app fails closed | FR-065 | crud | recovery | P2 | crud-nonprod | machine | none |
| TC-DB-012 | Re-running 0001 and 0002 is a no-op preserving rows; 0002 retires live tokens and keeps them | FR-069 FR-065 | crud | boundary | P2 | crud-nonprod | machine | none |
| TC-DB-013 | The app and MCP loaders return identical reach facts for every fixture person on real rows | FR-067 FR-066 FR-075 | crud | happy | P1 | crud-nonprod | machine | none |
| TC-DB-014 | On real rows the loader plus rule reaches exactly the expected Projects and none of the negatives | FR-075 FR-066 FR-067 | crud | negative | P1 | crud-nonprod | machine | none |
| TC-DB-015 | Each FR-070 event as a real UPDATE removes the Project from both loaders on the next read | FR-070 FR-066 FR-067 FR-075 | crud | recovery | P1 | crud-nonprod | machine | none |
| TC-DB-016 | The per-call reach lookups stay on index scans as a company grows from 1x to 100x Projects | FR-067 | crud | boundary | P2 | crud-nonprod | machine | none |
| TC-DB-017 | Orphan and cross-tenant probes find 0 parentless devices and 0 assignments off the client's Projects | FR-066 | crud | negative | P2 | crud-nonprod | machine | none |
| TC-DB-018 | listForUser and listForCompany return only live rows of the right scope, newest first, no hash | FR-071 | crud | permission | P2 | crud-nonprod | machine | none |
