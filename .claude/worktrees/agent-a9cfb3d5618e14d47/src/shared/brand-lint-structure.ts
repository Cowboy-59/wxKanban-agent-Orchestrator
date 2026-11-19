/**
 * Structural-property lint — SPEC-129 / T008.
 *
 * Structure is not a theme. A mode may change how a surface feels; it may never change what a
 * surface IS. Route, field contract, permission gate and declared states carry meaning, and no
 * visual mode may alter, reorder or hide them.
 *
 * This is the one violation that would let two modes disagree about what a screen contains. If a
 * mode selector can set `display`, a field can be present in one presentation and absent in
 * another while both claim to be the same screen — and the difference would only ever be found by
 * someone looking at both.
 *
 * Reaching for one of these properties is redesigning, not theming.
 */

/** Properties a mode selector may never set. */
export const STRUCTURAL_PROPERTIES = [
  "display",
  "grid-template",
  "grid-template-areas",
  "grid-template-columns",
  "grid-template-rows",
  "order",
  "position",
  "content",
  "visibility",
  "float",
] as const;

export interface StructuralViolation {
  /** The selector that set it. */
  selector: string;
  property: string;
  value: string;
  line: number;
  message: string;
}

/**
 * Whether a selector targets a specific mode.
 *
 * Only mode-scoped rules are linted. The shell's own rules — the resting block, the type stacks —
 * legitimately set layout, and flagging those would make the lint noise that gets switched off.
 */
// [SCOPE 129 / T008] BEGIN — Structural-property lint
export function isModeScoped(selector: string, modeAttribute: string): boolean {
  return new RegExp(`\\[\\s*${modeAttribute}\\s*[~|^$*]?=`).test(selector);
}
// [SCOPE 129 / T008] END

// [SCOPE 129 / T008] BEGIN — Structural-property lint
function lineOf(source: string, index: number): number {
  return source.slice(0, index).split(/\r?\n/).length;
}
// [SCOPE 129 / T008] END

/**
 * Find every structural property set by a mode-scoped selector.
 *
 * Works on rendered CSS rather than on a stylesheet's source, because the artifact is what ships.
 * A check that read the generator could not catch a hand-edited bundle.
 */
// [SCOPE 129 / T008] BEGIN — Structural-property lint
export function lintStructuralProperties(
  css: string,
  modeAttribute = "data-mode",
): StructuralViolation[] {
  const violations: StructuralViolation[] = [];
  const ruleRe = /([^{}]+)\{([^}]*)\}/g;
// [SCOPE 129 / T008] END

  let match: RegExpExecArray | null;
  while ((match = ruleRe.exec(css)) !== null) {
    const rawSelector = String(match[1]);
    const selector = rawSelector.trim().replace(/\s+/g, " ");
    const body = String(match[2]);
    if (!isModeScoped(selector, modeAttribute)) continue;

    // `match.index` sits on the whitespace following the PREVIOUS rule's closing brace, so using
    // it directly reported line 1 for every rule after the first — which makes a violation
    // report useless for actually finding the violation. Offset to the selector's first real
    // character instead.
    const selectorStart = match.index + (rawSelector.length - rawSelector.trimStart().length);

    for (const declaration of body.split(";")) {
      const colon = declaration.indexOf(":");
      if (colon === -1) continue;
      const property = declaration.slice(0, colon).trim().toLowerCase();
      const value = declaration.slice(colon + 1).trim();
      if (property.startsWith("--")) continue; // a custom property is a token, not a structural set

      const hit = STRUCTURAL_PROPERTIES.find((p) => property === p || property.startsWith(p + "-"));
      if (!hit) continue;

      violations.push({
        selector,
        property,
        value,
        line: lineOf(css, selectorStart),
        message:
          `'${selector}' sets '${property}', which is structural. A mode may change how a surface ` +
          "feels but never what it is — setting this lets two modes disagree about what a screen " +
          "contains. This is a redesign, not a theme.",
      });
    }
  }

  return violations;
}

/** Whether a stylesheet is free of structural violations. */
// [SCOPE 129 / T008] BEGIN — Structural-property lint
export function passesStructuralLint(css: string, modeAttribute?: string): boolean {
  return lintStructuralProperties(css, modeAttribute).length === 0;
}
// [SCOPE 129 / T008] END

/** Plain-language report, one line per violation. */
// [SCOPE 129 / T008] BEGIN — Structural-property lint
export function describeStructuralViolations(violations: StructuralViolation[]): string[] {
  return violations.map((v) => `line ${v.line}: ${v.message}`);
}
// [SCOPE 129 / T008] END
