---
version: alpha
name: Monzo Analysis
description: >
  A clean, near-white canvas carrying pure-black ink and Monzo's signature hot
  coral, where every shape is generously rounded and the only saturated colour
  arrives as a midnight-navy pill button or a single coral accent.

colors:
  primary: "#ff4f40"          # hot coral — Monzo's signature brand accent
  primary-active: "#f64d3f"   # pressed/hover coral
  on-primary: "#ffffff"       # text/icon on coral
  dark: "#091723"             # midnight navy — primary CTA pills & dark bands
  on-dark: "#ffffff"
  dark-alt: "#112231"         # deep navy band variant
  dark-deep: "#012433"        # deepest teal-navy band
  canvas: "#ffffff"           # page background
  canvas-soft: "#f2f8f3"      # mint off-white section background
  surface: "#ffffff"          # card / panel surface
  surface-alt: "#e3ebe4"      # sage chip / sunken fill
  ink: "#000000"              # headings & body text
  ink-secondary: "#6c747b"    # rgba(9,23,35,.6) on white — secondary copy
  ink-muted: "#8b9298"        # captions
  ink-faint: "#9aa0a6"        # placeholders
  hairline: "#c3c8cf"         # 1px borders & form outlines
  hairline-soft: "#e6e8ea"    # rgba(9,23,35,.1) — dividers
  # decorative: dark-overlay-gradient — navy fade over hero imagery

typography:
  display-1: { fontFamily: "Monzo Sans (subst. Manrope)", fontSize: 61px, fontWeight: 800, lineHeight: 1.05, letterSpacing: -1px }
  display-2: { fontFamily: "Monzo Sans (subst. Manrope)", fontSize: 49px, fontWeight: 800, lineHeight: 1.05, letterSpacing: -0.5px }
  heading-1: { fontFamily: "Monzo Sans (subst. Manrope)", fontSize: 39px, fontWeight: 800, lineHeight: 1.2, letterSpacing: normal }
  heading-2: { fontFamily: "Monzo Sans (subst. Manrope)", fontSize: 31px, fontWeight: 800, lineHeight: 1.2, letterSpacing: normal }
  heading-3: { fontFamily: "Monzo Sans (subst. Manrope)", fontSize: 25px, fontWeight: 700, lineHeight: 1.3, letterSpacing: normal }
  title:     { fontFamily: "Monzo Sans Text (subst. Manrope)", fontSize: 20px, fontWeight: 600, lineHeight: 1.3, letterSpacing: normal }
  body-lg:   { fontFamily: "Monzo Sans Text (subst. Manrope)", fontSize: 20px, fontWeight: 400, lineHeight: 1.4, letterSpacing: normal }
  body-md:   { fontFamily: "Monzo Sans Text (subst. Manrope)", fontSize: 16px, fontWeight: 400, lineHeight: 1.4, letterSpacing: normal }
  body-sm:   { fontFamily: "Monzo Sans Text (subst. Manrope)", fontSize: 13px, fontWeight: 400, lineHeight: 1.4, letterSpacing: normal }
  button:    { fontFamily: "Monzo Sans Text (subst. Manrope)", fontSize: 16px, fontWeight: 600, lineHeight: 1.4, letterSpacing: normal }
  caption:   { fontFamily: "Monzo Sans Text (subst. Manrope)", fontSize: 12px, fontWeight: 700, lineHeight: 1.3, letterSpacing: normal }
  eyebrow:   { fontFamily: "Monzo Sans Text (subst. Manrope)", fontSize: 11px, fontWeight: 600, lineHeight: 1.3, letterSpacing: 0.4px, textTransform: uppercase }

rounded:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 64px
  full: 500px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  xxxl: 64px

elevation:
  level-0: "none"
  level-1: "0 0 10px rgba(0,0,0,0.10)"
  level-2: "0 8px 32px rgba(0,0,0,0.16)"

components:
  nav-bar:          { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.body-md}", padding: "16px 24px" }
  button-primary:   { background: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.full}", padding: "12px 24px" }
  button-dark:      { background: "{colors.dark}", textColor: "{colors.on-dark}", typography: "{typography.button}", rounded: "{rounded.full}", padding: "12px 24px", border: "1px solid {colors.dark}" }
  button-secondary: { background: "{colors.canvas}", textColor: "{colors.dark}", typography: "{typography.button}", rounded: "{rounded.full}", padding: "12px 24px", border: "1px solid {colors.canvas}" }
  card:             { backgroundColor: "{colors.surface}", rounded: "{rounded.xxl}", shadow: "{elevation.level-0}", hoverShadow: "{elevation.level-1}" }
  text-input:       { backgroundColor: "{colors.canvas}", rounded: "{rounded.sm}", border: "1px solid {colors.hairline}", padding: "12px 16px", typography: "{typography.body-md}" }
  badge-pill:       { backgroundColor: "{colors.surface}", textColor: "{colors.ink}", rounded: "{rounded.full}", typography: "{typography.caption}", shadow: "0 1px 2px rgba(0,0,0,0.1)" }
---

# Monzo — Design Language Analysis

Monzo's marketing site is built on restraint and roundness. The page is almost entirely white, type is set in pure black, and the brand's famous "hot coral" is rationed so carefully that when it appears it reads as a deliberate signal rather than decoration. The system's personality comes less from colour than from shape: corner radii run unusually large — pill buttons, 32px panels, 64px card edges — giving the whole interface a soft, friendly, app-like feel that matches Monzo's challenger-bank positioning.

## Colour

The palette is anchored by a tight ink ramp on a white canvas. Pure black (`#000000`) does the heavy lifting for headings and body copy, with a 60%-opacity midnight navy (`#6c747b` over white) carrying secondary text. The page background is white, broken occasionally by a mint off-white (`#f2f8f3`) and a sage surface tint (`#e3ebe4`) to delineate sections without hard borders. The one saturated brand colour is hot coral (`#ff4f40`) — the colour of the physical Monzo card — used for small accents, indicators and the occasional emphasis. Counter-intuitively, the primary call-to-action on the homepage is not coral but a midnight-navy pill (`#091723`), with inverted white-pill CTAs sitting on dark photographic bands. Deeper navy tones (`#112231`, `#012433`) appear as full-bleed feature bands, sometimes with a navy fade gradient laid over imagery. Borders are whisper-light: a 10%-opacity navy hairline (`#e6e8ea`) for dividers and a slightly firmer `#c3c8cf` around form fields.

## Typography

The site ships in Monzo's proprietary typeface family — `MonzoSansText` for body and `MonzoSansDisplay` for headings — substituted here for the nearest Google match, **Manrope**, a geometric humanist sans with the same rounded, friendly construction and a matching 800 heavy weight. Hierarchy is driven almost entirely by size and weight rather than tracking: display and heading tiers jump to weight 800 at 31–61px with tight line-heights (~1.05–1.2), while everything below the headline collapses to a single dominant body tier of 16px / 400 (by far the most frequent pairing on the page) with a comfortable 1.4 line-height. Buttons and inline emphasis nudge body text to weight 600. Captions and eyebrows are small (11–12px) and lean on weight and uppercase rather than colour.

## Shape & depth

Roundness is the signature. The radius scale is wide and deliberately generous: 4px for the smallest chips, 16–24px for inputs and mid panels, 32px for content cards, and a dramatic 64px on large feature cards — with fully-rounded 500px pills for every button and tag. Depth, by contrast, is almost absent. Most surfaces sit flat on the canvas separated only by a hairline; the system reaches for shadow sparingly, using a soft ambient glow (`0 0 10px rgba(0,0,0,0.1)`) on hover and a deeper drop (`0 8px 32px rgba(0,0,0,0.16)`) only for genuinely floating elements like sticky cards and badges.

## Layout & responsive

Spacing follows an 8px base unit stepping 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64, which keeps rhythm consistent against the large radii. Content is centred in a roomy max-width container with generous vertical section padding, and the page alternates white and tinted bands to segment a long scrolling marketing narrative. Multi-column card grids (four-up product tiles, three-up plan cards) collapse to two columns on tablet and a single stacked column on mobile, while display headlines step down in size at the tablet breakpoint so the heavy 800-weight type never overwhelms small screens.
