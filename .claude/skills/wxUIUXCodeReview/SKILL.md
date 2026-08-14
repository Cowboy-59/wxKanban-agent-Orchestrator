---
name: wxUIUXCodeReview
description: Combined code review and UI/UX design review for any stack the project declares in stack.md (web, desktop, or mobile — TypeScript/React/Tailwind, .NET/C#/XAML, and others). Use when reviewing diffs, pull requests, migrations, refactors, bug fixes, risky changes, or frontend screens/flows before merge, or when auditing a whole codebase surface by surface with --audit. Covers correctness, security, data integrity, performance, maintainability, wiring/reachability, tests and test validity, and claim-vs-code on the code side; accessibility, layout and sizing, visual consistency, interaction, states, first-run defaults, theming, and localization on the UI/UX side. Findings are de-duplicated into cross-cutting causes and tagged with provenance. Advisory: it reports findings, it does not rewrite the patch or redesign the UI.
---

# wxUIUXCodeReview

Combined **code review** and **UI/UX design review**. The project's stack is whatever `stack.md`
declares (see below) — do not assume wxKanban's own Express / React / Postgres / Tailwind defaults.

Two tracks:
- **Track A — Code**: correctness, security, data integrity, performance, maintainability, wiring, tests, test validity, claim-vs-code.
- **Track B — UI/UX**: accessibility, visual design, layout, interaction, states, defaults & first-run, theming, i18n.

Run the track(s) that match the surface: code/backend files → Track A; user-interface files → Track B;
a change touching both → both, merged into one severity-ordered list.

> This skill is the local fallback for the `/wxUIUXCodeReview` command. When the wxKanban MCP is
> reachable, the server-delivered prompt (`project.get_command_prompt`, key `wxuiuxcodereview`) is
> canonical and carries the same methodology.

## When to use

- review a pull request, diff, branch, or staged changes
- look for bugs, regressions, edge cases, missing or invalid tests
- assess security, performance, or maintainability risk
- evaluate database migrations, SQL, auth, or API changes
- review a screen, component, or flow for design, accessibility, layout, or UX quality
- audit a whole codebase surface by surface (`--audit`)
- check whether a change is safe to merge

Do not use this skill to implement the change or redesign directly without review.

## Stack & Style targeting (SPEC-056)

**Before reviewing anything, read `stack.md` at the repo root if it exists.** When present, review
against the project's captured stack and design/CSS style — backend language/framework, frontend
framework, database, styling/component library, testing framework, hosting/deploy target, and the
design tokens (colors, typography, spacing/radius) — **not** wxKanban's own Express/React/Postgres/
Tailwind defaults. Every checklist item below is a stack-neutral question; the concrete constructs you
cite must come from the stack actually in use.

If `stack.md` does **not** exist, proceed exactly as today — no change in behavior, and never emit a
placeholder or block on the missing file. `stack.md` is materialized from the project's Stack & Style
document by the kit; do not hand-edit it here — use `/buildstack` to change it.

### Supplement the declared stack by reading the repo

`stack.md` records *what was chosen*. Reviewing also needs *where it is wired* and *what stands in for
it under test* — neither of which a stack document can carry. Before the first finding, establish from
the code:

- **Wiring points** — the dependency-injection / service-registration site, the design-token file, the
  localization catalog, and how screens/components are registered, navigated to, and torn down. These
  are the search origins for the wiring dimension.
- **Test substitutes** — what the tests put in place of the real database, engine, clock, or network,
  and **which constraints that substitute cannot enforce**. An in-memory database with no foreign keys
  or column widths cannot honor a test asserting "the database rejects this".
- **Accessibility affordance mechanism** — ARIA, platform automation properties, or other.

**Stack drift is itself a finding.** Code that contradicts the declared `stack.md` gets reported:
`[severity] stack-drift — file:line — stack.md declares X; code uses Y`.

**Generic fallback.** With no `stack.md` and no recognizable idiom, review the dimensions that remain
evaluable, and state explicitly which could not be assessed and why. Never silently skip a dimension.

### Adapter — .NET / C# / WPF / EF Core (desktop)

SPEC-056 says review against the declared stack; the checklists below are worded for the web (ARIA,
breakpoints, CSS tokens, routes). On a WPF desktop target every dimension still applies, but the
construct you cite changes. Verified across an 18-surface audit of a WPF/EF Core rebuild, 2026-08-11.

**Where the wiring lives.** `App.xaml.cs` `BuildServices` is the composition root and the authoritative
capability list; `RegisterWindows` is the navigation graph. Design tokens are a `ResourceDictionary`
(`Themes/Tokens.xaml`), not CSS custom properties. The localization catalog is `.resx` per culture,
not a JSON catalog. Screens are `Window` subclasses registered per ViewModel type, not routes.

**Dimension translation:**

| Dimension | Web construct | WPF construct |
|---|---|---|
| Accessible name | `<label for>`, `aria-label` | `AutomationProperties.Name` / `.LabeledBy`. A sibling `TextBlock` is **not** an association — screen readers get an unnamed field. |
| Initial focus | autofocus / focus management | `FocusManager.FocusedElement`. `grep -c FocusManager` over the views is a one-command first-run audit. |
| Layout range | breakpoints | `Window` default size, `MinWidth`/`MinHeight`, `ResizeMode`, `SizeToContent`, and OS display scaling. |
| Overflow | `overflow`, media queries | `ItemsControl` has **no** scrolling of its own; `Button.Content` bound to a string does **not** wrap. Both silently clip. |
| Theming | CSS variables | `StaticResource` vs `DynamicResource` — `StaticResource` resolves once, so a product claiming runtime theme switching needs `DynamicResource`. |
| i18n | catalog + interpolation | `.resx`; and note WPF's `FrameworkElement.Language` defaults to `en-US` **independently of `CurrentCulture`**, so `StringFormat=d` renders US dates in an otherwise-Italian app unless overridden. |
| Async status | `aria-live` | no equivalent; a busy flag bound to nothing announces nothing. |

**Stack-specific checks worth making every time** — each of these produced a real finding here:

- **Is the busy flag bound?** `grep -l IsBusy ViewModels/` against `grep IsBusy Views/*.xaml`. Found 26 ViewModels declaring it and **zero** XAML bindings — every screen inert during async work, with the primary button still enabled and re-entrant.
- **Do singleton ViewModels get re-navigated?** A navigation service that reuses an open window must still call `OnNavigatedTo` with the new parameter. Reusing without re-navigating means the window shows the *previous* record while the caller believes it navigated — here it let a stopwatch bill time to the wrong customer.
- **Does the EF model match the shipped schema?** Compare `DbSet` count to the schema's table count and entity properties to its columns. A checked-in `.sql` with no migrations drifts silently; here it was 53 tables against 55, and the app could not start on its own schema.
- **Are global query filters actually activated?** A filter that reads context state is inert unless something sets that state. Search for production callers of the setter, not just its definition.
- **Is authorization uniform?** `grep -c "Demand"` (or the project's equivalent) per service. An inverted profile — reference tables gated, core business entities not — is the finding, and it is invisible file by file.
- **Column widths.** Silent `Truncate(value, n)` before a uniqueness check, or truncation that removes a file extension, are data defects that read as defensive code.

**Live walkthrough on WPF.** The default static mode is correct and cheap. When a walkthrough is
requested, the driver is **UI Automation** (`System.Windows.Automation`) plus `PrintWindow` for
pixels — not Playwright. Full recipe and the five pitfalls that cost real time (inner `TextBlock`
shadowing the `Button` on `FindFirst` by name; `GetCurrentPattern` constant resolution; `PasswordBox`
having no writable `ValuePattern`; `CopyFromScreen` capturing the wrong window; needing to wait on
the window rather than sleep) are documented in
`_wxAI/skills/wxCreateTestPlan/adapters/dotnet-wpf.md` § *WPF walkthrough recipe*. Do not duplicate
them here — follow that section.

What the walkthrough adds over static review, concretely: rendered contrast, real focus, actual
control geometry (a `UniformGrid` allocating 37px rows to 44px buttons overlaps them — visible only
when rendered), truncated `DataGrid` headers, and startup timing. Four must-fix findings here were
reachable no other way.

**Test substitutes on this stack.** EF Core's InMemory provider enforces no foreign keys, `varchar`
lengths, unique indexes or cascades — so any test asserting "the database rejects this" against it
cannot fail. Check whether a real-engine tier exists and whether it **skips silently** when the
engine is unreachable. Under `test-validity`, also check xUnit's per-class parallelism against any
test mutating process-wide culture or environment without a `finally`.

## Review contract

The job is to review — not to approve blindly, not to rewrite the whole patch, and not to redesign the
UI.

Always:
1. Understand the stated intent of the change (or, for `--audit`, what the surface is meant to do).
2. Inspect the changed files/screens and identify risk by layer and dimension.
3. Collapse repeated symptoms into their cross-cutting cause.
4. Report findings ordered by severity, tagged with provenance.
5. Explain why each finding matters (user or system impact).
6. Suggest the smallest practical fix.
7. Call out weak or invalid tests and residual/unverified risk.

Never:
- claim code is correct or UI is fine without inspecting the relevant files/screens
- invent requirements or design rules not supported by the prompt, diff, or repo conventions
- flood the review with style/taste nits when higher-risk issues exist
- merge, deploy, edit code, or restyle unless the user separately requests it

**Evidence rule — applies to every dimension.** A finding that names no concrete construct from this
repo is not a finding. Cite the file:line and the actual symbol, attribute, route, or resource key you
found.

## Required inputs

Ask for missing context before reviewing if needed:
- diff, PR, changed files, or target branch comparison — or, for `--audit`, the surface list
- brief description of intended behavior
- for UI: which screen/flow, and whether to review statically or walk the running app
- relevant acceptance criteria, issue, or spec if available
- repo conventions or architecture notes when they materially affect judgment

If no spec is provided, proceed with a best-effort review and clearly label uncertainty.

## Modes

**Diff / PR review (default).** Scoped to a change: a diff, PR, branch comparison, or the current
working tree.

**Audit mode (`--audit`).** A whole-codebase or whole-surface sweep with no diff. Surfaces come from an
explicit list or are enumerated from the repo. Work **one surface at a time**, and after each offer
`[Yes]` to continue or `[Save]` to stop. Persist progress to `.review-progress.json` after each
completed surface, mirroring the `.scope-progress.json` shape used by `wxConversionScope`:

```json
{
  "target": "<repo or subsystem>",
  "createdAt": "<ISO>", "lastSaved": "<ISO>", "currentIndex": 0,
  "queue": [ { "id": "ClientsScreen", "source": "src/views/Clients", "status": "pending|in-progress|done", "findings": 0 } ]
}
```

On resume, continue at the first non-`done` item. **Never report a partial sweep as complete** — if the
queue holds non-`done` items, the summary must say how many surfaces were covered out of how many.

### Dimension scope by invocation — read this before reviewing

Three of the cross-stack dimensions are **not diff-bounded**: wiring needs repo-wide caller searches,
test-validity needs the test suite, and both need the idiom-discovery supplement above. They also
surface mostly **pre-existing** findings, which would reprint on every automated run until somebody
fixes them — the fastest way to teach a team to skim past a review.

So the dimension set depends on how you were invoked:

| Invoked | Dimensions |
|---|---|
| **Auto-run** by another command (e.g. `implement` Phase 4), which will say so | The diff-bounded set: correctness, security, data integrity, performance, maintainability, tests, stack-drift, and all of Track B **except** defaults & first-run. **Skip** the idiom-discovery supplement. |
| **Explicitly** (`/wxUIUXCodeReview`, with or without a target) or **`--audit`** | Everything, including wiring, test-validity, claim-vs-code, and defaults & first-run. |

Provenance tagging, cross-cutting-cause collapsing, and the verified-and-sound section are cheap and
apply in **both** cases.

On an auto-run, if something in the diff looks like a wiring or test-validity problem, you may note it
in one line under residual risk — but do not run the repo-wide searches. Say that a full
`/wxUIUXCodeReview` would confirm it.

**UI/UX review mode (Track B).** Default to a **static UI-code review** from source — fast, needs no
running app, works on any diff. Do a **live walkthrough** (drive the app, navigate the affected
screens, capture each screen/state, exercise hover/focus/active/disabled/loading/error/empty, critique
the rendered UI and interactions — launch via the project `run` skill; the navigate-and-capture loop
mirrors `wxHelpGenerate`) only when asked or when the app is already running. State which mode was
used; if a walkthrough was requested but the app can't launch, fall back to static and say so.

## Review workflow

### 1. Establish intent
From the PR/commit/task/summary determine what changed, why, and the change type: feature, refactor,
bug fix, migration, operational change, new screen, or restyle. If intent is unclear, say so and reduce
confidence.

### 2. Read the stack, then map the surface
Apply SPEC-056 above. Then classify touched files: UI/frontend rendering, API/request handling, domain
logic, persistence/SQL, auth/permissions, integrations/background jobs, infra/config/CI/CD/secrets.
Note which tracks apply. Prioritize depth for the riskiest areas first: auth, data mutation, billing,
exports, migrations, destructive jobs, public endpoints (code); high-traffic screens, primary CTAs,
forms, destructive actions (UI).

### 3. Review by dimension

#### Track A — Code

**Correctness** — broken control flow; missing null/undefined handling; wrong assumptions about ordering/state/concurrency; incomplete edge cases; incorrect conditionals/branching/data mapping.

**Security** — missing auth/authorization checks; injection and unsafe string interpolation; insecure defaults, leaked secrets, permissive CORS, unsafe file access; trust of client-supplied identifiers or roles without server validation.

**Data integrity & database** — unsafe migrations; destructive schema changes without backfill/rollback; missing transactions where atomicity matters; N+1 queries, missing indexes on filter/join/sort columns, full-table scans; non-sargable predicates; multi-tenant or row-scoping predicates that do not cover every table they claim to.

**Performance** — repeated expensive renders/rebuilds; unnecessary network chatter; heavy work on hot paths; unbounded retries/loops/concurrency/queue growth; reporting queries with no row cap.

**Maintainability** — duplicated logic; hidden coupling; unclear naming; functions too large to reason about safely; weak controller/service/persistence boundaries.

**Wiring / reachability** — see §4.

**Tests** — missing regression tests for risky paths; tests that don't verify behavior strongly; happy-path-only coverage for failure-prone code.

**Test-suite validity** — see §4.

**Claim-vs-code** — see §4.

#### Track B — UI/UX

**Accessibility (highest UI priority)** — semantic structure and correct roles; keyboard operability (initial focus on open, tab order, visible focus, no traps, Esc/cancel closes overlays); every input programmatically labeled and errors associated with their field; async status announced; WCAG AA contrast (4.5:1 text / 3:1 large & UI), never colour-only signalling; meaningful images described, decorative ones hidden; real interactive controls, not click handlers on inert containers.

**Visual design & consistency** — spacing, type and colour drawn from the project's tokens, not ad-hoc literals; alignment, hierarchy and grouping consistent with sibling screens; reuse the project's component library over bespoke re-implementations; consistent iconography, radius, shadow, density.

**Layout & sizing** — behavior across the target's size range (breakpoints on web; window minimums, resizability and OS display scaling on desktop); no overflow, clipping, or controls pushed outside the visible area; deliberate reflow/wrapping/truncation; long strings and large numbers don't break layout; touch targets ≥ ~44px where touch is a target.

**Interaction & UX** — obvious primary action; guarded, visually distinct destructive actions; feedback on every action; forms with sensible defaults, inline validation timing, submitting/disabled states, error recovery; unsaved-work protection on close/navigate-away; navigation clarity (current location, back/cancel, no dead ends); purposeful motion respecting reduced-motion.

**States** — loading, empty, error, success all designed; success visually distinguishable from failure (not the same neutral slot carrying both); error text rendered where the user is looking, not below the fold; disabled vs. hidden decided deliberately; slow/partial-network handled.

**Defaults & first-run state** — see §4.

**Theming** — every supported theme legible; tokens drive theming and are referenced in a way that permits runtime theme change if the product claims one; no hardcoded colours, no invisible text in any theme.

**Internationalization** — user-facing strings from the catalog, not hardcoded; no sentences assembled by concatenation (word order is not universal); layout tolerates longer translations; locale-aware date/number/currency; catalog parity across languages.

### 4. The four cross-stack dimensions

These find what per-file review cannot. **Explicit and `--audit` invocations only** — skip this whole
step on an auto-run, per *Dimension scope by invocation* above.

**Wiring / reachability.** For each declared capability, is there a *production* consumer?
- registered in DI/config and never resolved · issued and never read · computed and never displayed
- a bindable property nothing binds to · a resource or string key never referenced
- a method, filter, rule or service whose only callers are tests
- a screen or command registered and unreachable from any navigation path

Evidence: cite the declaration site *and* state the search you ran that found no production caller.
This class outranks most others — a security control that is never invoked is not a partial control,
it is an absent one, and the code will usually claim otherwise.

**Test-suite validity.** Do the tests constrain production, or only themselves?
- tests that register configuration production does not register
- assertions against a fake the test itself installed
- a test that encodes a known defect as its expected result
- vacuous passes — empty iteration, does-not-throw as the only assertion, tautological comparisons
- a substitute engine that **cannot enforce the constraint under test**
- global process state (culture, environment, clock, shared fixture names) set and never restored

Report under `test-validity`, distinct from `tests` (which is absent coverage).

**Claim-vs-code.** Comments, doc-strings, and spec text that assert a behavior are load-bearing —
verify the assertion against the code it describes. Report as
`[severity] claim — file:line — comment asserts X; code does Y`. A false claim about a safety property
is at least should-fix: it is why nobody re-checked.

**Defaults & first-run state.** What the surface shows *before the user touches anything*: default
filters and date ranges, preselection, remembered choices, initial focus, sort order, proposed period.
Losing a default removes no feature and breaks no test, so nothing else catches it — but it decides
whether the screen opens ready to work.

### 5. Project-specific checks (when the project is wxKanban or kanban-shaped)

**Code/workflow** — board/lane/card permission boundaries; move operations and ordering consistency; WIP-limit enforcement; blocked-state handling; archived/soft-deleted behavior; filter/search/reporting consistency; event/webhook side effects after updates; optimistic UI vs. server truth conflicts; auditability for admin/workflow changes.

**UI** — board/lane/card layout at high card counts and long titles; drag-and-drop affordance, drop targets, keyboard-accessible reordering; WIP-limit visual cues (not colour-only); blocked/archived/deleted states clearly indicated; discoverable filter/search controls with clear results/empty states; dense data tables (alignment, sticky headers, responsive collapse, row actions); dialogs/sheets/toasts (focus trap, scroll lock, dismissal, stacking).

### 6. Integration tooling (when relevant)
For agent/MCP changes: schema validation for tool inputs/outputs; timeout and retry limits; tool
invocation permissions/scope; partial-failure behavior; logging of sensitive payloads; deterministic
behavior and fallback handling. For bespoke UI where the project uses shadcn/ui, consult the shadcn-ui
MCP and `_wxAI/rules/shadcn.md` to recommend the canonical component/variant.

### 7. Collapse into cross-cutting causes
Before writing anything up, group repeated symptoms by their shared cause. Emit each as `C-1 … C-n`
with a one-line statement, the fan-out count, and the surfaces it explains. Individual findings then
**reference `C-n` instead of restating it**. Fixing a cause should visibly close its downstream
symptoms — that is what makes the list actionable at scale.

### 8. Classify severity and provenance

Severity — use exactly these labels:
- **must-fix**: likely bug, exploit, data loss, broken behavior, merge blocker (code); broken/unusable UI, WCAG-blocking a11y violation, unreadable content, action with no feedback, layout broken at a supported size (UI)
- **should-fix**: meaningful risk or quality issue to address before or soon after merge
- **nit**: low-risk readability/naming (code) or minor polish — spacing, alignment, wording (UI)

Elevate a11y and "user cannot complete the task" issues to must-fix. Only call something must-fix when
the risk/impact can be clearly explained.

Provenance — separate from severity, because it changes *ownership*, not urgency:
- **new** — introduced by the change under review
- **pre-existing** — already in the codebase before this change
- **inherited** — carried over from a source system (only when a source system is known)

Never let provenance soften severity: a pre-existing data-loss defect is still must-fix. It just isn't
this author's regression.

### 9. Write findings first
Lead with findings, not praise. For each: severity, category, file:line (or screen/state), concise
title, provenance, why it matters, recommended fix. If there are none, say what was checked and list
residual risks / unverified areas.

## Output format

**Review summary**
- Scope: what was reviewed, which tracks ran, the mode (diff / `--audit`), and for UI, static vs. walkthrough
- Stack: what `stack.md` declared, or that no `stack.md` was found
- Coverage: for `--audit`, surfaces completed out of total — **say so plainly if the sweep is partial**
- Risk: low / medium / high
- Merge posture: block / merge-with-fixes / likely-safe

**Cross-cutting causes** — `C-n` · statement · fan-out count · surfaces affected. Omit if none.

**Findings** — for each: `[severity] category — file:line or screen/state — title`
- Provenance: new / pre-existing / inherited (and `→ C-n` when it belongs to a cause)
- Why it matters: one to three sentences (system or user impact)
- Recommended fix: one practical action, naming the construct/token/component from *this* stack

**Per-surface table** (`--audit` only) — surface × must-fix / should-fix / nit / total.

**Weak or missing tests** — absent coverage, plus any test that does not constrain production.

**Verified and sound** — what you actually checked and found correct, each naming the check performed.
"No concatenated SQL — all access goes through parameterised queries, verified across `Data/*`"
qualifies. "Looks good overall" does not. This is coverage evidence, not praise: it tells the next
reviewer what they need not redo.

**Residual risk / not exercised** — anything not verifiable from the material reviewed; states, sizes,
themes, or locales not covered.

## Review style

- Be direct, specific, and technically grounded — cite a concrete file/line, element, screen, or state.
- Prefer evidence and user/system impact over suspicion or taste; label subjective preferences as such.
- Do not pad with generic compliments. Do not say "looks good overall" if there are unresolved must-fix issues.
- Avoid broad rewrite/redesign advice unless the current shape is itself the risk.
- If a finding depends on a hidden repo convention, say so explicitly.

### Good findings

> `[must-fix] security — src/api/exportBoard.ts:42 — Missing ownership check on board export route`
> Provenance: new
> Why it matters: Any authenticated user who knows a boardId could export data from boards they do not own — an authorization flaw, not just input validation.
> Recommended fix: Verify the caller has read/export permission for the target board before generating the export.

> `[must-fix] wiring — Data/DataServiceCollectionExtensions.cs:31 — Tenant row filter is registered but never activated in production`
> Provenance: pre-existing → C-1
> Why it matters: `UseCurrentUser(...)` is called only from three test files, so the current-company id is always null and every global row filter degrades to "see everything". The protection exists on paper and the suite is green.
> Recommended fix: Call it from the factory the application registers, and add one test that resolves the factory the way production does.

> `[should-fix] test-validity — Tests/Lookups/LookupServiceTests.cs:227 — Test asserts the database rejects a value on an engine with no constraints`
> Provenance: pre-existing
> Why it matters: The in-memory provider enforces no foreign keys or column widths, so this passes regardless of whether the real schema would reject it — the assertion cannot fail.
> Recommended fix: Move this case to an integration test against the real engine, or assert the service-level guard instead.

> `[must-fix] accessibility — Card edit dialog (CardEditDialog.tsx:88) — Close control is a clickable div with no keyboard/focus support`
> Provenance: new
> Why it matters: Keyboard and screen-reader users cannot dismiss the dialog, trapping them in the flow — a WCAG keyboard/operable failure.
> Recommended fix: Use the project's dialog primitives (real button, focus trap, Esc-to-close).

Bad findings (too vague to act on): "This could maybe be cleaner." / "Consider refactoring." / "The spacing feels off." / "Improve the UX."

## Stop conditions

Stop and ask for clarification when:
- review against a base branch/commit is wanted but none was specified
- there is no diff, changed-file context, screen, surface list, or running app to inspect
- a live UI walkthrough was requested but the app cannot be launched and static-only was not intended
- the intended behavior or target screen/flow is too unclear to judge

Otherwise proceed with a best-effort review and state assumptions.
