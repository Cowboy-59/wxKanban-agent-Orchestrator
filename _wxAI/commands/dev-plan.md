---
description: dev-plan (deprecated alias, one release) — runs /wxG-O-D --roadmap, which now writes the build roadmap docs/DEVELOPMENT-PLAN.md and its PDF.
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

# dev-plan — deprecated alias for `/wxG-O-D --roadmap`

The `dev-plan` skill is retired. G.O.D. now owns the build roadmap (SCOPE-136 FR-010, FR-011). This
alias lives for one kit release and is then removed.

1. **Say this one line first, exactly once, every time this command runs:**

   > `/dev-plan` is deprecated and will be removed in the next kit release. Use `/wxG-O-D --roadmap`
   > — the roadmap now lives in `docs/DEVELOPMENT-PLAN.md`.

2. **Then run G.O.D.'s roadmap step.** Call the MCP tool `project.get_command_prompt` with
   `{ "command": "wxgod" }` and follow the returned instructions with the arguments `--roadmap`
   plus any provided here:

   {{args}}

   Follow its **Roadmap only (`--roadmap`)** section. It writes `docs/DEVELOPMENT-PLAN.md` and
   renders `docs/DEVELOPMENT-PLAN.pdf` with `.claude/skills/wxG-O-D/scripts/build-devplan-pdf.mjs`.
   An earlier `specs/DEVELOPMENT-PLAN.md` is read as the previous version.

If `project.get_command_prompt` is not available as a tool, follow the connection guidance in
`/wxG-O-D` (`.claude/commands/wxG-O-D.md`).

## Unchanged

- **Dev Cockpit** — the read-only **"Development Plan"** panel still renders the server's
  deterministic `devplan` document via `cockpit_summary` (SCOPE-081).
- **Web app** — the Admin Dashboard per-project **"Development Plan"** link is unchanged.
