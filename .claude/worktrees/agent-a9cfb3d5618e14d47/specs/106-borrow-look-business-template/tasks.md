# Tasks: SPEC-106 — Borrow-a-Look Business Template

Implements SCOPE-106. 18 tasks. Route each through the orchestrator (`implement 106/T0NN`); fences are written by the orchestrator only. DB task IDs from `project.create_specs` noted for traceability.

> **Format note (2026-08-02).** These tasks were previously recorded as `- [x]` checkbox bullets.
> `buildTaskIdIndex` (`wxkanban-agent/core/orchestrator/task-id-index.ts`) only harvests `T\d+` from
> lines beginning with `|` or `###`, so **the indexer saw zero tasks for scope 106** and every one of
> its fences audited as `UNKNOWN_TASK` — a broken reference against tasks that plainly existed.
> Re-recorded as tables so the fences resolve. No task content was changed.

**All 18 verified against the shipped code on 2026-08-02** — see *Verification* below.

## Phase A — Shared model + storage

| Task | Deliverable | Status | Verified against code |
| --- | --- | --- | --- |
| T001 | Add `"url"` to `ThemeSource` in `src/shared/theme-tokens.ts`. Create `src/shared/theme-template.ts` with `BusinessChrome { logoRef, appName, footerLine }`, `ThemeTemplate { id, name, theme, chrome }`, and `renderHeaderComponent`/`renderFooterComponent`. Export DTOs from the shared barrel. *(FR-001/005/006; db e118449f)* | done | ✅ all four exports present; `"url"` in `theme-tokens.ts`; 4 fences |
| T002 | `src/db/schema/themetemplate.ts` (`themetemplates`, UNIQUE (companyid, name)); register in `src/db/schema/index.ts`. *(FR-007; db ad024b4c)* | done | ✅ 65 lines; registered at `index.ts:126`; 2 fences |
| T003 | Generate migration + apply script (pg.Client transaction, UUID v7), mirroring `0035_spec062_project_themes.sql`. *(FR-007; db 0ddb439c)* | done | ⚠️ `0040_spec106_theme_templates.sql` + `0041_spec106_project_theme_chrome.sql` exist and `themetemplates` is **live in production** — but neither migration carries a SCOPE-106 fence |

## Phase B — Extraction

| Task | Deliverable | Status | Verified against code |
| --- | --- | --- | --- |
| T004 | `src/server/services/SiteStyleCaptureService.ts` reusing `MarkdownPdfRenderer.launchBrowser()`; collect computed styles + CSS vars + header/nav/footer/main DOM; throw on failure. *(FR-002; db 28a822ab)* | done | ✅ 294 lines; 10 fences |
| T005 | Static fetch + parse fallback before defaulting (headless → static-parse → fail-open). Resolves Open Question 1. *(FR-002/003; db c321f5b0)* | done | ✅ 2 fences; `capture.method` surfaced in the route response |
| T006 | Accept a URL-capture context + prompt mapping to the 19-token set; keep Zod validation + fail-open. *(FR-002/003; db 2d7476c2)* | done | ⚠️ built as `captureToPromptContext`, wired at `projectTheme.ts:673` — but **fenced under `[SCOPE 106 / T004]`**, so the authorship record credits T004 |
| T007 | `POST /api/themes/derive/url` — capture → map → validate → AA-clamp → fail-open; returns `source:"url"` + sourceRef. *(FR-001/002/003; db cdabc3e1)* | done | ✅ `projectTheme.ts:657` BEGIN/END; fail-open path returns the default theme with a note |

## Phase C — Chrome execute + template routes

| Task | Deliverable | Status | Verified against code |
| --- | --- | --- | --- |
| T008 | Extend `POST /api/projects/:id/theme/execute` to emit header/footer artifacts beside `theme.css` when chrome present. *(FR-006; db 6e2ad506)* | done | ✅ 3 fences from `projectTheme.ts:316` |
| T009 | `src/server/routes/themeTemplates.ts` (GET list, POST save [member], PATCH rename [admin], DELETE [admin]); tenant-isolated; wire in `app.ts`. *(FR-007; db 75884f67)* | done | ✅ 266 lines; wired `app.ts:26` + `:189` |
| T010 | `POST /api/projects/:id/theme/apply-template` writes `projectthemes` + chrome via the three-tier resolution. *(FR-008; db a8b91341)* | done | ✅ `projectTheme.ts:746` |

## Phase D — Studio UI

| Task | Deliverable | Status | Verified against code |
| --- | --- | --- | --- |
| T011 | ThemeStudio: From-a-website source UI *(FR-001; db b3b2c81a)* | done | ✅ `ThemeStudio.tsx:57` MODIFIED-BY; 6 website/derive-url references |
| T012 | ThemeStudio: business chrome editor panel *(FR-005; db 60306e9c)* | done | ✅ same MODIFIED-BY; 6 chrome/logoRef/appName references |
| T013 | ThemePreview: full control gallery + header/footer *(FR-004; db c5542021)* | done | ✅ `ThemePreview.tsx:29` MODIFIED-BY (shared with T020) |
| T014 | TemplateGallery component *(FR-007/008; db 47e8deaa)* | done | ✅ `TemplateGallery.tsx:32-254` BEGIN/END |
| T015 | ThemeStudio: Save-as-template action *(FR-007; db b202f8d9)* | done | ✅ covered by the `T011,T012,T015` MODIFIED-BY; the save action itself lives in `TemplateGallery`, not `ThemeStudio` |

## Phase E — Tests

| Task | Deliverable | Status | Verified against code |
| --- | --- | --- | --- |
| T016 | Unit tests: renderers, mapping, AA-clamp, fail-open *(FR-002/003/006; db 3cb60f41)* | done | ✅ `tests/unit/scope106-theme-template.test.ts` — **passing** |
| T017 | Integration/E2E: extract → brand → save → apply *(FR-001..008; db 0c0172f3)* | done | ✅ `tests/contract/scope106-theme-templates.test.ts` — **passing** |
| T018 | Permission + tenant-isolation tests *(FR-007; db b3e2c954)* | done | ✅ same contract suite, headed `[SCOPE 106 / T018]` |

---

## Verification — 2026-08-02

Checked against the shipped code, not against the ticks. Every named artifact was opened, every route
located, and the test suites executed.

**Result: all 18 tasks are genuinely built.** `npx vitest run` over the three SCOPE-106 suites —
`tests/unit/scope106-theme-template.test.ts`, `tests/contract/scope106-theme-templates.test.ts`,
`tests/unit/theme-tokens.test.ts` — reports **28 passed, 0 failed**.

Three record-level defects found. None of them mean unbuilt work:

1. **The whole scope was invisible to the fence auditor** (fixed by this file). Checkbox-bullet format
   meant `buildTaskIdIndex` harvested nothing, so all 18 fences reported `UNKNOWN_TASK`.
2. **T003's migrations carry no fence.** `0040` and `0041` exist and are applied, but CLAUDE.md
   requires SQL migration bodies to be fenced. A fencing gap, not a missing migration.
3. **T006's deliverable is fenced under T004.** `captureToPromptContext` does exactly what T006
   specifies, but its fence credits T004. **Left as-is deliberately** — per CLAUDE.md fences are never
   hand-corrected, because rewriting one silently reassigns authorship. Recorded here instead.

**One task exists in code but not in this file:** `ThemePreview.tsx:29` carries
`MODIFIED-BY [SCOPE 106 / T013,T020]`, and there is no T020 in this breakdown. It will audit as
`UNKNOWN_MODIFIER_TASK` until either the task is recorded or the reference is explained. Not
investigated in this pass.
