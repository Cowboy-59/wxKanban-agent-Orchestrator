/**
 * Rule delivery — SPEC-129 / T004, T005, T006, T007.
 *
 * A brand's rules are useless where they currently live: in a document a person is trusted to
 * remember. This carries them to the three places where UI actually gets made — the agent that
 * writes the code, the skill that designs the screen, and the review that reads the diff.
 *
 * Each consumer gets the SAME rules in a shape it can use. One source, three renderings: if the
 * three drifted, a screen could be designed against one rule set, built against another and
 * reviewed against a third, and every step would report success.
 *
 * Every rendering states honestly which rules a machine can decide and which need a person.
 * Overstating enforcement produces confidence nobody earned, which is worse than saying nothing.
 */
import type { BrandRule, BrandSchema } from "./brand-schema.js";
import { advisoryRules, mechanicalRules } from "./brand-schema.js";
import { renderFontStack } from "./brand-fonts.js";

export interface RuleDelivery {
  /** The text a consumer receives. */
  context: string;
  /** How many rules were supplied, for the announcement. */
  ruleCount: number;
  mechanicalCount: number;
}

// [SCOPE 129 / T005] BEGIN — Rule delivery to implement
function ruleLines(rules: BrandRule[]): string[] {
  return rules.map((r) => `- [${r.kind}] ${r.text}`);
}
// [SCOPE 129 / T005] END

/** The tokens and faces a consumer must build against, stated once. */
// [SCOPE 129 / T005] BEGIN — Rule delivery to implement
function tokenBrief(schema: BrandSchema): string[] {
  const lines: string[] = [];
  const roles = schema.roles;
  lines.push("Tokens — use these, never a literal:");
  lines.push(`- page surface: \`${roles.surface}\``);
  lines.push(`- body text: \`${roles.body}\``);
  lines.push(`- headings: \`${roles.ink}\``);
  lines.push(`- links and the primary action: \`${roles.accent}\``);
  if (roles.identity) {
    lines.push(
      `- identity: \`${roles.identity}\` — IDENTITY ONLY. Never a primary action, never a button.`,
    );
  }
  for (const s of roles.semantic) {
    lines.push(`- ${s.name}: \`${s.fg}\`${s.bg ? ` on \`${s.bg}\`` : ""} — meaning is fixed in every mode`);
  }
  lines.push("");
  lines.push("Faces:");
  lines.push(`- display: ${renderFontStack(schema.typefaces.display)}`);
  lines.push(`- body: ${renderFontStack(schema.typefaces.body)}`);
  lines.push(`- data: ${renderFontStack(schema.typefaces.data)}`);
  lines.push(`- figure: ${renderFontStack(schema.typefaces.figure)}`);
  return lines;
}
// [SCOPE 129 / T005] END

// [SCOPE 129 / T005] BEGIN — Rule delivery to implement
function splitNote(schema: BrandSchema): string {
  const mech = mechanicalRules(schema).length;
  const adv = advisoryRules(schema).length;
  return (
    `${mech} of these ${mech + adv} rules can be checked automatically. The other ${adv} cannot — ` +
    "they are stated here because you are the only thing that will apply them."
  );
}
// [SCOPE 129 / T005] END

/**
 * Build context for the implementation agent.
 *
 * Leads with the prohibitions rather than the token list. An agent that reads only the first
 * paragraph should still know what it must not do — and that ordering is the difference between
 * a rule being followed and a rule being available.
 */
// [SCOPE 129 / T005] BEGIN — Rule delivery to implement
export function renderRulesForImplement(schema: BrandSchema): RuleDelivery {
  const mech = mechanicalRules(schema);
  const adv = advisoryRules(schema);
  const prohibitions = schema.rules.filter((r) => r.kind === "prohibition");
  const product = schema.rules.filter((r) => r.kind === "product");

  const lines = [
    `## Brand: ${schema.name} v${schema.version}`,
    "",
    "This project carries a brand schema. The code you write is checked against it.",
    "",
  ];

  if (prohibitions.length > 0) {
    lines.push("### Never do these", "", ...ruleLines(prohibitions), "");
  }
  if (product.length > 0) {
    lines.push(
      "### Product rules the interface must carry",
      "",
      "These describe how the product behaves, not how it looks. They change what you build.",
      "",
      ...ruleLines(product),
      "",
    );
  }

  lines.push("### Everything else that must hold", "", ...ruleLines(schema.rules.filter((r) => r.kind === "invariant" || r.kind === "check")), "");
  lines.push(...tokenBrief(schema), "");
  lines.push("### Two checks that will reject your code", "");
  lines.push("- No colour, radius, row height or font stack as a literal. Every one comes from a token.");
  lines.push("- No mode selector may set `display`, `grid-template`, `order`, `position` or `content`. Structure is not a theme.");
  lines.push("", splitNote(schema));

  return { context: lines.join("\n"), ruleCount: schema.rules.length, mechanicalCount: mech.length };
}
// [SCOPE 129 / T005] END

/**
 * Build context for the design step.
 *
 * The design skill currently reads a stylesheet or the live theme API and has no awareness of the
 * schema layer at all. This is the bridge across that gap, so a screen is composed against the
 * brand's real tokens rather than an approximation of them.
 */
// [SCOPE 129 / T005] BEGIN — Rule delivery to implement
export function renderRulesForDesign(schema: BrandSchema): RuleDelivery {
  const modes = Object.values(schema.modes);
  const resting = modes.find((m) => m.resting);

  const lines = [
    `## Brand: ${schema.name} v${schema.version}`,
    "",
    `Design against this brand's tokens, not against the application's own stylesheet.`,
    "",
    `Modes: ${modes.map((m) => `\`${m.name}\``).join(", ")}${resting ? ` — resting is \`${resting.name}\`` : ""}.`,
    "Design the resting mode unless asked otherwise. A screen must contain the same fields, rows",
    "and controls in every mode; only the appearance differs.",
    "",
    ...tokenBrief(schema),
    "",
    "### What the brand requires of a design",
    "",
    ...ruleLines(schema.rules.filter((r) => r.kind === "invariant" || r.kind === "prohibition")),
    "",
    splitNote(schema),
  ];

  return {
    context: lines.join("\n"),
    ruleCount: schema.rules.length,
    mechanicalCount: mechanicalRules(schema).length,
  };
}
// [SCOPE 129 / T005] END

/**
 * Build criteria for the review step.
 *
 * Phrased as things to look for in a diff, because a reviewer reads changes rather than screens.
 * The mechanical rules are listed separately and marked, so a reviewer does not spend attention
 * on what a gate already decided.
 */
// [SCOPE 129 / T005] BEGIN — Rule delivery to implement
export function renderRulesForReview(schema: BrandSchema): RuleDelivery {
  const mech = mechanicalRules(schema);
  const adv = advisoryRules(schema);

  const lines = [
    `## Brand review criteria: ${schema.name} v${schema.version}`,
    "",
    "### Check these by reading the diff",
    "",
    ...ruleLines(adv),
    "",
    "### Already checked automatically — do not spend attention here",
    "",
    ...ruleLines(mech),
    "",
    "### Mechanical checks that run on this change",
    "",
    "- style literals: a colour, radius, row height or font stack written directly in a component",
    "- structural properties: a mode selector setting `display`, `grid-template`, `order`, `position` or `content`",
    "- contrast: every colour pairing measured against WCAG AA, including status colours and the action colour",
    "",
    `A finding from any of those is a defect, not a preference. A finding from the first list is a `,
    "judgement, and should be raised as one.",
    "",
    splitNote(schema),
  ];

  return { context: lines.join("\n"), ruleCount: schema.rules.length, mechanicalCount: mech.length };
}
// [SCOPE 129 / T005] END

/** All three renderings, so a caller cannot accidentally deliver only one. */
// [SCOPE 129 / T005] BEGIN — Rule delivery to implement
export function deliverRules(schema: BrandSchema): {
  implement: RuleDelivery;
  design: RuleDelivery;
  review: RuleDelivery;
} {
// [SCOPE 129 / T005] END
  return {
    implement: renderRulesForImplement(schema),
    design: renderRulesForDesign(schema),
    review: renderRulesForReview(schema),
  };
}
