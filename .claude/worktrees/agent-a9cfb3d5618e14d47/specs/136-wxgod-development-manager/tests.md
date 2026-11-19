# Test Plan: wxG-O-D Development Process Manager

**Spec Number**: 136
**Date Generated**: 2026-10-03
**Spec**: [spec.md](spec.md) | **Tasks**: [tasks.md](tasks.md)

---

## Test Strategy

| Layer | Framework | Covers |
|-------|-----------|--------|
| Unit | Vitest | Prompt registry shape (FR-001 to FR-003, FR-010); `resolveSpecVerification` per-spec cases (FR-017); estimator determinism (FR-008) |
| Script | Node, run directly | Inventory exclusions and secret-by-path (FR-005); renderer (FR-009, FR-010) |
| Release | Archive diff, live MCP probe | SC-1, SC-2 |
| Acceptance | Real `/wxG-O-D` runs | SC-3, SC-5, SC-6, SC-7, SC-8; FR-012 to FR-016, FR-019 to FR-024 |

Most requirements are method text, so the acceptance runs are the real test. A green unit suite
proves the method is served in the right shape, not that it behaves.

## Unit Tests

| # | Test | Expected | Status |
|---|------|----------|--------|
| UT-001 | Registry serves `wxgod` and the nine `wxgod/references/*` keys; flat key `god-persona` is null | Pass | passing (`mcp-server/tests/prompts/registry.test.ts`) |
| UT-002 | Exactly nine `wxgod/` reference keys (business-rules added by FR-027); no served text names `.claude/skills/dev-plan`; renderer path, `## 2. Development plan`, `## Roadmap only`, the defect rule, N8b, N11, N12 present | Pass | passing (added 2026-10-03) |
| UT-003 | `resolveSpecVerification(db, projectId, specNumber)`: two specs `implementing` → neither blocked | `specExists`, `tasksExist`, `documentsExist` true | pending (T019) |
| UT-004 | Named spec has no tasks | `tasksExist` false → blocked | pending (T019) |
| UT-005 | Named spec created by `create_specs` (documents stored with `specid` NULL) | Not blocked for missing documents | pending (T019) |
| UT-006 | Named spec does not exist | `specExists` false → blocked | pending (T019) |
| UT-007 | Same `GOD-Estimate-Input.json` twice | Byte-identical `GOD-Estimate.md` (SC-4) | pending (T010) |
| UT-008 | Estimate input with a dependency cycle, and with an unknown dependency | Non-zero exit naming the edge | pending (T010) |

## Script Tests

| # | Test | Expected | Status |
|---|------|----------|--------|
| ST-001 | `build-devplan-pdf.mjs` from its new path on a plan with a Mermaid map | PDF written, exit 0 | passing (smoke test 2026-10-03, 111 KB PDF) |
| ST-002 | Renderer on a plan with a broken Mermaid label | Non-zero exit | pending |
| ST-003 | `inventory.mjs --dir=missing` | Stops with the folder named | pending (T007) |
| ST-004 | `inventory.mjs` on a fixture with `.env`, a key file, and `node_modules/` | Secrets listed by path only, never opened; exclusions with reasons in `GOD-Inventory.json` | pending (T007) |

## Release Checks

| # | Check | Expected | Status |
|---|-------|----------|--------|
| RC-001 | Diff the published kit asset (SC-1) | `wxG-O-D/` holds `SKILL.md` + 4 scripts; no `references/`; no `dev-plan` skill | pending |
| RC-002 | After the MCP deploy, `get_command_prompt` `wxgod` and `wxgod/references/new-project` (SC-2) | Both return the edited text | pending |
| RC-003 | `/dev-plan` in a consumer project | One deprecation line, then `docs/DEVELOPMENT-PLAN.md` and its PDF | pending |

## Acceptance Runs

| # | Scenario | Expected | Status |
|---|----------|----------|--------|
| AT-001 | US1 plan mode on `E:/AI_Development/EverettCash/analysis` | 100% of findings cited or labeled; redaction scan finds 0 secret values (SC-3) | pending |
| AT-002 | US2 `--create` on a small test overview | One pause, then phase-by-phase to the last exit gate; Pipeline column matches the commands' records; 0 hand-written artifacts (SC-5) | pending |
| AT-003 | Two independent units in one phase, limit 2 | Both `implementing` at once, neither refused; dependent units never overlap (SC-6) | pending (needs T019) |
| AT-004 | US4 `/clear` then `--resume` mid-phase | Continues at the recorded unit and gate; nothing repeated or skipped (SC-7) | pending |
| AT-005 | US3 under the bridge | Every gate question reaches the phone; run continues after answers; push without grant refused (SC-8) | pending |
| AT-006 | US6 make a script fail mid-run | Run stops at the step, `stoppedAt` recorded, report text given; resume asks whether fixed | pending |
| AT-007 | US7 four screen scopes, two designed | Style in `stack.md` before any screen; wxDesigner only after each designed scope's specs; resume does not re-ask | pending |
| AT-008 | US8 commercial web app with `--brainstorm` | Brainstorm opens with commercial, then web-or-installed; sell-side features Proposed; `GOD-SaaS-Cost.md` has 5 options + AWS at both sizes, cost per customer, one ★, every price with a source and date; customer document keeps tiers | pending |
| AT-009 | Internal installed app, brainstorm skipped | NP7 and NP5 asked in the interview; no `GOD-SaaS-Cost.md`; installer, signing, and update items in the design | pending |
| AT-010 | US9 plan mode on an installed WinDev conversion, target web | Opening questions before section 1, pre-filled with citations; delivery change in Decisions needed with an ADR; `GOD-SaaS-Cost.md` written in step 6; resume does not re-ask | pending |
| AT-011 | US10 plan mode on `E:/AI_Development/EverettCash/analysis` | Coverage table lists every conversion file; register has BR- IDs with citations; section 2 shows decisions first, ordinary rules as a group; resume continues extraction at the next slice | pending |
| AT-012 | US10 new project, no code | Register drafted with best-practice proposals after N2; idea brainstorm opens with them after the two questions; adopted rules are FRs citing BR- IDs in scope drafts | pending |
| AT-013 | New commercial internal build, `--brainstorm` | Opening questions ask who it is for first; competitors topic follows (3 to 5 researched products, each dated and sourced); personas discussed after business rules; `GOD-SaaS-Cost.md` marked internal with price, margin, and break-even; D8 and QR1 to QR3 asked in the interview | pending |
| AT-014 | Consulting run (`--customer` names another organization) | No build-vs-buy or competitors topic; customer document carries no price or margin and keeps cost tiers | pending |
| AT-015 | `--create` from built to released | N8c runs review, tests, and help with the real commands; every stage advance is asked of the owner and confirmed before going on; `runqa`/`/wxAI-qa` never run; the run ends in Release with nothing deployed or pushed by G.O.D. | pending |

## Test Automation

```bash
cd mcp-server && npx vitest run tests/prompts/registry.test.ts
node .claude/skills/wxG-O-D/scripts/build-devplan-pdf.mjs <plan>.md <plan>.pdf
cd wxkanban-agent && npx vitest run tests/unit/policy/mcp-adapter.test.ts tests/unit/mcp-adapter.test.ts
```
