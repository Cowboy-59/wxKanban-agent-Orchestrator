---
version: alpha
name: Mercedes-Benz Analysis
description: >
  A disciplined monochrome system painted almost entirely in white, black and a
  cool grey ramp, where the only "colour" is full-bleed photography and the
  brand voice lives in two proprietary typefaces — MBCorpo Title for airy 400-weight
  headlines and MBCorpo Text for everything else — finished with a single white
  16 px pill as the signature call to action.

colors:
  primary: "#000000"          # brand black — actions, headings, footer fill
  primary-active: "#333333"   # hover / pressed darkening
  on-primary: "#ffffff"       # text/icon on black, and text over imagery
  primary-inverse: "#ffffff"  # the white pill CTA used on dark photography (text flips to #000)
  dark: "#15181e"             # cool near-black for inverted bands & emphasis
  canvas: "#ffffff"           # page background, white editorial sections
  canvas-soft: "#f4f4f4"      # off-white section tint (inferred; site alternates white/black)
  canvas-dark: "#000000"      # black editorial band / footer
  surface: "#ffffff"          # card / panel surface (cards sit flat on white)
  surface-dark: "#222222"     # dark card / media surface (observed)
  surface-alt: "#f0f0f0"      # light chip / sunken fill (inferred for readable chips)
  ink: "#000000"              # headings & body text on light
  ink-secondary: "#333333"    # editorial headline grey (merges #303030)
  ink-muted: "#767676"        # muted UI text, language switcher
  ink-faint: "#9f9f9f"        # captions, footnotes, placeholder (merges #919191)
  on-dark: "#ffffff"          # text on black / dark sections
  hairline: "#cccccc"         # 1px dividers & borders on light (inferred)
  hairline-strong: "#333333"  # dividers on dark sections (observed)
  scrim: "rgba(0,0,0,0.75)"   # translucent header & photo overlay
  # No saturated brand hue. The only saturated colour on the page (#0078d6) belonged
  # to the cookie-consent layer (Usercentrics) and was excluded from the system.
  # No semantic success / warning / error colours are used on the brand site.

typography:
  # Both families are proprietary (MBCorpo Title / MBCorpo Text). Showcase substitutes
  # the nearest Google fonts: Archivo for the Title face, Inter for the Text face.
  display-1: { fontFamily: "MBCorpo Title (sub: Archivo)", fontSize: 72px, fontWeight: 400, lineHeight: 1.11, letterSpacing: 0 }
  display-2: { fontFamily: "MBCorpo Title (sub: Archivo)", fontSize: 64px, fontWeight: 400, lineHeight: 1.13, letterSpacing: 0 }
  heading-1: { fontFamily: "MBCorpo Title (sub: Archivo)", fontSize: 53px, fontWeight: 400, lineHeight: 1.25, letterSpacing: 0 }
  heading-2: { fontFamily: "MBCorpo Title (sub: Archivo)", fontSize: 48px, fontWeight: 400, lineHeight: 1.0, letterSpacing: 0 }
  heading-3: { fontFamily: "MBCorpo Title (sub: Archivo)", fontSize: 30px, fontWeight: 400, lineHeight: 1.15, letterSpacing: 0 }
  title:     { fontFamily: "MBCorpo Text (sub: Inter)", fontSize: 24px, fontWeight: 400, lineHeight: 1.2, letterSpacing: 0 }
  body-lg:   { fontFamily: "MBCorpo Text (sub: Inter)", fontSize: 18px, fontWeight: 400, lineHeight: 1.56, letterSpacing: 0 }
  body-md:   { fontFamily: "MBCorpo Text (sub: Inter)", fontSize: 16px, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0 }
  body-sm:   { fontFamily: "MBCorpo Text (sub: Inter)", fontSize: 14px, fontWeight: 400, lineHeight: 1.57, letterSpacing: 0 }
  button:    { fontFamily: "MBCorpo Text (sub: Inter)", fontSize: 16px, fontWeight: 400, lineHeight: 1.38, letterSpacing: 0 }
  caption:   { fontFamily: "MBCorpo Text (sub: Inter)", fontSize: 13px, fontWeight: 400, lineHeight: 1.38, letterSpacing: 0 }
  eyebrow:   { fontFamily: "MBCorpo Text (sub: Inter)", fontSize: 14px, fontWeight: 700, lineHeight: 1.4, letterSpacing: 0.4px, textTransform: uppercase }

rounded:
  none: 0px      # cards, image tiles and editorial media are sharp-cornered
  xs: 3px
  sm: 4px
  md: 8px
  pill: 16px     # the signature CTA radius
  full: 9999px   # circular icon buttons

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px       # the pill button's horizontal padding unit
  lg: 24px
  xl: 32px
  xxl: 48px
  xxxl: 64px     # base unit ≈ 8px

elevation:
  level-0: "none"                               # default — the system is overwhelmingly flat
  level-1: "0 4px 16px rgba(0,0,0,0.12)"        # normalized card/raised (showcase)
  level-2: "0 12px 32px rgba(0,0,0,0.20)"       # normalized overlay/popover (showcase)
  observed-text-legibility: "0 3px 7px rgba(0,0,0,0.8)"  # heavy shadow used only to lift text/icons off photography

components:
  nav-bar:          { backgroundColor: "{colors.scrim}", textColor: "{colors.on-dark}", typography: "{typography.body-sm}", padding: "16px 24px", note: "sticky, translucent black over hero imagery" }
  button-primary:   { background: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.pill}", padding: "6px 16px" }
  button-inverse:   { background: "{colors.primary-inverse}", textColor: "{colors.ink}", typography: "{typography.button}", rounded: "{rounded.pill}", padding: "6px 16px", note: "the live hero CTA: white pill on photography" }
  button-dark:      { background: "{colors.dark}", textColor: "#ffffff", typography: "{typography.button}", rounded: "{rounded.pill}", padding: "6px 16px" }
  button-secondary: { background: "transparent", textColor: "{colors.ink}", border: "1px solid {colors.ink}", typography: "{typography.button}", rounded: "{rounded.pill}", padding: "5px 15px" }
  card:             { backgroundColor: "{colors.surface}", rounded: "{rounded.none}", shadow: "{elevation.level-0}", hoverShadow: "{elevation.level-1}", note: "full-bleed image, caption set below; sharp corners" }
  text-input:       { backgroundColor: "{colors.canvas}", border: "1px solid {colors.ink-muted}", rounded: "{rounded.sm}", typography: "{typography.body-md}", padding: "12px 16px", note: "inferred — homepage has no forms" }
  badge-pill:       { background: "{colors.primary-inverse}", textColor: "{colors.ink}", rounded: "{rounded.full}", typography: "{typography.caption}", padding: "5px 10px" }
---

# Mercedes-Benz — Design Language Analysis

The Mercedes-Benz brand experience is a study in subtraction. The interface is assembled almost entirely from custom web components (`brandhub-stage`, `brandhub-teaser-tiles`, `brandhub-editorial-highlight`) and is painted in only three things: white, black, and a narrow grey ramp. There is no accent hue, no gradient, no decorative colour anywhere in the chrome — the only saturated value found on the page (a `#0078d6` blue) belonged to the cookie-consent layer and was filtered out of the system. Colour, where it appears, comes exclusively from full-bleed product photography. Against that restraint, the brand's identity is carried by two things: the proprietary MBCorpo typefaces and a single, instantly recognisable white pill button.

## Colour

The palette is monochrome by design. Text is overwhelmingly white (`#ffffff`) because most of the page sits over dark imagery or black editorial bands; on white sections the type drops to a graded set of near-blacks — pure `#000000` for strong text, `#333333` for large editorial headlines, and `#303030`/`#15181e` for body. Secondary and tertiary information steps down through a cool grey ramp of `#767676`, `#919191` and `#9f9f9f`. Surfaces are binary: pure-white sections alternate with pure-black ones, with `#222222` appearing as an occasional dark media surface. The sticky header is not a solid bar but a translucent `rgba(0,0,0,0.75)` scrim that lets the hero photograph bleed up behind the navigation. Dividers are hairline and quiet — `#333333` on dark, a light grey on white. The lesson of this palette is discipline: the brand trusts black, white and photography to do all the work, and treats any chroma in the UI as a foreign object.

## Typography

Two proprietary superfamily faces do everything. **MBCorpo Title** is the display voice — used for the hero (`53px`), editorial headlines (`48px`) and the largest statements (`64px`–`72px`), always at a calm **weight 400** with generous, near-1.0–1.25 line-height and no letter-spacing. It is never bolded; size alone builds the hierarchy, which is what gives the headlines their airy, confident, expensive feel. **MBCorpo Text** handles structure and reading: a dominant `14px` navigation/body tier (line-height ~1.57), a `16px`/`18px` reading tier at 1.5, a large `24px` teaser tier, and small `13px` legal/caption text. Weight 700 appears only for inline emphasis and bold links. Mercedes leans on UPPERCASE labels ("VEHICLES") for section and teaser headers. Because both faces are licensed, the showcase substitutes the nearest Google fonts — **Archivo** for the Title face and **Inter** for the Text face (the site itself even falls back to *Public Sans* in a few slots, confirming a neutral humanist body voice is the target).

## Shape & depth

Shape is where the system makes its one expressive move. Almost everything is sharp: image tiles, editorial media and cards have square `0px` corners, reinforcing the architectural, precision-engineered feel. The exception — and the brand's clearest UI signature — is the **16px pill button**: a compact `6px 16px` capsule that on photography is white with black text, and on light surfaces inverts to black with white text. Small `3–4px` radii show up on minor controls and circular `50%` icon buttons round out utility actions. Depth is deliberately minimal: the interface is flat, with no resting card shadows. The only shadow observed on the brand layer is a heavy `0 3px 7px rgba(0,0,0,0.8)` used purely to lift white text and icons off busy photography for legibility — not as decorative elevation. The showcase normalises this into a soft level-1/level-2 pair for demonstrating cards and overlays.

## Layout & responsive

Spacing follows a roughly 8px base unit (the pill's `16px` padding, `24px` gutters), with generous vertical rhythm that lets the full-bleed photography breathe. The composition is a stack of full-width editorial and teaser bands — a cinematic hero stage, a teaser-tile grid, and an editorial highlight — rather than a boxed grid, so the page reads like a magazine. On smaller viewports the multi-column teaser tiles collapse to a single column, the headline scale steps down (the `72px`/`64px` display sizes give way to the `48px`/`53px` tier), and the navigation condenses behind a menu trigger while the translucent header and white pill CTA persist unchanged.
