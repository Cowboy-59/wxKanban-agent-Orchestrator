---
version: alpha
name: AETHER Apparel Analysis
description: >
  A stark, gallery-white canvas with absolute-black ink and zero saturated
  colour — the only warmth is a single sand tone (#eeece4), and all the brand
  personality is carried by an extended grotesque display face and a
  utilitarian mono used for coordinates, a live clock, and "FOR THE RESTLESS"
  micro-labels.

colors:
  primary: "#000000"          # CTAs, links, brand marks — the brand "colour" is black
  primary-active: "#2b2b2b"   # hover/pressed on dark controls
  on-primary: "#ffffff"       # text/icon on primary
  dark: "#000000"             # inverted bands / filled buttons (same as primary)
  canvas: "#ffffff"           # page background
  canvas-soft: "#f5f5f5"      # off-tint section background
  surface: "#ffffff"          # card / panel surface
  surface-alt: "#eeece4"      # warm sand chip / accent fill (the one non-grey)
  ink: "#000000"              # headings & body text
  ink-secondary: "#545454"    # secondary copy (used sparingly)
  ink-muted: "#767676"        # meta / sub-labels (derived)
  ink-faint: "#9b9b9b"        # captions / placeholder (derived)
  hairline: "#d8d8d8"         # input & card borders
  hairline-soft: "#ececec"    # section dividers
  # high-contrast controls additionally use a 1px solid ink (#000) border
  # decorative accents:
  accent-sand: "#eeece4"      # warm surface used behind editorial blocks
  overlay-scrim: "rgba(0,0,0,0.85)"  # dark gradient over hero/product imagery

typography:
  display-1: { fontFamily: "Archivo (sub. Maison Neue Extended Demi)", fontSize: 48px, fontWeight: 600, lineHeight: 1.10, letterSpacing: -0.5px }
  display-2: { fontFamily: "Archivo (sub. Maison Neue Extended Demi)", fontSize: 36px, fontWeight: 600, lineHeight: 1.10, letterSpacing: -0.3px }
  heading-1: { fontFamily: "Archivo (sub. Maison Neue Extended Demi)", fontSize: 22px, fontWeight: 600, lineHeight: 1.20, letterSpacing: -0.2px }
  heading-2: { fontFamily: "Archivo (sub. Maison Neue Extended Demi)", fontSize: 18px, fontWeight: 600, lineHeight: 1.30, letterSpacing: 0px }
  eyebrow:   { fontFamily: "Archivo (sub. Maison Neue Extended Demi)", fontSize: 14px, fontWeight: 600, lineHeight: 1.0, letterSpacing: 1.4px, textTransform: uppercase }
  body-lg:   { fontFamily: "Inter (sub. Maison Neue Book)", fontSize: 16px, fontWeight: 400, lineHeight: 1.50, letterSpacing: 0px }
  body-md:   { fontFamily: "Inter (sub. Maison Neue Book)", fontSize: 13px, fontWeight: 400, lineHeight: 1.45, letterSpacing: 0px }
  button:    { fontFamily: "Inter (sub. Maison Neue Book)", fontSize: 12px, fontWeight: 500, lineHeight: 1.0, letterSpacing: 1.2px, textTransform: uppercase }
  caption:   { fontFamily: "Inter (sub. Maison Neue Book)", fontSize: 11px, fontWeight: 400, lineHeight: 1.3, letterSpacing: 1.1px, textTransform: uppercase }
  mono-label: { fontFamily: "IBM Plex Mono (sub. Maison Neue Mono)", fontSize: 10px, fontWeight: 400, lineHeight: 1.3, letterSpacing: 0.5px, textTransform: uppercase }

rounded:
  xs: 5px        # workhorse — product images, cards, inputs
  sm: 10px
  md: 12px
  lg: 14px
  xl: 25px       # large rounding on controls (reads as a pill at button height)
  full: 999px    # pills, 50% circles

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  xxxl: 64px

elevation:
  level-0: "none"                              # default — flat, hairline only
  level-1: "0 0 8px rgba(0,0,0,0.20)"          # the one measured shadow — a soft even glow on hover
  level-2: "0 12px 36px rgba(0,0,0,0.16)"      # inferred for the cart drawer / modals

components:
  nav-bar:          { backgroundColor: "transparent", position: "sticky", textColor: "{colors.ink}", inverseTextColor: "{colors.on-primary}", typography: "{typography.button}", note: "white over hero imagery, black over light sections" }
  button-primary:   { background: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.full}", padding: "14px 26px" }
  button-inverted:  { background: "{colors.surface}", textColor: "{colors.ink}", border: "1px solid {colors.surface}", typography: "{typography.button}", rounded: "{rounded.full}", padding: "14px 26px" }
  button-outline:   { background: "transparent", textColor: "{colors.ink}", border: "1px solid {colors.ink}", typography: "{typography.button}", rounded: "{rounded.full}", padding: "13px 25px" }
  card:             { backgroundColor: "{colors.surface}", rounded: "{rounded.xs}", shadow: "{elevation.level-0}", hoverShadow: "{elevation.level-1}" }
  text-input:       { backgroundColor: "{colors.canvas}", border: "1px solid {colors.hairline}", rounded: "{rounded.xs}", typography: "{typography.body-md}", padding: "12px 16px" }
  badge-pill:       { backgroundColor: "{colors.surface}", textColor: "{colors.ink}", rounded: "{rounded.full}", typography: "{typography.caption}", shadow: "0 1px 2px rgba(0,0,0,0.10)" }
  mono-label:       { textColor: "{colors.ink}", typography: "{typography.mono-label}", note: "live clock, geo-coordinates, status micro-copy" }
---

# AETHER Apparel — Design Language Analysis

AETHER dresses like a piece of technical equipment: a clean white field, absolute black type, and almost nothing else. There is no brand hue in the conventional sense — the "primary" colour is pure black, and contrast does all the work that a palette usually does. The system reads as confident, editorial, and slightly clinical, which suits a performance-apparel label that wants its product photography (not its UI) to supply the colour. What keeps it from feeling like a default Helvetica template is the typographic casting: a wide *extended* grotesque for headlines and a tiny monospace used the way an instrument panel uses a readout — a live local clock, "LOS ANGELES", and "FOR THE RESTLESS" set in 10px uppercase mono.

## Colour

The palette is effectively monochrome. Black (`#000000`) is the most-used text colour by a wide margin and also the dominant border and fill for buttons; white (`#ffffff`) is the page canvas and the inverse text colour. Between them sit just two neutral surfaces: a soft grey (`#f5f5f5`) that backs alternating sections, and a single warm sand (`#eeece4`) that is the only chromatic note in the entire system — used sparingly behind editorial blocks to add a flicker of warmth. Secondary ink (`#545454`) appears rarely; the brand prefers full-strength black even for body copy, which is part of what gives the pages their high-contrast snap. Borders are split between strong 1px black outlines on controls and much softer grey hairlines (`#d8d8d8`–`#ececec`) for dividers and cards. Over hero and product imagery a near-opaque black scrim (`rgba(0,0,0,0.85)`) is used to keep white nav and overlay text legible. No gradients are used anywhere.

## Typography

Three faces, all from the proprietary Maison Neue family (Milieu Grotesque), substituted here with the nearest Google equivalents. Headlines are set in **Maison Neue Extended Demi** — a wide, engineered grotesque at weight 500/600 — substituted with **Archivo** (run slightly expanded). Hierarchy is built almost entirely from *size*, not weight: the family barely moves off 500–600, so a 48px hero, a 36px section head, and a 22px block title all share the same tone and simply scale. Body and interface text use **Maison Neue Book** (a neutral neo-grotesque, substituted with **Inter**) at a comfortable 16px/1.5 default, dropping to 12–13px for navigation and controls. The third voice is the signature one: **Maison Neue Mono** (substituted with **IBM Plex Mono**), set tiny — 10px, uppercase, with 0.5px tracking — for utilitarian readouts like the store clock, geo-labels, cart counts and legal lines. Navigation and buttons are uniformly uppercase with ~1.2px letter-spacing, reinforcing the technical, label-like register.

## Shape & depth

Shape is restrained and slightly soft. A 5px radius is the workhorse — applied to product images, cards and inputs — giving everything a barely-rounded, modern-retail feel rather than sharp corners. Controls round much harder: buttons sit at a 25px radius that, at their height, reads as a full pill, echoed by genuine 999px pills and 50% circular icon buttons. A middle band of 10–14px radii covers larger cards and media tiles. Depth is almost entirely absent: the design is flat, separated by hairlines and surface-colour shifts rather than shadow. The single shadow found in the wild is a soft, even `0 0 8px rgba(0,0,0,0.2)` glow that appears on hover; anything heavier (the cart drawer, modals) is an inferred deepening of that same soft, diffuse style.

## Layout & responsive

The grid is wide and editorial, built on what looks like a 4px base unit with an 8px working rhythm, and it leans on generous vertical spacing to let big imagery breathe. Product and feature blocks lay out as four-up grids on desktop, collapsing to two-up on tablet and one- or two-up on mobile. The header is sticky and transparent, sitting over the hero with white nav and a stacked utility strip (announcement bar, mono clock/geo line, then the main nav) that together make it unusually tall before it condenses on scroll. Section rhythm is created by alternating the white canvas with the soft grey (`#f5f5f5`) and the occasional sand band, so the page reads as a sequence of full-width editorial panels rather than a boxed, carded layout.
