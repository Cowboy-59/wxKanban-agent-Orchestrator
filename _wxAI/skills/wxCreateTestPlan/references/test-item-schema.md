# Test item schema — fixed fields, directly insertable

Test items are **records, not prose**. Authoritative form is
`tests/testplans/<target>/test-items.json` (one folder per inventory target — a spec, a route
group, a table); `TEST-PLAN.md` renders from it. Any field marked required must be present on
every item — emit `null` or `[]` rather than omitting a key, so a consumer never has to
distinguish "absent" from "unknown".

## Field contract

| Field | Type | Req | Rule |
|---|---|:-:|---|
| `id` | string | ✅ | `TC-<AREA>-<nnn>[-<V><n>]`. `AREA` ∈ `AUTH`, `API`, `DB`, `UI`, `FLOW`, `FN`, `MCP`, `SEC`. `nnn` zero-padded 3, unique within area. Variant suffix: `B`=boundary, `N`=negative, `P`=permission, `C`=concurrency, `R`=recovery (e.g. `TC-AUTH-004-N2`). Immutable once filed. |
| `title` | string | ✅ | Imperative, states the expectation. ≤ 100 chars. `"POST /auth/signin returns 401 for a wrong password"`. Never `"test signin"`. |
| `requirementId` | string \| null | ✅ | `FR-###` from `specs/NNN-*/spec.md` (e.g. `FR-012`). `null` **only** with a `clarificationId` set — untraceable behavior is never silently self-justified. |
| `specRef` | string \| null | ✅ | `specs/090-Registration/spec.md §4.2` — file + section backing `requirementId`. |
| `unitId` | string | ✅ | Inventory `id` from `inventory.json`, prefixed by kind: `express-route:POST /auth/signin`, `drizzle-table:timeentries`, `ui-route:/dashboard`, `ui-flow-edge:/login->/dashboard`, `exported-function:generateInvoicePdf`, `exported-const-fn:hashPassword`, `class-method:TimeEntryService.stop`, `internal-function:normalizeEmail`, `mcp-tool:project_create_task`. Must exist in the inventory. |
| `sourceRef` | string | ✅ | `src/server/routes/auth.ts:34` — file:line from the inventory. |
| `fenceRef` | string \| null | ✅ | Code fence that authored the unit: `[SCOPE 090 / T003]`. `null` only for pre-spec-026 legacy declarations. |
| `gate` | enum | ✅ | Signoff gate this item belongs to: `smoke` (responds / no-crash, read-only or mocked) \| `crud` (real CRUD round-trip / behavior execution on a **non-prod** DB) \| `ui-flow` (Playwright page-to-page + per-screen functionality) \| `unit` (pure logic, no I/O). |
| `layer` | enum | ✅ | Where the item asserts: `app` (through Express / the UI — the application boundary) \| `data` (below the application boundary — direct SQL, constraints, indexes, transactions). `data` items are authored by the DBA persona and carry the **database test item extension** below. |
| `variant` | enum | ✅ | `happy` \| `boundary` \| `negative` \| `permission` \| `concurrency` \| `recovery`. |
| `parentId` | string \| null | ✅ | The `happy` item this variant derives from; `null` on happy items. Makes derivation completeness auditable. |
| `priority` | enum | ✅ | `P1` (blocks release: security, data integrity, mutation, core read path) \| `P2` (contract/robustness) \| `P3` (cosmetic, logging, dead-code guard). |
| `riskTier` | enum | ✅ | `HIGH` \| `MEDIUM` \| `LOW` — carried from the inventory, re-tiered only with a note in `rationale`. |
| `testLevel` | enum | ✅ | `unit` \| `component` \| `integration` \| `system` \| `acceptance`. Route-handler-through-supertest items are `integration`; Playwright page flows are `system`; live UAT is `acceptance`. |
| `tier` | enum | ✅ | Execution tier: `unit-mocked` \| `live-readonly` \| `crud-nonprod` \| `playwright` \| `manual` \| `not-testable`. |
| `preconditions` | string[] | ✅ | Each entry independently verifiable. `"test app booted via createApp() with pgMock DB"`, `"seed: users row { email: qa@wx.test, passwordhash: bcrypt('Correct1!') }"`. Never `"system is ready"`. |
| `testData` | object[] | ✅ | Rows of `{ name, value, source }`. `source` ∈ `literal` \| `fixture` \| `generated` \| `discovered-at-runtime`. `[]` for no-input items. Boundary items put the whole partition table here. |
| `steps` | object[] | ✅ | Ordered `{ step: <int ≥1>, action, expected }`. **Every** step carries its own `expected`. |
| `steps[].action` | string | ✅ | One imperative action. No compound "and then". |
| `steps[].expected` | string | ✅ | **Machine-checkable.** Must state a value, a key set, a count, an HTTP status, a thrown code, a URL/pathname, an element assertion, exact toast text, or an absence. Banned: "correct", "as expected", "works", "looks right", "reasonable", "appropriate", "valid" (unqualified). |
| `flow` | object \| null | ✅ | Required (non-null) when `gate` = `ui-flow`, else `null`. Shape: `{ startRoute, navAction, destRoute, backTo, elements }` — see **UI/UX flow items** below. Every value machine-checkable via Playwright. |
| `postconditions` | string[] | ✅ | End state, including *absence* of effects: `"timeentries row count unchanged"`, `"no INSERT/UPDATE issued"`, `"response Set-Cookie absent (login failed)"`. |
| `automation` | enum | ✅ | `automated` (written this sweep) \| `automatable` (should be, isn't yet) \| `manual-only` (needs an operator or live mutation) \| `blocked` (see `blockedReason`). |
| `automationRef` | string \| null | ✅ | `tests/integration/auth.signin.test.ts:88` or `tests/e2e/login-flow.spec.ts:12` once written; `null` before. |
| `blockedReason` | string \| null | ✅ | Required when `automation` = `blocked` or `tier` = `not-testable`. |
| `exemptions` | object[] | ✅ | Variants deliberately not instantiated: `{ variant, code, note }` with `code` ∈ `N/A-STATELESS`, `N/A-NO-AUTH`, `N/A-NO-PERSIST`, `N/A-SINGLE-PARTITION`, `N/A-READ-ONLY`, `DEFERRED-SPEC`, `DEFERRED-CAP`. Only on `happy` items. |
| `clarificationId` | string \| null | ✅ | `CLAR-<nn>` when this item rests on ambiguous behavior. The item then asserts *observed* behavior and `title` says so. Must be filed via `project_submit_feedback` before the item ships. |
| `rationale` | string \| null | ✅ | Why this item exists, when non-obvious (re-tiering, an odd partition, a compliance driver such as SOC 2 CC6.1). |
| `tags` | string[] | ✅ | From the inventory `deps` plus `soc2`, `mutating`, `suite-level`, `parameterized`. |
| `result` | object \| null | ✅ | `null` until executed; then `{ status, bucket, evidence, runId }`. `status` ∈ `pass` \| `fail` \| `skip` \| `blocked` \| `unresolved`; `bucket` ∈ `TEST-BUG` \| `CODE-BUG` \| `NOT-IMPLEMENTED` \| `SPEC-GAP` \| `UNRESOLVED` \| `null`. |

## UI/UX flow items

A `gate: "ui-flow"` item covers page→page navigation (there and back) and the functionality of the
screens it touches — but it still uses **exactly the schema above**. The navigation intent lives in
the required `flow` object; the assertions live in `steps[].expected` and stay Playwright-checkable
(never subjective):

| `flow` key | Type | Meaning | Assertable as |
|---|---|---|---|
| `startRoute` | string | `ui-route` the flow begins on (`/login`). | `page.url()` pathname equals |
| `navAction` | string | The single interaction that navigates (`click submit`, `click the Dashboard nav link`). | driven by a Playwright locator |
| `destRoute` | string | Expected destination route after `navAction` (`/dashboard`). | `await expect(page).toHaveURL(/\/dashboard$/)` |
| `backTo` | string \| null | Expected route after back-navigation (browser back or an in-app Back control); `null` if the flow is one-way. | pathname equals `backTo` |
| `elements` | object[] | Screen elements exercised on `destRoute`: `[{ selector, assert, value }]` where `assert` ∈ `visible` \| `text-equals` \| `enabled` \| `toast-equals` \| `count-equals`. | the named Playwright assertion |

Rules for flow items:

- Every navigation claim is a URL/pathname equality — never "lands on the right page".
- Every screen-functionality claim is one of the five `elements[].assert` forms — never "renders correctly".
- Toast/notification checks assert exact text (`toast-equals`), not presence alone.
- If `backTo` is non-null there must be a `steps` entry that performs the back-navigation and asserts the pathname.

## Database test items (DBA persona)

A **Senior Database Engineer / Data Quality Analyst** persona authors items that assert *below* the
application boundary — schema constraints, referential integrity, transaction behavior, concurrency,
execution plans, migrations, and recovery. These items use **exactly the schema above** (`layer: "data"`,
almost always `gate: "crud"` or `gate: "smoke"`), plus a **database test item extension**. The extension
keys are present **only** on a `layer: "data"` item (or any `gate: "crud"` item that runs direct SQL);
`app`-layer items omit them entirely.

| Extension key | Type | Req | Rule |
|---|---|:-:|---|
| `targetObjects` | string[] | ✅ (data) | The concrete DB objects under test — tables, views, procedures, constraints, indexes. Prefix non-table objects: `["timeentries", "fk timeentries.projectid", "idx_timeentries_projectid"]`. Must be non-empty for a `data` item. |
| `isolationLevel` | enum | ✅ (data) | Transaction isolation the assertion holds under: `read-committed` \| `repeatable-read` \| `serializable`. Default `read-committed`. Concurrency items state the level whose anomaly (lost update, phantom) they prove or prevent. |
| `seedScript` | string | ✅ (data) | **Required, explicit** starting-state SQL/setup reference (a `.sql` path or inline DDL/DML). A data item with unspecified starting data is **INVALID** — the DBA persona refuses it. Never "table has some rows". |
| `teardownScript` | string | ✅ (data) | Required cleanup that restores prior state (rollback, `TRUNCATE`, or targeted `DELETE`). The `crud`/live tier runs on a **non-prod DB only** — a verified MCP-UAT database or `TEST_DATABASE_URL`; a production target is forced to UAT before any statement runs. |
| `expectedPlan` | string \| null | ✅ (data) | Expected execution-plan characteristics where relevant (`"index scan on idx_timeentries_projectid"`, `"no seq scan on timeentries"`). Set on `performance-scale` items; `null` when the item does not assert a plan. |

A data item's `category` (carried in `tags`, and asserted by the persona) is drawn from this DBA
vocabulary: `schema-constraint` · `referential-integrity` · `transaction-integrity` · `concurrency` ·
`performance-scale` · `migration-rollback` · `data-security` · `backup-recovery`.

Rules for data items:

- `seedScript` **and** `teardownScript` are both mandatory — a data item that cannot state its exact
  starting state and its cleanup is invalid and must not be filed.
- Expected results stay machine-checkable: assert a raised **SQLSTATE / error code**, a row count, a
  returned value, or a plan characteristic — never "the constraint works" or "performance is fine".
- A constraint that exists only in application code (not enforced by the DB) is **not** a passing
  data-layer test. File it as a FINDING via `mcp__wxkanban__project_submit_feedback` (missing DB
  constraint / integrity gap) rather than writing a green `data` item around the app-level check.

## File shape

```json
{
  "generatedFor": "specs/090-Registration",
  "inventoryRef": "tests/testplans/090-Registration/inventory.json",
  "commit": "<sha>",
  "caps": { "perUnit": { "HIGH": 12, "MEDIUM": 8, "LOW": 3 }, "global": 250 },
  "totals": {
    "items": 0,
    "byVariant": { "happy": 0, "boundary": 0, "negative": 0, "permission": 0, "concurrency": 0, "recovery": 0 },
    "byGate": { "smoke": 0, "crud": 0, "ui-flow": 0, "unit": 0 },
    "byPriority": { "P1": 0, "P2": 0, "P3": 0 },
    "byTier": { "unit-mocked": 0, "live-readonly": 0, "crud-nonprod": 0, "playwright": 0, "manual": 0, "not-testable": 0 },
    "exemptionsByCode": {},
    "deferredByCap": 0
  },
  "clarifications": [
    {
      "id": "CLAR-01",
      "unitId": "express-route:POST /auth/signin",
      "question": "On the 4th failed attempt is the account locked, or only throttled? Spec 090 §5 names both.",
      "why": "Handler branches on failedcount but the spec does not fix the threshold or the resulting status.",
      "blocks": ["TC-AUTH-004-N3"],
      "assumedForNow": "Throttle (429) is asserted as OBSERVED behavior, not ratified as intended.",
      "severityIfWrong": "High",
      "feedbackRef": null
    }
  ],
  "items": [ /* records per the field contract */ ]
}
```

`feedbackRef` on a clarification is filled with the id returned by `project_submit_feedback` once
the clarification is filed (see the insert mapping).

## Worked examples

### (a) `express-route` negative — wrong password → 401

```json
{
  "id": "TC-AUTH-001-N1",
  "title": "POST /auth/signin returns 401 and sets no session cookie for a wrong password",
  "requirementId": "FR-012",
  "specRef": "specs/090-Registration/spec.md §4.2",
  "unitId": "express-route:POST /auth/signin",
  "sourceRef": "src/server/routes/auth.ts:34",
  "fenceRef": "[SCOPE 090 / T003]",
  "gate": "smoke",
  "variant": "negative",
  "parentId": "TC-AUTH-001",
  "priority": "P1",
  "riskTier": "HIGH",
  "testLevel": "integration",
  "tier": "unit-mocked",
  "preconditions": [
    "test app booted via createApp() over supertest with pgMock DB",
    "pgMock.reset() executed",
    "seed: users row { email: qa@wx.test, passwordhash: bcrypt('Correct1!'), status: active }"
  ],
  "testData": [
    { "name": "email", "value": "qa@wx.test", "source": "literal" },
    { "name": "password", "value": "WrongPass9!", "source": "literal" }
  ],
  "steps": [
    { "step": 1, "action": "POST /auth/signin with { email, password } (wrong password)",
      "expected": "HTTP status === 401" },
    { "step": 2, "action": "read response.body",
      "expected": "body.error === 'invalid_credentials'; body contains no 'stack', 'sql', or 'passwordhash' key" },
    { "step": 3, "action": "inspect response headers",
      "expected": "no 'set-cookie' header present" },
    { "step": 4, "action": "inspect pgMock.calls",
      "expected": "exactly one SELECT against \"users\"; zero INSERT/UPDATE" }
  ],
  "flow": null,
  "postconditions": [
    "no session issued (Set-Cookie absent)",
    "no write issued to users or sessions"
  ],
  "automation": "automated",
  "automationRef": "tests/integration/auth.signin.test.ts:52",
  "blockedReason": null,
  "exemptions": [],
  "clarificationId": null,
  "rationale": "Auth failure path; a 200 or a leaked hash here is a release-blocking security defect (SOC 2 CC6.1).",
  "tags": ["auth", "bcrypt", "soc2", "mutating"],
  "result": null
}
```

### (b) `crud` item — round-trip on `timeentries`

```json
{
  "id": "TC-DB-007",
  "title": "timeentries insert→read→delete round-trips a time entry on a non-prod DB",
  "requirementId": "FR-031",
  "specRef": "specs/041-TimeTracking/spec.md §3.4",
  "unitId": "drizzle-table:timeentries",
  "sourceRef": "src/server/db/schema/timeentries.ts:8",
  "fenceRef": "[SCOPE 041 / T009]",
  "gate": "crud",
  "variant": "happy",
  "parentId": null,
  "priority": "P1",
  "riskTier": "HIGH",
  "testLevel": "integration",
  "tier": "crud-nonprod",
  "preconditions": [
    "DATABASE_URL points at the non-prod QA database (never prod)",
    "migrations applied; timeentries table empty at test start",
    "seed: users row uid-A and projects row pid-A exist"
  ],
  "testData": [
    { "name": "userid", "value": "uid-A", "source": "fixture" },
    { "name": "projectid", "value": "pid-A", "source": "fixture" },
    { "name": "starttime", "value": "2026-07-24T09:00:00Z", "source": "literal" },
    { "name": "durationminutes", "value": 90, "source": "literal" }
  ],
  "steps": [
    { "step": 1, "action": "INSERT a timeentries row via db.insert(timeentries).values(...).returning()",
      "expected": "returns one row; row.id is a UUID v7; row.durationminutes === 90" },
    { "step": 2, "action": "SELECT the row back by id",
      "expected": "exactly one row; userid === 'uid-A'; projectid === 'pid-A'; starttime === '2026-07-24T09:00:00Z'" },
    { "step": 3, "action": "SELECT count(*) from timeentries",
      "expected": "=== 1" },
    { "step": 4, "action": "DELETE the row by id and re-SELECT count(*)",
      "expected": "delete affects 1 row; subsequent count === 0" }
  ],
  "flow": null,
  "postconditions": [
    "timeentries empty again (test cleans up after itself)",
    "no rows left in users or projects were mutated"
  ],
  "automation": "automated",
  "automationRef": "tests/integration/timeentries.crud.test.ts:18",
  "blockedReason": null,
  "exemptions": [
    { "variant": "permission", "code": "N/A-NO-AUTH", "note": "Exercised at the data layer; route-level auth covered by TC-API items." }
  ],
  "clarificationId": null,
  "rationale": "Core mutation path; verifies UUID v7 default and the full write/read/delete contract against a real Postgres, not a mock.",
  "tags": ["timetracking", "drizzle", "mutating"],
  "result": null
}
```

### (c) `ui-flow` item — login → dashboard → back

```json
{
  "id": "TC-FLOW-002",
  "title": "Login submits, lands on /dashboard, and browser-back returns to /login",
  "requirementId": "FR-012",
  "specRef": "specs/090-Registration/spec.md §6.1",
  "unitId": "ui-flow-edge:/login->/dashboard",
  "sourceRef": "src/client/routes/login.tsx:44",
  "fenceRef": "[SCOPE 090 / T005]",
  "gate": "ui-flow",
  "variant": "happy",
  "parentId": null,
  "priority": "P1",
  "riskTier": "HIGH",
  "testLevel": "system",
  "tier": "playwright",
  "preconditions": [
    "app running against the QA (non-prod) stack",
    "seed: users row { email: qa@wx.test, password: Correct1!, status: active }",
    "browser context has no existing session cookie"
  ],
  "testData": [
    { "name": "email", "value": "qa@wx.test", "source": "fixture" },
    { "name": "password", "value": "Correct1!", "source": "fixture" }
  ],
  "steps": [
    { "step": 1, "action": "navigate to /login",
      "expected": "page.url() pathname === '/login'; input[name=email] is visible" },
    { "step": 2, "action": "fill email and password, then click button[type=submit]",
      "expected": "await expect(page).toHaveURL(/\\/dashboard$/)" },
    { "step": 3, "action": "read the dashboard heading",
      "expected": "h1[data-testid=dashboard-title] text-equals 'Dashboard'" },
    { "step": 4, "action": "assert the primary board widget rendered",
      "expected": "[data-testid=board-columns] is visible; column count-equals 3" },
    { "step": 5, "action": "click the browser back button (page.goBack())",
      "expected": "page.url() pathname === '/login'" }
  ],
  "flow": {
    "startRoute": "/login",
    "navAction": "click button[type=submit]",
    "destRoute": "/dashboard",
    "backTo": "/login",
    "elements": [
      { "selector": "h1[data-testid=dashboard-title]", "assert": "text-equals", "value": "Dashboard" },
      { "selector": "[data-testid=board-columns]", "assert": "visible", "value": null },
      { "selector": "[data-testid=board-columns] > [role=listbox]", "assert": "count-equals", "value": 3 }
    ]
  },
  "postconditions": [
    "session cookie present after step 2",
    "no test data mutated (read-only screen assertions)"
  ],
  "automation": "automated",
  "automationRef": "tests/e2e/login-flow.spec.ts:12",
  "blockedReason": null,
  "exemptions": [
    { "variant": "concurrency", "code": "N/A-READ-ONLY", "note": "Single-session navigation, no shared mutable state." }
  ],
  "clarificationId": null,
  "rationale": "Primary authenticated entry flow; asserts both forward navigation and that back-navigation returns to the login route rather than a broken history state.",
  "tags": ["auth", "navigation", "playwright"],
  "result": null
}
```

The happy item's derived variants, showing the ID convention:

| ID | Variant | Title | Priority |
|---|---|---|---|
| `TC-AUTH-001-B1` | boundary | rejects email at the length/format edges (empty, > 254 chars, no `@`) | P2 |
| `TC-AUTH-001-N1` | negative | returns 401, sets no cookie, leaks no hash for a wrong password | P1 |
| `TC-AUTH-001-N2` | negative | returns 401 (not 404) for an unknown email — no account enumeration | P1 |
| `TC-AUTH-001-P1` | permission | *exempt* — `N/A-NO-AUTH`, signin is the unauthenticated entry point | — |

### (d) `data` item (DBA persona) — referential-integrity constraint on `timeentries.projectid`

Proves the FK is enforced by the **database**, not just by app code: inserting a row with a
non-existent `projectid` inside a transaction must raise a foreign-key violation (SQLSTATE `23503`),
and teardown rolls back.

```json
{
  "id": "TC-DB-012-N1",
  "title": "INSERT into timeentries with a non-existent projectid raises FK violation 23503 at the DB level",
  "requirementId": "FR-031",
  "specRef": "specs/041-TimeTracking/spec.md §3.4",
  "unitId": "drizzle-table:timeentries",
  "sourceRef": "src/server/db/schema/timeentries.ts:8",
  "fenceRef": "[SCOPE 041 / T009]",
  "gate": "crud",
  "layer": "data",
  "variant": "negative",
  "parentId": "TC-DB-012",
  "priority": "P1",
  "riskTier": "HIGH",
  "testLevel": "integration",
  "tier": "crud-nonprod",
  "preconditions": [
    "connected to the non-prod UAT DB (verified MCP-UAT or TEST_DATABASE_URL; a prod URL is forced to UAT)",
    "migrations applied; fk timeentries.projectid references projects.id is present in the schema",
    "seed script executed"
  ],
  "targetObjects": ["timeentries", "fk timeentries.projectid", "projects"],
  "isolationLevel": "read-committed",
  "seedScript": "tests/testplans/041-TimeTracking/sql/seed_timeentries_fk.sql -- inserts users(uid-A), projects(pid-A); asserts NO projects row with id 'pid-GHOST'",
  "teardownScript": "tests/testplans/041-TimeTracking/sql/teardown_timeentries_fk.sql -- ROLLBACK the open transaction, then DELETE seeded users(uid-A)/projects(pid-A)",
  "expectedPlan": null,
  "testData": [
    { "name": "userid", "value": "uid-A", "source": "fixture" },
    { "name": "projectid", "value": "pid-GHOST", "source": "literal" },
    { "name": "starttime", "value": "2026-07-24T09:00:00Z", "source": "literal" },
    { "name": "durationminutes", "value": 30, "source": "literal" }
  ],
  "steps": [
    { "step": 1, "action": "BEGIN a transaction on the UAT DB",
      "expected": "transaction open; current_setting('transaction_isolation') === 'read committed'" },
    { "step": 2, "action": "INSERT INTO timeentries (userid, projectid, starttime, durationminutes) VALUES ('uid-A','pid-GHOST',...)",
      "expected": "statement raises an error; SQLSTATE === '23503' (foreign_key_violation); constraint name references timeentries_projectid_fkey" },
    { "step": 3, "action": "in the same transaction, SELECT count(*) FROM timeentries WHERE projectid = 'pid-GHOST'",
      "expected": "=== 0 (no partial row persisted)" },
    { "step": 4, "action": "ROLLBACK (teardown)",
      "expected": "transaction closed; timeentries count for uid-A unchanged from seed" }
  ],
  "flow": null,
  "postconditions": [
    "no timeentries row with projectid = 'pid-GHOST' exists",
    "DB state restored to the seeded baseline (transaction rolled back, seed rows removed)"
  ],
  "automation": "automated",
  "automationRef": "tests/integration/db/timeentries.fk.test.ts:20",
  "blockedReason": null,
  "exemptions": [],
  "clarificationId": null,
  "rationale": "Referential integrity must be enforced by the database, not only by the route layer; a missing/disabled FK here silently orphans time entries. If the FK were absent this becomes a FINDING, not a passing test.",
  "tags": ["timetracking", "drizzle", "referential-integrity", "mutating", "soc2"],
  "result": null
}
```

## wxKanban insert mapping (Phase 6)

Items are filed into wxKanban through the orchestrator MCP tools. File clarifications **first**,
then one task per item, then link each task to its spec, then upsert the plan/report docs.

1. **Clarifications → `mcp__wxkanban__project_submit_feedback`.** Any item with
   `requirementId: null` (or a `clarificationId`) has no provenance until its clarification is
   filed. Submit the clarification, store the returned id in the clarification's `feedbackRef`, and
   set the item's `clarificationId` to match.
2. **One task per item → `mcp__wxkanban__project_create_task`:**

   | Item field | Task field |
   |---|---|
   | `id` + `title` | `title` → `"[TC-AUTH-001-N1] POST /auth/signin returns 401 …"` |
   | `steps`, `preconditions`, `testData`, `flow`, `postconditions` | task body — rendered as the Markdown block below |
   | `requirementId` | linked FR (see step 3) |
   | `priority` | task priority (`P1`→high, `P2`→medium, `P3`→low) |
   | `gate` + `tier` | labels/metadata (`gate:crud`, `tier:crud-nonprod`) |
   | `tags` + `variant` | labels |
   | `automation` | label `auto:<value>` |
   | `result.status` | task status on re-sync (`pass`→done, `fail`→blocked) |

3. **Link each task to its spec → `mcp__wxkanban__project_link_task_to_spec`** on the owning
   spec `NNN` (from `specRef` / `requirementId`).
4. **Plan / report / signoff docs → `mcp__wxkanban__project_upsert_document`** with a non-empty
   `doctype` (e.g. `test-plan`, `test-report`, `signoff`).

Never file an item whose `requirementId` **and** `clarificationId` are both `null` — it has no
provenance. File the clarification first.

## Markdown rendering (for TEST-PLAN.md and the task body)

Deterministic projection of the record — same field order every time:

```markdown
#### TC-AUTH-001-N1 — POST /auth/signin returns 401 and sets no session cookie for a wrong password
`FR-012` · P1 · HIGH · integration / unit-mocked · gate: smoke · automated → `tests/integration/auth.signin.test.ts:52`
Unit: `express-route:POST /auth/signin` (`src/server/routes/auth.ts:34`, `[SCOPE 090 / T003]`) · Tags: auth, bcrypt, soc2, mutating

**Preconditions**
1. test app booted via createApp() over supertest with pgMock DB
2. pgMock.reset() executed
3. seed: users row { email: qa@wx.test, passwordhash: bcrypt('Correct1!'), status: active }

**Test data** — `email` = qa@wx.test (literal) · `password` = WrongPass9! (literal)

| # | Action | Expected result |
|--:|---|---|
| 1 | POST `/auth/signin` with wrong password | HTTP status `=== 401` |
| 2 | read `response.body` | `body.error === 'invalid_credentials'`; no stack/sql/passwordhash key |
| … | … | … |

**Postconditions** — no session issued (Set-Cookie absent) · no write to users or sessions
```

For a `ui-flow` item the renderer additionally emits a **Flow** line:

```markdown
**Flow** — `/login` --click submit--> `/dashboard` · back → `/login` · elements: h1[dashboard-title]=`Dashboard`, board-columns visible, columns count=3
```

## Self-check before Phase 2B is done

Refuse to hand over the artifacts until all of these hold:

1. Every item validates against the field contract — no missing keys, no enum violations.
2. No `steps[].expected` contains a banned subjective word, and each states a value, key set,
   count, HTTP status, error code, URL/pathname, element assertion, exact toast text, or an absence.
3. Every `unitId` exists in `inventory.json` and carries a valid kind prefix
   (`express-route:`, `drizzle-table:`, `ui-route:`, `ui-flow-edge:`, `exported-function:`,
   `exported-const-fn:`, `class-method:`, `internal-function:`, `mcp-tool:`); every non-null
   `requirementId` resolves to an `FR-###` in the referenced `specs/NNN-*/spec.md`.
4. Every item with `requirementId: null` has a `clarificationId`, that clarification exists, and it
   was filed via `project_submit_feedback` (its `feedbackRef` is set).
5. Every `happy` item's five variants are each instantiated or exempted with a code — none silent.
6. Every `gate: "ui-flow"` item has a non-null `flow` with `startRoute`, `navAction`, `destRoute`,
   and `elements`; a non-null `backTo` has a matching back-navigation step; every non-ui-flow item
   has `flow: null`.
7. `gate` and `tier` are consistent: `smoke`→`unit-mocked`/`live-readonly`, `crud`→`crud-nonprod`,
   `ui-flow`→`playwright`, `unit`→`unit-mocked`; no `crud` or `ui-flow` item points at a prod DB.
8. No unit exceeds its per-risk cap; `totals.deferredByCap` matches the `DEFERRED-CAP` exemptions.
9. `totals` (including `byGate`) recomputed from `items`, not carried over from the Phase 2A estimate.
10. Every `layer: "data"` item carries the database extension: a non-empty `targetObjects`, a valid
    `isolationLevel`, and **both** a `seedScript` and a `teardownScript` (a data item with unspecified
    starting state or no cleanup is invalid — refuse it).
11. Every `data` item's `category` (in `tags`) is one of the DBA vocabulary values
    (`schema-constraint`, `referential-integrity`, `transaction-integrity`, `concurrency`,
    `performance-scale`, `migration-rollback`, `data-security`, `backup-recovery`), its
    `steps[].expected` assert a machine-checkable signal (SQLSTATE/error code, row count, returned
    value, or `expectedPlan` characteristic), and no `crud`/live `data` item targets a prod DB.
12. Any integrity constraint enforced **only** in application code is filed as a FINDING via
    `mcp__wxkanban__project_submit_feedback` — never written up as a passing `data`-layer test.
