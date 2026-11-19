# Spec 036: Kit Frontend Scaffolding — Tailwind v4 + shadcn/ui Defaults

## Overview

**Spec Number**: 036
**Status**: `released`
**Created**: 2026-05-23
**Released**: 2026-05-23 (wxkanban-agent v0.8.0)
**Depends On**: 019-agent-orchestrator-kit (CLI surface), 026-CodeFencing (fenced file output), 027-KitRuntimeHygiene (consumer-root discovery patterns)
**Source**: in-conversation buildscope, 2026-05-23

---

## Overview

The wxkanban-agent kit declares Tailwind CSS v4 and `@shadcn/ui` as dependencies in consumer projects' `package.json`, but ships **none of the configuration or component files needed to actually use them**. A fresh consumer project today has:

- The deps in `node_modules` (`tailwindcss`, `@tailwindcss/postcss`, `autoprefixer`, `@shadcn/ui`).
- No `tailwind.config.ts`.
- No `postcss.config.js`.
- No `components.json` (shadcn registry).
- No `src/components/ui/` primitives.
- No global CSS file wiring Tailwind directives.
- No `cn()` utility / `lib/utils.ts`.

The result: consumers — the smart career-changers the kit targets — hit a wall the moment they try to render anything. They must know to run `npx shadcn@latest init`, hand-author Tailwind configs, and pick base primitives before they can build the educational UI work the kit is supposed to teach.

This spec ships those scaffolding files as **kit templates** that a new `wxkanban-agent scaffold:frontend` command copies into the consumer project when missing, plus a working dark-mode toggle and a starter resource-calendar primitive — so the frontend stack is usable out of the box.

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actors** | The kit's `scaffold:frontend` CLI command; the consumer developer who runs it in a fresh project. |
| **Key Value** | One command produces a working Tailwind v4 + shadcn/ui foundation — configs, base primitives, CSS wiring, the `cn()` helper, a dark-mode toggle, a resource-calendar — with no shadcn-init lore required. Reinforces the kit's educational mission by giving learners a working starter, not a checklist of missing pieces. |
| **Scope Boundary (IN)** | Tailwind v4 config template; PostCSS config template; `components.json` registry template; `src/styles/globals.css` with Tailwind directives + shadcn CSS variables; `src/lib/utils.ts` with `cn()`; 11 stock shadcn primitives (button, card, input, label, dialog, dropdown-menu, table, form, select, toast, calendar); a Tailwind-styled `ResourceCalendar` wrapping `react-big-calendar`; a `<ThemeProvider>` + `<ModeToggle>` pair for dark mode; a dedicated `wxkanban-agent scaffold:frontend` command with `--dry-run` / `--force` / `--yes`; idempotent re-runs; consumer `CLAUDE.md` note; code fencing per spec 026; Pino logging. |
| **Scope Boundary (OUT)** | Non-standard consumer layouts (`src/client/`, `app/`, monorepo workspaces); a full design system beyond shadcn defaults; Storybook; icon sets beyond `lucide-react`; form schema generators; the AdminDashboard / lifecycle UI itself; an `upgrade` subcommand that re-pulls templates; cross-platform line-ending normalization. |

---

## Functional Requirements

### Path conventions

Files land in the **consumer** project at these standard shadcn locations. Kit templates live at `wxkanban-agent/templates/frontend/` mirroring this tree.

| Kind | Consumer path |
| --- | --- |
| Tailwind config | `<root>/tailwind.config.ts` |
| PostCSS config | `<root>/postcss.config.js` |
| shadcn registry | `<root>/components.json` |
| Global CSS | `<root>/src/styles/globals.css` |
| `cn()` util | `<root>/src/lib/utils.ts` |
| UI primitives | `<root>/src/components/ui/<name>.tsx` |
| Resource calendar | `<root>/src/components/ui/resource-calendar.tsx` |
| Theme provider | `<root>/src/components/theme-provider.tsx` |
| Mode toggle | `<root>/src/components/mode-toggle.tsx` |

### FR-001 — Tailwind v4 config template
Ships `tailwind.config.ts` configured for Tailwind v4: `content: ['./src/**/*.{ts,tsx}', './index.html']`, dark mode via `class`, empty `theme.extend` ready for consumer customization. No plugins beyond what shadcn requires.

### FR-002 — PostCSS config template
Ships `postcss.config.js` with `@tailwindcss/postcss` and `autoprefixer`. v4-shaped (single plugin, not the v3 `tailwindcss + autoprefixer` pair).

### FR-003 — Global CSS template (hybrid `@theme` + CSS variables)
Ships `src/styles/globals.css` containing:
- The Tailwind v4 `@import "tailwindcss";` directive.
- A `@theme` block with shadcn's default CSS variables (background, foreground, primary, secondary, muted, accent, destructive, border, input, ring) in HSL form for both `:root` and `.dark`.
- A base layer applying `bg-background text-foreground` to `body`.
- Inline comments explaining each block (educational mission).

### FR-004 — `components.json` registry template
Ships `components.json` configured for: TypeScript, React Server Components OFF (Vite/SPA per kit defaults), Tailwind v4 base color `slate`, CSS variables, alias paths matching FR-005 (`@/components`, `@/lib/utils`, `@/styles/globals.css`).

### FR-005 — `cn()` utility template
Ships `src/lib/utils.ts` exporting `cn(...inputs: ClassValue[])` built on `clsx` + `tailwind-merge`. Both deps added to consumer `package.json` by FR-009. File is fenced per spec 026.

### FR-006 — Stock shadcn primitives (11)
Ships 11 primitives in `src/components/ui/`, each generated from the official shadcn v4 registry and fenced per spec 026:

| File | Notes |
| --- | --- |
| `button.tsx` | Variants: default/destructive/outline/secondary/ghost/link; sizes: default/sm/lg/icon. |
| `card.tsx` | Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter. |
| `input.tsx` | Standard input. |
| `label.tsx` | Radix Label wrapped. |
| `dialog.tsx` | Radix Dialog wrapped. |
| `dropdown-menu.tsx` | Radix DropdownMenu wrapped (Menu, Trigger, Content, Item, Label, Separator). Required by the mode toggle. |
| `table.tsx` | Table, TableHeader, TableBody, TableRow, TableCell, TableHead, TableCaption. |
| `form.tsx` | react-hook-form + Radix integration (Form, FormField, FormItem, FormLabel, FormControl, FormMessage). |
| `select.tsx` | Radix Select wrapped. |
| `toast.tsx` | Radix Toast + `useToast` + `Toaster`. |
| `calendar.tsx` | react-day-picker wrapper (single-date picker). |

Each file is generated **once** at scaffold time and is the consumer's to own/edit thereafter; the kit does not re-overwrite.

### FR-007 — Resource calendar primitive
Ships `src/components/ui/resource-calendar.tsx`: a Tailwind-styled wrapper over `react-big-calendar` exposing a typed props surface:

```ts
type Resource = { id: string; title: string };
type Event = { id: string; resourceId: string; title: string; start: Date; end: Date };
type Props = {
  resources: Resource[];
  events: Event[];
  view?: 'day' | 'week';        // default 'week'
  onEventClick?: (e: Event) => void;
  onSlotClick?: (slot: { resourceId: string; start: Date; end: Date }) => void;
};
```

Implementation:
- `react-big-calendar` with `localizer` from `date-fns`.
- **Fully from-scratch Tailwind styling.** Does **not** import `react-big-calendar/lib/css/react-big-calendar.css`. All visual styling derives from Tailwind tokens defined in `globals.css` (FR-003), applied via `className` overrides or a co-located CSS file using `@apply`.
- `resourceIdAccessor` + `resourceTitleAccessor` wired through.
- Fenced per spec 026.

### FR-007a — Theme provider
Ships `src/components/theme-provider.tsx`: a React context provider managing `'light' | 'dark' | 'system'` mode.
- Reads/writes `localStorage` key `wxkanban-ui-theme`.
- Applies `dark` class to `<html>`.
- Listens to `prefers-color-scheme` reactively when in `system` mode.
- Exports `<ThemeProvider>` and `useTheme()` hook.
- Consumer wraps their app root.

### FR-007b — Mode toggle component
Ships `src/components/mode-toggle.tsx`: a `Button` + `DropdownMenu` combo using `lucide-react` `Sun` / `Moon` icons (animated crossfade), with menu items Light / Dark / System. Calls `useTheme().setTheme(mode)`. Drop-in usable in any header.

### FR-008 — Dedicated scaffold command
Adds a new CLI: `wxkanban-agent scaffold:frontend [--dry-run] [--force] [--yes]`.

Behavior:
1. Detects consumer project root via existing kit discovery (same mechanism as 027's `kit:status`).
2. For each template in `wxkanban-agent/templates/frontend/`, checks if the destination file exists.
3. By default: **skip existing files**, copy missing ones, print a per-file summary (`created` / `skipped` / `would create` in dry-run).
4. With `--force`: prompt to overwrite existing files. **Even with `--force`, prompts unless `--yes` is also passed.**
5. Adds required deps to consumer `package.json` (FR-009) and **prints** the install command rather than running it (avoids surprise network/lock-file changes).
6. Exit codes: `0` success (including all-skipped), `1` partial failure, `2` consumer root not detected, `3` invalid flag combination.

### FR-009 — Dependency additions
The scaffold command adds (and `--dry-run` reports) the following to consumer `dependencies`:

```
clsx, tailwind-merge, class-variance-authority,
@radix-ui/react-label, @radix-ui/react-dialog, @radix-ui/react-dropdown-menu,
@radix-ui/react-select, @radix-ui/react-toast, @radix-ui/react-slot,
react-hook-form, @hookform/resolvers, zod,
react-day-picker, date-fns,
react-big-calendar, @types/react-big-calendar,
lucide-react
```

Dev dependencies (added if not present): `tailwindcss@^4`, `@tailwindcss/postcss`, `autoprefixer`.

Versions are pinned in a kit-internal `wxkanban-agent/templates/frontend/deps.json` so future updates flow through a single file.

### FR-010 — Idempotency
Re-running `scaffold:frontend` on a project that already has all files is a no-op: every file reports `skipped`, exit `0`, **no `package.json` mutation** if all deps are present.

### FR-011 — Code fencing (spec 026 compliance)
Every `.tsx` and `.ts` file the command writes is emitted with a `[SCOPE 036 / T<task#>]` BEGIN/END fence. Config files (`tailwind.config.ts`, `postcss.config.js`) are fenced; JSON files (`components.json`) are exempt per spec 026 rule 5. `auditfences --strict` stays green after a scaffold run.

### FR-012 — Consumer CLAUDE.md note
The command appends a short section to the consumer's `CLAUDE.md` (or creates a stub if absent) documenting:
- Where UI primitives live (`src/components/ui/`).
- That primitives are consumer-owned after scaffold (kit won't overwrite).
- How to wire dark mode: *"Wrap your app root with `<ThemeProvider defaultTheme=\"system\" storageKey=\"wxkanban-ui-theme\">…</ThemeProvider>` and drop `<ModeToggle />` into any header."*
- How to add more shadcn components manually (`npx shadcn@latest add <name>`) while staying consistent with the kit's config.

Append is idempotent — guarded by a marker comment.

### FR-013 — Logging
All scaffold operations log via Pino at `info`:
`scaffold:frontend → created src/components/ui/button.tsx` / `skipped tailwind.config.ts (exists)` / `overwritten src/styles/globals.css`.
No `console.log` (per CLAUDE.md).

### FR-014 — Dry-run diagnostic output
`--dry-run` prints a table of every file the command *would* touch, every dep it *would* add, and the final exit code it *would* return. No filesystem writes, no `package.json` mutation. Mutually exclusive with `--force`.

### FR-015 — Failure isolation
A failure writing one file does not roll back already-written files (filesystem ops are not transactional in scope here). The command exits `1`, logs the failed path, and prints which files were already written so the consumer can either re-run (idempotency) or manually clean up.

---

## User Scenarios & Testing

### US1 — Fresh consumer project, happy path

**Actor**: A career-changer developer who just ran `wxkanban-agent init` in a new project and now wants to start building UI.

**Scenario**:
1. Developer runs `wxkanban-agent scaffold:frontend`.
2. Command detects project root, sees none of the target files exist.
3. Writes all 19 files: `tailwind.config.ts`, `postcss.config.js`, `components.json`, `src/styles/globals.css`, `src/lib/utils.ts`, 11 stock primitives in `src/components/ui/`, `resource-calendar.tsx`, `theme-provider.tsx`, `mode-toggle.tsx`.
4. Adds runtime + dev deps to `package.json`; prints `Run: npm install` to finish.
5. Appends a CLAUDE.md note describing the new files and the dark-mode wiring.
6. Logs each `created` line at `info`; exits `0`.

**Expected outcome**: 19 files written, `package.json` updated, install command printed. Developer runs `npm install`, then `npm run dev:client`, and can immediately import `Button`, `Card`, `ResourceCalendar`, `ThemeProvider`, `ModeToggle` from the scaffolded paths.

### US2 — Re-running on an already-scaffolded project (idempotency)

**Actor**: Same developer, runs the command a second time by reflex.

**Scenario**:
1. Command detects every target file already exists.
2. Logs `skipped` for each of the 19 files.
3. Inspects `package.json`; all required deps present.
4. No mutation. Exit `0`.

**Expected outcome**: Zero changes to disk, zero diff in `package.json`, exit `0`. Safe to script / put in a CI bootstrap.

### US3 — Partial scaffold (consumer has hand-rolled some files)

**Actor**: Developer who previously hand-authored `tailwind.config.ts` and a `button.tsx` but is missing the rest.

**Scenario**:
1. Command runs with defaults (no `--force`).
2. `tailwind.config.ts` → `skipped (exists)`.
3. `button.tsx` → `skipped (exists)`.
4. All other 16 files → `created`.
5. Missing deps added to `package.json`.
6. Exit `0`; summary line: `created=16 skipped=2`.

**Expected outcome**: Developer's existing work is preserved; only the gaps are filled.

### US4 — `--dry-run` preview

**Actor**: Developer (or CI script) wants to see what would happen first.

**Scenario**:
1. Runs `wxkanban-agent scaffold:frontend --dry-run`.
2. Command prints a table:

```
ACTION       PATH                                  REASON
would create tailwind.config.ts                    missing
would skip   src/components/ui/button.tsx          exists
would create src/components/ui/card.tsx            missing
...
PACKAGE.JSON DELTA
+ dependencies.clsx                                 ^2.x
+ dependencies.react-big-calendar                   ^1.x
EXIT CODE WOULD BE: 0
```

3. Filesystem and `package.json` untouched.

**Expected outcome**: Reviewable preview. Exit code mirrors what a real run would return.

### US5 — `--force` overwrite with always-on prompt

**Actor**: Developer who edited `globals.css`, regrets it, wants the kit defaults back.

**Scenario**:
1. Runs `wxkanban-agent scaffold:frontend --force`.
2. Command lists every file that would be overwritten and prompts: `Overwrite 3 existing files? [y/N]`.
3. On `y`: files are overwritten, logged as `overwritten`.
4. On `n` (or no TTY without `--yes`): exit `0`, nothing written, message `Aborted by user`.
5. `--force --yes`: auto-confirms; skips the prompt for scripted use.

**Expected outcome**: Destructive action is surfaced before it runs. `--yes` is the only way to bypass the prompt; bare `--yes` without `--force` is ignored.

### US6 — Consumer root not detected

**Actor**: Developer who runs the command from a random directory that isn't a kit-initialized project.

**Scenario**:
1. Command tries to discover the consumer root (looks for `.wxai/`, `package.json` with kit marker, etc.).
2. Fails. Prints:

```
ERROR: not in a wxkanban-agent consumer project.
Looked for: .wxai/, package.json (with wxkanban-agent in dependencies).
Run `wxkanban-agent init` first, or cd into a project root.
```

3. Exit `2`.

**Expected outcome**: Clear, actionable failure; no partial writes.

### US7 — Failure mid-scaffold (filesystem error)

**Actor**: Developer whose `src/components/ui/` is mounted read-only (e.g., NFS misconfig).

**Scenario**:
1. Command writes `tailwind.config.ts`, `postcss.config.js`, `globals.css` successfully.
2. First UI file write fails with `EACCES`.
3. Command logs the error, prints the list of files already written, exits `1`.
4. Re-running after the FS issue is fixed picks up where it left off (skips the 3 already-written files, writes the rest).

**Expected outcome**: Failure isolated, recovery is just a re-run. No rollback needed.

### US8 — `auditfences --strict` stays green

**Actor**: CI pipeline running after a scaffold.

**Scenario**:
1. CI runs `wxkanban-agent scaffold:frontend` on a fresh checkout.
2. CI runs `wxkanban-agent auditfences --strict`.
3. Every new `.ts`/`.tsx` file under `src/components/`, `src/components/ui/`, `src/lib/`, plus `tailwind.config.ts` and `postcss.config.js`, carries a valid `[SCOPE 036 / T<n>]` fence.
4. Exit `0`.

**Expected outcome**: Spec 026 compliance enforced automatically; un-fenced output from the scaffold is a CI defect.

### US9 — Theme toggle round-trip

**Actor**: Developer who scaffolded and wired `<ThemeProvider>` + `<ModeToggle />` into the app root.

**Scenario**:
1. User clicks the toggle in the header.
2. Picks "Dark" → `<html>` gains `dark` class → all primitives re-render with dark tokens.
3. Reloads the page → choice preserved via `localStorage` key `wxkanban-ui-theme`.
4. Switches to "System" → tracks the OS `prefers-color-scheme` live as the OS theme changes.

**Expected outcome**: Toggle is a working three-state control; no manual CSS edits required by the developer.

### Integration test mapping (quickstart.md)

| QT | Covers US | What it checks |
| --- | --- | --- |
| QT-1 | US1 | Clean scaffold writes all 19 files, `package.json` deps added, exit `0`. |
| QT-2 | US2 | Re-run on populated project is a no-op (no `package.json` mutation). |
| QT-3 | US3 | Mixed state — only missing files written; existing preserved. |
| QT-4 | US4 | `--dry-run` writes nothing, prints accurate preview, exit code mirrors real run. |
| QT-5 | US5 | `--force` always prompts; `--force --yes` bypasses; bare `--yes` is ignored. |
| QT-6 | US6 | Not-a-consumer-root exits `2` with actionable message. |
| QT-7 | US7 | Filesystem error isolates failure, leaves partial state recoverable. |
| QT-8 | US8 | `auditfences --strict` green after a fresh scaffold. |
| QT-9 | n/a | Smoke render — if consumer has Vitest configured, kit runs a Vitest test importing `Button`, `Card`, `ResourceCalendar` from scaffolded paths. If not, kit ships `wxkanban-agent/templates/frontend/verify-scaffold.md` with a copy-paste manual snippet. |
| QT-10 | US9 | `ThemeProvider` toggles the `dark` class, persists to localStorage, responds to `system` media query changes. |

---

## Data Model

This spec adds **no database tables**. All state is filesystem-only in the consumer repo.

---

## CLI Contracts

### `wxkanban-agent scaffold:frontend` (new)

```
wxkanban-agent scaffold:frontend [--dry-run] [--force] [--yes]
```

| Flag | Effect |
| --- | --- |
| (none) | Write missing files; skip existing; mutate `package.json` if deps missing; exit `0` on success. |
| `--dry-run` | Print preview table; no writes; no `package.json` mutation. Mutually exclusive with `--force`. |
| `--force` | Prompt to overwrite existing files; on confirmation, overwrite. Still updates deps. |
| `--yes` | Auto-answer `y` to the `--force` prompt. No effect without `--force`. |

**Exit codes**:
- `0` — success or all-skipped.
- `1` — partial failure (some writes failed).
- `2` — consumer root not detected.
- `3` — invalid flag combination (e.g., `--dry-run --force`).

### Environment variables

| Var | Default | Effect |
| --- | --- | --- |
| `WXKANBAN_SCAFFOLD_ROOT` | (auto-detect) | Override consumer root detection. For testing. |
| `WXKANBAN_SCAFFOLD_TEMPLATES_DIR` | `wxkanban-agent/templates/frontend` | Override template source. For testing. |

---

## New Modules

| Module | Purpose |
| --- | --- |
| `wxkanban-agent/core/scaffold/template-copy.ts` | `copyTemplate(src, dest, opts): 'created' \| 'skipped' \| 'overwritten'`. Idempotent, atomic (tmp + rename). |
| `wxkanban-agent/core/scaffold/deps-merge.ts` | `mergeDeps(packageJson, additions): { changed: boolean, diff: DepDiff }`. Preserves consumer's existing version pins. |
| `wxkanban-agent/core/scaffold/consumer-detect.ts` | `findConsumerRoot(cwd): string \| null`. Looks for `.wxai/` + `package.json` marker. |
| `wxkanban-agent/core/scaffold/prompt.ts` | `confirm(message, opts): Promise<boolean>`. TTY-aware; honors `--yes`. |
| `wxkanban-agent/core/orchestrator/command-handlers/scaffold-frontend.ts` | CLI handler wiring the above. |
| `wxkanban-agent/templates/frontend/` | Directory of 19 source templates + `deps.json` + `verify-scaffold.md`. |

## Updated Modules

- `wxkanban-agent/cli/index.ts` — registers `scaffold:frontend`.
- `wxkanban-agent/scripts/verify-install.ts` — adds optional `scaffold:frontend --dry-run` smoke check.
- `wxkanban-agent/docs/` — new `scaffold-frontend.md`; README cross-link.

---

## Acceptance Criteria

Spec 036 is `Released` when all of the following hold:

### A-1 — Templates exist (FR-001 through FR-007b)
`wxkanban-agent/templates/frontend/` contains all 19 source templates plus `deps.json`. Each template renders into the correct consumer path per the Path Conventions table.

### A-2 — Scaffold command works (FR-008, FR-010, FR-014, FR-015)
- Fresh project: 19 files written, `package.json` updated, exit `0`.
- Re-run: zero changes, exit `0`.
- Partial state: missing files filled, existing preserved, exit `0`.
- `--dry-run`: zero writes, accurate preview, exit code mirrors what a real run would return.
- Filesystem error mid-run: already-written files retained, failed path logged, exit `1`, recoverable by re-run.

### A-3 — Overwrite safety (FR-008)
- `--force` alone prompts for confirmation; `--force --yes` bypasses; bare `--yes` is ignored without `--force`.
- Without `--force`, an existing file is **never** overwritten under any flag combination.
- `--dry-run --force` exits `3` (invalid combination).

### A-4 — Dependencies pinned and centralized (FR-009)
- All runtime + dev deps live in `wxkanban-agent/templates/frontend/deps.json`.
- Command adds exactly those deps to the consumer `package.json`; no extras.
- Versions pinned by `^major.minor` (not `latest`); change requires a kit version bump.

### A-5 — Code fencing compliance (FR-011, spec 026)
- Every `.ts` / `.tsx` and `tailwind.config.ts` / `postcss.config.js` carries a valid `[SCOPE 036 / T<n>]` fence.
- `wxkanban-agent auditfences --strict` exits `0` after a fresh scaffold on a clean project.
- JSON files (`components.json`, `package.json`) are correctly exempt.

### A-6 — Consumer CLAUDE.md note (FR-012)
- First run appends the note with a marker comment.
- Subsequent runs do not duplicate it.
- If `CLAUDE.md` is absent, a stub is created with just the scaffold note.
- The dark-mode wiring sentence is included verbatim.

### A-7 — Logging (FR-013)
- Every file action emits a Pino `info` line: `created` / `skipped` / `overwritten`.
- Zero `console.log` calls in any new module.

### A-8 — Smoke verification (QT-9)
- If consumer has Vitest configured: kit runs a smoke test importing `Button`, `Card`, `ResourceCalendar` from scaffolded paths; passes.
- If not: `verify-scaffold.md` ships with a copy-paste snippet a developer can run manually.

### A-9 — Resource calendar (FR-007)
- `ResourceCalendar` renders rows of resources × columns of time slots **without** importing `react-big-calendar/lib/css/react-big-calendar.css`.
- Click handlers `onEventClick` / `onSlotClick` fire with correctly typed payloads.
- Visual styling derives from Tailwind tokens defined in `globals.css` (FR-003).

### A-10 — Dogfood
- Spec 036's scaffold command run against a throwaway test consumer produces a working `npm run dev:client` (Vite boots, Tailwind compiles, `Button` renders).
- Run against wxKanban itself is **not** required (wxKanban predates the scaffold; standard-path mismatch is documented in Out of Scope).

### A-11 — Tests pass
- Unit tests for: path discovery, template-copy idempotency, dep-merge, prompt logic, dry-run formatter.
- Integration tests for QT-1 through QT-10.
- Existing kit test suite stays green.

### A-12 — Documentation
- `wxkanban-agent/docs/scaffold-frontend.md` documents the command, the template set, the dark-mode wiring, and the post-scaffold install step.
- `README.md` adds a "Frontend stack" subsection.
- `CHANGELOG.md` next-minor entry summarizes the new command.

### A-13 — Dark mode toggle (FR-007a, FR-007b)
- `<ThemeProvider>` applies/removes `dark` class on `<html>` based on state.
- `<ModeToggle />` renders a working 3-state dropdown (Light/Dark/System).
- `system` mode tracks `prefers-color-scheme` reactively.
- Choice persists across reload via `localStorage` key `wxkanban-ui-theme`.

---

## Out of Scope

- **Non-standard consumer layouts** (`src/client/`, `app/`, monorepo workspaces). Documented as future work; first release assumes standard `src/` layout. wxKanban-the-consumer is the documented special case.
- **A design system / theme tokens beyond shadcn defaults.** Consumer customizes `tailwind.config.ts` `theme.extend` themselves.
- **Storybook / component playground.** Out of scope; consumer can add later.
- **Icon sets beyond `lucide-react`.** Lucide is included as the shadcn default; alternatives are consumer choice.
- **Form schema generation.** `react-hook-form` + `zod` shipped, but no schema/form scaffolding tooling.
- **AdminDashboard or lifecycle UI components.** Those live in their own scopes.
- **`upgrade` subcommand.** Re-running scaffold after kit upgrade to pull in new primitives is future work; current command never touches existing files without `--force`.
- **Cross-platform line-ending handling beyond Node defaults.** Templates ship with LF; consumers on CRLF systems get whatever Node writes.

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Tailwind v4 churn — config shape changes before kit consumers upgrade. | Medium | Medium | Pin `tailwindcss@^4.x`; isolate config shape behind a single template; document upgrade path in `scaffold-frontend.md`. |
| shadcn registry drift — primitives we ship become stale vs. upstream. | Medium | Low | Templates are consumer-owned post-scaffold; staleness is acceptable. Document `npx shadcn@latest add <name>` as the consumer's update path. |
| `react-big-calendar` from-scratch styling drifts as the library updates. | Low | Medium | Pin `react-big-calendar@^1.x`; smoke test in QT-9; visual regression is on the consumer post-handoff. |
| Hybrid CSS (`@theme` + CSS vars) confuses learners. | Medium | Low | `globals.css` ships with comments explaining each block; documented in CLAUDE.md note (FR-012). |
| Consumer has non-standard `src/` layout (e.g., `src/client/` like wxKanban). | Medium | Low | Documented in Out of Scope; consumer can post-edit; command stays simple. |
| `package.json` mutation conflicts with consumer's lockfile workflow. | Low | Medium | Command prints `Run: npm install` rather than running it; consumer controls lockfile resolution. |
| Prompt blocks scripted use without `--yes`. | Low | Low | `--force --yes` documented; non-TTY without `--yes` aborts cleanly with exit `0`. |
| Fenced files break shadcn's `npx shadcn add` flow later. | Low | Medium | Fences are top-level comments; shadcn CLI overwrites by file path and is fence-agnostic. Verified in dogfood. |
| Theme toggle's `system` mode media-query listener leaks. | Low | Low | `useEffect` cleanup unsubscribes; covered in QT-10. |

---

## Dependencies

- **Spec 019** — Agent Orchestrator Kit. Provides the CLI surface this command plugs into.
- **Spec 026** — Code Fencing. All new modules + scaffolded files are fenced; `auditfences --strict` gates CI.
- **Spec 027** — Kit Runtime Hygiene. Reuses `consumer-detect` patterns from 027's runtime-state file lookups (same project-root discovery logic).
- **Pino logging** per CLAUDE.md.
- **No new kit-internal deps.** Reuses `clsx`, `tailwind-merge`, etc. only as **consumer-side** deps (added to consumer `package.json`); the kit itself doesn't import them.
