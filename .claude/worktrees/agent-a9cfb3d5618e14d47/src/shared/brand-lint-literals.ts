/**
 * Style-literal lint — SPEC-129 / T009.
 *
 * No component may carry a colour, a corner radius, a row height or a font stack as a literal.
 * Every one comes from a token.
 *
 * This is the check that makes a brand hold across a large surface rather than across the handful
 * of screens somebody looked at. One hard-coded colour is invisible in review and permanent in
 * effect: it will not follow a mode, will not follow a rebrand, and will not appear in any
 * contrast report — because no report knows it exists.
 *
 * The token blocks themselves are exempt. Literals belong there; that is what a token block is.
 */

export type LiteralKind = "color" | "radius" | "row-height" | "font-stack";

export interface LiteralViolation {
  file: string;
  line: number;
  kind: LiteralKind;
  literal: string;
  excerpt: string;
  message: string;
}

/** A file whose whole purpose is to hold literals. */
// [SCOPE 129 / T009] BEGIN — Style-literal lint
export function isTokenFile(path: string): boolean {
  const p = path.replace(/\\/g, "/").toLowerCase();
  return (
    /(^|\/)brand[.-][a-z-]*\.(css|ts)$/.test(p) ||
    /(^|\/)tokens?\.(css|ts|js)$/.test(p) ||
    /\.tokens\.(css|ts)$/.test(p) ||
    p.endsWith("/theme.css") ||
    p.endsWith("/brand.css")
  );
}
// [SCOPE 129 / T009] END

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
const RGB_RE = /\b(?:rgba?|hsla?)\s*\([^)]*\)/g;
const RADIUS_RE = /\bborder-radius\s*:\s*([^;]+);/g;
const ROW_RE = /\b(?:height|min-height|line-height)\s*:\s*(\d+(?:\.\d+)?)(px|rem)\s*;/g;
const FONT_RE = /\bfont-family\s*:\s*([^;]+);/g;

/** Lines a lint must not read: comments, and anything that is already a token reference. */
// [SCOPE 129 / T009] BEGIN — Style-literal lint
function isExempt(line: string): boolean {
  const t = line.trim();
  if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return true;
  // A declaration whose value is entirely var() is correct, not a violation.
  if (/:\s*var\(--[^)]+\)\s*;?$/.test(t)) return true;
  return false;
}
// [SCOPE 129 / T009] END

// [SCOPE 129 / T009] BEGIN — Style-literal lint
function excerptOf(line: string): string {
  const t = line.trim();
  return t.length > 100 ? t.slice(0, 100) + "…" : t;
}
// [SCOPE 129 / T009] END

/**
 * Lint one file's source for style literals.
 *
 * Reports rather than throws, and reports every violation rather than the first: a developer
 * fixing one literal at a time through repeated runs is how a lint earns a reputation for being
 * tedious and then gets switched off.
 */
// [SCOPE 129 / T009] BEGIN — Style-literal lint
export function lintStyleLiterals(path: string, source: string): LiteralViolation[] {
  if (isTokenFile(path)) return [];

  const violations: LiteralViolation[] = [];
  const lines = source.split(/\r?\n/);

  lines.forEach((line, i) => {
    if (isExempt(line)) return;
    const excerpt = excerptOf(line);
    const at = i + 1;

    const push = (kind: LiteralKind, literal: string, why: string): void => {
      violations.push({ file: path, line: at, kind, literal, excerpt, message: why });
    };

    for (const m of line.matchAll(HEX_RE)) {
      push(
        "color",
        String(m[0]),
        `'${String(m[0])}' is a hard-coded colour. It will not follow a mode, will not follow a rebrand, ` +
          "and will never appear in a contrast report — because no report knows it exists. Use a token.",
      );
    }
    for (const m of line.matchAll(RGB_RE)) {
      push("color", String(m[0]), `'${String(m[0])}' is a hard-coded colour. Use a token.`);
    }
    for (const m of line.matchAll(RADIUS_RE)) {
      const value = String(m[1]).trim();
      if (value.includes("var(")) continue;
      push("radius", value, `A corner radius of '${value}' is set directly. Radius is a brand decision; use a token.`);
    }
    for (const m of line.matchAll(ROW_RE)) {
      const value = String(m[1]) + String(m[2]);
      push(
        "row-height",
        value,
        `A row height of '${value}' is set directly. Density differs per mode, so a fixed height ` +
          "silently opts this component out of every mode that changes it.",
      );
    }
    for (const m of line.matchAll(FONT_RE)) {
      const value = String(m[1]).trim();
      if (value.includes("var(")) continue;
      push("font-stack", value, `A font stack is set directly. Faces are declared by the brand; use a token.`);
    }
  });

  return violations;
}
// [SCOPE 129 / T009] END

/** Lint a set of files. */
// [SCOPE 129 / T009] BEGIN — Style-literal lint
export function lintStyleLiteralsAcross(files: { path: string; source: string }[]): LiteralViolation[] {
// [SCOPE 129 / T009] END
  return files.flatMap((f) => lintStyleLiterals(f.path, f.source));
}

/** Plain-language report, grouped so a developer sees a file once. */
// [SCOPE 129 / T009] BEGIN — Style-literal lint
export function describeLiteralViolations(violations: LiteralViolation[]): string[] {
  const byFile = new Map<string, LiteralViolation[]>();
  for (const v of violations) {
    const list = byFile.get(v.file) ?? [];
    list.push(v);
    byFile.set(v.file, list);
  }
  const out: string[] = [];
  for (const [file, list] of byFile) {
    out.push(`${file} — ${list.length} style literal(s)`);
    for (const v of list) out.push(`  line ${v.line} (${v.kind}): ${v.literal}  ·  ${v.excerpt}`);
  }
  return out;
}
// [SCOPE 129 / T009] END
