# Drift Audit — Mechanical Recipes for Refactor Hygiene

> **Audience:** kit maintainers and consumers planning a refactor or merging a Slice.
> **Companion:** `.claude/wxICA/SKILL.md` Process Step 0.

Drift is the residue of incomplete refactors. A function is renamed, a script is deleted, a runtime contract is changed — but one caller or one sibling spec wasn't updated. The codebase still compiles under loose validation (dev watcher, type-only IDE checks) but breaks under strict validation (production build, CI, fresh setup on another machine).

Run all four checks at the start of every architecture review and at the end of every refactor Slice. Each check has a concrete recipe — no judgment required.

---

## Why this doc exists

Three real defects shipped between v0.6.0 and v0.6.1, all of the same shape — a refactor created an inconsistency with another surface that wasn't in the refactor's diff:

| # | Defect | Class |
|---|---|---|
| 1 | `scripts/setup-mcp.mjs` called `npm run build:http`, deleted in v0.6.0 work commit `fe7421e` | Dangling caller (npm script) |
| 2 | `mcp-server/src/server.ts` imported `../../wxkanban-agent/core/policy/adapters/mcp-adapter.js`; `tsc` failed with TS6059 under mcp-server's `rootDir: "./src"` because the kit ships `.ts` next to `.d.ts` and NodeNext prefers `.ts` | Cross-package source import under restrictive `rootDir` |
| 3 | spec 027 T008 parent-watcher kills the MCP whenever spec 019 R18's detached-spawn pattern is used (production PID 1 auto-skip masks it) | Spec-interaction conflict on process lifecycle |

A separate process gap amplified all three: validation under `tsx watch` is not the same as validation under `npm run build`. Each defect was easy to fix once seen, hard to see if you weren't looking. This recipe makes the looking mechanical.

---

## Check 1 — Dangling-reference sweep

**What it catches**: callers that still reference a deleted or renamed named entity.

**Inputs**: every entity deleted or renamed in the recent diff. Get these from `git log --diff-filter=D --name-status` and from manual inspection of `**Deleted**` rows in any touched spec's Files table.

For each entity:

| Entity type | How to find referrers |
|---|---|
| npm script | `grep -rn "npm run <name>\|\"<name>\":" --include="*.json" --include="*.sh" --include="*.mjs" --include="*.yml" --include="*.md"` |
| Exported symbol | `grep -rn "from .*<file-stem>\|import .* <name>" --include="*.ts" --include="*.tsx" --include="*.js"` |
| Environment variable | `grep -rn "<VAR_NAME>" --include="*.ts" --include="*.mjs" --include="*.sh" --include="*.yml" --include="*.env*"` |
| File path used as a string | `grep -rn "<deleted/path>" --include="*.ts" --include="*.json" --include="*.md"` |
| DB table / column | `grep -rn "<table_name>" --include="*.ts" --include="*.sql"` |
| Fence ID / scope tag | `grep -rn "\[SCOPE <NNN>\]\|<spec-slug>" --include="*.ts" --include="*.tsx"` |
| HTTP route / event name | grep across server routes, client `fetch`/`axios`, event emitters, OpenAPI |

**Output**: `{entity, referrer-file:line, current-call-form}` per hit. Any non-empty result is a defect.

**Subtle case**: a renamed entity still has dangling references to the **old** name even if the new name appears everywhere else.

---

## Check 2 — Cross-package source-import audit

**What it catches**: a consumer imports a sibling package's `.ts` source via a relative `../` path. Works under dev tooling that ignores package boundaries (`tsx watch`, `ts-node`); breaks under strict `tsc` when the consumer's `rootDir` is restricted to its own `src/`.

**Recipe**:

1. Find every TS import that traverses out of the package: `grep -rn "from ['\"]\\.\\./\\.\\." --include="*.ts" --include="*.tsx"`. Two or more `..` segments is the signal.
2. For each hit:
   - Resolve the target. If it lands in a sibling top-level package (`mcp-server/`, `wxkanban-agent/`, `src/client/`, `src/server/`, etc.), this is cross-package.
   - Open the importing package's `tsconfig.json`. If `rootDir` is set and the target is outside it, the import is **build-fragile**.
3. Each fragile import has one of three fixes:
   - Consume the sibling's compiled output via a published package entry (`node_modules`).
   - Add a TypeScript project reference (`composite: true` on the producer; `references: [...]` on the consumer).
   - Introduce a thin local wrapper in the consumer's `src/` that loads the sibling at runtime via `createRequire`, keeping the type surface local.

**Output**: `{importer-file:line, import-specifier, target-package, importer-rootDir, suggested-fix}`. Any non-empty result is a defect.

---

## Check 3 — Build-mode coverage

**What it catches**: changes that compile under the dev watcher but fail under the production build.

| Dev tool | Production build |
|---|---|
| `tsx watch` | `tsc` |
| `ts-node` | `tsc` |
| Vite dev | Vite build |
| Next dev | Next build |

**Recipe**:

1. Identify the production build command for every package touched by the diff (usually `npm run build` per `package.json`).
2. Run each from a reasonably clean state. If a package has multiple `build:*` variants, run all of them.
3. A green dev watcher does **not** substitute. Treat dev-only validation as untested.

**When this applies**: any commit modifying `.ts`/`.tsx`, `tsconfig*.json`, or shared types. Not just refactors — features and dependency bumps too.

**Output**: build status per package. Anything but green is a defect.

---

## Check 4 — Spec-interaction conflict scan

**What it catches**: two specs each assert behavior on the same shared runtime concept, without either referencing the other. Each spec is correct in isolation; their composition isn't.

**Shared runtime concepts** (grows as the project does):

- Process lifecycle (spawn, signal handling, shutdown, watchdog, ppid)
- TCP ports and port-allocation policy
- Environment variables (scoped prefixes like `MCP_*`, `KIT_*`, `WXKANBAN_*`)
- Database tables and columns
- HTTP routes and event names
- File paths used as runtime contracts (PID files, lock files, sockets, runtime-state JSON)
- Fence ID / scope-tag format
- LifecycleStage value strings

**Recipe**:

1. For each shared concept touched by the recent spec, search `specs/**/*.md` and `wxkanban-agent/docs/adr/*.md` for any other spec mentioning the same concept. Examples:
   - `grep -rln "KIT_PARENT_PID\|parent-watcher" specs/`
   - `grep -rln "MCP_HTTP_PORT\|HTTP_PORT" specs/`
   - `grep -rln "LifecycleStage\|projectphases" specs/`
2. Read each hit's relevant section. If its assertions contradict the recent spec's, that's a defect.
3. Note especially **environment asymmetries**: behavior that's correct in production but wrong on dev machines (or vice versa). Either spec should call out the asymmetry explicitly.

**Output**: `{concept, recent-spec, conflicting-spec, conflict-summary}` per defect.

**Discipline**: a conflict requires a contradictory assertion, not just two specs mentioning the same name. If both agree, no defect.

---

## Reporting

Report drift findings as a flat numbered list, each item one to three sentences with file:line and a one-line fix. Then stop. Drift findings are concrete defects to fix — they are not bundled into deepening proposals.

## Future: `wxkanban-agent auditdrift`

The four checks above are mechanical. A future kit command (`auditdrift`) should implement them as an automated CI gate. Open as a queued enhancement against scope 030's follow-up.
