# Task Breakdown: Kit Frontend Scaffolding — Tailwind v4 + shadcn/ui Defaults

**Feature**: Kit Frontend Scaffolding
**Spec**: 036
**Date Generated**: 2026-05-23
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| #  | Task | Priority | Status |
|----|------|----------|--------|
| 1  | T001: `core/scaffold/consumer-detect.ts` — `findConsumerRoot(cwd)`, reuses 027 patterns | high | done |
| 2  | T002: `core/scaffold/template-copy.ts` — atomic copy, returns `created`/`skipped`/`overwritten` | high | done |
| 3  | T003: `core/scaffold/deps-merge.ts` — `mergeDeps`, preserves consumer pins, returns diff | high | done |
| 4  | T004: `core/scaffold/prompt.ts` — TTY-aware `confirm`, honors `--yes`, non-TTY safe-abort | high | done |
| 5  | T005: Unit tests — consumer-detect + template-copy + deps-merge + prompt | high | done |
| 6  | T006: Template `tailwind.config.ts` (FR-001) — Tailwind v4 shape, fenced | high | done |
| 7  | T007: Template `postcss.config.js` (FR-002) — v4 single-plugin shape, fenced | high | done |
| 8  | T008: Template `src/styles/globals.css` (FR-003) — `@import`, `@theme`, CSS vars light + dark, base layer, inline comments | high | done |
| 9  | T009: Template `components.json` (FR-004) — TS, RSC off, slate, CSS vars, alias paths | high | done |
| 10 | T010: Template `src/lib/utils.ts` (FR-005) — `cn()` on clsx + tailwind-merge, fenced | high | done |
| 11 | T011: Template `src/components/ui/button.tsx` (FR-006) — variants + sizes, fenced | high | done |
| 12 | T012: Template `src/components/ui/card.tsx` (FR-006) — Card family, fenced | high | done |
| 13 | T013: Template `src/components/ui/input.tsx` (FR-006) — fenced | medium | done |
| 14 | T014: Template `src/components/ui/label.tsx` (FR-006) — Radix Label, fenced | medium | done |
| 15 | T015: Template `src/components/ui/dialog.tsx` (FR-006) — Radix Dialog, fenced | medium | done |
| 16 | T016: Template `src/components/ui/dropdown-menu.tsx` (FR-006) — Radix DropdownMenu, fenced | high | done |
| 17 | T017: Template `src/components/ui/table.tsx` (FR-006) — Table family, fenced | medium | done |
| 18 | T018: Template `src/components/ui/form.tsx` (FR-006) — react-hook-form + Radix, fenced | medium | done |
| 19 | T019: Template `src/components/ui/select.tsx` (FR-006) — Radix Select, fenced | medium | done |
| 20 | T020: Template `src/components/ui/toast.tsx` (FR-006) — Radix Toast + useToast + Toaster, fenced | medium | done |
| 21 | T021: Template `src/components/ui/calendar.tsx` (FR-006) — react-day-picker wrapper, fenced | medium | done |
| 22 | T022: Template `src/components/ui/resource-calendar.tsx` (FR-007) — react-big-calendar wrapper, from-scratch Tailwind styling, no library CSS import, fenced | high | done |
| 23 | T023: Template `src/components/theme-provider.tsx` (FR-007a) — context, localStorage, prefers-color-scheme listener w/ cleanup, fenced | high | done |
| 24 | T024: Template `src/components/mode-toggle.tsx` (FR-007b) — Button + DropdownMenu + Sun/Moon crossfade, fenced | high | done |
| 25 | T025: `core/orchestrator/command-handlers/scaffold-frontend.ts` — CLI handler wiring Phase 1 modules | high | done |
| 26 | T026: Register `scaffold:frontend` in `wxkanban-agent/cli/index.ts` | high | done |
| 27 | T027: `templates/frontend/deps.json` — centralize all runtime + dev dep pins (FR-009) | high | done |
| 28 | T028: Dry-run formatter + summary printer (FR-014) — table output, package.json delta, exit-code echo | high | done |
| 29 | T029: Unit tests — scaffold-frontend handler, dry-run formatter, exit-code matrix (0/1/2/3) | high | done |
| 30 | T030: `templates/frontend/verify-scaffold.md` — copy-paste manual smoke snippet | medium | done |
| 31 | T031: Conditional Vitest smoke test in `scripts/verify-install.ts` — runs only if consumer has Vitest configured | medium | done |
| 32 | T032: `docs/scaffold-frontend.md` — command reference, template list, dark-mode wiring, install step, P-5 no-flash note, P-6 dry-run limitation | medium | done |
| 33 | T033: `README.md` "Frontend stack" subsection + `CHANGELOG.md` next-minor entry | medium | done |
| 34 | T034: Integration tests — QT-1 + QT-2 (clean scaffold writes 18 files + idempotent re-run no-op) | high | done |
| 35 | T035: Integration test — QT-3 (partial state; only missing files written, existing preserved) | high | done |
| 36 | T036: Integration test — QT-4 (`--dry-run` zero writes, accurate preview, exit code mirrors real run) | high | done |
| 37 | T037: Integration test — QT-5 (`--force` always prompts; `--force --yes` bypasses; bare `--yes` ignored; `--dry-run --force` exits 3) | high | done |
| 38 | T038: Integration tests — QT-6 + QT-7 (consumer root not detected exits 2; filesystem error isolated, exit 1, recoverable) | high | done |
| 39 | T039: Integration tests — QT-8 + QT-9 (`auditfences --strict` green after scaffold; smoke render of Button + Card + ResourceCalendar) | high | done |
| 40 | T040: Integration test — QT-10 (theme provider toggles `dark` class, persists to localStorage, system mode reacts to media-query change, listener cleanup verified) | high | done |
| 41 | T041: Late-bound AC verification + `lifecycle.json` flip to Released + `projectlifecycle.md` regen | low | done |

## Dependencies

- **Phase 1 (T001–T005)** before everything else — foundational modules.
- **Phase 2 (T006–T010)** depends on Phase 1 (uses `template-copy`).
- **Phase 3 (T011–T021)** parallelizes after T010 (deps on `cn()` from `utils.ts`).
- **Phase 4 (T022–T024)** parallelizes after Phase 3 (T024 deps on T016 dropdown-menu + T011 button).
- **Phase 5 (T025–T029)** depends on Phase 1 + templates existing.
- **Phase 6 (T030–T033)** runs alongside Phase 5.
- **Phase 7 (T034–T040)** depends on the corresponding feature phase.
- **T041** last (lifecycle flip + projectlifecycle.md regen).

---

## Critical Path

T001 → T002 → T010 → T011 → T016 → T024 → T025 → T028 → T034 → T040 → T041.

## Spec Cross-Reference

| Task | Implements |
|------|-----------|
| T001–T005 | Foundation (no direct FR; enables FR-008, FR-010, FR-015) |
| T006 | FR-001 |
| T007 | FR-002 |
| T008 | FR-003 |
| T009 | FR-004 |
| T010 | FR-005 |
| T011–T021 | FR-006 |
| T022 | FR-007 |
| T023 | FR-007a |
| T024 | FR-007b |
| T025–T026 | FR-008 |
| T027 | FR-009 |
| T028 | FR-014 |
| T029 | FR-008 + FR-015 |
| T030–T031 | FR-008 acceptance (A-8) |
| T032 | A-12 |
| T033 | A-12 |
| T034 | QT-1, QT-2 (A-2) |
| T035 | QT-3 (A-2) |
| T036 | QT-4 (A-2, A-14) |
| T037 | QT-5 (A-3) |
| T038 | QT-6, QT-7 (A-2) |
| T039 | QT-8, QT-9 (A-5, A-8, A-9) |
| T040 | QT-10 (A-13) |
| T041 | A-10, A-11, A-12 |

Fencing (FR-011, A-5), Pino logging (FR-013, A-7), consumer CLAUDE.md note (FR-012, A-6) are cross-cutting requirements satisfied by the implementations of T006–T024 (fences), T002+T025+T028 (logging), and T025 (CLAUDE.md note).
