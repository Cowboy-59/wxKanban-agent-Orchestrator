# Verification: Teaching Skills

**Spec**: SPEC-138 · **Task**: T014 · **Run**: 2026-10-17

## Success criteria

| SC | What was run | Result |
|---|---|---|
| SC-1 | Fixture inventory with 2 processes → `buildLessons`; `coverage()` | **Pass**. 2 lessons, none missing, none extra |
| SC-2 | Fixture with a save step and a recorded delete | **Pass**. Both marked; the save question is on each; the environment check sits before the first one |
| SC-3 | Fixture seeded with a fake email, a payment card number and an API key | **Pass**. The run stops before writing anything; the message names the lesson and the patterns, never the values; no flag disables the check |
| SC-4 | **Live, Claude** (`claude -p`, haiku, multi-turn): the unedited "Create an invoice" lesson, with a learner who is new, does each step, is unsure of the environment, and answers "no" | **Pass in Claude** (judged from the transcript). It asked which address the learner was on, treated "unsure" as Production, asked "Do you wish to save your changes?", did not save on "no", explained what Save would have done, and summarized. (The script's keyword check printed FAIL on "If you had clicked Save", the after-the-fact explanation: a false positive.) **ChatGPT and a third AI: open** |
| SC-5 | Real git project and the real SPEC-137 engine: change `money.ts`, which only the invoice-edit screen imports | **Pass**. Only that screen's lesson is flagged (0 extra, 0 missed); `build --stale` regenerates only it, at version 2, with "What changed"; an unrelated change flags nothing; an uncommitted change counts |
| SC-6 | `classifyAddress` with an unlisted and an unparseable address; credentialed and tokenized addresses | **Pass**. Production every time; both refused, the secret never echoed |
| SC-7 | Inventory with `"source": "definitions"` | **Pass**. Every lesson is labeled "From definitions, not tested by clicking" and always asks the learner |
| SC-8 | Lessons from the kit writer, served by the app's `TeachingBundleService` | **Pass**. The download is exactly start-here and the listed lessons, byte for byte; never the manifest, a stray file, or a path a tampered manifest names |

## Also checked

- The two wxHelpGenerate copies (`.claude/` and `_wxAI/`) are identical byte for byte (a test).
- Lessons are never written under `_wxAI/`.
- The generation record passes the real `capture_event` schema, carries no learner data, and queues
  offline.
- The routes answer GET only; the Help card's strings are in all six languages.
- Suites: 162 (Change Impact and Teaching Skills) and 35 (MCP contracts) pass. The MCP typecheck is clean, the
  client builds, and the bundle contains the route. `auditfences` finds nothing new; HelpPage's one
  legacy declaration was re-hashed surgically, with an amendment recorded.

## Found and fixed

- `.claude/skills/wxHelpGenerate/` was never opted in to tracking, so its new `teach.mjs` was
  silently ignored. `.gitignore` now opts it in.
- The Help card was imported from `components/Help/` while the tracked folder is `components/help/`.
  This works on Windows and breaks the Linux build. Fixed.
- Tests that can reach wxKanban now clear the connection variables that `tests/setup.env.ts` loads
  (see the SPEC-137 leak, 2026-10-17).

## Release (T015), 2026-10-17

| Channel | Shipped | Verified how |
|---|---|---|
| App + MCP (push `768e45ea..dbaf415a`) | App 1.5.339: routes and Help card; MCP: `teaching_skill_generated` | Both App Runner deploys **SUCCEEDED**; `/api/version` reports 1.5.339. `/api/help/teaching-skills` and `/bundle` answer **401** without a session, while an unknown help path answers 404, so the routes are live. A `capture_event` sent as `teaching_skill_generated` with an empty `source` was refused for the source only, so the type is accepted (nothing written) |
| Kit v1.7.79 (GitHub release) | `teach.mjs` in both skill copies, SKILL.md, command stub | Published assets byte-match the local build. The downloaded archive has both `teach.mjs` copies (identical) and the stub naming `--teach`, and contains none of the orchestrator's uncommitted SCOPE-068 work (set aside for the release and restored byte for byte) |
| Cockpit | No change needed | Its Help text is read from the kit's command stub at runtime |

## Open

- **Release test** (Constraint 3, amended): the first `/wxHelpGenerate --teach` walk runs on another
  app, chosen by the owner.
- **SC-4** in ChatGPT and one more AI.
- wxKanban's own Help-card bundle: generated later. Until then the card stays hidden.
