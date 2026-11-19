---
version: alpha
name: Raycast Analysis
description: >
  A near-black, keyboard-first interface system — a grey-900 (#07080a) canvas
  under crisp white Inter type, with translucent-white hairlines, soft inner-lit
  surfaces, and a single coral-red (#ff6363) spark for brand plus a cool blue for
  AI: restrained, dense, and unmistakably "pro tool."

colors:
  primary: "#ff6363"            # brand coral-red — accents, links, focus, "most popular", status dots
  primary-active: "#e94f4f"     # derived hover/pressed
  on-primary: "#ffffff"         # text/icon on the red accent
  accent-blue: "#56c2ff"        # secondary accent — AI surfaces, info links (--blue-dark)
  success: "#59d499"            # positive / live status
  cta-solid: "#ffffff"          # the real primary BUTTON fill (grey-50 #e6e6e6 at rest)
  on-cta-solid: "#07080a"       # dark text on the solid button
  dark: "#1b1c1e"               # elevated surface — featured card / dark buttons (grey-600)
  canvas: "#07080a"             # page background (grey-900)
  canvas-soft: "#0c0d0f"        # section alt background (grey-800)
  surface: "#101111"            # card / panel surface (color-bg-100)
  surface-alt: "rgba(255,255,255,0.05)"  # chip / sunken fill on dark
  ink: "#ffffff"                # headings & body
  ink-secondary: "#9c9c9d"      # secondary text (grey-200)
  ink-muted: "#6a6b6c"          # captions (grey-300)
  ink-faint: "#434345"          # placeholder / disabled (grey-400)
  hairline: "rgba(255,255,255,0.10)"     # 1px borders & dividers
  hairline-soft: "rgba(255,255,255,0.06)" # faintest separators
  # Native grey ramp (Raycast's own --grey-* tokens):
  #   50 #e6e6e6 · 100 #cdcece · 200 #9c9c9d · 300 #6a6b6c · 400 #434345
  #   500 #2f3031 · 600 #1b1c1e · 700 #111214 · 800 #0c0d0f · 900 #07080a

typography:
  display-1: { fontFamily: Inter, fontSize: 64px, fontWeight: 600, lineHeight: 1.1, letterSpacing: "-0.5px" }
  display-2: { fontFamily: Inter, fontSize: 32px, fontWeight: 500, lineHeight: 1.2, letterSpacing: "0.2px" }
  heading-1: { fontFamily: Inter, fontSize: 24px, fontWeight: 500, lineHeight: 1.3, letterSpacing: "0.2px" }
  heading-2: { fontFamily: Inter, fontSize: 20px, fontWeight: 500, lineHeight: 1.3, letterSpacing: "0.2px" }
  title:     { fontFamily: Inter, fontSize: 18px, fontWeight: 400, lineHeight: 1.4, letterSpacing: "0.2px" }
  body-lg:   { fontFamily: Inter, fontSize: 16px, fontWeight: 400, lineHeight: 1.5, letterSpacing: "0.2px" }
  body-md:   { fontFamily: Inter, fontSize: 14px, fontWeight: 500, lineHeight: 1.43, letterSpacing: "0.2px" }
  body-sm:   { fontFamily: Inter, fontSize: 13px, fontWeight: 400, lineHeight: 1.5, letterSpacing: "0.2px" }
  button:    { fontFamily: Inter, fontSize: 14px, fontWeight: 500, lineHeight: 1.15, letterSpacing: "0.2px" }
  caption:   { fontFamily: Inter, fontSize: 12px, fontWeight: 400, lineHeight: 1.4, letterSpacing: "0.2px" }
  eyebrow:   { fontFamily: Inter, fontSize: 13px, fontWeight: 700, lineHeight: 1.4, letterSpacing: "0.2px" }
  mono:      { fontFamily: "JetBrains Mono (substitute for Geist Mono)", fontSize: 12px, fontWeight: 400, lineHeight: 1.15 }

rounded:
  xs: 4px       # --rounding-xs — tags, tiny chips
  sm: 6px       # --rounding-sm / --radius-md — inline controls
  md: 8px       # --rounding-normal — THE workhorse: buttons, inputs, small cards
  lg: 12px      # --rounding-md — cards & panels
  xl: 16px      # --rounding-lg — large feature panels
  xxl: 24px     # --rounding-xxl — hero/marketing containers
  full: 9999px  # pills, avatars, segmented controls (--rounding-full)
  # note: an 11px radius is the single most-painted value on the homepage — it is the
  # decorative keyboard-keycap motif in the hero, not a general UI token.

spacing:
  xxs: 4px      # --spacing-0-5
  xs: 8px       # --spacing-1  (base unit)
  sm: 12px      # --spacing-1-5
  md: 16px      # --spacing-2
  lg: 24px      # --spacing-3
  xl: 32px      # --spacing-4  (also the grid gap)
  xxl: 48px     # --spacing-6
  # larger steps continue: 40 · 56 · 64 · 80 · 96 · 112 · 168 · 224

elevation:
  level-0: "none"
  level-1: "0 0 0 1px rgba(255,255,255,0.06), 0 1.2px 2.4px rgba(0,0,0,0.28)"
  level-2: "0 4px 40px 8px rgba(0,0,0,0.45), 0 0 0 0.5px rgba(0,0,0,0.8), inset 0 0.5px 0 rgba(255,255,255,0.25)"
  # signature: buttons & keycaps carry an inset top highlight — `inset 0 1px 0 rgba(255,255,255,0.1)` —
  # plus a 2px dark halo, giving them a physically "lit-from-above," pressable look.

components:
  nav-bar:         { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.body-md}", height: 64px, hairline: "{colors.hairline-soft}" }
  button-primary:  { background: "{colors.cta-solid}", textColor: "{colors.on-cta-solid}", typography: "{typography.button}", rounded: "{rounded.md}", padding: "8px 12px", note: "near-white solid pill with a glossy multi-layer shadow + inset top highlight" }
  button-accent:   { background: "{colors.primary}", textColor: "{colors.on-primary}", rounded: "{rounded.md}", note: "coral-red, reserved for brand moments, never the default action" }
  button-secondary:{ background: "transparent", textColor: "{colors.ink}", border: "1px solid {colors.hairline}", rounded: "{rounded.md}", padding: "8px 12px" }
  card:            { backgroundColor: "{colors.surface}", rounded: "{rounded.lg}", border: "1px solid {colors.hairline-soft}", shadow: "{elevation.level-1}" }
  text-input:      { backgroundColor: "rgba(255,255,255,0.05)", textColor: "{colors.ink}", placeholder: "{colors.ink-muted}", border: "1px solid rgba(255,255,255,0.05)", rounded: "{rounded.md}", padding: "8px 12px", typography: "{typography.body-md}" }
  badge-pill:      { backgroundColor: "{colors.surface-alt}", textColor: "{colors.ink-secondary}", rounded: "{rounded.full}", padding: "5px 10px", typography: "{typography.caption}" }
  keycap:          { backgroundColor: "{colors.surface}", rounded: "11px", shadow: "glossy inner-lit multi-layer", note: "the hero's physical-keyboard motif" }
---

# Raycast — Design Language Analysis

Raycast's marketing site is a faithful extension of the product itself: a dense, dark,
keyboard-first launcher rendered as a web page. Everything is built on a single near-black
canvas, white Inter type does almost all of the communicating, and colour is rationed so
tightly that one coral-red and one cool blue carry the entire brand. The personality is
"precision instrument" — quiet surfaces, hairline-thin separators, and controls that look
physically pressable thanks to inset highlights and tight, layered shadows. The whole system
is driven by an explicit token layer (`--grey-*`, `--rounding-*`, `--spacing-*`,
`--color-bg-*`), which is why the palette and scales below are unusually clean.

## Colour

The foundation is a twelve-step neutral ramp from `#ffffff` down to near-pure black, anchored
by **grey-900 `#07080a`** as the page canvas. Cards and bands step up only slightly — grey-800
`#0c0d0f`, `color-bg-100 #101111`, grey-600 `#1b1c1e` — so depth is communicated by a barely
perceptible lightening plus a 1px ring, never by a strong fill. On the dark field, most
surfaces and borders are actually **white at very low alpha** (`rgba(255,255,255,0.05)` fills,
`0.10` / `0.06` hairlines), which keeps everything feeling like frosted glass over the same
black rather than a set of opaque grey boxes.

Text rides the same ramp: pure white for headings and primary copy, grey-200 `#9c9c9d` for
secondary, grey-300 `#6a6b6c` for captions, grey-400 `#434345` for placeholders and disabled.

Saturated colour is deliberately scarce. The brand spark is **coral-red `#ff6363`**
(Raycast's `--red-dark`), used for the wordmark accent, focus, "most popular" markers, status
dots, and the occasional highlight — almost never as a button fill. The cool **blue `#56c2ff`**
(`--blue-dark`) marks AI surfaces and some links, and a mint **`#59d499`** signals positive
state. The single most prominent *button*, by contrast, is **near-white `#e6e6e6`/#fff with
dark text** — Raycast leads with a neutral solid CTA and lets the red read as identity, not
action. Gradients exist but stay atmospheric: a faint top-down radial wash over the hero and
soft coloured glows behind extension art, all low-opacity over the black.

## Typography

One family does everything: **Inter** (loaded as `--font-inter`, with an `Inter Fallback`
metric-matched stack), plus **Geist Mono / JetBrains Mono** for keycaps and code. Because Inter
ships on Google Fonts, the showcase renders the real typeface; the monospace is substituted to
the nearest Google match, **JetBrains Mono**.

Hierarchy is built far more from **size and weight than from colour or tracking**. The hero
display lands at 64px/600 with a tight ~1.1 line-height; large statement lines sit at 32px/500;
section headers are restrained (20–24px/500); card titles at 18px/400. The workhorse body is
**16px/400 at ~1.5** — by a wide margin the most-painted pair on the page — with 14px/500 for
labels and buttons and 13px/400 for fine print. A subtle but consistent **+0.2px letter-spacing**
runs across UI text, and weights stay in a narrow 400–600 band (700 only for small eyebrows),
which is what gives the type its calm, engineered evenness.

## Shape & depth

Corners follow an explicit `--rounding-*` scale: 4 · 6 · **8** · 12 · 16 · 20 · 24px, topped by
a 9999px pill. **8px is the default** for buttons, inputs and small cards; 12–16px for larger
panels; full pills for tags and avatars. (The 11px radius that dominates raw frequency is the
hero's decorative keycaps, not a UI token.)

Depth is doing the most distinctive work. Rather than soft drop-shadows, Raycast layers
**hairline rings, inset top highlights, and tight dark halos** so that buttons and keys look
lit from above and physically depressible — e.g. an inset `0 1px 0 rgba(255,255,255,0.1)`
highlight over a 2px black halo. Cards default to flat-with-a-1px-ring (level-0/1), while
popovers and the command bar earn a genuine lift: a wide `0 4px 40px 8px rgba(0,0,0,0.45)`
plus a hairline and an inset top edge (level-2).

## Layout & responsive

Spacing is a clean **8px base** (`--spacing-1: 8px`) running 4 · 8 · 12 · 16 · 24 · 32 · 48 and
on up to 224px for big marketing gaps; the grid gap is 32px. Content is centered in fixed
container widths exposed as tokens — `xs 746 · sm 1064 · default 1204 · lg 1280px` — so the
layout is a centered column that widens in discrete steps rather than fluidly. Breakpoints sit
around the 746/1064/1204px container marks: multi-column feature grids and the extension gallery
collapse from four to two to one column, the hero's keyboard motif scales down, and the nav
condenses behind the same 64px bar. Type scales modestly at the small end (the 64px display
steps down) while body text holds at 16px, keeping reading comfort constant on phones.
