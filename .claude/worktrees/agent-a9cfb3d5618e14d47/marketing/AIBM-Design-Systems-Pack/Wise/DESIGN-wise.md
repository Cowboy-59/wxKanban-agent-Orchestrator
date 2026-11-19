---
version: alpha
name: Wise Analysis
description: >
  A confident fintech system painted in Forest Green ink on white, punctuated by
  a single electric Bright Green that owns every call to action, with chunky
  pill-and-32px rounding, an aqua secondary accent, and tight-tracked humanist
  headings that make money feel calm and borderless.

colors:
  primary: "#9fe870"            # Bright Green — CTAs, highlights, brand mark
  primary-active: "#8cdb6a"     # pressed/hover bright green (reconstructed)
  on-primary: "#163300"         # Forest Green text sits ON the bright-green button
  dark: "#163300"               # Forest Green — dark bands, footer, dark buttons
  dark-deep: "#223d0d"          # deeper green for nested dark surfaces / hover
  canvas: "#ffffff"             # page background
  canvas-soft: "#f5f5f5"        # off-white section background
  surface: "#ffffff"            # card/panel surface
  surface-alt: "#e2f6d5"        # pale-green highlight chip / soft fill
  ink: "#0e0f0c"                # near-black body text
  ink-brand: "#163300"          # Forest Green — headings & brand voice
  ink-secondary: "#454b40"      # muted green-grey (reconstructed)
  ink-muted: "#6f7b66"          # tertiary / supporting (reconstructed)
  ink-faint: "#97a08f"          # captions / placeholder (reconstructed)
  hairline: "#e0e4dc"           # 1px borders & dividers (reconstructed from faint overlay)
  accent-aqua: "#a0e1e1"        # decorative secondary accent (illustration, tags)
  success: "#2ead4b"            # status — positive (Wise legacy token family)
  warning: "#df8700"            # status — warning
  error: "#e74848"              # status — negative

typography:
  display-1: { fontFamily: "Wise Sans (subst. Inter)", fontSize: 64px, fontWeight: 700, lineHeight: 1.05, letterSpacing: -1.4px }
  display-2: { fontFamily: "Wise Sans (subst. Inter)", fontSize: 48px, fontWeight: 700, lineHeight: 1.08, letterSpacing: -1px }
  heading-1: { fontFamily: "Wise Sans (subst. Inter)", fontSize: 36px, fontWeight: 700, lineHeight: 1.1, letterSpacing: -0.8px }
  heading-2: { fontFamily: "Wise Sans (subst. Inter)", fontSize: 28px, fontWeight: 600, lineHeight: 1.0, letterSpacing: -0.56px }
  heading-3: { fontFamily: "Wise Sans (subst. Inter)", fontSize: 22px, fontWeight: 600, lineHeight: 1.18, letterSpacing: -0.44px }
  title:     { fontFamily: "Wise Sans (subst. Inter)", fontSize: 18px, fontWeight: 700, lineHeight: 1.36, letterSpacing: -0.54px }
  body-lg:   { fontFamily: "Wise Sans (subst. Inter)", fontSize: 18px, fontWeight: 400, lineHeight: 1.5, letterSpacing: -0.18px }
  body-md:   { fontFamily: "Wise Sans (subst. Inter)", fontSize: 16px, fontWeight: 400, lineHeight: 1.5, letterSpacing: normal }
  body-sm:   { fontFamily: "Wise Sans (subst. Inter)", fontSize: 14px, fontWeight: 400, lineHeight: 1.43, letterSpacing: normal }
  button:    { fontFamily: "Wise Sans (subst. Inter)", fontSize: 16px, fontWeight: 600, lineHeight: 1.5, letterSpacing: -0.18px }
  caption:   { fontFamily: "Wise Sans (subst. Inter)", fontSize: 12px, fontWeight: 400, lineHeight: 1.4, letterSpacing: normal }
  eyebrow:   { fontFamily: "Wise Sans (subst. Inter)", fontSize: 12px, fontWeight: 600, lineHeight: 1.2, letterSpacing: 0.2px }

rounded:
  xs: 8px
  sm: 12px
  md: 16px
  lg: 20px
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
  level-0: "none"
  level-1: "0 1px 2px rgba(14,15,12,0.06), 0 8px 24px rgba(14,15,12,0.06)"
  level-2: "0 20px 40px rgba(14,15,12,0.12)"

components:
  nav-bar:          { backgroundColor: "{colors.canvas}", textColor: "{colors.ink-brand}", typography: "{typography.body-md}", padding: 16px 24px }
  button-primary:   { background: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.full}", padding: 14px 26px }
  button-dark:      { background: "{colors.dark}", textColor: "#ffffff", typography: "{typography.button}", rounded: "{rounded.full}", padding: 14px 26px }
  button-secondary: { background: "{colors.canvas}", textColor: "{colors.ink-brand}", border: "1px solid {colors.ink-brand}", rounded: "{rounded.full}", padding: 13px 25px }
  card:             { backgroundColor: "{colors.surface}", rounded: "{rounded.xxl}", shadow: "{elevation.level-0}", hoverShadow: "{elevation.level-1}", border: "1px solid {colors.hairline}" }
  card-dark:        { backgroundColor: "{colors.dark}", textColor: "#ffffff", rounded: "{rounded.xxl}", padding: 32px }
  text-input:       { background: "{colors.canvas}", border: "1px solid {colors.hairline}", rounded: "{rounded.md}", textColor: "{colors.ink}", padding: 14px 16px }
  badge-pill:       { background: "{colors.surface-alt}", textColor: "{colors.ink-brand}", rounded: "{rounded.full}", typography: "{typography.caption}", padding: 5px 12px }
---

# Wise — Design Language Analysis

Wise's system is built to make moving money across borders feel calm, modern, and trustworthy. It does almost everything with a near-monochrome green palette: a deep **Forest Green** for ink and dark bands, a single electric **Bright Green** reserved for action, and a lot of generous white space. The shapes are soft and confident — chunky rounded cards and fully-pill buttons — and the type is a humanist sans set with tight negative tracking so headlines read tight and self-assured. It is restrained but never sterile; a pale-green tint and an aqua accent keep it warm.

> **Provenance note.** wise.com is a regulated financial domain and is blocked by the browser-automation safety layer, so it could not be opened for a direct computed-style read. The brand tokens below were harvested from **live computed styles on Wise's own design property, wise.design** (the Forest Green `#163300`, Bright Green `#9fe870`, deep green `#223d0d`, pale green `#e2f6d5`, aqua `#a0e1e1`, the near-black `#0e0f0c`, the 32px / pill radii, and the Inter-family type with tight negative tracking are all observed values), cross-referenced against the rendered structure of the wise.com homepage. The neutral grey ramp (`ink-secondary`/`ink-muted`/`ink-faint`), `hairline`, and `primary-active` are reconstructed to fit the observed system and are marked as such in the frontmatter. Wise's marketing font is the proprietary **Wise Sans**; per configuration it is substituted with **Inter**, which is also the typeface Wise's design site itself ships.

## Colour

The palette is deliberately tight and almost entirely green. **Forest Green `#163300`** does double duty as the primary heading ink *and* the dark brand surface — it was the dominant non-white text colour in the live capture, and it backs the dark hero, feature bands, and footer. Body copy drops to a neutral near-black **`#0e0f0c`**. The one saturated colour is **Bright Green `#9fe870`**, and Wise is disciplined about it: it appears almost exclusively on primary buttons, key highlights, and the brand mark, with Forest Green — not white — as the text colour sitting on top of it, a signature inversion that makes the CTA unmistakable. Surfaces stay quiet: white cards on white or a `#f5f5f5` off-white, with a **pale-green `#e2f6d5`** tint for highlighted chips and soft fills. An **aqua `#a0e1e1`** is the only true secondary accent, used decoratively in illustration and tags rather than for UI state. Hairlines are barely-there warm greys. Status colours (positive/warning/negative) come from Wise's long-standing semantic family.

## Typography

Wise sets everything in a single humanist grotesque — the proprietary **Wise Sans**, here substituted by **Inter** (the closest widely-available match and the exact face wise.design renders). Hierarchy is built from weight and *tracking* far more than from colour: headings run **600–700** with progressively tighter negative letter-spacing (observed at roughly −2% to −3% of the font size — e.g. 28px paired with −0.56px, 18px with −0.54px), which gives large type a tight, premium set. Body text is a relaxed **16px / 400** at a 1.5 line-height, the dominant tier across the site. The result is a clear two-register voice: confident, tight-tracked display lines over calm, readable body copy.

## Shape & depth

Roundness is a core brand signal. Cards and feature panels use a large **32px** radius (`rounded.xxl`), while buttons and tags go fully round as **pills** (`rounded.full`) — observed together as the two dominant radii. Smaller controls and inputs step down through a 16px / 12px / 8px scale. Depth is handled with great restraint: most surfaces sit flat, separated by a 1px hairline rather than a shadow (`level-0`). When elevation is needed — a hovered card, a floating menu — it is a soft, low-contrast diffusion (`level-1`), reserving a deeper shadow (`level-2`) for true overlays and modals. The overall feel is tactile and friendly, never heavy.

## Layout & responsive

The system reads as an **8px-based** spacing scale (4 / 8 / 12 / 16 / 24 / 32 / 48), with content held in a wide centred column and generous vertical rhythm between full-bleed sections that alternate white and Forest-Green bands. Feature content is laid out on multi-column grids — typically three or four cards — that collapse to two columns on tablet and a single stacked column on mobile, where the pill buttons stretch toward full width and display type steps down from the 48–64px register into the 32–36px range. The design leans on whitespace and the green/white band rhythm to structure the page rather than on borders or boxes.
