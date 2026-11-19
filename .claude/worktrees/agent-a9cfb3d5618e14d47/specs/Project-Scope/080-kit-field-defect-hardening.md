# SCOPE-080: Kit Field-Defect Hardening — batch 1 (from YappChat dogfooding)

**Spec Number**: 080
**Status**: `draft`
**Created**: 2026-06-28
**Depends On**: SPEC-019 (Agent Orchestrator Kit — owns the kit source, scaffold output, and `sync-to-orchestrator --release` publish path)
**Source**: Defects found while dogfooding the kit in the YappChat project (`1993e2ba-2322-4b9d-809d-246ffdbe344c`): the soft SPEC-FIRST scaffold gate (manually hardened in `YappChat/CLAUDE.md` on 2026-06-28) and `YappChat/KIT-DEFECT-gateway-port.md`

---

## Overview

Two unrelated defects surfaced while running the kit inside a real consumer project (YappChat). Both
were patched **in YappChat by hand**, but the fix that matters is at the **kit source**, so every
newly scaffolded or upgraded project inherits it instead of each one being repaired after the fact.
This scope batches the two source-level fixes behind one delivery path (fix at source → regression
guard → `sync-to-orchestrator --release`):

- **Item A — SPEC-FIRST gate wording.** The scaffold `CLAUDE.md` ships a soft instruction
  (*"If NOT in spec → STOP, ASK user"*) that an AI assistant can rationalize past — letting feature
  code be written with no scope behind it (observed on YappChat). Replace it with a hard refusal gate.
- **Item B — Gateway health-check port.** `scripts/orchestrator-health-check.mjs` hardcodes the
  gateway at `http://localhost:3003`, but the gateway binds a per-project port recorded in
  `.wxai/kit-runtime.json` (YappChat's was `3865`). The check probes `:3003`, finds nothing, and
  reports a false failure — non-fatal in Design, a **hard false failure** once `gatewayRequired` is
  true in Implementation+.

This scope is the **kit-source side only**. Already-scaffolded projects (e.g. YappChat) keep their
hand-applied patches; back-porting to existing projects is out of scope.

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actor** | A developer working in a freshly scaffolded or upgraded wxKanban-managed project — the person whose AI assistant the gate governs and whose health check must report truthfully |
| **Secondary Actors** | Kit maintainer (edits the template + cuts the `sync-to-orchestrator --release`); the AI assistant (Claude/Cursor/etc.) that reads `CLAUDE.md` and must obey the gate; the orchestrator gateway + health-check runtime that the port fix concerns |
| **Key Value** | Discipline and diagnostics that hold across **every** project by default — a SPEC-FIRST gate strong enough that off-leash feature work can't be rationalized, and a health check that resolves the real gateway port instead of guessing — so neither has to be re-fixed project by project |
| **Scope Boundary** | **IN (Item A)**: locate the single authoritative scaffold-`CLAUDE.md` source; replace the soft SPEC-FIRST block with a hard "refuse feature code without an approved spec" gate that explicitly exempts trivial fixes and operational AWS/infra; a regression test that fails if the scaffolded text drifts from the hardened canonical wording. **IN (Item B)**: change the gateway URL resolution in `scripts/orchestrator-health-check.mjs` to *explicit env → live port from `.wxai/kit-runtime.json` → legacy `:3003` default*; fix the stale `:3003`/`:3002` comments in `init.mjs` and header examples. **IN (both)**: propagate via `sync-to-orchestrator --release`. **OUT**: back-porting either fix to already-scaffolded projects; any change to `_wxAI/rules` content; building hook-based *enforcement* of SPEC-FIRST (text gate only); non-`CLAUDE.md` AI-tool configs (Cursor/other rules files). |

---

## User Scenarios & Testing

### US1 — A new scaffold inherits the hard SPEC-FIRST gate

**Actor**: a developer scaffolding a new wxKanban-managed project

1. The developer scaffolds a fresh project from the current kit.
2. They open the generated `CLAUDE.md` and read the SPEC-FIRST section.

**Expected outcome**: the section states a hard refusal (no feature code without an approved spec) with the trivial-fix and operational-AWS/infra exemptions — the soft "STOP, ASK user" wording is gone.

### US2 — An AI assistant refuses off-leash feature work

**Actor**: the AI assistant operating in a freshly scaffolded project

1. The user asks the assistant to build a feature for which no spec exists.
2. The assistant reads the gate in `CLAUDE.md`.

**Expected outcome**: the assistant refuses to write the feature code and routes a spec first — rather than proceeding on chat direction (the exact failure observed on YappChat).

### US3 — Health check reports a healthy gateway on its real port

**Actor**: a developer running `kit:health` (or `init`/`upgrade-kit`) in a project whose gateway bound a non-3003 port

1. The project's gateway starts and records its port (e.g. `3865`) in `.wxai/kit-runtime.json`.
2. The developer runs the health check.

**Expected outcome**: the check resolves the live port from `kit-runtime.json` and reports the gateway healthy on that port — no false `gateway fetch failed`, and exit 0 even when `gatewayRequired` is true.

---

## Functional Requirements

### FR-001 — Hardened SPEC-FIRST gate in the scaffold CLAUDE.md template

The single authoritative scaffold-`CLAUDE.md` source carries a SPEC-FIRST section worded as a hard
gate: application/feature development must have an approved spec first, and with no spec the assistant
**refuses** to write the feature code (stop, say so, route the spec) rather than proceeding on chat
direction.

**Acceptance Criteria**:
- [x] **Source pinned (2026-06-28):** the authoritative scaffold `CLAUDE.md` is `wxKanban-agent-Orchestrator/CLAUDE.md` in the separate published kit repo (`Cowboy-59/wxKanban-agent-Orchestrator`) — confirmed by the `<Project Name>` placeholders + soft `STOP, ASK user` wording. The template text exists in **no** file in the wxKanban repo, so it is already the single source (success-metric #2 satisfied). `AIScaffoldingService`/`KitGenerationService` emit none; `KitProxyService.UPGRADE_STRIP_FILES` strips `CLAUDE.md` on upgrade (existing projects keep theirs — hardening reaches NEW scaffolds only).
- [ ] The soft "If NOT in spec → STOP, ASK user" wording no longer appears in a fresh scaffold (edit `wxKanban-agent-Orchestrator/CLAUDE.md`).
- [ ] The hardened block states the refusal explicitly and follows the draft-spec → approval → implement order.

### FR-002 — Explicit exemptions in the gate

The hardened gate names what is **not** blocked so the gate is usable day-to-day.

**Acceptance Criteria**:
- [ ] The block exempts trivial fixes (single-file bug fix, typo, version bump, comment).
- [ ] The block exempts operational AWS / infrastructure / deploy work.
- [ ] The block names what IS gated (features, endpoints, UI entry points, schema/data-model changes, business logic, cross-host integrations).

### FR-003 — Regression guard for the gate wording

A test asserts the scaffolded `CLAUDE.md` SPEC-FIRST section matches the hardened canonical text and
fails on drift.

**Acceptance Criteria**:
- [ ] A unit/integration test fails if a fresh scaffold's SPEC-FIRST block reverts to soft wording or drops the exemptions.
- [ ] The test runs in CI.

### FR-004 — Runtime-resolved gateway port in the health check

`scripts/orchestrator-health-check.mjs` resolves the gateway URL as *explicit `GATEWAY_HTTP_URL`
override → live `services.gateway.port` from `.wxai/kit-runtime.json` → legacy `http://localhost:3003`
default*.

**Acceptance Criteria**:
- [ ] With a gateway bound to a non-3003 port recorded in `kit-runtime.json`, the check probes that port and reports healthy.
- [ ] With no runtime file present, it falls back to the legacy `:3003` default (no crash).
- [ ] An explicit `GATEWAY_HTTP_URL` still wins over both.
- [ ] `runHealthCheck()` returns exit 0 against a healthy non-3003 gateway when `gatewayRequired` is true.

### FR-005 — Fix stale port references

The hardcoded-port assumptions in comments/examples are corrected to describe the runtime-resolved port.

**Acceptance Criteria**:
- [ ] The "default 3003" comment near `init.mjs:191` and header examples citing `:3003`/`:3002` are updated to describe runtime resolution.

### FR-006 — Single delivery to consumers

Both fixes reach consumers through one kit release.

**Acceptance Criteria**:
- [ ] Both Item A and Item B land in the kit source and are published via `sync-to-orchestrator --release`.
- [ ] A scaffold/upgrade from the released kit shows both the hardened gate and the corrected port resolution.

### FR-007 — (Optional follow-on) Gateway resolver hardening

Recommended but severable hardening of the gateway resolution, per the defect report.

**Acceptance Criteria**:
- [ ] Liveness: only trust the runtime entry if its `pid` is alive; otherwise report "no gateway running" rather than probing a stale port.
- [ ] Identity: assert the gateway `/health` `projectId` matches this project's id (so a neighbour's gateway on a reused port isn't reported as this project's).
- [ ] Single resolver: one shared `resolveGatewayUrl()` used by both `init.mjs` and the health check.

---

## Data Requirements

This scope adds **no tables and no schema changes**. Item A edits a template/string source and adds a
test; Item B reads the existing `.wxai/kit-runtime.json` contract (`services.gateway.port`) that the
gateway already writes. No new persistence.

## API Routes

**No new HTTP routes.** Both items are kit-source/runtime changes (a scaffold template + a health-check
script). The publish path is the existing `scripts/sync-to-orchestrator.mjs --release`.

## Frontend Components

None. No UI surface is added or changed.

---

## Success Criteria

1. A fresh scaffold's `CLAUDE.md` SPEC-FIRST section is the hardened hard-gate — **0** occurrences of the soft "STOP, ASK user" wording, and the trivial-fix + operational-AWS/infra exemptions are present.
2. Exactly **1** authoritative source for the scaffold SPEC-FIRST block — no divergent duplicate copies across scaffold paths.
3. A regression test fails on any drift of the scaffolded SPEC-FIRST wording, and it runs in CI.
4. The health check reports a healthy gateway on its real (non-3003) port and returns exit 0 when `gatewayRequired` is true — verified against a gateway bound to a non-default port.
5. Both fixes ship to consumers in **one** `sync-to-orchestrator --release`; a post-release scaffold/upgrade shows both.

## Key Entities

- **Scaffold `CLAUDE.md` template** (kit-owned) — the authoritative source string/file whose SPEC-FIRST block is hardened. Exact location to be confirmed in FR-001.
- **`.wxai/kit-runtime.json`** (per-project, gateway-written) — carries `services.gateway.port`; the health check reads it instead of assuming `:3003`. No change to its shape.

---

## Constraints

- **Single source of truth** — the SPEC-FIRST block must live in exactly one place; if duplicate scaffold copies exist, dedupe rather than edit each.
- **Resolve, don't assume** (Item B) — the gateway port is dynamic by design (multiple kit projects on one machine need distinct ports); pinning a constant is wrong. Only the *reader* was non-compliant.
- **Advisory text, not enforcement** — the SPEC-FIRST gate is text an obedient AI follows; nothing forces it. A hook-based enforcement layer would be stronger and is deliberately deferred to a later scope.
- **Cross-repo risk** — if the authoritative `CLAUDE.md` template lives in the separate `wxKanban-agent-Orchestrator` repo, Item A becomes a cross-repo change plus a release, with two-repo drift risk; FR-001 must pin the location before editing.
- **Don't break existing scaffold/kit tests** — both changes must keep current kit test suites green.
- **No back-port** — already-scaffolded projects keep their hand-applied patches; this scope changes the source only.

## Notes

- Item A origin: `YappChat/CLAUDE.md` was hardened by hand on 2026-06-28 after feature work was built there with no spec behind it; this scope moves that hardening upstream so new scaffolds get it automatically. Mirrors the `feedback_spec_first_for_features` discipline in the wxKanban memory + the SPEC-FIRST rule in `CLAUDE.md`.
- Item B origin: `YappChat/KIT-DEFECT-gateway-port.md` (kit v1.7.10, present v1.7.7→current) — full root-cause + patch + follow-on hardening captured there.
- Publish path per memory: `scripts/sync-to-orchestrator.mjs --release` cuts the kit GitHub release customers pull from; the kit must not ship app-only DB deps (separate CI guard).

## Clarifications

### Session 2026-06-28

| # | Question | Decision |
|---|----------|----------|
| 1 | One scope or two for the two defects? | One batched scope — both are kit-source defects found dogfooding in YappChat, sharing one delivery path. |
| 2 | Scope number? | SCOPE-080. 078 is taken (SPEC-078 Infra Health Monitor) and 079 by cockpit-live-help; the hosted buildscope counter offered 078 because it can't see 078/079 (DB-vs-local drift), so 080 is the real next-free. Authored as a local Project-Scope doc, same as 079; createSpecs reconciliation later. |
| 3 | Back-port to existing projects? | No — source-only fix; YappChat keeps its hand-applied patches. |
| 4 | Build hook-based SPEC-FIRST enforcement? | Out of scope — text gate only; stronger enforcement deferred to a later scope. |
| 5 | Gateway resolver follow-on hardening (liveness/identity/single-resolver) in or out? | In as an **optional, severable** FR-007 — recommended but not blocking the core port fix. |
