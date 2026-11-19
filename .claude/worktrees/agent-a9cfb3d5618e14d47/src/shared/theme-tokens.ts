// SCOPE-062 / T001 — the executable Theme model.
//
// This is the machine-usable layer that makes "execute" real, distinct from the
// coarse, prose-level `DesignTokens` in `stack-defaults.ts` (kept for the stack.md
// narrative and seeded from a theme in T006). A `ProjectTheme` carries a full light
// and dark `ThemeTokenSet` aligned to the shadcn/Tailwind variable set already used
// by the app (`src/client/styles/index.css`), so it renders straight to real
// `theme.css` / Tailwind / shadcn artifacts for the customer's generated product.
//
// Token values are bare HSL triplets ("H S% L%") — the exact form the app's CSS
// variables store and `hsl(var(--x))` wraps — so rendered output drops in verbatim.

import type { AppType, DesignTokens } from "./stack-defaults";

/** A bare HSL triplet, e.g. "222.2 47.4% 11.2%" (no `hsl()` wrapper). */
export type HslTriplet = string;

/** The 19 semantic shadcn color tokens, each a bare HSL triplet. */
export interface ThemeTokenSet {
  background: HslTriplet;
  foreground: HslTriplet;
  card: HslTriplet;
  cardForeground: HslTriplet;
  popover: HslTriplet;
  popoverForeground: HslTriplet;
  primary: HslTriplet;
  primaryForeground: HslTriplet;
  secondary: HslTriplet;
  secondaryForeground: HslTriplet;
  muted: HslTriplet;
  mutedForeground: HslTriplet;
  accent: HslTriplet;
  accentForeground: HslTriplet;
  destructive: HslTriplet;
  destructiveForeground: HslTriplet;
  border: HslTriplet;
  input: HslTriplet;
  ring: HslTriplet;
}

export interface ThemeTypography {
  /** CSS font-family stack. */
  fontFamily: string;
  /** Base size + scale note, e.g. "16px base, 1.25 modular scale". */
  scale: string;
}

/** How a theme was arrived at — for provenance and re-derivation.
 *  `"url"` (SCOPE-106) = borrowed from a live website, captured via headless browser
 *  and mapped by AI onto this token set (sourceRef holds the captured site URL). */
export type ThemeSource = "preset" | "gallery-ai" | "logo" | "prompt" | "manual" | "url";

/** A fully-captured, executable project theme. The structured object is the source
 *  of truth; theme.css / Tailwind / shadcn output is derived from it. Radius and
 *  typography are mode-independent, so they live once on the theme (not per token set). */
export interface ProjectTheme {
  source: ThemeSource;
  /** Preset key, cited URL, prompt text, or null. */
  sourceRef: string | null;
  light: ThemeTokenSet;
  dark: ThemeTokenSet;
  /** Corner radius, e.g. "0.5rem". */
  radius: string;
  typography: ThemeTypography;
}

/** Token key → CSS custom-property name (the `--x` shadcn variables in index.css). */
export const TOKEN_CSS_VARS: Record<keyof ThemeTokenSet, string> = {
  background: "--background",
  foreground: "--foreground",
  card: "--card",
  cardForeground: "--card-foreground",
  popover: "--popover",
  popoverForeground: "--popover-foreground",
  primary: "--primary",
  primaryForeground: "--primary-foreground",
  secondary: "--secondary",
  secondaryForeground: "--secondary-foreground",
  muted: "--muted",
  mutedForeground: "--muted-foreground",
  accent: "--accent",
  accentForeground: "--accent-foreground",
  destructive: "--destructive",
  destructiveForeground: "--destructive-foreground",
  border: "--border",
  input: "--input",
  ring: "--ring",
};

export const THEME_TOKEN_KEYS = Object.keys(TOKEN_CSS_VARS) as Array<keyof ThemeTokenSet>;

/** The wxKanban built-in default theme — the ultimate resolution fallback (FR-011).
 *  Values mirror `src/client/styles/index.css` so a project with no theme and no
 *  company default resolves to the app's own (AA-passing) look. */
export const WXKANBAN_DEFAULT_THEME: ProjectTheme = {
  source: "preset",
  sourceRef: "wxkanban-default",
  light: {
    background: "0 0% 100%",
    foreground: "222.2 84% 4.9%",
    card: "0 0% 100%",
    cardForeground: "222.2 84% 4.9%",
    popover: "0 0% 100%",
    popoverForeground: "222.2 84% 4.9%",
    primary: "222.2 47.4% 11.2%",
    primaryForeground: "210 40% 98%",
    secondary: "210 40% 96.1%",
    secondaryForeground: "222.2 47.4% 11.2%",
    muted: "210 40% 96.1%",
    mutedForeground: "215.4 16.3% 46.9%",
    accent: "210 40% 96.1%",
    accentForeground: "222.2 47.4% 11.2%",
    destructive: "0 84.2% 60.2%",
    destructiveForeground: "210 40% 98%",
    border: "214.3 31.8% 91.4%",
    input: "214.3 31.8% 91.4%",
    ring: "222.2 84% 4.9%",
  },
  dark: {
    background: "222.2 84% 4.9%",
    foreground: "210 40% 98%",
    card: "222.2 84% 4.9%",
    cardForeground: "210 40% 98%",
    popover: "222.2 84% 4.9%",
    popoverForeground: "210 40% 98%",
    primary: "210 40% 98%",
    primaryForeground: "222.2 47.4% 11.2%",
    secondary: "217.2 32.6% 17.5%",
    secondaryForeground: "210 40% 98%",
    muted: "217.2 32.6% 17.5%",
    mutedForeground: "215 20.2% 65.1%",
    accent: "217.2 32.6% 17.5%",
    accentForeground: "210 40% 98%",
    destructive: "0 62.8% 30.6%",
    destructiveForeground: "210 40% 98%",
    border: "217.2 32.6% 17.5%",
    input: "217.2 32.6% 17.5%",
    ring: "212.7 26.8% 83.9%",
  },
  radius: "0.5rem",
  typography: {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Helvetica Neue", sans-serif',
    scale: "16px base, 1.25 modular scale",
  },
};

// ── Renderers (the "execute" core) ───────────────────────────────────────────

// [SCOPE 062 / T002] BEGIN — `THEME_PRESETS` registry + `presetsForAppType()` (web-first…
function renderVarBlock(tokens: ThemeTokenSet, extra: string[] = []): string {
  const lines = THEME_TOKEN_KEYS.map((k) => `  ${TOKEN_CSS_VARS[k]}: ${tokens[k]};`);
  return [...lines, ...extra].join("\n");
}
// [SCOPE 062 / T002] END

/** Render a theme to real CSS — `:root { … }` (light + --radius) and `.dark { … }`.
 *  Drops straight into a Tailwind/shadcn `index.css` (matches the app's own pattern). */
// [SCOPE 062 / T002] BEGIN — `THEME_PRESETS` registry + `presetsForAppType()` (web-first…
export function renderThemeCss(theme: ProjectTheme): string {
  return [
    ":root {",
    renderVarBlock(theme.light, [`  --radius: ${theme.radius};`]),
    "}",
    "",
    ".dark {",
    renderVarBlock(theme.dark),
    "}",
    "",
  ].join("\n");
}
// [SCOPE 062 / T002] END

/** Human-readable Tailwind integration notes (font family + how vars map). */
// [SCOPE 062 / T002] BEGIN — `THEME_PRESETS` registry + `presetsForAppType()` (web-first…
export function renderTailwindThemeNotes(theme: ProjectTheme): string {
  return [
    "# Theme — Tailwind integration",
    "",
    "1. Paste the generated `:root` / `.dark` blocks into your global stylesheet.",
    "2. Map the shadcn semantic tokens via `hsl(var(--token))` (see shadcn preset).",
    `3. Font family: ${theme.typography.fontFamily}`,
    `4. Type scale: ${theme.typography.scale}`,
    `5. Radius: \`--radius: ${theme.radius}\` → \`rounded-[var(--radius)]\`.`,
    "",
  ].join("\n");
}
// [SCOPE 062 / T002] END

/** Render a shadcn registry-style theme object (cssVars light/dark). */
// [SCOPE 062 / T002] BEGIN — `THEME_PRESETS` registry + `presetsForAppType()` (web-first…
export function renderShadcnTheme(theme: ProjectTheme, name = "project-theme"): string {
  const toVars = (tokens: ThemeTokenSet): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const k of THEME_TOKEN_KEYS) out[TOKEN_CSS_VARS[k].slice(2)] = tokens[k];
    return out;
  };
  return JSON.stringify(
    {
      name,
      type: "registry:theme",
      cssVars: {
        light: { ...toVars(theme.light), radius: theme.radius },
        dark: toVars(theme.dark),
      },
    },
    null,
    2,
  );
}
// [SCOPE 062 / T002] END

// ── WCAG contrast (FR-008) ───────────────────────────────────────────────────

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Parse a bare HSL triplet ("H S% L%") into RGB [0..255]. Returns null if unparseable. */
// [SCOPE 062 / T002] BEGIN — `THEME_PRESETS` registry + `presetsForAppType()` (web-first…
export function hslTripletToRgb(triplet: HslTriplet): Rgb | null {
  const m = triplet
    .trim()
    .match(/^(-?\d*\.?\d+)\s+(-?\d*\.?\d+)%\s+(-?\d*\.?\d+)%$/);
  if (!m) return null;
  const h = parseFloat(m[1]);
  const s = parseFloat(m[2]) / 100;
  const l = parseFloat(m[3]) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hp >= 0 && hp < 1) [r1, g1, b1] = [c, x, 0];
  else if (hp < 2) [r1, g1, b1] = [x, c, 0];
  else if (hp < 3) [r1, g1, b1] = [0, c, x];
  else if (hp < 4) [r1, g1, b1] = [0, x, c];
  else if (hp < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  const mm = l - c / 2;
  return {
    r: Math.round((r1 + mm) * 255),
    g: Math.round((g1 + mm) * 255),
    b: Math.round((b1 + mm) * 255),
  };
}
// [SCOPE 062 / T002] END

// [SCOPE 062 / T002] BEGIN — `THEME_PRESETS` registry + `presetsForAppType()` (web-first…
function relativeLuminance({ r, g, b }: Rgb): number {
// [SCOPE 062 / T002] END
  const lin = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio (1..21) between two HSL-triplet colors; 0 if either unparseable. */
// [SCOPE 062 / T002] BEGIN — `THEME_PRESETS` registry + `presetsForAppType()` (web-first…
export function contrastRatio(a: HslTriplet, b: HslTriplet): number {
  const ra = hslTripletToRgb(a);
  const rb = hslTripletToRgb(b);
  if (!ra || !rb) return 0;
  const la = relativeLuminance(ra);
  const lb = relativeLuminance(rb);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
// [SCOPE 062 / T002] END

/** AA threshold: 4.5 for normal text, 3.0 for large/UI. */
// [SCOPE 062 / T002] BEGIN — `THEME_PRESETS` registry + `presetsForAppType()` (web-first…
export function meetsAA(ratio: number, large = false): boolean {
  return ratio >= (large ? 3 : 4.5);
}
// [SCOPE 062 / T002] END

export interface ContrastResult {
  pair: string;
  ratio: number;
  passesAA: boolean;
}

/** Contrast results for the critical pairs of a single token set. */
// [SCOPE 062 / T002] BEGIN — `THEME_PRESETS` registry + `presetsForAppType()` (web-first…
export function tokenSetContrast(tokens: ThemeTokenSet): ContrastResult[] {
  const round = (n: number): number => Math.round(n * 100) / 100;
  return [
    {
      pair: "foreground / background",
      ratio: round(contrastRatio(tokens.foreground, tokens.background)),
      passesAA: meetsAA(contrastRatio(tokens.foreground, tokens.background)),
    },
    {
      pair: "primary-foreground / primary",
      ratio: round(contrastRatio(tokens.primaryForeground, tokens.primary)),
      passesAA: meetsAA(contrastRatio(tokens.primaryForeground, tokens.primary)),
    },
  ];
}
// [SCOPE 062 / T002] END

/** Contrast report for both light and dark of a theme. */
// [SCOPE 062 / T002] BEGIN — `THEME_PRESETS` registry + `presetsForAppType()` (web-first…
export function themeContrastReport(theme: ProjectTheme): {
  light: ContrastResult[];
  dark: ContrastResult[];
  passesAA: boolean;
} {
// [SCOPE 062 / T002] END
  const light = tokenSetContrast(theme.light);
  const dark = tokenSetContrast(theme.dark);
  return { light, dark, passesAA: [...light, ...dark].every((r) => r.passesAA) };
}

/** Convenience used by presets/tests: does every critical pair pass AA in both modes? */
// [SCOPE 062 / T002] BEGIN — `THEME_PRESETS` registry + `presetsForAppType()` (web-first…
export function themePassesAA(theme: ProjectTheme): boolean {
  return themeContrastReport(theme).passesAA;
}
// [SCOPE 062 / T002] END

// ── Back-compat: seed the coarse Stack DesignTokens from a theme (FR-012) ─────
// The Stack document keeps its prose-level "Design Tokens" line; this maps a rich
// ProjectTheme down to the five coarse colors + typography + spacing so existing
// stack consumers keep rendering unchanged, seeded from the chosen theme.

/** Convert a bare HSL triplet to a #rrggbb hex string (falls back to #000000). */
// [SCOPE 062 / T006] BEGIN — Back-compat — seed Stack doc design-tokens line from the th…
export function hslTripletToHex(triplet: HslTriplet): string {
  const rgb = hslTripletToRgb(triplet);
  if (!rgb) return "#000000";
  const h = (n: number): string => n.toString(16).padStart(2, "0");
  return `#${h(rgb.r)}${h(rgb.g)}${h(rgb.b)}`;
}
// [SCOPE 062 / T006] END

/** Map a ProjectTheme to the coarse Stack `DesignTokens` (FR-012). Uses the light
 *  token set for the five colors; spacing radius comes from the theme radius. */
// [SCOPE 062 / T006] BEGIN — Back-compat — seed Stack doc design-tokens line from the th…
export function themeToStackDesignTokens(theme: ProjectTheme): DesignTokens {
  const l = theme.light;
  return {
    colors: {
      primary: hslTripletToHex(l.primary),
      secondary: hslTripletToHex(l.secondary),
      neutral: hslTripletToHex(l.mutedForeground),
      background: hslTripletToHex(l.background),
      foreground: hslTripletToHex(l.foreground),
    },
    typography: { fontFamily: theme.typography.fontFamily, scale: theme.typography.scale },
    spacing: { base: "4px (Tailwind spacing scale)", radius: theme.radius },
  };
}
// [SCOPE 062 / T006] END

// ── Curated presets (FR-003) ─────────────────────────────────────────────────
// A small registry of ready-to-apply themes, modelled on the shadcn theme
// registry palettes (slate / blue / emerald / rose / violet / amber). Each is a
// complete ProjectTheme and MUST pass WCAG AA (enforced by the theme-tokens
// tests). v1 is web-first: every preset is tagged `bestFor: ["web"]`, so
// presetsForAppType() returns none for desktop/mobile and those surfaces fall
// back to galleries + build-your-own (mirrors galleriesForAppType in
// lookfeel-galleries.ts). All presets share the AA-passing neutral base of the
// wxKanban default theme and vary only the primary/ring accent.

export interface ThemePreset {
  /** Stable key recorded as the theme's sourceRef when applied. */
  key: string;
  /** Display name. */
  name: string;
  /** One-line description of the look. */
  description: string;
  /** App types this preset is offered for (web-first in v1). */
  bestFor: AppType[];
  /** The concrete, ready-to-apply theme. */
  theme: ProjectTheme;
}

interface AccentSpec {
  /** light: primary, primary-foreground, ring */
  lp: HslTriplet;
  lpf: HslTriplet;
  lr: HslTriplet;
  /** dark: primary, primary-foreground, ring */
  dp: HslTriplet;
  dpf: HslTriplet;
  dr: HslTriplet;
}

// [SCOPE 062 / T002] BEGIN — `THEME_PRESETS` registry + `presetsForAppType()` (web-first…
function accentPreset(
  key: string,
  name: string,
  description: string,
  a: AccentSpec,
): ThemePreset {
  return {
    key,
    name,
    description,
    bestFor: ["web"],
    theme: {
      source: "preset",
      sourceRef: key,
      light: {
        ...WXKANBAN_DEFAULT_THEME.light,
        primary: a.lp,
        primaryForeground: a.lpf,
        ring: a.lr,
      },
      dark: {
        ...WXKANBAN_DEFAULT_THEME.dark,
        primary: a.dp,
        primaryForeground: a.dpf,
        ring: a.dr,
      },
      radius: "0.5rem",
      typography: { ...WXKANBAN_DEFAULT_THEME.typography },
    },
  };
}
// [SCOPE 062 / T002] END

export const THEME_PRESETS: readonly ThemePreset[] = [
  {
    key: "wxkanban-slate",
    name: "Slate (wxKanban default)",
    description: "The neutral wxKanban look — calm slate with near-black primary.",
    bestFor: ["web"],
    theme: { ...WXKANBAN_DEFAULT_THEME, sourceRef: "wxkanban-slate" },
  },
  accentPreset("blue", "Blue", "Confident, classic blue primary on a slate base.", {
    lp: "221 83% 40%",
    lpf: "0 0% 100%",
    lr: "221 83% 40%",
    dp: "217 91% 60%",
    dpf: "222 47% 11%",
    dr: "217 91% 60%",
  }),
  accentPreset("emerald", "Emerald", "Fresh green primary — growth, finance, health.", {
    lp: "142 72% 29%",
    lpf: "0 0% 100%",
    lr: "142 72% 29%",
    dp: "142 69% 58%",
    dpf: "144 61% 10%",
    dr: "142 69% 58%",
  }),
  accentPreset("rose", "Rose", "Warm rose primary — bold, consumer, lifestyle.", {
    lp: "346 77% 42%",
    lpf: "0 0% 100%",
    lr: "346 77% 42%",
    dp: "346 77% 60%",
    dpf: "355 100% 12%",
    dr: "346 77% 60%",
  }),
  accentPreset("violet", "Violet", "Modern violet primary — creative, premium, AI.", {
    lp: "262 52% 47%",
    lpf: "0 0% 100%",
    lr: "262 52% 47%",
    dp: "263 70% 72%",
    dpf: "263 45% 12%",
    dr: "263 70% 72%",
  }),
  accentPreset("amber", "Amber", "Energetic amber primary — warm, friendly, retail.", {
    lp: "32 95% 34%",
    lpf: "0 0% 100%",
    lr: "32 95% 34%",
    dp: "43 96% 56%",
    dpf: "26 83% 14%",
    dr: "43 96% 56%",
  }),
] as const;

/** Presets relevant to a given application type (FR-002/003 presents these).
 *  Mirrors galleriesForAppType(); web-first, so desktop/mobile get [] in v1. */
// [SCOPE 062 / T002] BEGIN — `THEME_PRESETS` registry + `presetsForAppType()` (web-first…
export function presetsForAppType(appType: AppType): ThemePreset[] {
  return THEME_PRESETS.filter((p) => p.bestFor.includes(appType));
}
// [SCOPE 062 / T002] END

// A theme is per app type; this re-exports the canonical AppType for callers that
// only import the theme module.
export type { AppType };
