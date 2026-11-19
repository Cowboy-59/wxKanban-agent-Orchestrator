/**
 * Brand Schema — the model half of SCOPE-129 (SPEC-126).
 *
 * A brand schema is a named, tenant-owned object that carries a base theme, an extension token
 * map, a typeface set, N named modes under a declared token contract, and the brand's own rules
 * as data.
 *
 * Two deliberate boundaries:
 *
 *  1. `ThemeTokenSet` is imported unchanged and never widened. Fifty seeded design-system rows
 *     and every preset derive from its current shape, so extension tokens ride *beside* it the
 *     way the design-system catalog's rich `tokens` already does.
 *
 *  2. Nothing here hardcodes a mode count or a token count. "Six modes of forty-one tokens, and
 *     the set is closed" is a property of one customer's schema instance, expressed as data on
 *     that instance — not a constant in wxKanban.
 */
import type { HslTriplet, ProjectTheme } from "./theme-tokens.js";

/** A raw CSS value as a mode declares it: `#EEF1F4`, `8px`, `700`, a font stack, a gradient. */
export type CssValue = string;

/**
 * What a contract token holds. This is what lets the validator and the contrast report stay
 * generic: only `color` tokens are contrast-checked, and only `paint` may legally be a gradient.
 *
 * `paint` exists for the critical-edge treatment, which takes a colour *or* a gradient. A
 * gradient is not a valid border colour and silently resolves to transparent, so a paint token
 * must be consumed as a background — a rule carried in the schema's own rule set, not here.
 */
export type TokenKind = "color" | "paint" | "length" | "fontstack" | "number" | "keyword";

/** One entry in a schema's declared token contract. */
export interface ContractToken {
  /** The custom-property name exactly as a mode declares it, e.g. `--m-paper`. */
  name: string;
  kind: TokenKind;
}

/**
 * How a mode relates to the base light/dark axis.
 *
 * Required rather than inferred. A palette cannot be trusted to reveal intent: a white-surfaced
 * mode under an operating-system dark preference renders mixed unless the mode says which it is.
 */
export type ModeAxis = "light" | "dark" | "preference";

/** One typeface role: the family, plus the stack it falls back to when the family fails to load. */
export interface TypeFace {
  family: string;
  /** Never empty. A face with no fallback falls back to a browser default serif, which is the failure this prevents. */
  fallback: string[];
}

/** The four type roles every schema declares. They are not interchangeable. */
export interface FaceSet {
  display: TypeFace;
  body: TypeFace;
  data: TypeFace;
  figure: TypeFace;
}

/** A single named mode: a complete set of values for every token in the schema's contract. */
export interface ModeTokenSet {
  name: string;
  axis: ModeAxis;
  /** Exactly one mode in a schema carries this. It is what the base stylesheet renders. */
  resting: boolean;
  /** Keyed by contract token name. A mode that omits one is a validation error, never a fallback. */
  tokens: Record<string, CssValue>;
}

/**
 * Which contract tokens play which part, so that checks are written against roles rather than
 * against one customer's token names.
 */
export interface SemanticPair {
  /** Role name as the brand uses it, e.g. `ok`, `warn`, `crit`. */
  name: string;
  /** The token used as the foreground for this role. */
  fg: string;
  /** The token used as the companion background chip, when the brand declares one. */
  bg: string | null;
}

export interface RoleMap {
  /** The page ground a mode's text sits on. */
  surface: string;
  /** Running body text. */
  body: string;
  /** Headings and high-emphasis text. */
  ink: string;
  /** Links and the primary action. Contrast-checked, because it carries text. */
  accent: string;
  /** The identity mark. Checked at the non-text threshold, because it is a graphical object. */
  identity: string | null;
  /** The surface the identity mark sits on. */
  identitySurface: string | null;
  /** Status roles whose meaning is fixed across every mode. */
  semantic: SemanticPair[];
}

/** What kind of statement a rule makes. */
export type BrandRuleKind =
  /** Something that must remain true in every mode. */
  | "invariant"
  /** Something that must never be done. */
  | "prohibition"
  /** An acceptance check the brand states about itself. */
  | "check"
  /** A product rule the interface carries, which no automated reading of a product can recover. */
  | "product";

export interface BrandRule {
  id: string;
  text: string;
  kind: BrandRuleKind;
  /**
   * Whether this rule can be decided by a machine. The flag is what allows an honest split
   * between what a gate enforces and what a person must look at, instead of one list that
   * overstates how much is actually checked.
   */
  mechanical: boolean;
}

/** How a schema came to exist. */
export type BrandSchemaSource =
  /** Read from a product the customer had already built. */
  | "captured"
  /** Hand-authored by the customer, or produced by interview and then revised. */
  | "authored"
  /** Started from the shipped template. */
  | "template";

/**
 * A value the brand declared that validation found wanting, alongside what was done about it.
 * Recorded on the schema so that an accepted failure is written down rather than forgotten.
 */
export interface RecordedException {
  /** The check that failed, e.g. `contrast:standard:--m-warn`. */
  check: string;
  /** What was measured. */
  measured: string;
  /** Why it was accepted rather than corrected. */
  reason: string;
  acceptedAt: string;
}

export interface BrandSchema {
  name: string;
  version: string;
  source: BrandSchemaSource;
  /** Where it came from: a captured origin, or the document it was parsed from. */
  sourceRef: string | null;
  /** The shipped nineteen-token theme, light and dark, unchanged. */
  base: ProjectTheme;
  /** Identity, rail and status colours the base set has no room for. Keyed by custom-property name. */
  extensions: Record<string, HslTriplet>;
  typefaces: FaceSet;
  /** The token names every mode must declare. Declared per schema, never assumed. */
  contract: ContractToken[];
  roles: RoleMap;
  /** Keyed by mode name. A schema with one mode is valid: a built product has one look. */
  modes: Record<string, ModeTokenSet>;
  /** Whether new modes may be added. The brand's own statement about itself, recorded not assumed. */
  closed: boolean;
  rules: BrandRule[];
  /** Failures the customer chose to accept, with reasons. Empty is the normal case. */
  exceptions: RecordedException[];
}

/** The token names a schema's contract declares, in declaration order. */
// [SCOPE 126 / T001] BEGIN — BrandSchema model in src/shared/brand-schema.ts
export function contractTokenNames(schema: BrandSchema): string[] {
  return schema.contract.map((t) => t.name);
}
// [SCOPE 126 / T001] END

/** The contract tokens of a given kind — how the contrast report finds the colours. */
// [SCOPE 126 / T001] BEGIN — BrandSchema model in src/shared/brand-schema.ts
export function contractTokensOfKind(schema: BrandSchema, kind: TokenKind): ContractToken[] {
  return schema.contract.filter((t) => t.kind === kind);
}
// [SCOPE 126 / T001] END

/** The single resting mode, or null when a schema declares none or several. */
// [SCOPE 126 / T001] BEGIN — BrandSchema model in src/shared/brand-schema.ts
export function restingMode(schema: BrandSchema): ModeTokenSet | null {
  const resting = Object.values(schema.modes).filter((m) => m.resting);
  return resting.length === 1 ? (resting[0] as ModeTokenSet) : null;
}
// [SCOPE 126 / T001] END

/** Every typeface a schema declares, across all four roles. */
// [SCOPE 126 / T001] BEGIN — BrandSchema model in src/shared/brand-schema.ts
export function declaredFaces(schema: BrandSchema): TypeFace[] {
  const f = schema.typefaces;
  return [f.display, f.body, f.data, f.figure];
}
// [SCOPE 126 / T001] END

/** Rules a machine can decide. The complement is what a person must check. */
// [SCOPE 126 / T001] BEGIN — BrandSchema model in src/shared/brand-schema.ts
export function mechanicalRules(schema: BrandSchema): BrandRule[] {
  return schema.rules.filter((r) => r.mechanical);
}
// [SCOPE 126 / T001] END

/** Rules that need a human. Kept as its own function so neither half is reached by accident. */
// [SCOPE 126 / T001] BEGIN — BrandSchema model in src/shared/brand-schema.ts
export function advisoryRules(schema: BrandSchema): BrandRule[] {
  return schema.rules.filter((r) => !r.mechanical);
}
// [SCOPE 126 / T001] END

// [SCOPE 126 / T001] BEGIN — BrandSchema model in src/shared/brand-schema.ts
function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}
// [SCOPE 126 / T001] END

// [SCOPE 126 / T001] BEGIN — BrandSchema model in src/shared/brand-schema.ts
function isTypeFace(v: unknown): v is TypeFace {
  if (typeof v !== "object" || v === null) return false;
  const f = v as Partial<TypeFace>;
  return typeof f.family === "string" && isStringArray(f.fallback);
}
// [SCOPE 126 / T001] END

// [SCOPE 126 / T001] BEGIN — BrandSchema model in src/shared/brand-schema.ts
function isFaceSet(v: unknown): v is FaceSet {
  if (typeof v !== "object" || v === null) return false;
  const f = v as Partial<FaceSet>;
  return isTypeFace(f.display) && isTypeFace(f.body) && isTypeFace(f.data) && isTypeFace(f.figure);
}
// [SCOPE 126 / T001] END

const TOKEN_KINDS: readonly string[] = ["color", "paint", "length", "fontstack", "number", "keyword"];
const MODE_AXES: readonly string[] = ["light", "dark", "preference"];

// [SCOPE 126 / T001] BEGIN — BrandSchema model in src/shared/brand-schema.ts
function isContractToken(v: unknown): v is ContractToken {
  if (typeof v !== "object" || v === null) return false;
  const t = v as Partial<ContractToken>;
  return typeof t.name === "string" && typeof t.kind === "string" && TOKEN_KINDS.includes(t.kind);
}
// [SCOPE 126 / T001] END

// [SCOPE 126 / T001] BEGIN — BrandSchema model in src/shared/brand-schema.ts
function isModeTokenSet(v: unknown): v is ModeTokenSet {
  if (typeof v !== "object" || v === null) return false;
  const m = v as Partial<ModeTokenSet>;
  if (typeof m.name !== "string") return false;
  if (typeof m.axis !== "string" || !MODE_AXES.includes(m.axis)) return false;
  if (typeof m.resting !== "boolean") return false;
  if (typeof m.tokens !== "object" || m.tokens === null) return false;
  return Object.values(m.tokens).every((x) => typeof x === "string");
}
// [SCOPE 126 / T001] END

// [SCOPE 126 / T001] BEGIN — BrandSchema model in src/shared/brand-schema.ts
function isBrandRule(v: unknown): v is BrandRule {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Partial<BrandRule>;
  return (
    typeof r.id === "string" &&
    typeof r.text === "string" &&
    typeof r.kind === "string" &&
    ["invariant", "prohibition", "check", "product"].includes(r.kind) &&
    typeof r.mechanical === "boolean"
  );
}
// [SCOPE 126 / T001] END

// [SCOPE 126 / T001] BEGIN — BrandSchema model in src/shared/brand-schema.ts
function isRoleMap(v: unknown): v is RoleMap {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Partial<RoleMap>;
  if (typeof r.surface !== "string" || typeof r.body !== "string") return false;
  if (typeof r.ink !== "string" || typeof r.accent !== "string") return false;
  if (!Array.isArray(r.semantic)) return false;
  return r.semantic.every((p) => {
    if (typeof p !== "object" || p === null) return false;
    const s = p as Partial<SemanticPair>;
    return typeof s.name === "string" && typeof s.fg === "string" && (s.bg === null || typeof s.bg === "string");
  });
}
// [SCOPE 126 / T001] END

/**
 * Structural type guard. It answers "is this the right shape", not "is this brand valid" —
 * completeness, contrast and distinguishability are the validator's job, deliberately kept
 * separate so that a shape check can never be mistaken for a quality verdict.
 */
// [SCOPE 126 / T001] BEGIN — BrandSchema model in src/shared/brand-schema.ts
export function isBrandSchema(value: unknown): value is BrandSchema {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Partial<BrandSchema>;
  if (typeof s.name !== "string" || typeof s.version !== "string") return false;
  if (typeof s.source !== "string" || !["captured", "authored", "template"].includes(s.source)) return false;
  if (s.sourceRef !== null && typeof s.sourceRef !== "string") return false;
  if (typeof s.base !== "object" || s.base === null) return false;
  if (typeof s.extensions !== "object" || s.extensions === null) return false;
  if (!Object.values(s.extensions).every((x) => typeof x === "string")) return false;
  if (!isFaceSet(s.typefaces)) return false;
  if (!Array.isArray(s.contract) || !s.contract.every(isContractToken)) return false;
  if (!isRoleMap(s.roles)) return false;
  if (typeof s.modes !== "object" || s.modes === null) return false;
  if (!Object.values(s.modes).every(isModeTokenSet)) return false;
  if (typeof s.closed !== "boolean") return false;
  if (!Array.isArray(s.rules) || !s.rules.every(isBrandRule)) return false;
  if (!Array.isArray(s.exceptions)) return false;
  return true;
}
// [SCOPE 126 / T001] END
