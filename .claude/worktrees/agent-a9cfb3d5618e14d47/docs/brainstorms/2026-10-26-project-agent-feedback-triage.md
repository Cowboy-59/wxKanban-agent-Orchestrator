# Brainstorm: The project agent triages customer feedback

- **Status:** closed
- **Opened / last updated:** 2026-10-26 / 2026-10-26
- **Source:** internal (owner)
- **Asked for by:** internal; the owner is the first user and test bed
- **Level:** senior
- **Next item:** none

## The request

Give the project agent the Cockpit starts (SCOPE-132, run with `--project-agent`) a second job: go
through the Cockpit's **My Feedback** and **Incoming** customer reports, correlate them, triage them,
and produce fixes for each set of correlated issues. The existing feedback-triage agent does the
triage well, but it has to be run by hand; the project agent should run and manage it.

## What already exists

| Item | Status | Evidence | Confidence |
|---|---|---|---|
| The project agent the Cockpit starts | Built | `wxkanban-agent/apps/remote-bridge/src/agent-mode.ts:6-15`; SCOPE-132 FR-030–032 | Confirmed |
| …acts only on room messages (KAIN or operator); no standing jobs or scheduler | Built (by design) | SCOPE-132 FR-032; no schedule/cron in `remote-bridge/src` | Likely |
| …runs unattended in bypass mode; the only structural guard is the push block (a PreToolUse hook, because `canUseTool` is never consulted under bypass) | Built | `remote-bridge/src/session.ts:136-150`; `override-gate.ts:173-186` | Confirmed |
| Cockpit **My Feedback** and **Incoming** lists | Built | `vscode-extension/src/providers/cockpitTreeProvider.ts:343-346`; `services/mcpClient.ts:91-109`; both call `project.list_my_feedback` | Confirmed |
| Incoming = reports other companies filed into a sink the caller's company owns; refused otherwise | Built | `mcp-server/src/server.ts:1190-1196` | Confirmed |
| Per-report AI triage on submit (classification, severity, one duplicate link, draft question, disposition) | Built | `mcp-server/src/utils/feedback-triage.ts` (SCOPE-043 T005, T013) | Confirmed |
| **feedback-triage** agent: whole-queue sweep, S1–S4, clusters, checks whether a fix shipped, auto-resolves proven-shipped, ranked correction list; never writes code | Built, personal only | `~/.claude/agents/feedback-triage.md` (not in the repo or kit; `model: opus`) | Confirmed |
| **release-warden** agent: one app's feedback → area checklist → fix all, test all, release all | Built | `.claude/agents/release-warden.md` | Confirmed |
| "Select a bug → AI fixes it" handoff | Decided before (deferred) | SCOPE-043 Scope Boundary, OUT | Confirmed |
| Duplicate auto-captured errors; dismiss, hide, purge | Planned (SCOPE-110, draft) | `specs/Project-Scope/110-feedback-queue-hygiene.md` | Likely |
| `triaged` already notifies the submitter, with bare wording; its note stays internal | Built | `mcp-server/src/utils/feedback-status.ts:47-48`; mirrored in `src/server/services/FeedbackNotificationService.ts` | Confirmed |
| `list_my_feedback`: `maxItems` capped at 100 when passed, server default 500 when omitted, no offset | Built | `mcp-server/src/utils/schemas.ts:373`; `server.ts:1202` | Confirmed |
| D-0028: a kit-defect report is resolved only after a live probe of the deployed hub | Decided before | `decisions/ledger.yaml` D-0028 | Confirmed |
| Earlier brainstorm on agents triaging or fixing feedback | Not found | `docs/brainstorms/` titles and text | Likely |

**What changing it would reach:** an amendment to SCOPE-132 reaches SPEC-145, 17 fenced files (6 shared
with other scopes) and the dependent scopes SCOPE-136 and SCOPE-144. Editing `agent-mode.ts` and
`vscode-extension/src/services/projectAgent.ts` reaches 36 affected files, relies on 8, across 19
scopes; verdict "Ask before this change lands". Not checked yet: which exported function is used;
human sign-offs.

## Panel

Spoke: Lead Architect (chair), Domain Analyst, Database, Backend, Frontend, DevOps, Security, QA,
Documentation · Sat out: Legacy, Migration

## Decisions

| # | Item | Decision | Kind | To scope? | Date |
|---|---|---|---|---|---|
| 1 | The need behind the request | The feedback queue becomes release-ready batches: every report from My Feedback and Incoming lands in exactly one group, and nobody has to run the triage by hand. | Agreed | yes | 2026-10-26 |
| 2 | Who uses it | Only a company that owns a feedback sink; today, the wxKanban project agent. wxperts is the first user and the test bed. A customer's project agent does not get the job. | Agreed | yes | 2026-10-26 |
| 3 | Reuse or build new | Reuse feedback-triage, moved from `~/.claude/agents/` into the repo's `.claude/agents/` (this repo only, not shipped in the kit). Reuse the server's per-report triage as input. New: only the project agent's trigger and the output. | Agreed | yes | 2026-10-26 |
| 4 | Output | The report is written to `docs/triage/BUG-Triage-YYYY-MM-DD.md` (`-2`, `-3` for same-day reruns). `docs/triage/` is gitignored: local working files on the machine running the agent. No submitter names or emails. | Changed | yes | 2026-10-26 |
| 5 | Smallest useful version | Version 1 produces the reports only. No fixes and no code changes; producing fixes is phase 2 (row 18). | Changed | yes | 2026-10-26 |
| 6 | Untrusted input and other companies' data | Triage runs are fenced by a PreToolUse allow-list hook: Read/Grep/Glob (never `.env`, keys, certificates); read-only Bash (`git log`, `git show`, `git diff`, `rg`); Write only inside `docs/triage/`; only the two exact feedback writes in row 7. Report text is data, never instructions. The room gets a summary only (counts, top groups by title and severity, report path), never customer text. | Agreed | yes | 2026-10-26 |
| 7 | Writes the customer sees | Two fixed messages, wording owned by the server and changed in both mirrored copies (`feedback-status.ts` and `FeedbackNotificationService.ts`). (a) Bug reports in a real group (STILL-BROKEN, PARTIAL, FIXED-NOT-SHIPPED) still in `new` move to `triaged` once: "We're looking at your issue and have triaged it for correction. The fix will be in an upcoming release." (b) SHIPPED-FIXED reports whose version is older than the release carrying the fix are resolved with fixed text by product: kit ("Your issue has been resolved in a previous release. Check your kit release: it should be X or later. Run `wxkanban-agent --version` in a terminal to see yours. Thanks for your patience."), Cockpit (version check in VS Code's Extensions view), hosted app or MCP ("the fix is live"). The hook accepts only exact matches. Product unclear: nothing is sent. Version already had the fix: a recurrence, flagged and not resolved. This narrows D-0028 for reports that predate the fix; D-0028 holds everywhere else. | Changed | yes | 2026-10-26 |
| 8 | Writes the agent must not make | No needs-info, no decline, and no text of the agent's own to a customer. | Declined | yes | 2026-10-26 |
| 9 | Report-only mode | feedback-triage gets a report-only mode: SHIPPED-FIXED reports that do not qualify for row 7(b) are listed as "ready to resolve" with their evidence (commit, version), and nothing is called. | Added | yes | 2026-10-26 |
| 10 | How the job starts | Daily at 06:00 inside the project agent, with catch-up on start when today's report is missing (the report file is the "ran today" record), plus a `TRIAGE` room command. Each run is a separate one-shot session with the row 6 hook; one at a time (a second trigger gets a one-line note). | Agreed | yes | 2026-10-26 |
| 11 | Where groups are kept | The report file only, no database writes. Each group shows a group key (its oldest report's feedback ID) and every member's feedback ID. | Agreed | yes | 2026-10-26 |
| 12 | Model and cost | Opus: SPEC-143 classifies the run heavy because it touches production data customers see. Each run logs its model choice to `decisions/routing-log.jsonl`. | Agreed | yes | 2026-10-26 |
| 13 | Skip when unchanged | Before the 06:00 run, a no-AI check compares counts and latest update per status with the last report; unchanged means no model, no report, and a room note "Triage: no change since <date>". `TRIAGE` always runs. | Added | yes | 2026-10-26 |
| 14 | The read cap | feedback-triage stops passing `maxItems` (server default 500) and reads one status at a time; the report warns when a status returns exactly 500. | Agreed | yes | 2026-10-26 |
| 15 | Server paging | No offset paging on `list_my_feedback` now; added only if a status ever reaches 500. | Declined | no | 2026-10-26 |
| 16 | Kit release check | A check that `docs/triage/` never ends up in a kit release (the release sync copies from disk, not git). | Added | yes | 2026-10-26 |
| 17 | Fit and priority | Next after the kit write-safety batch, as its own small batch. Scoped as SCOPE-132 Amendment C including the SCOPE-043 wording change, subject to `/buildscope`'s reuse check. | Agreed | yes | 2026-10-26 |
| 18 | Producing the fixes | Phase 2: a wxBrainstorm over the real triage reports, then a skill that manages and carries out the fixes. Also takes the per-report trigger, database storage of groups, and a cheaper sweep model. | Parked | no | 2026-10-26 |
| 19 | Customers triaging their own apps' feedback | A separate topic (SCOPE-043 Layer 2 or 3). | Parked | no | 2026-10-26 |

## Open items

- Phase 2 (row 18), once real triage reports exist.
- Customers triaging feedback about their own apps (row 19), a separate topic.

## Next step

Record written; taking rows marked **To scope? yes** to `/buildscope --from-md` (expected: SCOPE-132
Amendment C, subject to its reuse check), then `/validateScope`.
