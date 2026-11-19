# Quickstart: wxG-O-D Development Process Manager

**Spec Number**: 136

## Setup

1. Review the spec: `specs/136-wxgod-development-manager/spec.md`
2. Review the plan: `plan.md`
3. Review tasks: `tasks.md`
4. Review tests: `tests.md`

## Where the work lives

- The method (the only copy): `mcp-server/src/prompts/wxgod.md` and `mcp-server/src/prompts/wxgod/references/*.md`
- The stub and scripts: `.claude/skills/wxG-O-D/`
- The thin command: `.claude/commands/wxG-O-D.md` and `_wxAI/commands/wxG-O-D.md` (byte-identical)
- FR-017: `wxkanban-agent/core/policy/resolve-spec-verification.ts`

## Development

1. Edit the method only under `mcp-server/src/prompts/`; run `node mcp-server/scripts/build-prompts.mjs` to regenerate the registry.
2. Run the registry test: `cd mcp-server && npx vitest run tests/prompts/registry.test.ts`
3. Exercise a script directly, e.g. `node .claude/skills/wxG-O-D/scripts/estimate-ai-time.mjs --help`
4. Mark task done: `/task-done <task-id>`

## Verification

1. After the hosted MCP deploy, probe `project.get_command_prompt` with `wxgod` and one reference key.
2. Diff the published kit release asset against the allowlist (SC-1).
3. Run the acceptance trials in `tests.md` (SC-3 to SC-8).
