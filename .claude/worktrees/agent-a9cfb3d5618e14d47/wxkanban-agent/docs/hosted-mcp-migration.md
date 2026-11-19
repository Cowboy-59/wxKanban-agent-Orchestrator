# Migrating to the Hosted MCP (kit v0.4.0)

**Audience**: kit consumers running v0.3.x against a local MCP server.
**Goal**: switch to the hosted `mcp.wxperts.com` endpoint and stop running
the local MCP service.

---

## Why migrate

- **No DB port required.** v0.3.x consumers had to allow outbound Postgres
  (typically 5432) from dev laptops; most corporate firewalls block that.
  Hosted MCP speaks HTTPS on 443 only.
- **No local stateful service.** `setup-mcp.mjs` is deprecated and prints a
  warning on every run. Consumers no longer need to manage MCP process
  lifecycle, ports, or DB credentials.
- **Same kit commands.** `buildscope`, `implement`, `createspecs`, `runqa`,
  etc. work identically against the hosted endpoint.

---

## Prereqs

- Kit v0.4.0 or later installed (`wxkanban-agent --version`).
- A wxKanban admin (your `COMPANY_ADMIN` or the project's `PROJECT_OWNER`)
  who can mint an API token for your project.

---

## Step 1 — Admin mints a token

The admin opens `wxkanban.wxperts.com` → **Admin → Projects → your project
→ API Tokens → Issue token**. They give it a recognizable name (e.g.
"Andy's laptop") and copy the raw token (shown **once only** — a ~43-char
base64url string such as `9bB7UUaP0FebtuVsib999l4WB0Eplf2dfZJ6DF2njS0`, with
no `wxk_` prefix).

The admin sends it to you over a secure channel (1Password, Slack DM —
never email).

---

## Step 2 — Configure the kit

```bash
wxkanban-agent kit:configure \
  --token <token copied from the Admin → API Tokens modal> \
  --project-id <your-project-uuid> \
  --mcp-url https://mcp.wxperts.com
```

This writes three fields atomically into `.wxai/project.json`:

```json
{
  "kit": {
    "mcpBaseUrl": "https://mcp.wxperts.com",
    "apiToken": "9bB7UUaP0FebtuVsib999l4WB0Eplf2dfZJ6DF2njS0",
    "projectId": "<your-project-uuid>"
  }
}
```

The token is never echoed in full to the terminal; the command prints
`wxk_***...***xxxx` for confirmation only.

---

## Step 3 — Remove DB credentials

You no longer need `DATABASE_URL`, `DATABASE_URL_ENCRYPTED`, or
`WXKANBAN_API_TOKEN` (the legacy encrypted-DB-URL key) in your local
environment. Remove them from `.env` and `mcp-server/.env`.

The hosted MCP holds the only DB connection; consumers never see it.

---

## Step 4 — Verify

```bash
wxkanban-agent verify
```

You should see:

```
✓ hosted-mcp-reachable  (https://mcp.wxperts.com/health responded 200)
✓ token-valid           (project.help dispatched successfully)
```

---

## Step 5 — Run a kit command

```bash
wxkanban-agent buildscope my-test-scope
```

Behavior is identical to v0.3.x; the only difference is the kit now speaks
HTTPS to `mcp.wxperts.com` instead of `http://localhost:3002`.

---

## Troubleshooting

### `missing-token: no Authorization header`

The kit could not find an API token. Resolution precedence (FR-005):

1. `WXKANBAN_API_TOKEN` env var
2. `.wxai/project.json` → `kit.apiToken`
3. Legacy `.wxkanban-project.json`

Run `kit:configure` to re-populate, or set `WXKANBAN_API_TOKEN=...` in
your shell.

### `invalid-token: token unknown, revoked, or expired`

- The admin revoked your token (intentional or not). Ask for a new one.
- The token expired. Ask for a fresh one.
- You're copying from an old config that mixed prod + staging tokens.
  Tokens minted on `wxkanban.wxperts.com` are project-scoped and not
  interchangeable.

### `hosted-mcp-unreachable: connection refused / 5xx`

- Check `https://mcp.wxperts.com/health` from your shell. If it fails,
  the hosted service is down — try `https://staging.mcp.wxperts.com/health`
  or `#mcp-status` in Slack.
- Corporate proxy / firewall: outbound HTTPS to `mcp.wxperts.com` and
  `staging.mcp.wxperts.com` on 443 must be allowed.

### `rate-limited: 60 req/min exceeded`

- Default cap is 60 req/min per token with a 10-req burst. Most kit
  operations stay well under this; sustained loops (e.g.
  `implement <scope> --batch` on a large scope) can hit it.
- The client respects `Retry-After` and retries once automatically. If
  this keeps happening, ask an admin to bump
  `MCP_RATE_LIMIT_PER_MINUTE` for your service.

### `scope-violation: cross-project access blocked`

Your token is bound to one project. A kit command targeting a different
`projectId` (typically via a stale `.wxai/project.json` from another
checkout) fails fast. Run `kit:configure` against the correct project, or
re-clone into a fresh directory.

### Legacy `setup-mcp.mjs` keeps running

You're on `kit:start` (v0.4.0) but your environment still has no
`MCP_BASE_URL` configured. Either:

- Run `kit:configure` to populate `.wxai/project.json` (preferred), or
- Set `export MCP_BASE_URL=https://mcp.wxperts.com` in your shell.

Once that's in place, `kit:start` takes the hosted path; `setup-mcp.mjs`
exits 0 within a second.

---

## Rollback (escape hatch)

If hosted MCP is broken and you need to fall back to v0.3.x behavior:

```bash
npm run kit:start:legacy
```

This invokes the pre-028 chain (`setup-mcp.mjs && setup-gateway.mjs`)
verbatim. The deprecation warning will print but the script will run.
File a bug; the kit-maintainer team takes hosted-MCP outages seriously.
