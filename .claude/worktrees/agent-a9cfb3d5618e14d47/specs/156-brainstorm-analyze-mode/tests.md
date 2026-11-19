# Test Plan: Brainstorm Analyze Mode

**Spec Number**: 156 (implements SCOPE-156)
**Date Generated**: 2026-11-08
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Test Strategy

| Layer | Framework | Coverage Target |
|---|---|---|
| Findings helper | Vitest (`tests/unit/brainstormAnalyzeFindings.test.ts`) | Record shape, merge, fingerprint, evidence hash, compare, cross-app, check, write guards (FR-006, FR-008, FR-009, FR-011, FR-012) |
| Analyzer collect-only modes | Owner run on the trial app | Zero questions, zero edits, findings file written (FR-004, SC-2) |
| Analyze sitting | Owner run on the trial conversion | Feature groups first, plan shown, review complete, files saved (FR-001 – FR-008, SC-1) |
| Re-run / cross-app / database | Owner runs | FR-009, FR-011, FR-012, SC-3 – SC-5 |
| Panel conduct | Test brainstorm | FR-014, SC-6 |
| Kit | Sync dry-run + consumer end-to-end | FR-015, SC-7 |

## Cases

| # | Case | FR | Expected |
|---|------|----|----------|
| 1 | `--analyze --dir <missing folder>` | FR-001 | One plain error line; nothing runs |
| 2 | Sitting starts | FR-002 | Feature groups proposed and approved before any finding is shown |
| 3 | A finding has no matching feature | FR-002 | Listed under "Unplaced", not dropped |
| 4 | Analyzer plan shown | FR-003 | Every analyzer listed with class, model and time limit; nothing launches without the owner's go |
| 5 | wxUIUXCodeReview `--audit --collect-only` | FR-004, SC-2 | One pass, findings file written, 0 questions, 0 file edits |
| 6 | wxConversionParity `--collect-only` | FR-004, SC-2 | Every element, all three levels, findings file written, 0 questions, 0 edits |
| 7 | analyzecode `--collect-only` | FR-004 | Steps 0-2 only; step 3 never entered |
| 8 | The same three tools without `--collect-only` | FR-004 | Behavior unchanged from today |
| 9 | An analyzer times out, errors, or asks for input | FR-005 | Listed "not checked" with the reason; sitting continues |
| 10 | Two analyzers report the same problem | FR-006 | One finding crediting both |
| 11 | A panel idea with no citation | FR-006 | Labeled Assumed |
| 12 | Close attempted with one undecided finding | FR-007 | `check` refuses; sitting stays open |
| 13 | A finding is declined | FR-007 | Reason saved with date and who decided |
| 14 | Write of a credential-looking value, personal data, or a row value | FR-008, FR-011, SC-5 | Helper refuses the write |
| 15 | Flagged block moved by N lines | FR-009 | Fingerprint unchanged |
| 16 | Re-run after one fix | FR-009, SC-3 | Fixed / new / still open marked correctly |
| 17 | Declined finding, evidence unchanged / changed | FR-009, SC-3 | Not shown / shown again |
| 18 | Agreed items offered to `/buildscope --from-md` | FR-010 | Runs only on the owner's go; analyze writes no scope |
| 19 | App repo without `ledger.mjs` | FR-010 | Report says the ledger is not installed there |
| 20 | Database check off (default) | FR-011, SC-5 | wxDBAnalyze not run; report says not checked |
| 21 | Database check on | FR-011, SC-5 | Read-only guard only; names and counts kept; 0 row values saved |
| 22 | Cross-app on two apps sharing a rule | FR-012, SC-4 | One converter scope proposal listing both labels |
| 23 | A rule in only one app | FR-012, SC-4 | Not proposed |
| 24 | Cross-app pass | FR-012 | Other repos' data files unchanged |
| 25 | `--resume` on an open sitting | FR-013 | Continues at the next undecided finding; analyzers not re-run |
| 26 | Brainstorm on "a scheduler for jobs" | FR-014, SC-6 | Must-have and optional list; 0 questions about schedule types |
| 27 | Kit sync dry-run | FR-015 | `references/analyze.md`, `scripts/analyze-findings.mjs`, wxICA template and both command stubs listed |
| 28 | Consumer repo end to end | FR-015, SC-7 | `/wxBrainstorm --analyze` from the real entrance to a saved report |

## Evidence

Implementation (T001 – T019) landed 2026-11-08. Owner runs (T020: SC-1 – SC-6) and the consumer
end-to-end check (T021: SC-7) are still open.

| Case | Status | Evidence |
|---|---|---|
| 1 | Written | `.claude/skills/wxBrainstorm/SKILL.md` § Workflow (analyze branch), `references/analyze.md` § 1 |
| 2, 3 | Unit + written | `references/analyze.md` § 2; Unplaced: helper `mergeFindings`, unit test "unplaced"; CLI run: `feature: "Nowhere"` became `Unplaced` |
| 4 | Written | `references/analyze.md` § 3 (plan table, owner's go) |
| 5 – 8 | Written; owner run open (T020) | `mcp-server/src/prompts/wxuiuxcodereview.md` § collect-only, `mcp-server/src/prompts/wxconversionparity.md` § collect-only, `wxkanban-agent/templates/skills/wxICA/SKILL.md` § collect-only. Interactive text unchanged (additive edits only) |
| 9 | Unit + written | Analyzer `checked: false` with its reason (unit test); `references/analyze.md` § 5 |
| 10, 11 | Unit | Merge credits both analyzers; panel idea defaults to Assumed |
| 12, 13 | Unit + CLI | `check` exit 2 with an undecided finding; `decide not-needed` without `--reason` refused; `decidedAt` / `decidedBy` set |
| 14 | Unit + CLI | Eight guard refusals (credential, bearer, AKIA, PEM, `user:pass@`, email, phone, SSN) and the row-value key; merge refusal writes nothing |
| 15 | Unit | Fingerprint unchanged after a 40-line move |
| 16, 17 | Unit + CLI; owner run open (SC-3) | `compare` on the CLI: `stillOpen 1, previouslyDeclined 1, resurfaced 0`; resurface on a changed hash (unit test) |
| 18, 19 | Written | `references/analyze.md` § 11 (hand-off only on the owner's go, before `close`; "Ledger not installed" line) |
| 20, 21 | Written + T013 evidence | `references/analyze.md` § 4; T013 notes in `tasks.md` (2026-08-02 production run: names and counts only, guard passes) |
| 22 – 24 | Unit + CLI; owner run open (SC-4) | `cross-app` proposes only rules in 2+ apps and writes nothing |
| 25 | Written + CLI | `references/analyze.md` § 8; `decide` refused once closed |
| 26 | Written; owner run open (SC-6) | `references/panel.md` § Propose the complete version, `references/conduct.md` § Discussion rules |
| 27 | Done | Kit sync dry-run (`--allow-untracked`, writes nothing) mirrors `.claude/skills/wxBrainstorm/`, `.claude/skills/wxUIUXCodeReview/`, `.claude/commands/`, `_wxAI/`, `wxkanban-agent/`; neither `copyFilter` nor `build-release.mjs` excludes nested `references/` or `scripts/` |
| 28 | Open (T021) | After Andy publishes the kit |

Unit suite: `npx vitest run tests/unit/brainstormAnalyzeFindings.test.ts`, 27 of 27 pass.
Help: `public/manual/cmd-wxbrainstorm.html` shows `--analyze`, `--analyze --conversion` and
`--analyze --cross-app`; `--collect-only` is shown on the analyzecode, wxConversionParity and
wxUIUXCodeReview pages.
