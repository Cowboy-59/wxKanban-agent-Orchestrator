# Plan 044: wxConversion Orchestrator Command

## Locked decisions (2026-06-01)

- **Handler behavior**: scaffold workspace + hand off. No kit-internal AI. The handler creates `pre-convert/` + `pre-convert/screens/`, installs the skill into the consumer's `.claude/`, prints next steps, exits 0.
- **Gate**: Design stage only, `requiresVerifiedSpec: false`. Not spec-gated, not cross-cutting.
- **Surfaces**: CLI (`wxconversion`) and MCP (`project.wxconversion`) both included, same gate.
- **Skill distribution**: ships at `wxkanban-agent/templates/skills/wxConversion-analyst.md`; installed file is consumer-owned (no clobber without `--force`).

## Amendment decisions (2026-06-09) — two-stage split

- **Split** the one command into `/wxConversion` (Part A: source → Markdown + screenshots) and `/wxConversionScope` (scoping: window-seeded, call-following, screen field-mapping, BuildScope-to-completion, one window at a time).
- **No orchestrator surface for `/wxConversionScope`.** No new `Capability`, gate row, CLI/MCP mapping, dispatch case, or handler. Rationale: the command gateway auto-discovers `_wxAI/commands/*.md` by frontmatter, and scoping is editor-AI-driven via the skill already installed by `/wxConversion`; the workspace already exists. This keeps it consistent with "kit is workflow engine, not AI client" and avoids gating a pure editor-AI pass.
- **Filenames keep the element extension** (`<name>.wdw.md`) so windows (seeds) are distinguishable from procedures/classes (followed into) and the `<stem>` is recoverable for screenshot pairing. Scopes are named `<NNNN>-<stem>` (4-digit from `0001`).
- **Kit changes are doc/template only**: sync the skill template, update the existing handler's hand-off text, list both commands in help.

## Change surface (original — implemented 2026-06-01)

| File | Change |
|---|---|
| `core/policy/capabilities.ts` | Add `Capability.WxConversion` + Design gate row. Drift assert validates automatically. |
| `core/policy/adapters/cli-adapter.ts` | Add `wxconversion → Capability.WxConversion` to `CLI_COMMAND_TO_CAPABILITY`; update the row-count comment. |
| `core/policy/adapters/mcp-adapter.ts` | Add `project.wxconversion → {capability: WxConversion, displayName: 'wxconversion'}` to `MCP_TOOL_MAP`. |
| `core/orchestrator/workflow-engine.ts` | Add `case 'wxconversion'` in `dispatch` → new `runWxConversion` runner. |
| `core/orchestrator/command-handlers/wxconversion.ts` | New handler: scaffold dirs + install skill (+`--force`) + print next steps. |
| `wxkanban-agent/templates/skills/wxConversion-analyst.md` | Ship the skill template. |
| `tests/unit/policy/cli-adapter.test.ts` | Add `wxconversion → Design` to `PAIRS`. |
| `tests/unit/policy/mcp-adapter.test.ts` | Add `project.wxconversion` Design-gated row. |

## Change surface (amendment — 2026-06-09)

| File | Change |
|---|---|
| `_wxAI/commands/wxConversionScope.md` | New scoping slash command (window seed / `--all`, call-following, screen field-mapping, BuildScope-to-completion, `<NNNN>-<stem>`). Auto-discovered — no registry edit. |
| `_wxAI/commands/wxConversion.md` | Trim to Part A (source → Markdown + screenshots); preflight creates `pre-convert/` + `pre-convert/screens/`; hand off to `/wxConversionScope`. |
| `_wxAI/skills/wxConversion-analyst.md` | Command-split note; A2 `<name>.wdw.md` naming; A3 creates screens dir + stem-named images; Step 3/6 paths `<NNNN>-<stem>`. |
| `_wxAI/commands/buildscope.md` | `--from-md` examples updated to `*.wdw.md`. |
| `_wxAI/commands/help.md`, `_wxAI/commands/wxHelp.md` | List both commands; flow `wxConversion → wxConversionScope → createspecs`. |
| `wxkanban-agent/templates/skills/wxConversion-analyst.md` | Sync to the edited skill (shipped template). |
| `wxkanban-agent/core/orchestrator/command-handlers/wxconversion.ts` | Update hand-off next-steps text to the two-stage flow. **No new handler for scope.** |

## Known constraints

- `WorkflowEngine.dispatch` uses an explicit `switch` with a `default` that errors "No handler registered" — the new `case` is required, registration alone is insufficient.
- `MCP_TOOL_MAP` is non-exhaustive (unmapped tools pass through ungated); adding the row makes the MCP surface gated, matching the CLI.
- `cli-adapter.test.ts` `PAIRS` is a hand-maintained executable spec (already omits `scaffold:frontend`); add the `wxconversion` row to keep it honest.
- Handler must use the same consumer-root detection (`findConsumerRoot`) and template-copy helpers as `scaffold-frontend.ts` for consistency.

## Verification

- `npm run check-types` clean.
- `npm run test` green (drift assert, gate-row test, cli/mcp adapter tests).
- Manual: in a Design-stage project, `wxkanban-agent wxconversion` scaffolds + installs; non-Design blocks.
