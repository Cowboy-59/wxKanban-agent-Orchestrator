# Tasks: Token-Efficiency — Context Footprint & Reuse (Spec 093)

Spec ID: e55be53d-228c-4279-b5e3-157c590c9ad9 · 11 tasks · 11 done · **phase: implementation**

| # | Task | Priority | Status | FRs | Task ID |
|---|------|----------|--------|-----|---------|
| T001 | Thin CLAUDE.md + on-demand @-imports | high | done | FR-001 | cc2c862a-33d6-4694-936c-bba9b5b5a0f7 |
| T002 | Gate reference modules to relevant work | high | done | FR-002 | 6e9ea13e-9504-4f97-be08-9c8bed664790 |
| T003 | Rule enforcement reaches editor (reframed from "load rules by domain") | medium | done | FR-003 | 0a31f02b-d06d-4485-a7a9-05f365cf6ba0 |
| T004 | Guard mandatory rules always-on | high | done | FR-004 | 2c672a0b-36cd-4293-abbf-2a48ed33ebc0 |
| T005 | Cache-eligible byte-stable preamble | medium | done | FR-005 | 6ac86ba3-98e9-4836-bd38-b0e269df225a |
| T006 | Cockpit batch-command guidance | low | done | FR-006 | badd6aba-abba-4f99-960b-15ad7f15af54 |
| T007 | Audit + migrate LLM doctypes to deterministic | medium | done | FR-007 | bf1b937d-76d6-4b8b-80be-e0a051aa25fb |
| T008 | Reuse-check before buildscope | medium | done | FR-008 | 2530ab05-4853-41a0-a1f9-e70d63024f7c |
| T009 | Structured create_specs stage handoffs | medium | done | FR-009 | 2816ba86-87e4-448c-b5b1-4f5af1b64e94 |
| T010 | In-the-moment token-saving advisor | high | done | FR-010, FR-011, FR-012 | fe540031-3094-4e0d-941c-3c4522beacfd |
| T011 | Token measurement surface | medium | done | FR-013, FR-014 | edbfbbe4-af04-4a71-adae-ec8ff9e1854f |

## T001 — Thin CLAUDE.md + on-demand @-imports
Split CLAUDE.md into a mandatory always-on core (spec-first, code fencing, orchestrator-first, DB naming, and the other non-negotiable constraints) and reference modules loaded on demand via managed `@`-imports, following the SCOPE-087 project-overview import pattern. Extract the reference sections (Admin Dashboard conventions, lifecycle docs, watermark, help system, dev plan) into module files. Ship through the existing kit-sync allowlists.

## T002 — Gate reference modules to relevant work
Ensure reference modules load only when a command or task touches their subject area, so a session pulls no reference content it does not use. A buildscope-only session must not load the help-system / watermark modules.

## T003 — Rule enforcement reaches the editor (reframed from "load rules by domain")
**Finding:** `_wxAI/rules/` is NOT loaded into the editor AI's context — no `@`-import or hook pulls it in; "auto-discovered" in CLAUDE.md is legacy (AGENTS.md-era) wording. So the original token-saving framing is moot (the rules cost ~0 editor tokens). Repointed to the real question: (a) determine which rule domains are meant to govern the editor AI in-session vs. which are kit-enforcement-only; (b) for the in-session set, add a read-on-demand trigger (mirroring the CLAUDE.md module index) so the relevant domain reaches the AI when its work is active — no unconditional preload. See FR-003.

## T004 — Guard mandatory rules always-on
**Done:** `tests/unit/scope093-claudemd-core.test.ts` (13 cases, green) reads CLAUDE.md and fails if any mandatory anchor leaves the always-on core (SPEC-FIRST, scope-numbering, code-fencing, orchestrator-first, DB conventions, Rules Enforcement, AI Behavior, search-before-suggest, never-proactively-git, TS/Pino constraints), if the false "no imports needed" auto-load claim returns, or if the on-demand reference/rules indexes disappear. This is the regression backstop for the exact failure T003 uncovered.

*Note (out-of-band):* the new test file carries a hand-added `// [SCOPE 093 / T004]` fence because the orchestrator `implement` path is unusable here (hosted can't see local disk; local CLI corrupts fences). Safe for a NEW file; flagged for the user.

## T005 — Cache-eligible byte-stable preamble
**Finding:** the cache prefix wxKanban controls (CLAUDE.md bytes + the SessionStart `--help` output) is already byte-stable — no script rewrites CLAUDE.md, and `--help` has no timestamps/random. The remaining volatile preamble content (currentDate, git status, system-reminders) is harness-injected and not wxKanban's to reorder. **Done:** removed the one churn vector — the stale, dated `**Last Updated**: <date>` / Phase / Status / Next header block — replacing it with a stable, dateless pointer to the generated `devplan`/`lifecycle` status docs. Guarded by 3 FR-005 assertions in `tests/unit/scope093-claudemd-core.test.ts` (no "Last Updated", no ISO date in the header, cache-intent documented). 16/16 green.

## T006 — Cockpit batch-command guidance
Add guidance in the Dev Cockpit, near where the workflow commands launch, encouraging batching kit commands within the prompt-cache window, with the cache rationale.

## T007 — Audit + migrate LLM doctypes to deterministic
Produce a documented candidate list of currently LLM-generated doctypes with a keep-LLM / go-deterministic decision (model on lifecycle/devplan/scopeflow generators). Migrate the clear wins to templated generation from DB rows; leave judgment-dependent doctypes on the model.

## T008 — Reuse-check before buildscope
Wire the Capability Index / analyzescope reuse pass (SCOPE-074/077) to run before buildscope by default, surfacing an existing substantially-covering scope before new scope content is generated.

## T009 — Structured create_specs stage handoffs
Have the create_specs pipeline pass schema-validated structured artifacts between capture → specify → clarify → plan → tasks → lifecycle, so each stage consumes structured input rather than re-reading and re-summarizing the growing document tree.

## T010 — In-the-moment token-saving advisor
Add a detection layer in the editor-AI command path that recognizes at minimum: a buildscope substantially covered by an existing scope; a requested document that can be generated deterministically; context grown beyond the current task's need; and repeated cold command runs where batching would ride the cache. On detection, present the opportunity with an estimated saving and the choices apply / skip / silence-for-session. Never auto-apply; default on no response is no action. Silence state is per-session and per-suggestion-class.

## T011 — Token measurement surface
Expose a per-session and per-flow token-cost report, presenting before/after values where an applicable change was made so a saving's effect is attributable. Measurement may be approximate across editor sessions; success targets carry margin.
