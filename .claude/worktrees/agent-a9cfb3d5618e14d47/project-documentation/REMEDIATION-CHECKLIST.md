# Remediation Checklist

**Opened:** 2026-08-02 · **Covers:** the database review and the security work that came out of it

What was agreed, what is done, and what proves it. Every ☑ row names an artifact you can open.
Every ☐ row names the next action and who decides.

---

## Status

| # | Item | Sev | Status | Proof / next action |
|---|---|---|---|---|
| **1** | Cross-tenant feedback disclosure (`list_my_feedback`) | 🔴 Critical | ☑ **closed in prod** | APP 1.5.291 · `f7e96456` · live denial + no-regression both verified |
| **2** | `projecttimeentries.phaseid` missing from production | 🔴 Critical | ☑ **applied** | migration `0062` · verified in `information_schema` |
| **3** | `phaseid` declared foreign key | 🟠 High | ☑ **applied** | `0062` Part 2 · operator-confirmed |
| **4** | Audit trail omitted the requested project | 🟠 High | ☑ **applied + verified** | migration `0061` · confirmed writing in prod |
| **5** | Audit could not attribute tool calls on JSON-RPC transports | 🟡 Med | ☑ **fixed forward** | `extractCallDetails` · 19,976 historic rows stay `NULL` |
| **6** | Schema changes recorded | — | ☑ **filed** | `schema-change-log.md`, 2026-08-02 entry |
| **7** | Report artifacts cleaned + retention rule | — | ☑ **done** | 8.2 MB → 3.7 MB · `docs/db-analysis/README.md` |
| **8** | Stale `latest.pdf` (3h47m older than `latest.md`) | 🟡 Med | ☑ **neutralised** | renamed `SUPERSEDED-*` · **regenerate or delete — your call** |
| **9** | Denials audited as `outcome: success`, HTTP 200 | 🟡 Med | ☐ **open** | set `req.mcpAudit.outcome` in handlers |
| **10** | `ANALYZE` — refresh stale stats; 88 of 129 never analyzed (all ≤50 rows) | 🟡 Med | ☐ **open** | `ANALYZE;` — free, but see the correction in FIX-LIST: the 88 are tiny tables autovacuum correctly skipped |
| **11** | `CREATE EXTENSION pg_stat_statements` | 🟡 Med | ☐ **open** | already preloaded and collecting; nothing can read it |
| **12** | 101 unindexed foreign keys | 🟠 High | ☐ **open** | `CREATE INDEX CONCURRENTLY` — do after #10 |
| **13** | 35,385 orphaned `mcprequestaudit.projectid`, still accruing | 🟠 High | ☐ **open** | **investigate 16 project IDs before any constraint** |
| **14** | `mcprequestaudit.customerid` FK | — | ⛔ **do not apply as written** | report's parent is wrong — see #21 |
| **15** | H-9 — services connect as `rds_superuser` role | 🟠 High | ☑ **DONE 2026-08-02** | app + hosted MCP now connect as `wxkanban_app` (DML-only, owns nothing); zero AWS sources left on `ccscowboy`. Script: `docs/db-analysis/h9-least-privilege-role.sql`. **Unblocks RLS (NEW-5)** |
| **16** | C-2 — committed admin JWTs | 🔴 Critical | ☐ **open** | `public/kanban-redirect.html` is **web-served** |
| **17** | H-1 — unauthenticated Stripe endpoints | 🟠 High | ☐ **open** | add auth; derive `companyId` from session |
| **18** | H-3 / H-6 / H-8 / M-9 | 🟠 High | ☐ **open** | re-verified still open 2026-08-02 |
| **19** | Drift gate blind to column drift | 🟠 High | ☐ **open** | extend to columns, or stop calling green "coverage" |
| **20** | Audit remaining MCP tools taking caller-supplied `projectId` | 🟠 High | ☐ **open** | #1's class is not proven closed |
| **21** | wxDBAnalyze not fit to publish | — | ☐ **blocked** | 5 items below |
| **22** | Fence audit — tasks `043/T018`, `043/T019` don't exist | 🟡 Med | ☐ **open** | **gate flips 2026-08-14** |
| **23** | Local `main` diverges from `origin/main` | — | ☐ **open** | still holds unpushed `ed23ce4a` |

---

## Open items, in the order I'd take them

1. **#9 audit outcome.** Small, and without it #1's detection is only half-built — blocked attacks
   are currently filed as successes.
2. **#10 `ANALYZE`.** Free and worth doing, but **corrected 2026-08-02**: it was listed first on the
   strength of "88 of 129 tables never analyzed", which counted *tables*, not data. All 88 hold
   ≤50 rows and autovacuum skipped them correctly. What `ANALYZE` really buys is fresher stats on
   the large tables and a trustworthy next analyzer run — not a performance change.
3. **#16 C-2, #17 H-1.** Both small, both high value, both open since June.
4. ~~**#15 H-9.**~~ **☑ done 2026-08-02.** Was the largest single reduction in blast radius. Two
   roles created (`wxkanban_app` DML-only, `wxkanban_test` read-only on `public`), both prod
   services cut over and verified by live connection census. **RLS is now unblocked** — the app
   connects as a non-owner, so policies apply without `FORCE ROW LEVEL SECURITY` on 129 tables.
   Start with the 27 `companyid` tables.
5. **#13 orphans.** Investigation, not a fix — find out what those 16 project IDs are first.
6. **#12 the 101 indexes.** Mechanical bulk work; do it after #10 so you can size it properly.
7. **#20 the remaining tools.** #1 was found in one handler. The others were never audited.

---

## ⛔ Do not "fix" these — they are correct as they stand

Recorded so nobody re-opens them from the raw report six months from now.

| Finding | Why it is not a defect |
|---|---|
| 3 × `integrity.cross-tenant` on `feedbacksubmissions` / `companyauditlogs` (53 rows) | The **feedback sink**. All VS Code feedback deliberately routes to one Wxperts-owned project. The tenant "mismatch" is the design — confirmed by the operator |
| `mcprequestaudit.customerid` → `customers` FK | Parent inferred from the column **name** and wrong. `customerid` means *company* here. 100% orphan rate against `customers`, **0%** against `companies`. Applying the report's statement would break every MCP audit write |
| 73 × `performance.unused-index` | Counts are unreliable while 88 tables have no statistics. Revisit after #10, with a week of data |
| 55 empty tables / 36 all-null / 35 high-null columns | Informational. A young product with features not yet used |

---

## Before wxDBAnalyze can be published (#21)

The tool found real problems — `phaseid` precisely, which no existing gate could see. It also
emitted a `critical` / `additive-safe` statement that would have caused an outage. Both are true.

1. **Convention-inferred relationships must not emit executable DDL** at critical/immediate. They
   need their own confidence tier and a "verify the parent" gate.
2. **Add the self-refutation guard** — a ~100% orphan rate invalidates the inference rather than
   escalating the finding.
3. **Intentional-federation annotation** for the cross-tenant rule. Sink and hub architectures are
   common; it will cry wolf on every one.
4. **P1 from the build ledger** — `duplicate-index` fell 7 → 1 with the six lost groups invisible,
   violating the tool's own "exclusions must be visible" rule.
5. **`--apply` / `--dry-run` must refuse**, not accept-and-point-at-docs.

Also outstanding: **there is still no SCOPE-121 scope document**, so the kit would ship a skill with
no scope record.

> The apply machinery itself is well built — default-deny DDL classifier, three-mode policy gate,
> ledger. What it cannot do is validate a finding's *premise*: the bad statement above is perfectly
> well-formed and would classify as `additive-safe`. **Wire apply only after item 1.**

---

## Artifacts

| Artifact | What it proves |
|---|---|
| `project-documentation/SOC2_EVIDENCE_PACK_2026-08-02.md` | Merged app + data-layer posture, mapped to Common Criteria, with the assessed-vs-not boundary stated |
| `docs/db-analysis/FIX-LIST.md` | The prioritised database plan, corrected for false positives |
| `docs/db-analysis/latest.md` + `.snapshot.json` | The 440-finding run underlying all of it |
| `docs/db-analysis/README.md` | Retention rule; the stale-render caution |
| `specs/117-production-schema-integrity/schema-change-log.md` | Both schema changes, with evidence and the drift-gate correction |
| `src/db/migrations/0061`, `0062` | The DDL as applied, each stating its own verification query |
| Commits `2dec1440`, `47851b68` | The access fix and its tests |

**Verification standard used throughout:** every claim here was established by executing against
production or re-reading current source on 2026-08-02. Items carried from the June audit without
re-verification are labelled as such in the SOC 2 pack and are **not** asserted as current.
