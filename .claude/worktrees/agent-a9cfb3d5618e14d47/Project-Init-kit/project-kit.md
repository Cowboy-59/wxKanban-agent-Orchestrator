# Project Kit File Manifest

This file lists all directories and files that must be included in the wxKanban Project Kit zip archive. It serves as the authoritative manifest for kit packaging and automation tools.

## Required Directories and Files

```
.vscode/
_wxAI/
   commands/
   rules/
   scripts/
   settings.json
   settings.local.json
   wxai-implement-rules.md
logs/
mcp-server/
resources/
scripts/
wxkanban-agent/
ai-settings.json
AI.md
package.json
package-lock.json
project-kit.md
ProjectOverview.md
README.md
TODO.md
wxkanban-agent-orchestrator-draft.md
```

## Usage
- This manifest is used by zip management and kit automation scripts to determine which files and directories to include in the kit archive.
- Files listed here must exist in the project root or specified subdirectories.
- Do not copy database credentials or secrets.
- Update this file if the kit structure changes.

## Development & Build Tooling

The following files and directories are required for development, build, and UI/UX support:

```
tailwind.config.js         # TailwindCSS configuration
postcss.config.js          # PostCSS config for Tailwind
biome.json                 # Biome (linter/formatter) config
vite.config.ts             # Vite build tool config
vitest.config.ts           # Vitest test runner config
playwright.config.ts       # Playwright E2E test config
node_modules/              # Installed dependencies (not included in zip, but required for dev)
package.json               # NPM package manifest
package-lock.json          # NPM lockfile
public/                    # Static assets (if present)
shadcn/                    # Downloaded shadcn/ui components (if used)

- All downloaded or generated UI/UX component libraries (e.g., shadcn/ui) must be present in their respective folders.
- Ensure all config files for build, lint, and test tools are included.
- Update this section if new tools or frameworks are added.
