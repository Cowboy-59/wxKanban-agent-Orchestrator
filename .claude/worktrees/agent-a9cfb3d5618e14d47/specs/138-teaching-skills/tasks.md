# Tasks: Teaching Skills

Source of truth for status is the DB (spec `f6b678d7-0fda-4bc0-ab97-c06e705199f7`). Fences use
`[SCOPE 138 / Tnnn]`.

## Task table

| Task | Title | FRs | Priority | Status |
|---|---|---|---|---|
| T001 | Baseline: document wxHelpGenerate as it is | FR-012 | high | todo |
| T002 | --teach mode: one walk, three outputs | FR-001 | high | todo |
| T003 | AI-agnostic lesson format | FR-002 | high | todo |
| T004 | Committing Steps and the save rule | FR-003 | critical | todo |
| T005 | Environment detection and the address lists | FR-004 | high | todo |
| T006 | Lesson header and versioning | FR-005 | medium | todo |
| T007 | Precise staleness and --teach --stale | FR-006 | high | todo |
| T008 | Pre-write data check | FR-007 | critical | todo |
| T009 | Desktop and mobile lessons from screen definitions | FR-008 | medium | todo |
| T010 | Delivery bundle and start-here.md | FR-009 | high | todo |
| T011 | Learn wxKanban with your AI download | FR-010 | medium | todo |
| T012 | Generation log | FR-011 | medium | todo |
| T013 | Cockpit Help surfacing | FR-012 | low | todo |
| T014 | Verify: three AIs, fixtures, release run on wxKanban | SC-1..SC-8 | critical | todo |
| T015 | Release and live verification | — | medium | todo |

## Details

### T001 — Baseline: document wxHelpGenerate as it is (FR-012)

wxHelpGenerate had no owning scope. Before changing it, record its current behavior as this spec's baseline: the browser walk, `docs-workspace/inventory.json` with the per-element `behavior` field, `config.json`, the HTML site and PDF outputs, and the walk safety rule (never confirm anything that deletes or sends real data). Sources: `.claude/skills/wxHelpGenerate/SKILL.md`, `_wxAI/skills/wxHelpGenerate/`.

### T002 — --teach mode: one walk, three outputs (FR-001)

Add `--teach` reusing the same walk and `inventory.json`; write one Teaching Skill per process alongside the help site and PDF. Without `--teach` the run is byte-for-byte unchanged. Coverage check: lessons vs inventory processes, none missing, none extra (SC-1).

### T003 — AI-agnostic lesson format (FR-002)

Lesson template in plain markdown: chat-tutor steps as the base; a generic coach section ("if you can see the user's browser, watch the page and confirm each step"); optional front matter; no vendor tool names in steps; amateur / junior / senior pacing.

### T004 — Committing Steps and the save rule (FR-003)

Mark every save, submit, send, or delete step from the recorded button behavior. In UAT the lesson proceeds; in Production or an unknown environment it asks "Do you wish to save your changes?" and continues only on an explicit yes; a no never saves and the lesson explains what the step would have done.

### T005 — Environment detection and the address lists (FR-004)

First `--teach` run asks for UAT and Production addresses and stores them in an `environments` block in `docs-workspace/config.json`; each lesson carries them. Coach mode compares the page address; chat-only mode and desktop/mobile lessons ask the learner before the first Committing Step; "unsure" and unlisted addresses = Production; an address with a token or credentials is refused. The same lists are shared with SCOPE-139 and SCOPE-140.

### T006 — Lesson header and versioning (FR-005)

Header: lesson version, app version generated from, screen and element ids. The lesson tells the learner which app version it describes and asks them to report anything that looks different; a reported mismatch is flagged, not guessed around.

### T007 — Precise staleness and --teach --stale (FR-006)

Requires SPEC-137. Map each lesson's screen ids to code via the Change Impact engine; a change flags only the lessons whose screens it reaches. `--teach --stale` re-walks only those screens, regenerates and version-bumps those lessons, and opens each with "What changed since version X" (added, removed, changed steps). Replaces `.wxai/help-stale.json` for lessons.

### T008 — Pre-write data check (FR-007)

Lessons hold behavior only with made-up example values. Screenshots go through the help site's existing check. Before writing any lesson, fail on an email address, key, token, or real record value; the failure names the lesson and the pattern, never the value. No flag disables it (SC-3).

### T009 — Desktop and mobile lessons from screen definitions (FR-008)

For desktop and mobile app types, build lessons from conversion output, forms, and `page.md` instead of a walk; label each "from definitions, not tested by clicking"; always use the chat-only environment question (SC-7).

### T010 — Delivery bundle and start-here.md (FR-009)

Write `docs/teaching-skills/<process>.md` and `start-here.md` (lesson list, the save rule, learner level). Build a zip holding only checked lessons — no inventory, unchecked screenshots, or configuration. Never write under `_wxAI/` (kit sync mirrors the filesystem).

### T011 — Learn wxKanban with your AI download (FR-010)

`GET /api/help/teaching-skills/bundle` (signed-in, read-only) and a Help-page card with the download, its version, and a one-line how-to. Add "regenerate the teaching bundle" to the release checklist (SC-8).

### T012 — Generation log (FR-011)

Add `teaching_skill_generated` to the Zod `ProjectEventTypeSchema` (beside SPEC-137's types); record who, when, app version, screens, lessons written, and stale ones; offline queue; no learner identifiers.

### T013 — Cockpit Help surfacing (FR-012)

Update the wxHelpGenerate command stub (`_wxAI/commands/wxHelpGenerate.md`) and its Cockpit Help text to name `--teach` and `--teach --stale`.

### T014 — Verify: three AIs, fixtures, release run on wxKanban (SC-1..SC-8)

Complete one lesson unedited in Claude, ChatGPT, and one more AI (SC-4); data-check fixture with fake personal data (SC-3); unknown-address test (SC-6); staleness fixture through SPEC-137 (SC-5); the first `--teach` run on wxKanban as the release test.

**Amended 2026-10-17 (owner):** the release test runs on another app, not wxKanban; wxKanban's Help-card bundle is generated later. **Done so far:** SC-4 in Claude (live multi-turn `claude -p`, lesson unedited: it asked the environment, treated "unsure" as Production, asked "Do you wish to save your changes?" and did not save on no); SC-1/2/3/5/6/7 by fixtures. **Open:** the --teach walk of the other app, and SC-4 in ChatGPT and one more AI.

### T015 — Release and live verification (—)

Kit release with the generator verified in the published asset; app + MCP push (route, card, event type) with a hosted-MCP probe; Cockpit VSIX with the Help text.
