# Spec 142: Decision Memory

## Overview

# Scope 142: Decision Memory

**Scope Number**: 142
**Status**: `draft`
**Created**: 2026-10-23
**Depends On**: SCOPE-136 (decision queue, run report), SCOPE-137 (hook pattern and installer), SCOPE-102 (bridge room)
**Source**: `specs/Project-Scope/142-decision-memory.md`

## Overview
Decision Memory lets a developer run several AI agents without answering the same question twice. Owner-approved decisions are kept in an append-only ledger in each repo, and approved general patterns in a global tier every repo can search. An Ask Gate catches an agent's question (the question tool, plain text, or a G.O.D. helper) and answers it from an approved decision when one exists; otherwise it routes a blocker to a person and logs anything else as an assumption for review. Search runs on a local OpenViking service with a file-search fallback. The gate starts in observe mode to set a baseline and is switched to enforce per project. An optional minimal-code rule ships with it, on by default and lite in conversion. A developer with more work than one agent can do wants several agents running at once. Today every agent stops to ask questions that an earlier wxBrainstorm or an earlier answer already settled: brainstorm records are prose, and nothing makes an agent check them before asking. Each repeat question costs the developer attention and stalls that agent, and the cost grows with the number of agents. Corrections given in chat are lost between sessions, models and repos. The need: no agent asks a question an owner-approved decision already answers, approved knowledge is reusable from any repo without leaking one repo's decisions into another, and nothing is ever answered on the owner's behalf except from a decision the owner approved. This scope covers Append-only Decision Ledger per repo (decisions/ledger.yaml), written only through an owner-approved path (wxBrainstorm close, owner reply to a queue item, /wxLedger import after approval). /wxLedger command: import, check, search. Ask Gate with three intercept points: PreToolUse hook on AskUserQuestion; Stop hook on plain-text questions (proven by a spike first); the G.O.D. return-the-question path under --create. Answer rules: repo ledger (main repo path) then global tier; only Agreed/Added/Changed, owner-approved, not superseded, above the match threshold; full text and ID returned. Deterministic keyword classifier: blocker vs assumption, failing closed. Blocker routing (decision queue / bridge room / pass-through to the developer) and assumption logging (decisions/assumptions.yaml). Observe and enforce modes per project (default observe), append-only gate audit log, run-report listing. Local OpenViking service (separate, documented install, namespace per repo, authentication, no code stored), file-search fallback within 2 seconds, health line. Global tier of owner-approved general patterns, seeded from ~/.wxai/god-learnings.md; cross-repo reads only by explicit owner link. Optional minimal-code rule adapted from Ponytail (on/lite/off; default on; lite in conversion). Kit sync treats decisions/ and the gate and rule settings as project-owned. The SCOPE-136 amendment: parallel entry point outside --create, Orca worktree scripts, day/night windows and operator presence, the status file and the Cockpit Parallel Agents panel (sibling hand-off). Model router, provider policy, free-claude-code proxy and active-time metering (Topic 2, separate brainstorm). CockPit ledger mirror, question-queue views, learning-inbox UI, customer queue policy (deferred). Multi-machine access to the memory service and the Workbench multi-machine dispatch. A local model classifier (v1 is keyword-based). Remediation of a .env reportedly tracked in the public kit repo (separate urgent task). Any change to push, deploy, schema or production-data approvals.

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actor** | Developer / owner running several AI agents on one machine |
| **Secondary Actors** | AI agents (Claude Code sessions and G.O.D. helpers), wxBrainstorm (writes decisions at an approved close), wxG-O-D (consults the ledger; sets the minimal-code level per run), SCOPE-102 Remote Session Bridge (relays blockers to the room, phone and wxHub) |
| **Key Value** | A developer with more work than one agent can do wants several agents running at once. Today every agent stops to ask questions that an earlier wxBrainstorm or an earlier answer already settled: brainstorm records are prose, and nothing makes an agent check them before asking. Each repeat question costs the developer attention and stalls that agent, and the cost grows with the number of agents. Corrections given in chat are lost between sessions, models and repos. The need: no agent asks a question an owner-approved decision already answers, approved knowledge is reusable from any repo without leaking one repo's decisions into another, and nothing is ever answered on the owner's behalf except from a decision the owner approved. |
| **Scope Boundary** | Append-only Decision Ledger per repo (decisions/ledger.yaml), written only through an owner-approved path (wxBrainstorm close, owner reply to a queue item, /wxLedger import after approval). /wxLedger command: import, check, search. Ask Gate with three intercept points: PreToolUse hook on AskUserQuestion; Stop hook on plain-text questions (proven by a spike first); the G.O.D. return-the-question path under --create. Answer rules: repo ledger (main repo path) then global tier; only Agreed/Added/Changed, owner-approved, not superseded, above the match threshold; full text and ID returned. Deterministic keyword classifier: blocker vs assumption, failing closed. Blocker routing (decision queue / bridge room / pass-through to the developer) and assumption logging (decisions/assumptions.yaml). Observe and enforce modes per project (default observe), append-only gate audit log, run-report listing. Local OpenViking service (separate, documented install, namespace per repo, authentication, no code stored), file-search fallback within 2 seconds, health line. Global tier of owner-approved general patterns, seeded from ~/.wxai/god-learnings.md; cross-repo reads only by explicit owner link. Optional minimal-code rule adapted from Ponytail (on/lite/off; default on; lite in conversion). Kit sync treats decisions/ and the gate and rule settings as project-owned. The SCOPE-136 amendment: parallel entry point outside --create, Orca worktree scripts, day/night windows and operator presence, the status file and the Cockpit Parallel Agents panel (sibling hand-off). Model router, provider policy, free-claude-code proxy and active-time metering (Topic 2, separate brainstorm). CockPit ledger mirror, question-queue views, learning-inbox UI, customer queue policy (deferred). Multi-machine access to the memory service and the Workbench multi-machine dispatch. A local model classifier (v1 is keyword-based). Remediation of a .env reportedly tracked in the public kit repo (separate urgent task). Any change to push, deploy, schema or production-data approvals. |


## User Scenarios & Testing

### US1 — A repeat question is answered from the ledger

**Actor**: AI agent

**Scenario**:
1. The repo's ledger holds an Agreed, owner-approved decision on how endorsements are prorated; the gate is in enforce mode.
2. An agent calls AskUserQuestion asking how endorsements are prorated.

**Expected outcome**: The gate blocks the question and returns the decision text and ID; the agent continues; no question reaches the developer; the answer is logged with the decision ID and match score.

### US2 — A plain-text question is caught

**Actor**: AI agent

**Scenario**:
1. Same ledger as US1.
2. An agent ends its turn with a plain-text question the decision answers.

**Expected outcome**: The Stop hook blocks the stop and hands back the decision with its ID; the agent resumes; logged as in US1.

### US3 — A real blocker parks only its own unit

**Actor**: Developer (remote)

**Scenario**:
1. A --create run has four units in progress.
2. One agent asks whether it may load production data; no ledger entry covers it.

**Expected outcome**: Classified as a blocker (client data); goes to the decision queue and the bridge room; that unit parks while the other three continue; the owner's answer in the room is written as a new ledger entry with approved_by: owner and the unit is released.

### US4 — An uncovered, non-blocking question becomes an assumption

**Actor**: AI agent

**Scenario**:
1. An agent asks which of two equivalent date formats to use in a log line; nothing in the ledger covers it.

**Expected outcome**: Classified as an assumption; the agent picks the most reasonable default and continues; an entry is appended to decisions/assumptions.yaml; the end-of-run report lists it; the ledger is unchanged.

### US5 — A global pattern applies in another repo; a repo decision does not leak

**Actor**: Developer

**Scenario**:
1. Repo A's ledger holds a customer-specific pricing decision.
2. The global tier holds the approved pattern 'invitations expire in about 7 days'.
3. In repo B, an agent asks how long invitations last, then asks about pricing.

**Expected outcome**: The invitation question is answered from the global tier; the pricing question gets no answer from repo A and is classified and handled as uncovered.

### US6 — The memory service is down

**Actor**: AI agent

**Scenario**:
1. The OpenViking service is stopped.
2. An agent asks the US1 question.

**Expected outcome**: Within the 2-second budget the gate falls back to file search of the ledger and answers; the hook's status shows the service unavailable, so the fallback is visible.

### US7 — Observe mode gives the baseline

**Actor**: Developer

**Scenario**:
1. A new project's gate is in observe mode (the default).
2. A run asks 40 questions.

**Expected outcome**: Nothing is blocked; the observe log lists each question, whether the ledger would have answered it, the score and the class; those figures are the baseline; the developer switches the project to enforce.

### US8 — The ledger is written from a brainstorm

**Actor**: Developer

**Scenario**:
1. The developer approves a wxBrainstorm summary.
2. Separately, they run /wxLedger import on an older closed record.

**Expected outcome**: The close writes one entry per Agreed, Added, Changed or Declined item and parked items as evidence: unknown; the import shows extracted entries for owner approval before writing; /wxLedger check passes on both.

## Functional Requirements

### FR-001 — Decision Ledger format

Each repo keeps decisions/ledger.yaml, append-only. Each entry holds id, scope, question, decision, rationale, kind (Agreed/Added/Changed/Declined/Parked), evidence (confirmed/likely/assumed/unknown/conflicting), source, approved_by, date and supersedes. A change is a new entry with supersedes; no entry is edited or removed.

**Acceptance Criteria**:
- [ ] /wxLedger check fails on a missing required field, a duplicate id, or a supersedes that points to no entry.
- [ ] A change produces a new entry with supersedes; existing entries are byte-for-byte unchanged.

### FR-002 — Only the owner path writes the ledger

Entries are appended only by a ledger script that records approved_by, called by wxBrainstorm at an approved close, by an owner reply to a queue item, or by /wxLedger import after the owner approves.

**Acceptance Criteria**:
- [ ] A direct Edit or Write by an agent to decisions/ledger.yaml is denied by the hook with a message naming the script.
- [ ] Every appended entry has a non-empty approved_by.

### FR-003 — wxBrainstorm writes the ledger at close

After the owner approves a summary, wxBrainstorm's close writes one ledger entry per Agreed, Added, Changed or Declined item; parked and open items become entries with evidence: unknown and an owner (owner or customer).

**Acceptance Criteria**:
- [ ] A test close of a record with 4 decisions and 1 parked item writes 5 entries and /wxLedger check passes.
- [ ] Nothing is written when the summary is not approved.

### FR-004 — /wxLedger command

/wxLedger import <record.md> shows the extracted entries and writes only on the owner's approval; check validates the file; search <text> returns matching entries with IDs and scores using the same ranking as the gate.

**Acceptance Criteria**:
- [ ] Import of docs/brainstorms/2026-10-22-parallel-build-agent.md lists one entry per decision row before anything is written.
- [ ] search returns the same ranking the gate would use for the same text.

### FR-005 — Ask Gate on the question tool

A PreToolUse hook matches AskUserQuestion and runs the answer search in FR-008, installed by the existing hook installer beside the SCOPE-137 hook.

**Acceptance Criteria**:
- [ ] The hook runs in every permission mode, including bypass, shown by a live run.
- [ ] install-hook installs both hooks and a reinstall leaves exactly one copy of each.

### FR-006 — Ask Gate on plain-text questions

A Stop hook reads the agent's final message; if it ends in a question FR-008 answers, it blocks the stop and returns the answer so the agent continues. The spec begins with a spike proving this; if the spike fails, the kit ships a rule that agents run /wxLedger search before asking and FR-006 is marked unmet.

**Acceptance Criteria**:
- [ ] The spike result is recorded in the spec before FR-006 is built.
- [ ] US2 passes.

### FR-007 — Ask Gate on the G.O.D. return-the-question path

Under --create, G.O.D. runs the FR-008 search before adding a helper's question to the decision queue.

**Acceptance Criteria**:
- [ ] A question covered by the ledger never appears in GOD-Decisions.md.
- [ ] An uncovered question still reaches the queue unchanged.

### FR-008 — What may answer a question

Search order is the repo ledger, read from the main repo path and never a worktree copy, then the global tier. Only entries that are Agreed, Added or Changed, owner-approved, not superseded and above the match threshold may answer. The answer returned is the entry's full text and ID, and the agent must state why it applies.

**Acceptance Criteria**:
- [ ] A superseded entry is never returned.
- [ ] An entry with evidence: unknown is shown as context and the question still goes on to FR-009.
- [ ] Repo A's entries are never returned in repo B unless the owner has linked them.

### FR-009 — Classifier

An uncovered question gets a deterministic keyword classification: blocker for security, client data or PII, money or cost, legal or compliance, an irreversible action, or a conflict with the spec or ledger (and, in conversion mode, missing legacy evidence); otherwise assumption. When unsure, blocker.

**Acceptance Criteria**:
- [ ] A labelled test set of at least 30 questions has zero blockers classified as assumptions.
- [ ] An empty or unparseable question is classified as a blocker.

### FR-010 — Blocker routing

In a --create run a blocker goes to the decision queue and its unit parks; with a live bridge session it also goes to the room; otherwise it passes through to the developer and is logged. An owner answer becomes a ledger entry through FR-002.

**Acceptance Criteria**:
- [ ] US3 passes.
- [ ] With no run active and no remote session, the question reaches the developer unchanged and one gate-log entry is written.

### FR-011 — Assumption routing

The gate tells the agent to choose the most reasonable default and continue, and appends the question, the default chosen and the agent to decisions/assumptions.yaml. Agents write assumptions only.

**Acceptance Criteria**:
- [ ] US4 passes.
- [ ] The ledger is unchanged after an assumption.

### FR-012 — Hook precedence

Impact-boundary and data-loss decisions from the SCOPE-137 hook always win over the Ask Gate.

**Acceptance Criteria**:
- [ ] A shared fixture where both hooks fire on one call shows the impact decision applied.
- [ ] A live run in each permission mode is recorded as evidence, not unit tests alone.

### FR-013 — Observe and enforce modes

A project setting holds gate.mode: observe (default) or enforce. In observe mode nothing is blocked and every question is logged with whether it would have been answered, the score and the class.

**Acceptance Criteria**:
- [ ] US7 passes.
- [ ] Switching the mode needs only the setting, with no reinstall.

### FR-014 — Audit trail (SOC2 CC7.2)

Every gate outcome (answered with ID, passed through, queued, assumed, observed) is appended to decisions/gate-log.jsonl with time, session, question and result.

**Acceptance Criteria**:
- [ ] The log cannot be rewritten through the gate or the ledger script.
- [ ] Exactly one entry is written per intercepted question.

### FR-015 — Run report

The --create run report lists every question answered from the ledger with its ID, and every assumption logged.

**Acceptance Criteria**:
- [ ] The run report of a test run shows both lists.
- [ ] A run with none shows both lists as empty rather than omitting them.

### FR-016 — OpenViking local service

The kit documents and scripts installing OpenViking as a separate local service, never bundled (AGPL). Each repo gets its own namespace with authentication; only ledger entries and approved patterns are stored, never code. The launcher is spawned detached.

**Acceptance Criteria**:
- [ ] Install steps and Windows support are verified at spec time and recorded.
- [ ] A license check confirms no OpenViking code is in the kit.
- [ ] US5 passes against the service.

### FR-017 — Fallback and health

If the service does not answer within the gate's 2-second budget, file search of the ledger is used. The hook's status line shows the service as up, or down with the fallback in use.

**Acceptance Criteria**:
- [ ] US6 passes.
- [ ] The status line names the fallback whenever it was used.

### FR-018 — Global tier

The global tier holds owner-approved general patterns, seeded from the existing ~/.wxai/god-learnings.md, added only on owner approval through wxBrainstorm's learnings step. Repos are linked only by an explicit owner setting.

**Acceptance Criteria**:
- [ ] /wxLedger check --global finds no project names, file paths or customer data in the global tier.
- [ ] Without a link, no repo ledger is readable from another repo.

### FR-019 — Minimal-code rule

_wxAI/rules/minimal-code.md is adapted from Ponytail (MIT, attribution kept) and cross-references search-before-suggest.md. A project setting holds minimalCode.level: on, lite or off; default on; conversion work runs at lite. In lite the 'what I skipped' footer stays and nothing is skipped when legacy behavior is unclear. G.O.D. may set the level per run.

**Acceptance Criteria**:
- [ ] A project with no setting gets on; a conversion run gets lite.
- [ ] The rule file carries the Ponytail MIT attribution.

### FR-020 — Kit upgrade keeps decisions

Kit sync treats decisions/** and the gate and rule settings as project-owned and never overwrites them.

**Acceptance Criteria**:
- [ ] After a kit upgrade, a project's populated decisions/ folder is byte-for-byte unchanged.

## Amendment A — 2026-10-24: KAIN answers as the owner, and the owner reviews

Decided by the owner, 2026-10-24 (option 2 of the project-agent discussion). In a project-agent room (SCOPE-132 Amendment A / SPEC-134) KAIN supervises the project agent. KAIN may answer a parked blocker **acting as the owner**, so the work goes on; every KAIN answer goes on a list the owner reviews. A KAIN answer is never a ledger decision and never answers a later question until the owner approves it. The owner's review verdicts are how KAIN learns to answer as the owner.

Found while deciding: the bridge strips the `[KAIN]` tag before it relays a message, so the session cannot tell an owner's reply from KAIN's. Attribution is therefore done by the bridge, never by the model.

### FR-021 — The bridge attributes queue answers

A room message (after the `[KAIN]` tag, when KAIN wrote it) that begins with an open queue id (`DQ-nn`) is handled by the bridge and not relayed as an ordinary message. The author is the one the bridge already determines: a human post is the owner; a `[KAIN]` agent post is KAIN. No model decides who answered.

> **Updated by SCOPE-144 / SPEC-144 FR-008 (2026-10-24):** "a human post is the owner" is replaced by **Room Approvers**. A human `DQ-nn` answer or `KR-nnnn` review counts only when its author is a company ADMIN or a TEAM_MANAGER who is a current member of the project (checked by the bridge with `GET /api/project-agent/approver`), and is recorded with that person's name as `approved_by`; anyone else's reply goes to the session as discussion with a "Not recorded" room note. A `[KAIN]` post is still never an approver.

**Acceptance Criteria**:
- [ ] A human `DQ-01: no, use seeded data` produces a ledger entry with `approved_by: owner` (FR-002, unchanged path).
- [ ] A `[KAIN] DQ-01: no, use seeded data` produces no ledger entry.
- [ ] Text that names no open queue item is relayed as before.

### FR-022 — A KAIN answer releases the unit and joins the review list

A KAIN answer is appended to `decisions/kain-replies.yaml` (`id` KR-nnnn, `dq`, `unit`, `question`, `answer`, `time`, `status: pending`). The queue item becomes `answered-by-kain` and its units are released, so the work continues on KAIN's answer. The ledger is unchanged, and the Ask Gate never answers from a KAIN reply (FR-008 unchanged: only owner-approved ledger entries answer).

**Acceptance Criteria**:
- [ ] After a KAIN answer, the unit is released and `kain-replies.yaml` holds one pending entry.
- [ ] The same question asked again is not answered from the KAIN reply.

### FR-023 — The owner reviews the list

`/wxLedger review` lists pending KAIN replies, oldest first, with the question, KAIN's answer, and the units that went on under it. For each, the owner says **approve**, **change** (with the owner's own answer) or **reject**. Approve and change append a ledger entry through the ledger script with `approved_by: owner` and `source: decisions/kain-replies.yaml#KR-nnnn`; reject appends nothing. Each verdict is written back to the reply (`status`, `verdict`, `ownerAnswer`, `reviewedAt`). A changed or rejected reply names the units that went on under the wrong answer, so they can be checked. The owner can also review in the room: `KR-0003 approve`, `KR-0003 change: <answer>`, `KR-0003 reject`, accepted from a human post only.

**Acceptance Criteria**:
- [ ] Approve writes one ledger entry; change writes one with the owner's text; reject writes none.
- [ ] A review verdict posted by `[KAIN]` is refused (KAIN never reviews itself).
- [ ] Agents cannot write `decisions/kain-replies.yaml` directly (the ledger guard covers it).

### FR-024 — KAIN learns from the verdicts

Every verdict is posted to the project room as `[<project>] KR-0003 approved | changed to: <owner's answer> | rejected`, so KAIN, which already reads the room, sees each outcome. `docs/kain-contract.md` tells SpokAI that these posts and the reply list are KAIN's training record for answering as the owner, and that a changed or rejected reply is a correction to learn from. No other channel is added.

**Acceptance Criteria**:
- [ ] Each verdict produces exactly one room post.
- [ ] The contract documents the reply list, the verdict posts and their meaning.

### FR-025 — Reporting

The G.O.D. run report and `/wxLedger check` list pending KAIN replies (both show an empty list rather than omitting it). The gate log records each KAIN answer and each verdict (FR-014).

**Acceptance Criteria**:
- [ ] A run with one KAIN answer shows it as pending in the run report.

## Data Requirements

No tables are added or changed in the wxKanban database. v1 is file-based (the CockPit ledger mirror is deferred).

Repo files (project-owned, FR-020):
- `decisions/ledger.yaml` — append-only decisions (FR-001)
- `decisions/assumptions.yaml` — agent-written assumptions (FR-011)
- `decisions/gate-log.jsonl` — append-only gate audit trail and observe log (FR-013, FR-014)
- `decisions/settings.yaml` — `gate.mode` (observe|enforce), `gate.matchThreshold`, `minimalCode.level` (on|lite|off), `links` (repos whose ledgers this repo may read)
- `decisions/kain-replies.yaml` — KAIN's answers awaiting the owner's review, and the verdicts (Amendment A, FR-022, FR-023); written only by the bridge and the review script

User files: `~/.wxai/god-learnings.md` — global tier seed (FR-018).

Local service: OpenViking — one namespace per repo plus one global namespace; ledger entries and patterns only, never code (FR-016).

Forbidden: writing `decisions/ledger.yaml` other than through the ledger script (FR-002); storing code bodies or customer contact details in any tier.

## API Routes

None — no hosted wxKanban routes change in v1. The gate, the ledger script and /wxLedger run locally; OpenViking's local API is used behind one search interface, its exact shape verified at spec time.

## Frontend Components

None — the Cockpit "Parallel Agents" panel belongs to the sibling SCOPE-136 amendment.

## Success Criteria

1. Repeat questions fall: in enforce mode, blocker questions reaching the developer that an existing decision already answered drop by at least 80% against the same project's observe-mode baseline, measured from gate-log.jsonl over at least one full run.
2. No wrong answers served: 0 answers in a pilot run come from a superseded entry, an evidence:unknown entry, or another repo's ledger without a link, checked by replaying the gate log against the ledger.
3. No blocker misfiled: 0 blocker-class questions classified as assumptions on the 30-question labelled test set, and none found in the pilot's end-of-run review.
4. Fast: 95% of gate decisions complete within 2 seconds on the workstation, including fallback to file search when the service is down.
5. Holds in every mode: in live runs in each permission mode (bypass included), 100% of AskUserQuestion calls pass through the gate, and plain-text questions too if the FR-006 spike succeeds.
6. Agents never write decisions: 0 ledger entries without approved_by and 0 successful direct agent writes to ledger.yaml across the pilot.
7. Upgrade-safe: after a kit upgrade, decisions/ is unchanged in 100% of tested projects.

## Key Entities

- **Decision** — one ledger entry; owner-approved, append-only, superseded only by a newer entry.
- **Assumption** — a default an agent chose for an uncovered, non-blocking question.
- **Gate Event** — one intercepted question and its outcome (answered, passed through, queued, assumed, observed).
- **Global Pattern** — an owner-approved general rule usable from every repo.
- **Repo Link** — an owner setting that lets one repo read another's ledger.

Kit delivery: `_wxAI/askgate/` (hooks, ledger script), `_wxAI/commands/wxLedger.md` and its `.claude` mirror, `_wxAI/rules/minimal-code.md`; wxBrainstorm's close step changes in every copy (skill, command, hosted prompt), checked by md5.

## Constraints

- MUST deliver only the behavior described within the scope boundary: Append-only Decision Ledger per repo (decisions/ledger.yaml), written only through an owner-approved path (wxBrainstorm close, owner reply to a queue item, /wxLedger import after approval). /wxLedger command: import, check, search. Ask Gate with three intercept points: PreToolUse hook on AskUserQuestion; Stop hook on plain-text questions (proven by a spike first); the G.O.D. return-the-question path under --create. Answer rules: repo ledger (main repo path) then global tier; only Agreed/Added/Changed, owner-approved, not superseded, above the match threshold; full text and ID returned. Deterministic keyword classifier: blocker vs assumption, failing closed. Blocker routing (decision queue / bridge room / pass-through to the developer) and assumption logging (decisions/assumptions.yaml). Observe and enforce modes per project (default observe), append-only gate audit log, run-report listing. Local OpenViking service (separate, documented install, namespace per repo, authentication, no code stored), file-search fallback within 2 seconds, health line. Global tier of owner-approved general patterns, seeded from ~/.wxai/god-learnings.md; cross-repo reads only by explicit owner link. Optional minimal-code rule adapted from Ponytail (on/lite/off; default on; lite in conversion). Kit sync treats decisions/ and the gate and rule settings as project-owned.
- MUST keep the following work out of scope for this iteration: The SCOPE-136 amendment: parallel entry point outside --create, Orca worktree scripts, day/night windows and operator presence, the status file and the Cockpit Parallel Agents panel (sibling hand-off). Model router, provider policy, free-claude-code proxy and active-time metering (Topic 2, separate brainstorm). CockPit ledger mirror, question-queue views, learning-inbox UI, customer queue policy (deferred). Multi-machine access to the memory service and the Workbench multi-machine dispatch. A local model classifier (v1 is keyword-based). Remediation of a .env reportedly tracked in the public kit repo (separate urgent task). Any change to push, deploy, schema or production-data approvals.
- MUST preserve guided, reviewable workflow decisions instead of relying on undocumented implementation assumptions.
- MUST keep user-visible outcomes aligned with the measurable success criteria defined in this scope.

## Notes

- Integration context: SCOPE-136 / SPEC-136 Amendment A (commit 05c1c372): decision queue, parked units, GOD-Decisions.md and GOD-Run-Report.md; FR-007 and FR-015 extend these. SCOPE-137: PreToolUse impact hook (_wxAI/impact/hook.mjs), installer (install-hook.mjs), unattended marker and checkpoints; 42 fenced files; SCOPE-138, SCOPE-139 and SCOPE-140 depend on it. The Ask Gate installs beside it and never overrides it. SCOPE-132: ask-to-verify gate design; canUseTool is not called under bypass mode, so enforcement is by hook. SCOPE-102: Remote Session Bridge and room (phone and wxHub) for blocker relay and owner answers. wxBrainstorm skill, command and hosted prompt copies (close step) and the shared ~/.wxai/god-learnings.md. _wxAI/rules/search-before-suggest.md (cross-referenced by the minimal-code rule).
- Constraints and risks: Constraints: Human approval is unchanged: the gate never answers for the customer and never approves push, deploy, schema change or production data. SCOPE-137 impact-boundary and data-loss decisions always take precedence over the Ask Gate. OpenViking (AGPLv3, no rewrite/translation without permission) runs only as a separate service; never copied, ported or bundled. Ponytail (MIT) adapted with attribution. No customer content in the public kit; ledgers, assumptions and logs live in each project. Agents stay on the main system in v1 (the memory service is local). Every enforcement claim is backed by a live run in each permission mode, not unit tests alone. wxBrainstorm mirrors (skill, command, hosted prompt) are updated together and checked by md5. Risks: Stop hook cannot reliably catch plain-text questions (High): spike first; fallback rule plus tool and G.O.D. paths. Near-match serves the wrong decision (High): full text + ID, threshold, agent justification, audit log. OpenViking install, Windows support or API differ from the draft (Medium): verify at spec time; file-search fallback. Keyword classifier misses a blocker (High): fail closed, labelled test set, end-of-run review. Two hooks conflict on one call (Medium): precedence rule, shared fixture. Notes: Converted from docs/brainstorms/2026-10-22-parallel-build-agent.md (Topic 1 decisions 1-9) plus buildscope gap answers of 2026-10-22: minimal-code default on and lite in conversion; blockers pass through outside --create (room when remote); three intercept points; observe mode first. Topic 2 (model router) is a separate brainstorm. The .env check on the public kit repo is a separate urgent task. Compliance (SOC2): CC5.2 Separation of duties: the gate only replays owner-approved decisions; agents cannot author decisions (FR-002, FR-008). CC7.2 Audit trail: every gate outcome and ledger append recorded with who, what, when, in a log separate from the ledger (FR-014, FR-002). CC6.1 / CC6.3 Access control and least privilege: memory service authentication, namespace per repo, cross-repo reads only by explicit link (FR-016, FR-008).
- Customer-visible or operator-visible history should be limited to outcomes that materially affect workflow review and support.

## Clarifications

### Session 2026-10-23

| # | Question | Decision |
|---|----------|----------|
| 1 | What business problem does this solve? | A developer with more work than one agent can do wants several agents running at once. Today every agent stops to ask questions that an earlier wxBrainstorm or an earlier answer already settled: brainstorm records are prose, and nothing makes an agent check them before asking. Each repeat question costs the developer attention and stalls that agent, and the cost grows with the number of agents. Corrections given in chat are lost between sessions, models and repos. The need: no agent asks a question an owner-approved decision already answers, approved knowledge is reusable from any repo without leaking one repo's decisions into another, and nothing is ever answered on the owner's behalf except from a decision the owner approved. |
| 2 | Who are the primary and secondary actors? | Primary actor: Developer / owner running several AI agents on one machine. Secondary actors: AI agents (Claude Code sessions and G.O.D. helpers), wxBrainstorm (writes decisions at an approved close), wxG-O-D (consults the ledger; sets the minimal-code level per run), SCOPE-102 Remote Session Bridge (relays blockers to the room, phone and wxHub). |
| 3 | What is in scope? | Append-only Decision Ledger per repo (decisions/ledger.yaml), written only through an owner-approved path (wxBrainstorm close, owner reply to a queue item, /wxLedger import after approval). /wxLedger command: import, check, search. Ask Gate with three intercept points: PreToolUse hook on AskUserQuestion; Stop hook on plain-text questions (proven by a spike first); the G.O.D. return-the-question path under --create. Answer rules: repo ledger (main repo path) then global tier; only Agreed/Added/Changed, owner-approved, not superseded, above the match threshold; full text and ID returned. Deterministic keyword classifier: blocker vs assumption, failing closed. Blocker routing (decision queue / bridge room / pass-through to the developer) and assumption logging (decisions/assumptions.yaml). Observe and enforce modes per project (default observe), append-only gate audit log, run-report listing. Local OpenViking service (separate, documented install, namespace per repo, authentication, no code stored), file-search fallback within 2 seconds, health line. Global tier of owner-approved general patterns, seeded from ~/.wxai/god-learnings.md; cross-repo reads only by explicit owner link. Optional minimal-code rule adapted from Ponytail (on/lite/off; default on; lite in conversion). Kit sync treats decisions/ and the gate and rule settings as project-owned. |
| 4 | What is out of scope? | The SCOPE-136 amendment: parallel entry point outside --create, Orca worktree scripts, day/night windows and operator presence, the status file and the Cockpit Parallel Agents panel (sibling hand-off). Model router, provider policy, free-claude-code proxy and active-time metering (Topic 2, separate brainstorm). CockPit ledger mirror, question-queue views, learning-inbox UI, customer queue policy (deferred). Multi-machine access to the memory service and the Workbench multi-machine dispatch. A local model classifier (v1 is keyword-based). Remediation of a .env reportedly tracked in the public kit repo (separate urgent task). Any change to push, deploy, schema or production-data approvals. |
| 5 | How is success measured? | Repeat questions fall: in enforce mode, blocker questions reaching the developer that an existing decision already answered drop by at least 80% against the same project's observe-mode baseline, measured from gate-log.jsonl over at least one full run. No wrong answers served: 0 answers in a pilot run come from a superseded entry, an evidence:unknown entry, or another repo's ledger without a link, checked by replaying the gate log against the ledger. No blocker misfiled: 0 blocker-class questions classified as assumptions on the 30-question labelled test set, and none found in the pilot's end-of-run review. Fast: 95% of gate decisions complete within 2 seconds on the workstation, including fallback to file search when the service is down. Holds in every mode: in live runs in each permission mode (bypass included), 100% of AskUserQuestion calls pass through the gate, and plain-text questions too if the FR-006 spike succeeds. Agents never write decisions: 0 ledger entries without approved_by and 0 successful direct agent writes to ledger.yaml across the pilot. Upgrade-safe: after a kit upgrade, decisions/ is unchanged in 100% of tested projects. |
| 6 | What existing workflow must this align with? | SCOPE-136 / SPEC-136 Amendment A (commit 05c1c372): decision queue, parked units, GOD-Decisions.md and GOD-Run-Report.md; FR-007 and FR-015 extend these. SCOPE-137: PreToolUse impact hook (_wxAI/impact/hook.mjs), installer (install-hook.mjs), unattended marker and checkpoints; 42 fenced files; SCOPE-138, SCOPE-139 and SCOPE-140 depend on it. The Ask Gate installs beside it and never overrides it. SCOPE-132: ask-to-verify gate design; canUseTool is not called under bypass mode, so enforcement is by hook. SCOPE-102: Remote Session Bridge and room (phone and wxHub) for blocker relay and owner answers. wxBrainstorm skill, command and hosted prompt copies (close step) and the shared ~/.wxai/god-learnings.md. _wxAI/rules/search-before-suggest.md (cross-referenced by the minimal-code rule). |
| 7 | What constraints or risks matter right now? | Constraints: Human approval is unchanged: the gate never answers for the customer and never approves push, deploy, schema change or production data. SCOPE-137 impact-boundary and data-loss decisions always take precedence over the Ask Gate. OpenViking (AGPLv3, no rewrite/translation without permission) runs only as a separate service; never copied, ported or bundled. Ponytail (MIT) adapted with attribution. No customer content in the public kit; ledgers, assumptions and logs live in each project. Agents stay on the main system in v1 (the memory service is local). Every enforcement claim is backed by a live run in each permission mode, not unit tests alone. wxBrainstorm mirrors (skill, command, hosted prompt) are updated together and checked by md5. Risks: Stop hook cannot reliably catch plain-text questions (High): spike first; fallback rule plus tool and G.O.D. paths. Near-match serves the wrong decision (High): full text + ID, threshold, agent justification, audit log. OpenViking install, Windows support or API differ from the draft (Medium): verify at spec time; file-search fallback. Keyword classifier misses a blocker (High): fail closed, labelled test set, end-of-run review. Two hooks conflict on one call (Medium): precedence rule, shared fixture. Notes: Converted from docs/brainstorms/2026-10-22-parallel-build-agent.md (Topic 1 decisions 1-9) plus buildscope gap answers of 2026-10-22: minimal-code default on and lite in conversion; blockers pass through outside --create (room when remote); three intercept points; observe mode first. Topic 2 (model router) is a separate brainstorm. The .env check on the public kit repo is a separate urgent task. Compliance (SOC2): CC5.2 Separation of duties: the gate only replays owner-approved decisions; agents cannot author decisions (FR-002, FR-008). CC7.2 Audit trail: every gate outcome and ledger append recorded with who, what, when, in a log separate from the ledger (FR-014, FR-002). CC6.1 / CC6.3 Access control and least privilege: memory service authentication, namespace per repo, cross-repo reads only by explicit link (FR-016, FR-008). |

### Session 2026-10-23 (T005/T013/T021 live runs) — behavior found live and fixed; owner to confirm 8

| # | Question | Decision |
|---|----------|----------|
| 8 | When is an uncovered, non-blocking question assumed (FR-011)? | Only when nobody is there to answer it: an unattended run (`WXAI_UNATTENDED=1` or the SCOPE-137 unattended marker, e.g. wxG-O-D `--create`), and not a Remote Session Bridge run. With a person present, both intercepts let it through to that person and log `passed-through`; a ledger answer still stops it (FR-006). Found live: in enforce mode a wxBrainstorm close whose owner said "change the summary first" had its questions assumed and recorded an unapproved summary with `approved_by: owner`. Follows the scope's need: nothing is answered on the owner's behalf except from an approved decision. **Confirmed by the owner, 2026-10-23.** |
| 9 | Is a question asking the owner to choose or approve ever an assumption (FR-009)? | No. "would you like me to", "want me to", "record it", "change the summary", "approve", "sign off", "your call" and the like are blockers (fail closed). Added to the labelled set. |
| 10 | Does FR-002 cover deleting or moving the whole decisions folder? | Yes. Found live: `rm -rf decisions` passed both hooks in every permission mode and deleted the ledger. The ledger guard now denies rm/rmdir/mv/del/Remove-Item/git rm on the folder or a glob inside it. |
| 11 | How is the 2-second budget split (FR-017, SC-4)? | The whole decision has 2 s; the memory service gets 1.5 s of it. Measured: with a 2 s service budget a black-holed service took 2.1–2.7 s per decision (0/20 inside 2 s); with 1.5 s, 1.65–1.75 s (20/20). |
| 12 | Does FR-005's "existing hook installer" install the Ask Gate? | It must: `_wxAI/impact/install-hook.mjs` (the installer the Cockpit runs) also installs, checks and removes the Ask Gate hooks when the kit has them. Without it no consumer ever gets the gate. |
| 13 | Does the shipped OpenViking install produce a working service (FR-016)? | No. Probed v0.4.18 (tag confirmed): it ignores `ROOT_API_KEY` and refuses to start without `/app/.openviking/ov.conf`, which must name an embedding provider (cloud API, local Ollama, or a ~24 MB local CPU embedding). T016 is reopened; the embedding choice is the owner's (a cloud provider would send ledger text off the machine). The file-search fallback covers every gate decision meanwhile. |
| 14 | What did the live OpenViking probe establish (T016, 2026-10-23)? | Owner chose the local CPU embedding. Verified against v0.4.18: (a) the image lacks `llama-cpp-python` and pip in its venv; a prebuilt CPU wheel installs with `pip3 --python /app/.venv/bin/python install --only-binary=:all: --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cpu llama-cpp-python`, so a small derived image is needed; (b) config is `ov.conf` mounted at `/app/.openviking/ov.conf` (it overrides `OPENVIKING_CONF_CONTENT`) with `server.auth_mode: "api_key"`, `server.root_api_key`, host `0.0.0.0`; no VLM needed for add or search; (c) auth `Authorization: Bearer` works (the adapter's guess); (d) the ROOT key cannot read or write data: each repo is an account (`POST /api/v1/admin/accounts`, returns a user key), which gives real per-repo isolation; a repo-B key did not see repo-A entries (US5 leak half passes live); (e) add = `POST /resources/temp_upload` (multipart) then `POST /resources {temp_file_id, to: "viking://resources/askgate/<id>.md", wait: true}`, about 2 s; no staging mount; (f) search = `POST /search/find {query, target_uri, limit, read_content: true}`, about 0.45 s; hits are `result.resources[] {uri, score, content}`. **Blocker for the owner:** the only local CPU model v0.4.18 accepts is `bge-small-zh-v1.5` (Chinese; the model table is fixed and the dimension check rejects others). English scores were weak: the right entry 0.64, an unrelated pricing entry 0.50, so at the 0.75 threshold the service would never answer. Options: keep it for isolation and recall only (file search still answers), use host Ollama with an English model, or defer OpenViking. |


## Business Problem

Describe the concrete customer or operator pain point this scope solves. Replace this paragraph with specific language describing the current friction, the desired outcome, and why this work is being prioritized now.

## Actors

- Primary: Operator who initiates this workflow as part of their daily responsibilities and depends on the result for downstream decisions.
- Secondary: Reviewing engineer, dependent service, or stakeholder who consumes or validates the output produced by this scope.

## Success Metrics

1. Outcome 1 — replace with a concrete target that includes a number, percentage, or timing threshold (e.g., "Reduce X by 30%" or "Complete Y within 2 minutes").
2. Outcome 2 — replace with a second measurable metric covering reliability, throughput, or operator-visible behavior.
3. Outcome 3 — replace with a third measurable metric covering correctness, audit, or downstream impact.

## Scope Boundary

This scope covers the specific files, modules, or workflows listed here. Replace this paragraph with the concrete set of code surfaces, screens, or APIs that this iteration changes. Reference paths where helpful.

## Out of Scope

Items deliberately deferred to future scopes. Replace this paragraph with the concrete list of things this iteration does NOT change, including any cross-cutting concerns (publishing, migration, UI polish) that need their own scope.

## Open Questions

None at this time. Add open questions as they arise during scope review; resolve each one with a written decision before promoting the scope.

## Functional Requirements

### FR-001 — Replace with first requirement title

Describe the requirement in concrete behavioral terms. The system MUST do something specific, observable, and testable.

**Acceptance Criteria**:
- [ ] criterion 1 — what the operator can do
- [ ] criterion 2 — what the system persists or exposes

## Phase

**Current Phase**: design
**Priority**: high

## Status

- **Date**: 2026-10-23
- **Phase**: design
