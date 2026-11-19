/**
 * Font request emission — SPEC-128 / T002.
 *
 * ONE request covers every declared face across every mode. Not one per mode: a six-mode brand
 * that shares most of its faces would otherwise issue six requests for largely the same fonts,
 * each blocking render.
 *
 * No font binary is ever bundled, hosted or redistributed. Faces are requested from the declared
 * host and nothing else.
 */
import type { BrandSchema, TypeFace } from "./brand-schema.js";

export const GOOGLE_FONTS_BASE = "https://fonts.googleapis.com/css2";

/** Weights requested for a face when a schema does not say. Deliberately narrow — every weight costs bytes. */
const DEFAULT_WEIGHTS = [400, 500, 600, 700];

/** A family name that a font host would not recognise, and that therefore must not be requested. */
// [SCOPE 128 / T002] BEGIN — Combined font request across all modes
function isSystemFamily(family: string): boolean {
  const f = family.trim().toLowerCase().replace(/^['"]|['"]$/g, "");
  return [
    "system-ui",
    "-apple-system",
    "ui-monospace",
    "ui-sans-serif",
    "ui-serif",
    "sans-serif",
    "serif",
    "monospace",
    "cursive",
    "fantasy",
    "inherit",
    "initial",
  ].includes(f);
}
// [SCOPE 128 / T002] END

// [SCOPE 128 / T002] BEGIN — Combined font request across all modes
function normaliseFamily(family: string): string {
  return family.trim().replace(/^['"]|['"]$/g, "");
}
// [SCOPE 128 / T002] END

/**
 * Every distinct family a schema needs from a font host, in a stable order.
 *
 * System families are excluded rather than requested and silently 404'd, and duplicates across
 * roles collapse — a brand using one face for display and figure asks for it once.
 */
// [SCOPE 128 / T002] BEGIN — Combined font request across all modes
export function requestableFamilies(schema: BrandSchema): string[] {
  const faces: TypeFace[] = [
    schema.typefaces.display,
    schema.typefaces.body,
    schema.typefaces.data,
    schema.typefaces.figure,
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const face of faces) {
    const family = normaliseFamily(face.family);
    if (!family || isSystemFamily(family)) continue;
    const key = family.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(family);
  }
  return out.sort((a, b) => a.localeCompare(b));
}
// [SCOPE 128 / T002] END

/**
 * The single font request for a whole schema, or null when every face is a system family.
 *
 * Returning null rather than an empty request matters: emitting a `<link>` that asks for nothing
 * is a render-blocking round trip for no benefit.
 */
// [SCOPE 128 / T002] BEGIN — Combined font request across all modes
export function renderFontRequest(schema: BrandSchema, weights: number[] = DEFAULT_WEIGHTS): string | null {
  const families = requestableFamilies(schema);
  if (families.length === 0) return null;

  const weightList = [...new Set(weights)].sort((a, b) => a - b).join(";");
  const params = families
    .map((f) => `family=${f.replace(/\s+/g, "+")}:wght@${weightList}`)
    .join("&");
  return `${GOOGLE_FONTS_BASE}?${params}&display=swap`;
}
// [SCOPE 128 / T002] END

/** The request as a `<link>` element for the document head. */
// [SCOPE 128 / T002] BEGIN — Combined font request across all modes
export function renderFontLink(schema: BrandSchema, weights?: number[]): string {
  const href = renderFontRequest(schema, weights);
  if (!href) return "";
  return `<link rel="stylesheet" href="${href}">`;
}
// [SCOPE 128 / T002] END

/**
 * A face's full stack: the family followed by its declared fallbacks.
 *
 * A face with no usable fallback is the failure this guards. It is reported by validation rather
 * than repaired here, so this renders what the schema says and adds nothing of its own.
 */
// [SCOPE 128 / T002] BEGIN — Combined font request across all modes
export function renderFontStack(face: TypeFace): string {
  const quoted = (name: string): string => (/\s/.test(name) ? `'${name}'` : name);
  return [normaliseFamily(face.family), ...face.fallback]
    .filter((x) => typeof x === "string" && x.trim().length > 0)
    .map((x) => quoted(x.trim()))
    .join(", ");
}
// [SCOPE 128 / T002] END

/** Faces that would fall back to a browser default because they declare no usable stack. */
// [SCOPE 128 / T002] BEGIN — Combined font request across all modes
export function facesWithoutFallback(schema: BrandSchema): string[] {
  const roles: [string, TypeFace][] = [
    ["display", schema.typefaces.display],
    ["body", schema.typefaces.body],
    ["data", schema.typefaces.data],
    ["figure", schema.typefaces.figure],
  ];
  return roles
    .filter(([, face]) => (face.fallback ?? []).every((f) => typeof f !== "string" || f.trim().length === 0))
    .map(([role]) => role);
}
// [SCOPE 128 / T002] END
