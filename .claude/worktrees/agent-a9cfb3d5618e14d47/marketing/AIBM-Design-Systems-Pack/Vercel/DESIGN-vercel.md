---
version: alpha
name: Vercel Analysis
description: >
  A near-black, almost monochrome system where the canvas recedes to #0a0a0a,
  type and surfaces are carried by a single near-white ink (#ededed), structure
  is drawn with 1px hairline rings instead of shadows, and the only saturated
  voice is an electric blue reserved for links and focus — set in Vercel's own
  Geist typeface with Geist Mono for technical eyebrows.

# Source
# Extracted live from https://vercel.com/ (homepage "Agentic Infrastructure"),
# rendered in dark theme. Values read from getComputedStyle plus the site's own
# Geist Design System CSS custom properties on :root (--ds-*, --geist-*).
# Colours below are the dark-theme resolutions; the system also ships a mirrored
# light theme that inverts the gray ramp.

colors:
  # --- saturated accent (the one non-grey voice) ---
  primary: "#0072f5"          # --ds-blue-700; links, primary informational accent (brand "Vercel blue", ~#0070f3)
  primary-active: "#0761d1"   # --geist-success-dark; pressed/hover blue
  on-primary: "#ffffff"       # text/icon on a blue fill
  link: "#52a8ff"             # --ds-blue-900 / --ds-focus-color; link + focus-ring colour on dark surfaces

  # --- signature inverted action (CTA buttons) ---
  inverted: "#ededed"         # --ds-gray-1000; primary CTA surface ("Deploy Now", "Sign Up")
  on-inverted: "#0a0a0a"      # near-black text on the inverted CTA

  # --- surfaces ---
  canvas: "#0a0a0a"           # --ds-background-100; dominant page background
  canvas-deep: "#000000"      # --ds-background-200; pure-black bands, footer, overlay backdrop
  surface: "#0a0a0a"          # cards sit on canvas, separated by a hairline ring (not a fill)
  surface-alt: "#1a1a1a"      # --ds-gray-100; sunken / hover fill, chips, code blocks

  # --- ink ramp (light text on dark) ---
  ink: "#ededed"              # --ds-gray-1000; headings & body
  ink-secondary: "#a1a1a1"    # --ds-gray-900; supporting copy
  ink-muted: "#8f8f8f"        # --ds-gray-700; eyebrows, meta
  ink-faint: "#7d7d7d"        # --ds-gray-800; placeholder / least-emphasis

  # --- lines ---
  hairline: "#2e2e2e"         # --ds-gray-400; the 1px ring on buttons, cards, inputs
  hairline-soft: "#1f1f1f"    # --ds-gray-200; faintest dividers
  hairline-alpha: "rgba(255,255,255,0.09)"  # --ds-gray-alpha-100..200; translucent borders over imagery

  # --- semantic (dark-theme 700s) ---
  success: "#45a557"          # --ds-green-700
  warning: "#f5a623"          # --geist-warning (amber)
  error: "#e5484d"            # --ds-red-700

  # --- decorative brand gradients (marketing accents) ---
  accent-develop-from: "#007cf0"   # blue  -> cyan
  accent-develop-to: "#00dfd8"
  accent-preview-from: "#7928ca"   # purple -> pink
  accent-preview-to: "#ff0080"
  accent-ship-from: "#ff4d4d"      # red -> amber
  accent-ship-to: "#f9cb28"

typography:
  # Family: Geist (Vercel's own, open-source — available on Google Fonts, so the
  # showcase renders the genuine typeface rather than a substitute).
  # Mono: Geist Mono (technical eyebrows, labels, code).
  display-1: { fontFamily: Geist, fontSize: 64px, fontWeight: 400, lineHeight: 1.0, letterSpacing: -3.84px }   # hero H1 (-0.06em)
  display-2: { fontFamily: Geist, fontSize: 56px, fontWeight: 450, lineHeight: 1.0, letterSpacing: -3.36px }   # section H2 (-0.06em, variable weight 450)
  heading-1: { fontFamily: Geist, fontSize: 30px, fontWeight: 500, lineHeight: 1.2, letterSpacing: -0.75px }
  heading-2: { fontFamily: Geist, fontSize: 24px, fontWeight: 500, lineHeight: 1.33, letterSpacing: -0.5px }
  heading-3: { fontFamily: Geist, fontSize: 20px, fontWeight: 500, lineHeight: 1.4, letterSpacing: -0.4px }
  title:     { fontFamily: Geist, fontSize: 22px, fontWeight: 400, lineHeight: 1.3, letterSpacing: -0.4px }
  body-lg:   { fontFamily: Geist, fontSize: 16px, fontWeight: 400, lineHeight: 1.5, letterSpacing: normal }    # dominant body tier
  body-md:   { fontFamily: Geist, fontSize: 14px, fontWeight: 400, lineHeight: 1.43, letterSpacing: normal }
  body-sm:   { fontFamily: Geist, fontSize: 13px, fontWeight: 400, lineHeight: 1.38, letterSpacing: normal }
  button:    { fontFamily: Geist, fontSize: 14px, fontWeight: 500, lineHeight: 1.43, letterSpacing: normal }
  caption:   { fontFamily: Geist, fontSize: 12px, fontWeight: 400, lineHeight: 1.33, letterSpacing: normal }
  eyebrow:   { fontFamily: "Geist Mono", fontSize: 12px, fontWeight: 400, lineHeight: 1.33, letterSpacing: 0.6px, textTransform: uppercase }  # "FOR CODING AGENTS"

rounded:
  xs: 2px
  sm: 4px
  md: 6px      # --geist-radius; the workhorse default
  lg: 8px      # --geist-marketing-radius; cards & marketing tiles
  xl: 12px
  xxl: 24px    # --radius-3xl
  full: 9999px # pill buttons ("Deploy Now"), avatars, tags

spacing:
  # Base unit 4px (--geist-space / --spacing: .25rem). Default gutter is 24px (--geist-gap).
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px     # section gutter / column gap
  xl: 32px
  xxl: 48px
  # larger rhythm continues: 64 / 96 / 128px for section padding

elevation:
  # Depth is drawn primarily with 1px rings, not drop shadows — a hardware/CLI feel.
  level-0: "0 0 0 1px #2e2e2e"                                   # resting ring on cards & buttons (--shadow-extra-small)
  level-1: "0 0 0 1px #ffffff25, 0px 1px 2px rgba(0,0,0,0.16)"   # raised / hover (--ds-shadow-border + small)
  level-2: "0px 2px 2px rgba(0,0,0,0.32), 0px 8px 8px -8px rgba(0,0,0,0.16)"  # popovers, menus, modals (--ds-shadow-medium)
  focus: "0 0 0 1px #0a0a0a, 0 0 0 4px rgba(82,168,255,0.6)"     # focus ring (blue, offset from canvas)

components:
  nav-bar:          { height: 64px, backgroundColor: "{colors.canvas}", textColor: "{colors.ink-secondary}", typography: "{typography.body-md}", borderBottom: "1px solid rgba(255,255,255,0.10)", behavior: "sticky, translucent/blurred" }
  button-primary:   { background: "{colors.inverted}", textColor: "{colors.on-inverted}", typography: "{typography.button}", rounded: "{rounded.md}", height: 40px, padding: "0 12px", note: "signature inverted CTA; pill variant uses {rounded.full}" }
  button-secondary: { background: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.button}", rounded: "{rounded.md}", height: 40px, padding: "0 12px", shadow: "{elevation.level-0}" }
  card:             { backgroundColor: "{colors.surface}", rounded: "{rounded.lg}", shadow: "{elevation.level-0}", hoverShadow: "{elevation.level-1}", padding: 24px }
  text-input:       { backgroundColor: "{colors.surface-alt}", textColor: "{colors.ink}", height: 40px, rounded: "{rounded.md}", border: "1px solid {colors.hairline}", focusShadow: "{elevation.focus}", typography: "{typography.body-md}" }
  badge-pill:       { backgroundColor: "{colors.surface-alt}", textColor: "{colors.ink-secondary}", rounded: "{rounded.full}", padding: "2px 8px", typography: "{typography.caption}", border: "1px solid {colors.hairline}" }
  eyebrow-label:    { color: "{colors.ink-muted}", typography: "{typography.eyebrow}" }
---

# Vercel — Design Language Analysis

Vercel's site is the reference implementation of a "developer-grade" aesthetic: a near-black canvas, a single near-white ink, structure drawn in hairlines, and exactly one saturated colour held in reserve. It reads less like a marketing page and more like a well-lit piece of hardware — restraint is the brand. The whole system is its in-house **Geist Design System**, exposed live as hundreds of `--ds-*` and `--geist-*` CSS variables, so the tokens below are not inferred from screenshots — they are the site's own source of truth, resolved in its dark theme.

## Colour

The palette is deliberately monochrome. The page background sits at `#0a0a0a` (`--ds-background-100`), with true black `#000000` (`--ds-background-200`) used for deeper bands, the footer, and overlay backdrops. Everything legible rides on a precise neutral ramp built from a single hue at 0° saturation: `#ededed` carries headings and body (`--ds-gray-1000`), `#a1a1a1` handles supporting copy, `#8f8f8f` covers eyebrows and metadata, and `#7d7d7d` is the faintest placeholder tier. There are no boxes filled with grey for emphasis — separation is achieved almost entirely with a 1px ring at `#2e2e2e` (`--ds-gray-400`), occasionally softened to a translucent white (`rgba(255,255,255,0.09–0.14)`) when it floats over imagery.

The one saturated voice is blue. On dark surfaces, links and focus rings use `#52a8ff` (`--ds-blue-900` / the design system's focus colour), while the heritage "Vercel blue" `#0072f5`–`#0070f3` anchors primary informational accents. Critically, the **primary call-to-action is not blue** — it is inverted: a near-white `#ededed` surface with near-black `#0a0a0a` text ("Deploy Now", "Sign Up"). This inversion of the foreground colour into a button fill is the single most recognisable move in the system. Semantic colours exist but stay quiet (`#45a557` success, `#f5a623` warning, `#e5484d` error). The only place colour is allowed to sing is the brand's decorative gradient triad — develop (blue→cyan `#007cf0`→`#00dfd8`), preview (purple→pink `#7928ca`→`#ff0080`), and ship (red→amber `#ff4d4d`→`#f9cb28`) — used sparingly as illustrative accents, never as UI chrome.

## Typography

The family is **Geist**, Vercel's own typeface — a tight, neutral grotesque the company open-sourced (and which now ships on Google Fonts), so it can be rendered authentically rather than substituted. It is paired with **Geist Mono** for technical eyebrows and labels: the uppercase, letter-spaced "FOR CODING AGENTS / TO SHIP APPS AND AGENTS" running beside the hero is monospace, a deliberate signal of the engineering audience. Hierarchy is built mostly through **size and negative tracking rather than weight**: the hero H1 is 64px at a near-flat 1.0 line-height with a punishing −3.84px (−0.06em) letter-spacing, and the section H2 follows at 56px with the same −0.06em tracking on a variable weight of 450. Weights stay restrained — 400 for body, 500 for buttons and headings, 600 at most — so the type feels engineered, not shouted. The dominant body tier is 16px/1.5, with a secondary 14px/1.43 doing most of the dense UI work. A fluid type scale (`clamp()`-based `--text-fluid-*` tokens) smoothly interpolates these sizes between breakpoints.

## Shape & depth

Radii are small and consistent. The workhorse is `6px` (`--geist-radius`), with `4px` and `2px` for compact controls and `8px` (`--geist-marketing-radius`) for marketing cards; the full pill (`9999px`) appears on hero CTAs, tags, and avatars. Depth is the system's quietest dimension: instead of drop shadows, Vercel leans on **1px rings** — a resting card or button is a `0 0 0 1px #2e2e2e` outline, brightening to a white-alpha ring (`#ffffff25`) on hover. Genuine drop shadows are reserved for things that truly float (menus, popovers, modals) via `--ds-shadow-medium` (`0px 2px 2px rgba(0,0,0,0.32), 0px 8px 8px -8px …`). Focus is unmistakable and accessible: a blue ring (`#52a8ff`) offset from the canvas by a black gap. The net effect is flat, crisp, and screen-native — surfaces feel etched rather than stacked.

## Layout & responsive

Content is centred in a `1400px` max width (`--ds-page-width`) with a `24px` page margin and a `64px` sticky, translucent header. Spacing runs on a strict 4px base unit (`--geist-space`), with `24px` as the default column/section gutter and a continuing rhythm at 32 / 48 / 64 / 96 / 128px for vertical section padding. The grid is generous and airy — the hero gives the headline a full column on the left and lets a single illustrative object (the haloed triangle) own the centre, with a mono caption block to the right. Responsiveness is handled token-first: fluid `clamp()` type and spacing variables (`--text-fluid-*`, `--spacing-fluid-*`) shrink the display sizes continuously as the viewport narrows, and multi-column marketing grids collapse to a single stacked column on mobile while the hairline-and-ring vocabulary stays identical. Nothing about the system depends on imagery to hold together — it is structure, type, and one blue line.
