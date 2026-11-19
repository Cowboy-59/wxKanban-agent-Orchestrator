---
version: alpha
name: Apple Analysis
description: >
  A near-white canvas broken by #f5f5f7 grey bands, ink locked to a warm
  near-black #1d1d1f, and a single confident systemBlue reserved for pill CTAs
  and links — the calmest, most product-forward design system on the web, where
  the 980px pill button and SF Pro typography do all the talking.

colors:
  primary: "#0071e3"          # filled CTA pill ("Learn more"), buy buttons
  primary-active: "#0077ed"   # hover/pressed CTA (Apple's documented hover blue)
  on-primary: "#ffffff"       # label on the blue pill
  link: "#0066cc"             # inline + chevron links on light backgrounds
  link-on-dark: "#2997ff"     # accent — same link role on dark/photographic bands
  dark: "#1d1d1f"             # dark buttons ("Continue"), inverted product bands
  canvas: "#ffffff"           # base page background
  canvas-soft: "#f5f5f7"      # the signature off-white section band
  surface: "#ffffff"          # card / tile surface sitting on the grey band
  surface-alt: "#e8e8ed"      # chip / sunken fill / segmented control track
  ink: "#1d1d1f"              # headings & body (550 hits — the dominant text color)
  ink-secondary: "#333336"    # sub-labels, secondary copy
  ink-muted: "#6e6e73"        # footnotes, captions, metadata grey
  ink-faint: "#86868b"        # placeholders, disclaimers, disabled
  hairline: "#d2d2d7"         # 1px dividers & footer rules
  hairline-soft: "rgba(0,0,0,0.04)"  # faint inset borders on light chips

typography:
  # Family resolved to "SF Pro Text"/"SF Pro Display" (Apple proprietary).
  # Showcase substitutes Inter (nearest Google match) and labels it.
  display-1: { fontFamily: "SF Pro Display", fontSize: 56px, fontWeight: 600, lineHeight: 1.05, letterSpacing: -1px }
  display-2: { fontFamily: "SF Pro Display", fontSize: 44px, fontWeight: 400, lineHeight: 1.1, letterSpacing: -0.4px }
  heading-1: { fontFamily: "SF Pro Display", fontSize: 40px, fontWeight: 600, lineHeight: 1.1, letterSpacing: -0.4px }
  heading-2: { fontFamily: "SF Pro Display", fontSize: 28px, fontWeight: 400, lineHeight: 1.14, letterSpacing: -0.3px }
  heading-3: { fontFamily: "SF Pro Text", fontSize: 24px, fontWeight: 600, lineHeight: 1.17, letterSpacing: 0.216px }
  title:     { fontFamily: "SF Pro Text", fontSize: 21px, fontWeight: 700, lineHeight: 1.19, letterSpacing: 0px }
  body-lg:   { fontFamily: "SF Pro Text", fontSize: 21px, fontWeight: 400, lineHeight: 1.38, letterSpacing: 0px }
  body-md:   { fontFamily: "SF Pro Text", fontSize: 17px, fontWeight: 400, lineHeight: 1.47, letterSpacing: -0.374px }
  body-sm:   { fontFamily: "SF Pro Text", fontSize: 14px, fontWeight: 400, lineHeight: 1.29, letterSpacing: -0.224px }
  button:    { fontFamily: "SF Pro Text", fontSize: 17px, fontWeight: 400, lineHeight: 1.18, letterSpacing: -0.374px }
  caption:   { fontFamily: "SF Pro Text", fontSize: 12px, fontWeight: 400, lineHeight: 1.33, letterSpacing: -0.12px }
  eyebrow:   { fontFamily: "SF Pro Text", fontSize: 12px, fontWeight: 600, lineHeight: 1.33, letterSpacing: -0.12px }

rounded:
  xs: 5px            # small inputs / segmented controls
  sm: 8px            # compact buttons, cards, dropdowns
  md: 12px           # rounded panels / region selector
  lg: 18px           # product tiles & imagery (Apple's standard card radius)
  full: 980px        # the signature Apple pill CTA
  circle: 50%        # avatar / icon chips

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px

elevation:
  level-0: "none"                                   # default — Apple is overwhelmingly flat
  level-1: "0 4px 16px rgba(0,0,0,0.08)"            # gentle tile/gallery hover lift
  level-2: "3px 5px 30px rgba(0,0,0,0.22)"          # popover / Quick Look modal (captured)

components:
  nav-bar:          { backgroundColor: "rgba(255,255,255,0.8)", backdropFilter: "saturate(180%) blur(20px)", textColor: "{colors.ink}", typography: "{typography.caption}", padding: "0 8px", height: 44px }
  button-primary:   { background: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.full}", padding: "12px 22px" }
  button-secondary: { background: "transparent", textColor: "{colors.link}", border: "1px solid {colors.link}", typography: "{typography.button}", rounded: "{rounded.full}", padding: "11px 21px" }
  button-dark:      { background: "{colors.dark}", textColor: "#ffffff", typography: "{typography.body-sm}", rounded: "{rounded.sm}", padding: "8px 15px" }
  card:             { backgroundColor: "{colors.surface}", rounded: "{rounded.lg}", shadow: "{elevation.level-0}", hoverShadow: "{elevation.level-1}" }
  text-input:       { background: "{colors.surface}", textColor: "{colors.ink}", border: "1px solid {colors.hairline}", rounded: "{rounded.md}", padding: "12px 16px", focusBorder: "{colors.link}" }
  badge-pill:       { background: "{colors.surface-alt}", textColor: "{colors.ink-secondary}", typography: "{typography.eyebrow}", rounded: "{rounded.full}", padding: "5px 10px" }
---

# Apple — Design Language Analysis

Apple's homepage is a masterclass in restraint: the design system is almost entirely monochrome, built from a white canvas, one off-white grey band, and a single warm near-black for type. Colour is rationed so tightly that the lone systemBlue reads as a signal rather than decoration — it means "act" (a pill CTA) or "go deeper" (a chevron link), and almost nothing else. The product photography supplies all the saturation; the chrome stays out of the way. Hierarchy is carried by enormous shifts in type size and a confident, optically-tight SF Pro, not by boxes, borders, or shadows.

## Colour

The palette is a greyscale ramp with one accent. Text is overwhelmingly `ink` (#1d1d1f) — it appeared 550 times in the crawl, more than every other text colour combined — stepping down through `ink-secondary` (#333336), the classic Apple footnote grey `ink-muted` (#6e6e73), and the faintest `ink-faint` (#86868b) for disclaimers. Backgrounds alternate between pure white `canvas` and the unmistakable `canvas-soft` (#f5f5f7), the soft grey Apple uses to separate one product story from the next without drawing a line. The only saturated hue is blue, and it does triple duty: `primary` (#0071e3) fills the solid "Learn more" pill, `link` (#0066cc) colours inline and chevron links on light bands, and `link-on-dark` (#2997ff) is the lighter variant that keeps those same links legible over dark or photographic sections. Dividers are the barely-there `hairline` (#d2d2d7). There is no brand gradient on CTAs — the gradients found in the crawl are scrim overlays sitting on hero imagery, not interface colour.

## Typography

The family resolves to SF Pro (`"SF Pro Text", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial`), Apple's proprietary San Francisco typeface — split in practice between SF Pro Display for large headlines and SF Pro Text for body. Because SF Pro is licensed, the showcase substitutes **Inter**, the nearest Google-hosted match in proportion and humanist-geometric tone, and labels it as a substitute. Hierarchy is built primarily through size and tracking rather than weight: the workhorse body is a generous 17px / 400 with a roomy 1.47 line-height and a subtle negative tracking (-0.374px) — by far the most frequent pairing (731 hits). Above it sit a dense ladder of headline sizes (21 → 24 → 28 → 40 → 44 → 56px) where the largest display weights are 600 with tight negative letter-spacing for that crisp, condensed Apple headline feel; the smaller `heading-3` at 24px / 600 actually tracks slightly *positive* (+0.216px). At the bottom, 12px in both 400 and 600 carries the navigation labels, captions, and the fine-print legal grey.

## Shape & depth

Two radius ideas define the system. First, the **980px pill** — the single most-used radius on the page (35 hits) — wrapping every primary and secondary CTA into Apple's signature lozenge button. Second, a quiet small-radius set for everything else: 5px on compact controls, 8px on buttons and dropdowns, ~12px on panels, and 18px on product tiles and imagery. Depth is almost absent by design: the default elevation is a flat 1px hairline (`level-0`), tiles lift only gently on hover (`level-1`), and the only real shadow in the crawl is the heavy `3px 5px 30px rgba(0,0,0,0.22)` reserved for popovers and Quick Look modals (`level-2`). The effect is a surface that feels printed rather than stacked.

## Layout & responsive

Spacing follows a 4/8-based rhythm (4 → 8 → 12 → 16 → 24 → 32 → 48px) inside a centred container that maxes out around 980px of text measure while hero imagery bleeds wider. The fixed top nav is a 44px-tall translucent bar — `rgba(255,255,255,0.8)` with a saturated backdrop blur — that frosts the content scrolling beneath it. The page is a single vertical stack of full-width "promo" tiles, each pairing a centred headline, a one-line subhead, and a CTA pair over a product image. On narrow viewports the multi-column tile rows collapse to one column, headline sizes step down, and the nav condenses behind a menu toggle, but the colour and type rules never change — the restraint scales perfectly.
