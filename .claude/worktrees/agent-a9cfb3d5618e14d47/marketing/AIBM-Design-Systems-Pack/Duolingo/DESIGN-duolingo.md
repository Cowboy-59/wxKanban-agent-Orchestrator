---
version: alpha
name: Duolingo Analysis
description: >
  A bright, candy-bright kids'-cartoon system: a snow-white canvas, soft "eel"
  grey ink, and one electric Feather Green (#58cc02) that owns every call to
  action — pressed into chunky, rounded 3D buttons with a darker-green bottom
  lip, set in Duolingo's own rounded sans with playful "Feather" display heads.

colors:
  primary: "#58cc02"            # Feather Green — every CTA, brand mark, success
  primary-active: "#58a700"     # Mask Green — the 4px button lip & pressed state
  on-primary: "#ffffff"         # white text/icons on green
  secondary: "#1cb0f6"          # Macaw blue — secondary buttons, links, info
  secondary-active: "#1899d6"   # Whale — pressed blue / blue lip
  dark: "#100f3e"               # deep indigo — inverted app-download / footer band
  canvas: "#ffffff"             # page background
  canvas-soft: "#ddf4ff"        # pale-blue section band (Iguana)
  surface: "#ffffff"            # card / panel surface
  surface-alt: "#f1f7fb"        # cool near-white sunken fill / chip
  ink: "#4b4b4b"                # Eel — headings & body text
  ink-secondary: "#777777"      # Wolf — sub-labels, nav links
  ink-muted: "#afafaf"          # Hare — disabled, meta
  ink-faint: "#c1c1c1"          # placeholder / input outline
  hairline: "#e5e5e5"           # Swan — 1px borders & dividers
  # semantic (Duolingo's documented palette)
  success: "#58cc02"            # = primary green
  info: "#1cb0f6"               # Macaw blue
  warning: "#ff9600"            # Fox orange
  error: "#ff4b4b"              # Cardinal red
  # decorative accents
  accent-navy: "#042c60"        # dark-blue hero headline on light
  accent-green-soft: "#a5ed6e"  # mint accent / highlight
  accent-green-pale: "#d7ffb8"  # pale-green tint on dark bands
  accent-yellow: "#ffc800"      # Bee — streak / coins
  accent-purple: "#ce82ff"      # Beetle — super / decorative

typography:
  # Body & UI: "duolingo-sans" (proprietary, DIN-Round lineage) → substitute Nunito
  # Display:   "feather" (proprietary rounded display)          → substitute Fredoka
  display-1: { fontFamily: "duolingo-sans", fontSize: 64px, fontWeight: 700, lineHeight: 1.0, letterSpacing: -1.28px }
  display-2: { fontFamily: "feather",       fontSize: 48px, fontWeight: 700, lineHeight: 1.1, letterSpacing: 0px }
  heading-1: { fontFamily: "duolingo-sans", fontSize: 32px, fontWeight: 700, lineHeight: 1.15, letterSpacing: 0px }
  heading-2: { fontFamily: "duolingo-sans", fontSize: 19px, fontWeight: 700, lineHeight: 1.25, letterSpacing: 0px }
  heading-3: { fontFamily: "duolingo-sans", fontSize: 17px, fontWeight: 700, lineHeight: 1.3, letterSpacing: 0px }
  body-lg:   { fontFamily: "duolingo-sans", fontSize: 17px, fontWeight: 500, lineHeight: 1.5, letterSpacing: 0px }
  body-md:   { fontFamily: "duolingo-sans", fontSize: 15px, fontWeight: 500, lineHeight: 1.5, letterSpacing: 0px }
  body-sm:   { fontFamily: "duolingo-sans", fontSize: 13px, fontWeight: 500, lineHeight: 1.5, letterSpacing: 0px }
  button:    { fontFamily: "duolingo-sans", fontSize: 15px, fontWeight: 700, lineHeight: 1.15, letterSpacing: 0.8px, textTransform: uppercase }
  caption:   { fontFamily: "duolingo-sans", fontSize: 13px, fontWeight: 700, lineHeight: 1.4, letterSpacing: 0px }
  eyebrow:   { fontFamily: "duolingo-sans", fontSize: 13px, fontWeight: 700, lineHeight: 1.2, letterSpacing: 0.8px, textTransform: uppercase }

rounded:
  xs: 2px
  sm: 8px
  md: 12px      # dominant — buttons, inputs, most cards
  lg: 16px      # larger cards / modals
  xl: 20px
  xxl: 24px
  full: 9999px  # pills, avatars, progress bars

spacing:
  xxs: 4px      # base unit
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px     # section vertical rhythm

elevation:
  level-0: "none"                                  # flat surface + 1px #e5e5e5 hairline
  level-1: "0 4px 0 0 rgba(0,0,0,0.08)"            # the signature chunky solid offset (no blur)
  level-2: "0 0 5px 0 rgba(128,128,128,0.45)"      # soft grey glow on raised popovers/cards

components:
  nav-bar:        { backgroundColor: "{colors.canvas}", textColor: "{colors.ink-secondary}", typography: "{typography.eyebrow}", height: 70px, padding: "0 24px" }
  button-primary: { background: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.md}", padding: "14px 24px", shadow: "0 4px 0 0 {colors.primary-active}", hoverFilter: "brightness(1.05)" }
  button-secondary: { background: "{colors.canvas}", textColor: "{colors.secondary}", border: "2px solid {colors.hairline}", typography: "{typography.button}", rounded: "{rounded.md}", padding: "12px 22px", shadow: "0 4px 0 0 {colors.hairline}" }
  button-pill:    { background: "{colors.surface-alt}", textColor: "{colors.ink-secondary}", typography: "{typography.eyebrow}", rounded: "{rounded.full}", padding: "11px 18px" }
  card:           { backgroundColor: "{colors.surface}", border: "1px solid {colors.hairline}", rounded: "{rounded.lg}", shadow: "{elevation.level-0}", hoverShadow: "{elevation.level-2}" }
  text-input:     { backgroundColor: "{colors.canvas}", border: "1px solid {colors.ink-faint}", rounded: "{rounded.md}", textColor: "{colors.ink}", placeholderColor: "{colors.ink-muted}", padding: "12px 16px" }
  badge-pill:     { background: "{colors.surface-alt}", textColor: "{colors.primary}", typography: "{typography.caption}", rounded: "{rounded.full}", padding: "5px 10px" }
---

# Duolingo — Design Language Analysis

Duolingo's web design system is built to feel like a friendly cartoon you can tap through, not an app you have to read. The whole surface is snow white, the text is a soft charcoal rather than true black, and every moment that matters is carried by a single jolt of electric green. Nothing is subtle on purpose: buttons are chunky and rounded with a visible 3D "lip," headlines are oversized and playful, and the type is set in Duolingo's own rounded sans so even body copy reads as approachable. It is a system optimized for delight, momentum, and a low barrier to the next tap.

## Colour

The palette is anchored by **Feather Green `#58cc02`** — the owl, the brand, and effectively the only color allowed to mean "go." It appears on every primary CTA, on success states, and as the playful color of the big section headlines. Its darker sibling **Mask Green `#58a700`** is never decorative; it exists to form the 4px bottom lip of the 3D buttons (the measured `border-bottom: 4px` confirms this mechanism), which is what gives Duolingo's buttons their pressable, toy-like depth.

The ink ramp is deliberately soft. Primary text is **Eel `#4b4b4b`**, not black — a warmer, gentler charcoal — stepping down through **Wolf `#777777`** for sub-labels and nav links, **Hare `#afafaf`** for muted/disabled, and **`#c1c1c1`** at the placeholder/input-outline level. Dividers and 1px borders are the very light **Swan `#e5e5e5`**. Surfaces are almost entirely white; the only resting tints are a **pale blue `#ddf4ff`** band used to segment marketing sections and a cool near-white `#f1f7fb` for sunken fills. A **deep indigo `#100f3e`** band inverts the scheme for the app-download / footer zone, where pale-green `#d7ffb8` accents glow against the dark.

Beyond the core, Duolingo runs a famous secondary "bird" palette — **Macaw blue `#1cb0f6`** (its pressed **Whale `#1899d6`**) for secondary actions and links, plus **Cardinal red `#ff4b4b`**, **Fox orange `#ff9600`**, **Bee yellow `#ffc800`**, and **Beetle purple `#ce82ff`** for status, gamification, and illustration. The discipline is that exactly one color (green) drives action; everything else is feedback or play. There are no gradients — fills are flat and saturated.

## Typography

Duolingo uses two proprietary faces. Body and UI text is set in **`duolingo-sans`**, a rounded, humanist sans in the DIN-Round lineage — friendly, high-legibility, slightly geometric. Big personality headlines use **`feather`**, a heavier rounded display face that gives the green section titles their bouncy, almost hand-drawn feel. Because both are licensed, the showcase substitutes the closest free equivalents: **Nunito** for `duolingo-sans` and **Fredoka** for `feather`, both labeled as substitutes.

Hierarchy is built primarily through **size and weight**, not tracking. The scale jumps boldly — a 64px hero headline, 48px playful section heads, then a steep drop to a 17px body — so there is rarely ambiguity about what to read first. A defining choice is that the **dominant body weight is 500 (medium), not 400**: even paragraph text carries a little extra weight, which keeps the friendly, confident tone consistent down to the smallest label. Buttons and eyebrows are the only place tracking appears — set 13–15px, weight 700, **UPPERCASE with `0.8px` letter-spacing** — a compact, energetic label style that reads as "tap me."

## Shape & depth

Everything is rounded; nothing is sharp. The dominant radius measured across buttons, inputs, and cards is **`12px`**, with larger containers and modals stepping up to `16px` and pills/avatars/progress bars going fully round (`9999px`). The smallest detail radius is `2px`. Depth is unusually distinctive: Duolingo largely avoids soft drop shadows in favor of a **solid, zero-blur offset** — the chunky 4px lip beneath buttons (`0 4px 0` in the lip color) that makes them look like physical keys and visibly "depress" on click. Resting surfaces are flat, separated only by the 1px Swan hairline; a soft grey glow (`0 0 5px`) is reserved for genuinely raised popovers and elevated cards. This pairing — flat surfaces plus one chunky tactile shadow on interactive elements — is the core of the brand's tactile, game-like feel.

## Layout & responsive

Spacing follows a **4px base unit**, scaling through 8 / 12 / 16 / 24 / 32 to a 48px vertical rhythm between marketing sections (with hero blocks padded to 70px+). Layout is centered and generous, with marketing content held to a comfortable max width and broken into full-bleed alternating bands (white → pale-blue `#ddf4ff` → deep-indigo `#100f3e`) rather than dense grids. On smaller screens the multi-column course/feature grids collapse to two columns and then one, headlines scale down from 64px toward ~48px, and the chunky CTAs stretch toward full width while keeping their 12px radius and green lip intact — the personality survives the breakpoints because it lives in color, roundness, and weight rather than in layout.
