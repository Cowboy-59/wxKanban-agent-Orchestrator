# Test Plan: K.A.I.N. Sign-in and Agent Reach

**Spec Number**: 152
**Date Generated**: 2026-10-28
**Spec**: [spec.md](spec.md) | **Tasks**: [tasks.md](tasks.md)

---

## Test Strategy

| Layer | Framework | Coverage Target |
|-------|-----------|-----------------|
| Reach function | Vitest, Drizzle against a fixture | FR-066, FR-070 |
| Sign-in and device tokens | Vitest + supertest | FR-064, FR-065, FR-073 |
| Grants and connect | Vitest + supertest, YappChatt stubbed | FR-067, FR-068 |
| MCP auth and list tool | Vitest (mcp-server) | FR-067, FR-062 |
| Web UI | Vitest + Testing Library | FR-071, FR-072 |
| Cross-company matrix | Vitest, one shared fixture | FR-075 tests 1 – 6 |
| Live | Deployed app, SpokAI on phone and laptop | FR-075 test 7 |

## Cases

| # | Case | FR | Expected | Status |
|---|------|----|----------|--------|
| 1 | Never too far: company with no engagement, unassigned Project, Allow remote off — grants, connect, MCP, list | FR-066, FR-067 | none returned or accepted, in all 4 places | **release gate** |
| 2 | Never too little: ADMIN, TEAM_MANAGER, TEAM_MEMBER, consulting ADMIN, sub-assigned consultant | FR-066 | reach = own-company rule + D2, exactly | pending |
| 3 | Stops on the next call: engagement paused / disabled / ended, assignment removed, sub-assignment removed, Allow remote off, person deactivated, person removed, device revoked | FR-070 | next call refused in all 4 places; nothing minted or revoked | **release gate** |
| 4 | Two devices, one Project, both connect and post | FR-068 | both live; neither revoked | pending |
| 5 | Sign-in: wrong password, lockout, marker password, revoked device signs in again | FR-064, FR-065 | 401, 423, marker in 0 logs / rows / responses, new token | pending |
| 6 | All 4 places agree with `agentReach` for every fixture person | FR-067 | identical Project sets | **release gate** |
| 7 | By hand: consulting ADMIN on phone + laptop; client member; `[KAIN] STATUS` from phone | FR-075 | both clients listed; client member own company only; worker answers | after deploy |
| 8 | `showAll` set for a TEAM_MEMBER | FR-066 | reach unchanged | pending |
| 9 | Scope-level engagement assignment only | FR-066 | Project not in reach | pending |
| 10 | Password reset by team ADMIN / SysAdmin / self | FR-065 | every device of that person 401 `device_signed_out` | pending |
| 11 | Revoke another company's device | FR-071 | 404, nothing changes | pending |
| 12 | `POST /api/company/agent-tokens` after release | FR-069 | 410 `use_signin` | pending |
| 13 | `reachableBy` on a client Project | FR-072 | consulting company names only, no people | pending |
| 14 | Audit rows: sign-in, refusal, connect (under the Project's company), revoke | FR-073 | one row each, person + device, no secret | pending |
