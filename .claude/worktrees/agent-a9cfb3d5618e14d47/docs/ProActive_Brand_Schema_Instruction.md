# ProActive by DDES — Brand Schema Instruction

**Version:** 1.0 · **Date:** 2026-09-15 · **For:** WxKanban · **Owner:** NOW Group for Darling Downs Earthmoving Solutions

**Source of truth:** the ProActive Brand & Theme Reference — https://nexus-mkii.github.io/proactive-brand-reference/reference/
**Living mock-up (every route as static HTML):** https://nexus-mkii.github.io/proactive-brand-reference/
**Code kit (tokens, Tailwind extension, stylesheet, templates):** https://github.com/NEXUS-MKII/proactive-brand-reference/tree/main/kit

This document has two parts. **Part A is the brand** — canonical, set it up first, it is what every
screen renders in by default. **Part B is the mode layer** — an optional capability that lets the
same shell render in alternative characters without touching structure.

---

# PART A — THE BRAND

## A1. Identity and hierarchy

ProActive is a fleet, workshop, prestart and rostering application: 5 modules, 73 routes, ~190 discrete
UI surfaces, 741 catalogued fields. Its users are tenant admins at a desk, fitters at a bench, operators
running prestart checks on a phone in a yard, and a workshop wall screen read from across a bay.

**Navy rail with a gold active bar → breadcrumb → underline tabs. Three-level hierarchy, always.**

- **Blue leads the interface.** Primary buttons, links and the active-tab underline are `--primary`.
- **Gold is identity only.** `--brand` appears on the logo glyph and the rail's active bar. Never on a
  primary action, never as an accent.
- The rail is grouped: **Main** (Dashboard, Projects, Dispatch) · **Assets** (Plant & Fleet, Workshop,
  Catalogue) · **Compliance** (People, Safety, Documents) · **System** (Administration). Group order and
  membership are structural and do not change.

## A2. Type

| Role | Face | Weights | Use |
|---|---|---|---|
| Display | **Lexend Deca** | 400 500 600 700 | Page titles, section heads, KPI figures, card heads |
| Body / UI | **Inter** | 400 500 600 700 | Everything else |
| Data | **JetBrains Mono** | 400 600 | Identifiers, group labels, timestamps, table IDs |

One Google Fonts request, in `<head>`:

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lexend+Deca:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap">
```

Type scale: Page title Lexend 22/700 · Section Lexend 16/600 · Subsection Inter 14/600 · Body Inter
13.5/400 · Label Inter 12/500 muted · Data JetBrains 12.5/600.

## A3. Base tokens

shadcn/ui HSL triples, no `hsl()` wrapper. Light values on `:root`; dark values under
`@media (prefers-color-scheme: dark)` guarded as `:root:not([data-theme="light"])`, and again under
`:root[data-theme="dark"]` (or `.dark` if the app uses the shadcn class convention). **Copy verbatim.**

| Token | Light | Dark | Role |
|---|---|---|---|
| `--background` | `210 20% 95%` | `213 30% 9%` | page canvas |
| `--foreground` | `213 18% 10%` | `210 25% 95%` | body text |
| `--card` | `0 0% 100%` | `213 28% 13%` | panels, tiles, table |
| `--card-foreground` | `213 18% 10%` | `210 25% 95%` | text on panels |
| `--popover` | `0 0% 100%` | `213 28% 13%` | menus, drawers |
| `--popover-foreground` | `213 18% 10%` | `210 25% 95%` | text in menus |
| `--primary` | `221 83% 53%` | `217 91% 60%` | primary action, links, active tab |
| `--primary-foreground` | `0 0% 100%` | `213 30% 9%` | text on primary |
| `--secondary` | `214 21% 92%` | `213 25% 20%` | secondary action, quiet chips |
| `--secondary-foreground` | `215 25% 27%` | `210 25% 95%` | text on secondary |
| `--muted` | `210 20% 96%` | `213 25% 18%` | subdued fills |
| `--muted-foreground` | `215 16% 47%` | `214 18% 65%` | labels, captions |
| `--accent` | `48 100% 94%` | `45 38% 18%` | hover / selected (gold-tinted) |
| `--accent-foreground` | `40 75% 24%` | `47 95% 72%` | text on hover surface |
| `--destructive` | `0 72% 51%` | `0 70% 50%` | delete, machine-down |
| `--destructive-foreground` | `0 0% 100%` | `0 0% 100%` | text on destructive |
| `--border` | `210 20% 89%` | `213 22% 22%` | hairlines, dividers |
| `--input` | `210 20% 89%` | `213 22% 22%` | field borders |
| `--ring` | `221 83% 53%` | `217 91% 60%` | focus ring |
| `--radius` | `0.5rem` | `0.5rem` | base corner radius |
| `--brand` | `47 100% 50%` | `47 100% 50%` | DDES gold — logo & rail active bar only |
| `--brand-foreground` | `213 18% 10%` | `213 18% 10%` | text on gold |
| `--rail` | `213 33% 16%` | `213 34% 11%` | navy sidebar |
| `--rail-foreground` | `210 20% 92%` | `210 25% 92%` | sidebar text |
| `--rail-muted` | `212 16% 58%` | `212 16% 55%` | sidebar group labels |
| `--success` | `142 76% 36%` | `142 65% 47%` | verified, high match |
| `--success-foreground` | `0 0% 100%` | `213 30% 9%` | text on success |
| `--warning` | `28 92% 47%` | `30 95% 58%` | pending, medium match |
| `--warning-foreground` | `213 18% 10%` | `213 18% 10%` | text on warning |
| `--info` | `221 83% 53%` | `217 91% 60%` | informational |
| `--info-foreground` | `0 0% 100%` | `213 30% 9%` | text on info |

Hex equivalents for reference: primary `#2563EB` · brand `#FFC700` · rail `#1B2735` · success
`#16A34A` · warning `#E8730A` · destructive `#DC2626` · background `#EEF1F4` · foreground `#14181D`.

## A4. Geometry and elevation

- Radius: `6px` small · `8px` base (`--radius`) · `12px` card · pill for badges.
- Card: 12px radius, 1px `--border`, `--shadow-card`, white on the light-grey ground.
- Shadows: `--shadow-card: 0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)` ·
  `--shadow-pop: 0 4px 8px rgba(16,24,40,.06), 0 12px 32px rgba(16,24,40,.12)`.
- Rail width 224px. Active rail item: 3px `--brand` left bar, `--brand` at 10% as background.
- Tabs: active = `--primary` text + 2px `--primary` underline. Never a filled pill.

## A5. The ten non-negotiable rules

1. **Blue leads, gold identifies.** Primary buttons, links and the active-tab underline are blue.
   Gold is the logo and the rail's active bar — never a primary action.
2. **Tabs underline.** Active tab = blue text + 2px blue underline. Never a filled pill.
3. **Amber ≠ gold.** Warning amber `#E8730A` stays visibly distinct from brand gold `#FFC700`.
4. **Destructive red** is reserved for irreversible actions and machine-down. Not for warnings.
5. **Density by default.** Record and review screens run two or three columns; spec data renders as a
   tile grid of `label : value` rows, never a single stacked list.
6. **Cards are consistent** — 12px radius, 1px border, soft shadow, white on a light-grey ground.
7. **Styled controls only.** No native browser input, select or file chrome.
8. **Line icons, no emoji.** One set, consistent weight and size.
9. **Three-level hierarchy.** Grouped navy rail → breadcrumb → in-record tabs, legible together.
10. **Both themes, every time.** Every surface names a foreground alongside its background.

## A6. Product rule carried in the UI

> Warnings are advisory only. Access is never blocked by a prestart result — RED raises an
> investigation instead.

---

# PART B — THE MODE LAYER

## B1. Governing principle

**Structure is not a theme.**

A mode may change how a surface feels. It may never change what a surface *is*. Route, rail grouping,
breadcrumb depth, field contract, permission gate and declared states are structural — they carry
meaning derived from `SCOPE` tags and the live schema, and no visual mode may alter, reorder or hide
them.

If a change would make two modes disagree about what a screen contains, it is not a mode change. It is
a redesign, and it does not belong in this layer.

## B2. What a schema mode is

A named set of CSS custom properties, applied to the application shell root, that every screen
consumes. Six are specified. The set is closed — do not invent a seventh without instruction.

| Mode | Type system | Character | Built for |
|---|---|---|---|
| `standard` | Lexend Deca · Inter · JetBrains Mono | **The brand (Part A), as tokens** | Default. Every screen, every tenant, unless a mode is set |
| `instrument` | Barlow Condensed · Barlow · JetBrains Mono | Dark, amber, hazard tape, huge mono figures | Workshop cockpit and wall screen |
| `field` | Archivo 800 / 400 | White, very high contrast, heavy, large targets | Daylight, glare, gloves |
| `ledger` | Instrument Serif · Public Sans · IBM Plex Mono | Airy, serif headings, cool off-white | Auth, invitation, reporting |
| `psikiq` | Michroma · Oswald · Chakra Petch · JetBrains Mono | Gold on warm void | PsikiQ-branded presentation |
| `psikiqPaper` | Michroma · Oswald · Chakra Petch · JetBrains Mono | Same brand, print-safe on white | Exported documents and certificates |

**Type is the axis that makes these genuinely different options.** A mode that only recolours is not a
choice, it is the same design in another hue. Every mode declares four faces — display, body, data and
figure — and they are not interchangeable.

`standard` is the brand. It is the resting state, the control, and the mode the application ships in.
The other five are alternatives a tenant may be given; none of them is the default.

## B3. The token contract

### Scoping

Base brand tokens (Part A) follow the shadcn convention on `:root` / dark selectors. **Mode tokens are
scoped to the shell root only** — never `:root` — so a mode can never leak beyond the shell, and the
base brand survives intact if the mode layer fails to initialise.

```html
<div class="app-shell" data-mode="standard"> … </div>
```

```css
.app-shell[data-mode="standard"]   { /* tokens */ }
.app-shell[data-mode="instrument"] { /* tokens */ }
```

### Prefix

All mode tokens take the `--m-` prefix. This keeps them from colliding with the base tokens or any
vendor tokens, and makes an unprefixed colour in a component an immediate code-review failure.

### The token set — every mode declares all 41

```
COLOUR     --m-paper --m-card --m-panel --m-rail --m-rail-ink --m-rail-active --m-rail-bar
           --m-ink --m-body --m-mute --m-rule --m-accent --m-accent-soft
SEMANTIC   --m-ok --m-ok-bg --m-warn --m-warn-bg --m-crit --m-crit-bg
TYPE       --m-font-body --m-font-disp --m-font-data --m-font-fig
           --m-disp-w --m-disp-track --m-disp-case --m-disp-scale
           --m-fig-size --m-fig-w --m-fig-track
           --m-lab-track --m-lab-w --m-weight --m-track
FORM       --m-radius --m-row --m-pad --m-fs --m-rail-w
           --m-hazard --m-brandmark-r
```

- `--m-paper` is the page ground; `--m-card` is the surface cards and tables sit on; `--m-panel` is the
  subdued fill for table heads and tiles.
- `--m-rail-bar` is the rail's active-item bar. It carries **brand identity, not mode character**: it is
  DDES gold `#FFC700` in every DDES mode and PsikiQ gold in the PsikiQ modes. It does not follow the
  mode accent.
- `--m-hazard` is the critical-edge treatment. It takes a colour **or** a gradient, which is how
  `instrument` gets hazard tape without a special case:

  ```css
  --m-hazard: repeating-linear-gradient(45deg,#F5A524 0 8px,#0E1216 8px 16px);
  ```

  Consume it as `background: var(--m-hazard)` on a 4px strip, never as `border-color` — a gradient is
  not a valid border colour and silently falls back to transparent.

A mode that omits a token is a bug, not a fallback. Every mode declares all 41 explicitly.

### Fonts

Google Fonts is the only permitted font host. One request covers every face in every mode:

```
https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;800&family=Barlow:wght@400;500;600
&family=Barlow+Condensed:wght@600;700&family=Chakra+Petch:wght@400;500;600
&family=IBM+Plex+Mono:wght@400;500&family=Instrument+Serif&family=Inter:wght@400;500;600;700
&family=JetBrains+Mono:wght@400;500;600;700&family=Lexend+Deca:wght@400;500;600;700
&family=Michroma&family=Oswald:wght@400;600&family=Public+Sans:wght@400;600&display=swap
```

Every mode declares a real fallback stack. A silent fallback to Times is the failure this prevents.

## B4. The six modes

### `standard` — the brand

The Part A tokens expressed in the mode vocabulary. Values are the light-theme brand values; the dark
theme is delivered by the base tokens, not by a separate mode.

```css
--m-paper:#EEF1F4; --m-card:#FFFFFF; --m-panel:#F2F4F7;
--m-rail:#1B2735; --m-rail-ink:#E7EBEF; --m-rail-active:#323730; --m-rail-bar:#FFC700;
--m-ink:#14181D; --m-body:#344256; --m-mute:#65758B; --m-rule:#DDE3E9;
--m-accent:#2563EB; --m-accent-soft:#E5ECFD;
--m-ok:#16A34A; --m-ok-bg:#DEF2E6; --m-warn:#E8730A; --m-warn-bg:#FBE9D8;
--m-crit:#DC2626; --m-crit-bg:#FAE1E1;
--m-font-body:'Inter',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
--m-font-disp:'Lexend Deca','Inter',system-ui,sans-serif;
--m-font-data:'JetBrains Mono',ui-monospace,'SF Mono',Menlo,Consolas,monospace;
--m-font-fig:'Lexend Deca','Inter',system-ui,sans-serif;
--m-disp-w:700; --m-disp-track:-.01em; --m-disp-case:none; --m-disp-scale:1.63;
--m-fig-size:27px; --m-fig-w:700; --m-fig-track:-.01em;
--m-lab-track:.03em; --m-lab-w:500; --m-weight:600; --m-track:.01em;
--m-radius:8px; --m-row:42px; --m-pad:18px; --m-fs:13.5px; --m-rail-w:224px;
--m-hazard:#DC2626; --m-brandmark-r:7px;
```

The control. Do not improve it — it is the brand, and its value is that it is the brand.

### `instrument` — the Workshop cockpit, generalised

```css
--m-paper:#0E1216; --m-card:#0E1216; --m-panel:#151B21;
--m-rail:#080B0E; --m-rail-ink:#A5B0BA; --m-rail-active:#1A2027; --m-rail-bar:#FFC700;
--m-ink:#F0F4F7; --m-body:#A5B0BA; --m-mute:#6C7883; --m-rule:#222A32;
--m-accent:#F5A524; --m-accent-soft:#2A1F0A;
--m-ok:#4ECB71; --m-ok-bg:#0F2417; --m-warn:#E8730A; --m-warn-bg:#2C1A0C;
--m-crit:#FF4D4D; --m-crit-bg:#2C1315;
--m-font-body:'Barlow',-apple-system,'Segoe UI',Arial,sans-serif;
--m-font-disp:'Barlow Condensed','Barlow',Arial Narrow,sans-serif;
--m-font-data:'JetBrains Mono',ui-monospace,Menlo,monospace;
--m-font-fig:'JetBrains Mono',ui-monospace,Menlo,monospace;
--m-disp-w:700; --m-disp-track:.03em; --m-disp-case:uppercase; --m-disp-scale:2.0;
--m-fig-size:34px; --m-fig-w:700; --m-fig-track:-.03em;
--m-lab-track:.16em; --m-lab-w:700; --m-weight:600; --m-track:.04em;
--m-radius:2px; --m-row:38px; --m-pad:18px; --m-fs:13px; --m-rail-w:206px;
--m-hazard:repeating-linear-gradient(45deg,#F5A524 0 8px,#0E1216 8px 16px);
--m-brandmark-r:2px;
```

Barlow was drawn for signage and transit — grotesque, low-contrast, slightly rounded — so it belongs on
plant in a way a UI font does not. Figures go to JetBrains Mono 700 so a number reads before its label
does. Fits ~40% more rows than `standard`, which is the point on a 148-machine register. Warning amber
`#E8730A` is deliberately distinct from the accent `#F5A524` and from the rail-bar gold `#FFC700`.

### `field` — daylight, glare, gloves

```css
--m-paper:#FFFFFF; --m-card:#FFFFFF; --m-panel:#F7F7F5;
--m-rail:#FFFFFF; --m-rail-ink:#1A1A1A; --m-rail-active:#FFF0DB; --m-rail-bar:#FFC700;
--m-ink:#0A0A0A; --m-body:#333333; --m-mute:#6B6B6B; --m-rule:#C9C9C4;
--m-accent:#D94F04; --m-accent-soft:#FFF0E8;
--m-ok:#1B6B34; --m-ok-bg:#E9F5EC; --m-warn:#9A5B00; --m-warn-bg:#FFF3E0;
--m-crit:#C2170F; --m-crit-bg:#FDEBE9;
--m-font-body:'Archivo',-apple-system,'Segoe UI',Arial,sans-serif;
--m-font-disp:'Archivo',-apple-system,'Segoe UI',Arial,sans-serif;
--m-font-data:'JetBrains Mono',ui-monospace,Menlo,monospace;
--m-font-fig:'Archivo',-apple-system,'Segoe UI',Arial,sans-serif;
--m-disp-w:800; --m-disp-track:-.02em; --m-disp-case:uppercase; --m-disp-scale:1.7;
--m-fig-size:38px; --m-fig-w:800; --m-fig-track:-.035em;
--m-lab-track:.1em; --m-lab-w:600; --m-weight:600; --m-track:.01em;
--m-radius:4px; --m-row:56px; --m-pad:24px; --m-fs:15px; --m-rail-w:222px;
--m-hazard:#C2170F; --m-brandmark-r:4px;
```

Everything larger and more separated than comfort requires, because the constraint is a phone at arm's
length in the sun, not taste.

### `ledger` — auth, invitation, reporting

```css
--m-paper:#FCFCFA; --m-card:#FCFCFA; --m-panel:#F5F5F1;
--m-rail:#FCFCFA; --m-rail-ink:#4A5058; --m-rail-active:#EFEFEA; --m-rail-bar:#FFC700;
--m-ink:#1A1C1F; --m-body:#4F555C; --m-mute:#8E949B; --m-rule:#E3E3DD;
--m-accent:#3F5E77; --m-accent-soft:#EDF2F6;
--m-ok:#3B6B4C; --m-ok-bg:#EFF4F0; --m-warn:#8A6420; --m-warn-bg:#F8F3E8;
--m-crit:#9E3730; --m-crit-bg:#F8EDEC;
--m-font-body:'Public Sans',-apple-system,'Segoe UI',Arial,sans-serif;
--m-font-disp:'Instrument Serif',Georgia,'Times New Roman',serif;
--m-font-data:'IBM Plex Mono',ui-monospace,Menlo,monospace;
--m-font-fig:'Instrument Serif',Georgia,serif;
--m-disp-w:400; --m-disp-track:-.01em; --m-disp-case:none; --m-disp-scale:2.1;
--m-fig-size:40px; --m-fig-w:400; --m-fig-track:-.01em;
--m-lab-track:.14em; --m-lab-w:600; --m-weight:600; --m-track:.01em;
--m-radius:3px; --m-row:54px; --m-pad:26px; --m-fs:14px; --m-rail-w:226px;
--m-hazard:#9E3730; --m-brandmark-r:3px;
```

The only serif in the set, and the contrast is the point. Suits the nine auth and invitation screens
that carry disproportionate brand weight. Poor for scanning; right for approving. `--m-disp-w:400` —
Instrument Serif ships one weight, so never call for bold.

### `psikiq` — the PsikiQ brand, whole

```css
--m-paper:#17110A; --m-card:#17110A; --m-panel:#1F1710;
--m-rail:#0F0B06; --m-rail-ink:#C9CFD6; --m-rail-active:#241B10; --m-rail-bar:#E6BE6A;
--m-ink:#EEF0F3; --m-body:#C9CFD6; --m-mute:#8A7B5E; --m-rule:#332616;
--m-accent:#E6BE6A; --m-accent-soft:#2A2013;
--m-ok:#8FBF7A; --m-ok-bg:#1B2415; --m-warn:#E8912E; --m-warn-bg:#2C1E0C;
--m-crit:#D9584E; --m-crit-bg:#2C1512;
--m-font-body:'Chakra Petch',system-ui,sans-serif;
--m-font-disp:'Oswald',Arial Narrow,sans-serif;
--m-font-data:'JetBrains Mono',ui-monospace,Menlo,monospace;
--m-font-fig:'JetBrains Mono',ui-monospace,Menlo,monospace;
--m-disp-w:600; --m-disp-track:.06em; --m-disp-case:uppercase; --m-disp-scale:2.0;
--m-fig-size:34px; --m-fig-w:700; --m-fig-track:-.02em;
--m-lab-track:.2em; --m-lab-w:500; --m-weight:500; --m-track:.05em;
--m-radius:3px; --m-row:46px; --m-pad:22px; --m-fs:13.5px; --m-rail-w:218px;
--m-hazard:linear-gradient(90deg,#E6BE6A,#B8912F 60%,#17110A);
--m-brandmark-r:3px;
```

Gold `#E6BE6A` on void `#17110A`. Michroma is extremely wide — use it for the wordmark only, never for
headings or running text; Oswald condensed carries the headings. Deliberate brand spellings, never
"correct" them: **PsikiQ**, **psikick.ai / psikick.io**.

### `psikiqPaper` — the same brand on paper

```css
--m-paper:#FFFFFF; --m-card:#FFFFFF; --m-panel:#F7F5EF;
--m-rail:#FBFAF7; --m-rail-ink:#3C3628; --m-rail-active:#F4EFE2; --m-rail-bar:#A8801E;
--m-ink:#17110A; --m-body:#4A4335; --m-mute:#8A7B5E; --m-rule:#E5DFD0;
--m-accent:#A8801E; --m-accent-soft:#FAF4E4;
--m-ok:#3F6B33; --m-ok-bg:#EFF4EA; --m-warn:#A8681E; --m-warn-bg:#FBF2E3;
--m-crit:#A63A2E; --m-crit-bg:#F9EDEB;
--m-font-body:'Chakra Petch',system-ui,sans-serif;
--m-font-disp:'Oswald',Arial Narrow,sans-serif;
--m-font-data:'JetBrains Mono',ui-monospace,Menlo,monospace;
--m-font-fig:'JetBrains Mono',ui-monospace,Menlo,monospace;
--m-disp-w:600; --m-disp-track:.06em; --m-disp-case:uppercase; --m-disp-scale:2.0;
--m-fig-size:34px; --m-fig-w:700; --m-fig-track:-.02em;
--m-lab-track:.2em; --m-lab-w:500; --m-weight:500; --m-track:.05em;
--m-radius:3px; --m-row:46px; --m-pad:22px; --m-fs:13.5px; --m-rail-w:218px;
--m-hazard:#A63A2E; --m-brandmark-r:3px;
```

A gold-on-black identity needs a light expression or every exported report, invoice and compliance
certificate reads like a nightclub flyer — and this application produces a lot of documents. Gold
re-pitched to `#A8801E` so it survives print and holds AA on white.

## B5. Invariants — no mode may touch these

- **Rail groups, their order, and their module headers.** They map to `SCOPE` tags, not to taste.
- **Breadcrumb depth and the route it reflects.** Every screen states where it sits.
- **The `FIELD / LABEL / TYPE / REQ / SOURCE / NOTES / SEES` contract.** All 741 fields survive every
  mode intact. A mode that hides a field is a defect.
- **Semantic role meaning.** `--m-ok` / `--m-warn` / `--m-crit` mean the same thing in all six modes.
  A mode may re-pitch the hue; it may never reassign the meaning. Workshop RED-clearance is always
  `--m-crit`.
- **Brand identity on the rail bar.** `--m-rail-bar` is DDES gold in every DDES mode. A mode may not
  substitute its accent for it.
- **Declared states.** Every screen keeps its empty, error and permission-refused states — the 403
  panel, the access-denied lock panel, the gated-link treatment.
- **Responsive behaviour.** The table-to-mobile-card switch is structural. Modes change the card's
  density, never whether it appears.
- **The ten rules in A5** apply inside every mode's own palette: the mode's accent leads, gold
  identifies, warning stays distinct from both accent and gold, destructive is reserved.

## B6. Implementation requirements

1. **One source of truth.** Define the six token sets once, in one module. Generate both the CSS and
   any UI that displays token values from the same object, so the readout cannot drift from what renders.
2. **Resting state.** `standard` is written into the base stylesheet so the shell renders correctly if
   the mode layer fails to initialise. A failed mode load never produces an unstyled app.
3. **Where the mode is set.** Tenant-level setting, stored against the company, resolved server-side and
   emitted into the shell's initial HTML — not applied client-side after paint. A reskin flash on every
   page load reads as a bug.
4. **Component discipline.** No component may contain a literal colour, radius, row height or font stack.
   Every one comes from a `--m-` token. This is the check that makes modes work across 190 surfaces
   rather than the twelve that were tested.
5. **Do not vary structure by mode.** No `[data-mode]` selector may set `display`, `grid-template`,
   `order`, `position` or `content`. Reaching for one of those is redesigning, not theming.

## B7. Acceptance checks

- Every one of the six modes declares all 41 tokens. No mode inherits a colour or a face from another.
- Grep the component layer for hex literals, `px` radii and font stacks: zero results outside the six
  token blocks.
- `standard` renders pixel-equivalent to the Brand & Theme Reference shell specimen.
- `instrument`, `psikiq` and `psikiqPaper` pass WCAG AA for body text and for all three semantic colours
  on their own `--m-paper`.
- In every mode, `--m-rail-bar`, `--m-accent` and `--m-warn` are distinguishable at a glance.
  `instrument` is the tightest case and must be checked on the actual wall screen.
- Every declared face actually loads. Block the Google Fonts request and confirm each mode falls back to
  its named stack, not to Times.
- `instrument` at `--m-row:38px` keeps 44px minimum touch targets on the mobile card treatment — density
  is a desktop affordance and must not reach the operator's phone.
- Switching mode on any screen changes no text, no field, no row count and no control.
- `--m-hazard` renders as a gradient in `instrument` and `psikiq`, and as a flat colour elsewhere, with
  no special-casing in the component.
- The shell renders correctly with JavaScript disabled, in `standard`, light and dark.

## B8. What not to do

- Do not add a seventh mode. The set is closed.
- Do not make `standard` prettier. It is the brand and the control.
- Do not substitute typefaces. The faces are the difference between six options and one option in six
  colours. If a face will not load, fix the loading — do not fall back to a system stack and call the
  mode done.
- Do not set Michroma below 18px or on running text. It is a wordmark face.
- Do not scope mode tokens to `:root`. They belong on the shell root, where they cannot leak.
- Do not theme the semantic colours apart from their meaning. A green `--m-crit` in some mode because it
  "looked better" is a safety defect in an application that tracks RED-clearance on plant.
- Do not let a mode's accent onto the rail bar. Gold identifies; that is not a mode decision.

---

*End of instruction. Version 1.0 — 2026-09-15.*
