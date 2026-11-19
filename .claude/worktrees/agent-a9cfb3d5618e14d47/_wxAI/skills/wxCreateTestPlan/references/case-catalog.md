# Case catalog — what each unit category owes

Look up each inventory unit by its `kind` + `deps` and generate at least the **Required** cases.
HIGH-risk units get Required + Recommended. Anything you deliberately skip goes in the plan's
exclusions with a reason code.

Universal floor: **every** unit gets one happy path and one failure path. A unit with only a happy
path is not covered — it's demonstrated.

Every case below becomes an atomic item conforming to `test-item-schema.md`. The categories here tell
you *what to test*; the schema tells you *what shape the record takes*; the variant matrix below tells
you *how many*.

## Tiers map to the three signoff gates

wxKanban's DB posture is fixed and non-negotiable (the local `.env` `DATABASE_URL` points at the
**production RDS**), so each case declares the tier it runs at, and every tier maps to a gate:

| Tier | DB posture | Gate it feeds |
|---|---|---|
| **unit-mocked** | `pg` pool in `src/db/client.ts` **mocked**, **drizzle left real** (generated SQL against `src/db/schema/*` is exercised); Stripe/SES/S3/Gemini/PM SDKs stubbed; forced fake env | **Gate 1 — Smoke signoff** (responds without crashing, read-only/mocked) |
| **live-crud** | a **non-prod DB only** — the MCP test-DB connection *with verified UAT capability*, or an explicit `TEST_DATABASE_URL`. Production is forced to UAT; there is no PROD write path | **Gate 2 — CRUD & execute signoff** (real create→read→update→delete round-trip + real behavior execution) |
| **manual / user** | evidence presented, no self-certification | **Gate 3 — Final signoff** (user verification) |

Route and service happy paths run mocked at the unit tier for Gate 1; the true round-trip against
real rows only ever runs at the live-crud tier for Gate 2, and never against the prod-pointing `.env`.

## Variant derivation — consider five, instantiate by tier

For each happy path, walk all five variants. Instantiate per the unit's risk tier; exempt the rest
with a code. Never skip the walk, never skip the code.

| Variant | Question it answers | Typical shape here | Common exemption |
|---|---|---|---|
| **boundary** | What happens at the edges of each input partition? | zod limits (0, -1, non-integer, > int32, empty string, max length); empty result set; single-row vs many; pagination `limit`/`offset`/cursor edges | `N/A-SINGLE-PARTITION` — input is a fixed enum or the route/fn takes no arguments |
| **negative** | What happens on invalid input or a failing dependency? | missing/wrong-typed body field → `400`; pool throws → `500`; empty rows → `404`; unique-index collision → `409`; malformed row | rarely exempt — a unit with no failure mode is suspicious |
| **permission** | What happens without the required credential or role? | no JWT httpOnly cookie → `401`; valid cookie, wrong role → `403`; another company's resource → `403`/`404`; **and no mutation attempted** | `N/A-NO-AUTH` — route/fn runs no `authenticateToken`/`requireRole` guard (e.g. `GET /health`, `POST /auth/signin`) |
| **concurrency** | What breaks when two callers overlap? | two supertest requests in flight; unique-constraint race on `POST /auth/signup`; lost update on `PATCH /projects/:id`; pool exhaustion at the configured `max`; module-level shared state (`env`, a cached signer) | `N/A-STATELESS` — pure function, no shared mutable state; `N/A-READ-ONLY` — read with no shared state |
| **recovery** | What state is left behind after a mid-operation failure? | a multi-write service (create project → seed `projectphases` → write `companyauditlogs`) that fails at step 2; transaction rollback; a wizard/modal cancelled mid-edit; a failed submit that must not double-insert | `N/A-NO-PERSIST` — nothing written, so nothing to recover |

Instantiation budget by risk tier (hard caps per unit):

| Risk | Instantiate | Cap |
|---|---|---:|
| HIGH | all five, unless exempt | 12 |
| MEDIUM | boundary + negative; permission if it touches `auth`; concurrency/recovery only if stateful | 8 |
| LOW | happy + one negative | 3 |

## Collapse before you count

The caps are met by *merging equivalent cases*, not by dropping coverage:

- **Equivalence partitioning** — one item per partition, not per value. Every mutating route that
  returns `401` identically when the JWT cookie is absent is **one** parameterized item
  (`tags: ["parameterized"]`) iterating the route table, not one per route.
- **Boundary partitions live in `testData`** — `min-1 / min / max / max+1` belong in one item's data
  table whenever the expected result is uniform across them. Split only where the expectation differs.
- **Suite-level items** — "every route mounts under its documented `METHOD /path`" is one item
  covering the whole table (`tags: ["suite-level"]`). Same for "every authed route rejects a missing
  cookie with `401`" and "every React route in `src/client` renders without triggering an error
  boundary", iterated programmatically so a newly added route without a guard fails.
- **Never collapse across differing expectations.** Two inputs that should produce different status
  codes (`400` vs `409`) are two items, cap or no cap. If the cap forces a choice, that's
  `DEFERRED-CAP` with the risk named — not a merge that hides a distinction.

---

## A. `express-route` — the primary surface

`METHOD /path` + middleware chain + handler. This is the product's main surface. Drive through
**supertest against the real Express app** (`src/server/app.ts` builds it; `src/server/index.ts` is
the entry — `index2.ts` is DEAD), never by calling the handler closure — the middleware chain, zod
validation, and auth guards must run. Mint JWTs with the app's own signer for authed cases.

**Required**
1. **Mounting** — the route responds under its exact `METHOD /path` (documented status, not `404`).
   One suite-level test asserts the *whole* documented route table mounts, so a dropped or renamed
   route fails loudly.
2. **Happy path** — a valid request produces the documented status (`200`/`201`) and a body whose
   key set matches the documented shape. Assert field names explicitly, and assert sensitive fields
   are **absent** — e.g. neither `POST /auth/signin` nor `GET /users/:id` may return `passwordhash`.
   A silently renamed key is a breaking change for every React page and TanStack Query cache reading
   it.
3. **Input validation (zod)** — for each body/query/param field: omit a required one, and send a
   wrong-typed/out-of-range one (e.g. `POST /projects` with `name` missing, or `limit: -1` against a
   `z.number().int().positive()`). Expect `400` with the validation-error shape, **not** a DB
   round-trip. Assert `pgMock.calls.length === 0`.
4. **Not-found path** — where the handler returns `404` on empty rows: status `404`, the body names
   the missing entity, and nothing leaks.
5. **Error envelope** — make a dependency (the pool or a service) throw an *unexpected* error and
   assert the route returns `500` with a generic message. This is the leak test: a raw stack, SQL
   text, the RDS hostname, a connection string, or the JWT secret must **never** appear in the
   response body — and must not be logged at `info` (Pino error path only).

**Recommended (and Required when the route mutates — `POST`/`PUT`/`PATCH`/`DELETE`)**
6. **SQL shape** — inspect `pgMock.calls`: correct table (`users`, `projects`, `timeentries`),
   expected columns, parameterized values (`$1`), and a `limit`/`where` where the handler declares
   one. Catches drizzle/schema drift against `src/db/schema/*`. (deps: `drizzle-db`, `pg-raw`)
7. **Auth gate** — a route behind `authenticateToken`: **no** JWT httpOnly cookie → `401` and **no**
   mutation attempted; an expired or tampered token → `401`. A route behind `requireRole` with a
   valid cookie for the wrong role → `403` and no mutation. (deps: `auth`)
8. **Tenant / ownership scoping** — a user requesting another company's project or another user's
   time entry gets `403`/`404`, never another tenant's row in the body. Data-isolation test; highest
   value on any multi-tenant read or write. (deps: `auth`, `drizzle-db`)
9. **Audit emission** — a mutating route that calls `audit()` writes a `companyauditlogs` row (or
   logs) with the right actor, action, and target. Assert the call; if it only logs, spy the Pino
   logger and flag the missing persistence as a `SPEC-GAP` finding rather than asserting a table
   write that doesn't exist. (deps: `audit`)
10. **Idempotency / unique constraint** — a `POST` that hits a unique index (duplicate `users.email`
    on `POST /auth/signup`) returns `409`, not `500`, and leaves **no** partial row.
11. **Side-effect stubs** — routes touching `stripe`/`email`/`storage`/`ai`/`pm-api`: assert the SDK
    is called with the mapped arguments **and** is stubbed — no real charge, send, upload, model
    call, or PM-system push in any tier. (deps drive which.)
12. **Pagination / filtering** — list routes: `limit`/`offset`/cursor at the partition edges; an
    empty result set returns `200 []`, not `404`.

---

## B. `drizzle-table` — CRUD target

A `pgTable` definition in `src/db/schema/*` (`users`, `projects`, `timeentries`,
`pmsystemconnections`, …). It is **data, not a callable** — it carries no branching logic, so it gets
**no unit-tier variant walk**. Its correctness is proven two ways:

- **Indirectly at the unit tier (Gate 1)** — the SQL-shape assertions in case A.6 exercise its table
  and column names through real drizzle. List, per table, the routes/services that touch it.
- **Directly at the live-crud tier (Gate 2)** — a real **create → read → update → delete** round-trip
  per table in scope, against a **non-prod DB only** (MCP test-DB with verified UAT capability, or an
  explicit `TEST_DATABASE_URL`). Production is forced to UAT; **never** run this against the
  prod-pointing `.env`.

**Required at the live-crud tier**
- **Round-trip** — create a row, read it back (all columns present, UUID v7 PK shape), update a field
  and re-read it, delete it and confirm it's gone. Assert row state after **each** step, not just at
  the end.
- **Constraints** — insert a duplicate unique value (`users.email`) → the DB rejects; insert with a
  missing/invalid FK (`timeentries.userid` → `users.id`) → rejects; delete a parent that has children
  (`projects` with `timeentries`) → cascade or restrict **exactly** as the schema declares.
- **Defaults & nullability** — `NOT NULL` columns reject `null`; declared defaults (`createdat`)
  populate; a `null`-able column stays `null` on read (not `"null"`, not an epoch).

The `drizzle-table` unit is exempt from the five-variant walk with the round-trip standing in for it;
record that as the reason, not silence.

---

## C. `ui-route` — React page renders and guards

A React Router route path → its page component (`/dashboard`, `/projects/:id`, `/signin`). Component
/ render tier (Vitest + Testing Library for pure render; Playwright when a real browser is needed).
Give these the same rigor as backend cases.

**Required**
1. **Renders without crash** — the page mounts for its route path and shows its primary landmark; no
   error boundary triggers. Suite-level: every documented route in `src/client` renders.
2. **Auth guard (permission)** — an auth-gated route visited **unauthenticated** (no session / no JWT
   cookie) redirects to `/signin` and preserves a return-to, rather than rendering blank or crashing.
   Public routes (`/`, `/signin`, `/signup`) render **without** a session. (deps: `auth`)
3. **Loading state** — while the page's TanStack Query is pending, the documented skeleton/spinner
   shows — not empty content and not a crash.
4. **Empty state** — the query resolves to `[]` → the documented empty state ("No projects yet"),
   not a broken or blank list.
5. **Error state** — the query rejects (stub the underlying route to `500`) → the documented error UI
   with a retry affordance, not a white screen.

**Recommended (Required for HIGH-risk screens — auth, billing, any mutating screen)**
6. **Data binding** — fetched fields render into the right slots; sensitive fields are **never**
   rendered (no `passwordhash`, no raw token).
7. **Role-conditioned UI** — admin-only controls are **absent** (not merely disabled) for a
   non-admin session; assert absence.
8. **Deep-link / refresh** — navigating directly to a nested route (`/projects/:id/board`) and a hard
   refresh both resolve (guard re-runs, data refetches), not a SPA `404`.

---

## D. `ui-flow-edge` — navigation page→page and back

A `navigate()` / `<Link to>` edge between two pages. Playwright E2E. The plan must cover the flow
**forward and back**, not just the forward hop.

**Required**
1. **Forward navigation** — the edge fires: activating the control on page A lands on page B at the
   expected URL with B's content. e.g. dashboard → project board via a project card.
2. **Back navigation** — browser **Back** *and* any in-app Back control return to page A with A's
   state intact (filters/scroll where applicable), not a reload into a blank state.
3. **Guarded-edge redirect + return-to (permission)** — an edge into an auth-gated page while
   unauthenticated redirects to `/signin`; after a successful sign-in the user lands on the
   **originally-requested** page, not a generic home. This is the login→return-to contract.
4. **Deep-link / refresh mid-flow** — refreshing on the destination nested route re-resolves it
   (guard re-runs, data refetches), and **Back** still works afterward.

**Recommended**
5. **Cancel/dismiss path (recovery)** — a modal/wizard edge: opening then cancelling returns to the
   origin with **no** partial mutation.
6. **Cross-flow round-trip** — a multi-hop path returns home: login → dashboard → project → task
   detail → Back → Back → dashboard, asserting each hop's URL **and** landmark.

---

## E. Per-screen functionality — every control does what it claims

Playwright E2E. On each screen, every link, button, tab, and field is exercised for the behavior it
advertises. Same rigor as backend cases (happy / negative / permission / recovery).

**Required — one item per interactive-element class on the screen**
1. **Buttons / submit (happy)** — the primary action fires the right request and reflects the result.
   e.g. the Sign in button on `/signin` posts `POST /auth/signin`, the session cookie is set, and the
   app routes to `/dashboard`.
2. **Validation display (negative)** — invalid field input shows the field-level error (sourced from
   the zod `400`) inline, submit stays blocked, and a subsequent valid submit clears the errors.
3. **Disabled states** — submit is disabled while pending and while required fields are empty; no
   double-submit — assert **one** request was sent, not two.
4. **Toasts / feedback** — success and failure each surface the documented toast; a `500` shows the
   error toast, not a silent no-op.
5. **Links / tabs** — every nav link and tab switches to its target (each edge is also a
   `ui-flow-edge` case) and the active tab reflects the URL.
6. **Fields** — controlled inputs update; selects/checkboxes/toggles change state; the value
   round-trips into the request payload.

**Same-rigor variants**
- **permission** — an action the current role can't perform is **absent**, or `403`s cleanly with a
  message, on the screen.
- **recovery** — a submit that fails mid-flight leaves the form re-editable with the entered values
  preserved and **no** duplicate row created.

A purely static informational screen with no interactive element is exempt per element class it
lacks — `N/A-NO-PERSIST` for recovery, `N/A-SINGLE-PARTITION` for boundary — recorded, never silent.

---

## F. `exported-function` / `exported-const-fn` — services and helpers

Directly importable: service functions (`createProject`, `calculateInvoiceTotal`), validators, and
pure transforms. Unit tier, `pg` mocked.

**Required**
- Happy + at least one failure (the universal floor).
- **DB-touching services** — SQL shape + not-found + error mapping (mirror A.6 / A.4 / A.5), but
  called directly rather than through supertest. (deps: `drizzle-db`)
- **Pure transforms** — duration/date formatting for `timeentries`, flag mapping: boundary partitions
  in `testData` (0, negative, a DST boundary via the `clock` dep, empty, max), and `null` handling —
  `null` stays `null`, never `"null"` or an epoch. (deps: `clock`)
- **`auth`/`bcrypt` helpers** — `bcrypt.compare` true for the right password and false for the wrong
  one; a JWT sign→verify round-trip; a tampered or expired token rejected. (deps: `auth`, `bcrypt`)
- **External-SDK wrappers** (`stripe`/`email`/`storage`/`ai`/`pm-api`) — stub the SDK, assert the
  mapped call, and assert a transport failure is translated into the app's error type, not re-thrown
  as a raw SDK error to the caller.

---

## G. `class-method`

Reached on an instance. Mock the collaborators/transport and assert each method maps its arguments to
the right underlying call and translates failures into the app's error type, not a raw pool/SDK
error. **If any query method interpolates a value into SQL instead of parameterizing it, that is a
`CODE-BUG` finding (Critical), not a test to work around.** Iterate the method list programmatically
where the class exposes a family of similar methods, so a newly added method without coverage fails.

---

## H. `internal-function` helpers

Reached only through their caller. Prefer covering them via the route/service tests (cases A and F) —
inflating the count with contrived indirect tests is worse than honestly recording them as
*covered-indirectly* or *not-covered* in the plan. Exception: pure transforms with real branching
(date normalization, flag mapping, duration rounding) deserve direct tests — export them for testing
only if the user approves the source change; otherwise cover them through the caller and say so.

---

## I. Config, auth & security primitives (cross-cutting — HIGH by definition)

These decide whether the process connects insecurely or authenticates wrongly:
`src/db/client.ts` (pool + `sslmode=require`), env loading, the JWT signer, bcrypt, and cookie flags.
Use `vi.resetModules()` + `process.env` mutation + dynamic `import()`; module-level `const` config
evaluates once per graph.

**Required**
1. **Pool TLS posture** — `src/db/client.ts` builds the pool with `sslmode=require`; assert `ssl` is
   present/truthy and pool `max` + timeouts match the intended posture. Guards a regression that
   silently drops TLS to the prod RDS. `pg` is mocked, so assert the **config object**, not a live
   connect. (deps: `env`, `net`)
2. **Env fail-closed** — required env (`DATABASE_URL`, the JWT secret) missing → the process throws
   an **actionable** error at startup, not a silent insecure default.
3. **No secret at rest / no secret logged** — spy the Pino logger across the auth/db/secret paths and
   assert no captured log argument contains the JWT secret, the DB password, or the connection
   string. Cheap test, high compliance value (SOC 2 CC6.1). (deps: `logger`, `env`)
4. **JWT contract** — a token signed with the app secret verifies; a tampered signature, an expired
   token (via the `clock` dep), and `alg:none`/wrong-issuer are each rejected. The auth response sets
   the cookie `httpOnly` **and** `Secure` **and** `SameSite`. (deps: `auth`)
5. **bcrypt** — the password is hashed (the `users` row carries `passwordhash`, never a plaintext
   `password`); `compare` is true for the right password and false for the wrong one; the cost factor
   is the intended value. (deps: `bcrypt`)
6. **Production forced to UAT** — any config path that would resolve the live-crud tier to the
   **production RDS host** is refused; there is no PROD write path. **This is the single most
   important assertion in the security suite.**

---

## J. `mcp-tool` — optional tool surface (ONLY if the target has an MCP)

wxKanban's **primary** surface is Express routes; an MCP tool surface may or may not exist. When the
target ships one (the `mcp-server/` registry), cover it — reconciling against the **registry**, not
inline `registerTool` (per SKILL Phase 1) — and drive it through the harness (`harness-setup.md`),
never by reaching into the registry closure. When the target has no MCP, this whole section is
`N/A` — say so in the plan, don't invent tools.

**Required (when present)**
1. **Registration** — the tool appears in the tool list under its exact name. One suite-level test
   asserts the *whole* documented tool-name set, so a dropped or renamed registration fails loudly.
2. **Happy path** — valid args produce a non-error result whose parsed JSON has the documented shape
   and field names. Assert field names explicitly; a silently renamed key breaks every model
   consuming the tool.
3. **Input validation** — omit a required arg / send a wrong-typed one → rejection, **not** a DB
   round-trip.
4. **Not-found + error envelope** — the leak test: no stack, SQL text, host, connection string, or
   token in the tool output.
5. **Token / project binding** — the tool honors its project scope (SCOPE-097 token↔project binding):
   a call bound to one project must not read or write another project's rows. (deps: `auth`,
   `drizzle-db`)

---

## Assertion style

**No subjective expected results.** Every `steps[].expected` must state a value, a key set, a count,
a status code, an error code, or an absence. If you cannot phrase it that way, the item isn't ready —
it's a Clarifications Required entry.

| ✗ Subjective | ✓ Checkable |
|---|---|
| "returns the correct user" | "`res.status === 200`; `body.user` key set equals the 9 documented fields; `body.user.passwordhash === undefined`" |
| "handles the error gracefully" | "`res.status === 500`; `body.error === 'Internal Server Error'`; response text contains no `select`, no `rds.amazonaws.com`, no connection string" |
| "TLS is configured appropriately" | "pool config `ssl` is truthy; the resolved DSN contains `sslmode=require`; `logger.warn` not called" |
| "the page loads fine" | "`/dashboard` renders `<main>` and the project list landmark; no error boundary; loading skeleton shown while the query is pending" |
| "performance is reasonable" | — no NFR target in any spec → `CLAR-nn`, not an item |
| "auth works" | "no JWT cookie → `res.status === 401`; `pgMock.calls.length === 0`" |

Banned in `expected`: *correct, as expected, works, properly, looks right, reasonable, appropriate,
successfully* (unqualified), *valid* (unqualified), *sensible*, *acceptable*.

- Assert **field names and values**, not just truthiness. `expect(body.user.email).toBe('a@b.com')`,
  not `expect(body).toBeTruthy()`.
- One behavior per test, named by item ID, with a title stating the expectation:
  `TC-AUTH-001-N1 returns 401 when the JWT cookie is absent`.
- **Observed ≠ intended.** When behavior rests on an ambiguity, assert what the code does and say so
  in the title (`… (OBSERVED, pending CLAR-01)`), with `clarificationId` set. Never let a passing
  test silently ratify unspecified behavior as the contract.
- **No snapshot tests** for API payloads or rendered DOM — a snapshot silently blesses a breaking
  field rename or a broken layout.
- Fixtures in `tests/helpers/fixtures.ts`, shaped from real `src/db/schema/*` column names
  (`users.passwordhash`, `projects.companyid`, `timeentries.starttime`). If a fixture needs a column
  that doesn't exist in the schema, that's a finding.
- Never assert on a real user, company, or hostname pulled from the prod RDS. Live-crud-tier (Gate 2)
  tests create their **own** rows in the non-prod DB and clean up; any read-only live check discovers
  its sample IDs at runtime and asserts on *shape*, never on production values.
