---
version: alpha
name: Stripe Analysis
description: >
  Stripe sets a near-black indigo ink on an airy off-white canvas, lit by a single
  electric blurple (#635BFF) and a cyan-to-mint brand gradient, typeset in the
  proprietary Söhne grotesque — tiny corner radii and soft slate-tinted shadows give
  every surface a precise, engineered calm.

colors:
  primary: "#635bff"            # Blurple / Cornflower Blue — CTAs, links, focus, brand mark
  primary-active: "#5546e8"     # pressed / darker blurple
  on-primary: "#ffffff"         # text/icon on primary
  brand-gradient-from: "#5e46bf"   # hero "fluid" gradient — start
  brand-gradient-via: "#1ca8ff"    # gradient — cyan midpoint
  brand-gradient-to: "#84f6d5"     # gradient — mint terminal stop
  dark: "#0a2540"               # Downriver navy — dark bands, footer, dark buttons
  canvas: "#ffffff"             # page background
  canvas-soft: "#f6f9fc"        # Black Squeeze — off-white section background
  surface: "#ffffff"            # card / panel surface
  surface-alt: "#f0f4f8"        # chip / sunken fill
  ink: "#0a2540"                # headings (deep navy)
  ink-secondary: "#425466"      # body copy (slate)
  ink-muted: "#697386"          # secondary labels
  ink-faint: "#8792a2"          # captions / placeholder
  hairline: "#e3e8ee"           # 1px borders & dividers
  hairline-soft: "#ebeff3"      # faint section rules
  accent-cyan: "#00d4ff"        # data-viz / gradient accent
  accent-mint: "#84f6d5"        # gradient terminal accent
  accent-pink: "#f6a4ec"        # gradient highlight accent
  success: "#15b79e"            # positive status (Stripe teal-green)

typography:
  display-1: { fontFamily: "Söhne (sub: Inter)", fontSize: 64px, fontWeight: 600, lineHeight: 1.05, letterSpacing: -1.5px }
  display-2: { fontFamily: "Söhne (sub: Inter)", fontSize: 48px, fontWeight: 600, lineHeight: 1.08, letterSpacing: -1px }
  heading-1: { fontFamily: "Söhne (sub: Inter)", fontSize: 38px, fontWeight: 600, lineHeight: 1.15, letterSpacing: -0.7px }
  heading-2: { fontFamily: "Söhne (sub: Inter)", fontSize: 28px, fontWeight: 600, lineHeight: 1.2, letterSpacing: -0.4px }
  heading-3: { fontFamily: "Söhne (sub: Inter)", fontSize: 21px, fontWeight: 600, lineHeight: 1.3, letterSpacing: -0.2px }
  title:     { fontFamily: "Söhne (sub: Inter)", fontSize: 18px, fontWeight: 600, lineHeight: 1.4, letterSpacing: -0.1px }
  body-lg:   { fontFamily: "Söhne (sub: Inter)", fontSize: 18px, fontWeight: 400, lineHeight: 1.6, letterSpacing: 0px }
  body-md:   { fontFamily: "Söhne (sub: Inter)", fontSize: 16px, fontWeight: 400, lineHeight: 1.6, letterSpacing: 0px }
  body-sm:   { fontFamily: "Söhne (sub: Inter)", fontSize: 14px, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0px }
  button:    { fontFamily: "Söhne (sub: Inter)", fontSize: 15px, fontWeight: 500, lineHeight: 1.2, letterSpacing: 0px }
  caption:   { fontFamily: "Söhne (sub: Inter)", fontSize: 13px, fontWeight: 400, lineHeight: 1.4, letterSpacing: 0px }
  eyebrow:   { fontFamily: "Söhne (sub: Inter)", fontSize: 13px, fontWeight: 600, lineHeight: 1.4, letterSpacing: 0.3px }

rounded:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
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
  xxxl: 80px

elevation:
  level-0: "none"
  level-1: "0 4px 6px rgba(50,50,93,0.11), 0 1px 3px rgba(0,0,0,0.08)"
  level-2: "0 13px 27px -5px rgba(50,50,93,0.25), 0 8px 16px -8px rgba(0,0,0,0.30)"

components:
  nav-bar:          { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.body-md}", padding: 20px 0 }
  button-primary:   { background: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.lg}", padding: 12px 22px, hoverShadow: "{elevation.level-1}" }
  button-dark:      { background: "{colors.dark}", textColor: "#ffffff", typography: "{typography.button}", rounded: "{rounded.lg}", padding: 12px 22px }
  button-secondary: { background: "transparent", textColor: "{colors.ink}", border: "1px solid {colors.ink}", typography: "{typography.button}", rounded: "{rounded.lg}", padding: 11px 21px }
  button-pill:      { background: "{colors.surface-alt}", textColor: "{colors.ink}", typography: "{typography.button}", rounded: "{rounded.full}", padding: 9px 16px }
  card:             { backgroundColor: "{colors.surface}", rounded: "{rounded.xl}", border: "1px solid {colors.hairline-soft}", shadow: "{elevation.level-0}", hoverShadow: "{elevation.level-1}" }
  text-input:       { backgroundColor: "{colors.canvas}", border: "1px solid {colors.hairline}", rounded: "{rounded.sm}", focusRing: "{colors.primary}", typography: "{typography.body-sm}", padding: 12px 16px }
  badge-pill:       { backgroundColor: "{colors.surface-alt}", textColor: "{colors.primary}", typography: "{typography.eyebrow}", rounded: "{rounded.full}", padding: 5px 12px }
---

# Stripe — Design Language Analysis

Stripe's visual system is an exercise in restraint backed by one decisive accent. The canvas is essentially monochrome — deep navy ink on white and a single off-white wash — held together by precise hairlines and small radii, then punctuated by exactly one saturated colour (blurple) and the famous multi-stop "fluid" gradient. The result reads as engineered, trustworthy, and quietly premium: the look of financial infrastructure that wants to feel both technical and effortless. Nothing shouts; the brand voice lives in the gradient and in the tight, semibold grotesque headlines.

## Colour

The palette is built ink-first. Headings sit at **#0A2540** ("Downriver"), a near-black navy that doubles as the fill for dark bands and the footer; body copy steps down to a slate **#425466**, with **#697386** and **#8792A2** carrying muted labels, captions, and placeholders. Surfaces are equally disciplined: pure white cards float on a barely-there **#F6F9FC** ("Black Squeeze") section wash, with sunken chips at **#F0F4F8** and 1px dividers in **#E3E8EE**. Against this calm field, **#635BFF** ("Blurple" / Cornflower Blue) does all the persuading — it is the link colour, the focus ring, the primary CTA, and the brand mark, used sparingly enough that it always pulls the eye. The signature flourish is the brand gradient, a 120° sweep from violet **#5E46BF** through blue **#5533FF** and cyan **#1CA8FF** to a mint **#84F6D5** (with a pink **#F6A4EC** appearing in some highlight treatments), reserved for hero washes, data-viz, and decorative bands rather than UI chrome.

## Typography

Stripe sets everything in **Söhne** (the live font stack resolves to `sohne-var, "Helvetica Neue", Arial, sans-serif`), the Klim Type Foundry neo-grotesque it licenses — a proprietary face, so this showcase substitutes **Inter**, the closest free Google match in proportion and x-height. Hierarchy is built primarily through **size and tight tracking, not heavyweight**: display and headings hold a confident semibold (600) with progressively negative letter-spacing (down to roughly −1.5px on the largest sizes) and snug 1.05–1.2 line-heights, while body copy is a clean 400 at 16–18px with generous ~1.6 leading for readability. The dominant body tier is **16px / 400**, captured live; ledes lift to 18px slate. Buttons and eyebrows use a 500–600 medium weight at 13–15px. The overall feel is precise and editorial — large, quiet headlines over airy, legible paragraphs.

## Shape & depth

Stripe's radius vocabulary is deliberately small — live capture showed 2–3px on most elements, a 20px medium tier, and 99px for fully-rounded pills — which this system normalises to a scale of 4 / 8 / 12 / 16 / 24 / 32px plus `full`. Inputs and small controls take the 8px end; buttons and cards round more generously (16–24px) to feel friendly without going pill, while nav chips and badges go fully rounded. Depth is the other signature: instead of flat borders alone, Stripe uses soft, **slate-tinted** shadows — the well-known `rgba(50,50,93,…)` blue-grey cast layered with a faint black — so cards lift off the page with a cool, glassy calm. Most surfaces rest at level-0 (a hairline only) and elevate to level-1 on hover; modals and popovers reach the deeper level-2 stack.

## Layout & responsive

Spacing follows an **8px base** (with a 4px half-step), scaling 4 / 8 / 12 / 16 / 24 / 32 / 48 and opening to ~80px for the vertical rhythm between marketing sections. Content is centred in a ~1080–1200px container with wide gutters, and the marketing pages lean on multi-column "bento" grids of product cards that reflow from four-up to two-up to a single stack as the viewport narrows. Headlines scale down rather than rewrap awkwardly (the 64px display drops toward ~40–48px on mobile), navigation collapses behind a menu, and the generous whitespace is preserved on small screens so the airy, uncluttered feel survives the collapse.

## Methodology & fidelity note

Stripe's own domains (`stripe.com`, `docs.stripe.com`) are blocked from live automation because they are payment surfaces, so direct computed-style capture of the homepage was not possible. To keep this faithful rather than guessed: the **type family and shape vocabulary were captured live** from a Stripe-operated property (`stripe.dev` → `sohne-var` font stack; 2–3px, 20px and 99px radii; 16px/400 body); the **real homepage content, structure, components, and copy** were retrieved from `stripe.com` directly; and the **brand palette and gradient stops** were grounded in Stripe's published brand values (#635BFF, #0A2540, #F6F9FC) and gradient references (#5E46BF → #5533FF → #1CA8FF → #84F6D5). Token sizes for the type scale and elevation reflect Stripe's documented marketing/Elements styling; treat the exact px values as faithful approximations of the live system rather than per-element measurements.

Sources: [Stripe homepage](https://stripe.com/) · [stripe.dev (live font/shape capture)](https://stripe.dev/) · [Stripe brand colors — BrandColorCode](https://www.brandcolorcode.com/stripe) · [Stripe gradient stops — BrandGradients](http://www.brandgradients.com/stripe-colors/) · [Designing accessible color systems — Stripe](https://stripe.com/blog/accessible-color-systems)
