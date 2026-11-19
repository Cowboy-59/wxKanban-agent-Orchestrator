# Tasks: Spec 118 — Fence Audit Gate Restoration

**Spec**: `specs/118-fence-audit-gate-restoration/spec.md`
**Scope**: `specs/Project-Scope/118-fence-audit-gate-restoration.md`
**Total**: 9 tasks

> Measured baseline, 2026-07-31 on `main`: **1,893 errors / 4,074 files scanned / 839 fences**.
> Of those errors: **885** in gitignored paths, **~795** genuine `UNFENCED_DECL`, **213** `UNKNOWN_TASK`.

---

## Phase 1 — Correct the scanning boundary

- [ ] **T001** — Make the fence scanner honour `.gitignore` *(FR-001, high)*
  `auditfences-scanner.ts` walks the filesystem and audits 885 declarations inside `.agents/`,
  `.claude/` and `.history/` — all already listed in `.gitignore`. Teach `shouldIgnore` to consult
  `.gitignore`, keeping `DEFAULT_IGNORE` as the floor for projects with none. Fixes the defect
  class rather than adding two directory names; kit sync had the same filesystem-vs-git bug.

- [ ] **T002** — Verify no project file silently drops out of audit scope *(FR-001, critical)*
  Honouring `.gitignore` makes the gate **quieter**, which is the dangerous direction. Capture the
  scanned-file list before and after (baseline 4,074) and confirm every project source file is
  still audited. Any file that disappears must be justified, not assumed.

## Phase 2 — Separate the signal

- [ ] **T003** — Classify `UNKNOWN_TASK` under a distinct code, demote to warning *(FR-003, high)*
  213 findings are fences citing task IDs that don't resolve. Broken references, not missing
  fences — the remedy differs. Distinct code, remedy stated in output, demoted pending triage.

- [ ] **T004** — Extend the legacy baseline with a dated, queryable record *(FR-002, high)*
  Capture the remaining ~795 violations into `.wxai/auditfences-legacy.json` with a date and count,
  recording **what** was deferred rather than only hashes. The current baseline stores hashes,
  which suppresses but cannot answer "what do we still owe?". Extend the 2026-05-13 baseline of
  2,759 entries; do not replace it.

## Phase 3 — Prove and stage the gate

- [ ] **T005** — Prove the gate: green on main, red on an induced violation *(FR-004, critical)*
  Confirm exit 0 after T001–T004, then add an intentionally un-fenced declaration and confirm
  non-zero exit **naming that declaration**. Same fail-first proof SCOPE-117 required: a gate
  observed only passing is as unproven as one observed only failing.

- [ ] **T006** — Run the fence job non-blocking, recording would-block outcomes *(FR-004, high)*
  Per operator decision the gate reports without failing the build for one release cycle. It must
  still record whether it **would** have blocked, so the advisory period produces evidence rather
  than silence. `schema-drift` stays blocking and must no longer be masked by a red sibling.

- [ ] **T007** — Record the flip-to-blocking trigger with a review date *(FR-004 / C-3, high)*
  A warning-only gate has the same credibility problem this scope exists to fix. Record the trigger
  (one release cycle, zero false positives), name the release boundary, set a review date. Without
  this, "advisory for one release" quietly becomes permanent — the exact pathology being corrected.

## Phase 4 — Ship safely to consumers

- [ ] **T008** — Verify consumer projects do not lose audit coverage *(FR-005, critical)*
  The scanner ships to every consumer, so this change propagates silently. Verify against at least
  one consumer that no previously-audited file stops being audited, and that behaviour is unchanged
  for a consumer with no `.gitignore`. A consumer whose build output lands in a gitignored path
  must not lose coverage of its own source.

- [ ] **T009** — Ship the scanner change via the normal kit release *(FR-005 / C-6, medium)*
  Release through the standard kit process so consumers are not altered mid-version, and so the
  version carrying the quieter gate is identifiable if coverage questions arise later.

---

## Safety gates

- [ ] Scanned-file count compared before and after — the gate must not go quiet unnoticed (T002)
- [ ] Gate observed **failing** on an induced violation before being trusted (T005)
- [ ] Flip-to-blocking trigger recorded with a named release boundary (T007)
- [ ] At least one consumer verified before the kit release (T008)
- [ ] No fence hand-authored — orchestrator only (C-5)
