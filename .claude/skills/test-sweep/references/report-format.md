# Output formats — coverage summary, TEST-PLAN.md, TEST-REPORT.md

Three artifacts, in order. The **coverage summary** is presented for approval before any item body
exists (Phase 2A). The **plan** is the ISTQB-shaped management document (Phase 2B). The **report**
carries run results with numbers from `tests/.last-run.json` and `tests/test-items.json`, never from
memory.

Item records themselves live in `app/tests/test-items.json` per `test-item-schema.md`. Markdown here
is a *rendering* of that file — when they disagree, the JSON wins.

Both documents get the wxKanban generated-output watermark if the project requires it
(`npm run watermark -- <file>` from the repo root).

---

## Severity rubric

Apply to issues in the report. Severity is about **consequence**, not how hard the fix looks.

| Severity | Meaning | Examples in this codebase |
|---|---|---|
| **Critical** | Data loss, silent corruption, credential/secret exposure, or an insecure connection a config change alone can trigger | TLS downgrade accepted where `production: true` should refuse it; a secret value reaching a log or tool output; SQL built by string concatenation; a delete path that ignores `confirm` |
| **High** | Wrong results returned to a caller, a mutation that half-applies with no record, or an auth/audit control that doesn't fire | A tool returning the wrong row or wrong field names; `jobs_job_schedule_updates` leaving PACE partially updated with no audit trail; `requireRole` bypassed on a mutating tool |
| **Medium** | Contract or robustness defect with a workaround; missing validation; unhelpful failure | A zod schema that admits an invalid value and lets it reach the database; a `TypeError` instead of a clean `ToolError`; a null date serialized as `"null"` |
| **Low** | Cosmetic, log noise, naming, dead code, or a merely unclear message | Inconsistent tool description wording; a duplicated helper; a warn that fires twice |

`SPEC-GAP` findings take the severity of the *worst plausible* behavior the gap permits — an
undefined partial-failure contract on a mutating fan-out is High, not Low.

---

## Artifact 1 — Coverage summary (Phase 2A, for approval)

Counts and titles only. **No steps, no test data, no expected results.** Present it in chat and as
`## 0. Coverage summary` at the top of the draft plan.

```markdown
## 0. Coverage summary — FOR APPROVAL

Inventory: <N> units (<F> files) · Caps: HIGH 12 / MEDIUM 8 / LOW 3 per unit · Global ceiling 250

| Area | Units | happy | boundary | negative | permission | concurrency | recovery | Items |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| JOBS (tools) | | | | | | | | |
| SYS (tools) | | | | | | | | |
| CFG / SEC / TLS | | | | | | | | |
| LIB | | | | | | | | |
| DB | | | | | | | | |
| PACE / SOAP | | | | | | | | |
| SCRIPT | | | | | | | | |
| **Total** | | | | | | | | **<T>** |

**Tier split**: unit-mocked <n> · live-readonly <n> · manual <n> · not-testable <n>
**Priority split**: P1 <n> · P2 <n> · P3 <n>
**Cap pressure**: <n> units hit their cap; <n> items deferred as `DEFERRED-CAP` — listed below.
**Against the ceiling**: <T> of 250. <If over: DO NOT EXPAND. Options presented instead.>

### Variant exemptions by code
| Code | Count | Representative reason |
|---|---:|---|
| N/A-READ-ONLY | | pure read path, no shared mutable state |
| DEFERRED-CAP | | <what was dropped and its risk — never left blank> |

### Deferred by cap — what we are choosing not to test
| Unit | Variant dropped | Risk if it breaks |
|---|---|---|

### Sample of the 15 highest-priority item titles
1. `TC-TLS-003` buildTlsOptions refuses `disable` when `production: true` even with ALLOW_INSECURE_DB=true
2. …

### Clarifications Required (blocks item authoring)
| ID | Unit | Question | Blocks | Severity if wrong |
|---|---|---|---|---|
| CLAR-01 | | | | |

**Decision needed**: approve as-is · raise the ceiling · narrow scope · drop the deferred tail ·
approve the live tier (`TEST_SWEEP_LIVE=1`, read-only UAT) yes/no
```

---

## Artifact 2 — `app/tests/TEST-PLAN.md`

```markdown
# Test Plan — <target>

**Version** 1.0 · **Date** <YYYY-MM-DD> · **Commit** <sha> · **Author** test-sweep (Principal QA Architect persona)
**Inventory** `app/tests/inventory.json` (<N> units / <F> files) · **Items** `app/tests/test-items.json` (<T> items)
**Specs consulted** 001 jobs · 005 PACE adapter · 012 system · 015 connection hardening · …

## 0. Coverage summary
<the approved Artifact 1 table, verbatim, plus the approval date and any user amendments>

## 1. Scope

In scope, by area, with the requirement IDs each covers:

| Area | Units | Requirements covered | Test levels |
|---|---:|---|---|
| Jobs tool surface | 15 tools | FR-001-01 … FR-001-13 | component, system |
| Config & transport security | | FR-015-* | unit |

## 2. Out of scope

| Excluded | Reason | Who owns it instead |
|---|---|---|
| `db/schema.ts`, `db/relations.ts` | Table definitions — data, not callables; exercised indirectly by SQL-shape assertions | covered via `TC-JOBS-*` step 5 checks |
| `app/scripts/apply-sql.ts` | Mutating operational script — never invoked from a test | manual, operator-run |
| PACE live mutation paths | Spec 005 unimplemented; no non-production PACE endpoint exists | deferred to Spec 005 delivery |
| Load / performance / soak | No stated NFR targets in the specs | Clarifications Required CLAR-nn |

## 3. Test levels

| Level | What it covers here | Runner | Notes |
|---|---|---|---|
| Unit | pure functions, config resolvers, `lib/` primitives | vitest, mocked | no I/O at all |
| Component | tool handlers driven through the MCP protocol via `InMemoryTransport` | vitest, mocked | exercises zod + `safeTool` envelope |
| Integration | drizzle SQL generation against `db/schema.ts` (pg mocked at pool boundary) | vitest, mocked | catches column/table drift |
| System | live read-only queries against GPMGT UAT | vitest live config | opt-in, `TEST_SWEEP_LIVE=1` |
| Acceptance | operator-run scripts (`smoke.ts`, `verify-schema.ts`) | manual | documented commands |

## 4. Entry criteria

| # | Criterion | Status |
|---|---|:-:|
| E1 | `inventory.json` regenerated at the target commit | |
| E2 | Coverage summary approved by the requester | |
| E3 | Harness green: `npx vitest run` collects with zero import errors | |
| E4 | `app/` devDeps include vitest; setup files present | |
| E5 | Live tier explicitly authorized, or formally deferred | |
| E6 | Blocking clarifications (severity High+) answered or assumptions accepted | |

## 5. Exit criteria

| # | Criterion | Threshold |
|---|---|---|
| X1 | P1 items executed | 100% |
| X2 | P1 items passing | 100%, or every failure has a filed `CODE-BUG`/`SPEC-GAP` with an owner |
| X3 | P2 items executed | ≥ 90% |
| X4 | Critical/High findings | zero open without a filed remediation action |
| X5 | Unresolved-bucket failures | ≤ 2, each with a named next diagnostic step |
| X6 | HIGH-risk units with zero coverage | zero, unless listed in §2 with a reason |
| X7 | Clarifications | all filed; none silently assumed |
| X8 | Traceability | every executed item has a `requirementId` or a `clarificationId` |

Exit criteria are evaluated in the report (§ *Exit-criteria verdict*) with the deciding number.

## 6. Risk register

Product risk drives priority; project risk drives schedule. Score = likelihood × impact (1–3 each).

| ID | Type | Risk | L | I | Score | Mitigation | Items |
|---|---|---|:-:|:-:|:-:|---|---|
| R1 | Product | TLS downgrade reachable in production via env alone | 2 | 3 | 6 | Full `buildTlsOptions` truth table incl. `production:true` | TC-TLS-001…006 |
| R2 | Product | Mutating fan-out leaves PACE partially updated, unaudited | 3 | 3 | 9 | Recovery variants + CLAR-01 | TC-JOBS-011-R1 |
| R3 | Product | `requireRole` bypassed — `system` principal passes every check | 3 | 2 | 6 | Direct `requireRole` tests with non-system principal; documented as stub | TC-LIB-004-P1 |
| R4 | Product | Secret value reaching logs or tool output | 2 | 3 | 6 | Logger spy across all secrets/TLS paths | TC-SEC-00x |
| R5 | Project | PACE unimplemented — most of the domain is untestable beyond its error contract | 3 | 2 | 6 | Assert documented `PACE_NOT_CONFIGURED`; defer rest to Spec 005 | — |
| R6 | Project | Live tier needs credentials + network; unavailable in CI | 3 | 1 | 3 | Unit tier fully mocked and CI-safe | — |

## 7. Environments

| Env | Purpose | Config | Data | Constraints |
|---|---|---|---|---|
| Local unit | all mocked tiers | `tests/setup/env.ts` forces `db.test.invalid`, fake creds, `PGSSLMODE=require`; `pg` mocked | fixtures only | zero network; cannot reach a real host by construction |
| GPMGT UAT | live read-only | repo-root `.env`, `DB_TARGET=UAT`, `TEST_SWEEP_LIVE=1` | production-like real data | **read-only**; no PACE mutation; `fileParallelism: false` |
| PROD | — | — | — | **prohibited**; live guard throws on any non-UAT target |

## 8. Test data strategy

- **Fixtures** (`tests/helpers/fixtures.ts`) are the default. Shaped from real `db/schema.ts` column
  names; a fixture needing a nonexistent column is a finding, not a fixture fix.
- **Synthetic identifiers only** in the unit tier. No real job numbers, customers, or hostnames
  committed to the repo.
- **Live tier discovers its own data at runtime** (as `scripts/smoke.ts` does) and asserts on
  *shape*, never on a specific row — the UAT dataset is not under our control.
- **Boundary data lives in the item's `testData` table** as a partition set, not as separate items.
- **No secrets in fixtures.** Secret-path tests use temp files written and removed by the test.
- **PII**: GPMGT holds customer data. Live-tier output must not be pasted into reports or logs —
  reference row counts and field shapes instead.

## 9. Roles and responsibilities

| Role | Owner | Responsibility |
|---|---|---|
| Test architect / author | this skill | inventory, plan, items, harness, execution, report |
| Approver — scope & volume | requester | approves the coverage summary, the ceiling, the live tier |
| Spec owner | per `specs/###-*` | answers Clarifications Required; rules on `SPEC-GAP` |
| Fix owner | assigned per finding | remediates `CODE-BUG` items; not this skill unless asked |
| Release gate | project lifecycle (§ QA Testing phase) | evaluates exit criteria |

## 10. Schedule

Sequenced by risk, not by file order. Effort is relative, not calendar-committed.

| Stage | Work | Depends on | Effort |
|---|---|---|---|
| S1 | Harness + setup files green | E3, E4 | S |
| S2 | HIGH-risk config/security items (CFG, SEC, TLS) | S1 | L |
| S3 | Mutating jobs tools (auth, audit, confirm, PACE contract) | S1 | L |
| S4 | Read-path tools + SQL shape | S1 | M |
| S5 | LIB + DB primitives | S1 | S |
| S6 | PACE/SOAP unit items incl. XML injection | S1 | M |
| S7 | Live read-only tier | S4, E5 | S |
| S8 | Report, exit-criteria verdict, filing | S2–S7 | M |

## 11. Deliverables

| Deliverable | Path | Consumer |
|---|---|---|
| Unit inventory (machine) | `app/tests/inventory.json` | re-run diffing |
| Unit inventory (human) | `app/tests/INVENTORY.md` | review |
| Test plan | `app/tests/TEST-PLAN.md` | requester, release gate |
| Test items | `app/tests/test-items.json` | wxKanban insert, report counts |
| Test suites | `app/tests/unit/**`, `app/tests/integration/**` | CI |
| Harness | `app/vitest.config.ts`, `vitest.live.config.ts`, `tests/setup/**`, `tests/helpers/**` | CI |
| Raw run output | `app/tests/.last-run.json` | report numbers (gitignored) |
| Test report | `app/tests/TEST-REPORT.md` | requester, release gate |
| wxKanban records | tasks + feedback + documents | project management |

## 12. Traceability matrix

| Requirement | Spec ref | Units | Items | Coverage |
|---|---|---|---|---|
| FR-001-01 | 001 §4.1 | `tool:jobs_get_job` | TC-JOBS-001, -B1, -N1, -N2 | full |
| FR-001-07 | 001 §4.7 | `tool:jobs_update_job_status` | TC-JOBS-007… | partial — PACE deferred |
| — | — | `tool:jobs_create_job` | TC-JOBS-013 | **untraceable — CLAR-03** |

Requirements with no items, and units with no requirement, are both listed. Neither is acceptable
silently.

## 13. Clarifications Required

Ambiguities that were **not** guessed. Each names what it blocks and what was assumed meanwhile.

| ID | Unit / area | Question | Why it's ambiguous | Blocks | Assumed for now | Severity if wrong |
|---|---|---|---|---|---|---|
| CLAR-01 | `tool:jobs_job_schedule_updates` | On failure of PACE push 3 of 6, are 1–2 rolled back or is partial update the contract? | No transaction spans PACE; spec 001 is silent | TC-JOBS-011-R1 | Partial update asserted as **observed**, not ratified | High |

## 14. Item index

Rendered from `test-items.json` per `test-item-schema.md` § *Markdown rendering*. Grouped by area,
ordered by priority then ID.
```

---

## Artifact 3 — `app/tests/TEST-REPORT.md`

```markdown
# Test Report — <target>

**Run** <YYYY-MM-DD HH:MM> · **Commit** <sha> · **Branch** <branch> · **Plan** v1.0
**Tiers executed** unit ✅ · live ⏭ not approved · manual ⏭
**Reproduce** `cd app && npx vitest run`

## 1. Results

| | Count |
|---|---:|
| Test files | |
| Tests passed | |
| Tests failed | |
| Tests skipped | |
| Duration | |

Numbers taken verbatim from `app/tests/.last-run.json`.

**Item status** (from `test-items.json`): pass <n> · fail <n> · skip <n> · blocked <n> · unresolved <n>
**Reconciliation**: <T> items vs <n> vitest tests — <equal, or the discrepancy and its cause>.
**Inventory coverage**: <n>/<N> units with ≥1 direct item (<pct>%) · <n> indirect · <n> uncovered (§5)

## 2. Exit-criteria verdict

| # | Criterion | Threshold | Actual | Verdict |
|---|---|---|---|:-:|
| X1 | P1 items executed | 100% | | ✅/❌ |
| X2 | P1 items passing | 100% or filed | | |
| … | | | | |

**Overall**: <MET / NOT MET> — <the one sentence a release gate needs>

## 3. Verified successes

Behavior now backed by a passing assertion. "Verified" means an item asserts it.

### Config & transport security (Spec 015)
- ✅ `TC-TLS-003` — `buildTlsOptions` refuses `disable` under `production: true` and ignores
  `ALLOW_INSECURE_DB`.

### MCP tool surface
- ✅ `TC-SYS-001` — all <n> tools register under their documented names.

## 4. Issues

Ranked most severe first.

| # | Sev | Bucket | Item | Unit | Requirement | Symptom | Evidence |
|---:|---|---|---|---|---|---|---|
| 1 | Critical | CODE-BUG | TC-PACE-004 | `EpaceDb.queryJobParts` | FR-005-02 | job id interpolated into SQL | `epace.ts:88` |

### Detail

#### Issue 1 — Critical — CODE-BUG — `TC-PACE-004` / `EpaceDb.queryJobParts`
- **What happens**: <observed>
- **Expected**: <quoted from the spec + requirement ID>
- **Repro**: `cd app && npx vitest run tests/unit/integrations/pace/epace.test.ts -t "TC-PACE-004"`
- **Evidence**:
  ```
  <failing assertion / actual output>
  ```
- **Blast radius**: <who is affected>
- **Not fixed here because**: <outside this skill's remit / needs a spec decision / user's call>

### Unresolved
Failures not attributable to either the test or the source. Listed honestly, not guessed.

| Item | Failure | Why unresolved | Next diagnostic step |
|---|---|---|---|

## 5. Coverage gaps

| Unit | Risk | Why uncovered | Exemption code | What it would take |
|---|---|---|---|---|
| `RealPaceClient.*` | HIGH | PACE adapter unimplemented (Spec 005) | DEFERRED-SPEC | Spec 005 delivery, or a contract test against the interface |

Includes every `DEFERRED-CAP` from the approved summary. A gap left out of this table would read as
coverage.

## 6. Clarifications still open

| ID | Question | Blocks | Assumed | Severity if wrong | Filed as |
|---|---|---|---|---|---|

## 7. Actions

Numbered, most severe first, each directly actionable.

| # | Action | Where | Sev | Needs spec change first? | Filed as |
|---:|---|---|---|---|---|
| 1 | Parameterize the job id in `queryJobParts` | `integrations/pace/epace.ts:88` | Critical | No | feedback #<id> |
| 2 | Define the partial-failure contract for multi-date PACE pushes | Spec 001 | High | **Yes** | feedback #<id> |

## 8. Filed in the spec system

| Artifact | Count | Target | Reference |
|---|---:|---|---|
| Test tasks | | Spec 001 / 012 / 015 | tasks #… |
| Clarification feedback | | per spec owner | feedback #… |
| Finding feedback | | per spec | feedback #… |
| Documents | | project docs | doc #… |
```

---

## Getting the numbers right

```bash
cd app && npx vitest run --reporter=json --outputFile=tests/.last-run.json
```

Read counts from the JSON (`numTotalTests`, `numPassedTests`, `numFailedTests`, `numPendingTests`,
`testResults[]`) — never transcribe terminal output. Cross-check against `test-items.json` statuses;
report any discrepancy rather than choosing the friendlier number.

If the run errored before collecting (a config or import failure), the report says **"suite failed to
run"** with the error. It does not report a pass count.
