# SCOPE-068: Multi-Project Gateway Isolation (SCOPE-027 follow-up)

**Scope Number**: SCOPE-068
**Status**: `draft`. FR-001…FR-005 shipped 2026-06-22 (`0810fdd7`). **Amendment A** (one gateway start path, FR-006…FR-009) approved 2026-10-10.
**Created**: 2026-06-22
**Last Reviewed**: 2026-10-10 (Amendment A, from feedback `ecacc0c6`: `kit-start` forces port 3003, `init.mjs` health-checks before the gateway is up, and `upgrade-kit` misses `kit-start` gateways). Previously 2026-06-22 (defect diagnosis confirmed in code; decisions captured: resolveServiceUrl returns null, deterministic per-project port, scope-then-implement)
**Depends On**: SCOPE-027 (Kit Runtime Hygiene — `core/runtime/state-file.ts`, `core/context/runtime-state.ts`, the command gateway `apps/command-gateway/src/http.ts`, `bindWithAutoselect`, `parent-watcher`).
**Related Scopes**: Fixes defects in SCOPE-027's implementation. The local-vs-hosted lifecycle-stage divergence (Bonus) is flagged here but deferred to its own scope.
**Source**: `specs/Project-Scope/068-multiproject-gateway-isolation.md`

---

## Overview

Running two VS Code windows on the same machine — two kit projects — can make one project's CLI/Cockpit silently execute commands against **another project's** orchestrator gateway. Diagnosed and confirmed in code:

- **D1 — Unsafe shared-default-port fallback (the core bug).** When a project's own gateway entry is absent or its pid is dead, `resolveServiceUrl('gateway')` falls back to the global constant `DEFAULT_PORTS.gateway = 3003` (`core/context/runtime-state.ts:106`). On a multi-project machine, `:3003` belongs to whichever project started first, so a client whose own gateway is down silently targets an unrelated project's gateway.
- **D2 — Gateways aren't project-identified on the wire.** `/health` returns `{status, service, port}` and `/commands` returns `{stage, commands}`; neither echoes `projectId`/`projectRoot`. `/dispatch` (`apps/command-gateway/src/http.ts:94`) takes `{command, input, user}` with no `projectId` to assert. A caller can neither detect nor prevent hitting the wrong project — e.g. a `buildscope` dispatched to the wrong gateway would write a scope into the wrong repo.
- **D3 — Stale registry entries are never reaped.** `.wxai/kit-runtime.json` keeps a dead pid/port; `isPidAlive` only *guards reuse* in the resolver — it never removes the entry or surfaces "gateway down". `removeServiceEntry` runs only on graceful shutdown, so a crashed/`kill -9`'d gateway leaves a stale entry forever.

Mitigating context: the gateway binds via `bindWithAutoselect` (preferred 3003, scans up), so two live gateways occupy **different** ports and the state file records the real one. The live path is therefore safe — the danger is exclusively the **dead-gateway fallback** plus the **absence of project assertion**.

This scope makes cross-project command execution impossible by construction: fail closed when the project's own gateway isn't alive, stamp every gateway with its project identity and assert it on dispatch, reap dead entries, and give each project a deterministic preferred port so two projects never even prefer the same one.

## Business Problem

The kit ships to customers who routinely have several projects open at once (the WinDev-conversion beachhead in particular juggles multiple repos). Today a down/restarting gateway in project B causes B's tooling to issue commands — including artifact-writing commands like `buildscope`/`createspecs` — against project A's gateway, writing A's repo and advancing A's lifecycle. That's silent cross-project corruption with no error and no audit signal. The fix is isolation that fails safe rather than guessing a shared port.

### Core Design

| Element | Multi-Project Gateway Isolation |
| --- | --- |
| **Primary Actor** | A developer running the kit (CLI + Cockpit) across two or more open projects on one machine |
| **Secondary Actor** | The per-project command gateway (one process per project, project-identified) |
| **Key Value** | A client can only ever talk to *its own* project's gateway; when that gateway is down it gets a clear "not running" signal, never a silent hit on another project |
| **Boundary — IN** | Fail-closed resolver (no shared-default fallback); project identity on `/health`+`/commands`; `projectId` assertion on `/dispatch` (409 on mismatch) + client-side verify; reaping of dead entries; deterministic per-project preferred port |
| **Boundary — OUT** | The local-vs-hosted lifecycle-stage source-of-truth divergence (separate scope); MCP routing (hosted-only, unaffected); any change to `bindWithAutoselect`'s scan behaviour beyond the preferred port |

---

## User Scenarios

### US1 — Project B's gateway is down
A developer has project A (gateway alive on 3003) and project B (gateway crashed). In B's window they run a kit command.
**Expected:** the resolver returns "no gateway running for `<B root>` — start one" (null → clear message); it never targets A's gateway on :3003.

### US2 — A command is dispatched to the wrong gateway anyway
By any path, a client sends a `/dispatch` to a gateway whose `projectId` differs from the client's workspace `projectId`.
**Expected:** the gateway rejects with **409** (`projectId` mismatch); nothing is executed. The client also pre-checks `/health` identity and refuses to dispatch on mismatch.

### US3 — Identifying a gateway
A client (or operator) hits `/health` or `/commands` on a gateway.
**Expected:** the response includes `projectId` and `projectRoot`, so the owning project is unambiguous.

### US4 — A crashed gateway left a stale entry
A gateway was `kill -9`'d, leaving a dead pid/port in `.wxai/kit-runtime.json`.
**Expected:** on the next gateway start (and on the next client read) the dead entry is reaped; a fresh start writes a clean entry; the resolver treats the project as having no gateway until one is actually running.

### US5 — Two projects, deterministic ports
Two projects each start a gateway.
**Expected:** each prefers a different port derived from its `projectId`, so they don't both target the base port; the actual bound port is still recorded in each project's state file.

### US6 — Single project, unchanged ergonomics
A developer with one project starts the gateway and runs commands as before.
**Expected:** no behavioural change for the common single-project case beyond the deterministic preferred port; explicit `GATEWAY_HTTP_PORT` still overrides.

---

## Functional Requirements

### FR-001 — Fail-closed resolver (D1)
`resolveServiceUrl('gateway')` MUST NOT fall back to `DEFAULT_PORTS`. With no alive state entry and no explicit `GATEWAY_HTTP_PORT`, it MUST return **null** (signature `string | null`). The explicit `GATEWAY_HTTP_PORT` override is retained.
**Acceptance:**
- [ ] No alive entry + no env override → returns null (not `http://localhost:3003`)
- [ ] Alive entry → returns that entry's URL; env override honoured as today
- [ ] `resolveServicePort` and all callers handle null (clear "no gateway running for `<root>`" message); callers fail closed

### FR-002 — Project identity on the wire (D2)
`/health` and `/commands` MUST include `projectId` and `projectRoot`.
**Acceptance:**
- [ ] `/health` → `{status, service, port, projectId, projectRoot}`
- [ ] `/commands` → `{stage, commands, projectId, projectRoot}`
- [ ] `projectId`/`projectRoot` are derived from the gateway's own workspace (`.wxkanban-project.json` / cwd)

### FR-003 — Assert projectId on dispatch (D2)
`/dispatch` MUST accept an optional `projectId` and, when present, reject with **409** if it doesn't match the gateway's own `projectId`. Clients MUST send their workspace `projectId` and MUST verify `/health` identity before dispatching.
**Acceptance:**
- [ ] `/dispatch` with mismatched `projectId` → 409, nothing executed
- [ ] `/dispatch` with matching (or absent — back-comp) `projectId` → proceeds
- [ ] The dispatch client verifies identity against its `.wxkanban-project.json` and fails closed on mismatch

### FR-004 — Reap dead entries (D3)
Dead service entries MUST be reaped on gateway start and on client read.
**Acceptance:**
- [ ] On gateway start, a stale entry (dead pid) is removed before the fresh entry is written
- [ ] `readRuntimeState`/`resolveServiceUrl` drop entries whose pid is not alive (so a crashed gateway is treated as "no gateway")
- [ ] Reaping is atomic (same temp-file+rename pattern as existing writes)

### FR-005 — Deterministic per-project preferred port (D3)
Each project MUST derive a deterministic preferred port from its `projectId` (e.g. `base + hash(projectId) % range`), used as the gateway's preferred bind port and the resolver's expectation, so two projects never prefer the same port. Explicit `GATEWAY_HTTP_PORT` still overrides; `bindWithAutoselect` still scans on collision.
**Acceptance:**
- [ ] Two distinct `projectId`s yield different preferred ports deterministically
- [ ] The same `projectId` yields a stable port across runs
- [ ] Explicit `GATEWAY_HTTP_PORT` overrides the derived port

---

## Amendment A — One gateway start path (2026-10-10)

**Why this amendment exists.** Feedback `ecacc0c6` (project `a899b6e4`, "radpac2") reported the
gateway on port 3267 while the post-upgrade health check probed 3003 and printed `fetch failed`.
3267 was correct: it is this scope's FR-005 port for that project. The kit starts the gateway two
different ways, and they disagree (measured 2026-10-10 in the orchestrator copies, which are the ones
consumers run):

| | `scripts/init.mjs` (folder open; end of `upgrade-kit`) | `kit-start` → `scripts/setup-gateway.mjs` |
| --- | --- | --- |
| Port | FR-005's derived port | **3003**: `setup-gateway.mjs:114` sets `GATEWAY_HTTP_PORT=3003` when unset, which is FR-005's override, so the derived port is never used |
| Process started | `node wxai-http.mjs`, a shim that starts `node tsx http.ts` | `node tsx http.ts` |
| "Already running?" | `.orchestrator-gateway.pid`, which holds the shim's pid | the live entry in `.wxai/kit-runtime.json` |
| Log | `logs/orchestrator-gateway.log` | `logs/gateway.log` |
| Wait before use | a fixed 1.5 s, then one health check | polls the runtime file every 250 ms for up to 15 s |

**Consequences.**

- **False "fetch failed".** A cold gateway load took about 1.8 s on a fast development machine, and
  that is before it binds and writes `.wxai/kit-runtime.json`. The kit ships no compiled
  `dist/http.cjs`, so every start goes through tsx. After 1.5 s the health check finds no recorded
  port, falls back to `:3003`, and reports a failure on a healthy install.
- **A gateway survives the upgrade.** `upgrade-kit` stops only the pid in `.orchestrator-gateway.pid`.
  A gateway started by `kit-start` runs as a daemon (`MCP_SKIP_PARENT_WATCHER`), so it keeps serving
  the old kit's code after the upgrade. The `init.mjs` that runs next does not see it, because its
  pid file is empty, and starts a second gateway.
- **FR-005 is off for `kit-start` users.** Two projects started that way both prefer 3003.

The health-check copy consumers run also lacks the 2026-07-15 fix `436f7bdc` ("health check must not
trust a stale gateway runtime entry"). That fix landed only in wxKanban's own `scripts/` copy.

### FR-006 — `setup-gateway.mjs` uses the derived per-project port
`setup-gateway.mjs` MUST NOT set `GATEWAY_HTTP_PORT`. An explicit `GATEWAY_HTTP_PORT` in the environment
still overrides, as FR-005 says.
**Acceptance:**
- [ ] With no `GATEWAY_HTTP_PORT`, a gateway started by `setup-gateway.mjs` binds `derivePreferredPort(projectId)`, or the next free port above it
- [ ] With `GATEWAY_HTTP_PORT` set, it binds that port
- [ ] The change is made in both copies (orchestrator `scripts/` and wxKanban `scripts/`)

### FR-007 — `init.mjs` starts the gateway through `setup-gateway.mjs`
`init.mjs` MUST start the gateway by running `scripts/setup-gateway.mjs`, and MUST run the health check
only after that returns. That gives one start path, one record of the running gateway
(`.wxai/kit-runtime.json`), one log (`logs/gateway.log`), and a wait that polls instead of guessing.
`init.mjs` stops writing `.orchestrator-gateway.pid` and `logs/orchestrator-gateway.log`.
**Acceptance:**
- [ ] A cold `init.mjs` run reports the gateway healthy on its derived port, with no `:3003` probe
- [ ] Running `init.mjs` with a gateway already running starts no second gateway
- [ ] Running `init.mjs` after `kit-start` starts no second gateway
- [ ] The hosted-MCP environment `init.mjs` resolves (`WXKANBAN_MCP_BASE_URL`, `WXKANBAN_API_TOKEN`, `WXKANBAN_PROJECT_ID`) reaches the gateway, as it does today
- [ ] The failure message points at `logs/gateway.log`

### FR-008 — `upgrade-kit` stops the gateway the runtime file records
Before it overlays the new kit, `upgrade-kit.mjs` MUST also stop the gateway recorded in
`.wxai/kit-runtime.json`, not only the pid in the legacy `.orchestrator-gateway.pid`, which gateways
started by older kits still use. `--dry-run` still stops nothing.
**Acceptance:**
- [ ] A gateway started by `kit-start` is stopped by `upgrade-kit` before extraction
- [ ] A gateway started by an older `init.mjs` (legacy pid file) is still stopped
- [ ] `--dry-run` lists the stop as a pending write and stops nothing

### FR-009 — The health check never guesses `:3003`
When neither `GATEWAY_HTTP_URL` nor `.wxai/kit-runtime.json` names a gateway, the health check MUST
report `no gateway running for this project` instead of probing `:3003`. This is FR-001's client
requirement, which these scripts never met. The orchestrator copy MUST also gain the 2026-07-15
stale-pid and identity guards, so the two copies end up identical.
**Acceptance:**
- [ ] No runtime entry → `no gateway running` (no request to `:3003`)
- [ ] A recorded pid that is not alive → `not running (stale .wxai/kit-runtime.json)`
- [ ] A healthy reply carrying another project's `projectId` → identity mismatch, not success
- [ ] The orchestrator and wxKanban copies are byte-identical

### Amendment A tasks
| Task | FRs | What |
| --- | --- | --- |
| T006 | FR-006 | Remove the forced 3003 from both copies of `setup-gateway.mjs` |
| T007 | FR-007 | `init.mjs` runs `setup-gateway.mjs`; README start and stop steps updated |
| T008 | FR-008 | `upgrade-kit.mjs` stops the runtime-recorded gateway too |
| T009 | FR-009 | The health check reports "no gateway running"; the orchestrator copy is synced with wxKanban's |
| T010 | all | Endpoint test: real `init.mjs`, `setup-gateway.mjs` and the health check in a scratch kit, against a local stub MCP, with Cockpit install and update and the kit update check disabled |

**Found during T010, now part of FR-007.** `init.mjs` MUST start `setup-gateway.mjs` with
`detached: true`. On Windows, Node puts every non-detached child into a job object that kills its
members when the parent exits. The gateway the launcher starts inherited that job, so it was
listening when `init.mjs` reported "kit ready" and gone a moment later, with no shutdown line in
its log. A detached launcher has no console, so its output comes back over pipes and `init.mjs`
relays it.

> **Amendment A implemented 2026-10-10.** NOT committed, NOT pushed, NOT released. Evidence:
>
> | Check | Result |
> | --- | --- |
> | Endpoint test: before the fix (published v1.7.76 scripts in a scratch kit) | The `kit-start` path bound **3004**, not the project's 3233: the forced 3003 was taken, so autoselect moved up one. The old `init.mjs` then started a **second** gateway on 3233 and overwrote the runtime entry, so `kit-stop` could not see the 3004 gateway and left it running. The original `upgrade-kit` left a `kit-start` gateway running. |
> | Endpoint test: after the fix | Same scratch kit, local stub MCP; Cockpit install and update and the kit update check disabled. A cold `init.mjs` (tsx cache disabled, run in its own hidden console) reported healthy on 3233, and the gateway outlived `init.mjs`. With a gateway already running, `init.mjs` reported "already running" and started no second one; the same after `kit-start`. The `kit-start` path binds 3233. `upgrade-kit --dry-run` stopped nothing. `upgrade-kit` stopped a `kit-start` gateway before downloading, and still stopped a gateway named in a legacy `.orchestrator-gateway.pid`. With no gateway, the health check printed "no gateway running for this project". |
> | Tests | Orchestrator `upgrade-kit-preservation` 21/21. wxKanban `gateway-port-resolution` + `kit-upgrade` + `kit-proxy` 30/30. |
> | Fence baseline | Surgical re-capture of `scripts/orchestrator-health-check.mjs` (9 restored) and `tests/unit/gateway-port-resolution.test.ts` (1 restored), each with an `amendments[]` entry. `scripts/setup-gateway.mjs` had already drifted at HEAD, so its 2 errors predate this change. Repo errors 431 → 421. |
> | Field state | Andy's own wxKanban gateway was listening on 3003, not its derived 3068, because it was started through `kit-start`. That is this bug, live. It moves to 3068 on its next `kit-stop` / `kit-start` after this change. |

**Deliberately not in this amendment.** Shipping a compiled `dist/http.cjs` for faster cold starts,
retiring the `wxai-http.mjs` shim (it is still a documented manual entry point), and anything about
the Cockpit, which looks up no gateway port.

---

## Technical Sections

### Resolver (`core/context/runtime-state.ts`)
Change `resolveServiceUrl` to `string | null`: keep the alive-entry and `GATEWAY_HTTP_PORT` paths; replace the `DEFAULT_PORTS` fallback (line 106) with `return null`. `resolveServicePort` returns `number | null` accordingly. Add a small `derivePreferredPort(projectId)` helper (FR-005). Reap dead entries during resolution (FR-004).

### Registry (`core/runtime/state-file.ts`)
Add a `reapDeadEntries(projectRoot)` that drops entries failing `isPidAlive`, written atomically; call it from `readRuntimeState` (or a thin wrapper the resolver uses) and from gateway start. Keep `ServiceEntry` shape; no schema bump needed (reaping is a read-time/start-time cleanup). Optionally record `projectId` in the entry for cross-checking.

### Gateway HTTP (`apps/command-gateway/src/http.ts`)
`resolveProjectContext` already yields `projectId`; surface `projectId` + `projectRoot` on `/health` and `/commands`. Add `projectId` handling to `/dispatch` (409 on mismatch). Reap stale entries before `writeServiceEntry` on start; bind to the derived preferred port (FR-005) unless `GATEWAY_HTTP_PORT` is set.

### Clients
The dispatch/health clients (`scripts/kit-status.mjs`, `scripts/orchestrator-health-check.mjs`, and the Cockpit/command dispatch path) MUST: resolve via the fail-closed resolver, show "no gateway running" on null, send `projectId` on dispatch, and verify `/health` identity. Enumerate exact call sites at `createSpecs`/`implement`.

### Tests
Update `tests/unit/runtime-state-resolver.test.ts` (the current tests assert the `:3003` fallback — they must flip to expect null), `tests/integration/spec027-qt.test.ts` (two-project URLs must differ / be null when down), and `tests/integration/gateway-lifecycle.test.ts`. Add: 409-on-mismatch dispatch test; reap-on-start test; deterministic-port test.

### Conventions
Kit code (TypeScript, no `any`); fences via the orchestrator at `implement`; this is the **customer-distributed** kit (`wxkanban-agent`) — published via `scripts/sync-to-orchestrator.mjs`, so a release follows. Nothing pushed/published until the user says so.

---

## Success Criteria

1. **A down gateway never targets another project.** `resolveServiceUrl` returns null and the client says "no gateway running — start one." *(FR-001)*
2. **Every gateway is project-identified.** `/health` and `/commands` echo `projectId`+`projectRoot`. *(FR-002)*
3. **Cross-project dispatch is rejected.** `/dispatch` 409s on `projectId` mismatch and the client verifies before sending. *(FR-003)*
4. **Crashed gateways self-heal.** Dead entries are reaped on start and on read. *(FR-004)*
5. **Two projects can't collide on a default.** Deterministic per-project preferred ports. *(FR-005)*
6. **Single-project ergonomics unchanged** beyond the derived port; `GATEWAY_HTTP_PORT` still overrides.

---

## Constraints & Notes

### Constraints
- **Fail closed, never guess.** The resolver must prefer "no gateway" over a shared default.
- **Back-compatible dispatch.** Absent `projectId` on `/dispatch` still works (older clients) but a *present, mismatched* one is rejected — so the assertion can roll out without breaking older callers.
- **Customer-distributed kit.** Ship via the orchestrator release path; coordinate a kit version bump.
- **Orchestrator-first.** Implement via `createSpecs` → `implement`; update the SCOPE-027 test suites.

### Out of Scope (own later scope)
- **Bonus — local vs hosted lifecycle-stage divergence.** The gateway gates on local `.wxai/project.json` `lifecycleStage`, while the hosted wxKanban app sets the authoritative stage; they drift silently (a project with no local file defaults to `Design` regardless of the app). Pick one source of truth — its own card.

### Dependencies
- SCOPE-027 (runtime hygiene primitives: state-file, resolver, gateway, autoselect, parent-watcher).
- The kit release/publish path (`scripts/sync-to-orchestrator.mjs`) for customer distribution after implementation.

### Notes
- **Process:** authored in-conversation; implement via `createSpecs` → `implement`.
- **Decisions captured:** `resolveServiceUrl` returns null (vs throw); deterministic per-project port included; scope-then-implement.
