---
version: alpha
name: Porsche Analysis
description: >
  A deliberately monochrome, engineered system where near-black ink (#010205)
  on white does almost all the work, the only "colour" is the photography, and
  hierarchy is built from sheer size in a single regular weight of Porsche Next —
  calm, precise, and unmistakably premium, with the famous Guards Red held back
  for the crest rather than the interface.

colors:
  primary: "#010205"          # primary actions, dark buttons, brand ink (--p-color-primary, light)
  primary-active: "#2b2b30"   # pressed/hover state on the black button
  on-primary: "#ffffff"       # text/icon on the black button
  dark: "#010205"             # inverted bands, dark pills, "feature" panels (same near-black)
  canvas: "#ffffff"           # page background / white content surface (--p-color-canvas)
  canvas-soft: "#f1f1f4"      # recessed section background (--p-color-surface)
  surface: "#ffffff"          # card / panel surface (white cards on grey)
  surface-alt: "#dadbde"      # chip / sunken "frosted" fill behind spec tags
  ink: "#010205"              # headings & body text (Porsche true-black)
  ink-secondary: "#5f5f62"    # secondary text (--p-color-contrast-high, rgba(26,26,30,.7) over white)
  ink-muted: "#707071"        # muted labels (--p-color-contrast-medium, rgba(17,17,19,.6))
  ink-faint: "#929294"        # captions / placeholders (--p-color-contrast-low, rgba(36,36,40,.5))
  hairline: "#c6c6c9"         # 1px borders & dividers (--p-color-contrast-lower, rgba(79,80,89,.324))
  hairline-soft: "#e6e6ea"    # faint section divider
  # semantic (measured from --p-color-* tokens, light theme)
  success: "#197e10"
  error: "#ba171f"            # the closest red in the UI system — reserved for errors, not CTAs
  warning: "#ac5102"
  info: "#1a44ea"             # also the focus-ring colour (--p-color-focus)
  # heritage accent (NOT used as a UI fill on the live site — brand/crest only)
  accent-guards-red: "#d5001c"

typography:
  display-1: { fontFamily: "Porsche Next, Saira, sans-serif", fontSize: 120px, fontWeight: 400, lineHeight: 1.18, letterSpacing: normal }
  display-2: { fontFamily: "Porsche Next, Saira, sans-serif", fontSize: 90px,  fontWeight: 400, lineHeight: 1.19, letterSpacing: normal }
  heading-1: { fontFamily: "Porsche Next, Saira, sans-serif", fontSize: 50px,  fontWeight: 400, lineHeight: 1.10, letterSpacing: normal }
  heading-2: { fontFamily: "Porsche Next, Saira, sans-serif", fontSize: 38px,  fontWeight: 400, lineHeight: 1.10, letterSpacing: normal }
  heading-3: { fontFamily: "Porsche Next, Saira, sans-serif", fontSize: 28px,  fontWeight: 400, lineHeight: 1.20, letterSpacing: normal }
  title:     { fontFamily: "Porsche Next, Saira, sans-serif", fontSize: 21px,  fontWeight: 600, lineHeight: 1.41, letterSpacing: normal }
  body-lg:   { fontFamily: "Porsche Next, Saira, sans-serif", fontSize: 21px,  fontWeight: 400, lineHeight: 1.41, letterSpacing: normal }
  body-md:   { fontFamily: "Porsche Next, Saira, sans-serif", fontSize: 16px,  fontWeight: 400, lineHeight: 1.50, letterSpacing: normal }
  body-sm:   { fontFamily: "Porsche Next, Saira, sans-serif", fontSize: 14px,  fontWeight: 400, lineHeight: 1.50, letterSpacing: normal }
  button:    { fontFamily: "Porsche Next, Saira, sans-serif", fontSize: 16px,  fontWeight: 400, lineHeight: 1.50, letterSpacing: normal }
  caption:   { fontFamily: "Porsche Next, Saira, sans-serif", fontSize: 12px,  fontWeight: 400, lineHeight: 1.33, letterSpacing: normal }
  eyebrow:   { fontFamily: "Porsche Next, Saira, sans-serif", fontSize: 12px,  fontWeight: 600, lineHeight: 1.33, letterSpacing: 0.4px, textTransform: uppercase }

rounded:
  xs: 4px
  sm: 8px
  md: 12px      # the workhorse — buttons (p-link), tags, inputs
  lg: 16px
  xl: 24px      # cards
  xxl: 32px     # large feature buttons / containers (homepage)
  full: 9999px  # pills, spec chips, radio controls

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px

elevation:
  level-0: "none"                                 # most of the site is flat: white cards on grey, hairline only
  level-1: "0px 4px 16px rgba(0,0,0,0.16)"        # --p-shadow-md — hover / raised cards / overlays
  level-2: "0px 8px 40px rgba(0,0,0,0.16)"        # --p-shadow-lg — flyout menus, modals
  # also present: --p-shadow-sm "0px 3px 8px rgba(0,0,0,0.16)"

components:
  nav-bar:        { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.body-md}", padding: 16px 40px, note: "minimal — centred PORSCHE wordmark, left 'Menu' hamburger, right locale + account; transparent over hero imagery" }
  button-primary: { background: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.md}", padding: 14px 24px, note: "solid near-black; the single primary CTA across the site" }
  button-secondary: { background: "transparent", textColor: "{colors.ink}", border: "1px solid {colors.ink}", rounded: "{rounded.md}", padding: 13px 23px }
  button-pill:    { background: "{colors.surface-alt}", textColor: "{colors.ink}", rounded: "{rounded.full}", padding: 11px 18px, note: "frosted spec chips e.g. 'Rear-Wheel Drive'" }
  badge-filled:   { background: "{colors.dark}", textColor: "{colors.on-primary}", rounded: "{rounded.full}", padding: 5px 12px, note: "e.g. the '2025' model-year tag" }
  card:           { backgroundColor: "{colors.surface}", rounded: "{rounded.xl}", shadow: "{elevation.level-0}", hoverShadow: "{elevation.level-1}", note: "white model card on grey canvas, borderless, radius 24px" }
  text-input:     { background: "{colors.canvas}", textColor: "{colors.ink}", border: "1px solid {colors.hairline}", rounded: "{rounded.md}", padding: 12px 16px, placeholder: "{colors.ink-faint}" }
  link-inline:    { textColor: "{colors.ink}", decoration: underline, typography: "{typography.body-md}" }
---

# Porsche — Design Language Analysis

Porsche's site is an exercise in subtraction. Almost everything is near-black type and the occasional grey rule sitting on either pure white or a single soft grey, and the only saturated colour on most pages comes from the car photography itself. The interface gets out of the way so the product can be the hero. What makes it feel expensive is not decoration but discipline: one typeface, essentially one weight, a tiny set of greys, generous space, and a primary action that is confident matte black rather than the loud red most people expect. The whole thing reads as engineered — measured, premium, and quietly assured.

## Colour

The palette is grounded in two near-blacks — pure `#000000` and Porsche's signature off-black `#010205` — which together account for the overwhelming majority of rendered colour and serve as both ink and the primary action fill. Backgrounds alternate between white (`#ffffff`, the Design System's `--p-color-canvas`) and a single cool grey (`#f1f1f4`, `--p-color-surface`) used to recess sections and let white cards float. The text hierarchy is built almost entirely from translucent black: secondary text is roughly `#5f5f62`, muted labels `#707071`, and captions/placeholders fade to `#929294` — all derived from the `--p-color-contrast-*` alpha tokens rather than hand-picked greys, so the ramp stays perfectly tonal. Hairlines are the lightest of these, about `#c6c6c9`. Saturated colour is confined to semantic states pulled straight from the system tokens: success green `#197e10`, error red `#ba171f`, warning `#ac5102`, and an info/focus blue `#1a44ea`. The famous Guards Red (`#d5001c`) is conspicuously *absent* from the working UI — on the modern site it belongs to the crest and the heritage, not the buttons. That restraint is the whole point.

## Typography

Everything is set in **Porsche Next**, the marque's proprietary humanist sans (resolved stack: `"Porsche Next", "Arial Narrow", Arial, …`, the narrow fallback hinting at its slightly economical width). Because it is licensed, this showcase substitutes **Saira** (Google Fonts) — a clean, modern, faintly technical grotesque with the same economical proportions and an elegant light/regular weight — and labels it as a stand-in. The most distinctive trait is that hierarchy is created by *size, not weight*: the homepage hero ("The new 911 GT4 R.") lands near 120px at weight **400**, and even the 50px page titles stay at 400. Bold is rare; a 600 semibold appears only for small emphasis like prices. Letter-spacing is left at the font's native `normal` everywhere — Porsche trusts Porsche Next's own metrics to set the giant headings tight, rather than tracking them manually. The body workhorse is 16px/400 with a 14px secondary tier and a 12px caption, all generously leaded (~1.5). The result is airy, editorial, and calm even at billboard scale.

## Shape & depth

Corner rounding is gentle and consistent. The workhorse radius is **12px**, applied to buttons (the `p-link` web component), tags, and inputs; cards step up to **24px**; smaller chips and controls use 6–8px; and large homepage feature buttons reach **32px**. Pills, spec chips, the model-year badge, and radio controls go fully round. Depth is mostly *implied rather than cast* — the site is overwhelmingly flat, relying on the white-card-on-grey contrast and 1px hairlines (level-0) instead of shadows. When elevation is needed it comes from a small, deliberate shadow scale defined in the system: `--p-shadow-sm` (0 3px 8px / .16), `--p-shadow-md` (0 4px 16px / .16) for hovered cards and overlays, and `--p-shadow-lg` (0 8px 40px / .16) for flyout menus and modals — all pure black at 16% alpha, never coloured.

## Layout & responsive

Spacing follows an 8px-based rhythm (4 / 8 / 12 / 16 / 24 / 32 / 48), with large vertical breathing room between full-width sections. Content sits in a centred max-width container; model and content cards lay out 3-up on desktop, collapsing to 2-up on tablet and a single column on mobile. The header is intentionally sparse — a centred `PORSCHE` wordmark with a left "Menu" affordance that opens a full overlay nav, and locale/account icons on the right — and it rides transparently over hero imagery before settling onto white. Filters and faceted lists (the model overview) use a left rail of radio groups and accordion sections beside the card grid, then stack the rail above the grid on small screens. Throughout, the responsive strategy is the same as the visual one: remove, align, and let the photography carry the weight.
