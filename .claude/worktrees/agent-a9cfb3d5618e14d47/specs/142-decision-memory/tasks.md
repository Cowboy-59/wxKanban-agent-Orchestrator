# Task Breakdown: Decision Memory

**Feature**: Decision Memory
**Spec**: 142
**Date Generated**: 2026-10-23
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | T001 Spike: can a Stop hook catch a plain-text question and resume the agent (FR-006) | high | in_progress |
| 2 | T002 Ledger format and the owner-path ledger script (FR-001, FR-002) | high | in_progress |
| 3 | T003 Deny direct agent writes to decisions/ledger.yaml (FR-002) | high | done |
| 4 | T004 /wxLedger command: check, check --global, search, import (FR-004, FR-018) | high | done |
| 5 | T005 wxBrainstorm close writes the ledger (FR-003) | high | done |
| 6 | T006 Search interface, file-search backend, and the answer rules (FR-008) | high | done |
| 7 | T007 Keyword classifier and the 30-question labelled test set (FR-009) | high | done |
| 8 | T008 Ask Gate PreToolUse hook on AskUserQuestion, installed beside the impact hook (FR-005) | high | done |
| 9 | T009 Ask Gate on plain-text questions: Stop hook, or the fallback rule (FR-006) | high | done |
| 10 | T010 Blocker routing: decision queue, bridge room, or pass-through (FR-010) | high | done |
| 11 | T011 Assumption routing and decisions/assumptions.yaml (FR-011) | high | done |
| 12 | T012 Settings, observe and enforce modes, and the gate-log audit trail (FR-013, FR-014) | high | done |
| 13 | T013 Hook precedence fixture and live runs per permission mode (FR-012) | high | done |
| 14 | T014 G.O.D. consults the ledger and the run report lists ledger answers (FR-007, FR-015) | medium | in_progress |
| 15 | T015 Verify OpenViking: install, Windows support, API, license (FR-016) | high | done |
| 16 | T016 OpenViking backend: install script, detached launcher, namespaces, auth (FR-016) | medium | todo |
| 17 | T017 Fallback within 2 seconds and the health status line (FR-017) | high | done |
| 18 | T018 Global tier: seed from god-learnings, repo links, no cross-repo reads (FR-018) | medium | done |
| 19 | T019 minimal-code rule with on, lite, off (FR-019) | medium | done |
| 20 | T020 Kit sync keeps decisions/** and settings project-owned (FR-020) | medium | done |
| 21 | T021 Acceptance run: US1 to US8 end to end and the success metrics | high | in_progress |
| 22 | T022 Manual and help for /wxLedger, the Ask Gate, and OpenViking setup | medium | done |
| 23 | T023 Bridge delivers queued blockers to the room (FR-010) | high | done |
| 24 | T024 KAIN reply list and the review script: record, list, approve, change, reject (FR-022, FR-023) | high | done |
| 25 | T025 Bridge attributes DQ answers and KR verdicts by author; KAIN never reviews (FR-021, FR-023) | high | done |
| 26 | T026 Verdict posts to the room and the KAIN contract section (FR-024) | medium | done |
| 27 | T027 /wxLedger review, check lists pending replies, run report list, guard covers kain-replies.yaml (FR-023, FR-025) | medium | done |
| 28 | T028 Live test in a real project-agent room: owner answer, KAIN answer, review (Amendment A) | high | todo |

## Task Details

### T001 — T001 Spike: can a Stop hook catch a plain-text question and resume the agent (FR-006)

Before any FR-006 code: prove in a live Claude Code session that a Stop hook can read the agent's final message, detect a trailing question, block the stop, and hand back text that the agent continues from. Try it in default and bypassPermissions modes. Record the result (works / partly / no) with the exact hook output contract in specs/142-decision-memory/spike-stop-hook.md. If it fails, FR-006 is marked unmet and T009 ships the fallback rule instead.

### T002 — T002 Ledger format and the owner-path ledger script (FR-001, FR-002)

Define decisions/ledger.yaml (id, scope, question, decision, rationale, kind, evidence, source, approved_by, date, supersedes). Write the ledger script under _wxAI/askgate/ that is the ONLY writer: append-only, refuses an entry without approved_by, refuses edits or removals, writes a change as a new entry with supersedes. Plain Node, no dependencies.

### T003 — T003 Deny direct agent writes to decisions/ledger.yaml (FR-002)

PreToolUse handling for Edit, Write, MultiEdit, NotebookEdit and Bash redirections that target decisions/ledger.yaml: deny with a message naming the ledger script. Must hold in every permission mode, including bypass (live run evidence).

### T004 — T004 /wxLedger command: check, check --global, search, import (FR-004, FR-018)

Command file in _wxAI/commands/wxLedger.md and its .claude/commands mirror (byte-identical). check validates schema, duplicate ids and dangling supersedes; check --global scans the global tier for project names, paths and customer data; search uses the same ranking as the gate; import <record.md> extracts entries from a closed brainstorm record and writes nothing until the owner approves.

### T005 — T005 wxBrainstorm close writes the ledger (FR-003)

After an approved summary, wxBrainstorm writes one ledger entry per Agreed/Added/Changed/Declined item and parked/open items as evidence: unknown with an owner (named in the decision line: "Open: the owner answers." / "Open: the customer answers."), through the ledger script. Update every copy of wxBrainstorm (skill SKILL.md + references, _wxAI/commands/wxBrainstorm.md, .claude/commands mirror, any hosted prompt) and check them by md5. Nothing is written when the summary is not approved.

### T006 — T006 Search interface, file-search backend, and the answer rules (FR-008)

One search interface with a file-search backend over the repo ledger (read from the main repo path, never a worktree copy) then the global tier. Only Agreed/Added/Changed, owner-approved, not superseded, above gate.matchThreshold may answer; returns full text, ID and score; evidence: unknown entries come back as context only. Repo links honored from decisions/settings.yaml.

### T007 — T007 Keyword classifier and the 30-question labelled test set (FR-009)

Deterministic keyword classifier: blocker for security, client data or PII, money or cost, legal or compliance, irreversible actions, conflict with spec or ledger, and missing legacy evidence in conversion mode; otherwise assumption; unsure or empty means blocker. Ship a labelled set of at least 30 questions; the test fails on any blocker classified as an assumption.

### T008 — T008 Ask Gate PreToolUse hook on AskUserQuestion, installed beside the impact hook (FR-005)

Hook in _wxAI/askgate/ matching AskUserQuestion: run T006, then T007 on a miss. Extend the existing hook installer so it installs both hooks and a reinstall leaves exactly one of each. Live run in every permission mode.

### T009 — T009 Ask Gate on plain-text questions: Stop hook, or the fallback rule (FR-006)

If T001 proved the mechanism: Stop hook that answers a covered plain-text question and resumes the agent (US2). If not: ship a rule that agents run /wxLedger search before asking, and mark FR-006 unmet in the spec.

### T010 — T010 Blocker routing: decision queue, bridge room, or pass-through (FR-010)

In a --create run a blocker goes to the decision queue and its unit parks; with a live bridge session it also goes to the room; otherwise it passes through to the developer unchanged with one gate-log entry. An owner answer becomes a ledger entry through the ledger script (approved_by: owner).

### T011 — T011 Assumption routing and decisions/assumptions.yaml (FR-011)

On an assumption the gate tells the agent to pick the most reasonable default and continue, and appends question, default and agent to decisions/assumptions.yaml. The ledger is never touched.

### T012 — T012 Settings, observe and enforce modes, and the gate-log audit trail (FR-013, FR-014)

decisions/settings.yaml with gate.mode (observe default, enforce), gate.matchThreshold, minimalCode.level, links. Observe blocks nothing and logs would-have-answered, score and class. Every outcome appends one line to decisions/gate-log.jsonl (time, session, question, result); the log is append-only through the gate and ledger script. Switching mode needs no reinstall.

### T013 — T013 Hook precedence fixture and live runs per permission mode (FR-012)

Shared fixture where the SCOPE-137 impact hook and the Ask Gate fire on the same call; the impact decision always applies. Record live-run evidence in each permission mode, bypass included, not unit tests alone.

### T014 — T014 G.O.D. consults the ledger and the run report lists ledger answers (FR-007, FR-015)

In the hosted wxgod method (mcp-server/src/prompts/ only), G.O.D. runs the FR-008 search before adding a helper's question to the decision queue, and GOD-Run-Report.md lists every ledger-answered question with its ID and every assumption (both lists shown even when empty). Needs a hosted MCP deploy, probed after.

**Built 2026-10-23, deploy pending:** new-project.md N11 "Ledger first" and the run-report lists, wxgod.md output table, document-templates.md §§ 3a/3b. The search command the method names (`search.mjs "<q>" --root <root> --json`) was run against a test ledger and returned `answered` with the full entry. Left: the hosted MCP deploy (a push) and a probe of the served `wxgod` prompt.

### T015 — T015 Verify OpenViking: install, Windows support, API, license (FR-016)

Research before building: confirm OpenViking's install steps on Windows, its local API for namespaced add/search, authentication, and its license terms (AGPLv3 + no rewrite). Record findings in specs/142-decision-memory/research.md. If it cannot run locally on Windows, stop and report before T016.

### T016 — T016 OpenViking backend: install script, detached launcher, namespaces, auth (FR-016)

Kit script that installs/starts OpenViking as a separate local service (never bundled), spawned detached, with authentication and one namespace per repo plus a global namespace. Only ledger entries and approved patterns are indexed, never code. Implements the T006 search interface as a second backend. License check: no OpenViking code in the kit.

**Reopened 2026-10-23** (spec Clarification 13): a live probe of v0.4.18 showed the install script cannot produce a working service. The image ignores `ROOT_API_KEY` and waits for `/app/.openviking/ov.conf` (mount `~/.openviking`, or `OPENVIKING_CONF_CONTENT`), which must name an embedding provider. To do: the owner picks the embedding option (cloud API, local Ollama, or the ~24 MB local CPU embedding); write ov.conf from the install script; then verify the auth header, namespace field, add-by-path and the search hit shape against the running service, and run US5 live.

### T017 — T017 Fallback within 2 seconds and the health status line (FR-017)

If the service does not answer inside the 2-second budget, use the file-search backend. The hook status line shows the service up, or down with the fallback in use (US6). 95% of gate decisions inside 2 seconds.

### T018 — T018 Global tier: seed from god-learnings, repo links, no cross-repo reads (FR-018)

Global tier of owner-approved general patterns seeded from ~/.wxai/god-learnings.md; new patterns only through wxBrainstorm's approved learnings step. Without an owner link in decisions/settings.yaml, no repo's ledger is readable from another (US5).

### T019 — T019 minimal-code rule with on, lite, off (FR-019)

_wxAI/rules/minimal-code.md adapted from Ponytail with the MIT attribution, cross-referencing search-before-suggest.md. minimalCode.level defaults to on; conversion work runs at lite (footer kept, nothing skipped when legacy behavior is unclear); G.O.D. may set it per run.

### T020 — T020 Kit sync keeps decisions/** and settings project-owned (FR-020)

Classify decisions/** and the gate and rule settings as project-owned in kit sync so an upgrade never overwrites them; ship the new kit files (_wxAI/askgate/, wxLedger command, minimal-code rule) through the sync allowlists. Test: a populated decisions/ folder is byte-for-byte unchanged after an upgrade.

### T021 — T021 Acceptance run: US1 to US8 end to end and the success metrics

Run US1-US8 against a real repo in observe then enforce mode; capture the baseline (US7), the replay check for wrong answers (SC-2), the classifier set (SC-3), timing (SC-4), permission-mode coverage (SC-5), and agent-write denial (SC-6). Endpoint-test every claim; unit green alone is not done.

### T022 — T022 Manual and help for /wxLedger, the Ask Gate, and OpenViking setup

Add the user-facing help: what the ledger is, how the gate answers, observe vs enforce, how to install the memory service, and the minimal-code levels. Add the /wxLedger entry to the Cockpit help catalog.

### T023 — T023 Bridge delivers queued blockers to the room (FR-010)

Added 2026-10-23 after verification found that blockers queued in .wxai/room-outbox.jsonl never reached the room. The Remote Session Bridge (wxkanban-agent/apps/remote-bridge/src/outbox.ts, wired in bridge.ts) polls the outbox every 2 seconds while connected and posts each line through post(), oldest first; failed lines are put back in order; torn lines are dropped. Edits to bridge.ts (SCOPE-134 code) were approved by the owner. Test: wxkanban-agent/tests/unit/bridge-outbox.test.ts.
