# Browser capture guide

How to drive and screenshot a web app with the Claude-in-Chrome tools so the
inventory, screenshots, and link interrogation come out clean and complete.

## Table of contents
1. Loading the tools and connecting
2. Sizing the viewport for consistent screenshots
3. Navigating and waiting for content
4. Enumerating interactive elements (the inventory)
5. Interrogating links and elements
6. Taking and saving screenshots
7. Menus, modals, tables, and other tricky UI
8. Sensitive data handling

## 1. Loading the tools and connecting

The browser tools may be deferred. Load the core set in ONE ToolSearch call:

```
select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__get_page_text,mcp__claude-in-chrome__find,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__resize_window
```

Then call `tabs_context_mcp` (or `list_connected_browsers`) to confirm a browser
is connected. If none is connected, ask the user to open the Claude-in-Chrome
extension and sign in to the app there — you inherit that authenticated session,
which is how you document behind-login screens without handling credentials.

## 2. Sizing the viewport for consistent screenshots

Set one window size at the start and keep it for the whole run so every
screenshot has the same scale and the PDF/HTML look uniform. A width around
1440px suits most desktop web apps; 1280px if the app has a narrow layout. Use
`resize_window`. Note the size in `config.json` (`viewport`) so re-shoots match.

## 3. Navigating and waiting for content

- Use `navigate` for direct URLs; use `computer`/`find` + click for in-app
  navigation that has no stable URL (SPA views, modals).
- Data-heavy screens render asynchronously. After navigating, wait for the
  content to actually appear (poll with `read_page`/`find` for a known element)
  before screenshotting — a screenshot of a spinner is worthless.
- Prefer a populated demo/sandbox account. Empty states don't teach the user
  what a real screen looks like; if only empty states exist, note it and shoot
  the empty state but explain what populated data would show.

## 4. Enumerating interactive elements (the inventory)

Don't infer elements from a screenshot — read the DOM. Use `read_page` for
structured element/accessibility info and `get_page_text` for visible text.
Capture, per element: visible label, element type (link/button/tab/input/etc.),
`href` if it's a link, and any `aria-label`/title. This gives you an exact,
complete checklist and the link targets you'll interrogate next. Write it into
`inventory.json`.

Tip: group elements by region (top nav, toolbar, main content, side panel,
row-level actions) — that grouping maps directly onto the section's subheadings.

## 5. Interrogating links and elements

Work through the inventory element by element:

- **Links/tabs/menu items:** click, let the destination load, then `read_page`/
  `get_page_text` to see what appeared. Record the destination screen and the
  *data shown* (what fields, what rows, what it's sorted/filtered by). If it
  opens a new tab, use `tabs_context_mcp` to find it and close it after.
- **Buttons:** click only if safe. Record the resulting state change and any
  confirmation. NEVER confirm a destructive/irreversible action (delete, send,
  pay) on real data — document expected behavior from the confirmation dialog
  text instead, then cancel.
- **Filters/sort/search:** apply, observe how the visible set changes, record
  which field they act on. Reset afterward.
- After anything that changes state, navigate back to a known clean state before
  moving on, so later screenshots aren't polluted.

## 6. Taking and saving screenshots

- Use the `computer` tool's screenshot action (or the extension's screenshot
  capability) to capture the current view. Save raw PNGs to
  `docs-workspace/screens/<id>/raw/`.
- Take a full-view shot first (the section lead image), then, for each element
  cluster you explain, either take a zoomed shot or capture full and let
  `annotate.py` crop to the region — cropping from a high-res full shot is
  usually sharper and more repeatable than fiddling with in-browser zoom.
- Name files predictably: `<id>-overview.png`, `<id>-toolbar.png`, etc.

## 7. Menus, modals, tables, and other tricky UI

- **Dropdown/context menus:** open the menu, screenshot with it open, enumerate
  its items via `read_page`; some menus close on blur, so read and shoot before
  doing anything else.
- **Modals/dialogs:** treat as their own mini-screen; shoot the modal, document
  its fields, then close via its cancel/close control (not by navigating away).
- **Long tables/lists:** shoot the header + first rows for the lead image;
  document each column in "Fields and what they show." Scroll with `computer`
  if you need to reveal columns/rows, but keep the documented view representative.
- **Hover-only tooltips/affordances:** move the mouse to trigger, then shoot.

## 8. Sensitive data handling

If real customer/PII data is on screen and the user asked to mask it, list the
pixel regions to cover and pass them as `redact` boxes to `annotate.py`, which
draws solid blocks over them before the image is ever written to the site/PDF.
Prefer a sandbox account so redaction isn't needed at all.
