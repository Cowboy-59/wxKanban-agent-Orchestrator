---
version: alpha
name: Anthropic Analysis
description: >
  A warm, editorial system painted on cream (#faf9f5) with near-black ink
  (#141413), where a single signature clay-orange (#d97757) carries the brand
  voice across marks and graphics, and an unusual serif-led body gives the
  whole site a calm, bookish, paper-like character.

colors:
  primary: "#d97757"          # signature clay/rust — brand marks, accent graphics, accent CTAs
  primary-active: "#c6613f"   # deeper clay for pressed/hover
  on-primary: "#faf9f5"       # text/icon on primary or dark fills
  dark: "#141413"             # primary dark buttons, inverted bands
  on-dark: "#faf9f5"
  canvas: "#faf9f5"           # page background — warm ivory
  canvas-soft: "#f0eee6"      # off-tint section background — warm bone
  surface: "#e8e6dc"          # card/panel surface — soft oat
  surface-alt: "#e3dacc"      # chip / sunken fill — warm sand
  ink: "#141413"              # headings & body text — near-black warm
  ink-secondary: "#87867f"    # supporting text — warm grey
  ink-muted: "#b0aea5"        # captions, footer links — light warm grey
  ink-faint: "#b0aea5"        # placeholder / faintest
  hairline: "rgba(20,20,19,0.1)"   # 1px borders & dividers
  hairline-strong: "rgba(20,20,19,0.3)"
  # decorative accent ramp (graphics & illustrations): clay #d97757 → terracotta #c6613f
  # neutral dark band: #3d3d3a (soft charcoal)

typography:
  display-1: { fontFamily: "Anthropic Sans", fontSize: 51px, fontWeight: 700, lineHeight: 1.1, letterSpacing: normal }
  display-2: { fontFamily: "Anthropic Serif", fontSize: 77px, fontWeight: 400, lineHeight: 1.1, letterSpacing: 1.28px }
  heading-1: { fontFamily: "Anthropic Sans", fontSize: 24px, fontWeight: 600, lineHeight: 1.3, letterSpacing: normal }
  heading-2: { fontFamily: "Anthropic Serif", fontSize: 24px, fontWeight: 400, lineHeight: 1.3, letterSpacing: normal }
  heading-3: { fontFamily: "Anthropic Serif", fontSize: 20px, fontWeight: 400, lineHeight: 1.3, letterSpacing: normal }
  title:     { fontFamily: "Anthropic Serif", fontSize: 20px, fontWeight: 400, lineHeight: 1.4, letterSpacing: normal }
  body-lg:   { fontFamily: "Anthropic Serif", fontSize: 20px, fontWeight: 400, lineHeight: 1.5, letterSpacing: normal }
  body-md:   { fontFamily: "Anthropic Serif", fontSize: 16px, fontWeight: 400, lineHeight: 1.5, letterSpacing: normal }
  body-sm:   { fontFamily: "Anthropic Sans", fontSize: 15px, fontWeight: 400, lineHeight: 1.5, letterSpacing: normal }
  button:    { fontFamily: "Anthropic Sans", fontSize: 16px, fontWeight: 400, lineHeight: 1.29, letterSpacing: -0.08px }
  caption:   { fontFamily: "Anthropic Sans", fontSize: 12px, fontWeight: 400, lineHeight: 1.4, letterSpacing: normal }
  eyebrow:   { fontFamily: "Anthropic Mono", fontSize: 12px, fontWeight: 500, lineHeight: 1.4, letterSpacing: 0.4px }

rounded:
  xs: 2px
  sm: 4px
  md: 8px
  lg: 12px
  xl: 16px
  xxl: 24px
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
  level-1: "0 2px 2px rgba(0,0,0,0.01), 0 4px 4px rgba(0,0,0,0.02), 0 16px 24px rgba(0,0,0,0.04)"
  level-2: "0 4px 8px rgba(0,0,0,0.04), 0 12px 24px rgba(0,0,0,0.08), 0 24px 48px rgba(0,0,0,0.10)"

components:
  nav-bar:        { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.title}", padding: 22px 12px }
  button-primary: { background: "{colors.dark}", textColor: "{colors.on-dark}", typography: "{typography.button}", rounded: "{rounded.sm}", padding: 8px 16px, border: "1px solid {colors.dark}" }
  button-accent:  { background: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.sm}", padding: 8px 16px }
  button-secondary: { background: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.button}", rounded: "{rounded.sm}", padding: 8px 16px, border: "1px solid {colors.ink}" }
  card:           { backgroundColor: "{colors.surface}", rounded: "{rounded.xl}", shadow: "{elevation.level-0}", hoverShadow: "{elevation.level-1}" }
  text-input:     { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", rounded: "{rounded.sm}", border: "1px solid {colors.hairline}", padding: 12px 16px }
  badge-pill:     { backgroundColor: "#ffffff", textColor: "{colors.ink}", rounded: "{rounded.full}", typography: "{typography.caption}", padding: 5px 10px }
---

# Anthropic — Design Language Analysis

Anthropic's site reads less like a tech product and more like a printed essay. Everything sits on a warm ivory paper, the type is overwhelmingly serif, and the chrome is quiet to the point of near-invisibility — the design gets out of the way so the words and the hand-drawn clay graphics can do the talking. It is a confident, restrained, editorial system with exactly one loud color.

## Colour

The palette is a tight warm-neutral ramp anchored by two near-opposites: a warm near-black ink (`#141413`) and a warm ivory canvas (`#faf9f5`). Between them sits a short ladder of bone and oat surfaces — `#f0eee6` for alternating section bands, `#e8e6dc` and the sandier `#e3dacc` for cards and sunken chips. Secondary text steps down through a warm grey (`#87867f`) to a soft light grey (`#b0aea5`) used for captions and footer links. Dividers are never a hard line; they are ink dropped to 10% opacity, occasionally 30% for emphasis, which keeps the page feeling soft and paper-like. Against all this restraint, a single saturated clay-orange (`#d97757`, deepening to terracotta `#c6613f` when pressed) is the entire brand signature — it appears in the logomark, the illustrative graphics, and accent moments, never diluted by a second hue. There is no blue, no gradient-heavy hero; the warmth is doing the emotional work.

## Typography

Anthropic ships three proprietary families — **Anthropic Serif**, **Anthropic Sans**, and **Anthropic Mono** — substituted here with the nearest Google equivalents (Newsreader for the serif, Inter for the sans, IBM Plex Mono for the mono) and labelled as substitutes. The defining choice is that *body copy is serif*: the dominant text tier across the page is Anthropic Serif at 20px/400, with a 16px serif step beneath it, which is what gives the site its essayistic, read-me feeling. Hierarchy is built two different ways depending on register. Editorial headlines lean on the serif at large optical sizes with a touch of positive tracking (the 77px hero statement runs at 400 weight with ~1.3px letter-spacing). Functional, UI-facing headings switch to Anthropic Sans and build emphasis through weight instead — the page H1 is Sans 51px/700, and section labels like "Latest releases" are Sans 24px/600. The sans also owns all the small functional type: 16px buttons (with a hair of negative tracking), 15px supporting text, and the ubiquitous 12px caption. Mono shows up sparingly for eyebrows and code-flavored labels.

## Shape & depth

Corners are barely rounded. The workhorse radius is a tight **4px**, used on the dark buttons and most interactive chrome — soft enough to feel considered, sharp enough to read as serious. Above that, an 8px–16px tier handles cards and larger panels, 24px appears on the roundest containers, and full-pill (`9999px` / `50%`) is reserved for small badges and circular elements. Depth is almost absent by default: most surfaces are flat, separated only by their background tint and a hairline. When elevation does appear it is exceptionally restrained — a finely layered, low-opacity stack (`0 2px 2px / 0 4px 4px / 0 16px 24px`, each layer at 1–4% black) that suggests lift without ever casting a heavy shadow. The whole system trusts contrast of tone over drop-shadow.

## Layout & responsive

Spacing follows a 4px base unit, with the common rhythm landing on 8 / 12 / 16 / 24 / 32 / 48 — buttons pad to 8×16, nav links to roughly 22×12. Content is held in a centered column (~1200px max) with generous side gutters, and sections are stacked and separated by tone and hairline rather than by heavy framing. The layout leans on roomy vertical whitespace, letting the serif body breathe. On narrower viewports the multi-column card and listing grids collapse from four to two and then to one, the oversized editorial headline drops to a more modest display size, and the centered column tightens its gutters — the structure simplifies without ever changing its calm, paper-first character.
