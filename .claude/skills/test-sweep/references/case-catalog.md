# Case catalog — what each unit category owes

Look up each inventory unit by its `kind` + `deps` and generate at least the **Required** cases.
HIGH-risk units get Required + Recommended. Anything you deliberately skip goes in the plan's
exclusions with a reason code.

Universal floor: **every** unit gets one happy path and one failure path. A unit with only a happy
path is not covered — it's demonstrated.

Every case below becomes an atomic item conforming to `test-item-schema.md`. The categories here tell
you *what to test*; the schema tells you *what shape the record takes*; the variant matrix below tells
you *how many*.

## Variant derivation — consider five, instantiate by tier

For each happy path, walk all five variants. Instantiate per the unit's risk tier; exempt the rest
with a code. Never skip the walk, never skip the code.

| Variant | Question it answers | Typical shape here | Common exemption |
|---|---|---|---|
| **boundary** | What happens at the edges of each input partition? | zod limits (0, -1, non-integer, > int32, empty string, max length); empty result set; single-row vs many | `N/A-SINGLE-PARTITION` — input is a fixed enum or takes no arguments |
| **negative** | What happens on invalid input or a failing dependency? | missing/wrong-typed args; pool throws; PACE throws; malformed row; `NOT_FOUND` | rarely exempt — a unit with no failure mode is suspicious |
| **permission** | What happens without the required role? | `requireRole` with a non-system principal → `FORBIDDEN`, and **no** mutation attempted | `N/A-NO-AUTH` — unit calls no auth guard |
| **concurrency** | What breaks when two callers overlap? | swapped PACE singleton mid-call; two harness clients in flight; pool exhaustion at `max: 10`; module-level `env`/`instance` shared state | `N/A-STATELESS` — pure function, no shared mutable state; `N/A-READ-ONLY` — read with no shared state |
| **recovery** | What state is left behind after a mid-operation failure? | fan-out that fails at step 3 of 6; `closeDb` called twice; `initPace` failing without preventing startup; a partially-written secret file | `N/A-NO-PERSIST` — nothing written, so nothing to recover |

Instantiation budget by risk tier (hard caps per unit):

| Risk | Instantiate | Cap |
|---|---|---:|
| HIGH | all five, unless exempt | 12 |
| MEDIUM | boundary + negative; permission if it touches `auth`; concurrency/recovery only if stateful | 8 |
| LOW | happy + one negative | 3 |

## Collapse before you count

The caps are met by *merging equivalent cases*, not by dropping coverage:

- **Equivalence partitioning** — one item per partition, not per value. The six `jobs_*` PACE
  passthroughs that all fail identically with `PACE_NOT_CONFIGURED` are **one** parameterized item
  (`tags: ["parameterized"]`) iterating the tool list, not six items.
- **Boundary partitions live in `testData`** — `min-1 / min / max / max+1` belong in one item's data
  table whenever the expected result is uniform across them. Split only where the expectation differs.
- **Suite-level items** — "every tool registers under its documented name" is one item covering all
  17 (`tags: ["suite-level"]`). Same for "every `NotConfiguredPaceClient` method throws
  `PACE_NOT_CONFIGURED`", iterated programmatically so a newly added method without a stub fails.
- **Never collapse across differing expectations.** Two inputs that should produce different error
  codes are two items, cap or no cap. If the cap forces a choice, that's `DEFERRED-CAP` with the risk
  named — not a merge that hides a distinction.

---

## A. `mcp-tool` — registered tool handlers

The product surface. Drive through `startHarness()` (see `harness-setup.md`), never by reaching
into the closure.

**Required**
1. **Registration** — the tool appears in `listTools()` under its exact name. One suite-level test
   asserts the *whole* expected tool-name set, so a dropped or renamed registration fails loudly.
2. **Happy path** — valid args produce a non-error result whose parsed JSON has the documented
   shape and field names. Assert field names explicitly; a silently renamed key is a breaking
   change for every model consuming this server.
3. **Input validation** — for each `inputSchema` key: omit a required one, and send a
   wrong-typed/out-of-range one (e.g. `jobNumber: -1` against `z.number().int().positive()`).
   Expect rejection, not a database round-trip. Assert `pgMock.calls.length === 0`.
4. **Not-found path** — where the handler throws `ToolError(..., 'NOT_FOUND')` (empty rows):
   `isError === true` and the message names the missing entity.
5. **Error envelope** — make the dependency throw an *unexpected* (non-`ToolError`) error and
   assert `safeTool` maps it to `isError: true` with the generic `Unexpected error in <tool>`
   message. This is the leak test: a raw stack, SQL text, hostname, or credential must never
   appear in tool output.

**Recommended (and Required when `mutates`)**
6. **SQL shape** — inspect `pgMock.calls`: correct table, expected columns, parameterized values
   (`$1`), and a `limit` where the handler declares one. Catches drizzle/schema drift.
7. **Auth gate** — for handlers calling `requireRole`: a principal *without* the role gets
   `FORBIDDEN` and **no** mutation is attempted. Note the current stub: `currentPrincipal()`
   always returns `{userId:'system', roles:['system']}` and `requireRole` short-circuits on the
   `system` role, so the guard is presently unreachable in production paths. Test `requireRole`
   directly with a non-system principal, and record the stub as a coverage limitation in the report.
8. **Audit emission** — every mutating tool calls `audit()` with the right `tool`, `action`,
   `target`, and principal. `audit()` currently only logs (`TODO(spec-001)` to persist), so assert
   the call, spy the logger, and flag the missing persistence as a `SPEC-GAP` finding rather than
   asserting a table write that doesn't exist.
9. **Confirmation guard** — tools with a `confirm` input (`jobs_delete_job_plan`,
   `jobs_delete_job_part_press_form`): `confirm: false`/absent must **not** delete.
10. **PACE-not-configured** — with the default `NotConfiguredPaceClient`, assert
    `isError: true` and code/message `PACE_NOT_CONFIGURED`. That is Spec 005's documented
    interim contract; tier the tool's real behavior as *blocked-by-spec*, not as failing.
11. **Multi-step partial failure** — for fan-out handlers like `jobs_job_schedule_updates` (six
    sequential PACE date pushes): make push #3 fail and assert what happens to #1–2 and #4–6.
    There is no transaction across PACE, so the honest expected behavior may be "partial write" —
    if the spec doesn't say, that's a `SPEC-GAP`, and the test documents the actual behavior.
12. **Date/null normalization** — handlers running rows through `normalizeDates`-style helpers:
    null dates stay null (not `"null"`, not epoch), and dates serialize in the documented format.

---

## B. Config & security units (`config/env.ts`, `config/secrets.ts`, `config/tls.ts`)

HIGH risk by definition — these decide whether the process connects insecurely. Use
`vi.resetModules()` + `process.env` mutation + dynamic `import()`; module-level `const env`
evaluates once per graph.

**Required**
1. **Fail-closed matrix** for `resolveDbConfig`: missing host / missing user / missing password →
   throws, and the message is actionable. `DB_TARGET=PROD` unprovisioned → the specific PROD
   message. Invalid target → throws.
2. **No secret at rest** — `password` is a *function*, not a string; calling it resolves through the
   provider. Assert `typeof cfg.password === 'function'`.
3. **`resolveSslMode` truth table** — explicit `*_PGSSLMODE` wins; legacy `*_PGSSL=true/1` →
   `verify-full`; `false/0` → `disable`; unset → `''` (secure default). One case per row.
4. **`buildTlsOptions` truth table** — `verify-full` (default when unset) / `verify-ca` /
   `require` (returns `rejectUnauthorized:false` **and warns**) / `disable` (throws unless
   `ALLOW_INSECURE_DB=true`, which warns loudly) / invalid mode (throws). Plus:
   `production: true` refuses `disable` **and** `require` and **ignores** `ALLOW_INSECURE_DB` —
   this is the single most important assertion in the config suite.
5. **Secret reference schemes** — `file://` (reads the file, and **re-reads** on each resolution so
   rotation works — assert by changing file contents between two calls), `env://VAR`, bare literal,
   empty reference (throws `SecretResolutionError`), and each reserved vault scheme
   (`keyvault://`, `vault://`, `awssm://`, `gcpsm://`) throwing rather than silently succeeding.
6. **Never logs secret values** — spy the logger across every secrets/TLS path and assert no
   captured log argument contains the secret value. Cheap test, high compliance value (SOC 2 CC6.1).

---

## C. `lib/` primitives (`errors.ts`, `auth.ts`, `audit.ts`, `logger.ts`)

Small, pure, fast — no excuse for gaps here.

**Required**
- `safeTool`: passes a success result through untouched; converts `ToolError` to its own message;
  converts an unknown throw to the generic message; logs once; **never rethrows** (a throw would
  kill the stdio connection); preserves `isError` shape.
- `ok`: wraps into `{content:[{type:'text',text}]}` with parseable JSON; handles `null`,
  arrays, nested objects, and non-serializable input (`undefined`, `BigInt`, circular) — assert
  what actually happens; `JSON.stringify` throwing inside `ok` would escape `safeTool`'s wrapper.
- `ToolError`: `name`, default `code === 'TOOL_ERROR'`, custom code retained,
  `instanceof Error`.
- `requireRole`: has the role → returns; lacks it → `ToolError` code `FORBIDDEN`;
  has `system` → passes **any** role check (document this bypass explicitly).
- `currentPrincipal`: returns the documented stub shape. Assert it, so the day real token
  verification lands the test forces an update.
- `audit`: emits with all five fields mapped correctly; awaited resolution; and a test asserting
  it does **not** yet persist (documents the `TODO(spec-001)` gap).
- `logger`: each level emits; structured metadata survives; output is single-line JSON — anything
  multi-line on stdout corrupts the stdio MCP framing. This is a real protocol hazard: confirm the
  logger writes to **stderr**, not stdout, and make that an explicit test.

---

## D. `db/` (`client.ts`)

**Required**
- `pingDb` parses `select version()` into the short version string; handles a malformed/empty row
  without throwing an unhelpful `TypeError`.
- `closeDb` calls `pool.end()`; is safe to call twice (shutdown runs it under `.catch(() => {})`).
- Pool options match the intended posture: `max`, both timeouts, `ssl` present and truthy,
  `password` a function. Guards against a regression that quietly drops TLS.
- Exclude `db/schema.ts` and `db/relations.ts` — table definitions are data, not callables. Their
  correctness is proven indirectly by SQL-shape assertions (case A.6) and the live tier.

---

## E. PACE integration (`integrations/pace/*`)

`NotConfiguredPaceClient`, `RealPaceClient`, `EpaceDb`, `PaceSoap`, `initPace`.

**Required**
- `NotConfiguredPaceClient`: **every** method throws `PACE_NOT_CONFIGURED`; `close()` resolves.
  Iterate the method list programmatically so a newly added method without a stub fails the test.
- `getPaceClient`/`setPaceClient`: default instance is the not-configured one; `set` swaps;
  isolation between tests restores the original.
- `initPace`: with PACE env absent, leaves the not-configured client installed and does **not**
  throw at startup (`index.ts` calls it before `connect`, so a throw here means the server never
  starts); with env present, installs `RealPaceClient`.
- `PaceSoap`: envelope construction for one representative call — correct action, escaped
  parameter values (inject `<`, `&`, `']]>'` into a string arg), and response parsing including a
  SOAP `Fault`. **XML injection into a SOAP body is the highest-value security test in this module.**
- `EpaceDb`: query construction is parameterized, not string-concatenated. If any method
  interpolates a value into SQL, that is a `CODE-BUG` finding (Critical), not a test to work around.
- `RealPaceClient`: mock the transport (`EpaceDb` / `PaceSoap`) and assert each method maps its
  arguments to the right underlying call and translates failures into `ToolError`, not raw
  transport errors.

---

## F. `internal-function` helpers

Reached only through their caller. Prefer covering them via the tool tests (case A) — inflating the
count with contrived indirect tests is worse than honestly recording them as
*covered-indirectly* or *not-covered* in the plan. Exception: pure transforms with real branching
(date normalization, flag mapping, `applyJobDate`) deserve direct tests — export them for testing
only if the user approves the source change; otherwise cover them through the tool and say so.

---

## G. `app/scripts/*.ts`

Operational one-shots (`smoke.ts`, `bench-vwjobs.ts`, `verify-schema.ts`, `apply-sql.ts`, …).
They run against live systems and mostly have `main()` with side effects at import.

Default tier: **manual**, not unit. Do not import them in the unit tier — a top-level `await main()`
would execute on import. `apply-sql.ts` is a *mutating* script: never invoke it from any test.
Cover pure exported helpers only, and list the rest as manual with the command to run them.

---

## Assertion style

**No subjective expected results.** Every `steps[].expected` must state a value, a key set, a count,
an error code, or an absence. If you cannot phrase it that way, the item isn't ready — it's a
Clarifications Required entry.

| ✗ Subjective | ✓ Checkable |
|---|---|
| "returns the correct job data" | "payload key set equals the 12 documented fields; `payload.jobNumber === 480123`" |
| "handles the error gracefully" | "`isError === true`; text equals `Unexpected error in jobs_get_job`; no `select` appears in the text" |
| "TLS is configured appropriately" | "returns `{ rejectUnauthorized: true, ca: <pem> }`; `logger.warn` not called" |
| "performance is reasonable" | — no NFR target in any spec → `CLAR-nn`, not an item |
| "audit works" | "`logger.info` called once with `{tool:'jobs_update_job_status', action:'update', userId:'system'}`" |

Banned in `expected`: *correct, as expected, works, properly, looks right, reasonable, appropriate,
successfully* (unqualified), *valid* (unqualified), *sensible*, *acceptable*.

- Assert **field names and values**, not just truthiness. `expect(data.jobNumber).toBe(12345)`,
  not `expect(data).toBeTruthy()`.
- One behavior per test, named by item ID, with a title stating the expectation:
  `TC-JOBS-001-N1 returns NOT_FOUND when the job number has no row`.
- **Observed ≠ intended.** When behavior rests on an ambiguity, assert what the code does and say so
  in the title (`… (OBSERVED, pending CLAR-01)`), with `clarificationId` set. Never let a passing
  test silently ratify unspecified behavior as the contract.
- No snapshot tests for tool payloads — a snapshot silently blesses a breaking field rename.
- Fixtures in `tests/helpers/fixtures.ts`, shaped from real `db/schema.ts` column names. If a
  fixture needs a column that doesn't exist in the schema, that's a finding.
- Never assert on a real job number, customer, or hostname pulled from live data. Live-tier tests
  discover their own sample IDs at runtime (as `scripts/smoke.ts` does) and assert on *shape*.
