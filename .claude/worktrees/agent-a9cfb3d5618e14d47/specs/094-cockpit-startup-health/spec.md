# Spec 094: Cockpit Startup Health Check — Orchestrator & MCP Connection

> Spec ID: 9cf2e3b3-dd0c-4236-a4ac-3296a991ceac · Status: implementing · Phase: implementation
> Source scope: `specs/Project-Scope/094-cockpit-startup-health.md`

## Overview

A developer using the wxKanban kit in VS Code issues orchestrator commands (buildscope, implement, dbpush) against the hosted MCP. When that connection is unavailable — VPN or network down, a misconfigured mcpBaseUrl, the hosted service mid-deploy, or the hub's database down — the developer finds out only reactively today: a command fails partway, or the Dev Cockpit shows a "Cannot reach wxKanban" row after a failed summary call. There is no proactive, at-a-glance signal of connection health when the project opens.

This spec adds a proactive, client-side health check that runs when the Dev Cockpit extension activates. It probes the orchestrator/MCP connection through the auth-exempt GET /health endpoint (so it works before sign-in), surfaces a persistent "System Health" status at the top of the Cockpit tree — a rolled-up verdict plus per-check rows for the orchestrator link, MCP reachability, and database — and raises a one-time warning toast only when the connection is broken. The status folds into the Cockpit's existing 30-second poll so it repairs itself when connectivity returns.

## Business Problem

Every developer on the kit depends on the hosted orchestrator being reachable for their workflow to function. When it is not, the current failure mode is a mid-command error or a stale tree — the developer wastes a command run (and its tokens), then has to diagnose whether the problem is their network, their configuration, the hosted service, or its database. The signal arrives late and does not distinguish those cases.

The information needed to answer "is my connection healthy, and if not, why" already exists in the hub's /health response, but nothing consumes it proactively on the client. Surfacing it at activation turns a late, ambiguous failure into an early, self-diagnosing status that names the endpoint tried and the specific reason before the developer spends a command.

## Actors

- Primary: The individual developer running the wxKanban kit in VS Code — a per-workstation, client-side check made on their own machine.
- Secondary: The Dev Cockpit tree (SCOPE-042) as the status surface; the hosted MCP hub's auth-exempt GET /health endpoint; the project-context resolver that supplies the endpoint (WXKANBAN_MCP_BASE_URL env override, then .wxkanban-project.json mcpBaseUrl, then the hosted default); and the existing 30-second Cockpit poll used for auto-repaint.

## Success Metrics

1. Fast healthy signal: with a reachable hub, the "System Health — OK" row renders and no toast fires, with the verdict resolved within the 5-second probe budget; verifiable in the Extension Development Host.
2. Bounded failure surfacing: with an unreachable endpoint, the offline state and a one-time toast appear within 5 seconds (the timeout bound), naming the endpoint tried and the reason.
3. Auto-recovery within one poll: when connectivity flips from offline to OK, the status updates within one poll cycle (at most 30 seconds) with no manual refresh.
4. Test coverage: the probe's five outcomes (reachable, non-2xx, network error, timeout, dbConnected-null) plus the unlinked verdict are covered by passing unit tests (7 of 7 green; full extension suite 31 of 31).

## Scope Boundary

In scope: a token-free /health probe fired on extension activation independent of view visibility; a "System Health" group at the top of the Cockpit tree with a rolled-up verdict (ok, degraded, offline, unlinked) and per-check rows (orchestrator link, MCP reachability with version, database); a one-time warning toast with a Retry action when the connection is unhealthy; and health folded into the Cockpit poll signature so the status auto-repairs when connectivity returns.

## Out of Scope

- Server-side infrastructure metrics or the sysadmin health console (SCOPE-069).
- Any admin-facing surface.
- Uptime or SLA history and trend tracking.
- Auto-remediation of a broken connection.
- Adding authentication to /health, or changing the hosted-only transport model.

## Open Questions

- Whether the per-check rows should later gain a click-through action (open the endpoint config, or re-run sign-in) or stay read-only.
- Whether to add a lightweight backoff/retry to the startup probe for transient timeouts, or leave recovery entirely to the 30-second poll.
- Whether the toast should suppress across a session after the first dismissal, or re-fire on each fresh activation while still unhealthy.

## Functional Requirements

### FR-001 — Proactive startup probe
On extension activation, probe the orchestrator/MCP connection independently of whether the Cockpit view is visible. The probe fires from activate() without the user opening the view, uses a hard 5-second timeout (AbortController), never blocks activation, and is best-effort so a failure never throws into the activation path.

### FR-002 — Token-free reachability
Determine reachability via the auth-exempt GET /health so the check works before sign-in. No API token is required, and the endpoint is resolved from project context (WXKANBAN_MCP_BASE_URL, then .wxkanban-project.json mcpBaseUrl, then the hosted default).

### FR-003 — System Health tree surface
Render a "System Health" group at the top of the Cockpit tree with a rolled-up verdict and per-check rows. The verdict is one of ok, degraded, offline, or unlinked. Healthy renders collapsed and quiet (green); degraded and offline render expanded and coloured. The group expands into Orchestrator link, MCP connection (with version), and Database rows, and is omitted when no project is linked.

### FR-004 — Broken-connection alert
Raise a one-time warning toast, with a Retry action, only when the connection is degraded or offline. No toast fires when healthy. The toast names the failure (endpoint and reason), and Retry re-runs the probe and refreshes the Cockpit.

### FR-005 — Auto-repaint on change
Fold health into the Cockpit poll signature so the status updates when connectivity flips, without a manual refresh. The signature includes the overall verdict, the hub version, and dbConnected, and the poll repaints only when the health signature actually changes so an unchanged view never flickers.

### FR-006 — Self-diagnosing detail
Every unhealthy state names the endpoint tried and a short reason. The offline reason distinguishes timeout versus HTTP status versus a network error, and the degraded state states that the database is down and writes will fail until it recovers.
