---
description: watermark — manually stamp or verify the wxKanban generated-output watermark on a Markdown file.
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

# watermark — manual stamp / verify (SCOPE-082)

Generated wxKanban artifacts (lifecycle, devplan, project-overview, scope-analysis, and the
`wxConversion` / `cwConversion` / `vbConversion` outputs) are stamped **automatically** with a
wxKanban attribution: a frontmatter provenance block, a visible footer linking to
**www.wxperts.com**, and an invisible zero-width signature. Rendered PDFs also get document
metadata + a per-page footer.

This command is the **manual escape hatch** — apply or check the mark by hand when a document
was hand-authored or a generator was bypassed. It is a branding / funnel mark, **not** a
tamper-proof control (the visible mark is removable; the zero-width signature is brittle).

## Usage

```bash
# Check whether a file carries the mark (exit 0 = present, 1 = absent)
npm run watermark verify <file.md>

# Stamp a file (prints to stdout; --write overwrites in place)
npm run watermark stamp <file.md> [--converted] [--version <v>] [--generator <name>] [--write]
```

- `--converted` — use the "Converted with wxKanban" verb (conversion outputs); default is "Generated with".
- `--version <v>` — version recorded in the mark; defaults to `APP_VERSION`.
- `--generator <name>` — label stored in the frontmatter (e.g. `lifecycle`, `wxConversion`).
- `--write` — overwrite the file instead of printing to stdout.

Stamping is **idempotent** (a file already carrying the mark is returned unchanged) and
**fail-open** (on any error the original content is returned, never blocking).

## Under the hood

- Shared module: `@wxkanban/watermark` (`shared/watermark`) — `stampMarkdown` / `verifyMarkdown`.
- Python port (conversion skills): `shared/watermark/python/wxkanban_watermark.py` — byte-compatible.
- CLI: `scripts/watermark.mjs`.
