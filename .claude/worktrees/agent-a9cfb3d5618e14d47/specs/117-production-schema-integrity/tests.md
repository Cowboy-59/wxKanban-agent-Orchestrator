# Test Plan: Spec 117 — Production Schema Integrity

## Unit (Vitest)

| Test | Covers | Assertion |
| --- | --- | --- |
| `projectid` boundary parse — `"all"` | FR-002 | Resolves to no-filter; no UUID comparison emitted |
| `projectid` boundary parse — valid UUID | FR-002 | Filter applied to `projecttimeentries.projectid` |
| `projectid` boundary parse — malformed (`"../"`, `""`, arbitrary) | FR-002 | Returns 400; never reaches the query layer |
| DB error serializer | FR-003 | `error.cause.code` and `.detail` present in the emitted record |
| DB error serializer — no leakage | FR-003 | No secrets and no PII-bearing bound parameters in output |
| Log record shape | FR-003 | Output parses as single-line JSON |
| Drift comparator — declared-but-missing | FR-005 | Missing tables reported by name |
| Drift comparator — MCP-declared tables | FR-005 | `capabilityindex`, `events` NOT reported as drift |
| Drift comparator — orphans | FR-006 | Reported informational; never as removable |

## Integration

| Test | Covers | Assertion |
| --- | --- | --- |
| Consultant Hub page load, "All projects" | SC-2 | All 4 requests return 200 |
| Compliance-flags endpoint post-migration | FR-001 | 200, no `42P01` |
| Invoice-preview with `projectid=all` | FR-002 | 200 with results across all projects |
| Induced `42P01` (non-production) | SC-6 | Log record carries code + relation name |
| Fresh `db:generate` after baselining | SC-4 | Empty diff for pre-existing tables |

## Verification against production state

These are observations, not automated tests, and are the primary evidence for this spec.

| Check | When | Expected |
| --- | --- | --- |
| `auditfences --schema` | **Before** remediation | Non-zero exit; names all 6 missing tables (SC-3) |
| `auditfences --schema` | After remediation | Exit 0 (SC-3) |
| Table count | Before / after | 125 → exactly 131 (SC-5) |
| `marketingcontacts` row count | Before / after | 1,006 → 1,006 (SC-5) |
| `capabilityindex` row count | Before / after | 4,002 → 4,002 (SC-5) |
| Orphan table count | Before / after | 27 → 27, none dropped |
| Generated migration SQL | Before apply | Contains no DROP and no ALTER of existing objects |
| Error log scan | 7 days post-deploy | Zero `42P01`, zero `22P02` (SC-1) |

## CI gate

| Test | Covers | Assertion |
| --- | --- | --- |
| Intentional divergence commit | SC-7 | Build **fails**; divergent object named in output |
| Clean branch | SC-7 | Build passes |

## Explicitly not tested here

The two unexplained timer failures of 2026-07-30. Their SQL executes successfully against
production and the shared-connection poisoning hypothesis was tested and refuted; no reproduction
exists to write a test against. FR-003 restores the logging expected to identify the cause on next
occurrence.
