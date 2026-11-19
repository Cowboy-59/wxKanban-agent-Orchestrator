---
version: alpha
name: Tesla Analysis
description: >
  A near-monochrome, photography-first system painted on pure white, where almost
  every word is set in two weights of a custom grotesque, corners barely round at
  4px, and a single electric blue (#3e6ae1) carries every "Order Now" against an
  otherwise near-black (#171a20) and graphite-gray world.

colors:
  primary: "#3e6ae1"          # Tesla blue — primary CTAs ("Order Now"), links, active accents
  primary-active: "#3457b1"   # darkened hover/pressed (derived; site samples only captured rest state)
  on-primary: "#ffffff"       # text/icon on blue
  primary-gradient-from: "#171a20"  # accent divider gradient start
  primary-gradient-via: "#3e6ae1"   # accent divider gradient midpoint (blue)
  primary-gradient-to: "#171a20"    # accent divider gradient end
  dark: "#171a20"             # near-black — dark buttons, wordmark, active segmented pills, inverted bands
  on-dark: "#eeeeee"          # light text on the near-black (also pure #ffffff)
  canvas: "#ffffff"           # page background
  canvas-soft: "#f4f4f4"      # off-white section / cookie-banner background
  surface: "#ffffff"          # card / modal surface
  surface-alt: "#e2e3e3"      # chip / sunken fill (also used translucent as rgba(0,0,0,0.05))
  ink: "#171a20"              # headings, nav, emphasis — the signature Tesla black
  ink-secondary: "#393c41"    # body copy workhorse (most frequent text color on the page)
  ink-muted: "#5c5e62"        # meta, secondary labels
  ink-faint: "#8e8e8e"        # captions / placeholder
  hairline: "#d0d1d2"         # 1px borders, dividers, input outlines
  hairline-soft: "#eeeeee"    # faint internal dividers

typography:
  display-1: { fontFamily: Inter, fontSize: 48px, fontWeight: 500, lineHeight: 1.1,  letterSpacing: normal }
  heading-1: { fontFamily: Inter, fontSize: 40px, fontWeight: 500, lineHeight: 1.2,  letterSpacing: normal }
  heading-2: { fontFamily: Inter, fontSize: 34px, fontWeight: 500, lineHeight: 1.2,  letterSpacing: normal }
  heading-3: { fontFamily: Inter, fontSize: 28px, fontWeight: 500, lineHeight: 1.2,  letterSpacing: normal }
  title:     { fontFamily: Inter, fontSize: 20px, fontWeight: 500, lineHeight: 1.2,  letterSpacing: normal }
  title-sm:  { fontFamily: Inter, fontSize: 17px, fontWeight: 500, lineHeight: 1.18, letterSpacing: normal }
  body-lg:   { fontFamily: Inter, fontSize: 20px, fontWeight: 400, lineHeight: 1.4,  letterSpacing: normal }
  body-md:   { fontFamily: Inter, fontSize: 16px, fontWeight: 400, lineHeight: 1.5,  letterSpacing: normal }
  body-sm:   { fontFamily: Inter, fontSize: 14px, fontWeight: 400, lineHeight: 1.43, letterSpacing: normal }  # dominant body tier
  button:    { fontFamily: Inter, fontSize: 14px, fontWeight: 500, lineHeight: 1.2,  letterSpacing: normal }
  caption:   { fontFamily: Inter, fontSize: 13px, fontWeight: 500, lineHeight: 1.4,  letterSpacing: normal }
  eyebrow:   { fontFamily: Inter, fontSize: 12px, fontWeight: 500, lineHeight: 1.4,  letterSpacing: normal }

rounded:
  xs: 4px        # the signature radius — buttons, inputs, chips, nearly everything
  sm: 8px        # cards, modals, larger containers
  md: 12px
  lg: 16px
  xl: 20px
  xxl: 32px
  full: 9999px

spacing:
  xxs: 4px       # base unit
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px

elevation:
  level-0: "none"                                  # flat default — most of the page
  level-1: "0 4px 4px rgba(0,0,0,0.25)"            # dropdowns / hovered tiles
  level-2: "0 8px 16px rgba(0,0,0,0.16)"           # location modal, menus, popovers

components:
  nav-bar:          { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.button}", padding: "4px 16px", note: "transparent over hero photography, white when scrolled" }
  button-primary:   { background: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.xs}", padding: "12px 24px", minWidth: "230px", note: "full-width on mobile" }
  button-dark:      { background: "{colors.dark}", textColor: "{colors.on-dark}", typography: "{typography.button}", rounded: "{rounded.xs}", padding: "12px 24px", minWidth: "230px" }
  button-secondary: { background: "rgba(0,0,0,0.05)", textColor: "{colors.ink}", typography: "{typography.button}", rounded: "{rounded.xs}", padding: "12px 24px", note: "translucent overlay button on photos ('Learn More')" }
  card:             { backgroundColor: "{colors.surface}", rounded: "{rounded.sm}", shadow: "{elevation.level-0}", hoverShadow: "{elevation.level-1}", border: "1px solid {colors.hairline}" }
  modal:            { backgroundColor: "{colors.surface}", rounded: "{rounded.sm}", shadow: "{elevation.level-2}" }
  text-input:       { background: "{colors.canvas}", textColor: "{colors.ink}", placeholder: "{colors.ink-faint}", rounded: "{rounded.xs}", border: "1px solid {colors.hairline}", typography: "{typography.body-sm}" }
  segmented-pill:   { activeBackground: "{colors.dark}", activeText: "{colors.on-dark}", inactiveBackground: "{colors.surface}", inactiveText: "{colors.ink}", rounded: "{rounded.xs}", typography: "{typography.button}", note: "region/location selector" }
---

# Tesla — Design Language Analysis

Tesla's site is an exercise in subtraction. The design system gets out of the way of full-bleed product photography and video: a pure-white stage, near-black type, two type weights, almost no rounding, and exactly one accent color reserved for the single action that matters — ordering a car. Where most brands signal premium with ornament, Tesla signals it with restraint. There is no gradient mesh, no drop-shadow theatrics, no decorative color. The interface is engineered, not dressed.

## Colour

The palette is deliberately tiny and almost entirely achromatic. The page background is pure white (`#ffffff`), with `#f4f4f4` used for the occasional soft-gray band (the cookie banner, alternating sections). Text rides a four-step graphite ramp: the signature near-black `#171a20` carries headings, the wordmark, navigation, and any emphasis; the real body workhorse is the slightly softer `#393c41` (by far the most-painted text color on the page); `#5c5e62` handles meta and secondary labels; and `#8e8e8e` fades to captions and placeholders. Borders and dividers are a single hairline gray, `#d0d1d2`.

Against all of that neutrality, one color does all the persuading: Tesla blue, `#3e6ae1`. It appears almost nowhere except where it counts — the solid "Order Now" button and inline links — which is exactly why it reads as "act now." Near-black `#171a20` does double duty as a second button color (for "Schedule Demo," "View Network," and the active pill in the region selector), giving the system a primary/secondary CTA pair of blue-vs-black rather than blue-vs-gray. The one flourish in the whole system is a thin `linear-gradient(to right, #171a20, #3e6ae1, #171a20)` accent rule — black, bleeding through blue, back to black.

## Typography

Everything is set in **Universal Sans Text**, Tesla's proprietary grotesque (rendered here in **Inter**, the nearest Google substitute — a clean neo-grotesque with a comparable x-height and neutral character). The defining move is weight discipline: the entire site uses only **Regular (400)** and **Medium (500)**. There is no bold. Hierarchy is built almost entirely from *size*, not weight or tracking — letter-spacing is left at `normal` everywhere. Headlines step down 48 → 40 → 34 → 28 → 20 → 17px, all at the same 500 weight, so a big "Model Y" and a small section title feel like the same voice at different volumes. Body copy is overwhelmingly 14px/400 at a 1.43 line-height (the dominant pairing on the page by a wide margin), with 20px/400 and 16px/400 reserved for ledes. Buttons and nav are 14px/500 — that single weight bump is the only thing separating an action from a sentence.

## Shape & depth

Tesla rounds almost nothing. The signature radius is a barely-there **4px**, applied with near-total consistency to buttons, inputs, chips, and the segmented region selector; **8px** appears on larger containers like cards and the location modal. Anything beyond that is essentially unused. Depth is just as restrained: the default elevation is flat — most of the page is held together by whitespace and the occasional 1px hairline, not shadow. Shadows are rationed to floating UI only: a `0 4px 4px rgba(0,0,0,0.25)` lift on dropdowns and hovered tiles, and a softer, wider `0 8px 16px rgba(0,0,0,0.16)` on the location modal and menus. The effect is a UI that looks pressed flat into the page until something genuinely needs to float above it.

## Layout & responsive

The spacing system is built on a **4px base unit**, scaling 4 / 8 / 12 / 16 / 24 / 32 / 48, which matches the 4px corner radius and the tight button padding. Structurally the homepage is a vertical stack of full-viewport panels, each a single edge-to-edge photo or video with centered or bottom-anchored copy and a primary/secondary button pair — content is overlaid on imagery rather than boxed beside it. The top navigation floats transparent over the hero and turns solid white on scroll. On mobile the panels keep their full-bleed media, the floating buttons stretch to full width and stack vertically, and the horizontal nav collapses into a hamburger menu — but the core rules never change: white space, near-black type in two weights, 4px corners, and blue saved for the order.
