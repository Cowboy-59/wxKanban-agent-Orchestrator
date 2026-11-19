/**
 * Perceptual distinguishability for brand schemas — SPEC-126 / T004.
 *
 * A brand may require that its identity, accent and warning colours "stay visibly distinct" or be
 * "distinguishable at a glance". A gate cannot test an adjective, so this turns that intent into a
 * measured distance with a stated threshold.
 *
 * The check is not academic. A real brand schema was found to set its identity colour and its
 * accent colour to the SAME value in two of its modes — a distance of exactly zero — while its own
 * acceptance criteria claimed the two must be distinguishable. No phrase-based check can fail that;
 * a number fails it immediately.
 *
 * CIE76 is used deliberately over the more accurate CIE94 or CIEDE2000. The threshold here is a
 * coarse "could a person confuse these across a workshop bay" judgement, not a print-matching
 * tolerance, and CIE76 is simple enough that a reader can confirm the implementation is right.
 * The cost of that choice is that CIE76 overstates differences in saturated blues; the threshold
 * is set with that in mind rather than pretending the model is uniform.
 */
import { parseHexColor } from "./brand-contrast.js";
import type { BrandSchema, ModeTokenSet } from "./brand-schema.js";

/**
 * Minimum CIE76 distance for two colours to count as distinguishable at a glance.
 *
 * Set to 20 from measurement rather than taste. In the reference corpus the mode its own authors
 * called the tightest case measures 21.1 and 24.2 between the three colours it must keep apart, so
 * 20 admits the design its authors intended while still failing a pair that is literally identical.
 * Raising it would reject a shipping brand; lowering it toward single digits would admit pairs no
 * one could tell apart.
 */
export const MIN_DISTINGUISHABLE_DELTA_E = 20;

export interface LabColor {
  L: number;
  a: number;
  b: number;
}

export interface DistinguishabilityResult {
  mode: string;
  check: string;
  /** The two roles being compared, e.g. `identity vs accent`. */
  pair: string;
  tokenA: string;
  tokenB: string;
  valueA: string;
  valueB: string;
  /** CIE76 distance, rounded to one decimal for display. */
  deltaE: number;
  exactDeltaE: number;
  threshold: number;
  passes: boolean;
}

export interface DistinguishabilityReport {
  passes: boolean;
  results: DistinguishabilityResult[];
  failures: DistinguishabilityResult[];
  skipped: { mode: string; pair: string; reason: string }[];
}

/** sRGB hex to CIE L*a*b*, via XYZ with a D65 white point. */
// [SCOPE 126 / T004] BEGIN — CIE76 distinguishability check
export function hexToLab(value: string): LabColor | null {
  const rgb = parseHexColor(value);
  if (!rgb) return null;

  const lin = (c: number): number => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const r = lin(rgb.r);
  const g = lin(rgb.g);
  const b = lin(rgb.b);

  // D65 white point.
  const X = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const Y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const Z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;

  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X);
  const fy = f(Y);
  const fz = f(Z);

  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}
// [SCOPE 126 / T004] END

/** CIE76 distance between two hex colours. Null when either is not a hex colour. */
// [SCOPE 126 / T004] BEGIN — CIE76 distinguishability check
export function deltaE76(a: string, b: string): number | null {
  const la = hexToLab(a);
  const lb = hexToLab(b);
  if (!la || !lb) return null;
  return Math.sqrt(Math.pow(la.L - lb.L, 2) + Math.pow(la.a - lb.a, 2) + Math.pow(la.b - lb.b, 2));
}
// [SCOPE 126 / T004] END

// [SCOPE 126 / T004] BEGIN — CIE76 distinguishability check
function compare(
  mode: ModeTokenSet,
  tokenA: string,
  tokenB: string,
  label: string,
): DistinguishabilityResult | { skip: { mode: string; pair: string; reason: string } } {
// [SCOPE 126 / T004] END
  const pair = label;
  const valueA = mode.tokens[tokenA];
  const valueB = mode.tokens[tokenB];
  if (typeof valueA !== "string" || typeof valueB !== "string") {
    return { skip: { mode: mode.name, pair, reason: "one or both tokens are not declared by this mode" } };
  }
  const exact = deltaE76(valueA, valueB);
  if (exact === null) {
    return {
      skip: {
        mode: mode.name,
        pair,
        reason: "one or both values are not a hex colour — a gradient or font stack has no perceptual distance",
      },
    };
  }
  return {
    mode: mode.name,
    check: `distinguishable:${mode.name}:${tokenA}:${tokenB}`,
    pair,
    tokenA,
    tokenB,
    valueA,
    valueB,
    deltaE: Math.round(exact * 10) / 10,
    exactDeltaE: exact,
    threshold: MIN_DISTINGUISHABLE_DELTA_E,
    // Compared on the unrounded distance, for the same reason contrast verdicts are.
    passes: exact >= MIN_DISTINGUISHABLE_DELTA_E,
  };
}

/**
 * The three colours a brand most often requires be told apart: the identity mark, the accent, and
 * the warning status. Each pairing is measured independently, because two of the three being
 * distinct says nothing about the third.
 */
// [SCOPE 126 / T004] BEGIN — CIE76 distinguishability check
export function distinguishabilityForMode(
  schema: BrandSchema,
  mode: ModeTokenSet,
): DistinguishabilityReport {
  const results: DistinguishabilityResult[] = [];
  const skipped: { mode: string; pair: string; reason: string }[] = [];
  const push = (
    r: DistinguishabilityResult | { skip: { mode: string; pair: string; reason: string } },
  ): void => {
    if ("skip" in r) skipped.push(r.skip);
    else results.push(r);
  };

  const identity = schema.roles.identity;
  const accent = schema.roles.accent;
  const warn = schema.roles.semantic.find((s) => s.name.toLowerCase().startsWith("warn"))?.fg ?? null;

  if (identity) push(compare(mode, identity, accent, "identity vs accent"));
  if (identity && warn) push(compare(mode, identity, warn, "identity vs warning"));
  if (warn) push(compare(mode, accent, warn, "accent vs warning"));

  const failures = results.filter((r) => !r.passes);
  return { passes: failures.length === 0, results, failures, skipped };
}
// [SCOPE 126 / T004] END

/** The whole schema, every mode. */
// [SCOPE 126 / T004] BEGIN — CIE76 distinguishability check
export function brandDistinguishabilityReport(schema: BrandSchema): DistinguishabilityReport {
  const results: DistinguishabilityResult[] = [];
  const skipped: { mode: string; pair: string; reason: string }[] = [];
  for (const mode of Object.values(schema.modes)) {
    const r = distinguishabilityForMode(schema, mode);
    results.push(...r.results);
    skipped.push(...r.skipped);
  }
  const failures = results.filter((x) => !x.passes);
  return { passes: failures.length === 0, results, failures, skipped };
}
// [SCOPE 126 / T004] END

/** Plain-language summary of each failure, naming the measurement. */
// [SCOPE 126 / T004] BEGIN — CIE76 distinguishability check
export function describeDistinguishabilityFailures(report: DistinguishabilityReport): string[] {
  return report.failures.map((f) => {
    const identical = f.exactDeltaE === 0 ? " — the two values are identical" : "";
    return (
      `${f.mode}: ${f.pair} (${f.tokenA} ${f.valueA} against ${f.tokenB} ${f.valueB}) measures ` +
      `a perceptual distance of ${f.deltaE}, below the ${f.threshold} needed to tell them apart at a glance${identical}.`
    );
  });
}
// [SCOPE 126 / T004] END
