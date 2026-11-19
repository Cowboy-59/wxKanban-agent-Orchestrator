/**
 * Declaration completeness for brand schemas — SPEC-126 / T005.
 *
 * Two things a brand must state rather than leave to be inferred, because inferring either one
 * wrongly produces a defect that only shows up on someone else's machine:
 *
 *   1. How each mode relates to the base light/dark axis. A palette does not reveal intent. A
 *      white-surfaced mode viewed under an operating-system dark preference renders mixed — dark
 *      base tokens beneath a light mode surface — unless the mode declares which it is. The
 *      reference document does not settle this: it says modes carry light values while two of its
 *      modes are inherently dark and one is pure white.
 *
 *   2. A fallback stack for every typeface. A face that fails to load falls back to a browser
 *      default serif, which is the silent failure this prevents. Blocking the font host and
 *      confirming each mode degrades to its named stack rather than to Times is an acceptance
 *      check a brand can only pass if the stacks were declared in the first place.
 */
import type { BrandSchema } from "./brand-schema.js";
import { declaredFaces } from "./brand-schema.js";

export interface DeclarationIssue {
  check: string;
  /** The mode or type role this concerns. */
  subject: string;
  message: string;
}

export interface DeclarationReport {
  valid: boolean;
  issues: DeclarationIssue[];
  /** Modes whose axis was checked. */
  modesChecked: string[];
  /** Type roles whose fallback stack was checked. */
  facesChecked: string[];
}

const VALID_AXES = new Set(["light", "dark", "preference"]);

/**
 * Whether every mode declares a usable light/dark relationship and every typeface a real
 * fallback stack.
 *
 * A fallback entry that is empty or whitespace counts as absent. Declaring a stack of empty
 * strings satisfies a naive length check while providing exactly nothing at render time, which is
 * the near-miss worth catching here rather than in a browser.
 */
// [SCOPE 126 / T005] BEGIN — Axis and typeface validation
export function validateDeclarations(schema: BrandSchema): DeclarationReport {
  const issues: DeclarationIssue[] = [];
  const modes = Object.values(schema.modes);
  const modesChecked = modes.map((m) => m.name);

  for (const mode of modes) {
    if (!VALID_AXES.has(mode.axis)) {
      issues.push({
        check: "declaration:invalid-axis",
        subject: mode.name,
        message:
          `Mode '${mode.name}' declares an unrecognised light/dark relationship. ` +
          "It must be one of: light, dark, preference. It is never inferred from the palette, because a palette does not reveal intent.",
      });
    }
  }

  const roleNames: (keyof BrandSchema["typefaces"])[] = ["display", "body", "data", "figure"];
  const faces = declaredFaces(schema);
  const facesChecked: string[] = [];

  faces.forEach((face, i) => {
    const role = String(roleNames[i] ?? `role-${i}`);
    facesChecked.push(role);

    if (typeof face.family !== "string" || face.family.trim().length === 0) {
      issues.push({
        check: "declaration:missing-family",
        subject: role,
        message: `The '${role}' type role declares no family. Every one of the four roles is required; they are not interchangeable.`,
      });
    }

    const usable = (face.fallback ?? []).filter((f) => typeof f === "string" && f.trim().length > 0);
    if (usable.length === 0) {
      issues.push({
        check: "declaration:missing-fallback",
        subject: role,
        message:
          `The '${role}' type role ('${face.family}') declares no usable fallback stack. ` +
          "A face that fails to load would fall back to a browser default serif, which is precisely the silent failure a declared stack prevents.",
      });
    }
  });

  return {
    valid: issues.length === 0,
    issues,
    modesChecked,
    facesChecked,
  };
}
// [SCOPE 126 / T005] END

/**
 * Modes whose surface is light while they declare themselves dark, or the reverse.
 *
 * Advisory, not a failure. A brand is entitled to a dark mode with a light panel, and this check
 * cannot know the intent — so it reports a probable mismatch for a person to confirm rather than
 * rejecting a schema on a guess. Reported separately from `validateDeclarations` so that a
 * suspicion is never counted as a defect.
 */
// [SCOPE 126 / T005] BEGIN — Axis and typeface validation
export function suspectedAxisMismatches(
  schema: BrandSchema,
  luminance: (value: string) => number | null,
): DeclarationIssue[] {
  const issues: DeclarationIssue[] = [];
  for (const mode of Object.values(schema.modes)) {
    if (mode.axis === "preference") continue;
    const surface = mode.tokens[schema.roles.surface];
    if (typeof surface !== "string") continue;
    const lum = luminance(surface);
    if (lum === null) continue;

    // A threshold of 0.2 rather than 0.5: measured canvases cluster far apart, every dark ground
    // sitting well below 0.05 and every light one well above 0.35, so a midpoint split would
    // misfile a grey-blue surface that is plainly meant to be dark.
    const looksDark = lum <= 0.2;
    if (looksDark && mode.axis === "light") {
      issues.push({
        check: "declaration:suspected-axis-mismatch",
        subject: mode.name,
        message: `Mode '${mode.name}' declares itself light but its surface is dark. Confirm the declaration is intended.`,
      });
    } else if (!looksDark && mode.axis === "dark") {
      issues.push({
        check: "declaration:suspected-axis-mismatch",
        subject: mode.name,
        message: `Mode '${mode.name}' declares itself dark but its surface is light. Confirm the declaration is intended.`,
      });
    }
  }
  return issues;
}
// [SCOPE 126 / T005] END
