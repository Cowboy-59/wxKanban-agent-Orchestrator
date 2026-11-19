// SCOPE-114 / T001 — the rich design-system token model.
//
// This is the high-fidelity layer that holds what a curated design system actually
// captures, and it is a deliberate SIBLING of `ProjectTheme` (src/shared/theme-tokens.ts),
// never a replacement. The division of labour:
//
//   ProjectTheme        → 19 semantic shadcn colour tokens (light + dark), one radius,
//                         one typography summary. Every shipped consumer speaks this:
//                         the Studio, per-project apply, `renderThemeCss`, contrast checks.
//   DesignSystemTokens  → the source system's own vocabulary, verbatim: a full colour
//                         ramp, a per-role type scale with real metrics, radius and
//                         spacing scales, elevation levels, and the `components` block
//                         specifying the CONTROLS — which has no home in ProjectTheme.
//
// Both are stored per catalog entry. `mapToProjectTheme` (T007) derives the latter from
// the former so nothing downstream has to change, and the rich set supplies only what it
// uniquely holds — type scale, spacing, elevation, radius steps and control geometry.
// Colour always resolves through ProjectTheme, so a user recolouring in the Studio can
// never desynchronise a generated bundle.
//
// Every group is an OPEN keyed record on purpose. The 50 curated systems share a strong
// core vocabulary but each carries its own tail — decorative accents (`accent-lavender`),
// one-off controls (`segmented-pill`, `plan-card-featured`). Modelling the groups as
// closed interfaces would silently drop exactly the detail that makes a system distinct,
// so unrecognised keys round-trip intact and the emitters decide what to do with them.

/**
 * A raw CSS colour value exactly as the source system declared it — either an opaque
 * hex (`"#5e6ad2"`) or a translucent `rgba()` (`"rgba(255,255,255,0.05)"`).
 *
 * Kept verbatim at this layer. `ThemeTokenSet` stores opaque bare HSL triplets, so
 * `flattenAlpha` (T006) composites the translucent values against their own canvas
 * before conversion rather than discarding the alpha.
 */
export type RawColor = string;

/**
 * A design system's colour ramp, keyed by its own semantic names.
 *
 * Open by design. See `REQUIRED_COLOR_KEYS` for the keys present in all 50 curated
 * systems and `OPTIONAL_COLOR_KEYS` for the documented keys that carry a mapping
 * fallback; anything beyond both sets is a per-system extra and is preserved.
 */
export type ColorRamp = Record<string, RawColor>;

/**
 * One typographic role — the metrics for a single named step such as `display-1`.
 *
 * Values keep their source units rather than being normalised, because the emitted
 * artifacts reproduce them directly and normalising would lose the author's intent
 * (a flat `1.0` line-height on a 64px display face is a deliberate choice).
 */
export interface TypeRole {
  /**
   * The family as declared, e.g. `"Inter"`. This may name a proprietary face that is
   * not freely licensed; the *loadable* stack lives on the catalog row's `fontstack`,
   * which T005 resolves from the system's declared substitution and its showcase
   * webfont link. Keeping the declared family here lets generated documentation name
   * the intended typeface so a customer can license it themselves.
   */
  fontFamily: string;
  /** Size with its source unit, e.g. `"64px"`. */
  fontSize: string;
  /**
   * Weight as declared. Numeric or keyword, because the pack uses both — including
   * interpolated variable-font weights such as `510` and `590` that sit between the
   * conventional steps and are central to some systems' character.
   */
  fontWeight: number | string;
  /** A unitless ratio (`"1.5"`) or an explicit length. */
  lineHeight: string;
  /** Tracking, e.g. `"-1.41px"` or `"normal"`. */
  letterSpacing: string;
}

/** A design system's type scale, keyed by role name (`display-1`, `body-md`, `button`). */
export type TypeScale = Record<string, TypeRole>;

/**
 * A scale of CSS lengths keyed by step name — used for both `rounded` (`xs`…`full`)
 * and `spacing` (`xxs`…`xxl`). Values keep their source units (`"6px"`, `"9999px"`).
 */
export type LengthScale = Record<string, string>;

/**
 * Elevation levels keyed by name (`level-0`…`level-2`), each a complete CSS `box-shadow`
 * value — including `"none"`, and including multi-layer shadows with inset highlights,
 * which are a signature move in several systems.
 */
export type ElevationScale = Record<string, string>;

/**
 * One control's specification, as the source system declared it under `components`.
 *
 * Property names and values are kept verbatim, including token references in the
 * pack's own `"{colors.primary}"` / `"{rounded.sm}"` form. Resolving those references
 * is the emitter's job (T009), not this model's: the renderers map colour references
 * onto shadcn semantic classes and keep only geometry as literal values, which is what
 * guarantees no colour literal ever reaches a generated control file.
 */
export type ControlSpec = Record<string, string>;

/** A design system's control set, keyed by control name (`button-primary`, `card`). */
export type ControlSet = Record<string, ControlSpec>;

/**
 * A complete captured design system, in its own vocabulary.
 *
 * All six groups are required — every one of the 50 curated systems declares all six
 * as top-level frontmatter keys — but the keys *within* each group vary by system.
 */
export interface DesignSystemTokens {
  colors: ColorRamp;
  typography: TypeScale;
  rounded: LengthScale;
  spacing: LengthScale;
  elevation: ElevationScale;
  components: ControlSet;
}

/**
 * The single mode a captured system natively defines.
 *
 * Every curated system is single-mode: 40 are built on a white or near-white canvas,
 * 10 on a dark one. `ProjectTheme` requires both, so T008 synthesizes the counterpart.
 */
export type NativeMode = "light" | "dark";

/**
 * Which mode of a catalog entry's `ProjectTheme` was approximated rather than captured.
 *
 * `"none"` means both sides came from source data — reserved for hand-authored
 * counterparts. Anything else is the slot T008 generated, and the UI badges it so a
 * user knows which half to trust and which to tune.
 */
export type SynthesizedMode = NativeMode | "none";

/**
 * Colour keys present in all 50 curated systems, which the mapping may therefore rely
 * on without a fallback.
 *
 * Derived by measuring the pack, not assumed. A system missing any of these is a
 * malformed input and should fail ingest loudly rather than be silently defaulted.
 */
export const REQUIRED_COLOR_KEYS: readonly string[] = [
  "canvas",
  "surface",
  "ink",
  "ink-secondary",
  "ink-faint",
  "hairline",
  "primary",
  "on-primary",
];

/**
 * Documented colour keys that most but not all systems declare, each of which the
 * mapping (T007) resolves through an explicit fallback chain.
 *
 * Measured frequencies out of 50: `surface-alt` and `canvas-soft` 49, `dark` 47,
 * `primary-active` and `ink-muted` 46, `hairline-soft` 30, `success` 13, `error` 9.
 * `error` being rare is why `destructive` needs a documented default red.
 */
export const OPTIONAL_COLOR_KEYS: readonly string[] = [
  "canvas-soft",
  "surface-alt",
  "ink-muted",
  "primary-active",
  "hairline-soft",
  "dark",
  "success",
  "error",
];

/**
 * Type roles present in all 50 curated systems.
 *
 * The wider scale is well-populated but not universal — `heading-1` and `eyebrow` 49,
 * `caption` and `body-sm` 48, `heading-2` and `body-lg` 47, `title` 43, `heading-3` 36,
 * `display-2` 33 — so only these three are safe to require.
 */
export const REQUIRED_TYPE_ROLES: readonly string[] = ["display-1", "body-md", "button"];

/**
 * The controls the download bundle emits as dedicated component files.
 *
 * Measured coverage out of 50: `text-input`, `nav-bar` and `button-primary` in all 50;
 * `card` and `badge-pill` in 46; `button-secondary` in 42. Everything else a system
 * declares is an extra, handled by `CONTROL_VARIANT_THRESHOLD`.
 */
export const CORE_CONTROLS: readonly string[] = [
  "button-primary",
  "button-secondary",
  "card",
  "text-input",
  "badge-pill",
  "nav-bar",
];

/**
 * The controls present in ALL 50 systems, and therefore the only ones a parsed token set
 * may be required to carry.
 *
 * This is deliberately narrower than `CORE_CONTROLS`. The bundle emits six component
 * files, but three of them are not universal in the source data — `card` and `badge-pill`
 * appear in 46 of 50, `button-secondary` in 42. Requiring all six would reject 6 perfectly
 * valid systems as malformed, which is exactly what a first run over the real pack caught.
 * An absent non-universal control is a gap the emitter fills from its siblings, not an
 * ingest error.
 */
export const REQUIRED_CONTROLS: readonly string[] = [
  "button-primary",
  "text-input",
  "nav-bar",
];

/**
 * How many of the 50 systems must declare a non-core control before it is emitted as an
 * extra variant on its core component rather than merely documented.
 *
 * At 5 this admits `button-dark` (19 systems), `button-pill` (11) and `button-outline`
 * (6), while one-off entries such as `segmented-pill`, `progress-bar` and
 * `plan-card-featured` stay in the stored tokens and are described in the generated
 * DESIGN.md instead of becoming generated code nobody asked for. The number is a
 * judgement call rather than a derived one — see SPEC-116's open questions.
 */
export const CONTROL_VARIANT_THRESHOLD = 5;

/**
 * Report which required keys a parsed token set is missing, as human-readable paths
 * such as `"colors.canvas"` or `"typography.body-md"`.
 *
 * Returns an empty array when the set is complete. This exists so ingest failures name
 * the offending input instead of surfacing as a downstream undefined: the seed script
 * and the 50-system regression suite both report these paths alongside the pack folder,
 * which is what makes a bad addition to the pack diagnosable in one read.
 */
// [SCOPE 115 / T001] BEGIN — Rich token model (src/shared/design-system.ts)
export function missingRequiredKeys(tokens: DesignSystemTokens): string[] {
  const missing: string[] = [];
  for (const key of REQUIRED_COLOR_KEYS) {
    const value = tokens.colors[key];
    if (typeof value !== "string" || value.trim() === "") missing.push(`colors.${key}`);
  }
  for (const role of REQUIRED_TYPE_ROLES) {
    if (!tokens.typography[role]) missing.push(`typography.${role}`);
  }
  for (const control of REQUIRED_CONTROLS) {
    if (!tokens.components[control]) missing.push(`components.${control}`);
  }
  return missing;
}
// [SCOPE 115 / T001] END

/**
 * Narrow an unknown value to `DesignSystemTokens` by shape.
 *
 * Structural only: it checks that all six groups are present and are plain objects with
 * string-valued leaves (and, for `typography`, that each role carries the five metrics).
 * It deliberately does NOT check for required keys — that is `missingRequiredKeys`, kept
 * separate so a caller can distinguish "this is not a token set at all" from "this is a
 * token set with gaps", which need different handling at ingest.
 */
// [SCOPE 115 / T001] BEGIN — Rich token model (src/shared/design-system.ts)
export function isDesignSystemTokens(value: unknown): value is DesignSystemTokens {
  if (!isPlainObject(value)) return false;
  const groups = ["colors", "rounded", "spacing", "elevation"] as const;
  for (const group of groups) {
    if (!isStringRecord(value[group])) return false;
  }
  const typography = value["typography"];
  if (!isPlainObject(typography)) return false;
  for (const role of Object.values(typography)) {
    if (!isTypeRole(role)) return false;
  }
  const components = value["components"];
  if (!isPlainObject(components)) return false;
  for (const control of Object.values(components)) {
    if (!isStringRecord(control)) return false;
  }
  return true;
}
// [SCOPE 115 / T001] END

/** True for a non-null, non-array object — the shape every token group must have. */
// [SCOPE 115 / T001] BEGIN — Rich token model (src/shared/design-system.ts)
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
// [SCOPE 115 / T001] END

/** True for a plain object whose every value is a string. */
// [SCOPE 115 / T001] BEGIN — Rich token model (src/shared/design-system.ts)
function isStringRecord(value: unknown): value is Record<string, string> {
  if (!isPlainObject(value)) return false;
  return Object.values(value).every((entry) => typeof entry === "string");
}
// [SCOPE 115 / T001] END

/** True for a value carrying all five `TypeRole` metrics, with a loose `fontWeight`. */
// [SCOPE 115 / T001] BEGIN — Rich token model (src/shared/design-system.ts)
function isTypeRole(value: unknown): value is TypeRole {
  if (!isPlainObject(value)) return false;
  const weight = value["fontWeight"];
  if (typeof weight !== "string" && typeof weight !== "number") return false;
  const stringFields = ["fontFamily", "fontSize", "lineHeight", "letterSpacing"] as const;
  return stringFields.every((field) => typeof value[field] === "string");
}
// [SCOPE 115 / T001] END
