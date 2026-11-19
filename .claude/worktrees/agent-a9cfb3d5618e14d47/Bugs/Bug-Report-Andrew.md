# wxKanban — Issue Report (MCP / CLI gaps blocking implementation)

**Reporter:**  Andrew Mathieson-Blakely ·**Date:** 2026-07-19
**Project:**  Proactive By DDES —`da4eebf4-eb6d-4a8d-9694-2b2e6292702b`
**MCP server:** `mcp-project-hub` v`0.1.0` (`project.mcp_health` ) · hosted MCP · CONSUMER project
**Scale:** 31 specs (`0012`–`0042` ), 129 tasks, 99 documents — all imported via `project.create_specs`  +`project.create_task`

**Summary:**  Tasks created through the MCP cannot be associated with a spec, and there is no repair path. The Dev Cockpit therefore reports**zero work against all 31 modules** , and no spec can satisfy the documented implementation gate. Three related gaps and one scalability issue are detailed below.

---

## Issue 1 — `create_task` cannot link a task to a spec, and there is no recovery path ⭐ (primary)

**What happens.** `project.create_task`  accepts`projectId, title, descriptionMarkdown, status, priority, documentIds, assignee, dueDate, sourceEventId`  — there is**no `specId` parameter** . Tasks created with it are permanently unassociated with any spec.

The only tool that binds tasks to a spec is`project.create_specs`  via its`tasks[]`  array — and`create_specs`  is**create-only**:

> `create_specs blocked: spec 0012 already exists in this project (id 38166be6-…). Refusing to create a duplicate.`

So once a project's specs exist, there is**no supported way** to create or re-parent a spec-linked task.

**Evidence.**
- `project.cockpit_summary`  returns, for**all 31**  scopes:`"remainingCount":0,"tasks":[]`  — while its`unlinkedTasks` array holds all 129 tasks.
-  Task objects returned by`project.list_open_items`  contain no`specId`  field at all (only`documentIds`).
- `project.link_doc_to_task`  does**not**  fix it — we linked task`8e45a8cf-…`  (M00-01) to the spec document`27cb46a2-…`  (which itself carries`specId` ); the link succeeded, but the task remained in`unlinkedTasks`  and`0012`  still reported`remainingCount: 0`. So Cockpit grouping is not resolved via the document.
- `dbpush`  cannot help (see Issue 3), and the`wxkanban-agent` CLI uses the same MCP surface (`core/orchestrator/mcp-client.ts`  is a generic `callMcpTool`), so it has no privileged path either.

**Impact.**  The Dev Cockpit — the intended management view — shows no work against any module, so progress is invisible. Combined with Issue 2, no spec can be implemented through the governed flow.

**Requested fix (any one would unblock):**
1.  Add`specId`  to`project.create_task` ;**and/or**
2.  Add a`project.link_task_to_spec`  (or a general task-update tool that can set`specId` );**and/or**
3.  Allow`project.create_specs`  to operate in update/upsert mode for an existing`specNumber`  (at minimum to (re)create and link its`tasks[]` );**and/or**
4. Document a supported repair procedure (e.g. whether specs can be deleted so a project can be cleanly re-imported).

---

## Issue 2 — No way to transition a spec's status

All 31 specs report `"status":"planned"`. The documented implementation gate (`_wxAI/commands/wxAI-implement-gate.md` ,`_wxAI/rules/projectrules.md` ) requires spec status ∈`tasks_generated`  |`in_progress`  |`ready_for_implementation` , and explicitly lists`planned` as invalid.

The MCP surface exposes only `project.update_task_status` (**task** -level). There is no spec/scope status or stage transition tool, and none exists in the CLI orchestrator either.

**Result:**  a spec can never leave`planned` via the supported tooling, so the gate can never pass.

**Requested fix:** expose a spec status / lifecycle-stage transition tool (or document which tool is intended to advance it).

---

## Issue 3 — `dbpush` would create a duplicate document set on existing specs

`wxkanban-agent/dbpush.ts`  branches: new spec →`pushNewSpec`  (calls`create_specs` , links tasks); existing spec →`pushExistingSpec` , which upserts**documents only**  with`tasksCreated`  hardcoded to`0`.

Worse, `pushExistingSpec` upserts with:
- `doctype: 'specs'` , title`Spec {NNNN} — {featureName}` (em-dash)

whereas documents created by `create_specs` are stored as:
- `doctype: 'spec'` , title`Spec {NNNN}: {featureName}` (colon)

Since `upsert_document`  matches on`(projectId, doctype, title)` , running`dbpush`  against an already-imported project**creates a parallel set of 31+ documents** instead of updating the existing ones — while still linking zero tasks.

**Requested fix:**  align`pushExistingSpec` 's doctype/title with what`create_specs`  writes, or match on`specId` rather than title.

---

## Issue 4 — Large read endpoints have no filtering or pagination (scalability)

On a modestly sized project both primary read tools exceed MCP client result limits on**every** call:

| Tool | Payload | Filtering available |
|---|---|---|
| `project.cockpit_summary`  | ~58,000 chars |**None**  — accepts only`projectId` |
| `project.list_open_items`  | ~140,000 chars |`maxItems`  (caps at 100),`status` ,`since`  — but still returns all documents**with body previews** |

This makes routine questions ("what is spec 0012's status?") require fetching the entire project and post-filtering client-side.

**Requested fix:**
- `cockpit_summary` : accept a`specNumber`  /`specId` filter to return a single scope.
- `list_open_items` : add offset/cursor pagination, a category selector (tasks | documents | events), and a flag to omit document`preview`/body text.

---

## Environment notes
- `project.check_for_updates`  returns`currentVersion: "0.0.0"` ,`latestVersion: null` ,`error: "Could not fetch latest release"` — the update check appears non-functional.
- `project.kit_status`  returns`kitVersion: null`.
- `_wxAI/commands/wxAI-implement.md`  (a protected, read-only governance file in consumer projects) ships with an**unresolved git merge conflict** (`<<<<<<< HEAD`  /`>>>>>>> origin/014-sysadmin-platform-admin`).

## What we need most
Confirmation of a **supported path to associate our existing 129 tasks with their specs**  — either a new/updated tool, or permission + procedure to delete the 31 specs so we can re-import cleanly. We hold all source data locally (reconciled scope bodies and per-spec`tasks.md` ), so a clean re-import via`create_specs`  with`tasks[]` is viable if deletion is possible.