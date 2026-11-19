/**
 * The complete brand stylesheet and the shell contract — SPEC-128 / T003, T004, T008.
 *
 * Composes the emitted pieces into one artifact for the customer's product, in the order that
 * makes a failure safe:
 *
 *   1. the font request, so faces are requested before anything paints
 *   2. extension tokens
 *   3. the RESTING mode on the shell root, with no mode selector
 *   4. each mode's block, scoped to the shell root
 *
 * Order 3 before 4 is what makes a failed mode layer harmless. The resting values are already on
 * the shell, so a shell that never receives a mode attribute renders the brand rather than
 * nothing.
 */
import type { BrandSchema } from "./brand-schema.js";
import {
  MODE_ATTRIBUTE,
  SHELL_CLASS,
  renderExtensionBlock,
  renderModeBlocks,
  renderRestingBlock,
} from "./brand-css.js";
import { renderFontLink, renderFontRequest, renderFontStack } from "./brand-fonts.js";

export interface BrandStylesheet {
  css: string;
  /** The one font request, or null when every face is a system family. */
  fontHref: string | null;
  /** The shell element the product must render, with the resolved mode already on it. */
  shellExample: string;
  /** Checks a machine cannot decide, for a person to work through. */
  humanChecklist: string[];
}

/** The complete stylesheet for a brand schema. */
// [SCOPE 128 / T003] BEGIN — Resting mode in the base stylesheet
export function renderBrandStylesheet(schema: BrandSchema): string {
  const parts: string[] = [];

  parts.push(
    [
      "/*",
      ` * ${schema.name} — generated brand stylesheet`,
      ` * version ${schema.version}${schema.sourceRef ? ` — from ${schema.sourceRef}` : ""}`,
      " *",
      " * Mode tokens are scoped to the shell root and never to :root, so a mode cannot leak",
      " * beyond the shell and the base brand survives if the mode layer fails to initialise.",
      " * The resting mode is written onto the shell WITHOUT a selector, so a shell that never",
      " * receives a mode attribute still renders this brand rather than nothing.",
      " */",
    ].join("\n"),
  );

  const href = renderFontRequest(schema);
  if (href) parts.push(`@import url("${href}");`);

  const extensions = renderExtensionBlock(schema);
  if (extensions) parts.push(extensions);

  // Type stacks live on the shell so every mode inherits them unless it overrides a face.
  parts.push(
    [
      `.${SHELL_CLASS} {`,
      `  --brand-font-display: ${renderFontStack(schema.typefaces.display)};`,
      `  --brand-font-body: ${renderFontStack(schema.typefaces.body)};`,
      `  --brand-font-data: ${renderFontStack(schema.typefaces.data)};`,
      `  --brand-font-figure: ${renderFontStack(schema.typefaces.figure)};`,
      "}",
    ].join("\n"),
  );

  const resting = renderRestingBlock(schema);
  if (resting) parts.push(resting);

  parts.push(renderModeBlocks(schema));

  return parts.filter((p) => p.trim().length > 0).join("\n\n") + "\n";
}
// [SCOPE 128 / T003] END

/**
 * The shell element the product renders, with the resolved mode already present.
 *
 * Emitted server-side into the initial response rather than applied by a client after paint. A
 * reskin flash on every page load reads as a defect, and on a workshop wall screen it is one.
 */
// [SCOPE 128 / T003] BEGIN — Resting mode in the base stylesheet
export function renderShellOpenTag(modeName: string | null): string {
  return modeName
    ? `<div class="${SHELL_CLASS}" ${MODE_ATTRIBUTE}="${modeName}">`
    : `<div class="${SHELL_CLASS}">`;
}
// [SCOPE 128 / T003] END

/**
 * The integration contract, as documentation shipped beside the stylesheet.
 *
 * Written out rather than assumed because the shell element is the one thing the customer must
 * add by hand, and getting it wrong degrades silently to the resting mode.
 */
// [SCOPE 128 / T003] BEGIN — Resting mode in the base stylesheet
export function renderShellContract(schema: BrandSchema): string {
  const resting = Object.values(schema.modes).find((m) => m.resting);
  const other = Object.values(schema.modes).find((m) => !m.resting);
  const link = renderFontLink(schema);

  const lines = [
    "# Shell contract",
    "",
    "Every screen renders inside one shell element. The stylesheet targets that element, so",
    "nothing outside it is themed — which is deliberate.",
    "",
    "```html",
    renderShellOpenTag(resting?.name ?? null),
    "  <!-- the application -->",
    "</div>",
    "```",
    "",
    "## Selecting a mode",
    "",
    `Set the \`${MODE_ATTRIBUTE}\` attribute to a declared mode name. Resolve it on the server and`,
    "emit it into the first response — do not set it from a client after paint, which produces a",
    "visible reskin on every page load.",
    "",
    "```html",
    renderShellOpenTag(other?.name ?? resting?.name ?? "modename"),
    "```",
    "",
    `Declared modes: ${Object.keys(schema.modes).map((m) => `\`${m}\``).join(", ")}.`,
    "",
    "## If nothing sets the attribute",
    "",
    `The shell renders in \`${resting?.name ?? "the resting mode"}\`, because the resting values are`,
    "written onto the shell itself with no selector. A failed mode layer, a missing attribute, or",
    "scripting being unavailable all degrade to the brand rather than to unstyled markup.",
    "",
  ];

  if (link) {
    lines.push(
      "## Fonts",
      "",
      "One request covers every face in every mode. The stylesheet imports it, and this link is the",
      "faster alternative if you would rather request it from the document head:",
      "",
      "```html",
      link,
      "```",
      "",
      "No font binary is bundled or redistributed.",
      "",
    );
  }

  return lines.join("\n");
}
// [SCOPE 128 / T003] END

/**
 * The checks a machine cannot decide.
 *
 * Emitted as an explicit checklist rather than being counted as automated. Four of the reference
 * brand's own acceptance criteria need a browser or a person, and claiming otherwise would
 * produce confidence nobody had earned.
 */
// [SCOPE 128 / T003] BEGIN — Resting mode in the base stylesheet
export function renderHumanChecklist(schema: BrandSchema): string[] {
  const modes = Object.keys(schema.modes);
  const tightest = modes.find((m) => schema.modes[m]?.axis === "dark") ?? modes[0] ?? "the resting mode";

  return [
    "Block the font host and confirm every mode falls back to its declared stack — not to a " +
      "browser default serif. This needs a browser; nothing static can prove a face actually loaded.",
    `Switch between modes on a populated screen and confirm no text, field, row count or control ` +
      `changes. Only the appearance may differ. Modes checked: ${modes.join(", ")}.`,
    "Load a screen with scripting disabled and confirm it renders fully styled in the resting mode.",
    `Read '${tightest}' on the physical display it was designed for, at the distance it is used ` +
      "from. Contrast ratios are necessary and not sufficient; a wall screen across a bay is a " +
      "different question from a monitor at a desk.",
    "Confirm on a touch device that row heights leave a comfortable target. Density is a desktop " +
      "affordance and must not reach a phone in the field.",
  ];
}
// [SCOPE 128 / T003] END

/** Everything a customer receives for their brand, in one object. */
// [SCOPE 128 / T003] BEGIN — Resting mode in the base stylesheet
export function buildBrandStylesheet(schema: BrandSchema): BrandStylesheet {
  const resting = Object.values(schema.modes).find((m) => m.resting);
  return {
    css: renderBrandStylesheet(schema),
    fontHref: renderFontRequest(schema),
    shellExample: renderShellOpenTag(resting?.name ?? null),
    humanChecklist: renderHumanChecklist(schema),
  };
}
// [SCOPE 128 / T003] END
