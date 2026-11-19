# Drift Audit — Mechanical Recipes

Drift is the residue of incomplete refactors. A function is renamed, a script is deleted, a runtime contract is changed — but one caller or one sibling spec wasn't updated. The codebase still compiles under loose validation (dev watcher, type-only IDE checks) but breaks under strict validation (production build, CI, fresh setup on another machine).

This file is the mechanical complement to the deepening exploration in [SKILL.md](SKILL.md). Run all four checks at the start of every architecture review. Each check has a concrete recipe — no judgment required.

---

## Check 1 — Dangling-reference sweep

**What it catches**: callers that still reference a deleted or renamed named entity. Example incident: spec `019` Slice removed `build:http` from `mcp-server/package.json`; `scripts/setup-mcp.mjs` kept calling `npm run build:http`; broken until a fresh setup run surfaced it.

**Inputs**: the list of entities deleted or renamed in the recent refactor diff. Get these from `git log --diff-filter=D --name-status` and from manual inspection of any `**Deleted**` rows in the spec's Files table.

For each entity in the deletion list:

| Entity type | How to find referrers |
|---|---|
| npm script | `grep -rn "npm run <name>\|npm-run-all .*<name>\|\"<name>\":" --include="*.json" --include="*.sh" --include="*.mjs" --include="*.yml" --include="*.md"` |
| Exported symbol (`fn`, class, const, type) | `grep -rn "from .*<file-stem>\|require(.*<file-stem>\|import .* <name>" --include="*.ts" --include="*.tsx" --include="*.js"` |
| Environment variable | `grep -rn "<VAR_NAME>" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.mjs" --include="*.sh" --include="*.yml" --include="*.env*"` |
| File path used as a string | `grep -rn "<deleted/path>" --include="*.ts" --include="*.json" --include="*.md"` |
| DB table or column | `grep -rn "<table_name>" --include="*.ts" --include="*.sql"` against schema + raw-SQL strings + Drizzle table refs |
| Fence ID / scope tag | `grep -rn "\[SCOPE <NNN>\]\|<spec-slug>" --include="*.ts" --include="*.tsx"` |
| HTTP route / event name | grep across server routes, client `fetch`/`axios` calls, event emitters, and OpenAPI files |

**Output**: a list `{entity, referrer-file:line, current-call-form}`. Any non-empty result is a defect.

**Subtle case**: an entity may have been renamed (not deleted). The dangling reference is to the **old** name. Always sweep for the old name post-rename, even if the new name appears everywhere else.

---

## Check 2 — Cross-package source-import audit

**What it catches**: a consumer imports a sibling package's `.ts` source via a relative `../` path. Works under dev tooling that ignores package boundaries (`tsx watch`, `ts-node`) but breaks under strict `tsc` when the consumer's `rootDir` is restricted to its own `src/` — or when the sibling ships compiled `.d.ts` and TypeScript's NodeNext resolver picks `.ts` ahead of `.d.ts`.

**Recipe**:

1. Find every TS import that traverses out of the package: `grep -rn "from ['\"]\\.\\./\\.\\." --include="*.ts" --include="*.tsx"`. Two or more `..` segments is the signal.
2. For each hit:
   - Resolve the target path. If it lands inside a sibling top-level package (`mcp-server/`, `wxkanban-agent/`, `src/client/`, `src/server/`, etc.), this is a cross-package import.
   - Open the importing package's `tsconfig.json`. If `rootDir` is set and the resolved target is outside it, this import is **build-fragile**.
3. For each fragile import, the fix is one of:
   - Consume the sibling's compiled output via a published package (`node_modules`) entry.
   - Add a TypeScript project reference (`composite: true` on the producer; `references: [...]` on the consumer).
   - Introduce a thin local wrapper in the consumer's own `src/` that loads the sibling at runtime via `createRequire`, keeping the type surface local.

**Output**: a list `{importer-file:line, import-specifier, target-package, importer-rootDir, suggested-fix}`. Any non-empty result is a defect.

**Validation**: an import that traverses into a sibling but the importer has no `rootDir` restriction is not flagged. Likewise an import into a sibling that ships `.d.ts` but **does not also ship `.ts` next to it** (so NodeNext picks `.d.ts`) is not flagged — though it's still a smell.

---

## Check 3 — Build-mode coverage

**What it catches**: changes that compile under the dev watcher but fail under the production build, because the two run different TypeScript configurations or different file-set discovery.

**Common dev/build divergences**:

| Dev tool | Production build |
|---|---|
| `tsx watch` | `tsc` |
| `ts-node` | `tsc` |
| Vite dev | Vite build |
| Next dev | Next build |

The dev tools typically relax `rootDir`, skip some strict checks, or follow imports anywhere. The production build enforces every constraint.

**Recipe**:

1. Identify the production build command for every package touched by the diff. Usually `npm run build` in each affected `package.json`. If a package has both `build` and `build:*` variants, run all of them.
2. Run each from a clean state (delete `dist/` if cheap; otherwise just re-run).
3. A green dev watcher does NOT substitute. Treat dev-only validation as untested.

**When this applies**: any commit that modifies `.ts`/`.tsx` files, `tsconfig*.json`, or shared types. Not just refactors — also new features and dependency bumps.

**Output**: build status per package. Anything but green is a defect.

---

## Check 4 — Spec-interaction conflict scan

**What it catches**: two specs each define behavior on the same shared runtime concept, without either spec referencing the other. Example incident: spec `019 R18` added a detached-spawn pattern for the MCP server; spec `027 T008` independently added a parent-watcher that exits the MCP when its parent PID dies. Each is correct in isolation; together they make every local setup-mcp run die within seconds.

**Shared runtime concepts** (this list grows as the project does):

- Process lifecycle (spawn, signal handling, shutdown, watchdog, ppid)
- TCP ports and port-allocation policy
- Environment variables (especially scoped prefixes like `MCP_*`, `KIT_*`, `WXKANBAN_*`)
- Database tables and columns
- HTTP routes and event names
- File paths used as runtime contracts (PID files, lock files, sockets, runtime-state JSON)
- Fence ID and scope-tag format
- LifecycleStage value strings (enum-vs-DB drift is a recurring failure mode)

**Recipe**:

1. For each shared concept touched by the recent spec, search `specs/**/*.md` (and `wxkanban-agent/docs/adr/*.md`) for any other spec that mentions the same concept. Grep examples:
   - `grep -rln "KIT_PARENT_PID\|parent.*pid\|parent-watcher" specs/`
   - `grep -rln "MCP_HTTP_PORT\|HTTP_PORT" specs/`
   - `grep -rln "LifecycleStage\|projectphases" specs/`
2. Read the conflicting spec's intent. If it asserts behavior the recent spec contradicts (or vice versa), that's a defect.
3. Note especially **environment asymmetries**: behavior that's correct in production (e.g., PID 1 auto-skip) but wrong on dev machines, or vice versa. Either spec should call out the asymmetry explicitly.

**Output**: a list `{concept, recent-spec, conflicting-spec, conflict-summary}`. Any non-empty result is a defect.

**Output discipline**: a "conflict" requires a contradictory assertion, not just two specs mentioning the same name. If both specs agree, no defect.

---

## Reporting

Report drift findings as a flat numbered list, each item one to three sentences:

```
1. Dangling reference: scripts/setup-mcp.mjs:294 calls `npm run build:http`,
   deleted in commit fe7421e. Fix: swap to `npm run build`.

2. Cross-package source import: mcp-server/src/server.ts:82 imports from
   `../../wxkanban-agent/core/policy/adapters/mcp-adapter.js`. The kit
   ships .ts next to .d.ts; TS prefers .ts; mcp-server's rootDir is
   ./src. Fix: thin wrapper in mcp-server/src/utils/ that loads the kit
   via createRequire.

3. Build-mode gap: changes to mcp-server/src/server.ts were validated
   under `tsx watch` but `npm run build` was never re-run. Re-run.

4. Spec interaction: spec 027 T008 parent-watcher kills the MCP when
   its parent PID dies; spec 019 R18 spawns MCP detached with the setup
   script as parent — parent always dies in seconds on local dev.
   Production (PID 1) auto-skips per watcher code, so prod is fine.
   Either spec should document the asymmetry; recommend `MCP_SKIP_PARENT_WATCHER`
   default in dev env.
```

Then stop. The deepening exploration is a separate phase — drift findings should not be bundled with deepening proposals.
