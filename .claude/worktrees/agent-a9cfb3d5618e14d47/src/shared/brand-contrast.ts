/**
 * Widened contrast reporting for brand schemas — SPEC-126 / T003.
 *
 * The shipped theme report checks exactly two pairs: foreground against background, and
 * primary-foreground against primary. Run against a real brand both can pass comfortably while
 * the status colours are unreadable — which is worse than no check, because it ends the
 * conversation.
 *
 * This report covers, per mode:
 *   - body and heading text on the mode's own surface
 *   - the accent colour, because it carries links and the primary action
 *   - each semantic role against its surface AND against its own background chip
 *   - the identity mark, at the non-text threshold, because a bar is a graphical object
 *
 * Two deliberate properties:
 *
 *   1. Verdicts are computed on the UNROUNDED ratio. A measured value that lands exactly on a
 *      threshold sits inside the noise of two-decimal display rounding, and a gate whose verdict
 *      depends on presentation is not deterministic. `ratio` is rounded for display only.
 *
 *   2. Nothing is repaired. This reports; it never alters a stored value. A brand hue is the
 *      customer's property.
 */
import type { BrandSchema, ModeTokenSet } from "./brand-schema.js";

/** WCAG 2.1 minimum for normal body text. */
export const AA_TEXT = 4.5;
/** WCAG 2.1 minimum for large text (roughly 18.66px bold or 24px regular). */
export const AA_LARGE_TEXT = 3.0;
/** WCAG 2.1 minimum for graphical objects and user-interface components. */
export const AA_NON_TEXT = 3.0;

/** What a pair is being judged as, which is what selects its threshold. */
export type ContrastUse = "text" | "large-text" | "non-text";

export interface BrandContrastResult {
  mode: string;
  /** Stable identifier, e.g. `contrast:field:--m-accent:on-surface`. */
  check: string;
  /** Human-readable pairing, e.g. `--m-accent on --m-paper`. */
  pair: string;
  foreground: string;
  background: string;
  use: ContrastUse;
  /** Rounded to two decimals FOR DISPLAY ONLY. Never used to decide `passes`. */
  ratio: number;
  /** The unrounded measurement the verdict was computed from. */
  exactRatio: number;
  threshold: number;
  passes: boolean;
}

export interface BrandContrastReport {
  /** True only when every measured pair passes. */
  passes: boolean;
  results: BrandContrastResult[];
  failures: BrandContrastResult[];
  /** Pairs skipped because a token was absent or not a resolvable colour. */
  skipped: { mode: string; pair: string; reason: string }[];
}

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Parse `#RGB` or `#RRGGBB` to 0-255 channels. Returns null for anything else — a gradient, a font stack, a length. */
// [SCOPE 126 / T003] BEGIN — Widened contrast report
export function parseHexColor(value: string): { r: number; g: number; b: number } | null {
// [SCOPE 126 / T003] END
  const v = value.trim();
  if (!HEX_RE.test(v)) return null;
  let hex = v.slice(1);
  if (hex.length === 3) {
    hex = (hex[0] ?? "") + (hex[0] ?? "") + (hex[1] ?? "") + (hex[1] ?? "") + (hex[2] ?? "") + (hex[2] ?? "");
  }
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

// [SCOPE 126 / T003] BEGIN — Widened contrast report
function channelLuminance(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
// [SCOPE 126 / T003] END

/** WCAG relative luminance. */
// [SCOPE 126 / T003] BEGIN — Widened contrast report
export function relativeLuminance(value: string): number | null {
  const rgb = parseHexColor(value);
  if (!rgb) return null;
  return (
    0.2126 * channelLuminance(rgb.r) +
    0.7152 * channelLuminance(rgb.g) +
    0.0722 * channelLuminance(rgb.b)
  );
}
// [SCOPE 126 / T003] END

/** WCAG contrast ratio between two hex colours, unrounded. Null when either is not a hex colour. */
// [SCOPE 126 / T003] BEGIN — Widened contrast report
export function hexContrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}
// [SCOPE 126 / T003] END

// [SCOPE 126 / T003] BEGIN — Widened contrast report
function thresholdFor(use: ContrastUse): number {
  if (use === "text") return AA_TEXT;
  if (use === "large-text") return AA_LARGE_TEXT;
  return AA_NON_TEXT;
}
// [SCOPE 126 / T003] END

// [SCOPE 126 / T003] BEGIN — Widened contrast report
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
// [SCOPE 126 / T003] END

// [SCOPE 126 / T003] BEGIN — Widened contrast report
function measure(
  mode: ModeTokenSet,
  fgToken: string,
  bgToken: string,
  use: ContrastUse,
  suffix: string,
): BrandContrastResult | { skip: { mode: string; pair: string; reason: string } } {
// [SCOPE 126 / T003] END
  const pair = `${fgToken} on ${bgToken}`;
  const fg = mode.tokens[fgToken];
  const bg = mode.tokens[bgToken];
  if (typeof fg !== "string" || typeof bg !== "string") {
    return { skip: { mode: mode.name, pair, reason: "one or both tokens are not declared by this mode" } };
  }
  const exact = hexContrastRatio(fg, bg);
  if (exact === null) {
    return {
      skip: {
        mode: mode.name,
        pair,
        reason: "one or both values are not a hex colour — a gradient, length or font stack cannot be contrast-checked",
      },
    };
  }
  const threshold = thresholdFor(use);
  return {
    mode: mode.name,
    check: `contrast:${mode.name}:${fgToken}:${suffix}`,
    pair,
    foreground: fg,
    background: bg,
    use,
    ratio: round2(exact),
    exactRatio: exact,
    threshold,
    // Compared on the UNROUNDED value — see the note at the top of this file.
    passes: exact >= threshold,
  };
}

/** Every pairing this report measures for one mode, driven by the schema's role map. */
// [SCOPE 126 / T003] BEGIN — Widened contrast report
export function contrastForMode(schema: BrandSchema, mode: ModeTokenSet): BrandContrastReport {
  const results: BrandContrastResult[] = [];
  const skipped: { mode: string; pair: string; reason: string }[] = [];
  const roles = schema.roles;

  const push = (r: BrandContrastResult | { skip: { mode: string; pair: string; reason: string } }): void => {
    if ("skip" in r) skipped.push(r.skip);
    else results.push(r);
  };

  // Running text and headings on the mode's own ground.
  push(measure(mode, roles.body, roles.surface, "text", "on-surface"));
  push(measure(mode, roles.ink, roles.surface, "text", "on-surface"));

  // The action colour. Omitting this is what previously let two modes ship an unreadable link.
  push(measure(mode, roles.accent, roles.surface, "text", "on-surface"));

  // Status roles, both on the page ground and on their own chip. A brand may use either, and a
  // role that fails in both pairings fails however it is rendered.
  for (const sem of roles.semantic) {
    push(measure(mode, sem.fg, roles.surface, "text", "on-surface"));
    if (sem.bg) push(measure(mode, sem.fg, sem.bg, "text", "on-chip"));
  }

  // The identity mark is a graphical object, so it is judged at the non-text threshold. Applying
  // the body-text threshold to a 3px bar produces false failures; applying none at all lets an
  // identity mark disappear into its own rail.
  if (roles.identity && roles.identitySurface) {
    push(measure(mode, roles.identity, roles.identitySurface, "non-text", "on-rail"));
  }

  const failures = results.filter((r) => !r.passes);
  return { passes: failures.length === 0, results, failures, skipped };
}
// [SCOPE 126 / T003] END

/** The whole schema, every mode. */
// [SCOPE 126 / T003] BEGIN — Widened contrast report
export function brandContrastReport(schema: BrandSchema): BrandContrastReport {
  const results: BrandContrastResult[] = [];
  const skipped: { mode: string; pair: string; reason: string }[] = [];
  for (const mode of Object.values(schema.modes)) {
    const r = contrastForMode(schema, mode);
    results.push(...r.results);
    skipped.push(...r.skipped);
  }
  const failures = results.filter((x) => !x.passes);
  return { passes: failures.length === 0, results, failures, skipped };
}
// [SCOPE 126 / T003] END

/**
 * A plain-language summary naming each failure with its measurement.
 *
 * Written to be read by the customer whose brand it concerns, so it states what was measured and
 * against what, and never implies the value has been or will be changed.
 */
// [SCOPE 126 / T003] BEGIN — Widened contrast report
export function describeContrastFailures(report: BrandContrastReport): string[] {
  return report.failures.map(
    (f) =>
      `${f.mode}: ${f.pair} measures ${f.ratio}:1, below the ${f.threshold}:1 minimum for ` +
      `${f.use === "non-text" ? "graphical objects" : f.use === "large-text" ? "large text" : "body text"}.`,
  );
}
// [SCOPE 126 / T003] END
