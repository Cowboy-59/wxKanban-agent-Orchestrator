/**
 * Tailwind and component-theme artifacts for a brand schema — SPEC-128 / T006.
 *
 * The generated configuration must agree with the generated stylesheet. If Tailwind exposes a
 * utility whose custom property the stylesheet never defines, the utility resolves to nothing and
 * the failure is invisible in the config — you only see it on a screen, as a missing colour.
 *
 * So everything here is derived from the SAME contract the stylesheet emits from. No second list.
 */
import type { BrandSchema } from "./brand-schema.js";
import { MODE_ATTRIBUTE, SHELL_CLASS } from "./brand-css.js";
import { renderFontStack } from "./brand-fonts.js";

/** A Tailwind-safe key for a token: `--m-rail-bar` becomes `rail-bar`. */
// [SCOPE 128 / T006] BEGIN — Extend Tailwind and component theme artifacts for modes
export function utilityName(token: string): string {
  return token.replace(/^--[a-z]-?/, "").replace(/^-+/, "");
}
// [SCOPE 128 / T006] END

/**
 * The Tailwind theme extension for a brand.
 *
 * Only `color` and `paint` tokens become colour utilities. A length or a font stack exposed as a
 * colour would generate utilities that silently produce invalid CSS.
 */
// [SCOPE 128 / T006] BEGIN — Extend Tailwind and component theme artifacts for modes
export function renderBrandTailwindConfig(schema: BrandSchema): string {
  const colours = schema.contract.filter((c) => c.kind === "color" || c.kind === "paint");
  const lengths = schema.contract.filter((c) => c.kind === "length");

  const colourEntries = colours
    .map((c) => `      "${utilityName(c.name)}": "var(${c.name})",`)
    .join("\n");
  const radiusEntries = lengths
    .map((c) => `      "${utilityName(c.name)}": "var(${c.name})",`)
    .join("\n");

  return [
    "// Generated from the brand schema — do not edit by hand.",
    "//",
    "// Every utility here maps to a custom property the generated stylesheet defines on the",
    `// shell root. Both are derived from the same declared contract, so a utility can never`,
    "// reference a property that was never emitted.",
    "//",
    "// Colour utilities resolve differently per mode WITHOUT any mode-specific configuration,",
    "// because the property they read is redefined by each mode's block. That is the whole",
    "// reason modes are custom properties rather than separate palettes.",
    "",
    "export const brandTheme = {",
    "  extend: {",
    "    colors: {",
    colourEntries,
    "    },",
    "    borderRadius: {",
    radiusEntries,
    "    },",
    "    fontFamily: {",
    `      display: [${JSON.stringify(renderFontStack(schema.typefaces.display))}],`,
    `      body: [${JSON.stringify(renderFontStack(schema.typefaces.body))}],`,
    `      data: [${JSON.stringify(renderFontStack(schema.typefaces.data))}],`,
    `      figure: [${JSON.stringify(renderFontStack(schema.typefaces.figure))}],`,
    "    },",
    "  },",
    "} as const;",
    "",
    "export default brandTheme;",
    "",
  ].join("\n");
}
// [SCOPE 128 / T006] END

/**
 * The mode names a product may set, as a typed module.
 *
 * Emitted so the customer's own code cannot set a mode the brand does not declare — the same
 * check the server performs, moved to where a developer meets it first.
 */
// [SCOPE 128 / T006] BEGIN — Extend Tailwind and component theme artifacts for modes
export function renderBrandModesModule(schema: BrandSchema): string {
  const names = Object.keys(schema.modes);
  const resting = Object.values(schema.modes).find((m) => m.resting)?.name ?? names[0] ?? "";

  return [
    "// Generated from the brand schema — do not edit by hand.",
    "",
    `export const SHELL_CLASS = ${JSON.stringify(SHELL_CLASS)};`,
    `export const MODE_ATTRIBUTE = ${JSON.stringify(MODE_ATTRIBUTE)};`,
    "",
    `export const BRAND_MODES = [${names.map((n) => JSON.stringify(n)).join(", ")}] as const;`,
    "",
    "export type BrandMode = (typeof BRAND_MODES)[number];",
    "",
    `/** Rendered when nothing selects otherwise, and when the mode layer does not initialise. */`,
    `export const RESTING_MODE: BrandMode = ${JSON.stringify(resting)};`,
    "",
    "/** Whether a value names a mode this brand declares. */",
    "export function isBrandMode(value: unknown): value is BrandMode {",
    "  return typeof value === \"string\" && (BRAND_MODES as readonly string[]).includes(value);",
    "}",
    "",
    "/**",
    " * The attributes for the shell element.",
    " *",
    " * Resolve the mode on the server and spread these into the shell's opening tag, so the mode",
    " * is present in the first response. Setting it from a client after paint produces a visible",
    " * reskin on every page load.",
    " */",
    "export function shellAttributes(mode: BrandMode = RESTING_MODE): Record<string, string> {",
    "  return { class: SHELL_CLASS, [MODE_ATTRIBUTE]: mode };",
    "}",
    "",
  ].join("\n");
}
// [SCOPE 128 / T006] END
