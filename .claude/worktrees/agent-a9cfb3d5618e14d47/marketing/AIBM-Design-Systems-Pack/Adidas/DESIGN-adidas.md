---
version: alpha
name: adidas Philippines Analysis
description: >
  A stark monochrome system where near-pure black ink does almost all the work
  on a white canvas — squared-off corners, flat surfaces, and AdihausDIN's
  technical sans hold the structure, while a single hot sale-red and a quiet
  membership green are the only colours allowed to break the black-and-white.

colors:
  primary: "#000000"            # CTAs, nav, brand marks — black is the action colour
  primary-active: "#1a1a1a"     # pressed/hover on black blocks
  on-primary: "#ffffff"         # text/icon on black
  dark: "#000000"               # inverted bands & primary buttons (same as primary)
  canvas: "#ffffff"             # page background
  canvas-soft: "#eceff1"        # cool grey section band
  surface: "#ffffff"            # product cards / panels
  surface-warm: "#f9f7f6"       # warm off-white editorial band
  surface-alt: "#e9ecef"        # input & chip fill (sunken)
  ink: "#000000"                # headings & body text
  ink-secondary: "#767677"      # muted labels, helper text
  ink-faint: "#808080"          # captions / disabled
  hairline: "#d3d7da"           # 1px borders & dividers
  hairline-soft: "#d9dbdd"      # faint chip / cell borders
  border-strong: "#929396"      # mid-grey outline on inactive chips
  # accents (the only saturated colours in the system)
  accent-sale: "#e32b2b"        # sale prices, urgency, error-state red
  accent-eco: "#408267"         # membership / sustainability green
  scrim: "rgba(0,0,0,0.5)"      # media & modal overlay

typography:
  display-1:  { fontFamily: AdihausDIN, fontSize: 38px, fontWeight: 700, lineHeight: 1.1,  letterSpacing: -0.5px }   # campaign / teaser headline, usually UPPERCASE
  heading-1:  { fontFamily: AdihausDIN, fontSize: 24px, fontWeight: 700, lineHeight: 1.17, letterSpacing: 2.5px }    # signature wide-tracked UPPERCASE section head
  heading-2:  { fontFamily: AdihausDIN, fontSize: 18px, fontWeight: 700, lineHeight: 1.33, letterSpacing: normal }
  title:      { fontFamily: AdihausDIN, fontSize: 16px, fontWeight: 700, lineHeight: 1.5,  letterSpacing: normal }   # card / module title
  body-lg:    { fontFamily: AdihausDIN, fontSize: 16px, fontWeight: 400, lineHeight: 1.375, letterSpacing: normal }  # dominant body tier
  body-md:    { fontFamily: AdihausDIN, fontSize: 14px, fontWeight: 400, lineHeight: 1.43, letterSpacing: normal }
  body-sm:    { fontFamily: AdihausDIN, fontSize: 12px, fontWeight: 400, lineHeight: 1.67, letterSpacing: normal }
  button:     { fontFamily: AdihausDIN, fontSize: 14px, fontWeight: 700, lineHeight: 1.4,  letterSpacing: normal }   # CTA label, often UPPERCASE with trailing arrow
  price:      { fontFamily: AdihausDIN, fontSize: 14px, fontWeight: 700, lineHeight: 1.43, letterSpacing: normal }   # red when on sale
  eyebrow:    { fontFamily: AdihausDIN, fontSize: 12px, fontWeight: 700, lineHeight: 1.67, letterSpacing: 0.6px }    # UPPERCASE kicker

rounded:
  none: 0px      # the default — hard, squared corners everywhere (buttons, cards, inputs, chips)
  sm: 5px        # rare; a handful of small controls
  full: 9999px   # circular: carousel dots, avatars, occasional pills

spacing:
  xxs: 4px       # chip inner rhythm (4px 8px)
  xs: 8px
  sm: 12px
  md: 16px       # nav item padding, base module gutter
  lg: 24px
  xl: 32px
  xxl: 48px

elevation:
  level-0: "none"                                  # default — hairline borders carry separation, not shadow
  level-1: "0 0 10px rgba(0,0,0,0.15)"             # soft glow on flyouts / search dropdown
  level-2: "0 4px 16px rgba(0,0,0,0.16)"           # mini-cart / modal (deeper, still restrained)

components:
  nav-bar:         { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.body-md}", textTransform: uppercase, itemPadding: "0 16px", height: "~121px (promo strip + main row)", position: sticky }
  button-primary:  { background: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.none}", padding: "12px 16px", note: "black block, white label, frequent trailing arrow" }
  button-secondary: { background: "{colors.canvas}", textColor: "{colors.ink}", border: "1px solid {colors.ink}", typography: "{typography.button}", rounded: "{rounded.none}", padding: "0 16px", note: "outline / 'view all' style" }
  chip-filter:     { background: "{colors.canvas}", textColor: "{colors.ink}", border: "1px solid {colors.border-strong}", activeBackground: "{colors.dark}", activeTextColor: "{colors.on-primary}", rounded: "{rounded.none}", padding: "4px 8px" }
  card-product:    { backgroundColor: "{colors.surface}", rounded: "{rounded.none}", shadow: "{elevation.level-0}", title: "{typography.title}", price: "{typography.price}", salePriceColor: "{colors.accent-sale}", note: "square image, flat at rest, hover reveals quick-add" }
  text-input:      { background: "{colors.surface-alt}", textColor: "{colors.ink}", placeholderColor: "{colors.ink-faint}", border: none, rounded: "{rounded.none}", padding: "0 10px", typography: "{typography.body-md}" }
  badge-flag:      { background: "{colors.dark}", altBackground: "{colors.accent-sale}", textColor: "{colors.on-primary}", typography: "{typography.eyebrow}", rounded: "{rounded.none}", padding: "4px 8px" }
---

# adidas Philippines — Design Language Analysis

The adidas storefront is a study in disciplined restraint: an overwhelmingly black-on-white system where colour is treated as a privilege, not a default. Of every text element sampled on the homepage, the vast majority render in pure black (`#000000`) on a white (`#ffffff`) ground; the only saturated colours that appear at all are a hot sale-red and a quiet membership green, and both are rationed. The personality is athletic, technical and confident — squared corners, flat surfaces, wide-tracked uppercase headlines, and the proprietary AdihausDIN type doing the heavy lifting. Nothing is decorative; every element looks engineered.

## Colour

The palette is built almost entirely from an ink-to-white axis. Black (`#000000`) is simultaneously the text colour, the primary action colour, the nav colour and the inverted-band colour — there is no separate "brand blue" or accent doing the work that black does. Greys form a tight functional ramp: `#767677` for secondary labels and helper text, `#808080` for the faintest captions. Surfaces stay close to white — a cool grey `#eceff1` for full-bleed section bands, a warm off-white `#f9f7f6` for editorial blocks, and a slightly sunken `#e9ecef` for input and chip fills. Borders are a hushed grey family (`#d3d7da` / `#d9dbdd`, with `#929396` for the outline on inactive filter chips). Against all that neutrality, exactly two colours are allowed to speak: the signature adidas sale-red `#e32b2b`, which appears almost exclusively on marked-down prices and urgency cues, and a membership/sustainability green `#408267` used on a few badges. No gradients were found anywhere — fills are solid, flat and absolute. Media and modals dim the page with a 50%-black scrim rather than a tint.

## Typography

The family is **AdihausDIN**, adidas's proprietary humanist-DIN sans (stack: `AdihausDIN, Helvetica, Arial, sans-serif`). Because it is licensed, the showcase substitutes **Barlow** from Google Fonts — a slightly condensed technical grotesque that carries the same engineered, DIN-adjacent character and heavy uppercase weights. Hierarchy is driven far more by **weight and tracking than by size**: body copy sits almost entirely at a single 16px/400 tier (by far the most common pairing on the page), with 14px/400 as the secondary tier and 12px for captions. Emphasis comes from jumping to 700 weight at the same size rather than scaling up. The signature move is the section headline: 24px, 700 weight, set UPPERCASE with an unusually wide **2.5px letter-spacing** — a hallmark adidas treatment that reads as stencilled and sporty. Larger campaign headlines reach ~38px/700 and tighten their tracking. Prices are 14px/700, flipping to red when discounted.

## Shape & depth

Shape is the brand's loudest non-verbal signal: **corners are square**. Buttons, product cards, search inputs, filter chips and badges all render at `border-radius: 0` — the only rounding in the system is the full `9999px`/`50%` used for genuinely circular things (carousel dots, avatars). A rare `5px` appears on a couple of minor controls and is the exception that proves the rule. Depth is treated with the same austerity. The site is essentially **flat**: separation is achieved with 1px hairlines (`#d3d7da`) and whitespace, not shadow. Only a single soft glow (`0 0 10px` grey) was detected, reserved for transient overlays like the search dropdown; modals get a slightly deeper but still understated shadow. Hover states lean on image zoom and quick-add reveals rather than lift.

## Layout & responsive

Spacing follows a 4px base unit, with 16px as the workhorse rhythm — nav items pad to `0 16px`, filter chips to `4px 8px`, modules gutter on multiples of 8 and 16. The desktop frame is wide and edge-to-edge, with a tall (~121px) two-row header stacking a thin promotional strip above the main utility + category nav. Content is organised into full-bleed media teasers and 3–4-up product grids. On tablet the product grid steps from four columns to two and the category nav collapses behind a hamburger; on mobile it drops to a single dominant column with the same square cards, the promo strip and search persist, and the wide-tracked uppercase headers shrink in size but keep their tracking and weight. Throughout, the squared corners and black-and-white discipline hold at every breakpoint — the system is remarkably consistent across viewports.
