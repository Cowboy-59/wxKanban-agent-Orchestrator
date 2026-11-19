---
version: alpha
name: Pinterest Analysis
description: >
  A warm, near-monochrome canvas where almost everything is plum-black ink on
  white, deliberately quiet so one saturated Pinterest red owns every call to
  action — softened everywhere by generous 16px corners, pill buttons, and the
  rounded humanist warmth of the proprietary Pin Sans face.

# Source: https://www.pinterest.com/login/ (app shell; the logged-out root SPA
# does not hydrate under automation). Values are read from getComputedStyle on
# the live, rendered DOM.

colors:
  primary: "#e60023"          # Pinterest red — CTAs, brand mark, active states
  primary-active: "#ad081b"   # darker red — hover / pressed
  on-primary: "#ffffff"       # white text/icons on red
  accent-link: "#2b48d4"      # royal-blue — inline text links only
  dark: "#211922"             # warm plum near-black — inverted bands, default ink
  canvas: "#ffffff"           # page background
  canvas-soft: "#f7f7f5"      # faint warm off-white section background
  surface: "#ffffff"          # card / modal surface
  surface-alt: "#e9e9e9"      # secondary-button & chip fill; image-placeholder tint (≈ rgba(0,0,0,.04))
  ink: "#211922"              # headings & body — warm near-black (not pure black)
  ink-secondary: "#62625b"    # warm grey — secondary / supporting text
  ink-faint: "#767676"        # placeholder text, fine print, captions
  hairline: "#cdcdcd"         # 1px dividers & card borders
  hairline-strong: "#919191"  # input / form-field outline (a deliberately visible mid-grey)
  # No gradients in the system — every fill is a flat colour.

typography:
  display-1: { fontFamily: "Pin Sans → Mulish", fontSize: 44px, fontWeight: 800, lineHeight: 1.05, letterSpacing: -1.5px }   # marketing hero tier
  heading-1: { fontFamily: "Pin Sans → Mulish", fontSize: 32px, fontWeight: 600, lineHeight: 1.1,  letterSpacing: -1.2px }   # measured: "Log in to see more"
  heading-2: { fontFamily: "Pin Sans → Mulish", fontSize: 24px, fontWeight: 600, lineHeight: 1.15, letterSpacing: -0.6px }
  heading-3: { fontFamily: "Pin Sans → Mulish", fontSize: 20px, fontWeight: 600, lineHeight: 1.2,  letterSpacing: -0.3px }
  title:     { fontFamily: "Pin Sans → Mulish", fontSize: 16px, fontWeight: 600, lineHeight: 1.3,  letterSpacing: normal }
  body-lg:   { fontFamily: "Pin Sans → Mulish", fontSize: 16px, fontWeight: 400, lineHeight: 1.4,  letterSpacing: normal }   # measured 22.4/16
  body-md:   { fontFamily: "Pin Sans → Mulish", fontSize: 14px, fontWeight: 400, lineHeight: 1.4,  letterSpacing: normal }   # measured 19.6/14
  body-sm:   { fontFamily: "Pin Sans → Mulish", fontSize: 12px, fontWeight: 400, lineHeight: 1.5,  letterSpacing: normal }   # measured 18/12 — the dominant UI tier
  button:    { fontFamily: "Pin Sans → Mulish", fontSize: 16px, fontWeight: 600, lineHeight: 1.0,  letterSpacing: normal }
  eyebrow:   { fontFamily: "Pin Sans → Mulish", fontSize: 11px, fontWeight: 600, lineHeight: 1.0,  letterSpacing: 0.4px, textTransform: uppercase }

rounded:
  xs: 4px
  sm: 8px
  md: 12px      # small buttons, chips
  lg: 16px      # THE signature radius — inputs, pin image cards, secondary buttons
  xl: 20px      # modal / large card (measured on the login sheet)
  full: 9999px  # pill buttons, avatars, badges, pager dots

spacing:
  xxs: 4px      # base unit is 4
  xs: 8px
  sm: 12px
  md: 16px      # masonry gutter, standard padding
  lg: 24px
  xl: 32px
  xxl: 48px

elevation:
  level-0: "none"                                  # default — cards rest flat, shape carries them
  level-1: "0 2px 8px rgba(0,0,0,0.12)"            # pin / card hover lift
  level-2: "0 3px 12px rgba(0,0,0,0.20)"           # measured — floating modal / dialog

components:
  nav-bar:          { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.body-md}", height: 80px, padding: 16px }
  button-primary:   { background: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.lg}", padding: 14px 24px, hover: "{colors.primary-active}" }
  button-secondary: { background: "{colors.surface-alt}", textColor: "{colors.ink}", typography: "{typography.button}", rounded: "{rounded.lg}", padding: 14px 24px }
  button-pill:      { background: "{colors.surface-alt}", textColor: "{colors.ink}", rounded: "{rounded.full}", padding: 11px 18px }
  card-pin:         { backgroundColor: "{colors.surface-alt}", rounded: "{rounded.lg}", shadow: "{elevation.level-0}", hoverShadow: "{elevation.level-1}" }
  modal:            { backgroundColor: "{colors.surface}", rounded: "{rounded.xl}", shadow: "{elevation.level-2}", maxWidth: 484px }
  text-input:       { background: "{colors.canvas}", border: "1px solid {colors.hairline-strong}", rounded: "{rounded.lg}", padding: 11px 15px, typography: "{typography.body-lg}", placeholder: "{colors.ink-faint}" }
  link-inline:      { textColor: "{colors.accent-link}", typography: "{typography.body-md}", fontWeight: 500 }
  badge-pill:       { background: "{colors.canvas}", textColor: "{colors.ink}", rounded: "{rounded.full}", shadow: "0 1px 2px rgba(0,0,0,0.1)", padding: 5px 10px }
---

# Pinterest — Design Language Analysis

Pinterest's interface is built to disappear. The whole chrome is engineered to recede so that user content — the images in the masonry grid — carries all the colour and energy. The result is a system that reads as near-monochrome: warm plum-black ink on white, with grey for everything secondary, and exactly one loud accent (the brand red) reserved almost entirely for the primary action. The softness that keeps it from feeling austere comes from shape, not colour: a single generous corner radius repeated everywhere, pill-shaped buttons, and the rounded humanist warmth of Pin Sans.

## Colour

The palette is disciplined to the point of being almost two colours. The dominant ink is `#211922` — not pure black but a warm, very dark plum that appeared on roughly 387 of the sampled elements; choosing this over `#000000` is what gives Pinterest text its soft, slightly warm feel. Supporting greys step down through `#62625b` (secondary text) to `#767676` (placeholders and fine print), all carrying the same faint warmth. Surfaces are plain white (`#ffffff`); the only recurring non-white fill is a 4%-black tint (≈ `#e9e9e9`) used for secondary buttons, chips, and image-loading placeholders.

Against that quiet field, one saturated colour does all the talking: Pinterest red, `#e60023`, on the primary "Log in" button and the logo mark, pressing to `#ad081b` on hover. It is the system's only high-chroma fill and it is rationed — you will rarely see it twice in the same viewport. The one other accent is a royal blue, `#2b48d4`, used strictly for inline text links ("Forgot your password?", "Get started here"), never for buttons. There are no gradients anywhere; every fill is flat.

## Typography

The brand face is **Pin Sans**, Pinterest's proprietary humanist sans — friendly, geometric, with a tall x-height and softly rounded terminals. Because it is licensed, this showcase substitutes **Mulish** from Google Fonts, the nearest open match for its warm geometric tone. Hierarchy is built primarily through size and weight rather than colour: display and heading tiers run at weight 600–800 with tight negative tracking (the measured "Log in to see more" headline is 32px / 600 with `-1.2px` letter-spacing), while body copy sits at a relaxed 400 weight with a comfortable 1.4 line-height. The workhorse tier is small — 12px is by far the most common size on screen — reflecting a dense, utility-forward UI where the imagery, not the type, is the spectacle. Buttons use a semibold 16px label.

## Shape & depth

Shape is the brand's signature move. A 16px radius is repeated relentlessly — on inputs, on every pin image card, on secondary buttons — and was the single most frequent radius in the sample by a wide margin. Larger surfaces step up to 20px (the login modal), and the most characteristic control of all, the button, is a full pill (`9999px`). Corners are never sharp. Depth, by contrast, is almost absent: cards rest completely flat at level-0 and rely on their radius and the surrounding white space to read as objects. Elevation is spent sparingly — a soft `0 2px 8px rgba(0,0,0,.12)` lift appears on pin hover, and a deeper `0 3px 12px rgba(0,0,0,.20)` (measured) floats the login modal above the dimmed grid behind it.

## Layout & responsive

The defining layout is the masonry grid — variable-height pin cards packed into responsive columns with a ~16px gutter, on a 4px spacing base that resolves to a clean 8 / 16 / 24 / 32 rhythm. Column count is fluid: it collapses to two columns on phones and expands to six or more on wide desktops, letting content density scale with the viewport rather than reflowing fixed breakpoints. Overlay surfaces adapt too — the centred login sheet (max-width ~484px, 20px corners, level-2 shadow) sits over a dimmed, still-visible grid on desktop and goes effectively full-bleed on mobile, where the persistent top navigation also gives way to a bottom tab bar. Throughout, the design leans on white space and corner radius instead of borders and shadows to separate regions.
