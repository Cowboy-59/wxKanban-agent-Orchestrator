# Spec 025: Project Overview Builder

## Overview

# Spec 025: Project Overview Builder — AI-Assisted Overview Authoring Surface

**Spec Number**: 025
**Status**: `draft`
**Created**: 2026-04-23
**Depends On**: 024-pending-projects (proposal handoff), 002-Scope (Admin Dashboard), shared Mermaid/PDF pipeline from `specs/projectlifecycle.md`
**Source**: `specs/Project-Scope/025-project-overview-builder.md`

---

## Amendment A — Problem-first section template (2026-06-26)

The fixed template gains a dedicated **Problem** section as the **first** section, ahead of Overview, making **seven** sections total: **Problem → Overview → Goals → Primary Users → Constraints → Success Criteria → Notes**. This mirrors `/buildscope`, which "starts from the PROBLEM, not the feature" — the interview now opens by nailing the problem (who has it, what it costs today, why now) before the author describes what to build. **Overview** is reframed to the *solution shape* (what we're building and how it solves the problem). Applies to all three entry modes (interview, paste-to-analyze, import). This amendment satisfies the **C10** spec-first gate for changing the required section set. Implemented in `business-analyst.ts`, `section-mapper.ts`, and `InterviewChatPanel.tsx`.

---

## Amendment B — Bounded transcript context window + Gemini default in prod (2026-06-30)

Two related changes, prompted by the Groq free-tier daily cap being exhausted under real interview load.

**1. Provider default revisited (ops/config, no code change).** FR-019 documents Groq + Llama 3.3 70B as the default for its free-tier capacity. In practice that free tier has a hard *daily* token/request cap that real interview volume exhausts. Production (the App Runner app service) is therefore set to `LLM_PROVIDER=gemini` with `GEMINI_MODEL=gemini-2.5-flash-lite` — higher throughput at lower per-token cost, while Groq and Anthropic remain drop-in via the same env var. The provider-selection mechanism in FR-019 is unchanged; only the deployed value differs. `MARKETING_LLM_PROVIDER` is left on Groq. The hosted MCP service is **deliberately left on Groq** because its only `LLM_PROVIDER` consumer — `feedback-triage.ts` — is groq-only and would break on a non-groq value; the MCP does no heavy generation, so it never hit the cap.

**2. Bounded transcript context window (new — see FR-020).** The root cause of the cap exhaustion is structural, not provider-specific: the `ai-message` route ([overview.ts](../../src/server/routes/overview.ts)) re-sends the *entire* transcript to the LLM on every turn, so per-session token cost grows ~quadratically with interview length. The route MUST instead feed the provider only a bounded **sliding window** (system prompt + last *N* turns). The full transcript is still persisted to `overviewtranscripts` and still rendered in the AI pane — only what is sent to the provider per turn is bounded. This satisfies the **C10** spec-first gate for the new behavior.

---

## Amendment C — Interview continuity + resilient section-write (2026-07-22)

**Field-reported defect.** Running the interview end-to-end, an author observed: Section 1 (Problem) is drafted and written to the editor correctly; the next section is partially written; then every remaining section is "walked through" conversationally but **nothing is written to the editor text**; and after reaching the last section the AI **loops back and restarts at Problem**.

**Root cause — the bounded window (Amendment B / FR-020) starves the interview of its own state.** Two coupled structural facts produce the symptom:

1. **Section-write is 100% dependent on a fragile signal with no fallback.** Overview text is only written when the assistant emits the exact fenced block ` ```section:<key> ``` ` AND the author performs an approve action; the merge happens entirely client-side ([OverviewEditorPage.tsx `mergeSectionIntoContent`](../../src/client/pages/OverviewEditorPage.tsx#L287), driven by [InterviewChatPanel.tsx](../../src/client/components/overview/InterviewChatPanel.tsx#L43)). The `ai-message` route never extracts or persists sections server-side. So a single assistant turn that drifts and omits the fence silently loses that section — there is no server-side safety net.

2. **The 10-turn window (`OVERVIEW_HISTORY_TURNS` default) is smaller than a 7-section interview needs.** Each section costs ~4 transcript rows (assistant question → author answer → assistant `section:` proposal → author `[A]pprove`, which is itself sent as a turn). By section ~3 the Problem/Overview turns have scrolled out of the window, so the model can no longer see which sections it already completed or which one it is on. A small model (prod runs `gemini-2.5-flash-lite` per Amendment B) then (a) stops reliably emitting the `section:` fence — so nothing merges — and (b) having lost its place in the "seven sections in order" instruction, restarts at Problem.

**Required behavior (see FR-021).** The interview MUST NOT lose its place as the window slides, and section content MUST NOT be silently lost when a turn omits the fence. FR-021 mandates (a) an always-present interview-state preamble (completed sections + current section) injected each turn independent of the window, (b) a window default large enough to hold a full seven-section interview, and (c) a server-side fallback that extracts and records section proposals so a section survives a missed approve. This satisfies the **C10** spec-first gate for the behavior change.

---

## Overview

A full-screen authoring surface where a user builds a project's `projectoverview.md` with AI Business Analyst assistance beside them. Layout: **3/4 width Markdown editor** (live markdown preview; Mermaid kept as raw code blocks, NOT rendered in the editor) + **1/4 width AI discussion pane** on the right. The AI walks the user through a FIXED section template using the same interactive methodology as `/buildscope` — probe → draft → `[A]`pprove / `[C]`hange / `[E]`xplain / `[Add]` → advance.

The document produced is the canonical project definition. It is the shared source of truth for:

- **New proposals** (spec 024 pending-projects)
- **New projects** (consultant/admin-initiated)

It is persisted to BOTH:

- **Filesystem**: `projectoverview.md` at the **repo root** (one per active project, mirroring the `CLAUDE.md` convention — there is only one active project per workspace)
- **Database**: `projectdocuments` row keyed by (`projectid`, `doctype='ProjectOverview'`, `specid=null`)

Mermaid handling is intentionally bifurcated: raw code blocks in the editor (avoids known web-render instability) and fully rendered in PDF export (same Puppeteer pipeline already used by `specs/projectlifecycle.md` printing).

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actors** | Proposer (any user submitting a proposal), any company user with project-edit rights, Consultant |
| **Deferred Actors** | "Customer" role — not yet modeled in wxKanban; out of scope for 025 |
| **Key Value** | One authoring surface replaces two (proposal form + project-setup doc). AI guidance produces a complete overview in minutes using the proven `/buildscope` conversational pattern. Same document, two entry points, zero drift. |
| **Scope Boundary (IN)** | Full-screen editor route; fixed section template; live Markdown preview with raw Mermaid blocks; dual file+DB persistence; launch from "New Proposal" AND "New Project"; PDF export (Mermaid rendered); "Edit" action on proposal list; shared BA persona with `/buildscope` |
| **Scope Boundary (OUT)** | Functional-area detection / candidate-scope flagging; auto-creation of scope stubs; multi-scope splitting; any spec-breakdown work; dedicated "customer" actor role; version history / diff view (deferred) |

---

## User Scenarios & Testing

### US1 — New Proposal Authoring (happy path)

**Actor**: Proposer (any company user or external invitee)

**Scenario**:
1. From Admin Dashboard (or proposal invite link), the proposer clicks **"New Proposal"**.
2. The editor opens full-screen: 3/4 Markdown editor (seeded with the empty required-section template) and 1/4 AI pane.
3. The proposer chooses one of three entry modes (the pane offers all three from the start):
   - **Interview** — the AI greets as a Senior Business Analyst and walks Section 1 (Overview) via probing questions (FR-004).
   - **Paste to analyze** — the proposer pastes existing content; the AI reformats to Markdown and proposes a section-by-section mapping (FR-013).
   - **Import from file or URL** — the proposer uploads a file or pastes a GitHub / docs URL (FR-014).
4. Regardless of entry mode, each proposed section is reviewed with `[A]`pprove / `[C]`hange / `[E]`xplain / `[Add]`; approved content is written to the editor at the matching heading. If the section already contains author content, a Replace / Merge / Skip confirm appears first.
5. The flow continues through all seven template sections: Problem, Overview, Goals, Primary Users, Constraints, Success Criteria, Notes.
6. Autosave fires on every approved section write and on a ~2s debounced idle timer; content is persisted to BOTH `projectoverview.md` AND the `projectdocuments` row.
7. The proposer clicks **"Submit Proposal"** → the proposal enters the spec-024 pending queue for admin review.

**Expected outcome**: A complete `projectoverview.md` exists and is linked to the submitted proposal. The AI transcript is retained with the draft so later edits can resume with full context.

### US2 — New Project Initiation by Consultant / Admin

**Actor**: Consultant or Company Admin

**Scenario**:
1. From Admin Dashboard, clicks **"New Project"**.
2. Full-screen editor opens with the same layout as US1.
3. The admin picks any entry mode offered by the pane:
   - **Author manually** in the Markdown editor.
   - **Short-prompt draft** — give the AI a one-line description and walk the BA interview (FR-004, FR-005).
   - **Paste to analyze** — paste existing notes, emails, or docs; AI maps them to sections (FR-013).
   - **Import** — upload a file or fetch a GitHub / docs URL; AI walks the section mapping (FR-014).
4. Every approved section autosaves to file + DB. Replace / Merge / Skip is presented when an approved mapping would overwrite existing author content.
5. Admin clicks **"Create Project"** → a project row is created with the overview already attached.

**Expected outcome**: The new project appears on Admin Dashboard and its ProjectOverview `ReportLinkCard` reflects "created" immediately (non-null timestamp from `GET /api/admin/doc-status`).

### US3 — Re-edit an Existing Proposal Overview

**Actor**: Original proposer OR Company Admin

**Scenario**:
1. The proposal list shows a new **"Edit"** action per row.
2. Clicking Edit opens the same full-screen editor, preloaded with the proposal's existing `projectoverview.md` content AND the prior AI conversation transcript for continuity.
3. The user edits markdown directly OR asks the AI to revise a specific section ("tighten the Goals section").
4. Changes autosave to file + DB.
5. User exits; the proposal-list row reflects the updated timestamp.

**Expected outcome**: The proposal in the pending queue shows revised content. No duplicate `projectdocuments` rows are created. A proposer retains edit access until an admin accepts or rejects the proposal.

### US3.5 — Re-edit an Existing Project Overview from Dashboard Panel

**Actor**: Company Admin or any user with project-edit rights

**Scenario**:
1. On Admin Dashboard (or Team Dashboard), each project card has a **"Project Overview"** `ReportLinkCard`. The card shows either "Last updated: M/D/YYYY" (if a `projectdocuments` row exists for `doctype='ProjectOverview'`) or "not created" otherwise.
2. The user clicks the card. Instead of navigating to a static `/projects/:id/overview` view, the system opens the **same full-screen AI editor** used by Proposals (FR-001):
   - **Edit mode** if a draft or `projectdocuments` row already exists for that project — the editor seeds from existing content and the prior AI transcript.
   - **Creation mode** if neither exists — the editor seeds with the empty section template (FR-003).
3. The user edits markdown directly or works section-by-section with the BA AI pane (FR-004 / FR-013 / FR-014).
4. Autosave persists content to `overviewdrafts.content` only (NOT to disk — see FR-016).
5. The user clicks **"Done editing"** to commit and exit. On commit:
   - `overviewdrafts.content` is final-saved.
   - `projectdocuments` is upserted (`doctype='ProjectOverview'`, `specid=null`) — DB is the source of truth.
   - Disk file is NOT written by the wxKanban server. Materialization happens on the kit side (FR-018).
6. The dashboard re-renders; the `ReportLinkCard` shows the updated timestamp.

**Expected outcome**: The project's overview is updated in the DB. The next time the project is opened in VS Code with the kit, the kit detects DB-newer-than-disk and prompts the user to pull (FR-018). No silent overwrite of local edits.

### US4 — Export Overview to PDF (print-ready)

**Actor**: Any author (admin, consultant, or proposer)

**Scenario**:
1. From the editor toolbar or a proposal-list row menu, the user clicks **"Export PDF"**.
2. Server renders `projectoverview.md` → HTML → PDF (Puppeteer), with Mermaid rendered server-side using the same pipeline as `specs/projectlifecycle.md` printing.
3. Browser downloads the PDF.

**Expected outcome**: Printable PDF matches on-screen content; all Mermaid diagrams render correctly in the PDF.

---

## Functional Requirements

### Editor Surface & Layout

#### FR-001 — Full-Screen Overview Editor Route

The system MUST provide a full-screen editor route that splits the viewport 75/25 (left: Markdown editor, right: AI pane).

**Acceptance Criteria**:
- [ ] Route renders above the Admin Dashboard chrome (true full-screen, not embedded inside the dashboard frame).
- [ ] Split ratio holds across common breakpoints (≥1280px).
- [ ] Browser back button returns the user to the originating list.

#### FR-002 — Markdown Editing with Live Preview (Mermaid raw)

The editor MUST render a Markdown preview live as the user types, EXCEPT Mermaid fenced blocks which remain raw code (unrendered).

**Acceptance Criteria**:
- [ ] Headings, lists, tables, code, links preview live.
- [ ] ```` ```mermaid ```` blocks display as code, not charts.
- [ ] Keyboard shortcuts for bold / italic / heading / list are present.

#### FR-003 — Fixed Section Template

A new overview document MUST be seeded with a fixed template containing seven required sections, **problem-first** (see Amendment A): **Problem**, **Overview**, **Goals**, **Primary Users**, **Constraints**, **Success Criteria**, **Notes**. The **Problem** section is the foundation — the AI must anchor the author on the problem (who has it, what it costs today, why now) before describing what to build, mirroring `/buildscope`.

**Acceptance Criteria**:
- [ ] New doc loads with all seven section headings present, **Problem** first.
- [ ] Each section has a placeholder prompting the author.
- [ ] AI pane references the same section ordering when walking the user through, and opens the interview on **Problem**.

### AI Assistance Pane

#### FR-004 — Business Analyst AI Persona

The AI pane MUST use the same Senior Business Analyst persona and conversational pattern as `/buildscope` (probe → draft → `[A]`pprove / `[C]`hange / `[E]`xplain / `[Add]` → advance to next section).

**Acceptance Criteria**:
- [ ] AI walks sections in the defined template order.
- [ ] AI waits for explicit approval before advancing.
- [ ] Approved section text is written into the Markdown editor at the corresponding heading.

#### FR-005 — AI Drafting from Short Prompt

An author MUST be able to ask the AI to draft any section from a short free-text prompt instead of answering the full interview.

**Acceptance Criteria**:
- [ ] "Draft from prompt" action is available per section.
- [ ] AI generates a draft; the user must still approve before the editor content is replaced.

#### FR-006 — AI Conversation Transcript Retention

The system MUST persist the AI conversation transcript alongside the overview document so edits can resume with context.

**Acceptance Criteria**:
- [ ] Transcript survives page reload and re-entry via the Edit action.
- [ ] Transcript is visible and scrollable in the AI pane.
- [ ] Transcript is NOT included in `projectoverview.md` itself.

#### FR-019 — LLM Provider Selection (Groq + Llama 3.3 70B default)

The AI pane and all server-side overview-related AI calls MUST be driven by a single `LLM_PROVIDER` environment variable so the provider can be swapped without code changes. The default provider is Groq with the `llama-3.3-70b-versatile` model — chosen for its free-tier capacity, low latency on SSE streaming, and adequate quality for Business-Analyst-style probe/draft/approve interaction.

**Acceptance Criteria**:

- [ ] `LLM_PROVIDER` env var accepts: `groq` (default), `gemini`, `anthropic`.
- [ ] When unset or empty, the server falls back to `groq`.
- [ ] Groq path uses `https://api.groq.com/openai/v1/chat/completions` with model `llama-3.3-70b-versatile` (override via `GROQ_MODEL`).
- [ ] Gemini path remains supported as a fallback using `gemini-2.5-flash` (override via `GEMINI_MODEL`).
- [ ] Anthropic path uses Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) for paid-quality fallback (override via `ANTHROPIC_MODEL`).
- [ ] All three provider branches share a single SSE stream contract: server emits `data: { "delta": "..." }` lines to the client; per-provider response parsing is normalized inside the route.
- [ ] If the configured provider's API key is missing, the route returns a single SSE error frame (`data: { "error": "<provider> API key not configured" }`) and closes the stream — no silent fallback to a different provider.
- [ ] The same `LLM_PROVIDER` selection applies to `AIScaffoldingService` (ProjectOverview generation, scope stubs) — both `routes/overview.ts` and `services/AIScaffoldingService.ts` read the same env var via a shared helper.
- [ ] `.env.example` documents `LLM_PROVIDER`, `GROQ_API_KEY`, `GROQ_MODEL`, and notes Gemini/Anthropic vars as optional fallbacks.

**Rationale**: Gemini 2.5 Flash was wired in as a temporary default during scaffolding. Groq + Llama 3.3 70B gives us a genuinely free path for the BA interview at expected volumes (the educational mission depends on this surface working out-of-the-box for customers without a paid AI account), while keeping Gemini and Claude Haiku as drop-in fallbacks for quality-sensitive customers. **(See Amendment B: prod is now set to `gemini` / `gemini-2.5-flash-lite` because the Groq free-tier daily cap was exhausted under real load; the mechanism here is unchanged.)**

#### FR-020 — Bounded Transcript Context Window (per Amendment B)

The `POST /api/overview/draft/:id/ai-message` route MUST send the LLM only a bounded sliding window of the conversation — the system prompt plus the most recent *N* turns — rather than the full transcript on every turn. This caps per-turn token cost so long interviews do not exhaust provider rate limits, independent of which provider is configured.

**Acceptance Criteria**:

- [ ] The number of trailing transcript turns sent to the provider is bounded by a configurable limit (env var, e.g. `OVERVIEW_HISTORY_TURNS`, with a sensible default such as 8–12).
- [ ] The **full** transcript is still persisted to `overviewtranscripts` and still returned by the transcript endpoint / rendered in the AI pane — the window applies only to what is fed to the provider.
- [ ] The window is applied uniformly across all three provider branches (Groq, Gemini, Anthropic) before the per-provider message mapping.
- [ ] The canonical opener (first assistant turn) handling for Anthropic alternation still holds after windowing (no leading-assistant violation).
- [ ] `max_tokens` for the response is reduced from 2048 to a tighter ceiling (≈1024) appropriate for a single BA probe/draft turn.
- [ ] `.env.example` documents the new history-window var.

**Rationale**: The cap exhaustion that triggered the Gemini switch was caused by re-sending the entire transcript every turn (≈O(n²) token growth). Bounding the window is the structural fix and benefits every provider; switching to Gemini only made the same waste cheaper.

**Out of scope for this FR**: Provider selection for `ScopeChatService` / `ScopeService` (scope-level AI) — those belong to spec 027 and will adopt the same `LLM_PROVIDER` helper when that spec is implemented.

#### FR-021 — Interview Continuity & Resilient Section-Write (per Amendment C)

The bounded window from FR-020 MUST NOT cause the interview to lose track of which section it is on, and approved section content MUST NOT be silently lost when an assistant turn omits the `section:` fence. The `POST /api/overview/draft/:id/ai-message` route and the shared BA prompt MUST be hardened on three fronts:

**1. Always-present interview-state preamble (window-independent).**

- [ ] On every turn, the route MUST inject a compact machine-derived state summary into the model input (system prompt or a leading system/context turn) that lists, in template order, which of the seven sections are already **completed** and which section is **current** — derived from the draft's persisted state, NOT from the transcript window.
- [ ] This preamble is present regardless of how many transcript turns the window drops, so the model always knows its place even after early sections scroll out.
- [ ] The "completed" set is derived from **approved** content only — the headings populated in `overviewdrafts.content` (approval is the sole completion signal; a section reaches the draft body only when the author approves it). It MUST NOT count a merely *proposed* section as completed. **Live-test finding (2026-07-22):** an earlier build unioned proposed-section stamps into the completed set; during a `[C]hange` revision loop that marked the in-progress section "done" and the preamble advanced the model past it, so sections landed out of order. Derive from the draft body, not from proposal stamps.

**2. Window default sized for a full interview.**

- [ ] The default `OVERVIEW_HISTORY_TURNS` MUST be large enough to retain a complete seven-section interview under normal pacing (~4 turns/section ⇒ raise the default from 10 to **at least 28**, or make the window section-aware so it never drops turns belonging to an incomplete section). The env var remains the override.
- [ ] The `max_tokens` reduction from FR-020 (≈1024) is retained; only the history depth changes.

**3. Server-side section-write fallback (no silent loss).**

- [ ] When an assistant turn contains a `section:<key>` fence, the route MUST detect it (reusing `detectSectionProposals` from `business-analyst.ts`) and stamp `overviewtranscripts.sectionkey` as a durable **recoverability/audit record** of what was proposed. This stamp is explicitly **NOT** a completion signal for the preamble in (1) — completion is approval, which lands in the draft body. (See the live-test finding under (1): treating a proposal as completion causes skip-ahead during `[C]hange` loops.)
- [ ] The client approve/merge path (FR-004) remains the primary write channel; the server-side path is a **safety net** so a drifted-but-fenced section is recoverable, never silently dropped.
- [ ] Detection MUST tolerate both the canonical ` ```section:<key> ``` ` fence and the looser ` ```<key> ``` ` variant some models emit (matching the existing `SECTION_FENCE_RE` behavior), and MUST reject non-section language fences by checking against the known-section-key set.

**Acceptance (end-to-end)**:

- [ ] An author can complete all seven sections in one sitting and every approved section is written to the editor text — no "walked through but not written" sections.
- [ ] After the last section, the AI concludes (congratulate + Submit/Create per the BA prompt) and does NOT restart at Problem.
- [ ] Regression guard: a scripted 7-section interview asserts all seven headings are populated in `overviewdrafts.content` and the transcript never re-opens an already-completed section.

**Rationale**: FR-020 fixed the token-cost blowup but, by bounding the window, removed the only place the model tracked interview position. Section-write was already fence-and-approve dependent with no server fallback; combined, a slid window plus one fence-less turn silently loses sections and disorients the model into restarting. FR-021 restores continuity via an explicit state channel and makes the write path resilient.

**Out of scope for this FR**: OCR/vision extraction (N8), version history (N6). This FR does not change the seven-section set (that would re-trigger the C10 gate via a new amendment).

### Alternative Entry Modes

#### FR-013 — Paste-to-Draft Analysis

The AI pane MUST provide a "Paste to analyze" action that accepts arbitrary user-pasted content (plain text, markdown, or image), reformats it to Markdown, and proposes a section-by-section mapping into the fixed template sections. Each proposed section is reviewed using the same `[A]pprove / [C]hange / [E]xplain / [Add]` pattern as FR-004 before being written into the editor.

**Acceptance Criteria**:
- [ ] "Paste to analyze" action is visible in the AI pane (not triggered by paste into the editor itself).
- [ ] Paste input accepts plain text, markdown, and images (best-effort content extraction — OCR not guaranteed).
- [ ] Soft cap at 10,000 characters; over-limit input is NOT truncated — instead the pane surfaces a handoff prompt ("That's too large to paste safely — switch to file import?") linking to FR-014.
- [ ] AI maps content section-by-section in template order (Problem, Overview, Goals, Primary Users, Constraints, Success Criteria, Notes).
- [ ] For each proposed section, user chooses `[A]pprove / [C]hange / [E]xplain / [Add]`; advance is gated on explicit approve.
- [ ] On approve: if the target section already contains author content, user is prompted **Replace / Merge / Skip** BEFORE any write occurs (never silent overwrite).
- [ ] When AI cannot map content to a section, the pane asks: "I couldn't find content for **<Section>**. Do you have more to paste, or should I walk you through the interview questions?" — preserving paste-first as the primary path.
- [ ] When paste format cannot be resolved (e.g., image with no extractable content, corrupt binary), the system auto-files a markdown bug report at `specs/Project-Scope/025-project-overview-builder/bug-reports/YYYY-MM-DD-paste-format-unsupported-<hash>.md` with a sanitized sample, and the user is told "I couldn't read this — logged for the team."
- [ ] Only the AI's analysis (not the raw paste) is persisted to `overviewtranscripts`.

#### FR-014 — Import from File or GitHub URL

The AI pane MUST provide an "Import" action that accepts (a) uploaded files in `.md`, `.txt`, `.pdf`, `.docx`, or `.html` format, OR (b) a URL from an allowed host list. Imported content is routed through the same section-by-section mapping pipeline as FR-013.

**Acceptance Criteria**:
- [ ] "Import from file" and "Import from URL" actions are both visible in the AI pane.
- [ ] File upload accepts `.md`, `.txt`, `.pdf`, `.docx`, `.html` (server-side parsing via `pdf-parse`, `mammoth`, `html-to-text`).
- [ ] URL import is restricted server-side to an allowlist of known documentation hosts: `github.com`, `raw.githubusercontent.com`, `gist.github.com`, `gitlab.com`, `bitbucket.org`, `docs.google.com`, `notion.so`. Non-allowlisted hosts return a clear error. Extending the list requires a follow-up scope change.
- [ ] Private GitHub repos are NOT supported in v1; 401/403 responses from upstream return "This repo requires authentication — private-repo support is scheduled for a follow-up scope."
- [ ] Content larger than 8,000 characters is chunked into ~8k-character windows; chunks are passed to the AI sequentially with accumulating context so the mapping sees the full document, producing a single stitched section-mapping output.
- [ ] Hard ceiling at 500,000 characters per import; larger content is rejected with a clear message ("an overview isn't the right container for that volume").
- [ ] Each proposed section follows the same `[A]pprove / [C]hange / [E]xplain / [Add]` pattern as FR-013.
- [ ] On approve: if the target section already contains author content, user is prompted **Replace / Merge / Skip** BEFORE any write occurs.
- [ ] Raw imported content is persisted to `overviewtranscripts` with `role='user'` and `sourceuri` (URL or filename) for audit.
- [ ] AI analysis is persisted as `role='assistant'`.
- [ ] Fetched URL content is cached in `importcache` keyed by `(sourceuri, companyid)`; subsequent opens reuse the cached content indefinitely. A visible "Re-import" action triggers a fresh fetch on demand.

### Persistence & Integration

#### FR-007 — Persistence Targets (File + DB)

The overview content has two persistence targets, with mode-dependent semantics:

- **DB (`overviewdrafts.content` + `projectdocuments` row)** — written on every save (autosave or manual), regardless of mode. DB is the single source of truth.
- **Filesystem (`projectoverview.md` / `ProjectOverview.md`)** — written **server-side** only for *legacy proposal/new-project repo-root flows* where the wxKanban server's CWD is the active project workspace (see N5). For the **dashboard re-edit path (US3.5)**, the server does NOT write to disk; materialization is delegated to the kit (FR-018). This sidesteps the cross-host file-write problem when the server runs in App Runner.

**Acceptance Criteria**:
- [ ] DB row is keyed by (`projectid`, `doctype='ProjectOverview'`, `specid=null`) — upsert semantics; never duplicate.
- [ ] When server-side file write applies, file content matches DB content byte-for-byte after a successful save.
- [ ] Server-side file write is best-effort: if the file write fails, the DB save still commits and the failure is logged + surfaced to the user as a non-blocking warning. The kit's pull-on-open path (FR-018) is the durable materialization channel.

#### FR-008 — Autosave + Manual Save

The editor MUST autosave on a ~2 second idle debounce AND MUST also expose an explicit **Save** button in the toolbar. Both paths exercise FR-007 DB persistence.

**Acceptance Criteria**:
- [ ] Save status indicator visible in the toolbar.
- [ ] Autosave never loses content on navigation if the save completed before the navigation event.
- [ ] Manual Save forces immediate persistence regardless of the debounce state.
- [ ] Autosave writes DB only (never disk) for project-mode drafts (US3.5). Disk materialization is gated on the kit's pull-on-open prompt (FR-018).

### Launch & Lifecycle Entry Points

#### FR-009 — Launch from "New Proposal" and "New Project"

Two distinct entry points MUST open this editor:

- (a) **"New Proposal"** — binds editor to a new proposal record
- (b) **"New Project"** — binds editor to a new project record

**Acceptance Criteria**:
- [ ] Each entry point creates the underlying record in draft state before the editor opens.
- [ ] Cancelling or exiting without submit leaves the draft in "in progress" state; the document in `projectdocuments` remains keyed to that draft project or proposal.

#### FR-010 — Proposal List "Edit" Action

The proposal list MUST add an **"Edit"** action per row that reopens the editor with the proposal's existing `projectoverview` content AND its AI transcript loaded.

**Acceptance Criteria**:
- [ ] Edit is visible per row; gated by author-or-admin role.
- [ ] Re-entry does NOT create a new `projectdocuments` row.
- [ ] Last-edited timestamp updates on save.

#### FR-011 — Submit / Create Commits (editable until accepted)

Terminal actions MUST transition the draft:

- (a) **"Submit Proposal"** → proposal enters the spec-024 pending queue. The proposer retains edit rights until the admin accepts or rejects.
- (b) **"Create Project"** → project row promoted to active; Admin Dashboard's ProjectOverview `ReportLinkCard` reflects "created" (non-null timestamp from `GET /api/admin/doc-status`).

**Acceptance Criteria**:
- [ ] Submit / Create is disabled until all required sections have non-placeholder content.
- [ ] After Submit or Create, `GET /api/admin/doc-status` returns a non-null `projectOverview` timestamp for that project.
- [ ] After admin-accept, further proposer-originated edits are blocked with a clear explanation.

### Project-Mode Editing (Existing Projects)

#### FR-016 — Edit Project Overview from Dashboard Card

The "Project Overview" `ReportLinkCard` on each dashboard project panel MUST open the full-screen AI editor (FR-001) bound to that project, in either edit mode (existing content) or creation mode (empty seeded template). The editor surface is identical to the proposal flow; only the terminal actions differ (see FR-017).

**Acceptance Criteria**:
- [ ] Clicking the card invokes a server endpoint that returns or lazily creates an `overviewdrafts` row with `projectid` set and `proposalid` NULL. The server seeds `content` from (a) the existing `overviewdrafts.content` if a row already exists for this project, OR (b) the latest `projectdocuments` row content for `(projectid, doctype='ProjectOverview', specid=null)`, OR (c) the empty section template (FR-003). The seed source resolves in that order.
- [ ] The client navigates to `/overview/:draftId` after receiving `{draftid}`.
- [ ] The editor's mode is detectable by `overviewdrafts.projectid != null && overviewdrafts.proposalid == null`. The toolbar replaces "Submit Proposal" with "Done editing" (FR-017).
- [ ] Authorization: caller must be in the project's company AND have project-edit rights (admin OR project member). Cross-company edit is forbidden.
- [ ] Re-entry from the same card always returns the same draft id for that project (no orphan drafts; one open draft per `(projectid, NULL proposalid)`).
- [ ] The "Last updated" timestamp on the `ReportLinkCard` reflects `projectdocuments.updatedat` (DB row, not the disk file), so updates are visible immediately after Done editing.

#### FR-017 — Done-Editing Terminal Action (Project Mode)

In project-mode drafts (FR-016), the editor's primary terminal action MUST be **"Done editing"** (replacing "Submit Proposal" from FR-011). On click, the server flushes any unsaved content, upserts `projectdocuments`, and returns the user to the originating dashboard.

**Acceptance Criteria**:
- [ ] "Done editing" button appears in the toolbar in place of "Submit Proposal" when `projectid` is set on the draft.
- [ ] Clicking "Done editing" persists `overviewdrafts.content` and atomically upserts `projectdocuments` (`doctype='ProjectOverview'`, `specid=null`) with the same content. The `updatedat` of the `projectdocuments` row advances.
- [ ] If the user navigates away without clicking "Done editing", autosave still keeps `overviewdrafts.content` current — but `projectdocuments` is NOT updated. Only "Done editing" promotes draft → published. (Rationale: clean commit semantics, consistent with how the proposal flow treats "Submit Proposal" as the promotion event.)
- [ ] After "Done editing", the dashboard `ReportLinkCard` reflects the new `updatedat` immediately on next render.

### Workspace Sync (Kit-Side)

#### FR-018 — Kit Pull-on-Open Sync Check

When a project workspace is opened in VS Code with the kit's MCP server running, the kit MUST compare its local `ProjectOverview.md` against the DB version (`projectdocuments` row for the kit's `projectId`) and, when the DB is newer, prompt the user to pull the latest content. This is the cross-host materialization channel that closes the loop with FR-016 / FR-017 (server writes DB; kit syncs to disk on next open).

**Acceptance Criteria**:
- [ ] On MCP-server startup (or workspace activation), the kit reads `.wxkanban-project.json` for the local `projectoverviewlastsyncedat` timestamp and `projectoverviewsha` content hash. (See N11 for the schema extension.)
- [ ] The kit queries the wxKanban API for the current `projectdocuments` row's `updatedat` and content hash for `(projectId, doctype='ProjectOverview', specid=null)`.
- [ ] If `db.updatedat > local.projectoverviewlastsyncedat` AND `db.contenthash != local.projectoverviewsha`, the kit surfaces a prompt: **"Project Overview has been updated on wxKanban (M/D/YYYY h:mm). Pull the latest content?"** with **Pull** / **Keep local** / **View diff** actions.
- [ ] On **Pull**: the kit overwrites `ProjectOverview.md` with the DB content and updates `.wxkanban-project.json` with the new `projectoverviewlastsyncedat` and `projectoverviewsha`. No prompt fires again until the DB version advances past this baseline.
- [ ] On **Keep local**: the kit records `projectoverviewlastsyncedat = db.updatedat` and `projectoverviewsha = local.contenthash`, suppressing the prompt for this version. (User explicitly chose to diverge; we respect that until the next DB-side change.)
- [ ] On **View diff**: the kit shows a side-by-side diff (e.g., via `code --diff` or an MCP-served HTML view); the user then chooses Pull or Keep local.
- [ ] If the local file has been edited *since the last pull* (`local.contenthash != local.projectoverviewsha`), the prompt explicitly warns: **"Your local copy has unsaved changes that are not in wxKanban. Pulling will overwrite them."** No silent overwrite ever.
- [ ] If the wxKanban API is unreachable, the kit silently skips the check (no error spam on workspace open) and logs at debug level.
- [ ] The check is gated behind a per-project setting (default ON) so users can disable it in long-divergence development scenarios.

**Implementation note**: This FR is implemented in the **kit** (`mcp-server/`), not the wxKanban Express server. The wxKanban server's contribution is exposing a lightweight metadata endpoint (A12) so the kit can do a single round-trip without fetching full content for the staleness check.

### Export

#### FR-012 — PDF Export (print-ready; Mermaid rendered)

The system MUST provide a PDF export action that renders the overview to print-ready PDF **with Mermaid diagrams rendered**, using the same pipeline as `specs/projectlifecycle.md` printing.

**Acceptance Criteria**:
- [ ] Export is available from the editor toolbar and from the proposal-list row menu.
- [ ] Mermaid blocks render as diagrams in the PDF.
- [ ] Author, admin, consultant, AND proposer can all trigger export. The endpoint enforces that proposers can only export their own drafts (no arbitrary `draftid` enumeration).

---

## Data Requirements

### Existing Table — Re-used

| Table | Purpose |
|-------|---------|
| `projectdocuments` | Re-used for overview content. Rows keyed by (`projectid`, `doctype='ProjectOverview'`, `specid=null`). Write `content`, `isgenerated=false`, `title='Project Overview'`. |

### New Tables

#### `overviewdrafts`

Purpose: hold in-progress authoring state when a proposal or project has not been finalized yet (covers FR-009 draft state and FR-011 "editable until accepted").

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid v7` | Primary key |
| `projectid` | `uuid v7` | FK → `projects.id`; nullable until the project is created |
| `proposalid` | `uuid v7` | FK → `proposals.id`; nullable until the proposal is submitted |
| `authoruserid` | `uuid v7` | FK → `users.id` |
| `companyid` | `uuid v7` | FK → `companies.id` — for tenant isolation |
| `status` | `text` | `'draft' \| 'submitted' \| 'accepted' \| 'rejected'`, default `'draft'` |
| `content` | `text` | Markdown body |
| `createdat` | `timestamp` | |
| `updatedat` | `timestamp` | |

#### `overviewtranscripts`

Purpose: persist the AI conversation (FR-006).

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid v7` | Primary key |
| `overviewdraftid` | `uuid v7` | FK → `overviewdrafts.id` |
| `role` | `text` | `'user' \| 'assistant' \| 'system'` |
| `content` | `text` | Message body |
| `sectionkey` | `text` | Nullable — which template section the message relates to |
| `sourceuri` | `text` | Nullable — set for entries produced by FR-014 imports; holds the URL or uploaded filename for audit. NULL for interview and paste entries. |
| `createdat` | `timestamp` | |

#### `importcache`

Purpose: cache fetched URL content for FR-014 so subsequent editor opens reuse the same content without re-fetching upstream. Cached indefinitely; user triggers refresh explicitly via A11.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid v7` | Primary key |
| `sourceuri` | `text` | Canonical URL (normalized) or filename hash |
| `companyid` | `uuid v7` | FK → `companies.id` — tenant isolation; same URL cached separately per company |
| `content` | `text` | Raw fetched content (up to 500k chars per FR-014) |
| `contenthash` | `text` | sha256 of `content` for integrity |
| `fetchedat` | `timestamp` | |

Unique constraint: `(sourceuri, companyid)`.

### Filesystem Path

- `projectoverview.md` lives at the **repo root** — one file per active project per workspace, mirroring `CLAUDE.md`. Proposals that have NOT been accepted write only to the DB (`overviewdrafts`); the root file is (re)written on Create Project or proposal acceptance.

---

## API Routes

| ID | Method | Route | Description |
|----|--------|-------|-------------|
| A1 | POST | `/api/overview/draft` | Create `overviewdrafts` row; returns `draftid` + seeded template content. Mode: `'proposal' \| 'project'`. |
| A2 | GET | `/api/overview/draft/:id` | Load draft content + transcript + proposal/project binding. |
| A3 | PUT | `/api/overview/draft/:id` | Save content (debounced autosave + manual Save, FR-008). Atomic: writes file AND upserts `projectdocuments` row (FR-007). Rolls back DB on file-write failure. |
| A4 | POST | `/api/overview/draft/:id/ai-message` | Append user message; stream assistant response; append to transcript; optionally patch a section on `[A]`pprove. Uses the shared BA persona prompt (see §4.4 / Constraints). |
| A5 | POST | `/api/overview/draft/:id/submit-proposal` | Promote draft to proposals queue (spec-024 handoff). `status='submitted'`. Proposer retains edit rights until admin accepts. |
| A6 | POST | `/api/overview/draft/:id/create-project` | Promote draft to a real project row; `projectdocuments` row flips to `specid=null / doctype='ProjectOverview'`; `GET /api/admin/doc-status` now returns a non-null timestamp. |
| A7 | GET | `/api/overview/draft/:id/pdf` | Render markdown → HTML → PDF (Puppeteer) with Mermaid server-rendered. Reuses the `projectlifecycle.md` pipeline (FR-012). Streams `application/pdf`. |
| A8 | GET | `/api/proposals` (extend existing) | Add `edit-eligibility` flag per row so the UI can render the Edit button (FR-010). |
| A9 | POST | `/api/overview/draft/:id/paste-analyze` | Accept paste payload (text, markdown, or base64 image). Stream AI mapping proposal as a series of per-section drafts. Body on per-section approve: `{ sectionkey, action: 'replace' \| 'merge' \| 'skip', content }`. Writes ONLY AI analysis to `overviewtranscripts` (raw paste dropped per FR-013). Unresolvable formats trigger auto bug-report (C15). |
| A10 | POST | `/api/overview/draft/:id/import` | Accept `{ source: 'file', filename, mimetype, payload }` OR `{ source: 'url', url }`. Enforces host allowlist (C14) and file-type whitelist. Chunks content >8k chars (FR-014). Streams AI mapping like A9. Writes raw content + AI analysis + `sourceuri` to `overviewtranscripts`. Upserts `importcache` row for URL imports. |
| A11 | POST | `/api/overview/draft/:id/import/refresh` | Re-import — bypasses `importcache`, refetches upstream, replaces cache entry. Only valid for `source='url'` imports. |
| A12 | GET | `/api/overview/draft-by-project/:projectid` | Return-or-create the `overviewdrafts` row scoped to a project (FR-016). Mirror of `draft-by-proposal/:proposalid`. Seeds new drafts from `projectdocuments` content if present, else from the empty template. Returns `{ draftid, backfilled }`. |
| A13 | POST | `/api/overview/draft/:id/finalize` | Project-mode terminal action (FR-017). Persists the final content and atomically upserts `projectdocuments` (`doctype='ProjectOverview'`, `specid=null`). Returns `{ projectdocumentid, updatedat }`. Distinct from `submit-proposal` (A5); same draft cannot be finalized AND submitted. |
| A14 | GET | `/api/projects/:projectid/overview-meta` | Lightweight metadata endpoint for the kit's pull-on-open check (FR-018). Returns `{ updatedat, contenthash }` for the project's `projectdocuments` ProjectOverview row, or `{ updatedat: null }` if none exists. JWT-gated; caller must be in the project's company. |
| A15 | GET | `/api/projects/:projectid/overview-content` | Full content fetch for the kit's Pull action (FR-018). Returns `{ content, updatedat, contenthash }`. JWT-gated; same authz as A14. Used after the user explicitly chooses Pull. |

**Authorization (all endpoints)**:
- JWT required.
- Row-level check: `authoruserid == requesting user` OR admin role OR consultant role on the same company.
- PDF export endpoint additionally enforces "proposer can only export their own draft" to prevent `draftid` enumeration.

---

## Frontend Components

### New Components

| Component | Path | Description |
|-----------|------|-------------|
| `OverviewEditorPage` | `src/client/pages/OverviewEditorPage.tsx` | Top-level page; orchestrates the 75/25 layout and save state. |
| `MarkdownEditorPane` | `src/client/components/overview/MarkdownEditorPane.tsx` | 3/4 width Markdown editor. Library choice pinned in the detail plan (see Notes N2). Live preview; Mermaid blocks rendered as raw code. |
| `AIPane` | `src/client/components/overview/AIPane.tsx` | 1/4 width chat UI; streams assistant responses (SSE); **three entry modes from the top of the pane**: (1) Interview (FR-004), (2) "Paste to analyze" action opening a paste dialog (FR-013), (3) "Import" action opening file-upload + URL-fetch dialog (FR-014). "Draft from prompt" per section (FR-005). `[A]`pprove inserts section into editor; Replace / Merge / Skip modal on existing-content collision. Scrollback persisted via A4. "Re-import" button visible on URL-sourced imports with last-fetched timestamp (N10). |
| `PasteAnalyzeDialog` | `src/client/components/overview/PasteAnalyzeDialog.tsx` | Modal surfaced from AIPane; textarea for paste content (10k char counter), best-effort image paste support, streaming section-map preview; 10k overflow shows handoff prompt to `ImportDialog`. |
| `ImportDialog` | `src/client/components/overview/ImportDialog.tsx` | Modal with two tabs: "From File" (drag-drop for `.md`, `.txt`, `.pdf`, `.docx`, `.html`) and "From URL" (host-allowlist-validated input). Shows chunk progress for content > 8k chars; rejects > 500k with a clear message. |
| `SectionWriteConfirm` | `src/client/components/overview/SectionWriteConfirm.tsx` | Small modal shown only when approved AI mapping would overwrite existing author content in a section. Offers **Replace / Merge / Skip**; never silent overwrite (FR-013 / FR-014 ACs). |
| `EditorToolbar` | `src/client/components/overview/EditorToolbar.tsx` | Manual Save, Submit Proposal / Create Project (contextual), Export PDF, autosave status indicator. |

### Modified Components

| Component | Change |
|-----------|--------|
| `AdminDashboard` | Add "New Project" and "New Proposal" buttons that launch the editor. |
| `ProposalList` | Add per-row "Edit" action (FR-010) and proposal-row Export PDF menu. |
| `DashboardProjectGrid` / `ReportLinkCard` | Project Overview card converts from a passive `<Link>` to an action button that calls A12 and navigates to `/overview/:draftId` (FR-016). Other cards (Project Lifecycle, Audit Report) unchanged. |
| `OverviewEditorPage` | When the loaded draft has `projectid != null && proposalid == null`, render "Done editing" in place of "Submit Proposal" and wire it to A13 (FR-017). |

### Route

| Route | Component | Purpose |
|-------|-----------|---------|
| `/overview/:draftId` | `OverviewEditorPage` | Full-screen editor, bypasses Admin Dashboard chrome. |

### Client Hooks (TanStack Query)

- `useOverviewDraft(id)` — loads draft + transcript (A2)
- `useSaveOverviewDraft()` — debounced + manual save (A3)
- `useAiMessage()` — SSE stream to A4
- `useSubmitProposal()` — A5
- `useCreateProject()` — A6
- `useExportPdf()` — A7
- `usePasteAnalyze()` — A9 (streams per-section AI proposals; emits Replace/Merge/Skip events on collision)
- `useImportDraft()` — A10 (handles file upload + URL submit; streams chunked AI mapping)
- `useReimportDraft()` — A11 (URL-sourced imports only; invalidates `importcache` entry for the draft)

### wxAI Commands — OMITTED

No new `/command` files. This feature embeds BA assistance inside the product for end-users; `/buildscope` already covers the CLI-based BA flow for developers in VS Code. Sharing is at the **prompt** level, not the command level — the BA persona prompt lives in a single shared module (e.g., `src/server/ai/prompts/business-analyst.ts`) imported by BOTH the `/buildscope` command handler AND the `A4 /ai-message` route. Any divergence between the two is a defect.

---

## Success Criteria

1. **Time to First Draft** — A typical author (proposer, admin, or consultant) can produce a complete first-pass overview in **≤ 20 minutes** using the AI pane, measured from editor open to all seven template sections containing non-placeholder content.
2. **Adoption / Coverage** — **≥ 95 %** of new proposals and new projects created after release ship with a non-empty `projectoverview.md` (DB row present, all required sections populated). No silent "not created" states on the Admin Dashboard.
3. **Persistence Integrity** — Across 1,000 save events, **100 %** of successful saves produce byte-identical content in both `projectoverview.md` (repo root) AND the `projectdocuments` row. Zero drift incidents.
4. **Data Loss Prevention** — Authors can close the tab, refresh, or navigate away at any point and return to find the last autosaved content intact (including AI transcript) in **100 %** of cases where the last autosave completed before navigation.
5. **PDF Export Fidelity** — Generated PDFs render all Markdown constructs AND all Mermaid diagrams correctly in **≥ 99 %** of export attempts. Failures surface a clear error rather than producing a broken PDF.
6. **Edit-After-Submit Behavior** — Proposers can reopen a submitted-but-unaccepted proposal and modify its overview 100 % of the time; once admin accepts, further edits by the proposer are blocked with a clear explanation.
7. **BA Prompt Parity with `/buildscope`** — The same BA persona prompt powers the in-app AI pane and the `/buildscope` CLI command — verified by pointing both at the same shared module. Any behavioral divergence between the two is treated as a bug.

---

## Key Entities

| Entity | Description |
|--------|-------------|
| `OverviewDraft` | A work-in-progress project overview bound to a proposal or project, with status `draft \| submitted \| accepted \| rejected`. |
| `OverviewTranscriptEntry` | A single AI-pane message (user / assistant / system) linked to a draft; optionally tied to a template section. |
| `ProjectOverviewDocument` | The finalized overview stored in `projectdocuments` (doctype `ProjectOverview`) and written to `projectoverview.md` at repo root. |
| `SharedBaPrompt` | The BA persona prompt module shared between `/buildscope` and the in-app AI pane. |

---

## Constraints

### Technical

- **C1** — Stack compliance: TypeScript 100 %, no `any`, no `@ts-ignore`. Pino for logging (no `console.log`). Drizzle ORM + UUID v7 for all new tables. bcrypt + JWT for authz (no Clerk). Per `_wxAI/rules/`.
- **C2** — Naming: new tables `overviewdrafts` and `overviewtranscripts` are lowercase, concatenated, no underscores, no spaces (per CLAUDE.md database conventions).
- **C3** — Dual-persistence pattern MUST mirror the existing `specs/projectlifecycle.md` ⇄ `projectdocuments` sync (per CLAUDE.md "projectdocuments DB Sync" section). No new pattern invented.
- **C4** — PDF export MUST reuse the existing Puppeteer pipeline used by `projectlifecycle.md` printing. No new PDF library.
- **C5** — Mermaid handling is bifurcated by policy: raw in editor (no live render), rendered in PDF. This is a deliberate trade-off against known web-render instability.
- **C6** — Shared BA persona prompt: a single source-file module imported by BOTH the in-app `ai-message` route AND the `/buildscope` command handler. Any divergence is a defect.

### Integration

- **C7** — Spec 024 (pending-projects) is a hard dependency for proposal submission. The "Submit Proposal" action in FR-011 enqueues via spec-024's existing handoff; no bypass.
- **C8** — Admin Dashboard's Project Overview `ReportLinkCard` is the post-launch source of truth for "created" status. No change to the `GET /api/admin/doc-status` contract — this feature must make it return a non-null timestamp on Create / Accept.
- **C9** — No new "customer" actor role. All actors (proposer, company user, consultant) are covered by existing roles. Deferred.

### Business / Workflow

- **C10** — **SPEC-FIRST rule applies** — any change to the set of required template sections (Problem, Overview, Goals, Primary Users, Constraints, Success Criteria, Notes — see Amendment A) requires a spec update before implementation. Prevents silent drift.
- **C11** — **Orchestrator routing** — spec edits, implementation, and releases for this feature route through `wxkanban-agent` per established convention. No out-of-band manual edits once implementation begins.

### Security / Privacy

- **C12** — AI transcripts may contain sensitive business info — the `overviewtranscripts` table must respect company isolation via `companyid` tie-through (through `overviewdrafts`).
- **C13** — PDF export endpoint is JWT-gated; proposers can only export their own drafts (no arbitrary `draftid` enumeration).
- **C14** — **URL-import host allowlist (security hard-line).** FR-014 URL imports are restricted server-side to a finite allowlist of known documentation hosts (initially: `github.com`, `raw.githubusercontent.com`, `gist.github.com`, `gitlab.com`, `bitbucket.org`, `docs.google.com`, `notion.so`). Arbitrary HTTPS URLs are rejected. Opening the list to arbitrary URLs is an SSRF risk (cloud metadata endpoints, internal services, RFC1918 ranges) and requires a dedicated threat-model review — do not relax this constraint without one.
- **C15** — **Paste-format fallback creates a bug report.** When FR-013 cannot extract usable content from a paste (e.g., image with no text, corrupt binary), the server auto-writes a markdown bug report to `specs/Project-Scope/025-project-overview-builder/bug-reports/YYYY-MM-DD-paste-format-unsupported-<hash>.md` containing a sanitized sample. The user is told "logged for the team" — no silent data loss.
- **C16** — **Transcript asymmetry.** Raw paste is NOT persisted (only AI analysis — FR-013). Raw import IS persisted alongside AI analysis (FR-014) with `sourceuri`. Rationale: pastes are often throwaway clipboard content with no audit value; imports have a durable source pointer and represent a deliberate seeding action worth preserving.
- **C17** — **Private GitHub auth deferred.** FR-014 v1 is public-only. OAuth / PAT handling for private repos (encrypted token storage per C1, per-company scope, refresh, revocation) is split into a follow-up scope (e.g., 026) to keep 025 shippable.
- **C18** — **Parsing dependency footprint.** FR-014 adds `pdf-parse`, `mammoth` (docx), and `html-to-text` to server dependencies. These run server-side only; do not bundle to client. Sandboxed file inputs must be size-capped at the HTTP layer (matching the 500k-char import ceiling) to prevent parser DoS.

- **C19** — **DB is the single source of truth across hosts.** For project-mode drafts (FR-016 / FR-017), the wxKanban server NEVER writes to the customer's local filesystem. All cross-host file materialization flows through the kit's pull-on-open prompt (FR-018). Rationale: the wxKanban server runs in App Runner (cloud) and has no visibility into a user's VS Code workspace; the kit is the only host with filesystem authority for the project directory.

- **C20** — **No silent local overwrite.** FR-018's Pull action MUST detect a locally-modified `ProjectOverview.md` (via content-hash comparison against `projectoverviewsha`) and warn before overwrite. Pull / Keep local / View diff is presented; user must explicitly choose. This mirrors the Replace / Merge / Skip pattern from FR-013 / FR-014 — never silent overwrite.

---

## Notes

- **N1** — The full-screen route must truly bypass the Admin Dashboard chrome — sibling to the dashboard route, not nested. Past full-screen attempts in this repo nested inside the dashboard and leaked chrome; avoid that.
- **N2** — Editor library choice (`@uiw/react-md-editor`, Milkdown, TipTap, custom) is a material decision affecting accessibility, bundle size, and Mermaid handling. Pin the choice in the detailed plan before coding.
- **N3** — **Race condition to design for**: author A is editing while admin accepts the proposal. On accept, subsequent author saves must be rejected with a clear error (not silently overwrite the frozen overview).
- **N4** — AI streaming via SSE needs an explicit heartbeat / timeout story; half-open connections waste model tokens.
- **N5** — Root-level `projectoverview.md` is tenant-bound — one file per active project per workspace. If wxKanban ever supports multi-project workspaces, this assumption breaks and must be revisited. Document loudly.
- **N6** — Deferred until a later scope:
  - Functional-area detection → candidate scopes
  - Multi-scope splitting
  - Dedicated "customer" actor role
  - Version history / diff view of overview edits
- **N7** — **Claude Projects path.** Users with a Claude Projects workspace can export the project's `claude.md` to a GitHub repository (public), then seed a wxKanban overview by pasting that file's GitHub URL into FR-014's URL import. No bespoke "Claude Projects connector" is needed — the standard FR-014 URL flow handles it natively. Document this path in user-facing help so authors know it's the recommended way to seed an overview from an existing Claude Project.
- **N8** — **Image paste is best-effort; OCR is not guaranteed.** FR-013 accepts images but does not ship dedicated OCR. Unrecognized images trigger C15's auto bug-report path so the team can see demand. If image imports become common, a dedicated OCR pipeline (e.g., Tesseract server-side or a vision-capable LLM call) should be scoped separately.
- **N9** — **Chunking strategy for FR-014 imports.** 8,000-character windows with accumulating-context mode (each chunk is sent to the AI along with prior-chunk section mappings, so the final output is stitched rather than disjoint per-chunk mappings). The AI client must cap total LLM calls per import to prevent runaway costs on near-ceiling documents — suggested hard cap: 80 AI calls per import (i.e., 500k / 8k = 62 chunks worst case + ~20 for revision rounds).
- **N10** — **Re-import UX.** The "Re-import" action (A11) is visible on imports sourced from URLs only. File-uploaded imports have no upstream to refresh; re-running requires a fresh upload. The UI should show the last-fetched timestamp alongside the "Re-import" button so authors know how stale the cached content is.

- **N11** — **`.wxkanban-project.json` schema extension for sync.** The kit identity file (already written by `KitProxyService` at kit download — see [src/server/services/KitProxyService.ts:362](src/server/services/KitProxyService.ts#L362)) gains two new fields:
  - `projectoverviewlastsyncedat` — ISO timestamp of the last successful Pull (or initial kit download). Compared to `projectdocuments.updatedat` from A14.
  - `projectoverviewsha` — sha256 hex of the `ProjectOverview.md` content at last Pull. Compared to `db.contenthash` from A14 to detect divergence; also compared to the *current* local file's hash to detect local edits since last Pull (FR-018 warning path).
  - Both fields are written on initial kit download (via `KitProxyService`) and updated by the kit on each Pull. They are absent in legacy kits — the kit MUST treat absence as "never synced" and force the prompt on first open after upgrade.

- **N12** — **Project-mode draft uniqueness.** A12 (`draft-by-project`) MUST return the same draft id for repeat opens of the same project. Implementation: the lookup query uses `WHERE projectid = ? AND proposalid IS NULL` and creates a new row only when none matches. This avoids orphan-draft accumulation as users open the editor repeatedly. Submit-proposal-style "promote and lock" is NOT used here — project-mode drafts stay open indefinitely.

---

## Clarifications

### Session 2026-04-23

| # | Question | Decision |
|---|----------|----------|
| 1 | What does "create project Overview" mean? | Build a full-screen AI-assisted MD editor for authoring `projectoverview.md`, shared by new proposals AND new projects. |
| 2 | Persistence target — file, DB, or both? | BOTH — `projectoverview.md` at repo root AND `projectdocuments` row, kept in sync atomically. |
| 3 | Where does it launch from? | "New Proposal" AND "New Project" entry points from Admin Dashboard. |
| 4 | Should AI detect functional areas and create candidate scopes? | NO — overview only. Scope breakdown happens later in VS Code via `/buildscope`. |
| 5 | Fixed section template or freeform? | Fixed template (Overview, Goals, Primary Users, Constraints, Success Criteria, Notes). |
| 6 | Who are the primary actors? | Proposers, any company user with project-edit rights, consultants. No "customer" role yet — deferred. |
| 7 | Live Mermaid preview in editor? | NO — raw code blocks in editor (web render instability). Mermaid IS rendered in PDF export, using the `projectlifecycle.md` pipeline. |
| 8 | PDF export included? Who can use it? | Yes, in v1. All authors — admin, consultant, AND proposer — can export. |
| 9 | Autosave behavior? | Both: 2 s debounced autosave AND manual Save button in the toolbar. |
| 10 | Edit-after-submit for proposers? | Proposer can edit a submitted proposal until the admin accepts it. After accept, the overview is locked. |
| 11 | File location for `projectoverview.md`? | Repo root only (one per active project per workspace, mirroring `CLAUDE.md`). |
| 12 | Version history / diff view in scope? | No — deferred to a later scope. |

### Session 2026-04-24

| # | Question | Decision |
|---|----------|----------|
| 13 | Can authors paste arbitrary content into the AI pane and have it mapped to the template? | **Yes — FR-013.** "Paste to analyze" action in the AI pane accepts text, markdown, and images (best-effort). Section-by-section mapping using the same `[A]pprove / [C]hange / [E]xplain / [Add]` pattern as FR-004. Replace / Merge / Skip prompt on existing section content — never silent overwrite. 10k soft cap; overflow hands off to FR-014 import, not truncated. Only AI analysis is persisted to transcripts (raw paste dropped). Unresolvable paste formats auto-file a bug report (C15). |
| 14 | Can authors import existing files or GitHub documentation? | **Yes — FR-014.** Accepts `.md`, `.txt`, `.pdf`, `.docx`, `.html` file uploads AND URL imports. URL imports restricted to a server-side host allowlist (C14) — GitHub, GitLab, Bitbucket, Gist, Google Docs, Notion. Public repos only in v1; private-repo auth deferred (C17, follow-up scope ~026). Content chunked at 8k chars with accumulating context (mode ii); hard ceiling 500k chars. URL content cached in `importcache` indefinitely; user triggers refresh via "Re-import" (A11). Raw import + AI analysis + `sourceuri` all logged (C16 asymmetry vs. paste). |
| 15 | URL import reach — any HTTPS URL, or allowlist? | **Allowlist (α).** Arbitrary HTTPS URLs are an SSRF risk (cloud metadata, internal services); allowlist is the security hard-line. Broader reach requires a dedicated threat-model review — see C14. |
| 16 | Private GitHub repos — absorb into 025 or split? | **Split (B).** 025 ships public-only. Follow-up scope (provisionally 026) adds encrypted PAT / GitHub App OAuth, per-company token scope, refresh, and revocation — keeps 025 shippable. |
| 17 | Cache TTL for imported URL content? | **No TTL — cache forever.** User manually refreshes via A11 ("Re-import"). Simpler than TTL and matches deliberate-seed mental model. Last-fetched timestamp is shown in UI (N10). |

### Session 2026-04-28

| # | Question | Decision |
|---|----------|----------|
| 18 | Should the per-project "Project Overview" `ReportLinkCard` on the dashboard panels open the same AI editor used for proposals (Edit if exists, Create if not)? | **Yes — FR-016.** Card click invokes A12 (`/api/overview/draft-by-project/:projectid`) which returns or backfills an `overviewdrafts` row scoped to the project. Client navigates to `/overview/:draftId`. Editor surface is identical to the proposal flow; only the terminal action differs (FR-017). |
| 19 | When does the project's `ProjectOverview.md` get materialized to disk — every autosave, on Save, or on Done editing? | **Done editing only.** Per-keystroke autosave keeps `overviewdrafts.content` current; "Done editing" (FR-017 / A13) is the explicit promotion event that upserts `projectdocuments`. Server does not write to disk on the project-mode path; the kit pulls on workspace open (FR-018). Rationale: clean commit semantics; avoids autosave thrash to disk; works in both App Runner prod and local dev. |
| 20 | How does the editor write to the user's project directory across hosting boundaries (App Runner can't see the user's local FS)? | **Kit pull-on-open, not server push.** The wxKanban server only updates the DB. The kit (running locally in VS Code) compares local `ProjectOverview.md` against DB metadata on workspace activation (A14) and prompts the user to pull (FR-018). This sidesteps the cross-host file-write problem and respects local edits via Pull / Keep local / View diff. Server-side disk write is reserved for the legacy "wxKanban server's CWD == project workspace" dogfooding case (N5). |
| 21 | What sync state does the kit need? Timestamp, content hash, or both? | **Both.** `.wxkanban-project.json` gains `projectoverviewlastsyncedat` (timestamp from last DB pull) and `projectoverviewsha` (sha256 of content at last pull). The prompt fires when `db.updatedat > projectoverviewlastsyncedat` AND `db.contenthash != projectoverviewsha`. The hash detects local divergence and lets us warn before overwrite (FR-018 AC); the timestamp suppresses no-op prompts (where DB and local are equal). See N11. |
| 22 | Where does FR-018 live in code — wxKanban server or kit? | **Kit (`mcp-server/`).** wxKanban exposes only the metadata + content endpoints (A14 / A15). The MCP server / agent CLI owns the prompt UX and the file write. This keeps the cross-host file-write story local to the host that has filesystem access. Implementation can be split as a follow-up sub-scope of 019 (Agent Orchestrator Kit) once 025's server-side endpoints land. |

---

## Implementation Audit Trail

- **Scope scaffolded**: 2026-04-23 via `npx tsx wxkanban-agent/apps/command-gateway/src/cli.ts buildscope --featureDescription "Project Overview Builder" --quick --user andy@wxperts.com` (orchestrator audit record persisted).
- **Interactive BA review**: Performed in Claude Code session prior to orchestrator invocation; six sections approved section-by-section by andy@wxperts.com per the `/buildscope` methodology.
- **Known kit gap surfaced during this scope**: `setup-mcp.mjs` did not run the R16 project-identity check when MCP was already up (AC1 covers the "MCP down" path only). Cross-project misbinding was detected manually; to be filed as a follow-up bug against spec 019.


## Phase

**Current Phase**: design
**Priority**: high

## Status

- **Date**: 2026-07-22
- **Phase**: design
- **Recent change (2026-07-22)**: Added Amendment C + FR-021 (Interview Continuity & Resilient Section-Write) — diagnoses the field-reported "sections walked through but not written / interview restarts at Problem" defect as a coupling of the FR-020 bounded window with a fence-and-approve-only, no-server-fallback write path; mandates a window-independent interview-state preamble, a larger window default (≥28), and server-side section-proposal detection as a safety net.
- **Recent change (2026-04-28)**: Added FR-016 / FR-017 (project-mode editing from dashboard `ReportLinkCard`), FR-018 (kit pull-on-open sync), API endpoints A12–A15, constraints C19–C20, notes N11–N12, and Clarifications session 2026-04-28 (Q18–Q22).
