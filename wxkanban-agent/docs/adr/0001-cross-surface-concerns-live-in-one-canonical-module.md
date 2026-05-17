# ADR-0001 — Cross-surface concerns live in a single canonical module

**Status**: Accepted
**Date**: 2026-05-16
**Deciders**: Andy (kit author)

---

## Context

The wxKanban kit exposes the same underlying workflow through multiple permanent surfaces:

- A CLI (`wxkanban-agent <command>`), used by humans and dogfooding.
- An MCP server (`project.<tool>`), used by editor AI agents.
- A growing set of internal helpers (orchestrator, dbpush, pipeline-agent, fence emitter, spec loader).

These surfaces are parallel and durable — the kit is "a workflow engine, not an AI client," and the MCP and CLI surfaces are not transitional. Future surfaces (HTTP, web admin, cron) are plausible.

The repeated failure mode observed in this codebase is that **a concern shared across surfaces gets a separate implementation per surface**, the implementations drift, and the drift produces silent miscompares or surface-specific bugs.

Concrete evidence at the time of writing:

- **Stage Gate policy**: keyed by `'implement'` in [wxkanban-agent/core/policy/command-policy.ts](../../core/policy/command-policy.ts) and by `'project.implement'` in [mcp-server/src/utils/stage-enforcement.ts](../../../mcp-server/src/utils/stage-enforcement.ts). The two surfaces also disagree on phase string values (`'QA Testing'` vs `'QA'`, `'Human Testing'` vs `'HumanTesting'`); the DB matches MCP, so the CLI canonical enum has never matched stored data.
- **Spec format parsers**: at least six modules parse or generate `tasks.md` / `spec.md` independently — `spec-loader.ts`, `spec-md-parser.ts`, `dbpush.ts`, `createspecs.ts`, `task-id-index.ts`, and `mcp-server/src/server.ts` (`createTasksMarkdown`). Two of them (`spec-loader.ts` and `spec-md-parser.ts`) coexist in the same package.
- **Fence writer logic** is split across `fence-emitter.ts`, `implement.ts`, and `fence-db.ts`; adding new fence metadata requires touching all three.
- **MCP tool registry vs gate table** drift, discovered while planning the Stage Gate refactor: the gate table protects 8 stage-gated tools but only 3 are actually registered as MCP endpoints (`project.buildscope`, `project.create_specs`, `project.implement`); the other 5 gate phantom tools. Cross-cutting tools have no MCP registrations either. Tool naming itself is inconsistent (flat / snake_case / camelCase coexist). This is a third drift class on top of the duplicated implementations and disagreeing string values: a registry and its consumers can drift even within a single surface.

The Stage Gate refactor (May 2026) consolidates the first item. This ADR exists to ensure the same pattern is applied to the others and to every future cross-surface concern.

## Decision

**Every concern shared across kit surfaces lives in exactly one canonical module under `wxkanban-agent/core/<concern>/`. Surfaces import from it; they do not reimplement it.**

The pattern is:

```text
wxkanban-agent/core/<concern>/
  <concern>.ts             core pure logic / data
  adapters/
    cli-adapter.ts         surface-specific translation
    mcp-adapter.ts         surface-specific translation
    (future surfaces go here)
```

Concrete rules:

1. **One source of truth per concern.** No `foo-v2.ts` next to `foo.ts`. If a rewrite is needed, replace in place.
2. **Surfaces are thin.** An adapter translates surface names / shapes to the canonical API and back. Adapters contain no decision logic — only mapping.
3. **The kit's external contract is the surface, not the core.** CLI command names, MCP tool names, and spec-file formats are the consumer-facing API. Core modules are internal; renaming or restructuring them does not require a major version bump on its own.
4. **Phase resolution, format parsing, encryption, and other utilities** that any new adapter would need are provided by the core, not reimplemented per adapter.
5. **New surface = new adapter file, not new core.** Adding HTTP / Slack / cron access means writing one adapter that consumes the existing core.

## Consequences

**Easier:**

- A change to gate policy, spec format, fence rules, or any shared concern is a single-file edit. Surfaces inherit the change.
- Drift becomes structurally impossible for any concern that follows the pattern.
- New surfaces are cheap — write one adapter, get correct behavior for free.
- The decision logic is testable in isolation (pure functions, no IO).
- Reviewers can verify "is this duplicate of something already in core?" by checking one directory.

**Harder:**

- Contributors must resist the path-of-least-resistance reflex ("I'll just inline a parser here"). The PR template / review checklist should ask: "Does this concern already exist in `core/`?"
- The first refactor under this pattern (Stage Gate) requires moving code across package boundaries. Subsequent refactors are cheaper because the pattern is established.
- A core module with the wrong shape can become friction for every adapter at once. Mitigated by keeping cores small and decision-focused; if a core grows complex, split it before adding surfaces.

**Not constrained:**

- Concerns that genuinely belong to one surface (e.g., MCP protocol handling, CLI argument parsing) stay in that surface's package. The rule is about *shared* concerns, not all code.

## Known follow-ups governed by this decision

- **Spec parser consolidation** — replace the six parsing implementations with one `wxkanban-agent/core/spec-io/` module. Adapters in `dbpush`, `createspecs`, MCP server, `task-id-index` consume it.
- **Fence writer consolidation** — collapse `fence-emitter.ts`, `fence-db.ts`, and the inline `implement.ts` calls into one `wxkanban-agent/core/fencing/` module.
- **DB connection / phase resolution** — phase resolution lives in `core/policy/resolve-current-phase.ts` per the Stage Gate refactor; future DB-touching adapters use it instead of reimplementing the active-phase query.

## Out of scope for this ADR

- **Specific module boundaries** for not-yet-refactored concerns. Each refactor decides its own seam; this ADR only asserts there shall be one canonical home per concern.
- **Public API design.** The kit is shipped to consumers as installable behavior, not as a TypeScript library. There is no public TS surface to design under this ADR.
- **Extensibility for consumers.** Capabilities, lifecycle phases, and spec formats are kit-fixed today. If they become consumer-extensible later, that is a separate decision; this ADR does not pre-commit either way.

## Vocabulary note

This ADR introduces one internal term that does not appear in the project's [CONTEXT.md](../../../CONTEXT.md) domain glossary, intentionally:

- **Capability** — the kit's internal name for a gated workflow operation (e.g. `ImplementTask`, `RunQa`). User-visible names are CLI commands (`implement`) and MCP tool names (`project.implement`); Capability is the canonical key that both surfaces translate to. Capability is implementation language, not domain language — the domain concept is **Stage Gate** (see CONTEXT.md), which is what governs Capabilities.

---

*This ADR exists to prevent the next contributor from inventing a fourth parser, fourth gate table, or fourth fence emitter. If you are about to add code that resembles something already living elsewhere in the kit, the answer is to consolidate, not duplicate.*
