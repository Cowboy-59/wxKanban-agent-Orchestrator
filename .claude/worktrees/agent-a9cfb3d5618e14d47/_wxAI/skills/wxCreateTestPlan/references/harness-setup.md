# Harness setup (wxKanban — repo root)

Copy-paste ready. wxKanban is an Express (Node 20) + React 18 (Vite) + PostgreSQL 15 + Drizzle
app; tests run on **Vitest** and live at repo-root `tests/**/*.test.ts`. Five things about this
codebase break a naive Vitest setup — each is handled below.

| # | Hazard | Fix |
|---|--------|-----|
| 1 | The local `.env` `DATABASE_URL` points at the **production RDS** | force fake, prod-unreachable env in `setupFiles` (assigned with `=`), before any `src/` import |
| 2 | **Two** DB clients build a driver at module load: `src/db/client.ts` (pg `Pool`) and `src/server/db/client.ts` (postgres-js) | mock **both** drivers (`pg` and `postgres`) in `setupFiles`; leave Drizzle real |
| 3 | `src/server/config.ts` calls **`process.exit(1)`** at import if env fails its zod schema; `src/db/client.ts` **throws** at import on missing env | supply schema-valid fake values in the env setup module (see the exact keys below) |
| 4 | Route handlers are **not exported** — they are `router.<verb>("/path", ...middleware, handler)` call sites | drive them with **supertest against the real app** (`createApp()` from `src/server/app.ts`) so middleware + zod + auth all run |
| 5 | `index.ts` binds a port, starts jobs, and installs signal handlers | never import `index.ts` in a test — import `createApp` from `app.ts` (the entry `index2.ts` is DEAD) |

## Install

`vitest` is already a **root** devDependency and there are no npm workspaces — do **not** add it.
The only thing missing is the HTTP driver:

```bash
npm i -D supertest @types/supertest
```

## Reuse the existing `vitest.config.ts`

Keep the existing aliases (`~ @ @client @server @shared`), `environment: "node"`,
`globals: true`, and `include: ["tests/**/*.test.ts"]`. Add two things: hermetic `setupFiles`
(order matters — env first, then the driver mocks), and an exclude for the live suffix so
`*.live.test.ts` never runs in the default (offline) tier.

```ts
// vitest.config.ts (edited — additions marked)
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // ADDED: the live tier is opt-in only and talks to a real DB — keep it out of the default run.
    exclude: ["node_modules/", "dist/", ".history/", "**/*.live.test.ts"],
    // ADDED: env MUST run before the driver mocks, and all three before any src/ import.
    setupFiles: [
      "./tests/setup/env.ts",
      "./tests/setup/mock-pg.ts",
      "./tests/setup/mock-postgres.ts",
    ],
    restoreMocks: true,
    clearMocks: true,
    coverage: {
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "dist/", "tests/"],
    },
  },
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./src"),
      "@": path.resolve(__dirname, "./src"),
      "@client": path.resolve(__dirname, "./src/client"),
      "@shared": path.resolve(__dirname, "./src/shared"),
      "@server": path.resolve(__dirname, "./src/server"),
    },
  },
});
```

> The default run is now **hermetic**: no test can dial the prod RDS. Any existing test that
> genuinely needs a live database belongs in the live tier — rename it to `*.live.test.ts`
> (see the last section). This is deliberate: the danger here is a test reaching the prod RDS
> named in `.env`, so the offline tier makes that impossible.

## `tests/setup/env.ts`

Forces a fake, prod-unreachable env for the offline tier. Both `src/server/config.ts` (a zod
schema that `process.exit(1)`s on failure) and `src/db/client.ts` (a manual presence check that
throws) read these at import. Assign with `=` (never `??=`) so real prod-pointing credentials
loaded from repo-root `.env` can never win.

```ts
// tests/setup/env.ts
// NODE_ENV=test disables production static-serving and makes auth cookies non-secure (supertest is http).
process.env.NODE_ENV = "test";

// Unreachable host + throwaway db name. Drivers connect lazily (only on the first query),
// so this never dials out at import; the mocks below intercept any query that is issued.
// The `sslmode=require` is stripped by src/db/client.ts and ignored by the mock anyway.
process.env.DATABASE_URL =
  "postgresql://test_user:test_password@db.test.invalid:5432/wxkanban_test?sslmode=require";

// config.ts requires JWT_SECRET and ENCRYPTION_KEY to be >= 32 chars. Minting a JWT in a test
// (see the supertest example) uses THIS secret via signToken(), so the middleware verifies it.
process.env.JWT_SECRET = "test-jwt-secret-0000000000000000000000";
process.env.ENCRYPTION_KEY = "test-encryption-key-000000000000000000";
process.env.CLIENT_URL = "http://localhost:5173";

// Belt and braces: strip any real third-party credentials that a developer .env may carry,
// so nothing in the offline tier can reach Stripe / AWS / an LLM / a PM system.
for (const k of [
  "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
  "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN",
  "GEMINI_API_KEY", "OPENAI_API_KEY", "SENDGRID_API_KEY",
  "JIRA_CLIENT_SECRET", "MONDAY_CLIENT_SECRET", "ASANA_CLIENT_SECRET", "TRELLO_API_SECRET",
]) {
  delete process.env[k];
}
```

Tests that assert on `src/server/config.ts` behaviour must mutate `process.env` and re-import
with `vi.resetModules()` — `config` is a module-level singleton evaluated once per module graph.

## `tests/setup/mock-pg.ts` — the pg `Pool` (Drizzle stays real)

`src/db/client.ts` builds `new Pool(...)` and wraps it with `drizzle-orm/node-postgres`. It's
used by the libs/middleware (`auditLogger`, `pgNotifyListener`, `projectAccess`,
`requireActiveSubscription`, `referralCode`, …). Mock at the **pool boundary** and leave Drizzle
real, so the SQL it generates against `src/db/schema/*` is genuinely exercised — a typo'd column
shows up as an unmatched query.

```ts
// tests/setup/mock-pg.ts
import { vi } from "vitest";

// vi.hoisted lets the mock factory and the exported control surface share one object safely.
const h = vi.hoisted(() => {
  interface Handler { match: RegExp; rows: unknown[]; rowCount?: number }
  const state = {
    /** Every SQL string the code sent, in order. Assert shape/params against this. */
    calls: [] as Array<{ sql: string; values: unknown[] }>,
    handlers: [] as Handler[],
    /** Unmatched queries return [] — set true to make them throw instead. */
    strict: false,
    on(match: RegExp, rows: unknown[], rowCount?: number) {
      state.handlers.push({ match, rows, rowCount });
      return state;
    },
    reset() { state.calls = []; state.handlers = []; state.strict = false; },
  };

  const query = vi.fn(async (sqlOrConfig: unknown, maybeValues?: unknown[]) => {
    const sql = typeof sqlOrConfig === "string"
      ? sqlOrConfig
      : (sqlOrConfig as { text?: string })?.text ?? "";
    const values = (typeof sqlOrConfig === "string"
      ? maybeValues
      : (sqlOrConfig as { values?: unknown[] })?.values) ?? [];
    state.calls.push({ sql, values });
    const hit = state.handlers.find((x) => x.match.test(sql));
    if (!hit) {
      if (state.strict) throw new Error(`pgMock: no handler for SQL:\n${sql}`);
      return { rows: [], rowCount: 0, fields: [] };
    }
    return { rows: hit.rows, rowCount: hit.rowCount ?? hit.rows.length, fields: [] };
  });

  class FakePool {
    query = query;
    connect = vi.fn(async () => ({ query, release: vi.fn() }));
    end = vi.fn(async () => {});
    on = vi.fn();
  }

  return { state, FakePool };
});

/** Import this in a test to program rows or inspect `.calls`. */
export const pgMock = h.state;

vi.mock("pg", () => {
  const pg = { Pool: h.FakePool, Client: h.FakePool };
  return { default: pg, ...pg };
});
```

Reset and program per test:

```ts
import { beforeEach } from "vitest";
import { pgMock } from "../setup/mock-pg";

beforeEach(() => pgMock.reset());

// e.g. drive a lib that runs `SELECT ... FROM companyauditlogs`:
pgMock.on(/from\s+companyauditlogs/i, [{ id: "…", action: "LOGIN" }]);
```

## `tests/setup/mock-postgres.ts` — the postgres-js driver (safety net)

The Express **routes and services** import `db` from `src/server/db/client.ts`, which uses
`postgres` (postgres-js) + `drizzle-orm/postgres-js`, **not** `pg`. So a supertest request that
reaches the DB goes through *this* driver. Mock the `postgres` factory so no route can ever open
a socket to the RDS in `.env`.

```ts
// tests/setup/mock-postgres.ts
import { vi } from "vitest";

const h = vi.hoisted(() => {
  const calls: Array<{ query: string; params: unknown[] }> = [];

  // drizzle-orm/postgres-js calls `client.unsafe(query, params)` and, in array mode, `.values()`.
  // A thenable that also exposes `.values()` satisfies both. Default: no rows.
  const makeResult = (rows: Record<string, unknown>[]) => {
    const p: Promise<Record<string, unknown>[]> & { values?: () => Promise<unknown[][]> } =
      Promise.resolve(rows) as never;
    p.values = () => Promise.resolve(rows.map((r) => Object.values(r)));
    return p;
  };

  const sql = Object.assign(
    () => { throw new Error("postgres-js tagged-template is not stubbed in the offline tier"); },
    {
      unsafe: (query: string, params: unknown[] = []) => {
        calls.push({ query, params });
        return makeResult([]); // hermetic default — see the note below
      },
      end: async () => {},
      begin: async (fn: (t: unknown) => unknown) => fn(sql),
    },
  );

  return { factory: () => sql, calls };
});

/** Inspect the SQL the route layer emitted. */
export const pgjsMock = { calls: h.calls };

vi.mock("postgres", () => ({ default: h.factory }));
```

> **Honest caveat.** Keeping Drizzle real over postgres-js means row data is mapped **by column
> position** (`.values()` returns arrays), so shaping exact result rows through this mock is
> brittle. Treat `mock-postgres.ts` as a **hermetic safety net** (it guarantees no route reaches
> the RDS and lets you assert emitted SQL via `pgjsMock.calls`). For route tests that need
> deterministic data, **stub the service module** the route calls (shown next) rather than trying
> to fake result rows at the driver — that's the reliable pattern for the supertest tier. Precise
> "assert the generated SQL" tests are best written against the `pg` path (`mock-pg.ts`) or a
> real DB in the live tier.

## `tests/helpers/app.ts` — the supertest surface

The only faithful way to exercise a route: build the real Express app and let its middleware
chain (CORS → `express.json` → global `requireActiveSubscription` → `validateBody(zod)` →
`authenticateToken`/`requireAuth`) run. Routes mount under `/api/...`.

```ts
// tests/helpers/app.ts
import supertest from "supertest";
import { createApp } from "@server/app";
import { signToken } from "@server/lib/jwt";

/** A fresh agent bound to the real app. Each call builds a new app instance. */
export function agent() {
  return supertest(createApp());
}

/** Mint a JWT with the app's OWN signer, so authenticateToken verifies it (HS256, config.JWT_SECRET). */
export function authHeader(
  userid = "00000000-0000-0000-0000-000000000001",
  email = "tester@test.invalid",
): [string, string] {
  return ["Authorization", `Bearer ${signToken(userid, email)}`];
}
```

### Example: `POST /api/auth/signin` and an authed `GET /api/auth/me`

`signin` runs `validateBody(signInSchema)` then calls `signInUser` (service). `me` runs
`authenticateToken` + `requireAuth` then calls `getCurrentUser`. Stub the service module so the
route logic and HTTP contract are what's under test — the DB never runs.

```ts
// tests/backend/auth-routes.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { agent, authHeader } from "../helpers/app";

// Override the two service functions; keep the rest real (AccountLockedError is used by the route).
vi.mock("@server/services/userService", async (importActual) => {
  const actual = await importActual<typeof import("@server/services/userService")>();
  return { ...actual, signInUser: vi.fn(), getCurrentUser: vi.fn() };
});
import { signInUser, getCurrentUser } from "@server/services/userService";

beforeEach(() => vi.clearAllMocks());

describe("auth routes", () => {
  it("POST /api/auth/signin → 200 + user + sets httpOnly token cookie", async () => {
    vi.mocked(signInUser).mockResolvedValue({
      token: "signed.jwt.value",
      user: { userid: "u1", email: "andy@test.invalid", usertype: "ADMIN" },
    } as never);

    const res = await agent()
      .post("/api/auth/signin")
      .send({ email: "andy@test.invalid", password: "correct-horse" });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("andy@test.invalid");
    expect(res.headers["set-cookie"].join()).toMatch(/token=.*HttpOnly/i);
    expect(signInUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: "andy@test.invalid" }),
    );
  });

  it("POST /api/auth/signin → 400 when zod validation fails (bad email)", async () => {
    const res = await agent().post("/api/auth/signin").send({ email: "nope", password: "x" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
    expect(signInUser).not.toHaveBeenCalled(); // handler never reached
  });

  it("GET /api/auth/me → 401 without a token", async () => {
    const res = await agent().get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("GET /api/auth/me → 200 with a minted token", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ userid: "u1", email: "tester@test.invalid" } as never);
    const res = await agent().get("/api/auth/me").set(...authHeader("u1", "tester@test.invalid"));
    expect(res.status).toBe(200);
    expect(res.body.userid).toBe("u1");
    expect(getCurrentUser).toHaveBeenCalledWith("u1");
  });
});
```

> `vi.mock` with an alias (`@server/...`) resolves to the same absolute file the route imports
> (`../services/userService.js` → `src/server/services/userService.ts`), so the mock applies.
> The global `requireActiveSubscription` gate is inert unless `SUBSCRIPTION_GATE_ENFORCE` is
> `log`/`on`, so it does not interfere with the offline tier.

## External services to stub

None of these may run in the offline tier. Stub them per test (`vi.mock`) or rely on the env
scrub above (missing keys make the SDK throw / stay unconfigured):

| Service | Module(s) to `vi.mock` |
|---------|------------------------|
| Stripe | `stripe` (and `@server/lib/*` billing wrappers) |
| Email (SES / SendGrid / SMTP) | `@server/lib/email` (`sendEmail`) — cheapest single seam |
| S3 / presign | `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `@server/lib/marketing-assets-s3` |
| LLM (Gemini / OpenAI) | the provider wrapper under `@server/lib` (see the LLM provider contract) |
| PM systems (Jira / Monday / Asana / Trello) | the per-provider SDK client, or the integration wrapper |

Mocking `@server/lib/email` is usually enough for auth/registration flows — the routes call
`sendEmail(...)` and swallow failures, so a `vi.fn()` returning `undefined` keeps them green
without any SMTP.

## Live / CRUD tier — real DB, **never** the prod RDS

Opt-in only, and the connection is forced onto a disposable database. **Do not** assume the MCP
"test" database is safe: the hosted MCP and the app share the **same single `wxkanban` RDS** —
there is no separate UAT instance. So the only safe live target is a throwaway Postgres you
provisioned yourself, passed as `TEST_DATABASE_URL`. The guard hard-refuses anything that looks
like the prod host and refuses to run against the `.env` `DATABASE_URL`.

### `vitest.live.config.ts`

```ts
import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

export default mergeConfig(base, defineConfig({
  test: {
    include: ["tests/**/*.live.test.ts"],
    exclude: ["node_modules/", "dist/", ".history/"],
    // No env/driver mocks here — real drivers, real DB. Only the guard runs.
    setupFiles: ["./tests/setup/live-guard.ts"],
    testTimeout: 60_000,
    fileParallelism: false,
  },
}));
```

### `tests/setup/live-guard.ts`

```ts
// tests/setup/live-guard.ts
if (process.env.TEST_SWEEP_LIVE !== "1") {
  throw new Error("Live tier requires TEST_SWEEP_LIVE=1 (explicit opt-in).");
}

const target = process.env.TEST_DATABASE_URL;
if (!target) {
  throw new Error("Live tier requires TEST_DATABASE_URL pointing at a DISPOSABLE Postgres.");
}

// Refuse the production RDS in every form: the .env pointer, or any RDS/managed host.
const host = new URL(target).hostname.toLowerCase();
const prodHost = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).hostname.toLowerCase() : "";
const looksProd =
  host === prodHost ||
  target === process.env.DATABASE_URL ||
  /\.rds\.amazonaws\.com$/.test(host) ||
  /\.supabase\.co$/.test(host);
const looksLocal = host === "localhost" || host === "127.0.0.1" || host.endsWith(".test") || host.endsWith(".local");
if (looksProd || !looksLocal) {
  throw new Error(`Live tests refuse host "${host}". Use a disposable local/test Postgres via TEST_DATABASE_URL.`);
}

// Point the app's clients (which read DATABASE_URL at import) at the vetted test DB.
process.env.DATABASE_URL = target;
```

Run it:

```bash
# bash
TEST_SWEEP_LIVE=1 TEST_DATABASE_URL='postgresql://postgres:postgres@localhost:5432/wxkanban_test' \
  npx vitest run --config vitest.live.config.ts
```

```powershell
# PowerShell
$env:TEST_SWEEP_LIVE=1; $env:TEST_DATABASE_URL='postgresql://postgres:postgres@localhost:5432/wxkanban_test'
npx vitest run --config vitest.live.config.ts
```

Because the target is a disposable database you own, the live tier **may** exercise full CRUD
against `src/db/schema/*` (apply migrations first with `npm run db:generate` / your migration
runner). It must never point at the shared RDS — the guard above enforces that, but keep live
tests idempotent (create → assert → clean up) as a second line of defence.

## UI/UX flow tier — Playwright (ui-flow items)

The `ui-flow` gate (page-to-page navigation and per-screen functionality) does **not** run on
Vitest/supertest — it drives a real browser against the running app with **Playwright**. The repo
already carries flow specs at `tests/e2e/*.spec.ts` (`registration.spec.ts`, `invitations.spec.ts`,
`consultant-hub.spec.ts`, `ai-session-capture.spec.ts`) that `import { test, expect } from
"@playwright/test"` and `page.goto("/login")` with **relative** paths — i.e. they assume a
`baseURL` and an already-running app. But **`@playwright/test` is not yet a devDependency and there
is no `playwright.config.ts` at the repo root**, so those specs cannot run as-is. Both must be added.

### Prerequisite install

```bash
npm i -D @playwright/test
npx playwright install          # downloads the browser binaries (chromium at minimum)
```

### `playwright.config.ts` (create at repo root — does not exist yet)

The existing specs use relative `page.goto("/…")`, so `baseURL` must point at the Vite client
(`http://localhost:5173`), which proxies `/api` → Express on `:3001` (see `vite.config.ts`). Boot
**both** processes with a `webServer` array so `npx playwright test` is self-contained. Point them at
a **non-prod** backend (see "Auth for E2E" / "DB posture" below) — never the prod `.env` DB.

```ts
// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",           // ui-flow specs live here (*.spec.ts)
  testMatch: "**/*.spec.ts",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: "http://localhost:5173",   // Vite client; /api is proxied to :3001
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  // Boot the app for the run. Both inherit the shell env — export a NON-PROD
  // DATABASE_URL (or TEST_DATABASE_URL) before invoking, never the prod .env value.
  webServer: [
    {
      command: "npm run dev:server",     // Express on :3001
      url: "http://localhost:3001/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: "npm run dev:client",     // Vite on :5173
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
```

> If a `/api/health` route does not exist, point the server `url` at any always-200 GET the app
> serves, or drop the server entry and start `npm run dev:server` yourself before the run (which is
> what the existing specs already assume).

### Where ui-flow specs live — no collision with Vitest

- ui-flow specs stay under **`tests/e2e/*.spec.ts`** (consistent with the four already there).
- The two runners **do not collide by filename**: Vitest's `include` is `["tests/**/*.test.ts"]`
  (`.test.ts`), while Playwright's `testMatch` is `**/*.spec.ts` under `testDir: tests/e2e`. A
  `.spec.ts` is never picked up by `vitest run`, and a `.test.ts` is never picked up by Playwright.
  No exclude entry is needed on either side; keep flow tests as `.spec.ts` and CRUD/unit tests as
  `.test.ts`.

Run the tier:

```bash
npx playwright test                    # all ui-flow specs
npx playwright test tests/e2e/login-nav.spec.ts   # one spec
```

### Machine-checkable assertions only

A ui-flow item passes on **observable, deterministic** facts — the URL/pathname after a nav, an
element's visibility/enabled state, a redirect target — never on "looks right". Use:

- `await expect(page).toHaveURL(/\/dashboard/)` — landed on the right screen.
- `await expect(page.getByRole("button", { name: /Save Entry/i })).toBeVisible()` — control present.
- `await page.goBack()` then assert `new URL(page.url()).pathname` — browser back returns to origin.
- guarded-route redirect: hit a protected path unauthenticated, assert `toHaveURL(/\/login/)`, then
  after login assert you are returned to the intended path (return-to).

Concrete example (login → dashboard → browser back), matching the skill's ui-flow example:

```ts
// tests/e2e/login-nav.spec.ts
import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL ?? "tester@example.com";
const PASSWORD = process.env.TEST_USER_PASSWORD ?? "TestPass123!";

test.describe("ui-flow: auth navigation", () => {
  test("guarded route redirects to /login, then returns after login", async ({ page }) => {
    // Unauthenticated hit on a protected route → bounced to /login.
    await page.goto("/dashboard/work-hub");
    await expect(page).toHaveURL(/\/login/);

    // Real login through the form (same pattern as consultant-hub.spec.ts).
    await page.fill('[name="email"]', EMAIL);
    await page.fill('[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');

    // Returned to the intended screen (or at least reached the dashboard).
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("button", { name: /Start Timer/i }).first()).toBeVisible();
  });

  test("browser back from dashboard returns to the previous screen", async ({ page }) => {
    await page.goto("/login");
    await page.fill('[name="email"]', EMAIL);
    await page.fill('[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto("/dashboard/work-hub");
    await expect(page).toHaveURL(/work-hub/);

    await page.goBack();
    // Assert the pathname we returned to, not just "something changed".
    expect(new URL(page.url()).pathname).toBe("/dashboard");
  });
});
```

### Auth for E2E

A flow test that needs a session logs in **the real way** — seed a known test user in the non-prod
DB, then submit the login form (the pattern the existing `consultant-hub.spec.ts` already uses via a
`login(page)` helper reading `TEST_CONSULTANT_EMAIL` / `TEST_CONSULTANT_PASSWORD` from env). To avoid
re-logging-in per test, capture the session once and reuse it via Playwright `storageState`:

```ts
// tests/e2e/global-setup.ts  (referenced from playwright.config.ts: globalSetup)
import { chromium } from "@playwright/test";
export default async function () {
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL: "http://localhost:5173" });
  await page.goto("/login");
  await page.fill('[name="email"]', process.env.TEST_USER_EMAIL ?? "tester@example.com");
  await page.fill('[name="password"]', process.env.TEST_USER_PASSWORD ?? "TestPass123!");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/);
  await page.context().storageState({ path: "tests/e2e/.auth/user.json" }); // gitignore this
  await browser.close();
}
```

Then set `use: { storageState: "tests/e2e/.auth/user.json" }` for authed projects. Credentials come
from env (`TEST_USER_EMAIL` / `TEST_USER_PASSWORD`), never hard-coded.

**Non-prod backend only.** The E2E app instance must talk to a disposable/UAT database — **the same
prod-RDS guard as the CRUD tier applies**. The hosted MCP and the app share the **one** `wxkanban`
RDS, so there is no "safe test" MCP DB; export a vetted `TEST_DATABASE_URL` (or a UAT `DATABASE_URL`)
into the shell that launches `webServer`, and never let the E2E backend boot from the repo-root `.env`
that points at prod.

### DB posture

- **Mutating flows** (registration, invitations, timer save, status change) go through the running
  app against a **non-prod DB** — a disposable Postgres via `TEST_DATABASE_URL` or a verified UAT
  instance, apply migrations first (`npm run db:generate` / your runner). Same guard as the live/CRUD
  tier above: refuse the prod host, keep mutations idempotent (create → assert → clean up).
- **Read-only nav flows** (guarded-route redirect, back-navigation, "is this control visible") can
  run against a **read-only app instance** pointed at a snapshot/UAT DB, since they assert on
  rendered state and URLs without writing.

## Directory layout

```text
(repo root)
  playwright.config.ts        # NEW: ui-flow tier (testDir tests/e2e, *.spec.ts, webServer boots app)
  vitest.config.ts            # edited: setupFiles + *.live.test.ts exclude
  vitest.live.config.ts       # live tier
  tests/
    setup/    env.ts  mock-pg.ts  mock-postgres.ts  live-guard.ts
    helpers/  app.ts   fixtures.ts
    backend/  ...            # offline route/service tests (supertest)
    unit/     ...            # pure unit tests (already present)
    <anything>.live.test.ts  # live tier (opt-in, real disposable DB)
    INVENTORY.md             # generated by wxCreateTestPlan Phase 1
    TEST-PLAN.md             # authored in Phase 2
    TEST-REPORT.md           # authored in Phase 5
    .last-run.json           # vitest JSON output (gitignore this)
```

Add `tests/.last-run.json` to `.gitignore`.
