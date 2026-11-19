# Baseline: wxHelpGenerate before Teaching Skills

**Spec**: SPEC-138 · **Task**: T001 (FR-012) · **Recorded**: 2026-10-17

wxHelpGenerate shipped without an owning scope. SCOPE-138 is now its home. This file records what it
does **before** `--teach` is added, so FR-001's "a run without `--teach` behaves exactly as before" has
something exact to be checked against.

## Where it lives

| Copy | Path | Role |
|---|---|---|
| Authoring copy | `.claude/skills/wxHelpGenerate/` | What Claude Code loads in this repo |
| Shipped copy | `_wxAI/skills/wxHelpGenerate/` | Mirrored into the kit by `sync-to-orchestrator.mjs` |
| Command stub | `_wxAI/commands/wxHelpGenerate.md` | `/wxHelpGenerate`; listed under **Standard** in the Cockpit |

On 2026-10-17 the two copies were identical, file by file: `SKILL.md`,
`references/browser-capture.md`, `references/output-structure.md`, `scripts/annotate.py` and
`scripts/build_docs.py`. Every SPEC-138 task changes both copies in the same commit, and T014 diffs
them.

## What it does

An AI-driven skill (the AI follows `SKILL.md`), plus two Python scripts. Seven steps:

1. **Scope.** Ask for the app URL, sign-in (the user signs in first in the connected browser; never
   raw passwords or MFA codes), coverage, audience, branding and sensitive data. The answers go to
   `docs-workspace/config.json`.
2. **Inventory.** Walk the app with the Claude-in-Chrome tools. For each screen, record `id`,
   `title`, `url`, `nav` and its interactive `elements` (`label`, `type`, `region`, `href`) in
   `docs-workspace/inventory.json`.
3. **Capture.** Full and cropped screenshots into `docs-workspace/screens/<id>/raw|img/`, annotated
   and redacted with `scripts/annotate.py` from a JSON spec.
4. **Interrogate.** Click every element and record what it really does in its `behavior` field
   ("labels lie"). Note cross-links by target screen id.
5. **Write.** One `docs-workspace/sections/<id>.md` per screen, from a fixed template: overview,
   "What you're looking at", per-panel sections, **Common tasks** (short numbered how-tos), and
   **Fields and what they show**.
6. **Publish.** `python scripts/build_docs.py docs-workspace --html --pdf` writes `site/` (index, one
   page per section, an A–Z fields index, client-side search) and `<Product>-User-Guide.pdf`.
   PDF engine order: weasyprint, then wkhtmltopdf, then headless Chrome.
7. **Verify.** Every element has a `behavior` and is documented; every image renders; every
   cross-link resolves; no unredacted private data.

## Data it reads and writes

- `config.json`: `product_name`, `audience`, `base_url`, `viewport`, `theme` (`accent`, `logo`,
  `font`) and `section_order`.
- `inventory.json`: `screens[]`, each with `id`, `title`, `url`, `nav` and `elements[]`, where each
  element has `label`, `type`, `region`, `href` and `behavior`.
- **There is no notion of a "process"** in either file. Tasks exist only as prose, in each
  section's "Common tasks". *(Recorded because FR-001 and SC-1 count lessons against "the
  inventory's processes", which therefore have to be added; see the T002 decision.)*

## Safety rules it already has

- **Walk rule:** never confirm a destructive or irreversible action (delete, send, pay) on real
  data. Document the expected behavior from the confirmation dialog instead
  (`references/browser-capture.md` §5). SCOPE-138 Constraint 6 keeps this rule.
- **Sensitive data:** prefer a sandbox account; otherwise redact regions with `annotate.py`, and
  check for unredacted data at verification (§8, Step 7). The FR-007 pre-write check for lessons is
  added on top of this; it does not replace it.

## Staleness today

The only signal is `.wxai/help-stale.json`, written by this repo's own `.husky/pre-push` when a push
touches `src/client/(pages|components)/` without touching the help sources. It is all-or-nothing,
advisory, and exists only in the wxKanban repo. For teaching lessons FR-006 replaces it with
per-lesson flags from SPEC-137 Change Impact. The help site keeps it.

## Requirements of its environment

- Claude-in-Chrome browser tools for the walk.
- Python 3 with Pillow for `annotate.py`, and weasyprint or wkhtmltopdf (or headless Chrome) for
  the PDF.
- Observed 2026-10-17: the wxperts development machine has **no Python** (`python3` resolves to the
  Microsoft Store alias). The teaching writer is therefore written in Node, which every kit install
  already has, and does not add to the Python requirement.
