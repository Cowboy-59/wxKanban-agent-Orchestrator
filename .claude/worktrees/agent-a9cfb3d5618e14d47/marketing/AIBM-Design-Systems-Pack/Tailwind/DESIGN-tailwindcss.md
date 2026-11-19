---
version: alpha
name: Tailwind CSS Analysis
description: >
  A dark, code-forward identity painted on a near-black gray-950 canvas with
  pure-white ink, where a single electric sky-cyan does the talking — joined by
  hot-pink and teal flashes — under enormous, feather-light Inter display type
  pulled tight with aggressive negative tracking and wrapped in fully-rounded
  slate pills.

colors:
  primary: "#00bcff"            # sky-400 — inline code, links, focus, the "Plus" accent, logo gradient
  primary-active: "#00a6f4"     # sky-500 — pressed/hover cyan
  on-primary: "#030712"         # gray-950 ink sits on the bright cyan CTA
  primary-gradient-from: "#74d4ff"  # sky-300 — brand/logo gradient start
  primary-gradient-to: "#00a6f4"    # sky-500 — brand/logo gradient end
  accent-pink: "#f6339a"        # pink-500 — vibrant demo CTAs, gradient flashes
  accent-pink-soft: "#fb64b6"   # pink-400 — softer pink highlight
  accent-teal: "#96f7e4"        # teal-200 — tertiary vibrant accent
  accent-sky-soft: "#74d4ff"    # sky-300 — light cyan tint
  dark: "#364153"               # slate-700 — solid "Get started" pill, feature surfaces
  canvas: "#030712"             # gray-950 — the page
  canvas-soft: "#101828"        # gray-900 — raised band / code-editor ground
  surface: "#1e2939"            # gray-800 — cards & panels (raised on dark)
  surface-alt: "#364153"        # slate-700 — chips, pills, sunken-light fills
  ink: "#ffffff"                # headings & body on the dark canvas
  ink-secondary: "#cad5e2"      # slate-300 — lede / secondary copy
  ink-muted: "#90a1b9"          # slate-400 — meta, muted labels
  ink-faint: "#62748e"          # slate-500 — captions / placeholder
  hairline: "rgba(255,255,255,0.10)"   # 1px borders & dividers on dark
  hairline-soft: "rgba(255,255,255,0.06)"  # faintest separators
  # decorative: dot-grid & 315deg diagonal hatch drawn in white at ~10% opacity

typography:
  display-1: { fontFamily: Inter, fontSize: 96px, fontWeight: 400, lineHeight: 1.0, letterSpacing: -4.8px }
  heading-1: { fontFamily: Inter, fontSize: 40px, fontWeight: 500, lineHeight: 1.0, letterSpacing: -2px }
  heading-2: { fontFamily: Inter, fontSize: 30px, fontWeight: 600, lineHeight: 1.2, letterSpacing: -0.75px }
  heading-3: { fontFamily: Inter, fontSize: 24px, fontWeight: 500, lineHeight: 1.3, letterSpacing: -0.5px }
  title:     { fontFamily: Inter, fontSize: 20px, fontWeight: 600, lineHeight: 1.4, letterSpacing: -0.25px }
  body-lg:   { fontFamily: Inter, fontSize: 18px, fontWeight: 500, lineHeight: 1.6, letterSpacing: 0 }
  body-md:   { fontFamily: Inter, fontSize: 16px, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0 }
  body-sm:   { fontFamily: Inter, fontSize: 14px, fontWeight: 400, lineHeight: 1.43, letterSpacing: 0 }
  button:    { fontFamily: Inter, fontSize: 14px, fontWeight: 600, lineHeight: 1.0, letterSpacing: 0 }
  caption:   { fontFamily: "JetBrains Mono", fontSize: 13px, fontWeight: 400, lineHeight: 1.4, letterSpacing: 0 }
  eyebrow:   { fontFamily: Inter, fontSize: 12px, fontWeight: 600, lineHeight: 1.2, letterSpacing: 0.5px }

rounded:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
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
  level-0: "inset 0 0 0 1px rgba(255,255,255,0.10)"
  level-1: "0 1px 2px rgba(0,0,0,0.40), 0 4px 12px rgba(0,0,0,0.35)"
  level-2: "0 16px 40px rgba(0,0,0,0.55)"

components:
  nav-bar:        { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", linkTypography: "{typography.button}", padding: 16px 0 }
  button-primary: { background: "linear-gradient(135deg, {colors.primary-gradient-from}, {colors.primary-gradient-to})", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.full}", padding: 8px 16px }
  button-dark:    { background: "{colors.dark}", textColor: "{colors.ink}", typography: "{typography.button}", rounded: "{rounded.full}", padding: 8px 16px }
  button-secondary: { background: "transparent", textColor: "{colors.ink}", border: "1px solid {colors.hairline}", rounded: "{rounded.full}", padding: 7px 15px }
  pill-chip:      { background: "{colors.surface-alt}", textColor: "{colors.ink}", typography: "{typography.eyebrow}", rounded: "{rounded.full}", padding: 2px 10px }
  card:           { backgroundColor: "{colors.surface}", rounded: "{rounded.lg}", border: "1px solid {colors.hairline-soft}", shadow: "{elevation.level-0}", hoverShadow: "{elevation.level-1}" }
  text-input:     { backgroundColor: "{colors.surface-alt}", textColor: "{colors.ink}", placeholder: "{colors.ink-faint}", rounded: "{rounded.full}", padding: 8px 16px, border: "1px solid {colors.hairline}" }
  badge-pill:     { backgroundColor: "rgba(255,255,255,0.10)", textColor: "{colors.ink}", typography: "{typography.eyebrow}", rounded: "{rounded.full}", padding: 2px 6px 2px 10px }
---

# Tailwind CSS — Design Language Analysis

Tailwind's homepage is a developer tool dressed as a piece of stagecraft. It paints itself almost entirely in near-black, then lets one enormous white sentence — *"Rapidly build modern websites without ever leaving your HTML."* — fill the screen at 96px. The whole composition is built to read like a code editor that learned typography: muted utility-class annotations float in the margins, syntax-highlighted snippets sit in dark glass panels, and a single electric cyan is the only color allowed to raise its voice. It is confident, technical, and high-contrast, and it trusts a tight, restrained palette to carry an extremely loud type system.

## Colour

The system is a dark monochrome spine with three saturated sparks. The spine is a four-step gray ladder lifted straight from Tailwind's own scale: `canvas` gray-950 `#030712` for the page, `canvas-soft` gray-900 `#101828` for the code-editor band, `surface` gray-800 `#1e2939` for raised cards, and `surface-alt` slate-700 `#364153` for chips and pills. Because everything sits on black, the surfaces climb *up* in lightness rather than dropping into shadow, and separators are simply white at 6–10% opacity (`hairline-soft` / `hairline`) rather than a hard line color.

Ink is a pure-white-to-slate ramp: `#ffffff` for headlines, `#cad5e2` (slate-300) for the lede, `#90a1b9` (slate-400) for meta, and `#62748e` (slate-500) for placeholders and captions. Against that restraint, the one true brand color is sky-cyan `#00bcff` — it lights up inline code tokens (`flex`, `pt-4`, `rotate-90`), the "Plus" nav item, focus states, and the logo's `#74d4ff → #00a6f4` gradient wave. Two more vibrant accents appear in the embedded product demos and gradient flourishes rather than the chrome: hot-pink `#f6339a` (the "Check availability" demo CTA) and a teal `#96f7e4`. The practical lesson is that the cyan is structural and the pink/teal are seasoning. Notably, the primary *button* — "Get started" — is not cyan at all but a calm slate-700 pill; the brand saves its loudest color for type and accents and keeps its buttons quiet.

## Typography

One family does all of it: **Inter** (resolved stack `inter, "inter Fallback", system-ui`), freely available on Google Fonts, so no substitution is required — though the live site ships a custom-tuned cut, so treat the Google version as a faithful stand-in. Hierarchy is built almost entirely through **size and negative tracking, not weight**. The hero `display-1` is a remarkable 96px at weight **400** — feather-light for its scale — pulled in to −4.8px letter-spacing and set at a 1.0 line-height so the two lines stack like slabs. Section heads (`heading-1`, 40px/500, −2px) keep that same tight, optical-display treatment. Below ~30px the type settles into ordinary product weights: 30px/600 and 24px/500 headings, a medium 18px lede, and a dominant 16px/400 body at 1.5 line-height that accounts for the overwhelming majority of text on the page. Small print and code annotations live at 13–14px, with the code/annotation voice rendered in a monospace (a JetBrains-Mono-class face is the nearest Google substitute). The signature move to remember: as type gets bigger, the tracking gets *tighter* — that single rule is most of what makes the headline feel like Tailwind.

## Shape & depth

Corners are soft and come in two distinct personalities. Interactive chrome — buttons, the search field, badges, the "v4.3" tag — is **fully rounded** (`9999px` pills), which is the most frequently observed radius on the page. Containers and media — cards, code panels, demo thumbnails — use a calm tier of `8 / 12 / 16px`, with larger framing blocks reaching `24` and `32px`. Depth is deliberately understated because the canvas is already black: instead of drop shadows, the system leans on a 1px inset highlight ring at white-10% (`level-0`) to lift a card off the background. Real shadows (`level-1`, `level-2`) are reserved for the floating product-demo cards and popovers, and they are deep and soft (large blur, 35–55% black) to register against the dark ground. Decoratively, two repeating patterns — a 1px dot grid and a 315° diagonal hatch, both white at ~10% — fill the page gutters and give the emptiness a blueprint texture.

## Layout & responsive

The page is a centered column roughly 1200px wide with generous 40px gutters, and it is built on Tailwind's own 4px spacing unit (`4 / 8 / 12 / 16 / 24 / 32 / 48`). Vertical rhythm is large and sectional — big breathing room between the hero, the supporting bands, and the embedded UI demos. On the homepage the hero type is the load-bearing element, so the most important responsive behavior is the display scaling down hard (the `text-8xl` headline collapses toward `text-4xl`/48px on narrow screens) while the body and lede hold their size. Multi-column demo grids (component cards, property listings) reflow from four tracks to two and then to one, the nav condenses its link row behind a menu, and the pill buttons and search keep their full-rounded geometry at every breakpoint. The throughline is constant: dark canvas, white type, one cyan, and a lot of confident negative space.
