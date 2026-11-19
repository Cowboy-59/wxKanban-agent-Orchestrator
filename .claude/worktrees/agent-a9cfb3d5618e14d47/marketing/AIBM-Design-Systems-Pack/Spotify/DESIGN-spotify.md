---
version: alpha
name: Spotify Analysis
description: >
  A confident dark-mode system where near-black #121212 canvases let one electric
  green (#1ED760) carry every call to action, white-and-grey geometric type builds
  the hierarchy, and the shape language splits cleanly between fully-round pill
  buttons and small 6px media tiles.

colors:
  primary: "#1ed760"           # Spotify green — CTAs, play buttons, active nav, progress fill, links
  primary-active: "#1db954"    # classic green — pressed state (hover instead brightens & scales 1.04)
  on-primary: "#000000"        # black text/icons sit on the green, never white
  accent-gradient-from: "#af2896"  # decorative brand gradient (magenta) — Liked Songs / mood tiles
  accent-gradient-to: "#509bf5"    # decorative brand gradient (blue)
  dark: "#000000"              # true-black chrome: global top bar & now-playing bar
  canvas: "#121212"            # base page background
  canvas-soft: "#000000"       # darkest band — header and player bar sit on pure black
  surface: "#1f1f1f"           # cards, search field, secondary buttons (one step above canvas)
  surface-alt: "#292929"       # hover fill / sunken chips / shimmer dividers (#2a2a2a)
  ink: "#ffffff"               # headings & primary text
  ink-secondary: "#b3b3b3"     # the signature Spotify grey — subtitles, metadata, inactive nav
  ink-muted: "#696969"         # tertiary labels
  ink-faint: "#535353"         # disabled / faint captions
  ink-placeholder: "#a7a7a7"   # input placeholder text
  hairline: "#7c7c7c"          # input outlines & inset focus rings
  hairline-soft: "#292929"     # subtle 1px dividers between shelves

typography:
  display-1: { fontFamily: "Spotify Mix / Spotify Circular (substitute: Montserrat)", fontSize: 56px, fontWeight: 700, lineHeight: 1.05, letterSpacing: -1.5px }   # representative of entity-page titles; the logged-out home tops out at 24px
  heading-1: { fontFamily: "Spotify Mix (substitute: Montserrat)", fontSize: 24px, fontWeight: 700, lineHeight: 1.15, letterSpacing: normal }   # section shelves — "Trending songs", "Popular artists"
  heading-2: { fontFamily: "Spotify Mix (substitute: Montserrat)", fontSize: 16px, fontWeight: 700, lineHeight: 1.25, letterSpacing: normal }   # card titles, "Your Library", footer column heads
  body-lg:   { fontFamily: "Spotify Mix (substitute: Montserrat)", fontSize: 16px, fontWeight: 400, lineHeight: 1.5 }    # base body — the dominant pairing on the page
  body-md:   { fontFamily: "Spotify Mix (substitute: Montserrat)", fontSize: 14px, fontWeight: 400, lineHeight: 1.5 }    # secondary rows, nav labels
  body-sm:   { fontFamily: "Spotify Mix (substitute: Montserrat)", fontSize: 13px, fontWeight: 400, lineHeight: 1.45 }   # dense metadata (13.33px)
  button:    { fontFamily: "Spotify Mix (substitute: Montserrat)", fontSize: 16px, fontWeight: 700, lineHeight: 1.0, letterSpacing: normal }   # pill labels (compact variant 14px/700)
  caption:   { fontFamily: "Spotify Mix (substitute: Montserrat)", fontSize: 12px, fontWeight: 400, lineHeight: 1.5 }    # footer / legal links
  eyebrow:   { fontFamily: "Spotify Mix (substitute: Montserrat)", fontSize: 11px, fontWeight: 600, lineHeight: 1.4, letterSpacing: 0.1em, textTransform: uppercase }

rounded:
  xs: 2px       # progress bars, explicit "E" tag, tiny chips
  sm: 4px       # login form inputs, small images
  md: 6px       # dominant radius — album / context tiles and images
  lg: 8px       # cards & larger media
  xl: 20px      # large containers
  xxl: 32px     # oversized panels / modals
  full: 9999px  # every button, the search field, avatars (also seen as 500px and 50%)

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
  level-1: "0 8px 8px 0 rgba(0,0,0,0.3)"
  level-2: "0 8px 24px 0 rgba(0,0,0,0.5)"

components:
  nav-bar:        { backgroundColor: "{colors.canvas-soft}", textColor: "{colors.ink-secondary}", activeText: "{colors.ink}", typography: "{typography.button}", padding: "8px 16px" }
  button-primary: { background: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.full}", padding: "8px 32px", hover: "brighten + scale 1.04" }
  button-white:   { background: "{colors.ink}", textColor: "{colors.dark}", typography: "{typography.button}", rounded: "{rounded.full}", padding: "8px 32px" }
  button-text:    { background: "transparent", textColor: "{colors.ink-secondary}", hoverText: "{colors.ink}", typography: "{typography.button}", padding: "8px 16px" }
  card:           { backgroundColor: "{colors.surface}", rounded: "{rounded.lg}", shadow: "{elevation.level-0}", hoverShadow: "{elevation.level-2}", padding: 16px }
  text-input:     { background: "{colors.surface}", textColor: "{colors.ink}", placeholder: "{colors.ink-placeholder}", rounded: "{rounded.full}", padding: "12px 48px" }   # search pill; login inputs use rounded.sm + 1px {colors.hairline} inset ring
  badge-pill:     { background: "{colors.surface-alt}", textColor: "{colors.ink-secondary}", rounded: "{rounded.xs}", padding: "2px 6px" }   # explicit "E" tag and small status chips
---

# Spotify — Design Language Analysis

Spotify's web player is a textbook dark-first product system: it is not a light theme dimmed down, but a palette built from black upward, where almost nothing competes with the album artwork and the single brand green. The interface gets out of the way — near-black surfaces, two greys of text, and one saturated accent — so that user content (cover art, gradients, photography) supplies all the colour. The personality lives in two places: the electric green that means "go," and the bold, round, geometric type that gives every shelf heading a confident, almost sporty weight.

## Colour

The system is anchored on a three-step dark ramp rather than a single background. Pure black `#000000` is reserved for the persistent chrome — the global top bar and the now-playing bar — which frames the experience. The main canvas is `#121212`, the warm-leaning near-black that reads as "the page." Elevated elements (cards, the search field, secondary buttons) step up to `#1f1f1f`, and hover/sunken states lift once more to `#292929`. Because the steps are small and dark, elevation is felt more through shadow than through colour.

Text is a disciplined two-tone hierarchy: white `#ffffff` for anything primary, and the unmistakable Spotify grey `#b3b3b3` for everything secondary — subtitles, metadata, inactive nav, artist names under a track. Two darker greys (`#696969`, `#535353`) handle tertiary and disabled states. This restraint is what makes the one accent so loud.

That accent is Spotify green `#1ed760`, applied with discipline to the things that matter: the play button, primary CTAs, the active-nav indicator, progress fill, and links. Critically, text and icons on the green are always black `#000000`, never white — a deliberate, recognisable choice that keeps the green reading as a bright surface rather than a coloured label. A slightly deeper classic green `#1db954` shows up on press; hover, by contrast, brightens the green and scales the control ~1.04. Beyond the green, Spotify keeps one decorative flourish: a magenta-to-blue brand gradient (`#af2896` → `#509bf5`) used on generative tiles such as Liked Songs and mood playlists. Borders are nearly invisible by design — section dividers sit at `#292929`, and the only prominent hairline is the `#7c7c7c` inset ring on focused form inputs.

## Typography

The family is Spotify's proprietary **Spotify Mix** (which falls back through the Circular superfamily — CircularSp-Arab/Hebr/Cyrl/etc.). Because Circular is licensed, this showcase substitutes **Montserrat**, the nearest widely-available geometric sans on Google Fonts; the round counters, even strokes, and tall, confident bold are a close stand-in. Hierarchy is built almost entirely through **size and weight, not tracking** — letter-spacing stays at normal across the board, and the system leans on a hard jump from regular `400` body to a heavy `700` for any heading.

On the logged-out home the live type ladder is compact: `24px/700` section shelves ("Trending songs"), `16px/700` titles ("Your Library", card names), `16px/400` as the dominant body pairing, then `14px` and `13.33px` regular for denser metadata, and `12px` for footer legal text. Buttons are set in bold `16px/700` (compact controls drop to `14px/700`). Note that the home view caps at 24px because it has no entity hero — on album, playlist, and artist pages the same family scales up dramatically into giant bold titles, which the `display-1` token (56px here) represents.

## Shape & depth

Spotify runs a deliberately bimodal shape language. Interactive controls are **fully round** — every button, the search field (`500px`), and all avatars (`50%`) are pills or circles, which gives the toolbar its friendly, tactile feel. Containers, by contrast, are **gently squared**: the dominant tile radius is just `6px`, with cards at `8px`, small images and login inputs at `4px`, and progress bars / the explicit tag at `2px`. Larger panels reach `20–32px`. The result is a distinctive contrast between soft round actions and crisp rectangular media.

Depth is shadow-driven, not border-driven. Two elevation levels do the work: a soft `0 8px 8px rgba(0,0,0,0.3)` and a deeper `0 8px 24px rgba(0,0,0,0.5)` that lifts cards and popovers off the dark canvas on hover. With surfaces this close in value, these heavy, low-opacity black shadows are what actually communicate that something is floating.

## Layout & responsive

Spacing is on an **8px base** with a 4px half-step, producing a 4 / 8 / 12 / 16 / 24 / 32 / 48 scale; control padding clusters at 8–12px and content gutters at 24–32px. The signature layout is the persistent app shell — a fixed left "Your Library" sidebar, fixed top bar, and fixed now-playing bar bracketing a single scrolling content column built from horizontal "shelves" (carousels) of media tiles in a responsive multi-column grid. As the viewport narrows, those tile grids reflow from many columns down to two, the left sidebar collapses, and the chrome bars persist while the inner column does the scrolling. Album/artwork tiles hold a 1:1 aspect ratio throughout.
