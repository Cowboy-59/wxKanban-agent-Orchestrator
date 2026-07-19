---
name: wxUIUXCodeReview
description: Combined code review and UI/UX design review for wxKanban-style full-stack apps (TypeScript/JavaScript, React + TailwindCSS + shadcn/ui, PostgreSQL or MSSQL, REST APIs, MCP/server tools, AWS-adjacent ops). This skill should be used when reviewing diffs, pull requests, migrations, refactors, bug fixes, risky changes, or frontend screens/flows before merge — covering correctness, security, data integrity, performance, maintainability, and tests on the code side, and accessibility, responsive layout, visual consistency, interaction, states, theming, and localization on the UI/UX side. Advisory: it reports findings, it does not rewrite the patch or redesign the UI.
---

# wxUIUXCodeReview

This skill performs a combined **code review** and **UI/UX design review** for a
wxKanban-style project: TypeScript/JavaScript services, a React 18 + TailwindCSS +
shadcn/ui frontend, PostgreSQL or MSSQL, REST APIs, MCP/server tools, and
AWS-adjacent operational concerns.

It has two tracks:
- **Track A — Code review**: correctness, security, data integrity, performance, maintainability, tests.
- **Track B — UI/UX review**: accessibility, visual design, responsive layout, interaction, states, theming, localization.

Run the track(s) that match the change surface: code/backend files → Track A;
frontend `.tsx`/`.jsx`/`.css`/Tailwind/shadcn files → Track B; a change touching both →
both, and merge the findings into one severity-ordered list.

## When to use

Use this skill when the user asks to:
- review a pull request, diff, branch, or staged changes
- look for bugs, regressions, edge cases, or missing tests
- assess security, performance, or maintainability risk
- evaluate database migrations, SQL, auth, or API changes
- review a screen, component, or flow for design, accessibility, responsive, or UX quality
- check whether a change is safe to merge

Do not use this skill to implement the change or redesign directly without review.

## Review contract

The job is to review — not to approve blindly, not to rewrite the whole patch, and not
to redesign the UI.

Always:
1. Understand the stated intent of the change.
2. Inspect the changed files/screens and identify risk by layer (code) and category (UI/UX).
3. Report findings ordered by severity.
4. Explain why each finding matters (user or system impact).
5. Suggest the smallest practical fix.
6. Call out missing tests and residual/unverified risk.

Never:
- claim code is correct or UI is fine without inspecting the relevant files/screens
- invent requirements or design rules not supported by the prompt, diff, or repo conventions
- flood the review with style/taste nits when higher-risk issues exist
- merge, deploy, edit code, or restyle unless the user separately requests it

## Required inputs

Ask for missing context before reviewing if needed:
- diff, PR, changed files, or target branch comparison
- brief description of intended behavior
- for UI: which screen/flow and whether to review statically or walk the running app
- relevant acceptance criteria, issue, or spec if available
- repo conventions or architecture notes when they materially affect judgment

If no spec is provided, proceed with a best-effort review and clearly label uncertainty.

## UI/UX review mode (Track B)

**Static UI-code review (default).** Review changed `.tsx`/`.jsx`/`.css`/Tailwind
config and shadcn usage from source. Fast, needs no running app, works on any diff.

**Live browser walkthrough (on request or when the app is running).** Drive the app,
navigate the affected screens, capture a screenshot per screen/state, and critique the
rendered UI and interactions. Launch via the project `run` skill; the navigate-and-
screenshot loop mirrors `wxHelpGenerate`. Exercise each element's states (hover, focus,
active, disabled, loading, error, empty). State which mode was used; if a walkthrough
was requested but the app can't launch, fall back to static and say so.

## Review workflow

### 1. Establish intent
From the PR/commit/task/summary determine what changed, why, and whether it is a
feature, refactor, bug fix, migration, operational change, new screen, or restyle.
If intent is unclear, say so and reduce confidence.

### 2. Map the change surface
Classify touched files: UI/frontend rendering, API/request handling, domain logic,
persistence/SQL, auth/permissions, integrations/background jobs, infra/config/CI/CD/
AWS/Docker/secrets. Note which tracks apply. Prioritize depth for the riskiest areas
first: auth, data mutation, billing, exports, migrations, destructive jobs, public
endpoints (code); high-traffic screens, primary CTAs, forms, destructive actions (UI).

### 3. Review by risk category

#### Track A — Code

**Correctness** — broken control flow; missing null/undefined handling; wrong assumptions about ordering/state/concurrency; incomplete edge cases; incorrect conditionals/branching/data mapping.

**Security** — missing auth/authorization checks; SQL/command injection, unsafe string interpolation; insecure defaults, leaked secrets, permissive CORS, unsafe file access; trust of client-supplied identifiers or roles without server validation.

**Data integrity & database** — unsafe migrations; destructive schema changes without backfill/rollback; missing transactions where atomicity matters; N+1 queries, missing indexes, full-table scans on common paths; inconsistent handling across PostgreSQL and MSSQL if both are relevant.

**Performance** — repeated expensive renders; unnecessary network chatter; heavy work on hot paths; unbounded retries/loops/concurrency/queue growth; expensive reporting queries without guardrails.

**Maintainability** — duplicated logic; hidden coupling; unclear naming; functions too large to reason about safely; weak controller/service/persistence boundaries.

**Tests** — missing regression tests for risky paths; tests that don't verify behavior strongly; happy-path-only coverage for failure-prone code.

#### Track B — UI/UX

**Accessibility (highest UI priority)** — semantic HTML/correct ARIA, landmarks, heading order; keyboard operability (focus order, visible focus ring, no traps, Esc closes overlays); labels for every input, errors associated with fields, `aria-live` for async feedback; WCAG AA contrast (4.5:1 text / 3:1 large & UI), never color-only signaling; alt/`aria-label` on meaningful images, decorative hidden from AT; real buttons/links, not click-handlers on `div`s.

**Visual design & consistency** — consistent spacing scale, type ramp, and color via Tailwind tokens (not ad-hoc hex/px); alignment, hierarchy, grouping match sibling screens; reuse existing shadcn components over bespoke re-implementations; consistent iconography, radius, shadow, density.

**Layout & responsive** — behavior across breakpoints (mobile → desktop); no horizontal overflow or clipped content; deliberate reflow/wrapping/truncation and min/max widths; long strings and large numbers don't break layout; touch targets ≥ ~44px.

**Interaction & UX** — obvious primary action; guarded, visually-distinct destructive actions; feedback on every action (optimistic update, toast, inline status); forms with sensible defaults, inline validation timing, disabled/submitting states, error recovery; navigation clarity (current location, back/cancel, no dead ends); purposeful motion respecting reduced-motion.

**States** — loading (skeleton/spinner), empty (helpful zero-state), error (actionable), success all designed; disabled vs. hidden decided deliberately; slow/partial-network handled.

**Theming (light/dark)** — both themes styled and legible; tokens drive theme, no hardcoded colors, no invisible text in either mode; follows shadcn theming (`_wxAI/rules/shadcn.md`).

**Internationalization** — user-facing strings from the i18n catalog, not hardcoded; layout tolerates longer translations (German/French expansion); no `notranslate`/clobber regressions; locale-aware date/number/currency.

### 4. wxKanban-specific checks

**Code/workflow** — board/lane/card permission boundaries; move operations and ordering consistency; WIP-limit enforcement; blocked-state handling; archived/soft-deleted behavior; filter/search/reporting consistency; event/webhook side effects after updates; optimistic UI vs. server truth conflicts; auditability for admin/workflow changes.

**UI** — board/lane/card layout at high card counts and long titles; drag-and-drop affordance, drop targets, keyboard-accessible reordering; WIP-limit visual cues (not color-only); blocked/archived/deleted states clearly indicated; discoverable filter/search controls with clear results/empty states; dense data tables (alignment, sticky headers, responsive collapse, row actions); dialogs/sheets/toasts (focus trap, scroll lock, dismissal, stacking).

### 5. MCP / integration and shadcn tooling (when relevant)
For agent/MCP changes: schema validation for tool inputs/outputs; timeout and retry
limits; tool invocation permissions/scope; partial-failure behavior; logging of
sensitive payloads; deterministic behavior and fallback handling.
For bespoke UI elements: consult the shadcn-ui MCP (list/get components, blocks, demos)
and `_wxAI/rules/shadcn.md` to recommend the canonical component/variant.

### 6. Classify severity
Use exactly these labels:
- **must-fix**: likely bug, exploit, data loss, broken behavior, merge blocker (code); broken/unusable UI, WCAG-blocking a11y violation, unreadable content, action with no feedback, layout broken at a supported breakpoint (UI)
- **should-fix**: meaningful risk or quality issue to address before or soon after merge
- **nit**: low-risk readability/naming (code) or minor polish — spacing, alignment, wording (UI)

Elevate a11y and "user cannot complete the task" issues to must-fix. Only call
something must-fix when the risk/impact can be clearly explained.

### 7. Write findings first
Lead with findings, not praise. For each: severity, category, file:line (or screen/
breakpoint), concise title, why it matters, recommended fix. If there are none, say
what was checked and list residual risks / unverified areas.

## Output format

**Review summary**
- Scope: what was reviewed, which tracks ran, and (for UI) the mode used (static / browser walkthrough)
- Risk: low / medium / high
- Merge posture: block / merge-with-fixes / likely-safe

**Findings** — for each: `[severity] category — file:line or screen/breakpoint — title`
- Why it matters: one to three sentences (system or user impact)
- Recommended fix: one practical action (name the shadcn component/token/pattern when relevant)

**Missing tests** — absent/weak tests that would materially reduce risk.

**Residual risk / not exercised** — anything not verifiable from the diff alone; UI states, breakpoints, themes, or locales not covered.

## Review style

- Be direct, specific, and technically grounded — cite a concrete file/line, element, screen, or breakpoint.
- Prefer evidence and user/system impact over suspicion or taste; label subjective preferences as such.
- Do not pad with generic compliments. Do not say "looks good overall" if there are unresolved must-fix issues.
- Avoid broad rewrite/redesign advice unless the current shape is itself the risk.
- If a finding depends on a hidden repo convention, say so explicitly.

### Good findings

Code:
> `[must-fix] security — src/api/exportBoard.ts:42 — Missing ownership check on board export route`
> Why it matters: Any authenticated user who knows a boardId could export data from boards they do not own — an authorization flaw, not just input validation.
> Recommended fix: Verify the caller has read/export permission for the target board before generating the export.

UI/UX:
> `[must-fix] accessibility — Card edit dialog (CardEditDialog.tsx:88) — Close control is a clickable div with no keyboard/focus support`
> Why it matters: Keyboard and screen-reader users cannot dismiss the dialog, trapping them in the flow — a WCAG keyboard/operable failure.
> Recommended fix: Use the shadcn `Dialog`/`DialogClose` primitives (real `<button>`, focus trap, Esc-to-close).

Bad findings (too vague to act on): "This could maybe be cleaner." / "Consider refactoring." / "The spacing feels off." / "Improve the UX."

## Stop conditions

Stop and ask for clarification when:
- review against a base branch/commit is wanted but none was specified
- there is no diff, changed-file context, screen, or running app to inspect
- a live UI walkthrough was requested but the app cannot be launched and static-only was not intended
- the intended behavior or target screen/flow is too unclear to judge

Otherwise proceed with a best-effort review and state assumptions.
