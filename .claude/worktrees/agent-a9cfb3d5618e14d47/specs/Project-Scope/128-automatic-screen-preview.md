# SCOPE-128: Automatic Screen Preview for UI-Bearing Scopes

**Scope Number**: 128
**Status**: `draft`
**Created**: 2026-09-15
**Depends On**: the `wxDesigner` skill (design, preview, `page.md`, drift re-show); SCOPE-062 (Project Theme — the token source a preview renders against); the `wxCreateTestPlan` adapter contract, copied as the pattern for stack adapters
**Source**: this document

---

## Overview

When a scope produces a user-facing surface, the operator should see that screen rendered **before and while** the code is written — not discover it after `implement` has generated the UI.

Today that cannot happen automatically. `/wxDesigner` already does the hard part: it resolves a scope to its implementing specs, composes a layout from the project's own theme tokens, renders a preview, saves `page.md`, and re-shows an existing design with a drift check against shipped code. What is missing is everything around it. Nothing in the pipeline ever calls it, no scope declares that it has a screen, and the preview it produces is a static file that ignores the project's declared stack.

This scope supplies the three missing pieces: a **declaration** (`## Screens`), a **trigger** (`implement` Phase 1b), and **stack-correct, self-refreshing output** (two adapter seams plus auto-refresh). It changes nothing about what `wxDesigner` designs.

### Core Design

| Element | Value |
|---------|-------|
| **Primary Actor** | The developer running `implement` on a scope that produces a screen |
| **Secondary Actors** | The AI implementation agent consuming `page.md` as build context; kit consumers on non-web stacks who today receive silently wrong output |
| **Key Value** | A scope that declares a screen gets that screen rendered automatically, in the right technology, refreshing as the design and the code change |
| **Trigger point** | `implement` **Phase 1b** — between Validate Spec and Execute Tasks, because design must precede code generation |
| **Detection** | The `## Screens` table when present (authoritative); a heuristic fallback for legacy scopes, which always states that it inferred |
| **Stack resolution** | `Surface type` selects the adapter. `stack.md` alone cannot resolve one on a project declaring several application types |
| **Seams** | **Two** — *stack adapter* (what to design) and *preview target* (where it renders). Separating them is what makes the canvas swappable later |
| **Web fidelity** | Real shadcn component source and theme via the shadcn-ui MCP, with a documented fallback to a CSS approximation, always announcing which was used |
| **Failure posture** | An unmatched stack halts. No speculative design is ever emitted |
| **Blocking posture** | Exactly one case blocks: a screen declared with no saved design. Everything else is advisory, consistent with existing Phases 4, 4b and 5 |
| **Liveness** | Timer-based self-refresh on a local file, with harness state in the URL hash |
| **Automatic display** | **Ships off.** A per-developer, git-ignored switch, operable by instruction, overridable per run. It governs the window only — never the gate |
| **Scope Boundary** | The trigger, the declaration, both seams, the local-file target, and the refresh. Excludes a served route, an Artifact target, and any change to what `wxDesigner` designs |

## Business Problem

Three concrete failures exist today, each verified against the repository rather than assumed.

**The design step is a convention, not a mechanism.** Nothing calls `wxDesigner`. The practice is a human hand-writing the instruction into a task — SPEC-119's T011 reads *"Run `wxDesigner 119` and get the design approved before building any UI"*, and its scope document repeats the instruction in prose at line 357. `implement` does not know that task is different from any other and will not stop for it. End-user help already tells customers that *"implement will not override your wxDesigner changes"*; nothing in the pipeline enforces that claim.

**No scope can say that it has a screen.** Across 102 documents in `specs/Project-Scope/` there is no screen, window, page or mobile field. Those words appear only in the skill's invocation description, so they steer when the skill fires and have no effect on what it produces. `buildscope` never asks: there is not one mention of screen, wireframe, mockup or window anywhere in its interview. The only available signals are indirect — a non-empty `## Frontend Components` section, an ad-hoc `### Route` heading in seven documents, or keywords in requirement titles.

**The preview is neither live nor stack-aware.** It writes one self-contained file to a scratchpad, opens it, and iterating means overwriting the file and pressing refresh by hand. More seriously, the skill never reads `stack.md`. It is hardcoded to React, Tailwind and shadcn/ui, so a mobile surface silently produces web component code even though the project declares React Native and NativeWind for mobile. It is the only design-side skill that assumes the stack instead of reading it, while `implement` itself opens by instructing the reader to read `stack.md` first and warning against exactly those defaults.

The cost of all three is the same: UI gets built before anyone has seen it, and rework happens after the code exists rather than before it.

## Actors

Primary: the developer running `implement` on a scope that produces a user-facing screen

Secondary: the AI implementation agent that consumes `page.md` as build context, and kit consumers working on mobile or desktop stacks who today receive web component code without being told

## Scope Boundary

In scope:

- A `## Screens` declaration in scope documents, with a validated closed vocabulary for surface type
- A heuristic fallback so the 102 existing scope documents still work, with inference always labeled
- A stack-adapter seam with web, mobile and desktop adapters following a fixed contract
- A preview-target seam, with the local-file target as its only implementation here
- Self-refreshing preview output with state that survives reload
- Real shadcn components via MCP for the web adapter, degrading honestly when unavailable
- `implement` Phase 1b: the trigger, its three outcomes, and its override
- `page.md` recording surface type, adapter and fidelity source
- Mirror-sync and git-tracking repair for the skills directory, without which the adapters ship and then vanish

## Out of Scope

- The served `/design/:scope` route, an Artifact preview target, and a Cockpit webview panel — all later targets on the same seam, deliberately excluded so the seam ships before its second consumer
- Backfilling `## Screens` into the 102 existing scope documents
- Changing what `wxDesigner` designs, or its existing token-promotion behavior
- Persisting `page.md` server-side
- The missing `wxDesigner` MCP prompt twin — a real adjacent defect with its own cause
- Figma and open-design MCP integration

## User Scenarios & Testing

### US1 — A screen is declared but never designed

**Given** a scope declaring a surface that no saved design accounts for — either no design exists at all, or one exists and is silent about that surface
**When** the developer runs `implement` against an implementing spec
**Then** Phase 1b stops before Phase 2, names the unaccounted surface, and offers to run `wxDesigner`
**And** an override proceeds in one step, recording that the gate was bypassed

This is the only blocking path in the scope. It exists because generating a screen's code with no approved design is precisely the failure SPEC-119 hand-wrote a task to prevent.

### US2 — A design exists and the developer watches it while code is written

**Given** a scope with a saved `page.md`, **and automatic display switched on**
**When** `implement` runs
**Then** Phase 1b opens the preview, reports the design's status, and continues without blocking
**And** the preview refreshes itself as the design and the implementation change, so the screen stays visible throughout task execution
**And** the theme toggle and the state switcher survive every refresh

### US3 — A mobile screen gets mobile code

**Given** a scope whose surface type is a mobile screen, on a project declaring React Native and NativeWind for mobile
**When** the design is produced
**Then** the resolved adapter is announced before any design work begins
**And** the output uses React Native and NativeWind primitives
**And** the emitted code contains zero web component-library imports

Today this case silently produces web component code. It is the regression that matters most.

### US4 — A scope with no UI is left completely alone

**Given** a scope with no `## Screens` table and no frontend footprint
**When** `implement` runs
**Then** Phase 1b produces no output at all, not even a skip notice

Most scopes have no UI. An announced skip on every run is noise that trains the operator to ignore the phase.

### US5 — An uncovered stack fails loudly

**Given** a project whose declared stack no adapter covers
**When** a design is requested
**Then** the run stops and names what it found in the stack declaration
**And** it offers the honest options: write an adapter, proceed by hand with substitutes agreed aloud, or narrow to a covered subtree
**And** it never emits a speculative design

A wrong-stack design is worse than an error because it reads as a result. This mirrors the hard stop the test-plan skill adopted after its extractor reported a valid-looking inventory of zero units on a C# repository.

### US6 — A degraded preview is never mistaken for a faithful one

**Given** a web-surface design and the component MCP is unreachable
**When** the preview is produced
**Then** it renders using the fallback approximation
**And** it states plainly, in the run output and in the preview's own provenance chip, that the components are approximated rather than real
**And** `page.md` records which source was used, so a design approved against an approximation stays traceable

US3, US5 and US6 are the same principle applied three ways: fail loudly rather than produce a confident wrong result.

### US7 — A partly designed scope is reported accurately, not waved through

**Given** SCOPE-119, whose design covers the customer list and detail, and explicitly names the create/edit form and the transfer dialog as separate passes
**When** `implement` runs
**Then** the covered surfaces open in the preview and the run continues
**And** the two explicitly excluded surfaces are **named in the run output as known gaps**, without blocking
**And** a surface the design mentions nowhere would block instead

This is the realistic case and the one that found the defect in Amendment A. Partial coverage is normal; all-or-nothing is the exception. A gate that cannot tell a recorded decision from an oversight is either useless or intolerable, depending on which way it errs.

### US8 — The window stays shut until asked, and says so once

**Given** automatic display in its default off state
**When** `implement` reaches a scope whose design it would otherwise have shown
**Then** no window opens
**And** exactly one line reports that automatic display is off and how to turn it on
**And** surfaces are still reconciled, so an unaccounted surface still blocks

**And given** a scope with no frontend footprint
**Then** nothing is said at all, because nothing would have been displayed

The one line exists so that off does not become invisible. A feature that ships off and never mentions itself is one nobody observes working, and a defect inside it would never surface — which is how a gate shipped off, a welcome message shipped inert, and a compliance context loaded for nobody.

### US9 — The developer turns it on by saying so

**Given** automatic display is off
**When** the developer tells the assistant to turn the design preview on
**Then** the stored switch flips to on, and the assistant states the new value rather than merely claiming success
**And** asking for the current state returns it without changing it
**And** the change affects only this developer's machine, never the committed project

## Functional Requirements

### FR-001 — buildscope asks about screens

When a stack declaration exists or the scope has a frontend footprint, the interview asks one question: which user-facing surfaces does this scope produce. Asked once, skippable with "none", and never asked of a scope with no UI signal.

### FR-002 — The Screens section

Scopes that declare surfaces carry a table of Screen, Surface type, Route and Primary actor. Surface type is a closed vocabulary: page, dialog, window, mobile screen. Route accepts an em dash for surfaces without one.

### FR-003 — Surface type is validated at the boundary

The table is parsed through a schema that rejects an unrecognized surface type and names both the offending value and the permitted set. It is never coerced, defaulted, or silently treated as a page. Satisfies SOC 2 CC6.1 input validation.

### FR-004 — Legacy scopes fall back, and say so

With no `## Screens` section, a screen is inferred from a non-empty `## Frontend Components`, a route heading, or UI keywords in requirement and scenario titles and in `## Clarifications`. The clarifications sweep matters because generated requirement text is boilerplate and the substantive detail lands there. Inference is always announced as inference, and the surface type is asked rather than guessed.

### FR-005 — Adapters exist and follow a fixed contract

An adapters directory ships a contract README plus three adapters: web, mobile and desktop. Each answers the same fixed questions and nothing more — component vocabulary, token source, fidelity technique, layout primitives, navigation idiom, output artifact, accessibility API. Every fact lives in exactly one place: what is in the skill is not in an adapter, and the reverse.

### FR-006 — Resolution is explicit and announced

The adapter is resolved before any design work, from the scope's surface type first and the stack declaration second, and is stated out loud. The stack declaration alone cannot resolve it on a project declaring several application types.

### FR-007 — The stack parser accepts both spellings

Both the singular form specified by the stack-capture template and the plural comma-separated form used by the live file parse correctly, matched case-insensitively against the lowercase values stored in the database.

### FR-008 — An uncovered stack halts

A missing stack declaration, or a stack no adapter covers, stops the run, names what was found, and offers three options: write an adapter, proceed by hand with substitutes agreed aloud, or narrow to a covered subtree. No speculative design is emitted. Satisfies SOC 2 CC6.1 fail-safe defaults.

### FR-009 — The preview target is a separate seam

Where a design renders is decided independently of what it is designed as. This scope implements exactly one target, the local file harness, with the seam shaped so an Artifact or served-route target drops in without reopening the skill.

### FR-010 — The preview refreshes itself

The harness reloads on a timer without user action, so a design stays current as it is iterated and as implementation proceeds.

### FR-011 — Harness state survives a refresh

The theme toggle, the state switcher and the auto-refresh setting are encoded in the URL hash, which survives reload. Browser storage is not used: it is unreliable on an opaque local-file origin.

### FR-012 — Auto-refresh can be switched off

A visible control pauses reloading so a timer does not fight the operator while they read. The setting persists across reloads like the rest of harness state.

### FR-013 — Real components, with an honest fallback

The web adapter renders using component source and theme retrieved from the shadcn-ui MCP. When that is unreachable it falls back to the CSS approximation and states so in the run output and in the harness provenance chip.

### FR-014 — Fidelity source is recorded

`page.md` records whether a design was approved against real components or an approximation, so the basis of an approval remains traceable after the fact.

### FR-015 — Phase 1b runs before code

`implement` gains Phase 1b between Validate Spec and Execute Tasks. Design precedes code generation; it is not a post-hoc review like the existing advisory phases.

### FR-016 — Per-surface coverage, not file existence

The gate resolves **each declared surface independently** against the saved design, to one of three states, and a scope is cleared only when every declared surface is accounted for:

| State | Meaning | Outcome |
|---|---|---|
| **Designed** | The design covers this surface | Preview opens, status reported, run continues |
| **Explicitly not designed** | The design names this surface in its not-designed section — a bounded decision a person made | **Warn, do not block.** Named in the run output so it is visible, and carried forward |
| **Unaccounted for** | Declared as a surface, and the design is silent about it | **Block.** Either the design predates the surface or nobody looked |

The distinction between the last two is the whole point. An explicit exclusion is a decision already recorded by a person; blocking on it would punish good documentation and drive the override-reflex the scope's main risk describes. Silence means nobody looked, which is the case worth stopping for.

A scope with no declared surfaces produces no output at all.

**Amendment A (2026-09-15) — this requirement originally tested whether a design file existed.** Tested against SCOPE-119, that binary failed: its design covers the customer list and detail but names the create/edit form and the transfer dialog as separate passes, so a file-existence test would have opened the preview, reported success, and let implementation generate two entirely undesigned surfaces — the exact failure this scope exists to prevent.

### FR-017 — The gate is overridable and the override is recorded

A skip flag proceeds in one step, and the run output records that the design gate was bypassed.

### FR-018 — Scope resolution is reused, not reinvented

Phase 1b resolves scope from spec exactly as the existing test-plan phase does — the spec's implements line, or the scope whose implemented-by list names it — honoring that scope and spec numbers are separate namespaces that share integers.

### FR-019 — page.md records what it was designed as, and what it left out

Its header block gains surface type, adapter and fidelity source, alongside the existing five-value status vocabulary.

A **not-designed section becomes required and machine-readable**, listing deliberately excluded surfaces by the same names the screens table uses, so declared and designed surfaces can be diffed by FR-016. This section already exists organically in practice — SCOPE-119's design carries one — but it is absent from the format reference, so today it is incidental rather than load-bearing. A design that excludes nothing states so explicitly; an empty section and a missing one must not be indistinguishable.

### FR-023 — The design format reference is reconciled with reality before anything parses it

The saved format reference and the designs actually on disk have diverged: the reference specifies a component section that real designs spell differently, and the not-designed section FR-016 depends on appears in no version of the reference. Both are reconciled, and the existing designs are migrated to whichever spelling wins, before any parser is written against them.

A parser built on the reference as it stands would fail on every real design that exists — which is the same class of silent-wrong-result failure as FR-008 and FR-013, arriving through documentation rather than through code.

### FR-024 — Automatic display is switchable, and defaults to off

A persistent switch controls whether Phase 1b opens a preview window on its own. It has two states, `on` and `off`, and **ships `off`**: automatic display is opt-in, so the pipeline never takes over a developer's screen until they ask it to.

The switch is **per-developer, not per-project**. It lives in the project's runtime-state directory alongside the other per-developer state files, and is git-ignored by the same globbed pattern those use. A developer silencing a window on their own machine must not silence it for everyone else, which is what committing the setting would do.

### FR-025 — Precedence is explicit

Resolution order, most specific first: a per-run flag, then an environment variable, then the stored switch, then the built-in default of off. A one-off run can therefore turn the window on without editing the stored setting, and back again.

### FR-026 — The switch governs display only, never the gate

Turning automatic display off does not weaken FR-016. Surfaces are still reconciled, unaccounted surfaces still block, and deliberate exclusions are still reported. The only thing suppressed is the window opening by itself.

This separation is deliberate and is not a convenience. A persistent setting that silently disabled a blocking safety gate would be indistinguishable from the gate being broken, and the project has repeatedly shipped gates that turned out to be inert. Bypassing the gate stays a per-run, explicitly recorded act under FR-017.

### FR-027 — An off switch announces itself rather than rotting

When the switch is off **and** the run reaches a surface it would otherwise have displayed, Phase 1b emits exactly one line naming the switch and how to turn it on. It stays silent on every scope that would not have displayed anything, so the notice never reaches the roughly 63 of 102 scopes with no frontend footprint.

Without this, a feature that ships off is a feature nobody observes working, and a defect in it would never surface — the failure mode this project has hit with a gate that shipped off, a welcome message that shipped inert, and a compliance context that loaded for nobody. One line on the scopes that are actually affected is the smallest thing that keeps an off switch honest.

### FR-028 — The switch is operable by instruction

The assistant can set the switch when asked in ordinary language, and a documented command form exists so the action is deterministic rather than improvised: turn automatic display on, turn it off, or report its current state. Reporting the state is a distinct operation, because a switch whose value cannot be asked for invites guessing.

### FR-020 — Skill mirrors stop drifting by hand

The kit skills directory syncs to the installed skills directory by script, as commands already do, and the ignore rule covering installed skills is amended so new adapter files are tracked rather than silently untracked.

### FR-021 — Sample content is synthetic

Preview content and `page.md` examples use fabricated data. Real customer records never appear in a preview artifact, which is written outside the repository to a scratchpad.

### FR-022 — Security requirements are stated per surface

A design records the access rule its screen assumes — who may see it and what it hides from whom — so security expectations are written alongside functional ones rather than assumed. Satisfies SOC 2 CC3.1.

## Success Metrics

- SC-1: 100% of **declared surfaces** — not scopes — reach task execution either designed, explicitly excluded by the design, or covered by a recorded override; 0 surfaces reach it unaccounted for. Measured per surface because SCOPE-119 proved a per-scope measure passes while two surfaces go undesigned
- SC-2: 0 web component-library imports in code emitted for a mobile surface, the only passing value since current behavior fails this outright
- SC-3: 0 lines of output from Phase 1b across every scope with no frontend footprint, measured over the roughly 63 of 102 existing scopes whose frontend section is absent or reads none
- SC-4: 100% of design runs announce the resolved adapter before design work begins, and 0 proceed on an assumed stack
- SC-5: 3 seconds or less from a design change being written to it being visible in the preview, with no user action
- SC-6: 0 resets of the theme toggle, state switcher or refresh setting, measured over at least 20 consecutive refreshes
- SC-7: 100% of uncovered-stack runs halt with the three named options, and 0 emit a speculative design
- SC-8: 95% or better agreement between the legacy heuristic and a manual UI classification of the 102 existing scopes, with 100% of inferred detections labeled as inferred
- SC-9: 60 seconds or less from starting implementation on a UI scope with an existing design to the screen being on display, measured with automatic display switched on
- SC-11: 100% of runs that suppress a window because the switch is off emit the one-line notice, and 0% emit it on a scope that would have displayed nothing. An off switch that says nothing on an affected run is a defect, not a quiet success
- SC-12: 0 occurrences of the switch being committed to the repository, verified by the ignore rule covering it
- SC-10: 100% of design saves record surface type, adapter and fidelity source

Two things are deliberately not measured. Design quality has no metric: it is the operator's judgment at the approval gate, and a proxy number would invite gaming a design past a person who should have looked at it. Adoption has no target: backfilling existing scopes is outside the boundary, and a coverage number would create pressure to do it.

## Data Requirements

No schema change and no new persistence. The `## Screens` declaration lives in the scope markdown, and `page.md` stays a file on disk beside its spec.

Persisting `page.md` to the server was considered and rejected for this scope. It would be technically trivial — the document type column is a free-form string with no enum or check constraint, so it would need no migration, and it would slot into the existing per-scope upsert key. It is rejected because `page.md` carries a component code fence. That is source code, not documentation, and the project's verified position is that only documentation reaches the server, with three known exceptions. Uploading design documents would quietly make that statement false through a file nobody would think to re-examine. If designs should become server-visible, that is its own decision requiring either stripping the code fence before upload or amending the claim — not a side effect of this scope.

## API Routes

None. The served design route is explicitly outside the boundary, and the preview is a local file with no server behind it.

## Frontend Components

None in the product. This scope changes developer tooling, not the application's own interface. The preview harness is a generated scratchpad artifact, not a component in the client source tree. This is worth stating plainly because the scope concerns screens, and a reader will reasonably expect application UI here.

## Integration Context

| Integration | Nature |
|---|---|
| Stack declaration | Read-only input, materialized from the database by the kit and never hand-edited here |
| shadcn-ui MCP | External runtime dependency, optional by design: unreachable degrades fidelity and never blocks |
| buildscope prompt | Server-side. FR-001 and FR-002 require regenerating the prompt registry and redeploying the hosted MCP — the only part of this scope that does |
| implement command | Kit-side markdown that ships with the kit, needing no redeploy |
| Version floor hooks | Touching kit commands or skills trips the kit version floor, which commits a bump and aborts the push, requiring a second push |

This scope must align with the existing adapter contract established for test planning, reusing its resolution discipline rather than inventing a parallel one.

## Technical Notes, Constraints and Risks

### Constraints

Change detection inside the preview is impossible: fetching its own URL is blocked by cross-origin rules on a local file, so refresh is a timer rather than an event. This is accepted and must be recorded in the harness reference so it is not later mistaken for a defect.

The hosted scope generator persists nothing and its input schema has no channel for scenarios or requirements, so the screens work must land in both the interview prompt and the deterministic generator, while the scope file itself remains client-materialized.

The prompt registry is generated and encoded. Editing the interview prompt without regenerating it means the change never ships, and the failure is silent. Compounding this, a hosted deploy has previously rolled back while reporting success, so verification must probe the served prompt text rather than trusting a version string.

The installed skills directory is covered by an ignore rule, so new adapter files are untracked by default: they would ship from the kit tree and silently vanish from the installed copy. FR-020 exists for this reason. Separately, fences are authored only by the orchestrator, so any TypeScript touched by FR-020 routes through the implement path and is never hand-fenced.

### Risks

Gate fatigue is the risk that would kill this. If Phase 1b blocks wrongly on legacy scopes, operators will reach for the override reflexively and the gate becomes decoration. Three mitigations are requirements rather than intentions: silence on non-UI scopes, inference labeled and never decided, and the override recorded rather than silent. This is the risk to watch after release, not at review.

A timer reloading while someone studies a layout is hostile; the off switch mitigates it, and if that proves insufficient the honest fix is a longer interval rather than removing the control.

Component MCP flakiness is mitigated by design through announced degradation. The residual risk is an operator not noticing the provenance chip, which is why the fidelity source is also written into the saved design.

Building two seams for one shipped target is speculative generality. It is accepted because reopening the skill when a second target lands is the more expensive mistake, and because it costs one indirection rather than new machinery.

## Compliance

SOC 2 is the active framework for this project. Four controls bear on this scope.

| Control | Where it lands |
|---|---|
| CC6.1 input validation | FR-003: a closed vocabulary rejected at the parse boundary, never coerced |
| CC6.1 fail-safe defaults | FR-008 hard stop and FR-013 announced degradation: the default outcome of an unresolvable decision is refusal |
| CC3.1 security requirements per feature | FR-022: each design records the access rule its screen assumes |
| CC8.1 changes documented | The screens declaration makes a scope's surfaces tracked data rather than prose |

No personal, health, financial, authentication, encryption or cross-border data is touched. The single data trigger is FR-021: preview content is synthetic, because the harness writes outside the repository.

## Amendments

### Amendment A — per-surface coverage (2026-09-15)

Tested against SCOPE-119 the same day this scope was written, before any implementation existed. The test was to run the proposed gate by hand against a real UI scope. It failed, and the failure was worth more than the scope's first draft.

**What was found.** SCOPE-119's design covers the customer list and detail. It also carries a bounded-scope section naming two surfaces it deliberately does not cover: the create/edit form and the transfer dialog. The gate as first written tested whether a design file existed — a binary — so it would have opened the preview, reported a designed status, and allowed implementation to generate two entirely undesigned surfaces. The gate would have produced a confident pass on exactly the case it exists to catch.

**What changed.** FR-016 moved from file existence to per-surface reconciliation, with a deliberate exclusion warning rather than blocking; FR-019 promoted the not-designed section from incidental convention to required and machine-readable; FR-023 was added because the format reference and the real designs on disk have diverged, so a parser written against the reference would fail on every design that exists. US7 and a rewritten SC-1 carry the same correction into the scenarios and metrics.

**A second finding, belonging to SCOPE-119 rather than here.** That scope's prose still instructs the reader to run the design command and states the screens are not designed. The design was completed 2026-07-31 and the instruction was never updated. This is direct evidence for the scope's premise: a convention carried in prose goes stale silently, and nobody notices until someone reads it closely.

### Amendment B — automatic display is switchable and ships off (2026-09-16)

Requested during development: an internal switch for the automatic window, operable by instruction, defaulting to off.

**What was added.** FR-024 through FR-028, plus US8, US9, SC-11 and SC-12. The switch is per-developer and git-ignored, following the pattern the runtime-state directory already uses to separate committed project configuration from per-machine state. Precedence runs per-run flag, environment variable, stored switch, then the default.

**The constraint that matters.** The switch governs the window and nothing else. Reconciliation still runs, unaccounted surfaces still block, exclusions are still reported. A persistent setting that silently disabled a blocking gate would be indistinguishable from the gate being broken, and bypassing the gate remains a per-run, recorded act.

**The risk default-off carries, stated rather than assumed.** A feature that ships off is a feature nobody observes working, and this project has hit that outcome more than once — a gate that shipped off, a welcome message that shipped inert, a compliance context that loaded for nobody. FR-027 is the counterweight: when the switch is off and a run reaches a surface it would have displayed, one line says so. It stays silent on scopes that would have displayed nothing, so the notice never reaches the majority of scopes that have no UI. This is the smallest mechanism that keeps an off default honest, and it should not be removed as noise without replacing it with something that serves the same purpose.

## Open Questions

1. Should `page.md` ever become server-visible? Deferred, and dependent on the egress decision, because the component fence is source rather than documentation.
2. Should the Artifact preview target be built? Deferred on the same decision. The seam is built here so that answering yes later is cheap.
3. Is the desktop adapter verifiable? The stack declares desktop, but no project exists here to test it against. The recommendation is to ship web and mobile verified and mark desktop documented-but-unverified, rather than claim three working adapters.
4. Does the missing MCP prompt twin for the design skill belong in this scope? The recommendation is no: it is a registration defect with its own cause, and folding it in would blur what this scope is answerable for.
