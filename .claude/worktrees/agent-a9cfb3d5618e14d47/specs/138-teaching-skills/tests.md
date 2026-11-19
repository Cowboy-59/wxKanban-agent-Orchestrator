# Test Plan: Teaching Skills

**Spec**: SPEC-138 · [spec.md](spec.md) · [tasks.md](tasks.md)

**live** marks a check that runs in a real AI session or a real browser.

## Success criteria → tests

| SC | Test | Kind | Task |
|---|---|---|---|
| SC-1 | Run `--teach` on wxKanban, then compare the lesson set with the inventory's processes. Pass if none are missing and there are no extras | Integration | T002, T014 |
| SC-2 | Use a fixture app with known committing buttons. Every committing button must be marked. In a Production run, each one gets the save question | Fixture | T004 |
| SC-3 | Use a fixture seeded with fake emails, names and a fake API key. The generator must fail before writing, and its message must name the lesson and the pattern, never the value | Fixture | T008 |
| SC-4 | **live**: Load one lesson into Claude, ChatGPT and one more AI, and complete it in each with no edits | Manual, recorded as evidence | T014 |
| SC-5 | Change one fixture screen. Only the lessons that teach it are flagged. `--stale` regenerates only those, each with a "What changed" section | Integration (needs SPEC-137) | T007 |
| SC-6 | Open a web lesson on an address that's on neither list, in coach mode and in chat-only mode. Both must treat it as Production | **live** | T005 |
| SC-7 | Run `--teach` on a sample desktop app. Every lesson must carry the "from definitions, not tested by clicking" label and use the chat-only environment question | Fixture | T009 |
| SC-8 | After the release regenerates the bundle, the Help download's version must equal the release's lesson version | Release checklist | T011 |

## Per-requirement tests

| FR | Tests |
|---|---|
| FR-001 | A run without `--teach` produces output byte-identical to the baseline from T001 |
| FR-002 | Lint the lesson files for vendor tool names (expect 0). Lessons are readable with the front matter removed |
| FR-004 | An address carrying a token is refused. The chat-only question comes before the first Committing Step |
| FR-005 | Every lesson has a valid header. A reported mismatch is flagged in the chat |
| FR-009 | Inspect the bundle: only checked lessons, nothing under `_wxAI/` |
| FR-011 | Each run writes one record, queued while offline, with no learner identifiers |
| FR-012 | The Cockpit Help text names `--teach` and `--teach --stale` |

## Regression

- Existing wxHelpGenerate output, without `--teach`, compared byte for byte with the T001 baseline.
- Diff the two wxHelpGenerate copies (`.claude/skills/` and `_wxAI/skills/`).
- After the push: probe the hosted MCP with a `teaching_skill_generated` event.
