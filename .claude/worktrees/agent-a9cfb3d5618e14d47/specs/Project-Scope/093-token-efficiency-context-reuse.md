# SCOPE-093: Token-Efficiency — Context Footprint & Reuse

**Scope Number**: SCOPE-093
**Status**: `draft`
**Created**: 2026-07-10
**Last Reviewed**: 2026-07-10 (authored in-conversation, section-by-section; decisions: thin CLAUDE.md + on-demand `@`-imports for reference/rules while mandatory rules stay always-on; prompt-cache alignment + batch guidance; audit LLM-generated doctypes for deterministic migration; run reuse-check before buildscope by default; structured stage handoffs in create_specs; in-the-moment token-saving advisor that suggests and lets the user decide, never auto-applies; a per-session/per-flow token measurement surface)
**Depends On**: SCOPE-087 (project-overview always-in-context — the managed `@`-import mechanism reused for FR-001/002/003), SCOPE-074 (Capability Index — semantic reuse foundation for FR-008), SCOPE-077 (analyzescope automation / FR-008 reuse, already shipped)
**Related Scopes**: SCOPE-042 (Dev Cockpit tree — delivery surface for FR-006 and the advisor FR-010–012); the deterministic generators (lifecycle / devplan / scopeflow) as the model for FR-007; the create_specs spec pipeline (FR-009)
**Source**: `specs/Project-Scope/093-token-efficiency-context-reuse.md`

---

## Overview

wxKanban's process-driven workflows (buildscope, createSpecs, implement, QA) spend tokens almost entirely inside the customer's editor-AI context window, not inside the kit. That is by design: the kit validates, writes, fences, and audits, while the editor AI generates — so the only place tokens burn is what gets loaded into the session and how often it is regenerated instead of reused.

Today that spend is higher than it needs to be in three structural ways: a fixed per-session preamble of roughly 12–15k tokens (CLAUDE.md plus all auto-loaded rules plus the memory index) that every project pays on every session; command prompts and pipeline stages that reload and re-summarize content already produced; and reuse checks that do not consistently run before the most expensive operation, building a scope from scratch. Beyond the structural fixes, the editor AI is positioned to notice token-saving opportunities as it works but has no defined way to raise them.

This scope defines both halves: the structural reductions, and an advisory mechanism in which the AI, on detecting a concrete saving, suggests it and lets the user decide how to proceed — never acting unilaterally. The aim is to cut token spend across these workflows without weakening the mandatory rules, the fencing discipline, or output quality.

## Business Problem

Customers who adopt wxKanban run these workflows many times a day, and each run pays the same avoidable overheads. The fixed preamble is paid on every session across every project, so a large CLAUDE.md and an all-loaded rules directory are a recurring tax multiplied by the entire customer base. Pipeline stages and command prompts that re-read prior artifacts pay for the same content repeatedly. And the single most expensive operation — generating a scope from scratch — often runs without first checking whether an existing scope already covers the work.

None of this is visible to the customer today: there is no surface that shows per-session or per-flow token cost, and no moment where the AI says "this next step will cost less if we do it differently — your call." Token cost is a real, ongoing customer expense that wxKanban is uniquely positioned to reduce, because it controls what its own workflows load and regenerate.

### Core Design

| Element | Token-Efficiency: Context Footprint & Reuse |
| --- | --- |
| **Primary Actor** | A customer (and the editor AI acting for them) running wxKanban's scope-and-spec workflows in Claude Code / the Dev Cockpit, who pays for every token loaded into the session |
| **Secondary Actors** | CLAUDE.md + `_wxAI/rules/` (the fixed preamble); the managed `@`-import mechanism (SCOPE-087); the Capability Index (SCOPE-074) + analyzescope reuse (SCOPE-077); the create_specs pipeline; the deterministic generators (lifecycle/devplan/scopeflow); the Dev Cockpit (advisor + batch guidance surface) |
| **Key Value** | The same workflows cost fewer tokens — a thinner preamble, cached-and-reused context, deterministic docs instead of regeneration, reuse before generation — and the AI makes savings visible in the moment so the user decides, never surprised |
| **Primary** | Reduce editor-AI token consumption across the standard scope-and-spec workflows |
| **Secondary** | Surface token-saving opportunities to the user in the moment (suggest, user decides) and make the reductions measurable per-session and per-flow |
| **Boundary — IN** | Thin CLAUDE.md core + on-demand `@`-imported reference/rules modules; prompt-cache alignment (byte-stable preamble, volatile content last) + Cockpit batch guidance; audit + migration of qualifying LLM-generated doctypes to deterministic generation; reuse-check run before buildscope by default; schema-validated structured handoffs between create_specs stages; an in-the-moment token-saving advisor (detect → suggest → apply/skip/silence, never auto-apply); a per-session/per-flow token measurement surface |
| **Boundary — OUT** | Changing the kit-generates-vs-AI-generates split, or the fencing / spec-first / orchestrator-first disciplines (held, not relaxed); any change to model selection or provider; automatic application of any saving without user consent; rewriting the mandatory rules' content (only their load timing changes); pricing, quotas, or commercial token-budgeting features |

---

## Actors

Primary: A customer, and the editor AI acting on their behalf, running wxKanban's scope-and-spec workflows in Claude Code or the Dev Cockpit — the party that pays for every token loaded into the session.

Secondary: The fixed preamble (CLAUDE.md plus the `_wxAI/rules/` directory), the managed `@`-import mechanism from SCOPE-087, the Capability Index (SCOPE-074) and analyzescope reuse (SCOPE-077), the create_specs pipeline, the deterministic generators (lifecycle / devplan / scopeflow), and the Dev Cockpit as the advisor and guidance surface.

## User Scenarios

### US1 — Thinner session start
A customer opens a new session on a project.
**Expected:** the fixed preamble loads the mandatory core plus only the reference/rule modules the session actually touches — materially fewer tokens than loading all of CLAUDE.md and every rule file.

### US2 — Cached, batched commands
A customer runs buildscope, then createSpecs, then implement back-to-back within a few minutes.
**Expected:** the stable preamble is reused from the prompt cache on the 2nd and 3rd commands; the Cockpit had already nudged toward batching within the cache window.

### US3 — Deterministic doc instead of regeneration
A customer requests a document whose content is derivable from database rows.
**Expected:** it is produced by the templated generator (no model), and if the request arrived through the AI, the advisor offers the deterministic path.

### US4 — Reuse before build
A customer starts buildscope for work an existing scope already largely covers.
**Expected:** the reuse-check runs first and surfaces the existing covering scope before any new scope content is generated.

### US5 — In-the-moment saving suggestion
While running a command, the AI detects a concrete saving (e.g. the buildscope above, or context grown past the task's need).
**Expected:** it surfaces the opportunity with the estimated saving and the choices apply / skip / silence-for-session, and does nothing until the user chooses.

### US6 — Visible cost
A customer wants to know what a flow cost.
**Expected:** a measurement surface reports per-session and per-flow token cost, with before/after where an applicable change was made.

### US7 — Advisor stays quiet
A customer silences a suggestion for the session.
**Expected:** that class of suggestion does not fire again for the rest of the session, and no saving is ever applied without an explicit choice.

---

## Functional Requirements

### FR-001 — Thin CLAUDE.md core + on-demand imports
CLAUDE.md MUST be split into a mandatory core (spec-first, code fencing, orchestrator-first, DB naming, and other always-on constraints) and reference modules that load on demand via managed `@`-imports, following the SCOPE-087 project-overview import pattern.
**Acceptance:**
- [ ] The always-loaded CLAUDE.md core contains the mandatory constraints and no on-demand reference detail
- [ ] Reference sections (dashboard conventions, lifecycle docs, watermark, help system, dev plan) live in importable modules

### FR-002 — Modules load only when relevant
Reference modules MUST load only when a command or task touches their subject area, so a session pulls no reference content it does not use.
**Acceptance:**
- [ ] A session touching only buildscope does not load the help-system / watermark reference modules
- [ ] A command that needs a module triggers its import

### FR-003 — Rule enforcement reaches the editor (reframed)
**Finding during implementation:** the `_wxAI/rules/` files are NOT loaded into the editor AI's context today — there is no `@`-import or hook that pulls them in; the "auto-discovered" wording in CLAUDE.md is legacy (AGENTS.md-era) and inaccurate for the Claude Code path. The kit reads them for its own enforcement; the editor AI does not see them per session. So the original "load only relevant rule domains to save tokens" framing is moot (they cost ~0 editor tokens now). This FR is repointed to the real question: the scope MUST (a) determine which rule domains are meant to govern the editor AI in-session; and (b) for those, provide a read-on-demand load path (mirroring the CLAUDE.md module index) so the relevant domain reaches the AI when its work is active — without preloading all rules every session.
**Acceptance:**
- [ ] A documented determination of which rule domains must reach the editor AI in-session vs. which are kit-enforcement-only
- [ ] For the in-session set, a read-on-demand trigger exists (relevant domain is read when its work is active); no unconditional preload of all rules

### FR-004 — Mandatory rules unchanged and always-on
The mandatory rule content MUST remain unchanged in meaning; only its loading strategy changes. No mandatory constraint may become optional as a result of this scope.
**Acceptance:**
- [ ] Every mandatory rule that was always-on remains always-on
- [ ] No mandatory rule's text is altered by this scope

### FR-005 — Cache-eligible preamble
The injected session preamble MUST be byte-stable within a session (no per-turn or timestamp variation near the top), with volatile content ordered last, so it is eligible for prompt-cache reuse.
**Acceptance:**
- [ ] The preamble prefix is identical byte-for-byte across turns in a session
- [ ] Volatile content (current task/diff) appears after the stable prefix

### FR-006 — Cockpit batch guidance
The Dev Cockpit MUST provide guidance that encourages batching kit commands within the prompt-cache window.
**Acceptance:**
- [ ] The Cockpit surfaces batch guidance where the workflow commands are run
- [ ] The guidance references the cache window rationale

### FR-007 — Deterministic-generation migration
The system MUST identify which currently LLM-generated doctypes can be produced deterministically from database rows, and move the qualifying ones onto templated generation.
**Acceptance:**
- [ ] A documented list of candidate doctypes with a keep-LLM / go-deterministic decision
- [ ] Each qualifying doctype is generated without the model

### FR-008 — Reuse-check before buildscope
The Capability Index reuse check MUST run before buildscope by default, surfacing any existing scope that substantially covers the requested work before new scope content is generated.
**Acceptance:**
- [ ] buildscope triggers the reuse-check before generating scope content
- [ ] A substantially-covering existing scope is surfaced to the user

### FR-009 — Structured stage handoffs
The create_specs pipeline MUST pass schema-validated structured data between stages so each stage consumes the prior stage's output rather than re-reading and re-summarizing prior artifacts.
**Acceptance:**
- [ ] A stage receives structured input from the prior stage
- [ ] No stage re-reads the full growing artifact tree to reconstruct prior output

### FR-010 — In-the-moment saving suggestions
When the editor AI detects a concrete token-saving opportunity during a command, it MUST surface the opportunity together with the estimated saving and offer the choices apply, skip, or silence-for-session.
**Acceptance:**
- [ ] On detection, the opportunity and an estimated saving are presented
- [ ] The three choices (apply / skip / silence-for-session) are offered

### FR-011 — No action without consent
The advisor MUST NOT apply any saving without explicit user consent; the default action on no response is to take no action.
**Acceptance:**
- [ ] No saving is applied unless the user chooses apply
- [ ] No response leaves state unchanged

### FR-012 — Minimum detection set
The advisor MUST recognize at minimum: a buildscope substantially covered by an existing scope; a requested document that can be generated deterministically; context grown beyond the current task's need; and repeated cold command runs where batching would ride the cache.
**Acceptance:**
- [ ] Each of the four listed situations triggers a suggestion in a representative case
- [ ] Silencing one class does not silence the others

### FR-013 — Token measurement surface
The system MUST expose a measurement surface reporting per-session and per-flow token cost, so reductions are observable.
**Acceptance:**
- [ ] Per-session token cost is reported
- [ ] Per-flow (e.g. buildscope→implement) token cost is reported

### FR-014 — Before/after attribution
Token measurements MUST be presented before and after applicable changes so the effect of a saving is attributable.
**Acceptance:**
- [ ] A before value and an after value are shown for an applied change
- [ ] The difference is attributable to the specific change

---

## Technical Sections

### Preamble restructuring (FR-001–004)
Reuse the SCOPE-087 managed-import mechanism (`@ProjectOverview.md`-style import in the consumer CLAUDE.md — note the CamelCase: this line previously said `@projectoverview.md`, inherited from SCOPE-087, which is wrong and dangles silently on Linux/CI. See the filename correction at the top of SCOPE-087's Functional Requirements). Extract the reference sections of CLAUDE.md into importable module files gated by subject area; keep the mandatory core inline and always-on. Give `_wxAI/rules/` the same treatment — group rules by domain so only the active domains load, without changing any mandatory rule's text. Because CLAUDE.md and the rules are kit-synced, the change ships to every consumer through the normal kit-sync allowlists.

### Cache alignment (FR-005–006)
Order the injected context so the stable prefix (mandatory core, loaded rule domains, tool defs) is byte-identical within a session and volatile content (current task, diff) is appended last, maximizing Anthropic prompt-cache hits within the ~5-minute TTL. Add batch guidance to the Dev Cockpit near where the workflow commands are launched.

### Deterministic migration (FR-007)
Model on the existing LLM-free generators (`lifecycle-generator.ts`, `devplan-generator.ts`, scopeflow). Audit remaining LLM-generated doctypes; migrate the clear wins to templated generation from DB rows; leave doctypes that genuinely need judgment on the model.

### Reuse-before-build (FR-008)
Wire the Capability Index / analyzescope reuse pass (SCOPE-074/077, already shipped) to run ahead of buildscope by default and surface a substantially-covering existing scope before generation.

### Structured handoffs (FR-009)
Have the create_specs pipeline pass schema-validated structured artifacts between capture → specify → clarify → plan → tasks → lifecycle, so each stage consumes structured input rather than re-reading the growing tree.

### Advisor (FR-010–012)
A detection layer in the editor-AI command path that recognizes the FR-012 situations, estimates the saving, and presents apply / skip / silence-for-session — never auto-applying (FR-011). Silence state is per-session and per-suggestion-class. Surfaced through the Dev Cockpit / command flow.

### Measurement (FR-013–014)
A per-session and per-flow token-cost report, with before/after values where an applicable change was made. Measurement may be approximate across editor sessions; success targets carry margin to tolerate that.

### Conventions
TypeScript, no `any`; Pino logging; orchestrator-first (`createSpecs` → `implement`); code fences written by the orchestrator; kit-synced files ship via the existing allowlists; Cockpit changes follow Marketplace release discipline (VSIX build + `vsce publish`). Nothing pushed until the user says push.

---

## Success Criteria

1. **Thinner preamble.** The CLAUDE.md portion of the fixed per-session preamble is reduced by at least 50%, measured by CLAUDE.md word/token count at session start on the reference project. (Baseline corrected during implementation: `_wxAI/rules/` are NOT loaded into the editor context — see FR-003 — so they are excluded from this baseline. Achieved: 358→177 lines, −56%.) *(FR-001, FR-002)*
2. **Cheaper flow.** A standard buildscope→implement flow consumes at least 30% fewer editor-AI tokens end-to-end, measured as total tokens for the same flow on the same input before and after the changes. *(FR-005, FR-008, FR-009, FR-013, FR-014)*
3. **Reuse surfaced.** The reuse-check surfaces an existing covering scope in at least 90% of buildscope runs where such a scope exists, measured against a fixed test set of overlapping scope requests. *(FR-008)*

---

## Scope Boundary

In scope:

- Thin CLAUDE.md core plus on-demand `@`-imported reference and rule modules; mandatory rules stay always-on.
- Prompt-cache alignment (byte-stable preamble, volatile content last) plus Dev Cockpit batch-command guidance.
- Audit of currently LLM-generated doctypes and migration of the qualifying ones to deterministic generation.
- Reuse-check run before buildscope by default.
- Schema-validated structured handoffs between create_specs pipeline stages.
- The in-the-moment token-saving advisor: detect → suggest with estimate → apply / skip / silence-for-session, never auto-apply.
- A per-session and per-flow token measurement surface.

## Out of Scope

- Changing the kit-generates-vs-AI-generates split, or the fencing / spec-first / orchestrator-first disciplines — held, not relaxed.
- Any change to model selection or provider.
- Automatic application of any saving without explicit user consent.
- Rewriting the mandatory rules' content — only how and when they load changes.
- Pricing, quotas, or commercial token-budgeting features.

## Open Questions

- Which specific reference sections of CLAUDE.md and which rule domains are safe to move behind on-demand imports without weakening enforcement (settled during design against FR-004).
- Exactly which currently LLM-generated doctypes qualify for deterministic migration (the FR-007 audit produces the list).
- How precisely per-session and per-flow token cost can be measured across editor sessions, and what margin the success targets need to tolerate approximation.
- Where the advisor's suggestion surface lives (inline in the command flow, the Dev Cockpit, or both) and the exact threshold for each detection class before it fires.

## Constraints & Notes

### Constraints
- **Disciplines held, not relaxed.** The kit-generates-vs-AI-generates split, fencing, spec-first, and orchestrator-first constraints are unchanged; only load timing and reuse behavior change.
- **Mandatory content stays always-on.** FR-004 guards against a genuinely mandatory rule slipping behind an on-demand import.
- **User decides.** No saving is ever applied without explicit consent (FR-011); the advisor is advisory only.
- **Conservative advisor.** A small, high-signal detection set (FR-012) plus silence-for-session keeps the advisor from becoming noise.

### Out of Scope (own later scopes)
- Model or provider changes.
- Pricing, quotas, or commercial token-budgeting features.
- Automatic application of savings without consent.
- Rewriting mandatory-rule content (only load timing changes).

### Dependencies
- SCOPE-087 (managed `@`-import), SCOPE-074 (Capability Index), SCOPE-077 (analyzescope reuse), SCOPE-042 (Dev Cockpit), the create_specs pipeline, and the existing deterministic generators.

### Risks
- Over-aggressive CLAUDE.md splitting could weaken enforcement — mitigated by FR-004.
- The advisor could become noise — mitigated by silence-for-session + a conservative detection set.
- Token measurement across editor sessions may be approximate — success targets carry margin.
- Deterministic migration could regress quality where judgment is needed — mitigated by auditing candidates and migrating only clear wins.

- **Process note:** authored in-conversation (interactive buildscope, section-by-section approval); companion FAQ at `docs-workspace/token-savings-faq.md`; implement via `createSpecs` → `implement`. Nothing pushed until the user says push.
