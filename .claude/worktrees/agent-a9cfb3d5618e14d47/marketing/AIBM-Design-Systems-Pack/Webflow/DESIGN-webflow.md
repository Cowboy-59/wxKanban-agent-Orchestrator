---
version: alpha
name: Webflow Analysis
description: >
  A confident dark-mode product system painted on near-black canvas with pure
  white ink, anchored by a single electric Webflow blue and lit with a small
  cast of candy accents — sky blue, peach, mint and lavender — set in the
  brand's own geometric grotesque, WF Visual Sans.

colors:
  primary: "#146ef5"          # Webflow blue — CTAs, links, focus, brand mark
  primary-active: "#3b89ff"   # brighter blue used for hover/active accents on dark
  on-primary: "#ffffff"       # text/icon on the blue button
  primary-gradient-from: "#cab1ff"  # decorative radial: lavender …
  primary-gradient-to: "#146ef5"    # … into Webflow blue (hero glow)
  dark: "#1f1f1f"             # lifted dark fill for solid/inverted buttons & featured cards
  canvas: "#080808"           # page background (near-black)
  canvas-soft: "#171717"      # off-tint section / nested panel background
  surface: "#171717"          # card / panel surface
  surface-alt: "#363636"      # chip / sunken fill / mega-menu tiles
  ink: "#ffffff"              # headings & primary body text
  ink-secondary: "#ababab"    # supporting copy, nav labels
  ink-muted: "#808080"        # de-emphasised meta
  ink-faint: "#5a5a5a"        # captions / placeholders / faint borders
  hairline: "#363636"         # 1px borders & dividers on dark
  hairline-soft: "#292929"    # softest divider
  accent-sky: "#6ca7ff"       # light-blue text accents / highlights
  accent-peach: "#ffa666"     # warm accent (illustration / labels)
  accent-mint: "#60ed76"      # success-ish green accent
  accent-lavender: "#cab1ff"  # gradient + glow accent

typography:
  display-1: { fontFamily: "WF Visual Sans (subst. Inter)", fontSize: 64px, fontWeight: 600, lineHeight: 1.04, letterSpacing: -0.65px }
  display-2: { fontFamily: "WF Visual Sans (subst. Inter)", fontSize: 46px, fontWeight: 600, lineHeight: 1.05, letterSpacing: -0.6px }
  heading-1: { fontFamily: "WF Visual Sans (subst. Inter)", fontSize: 35px, fontWeight: 600, lineHeight: 1.1, letterSpacing: -0.4px }
  heading-2: { fontFamily: "WF Visual Sans (subst. Inter)", fontSize: 28px, fontWeight: 600, lineHeight: 1.16, letterSpacing: -0.28px }
  heading-3: { fontFamily: "WF Visual Sans (subst. Inter)", fontSize: 22px, fontWeight: 500, lineHeight: 1.3, letterSpacing: normal }
  title:     { fontFamily: "WF Visual Sans (subst. Inter)", fontSize: 20px, fontWeight: 500, lineHeight: 1.3, letterSpacing: normal }
  body-lg:   { fontFamily: "WF Visual Sans (subst. Inter)", fontSize: 19px, fontWeight: 400, lineHeight: 1.5, letterSpacing: normal }
  body-md:   { fontFamily: "WF Visual Sans (subst. Inter)", fontSize: 16px, fontWeight: 400, lineHeight: 1.6, letterSpacing: normal }
  body-sm:   { fontFamily: "WF Visual Sans (subst. Inter)", fontSize: 14px, fontWeight: 400, lineHeight: 1.6, letterSpacing: normal }
  button:    { fontFamily: "WF Visual Sans (subst. Inter)", fontSize: 16px, fontWeight: 500, lineHeight: 1.0, letterSpacing: normal }
  caption:   { fontFamily: "WF Visual Sans (subst. Inter)", fontSize: 13px, fontWeight: 500, lineHeight: 1.4, letterSpacing: normal }
  eyebrow:   { fontFamily: "WF Visual Sans (subst. Inter)", fontSize: 12px, fontWeight: 500, lineHeight: 1.0, letterSpacing: 0.6px }

rounded:
  xs: 2px
  sm: 4px
  md: 8px
  lg: 12px
  xl: 16px
  full: 9999px

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
  level-1: "0 13px 13px rgba(0,0,0,0.08), 0 30px 18px rgba(0,0,0,0.04), 0 3px 7px rgba(0,0,0,0.09)"
  level-2: "0 38px 23px rgba(0,0,0,0.06), 0 67px 27px rgba(0,0,0,0.02), 0 105px 30px rgba(0,0,0,0.01)"

components:
  nav-bar:          { backgroundColor: "{colors.canvas}", textColor: "{colors.ink-secondary}", typography: "{typography.body-sm}", padding: 16px }
  button-primary:   { background: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.md}", padding: 10px 18px }
  button-dark:      { background: "{colors.dark}", textColor: "{colors.ink}", typography: "{typography.button}", rounded: "{rounded.md}", padding: 10px 18px }
  button-secondary: { background: "{colors.canvas}", textColor: "{colors.ink}", border: "1px solid {colors.ink}", rounded: "{rounded.md}", padding: 10px 18px }
  card:             { backgroundColor: "{colors.surface}", rounded: "{rounded.md}", border: "1px solid {colors.hairline}", shadow: "{elevation.level-0}", hoverShadow: "{elevation.level-1}" }
  text-input:       { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", border: "1px solid {colors.hairline}", rounded: "{rounded.sm}", padding: 12px 16px }
  badge-pill:       { backgroundColor: "{colors.surface-alt}", textColor: "{colors.accent-sky}", rounded: "{rounded.full}", padding: 8px 16px }
---

# Webflow — Design Language Analysis

Webflow's homepage presents the brand at its most assured: a near-black stage on which a single saturated blue does all the persuasive work. The system is unmistakably "product surface, not marketing brochure" — tight type, restrained chrome, generous black space, and color reserved almost entirely for the things you're meant to click. The personality comes less from decoration than from confidence: white headlines set large and snug, one electric blue for every action, and a small reserve of candy accent colors that surface in illustration and glow effects rather than in the core UI.

## Colour

The palette is built dark-first. The page sits on `#080808`, an all-but-true black, with white (`#ffffff`) carrying both headings and body — an inversion of the usual ink-on-paper relationship. Depth is created by stepping up, not down: `#171717` lifts cards and nested panels a notch off the canvas, and `#363636` forms chip fills, mega-menu tiles, and the dominant `1px` hairline. Supporting copy steps down a grey ramp — `#ababab` for secondary text, `#808080` and `#5a5a5a` for muted meta and placeholders.

The one saturated, load-bearing color is Webflow blue, `#146ef5`. It is disciplined: it appears on the primary CTA, on links, on the focus ring, and as the brand mark, and almost nowhere else as a flat fill. A brighter `#3b89ff` and a light `#6ca7ff` act as its hover/accent relatives on dark backgrounds. Beyond blue, a small festival of accents — peach `#ffa666`, mint `#60ed76`, lavender `#cab1ff` — lives in illustration, badges, and a signature radial glow that fades lavender into blue into white behind the hero. The takeaway: monochrome discipline in the UI, color exuberance in the art.

## Typography

The face is **WF Visual Sans**, Webflow's proprietary variable grotesque — a clean, slightly geometric sans with tight modern proportions. Because it's custom-licensed, the showcase substitutes **Inter**, the nearest widely available Google match in weight and metrics; treat the rendered specimen as an approximation of the real face. Hierarchy is driven mostly by **size and negative tracking** rather than by many weights: the hero runs ~64px at weight 600 with `-0.65px` letter-spacing and a snug 1.04 line-height, and section heads cascade down through ~46 / 35 / 28 / 22px, all at 500–600 and progressively looser leading. Body settles at a comfortable 16px / 400 with a roomy 1.6 line-height — the single most common pairing on the page — with 14px for dense supporting copy. Buttons and eyebrows hold at 12–16px / 500, the eyebrow adding `0.6px` of positive tracking and uppercase to do its small-label job.

## Shape & depth

Rounding is gentle and consistent. An 8px radius is the workhorse — buttons, cards, pills, inputs — with 4px for tighter interior elements and 2px at the smallest scale; pills and avatars go fully round (`9999px` / `50%`). Nothing is heavily pill-shaped or sharply squared; the corners read "software, slightly soft." Elevation is used sparingly and softly: most surfaces rely on a single `1px` hairline (`#363636`) rather than shadow, and when shadow does appear it is a deep, many-stop, very-low-opacity stack that reads as an atmospheric lift rather than a hard drop — appropriate for a dark canvas where harsh shadows would vanish anyway.

## Layout & responsive

Spacing follows a 4px base, with an 8 / 16 / 24 / 32 / 48px rhythm doing most of the section and component padding. Content is centered in a wide max-width column with generous horizontal gutters, and the design leans on large vertical breathing room between bands. The composition collapses predictably: multi-column feature and card grids fold from four to two columns at the tablet break and to one or two on phones, the hero type drops from ~64px toward ~48px, and the persistent top navigation condenses into a menu — the standard responsive contract for a marketing-grade product site.
