---
version: alpha
name: Nike Analysis
description: >
  A militantly monochrome system — near-black ink (#111) on pure-white canvas,
  a four-stop grey ramp, and zero chromatic accent — where the only "brand colour"
  is the black pill CTA and all real colour is delegated to full-bleed product
  imagery, set in tight, untracked, uppercase Helvetica Now display type.

colors:
  primary: "#111111"          # black pill CTAs, links, brand marks
  primary-active: "#2e2e2e"   # pressed/hover on the black pill
  on-primary: "#ffffff"       # text/icon on primary
  dark: "#111111"             # inverted bands / dark hero overlays
  canvas: "#ffffff"           # page background
  canvas-soft: "#f5f5f5"      # off-tint section bg, light utility pills
  surface: "#ffffff"          # card / panel surface
  surface-alt: "#e5e5e5"      # sunken fill, dividers, skeletons
  ink: "#111111"              # headings & body text
  ink-secondary: "#707072"    # subtext, secondary labels
  ink-muted: "#767676"        # muted captions, placeholder text
  ink-faint: "#cacacb"        # disabled, faint borders, placeholder ink
  hairline: "#cacacb"         # 1px control borders (inputs, selects)
  hairline-soft: "#e5e5e5"    # 1px section dividers & sticky-nav underline
  accent-slate: "#2b333f"     # rare dark-slate text accent (sub-brand modules)

typography:
  display-1: { fontFamily: "Helvetica Now Text", fontSize: 76px, fontWeight: 500, lineHeight: 0.9, letterSpacing: normal, textTransform: uppercase }
  heading-1: { fontFamily: "Helvetica Now Text", fontSize: 32px, fontWeight: 500, lineHeight: 1.2, letterSpacing: normal }
  heading-2: { fontFamily: "Helvetica Now Text", fontSize: 24px, fontWeight: 500, lineHeight: 1.2, letterSpacing: normal }
  heading-3: { fontFamily: "Helvetica Now Text", fontSize: 20px, fontWeight: 500, lineHeight: 1.2, letterSpacing: normal }
  title:     { fontFamily: "Helvetica Now Text", fontSize: 20px, fontWeight: 500, lineHeight: 1.2, letterSpacing: normal }
  body-lg:   { fontFamily: "Helvetica Now Text", fontSize: 19.2px, fontWeight: 400, lineHeight: 1.5, letterSpacing: normal }
  body-md:   { fontFamily: "Helvetica Now Text", fontSize: 16px, fontWeight: 400, lineHeight: 1.5, letterSpacing: normal }
  button:    { fontFamily: "Helvetica Now Text", fontSize: 16px, fontWeight: 500, lineHeight: 1.5, letterSpacing: normal }
  body-sm:   { fontFamily: "Helvetica Now Text", fontSize: 14px, fontWeight: 500, lineHeight: 1.5, letterSpacing: normal }
  caption:   { fontFamily: "Helvetica Now Text", fontSize: 13.33px, fontWeight: 400, lineHeight: 1.4, letterSpacing: normal }
  eyebrow:   { fontFamily: "Helvetica Now Text", fontSize: 12px, fontWeight: 500, lineHeight: 1.0, letterSpacing: normal }

rounded:
  xs: 2px
  sm: 4px
  md: 8px
  lg: 18px
  xl: 24px
  xxl: 30px
  full: 9999px     # Nike approximates "full" with a fixed 30px pill radius; circular icon buttons use 50%

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px

elevation:
  level-0: "none"                                                                        # default — cards & product tiles are flat
  level-1: "0 4px 8px rgba(17,17,17,0.06), 0 0 24px 4px rgba(17,17,17,0.03)"             # hover card / flyout panel
  level-2: "0 16px 40px rgba(17,17,17,0.12)"                                             # modal / mega-menu (rarely used)
  divider-inset: "inset 0 -1px 0 0 #e5e5e5"                                              # sticky-nav / tab underline

components:
  nav-bar:          { backgroundColor: "{colors.canvas}", scrolledBackground: "rgba(255,255,255,0.7)", textColor: "{colors.ink}", typography: "{typography.button}", padding: "12px 24px", underline: "{elevation.divider-inset}" }
  button-primary:   { background: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.full}", padding: "6px 16px", hover: "{colors.primary-active}" }
  button-secondary: { background: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.button}", rounded: "{rounded.full}", padding: "6px 16px", note: "white pill used over dark imagery" }
  button-utility:   { background: "{colors.canvas-soft}", textColor: "{colors.ink}", typography: "{typography.button}", rounded: "{rounded.full}", padding: "6px 16px", note: "light-grey tertiary pill" }
  product-card:     { backgroundColor: "{colors.canvas}", rounded: "{rounded.xs}", shadow: "{elevation.level-0}", hoverShadow: "{elevation.level-0}", note: "square image tiles, no rounding, no shadow — whitespace separates" }
  text-input:       { backgroundColor: "{colors.canvas}", border: "1px solid {colors.hairline}", rounded: "{rounded.lg}", padding: "12px", textColor: "{colors.ink}", placeholderColor: "{colors.ink-muted}" }
  badge-pill:       { backgroundColor: "{colors.canvas}", textColor: "{colors.primary}", typography: "{typography.eyebrow}", rounded: "{rounded.full}", padding: "5px 10px", note: "e.g. 'Just In' over product photos" }
---

# Nike — Design Language Analysis

Nike's storefront is one of the most disciplined commercial design systems on the web: it spends almost no colour of its own. The interface is a near-silent black-on-white stage, and every drop of saturation is reserved for full-bleed product and athlete photography. The result reads as confident and editorial — the chrome gets out of the way so the shoes can shout. What little "design" the UI asserts lives in three places: enormous uppercase headlines, the unmistakable solid-black pill button, and a lot of deliberate whitespace.

## Colour

The palette is functionally achromatic. The dominant ink is `#111111` — a soft near-black used for virtually all text and for the primary action surface — appearing far more than any other colour in the computed styles. Secondary and muted greys form a tight ramp: `#707072` for subtext, `#767676` for muted/placeholder, and `#cacacb` for faint borders and disabled states. Backgrounds are pure white `#ffffff` with a single off-tint, `#f5f5f5`, marking utility pills and alternating sections; `#e5e5e5` handles sunken fills, image skeletons, and the 1px dividers. There is no chromatic primary at all — where most brands place a blue or a brand hue on CTAs, Nike places black. The only saturated value found anywhere was a rare dark slate `#2b333f` inside a sub-brand module and a couple of photographic gradient overlays (a top-down `rgba(0,0,0,0.8)→transparent` scrim that keeps white type legible over imagery). Status colours (success/warning/error) are absent from the marketing surface and are intentionally omitted rather than invented.

## Typography

The family resolves to **Helvetica Now Text** (falling back to Helvetica/Arial) — a proprietary, licensed neo-grotesque. The showcase substitutes **Inter**, the closest free Google equivalent, and labels it as a stand-in. Hierarchy is built almost entirely through **size and weight, never tracking** — letter-spacing is `normal` at every tier, which is itself a signature choice. Two weights do all the work: 400 (regular) for body and 500 (medium) for emphasis, buttons, and headings. The system's drama comes from scale: hero headlines hit **76px at a tight 0.9 line-height, set UPPERCASE**, then the ladder drops sharply to 32 → 24 → 20px for section and card headings (all weight 500, ~1.2 line-height). Body settles at a comfortable 16px/400 with 1.5 line-height as the overwhelming default, with a 19.2px lede tier and 14px and ~13px tiers for secondary and caption text.

## Shape & depth

Nike is emphatically flat. The signature shape is the **pill** — a fixed `30px` radius that renders as fully round at button height, used on every CTA, chip, and badge; circular icon controls use `50%`. Everything else is surprisingly square: **product tiles carry essentially no corner rounding** (2px at most), so imagery meets the grid with hard edges. A small radius ramp exists for utility (2 / 4 / 8px), with an 18px tier reserved for inputs and the country/region selector and 24px for the occasional larger container. Elevation is almost vestigial: the default is no shadow at all, and cards are separated by whitespace and 1px hairlines rather than lift. A single soft shadow (`0 4px 8px rgba(17,17,17,0.06)` plus a faint 24px ambient halo) appears on hover/flyout panels; anything deeper is rare. The dominant "depth" cue is actually the inset bottom hairline on the sticky nav and tab strips.

## Layout & responsive

Spacing follows a 4px base resolving to a clean 8px rhythm (4 / 8 / 12 / 16 / 24 / 32 / 48), visible in the 6px×16px button padding and generous section gutters. Content is centred in a ~1200px maximum width with 40px desktop gutters that tighten to ~22px on mobile. Cards live on a four-up grid for product listings that collapses to two columns on tablet (<1024px) and stays two-up even on small phones — Nike keeps products paired rather than dropping to a single column, maximising browse density. The giant display type scales down aggressively on narrow viewports (76px → ~48px) while body sizes hold, preserving the editorial poster feel of the hero on every screen. Throughout, the layout leans on air and alignment instead of borders, boxes, or shadows to create structure.
