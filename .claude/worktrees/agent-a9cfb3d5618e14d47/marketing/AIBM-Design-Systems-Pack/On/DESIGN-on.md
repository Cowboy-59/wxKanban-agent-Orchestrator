---
version: alpha
name: On Analysis
description: >
  A monochrome Swiss-performance system where a single black ink does triple
  duty as text, CTA, and brand mark on an almost-pure-white canvas, broken only
  by a sparing seafoam-mint accent — built from fully-rounded pill buttons,
  flat hairline-separated surfaces, and a tight grotesque type scale.

colors:
  primary: "#000000"          # pill CTAs, links, brand wordmark — the one functional colour
  primary-active: "#222222"   # pressed/hover shift on black controls
  on-primary: "#ffffff"       # text/icon on black pills
  dark: "#222222"             # dark UI bands, cookie bar, scrims
  canvas: "#ffffff"           # page background
  canvas-soft: "#f4f4f4"      # off-white section bands
  surface: "#ffffff"          # cards / panels
  surface-alt: "#e5e5e5"      # sunken chips, circular icon-button fills
  ink: "#000000"              # headings & body text
  ink-secondary: "#555555"    # sub-labels, secondary copy
  ink-muted: "#666666"        # tertiary metadata
  ink-faint: "#999999"        # captions, disabled, placeholders
  hairline: "#d1d1d1"         # 1px input borders & dividers
  hairline-soft: "#ececec"    # faint section rules (≈ rgba(0,0,0,.05) on white)
  accent-mint: "#60bc9d"      # sparse brand accent — sustainability / highlight pills
  accent-mint-active: "#32ae88" # deeper mint for hover/active of the accent
  surface-mint: "#f9fffa"     # faint green-tinted panel
  tile-backdrop: "#eceef0"    # product-tile radial-gradient base (#fff → #f6f7f8 → #eceef0)

typography:
  display-1: { fontFamily: On, fontSize: 53px, fontWeight: 700, lineHeight: 1.10, letterSpacing: -0.53px }
  heading-1: { fontFamily: On, fontSize: 33px, fontWeight: 700, lineHeight: 1.15, letterSpacing: -0.33px }
  heading-2: { fontFamily: On, fontSize: 26px, fontWeight: 700, lineHeight: 1.15, letterSpacing: -0.26px }
  title:     { fontFamily: On, fontSize: 20px, fontWeight: 500, lineHeight: 1.20, letterSpacing: 0px }
  body-lg:   { fontFamily: On, fontSize: 20px, fontWeight: 400, lineHeight: 1.50, letterSpacing: 0px }
  body-md:   { fontFamily: On, fontSize: 16px, fontWeight: 400, lineHeight: 1.50, letterSpacing: 0px }
  body-sm:   { fontFamily: On, fontSize: 14px, fontWeight: 400, lineHeight: 1.43, letterSpacing: 0px }
  button:    { fontFamily: On, fontSize: 16px, fontWeight: 500, lineHeight: 1.25, letterSpacing: 0px }
  caption:   { fontFamily: On, fontSize: 13px, fontWeight: 400, lineHeight: 1.40, letterSpacing: 0px }
  eyebrow:   { fontFamily: On, fontSize: 13px, fontWeight: 500, lineHeight: 1.00, letterSpacing: 1.2px }

rounded:
  xs: 2px
  sm: 4px
  md: 8px
  lg: 12px
  xl: 20px
  xxl: 40px
  full: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  gutter: 64px

elevation:
  level-0: "none"
  level-1: "0 0 0.5px rgba(0,0,0,0.05), 0 2px 4px rgba(0,0,0,0.10)"
  level-2: "0 0 3px rgba(0,0,0,0.05), 0 12px 24px rgba(0,0,0,0.10)"

components:
  nav-bar:          { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.body-md}", padding: "16px 64px", borderBottom: "1px solid {colors.hairline-soft}" }
  button-primary:   { background: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.full}", border: "1px solid {colors.primary}", padding: "14px 24px" }
  button-light:     { background: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.button}", rounded: "{rounded.full}", border: "1px solid {colors.canvas}", padding: "14px 24px", note: "primary action placed over photography" }
  button-secondary: { background: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.button}", rounded: "{rounded.full}", border: "1px solid {colors.ink}", padding: "13px 23px" }
  button-icon:      { background: "{colors.surface-alt}", textColor: "{colors.ink}", rounded: "{rounded.full}", shape: "circle (50%)", note: "carousel arrows / utility" }
  card:             { backgroundColor: "{colors.surface}", rounded: "{rounded.sm}", shadow: "{elevation.level-0}", hoverShadow: "{elevation.level-1}", note: "product tile sits on a radial grey backdrop, not a shadow" }
  text-input:       { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", placeholder: "{colors.ink-faint}", rounded: "{rounded.xs}", border: "1px solid {colors.hairline}", padding: "12px 16px" }
  badge-pill:       { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", rounded: "{rounded.full}", typography: "{typography.eyebrow}", shadow: "0 1px 2px rgba(0,0,0,0.1)" }
---

# On — Design Language Analysis

On's storefront is an exercise in disciplined restraint. The brand presents itself the way it photographs its shoes: clean white space, full-bleed imagery, and exactly one ink. There is almost no chrome — no gradients on UI, no decorative colour, no drop shadows competing for attention. The personality lives in the photography and the typography, and the interface gets out of the way. This is a Swiss "performance-minimal" system in the most literal sense: black, white, a hairline, and a pill.

## Colour

The palette is effectively monochrome. A single pure black (`#000000`) is the most-used colour on the page by an order of magnitude — it is simultaneously the body ink, the link colour, the brand wordmark, and the fill of the primary call-to-action. White (`#ffffff`) is the canvas and the text colour reversed out of black pills. Between them sits a tight, functional grey ramp: `#555555` for secondary copy, `#666666` for tertiary metadata, `#999999` for captions and placeholders, with `#d1d1d1` and a near-invisible `#ececec` doing the work of borders and dividers. Section bands lighten to `#f4f4f4`, and sunken chips and circular icon buttons fill with `#e5e5e5`.

The only saturated colour in the system is a seafoam mint (`#60bc9d`, deepening to `#32ae88` on interaction), used very sparingly — On reserves it for accent moments such as sustainability and Cyclon messaging rather than spending it on everyday UI, occasionally backed by a barely-there green-tinted surface (`#f9fffa`). Product tiles don't use a flat fill at all; they sit on a soft radial gradient that fades from white through `#f6f7f8` to `#eceef0`, giving the shoe a subtle studio-backdrop glow without introducing a shadow. The few stray hues that surface — default-blue links, a brown star colour, a sale red — are incidental browser or third-party defaults, not part of the brand language.

## Typography

The site ships a proprietary grotesque named simply "On" — a neutral, slightly technical Swiss sans in the Helvetica/Akzidenz lineage. The showcase substitutes **Hanken Grotesk** (nearest Google match) and labels it as a stand-in. Hierarchy is built almost entirely from two levers: size and weight, with tracking as a finishing touch. Body text is a comfortable 16px / 400 at a 1.5 ratio and accounts for the overwhelming majority of text on the page. Headings jump to 700 weight and scale up through 26px and 33px to a 53px display size, which pulls its letter-spacing tight (about −0.01em) to keep the large grotesque feeling crisp and engineered. The 500 weight is the connective tissue — it carries buttons, section subheads, and labels — while a 13px tracked uppercase eyebrow handles category and meta labels. There is no italic, no serif, no decorative cut: one family, three weights, doing everything.

## Shape & depth

Two radius behaviours define the shape language and they sit at opposite ends of the scale. Containers — cards, tiles, inputs, the cookie bar — are nearly square, using 2–4px corners that read as "barely softened rectangles." Interactive pills and circles, by contrast, go fully round: every text button is a 40px-radius capsule (effectively `full` at button height) and every utility/carousel control is a perfect 50% circle. That tension between square surfaces and round controls is the signature On move. Depth is deliberately flat: the default elevation is *none*, and separation is achieved with whitespace and 1px hairlines rather than shadows. When a shadow does appear it is whisper-soft — a 2px / 4px card lift at level 1, opening to a 12px / 24px spread for the rare modal or popover at level 2.

## Layout & responsive

Spacing follows an 8px base (with a 4px substep) and scales to unusually generous page gutters around 64px, which is what gives the desktop layout its airy, gallery-like rhythm. The hero is a full-bleed split — two portrait images sharing the viewport edge-to-edge — over which white pill CTAs are placed directly on the photography. Product grids run four-up on desktop, collapse to two columns on tablet, and to one or two columns on mobile, with the 64px gutters tightening to roughly 22px so content can breathe on small screens. The header is a thin, sticky, mostly-white bar separated from content by the softest hairline. The overall responsive instinct is subtraction: as the viewport shrinks, On removes gutters and columns rather than rearranging components, so the brand's calm, monochrome character holds at every width.
