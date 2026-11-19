# Output structure, schemas, and theming

## docs-workspace/ layout

```
docs-workspace/
├── config.json              # product name, branding, viewport, audience
├── inventory.json           # screen map + every interactive element + behavior
├── screens/
│   └── <id>/
│       ├── raw/             # raw screenshots straight from the browser
│       └── img/             # cropped + annotated finals referenced by sections
├── sections/
│   └── <id>.md              # one Markdown file per screen (the source of truth)
├── site/                    # GENERATED: self-contained HTML help site
└── <ProductName>-User-Guide.pdf   # GENERATED: PDF manual
```

The `sections/*.md` files plus `config.json` are the single source of truth.
Both the HTML site and the PDF are generated from them, so content never
diverges between the two outputs.

## config.json schema

```json
{
  "product_name": "wxKanban",
  "audience": "end users",
  "base_url": "",                        // optional, for hosted HTML links
  "viewport": { "width": 1440, "height": 900 },
  "theme": {
    "accent": "#2563eb",                 // brand color for headings/links
    "logo": "assets/logo.png",           // optional, relative to docs-workspace
    "font": "system"                     // "system" | "serif" | a CSS family
  },
  "section_order": ["board-view", "card-detail", "filters", "settings"]
}
```

`section_order` controls the order in the index, sidebar, and PDF. Any section
not listed is appended alphabetically.

## inventory.json schema

```json
{
  "screens": [
    {
      "id": "board-view",
      "title": "Board view",
      "url": "https://app.example.com/boards/1",
      "nav": "Top nav > Boards > pick a board",
      "elements": [
        {
          "label": "New Card",
          "type": "button",
          "region": "toolbar",
          "href": null,
          "behavior": "Opens the New Card dialog; on save adds a card to the selected column."
        },
        {
          "label": "Assignee",
          "type": "column",
          "region": "card",
          "behavior": "Shows the avatar of the user the card is assigned to; empty if unassigned."
        }
      ]
    }
  ]
}
```

Every element needs a `behavior` filled in during interrogation (step 4). The
verify step (step 7) fails if any element is missing one.

### --teach additions (SCOPE-138)

- Elements may carry `commits`: `"save"`, `"submit"`, `"send"` or `"delete"` when a click persists or
  transmits data, or `false` when it only opens something. When it is absent, a button is judged by
  its label's leading verb.
- A top-level `processes` list: `{ id, title, goal, steps: [{ screen, element, action, example?, expect? }] }`.
  `screen` is a screen `id`, and `element` is an element `label` on that screen. Example values are made up.

`config.json` gains, for `--teach`:

```json
"environments": {
  "uat": ["https://uat.example.com"],
  "production": ["https://app.example.com"]
}
```

Written by `teach.mjs env`. It holds addresses only, no credentials or tokens. Lessons go to
`docs/teaching-skills/`, alongside a `.lessons.json` manifest (versions and content hashes; not part of the
bundle) and the zip.

### --video additions (SCOPE-139)

An element may carry an optional `selector` (a CSS selector) when its label alone does not find it
during replay. `config.json` gains a `video` block (see SKILL.md, --video). Videos go to
`docs/onboarding-videos/<lesson>.mp4` with a `.videos.json` manifest (each video's lesson id and
version, environment, attestation, pinned HyperFrames version, duration, length flag) and
`THIRD-PARTY-NOTICES.md`; the folder is gitignored. `video-log.jsonl` in the workspace keeps every
attestation and run.

## Section Markdown conventions the builder relies on

- The first `#` heading is the section title (used in the index, sidebar, TOC).
- Image paths are relative to the section's `img/` folder.
- Cross-links to other screens use the target's filename, e.g.
  `[Card detail](card-detail.md)`. The builder rewrites these to the right
  anchor for HTML (`card-detail.html`) and PDF (internal bookmark).
- A `## Fields and what they show` section feeds the generated A–Z field index.
  Use a simple `**Field** — what it shows` line per field, or a two-column table.

## HTML site output

`build_docs.py --html` writes a self-contained `site/`:

- `index.html` — home page: product title, optional logo, and a list/cards of
  all sections in `section_order`.
- one `*.html` per section with a persistent left sidebar nav.
- `fields-index.html` — alphabetical index of every documented field/element
  with a link to where it's explained.
- a client-side search box (no server needed) over section titles and headings.
- `assets/` with copied images and CSS themed from `config.json`.

Because it's self-contained, the folder can be zipped, dropped on a static host,
or opened directly from disk. Use `--base-url` if links must be absolute for a
particular host.

## PDF manual output

`build_docs.py --pdf` writes `<ProductName>-User-Guide.pdf`:

- title page (product name, logo, generated date),
- auto table of contents with page numbers,
- sections in `section_order`, each starting on a new page,
- running page numbers and internal links for cross-references.

PDF engine resolution order: `weasyprint` (best CSS fidelity) → `wkhtmltopdf` →
headless Chrome `--print-to-pdf`. The script picks the first available and tells
you which it used; install weasyprint (`pip install weasyprint`) for best results.

## Theming

Theme comes entirely from `config.json`'s `theme`. To restyle, edit that and
rebuild — don't hand-edit generated files, since the next build overwrites them.
For deeper changes, pass `--css <file>` to override the stylesheet.
