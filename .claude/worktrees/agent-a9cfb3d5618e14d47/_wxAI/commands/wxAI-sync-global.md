---
description: Sync governance rules from wxKanban source to consumer projects, or check version status
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

# wxAI-sync-global

**Governance Rules Sync** — Syncs AI governance rules from the wxKanban source project to consumer projects. Checks version status, applies updates, and logs all sync operations to the audit trail.

## User Input

```text
{{args}}
```

---

## Purpose

The wxKanban governance framework (constitution, projectrules, wxAI commands) is maintained in the wxKanban source project and distributed to all consumer projects. This command:

1. **Checks** whether the consumer project's governance rules are up to date
2. **Applies** updates from the wxKanban source when available
3. **Logs** all sync operations to `companyauditlogs` with `actiontype = 'rules_sync'`
4. **Blocks** implementation if the consumer project is 2+ major versions behind

---

## Flags

| Flag | Description |
|------|-------------|
| `--check` | Check version status only (no changes) |
| `--apply` | Apply available updates from wxKanban source |
| `--push` | Push local changes to wxKanban source (source project only) |
| `--force` | Apply updates even if consumer has local customizations |
| `--dry-run` | Show what would be updated without making changes |
| `--version` | Show current version info |

---

## Execution Steps

### Step 1 — Detect Project Type

```bash
test -f .wxkanban-origin && echo "SOURCE" || echo "CONSUMER"
```

- **SOURCE project**: Can push changes to the global rules store
- **CONSUMER project**: Can only pull updates from the global rules store

---

### Step 2 — Read Version Files

**Consumer project** reads `.wxkanban-version`:
```json
{
  "version": "1.0.0",
  "is_origin": false,
  "last_sync": "2025-01-28T00:00:00Z",
  "source_project": "wxKanban",
  "managed_files": [...]
}
```

**Source project** reads `.wxkanban-origin`:
```json
{
  "project": "wxKanban",
  "version": "1.0.0",
  "is_origin": true,
  "protected_files": [...]
}
```

---

### Step 3 — Check Version (--check mode)

Compare consumer version against the latest available version:

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  🔍 wxKanban GOVERNANCE VERSION CHECK                                        ║
╚══════════════════════════════════════════════════════════════════════════════╝
Consumer version:  1.0.0
Latest version:    1.2.0
Status:            ⚠️  1 minor version behind

Files that would be updated:
  _wxAI/rules/constitution.md          (v1.0.0 → v1.2.0)
  _wxAI/commands/wxAI-implement.md     (v1.0.0 → v1.2.0)
  _wxAI/commands/wxAI-scope-check.md   (v1.0.0 → v1.2.0)

Run: wxai sync-global --apply
```

**Version status thresholds:**
- Same version → ✅ Up to date
- 1 minor version behind → ⚠️ Warning (implementation allowed)
- 1 major version behind → ⚠️ Strong warning (implementation allowed with notice)
- 2+ major versions behind → ⛔ BLOCK (implementation blocked until updated)

---

### Step 4 — Apply Updates (--apply mode)

For each managed file that has changed:

1. Check if the consumer has local customizations in the file
2. If customizations exist and `--force` not set → warn and skip that file
3. If no customizations or `--force` set → apply the update

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  📥 APPLYING GOVERNANCE UPDATES                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
Updating from v1.0.0 → v1.2.0

  ✅ _wxAI/rules/constitution.md          — updated
  ✅ _wxAI/commands/wxAI-implement.md     — updated
  ✅ _wxAI/commands/wxAI-scope-check.md   — updated
  ⚠️  _wxAI/rules/projectrules.md         — SKIPPED (local customizations detected)
     Run with --force to override local customizations

3 files updated. 1 file skipped.
```

**Preservation rule**: Consumer project customizations in `projectrules.md` (Sections I-VII) are ALWAYS preserved. Only Section VIII (AI Governance) is updated.

---

### Step 5 — Update Version File

After successful apply, update `.wxkanban-version`:

```json
{
  "version": "1.2.0",
  "is_origin": false,
  "last_sync": "2025-01-28T12:00:00Z",
  "source_project": "wxKanban",
  "managed_files": [...],
  "version_history": [
    { "version": "1.0.0", "applied": "2025-01-28T00:00:00Z" },
    { "version": "1.2.0", "applied": "2025-01-28T12:00:00Z" }
  ]
}
```

---

### Step 6 — Log to Audit Trail

Log the sync to `companyauditlogs`:

```json
{
  "action": "ai_interaction",
  "description": "Governance rules synced: v1.0.0 → v1.2.0. 3 file(s) updated.",
  "newvalue": {
    "actiontype": "rules_sync",
    "fromversion": "1.0.0",
    "toversion": "1.2.0",
    "filesupdated": [
      "_wxAI/rules/constitution.md",
      "_wxAI/commands/wxAI-implement.md",
      "_wxAI/commands/wxAI-scope-check.md"
    ],
    "timestamp": "2025-01-28T12:00:00Z"
  }
}
```

---

### Step 7 — Push Mode (Source Project Only)

If `--push` flag is used and project is SOURCE:

1. Increment version in `.wxkanban-origin`
2. Package managed files for distribution
3. Make available to consumer projects via sync mechanism
4. Log the push to audit trail

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  📤 PUSHING GOVERNANCE UPDATES                                               ║
╚══════════════════════════════════════════════════════════════════════════════╝
New version: 1.3.0 (was 1.2.0)

Files packaged for distribution:
  ✅ _wxAI/rules/constitution.md
  ✅ _wxAI/rules/projectrules.md
  ✅ _wxAI/commands/wxAI-implement.md
  ✅ _wxAI/commands/wxAI-scope-check.md
  ✅ _wxAI/commands/wxAI-training.md
  ✅ _wxAI/commands/wxAI-todo-import.md
  ✅ _wxAI/commands/wxAI-sync-global.md
  ✅ _wxAI/commands/wxAI-session-start.md

Consumer projects will receive v1.3.0 on next session start.
```

---

## CLI Usage

```bash
# Check version status (no changes)
wxai sync-global --check

# Apply available updates
wxai sync-global --apply

# Apply updates, overriding local customizations
wxai sync-global --apply --force

# Dry run — show what would change
wxai sync-global --apply --dry-run

# Push changes from source project
wxai sync-global --push

# Show current version info
wxai sync-global --version
```

---

## Managed Files

These files are managed by the sync system and updated from the wxKanban source:

```
_wxAI/rules/constitution.md
_wxAI/rules/projectrules.md          (Section VIII only — consumer sections preserved)
_wxAI/commands/wxAI-implement.md
_wxAI/commands/wxAI-scope-check.md
_wxAI/commands/wxAI-training.md
_wxAI/commands/wxAI-todo-import.md
_wxAI/commands/wxAI-sync-global.md
_wxAI/commands/wxAI-session-start.md
.wxkanban-version                     (version tracking — always updated)
```

---

## Integration with wxAI-session-start

`wxAI-session-start` calls `wxai sync-global --check` automatically on every project open. If the version is 2+ major versions behind, it blocks implementation and prompts the developer to run `wxai sync-global --apply`.
