# Test item schema — fixed fields, directly insertable

Test items are **records, not prose**. Authoritative form is `app/tests/test-items.json`;
`TEST-PLAN.md` renders from it. Any field marked required must be present on every item — emit
`null` or `[]` rather than omitting a key, so a consumer never has to distinguish "absent" from
"unknown".

## Field contract

| Field | Type | Req | Rule |
|---|---|:-:|---|
| `id` | string | ✅ | `TC-<AREA>-<nnn>[-<V><n>]`. `AREA` ∈ `JOBS`, `SYS`, `CFG`, `SEC`, `TLS`, `LIB`, `DB`, `PACE`, `SOAP`, `SCRIPT`. `nnn` zero-padded 3, unique within area. Variant suffix: `B`=boundary, `N`=negative, `P`=permission, `C`=concurrency, `R`=recovery (e.g. `TC-JOBS-004-N2`). Immutable once filed. |
| `title` | string | ✅ | Imperative, states the expectation. ≤ 100 chars. `"jobs_get_job returns NOT_FOUND for an unknown job number"`. Never `"test jobs_get_job"`. |
| `requirementId` | string \| null | ✅ | Requirement ID from `specs/###-*/spec.md` (e.g. `FR-001-07`). `null` **only** with a `clarificationId` set — untraceable behavior is never silently self-justified. |
| `specRef` | string \| null | ✅ | `specs/001-jobs-domain-mcp-tools/spec.md §4.2` — file + section backing `requirementId`. |
| `unitId` | string | ✅ | Inventory `id` from `inventory.json` (`tool:jobs_get_job`, `method:EpaceDb.queryJobParts`). Must exist in the inventory. |
| `sourceRef` | string | ✅ | `app/src/mcp/tools/jobs.ts:34` — file:line from the inventory. |
| `variant` | enum | ✅ | `happy` \| `boundary` \| `negative` \| `permission` \| `concurrency` \| `recovery`. |
| `parentId` | string \| null | ✅ | The `happy` item this variant derives from; `null` on happy items. Makes derivation completeness auditable. |
| `priority` | enum | ✅ | `P1` (blocks release: security, data integrity, mutation, core read path) \| `P2` (contract/robustness) \| `P3` (cosmetic, logging, dead-code guard). |
| `riskTier` | enum | ✅ | `HIGH` \| `MEDIUM` \| `LOW` — carried from the inventory, re-tiered only with a note in `rationale`. |
| `testLevel` | enum | ✅ | `unit` \| `component` \| `integration` \| `system` \| `acceptance`. Handler-through-MCP items are `component`; live UAT is `system`. |
| `tier` | enum | ✅ | Execution tier: `unit-mocked` \| `live-readonly` \| `manual` \| `not-testable`. |
| `preconditions` | string[] | ✅ | Each entry independently verifiable. `"harness started via startHarness()"`, `"pgMock routed: /from \"job\"/ → [jobRow.minimal]"`. Never `"system is ready"`. |
| `testData` | object[] | ✅ | Rows of `{ name, value, source }`. `source` ∈ `literal` \| `fixture` \| `generated` \| `discovered-at-runtime`. `[]` for no-input items. Boundary items put the whole partition table here. |
| `steps` | object[] | ✅ | Ordered `{ step: <int ≥1>, action, expected }`. **Every** step carries its own `expected`. |
| `steps[].action` | string | ✅ | One imperative action. No compound "and then". |
| `steps[].expected` | string | ✅ | **Machine-checkable.** Must state a value, a key set, a count, a thrown code, or an absence. Banned: "correct", "as expected", "works", "looks right", "reasonable", "appropriate", "valid" (unqualified). |
| `postconditions` | string[] | ✅ | End state, including *absence* of effects: `"pgMock.calls.length === 1"`, `"no insert/update issued"`, `"PACE client restored to original instance"`. |
| `automation` | enum | ✅ | `automated` (written this sweep) \| `automatable` (should be, isn't yet) \| `manual-only` (needs an operator or live mutation) \| `blocked` (see `blockedReason`). |
| `automationRef` | string \| null | ✅ | `app/tests/unit/mcp/tools/jobs.test.ts:88` once written; `null` before. |
| `blockedReason` | string \| null | ✅ | Required when `automation` = `blocked` or `tier` = `not-testable`. |
| `exemptions` | object[] | ✅ | Variants deliberately not instantiated: `{ variant, code, note }` with `code` ∈ `N/A-STATELESS`, `N/A-NO-AUTH`, `N/A-NO-PERSIST`, `N/A-SINGLE-PARTITION`, `N/A-READ-ONLY`, `DEFERRED-SPEC`, `DEFERRED-CAP`. Only on `happy` items. |
| `clarificationId` | string \| null | ✅ | `CLAR-<nn>` when this item rests on ambiguous behavior. The item then asserts *observed* behavior and `title` says so. |
| `rationale` | string \| null | ✅ | Why this item exists, when non-obvious (re-tiering, an odd partition, a compliance driver such as SOC 2 CC6.1). |
| `tags` | string[] | ✅ | From the inventory `deps` plus `soc2`, `mutating`, `suite-level`, `parameterized`. |
| `result` | object \| null | ✅ | `null` until executed; then `{ status, bucket, evidence, runId }`. `status` ∈ `pass` \| `fail` \| `skip` \| `blocked` \| `unresolved`; `bucket` ∈ `TEST-BUG` \| `CODE-BUG` \| `NOT-IMPLEMENTED` \| `SPEC-GAP` \| `null`. |

## File shape

```json
{
  "generatedFor": "app",
  "inventoryRef": "app/tests/inventory.json",
  "commit": "<sha>",
  "caps": { "perUnit": { "HIGH": 12, "MEDIUM": 8, "LOW": 3 }, "global": 250 },
  "totals": {
    "items": 0,
    "byVariant": { "happy": 0, "boundary": 0, "negative": 0, "permission": 0, "concurrency": 0, "recovery": 0 },
    "byPriority": { "P1": 0, "P2": 0, "P3": 0 },
    "byTier": { "unit-mocked": 0, "live-readonly": 0, "manual": 0, "not-testable": 0 },
    "exemptionsByCode": {},
    "deferredByCap": 0
  },
  "clarifications": [
    {
      "id": "CLAR-01",
      "unitId": "tool:jobs_job_schedule_updates",
      "question": "When PACE push 3 of 6 fails, are pushes 1–2 rolled back, or is a partial update the intended contract?",
      "why": "No transaction spans PACE; six sequential updateJobDateField calls.",
      "blocks": ["TC-JOBS-011-R1"],
      "assumedForNow": "Partial update is asserted as OBSERVED behavior, not ratified as intended.",
      "severityIfWrong": "High"
    }
  ],
  "items": [ /* records per the field contract */ ]
}
```

## Worked example

```json
{
  "id": "TC-JOBS-001",
  "title": "jobs_get_job returns the documented core job record for an existing job number",
  "requirementId": "FR-001-01",
  "specRef": "specs/001-jobs-domain-mcp-tools/spec.md §4.1",
  "unitId": "tool:jobs_get_job",
  "sourceRef": "app/src/mcp/tools/jobs.ts:22",
  "variant": "happy",
  "parentId": null,
  "priority": "P1",
  "riskTier": "MEDIUM",
  "testLevel": "component",
  "tier": "unit-mocked",
  "preconditions": [
    "startHarness() connected to buildServer() over InMemoryTransport",
    "pgMock.reset() executed",
    "pgMock routed: /from \"job\"/ -> [fixtures.jobRow.complete]"
  ],
  "testData": [
    { "name": "jobNumber", "value": 480123, "source": "literal" },
    { "name": "row", "value": "fixtures.jobRow.complete", "source": "fixture" }
  ],
  "steps": [
    { "step": 1, "action": "call tool jobs_get_job with { jobNumber: 480123 }",
      "expected": "response isError === false" },
    { "step": 2, "action": "JSON.parse the text content of the response",
      "expected": "parse succeeds; result is a non-array object" },
    { "step": 3, "action": "compare the payload key set to the documented field list",
      "expected": "keys equal exactly [jobNumber, jobDescription, customerId, customerPoNumber, plantJobStatus, quantityOrdered, reqShipDate, reqDueDate, estShipDate, actualShipDate, salesRepId, csrNumber]" },
    { "step": 4, "action": "read payload.jobNumber",
      "expected": "=== 480123" },
    { "step": 5, "action": "inspect pgMock.calls[0]",
      "expected": "single query against \"job\", parameterized ($1 = 480123), contains \"limit 1\"" }
  ],
  "postconditions": [
    "pgMock.calls.length === 1",
    "no insert/update/delete issued",
    "PACE client untouched (still the original instance)"
  ],
  "automation": "automated",
  "automationRef": "app/tests/unit/mcp/tools/jobs.test.ts:24",
  "blockedReason": null,
  "exemptions": [
    { "variant": "concurrency", "code": "N/A-READ-ONLY", "note": "Single read, no shared mutable state." },
    { "variant": "recovery", "code": "N/A-NO-PERSIST", "note": "Nothing written, so nothing to recover." }
  ],
  "clarificationId": null,
  "rationale": "Core read path; the key set is the model-facing contract, so a silent field rename must fail.",
  "tags": ["gpmgt-db", "zod"],
  "result": null
}
```

Its derived variants, showing the ID convention:

| ID | Variant | Title | Priority |
|---|---|---|---|
| `TC-JOBS-001-B1` | boundary | rejects `jobNumber` at the partition edges (0, -1, non-integer, > int32) | P2 |
| `TC-JOBS-001-N1` | negative | returns `NOT_FOUND` naming the job number when no row matches | P1 |
| `TC-JOBS-001-N2` | negative | maps an unexpected pool error to the generic envelope, leaking no SQL or host | P1 |
| `TC-JOBS-001-P1` | permission | *exempt* — `N/A-NO-AUTH`, handler calls no `requireRole` | — |

## wxKanban insert mapping (Phase 6)

`project_create_task` per item, then `project_link_task_to_spec` on `requirementId`'s spec:

| Item field | Task field |
|---|---|
| `id` + `title` | `title` → `"[TC-JOBS-001] jobs_get_job returns …"` |
| `steps`, `preconditions`, `testData`, `postconditions` | `description` — rendered as the Markdown block below |
| `priority` | task priority (`P1`→high, `P2`→medium, `P3`→low) |
| `requirementId` / `specRef` | spec link target |
| `tags` + `variant` + `tier` | labels |
| `automation` | label `auto:<value>` |
| `result.status` | task status on re-sync (`pass`→done, `fail`→blocked) |

Never file an item whose `requirementId` **and** `clarificationId` are both `null` — it has no
provenance. File the clarification first.

## Markdown rendering (for TEST-PLAN.md and the task description)

Deterministic projection of the record — same field order every time:

```markdown
#### TC-JOBS-001 — jobs_get_job returns the documented core job record for an existing job number
`FR-001-01` · P1 · MEDIUM · component / unit-mocked · automated → `tests/unit/mcp/tools/jobs.test.ts:24`
Unit: `tool:jobs_get_job` (`app/src/mcp/tools/jobs.ts:22`) · Tags: gpmgt-db, zod

**Preconditions**
1. startHarness() connected to buildServer() over InMemoryTransport
2. pgMock.reset() executed
3. pgMock routed: /from "job"/ → [fixtures.jobRow.complete]

**Test data** — `jobNumber` = 480123 (literal) · `row` = fixtures.jobRow.complete (fixture)

| # | Action | Expected result |
|--:|---|---|
| 1 | call tool `jobs_get_job` with `{ jobNumber: 480123 }` | response `isError === false` |
| 2 | JSON.parse the text content | parse succeeds; result is a non-array object |
| … | … | … |

**Postconditions** — pgMock.calls.length === 1 · no insert/update/delete issued · PACE untouched
**Exemptions** — concurrency `N/A-READ-ONLY` · recovery `N/A-NO-PERSIST`
```

## Self-check before Phase 2B is done

Refuse to hand over the artifacts until all of these hold:

1. Every item validates against the field contract — no missing keys, no enum violations.
2. No `steps[].expected` contains a banned subjective word, and each states a value, key set, count,
   error code, or absence.
3. Every `unitId` exists in `inventory.json`; every non-null `requirementId` resolves in a spec file.
4. Every item with `requirementId: null` has a `clarificationId`, and that clarification exists.
5. Every `happy` item's five variants are each instantiated or exempted with a code — none silent.
6. No unit exceeds its per-risk cap; `totals.deferredByCap` matches the `DEFERRED-CAP` exemptions.
7. `totals` recomputed from `items`, not carried over from the Phase 2A estimate.
