# Spec 035: Kit-Native Autonomous Coordinator — Provider-Agnostic Parallel Sub-Agent Orchestration

**Spec Number**: 035
**Status**: `stub` — full interactive buildscope pending; targeted for next month after specs 032/033/034 ship
**Created**: 2026-05-17
**Depends On**: 019-agent-orchestrator-kit, 031-ImplementEnhancements (batch-mode foundation), 033-SpecParserConsolidation (typed `SpecTask.dependencies` for parallelization-safe grouping), 034-FenceWriterConsolidation (single `applyFenceWrite` API the coordinator dispatches to)
**Source**: in-conversation stub during spec 030 implementation completion + 032/033/034 paper-only buildscope, 2026-05-17. Triggered by user discovery of Claude Cowork as a "sub-agent coordination" pattern; user explicitly directs that the kit-native equivalent **must be provider-agnostic**, not tied to Claude or any specific editor AI.

---

> **Boundary with SCOPE-132 (stated 2026-09-25, SCOPE-132 FR-024).** SCOPE-132 built a
> Claude-specific, single-agent driver on the SCOPE-102 bridge with a human approving each gated
> action. It does not satisfy this spec's provider-agnostic directive and does not supersede it;
> this spec stands. Should this coordinator be built, its escalations should reuse SCOPE-132's
> override gate rather than invent a second one.

## Status

**This is a stub.** Full functional requirements, plan, and tasks have not been buildscoped yet. Targeted for next month after specs 032/033/034 ship, since this scope's design space benefits materially from those three landing first.

---

## Overview

A new **fourth kit surface** — autonomous coordinator — that runs scope implementation end-to-end without requiring an editor AI (Claude Code, Claude Desktop/Cowork, Cursor, etc.) to be present. Joins the existing three surfaces: CLI (`wxkanban-agent <command>`), MCP server (`project.<tool>`), and web editor.

The capability: given a scope number, spawn N parallel AI workers, generate proposals for parallelizable task groups concurrently, apply via the kit's existing fence-write pipeline sequentially in dependency order, report progress, run to completion. Truly headless — runs from a CI job, a server, a `nohup` background process, a cron schedule.

The motivating use cases:

- **Background refactor execution**: start `coordinate 033` before leaving for the day; come back to a completed (or partially-completed-with-failures) scope.
- **CI-driven refactors**: a scheduled job runs `coordinate <scope>` against a freshly-merged paper artifact, surfaces failures for human review.
- **Server-side orchestration**: a webhook or scheduled trigger drives scope implementation without any developer session active.

### Provider agnosticism is load-bearing

**This scope is explicitly NOT Claude-specific.** Per user directive (2026-05-17): the kit's autonomous coordinator must work with any LLM provider that satisfies the kit's existing `LLM_PROVIDER` contract (per memory reference `reference_llm_provider_contract`: Groq + llama-3.3-70b-versatile default; Anthropic, OpenAI, others as alternatives).

The kit already has this provider-agnostic infrastructure in place — the web editor surface uses it; `workers/ai/buildscope-worker.ts` is a working example. This scope builds the coordination layer on top of that existing infrastructure. No new provider integrations are required; no provider-specific features are assumed.

Claude Cowork (Anthropic Claude Desktop's agentic feature) is one **inspiration** for the UX pattern (sub-agent coordination, progress in side panel, autonomous background work). But the kit's coordinator is independently built; it works without Cowork, without Claude Desktop, without Claude Code, without any Anthropic-specific surface.

### Relationship to Spec 019 R6a

Spec 019 R6a states *"kit is workflow engine, not AI client — VS Code commands NEVER call kit-internal AI; user's editor AI generates, kit validates+writes+fences+audits via MCP. Only the web editor uses kit-internal AI."*

This scope adds a second exception to "VS Code commands NEVER call kit-internal AI": **the autonomous coordinator (a kit-side surface, not a VS Code command) calls kit-internal AI via `LLM_PROVIDER`**. Same exception shape as the existing web editor. R6a doesn't forbid it; it defines a separate lane (VS Code commands ≠ coordinator surface ≠ web editor surface).

The ADR-0001 follow-up note for this scope: every kit surface has its own behavior, but they all consume the same canonical modules (policy from 030, spec-io from 033, fencing from 034). Coordinator is no exception — it dispatches into the same `applyFenceWrite` 034 establishes.

---

## Scope (provisional — to be confirmed at buildscope)

### IN
- New CLI surface: `wxkanban-agent coordinate <scope> [flags]`.
- Worker pool implementation (N parallel workers; per-process or async — design decision).
- Parallelization planner: reads typed `SpecTask.dependencies` (spec 033), computes dependency-respecting parallelizable groups, dispatches workers per group.
- Sequential apply path: collected proposals applied via `applyFenceWrite` (spec 034) in dependency order; concurrent generation, serial application.
- Progress reporting: structured JSONL log file (`.wxai/coordinator-progress.jsonl` or configurable); optional HTTP endpoint (`--progress-http <port>`) serving the same data for external UI consumption.
- Configuration:
  - `--concurrency N` (default: 4)
  - `--model <name>` / `--provider <name>` (overrides `LLM_PROVIDER` env)
  - `--progress-log <path>` and/or `--progress-http <port>`
  - `--review-gates per-slice | per-task | none` (default: per-slice — pauses for review at slice/task-group boundaries)
  - `--failure-mode halt | continue-independent | retry-once` (default: halt)
  - `--resume` — picks up where a prior run left off (tasks already `done` skipped)
- Resumability: tasks.md `status` field IS the resumability state. Re-running `coordinate <scope>` after a partial run picks up only `todo` tasks. Same idempotency contract as spec 031 batch mode.
- Failure handling: per `--failure-mode` setting; each failure logged to progress JSONL with structured reason.
- Documentation: a new `wxkanban-agent/docs/coordinator.md` describing the surface and its configuration.

### OUT
- Provider-specific features. The coordinator uses the existing `LLM_PROVIDER` abstraction — no new Anthropic-specific, Groq-specific, or OpenAI-specific code paths.
- A graphical side-panel UI. The HTTP progress endpoint provides the data; a UI consuming it is a separate concern (could ship as a small static HTML page in `wxkanban-agent/docs/coordinator-ui/`, or live entirely in a downstream consumer's environment).
- Cross-scope coordination (running 032+033+034 in one invocation). One scope per invocation; cross-scope sequencing is the user's job.
- Multi-machine distributed coordination. Single-machine, single-process (or threads/async) only.
- Real-time human-in-the-loop conversational steering. The coordinator runs to its configured review gates or to completion; mid-run conversational adjustment is the editor-AI surface's job (Claude Code, Cowork, etc.), not this surface's job.
- Changes to spec 031's interactive batch mode (`implement <scope>`). The coordinator is a SIBLING surface, not a replacement. Both ship; users pick per task.
- Changes to the `LLM_PROVIDER` contract itself.

---

## Design questions to resolve at buildscope

Repeating + extending the questions surfaced during the 2026-05-17 discussion:

1. **Apply concurrency model** — sequential apply only (one task at a time, even if proposals were generated in parallel) vs concurrent apply for independent files (faster but raises DB-transaction questions)? Sequential is simpler and matches today's spec 031 batch behavior.

2. **Worker isolation** — separate processes (clean LLM-client state, setup cost), worker threads (medium), or async workers in one event loop (lightest)? The provider-agnostic design probably prefers processes (cleanest provider-client lifecycle isolation).

3. **Per-task vs per-slice review gates** — `--review-gates` flag default. Cowork's UX is autonomous-with-progress; the safer default for refactors might be per-slice (pause every 5 tasks for human review). Decide at buildscope.

4. **Failure recovery** — `--failure-mode` options. Three are sketched: halt (default), continue-independent (skip the failed task's downstream deps, continue independent branches), retry-once (rerun the proposal generation with a different prompt and/or model). Retry-once introduces non-determinism; decide whether to include.

5. **Progress format** — JSONL is the universal lowest-common-denominator. Each line is `{ timestamp, taskId, event: 'started' | 'proposal_generated' | 'applied' | 'failed' | 'skipped', details }`. HTTP endpoint serves the same data as Server-Sent Events or simple polling. Define the schema precisely at buildscope.

6. **HTTP endpoint scope** — read-only progress streaming? Or also accept commands (pause, cancel, resume)? Read-only is simpler; commands add operational surface. Defer commands unless a UI use case demands them.

7. **Cross-scope coordination** — explicitly OUT in this stub. Confirm at buildscope; a future enhancement could add `coordinate --scope 032 --scope 033 --scope 034` for true multi-scope orchestration, but that's a major scope expansion.

8. **Resumability semantics** — `--resume` flag, OR is resumability implicit (always picks up `todo` tasks regardless of flag)? Per spec 031 batch behavior, implicit resumability is the precedent. Confirm.

9. **Provider configuration discovery** — `LLM_PROVIDER` env var (current contract), or also support a config file (`.wxai/coordinator-config.json`)? File config is friendlier for multi-environment setups but adds another config surface.

10. **Progress UI as part of this scope or follow-up** — the JSONL log + HTTP endpoint are the data; a consumable UI is a separate concern. Stub recommendation: data in 035, optional reference UI in a follow-up 036-or-similar small scope.

---

## Why this is sequenced AFTER 032 / 033 / 034

The capability is much harder to build without them:

- **Without spec 032**: kit isn't at a clean `auditfences --strict` baseline; new coordinator code adds to the unfenced-declarations debt; worse, the coordinator itself would be added unfenced.
- **Without spec 033**: dependency-respecting parallelization is impossible because `SpecTask.dependencies` is empty. Coordinator would fall back to file-order walking, defeating most parallelism benefit.
- **Without spec 034**: each worker's apply step would touch multiple modules (fence-emitter, fence-db, drift check) — coordination is harder. Spec 034's single `applyFenceWrite` API is the right shape for an apply-coordinator to call.

If built before those three land, the coordinator inherits all the consolidation debt and has a worse architecture. Building it after means the kit's foundation is solid and the coordinator can focus on its own concerns.

---

## Why this is its own scope (not bundled with 032/033/034)

Each of 032/033/034 is focused on a single architectural concern. Bundling the coordinator into any of them would:

- Dilute the design depth each of those scopes already justifies on its own.
- Introduce a new surface (coordinator) into refactor scopes whose entire point is consolidation, not expansion.
- Couple the coordinator's design (which has its own open questions) to the timeline of the consolidation scopes.

A separate scope is the right shape. It's the natural fourth scope in the post-spec-030 architectural cleanup arc:

- 030 — Stage Gate consolidation (first ADR-0001 application)
- 032 — kit housekeeping (fence + docs + MCP parity)
- 033 — spec parser consolidation (second ADR-0001 application)
- 034 — fence writer consolidation (third ADR-0001 application)
- **035 — kit-native autonomous coordinator (new fourth surface)**

After 035 ships, the kit's architectural cleanup arc is structurally complete. Future scopes return to feature work.

---

## Next steps

1. Ship spec 032 (Kit Housekeeping).
2. Ship spec 033 (Spec-Parser Consolidation) — populates `SpecTask.dependencies`.
3. Ship spec 034 (Fence-Writer Consolidation) — establishes `applyFenceWrite` as the single apply API.
4. **Open a fresh interactive buildscope session for spec 035 against this stub.** Walk the 10 design questions above; expand into full functional requirements; generate plan + tasks. Targeted timing: next month (2026-06).
5. Implement spec 035.

After 035 lands, the kit can run autonomous refactor implementations end-to-end without depending on any specific editor AI surface. The coordinator complements Claude Code's Agent tool (in-IDE conversational parallelism), Claude Cowork (in-Desktop background work), and any other editor-AI surface — but doesn't require any of them.

---

## Provider-agnosticism — the key design principle

Reiterating because this is the user's explicit directive (2026-05-17): **the autonomous coordinator must work with ANY LLM provider supported by the kit's `LLM_PROVIDER` contract**. Concrete tests:

- Run `coordinate 030 --provider groq` with `GROQ_API_KEY` set → works against Groq.
- Run `coordinate 030 --provider anthropic` with `ANTHROPIC_API_KEY` set → works against Anthropic.
- Run `coordinate 030 --provider openai` with `OPENAI_API_KEY` set → works against OpenAI.
- Switch providers mid-scope (between `coordinate` invocations) → no internal state assumes a specific provider.

The implementation reuses the kit's existing AI worker pattern (`workers/ai/buildscope-worker.ts` etc.). New code added by this scope is coordinator logic + worker pool + progress reporting — not new provider integrations.

This is what makes the kit "our own" rather than tied to any specific vendor's agentic UI feature.

---

*Stub created during specs 032/033/034 paper-only buildscope session, 2026-05-17. Promote to full spec via interactive buildscope when ready (targeted: next month). Provider-agnosticism is a non-negotiable design principle per user directive.*
