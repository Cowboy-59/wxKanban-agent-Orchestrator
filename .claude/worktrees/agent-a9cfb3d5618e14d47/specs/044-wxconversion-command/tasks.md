# Tasks 044: wxConversion Orchestrator Command

- **T001** ✅ — `capabilities.ts`: add `Capability.WxConversion` + Design gate row. (FR-001, FR-006)
- **T002** ✅ — `cli-adapter.ts`: map `wxconversion → Capability.WxConversion`; update row-count comment. (FR-002)
- **T003** ✅ — `mcp-adapter.ts`: map `project.wxconversion → Capability.WxConversion` (displayName `wxconversion`). (FR-007)
- **T004** ✅ — `command-handlers/wxconversion.ts`: new scaffold handler (dirs + skill install + next steps; `--force` re-install; no AI). (FR-003, FR-005)
- **T005** ✅ — `workflow-engine.ts`: add `dispatch` case + `runWxConversion` runner. (FR-003)
- **T006** ✅ — `templates/skills/wxConversion-analyst.md`: ship the skill template. (FR-004)
- **T007** ✅ — tests: add `wxconversion → Design` to cli-adapter `PAIRS`; add `project.wxconversion` row to mcp-adapter test. (FR-002, FR-007)

## Amendment tasks (2026-06-09) — two-stage split (done)

- **T008** ✅ — `_wxAI/commands/wxConversionScope.md`: new scoping slash command (window seed / `--all`, call-following, screen field-mapping, BuildScope-to-completion, `<NNNN>-<stem>`). No orchestrator capability/handler. (FR-008)
- **T009** ✅ — `_wxAI/commands/wxConversion.md`: trim to Part A; preflight creates `pre-convert/` + `pre-convert/screens/`; hand off to `/wxConversionScope`. (FR-008)
- **T010** ✅ — `_wxAI/skills/wxConversion-analyst.md` + kit template: command-split note, A2 `<name>.wdw.md` naming, A3 screens-dir creation + stem-named images, Step 3/6 `<NNNN>-<stem>` paths; sync `templates/skills/wxConversion-analyst.md`. (FR-009)
- **T011** ✅ — `command-handlers/wxconversion.ts`: update hand-off next-steps text to the two-stage flow (no new handler). (FR-008)
- **T012** ✅ — `help.md`, `wxHelp.md`, `buildscope.md`: list both commands, fix flow to `wxConversion → wxConversionScope → createspecs`, update `--from-md` examples to `*.wdw.md`. (FR-008, FR-009)

## Amendment tasks (2026-06-13) — Part B conversion-safety guardrails (done)

- **T013** ✅ — `_wxAI/skills/wxConversion-analyst.md` + kit template `templates/skills/wxConversion-analyst.md`: Part B faithful-by-default rules (no schema/field-name changes unless specified), B2 pre-mapping interview (data-type list + per-table primary-key prompt), Postgres conventions reframed as opt-in. `_wxAI/commands/wxConversionScope.md`: `--db` documents the stance. (FR-010, commit `9300a0d0`)

## Amendment tasks (2026-10-25) — Stage 3 source fidelity + escape hatch (feedback 2634b849)

- **T014** ✅ — Apply the ShopMaster parser patch (`E-issues/stage3-2026-10-25/parser-review.patch`) to `pcsoft-schema-to-sql.py` + `test_pcsoft_schema_parse.py`; add its boundary tests as `scripts/test_boundaries.py`. (FR-011 §1)
- **T015** ✅ — `--type-map` for Array / JSON / UUID (exact label or family), `mapping_status: "operator"`; restored refusal guidance; composite keys out of the collision check; tests. (FR-011 §2–4)
- **T016** ✅ — Sync all three skill copies byte-identical; full skill suite green; skill doc (`wxConversion` SKILL / analyst notes) describes the exit-3 contract and the new `--type-map` forms. (FR-011)
- **T017** — Reply to the reporter with what shipped; resolve feedback `2634b849` once the kit release carries it. (FR-011)
