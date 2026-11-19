# Test Plan: Marketing — Lead Capture & Funnel

**Spec**: 046 | **Created**: 2026-06-08
**Maps to**: spec.md functional requirements FR-001 … FR-016

---

## Unit / Integration (Vitest)

| ID | Covers | Test |
|----|--------|------|
| TT-01 | FR-001, FR-004 | Valid POST persists a `marketingleads` row with all captured/derived fields and `status='new'`. |
| TT-02 | FR-002, FR-016 | Invalid/missing `email` returns 400 with a **locale-keyed** error and persists nothing. |
| TT-03 | FR-003 | Segment derivation: `windev` source → `windev`; `wxperts` source → `careerchanger` (Phase-1 default); campaign override respected. Client-supplied segment is ignored. |
| TT-04 | FR-004, FR-009 | Lead row is written **before** notification; a forced notification failure still leaves the persisted lead and sets `notifystatus='failed'` (no rollback). |
| TT-05 | FR-005 | Request from a non-allowlisted Origin is rejected; allowlisted origins pass. |
| TT-06 | FR-006 | Honeypot-filled submission is rejected without persisting; per-IP rate-limit triggers after the configured threshold; legitimate signups under the limit succeed. |
| TT-07 | FR-007 | Success response returns a locale-keyed confirmation + reference id and does not await notification delivery. |
| TT-08 | FR-008 | On success, in-app inbox entry is created and email send is invoked with the configured recipient(s); `notifystatus='sent'` on success. |
| TT-09 | FR-010 | `GET /leads` honors `segment`/`status`/`sourceproperty`/`campaignid` filters; admin auth required (401/403 without). |
| TT-10 | FR-011 | Status transitions valid path new→contacted→qualified→onboarded; `declined` without `declinedreason` is rejected. |
| TT-11 | FR-012 | `POST /leads/:id/note` appends a timestamped note; existing notes preserved. |
| TT-12 | FR-014, FR-015 | A lead with `campaignid` attributes to the seeded July-5 campaign; funnel query slices correctly by segment/source/campaign. |
| TT-13 | FR-016 | Requesting an unsupported locale falls back to en-US strings and never errors. |

## E2E (Playwright)

| ID | Covers | Scenario |
|----|--------|----------|
| E2E-01 | FR-001…FR-008 | Submit the public signup form (mocked site origin) → success confirmation shown → lead appears in the SysAdmin Marketing leads pipeline as `new`. |
| E2E-02 | FR-010…FR-013 | Admin filters leads by segment, opens detail, transitions `new → contacted`, declines another with a reason, adds a note — all reflected on refresh. |

## Manual / Pre-launch verification

- Real round-trip against the deployed endpoint: form submit → `marketingleads` row → in-app + email notification received → admin works it through the funnel.
- CORS rejection verified from a disallowed origin; rate-limit verified by burst; honeypot verified by an automated fill.
- Locale fallback verified with a `fr-FR` request before any French strings exist (must serve en-US, not 404).

## Exit Criteria

All TT-* and E2E-* pass; `check-types` clean for new files; `auditfences` 0 violations; pre-launch round-trip confirmed before July 5 2026.
