# Tests: Consultant Customer Records (Spec 119)

Two of this spec's success metrics are security properties. Those get automated proof, not
inspection — an access-control rule that is only ever read is a rule nobody knows is broken.

## Unit

| ID | Covers | Assertion |
|----|--------|-----------|
| U1 | FR-001 | Create rejects a missing name |
| U2 | FR-001 | Create rejects a malformed email; accepts an absent one |
| U3 | FR-001 | Create rejects a duplicate name for the same consultant among live rows |
| U4 | FR-001 | Create ACCEPTS a duplicate name when the existing row is archived — the partial index frees the name |
| U5 | FR-001 | Create ACCEPTS the same name for a different consultant (Clarification 8) |
| U6 | FR-001 | `consultantid` and `companyid` come from the auth context; body values are ignored |
| U7 | FR-003 | Archive sets `archivedat`; restore clears it |
| U8 | FR-011 | Transfer moves `consultantid` and changes no other field |

## Integration

| ID | Covers | Assertion |
|----|--------|-----------|
| I1 | FR-002 | List returns only the caller's customers, sorted by name |
| I2 | FR-002 | Archived rows are hidden unless `includearchived=true` |
| I3 | FR-002 | Project count per row is accurate |
| I4 | FR-004 | Linking to a company with no Engagement is refused |
| I5 | FR-004 | Linking to a non-existent company is refused |
| I6 | FR-005 | Engagement history returns ended engagements, most recent first |
| I7 | FR-005 | A linked customer with no engagements returns an empty list, not an error |
| I8 | FR-006 | Assigning a project sets `customerid`; reassigning changes it |
| I9 | FR-006 | Reassignment leaves historical time entries byte-identical |
| I10 | FR-003 | An archived customer cannot be assigned to a new project |
| I11 | FR-011 | `transfer-all` moves every customer from one consultant to another in one call |
| I12 | FR-011 | Transfer writes an audit entry with old owner, new owner, count and actor |

## Security — the two that matter

| ID | Covers | Assertion |
|----|--------|-----------|
| S1 | FR-007, metric 4 | Consultant B reading Consultant A's customer by ID is refused |
| S2 | FR-007, metric 4 | Consultant B updating Consultant A's customer is refused |
| S3 | FR-007, metric 4 | Consultant B archiving Consultant A's customer is refused |
| S4 | FR-007, metric 4 | Consultant B's list never contains Consultant A's rows — enumeration is impossible |
| S5 | FR-007 | Company Admin can READ any customer in their company |
| S6 | FR-007 | Company Admin CANNOT write customer detail — create, PATCH, archive and restore all refused |
| S6a | FR-004, FR-007 | Company Admin CAN unlink a record they do not own, and the action is written to the company audit log |
| S6b | FR-004, FR-007 | Company Admin CAN link a record they do not own, and the action is written to the company audit log |
| S6c | FR-004 | Owner linking or unlinking their own record succeeds and writes **no** audit row — routine, not an accountability event |
| S6d | FR-004, FR-007 | The engagement check binds the Admin too: an Admin linking to a company their company has no Engagement with is refused, identically to a non-existent company |
| S6e | FR-004 | `PATCH /customers/:id` REFUSES a `clientcompanyid` field for everyone, owner included — this test is what stops a second, unchecked write path reappearing |
| S6f | FR-004 | Creation also enforces the engagement check: `POST /customers` with a `clientcompanyid` the company has no Engagement with is refused. Creation is the third and last permitted setter. |
| S7 | FR-007 | A user in a different company gets nothing, for every endpoint |
| S8 | FR-011 | A consultant cannot transfer their own customers; only a Company Admin can |
| S9 | FR-004, metric 5 | After setting `clientcompanyid`, the consultant still has **zero** additional read or write access to that company's projects, tasks and time entries |
| S10 | FR-004 | `clientcompanyid` cannot be used to probe which companies exist — a company the consultant has no Engagement with is indistinguishable from one that does not exist |

S9 is the one to write first. It is the single assertion standing between "a Customer is a record"
and "a Customer is a permission", and if it ever fails this spec has become a second, worse copy
of SCOPE-037.

## Data integrity

| ID | Covers | Assertion |
|----|--------|-----------|
| D1 | metric 6 | Archiving a customer with projects, time entries and invoices leaves 100% of them resolvable |
| D2 | FR-003 | No DELETE route exists on `/api/consultant/customers/:id` — assert 404/405, so nobody adds one quietly |
| D3 | Clarification 6 | Deleting a consultant who owns live customers fails, and the error names the count and points at the transfer action rather than surfacing a raw foreign-key violation |
| D4 | FR-004 | Deleting a linked client company leaves the customer row intact with `clientcompanyid` NULL |

## Regression — success metric 2

| ID | Assertion |
|----|-----------|
| R1 | After `customerid` is declared on `companyprojects`, the Consultant Dashboard, Work Hub, project list and time-tracking endpoints all return 200 with zero `42703` errors |

R1 exists because the ordering hazard in Gate 2 is the most likely way this spec takes production
down, and it would do so silently in code review.

## Not tested here

Per-customer billing rollup — SCOPE-005 owns rate and rounding logic and tests it. The external PM
connection layer — SPEC-017. Engagement lifecycle behaviour — SCOPE-037; this spec only reads it.
