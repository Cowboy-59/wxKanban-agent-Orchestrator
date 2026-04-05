---
description: sync-global
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

# Sync Global AI Config

Sync between `~/.claude/` (Claude Code installed) and `_wxAI-global/` (starter kit).

> **Claude Code only**: `~/.claude/` is the Claude Code global config directory. For other AIs, adjust the global config path accordingly.

## Run the sync script

```bash
./.claude/scripts/sync-global.sh
```

## Interpret the output

The script outputs:

- **MASTER MODE**: Your `~/.claude/` is truth → update kit from global
- **CONSUMER MODE**: Starter kit is truth → update your global from kit

Categories:

- **Identical**: No action needed
- **Differs**: Files exist in both but content differs
- **Missing in global**: Kit has file, global doesn't
- **Only in global**: Global has file, kit doesn't

## Take action based on mode

### Master Mode (update kit from global)

For **DIFFERS**:

- Read both versions
- Explain what changed
- Ask: "Update kit from your global version?"

For **MISSING IN GLOBAL**:

- These are new kit files not yet installed
- Copy them to global: `cp _wxAI-global/path ~/.claude/path`

For **ONLY IN GLOBAL**:

- Ask: "Should this be added to starter kit?"

### Consumer Mode (update global from kit)

For **DIFFERS**:

- Read both versions
- Check if user's version has customizations
- Ask: "Update your global with kit version?"

For **MISSING IN GLOBAL**:

- Ask: "Install this file to your global?"
- Copy: `cp _wxAI-global/path ~/.claude/path`

## After sync

If files were copied, make scripts executable:

```bash
chmod +x ~/.claude/scripts/*.sh
chmod +x ~/.claude/hooks/*.sh
```
