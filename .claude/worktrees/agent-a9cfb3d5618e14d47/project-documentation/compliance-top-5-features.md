# Compliance — Top 5 Features per Framework

What wxKanban's compliance capability actually gives you for **SOC 2**, **NIST SSDF (SP 800-218)**
and **ISO/IEC 27001:2022**. Companion to `docs/db-analysis/wxDBAnalyze-top-5-features.md`.

Sources: `_wxAI/rules/compliance-context.md`, `.claude/commands/compliance-scan.md`,
`src/db/schema/appauditconfiguration.ts`, `src/server/services/AuditConfigService.ts`, and the
catalog migrations `0011` (SOC 2), `0014` (NIST SSDF), `0015` (ISO 27001), `0017` (HIPAA),
`0018` (GDPR).

**Coverage boundary, stated up front:** this tool covers the **SDLC slice only**. It does not cover
the ISMS, infrastructure, people or physical controls, and it never calls a generated product
"certified" or "compliant".

---

## Control catalogs at a glance

| Framework | Controls in catalog | Machine-checked (`code_pattern`) | Migration |
| --- | --- | --- | --- |
| SOC 2 | 119 | 12 | `0011_spec112_soc2_check_corpus.sql` |
| NIST SSDF | 42 | 5 | `0014_spec113_nistssdf_catalog.sql` |
| ISO 27001 | 15 of 93 Annex A | 6 | `0015_spec113_iso27001_catalog.sql` |
| HIPAA | 48 | 9 | `0017_spec113_hipaa_catalog.sql` |
| GDPR | 37 | 5 | `0018_spec113_gdpr_catalog.sql` |

The automated counts sit close together on purpose: the evidenceable surface is the *same codebase*
for every framework, so the ceiling is what a pattern can honestly prove — not how many controls the
framework names.

---

# SOC 2

## 1. A 119-control SDLC corpus, per project not per company

Enablement lives on `appauditconfiguration.projectid`, so one company can ship a SOC 2 product and a
non-SOC 2 one side by side. All frameworks are **off by default** (opt-in), and disabling one never
deletes historical audit data.

## 2. Compliance context injected into the build, not bolted on after

`buildscope`, `createSpecs`, `implement`, `compound` and `code-review` each load the active controls
before they start — surfaced during discovery, written into functional requirements, and carried
into a Compliance section of the scope document. The controls come from the wxKanban database over
MCP, never from a local file that would drift.

## 3. 12 machine-checked controls with verified evidence patterns

Change management, separation of duties, access control, audit logging and retention are evaluated
against the actual repository. Patterns are proven before they ship — two were rejected during
authoring for producing **false passes** (an OAuth `prompt: "consent"` literal, and a German locale
string matching a bare `bcrypt` probe).

## 4. Retroactive gap scan with severity and remediation

`/compliance-scan` audits every existing scope, spec and learning against the live ruleset and grades
each gap Critical / High / Medium / Low, with a concrete remediation line per Critical and High —
not a bare metric. It **never removes or weakens** an existing requirement; it only adds or flags.

## 5. Failure halts rather than warns

If frameworks are enabled and the rules cannot be loaded, the run **stops and says so**. It does not
fall back to remembered SOC 2 knowledge and does not treat the failure as "inactive" — work that
looks reviewed and isn't is worse than work never checked. The one carve-out is a subscription
entitlement refusal, reported specifically because the fix is billing, not configuration.

---

# NIST SSDF (SP 800-218 v1.1)

## 1. All four practice groups present — 42 practices, PO / PS / PW / RV

`PO.1.1` through `RV.3.4`, referenced the way an assessor cites them. Prepare the Organization,
Protect the Software, Produce Well-Secured Software, and Respond to Vulnerabilities are each
catalogued rather than sampled.

## 2. Organisational practices are carried as manual controls, not omitted

PO practices that are people-and-process rather than code-observable (training, management
commitment, requirement review cadence) ship as manual controls with `isautomated = false`. The gap
is **visible instead of silent** — the opposite of a toggle that reads as coverage.

## 3. Evidence reuse with SOC 2, recorded in advance

Where an SSDF practice is evidenced by the same code as a SOC 2 criterion, it reuses the **same
verified check pattern**. SOC 2, SSDF and ISO 27001 overlap by roughly 70–80% in the SDLC slice, so
turning SSDF on for a project already running SOC 2 surfaces coverage from evidence you already have.

## 4. Outcome-based framing preserved

SSDF names *what* must be achieved, not the tool that achieves it, and the catalog keeps that shape —
each check states the outcome and what evidences it, so a team using different tooling can still map
to it.

## 5. Practices tagged to lifecycle phase

Every practice carries the SDLC phases it bears on (`design`, `development`, `testing`,
`deployment`), so a phase-scoped context load returns only the practices that touch the work in hand
— a fraction of the tokens a whole framework document costs.

---

# ISO/IEC 27001:2022

## 1. The development slice, named exactly — 15 controls

`A.5.3` (segregation of duties), `A.8.4` (access to source code), `A.8.15` (logging), `A.8.16`
(monitoring), `A.8.24` (cryptography), and `A.8.25`–`A.8.34` (secure development lifecycle, app
security requirements, secure architecture, secure coding, security testing, outsourced development,
environment separation, change management, test information, protection during audit testing).

## 2. The other ~78 Annex A controls are enumerated as out-of-tool

They are listed as **not covered**, not silently absent. This is what makes the output usable as
**Statement of Applicability input** for the covered subset without implying more than it delivers.

## 3. Official control names preserved verbatim for citation

`complianceaudittasks.title` carries the real Annex A control name — that is what the crosswalk and
any evidence export cite. Only in-document headings were reworded, to work around a phase-tagging
parser that a control name like "Secure Development Life Cycle" would otherwise re-tag every
following item with.

## 4. 6 machine-checked controls — the highest automation *ratio* of any framework here

6 of 15, versus SOC 2's 12 of 119. The SDLC slice of ISO 27001 is disproportionately the part a
codebase can actually evidence, which is exactly why this slice was the one built.

## 5. Crosswalk-ready from day one

Every ISO control evidenced by the same code as a SOC 2 criterion or an SSDF practice reuses that
**same verified pattern**. Adding ISO 27001 to a project already running SOC 2 is a mapping exercise
plus a small number of genuinely new checks — against a framework-siloed baseline of roughly 90 new
check definitions.

---

## What is *not* built yet

Stated plainly, because a compliance surface that overstates itself is the failure mode this feature
exists to prevent.

- **No control crosswalk table.** `compliancecontrolmappings` and `compliancecontrolexclusions`
  (SPEC-113 FR-007) exist in the spec and in a migration comment, not in the schema. The shared
  pattern is evaluated once *per framework row* today — correct, but not yet efficient, and there is
  no "check runs once, feeds N frameworks" path.
- **No auditor-ready evidence export.** `GET /api/audit/evidence/:projectid` and
  `POST /api/audit/exclusions` (FR-008) are unbuilt. There is no PDF bundle, no evidenced / gap /
  not-applicable resolution, and no immutable not-applicable record with justification and named
  approver.
- **No `validateScope` compliance awareness** (FR-013). A compliance-enabled project can today ship
  a scope with no Compliance Requirements section and still score clean.
- **SPEC-112 and SPEC-113 both read `phase: design`, 0 of 10 and 0 of 11 tasks complete.** The
  catalogs and per-project enablement landed ahead of their task ledgers; treat the lifecycle files
  as stale rather than the migrations as unapplied.
- **One GDPR check is designed to fail.** Art. 5(1)(c) probes for pseudonymisation or anonymisation
  and nothing in this tree does either. It reports `absent` — a finding, not a broken check.
