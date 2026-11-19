# Bug report: CLI never passes SpecVerification to dispatch — every spec-gated command hard-blocks

**Date filed**: 2026-05-14
**Filed against**: spec 019 (Agent Orchestrator Kit)
**Surfaced during**: Spec 028 Phase 1 startup — first attempt to run `wxkanban-agent implement 028/T001`
**Severity**: high — blocks **every** spec-gated command (`implement`, `createtesttasks`, `runqa`, `runhuman`, `prepareRelease`, `finalizeRelease`) from the CLI entry point
**Status**: fixed in this commit — see `apps/command-gateway/src/spec-verification.ts` + `cli.ts`

---

## Summary

`WorkflowEngine.dispatch` accepts a fifth `options: DispatchOptions` argument that carries `specVerification` and `override` payloads. `CommandPolicyEngine.evaluateSpecFirst` requires `specVerification` to be present and truthy on its three fields (`specExists`, `tasksExist`, `documentsExist`) before any spec-gated command will execute. The CLI at `apps/command-gateway/src/cli.ts:146` calls `dispatch(context, command, rawOptions, user)` — only four arguments. `DispatchOptions` is `undefined` for every CLI invocation, so `specVerification` is always `undefined`, and `evaluateSpecFirst` returns:

```
IMPLEMENTATION BLOCKED - DATABASE VERIFICATION FAILED
Spec verification not performed. Run spec check before implementation.
```

Force override does NOT bypass: `command-policy.ts:120` returns `allowed: false` even when `override.force && override.reason` are set — it only logs the escalation.

## Reproduce

```bash
# From the repo root, against any existing spec with spec.md + tasks.md + plan.md:
npx tsx wxkanban-agent/apps/command-gateway/src/cli.ts implement 028/T001 --dry-run
# → {"status":"error","error":"IMPLEMENTATION BLOCKED - DATABASE VERIFICATION FAILED ..."}
```

## Root cause

| Location | Issue |
|---|---|
| [`wxkanban-agent/apps/command-gateway/src/cli.ts:146`](../../../wxkanban-agent/apps/command-gateway/src/cli.ts#L146) | Calls `dispatch` with four args; never builds or passes `DispatchOptions` |
| [`wxkanban-agent/core/orchestrator/workflow-engine.ts:207`](../../../wxkanban-agent/core/orchestrator/workflow-engine.ts#L207) | `dispatch` correctly forwards `options?.specVerification` to `evaluateSpecFirst`, but `options` is `undefined` from the CLI |
| [`wxkanban-agent/core/policy/command-policy.ts:101`](../../../wxkanban-agent/core/policy/command-policy.ts#L101) | `evaluateSpecFirst` hard-blocks when `specVerification` is `undefined` — by design, but with no producer in the CLI path it is **always** undefined |

The HTTP gateway (`apps/command-gateway/src/http.ts`) has the same gap if it doesn't accept `specVerification` from the request body — needs follow-up audit.

## Fix applied

Two-part fix scoped to the CLI app:

1. New module [`wxkanban-agent/apps/command-gateway/src/spec-verification.ts`](../../../wxkanban-agent/apps/command-gateway/src/spec-verification.ts):
   - `extractScopeNumber(command, rawOptions)` — pulls a 3-digit scope number from `implement`'s positional `NNN/Tnnn`, `--target`, or any of `--spec`, `--specNumber`, `--scope`, `--scopeNumber` flags.
   - `findScopeDir(specsRoot, scopeNumber)` — locates `specs/NNN-*/` for the scope.
   - `buildSpecVerification(scopeNumber, projectRoot)` — returns `{ specExists, tasksExist, documentsExist }` based on filesystem presence of `spec.md`, `tasks.md`, `plan.md` inside the scope dir.

2. [`apps/command-gateway/src/cli.ts`](../../../wxkanban-agent/apps/command-gateway/src/cli.ts) `main()` now:
   - Calls `extractScopeNumber` + `buildSpecVerification` before dispatching.
   - Passes `{ specVerification }` as the new fifth argument to `WorkflowEngine.dispatch`.
   - Does nothing when no scope is detectable — non-spec-gated commands (`buildscope`, `dbpush`, `auditfences`, `kit:status`) continue to work unchanged.

### Why filesystem-based verification is the right shape

The `implement` handler ([`command-handlers/implement.ts:70`](../../../wxkanban-agent/core/orchestrator/command-handlers/implement.ts#L70)) already reads spec artifacts from disk via `loadSpecBundle(specsRoot, scope)`. The gate's job is to refuse the call if those artifacts aren't authored yet. Disk presence is the most direct signal for that — no DB round-trip, no separate sync step, no chicken-and-egg with `dbpush` (which is *not* in `SPEC_GATED_COMMANDS`).

If the DB-side verification (spec rows present in `projectdocuments`) is also wanted, that's a separate layer: the kit's MCP client can read the DB status and merge it into `SpecVerification` before dispatch. For now, the filesystem check is sufficient — and matches the intent of the existing `loadSpecBundle` path.

### Tests

[`wxkanban-agent/tests/unit/cli-spec-verification.test.ts`](../../../wxkanban-agent/tests/unit/cli-spec-verification.test.ts) — 11 cases covering scope extraction (positional, --target, --spec/--specNumber/--scope/--scopeNumber, non-string values) and verification building (missing dir, partial artifacts, all-present).

All pass: `cd wxkanban-agent && npm test -- cli-spec-verification`.

### End-to-end verification

Before the fix:
```
$ npx tsx wxkanban-agent/apps/command-gateway/src/cli.ts implement 028/T001 --dry-run
{"status":"error","error":"IMPLEMENTATION BLOCKED - DATABASE VERIFICATION FAILED ..."}
```

After the fix:
```
$ npx tsx wxkanban-agent/apps/command-gateway/src/cli.ts implement 028/T001 --dry-run
{"status":"error","error":"implement exited 3: AI response is not valid JSON ..."}
```

The gate now passes (spec 028 has `spec.md`, `tasks.md`, `plan.md` on disk). The new failure is a downstream layer (AI client returning empty response) — separate bug, separate report.

## Out-of-scope follow-ups

1. **HTTP gateway audit** — confirm `apps/command-gateway/src/http.ts` either accepts `specVerification` from the request or builds it the same way.
2. **DB-aware verification** — for environments where the kit is configured against a hosted MCP, optionally fetch verification from the MCP server (`GET /spec-verify?scope=NNN`) and merge with the filesystem signal.
3. **Force-override semantics** — `evaluateSpecFirst` currently logs `[AUDIT][ESCALATION]` but does NOT allow the command through. If that's intentional (per the comment at `command-policy.ts:118`), document it in `_wxAI/commands/wxAI-pipeline-mandatory-database.md`. If not, wire the override to actually flip `allowed: true` and log accordingly.

## Impact on memory note

The persisted note "Orchestrator CLI broken for buildscope --edit + createspecs + dbpush + implement" should be revised:
- `implement` — fixed by this commit (gate now passes).
- `createspecs` — separate bug, dispatcher wiring (filed 2026-04-24).
- `dbpush` — not actually spec-gated; whatever was broken is a different layer (likely the same TTY-prompt issue noted in `reference_drizzle_migration_apply.md`).
- `buildscope --edit` — separate bug, interactive prompt stub (filed 2026-04-24, Gap 3).
