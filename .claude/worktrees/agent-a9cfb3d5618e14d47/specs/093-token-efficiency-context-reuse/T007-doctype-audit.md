# T007 — Doctype Generation Audit (FR-007)

Spec 093 · Task T007 (`bf1b937d-76d6-4b8b-80be-e0a051aa25fb`) · FR-007 "Deterministic-generation migration"

## Question

FR-007 asks: **which currently LLM-generated doctypes can be produced deterministically from
database rows, and move the qualifying ones onto templated generation** — modelling on the
existing LLM-free generators (`lifecycle` / `devplan` / `scopeflow`). The plan (build order §4)
constrains it: *audit first, migrate only clear wins; leave judgment-dependent doctypes on the model.*

The token lever: deterministic generators run **server-side with no model call**, so they cost
**zero editor/LLM tokens** per regeneration. A doctype that is regenerated often but is really
just a formatted dump of DB rows is a clear win — moving it off the model removes recurring spend.

## Method

Full inventory of every `doctype` written to `projectdocuments` across the app (`src/`) and the
MCP server (`mcp-server/`), tracing each to its generator and classifying the **content source**:
deterministic template vs. a model call (`generateOnce` → Gemini/Groq/OpenAI, or editor-AI/skill
authored). Marketing `faq` and the `capabilityindex` `capabilitytype` enum were excluded — they
are not `projectdocuments` doctypes.

## Decision table

| Doctype | Generator | Content source | Decision |
|---|---|---|---|
| `lifecycle` | `mcp-server/.../lifecycle-generator.ts` | Deterministic (DB rows → markdown/JSON) | **Already deterministic — model to follow** |
| `devplan` | `mcp-server/.../devplan-generator.ts` | Deterministic | **Already deterministic** |
| `scopeflow` | `mcp-server/.../scopeflow-generator.ts` | Deterministic (Mermaid from dep graph) | **Already deterministic** |
| `ProjectLifecycle` | `ProjectLifecycleGenerator.ts` | Deterministic (status tables) | **Already deterministic** |
| `DevelopmentPlan` | `DevelopmentPlanGenerator.ts` | Deterministic ("no AI") | **Already deterministic** |
| `AuditReport` | `AuditReportService.ts` | Deterministic (checklist + metrics) | **Already deterministic** |
| `help` / `help-<locale>` | `HelpGenerator.ts` | Deterministic (catalog + i18n) | **Already deterministic** |
| `CompoundLearnings` (aggregate) | `ProjectLearningsGenerator.ts` | Deterministic (aggregates rows) | **Already deterministic** |
| `override_log` | `AiInteractionLogService.ts` | Deterministic (fixed-format record) | **Already deterministic** |
| `BugReport` / `FeatureSuggestion` | `feedback-artifact.ts` | Deterministic (renders the feedback row) | **Already deterministic** |
| `ProjectOverview` | `routes/overview.ts` + Overview editor | Deterministic copy of file / human-edited | **Not model-generated — no action** |
| `overview` (lowercase) | `AIScaffoldingService.ts` | **Model** — narrative project overview from a prompt | **KEEP LLM** — narrative synthesis, not derivable from rows |
| `AutoScopeAnalysis` | `AutoScopeAnalysisService.ts` | **Model** — derives true deps / reuse / gaps | **KEEP LLM** — semantic architecture reasoning |
| `ScopeProcessFlow` | `ScopeProcessFlowGenerator.ts` | **Hybrid** — task flow deterministic; prose→flowchart via model | **KEEP HYBRID** — split already correct |
| `PortfolioAnalysis` | `PortfolioAnalysisGenerator.ts` | **Hybrid** — overlap detection deterministic; build/extend/share rec via model | **KEEP HYBRID** — split already correct |
| `ScopeAnalysis` / `ProjectScopeAnalysis` | `/analyzescope` skill → `upsert_document` | **Model** (skill-authored) | **KEEP LLM** — findings + severities need judgment |
| `ProjectStack` | `/buildstack` skill | **Model** / human-edited (interview) | **KEEP LLM** — interview-driven |
| `CompoundLearning` (entries) | `/compound` skill | **Model** / human | **KEEP LLM** — authored insight |
| `spec` / `plan` / `tasks` / `quickstart` / `checklist` / `specs` | createSpecs pipeline (file→row) | **Model-authored** content | **KEEP LLM** — this is what FR-009 (structured handoffs) addresses, not FR-007 |

## Conclusion

**No clear full-migration wins remain.** Every high-frequency, auto-refreshed doctype is already
deterministic and model-free — the migration FR-007 envisioned was already delivered incrementally
by SCOPE-048 (lifecycle), SCOPE-073 (scopeflow), SCOPE-081 (devplan), SCOPE-084 (help), and
SCOPE-075 (portfolio overlap detection). The doctypes still on the model each produce genuine
judgment that a template cannot reproduce (narrative synthesis, architecture reasoning, prose→
flowchart, cross-project recommendations, spec-pipeline authoring) — the plan's "leave
judgment-dependent doctypes on the model" case.

FR-007 acceptance:
- [x] **A documented list of candidate doctypes with a keep-LLM / go-deterministic decision** — this table.
- [x] **Each qualifying doctype is generated without the model** — vacuously satisfied: zero doctypes
  qualified for migration that are not already deterministic.

### Two design patterns confirmed (the reason there are no leftovers)

1. **Hybrids separate the halves.** `ScopeProcessFlow` uses `TASKFLOW`/`AIFLOW` section markers so
   the deterministic task flow rebuilds live on every view while the model half only rebuilds on an
   explicit "Refresh AI flow". `PortfolioAnalysis` computes overlaps deterministically and only asks
   the model for the recommendation. This is the correct pattern and it is already applied — the
   deterministic portion of each hybrid already costs zero model tokens.
2. **Model doctypes are regeneration-guarded.** `AutoScopeAnalysis` debounces (30s settle), caps
   calls per sweep, and re-analyzes only when the scope changed since its last analysis; the hybrids'
   model halves are on-demand/admin-triggered; `overview` runs once at scaffold. So the model is not
   being re-spent needlessly.

### Where the remaining model-doctype token cost is actually addressed

Not by FR-007 (full migration — done). By the later 093 tasks:
- **FR-009 (T009)** structured create_specs handoffs → the `spec`/`plan`/`tasks` pipeline stops
  re-reading and re-summarizing the growing tree between stages.
- **FR-010 (T010)** the advisor's `deterministic-doc` detector → catches the *request-time* case
  where a user asks for a document that already has a deterministic generator, and points them at it
  instead of regenerating via the model.

## Adjacent findings (NOT FR-007 migrations — flagged for a separate thread)

These are consistency/correctness observations surfaced by the inventory; none is a deterministic-
migration candidate, and none is changed by this task:

1. **`compound-learning` (skill) vs `CompoundLearning` (code) doctype mismatch — CONFIRMED + FIXED 2026-07-10.**
   The `/compound` skill *wrote* `doctype: 'compound-learning'` and `/compound-refresh` *read* the same
   hyphenated string — an internally-consistent pair, but isolated: no app code reads the hyphenated
   form. Every app surface (the `CompoundLearnings` aggregate in `ProjectLearningsGenerator.ts`, the
   dashboard Learnings status dot in `admin.ts`, `projects.ts`) queries `'CompoundLearning'` (which is
   what the `/wxAI-implement` flow and `seed-learnings.ts` write). So any learning authored by the
   `/compound` skill was invisible to the whole UI. **Fix:** aligned both skill docs to the app
   convention — `.claude/compound/SKILL.md` (write literal + discovery query) and
   `.claude/compound-refresh/SKILL.md` (discovery query) now use `'CompoundLearning'`. One entry
   doctype (`CompoundLearning`) everywhere; `CompoundLearnings` (plural) remains the aggregate report.
   (Descriptive "compound-learnings report" UI prose in `docs-workspace/` is unchanged — not a doctype
   literal.) Kit-synced (`.claude/` ships to customers); unpushed.
2. **`specs` (plural, MCP scaffolding) vs `spec`/`plan`/`tasks` (CLI dbpush).** Two ingestion paths
   use different doctype strings for the same conceptual spec documents.
3. **`overview` vs `ProjectOverview` coexist** by design (KitGenerationService prefers
   `ProjectOverview`, falls back to `overview`) — noted so the two are not conflated.
4. **`scope`** appears only in a test fixture — likely legacy/test-only, no production writer.
