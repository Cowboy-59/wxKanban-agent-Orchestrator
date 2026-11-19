# Code Fencing Convention

**Source**: spec 026 (Code Fencing — Spec/Task Traceability Markers).

Every code unit in a wxKanban-agent-managed repository is wrapped with a single-line BEGIN/END comment fence that names the spec and task that authored it:

```ts
// [SCOPE 013 / T042] BEGIN — Audit log retention pruning
export function pruneAuditLogs(...) { ... }
// [SCOPE 013 / T042] END
```

Fences make spec→code lineage greppable, support audit reports, and reveal work that bypassed the orchestrator.

## What counts as a "code unit" (FR-002)

A fence wraps exactly one of:

- An exported or top-level function declaration
- A class declaration (the fence wraps the entire class; methods inherit)
- An Express route handler registration (`app.get(...)`, `router.post(...)`, etc.)
- A Drizzle schema table export (`pgTable(...)`)
- A SQL migration file's top-level statement block (one fence per file)
- A React component declaration (function or class)

Statement-level fencing inside an existing function is forbidden. If a task's work cannot be expressed as one of the above units, the task is split during `createtesttasks` / `implement` planning.

## Per-language comment syntax (FR-005)

| Extension | Fence comment | Notes |
|-----------|---------------|-------|
| `.ts` `.tsx` `.js` `.jsx` `.mjs` `.cjs` | `//` | JSX bodies use `{/* ... */}` |
| `.sql` | `--` | One fence wraps the whole migration body |
| `.css` `.scss` | `/* ... */` | |
| `.md` | `<!-- ... -->` | |
| `.yaml` `.yml` | `#` | |
| `.html` | `<!-- ... -->` | |
| `.json` | **skipped** | JSON forbids comments; `auditfences` exempts these |

Unknown extensions cause `auditfences` to emit an error rather than silently skip.

## MODIFIED-BY rule (FR-003)

A later task that **partially** modifies code inside an existing fence adds a single `MODIFIED-BY` line just below the `BEGIN`:

```ts
// [SCOPE 013 / T042] BEGIN — Audit log retention pruning
// [SCOPE 015 / T011] MODIFIED-BY — added soft-delete branch
export function pruneAuditLogs(...) { ... }
// [SCOPE 013 / T042] END
```

- Multiple `MODIFIED-BY` lines stack in chronological order (oldest first).
- More than 5 `MODIFIED-BY` lines triggers a warning from `auditfences` (refactor candidate).

## Full-replacement rule (FR-004)

When a task replaces a fenced unit entirely (≥ 80% non-whitespace line change), the orchestrator removes the old fence and writes a new one in the new task's name, with a `(replaces N/Tn)` suffix:

```ts
// [SCOPE 015 / T055] BEGIN — Audit log retention pruning (replaces 013/T042)
export function pruneAuditLogs(...) { ... }
// [SCOPE 015 / T055] END
```

A row is appended to `taskfencehistory` recording the ownership transfer. The 80% threshold is overridable via `implement --replace` / `--modify`.

## Drift detection (FR-010)

Every fenced body's SHA-256 is recorded in `taskfences.contenthash`. When `implement` next runs against a file, it recomputes the hash of each fenced body; mismatch → the orchestrator refuses to write and reports the drift, unless `--accept-drift` is passed.

This catches hand-edits that bypass the orchestrator — turning an "invisible" violation into a loud one.

## Who writes fences

Only the orchestrator writes fences:

- `implement <scope>/<task>` — production code, tests, route handlers, schema files
- `createtesttasks <scope>` — generated test functions
- The migration generator invoked by `dbpush` — one fence per migration file
- `runqa` — regression test scaffolds

Hand-authoring or hand-editing fence comments is forbidden by policy. If you see un-fenced code, that is evidence the change happened outside the orchestrator — remediate by routing it through `implement`.

## `auditfences` — verifying the invariant

Run before any push:

```
wxkanban-agent auditfences
```

Exit codes:

- `0` — clean.
- `1` — at least one error-class finding (un-fenced declaration, unknown task ID, malformed fence).
- `2` — internal failure.

Flags:

- `--strict` — promote warnings to errors (use in CI).
- `--format json` — machine-readable output for CI integration.
- `--baseline` — one-time at kit upgrade: captures the current tree's content hashes into `taskfenceslegacy` so existing pre-fencing code is reported as `info`, not error.
- `--history <scope>/<task>` — print the ownership timeline for a task (joins `taskfences` ∪ `taskfencemodifications` ∪ `taskfencehistory`).
- `--path <dir>` — scan a subtree only.

Drop-in CI step lives at `templates/auditfences-github-action.yml`.

## Backwards compatibility for existing codebases

Most code in a repo upgrading to spec 026 is un-fenced. Without intervention `auditfences` would flag thousands of legacy files.

The supported migration path:

1. Upgrade the kit to v0.2.0 or later.
2. Run `wxkanban-agent dbpush` once — this applies the bundled migration that creates `taskfences` + friends in the consumer's `DATABASE_URL`.
3. Run `wxkanban-agent auditfences --baseline` — captures the current tree's hash set into `taskfenceslegacy`.
4. From then on, `auditfences` reports legacy un-fenced declarations as `info` (not error), and any **new** un-fenced declaration as an `error`. CI can safely enable `--strict`.

Retroactive fencing of legacy code is a follow-on scope, not part of spec 026.

## Bootstrap exception

The kit code that implements fencing itself (the orchestrator modules under `wxkanban-agent/core/orchestrator/`) is un-fenced at v0.2.0 because the fence-emitter cannot fence itself before it exists. Run `auditfences --baseline` after kit install to absorb these as legacy.

## See also

- Command reference: [`implement.md`](implement.md)
- Spec 026: `specs/026-CodeFencing/spec.md`
- Bundled migration: `templates/migrations/0001-026-codefencing.sql`
- CI template: `templates/auditfences-github-action.yml`
- CLAUDE.md snippet for consumer repos: `templates/CLAUDE.md.fencing-snippet.md`
