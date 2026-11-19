<!--
  Code Fencing Convention — paste this block into your project's CLAUDE.md.
  Source: wxkanban-agent kit, spec 026.
-->

## Code Fencing Convention

Every code unit in this repository is wrapped with a single-line BEGIN/END
comment fence that names the spec + task that authored it:

```ts
// [SCOPE 013 / T042] BEGIN — Audit log retention pruning
export function pruneAuditLogs(...) { ... }
// [SCOPE 013 / T042] END
```

**Rules:**

1. Every top-level function, class, route handler, Drizzle table, React
   component, and SQL migration body must be fenced. Un-fenced code is a
   defect.
2. Fences are written by the orchestrator only. Never hand-author or
   hand-edit them.
3. Later tasks that **modify** an existing fenced block add a `MODIFIED-BY`
   line just after `BEGIN`:
   ```ts
   // [SCOPE 013 / T042] BEGIN — Audit log retention pruning
   // [SCOPE 015 / T011] MODIFIED-BY — added soft-delete branch
   ```
4. Tasks that **fully replace** a fenced unit (≥ 80% line change) rewrite
   the fence under the new task's name, with a `(replaces N/Tn)` suffix.
5. JSON files are exempt — fencing is suppressed for `.json`.

**Workflow:**

- Run `wxkanban-agent implement <scope>/<task>` to add or modify code.
- Run `wxkanban-agent auditfences` before pushing — exit 0 means clean.
- If you see un-fenced code, that is evidence the change was made outside
  the orchestrator. Remediate by routing the change through `implement`.

**Reference:** spec 026 (Code Fencing) in the kit's docs/fencing.md.
