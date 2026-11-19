# Bug — wxkanban-kit v1.0.5 Follow-up: Consumer-side `pg.Pool` to wxKanban DB times out (BUG-20)

**Filed**: 2026-05-20
**Status**: open — resolution path is spec 028 + spec 019 architecture update (this report triggered the 019 rewrite filed the same day)
**Severity**: Blocker (every `wxkanban-agent` command depends on the MCP gateway being up)
**Reporter environment**: Windows Server 2022 Standard 10.0.20348, Node.js (consumer machine), PowerShell
**Source files**:
- [mcp-server/src/db/connection.ts](../../../mcp-server/src/db/connection.ts) — `new Pool({ connectionString: config.databaseUrl })`
- [mcp-server/src/index-http.ts](../../../mcp-server/src/index-http.ts) (lines 336–346) — `checkDatabaseConnection()` startup gate exits 1 on DB unreachable
- [src/server/services/KitGenerationService.ts](../../../src/server/services/KitGenerationService.ts) — `loadMcpServerFiles()` scoops the entire local `mcp-server/` tree into the consumer kit; `generateEnvFile()` injects `EMBEDDED_DATABASE_URL` literal
- [src/server/routes/kitRoutes.ts](../../../src/server/routes/kitRoutes.ts) (lines 288–308) — `KIT_DOWNLOAD_SOURCE=orchestrator` feature flag for KitProxyService; legacy path (`X-Kit-Source: legacy-db`) is the one in use

**Related**: spec 028 (Hosted MCP Deployment), spec 019 R14 (KitProxy), spec 019 R3 (MCP Runtime Contract — the contract this report invalidates)
**Predecessor**: BUG_REPORT-wxkanban-kit-v1.0.5.md (filed 2026-05-19) — issues BUG-14 through BUG-19. BUG-19 predicted today's failure mode.

---

## TL;DR

Today's freshly-downloaded kit (`wxkanban-kit-c9ee6375-…-v1.0.5.zip`,
`createdAt: 2026-05-20T09:58:30.845Z`) has advanced past BUG-16 (decrypt
failure on startup), but the predicted downstream consequence of BUG-19 —
that the kit's MCP server tries to open a raw Postgres TCP connection from
the consumer machine — is now the surfacing failure. `node scripts/init.mjs`
fails at `startup.db.check.start` with a TCP timeout from `pg-pool`.

The cause is architectural: the kit ships wxKanban's *own* `mcp-server/`
directory verbatim, that MCP code opens a `pg.Pool` at module load, and
the consumer machine has no route to wxKanban's Postgres on tcp/5432 — nor
should it, per customer security policy.

---

## What's better in today's zip

| Prior issue | Status today | Evidence |
|---|---|---|
| BUG-16 — Decrypt failure on startup | Appears resolved | `node mcp-server/start-http.mjs` no longer prints `Failed to decrypt embedded credentials`. Startup proceeds past `startup.config.loaded` into `startup.db.check.start`. |
| BUG-14 / BUG-15 — Plaintext credentials in zip | Not re-verified in this report | Today's investigation stopped at the runtime failure; no fresh static-analysis pass of the zip was performed. To be re-verified separately. |

---

## BUG-20 — Consumer-side `pg.Pool` to wxkanban DB times out

**Severity**: Blocker.
**Component**: Architecture (see also BUG-19 in the 2026-05-19 report).

### Symptom

`node scripts/init.mjs` reports `MCP server failed startup verification`. Running the entrypoint directly to capture stderr:

```
$ node mcp-server/start-http.mjs
Starting MCP HTTP Server...
Port: 3002
[startup.begin] {"transport":"http","port":"3002"}
[startup.config.loaded] {...}
[startup.db.check.start]
Database connection failed: Error: Connection terminated due to connection timeout
    at pg-pool/index.js:45:11
    at async checkDatabaseConnection (file://.../mcp-server/dist/db/connection.js:17:24)
    at async main (file://.../mcp-server/dist/index-http.js:250:25)
  [cause]: Error: Connection terminated unexpectedly
      at Connection.<anonymous> (.../mcp-server/node_modules/pg/lib/client.js:180:73)
[startup.db.check.fail] Error: Database connection failed
Failed to connect to database. Exiting.
```

This is a TCP-level timeout from `pg-pool`. Decryption succeeded enough to produce a connection target; the actual TCP `connect()` to wxkanban's Postgres host never completes from this consumer machine.

### Reproduction

1. Download a fresh v1.0.5 kit for project `c9ee6375-f79f-4484-8f72-7e121aed05a4` (or any consumer project).
2. Extract on a Windows consumer machine outside the wxkanban network perimeter (or, more generally, any machine without a direct route to wxkanban's Postgres host on tcp/5432).
3. `node scripts/init.mjs`.
4. Observe MCP child exit 1, `init.mjs` exits 1.

### Why this is a kit defect, not a consumer-environment issue

Customer security policy is **HTTPS-only outbound from dev machines** — no
direct Postgres. wxKanban has stood up `mcp.wxperts.com` (spec 028,
status: approved) specifically to be the HTTPS surface that replaces
consumer-side DB I/O. The kit was never supposed to open `pg.Pool` from
the consumer.

What v1.0.5 actually does:

- Ships `pg ^8.11.3` and `drizzle-orm ^0.30.0` as runtime deps in the consumer kit.
- Instantiates `new Pool(...)` at consumer-side module load ([mcp-server/src/db/connection.ts:5](../../../mcp-server/src/db/connection.ts#L5)).
- Calls `checkDatabaseConnection()` as a hard gate in `main()` ([mcp-server/src/index-http.ts:336-346](../../../mcp-server/src/index-http.ts#L336-L346)); exits 1 if Postgres is unreachable.
- Bakes the encrypted DATABASE_URL into the shipped MCP's `config.ts` ([src/server/services/KitGenerationService.ts:334-354](../../../src/server/services/KitGenerationService.ts#L334-L354)) so the consumer can theoretically connect — but only from a network that has a route to Postgres.
- Contains zero outbound HTTPS calls to `mcp.wxperts.com` or any wxkanban API host in `mcp-server/src/` or `mcp-server/dist/`. The only `wxperts.com` occurrence in the kit is `dist/utils/github-updater.js` — cosmetic version-check pings against GitHub releases, unrelated to data access.

So even with BUG-16 patched, the kit's first runtime act is something
customer policy forbids. The TCP timeout is the *symptom*; the *cause*
is that the consumer is being asked to do consumer-side DB I/O at all.

### Workaround the consumer will NOT take

Setting `WXKANBAN_MCP_DATABASE_URL` to the plaintext Postgres URL leaked
in BUG-15 would technically make the MCP boot. That is **out of policy**
for this project and will not be done.

### KitProxyService doesn't fix this either (yet)

[src/server/services/KitProxyService.ts](../../../src/server/services/KitProxyService.ts)
is the R14-introduced replacement for KitGenerationService and is wired
behind `KIT_DOWNLOAD_SOURCE=orchestrator`
([src/server/routes/kitRoutes.ts:288-308](../../../src/server/routes/kitRoutes.ts#L288-L308)).
Two problems:

1. The flag is not set in production (today's failing download served the
   legacy path; header `X-Kit-Source: legacy-db`).
2. Even with the flag on, KitProxyService streams a different zip from
   `Cowboy-59/wxKanban-agent-Orchestrator` GitHub releases — but the
   upstream archive is built from the same `mcp-server/` tree, so the
   `pg.Pool` is still there. Flipping the flag changes the delivery
   channel, not the architectural defect.

---

## Resolution path

This bug report does not propose a one-line fix. It triggers a coordinated
architectural change tracked across two specs:

- **Spec 028 (Hosted MCP Deployment)** — already approved, status: Phase 6
  infra done. Stands up `mcp.wxperts.com` on App Runner with
  token-authenticated, project-scoped HTTPS access. This is the *hosted*
  side of the fix.
- **Spec 019 (Agent Orchestrator Kit)** — being updated 2026-05-20 (this
  report's filing date) to remove the local-MCP architecture from the kit:
  - Decision #2 changes from "all installs point at the same central
    wxKanban database" to "all installs reach wxKanban only via HTTPS to
    `mcp.wxperts.com`."
  - R3 (MCP Runtime Contract) flips from "MCP ships in the kit" to "MCP
    is hosted; kit is a thin HTTPS client."
  - R14/R15 (kit download/upgrade) drop `mcp-server/` from the kit zip.
  - R16/R18 (local MCP lifecycle) are marked DEPRECATED in-place.

Concretely in code, the v1.1.0 kit must:

1. Remove `pg`, `drizzle-orm`, and `mcp-server/src/db/schema.ts` from the
   shipped kit. They belong on the wxKanban side of the network boundary.
2. Replace `mcp-server/src/db/connection.ts` with an HTTPS client pointed
   at `mcp.wxperts.com`. Tool calls become per-tool HTTPS POSTs against
   the hosted MCP. Audit logging (currently a SQL insert) becomes an
   HTTP POST.
3. Replace the `checkDatabaseConnection()` startup gate
   ([mcp-server/src/index-http.ts:336-346](../../../mcp-server/src/index-http.ts#L336-L346))
   with a `GET https://mcp.wxperts.com/health` ping. Failures are
   HTTPS-shaped, not TCP-5432-shaped.
4. Stop emitting `DATABASE_URL_ENCRYPTED` from
   [KitGenerationService.generateEnvFile()](../../../src/server/services/KitGenerationService.ts).
   Emit `WXKANBAN_API_BASE` (= `https://mcp.wxperts.com`) +
   `WXKANBAN_API_TOKEN` + `WXKANBAN_PROJECT_ID` only. Drop the
   credential-injection block at
   [KitGenerationService.ts:334-354](../../../src/server/services/KitGenerationService.ts#L334-L354)
   entirely.
5. Tighten [mcp-server/scripts/check-no-direct-db.sh](../../../mcp-server/scripts/check-no-direct-db.sh)
   (spec 028 / T011) to also forbid `pg` as a runtime dep in the
   kit-shipped MCP, not just direct `db.*` call sites.

---

## What's blocked on the consumer side right now

- Every `wxkanban-agent` command (`buildscope`, `createspecs`, `implement`,
  `dbpush`, `pipeline-agent`, etc.) — all route through the MCP gateway,
  which won't start.
- Spec-first workflow mandated by `CLAUDE.md` cannot operate through the
  orchestrator.
- Job Scheduler conversion work (project
  `c9ee6375-f79f-4484-8f72-7e121aed05a4`) is back to hand-drafted specs
  with `[NEEDS-RERUN-THROUGH-BUILDSCOPE]` markers.

---

## Asks of the kit author

In priority order:

1. **Confirm or correct the failure mode** by attempting `node scripts/init.mjs`
   from a clean Windows machine that does **not** have a direct network
   route into wxKanban's Postgres host. If it succeeds for the kit author,
   that itself is the architectural smell BUG-19 describes — the kit
   author's machine is privileged in a way every consumer's is not.
2. **Cut v1.1.0 against the spec 028 + spec 019 update.** The resolution
   plan above is the concrete shape.
3. **Until v1.1.0 ships,** acknowledge that v1.0.5 does not function for
   consumers without a direct DB route. Consumer team will stop spending
   cycles on retry/upgrade attempts and revert to manual spec drafting
   without continuing to litigate "is the kit healthy."

If a faster fix path exists — for example, a v1.0.6 hotfix that switches
one specific tool path to HTTPS so basic `buildscope`/`createspecs` flows
work without the full architectural refactor — that would unblock
immediate demo work even if BUG-19/20 remain open longer-term.
