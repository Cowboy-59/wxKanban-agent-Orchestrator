# Bug report: createspecs dispatcher + CLI gaps

**Date filed**: 2026-04-24
**Filed against**: spec 019 (Agent Orchestrator Kit)
**Surfaced during**: `/buildscope --edit 025` and `createspecs 025` session
**Severity**: medium — blocks routing spec creation through the canonical CLI path; worked around with a direct-import wrapper

---

## Summary

Three independent gaps in the orchestrator kit were surfaced while running the Design-stage workflow (`buildscope --edit` → `createspecs`) for spec 025. Each blocks the canonical CLI path; combined, they forced the entire session through in-conversation + direct-import workarounds.

## Gap 1 — `createspecs` handler is not wired into `WorkflowEngine.dispatch`

**Location**: [`wxkanban-agent/core/orchestrator/workflow-engine.ts:122-134`](../../../wxkanban-agent/core/orchestrator/workflow-engine.ts)

The dispatch `switch` handles only `'buildscope'` and `'dbpush'`. The `createspecs` command is listed in `AllowedCommandsByStage[Design]` and has a fully implemented handler at [`wxkanban-agent/core/orchestrator/command-handlers/createspecs.ts`](../../../wxkanban-agent/core/orchestrator/command-handlers/createspecs.ts), but the dispatcher falls through to the `default` case and returns:

```
No handler registered for command 'createspecs'
```

### Reproduce
```bash
npx tsx wxkanban-agent/apps/command-gateway/src/cli.ts createspecs --specNumber "025" --featureName "Test"
# → {"status": "error", "error": "No handler registered for command 'createspecs'"}
```

### Suggested fix
Add a `runCreateSpecs` static method to `WorkflowEngine` (pattern-match `runBuildScope` / `runDbPush`) and wire it into the dispatch switch:

```ts
case 'createspecs':
  return WorkflowEngine.runCreateSpecs(context, input as CreateSpecsArgs, user);
```

## Gap 2 — CLI cannot carry scope content in argv (Windows)

**Location**: [`wxkanban-agent/apps/command-gateway/src/cli.ts:95-110`](../../../wxkanban-agent/apps/command-gateway/src/cli.ts)

The CLI parses `--key value` pairs from `process.argv`. `createspecs --scopeContent "<content>"` for any realistic scope (>~30 KB on Windows) fails with:

```
/c/Program Files/nodejs/npx: line 65: /c/Program Files/nodejs/node.exe: Argument list too long
```

Windows `CreateProcess` argv limit is ~32,768 chars; spec 025's content is ~50 KB.

### Suggested fix
Add a `--scopeFile <path>` flag that reads content from disk, OR accept scope content on stdin when `--scopeContent -` is passed. Either approach sidesteps the argv limit and is portable across platforms.

## Gap 3 — `buildscope --edit NNN` interactive flow is a non-interactive stub

**Location**: [`wxkanban-agent/core/orchestrator/command-handlers/buildscope.ts:8-11`](../../../wxkanban-agent/core/orchestrator/command-handlers/buildscope.ts)

The `promptUser` function at the top of the handler returns the default value unconditionally:

```ts
async function promptUser(question: string, defaultValue?: string): Promise<string> {
	console.log(question + (defaultValue ? ` [default: ${defaultValue}]` : ''));
	return defaultValue || '';
}
```

As a result, running `buildscope --edit 025` produces a non-interactive execution that auto-approves every section — completely defeating the core value proposition of buildscope (the section-by-section BA review). The canonical command spec at `_wxAI/commands/buildscope.md` documents an interactive Edit Mode flow, but the orchestrator handler never implements it.

### Suggested fix
Either:
- **(a)** Make `promptUser` integrate with a real stdin prompt (e.g., `readline` or `@inquirer/prompts`) and mark buildscope as interactive-only in the HTTP gateway (incompatible with HTTP mode).
- **(b)** Return a structured "waiting for user input" state from the handler that the CLI/HTTP layer streams back to the caller, enabling interactive operation in-conversation (which is how buildscope was actually intended to be used, per `_wxAI/commands/buildscope.md`).

**(b)** is the more flexible design — matches how the conversational flow works in practice and doesn't require each caller to re-implement stdin handling.

## Workarounds used during this session

- **Gap 3**: Ran the interactive Edit Mode flow in-conversation per the canonical `_wxAI/commands/buildscope.md` command file, producing the approved 025 scope ([`specs/Project-Scope/025-project-overview-builder.md`](../../Project-Scope/025-project-overview-builder.md)).
- **Gaps 1 + 2**: Wrote a one-off wrapper at [`wxkanban-agent/scripts/run-createspecs-025.ts`](../../../wxkanban-agent/scripts/run-createspecs-025.ts) that reads the scope from disk and imports `handleCreateSpecs` directly, bypassing `WorkflowEngine.dispatch`. Audit record written manually to [`specs/025-project-overview-builder/audit-createspecs.json`](../../025-project-overview-builder/audit-createspecs.json).

## Impact

- Spec authors currently cannot route `createspecs` through the canonical CLI path for any spec whose scope content exceeds ~30 KB (which is most substantive scopes).
- The documented interactive value of `/buildscope --edit` is not actually available from the CLI — only from in-conversation invocation.
- Audit records for `createspecs` runs must be written by each wrapper separately, rather than by the dispatcher's standardized audit layer.

## Recommended priority order

1. **Gap 1 first** (5-line fix) — unblocks CLI use of `createspecs` for small scopes immediately.
2. **Gap 2 second** — `--scopeFile` flag is a small addition once Gap 1 is fixed.
3. **Gap 3 last** — larger design decision about how interactive commands fit into the CLI/HTTP/MCP layering.
