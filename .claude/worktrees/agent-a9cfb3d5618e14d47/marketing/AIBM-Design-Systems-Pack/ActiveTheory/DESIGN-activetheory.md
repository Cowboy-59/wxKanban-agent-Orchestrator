---
version: alpha
name: Active Theory Analysis
description: >
  A pure-black, fullscreen WebGL stage where a single proprietary grotesque
  (NB Architekt) carries the whole interface in white — no chrome, no shadow,
  no rounding; all colour and depth live inside the rendered experience itself.

colors:
  primary: "#ffffff"          # the UI accent on black — inverted buttons, links, the loading bar
  primary-active: "#cccccc"   # hover/pressed dim of white
  on-primary: "#000000"       # black text/icons sitting on a white fill
  dark: "#000000"             # the canvas itself, also the "dark" inverted band
  canvas: "#000000"           # fullscreen page background (html, body, #Stage)
  canvas-soft: "#0a0a0a"      # barely-lifted near-black section tint
  surface: "#0e0e0e"          # card / panel surface lifted off pure black
  surface-alt: "#141414"      # chip / sunken fill (white @ ~0.06 over black)
  ink: "#ffffff"              # headings, body, nav labels — white on black
  ink-secondary: "#b3b3b3"    # white @ 0.70 — secondary copy
  ink-muted: "#808080"        # white @ 0.50 — meta / inactive
  ink-faint: "#4d4d4d"        # white @ 0.30 — captions / placeholder
  hairline: "#262626"         # white @ ~0.15 — 1px dividers
  # signature accent (WebGL, not DOM-extractable): the work itself supplies
  # electric / iridescent colour inside each 3D scene — see Colour notes.
  bar-overlay: "rgba(255,255,255,0.9)"  # translucent white UI/progress bar (--baropacity)

typography:
  # Family: NB Architekt Std (proprietary, Neubau). Showcase substitutes the
  # nearest Google face, Space Grotesk, and labels it a substitute.
  # Exact px sizes are rendered in WebGL and not readable from the DOM; the
  # scale below reflects the brand's stark, uppercase, wide-tracked language.
  display-1: { fontFamily: "NB Architekt Std", fontSize: 88px, fontWeight: 700, lineHeight: 1.0,  letterSpacing: -1px }
  display-2: { fontFamily: "NB Architekt Std", fontSize: 56px, fontWeight: 400, lineHeight: 1.04, letterSpacing: -0.5px }
  heading-1: { fontFamily: "NB Architekt Std", fontSize: 34px, fontWeight: 400, lineHeight: 1.1,  letterSpacing: 0px }
  heading-2: { fontFamily: "NB Architekt Std", fontSize: 24px, fontWeight: 400, lineHeight: 1.15, letterSpacing: 0px }
  heading-3: { fontFamily: "NB Architekt Std", fontSize: 18px, fontWeight: 700, lineHeight: 1.2,  letterSpacing: 0.2px }
  title:     { fontFamily: "NB Architekt Std", fontSize: 16px, fontWeight: 400, lineHeight: 1.3,  letterSpacing: 0px }
  body-lg:   { fontFamily: "NB Architekt Std", fontSize: 18px, fontWeight: 300, lineHeight: 1.5,  letterSpacing: 0px }
  body-md:   { fontFamily: "NB Architekt Std", fontSize: 15px, fontWeight: 300, lineHeight: 1.55, letterSpacing: 0px }
  body-sm:   { fontFamily: "NB Architekt Std", fontSize: 13px, fontWeight: 400, lineHeight: 1.5,  letterSpacing: 0px }
  button:    { fontFamily: "NB Architekt Std", fontSize: 12px, fontWeight: 700, lineHeight: 1.0,  letterSpacing: 1.5px }   # UPPERCASE
  caption:   { fontFamily: "NB Architekt Std", fontSize: 12px, fontWeight: 400, lineHeight: 1.4,  letterSpacing: 0.4px }
  eyebrow:   { fontFamily: "NB Architekt Std", fontSize: 11px, fontWeight: 700, lineHeight: 1.0,  letterSpacing: 2px }     # UPPERCASE, wide tracking

rounded:
  xs: 0px        # the system is overwhelmingly square-edged
  sm: 2px
  md: 2px
  lg: 4px
  xl: 6px
  xxl: 8px
  full: 9999px   # reserved for the pill-shaped progress bar and round dot markers

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 40px
  xxl: 80px      # full-bleed, generous negative space around centred content

elevation:
  level-0: "none"   # the entire interface is flat; depth is simulated in 3D/WebGL, never with CSS shadow
  level-1: "none"
  level-2: "none"

components:
  nav-bar:        { backgroundColor: "transparent", textColor: "{colors.ink}", typography: "{typography.eyebrow}", padding: 24px 40px, note: "fixed corners, uppercase wide-tracked labels, no background fill" }
  button-primary: { background: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.xs}", padding: 16px 28px, note: "white fill, black uppercase label — the inverted CTA" }
  button-secondary: { background: "transparent", textColor: "{colors.ink}", border: "1px solid {colors.ink}", typography: "{typography.button}", rounded: "{rounded.xs}", padding: 15px 27px }
  button-ghost:   { background: "transparent", textColor: "{colors.ink-secondary}", typography: "{typography.button}", note: "underline-on-hover text link, no box" }
  card:           { backgroundColor: "{colors.surface}", rounded: "{rounded.xs}", shadow: "{elevation.level-0}", hoverShadow: "none", note: "edge-to-edge media tile; hover handled in WebGL, not box-shadow" }
  text-input:     { background: "transparent", textColor: "{colors.ink}", border: "1px solid {colors.hairline}", rounded: "{rounded.xs}", padding: 14px 16px, placeholder: "{colors.ink-faint}" }
  badge-pill:     { background: "{colors.surface-alt}", textColor: "{colors.ink}", rounded: "{rounded.full}", typography: "{typography.caption}", padding: 5px 12px }
  progress-bar:   { background: "{colors.bar-overlay}", rounded: "{rounded.full}", note: "translucent white, opacity driven by the --baropacity custom property" }
---

# Active Theory — Design Language Analysis

Active Theory's site is not a page; it is a fullscreen WebGL stage. The entire document is three elements deep — a `#Stage` div with `overflow:hidden` and `touch-action:none` sitting on a pure-black `html`/`body` — and everything a visitor reads or clicks is drawn inside the rendered experience rather than laid out in the DOM. That choice is the design system. The verifiable CSS is deliberately tiny: a black canvas, one proprietary typeface in three weights, and a single translucent-white bar. Faithfully describing this brand means describing restraint at the chrome layer and spectacle at the render layer.

## Colour

The palette is monochrome by construction. `html`, `body`, and `#Stage` are all declared `background: rgb(0,0,0)`, so the canvas is absolute black with nothing competing against it. Against that void, white is the only ink — the studio builds an entire greyscale hierarchy purely by lowering the opacity of white: full white for primary type and the inverted CTA, roughly 70% for secondary copy, 50% for meta, 30% for captions, and a whisper around 15% for the rare hairline divider. The one non-type colour found in the live styles is `rgba(255,255,255,var(--baropacity))` — a translucent white UI bar whose opacity is animated through a CSS custom property, used for loading/progress feedback. Crucially, the brand's signature colour does not live in CSS at all: the electric, iridescent, often neon palettes Active Theory is known for are generated inside each WebGL scene's shaders. The DOM stays black-and-white on purpose so the rendered work can own every saturated hue. The tokens here therefore encode the honest chrome palette (black canvas, white ramp) and flag the in-scene colour as a render-time concern rather than inventing a hex the site never declares.

## Typography

A single proprietary family carries the whole identity: **NB Architekt Std** (Neubau's architectural grotesque), loaded via three `@font-face` declarations at weights 300 (Light), 400 (Regular), and 700 (Bold). It is a technical, slightly mono-flavoured grotesque with even strokes and an engineered, blueprint feel — exactly the register a creative-technology studio wants. Because the visible text is composed in WebGL, the DOM exposes no pixel sizes; the scale in the frontmatter reproduces the brand's voice rather than measured values. Hierarchy is built the way the studio uses the face in practice: large, near-tracking-tight display weights for statements; Regular for most reading; Light for longer passages; and small, uppercase, widely letter-spaced labels (the eyebrow and button tiers, ~1.5–2px tracking) for navigation and calls to action. The showcase cannot license NB Architekt, so it substitutes the nearest Google face, **Space Grotesk**, and labels it a substitute — a geometric grotesque that shares NB Architekt's technical, slightly condensed character and supports the same 300/400/700 weights.

## Shape & depth

Sharp by default. There is no border-radius anywhere in the verifiable styles, and the brand reads as square-edged — media tiles, type, and frames meet at hard corners. The rounded scale is therefore near-zero (0–2px) with `full` (9999px) reserved only for genuinely circular UI: the pill-shaped progress bar and small dot markers. Depth is equally austere at the CSS layer — zero box-shadows, zero elevation. Nothing floats above the plane with a drop shadow because the sense of depth is produced inside the 3D scene (parallax, perspective, lighting, motion) rather than faked with blur. Flat chrome, dimensional render: that division is the entire depth strategy.

## Layout & responsive

The base unit reads as an 8px rhythm (4 / 8 / 12 / 16 / 24 / 40 / 80), with very generous negative space — content tends to be centred or corner-anchored within a vast black field, framed by large `xxl` margins. The page itself never scrolls in the conventional sense: `overflow:hidden` and `touch-action:none` mean navigation, transitions, and "pages" are handled by the WebGL runtime, often responding to drag, wheel, and pointer gestures captured on the stage. Responsively, the canvas simply fills the viewport at any size (`width:100%; height:100%`) and the experience re-composes internally; the DOM has no breakpoint grid to collapse because there is almost no DOM. The showcase below re-expresses this language in a conventional, scrollable layout so the tokens can be inspected as a normal style guide — a translation of an immersive black-canvas brand into a flat reference sheet.
