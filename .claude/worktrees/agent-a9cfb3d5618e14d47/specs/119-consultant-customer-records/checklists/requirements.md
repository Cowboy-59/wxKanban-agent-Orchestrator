# Requirements Checklist: Consultant Customer Records (Spec 119)

## Scope quality (preflight — scored 100/100 on 2026-07-31)

- [x] Overview is clear and testable
- [x] Business problem is explicit
- [x] Actors are identified (`- Primary:` / `- Secondary:` labels)
- [x] Success metrics are measurable — 6 metrics, each carrying a digit, percentage or timing threshold
- [x] Scope boundary is defined
- [x] Out of scope is listed
- [x] Open questions are tracked — all four decided 2026-07-31, none outstanding
- [x] No TODO / TBD placeholders

Preflight warnings accepted deliberately: Data Requirements, API Routes and Frontend Components
sections are absent from `spec.md` because they live in the scope document
(`specs/Project-Scope/119-consultant-customer-records.md`) and in `plan.md`. `spec.md` is kept
byte-consistent with the `scopeContent` pushed to the database.

## Functional requirements

- [x] FR-001 Customer CRUD — defined
- [x] FR-002 Customer list — defined
- [x] FR-003 Soft archive, never hard delete — defined
- [x] FR-004 Optional tenant link — defined
- [x] FR-005 Engagement visibility — defined
- [x] FR-006 Project association — defined
- [x] FR-007 Access control — defined
- [x] FR-008 Restore the dashboard Customers rail — defined
- [x] FR-009 Unblock the SPEC-017 connection layer — defined
- [x] FR-010 Manual schema application — defined
- [x] FR-011 Ownership transfer on offboarding — defined

Every FR maps to at least one task in `tasks.md` and at least one test in `tests.md`.

## Conventions

- [x] Table and column names lowercase, concatenated, no underscores
- [x] UUID v7 generated app-side, never `gen_random_uuid()`
- [x] FK targets verified against the real schema — `userprofiles.id`, `companies.id` (both PKs)
- [x] DDL applied manually per SCOPE-117, `drizzle-kit push` prohibited
- [x] Apply order documented — DDL before declaration
- [x] Task IDs are `Tnnn`, expressible by the `(T\d+)` fence grammar
- [x] `tasks.md` carries a machine-readable task table, because the task index ignores checkbox rows

## Before implementation starts

- [x] DDL applied and verified — `npm run db:drift` exits 0
- [ ] T002/T003 Drizzle declarations match the applied DDL exactly
- [ ] T003a schema change recorded in the SCOPE-117 log
- [ ] `wxDesigner 119` run and design approved before any UI is built

## Before the spec can be called done

- [ ] All 16 tasks complete
- [ ] `npm run build` passes (client and server)
- [ ] `npx tsc --noEmit` clean for new files — esbuild and vite do not typecheck
- [ ] `npm run lint:i18n` passes
- [ ] `auditfences` reports zero errors against new files
- [ ] Tests S9 and R1 pass — the link confers nothing, and no `42703` regression
- [ ] SPEC-017 Gate 5 confirmed cleared; its Phase 1 DDL runs without foreign-key failure
