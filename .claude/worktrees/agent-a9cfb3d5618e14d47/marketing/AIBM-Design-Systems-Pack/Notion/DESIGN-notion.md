---
version: alpha
name: Notion Analysis
description: >
  A warm, near-monochrome workspace aesthetic — paper-white surfaces over a soft
  oatmeal canvas, near-black warm ink, and a single confident blue that carries
  every CTA and link, with a playful saturated accent set kept strictly inside
  the product illustrations.

colors:
  primary: "#0075de"          # CTAs, links, brand action blue
  primary-active: "#005bab"   # pressed/active; also text on the light-blue surface
  on-primary: "#ffffff"       # text/icon on primary
  dark: "#000000"             # inverted bands, dark buttons, pure-black headings
  canvas: "#ffffff"           # page background / cards
  canvas-soft: "#f6f5f4"      # signature warm oatmeal section tint
  surface: "#ffffff"          # card / panel surface
  surface-alt: "#f1f1ef"      # warm sunken chip / hover fill
  surface-blue: "#e6f3fe"     # light-blue info band & secondary-button fill
  ink: "#1a1a1a"              # body text (black @ 0.898 over white)
  ink-secondary: "#615d59"    # warm secondary text
  ink-muted: "#757575"        # tertiary / metadata (black @ 0.54)
  ink-faint: "#a39e98"        # warm captions / placeholders
  hairline: "#e6e6e6"         # 1px borders & dividers (black @ 0.1)
  hairline-soft: "#f1f0ee"    # faint internal rules (black @ 0.05)
  # decorative accents — appear ONLY inside product illustrations, never as UI chrome
  accent-amber: "#ffb110"     # illustration highlight
  accent-coral: "#f64932"     # illustration highlight
  accent-purple: "#ad6ded"    # illustration highlight
  accent-teal: "#2a9d99"      # illustration highlight
  accent-pink: "#ff83dd"      # illustration highlight
  accent-navy: "#02093a"      # deep illustration ground

typography:
  display-1: { fontFamily: NotionInter, fontSize: 96px, fontWeight: 600, lineHeight: 1.04, letterSpacing: -4.6px }
  display-2: { fontFamily: NotionInter, fontSize: 54px, fontWeight: 700, lineHeight: 1.04, letterSpacing: -1.875px }
  heading-1: { fontFamily: NotionInter, fontSize: 40px, fontWeight: 400, lineHeight: 1.1, letterSpacing: -1px }
  heading-2: { fontFamily: NotionInter, fontSize: 24px, fontWeight: 500, lineHeight: 1.2, letterSpacing: -0.4px }
  heading-3: { fontFamily: NotionInter, fontSize: 22px, fontWeight: 700, lineHeight: 1.27, letterSpacing: -0.25px }
  title:     { fontFamily: NotionInter, fontSize: 20px, fontWeight: 500, lineHeight: 1.3, letterSpacing: -0.2px }
  body-lg:   { fontFamily: NotionInter, fontSize: 20px, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0px }
  body-md:   { fontFamily: NotionInter, fontSize: 16px, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0px }
  body-sm:   { fontFamily: NotionInter, fontSize: 14px, fontWeight: 400, lineHeight: 1.43, letterSpacing: 0px }
  button:    { fontFamily: NotionInter, fontSize: 16px, fontWeight: 500, lineHeight: 1.0, letterSpacing: 0px }
  caption:   { fontFamily: NotionInter, fontSize: 12px, fontWeight: 500, lineHeight: 1.3, letterSpacing: 0px }
  eyebrow:   { fontFamily: NotionInter, fontSize: 12px, fontWeight: 500, lineHeight: 1.3, letterSpacing: 0.4px, textTransform: uppercase }

rounded:
  xs: 4px      # nav items, small inline chips
  sm: 8px      # buttons, inputs — the workhorse radius
  md: 12px     # cards & media tiles
  lg: 16px     # large feature panels
  full: 9999px # pills, avatars, circular controls

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
  level-1: "0 0.175px 1.04px rgba(0,0,0,0.01), 0 0.8px 2.9px rgba(0,0,0,0.02), 0 2px 7.85px rgba(0,0,0,0.027), 0 4px 18px rgba(0,0,0,0.04)"
  level-2: "0 0.667px 3.5px rgba(0,0,0,0.008), 0 2.93px 7.25px rgba(0,0,0,0.016), 0 7.2px 14.46px rgba(0,0,0,0.02), 0 13.87px 28.35px rgba(0,0,0,0.024), 0 23.33px 52px rgba(0,0,0,0.03), 0 36px 89px rgba(0,0,0,0.04)"

components:
  nav-bar:          { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.body-md}", itemRounded: "{rounded.xs}", itemPadding: 5px 10px }
  button-primary:   { background: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.button}", rounded: "{rounded.sm}", padding: 6px 15px }
  button-secondary: { background: "{colors.surface-blue}", textColor: "{colors.primary-active}", typography: "{typography.button}", rounded: "{rounded.sm}", padding: 6px 15px }
  button-dark:      { background: "{colors.dark}", textColor: "#ffffff", typography: "{typography.button}", rounded: "{rounded.sm}", padding: 6px 15px }
  button-ghost:     { background: "transparent", textColor: "{colors.ink}", typography: "{typography.body-md}", rounded: "{rounded.xs}", padding: 5px 10px }
  card:             { backgroundColor: "{colors.surface}", rounded: "{rounded.md}", shadow: "{elevation.level-0}", hoverShadow: "{elevation.level-1}", border: "1px solid {colors.hairline-soft}" }
  text-input:       { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", placeholder: "{colors.ink-faint}", border: "1px solid {colors.hairline}", rounded: "{rounded.sm}", padding: 12px 16px, typography: "{typography.body-md}" }
  badge-pill:       { backgroundColor: "{colors.surface-alt}", textColor: "{colors.ink-secondary}", rounded: "{rounded.full}", padding: 5px 10px, typography: "{typography.caption}" }
---

# Notion — Design Language Analysis

Notion's marketing surface reads like the product itself: a quiet, document-first canvas that gets out of the way of content. The system is almost entirely monochrome — warm near-blacks on paper white, separated by the softest possible hairlines — and it spends its entire colour budget on one decisive blue. Personality doesn't come from chrome; it comes from oversized, tightly-tracked display type and from saturated, hand-illustrated product scenes that are walled off from the interface itself. The result feels calm, premium, and unmistakably "workspace."

## Colour

The palette is a warm greyscale with a single saturated spike. The dominant text colour is not pure black but black at ~90% opacity (`#1a1a1a`), which keeps body copy soft against white; headings push to ~95% (`#0d0d0d`–`#000000`) for contrast at large sizes. The secondary ramp is deliberately *warm* — `#615d59`, `#757575`, and the faint `#a39e98` carry a brown undertone rather than a cool blue-grey, which is what gives Notion its paper-and-ink character. Surfaces follow the same logic: pure white (`#ffffff`) for cards sitting on a barely-there oatmeal canvas (`#f6f5f4`), with sunken fills warmed to `#f1f1ef`. Dividers are almost subliminal — black at 5–10% opacity (`#f1f0ee` to `#e6e6e6`).

One blue does all the interactive work: `#0075de` paints every primary CTA and action link, darkening to `#005bab` for pressed states and for text on its own light-blue surface (`#e6f3fe`). Notably, the highly saturated colours — amber `#ffb110`, coral `#f64932`, purple `#ad6ded`, teal `#2a9d99`, pink `#ff83dd` — appear *only* inside the illustrated product mock-ups and hero scenes. They are an illustration palette, never UI chrome, and treating them that way is essential to reproducing the brand. Gradients are used sparingly and almost invisibly: soft white-to-transparent fades that feather imagery into the page, plus a black scrim for legibility over media.

## Typography

The family is **NotionInter** — a proprietary, lightly-customized cut of Inter — backed by an Inter / system-UI fallback stack. *(The showcase substitutes Google Fonts **Inter**, the nearest faithful match, and labels it as a substitute.)* Hierarchy is built primarily through **size and tracking**, not weight: the homepage hero runs an enormous 96px at weight 600 with aggressive −4.6px letter-spacing, and the secondary display drops to 54px/700 at −1.875px. As headings shrink the negative tracking relaxes toward zero, and body text sits at a neutral 0. Weight is used in only three registers — 400 for body and some large lights, 500 for titles/buttons/eyebrows, 700 for bold section heads — so the type feels restrained despite the dramatic display sizes. The workhorse body tier is 16px/400 at a 1.5 line-height (by far the most common pairing on the page), with 14px and 12px for supporting and caption text. Big type is tight (≈1.04 leading); reading type is generous (1.43–1.5).

## Shape & depth

Shape language is minimal and consistent. An 8px radius is the clear default — buttons, inputs, and most interactive surfaces — with 4px for compact nav chips, 12px for cards and media tiles, 16px for larger feature panels, and a full pill radius for tags and circular controls. Nothing exceeds 16px except true pills, which keeps the whole surface feeling square-shouldered and document-like rather than bubbly. Depth is handled with extremely soft, finely-layered shadows: the standard card elevation stacks four low-opacity layers (1–4% black) topping out at a 4px/18px blur, and the deepest popover elevation fans six layers out to a 36px/89px spread — diffuse and almost colourless, so cards feel lifted by light rather than outlined. Most resting cards carry no shadow at all, relying on a hairline border and lifting only on hover.

## Layout & responsive

Spacing follows a 4px base unit (button padding lands on 4/6/12/16px), expanding through a 4-8-12-16-24-32-48 scale that maps cleanly onto the type rhythm. Content is centred in a constrained column (~1200px) with generous outer gutters, and sections are separated by whitespace and faint top-rules rather than heavy bands. The marketing layout is built on a responsive multi-column grid for feature and card rows that collapses from four columns to two on tablet and to one on mobile; the hero display type scales down hard (96px → ~48px) so it never overruns small screens. Throughout, the design trusts emptiness — wide margins, light dividers, and a single accent colour — to carry the premium, focused feel.
