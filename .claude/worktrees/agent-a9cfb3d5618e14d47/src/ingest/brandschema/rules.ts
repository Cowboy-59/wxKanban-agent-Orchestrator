/**
 * Brand rule extraction — SPEC-127 / T004.
 *
 * A brand's rules are the half of a brand document that no automated reading of a product can ever
 * recover. Colours and type are visible in rendered CSS; statements like "warnings are advisory
 * only; access is never blocked by a prestart result" are not visible anywhere, and are usually the
 * most important thing the document says.
 *
 * This module turns those statements into structured data so they can be delivered to the places
 * where UI actually gets made. It classifies by the heading a rule sits under — never by reading
 * the sentence — because guessing a rule's force from its wording is exactly the kind of inference
 * that produces a rule set nobody audited.
 */
import type { BrandRule, BrandRuleKind } from "../../shared/brand-schema.js";

/** Heading words that identify each kind. Matched case-insensitively against a heading line. */
const KIND_MARKERS: { kind: BrandRuleKind; markers: string[] }[] = [
  { kind: "prohibition", markers: ["what not to do", "prohibition", "never", "do not"] },
  { kind: "invariant", markers: ["invariant", "no mode may", "non-negotiable", "must not change"] },
  { kind: "check", markers: ["acceptance check", "acceptance criteria", "verification"] },
  { kind: "product", markers: ["product rule", "product behaviour", "product behavior", "carried in the ui"] },
];

/**
 * Whether a rule can be decided by a machine.
 *
 * Deliberately conservative: a rule is mechanical only when it is about something countable in code
 * or measurable in a colour space. Everything else is advisory, because overstating what a gate
 * enforces is worse than understating it — it produces confidence nobody checked.
 */
const MECHANICAL_SIGNALS = [
  "declares all",
  "declares every",
  "zero results",
  "no component",
  "never a gradient",
  "grep",
  "contrast",
  "wcag",
  "aa",
  "token",
  "hex",
  "px",
  "must be",
  "scoped to",
  ":root",
];

const ADVISORY_OVERRIDES = [
  "at a glance",
  "reads as",
  "looks",
  "taste",
  "judgement",
  "judgment",
  "wall screen",
  "by eye",
];

// [SCOPE 127 / T004] BEGIN — Parser: rules extraction and loud rejection
export function classifyHeading(heading: string): BrandRuleKind | null {
  const h = heading.toLowerCase();
  for (const { kind, markers } of KIND_MARKERS) {
    if (markers.some((m) => h.includes(m))) return kind;
  }
  return null;
}
// [SCOPE 127 / T004] END

/**
 * Whether a statement is mechanically checkable.
 *
 * An advisory signal always wins: "distinguishable at a glance" mentions neither a number nor a
 * threshold, and calling it mechanical would promise a gate that cannot exist.
 */
// [SCOPE 127 / T004] BEGIN — Parser: rules extraction and loud rejection
export function isMechanical(text: string): boolean {
  const t = text.toLowerCase();
  if (ADVISORY_OVERRIDES.some((s) => t.includes(s))) return false;
  return MECHANICAL_SIGNALS.some((s) => t.includes(s));
}
// [SCOPE 127 / T004] END

/** Strip markdown emphasis and list markers so a rule reads as a plain sentence. */
// [SCOPE 127 / T004] BEGIN — Parser: rules extraction and loud rejection
function cleanStatement(raw: string): string {
  return raw
    .replace(/^\s*[-*+]\s+/, "")
    .replace(/^\s*\d+\.\s+/, "")
    .replace(/(^|\s)>\s*/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
// [SCOPE 127 / T004] END

export interface ExtractedRules {
  rules: BrandRule[];
  /** Headings that looked like rule sections but named no recognised kind. */
  unclassifiedHeadings: { heading: string; line: number }[];
}

/**
 * Extract every rule from a brand instruction document.
 *
 * Rules are bullets or numbered items under a heading whose wording identifies a kind. A rule
 * section whose heading names no recognised kind is reported rather than absorbed under a default:
 * silently filing statements under the wrong force is how a prohibition becomes a suggestion.
 */
// [SCOPE 127 / T004] BEGIN — Parser: rules extraction and loud rejection
export function extractRules(source: string): ExtractedRules {
  const rules: BrandRule[] = [];
  const unclassifiedHeadings: { heading: string; line: number }[] = [];

  const lines = source.split(/\r?\n/);
  let currentKind: BrandRuleKind | null = null;
  let currentHeading = "";
  let counter = 0;
  let inCodeFence = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";

    // Never read inside a fenced block: a CSS mode block is full of lines that look like list
    // items to a naive scanner.
    if (/^\s*```/.test(line)) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) continue;

    const headingMatch = /^#{2,4}\s+(.*)$/.exec(line);
    if (headingMatch) {
      currentHeading = String(headingMatch[1]).replace(/[`*]/g, "").trim();
      currentKind = classifyHeading(currentHeading);
      if (currentKind === null && /rule|invariant|check|not to do|negotiable/i.test(currentHeading)) {
        unclassifiedHeadings.push({ heading: currentHeading, line: i + 1 });
      }
      continue;
    }

    if (currentKind === null) continue;

    // A rule may be a list item OR a blockquote. The blockquote case is not academic: the single
    // most important statement in the reference document — the product rule that warnings are
    // advisory and never block access — is written as a blockquote, and a scanner that only read
    // bullets silently extracted zero product rules from a document that plainly states one.
    // A quote may also wrap across several lines, so continuation lines are gathered.
    const isItem = /^\s*([-*+]|\d+\.)\s+\S/.test(line);
    const isQuote = /^\s*>\s*\S/.test(line);
    if (!isItem && !isQuote) continue;

    let raw = line;
    if (isQuote) {
      let j = i + 1;
      while (j < lines.length && /^\s*>\s*\S/.test(lines[j] ?? "")) {
        raw += " " + (lines[j] ?? "");
        j += 1;
      }
      i = j - 1;
    }

    const text = cleanStatement(raw);
    // A one- or two-word fragment is a list artifact, not a rule.
    if (text.split(/\s+/).length < 4) continue;

    counter += 1;
    rules.push({
      id: `${currentKind}-${String(counter).padStart(3, "0")}`,
      text,
      kind: currentKind,
      mechanical: isMechanical(text),
    });
  }

  return { rules, unclassifiedHeadings };
}
// [SCOPE 127 / T004] END

/** Rules a gate can decide. */
// [SCOPE 127 / T004] BEGIN — Parser: rules extraction and loud rejection
export function mechanicalSubset(extracted: ExtractedRules): BrandRule[] {
  return extracted.rules.filter((r) => r.mechanical);
}
// [SCOPE 127 / T004] END

/**
 * Rules that need a person, as a checklist.
 *
 * Emitted separately and deliberately: claiming a rule is enforced when it is not is the failure
 * this split exists to prevent.
 */
// [SCOPE 127 / T004] BEGIN — Parser: rules extraction and loud rejection
export function advisoryChecklist(extracted: ExtractedRules): string[] {
  return extracted.rules
    .filter((r) => !r.mechanical)
    .map((r) => `[ ] (${r.kind}) ${r.text}`);
}
// [SCOPE 127 / T004] END
