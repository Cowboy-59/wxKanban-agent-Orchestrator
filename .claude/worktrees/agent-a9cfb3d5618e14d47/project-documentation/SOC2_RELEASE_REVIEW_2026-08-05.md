# SOC 2 Release Review — wxKanban, 2026-08-05

**Date:** 2026-08-05
**Framework:** SOC 2 Trust Services Criteria — Common Criteria (Security)
**Relationship to the status of record:** this is an **addendum** to
[`SOC2_EVIDENCE_PACK_2026-08-02.md`](./SOC2_EVIDENCE_PACK_2026-08-02.md), not a replacement. That
pack remains the status of record for the estate. This document covers one thing: the change set
staged for deployment on 2026-08-05, the one new finding it remediates, and the control impact of
shipping it.

**Trigger.** A pre-deployment compliance review, requested before the pending commits are pushed. It
is not a periodic assessment and does not re-verify carried findings.

> **Status legend:** ☑ remediated · ☐ open · ◐ partially addressed
> **Verified legend:** `live` = executed against production today · `code` = read in source today ·
> `carried` = taken from the 2026-08-02 pack, **not** re-verified here

---

## 1. Executive summary

Nine commits are staged on `main` and not yet pushed. Pushing deploys two things at once: the hosted
MCP server (which auto-deploys on push to `main`) and the production application.

The change set contains **one security remediation**, recorded here as **NEW-12** — a cross-tenant
identity-resolution defect in `project.buildscope` that returned one tenant's scope short-name to
another. It was found during scope authoring on 2026-08-05, verified against production, fixed, and
verified again. It is not in any prior pack.

Everything else in the change set is documentation, packaging and tooling. None of it changes an
authentication path, an authorisation check, a data-retention behaviour, or an encryption boundary.

**Net control posture: improved.** One access-control defect closed; none introduced. No open
finding from the 2026-08-02 pack is closed by this release, and none is worsened.

### Posture at a glance

| | |
|---|---|
| New findings in this review | 1 (NEW-12) |
| New findings remediated before deployment | 1 (NEW-12) |
| Findings from the 2026-08-02 pack closed by this release | 0 |
| Findings from the 2026-08-02 pack worsened by this release | 0 |
| New authentication / authorisation code paths | 0 |
| Schema changes (DDL) | 0 |

---

## 2. NEW-12 — cross-tenant scope identity disclosure in `project.buildscope` · ☑ remediated · verified `live`

**Severity: Medium.** Confidentiality impact is **Low** — the only value that crossed the boundary
was a scope short-name (a URL-style slug), never document content, customer data or credentials.
Access-control impact is **High** — a tenant-scoped operation resolved its subject from a shared
resource with no tenant key at all, which is a structural failure of CC6.1 regardless of payload
size. It is recorded at the higher of the two reasons for the finding and the lower for notification
purposes; see *Notification assessment* below.

**Criteria affected:** CC6.1 (logical access — the entity restricts logical access to protected
information assets), CC8.1 (change management — the defect was introduced by a change that predates
the current review discipline).

### What it was

`project.buildscope`, called with `editSpecNumber`, resolved *which* scope it was editing by listing
a directory:

```js
readdirSync(scopeDir).find((name) => name.startsWith(`${specNumber}-`) && name.endsWith('.md'))
```

`scopeDir` is `join(resolveWorkspaceRoot(), 'specs', 'Project-Scope')` — **a path containing no
project identifier**. On the hosted MCP there is no per-customer filesystem, so this resolved
against the server's own workspace: the wxKanban repository. Any consumer editing scope `NNN`
received whatever `NNN-*.md` happened to exist in our tree.

### Proof of exposure

Reported by a customer as a functional defect, not a security one — feedback `a6734641`, origin
project `aeff2578-7dd1-4001-b6c1-bad878bece98`, filed 2026-08-03. They created scope 016 and were
returned `shortName: "single-shared-top-bar-app"`. They called again with `editSpecNumber: '016'`
and were returned:

```json
{ "shortName": "scope-help", "filePath": "specs/Project-Scope/016-scope-help.md" }
```

`specs/Project-Scope/016-scope-help.md` exists in **this repository**. The customer received the
short-name of a wxKanban internal scope and a file path pointing at it. They described it as "the
edit path regenerates a nonsensical short-name"; it was not regenerating anything.

### Exposure bounding — `live`, from `mcprequestaudit`

The audit table retains 2026-05-20 → 2026-08-05 (447,995 rows). Over that window:

| Measure | Value |
|---|---|
| `project.buildscope` calls, all projects | 44 |
| Distinct projects | 10 |
| Distinct customers | 8 |
| First / last seen | 2026-06-01 / 2026-08-05 |
| Outcome split | 36 × `success`/200, 8 × `error`/500 |
| Calls from wxKanban's own project | 2 |

**Upper bound on exposure: 42 calls across 9 external projects and 7 external customers.** This is a
bound, not a count. `mcprequestaudit` records the tool name but **not its arguments**, so it cannot
distinguish a create call from an edit call, and only edit calls resolved against the shared
directory. The true figure is at or below the bound and cannot be recovered from existing telemetry.

The 8 × 500 responses are consistent with the pre-fix `throw new Error(\`Scope ${specNumber} not
found...\`)` firing when our repository had no file of that number — i.e. a consumer being refused an
edit of their own scope because *our* tree lacked it. That is an interpretation, not a measurement;
the audit record does not carry the error message.

### Root-cause classification

Not a novel error. This is the **same defect class already fixed once, in the adjacent code path**.
`server.ts:3508` carries the comment:

> `[SCOPE 089] per-project DB numbering (was global-filesystem → every new project got 092)`

Spec *numbering* was moved off the shared filesystem to per-project database allocation. Spec
*identity* was left on the old mechanism. The remediation completes that migration.

A contributing factor worth recording: `generateNextSpecNumber` documents its filesystem branch as
*"Local kit-author fallback ONLY (no projectId or DB unreachable). On the hosted server projectId is
always present, so this path never runs there."* The same reasoning was never applied to the edit
path, and because local testing always exercises the fallback, **local verification could not have
caught this**.

### Remediation

Commit `316ffef4`, `mcp-server/src/utils/project-kit.ts`. Identity now resolves against
`(projectId, specNumber)` — already the unique key `idx_projectspec_project_specnumber` on
`projectspecifications`. The filesystem branch survives only where `projectId` is absent, which is
the local kit-author path and never the hosted server. A caller whose project has no such scope now
receives a per-project not-found naming their own scope numbers.

**Verification — `live`, against production data, two tenants at the same spec number:**

| Case | Before | After |
|---|---|---|
| wxKanban project, spec 016 | `016-scope-help` | resolves to our own record |
| **Reporter's project, spec 016** | **`016-scope-help` — our scope** | `Scope 016 not found in this project. Scopes in this project: 001, 002, …` |
| Reporter's project, spec 012 | — | `012-admin-impersonation` — their own scope |
| No `projectId` (local kit author) | `016-scope-help` | unchanged |

Full `mcp-server` suite run before and after the change: 14 failures in both runs, all pre-existing
and unrelated (DB-integration and scope-flow tests that fail identically at `HEAD`).

### Notification assessment

**No customer notification is recommended on confidentiality grounds.** The disclosed value is a
scope short-name — an internal slug such as `scope-help`. No document content, customer data,
credentials or personal data crossed the boundary. The disclosure is one-directional (wxKanban → the
caller), and the only known recipient already reported it to us.

The affected reporter (`a6734641`) **should** receive a correction as part of the normal feedback
reply, explaining that the "nonsensical short-name" was our defect and is fixed. That is a support
obligation, not a breach notification.

### Residual risk · ◐

With no `shortName` column on `projectspecifications`, the fix derives the file name from the spec's
`title`. This is deterministic and tenant-scoped, but need not match the file name the client wrote
at creation, which derives from `featureDescription`. Observed during verification: our own spec 016
has DB title *"Spec 016: wxKanban Online Help"* → `016-spec-016-wxkanban-online-help.md`, while the
file on disk is `016-scope-help.md`.

This is a **correctness** residual, not a security one — no tenant boundary is involved. It is
recorded as a known limitation in SCOPE-124 and its durable fix (storing the slug on the record)
requires DDL and a separate decision.

---

## 3. Change inventory — CC8.1 change management

Nine commits staged. Two delivery paths, which matters for control assessment: `mcp-server/` deploys
to the hosted MCP on push with no customer action, while `wxkanban-agent/` reaches customers only
through a kit release.

| Commit | Content | Security relevance |
|---|---|---|
| `316ffef4` | NEW-12 remediation | **Remediation.** See §2 |
| `900ae1ab` | `release-warden` agent + `CLAUDE_AUTHOR_ONLY_DIRS` sync guard | **Preventive.** See below |
| `31e20663` | SCOPE-123, SCOPE-124 scope documents | None — documentation |
| `50558ebd`, `4803bd52`, `6c4e67aa` | SCOPE-121 kit packaging + task status | None — packaging |
| `c9430e88` | SCOPE-098 Amendment A spec text | None — documentation |
| `06f338ac` | Restore Constitution IV enforcement in `.husky/pre-commit` | **Preventive.** Restores a governance gate |
| `76c498c1` | SCOPE-095/T007 `kit:configure` registration | None — command registration |

**No commit in this set** adds or modifies an authentication path, an authorisation check, a
retention or deletion behaviour, an encryption boundary, or a database schema object.

### A prevented disclosure, recorded as evidence of working controls

While preparing `900ae1ab`, the `release-warden` agent definition — which contains wxKanban's
internal vendor-triage process and the hard-coded feedback-sink project ID
`ba924193-0335-4080-9fa6-33cd6b81300a` — was found to be publishable by default. The kit sync ships
**every** `.claude/<dir>` containing any file, and a kit release is a public GitHub release.

Two controls engaged, in order:

1. The **untracked-content guard** (added after a prior incident of this class) flagged the directory
   before it could be mirrored.
2. An explicit `CLAUDE_AUTHOR_ONLY_DIRS` exclusion was added in the same commit so the file stays out
   once tracked. Verified `live`: the sync dry-run now lists 23 mirrored entries and **zero** matches
   for `agents`.

Recorded because it evidences a preventive control operating as designed, and because the same
hazard class — *the sync mirrors the filesystem, not git* — has now produced findings twice.

---

## 4. Open findings — unchanged by this release · `carried`

None of the following is closed, worsened, or otherwise affected. Statuses are carried from the
2026-08-02 pack and its 2026-08-04 re-verification and are **not** re-verified here.

| ID | Finding | Status |
|---|---|---|
| NEW-3 | Denials audited as successes | ◐ closed for ~99.88% of traffic on branch `scope-043-amendment-d`, **not deployed**; `/messages` (0.12%) architecturally uncovered |
| NEW-4 | Drift gate is table-level only, cannot see column drift | ☐ open |
| NEW-5 | No database-level tenant isolation — 129 public tables, 0 with RLS | ☐ open (architectural, sequenced) |
| NEW-9 | `list_my_feedback` 500s — correct denials mis-surfaced | ☑ fixed on `scope-043-amendment-d`, **not deployed** |
| NEW-11 | 218 active MCP tokens across 90 projects, no recertification | ☐ open |
| H-5 | Shell injection via server-supplied `branchName` in the VS Code extension | ☐ open |
| H-6 | PM tokens stored plaintext (blast radius zero — table is empty) | ☐ open |
| H-7 | JWT in `localStorage`; unsanitised `marked.parse`; mermaid `securityLevel:'loose'` | ☐ open |
| H-8 | `rejectUnauthorized:false` — prod cert chain genuinely self-signed | ☐ open |
| M-3 | Secrets are plain App Runner environment variables | ☐ open |
| M-9 | No rate limit on `/signin` | ☐ open |

**Note for the auditor.** NEW-9 and the NEW-3 partial fix are committed on a branch and **not
deployed**. This release does not carry them. A reader comparing "fixed" claims against production
behaviour will find them absent, and that is expected.

---

## 5. Deployment considerations

**One-motion deploy.** Pushing `main` deploys the hosted MCP *and* the production application
together. The NEW-12 remediation is MCP-side and reaches every customer with no upgrade on their
part; the kit-side changes in this set do not reach customers until a kit release is cut.

**Post-deployment verification** (recommended, none blocking):

- [ ] Confirm `project.buildscope` with `editSpecNumber` against a customer project returns that
      project's own scope or a per-project not-found — the §2 verification, re-run against the
      deployed server rather than a local process
- [ ] Confirm the `mcprequestaudit` outcome split for `project.buildscope` no longer shows 500s
      attributable to cross-project resolution
- [ ] Confirm no regression in `project.create_specs`, which shares `project-kit.ts`

**Rollback.** The remediation is a single self-contained function plus one import; reverting
`316ffef4` restores prior behaviour. No data migration, no schema change, nothing to unwind.

---

## 6. Reproducing this evidence

- **NEW-12 exposure figures** — `SELECT count(*), count(DISTINCT projectid), count(DISTINCT
  customerid) FROM mcprequestaudit WHERE tool = 'project.buildscope'`, plus the outcome split grouped
  by `outcome, responsestatus`. Read-only.
- **NEW-12 defect and fix** — `git show 316ffef4`; the pre-fix behaviour is the deleted
  `readdirSync(scopeDir).find(...)` block.
- **NEW-12 remediation proof** — call `buildScope` with `editSpecNumber` for two different
  `projectId` values at the same spec number and confirm the results differ. Must be run against the
  hosted server or with a live `projectId`; a local run without one exercises the kit-author fallback
  and demonstrates nothing.
- **Sync exclusion** — `node scripts/sync-to-orchestrator.mjs --dry-run` and confirm no `.claude/agents`
  entry appears in the mirror plan.
- **Test baseline** — `npx vitest run` in `mcp-server/` at `316ffef4` and at its parent; both report
  14 failures.

---

## 7. Limitations of this review

This is a change-scoped review, not an assessment. It does **not** re-verify any carried finding, does
not cover the application layer beyond the commits listed, and does not include a data-layer
analysis. The 2026-08-02 evidence pack remains the status of record.

The NEW-12 exposure figure is an **upper bound**, not a count, because `mcprequestaudit` does not
record tool arguments. Establishing a true count would require argument-level audit capture, which
does not exist today and would itself need a privacy review before being added.
