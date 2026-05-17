# wxICA — Improve Codebase Architecture (kit-shipped Claude Code skill)

This skill lives in `wxkanban-agent/templates/skills/wxICA/` so it ships with the kit. Consumer projects install it by copying the whole directory into their own `.claude/wxICA/`.

The skill is **modular** — `SKILL.md` is the entry point and links out to four companion files. Copy all five so the in-line `[LANGUAGE.md]` / `[DRIFT-AUDIT.md]` / `[INTERFACE-DESIGN.md]` / `[DEEPENING.md]` references resolve.

```text
wxICA/
├── SKILL.md             ← entry point (frontmatter-loaded by Claude Code)
├── DRIFT-AUDIT.md       ← step 0 mechanical recipes
├── DEEPENING.md         ← step 1 deepening exploration recipes
├── INTERFACE-DESIGN.md  ← step 3 interface-shape options
└── LANGUAGE.md          ← full glossary (Module / Seam / Depth / etc.)
```

## Install

From a kit consumer's project root:

```sh
mkdir -p .claude/wxICA
cp -r node_modules/wxkanban-agent/templates/skills/wxICA/. .claude/wxICA/
```

Or, if the kit is installed via a relative tarball / unpacked source:

```sh
mkdir -p .claude/wxICA
cp -r <path-to-unpacked-kit>/templates/skills/wxICA/. .claude/wxICA/
```

PowerShell equivalent:

```powershell
New-Item -ItemType Directory -Force .claude\wxICA | Out-Null
Copy-Item -Recurse -Force <path-to-kit>\templates\skills\wxICA\* .claude\wxICA\
```

Claude Code will pick up the skill on next conversation start. The kit-shipped slash command `/analyzecode` (in `_wxAI/commands/analyzecode.md`) invokes it.

## What it does

Two passes, in order:

1. **Drift Audit (mechanical)** — four checks that catch the class of defect a refactor most often leaves behind:
   - Dangling references to deleted/renamed entities (npm scripts, env keys, exported symbols, file paths, table/column names, fence IDs, HTTP routes).
   - Cross-package source imports under a restrictive `rootDir` (the kind that breaks `tsc` but compiles under `tsx watch`).
   - Build-mode coverage — every TS change must pass the production build command, not just the dev watcher.
   - Spec-interaction conflicts on shared runtime concepts (process lifecycle, ports, env vars, lifecycle-stage strings).

2. **Deepening exploration (judgment-driven)** — find shallow modules to consolidate via the deletion test (Ousterhout's principle: *if I deleted this, would complexity vanish or move?*).

The Drift Audit produces concrete defects with file:line; report them flat. Deepening produces refactor candidates; ask the user which to explore.

## Companion docs

- `wxkanban-agent/docs/drift-audit.md` — long-form version of the recipes with concrete `grep` patterns per entity type.
- See the project root's `CONTEXT.md` (if present) for domain vocabulary; the deepening pass uses those terms verbatim.
- Check `docs/adr/` for decisions the skill should not re-litigate.

## Why this is in the kit

The Drift Audit was added in kit v0.6.1–v0.6.2 after three real defects shipped between v0.6.0 and v0.6.1 — all the same shape (a refactor created an inconsistency with a surface that wasn't in its diff). The mechanical recipes turn "look for that kind of shit" into a deterministic pass any agent or human can run.
