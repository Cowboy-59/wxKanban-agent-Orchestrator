---
name: run-wxkanban
description: Run, start, and drive the wxKanban web app (Express API + React client) locally to see a change working — log in as an ADMIN, TEAM_MEMBER or SYSADMIN, open a page, fill and save a form, call an API route with that login, and take screenshots. Use when asked to run or start the app, check a page or UI change in the browser, screenshot a screen, or endpoint-test a route as a given role. Safe against the production database: no background jobs, and the test company's row is restored afterwards.
---

# run-wxkanban

This skill runs the real app (`createApp()` from `src/server/app.ts` plus the built client) on
port 5199, **without** `src/server/index.ts` and its background jobs. You drive it with
`.claude/skills/run-wxkanban/driver.mts`, a headless-Chromium driver that reads one command per
line from stdin.

All paths are relative to the repo root. This was verified on Windows 10 with Git Bash (the Bash
tool), Node 24.6 and Playwright 1.62.

> **The local database is PRODUCTION.** The env file's `DATABASE_URL` is prod, so every save
> you make in the driver writes real data.
> - Only use the test company: Wxperts LLC, our own, `019c777f-a918-774a-80ae-821c3310eb0a`.
> - The driver snapshots that company's `companies` row at start and writes back any changed
>   column at exit (add `keep` to skip that).
> - **Rows in other tables are not restored.** Undo those yourself.

## Prerequisites

```bash
node --version                       # v24.6.0 verified
npx playwright install chromium      # no-op when already installed
```

## Build

Build both whenever client or server code has changed:

```bash
npm run build:client
npx esbuild .claude/skills/run-wxkanban/serve-entry.ts --bundle --platform=node --target=node22 --format=cjs --outfile=dist/run-wxkanban/serve.cjs --packages=external --log-level=warning
```

The client lands in `dist/client/` and the server bundle in `dist/run-wxkanban/serve.cjs`. Both
are under the gitignored `dist/`.

## Run (agent path)

**1. Start the server.** Use the Bash tool with `run_in_background: true`:

```bash
node dist/run-wxkanban/serve.cjs > dist/run-wxkanban/serve.log 2>&1
```

**2. Wait until it's ready.** Don't use a fixed sleep:

```bash
for i in $(seq 1 40); do curl -sf http://127.0.0.1:5199/health >/dev/null && break; sleep 1; done; curl -s http://127.0.0.1:5199/health
```

**3. Drive it.** Pipe a script to the driver. This one was run as written and passed:

```bash
npx tsx .claude/skills/run-wxkanban/driver.mts <<'EOF'
login admin
nav /admin/settings
wait-gone text=Loading…
expect-value label:text-is("VAT Number") + input =>
fill label:text-is("VAT Number") + input => DE123456789
click button:has-text("Save Company Info")
wait-for text=Company information saved.
nav /admin/settings
expect-value label:text-is("VAT Number") + input => DE123456789
screenshot admin-settings => section:has(h2:has-text("Company Information"))
api GET /api/admin/settings
login member
api PUT /api/admin/settings {"vatNumber":"X"}
EOF
```

What it prints:
- `> command` followed by the result (`ok`, a value, an HTTP status and body, or `FAIL: …`).
- At the end, `company "Wxperts LLC": restored (phone, vatnumber, updatedat)`.
- `browser problems: N`, followed by every console error, page error and HTTP 4xx/5xx with its URL.

The exit code is 0 when every step passed. On the first failure the driver stops, saves
`dist/run-wxkanban/shots/FAIL.png` and exits 1. Screenshots go to `dist/run-wxkanban/shots/`.
**Open each screenshot you take.**

A SysAdmin flow, also verified:

```bash
npx tsx .claude/skills/run-wxkanban/driver.mts <<'EOF'
login sysadmin
nav /sysadmin/dashboard
click button:has-text("Companies")
fill input[placeholder="Search companies..."] => Wxperts
click tr:has-text("Wxperts LLC") button[title="View"]
expect-text dt:text-is("VAT number") + dd => —
EOF
```

**4. Stop the server:**

```bash
PID=$(netstat -ano | grep -E "127.0.0.1:5199\s.*LISTENING" | awk '{print $NF}' | head -1); [ -n "$PID" ] && taskkill //PID $PID //F
```

### Driver commands

Selectors are Playwright selectors. `text=…`, `:has-text()`, `:text-is()` and `a + b` all work.
Commands that take a value separate it from the selector with ` => `.

| command | what it does |
|---|---|
| `login admin\|manager\|member\|sysadmin` | Starts a fresh browser context logged in as a real user. admin, manager and member come from the test company; sysadmin is the first SYSADMIN. `member` falls back to a TEAM_MANAGER. |
| `nav /path` | Opens a page on port 5199. |
| `wait-for <sel>` / `wait-gone <sel>` | Waits up to 30s for the element to be visible, or hidden or gone. |
| `click <sel>` | Clicks the element. |
| `fill <sel> => <text>` | Types into a React controlled input. Leaving the text empty clears the field. |
| `value <sel>` / `text <sel>` | Prints an input's value, or an element's text. |
| `expect-value <sel> => <text>` / `expect-text <sel> => <text>` | Asserts the value or text, polling for up to 30s. It fails the run on a mismatch. |
| `screenshot <name>` / `screenshot <name> => <sel>` | Saves a full-page or single-element PNG to `dist/run-wxkanban/shots/<name>.png`. |
| `api <METHOD> /api/... [json]` | Calls the API as the current login, sending both the cookie and `Authorization: Bearer <jwt>`. Prints the status and the body (first 600 characters), or `<content-type, N bytes>` for a binary response such as a kit archive. |
| `errors` | Lists the browser problems collected so far. |
| `keep` | Leaves the test company's row as it is at exit, without restoring it. |
| `quit` | Stops reading commands. |

Environment overrides:
- `WXK_RUN_COMPANY=<uuid>`: a different test company.
- `WXK_RUN_PORT=<n>`: a different port. Set it for the server and the driver alike.

## Run (human path)

`npm run dev:server` + `npm run dev:client` is the normal dev loop. **Don't use it to check a
change.** `index.ts` starts the archival sweep and other jobs against production. `dev:server` was
not run for this skill, but it loads `createApp` through `tsx`, which fails (see Troubleshooting).

## Gotchas

- **`src/server/index.ts` starts four job loops** against the production database:
  `startSubscriptionArchivalJob`, `startInfraHealthJob`, `startAISessionJobs` and
  `startAutoScopeAnalysisJob`. That is why this skill serves `createApp()` itself.
- **Logins are minted, not signed in.** Auth is a stateless JWT in the `token` cookie. The driver
  signs one with the app's own `signToken` and puts the company's real plan, status and seat
  claims in it.
- **Saving a settings form rewrites more than the field you changed.** On `/admin/settings`,
  saving round-trips every field, so a NULL `phone` comes back as `""`. That is why the driver
  restores every column that changed, not just the one you touched.
- **Kit routes ignore the cookie.** `/api/projects/:id/kit/*` reads only the `Authorization`
  header (a JWT or a project API token), so a cookie-only call gets
  `401 Missing authorization token`. The driver's `api` command sends both.
- **`/kit/upgrade` pauses once per project.** Below the preservation-fix version, the first call
  returns `409 Upgrade paused once for safety…` and writes a `companyauditlogs` row. The second
  call serves the archive.
- **Labels have no `htmlFor`**, so `getByLabel` finds nothing. Use `label:text-is("X") + input`.
- **Inputs render empty until their fetch lands.** Use `wait-gone text=Loading…` or
  `expect-value` (which polls). Don't use `value` straight after `nav`.
- **`/settings` logs `HTTP 404 GET /api/tier/info`.** That is an existing bug, not your change:
  `src/server/routes/tier.ts` is never mounted.
- **A hook blocks any Bash command whose text mentions the env file** ("block-secret-reads").
  Load it inside a script file, the way the driver does. Never name it on the command line.

## Troubleshooting

- **`SyntaxError: The requested module '../../../wxkanban-agent/core/stage/scope-stage.js' does
  not provide an export named 'advanceScopes'`**, when running `createApp`, `dev:server` or
  `index.ts` through `tsx`. `tsx` can't follow `scope-stage.ts`'s `export * from './advance'`
  re-exports. Bundle with esbuild (Build, above), which is what production does.
- **`FAIL: no server at http://127.0.0.1:5199`.** The server isn't running. Do Run steps 1 and 2.
- **`EPERM: operation not permitted, mkdir 'C:\Users\CCSCOW%7E1\…'`** in an ad-hoc script.
  `new URL(import.meta.url).pathname` URL-encodes the `~` in Windows short paths. Use
  `fileURLToPath(import.meta.url)`.
- **`self-signed certificate in certificate chain`** from a raw `pg` `Client` in an ad-hoc script.
  The `sslmode` in `DATABASE_URL` overrides the `ssl` option. Delete it first with
  `url.searchParams.delete("sslmode")` and pass `ssl: { rejectUnauthorized: false }`. The driver
  uses the app's own db client and doesn't hit this.
