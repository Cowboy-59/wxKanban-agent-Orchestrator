# Quickstart: MCP Task Spec Linking

**Spec**: 101 | **Scope**: SCOPE-101 (incl. Amendment A)

---

## The one-line version

`dbpush` cannot sync. Every run is an insert. Do not run it live until T007 lands.

## Why

`phase2Compare` in `wxkanban-agent/dbpush.ts` builds its set of known specs like this:

```ts
const scope = t.specNumber ?? parseScopeFromTaskTitle(t.title);
```

Both halves fail. `project.list_open_items` publishes **no `specNumber` field** (measured: 0 of 100
task rows), and task titles carry no scope number — they read `"T011: Transitional mitigation…"`.
So `knownSpecNumbers` is empty, `isNew` is true for every spec, and everything routes to
`pushNewSpec`.

## What to do instead, today

Sync via targeted MCP calls:

| Need | Tool |
| --- | --- |
| Task status | `project.update_task_status` (ids from `project.cockpit_summary` with `specNumber`) |
| Missing task | `project.create_task` with `specId`, then `project.link_task_to_spec` to confirm |
| Spec phase | `project.update_spec_status` |
| Scope/spec document | `project.upsert_document` |
| Audit trail | `project.capture_event` |

`cockpit_summary` lists only **incomplete** tasks — a task you just set to `done` correctly
disappears from it. That is also why `cockpit_summary` cannot be the sole source for T007.

## Where the work lands

- **`wxkanban-agent/dbpush.ts`** — T007, T009, T010, T011. Kit source; reaches consumers only via `sync-to-orchestrator --release`.
- **`mcp-server/src/server.ts`** — T008. Hosted MCP; reaches production on a push to `main`.

## Before you call this done

Run it. `dbpush --dry-run --spec 112` must report `updated: 1 / created: 0`. Unit tests passing is
not sufficient evidence in this repo.

## Related

- Scope: `specs/Project-Scope/101-mcp-task-spec-linking.md` (Amendment A at the foot)
- Prior art: the defect was filed as feedback three times and never scoped — `7d581603` (2026-07-22, names the exact root cause), `ac139158` (2026-07-25), `975ada4a` (2026-07-26)
