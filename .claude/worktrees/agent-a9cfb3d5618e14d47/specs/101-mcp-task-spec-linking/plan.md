# Implementation Plan: MCP Task Spec Linking

**Spec**: 101 | **Scope**: SCOPE-101 (incl. Amendment A) | **Phase**: implementation

---

## Approach

Three gaps, delivered in two waves across two deployment surfaces.

**Wave 1 (T001–T006) — shipped.** The hosted-MCP tool surface: expose `specId` on `create_task`, add `link_task_to_spec` for batch repair, add `update_spec_status` for lifecycle transitions. Verified live on 2026-08-04 rather than assumed — all three tools were exercised against production during the session that authored Amendment A.

**Wave 2 (T007–T012) — Amendment A, not started.** Make `dbpush` capable of syncing at all.

## Ordering, and why it matters

**T007 before T008.** T007 can ship and test green against `cockpit_summary` for spec identity plus paged `list_open_items` for tasks, so the kit fix is not blocked on an MCP deploy. T008 then removes that two-call workaround.

**T010 is not optional polish.** Today an empty `knownSpecNumbers` is indistinguishable from a genuinely empty project, so the tool's most destructive behaviour is also its silent default. Fixing the matching (T007) without fixing that ambiguity leaves the same landmine armed for the next read-path change.

**T011 is verify-before-fix.** SCOPE-101 recorded a title-separator defect in `pushExistingSpec`. That code path has never executed, so the defect has never been observed. Confirm it is real before writing code.

## Known trap

`cockpit_summary` returns **only incomplete tasks**. Using it as the sole authoritative source fixes spec matching and silently breaks task matching — every completed task would look absent and be recreated. `phase2Compare` populates both `knownSpecNumbers` and `knownTaskIdsBySpec`; both need a complete source.

## Verification gate

Unit-green plus build-green is not sufficient here — that combination has shipped fatal bugs in this project before. T007 and T010 must be proven by an actual `dbpush --dry-run --spec 112` reporting `updated: 1 / created: 0` against the live database.

## Risks

| Risk | Mitigation |
| --- | --- |
| Kit half reaches users slowly | T007/T009–T012 need a kit release; consumers keep the duplicating dbpush until they upgrade. Sequence the release deliberately. |
| A partial fix looks complete | T007 alone makes the created/updated split correct while leaving T010's ambiguity. Do not close the spec on T007. |
| Fence audit still fails | The `[SCOPE 101 / T001..T006]` fences were hand-authored; they now have DB task rows, but reconciliation under `auditfences --strict` is unverified. |
