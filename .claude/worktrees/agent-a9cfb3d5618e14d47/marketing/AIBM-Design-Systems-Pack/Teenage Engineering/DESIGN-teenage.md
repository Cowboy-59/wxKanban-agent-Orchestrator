---
version: alpha
name: teenage engineering Analysis
description: >
  A laboratory-white off-white canvas (#f6f8f7) printed with ultra-thin,
  all-lowercase near-black type, ruled by crisp 1px dark hairlines and
  punctuated by a single signal blue (#0071bb) — flat, rectilinear, and
  almost completely shadowless, like a technical drawing that learned to scroll.

colors:
  primary: "#0071bb"          # signal blue — links, accents, active/selected states
  primary-active: "#005a96"   # darker blue for hover/pressed (inferred — site uses opacity fades)
  on-primary: "#ffffff"       # text/icon on a blue fill
  dark: "#0f0e12"             # inverted bands, dark UI, footer — also the canonical ink
  canvas: "#f6f8f7"           # page background — the signature soft off-white
  canvas-soft: "#f1f2f2"      # slightly cooler off-white section band
  surface: "#ffffff"          # white cards / panels / media tiles
  surface-alt: "#f5f5f5"      # sunken fills, chips, hovered cells
  ink: "#0f0e12"              # headings & body (considered near-black; pure #000000 also used for dense copy)
  ink-secondary: "#272727"    # strong dark grey — secondary text and the hairline color
  ink-muted: "#767676"        # tertiary labels / captions
  ink-faint: "#b2b2b2"        # placeholder / disabled / large-button fill
  hairline: "#272727"         # crisp 1px dark rule — the technical-drawing line
  hairline-soft: "#e5e5e5"    # light divider on the canvas
  on-dark: "#f5f5f5"          # text on dark bands

typography:
  display-1: { fontFamily: te-20, fontSize: 56px, fontWeight: 200, lineHeight: 1.05, letterSpacing: normal }
  display-2: { fontFamily: te-20, fontSize: 40px, fontWeight: 300, lineHeight: 1.1,  letterSpacing: normal }
  heading-1: { fontFamily: te-20, fontSize: 28px, fontWeight: 300, lineHeight: 1.2,  letterSpacing: normal }
  heading-2: { fontFamily: te-20, fontSize: 22px, fontWeight: 300, lineHeight: 1.3,  letterSpacing: normal }
  title:     { fontFamily: te-20, fontSize: 18px, fontWeight: 400, lineHeight: 1.4,  letterSpacing: normal }
  body-lg:   { fontFamily: te-20, fontSize: 20px, fontWeight: 300, lineHeight: 1.5,  letterSpacing: normal }
  body-md:   { fontFamily: te-20, fontSize: 16px, fontWeight: 300, lineHeight: 1.5,  letterSpacing: normal }
  body-sm:   { fontFamily: te-20, fontSize: 14px, fontWeight: 400, lineHeight: 1.5,  letterSpacing: normal }
  button:    { fontFamily: te-20, fontSize: 16px, fontWeight: 400, lineHeight: 1.1,  letterSpacing: normal }
  caption:   { fontFamily: te-20, fontSize: 13px, fontWeight: 400, lineHeight: 1.45, letterSpacing: normal }
  eyebrow:   { fontFamily: te-20, fontSize: 11px, fontWeight: 500, lineHeight: 1.3,  letterSpacing: 0.4px }

rounded:
  none: 0px       # the default — nav, cards, inputs, media tiles, dark bands are all hard-edged
  full: 9999px    # circular icon buttons and the occasional pill control

spacing:
  xxs: 4px
  xs: 8px
  sm: 16px
  md: 24px
  lg: 40px
  xl: 64px
  xxl: 96px

elevation:
  level-0: "none"   # the entire system is flat — no element on the page casts a shadow
  level-1: "none"   # "raised" state is expressed with a 1px hairline, not a shadow
  level-2: "none"   # modals/overlays sit on solid color blocks, still shadowless

components:
  nav-bar:          { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.body-lg}", rounded: "{rounded.none}", shadow: "{elevation.level-0}", note: "thin lowercase links, generous gaps, no underline until hover" }
  button-primary:   { background: "{colors.dark}", textColor: "{colors.on-dark}", typography: "{typography.button}", rounded: "{rounded.none}", padding: "14px 32px" }
  button-secondary: { background: "transparent", textColor: "{colors.ink}", border: "1px solid {colors.hairline}", typography: "{typography.button}", rounded: "{rounded.none}", padding: "13px 31px" }
  button-pill:      { background: "{colors.surface-alt}", textColor: "{colors.ink}", typography: "{typography.button}", rounded: "{rounded.full}", padding: "11px 20px", note: "icon/utility controls only" }
  card:             { backgroundColor: "{colors.surface}", rounded: "{rounded.none}", border: "1px solid {colors.hairline-soft}", shadow: "{elevation.level-0}", hoverShadow: "{elevation.level-0}" }
  text-input:       { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", border: "1px solid {colors.hairline}", rounded: "{rounded.none}", padding: "12px 16px", placeholder: "{colors.ink-faint}" }
  badge-pill:       { background: "{colors.dark}", textColor: "{colors.on-dark}", typography: "{typography.eyebrow}", rounded: "{rounded.full}", padding: "4px 12px" }
---

# teenage engineering — Design Language Analysis

teenage engineering's website looks the way their hardware looks: precise, reductive, and quietly confident. The design language is built from the smallest possible kit — one off-white background, one near-black ink, a short grey ramp, a single blue, and a thin dark rule — and then trusts whitespace and typography to do everything else. There is almost no decoration, no shadow, no gradient, and very little rounding. The result reads less like a marketing site and more like a well-printed instruction manual or a CAD layout, which is exactly the point.

## Colour

The palette is monochrome plus one. The page never sits on pure white; it rests on a soft, very slightly cool off-white (`#f6f8f7`) that shows up on roughly every major surface and is the single most defining color decision on the site. Type is a considered near-black (`#0f0e12`), with pure black (`#000000`) also appearing in dense copy — the two are close enough to read as one "ink." From there a tight grey ramp does the supporting work: `#272727` for strong secondary text and, crucially, for the 1px hairlines; `#767676` for muted labels; `#b2b2b2` for placeholders, disabled states, and the fill of large utility buttons; and `#e5e5e5` for the lightest dividers. Inverted moments (footer, dark bands) flip to `#0f0e12` with `#f5f5f5` text. The only saturated color anywhere is teenage engineering's signal blue (`#0071bb`), and it is rationed deliberately — links, the active/selected state, and small accents — never as a big fill. No gradients are used at all.

## Typography

Everything is set in **te-20**, teenage engineering's proprietary grotesque, almost always lowercase. Because te-20 is a licensed in-house face, this showcase substitutes the nearest free Google equivalent — **Work Sans** — chosen because it is one of the few neutral grotesques with a true Thin (100) and Light (300), which are the weights te-20 leans on hardest. Hierarchy here is built from *weight and size*, not from tracking or color: letter-spacing stays at normal throughout, and the dominant body text runs light (weight 300) at a comfortably large size. Display moments push the weight even thinner (100–200) at large sizes, which gives the airy, almost fragile headline look; small UI labels and fine print step down to 13–9px while staying light. There is no bold-for-emphasis culture on this site — emphasis comes from making something bigger or putting blue on it, not heavier.

## Shape & depth

Shape is essentially binary: **square or circle.** The overwhelming default radius is `0` — navigation, cards, media tiles, inputs, and dark bands all keep hard 90° corners, reinforcing the technical-drawing feel. The only exception is full rounding (`9999px`) on a handful of circular icon buttons and pill controls. There is no soft 8–16px "friendly card" radius in the system. Depth is equally austere: the site casts **no shadows at all.** What would be elevation on another site is handled here by a crisp 1px dark hairline (`#272727`) or by blocking an area in solid dark — separation by line and by color field, never by blur. This is the single biggest departure from mainstream web style and the clearest expression of the brand's restraint.

## Layout & responsive

The layout reads as a strict grid with very generous whitespace; spacing feels built on an 8px base scaled up into large, breathing steps (16 / 24 / 40 / 64 / 96). Type and layout are fluid — sizes are tied to viewport width rather than fixed breakpoints, so the page scales proportionally as the window changes rather than snapping between layouts (this is why the raw computed font sizes come back as fractional values like 23.25px). Multi-column product and content grids collapse predictably from four to two to one as width drops, the thin nav condenses to a menu control, and the hairline-and-whitespace structure holds at every size because it depends on rules and spacing rather than on shadow or chrome that would need to be re-tuned per breakpoint.
