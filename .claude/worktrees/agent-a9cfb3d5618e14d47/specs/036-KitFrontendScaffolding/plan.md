# Plan: Kit Frontend Scaffolding — Tailwind v4 + shadcn/ui Defaults

**Spec Number**: 036
**Date**: 2026-05-23

## Implementation Plan

### Phase 1 — Core Scaffold Modules (T001–T005)
Self-contained pure-function modules under `wxkanban-agent/core/scaffold/`:
- `consumer-detect.ts` — root discovery (reuses 027's pattern).
- `template-copy.ts` — atomic file copy with `created`/`skipped`/`overwritten` return.
- `deps-merge.ts` — `package.json` dep delta, preserving consumer pins.
- `prompt.ts` — TTY-aware confirmation honoring `--yes`.
- Unit tests in T005 exercise each module independently. Nothing else can land until this foundation exists.

### Phase 2 — Templates: configs + utilities (T006–T010)
The non-component scaffolding templates under `wxkanban-agent/templates/frontend/`:
- T006: `tailwind.config.ts` (FR-001).
- T007: `postcss.config.js` (FR-002).
- T008: `src/styles/globals.css` with hybrid `@theme` + CSS vars (FR-003).
- T009: `components.json` (FR-004).
- T010: `src/lib/utils.ts` with `cn()` (FR-005).

### Phase 3 — Templates: stock shadcn primitives (T011–T021)
11 primitives generated from the official shadcn v4 registry, fenced per spec 026:
- T011 button, T012 card, T013 input, T014 label, T015 dialog, T016 dropdown-menu, T017 table, T018 form, T019 select, T020 toast, T021 calendar.
- These tasks parallelize after T010 lands.

### Phase 4 — Templates: custom components (T022–T024)
- T022: `resource-calendar.tsx` (FR-007) — from-scratch Tailwind styling, no library CSS import.
- T023: `theme-provider.tsx` (FR-007a) — context, localStorage, `prefers-color-scheme` listener with cleanup.
- T024: `mode-toggle.tsx` (FR-007b) — Button + DropdownMenu + Sun/Moon icons.

### Phase 5 — CLI command + handler (T025–T029)
- T025: `core/orchestrator/command-handlers/scaffold-frontend.ts` — wires Phase 1 modules.
- T026: register in `wxkanban-agent/cli/index.ts`.
- T027: `deps.json` centralizing all dep pins (FR-009).
- T028: dry-run formatter + summary printer.
- T029: unit tests — handler, formatter, exit-code matrix.

### Phase 6 — Smoke verification + docs (T030–T033)
- T030: `templates/frontend/verify-scaffold.md` — copy-paste manual snippet.
- T031: conditional Vitest smoke test in `verify-install.ts`.
- T032: `docs/scaffold-frontend.md`.
- T033: README + CHANGELOG entries.

### Phase 7 — QT Integration Tests (T034–T040)
Seven integration test files mapping to QT-1 through QT-10. Run alongside corresponding feature phases as they land:
- T034: QT-1 + QT-2 (clean scaffold + idempotency).
- T035: QT-3 (partial state).
- T036: QT-4 (dry-run accuracy).
- T037: QT-5 (force/yes prompt matrix).
- T038: QT-6 + QT-7 (root-not-detected + filesystem error recovery).
- T039: QT-8 + QT-9 (auditfences green + smoke render).
- T040: QT-10 (theme toggle round-trip + media-query listener cleanup).

### Phase 8 — Lifecycle Close (T041)
AC verification, `lifecycle.json` flipped to `released`, `projectlifecycle.md` regenerated.

## Critical Path

T001–T005 (scaffold modules) → T006–T010 (config templates) → T025–T029 (CLI handler) → T034–T040 (QT tests) → T041.

Phase 3 (stock primitives) and Phase 4 (custom components) parallelize after T010. Phase 6 (docs) hangs off the critical path but does not extend it.

## Known Issues

### Issue P-1 — Standard layout only at v1
FR's `Path conventions` table assumes `src/`, `src/components/`, `src/lib/`, `src/styles/`. wxKanban itself uses `src/client/`. The command does **not** auto-detect; consumers with non-standard layouts must post-edit. Documented in Out of Scope; revisit if multiple consumers hit it.

### Issue P-2 — `package.json` mutation is non-atomic
`deps-merge.ts` reads, mutates in memory, writes back. A concurrent npm process could clobber. Acceptable — scaffold is an interactive one-shot, not a daemon. Documented in Risks.

### Issue P-3 — `react-big-calendar` v1 type quality
Library has known TS gaps. T022 may need `// @ts-expect-error` at one or two call sites. If so, document each and reference the upstream issue. **No `@ts-ignore` per CLAUDE.md.**

### Issue P-4 — shadcn v4 registry stability
shadcn v4 was newly stable at spec creation (2026-05-23). Registry output may shift before consumers run the command. T011–T021 freeze the v4 templates as of T011 commit date; CHANGELOG notes the source registry SHA if available.

### Issue P-5 — Theme toggle hydration flash
Without an SSR-style "no-flash" script in `index.html`, dark-mode users see a brief flash of light on first paint. v1 accepts this; a no-flash inline script is future work. Mentioned in `scaffold-frontend.md` so consumers know.

### Issue P-6 — Dry-run cannot fully simulate FR-009 dep merge order
`--dry-run` shows the dep delta but doesn't simulate npm's eventual lock-file resolution. The printed deltas reflect what the command **would write** to `package.json`, not the final resolved tree. Documented in `docs/scaffold-frontend.md`.

## Dependencies on Other Specs

- **Spec 019** — Orchestrator Kit. Owns the CLI surface; this spec adds a new command.
- **Spec 026** — Code Fencing. Every new module and every scaffolded `.ts`/`.tsx` file gets fenced via `implement 036/T<...>`; CI's `auditfences --strict` gates the PR.
- **Spec 027** — Kit Runtime Hygiene. `consumer-detect.ts` reuses the same root-discovery logic as 027's runtime-state file lookups.

## Out-of-Band Issues to Track Separately

- Future `wxkanban-agent scaffold:frontend --upgrade` subcommand to re-pull templates after kit version bumps without losing consumer edits. Will need a diff/merge strategy.
- Future support for non-standard layouts (`src/client/`, `app/`, monorepo workspaces) — likely an `--src-root` flag plus per-layout templates.
- Future no-flash inline script for dark mode (mitigates P-5).
- Future option to scaffold a starter dashboard page showing the primitives in action — defer until adoption signal exists.
