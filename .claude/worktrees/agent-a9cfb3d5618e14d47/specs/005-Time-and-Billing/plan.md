# Plan: Time and Billing

**Spec Number**: 005
**Date**: 2026-11-01

## Implementation Plan

Ordering is strict. The schema changes are applied by hand by the owner (SCOPE-117), so code that depends on them waits.

1. **T001 — Write schema SQL.** Write src/db/migrations/0072_scope005_time_billing.sql with every additive change from the scope Data Requirements, plus a column-level verification query. Record the change in specs/117-production-schema-integrity/schema-change-log.md. Do NOT apply it.
2. **HARD STOP.** Nothing else starts until the owner has applied the SQL and confirmed the verification query passes (npm run db:drift plus the column-level check).
3. **T002 — Declare Drizzle columns.** Only after the owner confirms the DDL is live. Declaring earlier 500s every query on those tables.
4. **Remaining tasks T003–T021**, in dependency order: helpers (T003), time lines and entries (T004–T005), timer and agent pull (T006–T007), rates/ACH and statement (T008–T011), routes with guard and audit (T012), customer cycle (T013), UI (T014–T019), tests (T020), endpoint test as ADMIN (T021).

## Known Issues

_None at this time._
