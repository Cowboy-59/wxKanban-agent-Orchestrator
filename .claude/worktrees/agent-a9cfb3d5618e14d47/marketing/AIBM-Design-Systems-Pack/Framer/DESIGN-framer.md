---
version: alpha
name: Framer Analysis
description: >
  A confident, near-black dark interface where pure white type set in a geometric
  display face (GT Walsheim) sits on a true #000 canvas, lifted by layered
  charcoal surfaces, hairline-thin white dividers, and a single electric
  #0099ff brand blue that appears as accent fills, selection states, and a
  signature soft blue glow.

colors:
  primary: "#0099ff"          # brand blue — accent fills, links, selection, logo, glow
  primary-active: "#0066ff"   # deeper blue for pressed/alt CTA fills
  on-primary: "#ffffff"       # text/icons on blue
  # signature blue glow used in place of heavy shadow: 0 5px 20px rgba(0,153,255,0.20)
  light-cta: "#ffffff"        # the homepage hero CTA is a WHITE pill with near-black text
  on-light-cta: "#0a0a0a"
  canvas: "#000000"           # page background (true black)
  canvas-soft: "#111111"      # off-tint band / table header
  surface: "#1e1e1e"          # card / panel surface
  surface-alt: "#242424"      # chip / sunken / elevated fill
  surface-raised: "#303030"   # hover / higher elevation fill
  ink: "#ffffff"              # headings & primary body text
  ink-secondary: "#999999"    # secondary text  (≈ rgba(255,255,255,0.6))
  ink-muted: "#666666"        # muted text      (≈ rgba(255,255,255,0.4))
  ink-faint: "#cccccc"        # light captions on dark, when higher contrast needed
  hairline: "rgba(255,255,255,0.12)"      # 1px borders & dividers
  hairline-soft: "rgba(255,255,255,0.06)" # faintest separators
  # semantic / decorative accents
  success: "#00bb88"          # "Live" / GOOD status pills (with 0.1 alpha fill)
  accent-terracotta: "#d67a5c" # decorative editorial accent
  accent-purple: "#8856ff"     # decorative accent

typography:
  # Display & headings — GT Walsheim Medium (proprietary). Showcase substitute: Hanken Grotesk.
  display-1: { fontFamily: "GT Walsheim Medium", fontSize: 54px, fontWeight: 500, lineHeight: 1.0,  letterSpacing: -2.16px }
  display-2: { fontFamily: "GT Walsheim Medium", fontSize: 44px, fontWeight: 500, lineHeight: 1.1,  letterSpacing: -1.76px }
  title:     { fontFamily: "Inter",              fontSize: 20px, fontWeight: 600, lineHeight: 1.3,  letterSpacing: -0.4px }
  subtitle:  { fontFamily: "Inter",              fontSize: 18px, fontWeight: 400, lineHeight: 1.3,  letterSpacing: -0.01px }
  body-md:   { fontFamily: "Inter",              fontSize: 15px, fontWeight: 400, lineHeight: 1.5,  letterSpacing: normal }
  body-sm:   { fontFamily: "Inter",              fontSize: 14px, fontWeight: 400, lineHeight: 1.45, letterSpacing: normal }
  button:    { fontFamily: "Inter",              fontSize: 16px, fontWeight: 500, lineHeight: 1.2,  letterSpacing: -0.2px }
  caption:   { fontFamily: "Inter",              fontSize: 13px, fontWeight: 500, lineHeight: 1.3,  letterSpacing: normal }
  eyebrow:   { fontFamily: "Inter",              fontSize: 12px, fontWeight: 600, lineHeight: 1.2,  letterSpacing: 0.4px, textTransform: uppercase }
  mono:      { fontFamily: "Input Mono / JetBrains Mono", fontSize: 13px, fontWeight: 400, lineHeight: 1.5, letterSpacing: normal }

rounded:
  xs: 4px
  sm: 8px        # the workhorse radius — buttons, inputs, small cards (most frequent by far)
  md: 15px       # larger cards & media tiles
  lg: 20px       # feature panels
  xl: 25px       # oversized panels
  full: 9999px   # pills & circular avatars/badges (100px / 50% in the wild)

spacing:
  base_unit: 4px
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px

elevation:
  level-0: "none"                                   # depth carried by 1px hairline ring instead
  level-1: "0 2px 6px rgba(0,0,0,0.20)"             # cards on dark
  level-2: "0 26px 42px rgba(0,0,0,0.20)"           # floating panels / popovers / modals
  glow:    "0 5px 20px rgba(0,153,255,0.20)"        # signature blue glow on featured elements
  ring:    "0 0 0 1.5px rgba(255,255,255,0.10)"     # focus / selection ring

components:
  nav-bar:          { backgroundColor: "frosted light bar over dark hero", textColor: "#0a0a0a", typography: "{typography.body-sm}", padding: "10px 14px", note: "top header reads as a light/blur pill; switches to dark context on scroll" }
  button-primary:   { background: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.sm}", padding: "10px 16px" }
  button-light:     { background: "{colors.light-cta}", textColor: "{colors.on-light-cta}", typography: "{typography.button}", rounded: "{rounded.sm}", padding: "10px 14px", note: "the actual homepage hero CTA" }
  button-secondary: { background: "rgba(255,255,255,0.12)", textColor: "{colors.ink}", typography: "{typography.button}", rounded: "{rounded.sm}", padding: "10px 14px" }
  button-pill:      { background: "{colors.surface-alt}", textColor: "{colors.ink}", rounded: "{rounded.full}", padding: "8px 16px" }
  card:             { backgroundColor: "{colors.surface}", rounded: "{rounded.md}", border: "1px solid {colors.hairline-soft}", shadow: "{elevation.level-0}", hoverShadow: "{elevation.level-1}" }
  text-input:       { backgroundColor: "{colors.surface}", textColor: "{colors.ink}", border: "1px solid {colors.hairline}", rounded: "{rounded.sm}", padding: "10px 14px", placeholder: "rgba(255,255,255,0.3)" }
  badge-pill:       { backgroundColor: "rgba(0,187,136,0.1)", textColor: "{colors.success}", rounded: "{rounded.full}", typography: "{typography.eyebrow}", padding: "4px 10px", note: "status pills; blue variant uses rgba(0,153,255,0.1) on #0099ff" }
---

# Framer — Design Language Analysis

Framer's marketing site is a study in high-contrast restraint: a true-black stage on which white, tightly-tracked display type does almost all of the talking, with one electric blue reserved for the moments that matter. The page is dense with live product mockups (canvas, CMS, analytics, a Claude Code terminal), so the system has to hold up across both bold hero typography and miniature UI chrome — and it does, by leaning on a tight charcoal surface ramp and hairline-thin dividers rather than borders or color. The personality is modern, engineered, and quietly premium.

## Colour

The palette is anchored on a pure black canvas (`#000000`) and pure white ink (`#ffffff`) — the highest-contrast pairing possible. Depth is built not with shadow but with a narrow ramp of near-black surfaces: `#111111` for soft bands, `#1e1e1e` for cards, `#242424` for chips and sunken fills, and `#303030` for hover/raised states. Secondary information steps down through a grey ladder — `#999999` then `#666666` (equivalently expressed on the site as `rgba(255,255,255,0.6)` and `0.4`). Separation between regions is handled almost entirely by hairlines at `rgba(255,255,255,0.06–0.12)` rather than solid rules, which keeps the dark surfaces feeling seamless.

Exactly one saturated colour carries the brand: an electric `#0099ff`. It appears as the logo mark, link and selection states, accent fills, focus rings, and — most distinctively — as a soft blue glow (`0 5px 20px rgba(0,153,255,0.2)`) used in place of a conventional drop shadow on featured elements. A slightly deeper `#0066ff` shows up on some pressed/alternate CTA fills. Notably, the homepage hero's primary call-to-action is *not* blue but a white pill with near-black text; the blue is held in reserve as an accent rather than spent on every button. A small set of secondary accents — `#00bb88` green for "Live"/GOOD status pills (over a 10% tint), plus editorial `#d67a5c` terracotta and `#8856ff` purple — appears only inside content and product mockups.

## Typography

Two families do the work. Headlines and section titles are set in **GT Walsheim Medium** — a geometric, faintly humanist sans (proprietary/licensed) — at weight 500 with aggressively negative tracking (`-2.16px` at the 54px hero, `-1.76px` at 44px section heads) and near-1.0 line-height, which gives the display type its compact, confident block. Because GT Walsheim is licensed, the accompanying showcase substitutes **Hanken Grotesk** (the closest Google match in proportion and double-story structure) and labels it as a stand-in. Everything below the headline tier is **Inter** (served as Inter Variable): feature titles at 20/600, subheads at 18/400, body at 15/400 and 14/400. Hierarchy is therefore built by *family and size* (Walsheim display vs. Inter text) far more than by weight — most text lives at 400–600. Code and terminal mockups use a monospace (**Input Mono**, falling back to **JetBrains Mono**), reinforcing the developer-tool positioning.

## Shape & depth

Radii cluster tightly around an 8px workhorse — by a wide margin the most common value, used on buttons, inputs, and small cards. Larger media tiles and panels step up to 15px and 20px, oversized panels to 25px, and pills/avatars go fully round (100px / 50%). There is no sharp-cornered geometry anywhere. Depth on the black canvas is deliberately understated: most cards sit flat with only a hairline ring (`level-0`), real shadows are low-alpha and soft (`0 2px 6px rgba(0,0,0,0.2)` for cards, up to `0 26px 42px rgba(0,0,0,0.2)` for floating panels), and the one expressive depth cue is the blue glow on hero/featured elements. The effect is a UI that feels layered and tactile without ever looking heavy.

## Layout & responsive

Spacing follows a 4px base unit with a familiar 8/12/16/24/32/48 rhythm, and content is organized into full-width dark sections separated by hairlines and generous vertical padding. The homepage is a long, modular scroll of alternating feature blocks, each pairing a Walsheim headline with an interactive product mockup. Layouts are multi-column grids on desktop (feature cards, community tiles, pricing in threes) that collapse to two columns on tablet and a single stacked column on mobile, where the hero display size also drops substantially. The top navigation presents as a light, frosted pill bar floating over the black hero — a deliberate light-on-dark inversion that reinforces the premium, app-like feel.
