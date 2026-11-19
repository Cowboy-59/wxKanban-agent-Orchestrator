// SCOPE-114 / T008 — synthesize the mode a captured system does not define.
//
// Every one of the 50 curated systems is single-mode: 40 are built on a white or near-white
// canvas, 10 on a dark one. `ProjectTheme` requires BOTH a light and a dark `ThemeTokenSet`,
// because the customer's generated product has a dark-mode toggle. Something has to fill the
// other slot.
//
// The honest options were: leave the counterpart identical to the native mode (so the toggle
// silently does nothing — a visible bug), ask an LLM (non-deterministic across re-seeds, so
// the same catalog entry could change appearance between environments), or derive it
// mechanically and SAY SO. This is the third. The result is explicitly labelled via the
// catalog row's `synthesizedmode`, the browse card badges it "approximated — tune in Studio",
// and the Studio is already an AA-guarded editor, so the fix path exists for the ones that
// land ugly.
//
// It will land ugly sometimes, and that is a known trade rather than a surprise. Mechanically
// inverting a warm off-white canvas produces a muddy brown, not the considered dark palette a
// designer would have drawn. Being approximately right and clearly marked beats being
// confidently wrong.
//
// AA is not negotiable, though. Whatever this produces is verified with the SHIPPED
// `themePassesAA` — not a second contrast implementation that could disagree with the badges
// the Studio shows — and if it cannot converge it falls back to the app's own default set for
// that mode and records the failure. Nothing ships unverified and nothing fails silently.

import {
  WXKANBAN_DEFAULT_THEME,
  contrastRatio,
  meetsAA,
  themePassesAA,
  type HslTriplet,
  type ProjectTheme,
  type ThemeTokenSet,
} from "../../shared/theme-tokens";
import type { NativeMode } from "../../shared/design-system";
import { lightnessOf, parseHslTriplet, withLightness } from "./color";

/** How far a single nudge moves lightness, in percentage points. */
export const LIGHTNESS_STEP = 2;

/** Enough 2% steps to sweep the full 0–100 range from either end. */
const MAX_STEPS = 50;

/** How close to the pole a synthesized canvas is pushed. */
const LIGHT_CANVAS_FLOOR = 97;
const DARK_CANVAS_CEILING = 6;

/**
 * Foreground/surface pairs to repair, widest first.
 *
 * Deliberately broader than the two pairs `tokenSetContrast` gates on. The gate is the
 * contract, but a synthesized set whose muted or accent text is unreadable would technically
 * pass and still look broken, so everything with an obvious pairing gets nudged. The gate
 * still has the final say.
 */
const REPAIR_PAIRS: ReadonlyArray<readonly [keyof ThemeTokenSet, keyof ThemeTokenSet]> = [
  ["foreground", "background"],
  ["cardForeground", "card"],
  ["popoverForeground", "popover"],
  ["primaryForeground", "primary"],
  ["secondaryForeground", "secondary"],
  ["mutedForeground", "muted"],
  ["accentForeground", "accent"],
  ["destructiveForeground", "destructive"],
];

/** What one synthesis run produced, and how much of it is trustworthy. */
export interface SynthesisResult {
  tokens: ThemeTokenSet;
  /** True when AA was reached using the system's own hues. */
  converged: boolean;
  /** True when synthesis gave up and the app's built-in set for that mode was used. */
  fellBack: boolean;
  notes: string[];
}

/**
 * Derive the counterpart-mode token set from the one a system actually defines.
 *
 * Four moves, in order:
 *   1. Invert lightness on every token, holding hue and saturation — this is what keeps a
 *      borrowed brand colour recognisable instead of merely "some other colour".
 *   2. Push the canvas and its surfaces to the target pole, so a synthesized light mode is
 *      genuinely light rather than a washed-out mid grey.
 *   3. Nudge each foreground in 2% steps until its pair clears AA.
 *   4. Verify with `themePassesAA`, and fall back to the app default for that mode if not.
 */
// [SCOPE 115 / T008] BEGIN — synthesizeCounterpartMode with AA verification
export function synthesizeCounterpart(
  native: ThemeTokenSet,
  nativeMode: NativeMode,
): SynthesisResult {
  const targetMode: NativeMode = nativeMode === "dark" ? "light" : "dark";
  const notes: string[] = [];

  const inverted = invertLightness(native, targetMode);
  const repaired = repairPairs(inverted, notes);

  // Assemble the pair in the right slots so the shipped gate sees exactly what will ship.
  const candidate: ProjectTheme = {
    ...WXKANBAN_DEFAULT_THEME,
    light: targetMode === "light" ? repaired : native,
    dark: targetMode === "dark" ? repaired : native,
  };

  if (themePassesAA(candidate)) {
    return { tokens: repaired, converged: true, fellBack: false, notes };
  }

  // Could not converge. Use the app's own AA-passing set for that mode rather than shipping
  // something the badges would flag — and record it, because a silent fallback would look
  // identical to a success.
  const fallback = WXKANBAN_DEFAULT_THEME[targetMode];
  notes.push(
    `synthesis: could not reach AA for the ${targetMode} mode after ${MAX_STEPS} lightness ` +
      `steps — fell back to the wxKanban default ${targetMode} set`,
  );
  return { tokens: { ...fallback }, converged: false, fellBack: true, notes };
}
// [SCOPE 115 / T008] END

/**
 * Flip every token's lightness while holding hue and saturation.
 *
 * Inverting lightness alone is what preserves identity: an electric indigo at 61% lightness
 * becomes the same indigo at 39%, still unmistakably that brand. Inverting hue as well would
 * turn it orange, which is a different design.
 *
 * Backgrounds and surfaces then get pushed toward the target pole. Straight inversion of a
 * warm off-white (94% lightness) yields 6% — fine — but inverting a mid-tone surface can
 * land in the middle of the range, and a "light mode" whose canvas is 55% grey is not a
 * light mode. The floor and ceiling keep the canvas committed.
 */
// [SCOPE 115 / T008] BEGIN — synthesizeCounterpartMode with AA verification
function invertLightness(set: ThemeTokenSet, targetMode: NativeMode): ThemeTokenSet {
  const flip = (triplet: HslTriplet): HslTriplet => {
    const l = lightnessOf(triplet);
    return l === null ? triplet : withLightness(triplet, 100 - l);
  };
  const commit = (triplet: HslTriplet, pole: "surface" | "lifted"): HslTriplet => {
    const flipped = flip(triplet);
    const l = lightnessOf(flipped);
    if (l === null) return flipped;
    if (targetMode === "light") {
      // Lifted surfaces sit slightly off the pole so cards remain distinguishable.
      const floor = pole === "surface" ? LIGHT_CANVAS_FLOOR : LIGHT_CANVAS_FLOOR - 4;
      return withLightness(flipped, Math.max(l, floor));
    }
    const ceiling = pole === "surface" ? DARK_CANVAS_CEILING : DARK_CANVAS_CEILING + 3;
    return withLightness(flipped, Math.min(l, ceiling));
  };

  return {
    background: commit(set.background, "surface"),
    foreground: flip(set.foreground),
    card: commit(set.card, "lifted"),
    cardForeground: flip(set.cardForeground),
    popover: commit(set.popover, "lifted"),
    popoverForeground: flip(set.popoverForeground),
    primary: flip(set.primary),
    primaryForeground: flip(set.primaryForeground),
    secondary: commit(set.secondary, "lifted"),
    secondaryForeground: flip(set.secondaryForeground),
    muted: commit(set.muted, "lifted"),
    mutedForeground: flip(set.mutedForeground),
    accent: flip(set.accent),
    accentForeground: flip(set.accentForeground),
    destructive: flip(set.destructive),
    destructiveForeground: flip(set.destructiveForeground),
    // Structure follows the canvas: a dark mode wants faint light hairlines and a light mode
    // faint dark ones, which is exactly what inverting the border lightness gives.
    border: flip(set.border),
    input: flip(set.input),
    ring: set.ring,
  };
}
// [SCOPE 115 / T008] END

/**
 * Nudge each foreground until its pair clears AA, moving ONLY the text colour.
 *
 * Exported (via `repairContrast`) because it is needed on the NATIVE set too, not just the
 * synthesized one. Ten of the 50 captured systems ship a `primary` / `on-primary` pair that
 * genuinely fails WCAG AA at normal text size — white on a bright feather-green measures
 * 2.09:1, and several brand indigos and violets land between 2.3 and 4.4. That is a real
 * property of those marketing sites, not a mapping error, and it only became visible when the
 * assembled themes were run through the shipped gate.
 *
 * SCOPE-062 makes AA a first-class acceptance criterion, so these are repaired rather than
 * passed through. The repair moves the FOREGROUND only and never the brand colour: the
 * electric green stays exactly the electric green, and the label on top darkens until it is
 * readable. That is the change an accessibility-minded designer would make, it preserves the
 * identity that made the system worth borrowing, and it stays editable in the Studio for
 * anyone who would rather have the original pairing.
 *
 * Direction is decided per pair by which way actually helps — toward white on a dark surface,
 * toward black on a light one — so one implementation serves both modes. A pair that cannot be
 * fixed by moving lightness is left alone and reported, because silently forcing pure black or
 * white would hide a genuinely bad result from the gate.
 */
// [SCOPE 115 / T008] BEGIN — synthesizeCounterpartMode with AA verification
export function repairContrast(set: ThemeTokenSet): { tokens: ThemeTokenSet; notes: string[] } {
  const notes: string[] = [];
  return { tokens: repairPairs(set, notes), notes };
}

function repairPairs(set: ThemeTokenSet, notes: string[]): ThemeTokenSet {
  const out: ThemeTokenSet = { ...set };
  for (const [fgKey, bgKey] of REPAIR_PAIRS) {
    const bg = out[bgKey];
    let fg = out[fgKey];
    if (meetsAA(contrastRatio(fg, bg))) continue;

    const fgParsed = parseHslTriplet(fg);
    if (!fgParsed) continue;

    // Search BOTH directions and take whichever clears AA with the smaller move.
    //
    // Picking a direction up front from the background's HSL lightness is wrong, and wrongly
    // in a way that looks right: contrast depends on relative LUMINANCE, not HSL lightness,
    // and the two disagree sharply for saturated hues. A bright feather-green sits at 40% HSL
    // lightness — "dark, so lighten the text" — while its luminance is high enough that only
    // DARKER text can ever pass. With white already at 100 the search then broke on its first
    // step and reported the pair unfixable. Searching outward in both directions removes the
    // guess entirely, and preferring the smaller move keeps the result closest to what the
    // source system actually specified.
    let moved = false;
    for (let step = 1; step <= MAX_STEPS && !moved; step += 1) {
      for (const direction of [-1, 1] as const) {
        const nextL = fgParsed.l + direction * step * LIGHTNESS_STEP;
        if (nextL < 0 || nextL > 100) continue;
        const candidate = withLightness(fg, nextL);
        if (meetsAA(contrastRatio(candidate, bg))) {
          fg = candidate;
          moved = true;
          break;
        }
      }
    }
    if (moved) {
      out[fgKey] = fg;
      notes.push(`synthesis: nudged ${String(fgKey)} to clear AA against ${String(bgKey)}`);
    } else {
      notes.push(
        `synthesis: could not clear AA for ${String(fgKey)} / ${String(bgKey)} by moving lightness`,
      );
    }
  }
  return out;
}
// [SCOPE 115 / T008] END

/**
 * Assemble the finished `ProjectTheme` from a native set and its synthesized counterpart.
 *
 * Kept here rather than in the seed script so the slot assignment — which set goes in
 * `light` and which in `dark` — has exactly one implementation. Getting that backwards would
 * produce a catalog where every entry renders inverted, and it would look like a data problem
 * rather than a one-line logic problem.
 */
// [SCOPE 115 / T008] BEGIN — synthesizeCounterpartMode with AA verification
export function assembleTheme(
  native: ThemeTokenSet,
  synthesized: ThemeTokenSet,
  nativeMode: NativeMode,
  radius: string,
  typography: ProjectTheme["typography"],
  sourceRef: string,
): ProjectTheme {
  return {
    source: "preset",
    sourceRef,
    light: nativeMode === "light" ? native : synthesized,
    dark: nativeMode === "dark" ? native : synthesized,
    radius,
    typography,
  };
}
// [SCOPE 115 / T008] END
