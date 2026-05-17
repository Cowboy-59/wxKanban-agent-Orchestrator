---
description: Run the wxICA architecture review on the current codebase — mechanical drift audit followed by judgment-driven deepening candidates.
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

# analyzecode — wxICA Codebase Architecture Review

## Purpose

Invoke the **wxICA** skill (wxKanban Improve Codebase Architecture) on the current repository. wxICA ships with the kit at `wxkanban-agent/templates/skills/wxICA/` and is expected to be installed at `.claude/wxICA/` on the consumer machine.

The skill runs in two phases:

1. **Drift Audit** (mechanical, runs first) — four checks for residue left behind by recent refactors: dangling references, cross-package source imports, build-mode coverage, and spec-interaction conflicts. Produces a flat numbered list of concrete defects with `file:line` and a one-line fix each.
2. **Deepening exploration** (judgment-driven) — surfaces shallow modules that are candidates for consolidation via the deletion test. Produces a numbered list of refactor candidates; user picks one to grill.

Use this when:

- A recent refactor or scope was just merged and you want to catch what it forgot to update.
- The codebase has accumulated friction and you want concrete consolidation candidates.
- Tests are hard to write through a module's current interface.
- You want a second pass before declaring a slice "done."

## Usage

```bash
/analyzecode                       # full review: drift audit + deepening exploration
/analyzecode --drift-only          # mechanical drift audit only — stop after step 0
/analyzecode --deepen-only         # skip drift audit, go straight to deepening
/analyzecode --scope <path>        # restrict exploration to a subtree (e.g. src/server/services)
/analyzecode --since <git-ref>     # tailor the drift audit's "recent diff" to a ref (default: last commit)
```

## Arguments

- `--drift-only` — Run step 0 only. Useful as a post-merge gate; reports defects then stops.
- `--deepen-only` — Skip step 0. Useful when you've already cleaned drift and want to focus on architecture.
- `--scope <path>` — Limit deepening exploration to a subdirectory. The drift audit still scans repo-wide because dangling references can be anywhere.
- `--since <git-ref>` — Drift audit treats this ref as "before"; deletes/renames since this ref feed Check 1. Default: `HEAD~1`.

## Behavior

1. **Preflight**: confirm `.claude/wxICA/SKILL.md` exists. If missing, print:
   ```
   wxICA skill not installed at .claude/wxICA/.
   Install from the kit:  cp -r <kit>/templates/skills/wxICA/. .claude/wxICA/
   ```
   and stop.
2. **Phase 0 (unless `--deepen-only`)**: follow `.claude/wxICA/DRIFT-AUDIT.md` literally. Report findings as a flat numbered list:
   ```
   1. [file:line] <defect> — Fix: <one line>
   2. ...
   ```
   Do not bundle drift findings with deepening proposals.
3. **Phase 1 (unless `--drift-only`)**: follow `.claude/wxICA/SKILL.md` step 1 — explore via the `Explore` subagent, apply the deletion test, present a numbered list of deepening candidates with `Files / Problem / Solution / Benefits`. Then ask: "Which would you like to explore?"
4. **Phase 2** (after the user picks a candidate): drop into the grilling loop in `SKILL.md` step 3. Update `CONTEXT.md` inline when a new domain term crystallizes. Offer an ADR only when the user rejects a candidate with a load-bearing reason.

## Operating Constraints

- **READ-ONLY for steps 0–2.** No file writes during analysis. Edits only happen during step 3 (grilling loop) and only inline for `CONTEXT.md` / ADRs as the user agrees.
- **Use wxICA vocabulary verbatim** — Module / Interface / Implementation / Depth / Seam / Adapter / Leverage / Locality. Do not drift into "component," "service," "API," "boundary."
- **Use CONTEXT.md for domain nouns** when present — talk about "the Time Entry service" not "the FooBarHandler."
- **Respect ADRs in `docs/adr/`** — only surface a candidate that contradicts an ADR when the friction is real enough to warrant reopening it; mark it clearly.

## Exit conditions

- Drift audit finds defects → list them, recommend fixing before deepening, exit.
- Deepening produces zero high-confidence candidates → say so explicitly; do not invent friction.
- User picks a candidate → continue in the same conversation (grilling loop).

## Context

{{args}}
