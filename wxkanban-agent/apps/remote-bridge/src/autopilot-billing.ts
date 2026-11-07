// [SCOPE 154 / T010] BEGIN — Resource-time booking via agentruns, reused as-is (FR-009)
//
// FR-009 says to book every run and unit through the EXISTING SPEC-005 FR-007 agentruns model —
// "not a new mechanism" — and never through /ai-session. That existing mechanism (SPEC-143:
// Claude Code's own SubagentStop/PostToolUse/Stop hooks -> capture-worker.mjs ->
// decisions/agentrun-log.jsonl -> forward.mjs -> POST /api/consultant-hub/agent-runs) already
// runs for every session on this machine, Autopilot's included, because each unit's
// validateScope -> createSpecs -> implement work (runPipeline's `runUnit`, autopilot-pipeline.ts)
// runs as ordinary commands in the one already-attached session — there is no second session or
// subprocess for Autopilot to book separately. Confirmed against the owner (not guessed) that
// this spec adds no parallel booking path on top of it.
//
// Two of FR-009's three acceptance criteria hold today, for every session, by construction —
// pinned by the tests this file's own test module carries:
//   - "no attribution to a person": `agentruns` (src/db/schema/agentrun.ts) carries no userid or
//     createdby column, and capture-worker.mjs never reads one.
//   - "booking only takes effect where the company has Time and Billing; Autopilot carries no
//     plan gate": `runPipeline` (autopilot-pipeline.ts) calls no billing check at all, and
//     forward.mjs treats the server's 404 (companyMayBill false, src/server/routes/agentRuns.ts)
//     as a permanent, silent rejection — counted, never retried, never surfaced to the run.
//
// The third — "tagged with scope and task" — is NOT fully built, for any session, Autopilot or
// not: capture-worker.mjs leaves taskid null everywhere ("difficulty and taskid stay null here;
// G.O.D. fills them later through the tier resolver" — that resolver does not exist yet anywhere
// under `_wxAI/`). Building that general tagging mechanism is a SPEC-143-level change reaching
// every command's capture path, not an Autopilot-specific one, and is out of this spec's reach.
// Autopilot adds no workaround that would either double-book a unit's active time against a
// second, separately-tagged row, or fabricate a single taskid for a scope that createSpecs may
// fan out into several real tasks. SC-41's scope-and-task tagging is left to that future
// SPEC-143 work; this task adds no new booking code, by the project owner's own choice when this
// gap was raised.
export const AUTOPILOT_REUSES_EXISTING_AGENTRUNS_MECHANISM = true;
// [SCOPE 154 / T010] END
