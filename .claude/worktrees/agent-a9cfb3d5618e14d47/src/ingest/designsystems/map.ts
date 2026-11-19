// SCOPE-114 / T007 — map a captured design system onto the 19 shadcn semantic tokens.
//
// This is the bridge that lets 50 richly-captured systems flow through machinery that was
// built for six hand-authored presets. Every shipped consumer — the Studio, per-project
// apply, `renderThemeCss`, the contrast badges — speaks `ThemeTokenSet` and nothing else, so
// the mapping is what makes the catalog usable without touching any of them.
//
// It is a FIXED TABLE with declared fallback chains, and deliberately contains no AI call.
// A model asked to "map these colours sensibly" would produce a different catalog on every
// re-seed, so the same system could change appearance between environments with nothing in
// git to explain it. Every key below was chosen against measured frequencies across the
// pack (see REQUIRED_COLOR_KEYS / OPTIONAL_COLOR_KEYS), so each fallback covers a gap that
// actually exists rather than a hypothetical one.
//
// ONE REPAIR STEP IS NOT OPTIONAL. The obvious mapping — `foreground` from `ink` — is wrong
// for at least one real system, whose `ink: #000000` means "text on white cards" while its
// page canvas is a deep indigo. Mapped literally that yields black text on a dark ground:
// unreadable, and it would sail through as valid because both values are well-formed. So
// after mapping, the background/foreground pair is contrast-checked and repaired from the
// system's own alternative ink tokens. See `resolveForeground`.

import type { HslTriplet, ThemeTokenSet, ThemeTypography } from "../../shared/theme-tokens";
import { contrastRatio } from "../../shared/theme-tokens";
import type { ColorRamp, DesignSystemTokens } from "../../shared/design-system";
import { type Rgb, parseColor, resolveCanvas, rgbToHslTriplet, toHslTriplet } from "./color";

/**
 * The red used for `destructive` when a system declares no error colour.
 *
 * Only 9 of the 50 systems define one — these are marketing-site analyses, and a marketing
 * page rarely shows a destructive action. Rather than leave the token empty (which would
 * render as an invalid CSS value) or invent a hue from the brand palette (which would make
 * "delete" look like a feature), this is the value already shipped in
 * `WXKANBAN_DEFAULT_THEME`, so an unstyled destructive button matches the rest of the app.
 */
export const DEFAULT_DESTRUCTIVE: HslTriplet = "0 84.2% 60.2%";
export const DEFAULT_DESTRUCTIVE_FOREGROUND: HslTriplet = "0 0% 100%";

/** WCAG AA for normal-size text. The repair step aims to clear this, not merely to differ. */
const AA_NORMAL = 4.5;

/** What one mapping run produced, including anything it had to repair or default. */
export interface MappingResult {
  tokens: ThemeTokenSet;
  /** Human-readable notes: which fallbacks fired, which tokens were defaulted or repaired. */
  notes: string[];
}

/**
 * Map a captured colour ramp onto the 19 shadcn tokens for the mode the system natively
 * defines.
 *
 * `context` is used only in error messages — pass the pack folder name.
 */
// [SCOPE 115 / T007] BEGIN — mapToProjectTheme — fixed mapping table
export function mapToTokenSet(tokens: DesignSystemTokens, context: string): MappingResult {
  const colors = tokens.colors;
  const notes: string[] = [];

  // Everything composites against the system's own canvas, so it is resolved first and
  // separately: a translucent token flattened over the wrong backdrop is a wrong colour.
  const canvasRaw = colors["canvas"];
  if (!canvasRaw) throw new Error(`${context}: colors.canvas is required for mapping`);
  const canvas = resolveCanvas(canvasRaw, `${context}.colors.canvas`);

  const pick = (keys: string[], fallback?: HslTriplet, label?: string): HslTriplet => {
    for (const key of keys) {
      const raw = colors[key];
      if (raw === undefined || raw.trim() === "") continue;
      // A non-colour value (one system declares a conic gradient) is skipped, not fatal —
      // the chain simply moves on to the next candidate.
      if (!parseColor(raw)) {
        notes.push(`${label ?? keys[0]}: skipped non-colour ${key}`);
        continue;
      }
      if (key !== keys[0]) notes.push(`${label ?? keys[0]}: fell back to ${key}`);
      return toHslTriplet(raw, canvas, `${context}.colors.${key}`);
    }
    if (fallback !== undefined) {
      notes.push(`${label ?? keys[0]}: defaulted`);
      return fallback;
    }
    throw new Error(`${context}: no value for ${label ?? keys[0]} (tried ${keys.join(", ")})`);
  };

  const background = rgbToHslTriplet(canvas);
  const foreground = resolveForeground(colors, canvas, context, notes);

  // Surfaces. `card` and `popover` are the same surface in every captured system — none of
  // them distinguishes a popover from a card — so both map to `surface`, and both fall back
  // through the lifted section colour before landing on the canvas itself.
  const surface = pick(["surface", "canvas-soft", "canvas"], undefined, "card");

  const set: ThemeTokenSet = {
    background,
    foreground,
    card: surface,
    cardForeground: foreground,
    popover: surface,
    popoverForeground: foreground,

    primary: pick(["primary"], undefined, "primary"),
    primaryForeground: pick(["on-primary"], undefined, "primaryForeground"),

    // The sunken chip fill. 49 of 50 declare `surface-alt`; the lifted section colour is
    // the nearest equivalent for the one that does not.
    secondary: pick(["surface-alt", "canvas-soft", "surface"], undefined, "secondary"),
    secondaryForeground: pick(["ink-secondary", "ink"], foreground, "secondaryForeground"),

    muted: pick(["canvas-soft", "surface-alt", "surface"], undefined, "muted"),
    // 46 of 50 declare `ink-muted`; `ink-faint` is the same idea one step quieter.
    mutedForeground: pick(["ink-muted", "ink-faint", "ink-secondary"], foreground, "mutedForeground"),

    // Accent is the system's decorative voice. Its own `accent-*` tail comes first — that is
    // the colour the designer reserved for delight — then the pressed brand state, then the
    // brand itself, so accent is never empty and never louder than intended.
    accent: pick([...accentKeys(colors), "primary-active", "primary"], undefined, "accent"),
    accentForeground: pick(["on-primary", "ink"], foreground, "accentForeground"),

    destructive: pick(["error"], DEFAULT_DESTRUCTIVE, "destructive"),
    destructiveForeground: pick(["on-primary"], DEFAULT_DESTRUCTIVE_FOREGROUND, "destructiveForeground"),

    // Structure. Most dark systems draw it with translucent white, which is exactly why
    // these went through `flattenAlpha` — the raw value is white and the rendered value is
    // a dark grey.
    border: pick(["hairline", "hairline-soft", "hairline-strong"], undefined, "border"),
    input: pick(["hairline", "hairline-soft", "surface-alt"], undefined, "input"),
    ring: pick(["primary"], undefined, "ring"),
  };

  return { tokens: set, notes };
}
// [SCOPE 115 / T007] END

/**
 * Choose the foreground that is actually readable on the canvas.
 *
 * `ink` is right for 49 of the 50 systems and is tried first. The exception matters: one
 * system's `ink` is pure black because that token describes text on its white cards, while
 * its page canvas is a deep indigo — a literal map gives black on dark. So the candidates
 * are tried in order of intent and the first that clears AA against the canvas wins.
 *
 * If none clears it, the fallback is plain white or black, whichever contrasts more. That is
 * a deliberate last resort: an approximate but READABLE foreground is strictly better than a
 * faithful but unreadable one, and the note it leaves tells the operator to look.
 */
// [SCOPE 115 / T007] BEGIN — mapToProjectTheme — fixed mapping table
function resolveForeground(
  colors: ColorRamp,
  canvas: Rgb,
  context: string,
  notes: string[],
): HslTriplet {
  const background = rgbToHslTriplet(canvas);
  const candidates = ["ink", "ink-on-dark", "on-dark", "ink-secondary", "contrast"];

  let best: { triplet: HslTriplet; ratio: number; key: string } | null = null;
  for (const key of candidates) {
    const raw = colors[key];
    if (raw === undefined || raw.trim() === "" || !parseColor(raw)) continue;
    const triplet = toHslTriplet(raw, canvas, `${context}.colors.${key}`);
    const ratio = contrastRatio(triplet, background);
    if (ratio >= AA_NORMAL) {
      if (key !== "ink") {
        notes.push(`foreground: repaired from ${key} (ink contrast was too low on this canvas)`);
      }
      return triplet;
    }
    if (!best || ratio > best.ratio) best = { triplet, ratio, key };
  }

  const white = "0 0% 100%";
  const black = "0 0% 0%";
  const forced = contrastRatio(white, background) >= contrastRatio(black, background) ? white : black;
  notes.push(
    `foreground: no declared ink clears AA on this canvas (best was ${best?.key ?? "none"} at ` +
      `${best ? best.ratio.toFixed(2) : "n/a"}:1) — forced to ${forced === white ? "white" : "black"}`,
  );
  return forced;
}
// [SCOPE 115 / T007] END

/**
 * The system's own decorative accent keys, in declaration order.
 *
 * Declaration order is meaningful: these documents list the accent a system leans on most
 * first. Sorting alphabetically would pick `accent-amber` over `accent-pink` for no reason
 * other than the alphabet, so insertion order is preserved.
 */
// [SCOPE 115 / T007] BEGIN — mapToProjectTheme — fixed mapping table
export function accentKeys(colors: ColorRamp): string[] {
  return Object.keys(colors).filter((k) => k.startsWith("accent-") && !k.startsWith("accent-on"));
}
// [SCOPE 115 / T007] END

/**
 * The corner radius for the theme, as a rem string.
 *
 * `rounded.md` is the control radius in this vocabulary — the value a card or a button
 * actually uses — so it represents the system's shape better than the smallest or largest
 * step would. Converted px→rem at the 16px root the app assumes, because `ProjectTheme.radius`
 * feeds `--radius` and the rest of the app expresses it in rem.
 */
// [SCOPE 115 / T007] BEGIN — mapToProjectTheme — fixed mapping table
export function radiusFromTokens(tokens: DesignSystemTokens): string {
  const candidates = ["md", "lg", "sm", "base", "default"];
  for (const key of candidates) {
    const value = tokens.rounded[key];
    if (!value) continue;
    const px = value.match(/^(-?[\d.]+)px$/);
    if (px) return `${round3(Number(px[1]) / 16)}rem`;
    const rem = value.match(/^(-?[\d.]+)rem$/);
    if (rem) return `${round3(Number(rem[1]))}rem`;
    if (/^\d+$/.test(value)) return `${round3(Number(value) / 16)}rem`;
  }
  return "0.5rem";
}
// [SCOPE 115 / T007] END

/**
 * Summarise the type scale into the two fields `ProjectTheme.typography` carries.
 *
 * A lossy summary on purpose: `ProjectTheme` predates the rich model and holds only a family
 * and a freeform scale note. The full per-role metrics stay in `DesignSystemTokens`, which is
 * what the download bundle reads — so nothing is lost, it is just not duplicated here.
 * `fontStack` comes from the showcase, which is authoritative about what actually loads.
 */
// [SCOPE 115 / T007] BEGIN — mapToProjectTheme — fixed mapping table
export function typographyFromTokens(
  tokens: DesignSystemTokens,
  fontStack: string,
): ThemeTypography {
  const body = tokens.typography["body-md"] ?? tokens.typography["body-sm"];
  const display = tokens.typography["display-1"] ?? tokens.typography["heading-1"];
  const basePx = pxOf(body?.fontSize) ?? 16;
  const displayPx = pxOf(display?.fontSize);
  const ratio = displayPx && basePx ? displayPx / basePx : null;
  const scale = ratio
    ? `${basePx}px base, display ${displayPx}px (${round2(ratio)}x)`
    : `${basePx}px base`;
  return {
    fontFamily: fontStack || body?.fontFamily || "system-ui, sans-serif",
    scale,
  };
}
// [SCOPE 115 / T007] END

// [SCOPE 115 / T007] BEGIN — mapToProjectTheme — fixed mapping table
function pxOf(value: string | undefined): number | null {
  if (!value) return null;
  const m = value.match(/^(-?[\d.]+)px$/);
  return m ? Number(m[1]) : null;
}
// [SCOPE 115 / T007] END

// [SCOPE 115 / T007] BEGIN — mapToProjectTheme — fixed mapping table
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
// [SCOPE 115 / T007] END

// [SCOPE 115 / T007] BEGIN — mapToProjectTheme — fixed mapping table
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
// [SCOPE 115 / T007] END
