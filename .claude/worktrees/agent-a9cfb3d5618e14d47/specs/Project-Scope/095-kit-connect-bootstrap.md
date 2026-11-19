# SCOPE-095: Kit Connect Bootstrap — Fresh-Download MCP Registration & Token-Config Repair

**Scope Number**: SCOPE-095
**Status**: `draft` — FR-001…FR-006 implemented + unit-tested, not pushed. **Amendment A** (`kit:configure` unreachable) authored 2026-08-03. **Amendment B** (`kit:configure` locked out by the entitlement preflight) approved and implemented 2026-10-05, not pushed.
**Created**: 2026-07-10
**Last Reviewed**: 2026-10-05 (Amendment B — feedback 669039df: the entitlement preflight denies `kit:configure`, the recovery command, when the cache has expired and the token is bad). Previously 2026-08-03 (Amendment A — customer field report bd756151: `kit:configure` is not a registered command on any surface)
**Originally Reviewed**: 2026-07-10 (authored in-conversation, interactive buildscope, section-by-section approval. Decisions: server-side `.mcp.json` injection at download so a fresh kit is connected on open; auto-run `init.mjs` on fresh extract as belt-and-suspenders; repair the `kit:configure` token regex that rejects every real token; reconcile four contradictory setup docs to one true procedure. The `/mcp` one-time approval gate in Claude Code stays out of scope — it is not ours to remove.)
**Depends On**: SCOPE-011 (kit generation + Download Kit route — the delivery plumbing this extends), spec 028 (hosted-MCP-only model — the transport and token model this registers)
**Related Scopes**: SCOPE-008 (the original Claude Code Init command this repairs), SCOPE-086 (Marketplace / kit-release delivery path this ships through), SCOPE-094 (the Cockpit health check that *detects* this failure — SCOPE-095 *prevents* it)
**Source**: `specs/Project-Scope/095-kit-connect-bootstrap.md`

---

## Overview

A customer generates a kit, downloads it, extracts it, and opens the folder expecting the orchestrator/MCP connection to work. Today it silently does not. On a fresh extract, VS Code's folder-open tasks install dependencies and start the gateway, but nothing writes the one file Claude Code reads to reach the hosted MCP — `.mcp.json`. The script that *does* write it (`init.mjs`, in the orchestrator repo) runs only on the upgrade path, so first-time customers are never registered and hit "MCP won't connect." The documented manual fallback (`kit:configure`) is itself broken: its token validation rejects every token the system can actually mint.

This scope closes the fresh-download connection gap on two fronts: the download server injects a correct, literal-token `.mcp.json` into the archive so the kit is connected the moment it opens, and the first-run path (`init.mjs`) is wired to actually run on a fresh extract as belt-and-suspenders. It also repairs the `kit:configure` token check so the manual path works, and reconciles the contradictory setup docs to one accurate procedure.

## Business Problem

Every customer's first experience of the kit depends on reaching `mcp.wxperts.com`, and right now that first experience fails for reasons the customer cannot diagnose. The connection artifact — `.mcp.json` with a literal bearer token, `type:"http"`, `<base>/mcp` — is well understood and already produced correctly by `init.mjs`, but it never runs on first download, so customers hand-edit a file they have never heard of, or open a support ticket. The one command we tell them to run to fix it rejects their real token outright. The result is a recurring, high-friction onboarding failure (`project_mcp_connectivity_hardening` MUST-FIX; `SUPPORT-mcp-connection-issue-2026-07-04.md`) at the exact moment a new customer forms their impression of the product.

The information and machinery to fix this already exist — a minted per-download token, the correct `.mcp.json` shape in `init.mjs`, and a manual `kit:configure` path. Nothing new needs inventing; the pieces are mis-wired and one validator is wrong.

### Core Design

| Element | Kit Connect Bootstrap — Fresh-Download MCP Registration & Token-Config Repair |
| --- | --- |
| **Primary Actor** | The customer setting up a freshly downloaded kit on their own workstation |
| **Secondary Actors** | The kit download server (`KitProxyService`) that mints the token and injects per-project files; `init.mjs`, the first-run bootstrap in the orchestrator repo; `kit:configure`, the manual repair command; Claude Code, which reads `.mcp.json`; the VS Code folder-open tasks that fire on extract |
| **Key Value** | A freshly downloaded kit is connected to the hosted MCP with no manual file editing, and the manual repair path actually works with real tokens |
| **Primary** | A freshly downloaded, extracted kit is connected to the hosted MCP with no hand-editing of `.mcp.json` |
| **Secondary** | The manual repair path (`kit:configure` / re-running `init.mjs`) works with real tokens, and the setup docs describe one accurate procedure |
| **Boundary — IN** | Server-side `.mcp.json` injection at download; auto-running `init.mjs` on fresh extract; the `kit:configure` token-regex + error-text fix; setup-doc reconciliation |
| **Boundary — OUT** | Changing the hosted-only transport model; adding auth to `/health`; the one-time `/mcp` approval gate in Claude Code (unavoidable); server-side infra metrics (SCOPE-069); Cockpit health *detection* (SCOPE-094); `.claude/settings.local.json` token duplication (unnecessary once `.mcp.json` carries the literal token) |

---

## Actors

Primary: the customer setting up a freshly downloaded kit on their own workstation.

Secondary: the kit download server (`KitProxyService`) that mints the token and injects per-project files; `init.mjs`, the first-run bootstrap in the orchestrator repo; `kit:configure`, the manual repair command; Claude Code, which reads `.mcp.json` at the workspace root; and the VS Code folder-open tasks that fire on extract.

## User Scenarios

### US1 — Fresh download, happy path
The customer downloads the kit, extracts it, and opens the folder. `.mcp.json` is already present (server-injected with a literal token). The folder-open task runs `init.mjs`, which installs dependencies, starts the gateway, and installs the Dev Cockpit. The customer approves "wxkanban" once via `/mcp`, reloads, and `buildscope` / `list_open_items` succeed.
Expected: a connected kit with no file editing at any point beyond the one-time `/mcp` approval.

### US2 — Tasks declined or non-VS-Code editor
The customer uses a different editor, or declines the folder-open task prompt. Because the server already injected `.mcp.json`, Claude Code still connects after the one-time `/mcp` approval.
Expected: the server inject covers the case where the first-run script never runs — connectivity does not depend on VS Code tasks.

### US3 — Manual repair / token rotation
A token is rotated, or a customer is stuck. An admin mints a new token; the customer runs `kit:configure --token <real token>`. It is accepted (the regex now matches the real base64url format), `.wxai/project.json` is updated, and re-running `init.mjs` regenerates `.mcp.json` with the fresh token.
Expected: the documented repair path works with the tokens the system actually issues, instead of rejecting them outright.

## Functional Requirements

### FR-001 — Server-side `.mcp.json` injection at download
On kit download, the server writes `.mcp.json` into the archive in the hardened form.
Acceptance Criteria:
- [ ] `KitProxyService.writePerProjectFiles` writes `mcpServers.wxkanban = { type:"http", url:"<mcpBaseUrl>/mcp", headers:{ Authorization:"Bearer <apiToken>" } }`, reusing the same minted token it already writes to `.env`
- [ ] Merge-safe: an existing `.mcp.json` in the archive keeps its other `mcpServers` entries
- [ ] `.mcp.json` is gitignored in the shipped kit (it carries a secret)

### FR-002 — Fresh token on re-download
The upgrade / re-download path never ships a stale token.
Acceptance Criteria:
- [ ] `.mcp.json` is in `UPGRADE_STRIP_FILES` so a re-download regenerates it with the freshly minted token

### FR-003 — First-run auto-registration
On a fresh extract, the bootstrap runs with no manual command.
Acceptance Criteria:
- [ ] The kit's `.vscode/tasks.json` runs `init.mjs` on `folderOpen` (once), reconciled with the existing gateway-start task so the gateway is not double-started on `:3003`
- [ ] `init.mjs` stays idempotent on re-run (`.mcp.json` unchanged short-circuit, gitignore de-dupe, PID-guarded gateway)

### FR-004 — `kit:configure` accepts real tokens
The manual repair path validates the tokens the system actually mints.
Acceptance Criteria:
- [ ] `TOKEN_RE` accepts the real base64url format and rejects obviously malformed input; a future `wxk_`-prefixed format is also accepted (forward-compat)
- [ ] Verified against `generateApiToken()` / `mint-project-token.ts` output

### FR-005 — Accurate configuration guidance
Error and help text stop instructing an impossible format.
Acceptance Criteria:
- [ ] `init.mjs` and `kit:configure` no longer tell users to pass `--token wxk_live_<64hex>`; they reflect the real token format and where `init.mjs` lives

### FR-006 — Reconciled setup documentation
One accurate procedure.
Acceptance Criteria:
- [ ] No doc presents `type:"sse"` as the current transport; the one true form is documented (`.mcp.json`, `type:"http"`, `<base>/mcp`, literal token, gitignored, `/mcp`-approve + reload)
- [ ] Every `scripts/init.mjs` reference is accurate (location + that it auto-runs)
- [ ] The four contradictory setup docs collapse to one canonical hosted-setup section; the others link to it

---

## Amendment A — `kit:configure` is not a registered command (2026-08-03)

**Why this amendment exists.** FR-004 and FR-005 repaired `kit:configure`'s token regex and its
guidance text, and the unit suite proves both. What neither requirement checked is whether the
command can be *invoked at all*. It cannot. A customer field report (feedback `bd756151`, project
`1b7ff890-ab5d-476e-9fd6-2369af59457a`) hit this on a fresh project and was told:

```text
Command 'kit:configure' is not permitted in the 'Design' stage.
```

That message is not produced by a stage gate. `kit:configure` appears in **none** of the four places
a CLI command must be registered:

| Registration point | File | Present? |
| --- | --- | --- |
| CLI name → Capability map | `core/policy/adapters/cli-adapter.ts` `CLI_COMMAND_TO_CAPABILITY` | no |
| `Capability` enum + `gateTable` | `core/policy/capabilities.ts` | no |
| Dispatch switch | `core/orchestrator/workflow-engine.ts` `dispatch()` | no |
| CLI early-exit branches | `apps/command-gateway/src/cli.ts` `main()` | no |

`handleKitConfigureCommand` (`core/orchestrator/command-handlers/kit-configure.ts`) is referenced
only by its own tests. Spec 028/T020 built the handler; the wiring was never done. So dispatch falls
through to the `if (!capability)` branch of `evaluateStageOnly`, whose rejection string is hardcoded
to phrase *every* unrecognised command as a stage violation.

**Why this is worse than an unwired command.** The misleading message caused a wrong diagnosis. The
reporter concluded — reasonably, and incorrectly — that the policy engine was blocking its own
bootstrap command in a chicken-and-egg lockout, and correctly refused to hand-craft
`.wxai/project.json` to work around it. They stopped, with the kit unconfigurable, and filed a bug
against a subsystem that was working as designed. Six shipped `SKILL.md` files and
`core/http/mcp-client.ts:138` all instruct customers to run this command.

**Second defect on the same path.** `loadProjectConfig()` (`cli.ts`) throws
`No .wxkanban-project.json found … Run kit init first.` before any command dispatches. Registering
`kit:configure` in the switch alone is therefore not sufficient — a bootstrap command must be
reachable on a repo that has not been bootstrapped yet, so it has to be handled *before* that call.

**Deliberately not in this amendment.** The unknown-command rejection message keeps its current
wording. Rephrasing it (so a typo says "unknown command" instead of "wrong stage") is a real defect
but touches spec 030 FR-009's byte-identical message contract, and is deferred to its own scope. The
application-level `lifecycleStage` in `cli.ts` / `http.ts` — superseded in principle by scope-level
status (SCOPE-122) — is likewise out of scope here.

### FR-007 — `kit:configure` is reachable on every surface
The bootstrap command customers are told to run is registered, dispatchable, discoverable, and works
on a project that has not been configured yet.
Acceptance Criteria:
- [ ] `Capability.KitConfigure` exists with `allowedPhases: "all"`, `requiresVerifiedSpec: false` — a bootstrap command is never stage-gated
- [ ] `CLI_COMMAND_TO_CAPABILITY` maps `kit:configure`, so `--help` lists it in every stage and no surface reports it as a stage violation
- [ ] `WorkflowEngine.dispatch` routes `kit:configure` to `handleKitConfigureCommand` and emits an audit record, so the HTTP gateway surface works too
- [ ] `cli.ts` handles `kit:configure` **before** `loadProjectConfig()`, so it succeeds on a repo with no `.wxkanban-project.json`
- [ ] The token is never echoed in full on any of these paths (existing `maskToken` behaviour preserved)

---

## Amendment B — `kit:configure` is locked out by the entitlement preflight (2026-10-05)

**Why this amendment exists.** Follow-up report `669039df` to `bd756151`. `WorkflowEngine.dispatch`
runs `assertEntitled()` (`core/license/preflight.ts`) *before* the policy check, and that function's
`EXEMPT_COMMANDS` lists only `kit:status` and `help`. Take a customer with an expired cached
`.wxai/.entitlement` whose API token is missing, revoked or wrong, or who is offline.
`defaultRefresh` returns `null`, the cache was real (`hadCache`), so the preflight denies with
`offline and the cached entitlement has expired`. `kit:configure` is the command that installs the
token that would make the refresh succeed, so the recovery path is the thing being refused.

**Where it bites (measured 2026-10-05).**

| Surface | Path | Reaches the preflight? |
| --- | --- | --- |
| Terminal (the documented path) | `wxkanban-agent kit:configure` → `bin/wxai.mjs` → `cli.ts` | **no**: FR-007's `cli.ts` branch returns before `dispatch` |
| HTTP gateway | `POST :3003/dispatch` → `WorkflowEngine.dispatch` | **yes, locked out**, which breaks FR-007's own criterion "so the HTTP gateway surface works too" |
| `OrchestratorMcpAdapter` | `handleToolCall` → `WorkflowEngine.dispatch` | yes, but nothing outside tests constructs it |

**Why exempting it is safe.** `kit:configure` writes only local config (`.wxai/project.json` or
`.env`). It does no paid work and calls no hosted tool. Everything of value is enforced server-side
(Phase 1A), so a lapsed customer who installs a token is still refused there. The next non-exempt
command refreshes with the new token and overwrites the stale cache. Exempting it is what the exempt
list says it is for: "so the customer can see their state and recover."

**The test defect is wider than reported.** `dispatch` calls `assertEntitled({ command })` with no
root, so the preflight reads `<cwd>/.wxai/.entitlement`, and under vitest the cwd is the developer's
real kit directory. On a machine with an expired cache, **11** kit tests fail that pass with
`WXKANBAN_ENTITLEMENT=off`:

| File | Failures |
| --- | --- |
| `workflow-engine.test.ts` | 7 |
| `policy/kit-configure-wiring.test.ts` | 2 |
| `mcp-adapter.test.ts` | 2 |

CI has no cache, so it fails open and stays green. That is why these have read locally as
"pre-existing failures." On a machine with a cache **and** a resolvable token, every dispatch in the
suite would also make a real call to the hosted MCP, taking up to 4 s.

**Reporter's proposed fix 2 is not adopted.** The proposal was to pass the context root to
`assertEntitled` instead of the implicit `process.cwd()`. That would change no behavior today:

- In every production caller of `dispatch`, the project root *is* `process.cwd()`. `cli.ts` uses it
  throughout, and `http.ts` sets `PROJECT_ROOT = process.cwd()`.
- The one command whose `--project-root` can differ from the cwd is `kit:configure`, and this
  amendment exempts it, so the preflight never reads a root for it.
- It would not make the tests hermetic either. A temp root with no cache falls through to the
  network refresh path.

**Deliberately not in this amendment.** Running policy before entitlement in `dispatch`, and clearing
`.wxai/.entitlement` on a successful `kit:configure`. The refresh already overwrites it.

### FR-008 — `kit:configure` is exempt from the entitlement preflight
The recovery command runs regardless of entitlement state, and the kit's test suite never depends on
the developer's own entitlement cache.
Acceptance Criteria:
- [ ] `EXEMPT_COMMANDS` in `core/license/preflight.ts` includes `kit:configure`, and the comment above the preflight call in `WorkflowEngine.dispatch` names it alongside `kit:status` and `help`
- [ ] A unit test reproduces the reported state: a validly signed cached token past `exp`, a refresh that returns `null`, and mode `enforce`. In that state `kit:configure` is allowed with `source: "exempt"`, and a non-exempt command (`wxconversion`) is denied. The denial proves the fixture really is the lockout and not a pass-through.
- [ ] The kit test run sets `WXKANBAN_ENTITLEMENT=off` (`vitest.config.ts`), so no test reads the developer's cache or calls the network implicitly. Tests that exercise the preflight pass `mode` explicitly (all 9 in `preflight.test.ts` already do). The 11 tests above pass on a machine with an expired cache.
- [ ] Endpoint test: given an expired `.wxai/.entitlement` and no resolvable token, `kit:configure` through the real HTTP gateway (`POST /dispatch`) succeeds and writes `.wxai/project.json`. A non-exempt command on the same gateway is still denied.

---

## Technical Sections

Two-repo change; no new tables, migrations, or routes.

- **Data/Schema** — none. Reuses the token minted by `apiTokenService.createToken` at download.
- **API Routes** — none new. Reuses the existing `GET /api/projects/:id/kit/download` (`KitProxyService`).
- **Server (this repo, deploys on push)** — `src/server/services/KitProxyService.ts`: `writePerProjectFiles` writes `.mcp.json` (mirroring `init.mjs`'s entry object); `UPGRADE_STRIP_FILES` gains `.mcp.json`; ensure it is gitignored in the archive.
- **Orchestrator CLI (this repo, mirrored to the orchestrator on kit release)** — `wxkanban-agent/core/orchestrator/command-handlers/kit-configure.ts`: relaxed `TOKEN_RE` + corrected message.
- **Orchestrator repo (consumer-owned, ships in the kit release)** — `.vscode/tasks.json`: `folderOpen` `init.mjs` task; `scripts/init.mjs`: corrected error/guidance text.
- **Docs (this repo mirrored + orchestrator)** — `_wxAI/commands/wxAI-project-init.md`, `wxkanban-agent/docs/hosted-mcp*.md`; orchestrator `gettingStartedInstructions.md`, `wxKanban_Kit_Setup.md`.

Reference (do not duplicate — mirror its shape): `init.mjs`'s `writeClaudeMcpRegistration` is the canonical `.mcp.json` writer that FR-001 replicates server-side.

---

## Success Metrics

1. **Zero-touch connect on fresh download.** 100% of freshly downloaded kits contain a valid `.mcp.json` (`type:"http"`, url ending `/mcp`, literal bearer token) requiring 0 manual file edits before the one-time `/mcp` approval, and the injected token returns HTTP 200 from `POST <base>/call`; verifiable by extracting a real download and calling the endpoint. *(FR-001, FR-002)*
2. **Manual repair path works.** `kit:configure` accepts 100% of real minted (base64url) tokens with 0 false rejections and rejects malformed input, proven by a unit test with at least 2 accept and 2 reject cases plus 1 live-token run. *(FR-004, FR-005)*
3. **Docs single-source and accurate.** 0 occurrences of `type:"sse"`, `wxk_live_<64hex>`, or "a local script writes `.mcp.json`" claims remain in the shipped kit (grep count = 0), with exactly 1 canonical hosted-setup section; verifiable by the doc-grep check. *(FR-006)*

---

## Scope Boundary

In scope:

- Server-side `.mcp.json` injection into the kit archive at download.
- Auto-running `init.mjs` on a fresh extract (VS Code `folderOpen`), reconciled with the existing gateway-start task.
- The `kit:configure` token-regex fix plus corrected error/guidance text in `kit:configure` and `init.mjs`.
- Reconciliation of the setup docs to one accurate hosted-setup procedure.

## Out of Scope

- Changing the hosted-only transport model, or adding authentication to `/health`.
- The one-time `/mcp` approval gate in Claude Code — a client gate we cannot remove.
- Server-side infrastructure metrics or the sysadmin health console (SCOPE-069).
- Cockpit-side health *detection* (SCOPE-094) — SCOPE-095 prevents the failure that SCOPE-094 surfaces.
- `.claude/settings.local.json` token duplication — unnecessary once `.mcp.json` carries the literal token.

## Open Questions

- Should `init.mjs` become the single `folderOpen` entry (replacing the separate gateway / version-check / cockpit tasks), or run alongside them?
- Should the local `kit:configure` path also emit `.mcp.json` directly, or leave that to `init.mjs`?
- Keep accepting the aspirational `wxk_`-prefixed token format for forward-compat, or standardize on base64url only?

## Constraints & Notes

### Constraints
- **Two-repo change.** Server + orchestrator CLI live in this repo; `tasks.json` / `init.mjs` / consumer docs live in the sibling orchestrator repo (`..\wxKanban-agent-Orchestrator`). Delivery = a push that deploys the server (FR-001/FR-002/FR-004 server-side) plus a kit release from the orchestrator repo (SCOPE-086 path) for FR-003/FR-005/FR-006. Push/release is user-gated.
- **`.mcp.json` carries a secret.** It must stay gitignored everywhere it is written (server inject and `init.mjs`).
- **The `/mcp` approval is a Claude Code gate.** One-time and unavoidable; it stays a manual step in every scenario.
- **Literal token, no duplication.** Because the token is written literally into `.mcp.json`, no `.claude/settings.local.json` duplication is needed — this is the whole point of the hardened form (Claude Code does not expand `${VAR}` from `.env`).

### Dependencies
- SCOPE-011 (kit generation + Download Kit route), spec 028 (hosted-MCP-only model). Repairs SCOPE-008 (original Init command); ships through SCOPE-086 (Marketplace / kit-release delivery). Distinct from SCOPE-069 (server infra monitor) and SCOPE-094 (Cockpit health detection).

### Risks
- A double gateway start on `:3003` if the `folderOpen` `init.mjs` task is not reconciled with the existing gateway-start task — mitigated by FR-003 (init.mjs as the single first-run entry, PID-guarded).
- A stale token shipped on re-download if `.mcp.json` is not stripped on the upgrade path — mitigated by FR-002.
- A too-loose `TOKEN_RE` accepting garbage — mitigated by a minimum-length/charset bound and unit tests (FR-004).

- **Process note:** authored in-conversation (interactive buildscope, section-by-section approval). Reuse-check (SCOPE-093/FR-008) ran first via `search_capabilities` — top hits SCOPE-008/011 (kit init/generation foundation) and SCOPE-086 (delivery) are foundations this extends, not covering scopes; building new confirmed. Disk-authoritative; not in DB yet. Next: `createSpecs` → `implement`. Nothing pushed until the user says push.
