// SCOPE-114 / T006 — colour utilities for ingest: parse, composite, convert, classify.
//
// `theme-tokens.ts` already owns the OUTBOUND direction — `hslTripletToRgb`,
// `hslTripletToHex`, `contrastRatio`, `meetsAA` — because everything shipped so far starts
// from a stored HSL triplet. Ingest runs the other way: the pack declares colours the way a
// designer writes them (hex, or `rgba()` for hairlines) and `ThemeTokenSet` stores bare
// opaque `"H S% L%"` triplets. This module supplies that inbound half and nothing else, so
// there is exactly one implementation of each direction rather than two that can drift.
//
// THE ALPHA PROBLEM, which is not a detail. Several systems draw all their structure with
// translucent white or black — `rgba(255,255,255,0.08)` hairlines over a near-black canvas
// is the signature move of at least four of them. `ThemeTokenSet` has no alpha channel, so
// naively dropping it would turn every one of those borders into pure white and destroy the
// look. Compositing against the system's OWN canvas preserves the intended rendered colour,
// which is why `flattenAlpha` takes the canvas as an argument rather than assuming white.

import type { HslTriplet } from "../../shared/theme-tokens";
import type { NativeMode, RawColor } from "../../shared/design-system";

/** An opaque colour in 0–255 sRGB. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** A colour that may carry alpha, exactly as the source declared it. */
export interface Rgba extends Rgb {
  /** 0–1. Fully opaque is 1. */
  a: number;
}

/** Raised when a colour value cannot be understood, naming the value and its token path. */
// [SCOPE 115 / T006] BEGIN — Colour utilities: flattenAlpha + hex to HSL triplet
export class ColorParseError extends Error {
  constructor(
    public readonly value: string,
    public readonly context: string,
  ) {
    super(`${context}: cannot parse colour ${JSON.stringify(value)}`);
    this.name = "ColorParseError";
  }
}
// [SCOPE 115 / T006] END

/**
 * Parse any colour form the pack actually uses: `#rgb`, `#rrggbb`, `#rrggbbaa`,
 * `rgb(r, g, b)` and `rgba(r, g, b, a)`.
 *
 * Returns `null` rather than throwing so callers can decide whether an unparseable value
 * is fatal (a required token) or skippable (a decorative accent). Percentage and named CSS
 * colours are deliberately unsupported: no curated system uses them, and silently accepting
 * a form we have not verified would let a wrong colour through as if it were right.
 */
// [SCOPE 115 / T006] BEGIN — Colour utilities: flattenAlpha + hex to HSL triplet
export function parseColor(value: RawColor): Rgba | null {
  const text = value.trim().toLowerCase();

  const hex = text.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    const digits = hex[1] ?? "";
    if (digits.length === 3) {
      const [r, g, b] = [...digits].map((d) => parseInt(d + d, 16));
      return { r: r ?? 0, g: g ?? 0, b: b ?? 0, a: 1 };
    }
    if (digits.length === 6 || digits.length === 8) {
      const r = parseInt(digits.slice(0, 2), 16);
      const g = parseInt(digits.slice(2, 4), 16);
      const b = parseInt(digits.slice(4, 6), 16);
      const a = digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1;
      return { r, g, b, a };
    }
    return null;
  }

  const fn = text.match(/^rgba?\(([^)]+)\)$/);
  if (fn) {
    const parts = (fn[1] ?? "").split(/[,/\s]+/).filter((p) => p !== "");
    if (parts.length < 3) return null;
    const [r, g, b] = parts.slice(0, 3).map((p) => Number(p));
    if ([r, g, b].some((n) => !Number.isFinite(n))) return null;
    const rawAlpha = parts[3];
    const a = rawAlpha === undefined ? 1 : Number(rawAlpha.replace("%", "")) / (rawAlpha.includes("%") ? 100 : 1);
    if (!Number.isFinite(a)) return null;
    return {
      r: clampByte(r ?? 0),
      g: clampByte(g ?? 0),
      b: clampByte(b ?? 0),
      a: clamp(a, 0, 1),
    };
  }

  return null;
}
// [SCOPE 115 / T006] END

/**
 * Composite a possibly-translucent colour over an opaque backdrop, yielding the colour a
 * viewer actually sees.
 *
 * Standard source-over alpha blend. An already-opaque colour is returned unchanged, so this
 * is safe to apply to every token indiscriminately rather than branching at each call site.
 */
// [SCOPE 115 / T006] BEGIN — Colour utilities: flattenAlpha + hex to HSL triplet
export function flattenAlpha(color: Rgba, backdrop: Rgb): Rgb {
  if (color.a >= 1) return { r: color.r, g: color.g, b: color.b };
  const blend = (c: number, b: number): number => Math.round(c * color.a + b * (1 - color.a));
  return {
    r: blend(color.r, backdrop.r),
    g: blend(color.g, backdrop.g),
    b: blend(color.b, backdrop.b),
  };
}
// [SCOPE 115 / T006] END

/**
 * Convert opaque sRGB to the bare `"H S% L%"` triplet form the app stores and
 * `hsl(var(--x))` wraps.
 *
 * Hue is rounded to one decimal and saturation/lightness to one decimal, matching the
 * precision already in `src/client/styles/index.css` (`"222.2 47.4% 11.2%"`) so rendered
 * output is indistinguishable from hand-authored values.
 */
// [SCOPE 115 / T006] BEGIN — Colour utilities: flattenAlpha + hex to HSL triplet
export function rgbToHslTriplet(rgb: Rgb): HslTriplet {
  const r = clamp(rgb.r, 0, 255) / 255;
  const g = clamp(rgb.g, 0, 255) / 255;
  const b = clamp(rgb.b, 0, 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;

  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return `${round1(h)} ${round1(s * 100)}% ${round1(l * 100)}%`;
}
// [SCOPE 115 / T006] END

/**
 * The whole inbound conversion in one call: parse a declared colour, composite it over the
 * given canvas if it is translucent, and return a bare HSL triplet.
 *
 * Throws `ColorParseError` naming the token path, because a required colour that cannot be
 * parsed must fail ingest loudly rather than become a silent black.
 */
// [SCOPE 115 / T006] BEGIN — Colour utilities: flattenAlpha + hex to HSL triplet
export function toHslTriplet(value: RawColor, canvas: Rgb, context: string): HslTriplet {
  const parsed = parseColor(value);
  if (!parsed) throw new ColorParseError(value, context);
  return rgbToHslTriplet(flattenAlpha(parsed, canvas));
}
// [SCOPE 115 / T006] END

/**
 * Relative luminance per WCAG 2.x, used for mode classification.
 *
 * Deliberately the same formula the shipped `contrastRatio` uses, so "is this canvas dark?"
 * and "does this pair pass AA?" cannot disagree about what lightness means.
 */
// [SCOPE 115 / T006] BEGIN — Colour utilities: flattenAlpha + hex to HSL triplet
export function relativeLuminance(rgb: Rgb): number {
  const channel = (v: number): number => {
    const s = clamp(v, 0, 255) / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}
// [SCOPE 115 / T006] END

/**
 * Classify a system by its canvas: the mode it natively defines.
 *
 * Every curated system is single-mode, so this is a real classification rather than a guess,
 * and the pack separates cleanly. Measured across all 50: every dark system's canvas sits at
 * relative luminance 0.046 or below (near-blacks from `#000000` up to a deep indigo
 * `#161cbb`), and every light one at 0.376 or above (a grey-blue `#A0A5B1`, then warm
 * off-whites from 0.90 up). That is an eightfold gap with nothing inside it, so the threshold
 * below has enormous margin and no system is classified on a coin-flip.
 *
 * 0.2 rather than 0.5, deliberately: 0.5 sits ABOVE the grey-blue canvas and misfiles it as
 * dark, which a first full run over the pack caught as an 11/39 split against a measured
 * 10/40. 0.2 is both empirically centred in the gap and principled — it is around mid-grey,
 * far below any off-white a light design would use.
 *
 * Comparing ink against canvas instead is tempting and WRONG here. One system pairs a dark
 * indigo canvas with `ink: #000000`, because its `ink` token means "text on white cards"
 * while its canvas text is a separate `ink-on-dark`. Ink comparison calls that light; its
 * white-alpha hairlines and dark canvas make it unambiguously a dark design.
 */
// [SCOPE 115 / T006] BEGIN — Colour utilities: flattenAlpha + hex to HSL triplet
export const DARK_CANVAS_LUMINANCE_THRESHOLD = 0.2;

export function detectNativeMode(canvas: Rgb): NativeMode {
  return relativeLuminance(canvas) < DARK_CANVAS_LUMINANCE_THRESHOLD ? "dark" : "light";
}
// [SCOPE 115 / T006] END

/**
 * Resolve a system's canvas colour to opaque sRGB — the backdrop every other token is
 * composited against.
 *
 * A translucent canvas would be meaningless (there is nothing behind the page), so it is
 * flattened over white, matching what a browser does with a transparent body.
 */
// [SCOPE 115 / T006] BEGIN — Colour utilities: flattenAlpha + hex to HSL triplet
export function resolveCanvas(value: RawColor, context: string): Rgb {
  const parsed = parseColor(value);
  if (!parsed) throw new ColorParseError(value, context);
  return flattenAlpha(parsed, { r: 255, g: 255, b: 255 });
}
// [SCOPE 115 / T006] END

/** Mix two opaque colours by `weight` (0 = all `from`, 1 = all `to`). */
// [SCOPE 115 / T006] BEGIN — Colour utilities: flattenAlpha + hex to HSL triplet
export function mix(from: Rgb, to: Rgb, weight: number): Rgb {
  const w = clamp(weight, 0, 1);
  return {
    r: Math.round(from.r + (to.r - from.r) * w),
    g: Math.round(from.g + (to.g - from.g) * w),
    b: Math.round(from.b + (to.b - from.b) * w),
  };
}
// [SCOPE 115 / T006] END

/** Parse a bare `"H S% L%"` triplet back into its three numbers, or null if malformed. */
// [SCOPE 115 / T006] BEGIN — Colour utilities: flattenAlpha + hex to HSL triplet
export function parseHslTriplet(triplet: HslTriplet): { h: number; s: number; l: number } | null {
// [SCOPE 115 / T006] END
  const m = triplet.trim().match(/^(-?[\d.]+)\s+(-?[\d.]+)%\s+(-?[\d.]+)%$/);
  if (!m) return null;
  const [h, s, l] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if ([h, s, l].some((n) => !Number.isFinite(n))) return null;
  return { h: h ?? 0, s: s ?? 0, l: l ?? 0 };
}

/**
 * Rebuild a triplet with a different lightness, preserving hue and saturation.
 *
 * The primitive the counterpart-mode synthesis (T008) iterates on: it nudges lightness in
 * small steps until a pair clears AA, and holding hue constant is what keeps a borrowed
 * brand colour recognisable while it moves.
 */
// [SCOPE 115 / T006] BEGIN — Colour utilities: flattenAlpha + hex to HSL triplet
export function withLightness(triplet: HslTriplet, lightness: number): HslTriplet {
  const parsed = parseHslTriplet(triplet);
  if (!parsed) return triplet;
  return `${round1(parsed.h)} ${round1(parsed.s)}% ${round1(clamp(lightness, 0, 100))}%`;
}
// [SCOPE 115 / T006] END

/** Read just the lightness component of a triplet, or null when malformed. */
// [SCOPE 115 / T006] BEGIN — Colour utilities: flattenAlpha + hex to HSL triplet
export function lightnessOf(triplet: HslTriplet): number | null {
  return parseHslTriplet(triplet)?.l ?? null;
}
// [SCOPE 115 / T006] END

// [SCOPE 115 / T006] BEGIN — Colour utilities: flattenAlpha + hex to HSL triplet
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
// [SCOPE 115 / T006] END

// [SCOPE 115 / T006] BEGIN — Colour utilities: flattenAlpha + hex to HSL triplet
function clampByte(value: number): number {
  return Math.round(clamp(value, 0, 255));
}
// [SCOPE 115 / T006] END

// [SCOPE 115 / T006] BEGIN — Colour utilities: flattenAlpha + hex to HSL triplet
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
// [SCOPE 115 / T006] END
