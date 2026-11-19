# Scope Analysis — 061 (bug-trapping)

**Mode:** single · **Target:** `specs/Project-Scope/061-bug-trapping.md` · **Analyzer:** `/analyzescope` (adversarial-auditor + mentor persona) · Read-only on the scope doc. *(Self-audit of a freshly-authored scope — graded harder, not easier.)*

061 is structurally complete and convention-clean (correct `SCOPE-061` label, prefixed deps, 7 FRs all with testable acceptance criteria). But the adversarial pass found **two real architecture/security holes the prose glossed** — both worth resolving *before* `createSpecs`, because they change the Technical Sections. **CRITICAL 0 · HIGH 1.**

## Findings

| ID | Severity | Location | Summary | Recommendation |
| -- | -------- | -------- | ------- | -------------- |
| SEC-061-intake | **HIGH** | FR-003 (intake) | `POST /api/errors` is **unauthenticated by design** ("client capture may be pre-auth") and rate-limited only **per-fingerprint, in-memory**. An attacker varies the fingerprint to bypass it → unbounded spam/DoS into the bug sink (and the sink is a real, triaged project). | Add abuse controls independent of fingerprint: per-IP rate-limit, strict payload size cap, an `Origin`/same-site check, and drop (don't 5xx) over-limit. Consider a lightweight unauth nonce/CSRF-style token minted by the app bootstrap. |
| ARCH-061-triage | MEDIUM | Tech §Intake / §Triage; FR-007 | The doc says it "reuses" AI triage (`feedback-triage.ts`) and artifact rendering (`feedback-artifact.ts`) — but **those live in `mcp-server/`**, while the proposed `/api/errors` intake lives in the **app server (`src/server`)**. Different package *and* process. An app-server-written auto-error won't get triage/artifact for free. | Decide explicitly: (a) intake calls the MCP, (b) move/duplicate a minimal triage+artifact path into the app server, or (c) auto-errors skip AI triage (deterministic severity only) and render the artifact app-side. Update the Technical Sections to name the chosen path. |
| DEP-061-sinkreuse | MEDIUM | Tech §Intake; Constraints "Reuse" | `resolveSinkScope` is an **`mcp-server` util**; an `src/server` route can't import it directly. The "reuse sink routing" claim crosses the package boundary. | Spell out the app-side sink write: resolve `FEEDBACK_SINK_PROJECT_ID` (UUID, env) + insert into `feedbacksubmissions` via `src/db/client.ts`, mirroring `resolveSinkScope`'s logic (it's small). Don't imply a direct import. |
| AMB-061-severity | LOW | FR-003 "a default `severity`" | "Default severity" is unspecified — auto-errors need a defined starting severity (and arguably a deterministic bump: server 5xx vs client warning). | Define the default (e.g. `medium`) and any deterministic rule, so it's testable. |
| COV-061-clientsrc | LOW | FR-001 vs User Scenarios | FR-001's four client sources are real, but only the `ErrorBoundary` path is narrated in a scenario (US2). `window` error, `unhandledrejection`, and failed `apiFetch` have acceptance criteria but no story. | Either fold them into a US or accept criteria-only coverage on the record. |

*Why it matters (SEC-061-intake):* an unauthenticated write endpoint that lands rows in a human-triaged project is a spam amplifier — and per-fingerprint limiting is exactly the control an attacker sidesteps by mutating the fingerprint. The fix is to bound the *channel* (IP, size, origin), not just the *signature*. Catch this at scope time and it's three lines of middleware; catch it in prod and it's a flooded sink and an incident.
*Why it matters (ARCH-061-triage):* "reuse the existing pipeline" quietly assumed one process. The manual path is an MCP tool; the auto path is an app route. Naming where triage/artifact actually run now prevents the implement phase from discovering mid-build that the "reused" code isn't reachable — the classic cross-package surprise.

## Section completeness

| Section | Present |
| ------- | ------- |
| Overview / Business Problem | ✅ |
| Core Design table | ✅ |
| User Scenarios (US1–US4) | ✅ |
| Functional Requirements (FR-001–007, all w/ acceptance criteria) | ✅ |
| Technical Sections | ✅ |
| Success Criteria | ✅ |
| Constraints / Out-of-Scope / Dependencies / Notes | ✅ |

## FR ↔ Scenario / Success-Criterion coverage

| FR | Scenario | Success Criterion |
| -- | -------- | ----------------- |
| FR-001 client capture | US2 (ErrorBoundary only) | SC1/SC2 |
| FR-002 server capture | US1 | SC1/SC2 |
| FR-003 intake | US1 (implied) | SC1 |
| FR-004 fingerprint/dedup | US2 | SC3 |
| FR-005 context | US1 | SC6 |
| FR-006 opt-out/fail-open | US4 | SC4/SC5 |
| FR-007 triage reuse | US3 | SC7 |

## Convention & dependency check

- **Numbering** ✅ — correctly self-labels `SCOPE-061`; deps use `SCOPE-043`/`SCOPE-042` (prefixed). No SCOPE/SPEC ambiguity (the lesson from 047 applied).
- **DB naming** ✅ — `source`, `errorfingerprint`, `occurrencecount`, `firstoccurredat`, `lastoccurredat`: lowercase, concatenated, no underscores. Reuses `type='error'`/`source='auto'` cleanly.
- **Dependencies resolve** ✅ — `SCOPE-043` (`043-user-feedback.md`), `SCOPE-042` (`042-vscode-dev-cockpit.md`) exist. But see DEP-061-sinkreuse for the cross-package reuse caveat.

## Metrics

- FRs: **7** · with acceptance criteria: **7/7** (100%) · zero-criteria: **0**
- Findings: **5** — HIGH 1 · MEDIUM 2 · LOW 2 · CRITICAL 0
- Convention/numbering issues: **0**

## Next actions

- **Resolve `SEC-061-intake` + `ARCH-061-triage` before `createSpecs`** — both change the Technical Sections (add intake abuse-controls; name the triage/artifact execution path).
- Fold `DEP-061-sinkreuse` into the same Technical Sections edit (app-side sink write spelled out).
- Optional: define default severity (`AMB`), add client-source scenarios (`COV`).
- Then proceed to `createSpecs`.

*Remediation available on request — I can draft the Technical-Sections edits (intake abuse-controls + the app-vs-MCP triage path + app-side sink write) for your approval before createSpecs.*
