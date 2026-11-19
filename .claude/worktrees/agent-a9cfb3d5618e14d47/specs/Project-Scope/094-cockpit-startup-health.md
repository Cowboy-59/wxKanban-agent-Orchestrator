# SCOPE-094: Cockpit Startup Health Check — Orchestrator & MCP Connection

**Scope Number**: SCOPE-094
**Status**: `draft`
**Created**: 2026-07-10
**Last Reviewed**: 2026-07-10 (authored in-conversation, section-by-section approval; back-fills the spec-first record for a prototype built out-of-band at the user's direction. Decisions: proactive probe on activation via the auth-exempt `/health`; three-state verdict ok/degraded/offline plus unlinked; persistent "System Health" group at the top of the Cockpit tree; one-time warning toast with Retry only when unhealthy; health folded into the existing poll signature for auto-repaint)
**Depends On**: SCOPE-042 (Dev Cockpit tree — the delivery surface for the health group), spec 028 (hosted-MCP-only model — the orchestrator the developer talks to IS the hosted MCP, so its `/health` is the orchestrator signal)
**Related Scopes**: SCOPE-069 (server-side In-App System Health / infra monitor — the *distinct* server counterpart; SCOPE-094 is the client-side per-developer connectivity check), SCOPE-086 (Marketplace-only Cockpit delivery — the release path this ships through)
**Source**: `specs/Project-Scope/094-cockpit-startup-health.md`

---

## Overview

A developer using the wxKanban kit in VS Code issues orchestrator commands (buildscope, implement, dbpush) against the hosted MCP. When that connection is unavailable — VPN or network down, a misconfigured `mcpBaseUrl`, the hosted service mid-deploy, or the hub's database down — the developer finds out only reactively today: a command fails partway, or the Dev Cockpit throws a "Cannot reach wxKanban" row after a failed summary call. There is no proactive, at-a-glance signal of connection health when the project opens.

This scope adds a proactive, client-side health check that runs when the Dev Cockpit extension activates. It probes the orchestrator/MCP connection through the auth-exempt `GET /health` endpoint (so it works before sign-in), surfaces a persistent "System Health" status at the top of the Cockpit tree — a rolled-up verdict plus per-check rows for the orchestrator link, MCP reachability, and database — and raises a one-time warning toast only when the connection is broken. The status folds into the Cockpit's existing poll so it repairs itself when connectivity returns.

## Business Problem

Every developer on the kit depends on the hosted orchestrator being reachable for their workflow to function. When it is not, the current failure mode is a mid-command error or a stale tree — the developer wastes a command run (and its tokens), then has to diagnose whether the problem is their network, their configuration, the hosted service, or its database. The signal arrives late and does not distinguish those cases.

The information needed to answer "is my connection healthy, and if not, why" already exists in the hub's `/health` response, but nothing consumes it proactively on the client. Surfacing it at activation turns a late, ambiguous failure into an early, self-diagnosing status — the developer sees the endpoint tried and the specific reason before spending a command.

### Core Design

| Element | Cockpit Startup Health Check — Orchestrator & MCP Connection |
| --- | --- |
| **Primary Actor** | The individual developer running the wxKanban kit in VS Code — a per-workstation, client-side check |
| **Secondary Actors** | The Dev Cockpit tree (SCOPE-042) as the status surface; the hosted MCP hub's auth-exempt `GET /health` endpoint; project context resolution (`.wxkanban-project.json` / env override) for the endpoint; the existing 30s Cockpit poll for auto-repaint |
| **Key Value** | A broken orchestrator/MCP connection is visible before the first command fails, and self-diagnosing — it names the endpoint tried and the specific failure reason |
| **Primary** | Proactively detect and surface orchestrator/MCP connection health at Cockpit activation |
| **Secondary** | Distinguish the failure classes (unreachable vs database-down) and auto-repair the status when connectivity returns, without a manual refresh |
| **Boundary — IN** | A token-free `/health` probe fired on extension activation; a "System Health" group at the top of the Cockpit tree with a rolled-up verdict (ok/degraded/offline/unlinked) and per-check rows (orchestrator link, MCP reachability + version, database); a one-time warning toast with a Retry action when unhealthy; health folded into the Cockpit poll signature for auto-repaint |
| **Boundary — OUT** | Server-side infrastructure metrics or the sysadmin health console (that is SCOPE-069); any admin-facing surface; uptime/SLA history or trend tracking; auto-remediation of a broken connection; adding auth to `/health`; changing the hosted-only transport model |

---

## Actors

Primary: The individual developer running the wxKanban kit in VS Code — a per-workstation, client-side check made on their own machine.

Secondary: The Dev Cockpit tree (SCOPE-042) as the status surface; the hosted MCP hub's auth-exempt `GET /health` endpoint; the project-context resolver that supplies the endpoint (`WXKANBAN_MCP_BASE_URL` env override, then `.wxkanban-project.json` `mcpBaseUrl`, then the hosted default); and the existing 30-second Cockpit poll used for auto-repaint.

## User Scenarios

### US1 — Healthy connection (happy path)
A developer opens their linked project. On activation the Cockpit probes `/health`, receives `200 {version, dbConnected:true}`, and shows a quiet collapsed "System Health — OK" row at the top of the tree (green, "MCP v0.1.0"). No toast fires. Expanding the row shows Orchestrator linked · MCP reachable · Database connected.
Expected: reassurance in one glance, with zero interruption to the workflow.

### US2 — Orchestrator/MCP unreachable (offline)
The developer is on a network that cannot reach the hub (or `mcpBaseUrl` is wrong). The probe aborts at the 5s timeout. The Cockpit shows an expanded, red "System Health — offline" group naming the endpoint tried and the reason (`timeout`, `HTTP <status>`, or a network error), and a one-time warning toast fires with a Retry action.
Expected: the developer knows, before running a command, that it will not sync, and can see which endpoint failed and why.

### US3 — Reachable but database down (degraded)
`/health` returns `200` but with `dbConnected:false` (hub up, database down mid-deploy). The Cockpit shows an amber "System Health — degraded" group ("writes will fail until it recovers") and a one-time toast.
Expected: the developer distinguishes "cannot reach the hub" from "hub is up but writes will fail" — two different problems with two different fixes.

## Functional Requirements

### FR-001 — Proactive startup probe
On extension activation, probe the orchestrator/MCP connection independently of whether the Cockpit view is visible.
Acceptance Criteria:
- [ ] The probe fires from `activate()` without the user opening the Cockpit view
- [ ] The probe uses a hard 5-second timeout (AbortController) and never blocks activation
- [ ] The probe is best-effort — a failure never throws into the activation path

### FR-002 — Token-free reachability
Determine reachability via the auth-exempt `GET /health`, so the check works before sign-in.
Acceptance Criteria:
- [ ] No API token is required to run the probe
- [ ] The endpoint is resolved from project context (`WXKANBAN_MCP_BASE_URL` → `.wxkanban-project.json` `mcpBaseUrl` → hosted default)

### FR-003 — System Health tree surface
Render a "System Health" group at the top of the Cockpit tree with a rolled-up verdict and per-check rows.
Acceptance Criteria:
- [ ] The verdict is one of `ok` / `degraded` / `offline` / `unlinked`
- [ ] Healthy renders collapsed and quiet (green); degraded/offline renders expanded and coloured
- [ ] The group expands into Orchestrator link · MCP connection (+version) · Database rows
- [ ] The group is omitted when no project is linked (the root "no project" message already covers that state)

### FR-004 — Broken-connection alert
Raise a one-time warning toast, with a Retry action, only when the connection is degraded or offline.
Acceptance Criteria:
- [ ] No toast fires when the connection is healthy
- [ ] The toast names the failure (endpoint + reason); Retry re-runs the probe / refreshes the Cockpit

### FR-005 — Auto-repaint on change
Fold health into the Cockpit's poll signature so the status updates when connectivity flips, without a manual refresh.
Acceptance Criteria:
- [ ] The signature includes the overall verdict, the hub version, and dbConnected
- [ ] The poll repaints only when the health signature actually changes (no flicker on an unchanged view)

### FR-006 — Self-diagnosing detail
Every unhealthy state names the endpoint tried and a short reason.
Acceptance Criteria:
- [ ] The offline reason distinguishes `timeout` vs `HTTP <status>` vs a network error
- [ ] The degraded state states that the database is down and writes will fail

## Technical Sections

Client-only VS Code extension feature; it reuses the existing server `/health` and adds no backend surface.

- **Data/Schema** — none. No new tables, no migrations.
- **API Routes** — none new. Consumes the existing auth-exempt `GET /health` (`mcp-server/src/index-http.ts`), which returns `{status, version, dbConnected, timestamp}`.
- **Frontend / Extension** —
  - `vscode-extension/src/services/healthCheck.ts` — `probeMcpHealth(baseUrl, fetchImpl?)` + `checkSystemHealth(folderPaths, fetchImpl?)`; kept vscode-free (folders injected) so it unit-tests under plain Node.
  - `vscode-extension/src/providers/cockpitTreeProvider.ts` — `health-group` / `health-item` node kinds, `withHealthSection()`, health folded into `ComputedState` + poll signature.
  - `vscode-extension/src/extension.ts` — the proactive `activate()` probe and the one-time toast.
- **wxAI Commands** — none.

Reused probe pattern: ported from `scripts/kit-status.mjs::probeHostedMcp` (single source of the 5s-abort `/health` fetch shape).

---

## Success Criteria

1. **Fast healthy signal.** With a reachable hub, the "System Health — OK" row renders and no toast fires, with the verdict resolved within the 5-second probe budget; verifiable in the Extension Development Host. *(FR-001, FR-003)*
2. **Bounded failure surfacing.** With an unreachable endpoint, the offline state and a one-time toast appear within 5 seconds (the timeout bound), naming the endpoint tried and the reason. *(FR-002, FR-004, FR-006)*
3. **Auto-recovery within one poll.** When connectivity flips offline→OK, the status updates within one poll cycle (≤30 seconds) with no manual refresh. *(FR-005)*

---

## Scope Boundary

In scope:

- A token-free `/health` probe fired on extension activation, independent of view visibility.
- A "System Health" group at the top of the Cockpit tree with a rolled-up verdict (ok/degraded/offline/unlinked) and per-check rows (orchestrator link, MCP reachability + version, database).
- A one-time warning toast with a Retry action when the connection is unhealthy.
- Health folded into the Cockpit poll signature so the status auto-repairs when connectivity returns.

## Out of Scope

- Server-side infrastructure metrics or the sysadmin health console (SCOPE-069).
- Any admin-facing surface.
- Uptime / SLA history or trend tracking.
- Auto-remediation of a broken connection.
- Adding authentication to `/health`, or changing the hosted-only transport model.

## Open Questions

- Whether the per-check rows should later gain a click-through action (e.g. open the endpoint config, or re-run sign-in) or stay read-only.
- Whether to add a lightweight backoff/retry to the startup probe for transient timeouts, or leave recovery entirely to the 30s poll.
- Whether the toast should suppress across a session after the first dismissal, or re-fire on each fresh activation while still unhealthy.

## Constraints & Notes

### Constraints
- **Client-side only.** A per-workstation developer check; no server metrics, no admin surface. Explicitly not SCOPE-069.
- **Ships via Marketplace only (SCOPE-086).** Going live requires a COCKPIT version bump → repackage → `vsce publish`; "implementation complete" is not "live."
- **Depends on `/health` staying auth-exempt.** The token-free probe relies on every middleware short-circuiting `/health`. If auth is added there, FR-002 breaks and the probe must carry a token.
- **Approximate, point-in-time.** A single 5s reachability probe answers "can I reach it right now," not uptime/SLA; health reflects the moment of the probe (activation plus each 30s poll).

### Dependencies
- SCOPE-042 (Dev Cockpit tree), spec 028 (hosted-MCP-only model), SCOPE-086 (Marketplace delivery path). Distinct from SCOPE-069 (server infra monitor).

### Risks
- A slow network could delay the verdict up to the 5s timeout — bounded by design and non-blocking (FR-001).
- If `/health` ever gains auth, the token-free probe silently fails — mitigated by treating any non-2xx as offline and naming the endpoint (FR-006).
- Toast fatigue on a persistently-degraded connection — mitigated by the one-time (per activation) firing and the quiet-when-healthy default (FR-004); see Open Questions for session-suppression.

- **Process note:** authored in-conversation (interactive buildscope, section-by-section approval); back-fills the spec-first record for a prototype built out-of-band. Prototype code fenced provisionally `[SCOPE 094 / cockpit-startup-health]`; reconcile to real spec/task IDs after `createSpecs`. Implement via `createSpecs` → `implement`. Nothing pushed until the user says push.
