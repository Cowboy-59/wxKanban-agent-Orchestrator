# Spec 123: Per-Scope Stage Progression

**Spec Number**: 123
**Spec ID**: `6c83c489-f16a-47fe-8627-00d82c6242d4`
**Status**: `planned`
**Phase**: design
**Scope document**: [`specs/Project-Scope/123-per-scope-stage-progression.md`](../Project-Scope/123-per-scope-stage-progression.md)
**Depends On**: SCOPE-122 (Spec Status Vocabulary) — **hard predecessor**, decided 2026-08-05

---

## Overview

A stage belongs to a scope, not to a project. Each scope advances on its own once its tasks are
complete, and a project never blocks a scope from moving. The orchestrator implements the opposite:
`core/policy/policy.ts:64` and the three refusal sites in `core/policy/adapters/cli-adapter.ts` deny
commands based on a single project-wide stage from `resolveCurrentPhase(db, projectId)`, which reads
`projectphases` and falls through to Design when no row is active.

The correct model already exists and is dormant. `specificationphases` — `specificationid`, `phase`,
`enteredat`, `exitedat`, `approvedby`, `notes`, `blockers` — is declared, present in production, and
has **never been written**. `canTransition` in `core/orchestrator/transitions.ts` encodes the legal
moves and is referenced only by its own unit test.

This is a gate reading the wrong table while the right one sits empty. Mostly wiring: **no DDL, no
new routes.**

The full narrative, evidence and root-cause analysis live in the scope document. This spec carries
the implementation contract.

## Business Problem

Seven reports from three projects, 25 July – 4 August. Project `947a5614` has been pinned to Design
since 14 July with 95 scope documents, 11 specs, 108 tasks and **zero stage transitions ever logged**;
four kit upgrades changed nothing. In every case the build continued outside the tool, so the system
of record silently stopped matching reality.

## Actors

- Primary: A developer running a multi-scope project through the orchestrator, whose finished scope
  cannot move because a project-level stage that describes none of their scopes refuses the command
- Secondary: The assistant reading the board to decide what to do next; the Dev Cockpit and Kanban
  board, which render per-scope state nothing keeps current; support, who have hand-moved
  `projectphases` rows for two customers because no consumer-facing path exists

## Success Metrics

1. 0 manual database interventions across all 3 affected projects, within 30 days of release
2. 100% of active scopes carry exactly 1 open `specificationphases` row, up from 0 rows today
3. 0 new "stuck in Design" or project-level-gate reports for 30 days after release
4. 2 distinct refusal messages, asserted unequal by test, after 1 prior misdiagnosis

## Scope Boundary

Move the command gate from the project to the scope; wire `specificationphases`; advance a scope when
its last open task closes; separate the stage denial from the unknown-command rejection; reduce the
project stage to a derived rollup that gates nothing; adopt SCOPE-122's vocabulary.

## Out of Scope

Making `implement` generate code (the kit is a workflow engine, not an AI client). The dashboard
advance/reopen UI, which works — its June 500 is fixed. The `force` override policy. SCOPE-122's
vocabulary unification itself. Dropping `projectspecifications.phaseid`.

## Functional Requirements

Authoritative text and full acceptance criteria are in the scope document, §Functional Requirements.
Summarised here for traceability:

| FR | Requirement | Tasks |
|---|---|---|
| FR-001 | The gate resolves the stage of the scope being acted on | T001, T002 |
| FR-002 | `specificationphases` becomes the per-scope system of record | T003, T004 |
| FR-003 | Completing a scope's last open task advances that scope | T005, T006 |
| FR-004 | A stage refusal is actionable | T007 |
| FR-005 | An unknown command reports that it is unknown | T008 |
| FR-006 | The project stage is derived and gates nothing | T009, T010 |
| FR-007 | Existing projects are backfilled conservatively | T011 |
| FR-008 | Unscoped commands gate on a stated rule | T012 |
| FR-009 | One vocabulary, consumed not forked | T013 |
| FR-010 | The automatic advance respects the test gates (Amendment A, 2026-10-04) | T015 |
| FR-011 | A scope leaves Design when its tasks exist (Amendment B) | T016 |
| FR-012 | The advance keeps going while each stage is clear; no machine tests stops in QA (Amendment B) | T016 |
| FR-013 | `implement` also runs in QA and HumanTesting, for fix work (Amendment B) | T017 |

Cross-cutting verification: T014. The two MCP tools Amendment B needs (`project.scope_stage`,
`project.backfill_scope_stages`) are T018.

## Open Questions

None. Resolved by the product owner, 2026-10-04 (full text in the scope document, § Clarifications):

1. The FR-003 advance is a **shared service** called by the app's task service and the MCP tool, not
   a database trigger.
2. The project rollup stage is the **lowest** stage among its scopes.
3. The FR-007 backfill is an **explicit command** with a dry run first; never automatic on upgrade.
4. The automatic advance **respects the SCOPE-111 test gates** (new FR-010).

Amendment B, resolved at the start of implementation the same day (scope document, § Clarifications
5 to 8):

5. A scope leaves Design when createSpecs gives it tasks (FR-011).
6. The advance continues through every clear stage; a scope with no machine tests stops in QA (FR-012).
7. Scope-creating commands, `buildscope --edit` included, always run; that is FR-008's rule.
8. `implement` also runs in QA and HumanTesting, with no backward moves (FR-013).

Amendment C, resolved after the implementation review the same day (scope document, § Clarifications
9 to 11, plus the review fixes listed there):

9. A scope with no stage row is judged on its inferred stage, read-only; nothing is written until
   the backfill or the next task write (amends FR-002).
10. `createspecs` runs on a scope in any stage, so an amended scope can be re-pushed (amends FR-008).
11. Every test the scope owns blocks its own advance, forced or not; force keeps its SCOPE-111
    meaning for the dashboard's release gate (amends FR-010).
