# Task Breakdown: Compliance Enablement Repair

**Feature**: Compliance Enablement Repair
**Spec**: 112
**Date Generated**: 2026-07-27
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | Add projectid and new framework columns to appauditconfiguration | critical | done |
| 2 | Backfill migration with before/after diff | critical | done |
| 3 | Fix project.get_audit_config with a failing regression test | critical | todo |
| 4 | Fix checkRegexPattern to be file-scoped with no false passes | critical | done |
| 5 | Re-scope AuditConfigService and /api/audit/config to project | high | done |
| 6 | Migrate the remaining audittype readers | high | done |
| 7 | Migrate AuditReportService to loop over enabled frameworks | high | done |
| 8 | Build per-project compliance settings UI | high | todo |
| 9 | Serve framework rules from the database via MCP | high | done |
| 10 | Cleanse securityclassification and drop audittype | medium | done |
| 11 | Author the SOC 2 check corpus | high | done |

Statuses corrected 2026-07-28: T001/T002 shipped in `18dd430e`, T004 in `fabd473d`, T005 in `18dd430e`. T009 rewritten and T011 added by Amendment A. T006, T007, T009 and T011 shipped in `9e93da4d`.

**T010 completed 2026-07-28** — `0012` harvest+cleanse applied, then `0013` dropped `audittype` at 13:58Z once `6d8239ad` (declaration removal) was live. See its detail for the incident that ordering caused.

**T003 remains `todo` and is only half done.** The `project.get_audit_config` re-key shipped in `9e93da4d`, but the task asks for the failing regression test to be written FIRST and that test does not exist. The re-key is unverified by anything except manual inspection, which is precisely what the task was written to avoid.

**Reconciled 2026-08-04.** `lifecycle.json` had drifted badly against this file — it read `phase: design`, 0 of 10 complete, while nine tasks are done and the migrations are applied to production. It also carried `tasksTotal: 10`, missing T011 entirely. Both are corrected. Statuses in the table above were already right and are unchanged; two things below were not:

- **T008 is `todo` but partially delivered** — see its detail.
- **The T010 detail section was stale.** It still described part 2 as deploy-gated and unrun, contradicting the note directly above it. Corrected in place.

## Task Details

### T001 — Add projectid and new framework columns to appauditconfiguration

Additive migration: add projectid referencing companyprojects.id (unique), plus nistssdfenabled and iso27001enabled booleans. Nothing reads them yet. FR-001.

### T002 — Backfill migration with before/after diff

Backfill from companyprojects.audittype and fan company-level appauditconfiguration flags out to all owned projects. Quarantine the two orphan rows. Idempotent, emits written before/after row counts. FR-002.

### T003 — Fix project.get_audit_config with a failing regression test

Write the regression test FIRST: assert a project with SOC2 enabled returns activeFrameworks [SOC2]. It must fail against today’s code. Then make it pass via the re-key. FR-004.

### T004 — Fix checkRegexPattern to be file-scoped with no false passes

checkRegexPattern currently scans the whole src tree and returns pass on the first match anywhere. Make it evaluate the file under evaluation only; pass requires positive evidence; unverifiable returns needs_review. FR-006.

### T005 — Re-scope AuditConfigService and /api/audit/config to project

Move from req.companyid to a project parameter; ADMIN-gated on write. FR-001, FR-003.

### T006 — Migrate the seven non-AuditReportService audittype readers

db/schema/companyproject.ts, shared/types/projects.ts, server/routes/projects.ts, DashboardProjectGrid.tsx, AdminDashboard.tsx, and three bindings in ProjectWorkspacePage.tsx. FR-001.

### T007 — Migrate AuditReportService to loop over enabled frameworks

Its single-framework COMPLIANCE_FILES[audittype] lookup becomes a loop. Migrate LAST — only compliance path producing real customer output. FR-001.

### T008 — Build per-project compliance settings UI

AuditConfigPanel moves to project context, ADMIN-gated. One-time notice on the grain change. Save confirmed against a re-read. FR-003.

**Status note 2026-08-04 — partially delivered, stays `todo`.** Per-project framework enablement does ship: the AdminDashboard **Edit Audit modal** writes the full framework set through `/api/audit/config` and carries all six frameworks, fenced `[SCOPE 112 / T006]`. `AuditConfigPanel` is likewise project-scoped (`projectId` prop, `/api/audit/config?projectId=`) and ADMIN-gated.

What is missing is narrower than "the UI": **`AuditConfigPanel` renders only four toggles** — SOC 2, HIPAA, HITRUST, GDPR. `nistssdfenabled` and `iso27001enabled` have a column, an API contract (`src/server/routes/audit.ts`), an MCP surface and a row in AdminDashboard's `FRAMEWORKS`, but no control in that panel. Anyone reaching compliance settings through the panel rather than the modal cannot enable either framework, and cannot see that they exist.

This also corrects a claim in SPEC-113's own delivery note, which states Amendment A "surfaced both frameworks in the settings UI". That is true of the modal and false of the panel.

### T009 — Serve framework rules from the database via MCP

*Rewritten by Amendment A. Was: "Ship framework rules files to consumer projects — add the rules files to BOTH kit root-file allowlists."*

Add `project.get_compliance_context(projectId, mode?, phase?, keywords?)` to the MCP server, serving rule content from `wxkanbandocuments` (`mode: 'full'`) and `complianceaudittasks` (`mode: 'summary'`, filtered by `applicablephases`). Mirror both tables in `mcp-server/src/db/schema.ts` and refresh the stale `appauditconfiguration` mirror with `projectid`, `nistssdfenabled` and `iso27001enabled`. Register in the tool list **and** in `PERMISSION_MATRIX` as `['read_only','editor','admin']`.

Rewrite `_wxAI/rules/compliance-context.md` Step 2 to call the tool instead of reading files from the project root, and Step 1 to drop the `ai-settings.json` fallback. When `complianceActive` is true and the call fails, the agent halts and reports — never proceeds silently, never falls back to a local copy. Cut `compliance-scan.md` over in both `_wxAI/commands/` and `.claude/commands/`.

Neither kit allowlist changes: `_wxAI/` and `.claude/` are already inside `KIT_DIRS` and `KIT_INCLUDE_DIRS`, so the shipped rule reaches consumers with no new file. FR-005.

### T011 — Author the SOC 2 check corpus

*Added by Amendment A.*

`complianceaudittasks` holds 1,221 rows produced by a markdown checklist parser: `description` equals `title` on every row, `controlreference` is populated on 7, and `checkpattern` is `NULL` on all of them while 1,157 claim `isautomated: true`. FR-006's corrected engine therefore grades every automated check `not_applicable`.

For the 122 SOC 2 rows: write a `description` that is not a copy of the title, set `controlreference` to the governing CC-series criterion, supply a `checkpattern` only where a pattern honestly evidences the control, and set `isautomated: false` wherever it does not. Delete the two junk documents (`test-api.md`, 22 bytes; `soc2-test.md`, 68 bytes) and their extracted rows.

HIPAA, HITRUST and GDPR are explicitly not authored here — that is SPEC-113 FR-011. They remain `full`-mode only. FR-005, FR-006.

### T010 — Cleanse securityclassification and drop audittype

*Split into two migrations 2026-07-28. **Both parts are now applied** — see the part 2 correction below.*

**Part 1 — `0012_spec112_harvest_securityclassification.sql` (APPLIED).** The task as written said "overwrite framework values in securityclassification to null". Doing only that would have destroyed live signal: the 0010 backfill read `audittype`, a single varchar, while `securityclassification` is comma-separated and carried framework intent `audittype` could not express.

- 9 projects named a framework there and had **no `appauditconfiguration` row at all**, because their `audittype` was null — Magazijnbeheer (GDPR), LabDriver (GDPR,HIPAA), Hello World (HIPAA), ImpulseRetailing-WebSocket, yappChat, ScanDash, Futuretrans, VS Code Interface, wxHUB (SOC2).
- "Proactive By DDES" held `SOC2,HITRUST,GDPR` but only HITRUST was backfilled, from its `audittype`.

So the migration harvests first, then cleanses. Enablement is OR-ed, never cleared, matching the 0010 fan-out rule that over-applying is visible and reversible while silent disablement is not. Result: 45 → 54 config rows, 24 → 33 project rows; `securityclassification` now holds only `NONE` (4) and `HIGH` (1), which are genuine classification values and are retained — resolving open question 2 in favour of keeping the column as a classification axis.

**Part 2 — `0013_spec112_drop_audittype.sql` (APPLIED 2026-07-28 13:58Z).** *The text below was written before the run and is retained because its reasoning is the reason the ordering mattered; the "NOT RUN" state it describes ended on 2026-07-28.*

Blocked on deployment, not on further code work. Drizzle emits an explicit column list from the schema compiled into the running bundle, and the deployed bundle still declares `audittype`; dropping the column while that build is live fails every `companyprojects` query in production at once. 0010–0012 were safe to run ahead of the code because they were additive. This one is not.

Run only after the SPEC-112 cutover is pushed and live. The file carries a guard that raises rather than dropping if any project still holds an `audittype` value with no enabled framework behind it. Delete the `audittype` declaration from `src/db/schema/companyproject.ts` in the same change that runs it. FR-001.

**What actually happened.** The drop ran at 13:58Z once `6d8239ad` (declaration removal) was live — the ordering above held. This is the incident behind the general rule that a `DROP COLUMN` against this database needs its steps a deploy apart: Drizzle `SELECT`s every declared column, so dropping ahead of the declaration removal is a production 500 on every query touching the table.
