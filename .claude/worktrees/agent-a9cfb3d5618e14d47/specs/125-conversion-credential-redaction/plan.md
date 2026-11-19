# Plan: Conversion Credential Redaction

**Spec**: 125
**Status**: `implementing`
**Created**: 2026-08-10
**Spec ID**: `b9b6771b-2176-400f-8cd1-45a5ca8f7674`

---

## Approach

Build the boundary before wiring anything to it. The defect exists because credential handling has no
owner across eighteen scripts per tree; wiring redaction into each script individually would fix the
symptom and leave the architecture that produced it. So the module and the write funnel come first,
then each family is routed through them, then the guards that stop it recurring.

## Phases

### Phase A — Module and boundary (T001–T004)

Author `wxconv_redact.py`, its pattern set, its tests, the stable-token allocator, and the shared
`write_text()` funnel. Nothing is wired yet. Exit gate: unit tests pass, including the negative cases
proving unquoted right-hand sides survive.

Sequencing note: T004 (the funnel) must land before any family wiring, because six of the nine
originally-reported target scripts have no write boundary to hook — they emit through bare
`open(path, "w").write(...)`. There is nothing to attach redaction to until the funnel exists.

### Phase B — Reporting surface (T005–T007)

The sidecar, the console summary, `--fail-on-secrets`, and `--scan-only`. These are separated from
the wiring because the reporting surface is what makes the control observable, and it is independently
testable against synthetic findings before any real script is touched.

### Phase C — Family wiring (T008–T011)

wxConversion first (it has the confirmed report and a real funnel), then vbConversion, then
cwConversion. **T008 is the highest-risk task in the spec** — see C-1 below.

### Phase D — Verification (T012–T013, T016)

Fixtures, the fidelity regression test, and the `auditfences` parity check. The fidelity test is what
proves the stage did not damage the conversion; the parity check is what stops the nine copies
diverging.

### Phase E — Instruction path and hygiene (T014–T015)

The `SKILL.md` rule binding AI-authored artifacts, its version marker, and the hygiene guidance. T014
is marked critical despite being a Markdown change: it is the requirement that stops the AI writing a
credential value in the first place, for the artifact class that actually leaked.

It is **not**, however, the control of record — see C-12. Phase B's scanner and gate carry that,
because they ship as a new file that every upgrade path delivers cleanly, whereas an instruction file
arrives only if the consumer has not customised it.

### Phase F — Propagation and release (T017–T019)

Three-tree propagation with LF and encoding verification, the kit release with explicit asset
verification, and closing the field report.

## Known issues, gates and constraints

### C-1 — The most dangerous file must change first

`pcsoft-doc-split.py` lines 51-57 hold a mojibake-repair table whose keys are raw multi-byte UTF-8
sequences, verified at byte level (`\342\200\231` = U+2019, `\302\240` = NBSP). An encoding-lossy
rewrite destroys the table and **nothing throws** — every subsequent conversion simply emits mojibake,
and the failure surfaces weeks later as unreadable output.

This file is also where primary redaction must go (T008), and it sits in three trees. Gate: exclude it
from any tooling MODIFY path, or byte-verify the table against its pre-edit state after every edit, in
every tree.

### Watermark preservation gate

`stamp_markdown` currently lives inside `pcsoft-doc-split.py`'s `write()` — the exact function T004
generalises. Six of the scripts being routed through the new funnel never had watermarking. An
implementer generalising `write()` across all of them is precisely who drops the call. Gate: a
conversion run must still produce watermarked `.md` output after T004 and T009.

### Over-redaction is the realistic failure mode

Success metric 5 exists because metrics 1 and 6 are both satisfiable by an implementation that
deletes credential-bearing content outright. Gate: T013's negative fixture must prove
`Password = Arg.X` and `..User = sConfigUser` survive untouched.

### C-12 — ⚠ the `SKILL.md` rule may not reach the consumers who need it most

FR-011 is delivered by *modifying* a file, and modified-file delivery is changing underneath this
spec. Today the shipped upgrade extracts the archive over the project root, so the rule arrives by
overwriting — which works only because of the defect SCOPE-121 is removing. After SCOPE-121 lands, a
consumer who has customised their conversion `SKILL.md` gets the rule as a `.kit-<version>.new`
sidecar; at the CLI they are stopped and told, but on the Cockpit one-click path (which uses the
`--yes` logged override) the upgrade proceeds and the notice is a log line.

Gate: **FR-011 must not be the only thing covering the AI-authored path.** T007's scanner and T006's
gate must catch the same literal with no `SKILL.md` involvement, proven by a test that runs the
scanner against an artifact written with the rule absent. T014 adds the rule-version marker and T016
checks it, so a stale rule is loud and specific rather than a generic changed-file notice.

Explicitly **not** the fix: carving security-control files out of SCOPE-121's preserve-and-report.
That guarantee erodes the moment it takes exceptions, and it is a SCOPE-121 decision regardless.

### Release dependency

FR-015 cannot complete without a kit release, and one is already outstanding from SCOPE-124. T018 is
blocked on that release being cut, or rides it.

## Technical decisions

| Decision | Rationale |
|---|---|
| Quoted literals only | Preserves the analytical record of which procedures handle credentials. Parameter passing and variable references are signal the rebuild needs. |
| Stable tokens per value | "One credential reused across twelve procedures" is a materially different finding from "twelve credentials". A per-occurrence counter destroys that. |
| No `--redaction-map` | A flag writing plaintext secrets to disk is a footgun; its proposed git-worktree guard fails on worktrees, submodules, and plain directories later placed under version control. |
| `--fail-on-secrets` defaults off | Redaction is unconditional; the hard stop is opt-in so a first conversion run does not block a developer who wants to see output. CI turns it on. |
| Nine copies, guarded | Matches the existing `wxkanban_watermark.py` convention. The parity check buys the shared-source benefit without the refactor. |
| No app surface | Deliberate. Event capture for the audit trail would pull MCP into otherwise-offline tooling. |

## Out of band

Rotation of the reporting project's affected legacy accounts. Necessary, not deliverable here, and
the only remedy for credentials already disclosed.
