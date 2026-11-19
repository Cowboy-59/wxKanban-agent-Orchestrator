---
id: cmd-watermark
part: command-reference
audience: customer
sources: _wxAI/commands/watermark.md
generated: true
---

# /watermark

manually stamp or verify the wxKanban generated-output watermark on a Markdown file.

| | |
|---|---|
| **Runs in** | AI slash command |
| **How to start it** | `/watermark` |
| **Stage** | Any stage |

## How to run it

```text
npm run watermark verify <file.md>
npm run watermark stamp <file.md> [--converted] [--version <v>] [--generator <name>] [--write]
```

## What it calls

None.

## What calls it

None.

:::internal
**Read from:** `_wxAI/commands/watermark.md`

**Stage confidence:** Likely (from the generator's stage map until the command declares its own)

:::
