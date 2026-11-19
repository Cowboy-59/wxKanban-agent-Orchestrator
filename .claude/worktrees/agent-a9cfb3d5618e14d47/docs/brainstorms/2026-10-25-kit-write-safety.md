# Brainstorm: Kit writes that are not safe to repeat (the Oct 19 kit defects)

- **Status:** closed
- **Opened / last updated:** 2026-10-25 / 2026-10-25
- **Source:** customer report package received 2026-10-25 (a customer team's workflow analysis, a "lockdown runbook" for their Claude Code sessions, and a full session export, 14 Aug – 25 Oct 2026); feedback reports `0c395650`, `d493cadd`, `975ada4a`, `07107d2d`, `532e34a3`, `78db3b03`, `8a5cd85b`, `be80de13`
- **Asked for by:** one three-person customer team directly; the same defects appear in 48 feedback reports from 14 companies since June (22 still open, from 7 companies)
- **Level:** senior
- **Next item:** —

## The request

The customer team believed wxKanban was a two-way, versioned hub for their specs. It is push-only: each
laptop pushes up, the last push wins, nothing comes back down. On 2026-10-19 their Claude session hit
several kit defects in one morning: `dbpush --help` ran a real push (about 45 duplicate documents created,
about 20 overwritten), documents matched by title so every changed heading made a copy, `create_specs`
took over scope number 035 (created from the web app) and renamed it, and `/buildscope --edit` needed every
requirement re-sent to change one line. Their lead has since written a runbook so their own tooling
enforces the workflow. This topic covers the defects (group 2 of 3); the push-only model (group 1) and the
runbook (group 3) are separate topics.

## What already exists

| Item | Status | Evidence | Confidence |
|---|---|---|---|
| `--help` after a command runs the command | Built (defect) | `wxkanban-agent/apps/command-gateway/src/cli.ts:341-357` turns `--help` into an option and dispatches; `wxkanban-agent/dbpush.ts:1039` ignores unknown options. Not reported as feedback; hit wxKanban itself on 2026-10-25 too | Confirmed |
| Document identity is the title | Built (by design) | `mcp-server/src/server.ts:820-831` matches project-level docs on (doctype, title); dbpush stores spec/plan/tests with no spec link. `975ada4a` resolved 07-26, recurred as `07107d2d` 10-19; `d493cadd` triaged | Confirmed |
| Delete-document tool | Not built | `mcp-server/src/auth/role-checker.ts:93` permission entry only, no handler; `0c395650` open since 07-26; no web-app action found (routes with "doc" in the path only) | Confirmed (tool) / Likely (web app) |
| `create_specs` takes over a number another scope owns | Built (by design, SCOPE-124 T008) | `mcp-server/src/server.ts:3314-3330` updates whichever row owns the number; `532e34a3` | Confirmed |
| `/buildscope --edit` ignores requirements | Built (defect) | `78db3b03`, `8a5cd85b`; probed live 2026-10-22 | Likely (not re-probed) |
| SCOPE-124 already owns the write path | Partly built | FR-005 "every write path is idempotent" marked done but failing in the field; FR-008 half done; T015 "will not do"; open question 2 (unique index vs code) unanswered | Confirmed |
| Guard hooks shipped with the kit | Proposal | `be80de13` (triaged) — group 3 | Confirmed |
| Earlier brainstorm on this | Not found | `docs/brainstorms/` titles | Likely |

**What changing it would reach:** `cli.ts`, `dbpush.ts`, `server.ts` → 192 affected files across ~35 scopes,
almost all through `server.ts`; every fix there stays narrow and goes through the Change Impact boundary.

## Panel

Spoke: Lead Architect (chair), Domain Analyst, Backend, Database, Security, QA, Migration, DevOps,
Documentation, Frontend · Sat out: Legacy

## Decisions

| # | Item | Decision | Kind | To scope? | Date |
|---|---|---|---|---|---|
| 1 | The need behind the request | Every kit write must be **repeatable** (the same files twice change nothing), **contained** (it touches only what it names) and **loud** (anything unexpected stops before writing). This is the acceptance bar for the whole topic. | Agreed | yes | 2026-10-25 |
| 2 | Who it affects | Every kit user (48 reports, 14 companies since June; 22 open from 7), worst for multi-developer teams and unattended AI sessions. Fixes must hold when Claude is typing, not rely on people remembering. Every company with an open report on these defects gets a note when it ships. | Agreed | yes | 2026-10-25 |
| 3 | Reuse or build new | No new scope. SCOPE-124 Amendment C (5b, 5c, 5d, 5f; reopen FR-005 and FR-008), a SCOPE-135 amendment (5e), SCOPE-019 (5a). | Agreed | yes | 2026-10-25 |
| 4 | Smallest useful version | No phased first version: everything in 5a–5f ships. | Changed | yes | 2026-10-25 |
| 5 | 5a — `--help` / unknown options | `--help` or `-h` anywhere prints that command's help and never runs it (gateway, every command). An unknown option on a write command is refused before any network call, naming the valid options (dbpush's parser; server write tools reject unknown fields). | Agreed | yes | 2026-10-25 |
| 6 | 5b — spec numbering and the number takeover | Every spec is numbered from its scope, `<scope>-0001`, `-0002`…, even when there is only one, so adding a spec never renumbers one. Scope numbers are allocated by the hub. A push never writes over a number another scope owns (refuse, naming the owner and the next free number). The hub's spec id is the identity underneath, written into the local spec on first create. Renames are explicit. New scopes only; existing numbers unchanged. Reaches every kit parser of spec numbers (dbpush, fences/auditfences, Cockpit, stage tools). | Changed | yes | 2026-10-25 |
| 7 | 5c — documents identified by title | A document's identity is (spec id, kind), kind from the file name (`spec.md`, `plan.md`, `tests.md`), never the heading; titles are display-only and update in place. Unique index on (project, spec, kind) — answers SCOPE-124 open question 2 (new column is a manual schema change the owner applies). Existing duplicates are found automatically, never deleted automatically: the kit asks the project's user whether to run a cleanup; on yes it shows the keep/retire list (the copy matching the local file kept), the person confirms, and all are fixed in one pass. A heading-change push becomes a permanent regression test. | Agreed | yes | 2026-10-25 |
| 8 | 5d — delete document | Allowed, as **retire**: soft (who, when, why), hidden from lists and reads, restorable by an admin. One shared service behind the MCP `project.delete_document` (admin, dry run first), a web-app Retire action for admins, and the 5c cleanup. Before anything is retired the user is shown what it affects, per document (its scope/spec, the tasks linked to it, whether it is the last copy of its kind, whether it matches the local file), verifies, then confirms. Every retire and restore is audited. SCOPE-124 T015 "will not do" is reversed openly with this as the reason. | Agreed | yes | 2026-10-25 |
| 9 | 5e — `/buildscope --edit` | Edit mode carries functional requirements and user scenarios. Edits are per named item (add / replace / remove an FR, user scenario or acceptance line); everything not named stays byte-identical, checked by the tool. Every edit shows a before/after diff and writes nothing until confirmed. Edits work on the current local file and refuse when the stored copy is newer. Each amendment is recorded automatically in the scope's amendment log (date, reason, replaced text). | Agreed | yes | 2026-10-25 |
| 10 | 5f — why "resolved" reports came back | A report is "resolved" only after a live probe of the deployed hub reproduces the customer's original steps and passes (probe and version in the note). Every fix ships a regression test on the real path the customer used (CLI/MCP, not mocks), shown to fail without the fix. One contract suite for the three properties over all write tools, in CI and the nightly run. A recurrence reopens and links the original report. Restoring CI comes first. | Agreed | yes | 2026-10-25 |
| 11 | Fit and priority | Now, top priority, one batch. Build order inside it: CI restored → document-kind column (owner applies) → number and identity guards → retire and cleanup → surgical buildscope edits → new spec numbering → contract suite. Clients (kit, Cockpit) before the server. | Agreed | yes | 2026-10-25 |
| 12 | Undo, version history, pull-down of web-created scopes | Group 1 topic (push-only model). | Parked | no | 2026-10-25 |
| 13 | dbpush defaults to a dry run | Group 3 topic (what the product should provide from the customer's runbook). | Parked | no | 2026-10-25 |
| 14 | `DELETE /api/audit/documents/:id` | Deletes platform-wide compliance documents (`wxkanbandocuments`, no tenant column) with only a login, no admin check (`src/server/routes/audit.ts:250`; untested live). Its own urgent security topic, ahead of this batch. | Parked | no | 2026-10-25 |

## Open items

- Group 1 topic: push-only model, undo and version history, bringing web-created scopes down to laptops.
- Group 3 topic: the customer's runbook (CI as the single writer, dev environments, fixed Claude rules), and dbpush defaulting to a dry run.
- Urgent security topic: the audit-route delete (row 14).

## Next step

Owner: record, then run G.O.D. → `/buildscope` (SCOPE-124 Amendment C, SCOPE-135 amendment, SCOPE-019) → `/createSpecs` → `/implement`.
