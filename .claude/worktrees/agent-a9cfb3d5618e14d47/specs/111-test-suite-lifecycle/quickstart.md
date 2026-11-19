# Quickstart: Test Suite Lifecycle

**Spec**: 111 — Test Suite Lifecycle
**Scope**: SCOPE-111 (`specs/Project-Scope/111-test-suite-lifecycle.md`)
**Spec ID**: `f5552f9a-e581-46d1-8cdf-6e09569d1b22`
**Status**: planned
**Phase**: design
**Created**: 2026-07-25

---

## The shape in one paragraph

A **plan** per scope holds **items**. Each item names its **subjects** (the code it exercises), an
**executor** (machine or human) and an **origin** (ai or user). Machine items run during QA; human
items are written at the same time but released only when the release is promoted to UAT. A
**cycle** — one per application version — is what runs, results and signoffs belong to. Machine
signoffs never cross a cycle; human signoffs do, until a **Retest** mark says otherwise.

## Where to start reading

| To understand | Read |
|---|---|
| The whole intent | `specs/Project-Scope/111-test-suite-lifecycle.md` |
| What an item looks like | `_wxAI/skills/wxCreateTestPlan/references/test-item-schema.md` |
| The pattern the run tables copy | `src/db/schema/auditexecutions.ts`, `auditresults.ts` |
| The polling pattern the live view copies | `src/client/components/audit/AuditExecutionPanel.tsx` |
| Where the gate attaches | `src/server/services/PhaseService.ts` (`checkCompletion`) |
| What renders a blocked gate today | `src/client/components/Projects/PhaseCompletionBar.tsx` |

## The two rules most likely to be broken by accident

1. **Never add a second answer to "is this release clear?"** Everything asks `TestGateService`.
2. **Never implement a reset as a sweep.** Both resets are consequences of a query — a machine
   signoff carries a different cycle, a human signoff sits under an unanswered Retest mark. A batch
   mutation can half-complete; a query cannot.

## Gotchas

- A new MCP tool needs registering **twice** — the advertised list and `PERMISSION_MATRIX`. One
  without the other reports as an unknown tool at call time.
- There are **two migration directories** in this repository. Use absolute paths.
- All code is authored through the orchestrator so fences are written for you. Never hand-write a
  fence.
- Shipping is three channels: application, kit release, extension.
