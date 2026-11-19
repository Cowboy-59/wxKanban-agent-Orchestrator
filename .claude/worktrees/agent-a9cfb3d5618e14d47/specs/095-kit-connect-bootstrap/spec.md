# Spec 095: Kit Connect Bootstrap — Fresh-Download MCP Registration & Token-Config Repair

> Spec ID: 740f5cd0-9973-48db-978f-9e1ca808aa4e · Status: implementing · Phase: implementation
> Source scope: `specs/Project-Scope/095-kit-connect-bootstrap.md`

## Overview

A customer generates a kit, downloads it, extracts it, and opens the folder expecting the orchestrator/MCP connection to work. Today it silently does not. On a fresh extract, VS Code's folder-open tasks install dependencies and start the gateway, but nothing writes the one file Claude Code reads to reach the hosted MCP — `.mcp.json`. The script that does write it (`init.mjs`, in the orchestrator repo) runs only on the upgrade path, so first-time customers are never registered and hit "MCP won't connect." The documented manual fallback (`kit:configure`) is itself broken: its token validation rejects every token the system can actually mint.

This spec closes the fresh-download connection gap on two fronts: the download server injects a correct, literal-token `.mcp.json` into the archive so the kit is connected the moment it opens, and the first-run path (`init.mjs`) is wired to actually run on a fresh extract as belt-and-suspenders. It also repairs the `kit:configure` token check so the manual path works, and reconciles the contradictory setup docs to one accurate procedure.

## Business Problem

Every customer's first experience of the kit depends on reaching `mcp.wxperts.com`, and right now that first experience fails for reasons the customer cannot diagnose. The connection artifact — `.mcp.json` with a literal bearer token, `type:"http"`, `<base>/mcp` — is well understood and already produced correctly by `init.mjs`, but it never runs on first download. The one command we tell customers to run to fix it rejects their real token outright. The result is a recurring, high-friction onboarding failure (`project_mcp_connectivity_hardening` MUST-FIX; `SUPPORT-mcp-connection-issue-2026-07-04.md`) at the moment a new customer forms their impression of the product. The machinery to fix it already exists — a minted per-download token, the correct `.mcp.json` shape in `init.mjs`, and a manual `kit:configure` path; the pieces are mis-wired and one validator is wrong.

## Actors

Primary: the customer setting up a freshly downloaded kit on their own workstation.

Secondary: the kit download server (`KitProxyService`) that mints the token and injects per-project files; `init.mjs`, the first-run bootstrap in the orchestrator repo; `kit:configure`, the manual repair command; Claude Code, which reads `.mcp.json` at the workspace root; and the VS Code folder-open tasks that fire on extract.

## Success Metrics

1. Zero-touch connect on fresh download: 100% of freshly downloaded kits contain a valid `.mcp.json` (`type:"http"`, url ending `/mcp`, literal bearer token) requiring 0 manual file edits before the one-time `/mcp` approval, and the injected token returns HTTP 200 from `POST <base>/call`.
2. Manual repair path works: `kit:configure` accepts 100% of real minted (base64url) tokens with 0 false rejections and rejects malformed input, proven by a unit test with at least 2 accept and 2 reject cases plus 1 live-token run.
3. Docs single-source and accurate: 0 occurrences of `type:"sse"`, `wxk_live_<64hex>`, or "a local script writes `.mcp.json`" claims remain in the shipped kit (grep count = 0), with exactly 1 canonical hosted-setup section.

## Scope Boundary

In scope: server-side `.mcp.json` injection at download; auto-running `init.mjs` on fresh extract; the `kit:configure` token-regex + error-text fix; setup-doc reconciliation.

## Out of Scope

- Changing the hosted-only transport model, or adding authentication to `/health`.
- The one-time `/mcp` approval gate in Claude Code — a client gate we cannot remove.
- Server-side infrastructure metrics or the sysadmin health console (SCOPE-069).
- Cockpit-side health detection (SCOPE-094).
- `.claude/settings.local.json` token duplication.

## Open Questions

- Should `init.mjs` become the single `folderOpen` entry, or run alongside the existing tasks?
- Should the local `kit:configure` path also emit `.mcp.json` directly, or leave that to `init.mjs`?
- Keep accepting the aspirational `wxk_`-prefixed token format, or standardize on base64url only?

## Functional Requirements

### FR-001 — Server-side .mcp.json injection at download
On kit download, the server writes `.mcp.json` into the archive with `mcpServers.wxkanban = { type:"http", url:"<mcpBaseUrl>/mcp", headers:{ Authorization:"Bearer <apiToken>" } }`, reusing the minted token it already writes to `.env`. Merge-safe with any existing `.mcp.json`; `.mcp.json` gitignored in the shipped kit.

### FR-002 — Fresh token on re-download
`.mcp.json` is in `UPGRADE_STRIP_FILES` so a re-download regenerates it with the freshly minted token rather than shipping a stale one.

### FR-003 — First-run auto-registration
The kit's `.vscode/tasks.json` runs `init.mjs` on `folderOpen` once, reconciled with the existing gateway-start task so the gateway is not double-started on `:3003`; `init.mjs` stays idempotent on re-run.

### FR-004 — kit:configure accepts real tokens
`TOKEN_RE` accepts the real base64url minted format and rejects malformed input; a future `wxk_`-prefixed format is also accepted; verified against `generateApiToken()` / `mint-project-token.ts` output.

### FR-005 — Accurate configuration guidance
`init.mjs` and `kit:configure` no longer instruct `--token wxk_live_<64hex>`; they reflect the real token format and where `init.mjs` lives.

### FR-006 — Reconciled setup documentation
No doc presents `type:"sse"` as the current transport; the one true form is documented; every `scripts/init.mjs` reference is accurate; the four contradictory setup docs collapse to one canonical hosted-setup section.

### FR-007 — kit:configure is reachable on every surface (Amendment A, 2026-08-03)

FR-004/FR-005 repaired what `kit:configure` *does* without checking that it can be invoked. It cannot: the command is registered in none of the four places a CLI command must appear, so `handleKitConfigureCommand` is reachable only from its own tests, and dispatch falls through to the `if (!capability)` branch of `evaluateStageOnly` — whose rejection string phrases every unrecognised command as a stage violation (`Command 'kit:configure' is not permitted in the 'Design' stage.`). Customer field report `bd756151` diagnosed that message as a policy-engine lockout and stopped, correctly refusing to hand-craft `.wxai/project.json`. Six shipped `SKILL.md` files and `core/http/mcp-client.ts:138` instruct customers to run this command.

Register `Capability.KitConfigure` (`allowedPhases: "all"`, `requiresVerifiedSpec: false` — a bootstrap command is never stage-gated); map it in `CLI_COMMAND_TO_CAPABILITY` so `--help` lists it; route it in `WorkflowEngine.dispatch` so the HTTP gateway surface works and the run is audited; and handle it in `cli.ts` **before** `loadProjectConfig()`, which otherwise throws `No .wxkanban-project.json found … Run kit init first.` on exactly the un-bootstrapped repo this command exists to bootstrap. Token masking is preserved on every path.

Out of this amendment: rephrasing the unknown-command rejection (touches spec 030 FR-009's byte-identical message contract — its own scope), and retiring the application-level `lifecycleStage` in favour of scope-level status (SCOPE-122).

### FR-008 — kit:configure is exempt from the entitlement preflight (Amendment B, 2026-10-05)

Feedback `669039df` is a follow-up to `bd756151`. `WorkflowEngine.dispatch` runs `assertEntitled()` before policy, and `EXEMPT_COMMANDS` in `core/license/preflight.ts` holds only `kit:status` and `help`. The lockout case:

- the cached `.wxai/.entitlement` has expired;
- the token is missing, revoked or wrong, or the machine is offline;
- so `defaultRefresh` returns `null` with `hadCache` set, and the preflight denies with `offline and the cached entitlement has expired`.

`kit:configure`, the command that installs the token that would fix the refresh, is then refused. The terminal path does not hit this, because FR-007's `cli.ts` branch returns before `dispatch`. The HTTP gateway (`POST /dispatch`) does hit it, which breaks FR-007's "the HTTP gateway surface works too."

Requirements:

- Add `kit:configure` to `EXEMPT_COMMANDS`, and name it in the comment above the preflight call in `dispatch`. This is safe because the command writes only local config, and Phase 1A enforces entitlement server-side on everything of value.
- Add a unit test that reproduces the reported state: a validly signed, expired cache, a refresh that returns `null`, and mode `enforce`. It asserts `kit:configure` is allowed (`source: "exempt"`) while `wxconversion` is denied.
- Set `WXKANBAN_ENTITLEMENT=off` for the kit's vitest run. `dispatch` reads `<cwd>/.wxai/.entitlement`, and under vitest that is the developer's real cache, so 11 tests across `workflow-engine` (7), `kit-configure-wiring` (2) and `mcp-adapter` (2) fail on any machine with an expired cache.
- Endpoint-test both cases through the real gateway.

The reporter's proposed fix 2, passing the context root instead of `process.cwd()`, is not adopted. Every production `dispatch` caller's root *is* its cwd, and the only command with a divergent `--project-root` is the one being exempted. Full rationale: scope doc, Amendment B.
