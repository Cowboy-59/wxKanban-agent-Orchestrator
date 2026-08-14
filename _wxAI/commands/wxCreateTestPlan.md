---
description: Build a requirement-traceable test plan for the stack declared in stack.md (routes/services/commands, data tables, UI page-to-page flows, and any tool surface) — then optionally --Execute it through three signoff gates: smoke, true CRUD & execute, and final user verification. Stack-neutral method; machinery comes from a per-stack adapter.
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

# wxCreateTestPlan — full-surface test plan + three-gate execute

## Purpose

Produce a complete, requirement-traceable **test plan** for wxKanban and, on demand, drive it to a
signed-off run. Inventory every callable unit — route handlers or commands, data tables, services,
**UI/UX page-to-page flows and per-screen functionality**, and any MCP tools — classify and
risk-rank them, write a gated plan plus atomic test items, and file everything into the spec system.
With `--Execute`, run the plan through **three signoff gates**: smoke, true CRUD & execute, and final
user verification.

This command **loads and runs the `wxCreateTestPlan` skill**
(`_wxAI/skills/wxCreateTestPlan/SKILL.md`), which carries the Principal-QA-Architect methodology, the
deterministic inventory script, the two-stage volume gate, the three-gate execute flow, and the
fixed test-item schema.

## Usage

```bash
/wxCreateTestPlan                        # whole app: src/server (+ src/client UI lens)
/wxCreateTestPlan SPEC-051               # requirement-driven: derive from specs/051-*/spec.md FR-###
/wxCreateTestPlan SCOPE-047              # a scope umbrella → its implementing spec(s)
/wxCreateTestPlan src/server/routes      # path subtree filter
/wxCreateTestPlan SPEC-051 --Execute     # plan (or reuse plan), then run the three signoff gates
```

- **No argument** → whole app. Backend `src/server` plus `src/client` as an explicit UI/UX lens.
- **`SCOPE-NNN` / `SPEC-NNN`** → **requirement-driven** (primary mode): every `FR-###` in the spec
  becomes a traceable requirement; implementing code is located via its `[SCOPE NNN / Tn]` fence.
  (Disambiguate SCOPE vs SPEC per CLAUDE.md — a bare number is ambiguous.)
- **A path** → subtree filter.
- **`--Execute`** (any casing) → run the execute pipeline. Omit it to stop after filing the plan.

## Behavior

1. **Preflight:** confirm the skill exists at `_wxAI/skills/wxCreateTestPlan/SKILL.md`, read it, and
   follow its phases in order.
2. **Resolve the stack adapter FIRST:** read `stack.md` at the repo root and load the matching
   adapter from `_wxAI/skills/wxCreateTestPlan/adapters/`. The method is stack-neutral; the
   inventory command, schema source, harness and UI driver all come from the adapter. **If no
   adapter matches the declared stack, stop and say so** — never run the TypeScript extractor
   speculatively, because a zero-unit inventory from the wrong stack reads exactly like a real one.
3. **PLAN mode (default):**
   - **Phase 0 — Scope & DB posture:** resolve the target, read the relevant `specs/NNN-*/spec.md`
     first (SPEC-FIRST is mandatory), and announce the DB posture out loud.
   - **Phase 1 — Inventory (deterministic):** run the adapter's inventory command to enumerate every
     unit — routes/services/commands, data tables, and UI navigation edges. Cross-check counts;
     a mismatch is a finding, and a zero-unit inventory is never a result to plan against.
   - **Phase 1B — Database schema analysis:** analyze the schema from the source the adapter names —
     a **referential-integrity score (0–10)** plus actionable `file:line` findings for field/table
     definitions, orphaned tables & data, missing indexes, and excessive/redundant indexes. On any
     ORM-first stack, also diff the model-built schema against the checked-in one; the diff is a
     finding.
   - **Phase 2 — Plan (gated):** emit a coverage summary and **get approval before writing item
     bodies**; then a second **Senior Database Engineer persona** runs (after approval) with a
     data-layer **constraint-gap analysis** before expanding `layer: data` items; instantiate all
     items by risk tier under the caps.
   - **Persistence:** the plan, items, schema analysis, and signoffs are **written to the wxKanban
     database** (source of truth) via the orchestrator; local `tests/testplans/<target>/` files are
     the rendered copies.
4. **EXECUTE mode (`--Execute`):** build the harness the adapter prescribes — always driving units
   through the same registration path production uses — then run the **three signoff gates**, filing
   each into wxKanban:
   - **Gate 1 — Smoke signoff:** everything responds without crashing (read-only / mocked).
   - **Gate 2 — CRUD & execute signoff:** a real create→read→update→delete round-trip plus behavior
     execution, **only against a target proven non-production** (the adapter names the routes and
     how each is verified). Production is forced to UAT; writes against the production connection
     are hard-refused.
   - **Gate 3 — Final signoff:** **user verification.** The skill presents the evidence and stops;
     the record is filed **pending** until you confirm — it never self-certifies. **You may add new
     test cases here** — each is captured, persisted to the DB, run, and folded into the report
     before you sign off.
5. **UI/UX coverage:** the plan covers screen-to-screen navigation (and back), guarded entry points,
   deep-link/refresh where the platform has URLs, and per-screen element functionality — driven by
   the adapter's UI driver (Playwright on the web, UI Automation on WPF).
6. **Findings over quiet fixes:** a failing test on correct-looking logic is a **finding** — it goes
   in the report and the spec system, never into a silent patch of product source. Ambiguity and
   untraceable behavior go to **Clarifications Required**.

## Safety

- **Resolve the adapter before anything else**, and stop if none matches the declared stack. Running
  one stack's tooling against another returns an empty result that reads exactly like a real one.
- **Never mutate the production database.** The CRUD/execute gate refuses to run without a target
  proven non-production. If a shared or hosted connection is offered, its **non-prod capability is
  verified first** — unverified → hard-stop, no prod fallback. (On wxKanban specifically, the local
  `.env` points at prod.)
- No real email/SMS/payment/third-party side effects in any tier.
- Does not run git and does not edit product source to make a test pass unless you ask.

## Exit conditions

**PLAN:** inventory produced, a gated `TEST-PLAN.md` + `test-items.json` written under
`tests/testplans/<target>/` and filed into wxKanban. **EXECUTE:** the three signoff docs
(`SMOKE-SIGNOFF.md`, `CRUD-SIGNOFF.md`, `FINAL-SIGNOFF.md` pending your verification) plus
`TEST-REPORT.md` with pass/fail results and a ranked remediation list, all filed into the spec system.

## Context

{{args}}
