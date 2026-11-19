# Tasks: Conversion Credential Redaction

**Spec**: 125
**Spec ID**: `b9b6771b-2176-400f-8cd1-45a5ca8f7674`
**Total**: 19 tasks
**Created**: 2026-08-10

Fence label for all code produced here: `[SCOPE 125 / Tnnn]`. Labels **must** be `Tnnn` — an
`FR-nnn` label silently fails the `T\d+` regex and registers as unfenced.

---

## Phase A — Module and boundary

- [ ] **T001** — Author `wxconv_redact.py` module and pattern set · `critical`
      FR-001, FR-002. Pattern set as one reviewable data table: keyed quoted literals, the Clarion
      `OWNER()` attribute, and positional credential arguments. Only quoted literals redacted. No
      DOTALL. Dependencies: `re` only, must import without PyMuPDF.
- [ ] **T002** — Unit tests for the pattern set, including negative cases · `critical`
      FR-001, FR-002. One test per pattern class. Negative tests prove unquoted right-hand sides
      survive. Includes the bare `user` key the original report omitted.
- [ ] **T003** — Stable token allocation, in-memory only · `critical`
      FR-003. Same value → same token across the run. Map never serialised to disk.
- [ ] **T004** — Shared `write_text()` funnel helper · `critical`
      FR-007. Single emission boundary. **Must preserve `stamp_markdown` for `.md` paths.**

## Phase B — Reporting surface

- [ ] **T005** — Findings sidecar emitter · `high`
      FR-008. Token, artifact, line, key. **Never a value, in any form.** Header states rotation is
      required, prior disclosure is not undone, and matching is a mitigation not a guarantee.
- [ ] **T006** — Console summary and `--fail-on-secrets` · `high`
      FR-009. Defaults off. Redaction itself is unconditional.
- [ ] **T007** — Read-only `--scan-only` mode · `high`
      FR-010. Modifies nothing. States findings are already-disclosed and rotation is the only remedy.

## Phase C — Family wiring

- [ ] **T008** — wxConversion: wire `pcsoft-doc-split.py` · `critical` · **C-1 HAZARD**
      FR-004. Redaction in `clean_text()` before breadcrumb parsing, plus re-scrub in `write()`.
      **Byte-verify the MOJIBAKE table (lines 51-57) after every edit — lossy rewrite fails silently.**
- [ ] **T009** — wxConversion: route remaining 5 emitters through the funnel · `high`
      FR-004, FR-007. Bare writes at `pcsoft-page-to-react.py:825-826`,
      `pcsoft-schema-to-sql.py:283-284`, plus procs/queries/reports.
- [ ] **T010** — vbConversion: wire all 6 family scripts · `high`
      FR-005. Redaction at the `read_text()` boundary for `.frm`/`.bas`/`.cls`. Leave the existing
      identifier `sanitize()` alone.
- [ ] **T011** — cwConversion: wire all 6 scripts including `OWNER()` · `high`
      FR-006. The owner-attribute pattern fires on essentially every Clarion conversion.

## Phase D — Verification

- [ ] **T012** — Synthetic fixtures for all three platforms plus negative fixture · `high`
      FR-013, C-9. **Synthetic only** — committing a real source export would repeat the defect while
      testing its fix.
- [ ] **T013** — Fidelity regression test · `high`
      FR-013. Manifest **byte-identical** with redaction on and off.
- [ ] **T016** — `auditfences` byte-parity check · `high`
      FR-012. All 9 module copies plus `wxkanban_watermark.py`, plus the fourth divergent copy in
      `Bugs/`. Fails hard in CI. **Also compares each family's `SKILL.md` rule-version marker** and
      emits a message naming the redaction guardrail when it is absent or behind — detection only,
      never rewrites a consumer's `SKILL.md`.

## Phase E — Instruction path and hygiene

- [ ] **T014** — `SKILL.md` AI-authored artifact rule × 3 families · `critical`
      FR-011. Covers the artifact class that actually leaked, by preventing the write. Stated
      positively so the AI does not comply by dropping credential-bearing elements. **Also adds the
      rule-version marker** (checked by T016). **⚠ C-12: this is fast feedback, NOT the control of
      record** — it is delivered by modifying a file the consumer may have customised, so T007 + T006
      must catch the same literal with no `SKILL.md` involvement at all.
- [ ] **T015** — Repository hygiene guidance in `SKILL.md` · `medium`
      FR-014. Guidance only; no consumer gitignore altered. **Documents enabling `--fail-on-secrets`
      in CI as the recommendation, with the invocation shown** — that gate is the layer that holds
      when everything else drifts.

## Phase F — Propagation and release

- [ ] **T017** — Propagate to all 3 trees, verify LF and encoding · `high`
      C-1, C-8, FR-012. 54 scripts, 9 modules, 9 `SKILL.md`.
- [ ] **T018** — Cut kit release and **explicitly verify** assets · `high`
      FR-015. "Release cut" is not sufficient evidence of reach. Blocked on / rides the outstanding
      SCOPE-124 release.
- [ ] **T019** — Answer and close feedback `f99e80aa` · `high`
      FR-015. Name the shipped version; credit what verification confirmed; state the two corrections;
      reiterate that rotation remains necessary.

## Amendment A — field-reported matcher gaps (feedback `7d2ac1b9`)

Two gaps found during a live PCSoft WinDev Mobile conversion, both of which let the same real SMS
gateway authorization token sit unredacted in `pre-convert/` output while the conversion reported
success. Reported with a working fix and confirmed evidence; re-derived and hardened here.

- [x] **T020** — Close both matcher gaps in `wxconv_redact.py` · `critical`
      **Gap 1 — `authorization`/`auth` absent from `CRED_KEYS` entirely.** A field named
      `CompanyDetail.SMSPortal_Authorization` was invisible to every matcher in the module, despite
      being about as credential-shaped as a name gets. Bare `auth` is safe alongside it because
      `KEYED_RE` requires an assignment immediately after the key, so `Author = "..."` and
      `authcode = "..."` still do not match.
      **Gap 2 — credential smuggled into a non-credential-shaped field.** A value routed through an
      unrelated field as a workaround (`MyMessage.Subject = "<token>"`) with the field it belonged in
      left behind in an adjacent comment (`//CompanyDetail.SMSPortal_Authorization`). `KEYED_RE`
      cannot see this: the assignment's own key is innocuous and only the comment gives it away.
      Added `_comment_key()` / `_adjacent_comment_key()`, wired into the existing single `QUOTED_RE`
      pass. Checks the literal's own line then the line below it; `//`, `'`, `!` and `--` markers.
      **Deliberately narrower than the reported fix:** the comment body must be a SINGLE bare field
      reference. The victim literal is chosen by the comment rather than by the assignment, so
      `// move the password to config` beside `Const APP_NAME = "MyApp"` must not blank out `MyApp`.
      The key must also end its identifier component, so `//Customer.UserName` is rejected — the
      `=` gives `KEYED_RE` that check for free, and here it is explicit.
      10 regression tests added (6 fail against the pre-fix module; the 4 negatives pass both ways,
      which is what pins the fix from over-reaching). Suite 40 -> 50, green in all 9 script dirs.
      Propagated to all 9 copies, byte-identical, LF and UTF-8 preserved.
- [x] **T021** — `SKILL.md` guidance for the shape the scripts deliberately do not catch · `high`
      C-12 again: the scripts are one layer and the AI writing artifacts by hand is the other. A
      comment carrying prose around a credential-shaped field name is left to the AI on purpose, so
      the AI has to be told the shape exists. Added to all 3 families x 3 trees, CRLF preserved.
- [x] **T022** — Answer feedback `7d2ac1b9` · `high`
      Resolved 2026-08-20, submitter notified. Note names the shipping vehicle (Sunday 2026-08-23
      release) because there is still no fix-version field, credits the reporter's patch, and states
      the one deliberate narrowing from it — prose comments are left alone on purpose, so a field
      reference trailed by prose is NOT caught. Reiterates that the token still needs rotating:
      redaction from here does not undo a disclosure that already happened.
- [ ] **T023** — Cut the kit release · `critical` · **SUNDAY 2026-08-23**
      **The feedback is answered ahead of the release, so the note is a promise until this ships.**
      Consumers still have both gaps until they upgrade. Rides the same release as T018 and the
      outstanding SCOPE-124 cut. Verify assets on GitHub Releases explicitly — "release cut" is not
      evidence of reach (the T018 lesson), and both kit channels must carry it.

---

---

## Dependency notes

- T004 gates all of Phase C — six target scripts have no write boundary to hook until it exists.
- T012 gates T013 and contributes to metric 5.
- T017 gates T018; T018 gates T019.
- T008 may proceed in parallel with Phase B but carries the C-1 encoding hazard throughout.
