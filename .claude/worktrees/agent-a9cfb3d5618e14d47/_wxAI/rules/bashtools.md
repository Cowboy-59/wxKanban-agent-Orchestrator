## Shell Tools (Install if missing)

Use these via the Bash tool for specialized tasks.

| Task                  | Tool       | Example                                         |
| --------------------- | ---------- | ----------------------------------------------- |
| Find files by pattern | `fd`       | `fd '*.tsx' src/`                               |
| Find AST patterns     | `ast-grep` | `ast-grep --pattern 'function $NAME() { $$$ }'` |
| Parse JSON            | `jq`       | `jq '.dependencies' package.json`               |
| Parse YAML            | `yq`       | `yq '.services' docker-compose.yml`             |

**Built-in tools (don't use bash for these):**

- File search → `Glob`
- Text search → `Grep` (rg wrapper)
- Semantic search → `LSP` (see constitution.md XI)
