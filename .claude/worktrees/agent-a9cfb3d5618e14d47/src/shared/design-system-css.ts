// SCOPE-114 (SPEC-116 / T008) — the extended `theme.css` and `tailwind.theme.ts` renderers.
//
// SCOPE-062 already emits 19 semantic colour variables plus `--radius`, and every shipped
// consumer of that output depends on those names. This module ADDS to that surface and never
// rewrites it: `renderExtendedThemeCss` emits the exact same `:root` / `.dark` blocks that
// `renderThemeCss` does, then appends the scales that only the rich `DesignSystemTokens` set
// carries — radius steps, spacing steps, elevation levels and per-role type metrics.
//
// The division of labour is the staleness rule SCOPE-114 locked, and it is what makes the
// whole bundle safe to regenerate:
//
//   COLOUR  → always from `ProjectTheme`. It is the tier the user edits in the Studio, so it
//             is always current. Nothing here ever reads `tokens.colors`.
//   GEOMETRY → from `DesignSystemTokens`. Type scale, spacing, elevation, radius steps and
//             control geometry have no home in `ProjectTheme` and no editor that can drift.
//
// Because the two never overlap, a user recolouring in the Studio cannot desynchronise the
// generated artifacts — the colour half is re-rendered from the edited theme while the
// geometry half is reproduced verbatim from the captured system.
//
// New custom properties are namespaced `--ds-*` so they cannot collide with the 19 shadcn
// semantic names, with `--radius`, or with anything a customer already has in their sheet.

import type { DesignSystemTokens, TypeRole } from "./design-system.js";
import type { ProjectTheme } from "./theme-tokens.js";
import { renderThemeCss } from "./theme-tokens.js";

/**
 * Sanitise a token key into something legal and stable inside a CSS custom-property name.
 *
 * The 50 curated systems key their scales with tidy identifiers (`xs`, `level-1`,
 * `display-1`), but the groups are open records by design, so an added system may key one
 * with spaces, dots or slashes. Emitting those raw produces a property that silently never
 * matches its `var()` reference — a failure that renders as "the shadow just didn't apply"
 * rather than as an error, so it is normalised here instead of trusted.
 */
// [SCOPE 116 / T008] BEGIN — Extended theme.css + tailwind.theme.ts renderers
export function cssSafeKey(key: string): string {
  const cleaned = key
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned === "" ? "x" : cleaned;
}
// [SCOPE 116 / T008] END

/**
 * The `--ds-*` custom-property name for one entry of one scale.
 *
 * Kept as a single function rather than inlined at each call site so the CSS emitter and the
 * control emitter (T009) cannot drift apart — the controls reference these properties by
 * `var()`, and a name computed two different ways would produce controls that silently fall
 * back to nothing.
 */
// [SCOPE 116 / T008] BEGIN — Extended theme.css + tailwind.theme.ts renderers
export function dsVar(group: string, key: string): string {
  return `--ds-${group}-${cssSafeKey(key)}`;
}
// [SCOPE 116 / T008] END

/** The four per-role type custom properties, keyed by metric. */
// [SCOPE 116 / T008] BEGIN — Extended theme.css + tailwind.theme.ts renderers
export function typeVars(role: string): {
  size: string;
  weight: string;
  leading: string;
  tracking: string;
} {
  const base = cssSafeKey(role);
  return {
    size: `--ds-text-${base}-size`,
    weight: `--ds-text-${base}-weight`,
    leading: `--ds-text-${base}-leading`,
    tracking: `--ds-text-${base}-tracking`,
  };
}
// [SCOPE 116 / T008] END

/**
 * Render `theme.css` for a project, extended with the captured system's geometry.
 *
 * With `tokens` null this returns byte-identical output to `renderThemeCss` — that is
 * FR-010's colour-only fallback, and it is expressed as an early return rather than as a
 * pile of conditionals so the guarantee is readable in one line.
 *
 * `fontImportUrl` is emitted as a leading `@import`, which must precede every other rule in
 * a stylesheet; it is therefore assembled at the top rather than appended with the rest of
 * the font handling. A null URL omits the line entirely rather than emitting an empty
 * `@import`, which would be a parse error that disables the whole sheet.
 */
// [SCOPE 116 / T008] BEGIN — Extended theme.css + tailwind.theme.ts renderers
export function renderExtendedThemeCss(
  theme: ProjectTheme,
  tokens: DesignSystemTokens | null,
  fontImportUrl: string | null = null,
): string {
  const base = renderThemeCss(theme);
  if (!tokens) return base;

  const importLine = fontImportUrl ? [`@import url("${fontImportUrl}");`, ""] : [];

  const scaleBlock = (group: string, scale: Record<string, string>, label: string): string[] => {
    const entries = Object.entries(scale);
    if (entries.length === 0) return [];
    return [
      `  /* ${label} */`,
      ...entries.map(([key, value]) => `  ${dsVar(group, key)}: ${value};`),
      "",
    ];
  };

  const typeBlock = (): string[] => {
    const entries = Object.entries(tokens.typography);
    if (entries.length === 0) return [];
    const lines: string[] = ["  /* Type scale — per role, as captured */"];
    for (const [role, metrics] of entries) {
      const v = typeVars(role);
      lines.push(
        `  ${v.size}: ${metrics.fontSize};`,
        `  ${v.weight}: ${metrics.fontWeight};`,
        `  ${v.leading}: ${metrics.lineHeight};`,
        `  ${v.tracking}: ${metrics.letterSpacing};`,
      );
    }
    lines.push("");
    return lines;
  };

  const extended = [
    ":root {",
    `  /* Font family — the loadable stack resolved for this system. */`,
    `  --ds-font-family: ${theme.typography.fontFamily};`,
    "",
    ...scaleBlock("radius", tokens.rounded, "Radius steps"),
    ...scaleBlock("space", tokens.spacing, "Spacing steps"),
    ...scaleBlock("elevation", tokens.elevation, "Elevation levels"),
    ...typeBlock(),
    "}",
    "",
  ];

  return [...importLine, base, "/* — Design-system geometry (SCOPE-114) — */", "", ...extended].join(
    "\n",
  );
}
// [SCOPE 116 / T008] END

/**
 * Render `tailwind.theme.ts` — the same scales, reachable as Tailwind utilities.
 *
 * Every value is emitted as a `var()` reference rather than as the literal it came from.
 * That is deliberate and load-bearing: it means a customer who later edits one custom
 * property in `theme.css` sees the change flow through every utility, and it keeps this file
 * free of the duplicated source-of-truth that would otherwise drift the moment the CSS is
 * touched. Colour is absent here entirely — it already flows through the shadcn semantic
 * tokens, and restating it would create exactly the second colour source the staleness rule
 * exists to prevent.
 */
// [SCOPE 116 / T008] BEGIN — Extended theme.css + tailwind.theme.ts renderers
export function renderTailwindThemeConfig(
  theme: ProjectTheme,
  tokens: DesignSystemTokens | null,
): string {
  const header = [
    "// Generated by wxKanban (SCOPE-114 design-system bundle).",
    "//",
    "// Spread this into your Tailwind config's `theme.extend`. Every value resolves through a",
    "// CSS custom property defined in the generated `theme.css`, so editing the stylesheet is",
    "// enough — nothing here needs to be kept in sync by hand.",
    "//",
    "// Colour is deliberately absent: it flows through the shadcn semantic tokens",
    "// (`bg-primary`, `text-muted-foreground`, `border-border`) which the same `theme.css`",
    "// defines. Declaring colour twice is how a generated bundle goes stale.",
    "",
  ];

  const record = (entries: Array<[string, string]>, indent = "    "): string[] =>
    entries.map(([key, value]) => `${indent}${JSON.stringify(key)}: "${value}",`);

  if (!tokens) {
    // FR-010 — a theme with no rich tokens still gets a usable config: the radius and font
    // that `ProjectTheme` does carry, and nothing invented to fill the gap.
    return [
      ...header,
      "export const themeExtend = {",
      "  borderRadius: {",
      `    DEFAULT: "var(--radius)",`,
      "  },",
      "  fontFamily: {",
      `    sans: [${JSON.stringify(theme.typography.fontFamily)}],`,
      "  },",
      "} as const;",
      "",
      "export default themeExtend;",
      "",
    ].join("\n");
  }

  const radiusEntries: Array<[string, string]> = Object.keys(tokens.rounded).map((k) => [
    k,
    `var(${dsVar("radius", k)})`,
  ]);
  const spacingEntries: Array<[string, string]> = Object.keys(tokens.spacing).map((k) => [
    k,
    `var(${dsVar("space", k)})`,
  ]);
  const shadowEntries: Array<[string, string]> = Object.keys(tokens.elevation).map((k) => [
    k,
    `var(${dsVar("elevation", k)})`,
  ]);

  const roles = Object.keys(tokens.typography);
  const fontSizeLines: string[] = [];
  const fontWeightLines: string[] = [];
  const letterSpacingLines: string[] = [];
  for (const role of roles) {
    const v = typeVars(role);
    // Tailwind's `fontSize` accepts a [size, { lineHeight }] tuple, which is the only way to
    // keep a role's size and its line-height bound together as the system declared them.
    fontSizeLines.push(
      `    ${JSON.stringify(role)}: ["var(${v.size})", { lineHeight: "var(${v.leading})" }],`,
    );
    fontWeightLines.push(`    ${JSON.stringify(role)}: "var(${v.weight})",`);
    letterSpacingLines.push(`    ${JSON.stringify(role)}: "var(${v.tracking})",`);
  }

  return [
    ...header,
    "export const themeExtend = {",
    "  borderRadius: {",
    `    DEFAULT: "var(--radius)",`,
    ...record(radiusEntries),
    "  },",
    "  spacing: {",
    ...record(spacingEntries),
    "  },",
    "  boxShadow: {",
    ...record(shadowEntries),
    "  },",
    "  fontFamily: {",
    `    sans: ["var(--ds-font-family)"],`,
    "  },",
    "  fontSize: {",
    ...fontSizeLines,
    "  },",
    "  fontWeight: {",
    ...fontWeightLines,
    "  },",
    "  letterSpacing: {",
    ...letterSpacingLines,
    "  },",
    "} as const;",
    "",
    "export default themeExtend;",
    "",
  ].join("\n");
}
// [SCOPE 116 / T008] END

/** Narrow a `TypeRole` to the four metrics the emitters use, with safe stringification. */
// [SCOPE 116 / T008] BEGIN — Extended theme.css + tailwind.theme.ts renderers
export function typeRoleMetrics(role: TypeRole): {
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  letterSpacing: string;
} {
  return {
    fontSize: String(role.fontSize),
    fontWeight: String(role.fontWeight),
    lineHeight: String(role.lineHeight),
    letterSpacing: String(role.letterSpacing),
  };
}
// [SCOPE 116 / T008] END
