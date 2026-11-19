# Matt Pocock Engineering Skills — Comparison Analysis

**Source**: https://github.com/mattpocock/skills/tree/main/skills/engineering  
**Date**: 2026-05-02  
**Purpose**: Identify gaps, overlaps, and mergeable patterns between Matt Pocock's engineering skill set and the wxKanban kit.

---

## What Matt Pocock's Repo Contains

9 engineering skills under `skills/engineering/`:

| Skill | What It Does |
|-------|-------------|
| `diagnose` | 6-phase disciplined bug diagnosis: feedback loop → reproduce → hypothesise → instrument → fix → post-mortem |
| `grill-with-docs` | Interview-style plan validation against a domain model (`CONTEXT.md` + `docs/adr/`), updating docs inline |
| `improve-codebase-architecture` | Find "deepening opportunities" (shallow → deep modules) using domain language and deletion-test heuristic |
| `tdd` | TDD via vertical tracer-bullet slices — one test → one impl, never horizontal |
| `to-issues` | Convert plan/spec/PRD into GitHub Issues as vertical slices with HITL/AFK classification |
| `to-prd` | Synthesise conversation context into a PRD, publish to issue tracker |
| `triage` | State-machine issue triage: `needs-triage → needs-info / ready-for-agent / ready-for-human / wontfix` |
| `zoom-out` | One-liner: ask agent to go up a level of abstraction and map all relevant modules + callers |
| `setup-matt-pocock-skills` | Bootstrap per-repo config (issue tracker, triage labels, domain doc layout) for the other skills |

---

## wxKanban Kit — Current Equivalent Coverage

| Matt Pocock Skill | wxKanban Equivalent | Overlap Quality |
|-------------------|---------------------|----------------|
| `diagnose` | None | **GAP** — no structured debugging workflow exists |
| `grill-with-docs` | `buildscope.md` (interactive section-by-section) + `wxAI-clarify.md` | **Partial** — wxKanban does interactive design sessions but has no `CONTEXT.md` / ADR layer |
| `improve-codebase-architecture` | None | **GAP** — no architecture review skill |
| `tdd` | `createtesttasks` command generates test task lists | **Partial** — wxKanban creates test tasks but has no TDD loop discipline or vertical-slice enforcement |
| `to-issues` | `createSpecs` + task generation writes to DB / `tasks.md` | **Partial** — same goal (spec → tasks) but targets internal DB/files not GitHub Issues |
| `to-prd` | `createSpecs` generates spec.md + plan.md + tasks.md + tests.md | **Strong overlap** — wxKanban's pipeline is more comprehensive (5 files vs 1 PRD) |
| `triage` | None | **GAP** — no issue triage workflow; wxKanban has `wxAI-session-start.md` but no issue state machine |
| `zoom-out` | None | **GAP** — no contextual "show me the map" shortcut |
| `setup-*` | `.wxkanban-project.json` + `ai-settings.json` bootstrap | **Partial** — kit bootstrap exists but no `CONTEXT.md` / ADR scaffolding |

---

## Key Conceptual Differences

### Domain documentation model
- **Matt Pocock**: `CONTEXT.md` (living glossary) + `docs/adr/` (architectural decisions). Updated inline during sessions.
- **wxKanban**: `specs/{scope}/spec.md` suite. Rich but scope-scoped; no global domain glossary or ADR store.

**Gap**: wxKanban has no global `CONTEXT.md` or ADR layer. Architecture decisions are scattered across spec files. This makes it hard to run a `grill-with-docs`-style session or enforce "don't re-litigate ADR-007."

### Issue tracker integration
- **Matt Pocock**: GitHub Issues are first-class — `to-issues`, `to-prd`, `triage` all publish/read GitHub Issues directly.
- **wxKanban**: Database-centric — tasks live in PostgreSQL, exposed via MCP server. GitHub is not wired in.

### Skill weight class
- **Matt Pocock**: Lightweight, standalone `.claude/` skills. Drop-in, no dependencies.
- **wxKanban**: Heavyweight 6-phase orchestration system with stage gates, DB sync, policy enforcement.

### Test philosophy
- **Matt Pocock** (`tdd`): Test behavior through public interfaces; vertical tracer-bullet slices; explicit anti-pattern warning against horizontal slicing.
- **wxKanban**: `createtesttasks` generates test task lists; no enforced TDD methodology in the workflow.

---

## What Can Be Added Directly (No Conflicts)

These four skills from Matt's repo can be dropped in as `.claude/{skill}/SKILL.md` files immediately — they have zero overlap with existing kit commands and add standalone value:

### 1. `diagnose` — HIGH VALUE
**What it adds**: A structured 6-phase debugging loop with a "build a feedback loop first" principle. Currently wxKanban has no debugging methodology at all.  
**Integration note**: Works alongside existing specs — the Phase 6 post-mortem explicitly hands off to architecture improvement, which pairs well with `createSpecs`.  
**Suggested path**: `.claude/diagnose/SKILL.md`

### 2. `zoom-out` — HIGH VALUE, ZERO COST
**What it adds**: A single-line prompt that tells the agent to step up a level and map all callers/modules. Extremely lightweight.  
**Integration note**: No conflicts, no dependencies. Just adds a useful shortcut during implementation sessions.  
**Suggested path**: `.claude/zoom-out/SKILL.md`

### 3. `improve-codebase-architecture` — MEDIUM VALUE
**What it adds**: A disciplined process for identifying shallow modules and proposing deepening refactors. Useful during implementation and QA phases.  
**Integration note**: References `CONTEXT.md` and ADRs which wxKanban doesn't have yet — would need adaptation to use `specs/` vocabulary instead, or add `CONTEXT.md` (see below).  
**Suggested path**: `.claude/improve-codebase-architecture/SKILL.md` (with note about `CONTEXT.md`)

### 4. `triage` — MEDIUM VALUE
**What it adds**: A state-machine-driven issue triage workflow. Currently wxKanban has no way to process incoming bugs or feature requests systematically.  
**Integration note**: References GitHub Issues. Would need to either wire up GitHub or adapt state machine to wxKanban's task DB. The state labels (`needs-triage`, `ready-for-agent`, `ready-for-human`, `wontfix`) translate cleanly to internal task statuses.  
**Suggested path**: `.claude/triage/SKILL.md` (adapt label vocabulary to kit's task states)

---

## What Could Be Merged / Improved

### `grill-with-docs` → Enhance `buildscope`
Matt's `grill-with-docs` introduces two artifacts that wxKanban is missing:

- **`CONTEXT.md`** — a living domain glossary. wxKanban's domain terms are buried in `specs/main/data-model.md` and scattered across spec files. A single `CONTEXT.md` at the project root would give all skills a shared vocabulary source.
- **`docs/adr/`** — architectural decision records. wxKanban's design decisions live in `specs/*/plan.md` but are not queryable across scopes. An ADR store would let `diagnose`, `improve-codebase-architecture`, and `buildscope` all reference the same decisions.

**Recommendation**: Add `CONTEXT.md` and `docs/adr/` as a convention in the kit. Wire `buildscope` to update `CONTEXT.md` when new domain terms are resolved.

### `tdd` → Inform `createtesttasks`
Matt's TDD skill enforces vertical slices and warns against horizontal slicing. wxKanban's `createtesttasks` generates task lists but doesn't enforce slice discipline.

**Recommendation**: Add the vertical-slice principle and anti-pattern warning to the `createtesttasks` command definition (`_wxAI/commands/`). Optionally add `tdd` as a standalone skill for when the user wants a guided TDD session outside of the normal pipeline.

### `to-issues` → Complement `createSpecs`
Matt's `to-issues` targets GitHub Issues; wxKanban's equivalent targets its internal DB. These don't conflict — they serve different outputs.

**Recommendation**: Keep `createSpecs` as-is for the internal pipeline. Add `to-issues` as a standalone skill for teams that want a parallel GitHub Issues view from their wxKanban specs. This is additive, not a replacement.

---

## What to Skip

| Skill | Why |
|-------|-----|
| `grill-with-docs` | **Superseded by buildscope enhancements.** buildscope now does everything grill-with-docs does — adversarial questioning, domain vocabulary enforcement against CONTEXT.md, boundary stress-testing with concrete examples, CONTEXT.md updates inline. Adding a separate skill would be redundant and confusing for customers. Decision made 2026-05-02. |
| `to-prd` | wxKanban's `createSpecs` pipeline is strictly superior — it generates spec.md, plan.md, tasks.md, tests.md, quickstart.md, and checklists. A single PRD would be a downgrade. |
| `setup-matt-pocock-skills` | wxKanban already has its own setup via `.wxkanban-project.json` + `ai-settings.json`. No need for a second bootstrap. |

---

## Priority Recommendation

| Priority | Action |
|----------|--------|
| **P0 — Drop in now** | `diagnose` + `zoom-out` as `.claude/` skills. Zero conflicts, immediate value. |
| **P1 — Add soon** | `CONTEXT.md` + `docs/adr/` convention in the kit. Unlocks `grill-with-docs` and `improve-codebase-architecture` properly. |
| **P1 — Add soon** | `improve-codebase-architecture` (adapted for `specs/` vocabulary). |
| **P2 — Plan for next sprint** | Fold TDD vertical-slice discipline into `createtesttasks`. Add `tdd` as a standalone skill. |
| **P2 — Plan for next sprint** | `triage` adapted to wxKanban task states instead of GitHub Issue labels. |
| **P3 — Consider later** | `to-issues` as an optional GitHub Issues output path for teams that want both outputs. |

---

## Note: Second Repo

You mentioned comparing against 2 repos but only provided 1 URL (`mattpocock/skills`). Please share the second repo URL so this analysis can be extended.
