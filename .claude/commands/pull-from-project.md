---
description: pull-from-project
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

# Pull From Project

Pull rules and git hooks changes from a real project back into the starter kit. Master only.

## Step 1: Verify Master mode

```bash
if [[ ! -f ".claude/master.txt" ]]; then
  echo "ERROR: Not in starter kit. This command only works from the master repo."
  exit 1
fi
```

## Step 2: Discover and select project

Find projects with `.claude/rules/` folders:

```bash
# Find all projects with .claude/rules directories
for dir in ~/projects/*/; do
  if [[ -d "${dir}.claude/rules" ]]; then
    echo "$(basename "$dir")"
  fi
done
```

Use `AskUserQuestion` tool to present discovered projects:

- Show up to 4 projects as options (most recently modified first)
- User can select one or choose "Other" to enter custom path
- Option labels should be just the project name (e.g., "mysite.nextagedesigns")
- Option descriptions should show the full path

## Step 3: Validate project

```bash
PROJECT_PATH="[user provided path]"

if [[ ! -d "$PROJECT_PATH" ]]; then
  echo "ERROR: Path does not exist: $PROJECT_PATH"
  exit 1
fi

if [[ ! -d "$PROJECT_PATH/.claude/rules" ]]; then
  echo "ERROR: No .claude/rules/ folder in project"
  exit 1
fi
```

## Step 4: Compare rules files (recursive)

```bash
# Find all .md files recursively
find "$PROJECT_PATH/.claude/rules" -name "*.md" -type f | while read project_file; do
  # Get relative path
  rel_path="${project_file#$PROJECT_PATH/.claude/rules/}"
  kit_file="./_claude-project/rules/$rel_path"

  # Skip project-specific files and folders
  [[ "$rel_path" == "projectrules.md" ]] && continue
  [[ "$rel_path" == project/* ]] && continue

  if [[ ! -f "$kit_file" ]]; then
    echo "NEW: $rel_path"
  elif diff -q "$project_file" "$kit_file" > /dev/null 2>&1; then
    echo "IDENTICAL: $rel_path"
  else
    echo "DIFFERS: $rel_path"
  fi
done
```

## Step 5: Compare git hooks

```bash
# Only compare hooks that exist in starter kit (canonical set)
for kit_hook in ./_git-hooks-project/*; do
  hookname=$(basename "$kit_hook")
  project_hook="$PROJECT_PATH/.git/hooks/$hookname"

  if [[ ! -f "$project_hook" ]]; then
    echo "MISSING IN PROJECT: $hookname"
  elif diff -q "$kit_hook" "$project_hook" > /dev/null 2>&1; then
    echo "IDENTICAL: $hookname"
  else
    echo "DIFFERS: $hookname"
  fi
done
```

## Step 6: For DIFFERS rules files

Show diff and ask:

```bash
diff "./_claude-project/rules/$rel_path" "$PROJECT_PATH/.claude/rules/$rel_path"
```

"Pull project version? (y/n)"

## Step 7: For NEW rules files

Show first 30 lines, ask: "Add to starter kit? (y/n)"

Ensure parent directories exist:

```bash
mkdir -p "$(dirname "./_claude-project/rules/$rel_path")"
```

## Step 8: For DIFFERS git hooks

Show diff and ask:

```bash
diff "./_git-hooks-project/$hookname" "$PROJECT_PATH/.git/hooks/$hookname"
```

"Pull project version? (y/n)"

## Step 9: Apply rules

```bash
mkdir -p "$(dirname "./_claude-project/rules/$rel_path")"
cp "$PROJECT_PATH/.claude/rules/$rel_path" "./_claude-project/rules/$rel_path"
```

## Step 10: Apply git hooks

```bash
cp "$PROJECT_PATH/.git/hooks/$hookname" "./_git-hooks-project/$hookname"
```

## Step 11: Summary

Report what was pulled:

- X rules files updated
- Y new rules files added
- Z git hooks updated

Note: Rules are auto-discovered. No import updates needed (unlike legacy AGENTS.md).
