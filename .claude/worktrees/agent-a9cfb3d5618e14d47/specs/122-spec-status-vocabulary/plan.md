# Plan: Spec Status Vocabulary (Spec 122)

## Approach

Two vocabularies exist and neither validates against the other. The fix has a cheap half and an
important half, and they must not be confused:

- **The cheap half (FR-001)** adds the four missing values to the board's map. It unbreaks every
  affected customer the moment the app deploys.
- **The important half (FR-002)** removes the failure *mode*. Column assignment stops being a bare
  lookup whose miss-case is "filtered from every column". If only the cheap half ships, the next
  divergence is exactly as silent as this one was.

Sequence the work so the customer-visible fix lands first and independently, then harden.

## Architecture

| Layer | Change | File |
|---|---|---|
| Client (React + Tailwind) | Extend `STATUS_TO_COLUMN`; replace the bare lookup with a resolver that returns a fallback column for any unmapped status | `src/client/components/Projects/ScopeKanbanBoard.tsx` |
| Client | Explicit hidden rule for `archived`, plus a filter control to reveal it | `ScopeKanbanBoard.tsx`, `ScopeKanbanFilterBar.tsx` |
| MCP server (Express/Node) | Reject statuses outside the shared vocabulary; correct the false comment | `mcp-server/src/utils/schemas.ts` |
| Tests (Vitest) | Drift guard pinning the MCP vocabulary to the app's column map | `mcp-server/tests/` |
| Ops | Read-only audit query, no writes | ad-hoc script, not committed |

No database schema change. No new API routes. No data migration.

## Key Decisions

1. **The MCP's shorter vocabulary is canonical.** Customer data already holds `beta`, `qa` and
   `human_testing`, so adopting it needs no migration. Migrating everyone to `beta_cleared` is
   cleaner in principle and materially riskier in production.
2. **Both vocabularies render.** The app-side values stay mapped, so this is purely additive and
   nothing currently working breaks.
3. **`archived` is hidden by intent, never by accident.** The distinction is load-bearing and is the
   only reason FR-007 does not contradict FR-002.
4. **The fix touches no customer data.** The board is the hosted web app, so deploying is the whole
   delivery mechanism for FR-001, FR-002, FR-007 and FR-008.

## Risks

| Risk | Mitigation |
|---|---|
| Fixing only the map, leaving the miss-case silent | FR-002 is a separate task and must not be folded into FR-001 |
| "Hidden" `archived` becomes unreachable | FR-008 ships in the same change, not later |
| The two vocabularies drift again | FR-005 build-failing guard, reusing the SCOPE-043 pattern |
| Audit tempts an unnecessary production write | FR-004 is explicitly read-only; any write requires review first |

## Verification

Unit tests are not sufficient here — the defect was a legal write rendering nowhere, which typechecks
and passes unit tests. Verification must include the real board against real data: confirm the
reporting customer's project shows 9 of 9 scopes with the 8 `beta` scopes in Phase 5, and confirm the
audit reports zero unaccounted statuses.
