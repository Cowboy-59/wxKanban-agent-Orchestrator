# Spec 019: Agent Orchestrator Kit

**Spec Number**: 019
**Status**: `implementation`
**Scope**: `specs/Project-Scope/019-agent-orchestrator-kit.md` — this spec carries **Amendment B (2026-10-25)**, the first SCOPE-019 work tracked in the database
**Depends On**: SCOPE-019 Requirement 4 (Unified Command Gateway)

> SCOPE-019 is a "Requirement N" document from April 2026 and cannot pass the createSpecs gate as a
> whole (it scores 36). The owner chose, on 2026-10-25, to track Amendment B's work directly under
> SPEC-019. This spec restates Amendment B in the gate's shape. The scope document's
> **Amendment B** section, Requirement 4 AC6–AC14, is authoritative.

## Overview

A help flag never runs a command, and an unknown option never writes. `--help` or `-h` anywhere on
a kit command line prints that command's help and exits without dispatching. A write command given
an option it does not declare refuses before any network call. dbpush has one option parser, and
`--scope` works through the gateway. The hosted MCP's write tools reject input fields they do not
declare.

## Business Problem

On 2026-10-19 a customer team's Claude session ran `wxkanban-agent dbpush --help` to read the
options, and it ran a real push. About 45 duplicate documents were created and about 20 were
overwritten. It reproduced on wxKanban itself on 2026-10-25. The defect class appears in 48 feedback
reports from 14 companies since June, 22 of them still open from 7 companies.

The code, as verified on 2026-10-25:

- `cli.ts:301` treats help as help only when it is the first argument. After a command name,
  `--help` becomes an option and the command is dispatched.
- `dbpush.ts:1039-1056` silently drops every option it does not recognise.
- Through the gateway, dbpush drops `--scope`, so `dbpush --scope 017` pushes every spec.
- `--skip-lifecycle` is read nowhere.
- The buildscope worker forwards every key it is given.
- No hosted MCP input schema is strict, so a misspelled field on a write tool is silently dropped
  and the write goes ahead.

## Actors

- Primary: Kit user running kit commands, including the AI session typing them on the user's behalf
- Secondary: Kit maintainer releasing the kit, Cockpit and hosted MCP; customer teams with open reports in this defect class

## Success Metrics

1. 0 hub writes from any of `dbpush --help`, `dbpush -h`, `dbpush --helo`, `buildscope --help`, `implement NNN --help` and `kit:configure --help`, measured by a recording endpoint in 6 of 6 real-path tests.
2. `dbpush --scope NNN` through the gateway pushes exactly 1 spec. Today it pushes every spec.
3. 100% of hosted MCP write tools refuse an undeclared input field with InvalidParams, confirmed by a live probe of the deployed server, while 0 calls from deployed kits break: the envelope keys `projectId`, `projectid` and `_` are allowed.
4. A bare `--help` outside a configured project exits 0 and prints the command list in 1 of 1 test. Today it throws.

## Scope Boundary

- The help-flag rule in `cli.ts` and in `WorkflowEngine.dispatch`, which covers both the CLI and HTTP gateways.
- A per-command option registry that drives the help text and the unknown-option refusal.
- One dbpush parser.
- The buildscope worker forwarding only declared options.
- Strict write-tool schemas at the hosted MCP dispatch point, including the test-lifecycle tools.
- Real-path regression tests.
- Release order: kit before server.

## Out of Scope

- dbpush defaulting to a dry run (group 3 topic, the customer's runbook).
- Undo, version history, and pulling web-created scopes down (group 1 topic, the push-only model).
- Strict schemas on read tools.
- Document identity, retire, and spec numbering — SCOPE-124 Amendment C.
- Surgical buildscope edits — SCOPE-135 Amendment B.

## Integration Context

The kit command gateway (`wxkanban-agent/apps/command-gateway/src/cli.ts`, `http.ts`) and
`core/orchestrator/workflow-engine.ts` are owned by SCOPE-019 Requirement 4. dbpush
(`wxkanban-agent/dbpush.ts`) is shared with SCOPE-124, whose Amendment C changes what dbpush writes;
this spec changes only how dbpush reads its options. The hosted MCP dispatch point
(`mcp-server/src/server.ts`) is shared with every tool's owning scope, so the strict check sits in
front of the tool switch and changes no tool's own behavior. The SessionStart hook in
`.claude/settings.json` runs a bare `cli.ts --help` and relies on its update checks.

## User Scenarios & Testing

### US1 — An AI session asks dbpush for its options

**Actor**: Kit user's AI session

**Scenario**:
1. The session runs `wxkanban-agent dbpush --help`.

**Expected outcome**: dbpush's options are printed, with a note that it writes. The command exits 0 and nothing is pushed.

### US2 — A typo on a write command

**Actor**: Kit user

**Scenario**:
1. The user runs `wxkanban-agent dbpush --dryrun` (a misspelling of `--dry-run`).

**Expected outcome**: The command refuses before any network call, names `--dry-run` as the nearest valid option, and exits non-zero. Nothing is pushed.

### US3 — A deployed older kit after the server ships strict schemas

**Actor**: Kit user on a kit release that predates this spec

**Scenario**:
1. The old kit calls `project.update_task`, adding `projectId` as it always has.

**Expected outcome**: The call succeeds, because `projectId` is an allowed envelope key. A call carrying a genuinely unknown field is refused with InvalidParams naming that field.

## Data Requirements

None. This spec makes no schema change.

## API Routes

None. No HTTP routes change. The MCP tool contracts change only to refuse undeclared input fields on write tools (FR-005).

## Frontend Components

None.

## Functional Requirements

### FR-001 — A help flag never dispatches a command (R4 AC6–AC8)

`--help` or `-h` anywhere on a command line that names a command prints that command's help and
exits 0. There is no dispatch, no network call and no file write. This applies to every command,
including `kit:configure` and `implement <scope>` batch mode. The rule is enforced in `cli.ts` before
option parsing and in `WorkflowEngine.dispatch`. A bare `--help` prints the command list, including
outside a configured project, and keeps its session-start update checks.

**Acceptance Criteria**:
- [ ] Each command named in Success Metric 1 exits 0 with zero hub writes and zero file writes.
- [ ] HTTP `/dispatch` with a `help` input does not run the command.
- [ ] A bare `--help` outside a configured project prints the list without throwing.

### FR-002 — One option registry per command (R4 AC9)

Every command declares its options in one registry: name, value type, and whether the command writes.
The registry is the source of the per-command help text.

**Acceptance Criteria**:
- [ ] Every write command listed in the scope's Amendment B has a registry entry.
- [ ] Help output is generated from the registry.

### FR-003 — Unknown options refused before any network call (R4 AC10, AC12)

A write command given an option outside its registry exits non-zero before any network call, naming
the valid options and the nearest match. A read-only command warns and continues. The buildscope
worker forwards only the options it declares.

**Acceptance Criteria**:
- [ ] `dbpush --helo` exits non-zero, names `--help`, and makes 0 network calls.
- [ ] The buildscope worker sends no `help` or `_` key.

### FR-004 — dbpush has one option parser (R4 AC11)

One parser is shared by `dbpush.ts` and the gateway. `--scope` is honoured on both paths.
`--skip-lifecycle` is either implemented or removed from the parser and from
`_wxAI/commands/dbpush.md`. The unknown-option refusal happens before the first network call, dry run
included.

**Acceptance Criteria**:
- [ ] `wxkanban-agent dbpush --scope NNN` pushes only NNN.
- [ ] `--skip-lifecycle` has a tested effect, or it is gone.

### FR-005 — Hosted MCP write tools reject undeclared fields (R4 AC13)

The check runs at the tool dispatch point in `mcp-server/src/server.ts`, from a tool-name → schema
map, and returns InvalidParams that names the field. It covers the test-lifecycle tools. The envelope
keys `projectId`, `projectid` and `_` are allowed; `help` is not one. Each write tool's ListTools
schema advertises `additionalProperties: false`.

**Acceptance Criteria**:
- [ ] An unknown field on `project.upsert_document` is refused by the deployed server.
- [ ] A deployed kit's call carrying `projectId` to `update_task` still succeeds.

### FR-006 — Real-path regression tests (R4 AC14)

The tests run through the CLI entry point and the MCP HTTP endpoint, not through unit tests of a
parser. Each one is shown to fail without its fix.

**Acceptance Criteria**:
- [ ] All 6 help-flag cases and the `--scope` case run through the CLI against a recording endpoint.
- [ ] A live probe after deploy is recorded in this spec's evidence.

## Open Questions

None open. The owner decided on 2026-10-25 that a bare `--help` keeps its session-start update
checks.

## Clarifications

| # | Question | Decision |
|---|----------|----------|
| 1 | Why does this spec restate an amendment rather than the whole scope? | SCOPE-019 cannot pass the gate as a whole. The owner chose to track Amendment B's tasks directly under SPEC-019 (2026-10-25). |
| 2 | Release order? | Kit and Cockpit first, then the server (T007). |
