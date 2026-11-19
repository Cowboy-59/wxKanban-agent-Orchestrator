# Scope Analysis — 038 (consulting-marketplace)

**Mode:** single · **Target:** `specs/Project-Scope/038-consulting-marketplace.md` · **Analyzer:** `/analyzescope` (adversarial-auditor + mentor persona) · Read-only on the scope doc.

038 is a **deliberate charter stub** (`Status: charter` — "not yet ready for createSpecs"), split out of the 037 conversation to keep 037 shippable. So this audit grades it as a *charter* (intent, boundaries, dependencies, graduation-readiness) — **not** against the full FR/scenario structure a charter intentionally defers. On those terms it's a clean, well-bounded charter; the findings are convention fixes plus the work required to graduate it.

## Findings

| ID | Severity | Location | Summary | Recommendation |
| -- | -------- | -------- | ------- | -------------- |
| NUM-038-self | MEDIUM | L1, L3 `# Spec 038…` / `**Spec Number**: 038` | Self-labels "Spec 038" but lives at `Project-Scope/038` — it's a **SCOPE**, not a SPEC. No active integer twin today, but the bare/wrong label invites the SCOPE/SPEC ambiguity `CLAUDE.md` forbids. | Relabel `# SCOPE-038` / `**Scope Number**: SCOPE-038`. |
| CONV-038-deps | MEDIUM | `Depends On: 037`; Out-of-Scope `→ 039/040/041`; "spec 039 background-check" | Cross-references use bare numbers (`037`, `039`, `040`, `041`). | Write `SCOPE-037` / `SCOPE-039` / `SCOPE-040` / `SCOPE-041`. |
| STRUCT-038-graduation | INFO | whole doc | Charter lacks the full-scope sections (Core Design table, User Scenarios, FR-NNN with acceptance criteria, Success Criteria, Technical). **Expected** at charter stage — listed as the graduation checklist, not a defect. | Before `createSpecs`: run interactive `buildscope` to add Core Design, US1–N, FRs+acceptance criteria, Success Criteria, Data/Schema (profiles, reviews, ratings tables). |
| OQ-038-blockers | LOW | "Open Questions" (L32–L37) | Four unresolved questions — reviews-tied-to-completed-engagement, hide-vs-editorial moderation, tenant-tier gating, fake-review/review-bombing abuse story. Correctly parked, but each is a **design fork** that materially changes the schema/UI. | Treat all four as graduation gates; resolve at buildscope before any FRs are written. |
| META-038-reviewed | LOW | header | No `Last Reviewed` line (047/048 carry one). | Add `Last Reviewed` when buildscope next touches it. |

*Why it matters (NUM-038-self):* a charter that graduates inherits its own header into the spec — fix the label now and every downstream spec/commit/fence cites it unambiguously; leave it and you're renaming across artifacts later.
*Why it matters (OQ-038-blockers):* these aren't wording nits — "reviews on completed engagements only" vs "any state", and "editorial vs company-hideable", each imply a *different data model and trust story*. Resolved at charter→spec they cost a sentence; discovered mid-implementation they cost a migration.

## Charter completeness (graded as a charter, not a full scope)

| Charter element | Present |
| --------------- | ------- |
| Purpose / problem (Charter) | ✅ |
| Relationship to parent scope (037 split rationale) | ✅ |
| In-Scope (planned) | ✅ |
| Out-of-Scope w/ destinations | ✅ |
| Open Questions (named, not hand-waved) | ✅ |
| Provenance / Reference | ✅ |
| — full-scope structure (FRs, scenarios, success criteria) | ⏳ deferred by design (graduation work) |

## Dependency & boundary check (single-doc)

- **Depends On 037** — resolves ✅ (`037-consultant-mgmt.md` exists; Consultants Management shipped). Dependency direction is sound (marketplace builds on Engagement Core).
- **Deferrals point to real owners** — `039` (engagement-presales), `040` (marketplace-payments), `041` (cross-engagement-reporting) all exist as scopes ✅. **No orphaned deferrals** — this is the *correct* pattern: every "out of scope → NNN" hands off to a scope that actually owns it (contrast the orphaned-deferral smell flagged elsewhere). Nicely done.
- **Scope boundary** is crisp: marketplace surface explicitly *not* required for 037's invite-by-email path.

## Metrics

- Doc type: **charter stub** · required charter elements present: **6/6** ✅
- FRs: 0 (expected at charter) · Open questions (graduation gates): **4**
- Findings: **5** — MEDIUM 2 · LOW 2 · INFO 1 · **CRITICAL 0 · HIGH 0**

## Next actions

- Cheap now: fix **NUM-038-self** + **CONV-038-deps** (relabel SCOPE-038, prefix dep numbers).
- Before `createSpecs`: resolve the 4 Open Questions in an interactive `buildscope`, then add the full-scope structure (Core Design, scenarios, FRs+criteria, success criteria, schema for profiles/reviews/ratings).
- No blocker to leaving 038 parked as a charter — it's correctly bounded and its deferrals are owned.

*Remediation available on request — say the word and I'll draft the header relabel + dep-prefix edits (read-only until you approve).*
