/**
 * Per-mode CSS emission — SPEC-128 / T001.
 *
 * Mode tokens are emitted to the SHELL ROOT, never to `:root`. Two consequences follow, and both
 * are the point:
 *
 *   1. A mode cannot leak past the shell. Anything rendered outside it — a third-party widget, a
 *      print stylesheet, an embedded document — keeps the base brand.
 *   2. If the mode layer never initialises, the base brand survives intact rather than the
 *      application losing its styling along with its mode.
 *
 * Nothing here decides WHICH mode is active. Selection is resolved server-side and emitted into
 * the shell's opening tag; this module only renders the blocks.
 */
import type { BrandSchema, ModeTokenSet } from "./brand-schema.js";

/**
 * The shell class and attribute every part of this feature agrees on.
 *
 * Exported as constants rather than written as literals in three places, because the emitter, the
 * shell contract and the structural lint must agree exactly. A lint that looked for a different
 * attribute than the emitter wrote would pass while enforcing nothing.
 */
export const SHELL_CLASS = "app-shell";
export const MODE_ATTRIBUTE = "data-mode";

/** The selector a given mode's tokens are scoped to. */
// [SCOPE 128 / T001] BEGIN — Per-mode stylesheet emission scoped to the shell root
export function modeSelector(modeName: string): string {
  return `.${SHELL_CLASS}[${MODE_ATTRIBUTE}="${modeName}"]`;
}
// [SCOPE 128 / T001] END

// [SCOPE 128 / T001] BEGIN — Per-mode stylesheet emission scoped to the shell root
function declarations(mode: ModeTokenSet, indent = "  "): string[] {
  return Object.entries(mode.tokens).map(([token, value]) => `${indent}${token}: ${value};`);
}
// [SCOPE 128 / T001] END

/**
 * One mode's block.
 *
 * Token order follows the schema's declared contract, not object insertion order, so that two
 * renders of the same schema are byte-identical. A bundle that changed between identical runs
 * would make every diff untrustworthy.
 */
// [SCOPE 128 / T001] BEGIN — Per-mode stylesheet emission scoped to the shell root
export function renderModeBlock(schema: BrandSchema, mode: ModeTokenSet): string {
  const order = schema.contract.map((c) => c.name);
  const ordered: [string, string][] = [];
  for (const name of order) {
    const value = mode.tokens[name];
    if (typeof value === "string") ordered.push([name, value]);
  }
  // Anything the contract does not name is emitted last rather than dropped, so a schema that
  // slipped past validation still renders visibly wrong instead of silently short.
  for (const [name, value] of Object.entries(mode.tokens)) {
    if (!order.includes(name)) ordered.push([name, value]);
  }

  const lines = [
    `/* mode: ${mode.name} — axis: ${mode.axis}${mode.resting ? " — resting" : ""} */`,
    `${modeSelector(mode.name)} {`,
    ...ordered.map(([t, v]) => `  ${t}: ${v};`),
    "}",
  ];
  return lines.join("\n");
}
// [SCOPE 128 / T001] END

/** Every mode, in declaration order. */
// [SCOPE 128 / T001] BEGIN — Per-mode stylesheet emission scoped to the shell root
export function renderModeBlocks(schema: BrandSchema): string {
  return Object.values(schema.modes)
    .map((m) => renderModeBlock(schema, m))
    .join("\n\n");
}
// [SCOPE 128 / T001] END

/**
 * The resting mode's tokens, written onto the shell root WITHOUT a mode selector.
 *
 * This is what renders when the mode layer has not initialised, when scripting is off, or when a
 * tenant has selected nothing. A failed mode load must never produce an unstyled application.
 */
// [SCOPE 128 / T001] BEGIN — Per-mode stylesheet emission scoped to the shell root
export function renderRestingBlock(schema: BrandSchema): string {
  const resting = Object.values(schema.modes).find((m) => m.resting);
  if (!resting) return "";
  return [
    "/* Resting mode — rendered when no mode is selected, when the mode layer fails to",
    "   initialise, and when scripting is unavailable. Deliberately carries no mode selector. */",
    `.${SHELL_CLASS} {`,
    ...declarations(resting),
    "}",
  ].join("\n");
}
// [SCOPE 128 / T001] END

/** Extension tokens from the base brand — identity, rail and status colours the shadcn set has no room for. */
// [SCOPE 128 / T001] BEGIN — Per-mode stylesheet emission scoped to the shell root
export function renderExtensionBlock(schema: BrandSchema): string {
  const entries = Object.entries(schema.extensions);
  if (entries.length === 0) return "";
  return [
    "/* Brand extension tokens (identity, rail, status) — HSL triples, wrapped at point of use. */",
    ":root {",
    ...entries.map(([token, value]) => `  ${token}: ${value};`),
    "}",
  ].join("\n");
}
// [SCOPE 128 / T001] END

/**
 * Assert that nothing in a rendered stylesheet puts a mode token on `:root`.
 *
 * Exported so the generation tests and the bundle path can both check the real output rather than
 * trusting the renderer. Checking the artifact is the only check that cannot drift from it.
 */
// [SCOPE 128 / T001] BEGIN — Per-mode stylesheet emission scoped to the shell root
export function modeTokensAtRoot(css: string, schema: BrandSchema): string[] {
  const contractNames = new Set(schema.contract.map((c) => c.name));
  const offenders: string[] = [];
  // Look at every `:root { ... }` block and report any contract token found inside one.
  for (const match of css.matchAll(/:root\s*\{([^}]*)\}/g)) {
// [SCOPE 128 / T001] END
    const body = String(match[1]);
    for (const [, token] of body.matchAll(/(--[a-z0-9-]+)\s*:/g)) {
      if (contractNames.has(String(token))) offenders.push(String(token));
    }
  }
  return Array.from(new Set(offenders));
}
