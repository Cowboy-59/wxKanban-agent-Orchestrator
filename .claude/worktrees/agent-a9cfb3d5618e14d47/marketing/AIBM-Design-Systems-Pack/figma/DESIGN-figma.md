---
version: alpha
name: Figma Analysis
description: >
  A near-monochrome editorial system — pure-white canvas, ink-black type and
  CTAs, a single 54%-grey for secondary voice — energised by one signature
  electric blue (#00B6FF) that appears almost exclusively as a decorative
  conic-ray gradient, set in Figma's proprietary variable grotesque figmaSans.

colors:
  primary: "#00B6FF"          # signature Figma blue — canvas gradient, accents, focus, links
  on-primary: "#FFFFFF"       # text/icon on the blue accent
  primary-gradient: "repeating-conic-gradient(#00B6FF 0deg, #00B6FF 18deg, transparent 18deg, transparent 30deg)"  # the hero spoke pattern
  dark: "#000000"             # the actual primary CTA surface + full-bleed inverted bands
  on-dark: "#FFFFFF"
  canvas: "#FFFFFF"           # page background
  canvas-soft: "#F5F5F5"      # off-tint section background (black @ 4%)
  surface: "#FFFFFF"          # card / panel surface
  surface-alt: "#EBEBEB"      # chip / sunken fill / hover (black @ 8%)
  ink: "#000000"              # headings & body text — pure black, dominant
  ink-secondary: "#757575"    # eyebrows, secondary copy (black @ 54%)
  ink-muted: "#8C8C8C"
  ink-faint: "#B3B3B3"        # captions / placeholder
  hairline: "#D9D9D9"         # 1px borders & dividers (black @ ~16%)
  hairline-soft: "#EBEBEB"    # faintest dividers
  on-dark-hairline: "rgba(255,255,255,0.16)"  # dividers/borders inside black bands

typography:
  display-1: { fontFamily: figmaSans, fontSize: 56px, fontWeight: 400, lineHeight: 1.0, letterSpacing: -1.25px }
  display-2: { fontFamily: figmaSans, fontSize: 44px, fontWeight: 400, lineHeight: 1.1, letterSpacing: -0.66px }
  heading-1: { fontFamily: figmaSans, fontSize: 30px, fontWeight: 400, lineHeight: 1.2, letterSpacing: -0.4px }
  heading-2: { fontFamily: figmaSans, fontSize: 24px, fontWeight: 400, lineHeight: 1.3, letterSpacing: -0.2px }
  title:     { fontFamily: figmaSans, fontSize: 18px, fontWeight: 500, lineHeight: 1.4, letterSpacing: -0.1px }
  body-lg:   { fontFamily: figmaSans, fontSize: 18px, fontWeight: 330, lineHeight: 1.4, letterSpacing: -0.1px }
  body-md:   { fontFamily: figmaSans, fontSize: 16px, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0px }
  body-sm:   { fontFamily: figmaSans, fontSize: 14px, fontWeight: 400, lineHeight: 1.4, letterSpacing: 0px }
  button:    { fontFamily: figmaSans, fontSize: 16px, fontWeight: 400, lineHeight: 1.3, letterSpacing: 0px }
  eyebrow:   { fontFamily: figmaSans, fontSize: 14px, fontWeight: 400, lineHeight: 1.3, letterSpacing: 0.5px, textTransform: uppercase }
  caption:   { fontFamily: figmaSans, fontSize: 13px, fontWeight: 400, lineHeight: 1.4, letterSpacing: 0px }

rounded:
  xs: 2px
  sm: 4px
  md: 8px
  lg: 16px
  xl: 24px
  xxl: 24px
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
  level-1: "0 1px 2px rgba(0,0,0,0.06), inset 0 0 0 1px rgba(0,0,0,0.16)"
  level-2: "0 10px 15px -3px rgba(0,0,0,0.10), 0 4px 6px rgba(0,0,0,0.05)"

components:
  nav-bar:        { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.body-md}", padding: 16px 24px, hairline: "{colors.hairline-soft}" }
  button-primary: { background: "{colors.dark}", textColor: "{colors.on-dark}", typography: "{typography.body-lg}", rounded: "{rounded.md}", padding: 12px 22px }
  button-accent:  { background: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.md}", padding: 12px 22px }
  button-secondary: { background: "transparent", textColor: "{colors.ink}", typography: "{typography.body-md}", rounded: "{rounded.md}", padding: 12px 22px }
  button-pill:    { background: "{colors.dark}", textColor: "{colors.on-dark}", border: "1px {colors.on-dark-hairline}", rounded: "{rounded.full}", padding: 8px 16px }
  card:           { backgroundColor: "{colors.surface}", rounded: "{rounded.md}", border: "1px {colors.hairline-soft}", shadow: "{elevation.level-0}", hoverShadow: "{elevation.level-2}" }
  text-input:     { background: "{colors.canvas}", textColor: "{colors.ink}", border: "1px {colors.hairline}", rounded: "{rounded.md}", padding: 12px 16px, placeholder: "{colors.ink-faint}" }
  badge-pill:     { background: "{colors.surface-alt}", textColor: "{colors.ink}", rounded: "{rounded.full}", padding: 5px 10px, typography: "{typography.caption}" }
---

# Figma — Design Language Analysis

Figma's marketing site reads like a piece of editorial print that happens to be interactive: an almost entirely black-and-white system, generous in scale, confident enough to let one electric blue do all the talking. There is no decorative chrome, no gradient-soaked buttons, no soft pastel surfaces. Type is the hero, the canvas is paper-white, and the brand's personality is delivered through enormous headlines and a single, recognisable spoke of Figma blue. It is the visual equivalent of a tool that wants to disappear so the work can show.

## Colour

The palette is deliberately tiny. Pure black (`#000000`) carries every heading and nearly all body copy — it was by far the most frequent text colour on the page — while pure white (`#FFFFFF`) is both the canvas and the inverted-band text colour. Between those two poles sits a single working grey, black at 54% opacity (`≈ #757575`), used for eyebrows, captions, and secondary sentences; a short muted/faint ramp extends it for placeholders and the very quietest labels. Surfaces are barely-there tints of black — 4% (`≈ #F5F5F5`) for soft section bands and 8% (`≈ #EBEBEB`) for chips and hover fills — and hairlines are black at roughly 16% (`≈ #D9D9D9`). The one saturated colour in the entire system is **Figma blue `#00B6FF`**, and tellingly it is *not* spent on buttons: the primary CTA is solid black. Instead the blue appears as a repeating conic-ray gradient behind the hero — a literal "intelligent canvas" motif — and as the accent for focus, links, and small status marks. Full-width black bands invert the whole scheme, switching to white text and translucent-white (16–24%) hairlines and surfaces.

## Typography

The family is **figmaSans**, Figma's own proprietary variable grotesque (stack: `figmaSans, "SF Pro Display", system-ui, helvetica`). Because it is licensed to Figma, the showcase substitutes the nearest widely-available Google grotesque, **Inter**, and labels it as a stand-in. Hierarchy is built almost entirely from **size and tracking rather than weight** — the signature move of this system. Display headlines run 56px and 44px at *regular* weight (400) with tight negative tracking (-1.25px and -0.66px) and a 1.0–1.1 line-height, so they read as large but never bold. Body copy is the opposite of the usual default: it sits at 18px on a variable weight of ~330 (a hair heavier than book weight) with a relaxed 1.4 line-height, giving paragraphs a soft, even colour. A 16px / 400 tier handles UI and denser copy, and a 14px uppercase eyebrow with +0.5px tracking labels each section. The whole ladder leans on figmaSans's variable axis — 320, 330, 400 — to differentiate roles where most systems would jump to 600 or 700.

## Shape & depth

Corners are restrained and small. Buttons and cards share an 8px radius (`md`); chips, tags and tiny controls use 2px and 4px; avatars and pills go fully round (9999px); and only the occasional large media block reaches 16–24px. Depth is the most minimal part of the system — the site is overwhelmingly **flat**. Cards are defined by a 1px hairline rather than a shadow (level-0), and where a subtle lift is needed it comes from a 1px inset ring at 16% black plus a faint 1px drop. The only true elevation in the system is reserved for transient overlays — menus and dropdowns — which use a soft layered shadow (`0 10px 15px -3px rgba(0,0,0,.10)`). Nothing on the page floats unless it has to.

## Layout & responsive

Spacing follows a 4px base unit (radii of 2/4/8, button padding of 12×22) stepping through an 8/16/24/32/48 rhythm, with very large vertical breathing room between full-bleed sections. Content is centred in a wide measure and headlines are allowed to span dramatically before sections collapse. The grid is built for multi-column galleries of product/use-case cards that step from four columns down to two on tablet and one on mobile; display type ramps down (56px → ~40px) as the viewport narrows, and the alternating white/black bands stack vertically while keeping their inverted colour logic intact. The result scales as an editorial column rather than a dense dashboard — wide, airy, and type-led at every breakpoint.
