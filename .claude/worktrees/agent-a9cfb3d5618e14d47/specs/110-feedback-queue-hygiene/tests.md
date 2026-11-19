# Test Plan: Feedback Queue Hygiene

**Spec Number**: 110
**Date Generated**: 2026-07-24
**Spec**: [spec.md](spec.md) | **Tasks**: [tasks.md](tasks.md)

---

## Test Strategy

| Layer | Framework | Coverage Target |
|-------|-----------|-----------------|
| Unit | Vitest | Fingerprint basis, merge grouping, ownership predicate, confirmation-token logic |
| Integration | Vitest + Supertest | Dismiss/undismiss/purge routes, submitter MCP tool, metrics query, upsert-under-constraint |
| E2E | Playwright | Bulk select → purge storm, purge-with-human-report confirmation, submitter hide from Cockpit |

---

## Success-Metric Coverage Map

Each of the spec's seven success metrics maps to at least one automated assertion. This table is the acceptance gate for T015.

| # | Success Metric | Test |
|---|----------------|------|
| 1 | Backlog 57 → ≤10 after merge; records == distinct identities per project | IT-MERGE-1 |
| 2 | Equality still holds after further intake (0 projects over) | IT-UNIQ-2 |
| 3 | Remove any N duplicates in exactly 3 interactions | E2E-PURGE-1 |
| 4 | 100% of deletions audited, incl. audit-write-fails-abort | IT-PURGE-3, IT-PURGE-4 |
| 5 | Metrics total == count of non-dismissed records | IT-METRICS-1 |
| 6 | 0 deletions of another user's submission (incl. valid-but-unowned id) | IT-OWN-1, IT-OWN-2 |
| 7 | Recurring resolved error → exactly 1 notification | IT-REOPEN-1 |

---

## Unit Tests

### UT-008 — Fingerprint drops the route (FR-008)
- The same `{name, kind, message, stack}` with three different `route` values produces one identical fingerprint.
- Ten real captured-error payloads that today produce ten fingerprints collapse to the expected count of distinct identities.

### UT-012 — Merge grouping (FR-012)
- Group survivor is the earliest `firstoccurredat`; `occurrencecount` is summed; latest `lastoccurredat` wins; most-advanced status wins; `internalnotes` concatenated, never dropped.
- Running the merge twice is a no-op the second time (idempotent).

### UT-005 — Double-submit window (FR-011)
- Identical submission at 59s → returns existing; at 61s → creates new.

### UT-OWN — Ownership predicate (FR-005)
- The delete query yields zero rows for a valid id owned by another user.

---

## Integration Tests

| # | Scenario | Endpoint/Flow | Expected | Status |
|---|----------|--------------|----------|--------|
| IT-MERGE-1 | Run merge against seeded 57-row backlog | merge script | ≤10 rows; rows == distinct identities | pending |
| IT-UNIQ-2 | Concurrent auto-intake of same identity ×N | ErrorCaptureService | 1 row, occurrencecount==N | pending |
| IT-PURGE-3 | Purge 3 records | purge route | 3 rows gone, 3 audit entries | pending |
| IT-PURGE-4 | Purge with audit write forced to fail | purge route | nothing deleted; error surfaced | pending |
| IT-METRICS-1 | Dismiss K of N, read metrics | metrics query | total == N−K | pending |
| IT-OWN-1 | Submitter deletes own record | MCP tool | deleted + audited | pending |
| IT-OWN-2 | Submitter supplies valid id they don't own | MCP tool | deletes nothing; not-found | pending |
| IT-REOPEN-1 | Resolved error recurs | ErrorCaptureService | status→new, reopenedat set, exactly 1 notification | pending |
| IT-DISMISS-1 | Dismiss then undismiss | dismiss routes | reversible; triage fields untouched; absent from default list | pending |
| IT-DEEPLINK-1 | Fetch dismissed record by id | get route | still returned | pending |

---

## E2E Tests

| # | User Story | Steps | Expected | Status |
|---|-----------|-------|----------|--------|
| E2E-PURGE-1 | US1 — clear a storm | select-all in filter → purge → confirm | 14 gone, no reload, 3 interactions total | pending |
| E2E-HUMAN-1 | US5 — bulk purge containing human reports | select 28 auto + 2 human → purge | dialog states split, lists human titles, requires typed DELETE | pending |
| E2E-HIDE-1 | US3 — submitter clears Cockpit | hide 3 resolved items | gone from submitter list; admin console unaffected | pending |

## Test Automation

```bash
npm run test
npm run test:integration
npm run test:e2e
```

## Coverage Requirements

- Every success metric has at least one passing assertion (the map above is the gate).
- The audit-write-fails-abort path (IT-PURGE-4) is mandatory — no tolerance on metric 4.
- Cross-user deletion (IT-OWN-2) must show zero successful deletions across the matrix.
