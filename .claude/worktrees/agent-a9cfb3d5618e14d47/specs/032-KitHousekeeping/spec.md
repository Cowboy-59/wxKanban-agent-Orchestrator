# Spec 032: Kit Housekeeping — Fence Cleanup + Doc-Validation + MCP Tool Parity + Bootstrap Defaults

**Spec Number**: 032
**Status**: `proposed`
**Created**: 2026-05-17
**Amended**: 2026-05-19 (Track D added — shadcn/CSS bootstrap defaults for new consumer projects)
**Depends On**: 019-agent-orchestrator-kit (the kit being cleaned up), 026-CodeFencing (the fence convention Track A enforces), 030-StageGateConsolidation (introduced the MCP adapter that Track C completes), 031-ImplementEnhancements (Track A dogfoods the v0.6.0 enhanced `implement <scope>` against the kit itself)
**Source**: in-conversation buildscope, 2026-05-17, after spec 030 implementation completed and surfaced the queue of small follow-ups; Track D added in-conversation, 2026-05-19

---

## Overview

A bundled cleanup scope addressing three housekeeping debts the kit accumulated during specs 030 and 031, plus one new bootstrap capability (Track D) folded into the same v0.7.0 release:

1. **Fence cleanup (Track A)**: ~25+ new top-level declarations were added unfenced during specs 030 and 031 implementation as a documented bootstrap exception. The kit's CI gate (`auditfences --strict`) cannot return exit 0 until they are fenced. This track dogfoods the v0.6.0 `implement <scope>` capability against the kit's own code — every fence is written by the orchestrator, never hand-authored, per the rules the kit itself enforces. Pre-baseline foundational orchestrator code (buildscope-worker, command-handlers, fence-emitter, etc.) is also in scope.
2. **Doc-validation tooling (Track B)**: a structural fix for a class of bug that went undetected for months. The "Builds an AI prompt and calls Gemini" line in `docs/implement.md` contradicted code that hadn't called AI since Spec 019 R6a landed. A small validation script that asserts documented claims against actual code behavior catches the next instance at write time instead of months later.
3. **MCP tool parity audit (Track C)**: register the 9 missing MCP tool handlers that the spec 030 mcp-adapter already maps to but whose endpoints don't exist (`project.createtesttasks`, `project.runqa`, `project.runhuman`, `project.prepareRelease`, `project.finalizeRelease`, `project.dbpush`, `project.pipeline_agent`, `project.auditfences`). Fix the `project.kit_status` registered-but-no-handler bug. Rationalize the MCP tool naming convention (currently mixes flat `project.buildscope`, snake_case `project.create_specs`, camelCase `project.prepareRelease`).
4. **Kit bootstrap defaults (Track D)**: ship a minimal, standard shadcn-CLI-compatible baseline (`components.json`, Tailwind v3 config, `globals.css` with CSS vars, 5 canonical components) inside the kit, and add a `kit:bootstrap-ui` orchestrator command that copies it into a new consumer project and installs its deps. New consumer projects no longer have to hand-roll a UI starting point; the kit hands them a clean, conventional one that `npx shadcn add <component>` extends naturally.

The unifying theme for Tracks A–C is "kit reaches a known-clean baseline":

- After Track A: `auditfences --strict` returns exit 0.
- After Track B: kit docs that drift from code fail their next CI run.
- After Track C: every gated CLI command has an equivalent MCP tool; naming is consistent; the policy module's mcp-adapter mapping rows go from "9 inert" to "0 inert."
- After Track D: a new consumer project can bootstrap a usable, shadcn-CLI-extensible UI baseline with one command.

This spec is **structurally four small scopes coexisting under one umbrella**. The implementation is sliced by track (A → B → C → D); each track is small enough that giving it its own scope number would be ceremony for ceremony's sake, but big enough to deserve its own FR group, plan section, and acceptance subset within this scope. Track D is a capability addition rather than housekeeping, included here because it ships in the same v0.7.0 release window and shares the kit-templates / mcp-adapter touch points with Tracks A and C.

The two larger ADR-0001 refactor scopes are intentionally **not** in this umbrella:

- Spec 033 — Spec-Parser Consolidation
- Spec 034 — Fence-Writer Consolidation

Those get their own focused buildscopes because they are structural refactors with the same design depth spec 030 received.

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actors** | wxkanban-agent kit maintainers (refactor target — the kit's own code); the kit's CI gate (`auditfences --strict` will pass after Track A); the editor AI driving `implement 032` (Track A dogfoods this); kit consumers who use the MCP surface (Track C extends what they can call). |
| **Key Value** | Kit reaches its first `auditfences --strict` exit-0 baseline. Docs drift becomes a CI-detected failure mode instead of multi-month silent rot. MCP surface achieves parity with CLI — no more "I can do X from CLI but not from the editor AI." The mcp-adapter's 9 inert mapping rows become 0 inert. The kit transitions from "shipped under bootstrap exceptions" to "structurally clean." |
| **Scope Boundary (IN)** | Track A: fence every unfenced top-level declaration in `wxkanban-agent/core/policy/`, `wxkanban-agent/apps/command-gateway/src/cli.ts`, `wxkanban-agent/core/orchestrator/command-handlers/implement.ts` (the new exports from spec 031 Phase 2), `wxkanban-agent/workers/ai/buildscope-worker.ts` (mandatory per FR-003), and any other foundational orchestrator file the inventory surfaces. Track B: `scripts/doc-validation.ts` + assertions against `wxkanban-agent/docs/*.md`; wire into `npm test` or a separate `npm run doc:check` script. Track C: 9 new MCP handler dispatch branches in `mcp-server/src/server.ts`; fix the `project.kit_status` handler; rationalize naming convention to snake_case kit-wide with deprecated camelCase / flat aliases preserved for one release. Track D: `wxkanban-agent/templates/shadcn-baseline/` template tree (components.json, tailwind.config.ts, globals.css, 5 canonical components, deps.json), `kit:bootstrap-ui` command handler exposed via CLI + MCP (snake_case `project.kit_bootstrap_ui`), and docs/CHANGELOG entries. Plus version bump + CHANGELOG. |
| **Scope Boundary (OUT)** | Refactoring `fence-emitter.ts` / `fence-db.ts` (Spec 034). Refactoring spec-parser modules (Spec 033). Adding any new MCP tool that doesn't already exist on CLI (Track C only; Track D's `project.kit_bootstrap_ui` is explicitly in-scope because it ships with a matching CLI subcommand in the same spec). Changing the Spec 026 fence-emission rules. Changing the policy module's decision logic (spec 030 closed that). "Claude coworker" enhancement (deferred). DB schema changes (e.g., adding an `action` column to `taskfencehistory` to fully satisfy spec 031 FR-004 — that would be its own small schema scope if pursued). Migrating this project's own `src/client/components/ui/*` PascalCase components to the new shadcn baseline (out for Track D — the baseline is for new consumer projects only). Adding more than the 5 canonical shadcn components to the kit template (consumers `npx shadcn add` the rest). Installing or running the shadcn CLI inside this project. |

---

## Functional Requirements

### Track A — Fence Cleanup

### FR-001 — Inventory of unfenced declarations
This spec's implementation begins with a deterministic inventory step. Running `wxkanban-agent auditfences --strict` against the kit before any Track A work produces the complete list of unfenced top-level declarations across **all** of `wxkanban-agent/` (and any other in-repo kit code). The implementer captures the full output as `specs/032-KitHousekeeping/inventory.md` — a generated artifact, regenerated at the start of Track A.

The inventory is uncategorized — every unfenced top-level declaration is in scope for Track A regardless of whether it predates the 2026-05-13 baseline or was added during specs 030/031 implementation. **Foundational orchestrator code (buildscope-worker, command-handlers, fence-emitter, workflow-engine, spec-loader, etc.) is in scope by the same standard as new code: if it's a top-level declaration in a kit `.ts` file, it gets a fence.**

The inventory is the source of truth for the per-task plan; tasks.md tasks map per-file to inventory entries.

### FR-002 — Fences are written by the orchestrator, never hand-authored
Every fence added during this scope is emitted by `wxkanban-agent implement 032/T0NN` (or by the kit's enhanced batch mode `implement 032`). No hand-edited `// [SCOPE 032 / T0NN] BEGIN` markers. This enforces the Spec 026 contract that fences are orchestrator-written, and dogfoods the v0.6.0 capabilities against the kit's own code.

For each unfenced declaration in the inventory:

- A proposal is generated with `action: "modify"` for files where the declaration is one of several existing ones, or `action: "create"` for files whose entire body is being rewritten with fences for the first time. (In practice all of spec 030/031's unfenced files exist already, so `action: "modify"` dominates.)
- `parseProposal` + `emitFence` then produces the canonical `// [SCOPE 032 / T0NN] BEGIN — <description>` markers around each declaration.
- `taskfences` rows are written inside the per-task transaction.

### FR-003 — Every inventory entry is fenced (no opt-out)
Every top-level declaration surfaced by the FR-001 inventory is fenced during this scope. There is no "optional" or "legacy-baseline-exempt" category. The reasoning:

- The 2026-05-13 baseline rule in CLAUDE.md exists for migration tolerance, not as a permanent two-tier system. The kit treating its own foundational code as "info-only" while requiring every new spec's contributions to be fenced is the wrong asymmetry — foundational code is *more* important to track, not less, because every future spec modifies it.
- `buildscope-worker.ts` is foundational to every spec workflow (the `buildscope` command starts every new scope). The next time it's modified, the changes need proper fence-tracking; absent fences today, that modification can't be cleanly attributed via the orchestrator.
- A "uniformly fenced codebase" is structurally simpler than a "uniformly fenced codebase with exemption lists." The first is reasoned about by a single rule ("everything is fenced"); the second drifts into "everything except X, Y, Z, and these other ones we forgot about."
- Per CLAUDE.md spec 026, fences are written by the orchestrator. Every fence in this scope is emitted by `wxkanban-agent implement 032/T0NN` — no hand-authored markers, no manual `// [SCOPE NNN / T0NN] BEGIN` typing. (See FR-002.)

The implementation cost: each unfenced declaration becomes one fenced declaration via a per-file `action: "modify"` proposal. The mechanical work scales linearly with the inventory size.

### FR-004 — Behavior preservation
Every fenced declaration's runtime behavior is unchanged. Fences are comments around existing code; the only meaningful difference is `taskfences` DB rows. The full kit test suite passes both before and after Track A with no test modifications required.

If a test assertion does change as a result of fencing (e.g., line-number-sensitive assertions), that test is updated as part of the same task that touches the file.

### FR-005 — `auditfences --strict` returns exit 0
After Track A completes, `wxkanban-agent auditfences --strict` against the kit returns exit code 0. No "error" severity diagnostics. Warning-severity diagnostics are tolerated.

This is the canonical Track A acceptance criterion. It is also part of FR-017 (overall acceptance).

### Track B — Doc-Validation Tooling

### FR-006 — Doc-validation script
A new file at `wxkanban-agent/scripts/doc-validation.ts` runs a set of assertions against the kit's user-facing markdown docs and exits 0 if every assertion passes, non-zero otherwise. The script:

- Takes no required arguments. Optional `--docs <glob>` to override the default target set (FR-008). Optional `--verbose` to print per-assertion results, not just failures.
- Outputs a compact per-file summary on success: `OK <docfile> (<N> assertions)`. Failures emit the assertion description, expected vs actual, and the source line(s) in the doc and code.
- Lives in `scripts/` to match `verify-install.ts` and `pack-kit.sh` conventions; not in `core/` (it's a build/CI utility, not orchestrator surface).
- Exposes its assertion machinery via a small in-file API so future assertion types can be added in one place rather than scattered across scripts.

### FR-007 — Assertion vocabulary
The script supports a small, fixed set of assertion types — each catches a class of doc drift the kit has actually experienced:

| Assertion | What it checks | Example failure (real spec 031 drift) |
|---|---|---|
| **`mentionsForbidden(doc, forbidden[])`** | Doc text does not contain forbidden phrases. | `docs/implement.md` step 3 contained "calls Gemini" after Spec 019 R6a forbade kit AI calls. |
| **`flagExistsInCli(doc, flag)`** | A `--flag-name` mentioned in a flags table is present in the CLI argument parser. | A documented `--foo` flag that was renamed in code but not docs. |
| **`envVarReadByCode(doc, var, codeGlob)`** | An env var mentioned in the "Environment Variables" section is referenced (`process.env['X']` or `import.meta.env.X`) in at least one matching code file. | Stale env vars after the v0.5.0 R6a refactor removed `GEMINI_API_KEY` from `implement`. |
| **`commandHasHandler(doc, commandName)`** | A `wxkanban-agent <command>` cited in an example or flags section corresponds to a registered handler in workflow-engine or the cli gateway. | `wxkanban-agent dbpush --dry-run` example when dbpush was broken/unregistered. |
| **`exitCodeDocumented(doc, code, codeGlob)`** | An exit code cited in an "Exit Codes" table is `throw`n or `process.exit()`ed somewhere in matching code. | Documented exit 4 in a docs table that no code path actually uses. |

The script's assertion list per doc is declared in a sibling config file (`scripts/doc-validation.config.ts`) — a typed array of `{ doc, assertions[] }` entries. Adding a new check is a config edit, not a code edit.

### FR-008 — Target docs
The default target set is every `.md` file under `wxkanban-agent/docs/` (currently `command.md`, `fencing.md`, `implement.md`, `kit-runtime.md`, plus the new `adr/`, `refactors/` subdirectories from spec 030).

Out of scope by default (not validated):

- `CHANGELOG.md` — historical record; old entries may legitimately reference removed features.
- `README.md` — high-level overview; not amenable to specific-assertion checks.
- `specs/**/*.md` — spec documents are their own contract; not orchestrator docs.

The `--docs <glob>` flag overrides the default if a future caller wants to validate something narrower or broader.

### FR-009 — Invocation + CI integration
The script is wired into the kit's normal workflows in two places:

- **`npm run doc:check`** — a new entry in `wxkanban-agent/package.json` scripts; invokes the validation script. Developers can run it locally.
- **`auditfences --strict` callout** — `wxkanban-agent/core/orchestrator/command-handlers/auditfences.ts` gets a final-step doc validation pass (or alternatively, a sibling command `auditdocs` is registered). When the kit's CI gate runs `auditfences --strict`, doc validation runs alongside it. Decision deferred to implementer per FR-009 implementer-note: "decide between integrating into auditfences vs sibling auditdocs based on what reads cleaner; both are acceptable."

Pre-publish hook (if `npm publish` were ever wired): `doc:check` runs before publish. This spec does not add the hook itself (publishing is manual today), but the script is structured to fit such a hook trivially.

### FR-010 — First assertion set: catches the specific bugs we know about
At minimum, the initial config file declares these specific assertions (catching the known historical drift):

- `docs/implement.md`: `mentionsForbidden(['Gemini', 'OpenAI', 'GROQ', 'AI client'])` — Spec 019 R6a forbids any AI-calling language from this doc.
- `docs/implement.md`: `envVarReadByCode('GEMINI_API_KEY', '../core/orchestrator/command-handlers/implement.ts')` would have caught the stale env var (now removed; assertion would correctly find no usage and the env var no longer being documented, so passes vacuously). Going forward, any new env var documented must satisfy this.
- `docs/implement.md`: `flagExistsInCli('--dry-run', '--input', '--continue-on-error', ...)` for every flag in the flags table.
- `docs/command.md`, `docs/fencing.md`: at least one assertion each, even if minimal (proves the framework works for those docs).

The implementer can add more assertions during Track B implementation; the spec only requires the above minimum set.

### Track C — MCP Tool Parity

### FR-011 — Register the 9 missing MCP tool handlers
`mcp-server/src/server.ts` gains 9 new tool registrations (in the tool list emitted by the `tools/list` handler) and 9 new `case` branches in the `tools/call` dispatch. Each new handler is a thin wrapper that:

- Declares an input schema covering the arguments the underlying CLI command accepts. (For most: just `projectId` plus the per-command flags.)
- Validates args (the existing zod-based validation pattern used by `project.implement` et al.).
- Dispatches to the existing underlying capability:
  - `project.create_test_tasks` → `WorkflowEngine.dispatch(context, 'createtesttasks', args, user, dispatchOptions)`
  - `project.run_qa` → `WorkflowEngine.dispatch(context, 'runqa', ...)`
  - `project.run_human` → `WorkflowEngine.dispatch(context, 'runhuman', ...)`
  - `project.prepare_release` → `WorkflowEngine.dispatch(context, 'prepareRelease', ...)`
  - `project.finalize_release` → `WorkflowEngine.dispatch(context, 'finalizeRelease', ...)`
  - `project.dbpush` → `WorkflowEngine.dispatch(context, 'dbpush', ...)` (delegates to the existing `handleDbPushCommand`)
  - `project.pipeline_agent` → calls the existing `pipeline-agent` handler chain
  - `project.audit_fences` → calls `handleAuditFencesCommand` directly (or via workflow-engine — implementer's call)
  - `project.kit_status` → calls `handleKitStatusCommand` (fixes the pre-existing bug — see FR-012)
- Returns a structured response mirroring the existing `project.implement` response shape: `{ success, result?, error?, audit? }`.

All 9 handlers go through the Stage Gate adapter (`enforceTool` from `wxkanban-agent/core/policy/adapters/mcp-adapter.ts`) — that's already wired in `server.ts` from spec 030 Slice C. The 9 new tools immediately benefit from uniform spec-first verification (FR-008 of spec 030) and stage gating.

### FR-012 — Fix the `project.kit_status` handler bug
`project.kit_status` has a `name:` entry in the tool list emitted by `tools/list` but no `case 'project.kit_status':` branch in the `tools/call` dispatch. Calling it today fails with "unknown tool" despite advertised availability. This FR closes that gap by registering the missing case branch as part of the FR-011 handler set.

The handler delegates to `handleKitStatusCommand` (already imported in `server.ts` line 11 per spec 027). The bug is purely the missing dispatch wiring.

### FR-013 — Naming convention rationalization (snake_case)
MCP tool names are unified to **snake_case** throughout. The kit's dominant pattern (15+ existing tools use snake_case: `project.create_specs`, `project.update_task_status`, `project.list_open_items`, etc.) becomes the only pattern. Three categories of rename:

- **Flat → snake_case**: `project.buildscope` → `project.build_scope`, `project.auditfences` → `project.audit_fences` (note: also affects the new tool registered in FR-011).
- **camelCase → snake_case**: `project.prepareRelease` → `project.prepare_release`, `project.finalizeRelease` → `project.finalize_release`.
- **Concatenated → snake_case**: `project.createtesttasks` → `project.create_test_tasks`, `project.runqa` → `project.run_qa`, `project.runhuman` → `project.run_human`.

After this FR, the kit's MCP tool list has zero naming inconsistencies. Any future tool registration follows snake_case by convention; an assertion in the doc-validation script (Track B) can enforce it.

### FR-014 — Deprecated aliases for one release
Renaming MCP tool names is a breaking change for any consumer scripting against the old names. This FR provides a one-release deprecation window:

- The old names (`project.buildscope`, `project.prepareRelease`, `project.finalizeRelease`, `project.createtesttasks`, `project.runqa`, `project.runhuman`, `project.auditfences`) are registered as **aliases** that dispatch to the same underlying handlers.
- Each alias emits a deprecation warning via the kit's logger (`logger.warn`) when invoked: `MCP tool '<oldName>' is deprecated; use '<newName>' instead. Aliases will be removed in v0.8.0.`
- The aliases' `tools/list` registration includes a `[DEPRECATED]` prefix in the description.
- The deprecation window: aliases ship in v0.7.0 (this spec's release), are removed in v0.8.0 (a future small scope).

### FR-015 — Update mcp-adapter mapping rows
`wxkanban-agent/core/policy/adapters/mcp-adapter.ts`'s `MCP_TOOL_MAP` is updated to reflect the rationalized names from FR-013:

- The 12 existing rows are updated: old names replaced with new snake_case names. The corresponding `displayName` field (used for byte-identical CLI messages) is unchanged.
- Deprecation aliases from FR-014 are ALSO added to `MCP_TOOL_MAP` (12 + 7 deprecated = 19 entries during the deprecation window). The aliases share the same `Capability` and `displayName` as the canonical names.
- After v0.8.0 removes the deprecation aliases, the mapping returns to 12 entries.

### FR-016 — Tests for the new handlers
`mcp-server/tests/` gains coverage for the 9 new handlers and the deprecation aliases:

- **Per-handler test**: each of the 9 new tools is invoked with valid args; expects a successful response and the appropriate dispatch (mocked at the WorkflowEngine layer).
- **`project.kit_status` regression test**: a test that would have failed before FR-012 — `tools/call` with `project.kit_status` returns the kit status, not "unknown tool."
- **Deprecation alias tests**: invoking each old name dispatches to the same underlying handler as the new name; the deprecation warning is logged; the response is identical.
- **Naming-convention assertion test** (lightweight): every entry in the `tools/list` response matches `^project\.[a-z_]+$` (snake_case + dots only).

### Track D — Kit Bootstrap Defaults

### FR-018 — Template directory layout
A new directory `wxkanban-agent/templates/shadcn-baseline/` is the single source of truth for kit bootstrap defaults. Its layout mirrors what the `kit:bootstrap-ui` command (FR-023) writes into a target project — exact same relative paths so the template tree can be copied with a recursive walk and no path remapping. The directory is committed to the kit repo; it is not generated at build time. Adding a new bootstrap file means a new file in this tree plus a one-line `deps.json` entry if it needs a new npm package.

### FR-019 — `components.json` template
`wxkanban-agent/templates/shadcn-baseline/components.json` declares a standard shadcn-CLI configuration. Required fields and values:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/client/styles/globals.css",
    "baseColor": "slate",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/client/components",
    "utils": "@/client/lib/utils",
    "ui": "@/client/components/ui",
    "lib": "@/client/lib",
    "hooks": "@/client/hooks"
  }
}
```

Aliases align with this project's existing `@/client/*` convention so future `npx shadcn add <component>` invocations in consumer projects target the correct directories without further config.

### FR-020 — `tailwind.config.ts` template
`wxkanban-agent/templates/shadcn-baseline/tailwind.config.ts` is a Tailwind v3 config in TypeScript (`Config` from `tailwindcss`). It declares:

- `darkMode: ['class']`
- `content`: `['./index.html', './src/**/*.{ts,tsx}']`
- `theme.extend.colors`: the standard shadcn CSS-var color tokens (`background`, `foreground`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`, `card`, `popover`) each mapped to `hsl(var(--token))`
- `theme.extend.borderRadius`: `lg`, `md`, `sm` mapped to `var(--radius)` calculations
- `theme.extend.keyframes` + `theme.extend.animation`: `accordion-down` / `accordion-up` (required by Radix Accordion patterns; included even though Accordion isn't in the canonical 5)
- `plugins: [require('tailwindcss-animate')]`

A `.js` mirror is **not** shipped; consumer projects using JS toolchains can compile the .ts file via `tsc`.

### FR-021 — `globals.css` template
`wxkanban-agent/templates/shadcn-baseline/globals.css` is the standard shadcn CSS-vars file. Structure:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    /* ... full standard slate token set */
    --radius: 0.5rem;
  }
  .dark {
    --background: 222.2 84% 4.9%;
    /* ... full dark token set */
  }
}

@layer base {
  * { @apply border-border; }
  body { @apply bg-background text-foreground; }
}
```

Token values follow the shadcn v0 reference defaults verbatim — no custom palette. Consumers theme by editing this file post-bootstrap.

### FR-022 — Canonical component set
Five components ship in `wxkanban-agent/templates/shadcn-baseline/components/ui/`, lowercase filenames, each one the verbatim contents of the shadcn-CLI default for that component at shadcn-ui v0 (kit-author verifies and pins a reference date in CHANGELOG):

| File | Underlying Radix package |
|---|---|
| `button.tsx` | none (CVA variants only) |
| `card.tsx` | none |
| `dialog.tsx` | `@radix-ui/react-dialog` |
| `input.tsx` | none |
| `label.tsx` | `@radix-ui/react-label` |

Each component imports `cn` from `@/client/lib/utils`. The template tree therefore also ships `components/lib/utils.ts` with the standard `cn(...inputs: ClassValue[])` helper.

### FR-023 — `kit:bootstrap-ui` orchestrator command
A new command handler `wxkanban-agent/core/orchestrator/command-handlers/kit-bootstrap-ui.ts` is registered on the kit's command gateway and exposed both as a CLI subcommand (`wxkanban-agent kit:bootstrap-ui [target]`) and an MCP tool (`project.kit_bootstrap_ui`, snake_case per FR-013).

Behavior:

1. **Target resolution**: `target` argument is a directory path; defaults to `process.cwd()`. The target must contain a `package.json` (otherwise → exit 2 `"target-not-a-project"`).
2. **Idempotent copy**: walks `templates/shadcn-baseline/` recursively. For each file, if the destination doesn't exist, writes it. If it exists and content differs, refuses with exit 3 `"conflict: <relpath>"` unless `--force` was passed. If it exists and content is byte-identical, silently skips.
3. **Dependency install**: after the file copy, reads `deps.json` (FR-024) and invokes the target project's package manager (`npm install <pkgs>`; detects pnpm/yarn via lockfile presence) to install any missing deps. `--no-install` skips this step.
4. **Output**: prints a summary table (`created N, skipped M, conflicts K`) and exits 0 if K = 0.
5. **Dry-run**: `--dry-run` reports the actions without writing or installing.

Stage gating: the command is allowed in every stage (it's project-bootstrap, not stage-gated) — explicitly listed in `wxkanban-agent/core/policy/capabilities.ts` as `Capability.KitBootstrapUi` with an all-stages allow row.

### FR-024 — Dependency manifest
`wxkanban-agent/templates/shadcn-baseline/deps.json` declares the npm packages the bootstrap requires. Shape:

```json
{
  "dependencies": {
    "@radix-ui/react-dialog": "^1.1.0",
    "@radix-ui/react-label": "^2.1.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.5.0"
  },
  "devDependencies": {
    "tailwindcss": "^3.4.0",
    "tailwindcss-animate": "^1.0.7",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0"
  }
}
```

Version ranges are caret-pinned; the kit maintainer updates this file when bumping the baseline. `kit:bootstrap-ui` reads this file at run time — no compile-time embedding — so version bumps don't require a kit rebuild.

### FR-025 — Documentation + CHANGELOG
- New file `wxkanban-agent/docs/kit-bootstrap-ui.md` documents the command: synopsis, flags, the template tree contents, dependency list, idempotency semantics, and a "next steps after bootstrap" section pointing consumers at `npx shadcn add <component>` for further components.
- `wxkanban-agent/CHANGELOG.md` v0.7.0 entry adds a Track D bullet block listing the bootstrap-ui addition, the canonical 5 components, and the dependency baseline.
- Track B's doc-validation script (FR-006/FR-010) gains one assertion: `commandHasHandler('docs/kit-bootstrap-ui.md', 'kit:bootstrap-ui')` proving the doc tracks the actual handler registration.

### FR-017 — Acceptance criteria (all 4 tracks)
This spec is complete when:

1. **Track A**: `wxkanban-agent auditfences --strict` returns exit 0 against the kit. No "error" severity diagnostics. All declarations surfaced by the FR-001 inventory are fenced via the orchestrator (FR-002, FR-003).
2. **Track B**: `npm run doc:check` exists, executes the validation script, returns exit 0 against `wxkanban-agent/docs/*.md`. The FR-010 minimum assertion set is in place.
3. **Track C**: all 9 new MCP tool handlers are registered; the `project.kit_status` handler bug is fixed; the rationalized snake_case naming convention is applied with deprecation aliases in place per FR-013/014; mcp-adapter mapping rows updated per FR-015.
4. **Track D**: `wxkanban-agent kit:bootstrap-ui <target>` exists as a CLI subcommand and as MCP tool `project.kit_bootstrap_ui`; against an empty test project it produces a passing `tsc --noEmit` + `vite build` with a renderable button-on-card-with-dialog smoke test. The template tree under `wxkanban-agent/templates/shadcn-baseline/` contains the FR-019–FR-022 + FR-024 files. The FR-025 doc + CHANGELOG entry exist.
5. The kit's full test suite passes (existing tests + new FR-016 tests + Track D handler tests).
6. Kit version bumped one minor: `0.6.0` → `0.7.0`. `CHANGELOG.md` entry documents all 4 tracks + the FR-013 breaking change + the FR-014 deprecation window.
7. Manual smoke test: invoke each new MCP tool against a test project; verify dispatch and response shape match the equivalent CLI command's behavior; run `project.kit_bootstrap_ui` against an empty fresh project and verify the output compiles.

---

## User Scenarios & Testing

### Track A — Fence Cleanup

| Scenario | Setup | Expected outcome |
|---|---|---|
| Inventory captures everything | Run `wxkanban-agent auditfences --strict` against kit pre-Track-A | Outputs full list of unfenced top-level declarations to stdout; `specs/032-KitHousekeeping/inventory.md` captures it. |
| Fences are orchestrator-written | After applying `implement 032/T0NN` against any inventory file | File contains `// [SCOPE 032 / T0NN] BEGIN — <description>` markers around each previously-unfenced declaration; `taskfences` DB rows match. |
| Behavior unchanged | After all Track A tasks complete | Full kit test suite passes with zero modifications required. Imports, type signatures, runtime behavior identical to pre-Track-A. |
| Clean baseline reached | After all Track A tasks complete | `wxkanban-agent auditfences --strict` returns exit 0. |
| Re-running an inventory task is idempotent | Apply `implement 032/T005` twice | Second run finds the file already fenced; no new `taskfences` rows; no file change. |

### Track B — Doc-Validation Tooling

| Scenario | Setup | Expected outcome |
|---|---|---|
| Validation passes on clean docs | Run `npm run doc:check` against kit's current docs (after the FR-010 assertions are in place) | Exit 0; per-file `OK <doc> (<N> assertions)` summary. |
| Validation catches the historical bug | Hypothetical: revert `docs/implement.md` to its pre-spec-031 stale state with "calls Gemini" | Exit non-zero; failure cites the `mentionsForbidden(['Gemini', ...])` assertion and the offending line. |
| Validation catches a renamed flag | Add `--newflag` to docs/implement.md flags table without adding it to CLI parser | `flagExistsInCli` assertion fails; failure cites the missing CLI registration. |
| `--verbose` shows passing assertions too | Run `npm run doc:check --verbose` | Output lists every assertion with pass/fail status, not just failures. |

### Track C — MCP Tool Parity

| Scenario | Setup | Expected outcome |
|---|---|---|
| New MCP tool dispatches correctly | MCP client calls `project.run_qa` with valid args | Dispatches to underlying `runqa` handler via WorkflowEngine; response includes `{ success, result, audit }`. |
| `project.kit_status` no longer "unknown tool" | MCP client calls `project.kit_status` | Returns kit status; does NOT return "unknown tool" error (regression test for the FR-012 pre-existing bug). |
| Stage gating applies to new tools | MCP client calls `project.run_qa` against a project in Design phase | Blocks at MCP layer with the canonical stage-rejection message ("Command 'runqa' is not permitted in the 'Design' stage."). Per spec 030 FR-008 spec-first verification ALSO applies. |
| Deprecation alias still works | MCP client calls `project.buildscope` (the old flat name) | Dispatches identically to `project.build_scope`; response is identical; logger emits deprecation warning. |
| Naming-convention assertion catches drift | Hypothetical: a new tool registered as `project.somethingMisnamed` | The FR-016 naming-convention test fails; surfaces in CI before merge. |
| `tools/list` exposes all 21 tools during deprecation window | MCP client calls `tools/list` | Returns 12 canonical snake_case tools + 7 `[DEPRECATED]` aliases (during v0.7.0 lifetime). After v0.8.0 removes aliases: 12 only. |

---

## New / Modified / Deleted Modules

| Path | Status | Notes |
|---|---|---|
| **Track A — Fence cleanup** (estimated 7-15+ files, exact count from FR-001 inventory) | | |
| `wxkanban-agent/core/policy/capabilities.ts` | **Modified** | Add fences to Capability enum + gateTable + drift assert |
| `wxkanban-agent/core/policy/policy.ts` | **Modified** | Add fences to all top-level decls |
| `wxkanban-agent/core/policy/resolve-current-phase.ts` | **Modified** | Add fences |
| `wxkanban-agent/core/policy/resolve-spec-verification.ts` | **Modified** | Add fences |
| `wxkanban-agent/core/policy/adapters/cli-adapter.ts` | **Modified** | Add fences (many top-level helpers + main exports) |
| `wxkanban-agent/core/policy/adapters/mcp-adapter.ts` | **Modified** | Add fences |
| `wxkanban-agent/core/orchestrator/command-handlers/implement.ts` | **Modified** | Add fences to spec 031 batch-mode additions (BatchImplementOptions, BatchTaskOutcome, BatchImplementResult, handleImplementBatchCommand, formatBatchSummaryTable) |
| `wxkanban-agent/apps/command-gateway/src/cli.ts` | **Modified** | Add fences to `createFileBasedProposalSource` |
| `wxkanban-agent/workers/ai/buildscope-worker.ts` | **Modified** | Add fences to pre-existing legacy declarations (per FR-003 mandatory ruling) |
| `specs/032-KitHousekeeping/inventory.md` | **New (generated)** | Audit output captured for plan transparency |
| **Other foundational orchestrator files** | **Modified (TBD by inventory)** | spec-loader.ts, command-handlers/*, fence-emitter.ts, fence-db.ts, workflow-engine.ts, implement-prompt.ts — exact list determined by FR-001 inventory; each gets a per-file task |
| **Track B — Doc-validation tooling** | | |
| `wxkanban-agent/scripts/doc-validation.ts` | **New** | Validation script (FR-006); ~150-250 LOC |
| `wxkanban-agent/scripts/doc-validation.config.ts` | **New** | Assertion config; declarative entries per doc (FR-007, FR-010) |
| `wxkanban-agent/package.json` | **Modified** | Add `doc:check` script entry; version bump to 0.7.0 (FR-017 #5) |
| `wxkanban-agent/core/orchestrator/command-handlers/auditfences.ts` | **Modified** *(if FR-009 integration path is chosen)* | Add final-step doc-validation pass invoking the script |
| **Track C — MCP tool parity** | | |
| `mcp-server/src/server.ts` | **Modified** | Register 9 new tool handlers (FR-011); fix kit_status case (FR-012); rename existing 7 to snake_case (FR-013); register 7 deprecation aliases (FR-014) |
| `wxkanban-agent/core/policy/adapters/mcp-adapter.ts` | **Modified** | Update `MCP_TOOL_MAP`: 12 canonical entries renamed + 7 deprecated aliases added during v0.7.0 lifetime (FR-015) |
| `mcp-server/tests/server.test.ts` *(or new file)* | **Modified or new** | Add tests per FR-016 |
| **Track D — Kit bootstrap defaults** | | |
| `wxkanban-agent/templates/shadcn-baseline/components.json` | **New** | FR-019 |
| `wxkanban-agent/templates/shadcn-baseline/tailwind.config.ts` | **New** | FR-020 |
| `wxkanban-agent/templates/shadcn-baseline/globals.css` | **New** | FR-021 |
| `wxkanban-agent/templates/shadcn-baseline/components/ui/button.tsx` | **New** | FR-022 |
| `wxkanban-agent/templates/shadcn-baseline/components/ui/card.tsx` | **New** | FR-022 |
| `wxkanban-agent/templates/shadcn-baseline/components/ui/dialog.tsx` | **New** | FR-022 |
| `wxkanban-agent/templates/shadcn-baseline/components/ui/input.tsx` | **New** | FR-022 |
| `wxkanban-agent/templates/shadcn-baseline/components/ui/label.tsx` | **New** | FR-022 |
| `wxkanban-agent/templates/shadcn-baseline/components/lib/utils.ts` | **New** | FR-022 (`cn` helper) |
| `wxkanban-agent/templates/shadcn-baseline/deps.json` | **New** | FR-024 |
| `wxkanban-agent/core/orchestrator/command-handlers/kit-bootstrap-ui.ts` | **New** | FR-023 handler |
| `wxkanban-agent/core/policy/capabilities.ts` | **Modified** | Adds `Capability.KitBootstrapUi` (all-stages allow) — coordinated with Track A's fence work on the same file |
| `wxkanban-agent/core/policy/adapters/cli-adapter.ts` | **Modified** | Wires `kit:bootstrap-ui` CLI subcommand |
| `wxkanban-agent/core/policy/adapters/mcp-adapter.ts` | **Modified** | Adds `project.kit_bootstrap_ui` mapping row (additive to FR-015's 12+7) |
| `mcp-server/src/server.ts` | **Modified** | Registers `project.kit_bootstrap_ui` tool handler (additive to FR-011's 9 handlers) |
| `wxkanban-agent/docs/kit-bootstrap-ui.md` | **New** | FR-025 reference doc |
| `mcp-server/tests/server.test.ts` *(or sibling)* | **Modified** | Adds `project.kit_bootstrap_ui` handler test |
| **Cross-cutting** | | |
| `wxkanban-agent/CHANGELOG.md` | **Modified** | v0.7.0 entry covering all 4 tracks + the FR-013 breaking-change-with-deprecation-window |

No files are deleted by this spec.

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| **Track A inventory larger than expected** — foundational orchestrator files may have many more pre-existing unfenced decls than the spec 030/031 additions | Medium — could turn Track A from "small/mechanical" into "medium/grinding" | The FR-001 inventory step runs first and surfaces the exact count before any task is implemented. If the inventory is significantly larger than expected, the implementation slice plan adjusts (more tasks, longer track) but the FR contract doesn't change. |
| **Fence-emitter behavior on legacy un-fenced files** | Medium — when emitFence detects existing top-level declarations in a file with no existing fences, the spec 030 investigation found it claims ownership of EVERY top-level declaration under the current task's scope. This means modifying e.g. spec-loader.ts under task 032/T0NN attributes EVERY top-level declaration in that file to 032/T0NN, even pre-existing ones | Per-task ownership attribution is correct for "this scope adopted this file" semantic. Acceptable for Track A. Document the per-file attribution model in the inventory / task plan so it's not surprising. |
| **Track B asserts on doc content that legitimately changes** — `mentionsForbidden` might over-trigger if forbidden phrases appear in legitimate quoted examples | Low — assertion mechanism is precise (regex or exact-string match per assertion config). If a forbidden phrase IS legitimate, the config excludes the specific context. | Document the assertion-tuning process in `scripts/doc-validation.config.ts` comments. |
| **Track C breaking-change blowback** — consumers actively using old MCP tool names break despite the deprecation aliases | Medium — deprecation warnings are logger-level, so silent-running consumers won't see them. Some consumer scripts may be brittle. | One-release deprecation window (v0.7.0 → v0.8.0) gives consumers time to update. CHANGELOG and the kit's release notes call out the rename prominently. The aliases themselves dispatch identically, so no behavior change — only the name change matters. If consumer pain is significant, extend the deprecation window in a patch release. |
| **Track C dispatch routing inconsistency** — 7 of the 9 new handlers go through WorkflowEngine, 2 (audit_fences, kit_status) call their handlers directly | Low — both routings have working precedent in the existing code base (`project.implement` goes through WorkflowEngine; `project.create_task` calls its handler directly). Implementer picks per FR-011 implementer-note. | Document the routing decision in mcp-server/src/server.ts inline comments at each handler so future maintainers don't read the inconsistency as a bug. |
| **`auditfences --strict` regresses after Track A** — fixed once, can be re-broken by future scopes | Medium — without continued enforcement, the kit re-accumulates unfenced declarations within a few scopes | This spec doesn't address that — it's a structural CI concern (would auditfences --strict gate all PRs?). Mention as out-of-band: "CI gate enforcing auditfences --strict" is a small follow-up scope. |
| **Track B + Track A interaction** — Track A modifies many doc-adjacent files; Track B's `flagExistsInCli` etc. asserts against those modified files | Low | Track A is sequenced first (per plan.md). Track B's initial assertion set runs against the post-Track-A state, so it has accurate baseline. |

---

## Dependencies

| Spec | Why |
|---|---|
| **019 — agent-orchestrator-kit** | The kit being cleaned up. Track A fences foundational orchestrator code from this spec; Track C extends the MCP surface this spec defined. |
| **026 — CodeFencing** | Track A enforces the fence convention this spec established. Track A also satisfies the "every new top-level declaration is fenced" CLAUDE.md rule for the spec 030/031 additions. |
| **030 — StageGateConsolidation** | Track C completes the MCP-adapter mapping rows spec 030 created (9 inert → 0 inert). Track A fences the new code spec 030 added. |
| **031 — ImplementEnhancements** | Track A dogfoods the v0.6.0 enhanced `implement <scope>` against the kit itself. Track A fences the batch-mode code spec 031 added. |

This spec is **not** a dependency of any planned future spec — it's terminal-leaf cleanup work.

---

## Out-of-Band Issues to Track Separately

1. **Other broken commands per Spec 019.** `buildscope --edit` and `createspecs` are still reportedly broken at the CLI layer (spec 031 only fixed `implement` and `dbpush`). Track as separate Spec 019 follow-up.
2. **"Claude coworker" enhancement.** Deferred from spec 031. Pending its own discussion + scope.
3. **MCP-side batch mode question.** Whether `project.implement` on MCP should grow a batch equivalent. Pending the "Claude coworker" discussion.
4. **Schema addition: `taskfencehistory.action` column.** Spec 031 FR-004 specified a richer history schema than the current `taskfencehistory` table supports. Adding the `action` column (with values like `'delete'`, `'delete-with-drift'`, `'replace'`, `'modify'`) is a small schema-change scope that would fully satisfy spec 031 FR-004.
5. **CI gate for `auditfences --strict`.** Today the strict mode is a developer-invoked command, not a CI gate. Wiring it into PR checks would prevent regression after Track A's clean baseline.
6. **Spec 033 — Spec-Parser Consolidation.** Second concrete ADR-0001 application. Sequenced after this spec.
7. **Spec 034 — Fence-Writer Consolidation.** Third concrete ADR-0001 application. Sequenced after spec 033.
8. **The 7 architecture-review candidates not yet specced** (per session-start architecture review): Company tenant scope, Role authorization seam, Project Repository / pass-through services collapse, PM System Token Vault, Dashboard view/data split, Project domain schema unification. These live outside the kit (wxKanban app code) — separate concerns from the kit-housekeeping work in 032/033/034.

---

## Data Model

N/A. This spec introduces no new database tables and no schema changes. Track A's fence DB writes use existing `taskfences` rows. Track C's MCP handler additions use existing tables (no new schema for the 9 new tools). The taskfencehistory.action column addition (out-of-band #4 above) is deliberately deferred.

## Acceptance Criteria

See **FR-017**. The 6 numbered conditions there are the canonical acceptance gate.

## Out of Scope

See the **Scope Boundary (OUT)** row of the Core Design table in the Overview section, and the **Out-of-Band Issues to Track Separately** section above for explicit non-goals.
