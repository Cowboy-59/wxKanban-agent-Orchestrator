---
version: alpha
name: Superlist Analysis
description: >
  A confident dark-first productivity brand — near-black indigo canvas and
  crisp white type, lifted by a playful spectrum of periwinkle, hot pink and a
  coral-to-red CTA gradient, set in a wide grotesque display face over clean
  Inter body copy.

colors:
  primary: "#7577e0"             # periwinkle brand fill — solid CTAs, accents on dark
  primary-active: "#5d5fd0"      # pressed/hover periwinkle (derived)
  on-primary: "#ffffff"          # text/icons on primary & CTA gradient
  primary-gradient-from: "#ff5231"  # CTA gradient — coral (top, 100%)
  primary-gradient-to: "#d70000"    # CTA gradient — red (bottom, 0%)
  dark: "#181824"                # signature dark canvas & inverted bands
  dark-surface: "#26253b"        # elevated panel on the dark canvas
  canvas: "#ffffff"              # default page background (light sections)
  canvas-soft: "#f7f7ff"         # lavender-tinted off-white section background
  surface: "#ffffff"             # card / panel surface
  surface-alt: "#f0f0f7"         # chip / sunken fill (light); on dark ≈ rgba(255,255,255,.13)
  ink: "#000000"                 # headings & body text (true black, light mode)
  ink-secondary: "#535676"       # slate secondary text
  ink-muted: "#696f81"           # muted slate
  ink-faint: "#8e8da0"           # captions / placeholder grey-lavender
  ink-on-dark: "#f7f7ff"         # body text on the dark canvas
  hairline: "#eeeeee"            # 1px borders & dividers
  # decorative accents — the brand's playful spectrum
  accent-purple: "#9087ff"       # vivid lavender — highlighted words / display-p3 text
  accent-pink: "#f866db"         # hot pink accent
  accent-coral: "#ff5231"        # coral
  accent-yellow: "#fbe74e"       # yellow
  accent-blue: "#2590f1"         # blue
  # semantic
  success: "#22c55e"
  warning: "#fbe74e"
  error: "#ff4a36"

typography:
  display-1: { fontFamily: "Haffer XH (proprietary) — substitute Space Grotesk", fontSize: 88px, fontWeight: 600, lineHeight: 0.95, letterSpacing: -1.76px }
  display-2: { fontFamily: "Haffer XH (proprietary) — substitute Space Grotesk", fontSize: 70px, fontWeight: 600, lineHeight: 0.95, letterSpacing: -1.4px }
  heading-1: { fontFamily: "Haffer XH (proprietary) — substitute Space Grotesk", fontSize: 48px, fontWeight: 600, lineHeight: 1.1, letterSpacing: -0.96px }
  heading-2: { fontFamily: "Haffer XH (proprietary) — substitute Space Grotesk", fontSize: 30px, fontWeight: 600, lineHeight: 1.2, letterSpacing: -0.6px }
  heading-3: { fontFamily: "Haffer XH (proprietary) — substitute Space Grotesk", fontSize: 24px, fontWeight: 600, lineHeight: 1.2, letterSpacing: -0.4px }
  title:     { fontFamily: Inter, fontSize: 18px, fontWeight: 500, lineHeight: 1.4, letterSpacing: 0px }
  body-lg:   { fontFamily: Inter, fontSize: 18px, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0px }
  body-md:   { fontFamily: Inter, fontSize: 16px, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0px }
  body-sm:   { fontFamily: Inter, fontSize: 14px, fontWeight: 400, lineHeight: 1.45, letterSpacing: 0px }
  button:    { fontFamily: Inter, fontSize: 16px, fontWeight: 600, lineHeight: 1.2, letterSpacing: 0px }
  caption:   { fontFamily: Inter, fontSize: 12px, fontWeight: 400, lineHeight: 1.4, letterSpacing: 0px }
  eyebrow:   { fontFamily: Inter, fontSize: 12px, fontWeight: 600, lineHeight: 1.2, letterSpacing: 0.4px, textTransform: uppercase }

rounded:
  xs: 4px
  sm: 8px
  md: 10px
  lg: 20px
  xl: 38px
  xxl: 200px        # the rounded-top "arch" shape (200px 200px 0 0)
  full: 100px       # pills & circular controls

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px

elevation:
  level-0: "none"
  level-1: "0 10px 15px rgba(0,0,0,0.08)"
  level-2: "0 1px 1px rgba(0,0,0,0.10), 0 2px 4px rgba(0,0,0,0.05), inset 0 0.5px 0 rgba(255,255,255,0.45)"
  level-3: "0 24px 48px rgba(24,24,36,0.18)"

components:
  nav-bar:          { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.caption}", padding: 16px 24px }
  button-primary:   { background: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.sm}", padding: 14px 22px }
  button-cta:       { background: "linear-gradient(0deg, {colors.primary-gradient-to} 0%, {colors.primary-gradient-from} 100%)", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.sm}", shadow: "{elevation.level-2}", padding: 14px 22px }
  button-dark:      { background: "{colors.dark}", textColor: "#ffffff", typography: "{typography.button}", rounded: "{rounded.sm}", padding: 14px 22px }
  button-secondary: { background: "{colors.canvas}", textColor: "{colors.ink}", border: "1px solid {colors.ink}", rounded: "{rounded.sm}", padding: 13px 21px }
  card:             { backgroundColor: "{colors.surface}", rounded: "{rounded.lg}", shadow: "{elevation.level-0}", hoverShadow: "{elevation.level-1}" }
  card-dark:        { backgroundColor: "{colors.dark-surface}", textColor: "{colors.ink-on-dark}", rounded: "{rounded.lg}" }
  text-input:       { backgroundColor: "{colors.canvas}", border: "1px solid {colors.hairline}", rounded: "{rounded.sm}", textColor: "{colors.ink}", placeholder: "{colors.ink-faint}", padding: 12px 16px }
  badge-pill:       { backgroundColor: "{colors.surface-alt}", textColor: "{colors.ink}", rounded: "{rounded.full}", typography: "{typography.caption}", padding: 5px 12px }
---

# Superlist — Design Language Analysis

Superlist presents itself as a dark-first, design-led productivity tool. The marketing site opens on a near-black indigo canvas (`#181824`) with large white grotesque headlines, then alternates into bright lavender-white sections for the explanatory content. The personality is confident and slightly playful: the structure is restrained and editorial, but the colour system carries a full spectrum of saturated accents — periwinkle, hot pink, coral, yellow, blue, green — that show up as highlighted words, illustration fills, and the warm CTA gradient. The result reads as serious software with a creative streak.

## Colour

The system is built around a deep indigo-black (`#181824`) used as both the hero canvas and recurring inverted bands, paired with true black (`#000000`) for body text in the light sections and white (`#ffffff`) for text on dark. The dominant light surface is pure white, softened in section bands by a faint lavender tint (`#f7f7ff`) that ties the neutrals to the purple brand hue. The ink ramp runs from black through a slate secondary (`#535676`), a muted slate (`#696f81`), down to a grey-lavender faint (`#8e8da0`) for captions and placeholders; hairlines sit at a light `#eeeeee`.

The signature saturated colour is periwinkle (`#7577e0`), used as a solid brand fill, with a brighter lavender (`#9087ff`, originally authored in display-p3) for highlighted words. The primary call-to-action does not use the periwinkle, however — it uses a warm vertical gradient from red (`#d70000`) at the bottom to coral (`#ff5231`) at the top, which gives the main button unusual energy against the cool palette. Beyond those, the brand keeps a small kit of playful accents — hot pink (`#f866db`), yellow (`#fbe74e`), blue (`#2590f1`), and a green (`#22c55e`) that doubles as the success colour. Near-duplicate darks (`#181824` / `#181825`) collapse to one role.

## Typography

Headlines are set in **Haffer XH**, a proprietary wide neo-grotesque, in SemiBold (600); since it is licensed, the showcase substitutes **Space Grotesk** from Google Fonts, which shares the wide, slightly mechanical grotesque character. Body copy is **Inter** (a genuine Google font, used as-is). Hierarchy is driven primarily by size and negative tracking rather than weight: the hero display runs to 88px with a tight 0.95 line-height and roughly -2px letter-spacing, and every heading tier (48 / 30 / 24px) keeps the 600 weight while progressively loosening the tracking. Body text is overwhelmingly a 16px / 400 Inter at a 1.5 ratio, with a 14px small tier and a 12px caption that appears most often in navigation and metadata. The eyebrow label is a 12px uppercase Inter at 600 with light letter-spacing.

## Shape & depth

Corner rounding is generous and tiered: 4px for the smallest chips, 8px for buttons and inputs, 10px for mid controls, and a prominent 20px for cards and image containers. Pills and circular controls use a 100px full radius, and the brand reaches for a dramatic 200px rounded-top "arch" on certain illustration frames. Depth is deliberately light — most surfaces sit flat with at most a 1px hairline, cards lift on hover with a soft `0 10px 15px rgba(0,0,0,0.08)` shadow, and raised buttons carry a fine layered shadow with a subtle inner white highlight that gives them a tactile, slightly glossy edge.

## Layout & responsive

Spacing follows an 8px base unit with a 4–48px scale, and content sits in a centred column capped around 1200px with generous 40px side gutters. The page is strongly sectioned, alternating dark and light full-bleed bands with consistent vertical rhythm. On smaller viewports the multi-column card and listing grids collapse from four to two and then to one, the hero display type steps down sharply (from ~88px toward ~48px), and the side gutters tighten so the editorial column stays comfortable on mobile.
