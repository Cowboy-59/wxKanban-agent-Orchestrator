# Quickstart: Feedback Queue Hygiene

**Spec Number**: 110
**Scope**: [SCOPE-110](../Project-Scope/110-feedback-queue-hygiene.md)

## Setup

1. Review the spec: `specs/110-feedback-queue-hygiene/spec.md`
2. Review the plan (build order + gates): `plan.md`
3. Review tasks: `tasks.md`
4. Review tests: `tests.md`

## Development

Route every task through the orchestrator so code fences are generated:

```bash
# per task, in order
implement 110/T001   # schema (both DBs) — withhold the unique index
implement 110/T002   # FR-008 fingerprint fix (MODIFIED-BY on the SCOPE-061 fence)
...
implement 110/T006   # FR-012 merge  ── must precede ──▶
implement 110/T007   # FR-009 unique index
```

Then: write tests per `tests.md`, run `npm run test`, mark tasks done with `/task-done <task-id>`.

## Critical ordering & environment gates

- **T006 before T007**, and **both applied to both databases** (app PostgreSQL + hosted MCP PostgreSQL). Applying the unique index to un-merged data fails loudly by design.
- **T001 both DBs** — the submitter MCP tool (T011) writes columns that must exist in the hosted MCP DB.
- **No push until the operator says so** — migrations hit prod DBs and a push deploys the hosted MCP.

## Verification

1. Run the test matrix (`tests.md`) — every success metric must have a passing assertion.
2. `wxkanban-agent auditfences` — exit 0, no un-fenced declarations from this work.
3. Confirm the auto backlog fell to ≤10 with rows == distinct identities per project.
