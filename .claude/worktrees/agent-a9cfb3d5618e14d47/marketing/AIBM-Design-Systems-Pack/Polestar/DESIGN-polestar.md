---
version: alpha
name: Polestar Analysis
description: >
  A near-monochrome Swedish design system painted in pure black on white,
  where hierarchy comes from scale and air rather than weight or colour —
  square-cornered black buttons, hairline dividers, almost no shadow, and a
  single magnetic amber accent reserved for highlights.

colors:
  primary: "#000000"          # CTAs are solid black — the interactive colour is monochrome
  primary-active: "#1a1a1a"   # subtle lift on press/hover of black fills
  on-primary: "#ffffff"       # text/icon on the black button
  dark: "#000000"             # inverted hero bands & dark sections
  surface-dark: "#3a3c3f"     # near-black panel tint used in dark UI
  canvas: "#ffffff"           # page background
  canvas-soft: "#f4f4f4"      # off-white section band
  surface: "#ffffff"          # card / panel surface
  surface-alt: "#f0f0f0"      # sunken chip / fill
  ink: "#000000"              # headings & body text
  ink-secondary: "#666666"    # black at 60% — secondary copy
  ink-muted: "#555555"        # tertiary labels
  ink-faint: "#8c8c8c"        # captions / placeholder
  hairline: "#d8d8d8"         # 1px borders & dividers
  hairline-strong: "#707070"  # darker rule on darker fills
  accent-amber: "#f06e00"     # signature highlight / active link & flag accent (sparingly)
  accent-green: "#32ae88"     # decorative success-ish border accent (rare)
  accent-blue: "#3860be"      # decorative/system link accent (rare)

typography:
  display-1: { fontFamily: "Polestar Unica (→ Inter)", fontSize: 100px, fontWeight: 400, lineHeight: 1.0, letterSpacing: -3px }
  display-2: { fontFamily: "Polestar Unica (→ Inter)", fontSize: 48px, fontWeight: 400, lineHeight: 1.05, letterSpacing: -1.5px }
  heading-1: { fontFamily: "Polestar Unica (→ Inter)", fontSize: 30px, fontWeight: 400, lineHeight: 1.07, letterSpacing: -1.2px }
  heading-2: { fontFamily: "Polestar Unica (→ Inter)", fontSize: 29px, fontWeight: 400, lineHeight: 1.1, letterSpacing: -1px }
  title:     { fontFamily: "Polestar Unica (→ Inter)", fontSize: 24px, fontWeight: 600, lineHeight: 1.2, letterSpacing: -0.4px }
  body-md:   { fontFamily: "Polestar Unica (→ Inter)", fontSize: 16px, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0px }
  body-sm:   { fontFamily: "Polestar Unica (→ Inter)", fontSize: 13.6px, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0px }
  button:    { fontFamily: "Polestar Unica (→ Inter)", fontSize: 16px, fontWeight: 400, lineHeight: 1.25, letterSpacing: 0px }
  caption:   { fontFamily: "Polestar Unica (→ Inter)", fontSize: 12px, fontWeight: 400, lineHeight: 1.4, letterSpacing: 0px }
  eyebrow:   { fontFamily: "Polestar Unica (→ Inter)", fontSize: 10.7px, fontWeight: 400, lineHeight: 1.3, letterSpacing: 0.4px, textTransform: uppercase }

rounded:
  sharp: 0px      # the dominant component shape — buttons, inputs, bands
  xs: 2px
  sm: 3px
  md: 8px
  lg: 12px
  xl: 17px
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
  level-0: "none"                                                  # default — depth is drawn with hairlines, not shadow
  level-1: "0 2px 4px rgba(0,0,0,0), 0 7px 14px rgba(50,50,93,0.10)"
  level-2: "0 0 18px rgba(0,0,0,0.20)"

components:
  nav-bar:          { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.body-md}", padding: 16px, divider: "1px solid {colors.hairline}" }
  button-primary:   { background: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.sharp}", padding: 16px 24px }
  button-secondary: { background: "{colors.canvas}", textColor: "{colors.ink}", border: "1px solid {colors.ink}", typography: "{typography.button}", rounded: "{rounded.sharp}", padding: 16px 24px }
  button-text:      { background: "transparent", textColor: "{colors.ink}", typography: "{typography.button}", padding: 3px 0, decoration: "underline on hover" }
  card:             { backgroundColor: "{colors.surface}", rounded: "{rounded.md}", shadow: "{elevation.level-0}", hoverShadow: "{elevation.level-1}", border: "1px solid {colors.hairline}" }
  text-input:       { background: "{colors.canvas}", textColor: "{colors.ink}", border: "1px solid {colors.hairline}", rounded: "{rounded.sharp}", padding: 16px, typography: "{typography.body-md}" }
  badge-pill:       { background: "{colors.surface-alt}", textColor: "{colors.ink}", rounded: "{rounded.full}", typography: "{typography.caption}", padding: 5px 10px }
---

# Polestar — Design Language Analysis

Polestar's site is an exercise in restraint: a Scandinavian, product-first system that lets photography and whitespace carry the brand while the UI recedes almost to nothing. There is effectively one type family, one weight for almost everything, two structural colours (black and white), and a near-total absence of shadow. The result reads as confident and premium precisely because it refuses ornament — the cars are the colour.

## Colour

The palette is monochrome by conviction. Black (`#000000`) does nearly all the work — it is the body text, the headings, the primary button fill, and the inverted hero bands. Against pure white (`#ffffff`) canvases and the occasional `#f4f4f4` / `#f0f0f0` off-white band, secondary information steps back through a tight neutral ramp built mostly from black at reduced opacity: `#666666` (black/60%) for secondary copy, `#555555` and `#8c8c8c` for tertiary labels and captions. Structure is drawn with a single hairline grey (`#d8d8d8`) rather than fills or shadows. The one piece of brand warmth is a magnetic amber (`#f06e00`) reserved for highlights, active links, and regional accents — used so sparingly that it lands as an event rather than a theme. A few system-level accents (a green `#32ae88`, an indigo `#3860be`) appear on isolated UI affordances but are not part of the core voice. The brand's personality lives in the contrast and the emptiness, not in a colour.

## Typography

The family is **Polestar Unica**, a bespoke refined neo-grotesque in the Helvetica/Unica77 lineage; this showcase substitutes **Inter** from Google Fonts as the nearest available match and labels it as a stand-in. The defining move is that almost everything is set at weight **400 (regular)** — hierarchy is constructed almost entirely from *size* and negative *letter-spacing*, not from bold. Display moments scale dramatically (up to ~100px with roughly -3px tracking; a 48px secondary display), section headings sit at a calm 30px with -1.2px tracking and a tight 1.07 line-height, and the workhorse body tier is a generous 16px / 1.5. Weight 600 surfaces only occasionally for small emphatic titles. Tiny uppercase eyebrow labels (~10–11px) tag sections. The overall texture is airy, editorial, and quiet.

## Shape & depth

Corners are essentially square. The dominant component shape — buttons, inputs, content bands — is a hard `0px` radius, which is the single biggest contributor to the brand's precise, engineered feel. Small radii (2–3px, occasionally up to 12–17px) appear only on media tiles and a few rounded controls. Depth is deliberately flat: the default elevation is *none*, and the system separates surfaces with 1px hairlines instead of drop shadows. When shadow does appear, it is faint and incidental (a soft 7–14px ambient on a hovered card, an 18px glow on a floating element) rather than a structural device.

## Layout & responsive

Spacing follows an 8px base unit (buttons pad to 16×24, sections breathe at 32–48px), giving the layout a roomy, measured rhythm. Content is centred in a wide max-width container with full-bleed photographic hero bands that alternate light and dark. The grid is media-led — large image/video panels stacked vertically, each introduced by an eyebrow label and a large headline, with product cards arranging into multi-column rows on wider viewports. On smaller screens the multi-column rows collapse to one or two columns, the oversized display type steps down, and the persistent top nav condenses to a minimal menu — but the monochrome, hairline-separated, shadow-free character holds at every breakpoint.
