---
name: scope-flow-map
description: Build one overall Mermaid dependency map of the whole wxKanban build from specs/Project-Scope/*.md — showing how scopes connect across different processes and flows, including connections that no single scope doc reflects. Use when asked for a cross-scope flow diagram, a "big picture" of how scopes relate, a dependency graph of the project, or to spot scopes that are wired together but don't say so.
---

# Scope Flow Map

## Overview

This skill produces a single, whole-project diagram of how every `SCOPE-NNN` connects to
every other — hard `Depends On` edges, soft `Related Scopes` edges, and the implicit
cross-process connections (shared tables, services, sink projects, or one user journey split
across scopes) that live only in prose and are never captured in any single scope doc. The
goal is the picture you can't get by reading scopes one at a time: what is actually being
built and how the pieces wire together.

Two halves: a script does the deterministic, error-prone parsing; Claude does the judgment.

## Workflow

### 1. Extract the explicit skeleton (deterministic)

Run the extractor from the repo root:

```bash
PYTHONUTF8=1 python .claude/skills/scope-flow-map/scripts/extract_scope_edges.py --format both
```

It reads every `specs/Project-Scope/*.md`, resolves each scope's number/title/status, and
emits JSON (`nodes`, `edges`, `unresolved`) plus a baseline `graph LR`. `--format json` or
`--format mermaid` narrow the output; `--scopes-dir` overrides the location.

Edges: `dependsOn` → solid `-->`, `related` → dotted `-.->`. References are kept only when
they resolve to a real scope file, which filters out dates, versions, and FR/task numbers.

### 2. Account for unresolved references

`unresolved` lists cited numbers with no `Project-Scope` file — almost always real
dependencies on **implementation specs** (`SPEC-NNN`), a different namespace from `SCOPE-NNN`.
Read `references/scope-corpus.md` ("the SCOPE vs SPEC trap") before deciding what to do.
Surface these as external/footnote nodes — never drop them, never invent a fake scope node.

### 3. Find the connections the docs don't state (judgment)

This is the point of the skill. The skeleton from step 1 is only what scopes admit to. Read
the prose — `**Related Scopes**`, Overview, Dependencies/Notes — to find scopes that are wired
together but don't cite each other: shared DB tables, a shared sink project, a reused service,
or two scopes on opposite ends of one flow. Add these as annotated edges (label the shared
mechanism, e.g. `feedbacksubmissions table`). Memory and `CLAUDE.md` are good corroboration
(e.g. 043/061/063 all share the feedback table and sink). Do not invent connections — every
added edge must trace to evidence in the text.

### 4. Cluster by process, then render

Group nodes into `subgraph` clusters by process/flow (consulting, feedback/bug pipeline,
marketing, kit/dev-tooling, core app & lifecycle, stack/theme, billing). `references/
scope-corpus.md` has the current cluster starting point — re-derive from the actual data, do
not hard-code. The headline of the map is the **cross-cluster arrows**: the connections that
span processes. Keep node labels short (`SCOPE-NNN` + truncated title) and preserve the
status colour classes the script emits.

### 5. Deliver: write the report, then summarize in chat

Default behaviour: **write the map to `specs/Project-Scope/_analysis/cross-scope-flow.md`**
(create `_analysis/` if missing) — same `_analysis/` convention `/analyzescope` uses, git-tracked
so the map is diffable, and already skipped by the extractor so the map never maps itself. The
file holds: the fenced ```mermaid block, the "what the cross-cluster edges reveal" prose, any
namespace/dependency anomalies found (dashed external nodes + the unresolved list), and a one-line
generated-by note. Then give a short read in chat and link to the file.

Clustering is judgment per run (the KISS default). It is therefore **not reproducible** run-to-run
— if cluster-drift in the git diff becomes a problem, the reserved next step is a deterministic
shared-substrate heuristic *in the script* (group scopes that touch the same table/service), not a
new metadata field. Do not add a `cluster:` hint to scope docs.

Do not push to `projectdocuments` or write any DB doctype unless explicitly asked (that crosses
into SPEC-060 / lifecycle territory). Surface anomalies visually but **defer the verdict to
`/analyzescope`** — this skill is the cartographer, not the auditor.

## Relationship to `/analyzescope` (the seam — don't blur it)

`/analyzescope all` (SCOPE-060) overlaps this skill: it also derives a dependency edge list and,
in `all` mode, emits a dependency-graph summary + a scope×scope conflict matrix, and its
cross-scope passes target the *same* defects this map surfaces (dependency-graph integrity,
`SCOPE-NNN` vs `SPEC-NNN` numbering collisions). They are deliberately **different tools**:

| | `scope-flow-map` (this skill) | `/analyzescope` |
|---|---|---|
| Role | Cartographer — the visual, clustered whole-build picture | Auditor — findings with severity, IDs, gate |
| Output | One Mermaid graph + implicit-substrate edges (`projectdocuments`, `feedbacksubmissions`, `LLM_PROVIDER`) | Findings table, conflict matrix, edge-list summary |
| Determinism | **Non-deterministic by design** (clustering is judgment) | **Diff-stable required** (gates `createspecs`/CI) |
| Verdict | Surfaces anomalies, assigns **no severity** | Owns severities + remediation + Next Actions |
| Output file | `_analysis/cross-scope-flow.md` | `_analysis/cross-scope-analysis.md` |
| Persistence | Disk-only | Disk + `projectdocuments` push |

Rules of the seam:

- **Never assign severities or say "CRITICAL."** Surface anomalies (dashed external nodes, the
  unresolved list) and **defer the verdict to `/analyzescope`**; link to its report if one exists.
- The two `_analysis/` filenames differ on purpose — never write to the audit's file.
- Do not grow this skill into a second conflict-detector — that would create two tools that can
  disagree about what's broken. The incompatible determinism contracts are why they stay separate.
- This skill's `extract_scope_edges.py` resolver is more rigorous than the audit's editor-AI
  normalization. Feeding its JSON to `/analyzescope` is a clean future option (deterministic
  tooling, not AI-in-the-kit) but requires moving the script into the kit surface — a deliberate
  coupling decision, not a freebie. Keep them independent until that's explicitly wanted.

## Conventions to respect

- `SCOPE-NNN` ≠ `SPEC-NNN` — same integers, different namespaces. Always prefix; never conflate.
- This map is read-only over scope docs. It does not edit scopes or run the orchestrator.
- KISS: one diagram, judgment-annotated. It is not `/analyzescope` (audit) or SPEC-059 (per-scope
  process flow) — it is the whole-build connection picture those two don't provide.

## Resources

- `scripts/extract_scope_edges.py` — deterministic edge extractor (step 1).
- `references/scope-corpus.md` — corpus layout, the SCOPE/SPEC namespace trap, dependency-line
  formats, Mermaid styling, and process-cluster starting points. Load it before steps 2–4.
