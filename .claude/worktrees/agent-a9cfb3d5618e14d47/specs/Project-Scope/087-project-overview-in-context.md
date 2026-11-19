# SCOPE-087 — Project Overview Always-In-Context

**Scope Number**: SCOPE-087
**Status**: `draft`
**Created**: 2026-07-04
**Depends On**: SCOPE-025 (Project Overview Builder — authors/persists `projectoverview.md` at repo root), SCOPE-080 (kit field-defect hardening — SPEC-FIRST gate in scaffold `CLAUDE.md`)
**Source**: `specs/Project-Scope/087-project-overview-in-context.md`

---

## Overview

Every wxKanban consumer project already has a `projectoverview.md` at its repo root — the canonical, AI-authored definition of what the project is (spec 025). Yet Claude Code sessions don't reliably have it in view: the kit's SessionStart hook injects orchestrator status as `additionalContext`, which can be evicted on context compaction, and nothing references the overview from the always-loaded project instructions.

This scope makes the project overview durably present for the entire session by having the kit maintain a single managed import line inside the consumer `CLAUDE.md`. Because `CLAUDE.md` is reloaded into every context window, a `@projectoverview.md` reference there survives compaction — unlike a one-time hook injection.

The kit writes the import inside a clearly-marked managed block so it can be inserted, refreshed, or removed idempotently without disturbing hand-edited `CLAUDE.md` content. The block is ensured on every kit run (scaffold, session start, or kit-update), so existing installs are backfilled — not only freshly scaffolded projects. A missing or not-yet-authored `projectoverview.md` is harmless: Claude Code silently ignores a dangling import until the overview exists.

This is a context-plumbing change only. It does not alter how `projectoverview.md` is authored, stored, or watermarked (that stays spec 025), and it adds no new document, doctype, DB row, or MCP surface.

## Core Design

**Primary:** the consumer developer running Claude Code in a wxKanban project — who gets the project's overview held in context for the whole session without having to paste or re-open it.

**Secondary:** the kit maintainer — who owns the orchestrator-scaffolded `CLAUDE.md` and needs the import wired in one canonical place that stays idempotent across kit versions.

**Key value:** one managed line turns the already-existing `projectoverview.md` into always-on project context, so every session starts grounded in what the project actually is — closing the gap between "the overview exists on disk" and "the assistant is actually using it."

**Scope boundary (IN):** a managed, marker-delimited import block in the consumer `CLAUDE.md`; idempotent ensure-on-run so scaffold, session start, and kit-update all converge to the same single block; correct handling when `projectoverview.md` is absent; the change landing in the orchestrator-owned scaffold `CLAUDE.md` (separate repo) plus whatever kit run-path ensures the block.

**Scope boundary (OUT):** any change to how the overview is authored/generated/stored (spec 025 owns that); injecting the overview via the SessionStart hook; rendering, summarizing, or truncating the overview before import; multi-project workspaces (wxKanban is one active project per workspace); any new doctype, DB write, or MCP tool.

---

## Functional Requirements

> **Filename correction (2026-07-15) — read before implementing.**
>
> This document writes the overview file as lowercase **`projectoverview.md`** throughout. **That spelling is wrong.** The real file is **`ProjectOverview.md`** (CamelCase), confirmed three ways: the kit generator writes `filepath: 'ProjectOverview.md'` (`src/server/services/KitGenerationService.ts:307`), the upgrade preserve-list names `ProjectOverview.md` (`scripts/upgrade-kit.mjs:402`, `scripts/sync-to-orchestrator.mjs:323`), and `git ls-files` — which is case-exact — reports `ProjectOverview.md`.
>
> **Why this matters more than a typo.** An `@projectoverview.md` import resolves fine on Windows and macOS (case-insensitive filesystems) and **dangles on Linux — including CI and any Linux dev box**. FR-005 deliberately makes a dangling import *silent*, so this fails **invisibly on exactly the platforms where it breaks**: no error, no log, the overview simply never reaches the model, and the scope's whole purpose quietly does not happen. It would pass every check on the author's machine.
>
> **When implementing:** write the import as `@ProjectOverview.md`, or resolve the filename case-insensitively before writing the block (no case-insensitive file-discovery helper exists in the kit today — every lookup is exact-match `existsSync`, so that would be new code). Prefer the exact spelling; it is simpler and matches what the generator actually emits.
>
> **Also fix downstream:** SCOPE-093 has already inherited the wrong spelling — `specs/Project-Scope/093-token-efficiency-context-reuse.md:170` says it will reuse this mechanism and repeats `@projectoverview.md`.
>
> The lowercase spelling is left in place below rather than silently rewritten, so this correction stays visible to anyone who read the original.

**FR-001 — Managed import block.** The consumer `CLAUDE.md` carries a single import block delimited by unambiguous markers (e.g. `<!-- wxKanban:overview-import BEGIN -->` … `<!-- wxKanban:overview-import END -->`) whose body is the line `@projectoverview.md` — **see the filename correction above: this must be written `@ProjectOverview.md`**.

**FR-002 — Idempotent ensure.** A kit routine guarantees exactly one such block. Running it repeatedly on an already-correct file makes no change and never produces a second block.

**FR-003 — Backfill on run.** The ensure runs on the existing kit run-paths (scaffold, SessionStart, kit-update), so projects already installed today gain the block on their next session rather than only newly scaffolded ones.

**FR-004 — Non-destructive.** The routine only ever writes between its own markers. Content outside the markers — including hand-edits to `CLAUDE.md` — is preserved byte-for-byte. If the block exists but has drifted (wrong path, extra lines), it is rewritten to canonical content.

**FR-005 — Missing-overview tolerance.** The block is maintained regardless of whether `projectoverview.md` currently exists; a not-yet-authored overview yields a dangling import that Claude Code silently ignores, with no error surfaced.

**FR-006 — Scaffold carries it canonically.** The orchestrator-owned scaffold `CLAUDE.md` template ships the managed block, so a fresh scaffold is correct without depending on the ensure pass having run.

**FR-007 — Fail-open.** If `CLAUDE.md` is unreadable or the ensure otherwise throws, the kit run / SessionStart continues normally (log-and-continue, matching the watermark/devplan/lifecycle fail-open convention). The feature never blocks a session.

**FR-008 — No file conjuring.** The routine operates only on an existing `CLAUDE.md`; it does not create a `CLAUDE.md` where none exists (that remains the scaffolder's job under FR-006).

---

## Success Metrics

**SM-001 — Coverage.** After the ensure routine runs, 100% of consumer projects that have a `CLAUDE.md` contain exactly one well-formed managed import block (verified by counting BEGIN/END marker pairs == 1 across a sample of scaffolded + backfilled projects).

**SM-002 — Idempotency.** Running the ensure routine N consecutive times on the same project produces 0 byte-level changes after the first run (measured by a no-op diff on runs 2…N in the unit test).

**SM-003 — Context durability.** In a session opened on a project whose `projectoverview.md` exists, the overview's content is present in context through at least one compaction cycle — i.e. it is reachable after compaction because it loads via `CLAUDE.md`, whereas the SessionStart-injected orchestrator blob need not be. Verified by confirming the `@projectoverview.md` line resolves from the always-loaded `CLAUDE.md` (not from `additionalContext`).

---

## Dependencies & Risks

**Dependencies**

- **Spec 025 (Project Overview Builder)** owns authoring and persistence of `projectoverview.md` at the repo root. This scope only references that file; it does not change how it is produced. If 025's root-file persistence ever moved, this import path moves with it.
- **SCOPE-080 (kit field-defect hardening)** hardened the SPEC-FIRST gate inside the same orchestrator-owned scaffold `CLAUDE.md`. Adding a second managed block must leave the gate text intact so `assertSpecFirstGateHardened()` in `sync-to-orchestrator.mjs` still passes at release.
- **Kit distribution path.** The scaffold `CLAUDE.md` is orchestrator-owned and lives in the separate `wxKanban-agent-Orchestrator` repo (not mirrored by this repo's sync). The template edit (FR-006) lands there; the ensure-on-run routine (FR-002/003) attaches to an existing kit run-path (the SessionStart `cli.ts` path that already hosts `ensureCockpitUpToDate` / `ensureKitUpToDate`).

**Risks**

- **Always-loaded token cost.** The overview is loaded every context window. It is a bounded, human-authored doc so the cost is acceptable; deliberately OUT of scope to summarize/truncate. Flag only if an overview grows pathologically large.
- **Claude Code `@import` reliance.** Depends on Claude Code's standard `CLAUDE.md` `@path` import and its silent-ignore-on-missing behavior. On a client that didn't support imports the block is inert (harmless), not erroneous.
- **Gate-verifier collision.** Careless editing of the orchestrator `CLAUDE.md` could trip the SPEC-FIRST regression guard. Mitigation: the block goes in its own marked region, well away from the gate's required phrases.
- **Dogfood parity.** This repo is itself a wxKanban project with a root `ProjectOverview.md`; its own `CLAUDE.md` should carry the same managed block so we dogfood the behavior. Called out so it isn't forgotten.
- **SessionStart latency.** The ensure routine runs on the session-start path; it must stay a cheap read + marker check to avoid slowing startup. Mitigation: single file read, regex marker check, no network.
