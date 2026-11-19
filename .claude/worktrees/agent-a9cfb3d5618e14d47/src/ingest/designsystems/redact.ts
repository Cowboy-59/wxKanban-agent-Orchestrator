// SCOPE-114 / SPEC-116 T001 — redact the originating brand from customer-facing text.
//
// Renaming the catalog entries was necessary but NOT sufficient, and the gap only became
// visible once the real list endpoint was called and its payload searched. The `sourcebrand`
// COLUMN is correctly excluded from every response, which made the "no brand reaches a client"
// check read as satisfied. It wasn't. The brand was still arriving through three other fields:
//
//   `description` — the pack's own summary prose names the product outright
//                   ("Stripe sets a near-black indigo ink...", "Linear's identity lives in...")
//   `analysis`    — the long-form essay, which names it many times over, and which the
//                   download bundle will emit as DESIGN.md
//   `fontstack`   — proprietary brand faces ("Gucci Sans Pro", "Porsche Next")
//
// The lesson worth keeping: excluding a column is not the same as excluding the information in
// it. So redaction happens HERE, at ingest, rather than in each route — the database then holds
// only text that is already safe to serve, and every downstream consumer (browse, detail,
// DESIGN.md, generated artifacts) inherits that for free instead of each needing its own guard.
//
// `sourcebrand` remains the single place the brand is recorded, which is exactly the shape the
// naming decision called for.

/** Neutral stand-ins. Chosen to read naturally mid-sentence rather than as an obvious hole. */
const SUBJECT = "this system";
const POSSESSIVE = "this system's";

/**
 * Remove a brand from a block of prose, preserving readability.
 *
 * Handles the possessive first — "Linear's identity" must become "this system's identity", not
 * "this system's" followed by an orphaned "'s". Matching is word-boundary and case-insensitive,
 * and multi-word folder names ("Bang Olufsen", "Ready Mag", "Teenage Engineering") are matched
 * as phrases, plus their concatenated and hyphenated spellings, because the prose is not
 * consistent about which it uses.
 *
 * Returns the text unchanged when `brand` is empty, so a hand-built entry with no source is a
 * no-op rather than a crash.
 */
// [SCOPE 116 / T001] BEGIN — Catalog read routes (src/server/routes/designSystems.ts)
export function redactBrand(text: string, brand: string, replacement?: string): string {
  if (!brand.trim() || !text) return text;

  // Prefer the entry's own curated name over a generic pronoun. Compare the two outcomes on a
  // real heading: "Design System Analysis of this system" versus "Design System Analysis of
  // Electric Indigo on Near-Black". The second is both better prose and more useful — the
  // analysis is read by a customer deciding whether to pick the look, and by the AI generating
  // their product, and neither is served by an anonymous referent.
  const subject = replacement?.trim() || SUBJECT;
  const possessive = replacement?.trim() ? `${replacement.trim()}'s` : POSSESSIVE;

  let out = text;
  for (const variant of brandVariants(brand)) {
    const escaped = escapeRegExp(variant);
    // Curly and straight apostrophes both appear in the pack.
    out = out.replace(new RegExp(`\\b${escaped}['’]s\\b`, "gi"), possessive);
    out = out.replace(new RegExp(`\\b${escaped}\\b`, "gi"), subject);
    // The brand also appears GLUED to the following word, almost always as the name of its
    // proprietary typeface: `**CoinbaseSans**`, `MonzoSansText`, `FigmaSans`, `NotionInter`.
    // A trailing `\b` cannot match there — the next character is a word character — so five of
    // the fifty entries kept their brand in the analysis prose, and therefore in the DESIGN.md
    // the bundle emits. Matching the brand when an uppercase letter follows catches exactly
    // that shape while leaving ordinary words alone.
    //
    // Guarded on length: a short brand would fire inside unrelated CamelCase identifiers, and a
    // false positive here silently corrupts prose rather than leaking anything.
    if (variant.length >= 4) {
      out = out.replace(new RegExp(`\\b${escaped}(?=[A-Z])`, "g"), `${subject} `);
    }
  }

  // Collapse the doubling redaction can create when the brand appeared twice adjacently.
  const escSubject = escapeRegExp(subject);
  out = out.replace(new RegExp(`\\b${escSubject}(?:'s)?\\s+${escSubject}\\b`, "gi"), subject);
  return out;
}
// [SCOPE 116 / T001] END

/**
 * Strip brand-named families from a CSS font stack, keeping the loadable remainder.
 *
 * These families are proprietary and cannot load in a browser anyway — the analysis author
 * already put a real substitute next to them, which is what actually renders. So removing the
 * brand-named entry loses nothing functional while taking the trademark out of every generated
 * stylesheet.
 *
 * Falls back to a generic stack rather than returning an empty string, because this value goes
 * straight into CSS and an empty `font-family` is a broken rule.
 */
// [SCOPE 116 / T001] BEGIN — Catalog read routes (src/server/routes/designSystems.ts)
export function redactFontStack(stack: string, brand: string): string {
  if (!stack) return "";
  const variants = brand.trim() ? brandVariants(brand) : [];
  const kept = splitFontStack(stack).filter((family) => {
    const bare = family.replace(/["']/g, "").trim();
    if (!bare) return false;
    // Compare on a normalised form as well as on word boundaries. Font stacks write the brand
    // face BOTH ways — `"Coinbase Sans"` and the concatenated `CoinbaseSans`, `MonzoSansText` —
    // and a `\b`-anchored test only catches the spaced spelling, so the concatenated one shipped
    // the trademark straight into `theme.typography.fontFamily` and every artifact built from it.
    const flat = bare.toLowerCase().replace(/[^a-z0-9]/g, "");
    return !variants.some((v) => {
      if (new RegExp(`\\b${escapeRegExp(v)}\\b`, "i").test(bare)) return true;
      const flatVariant = v.toLowerCase().replace(/[^a-z0-9]/g, "");
      return flatVariant.length >= 4 && flat.startsWith(flatVariant);
    });
  });
  return kept.length > 0 ? kept.join(",") : "system-ui, sans-serif";
}
// [SCOPE 116 / T001] END

/**
 * The spellings of a brand that plausibly appear in prose.
 *
 * A folder like "Bang Olufsen" shows up spaced, concatenated and hyphenated across these
 * documents, and "Mercedez-Benz" arrives hyphenated in the folder name but spaced in the text.
 * Longest first so a multi-word match is consumed before its individual words are.
 */
// [SCOPE 116 / T001] BEGIN — Catalog read routes (src/server/routes/designSystems.ts)
// MODIFIED-BY [SCOPE 116 / T011] — split a CamelCase folder into its spaced/hyphenated forms
export function brandVariants(brand: string): string[] {
  const trimmed = brand.trim();
  // A folder name may itself be the CONCATENATED spelling while the prose uses the spaced one:
  // the folder is `ActiveTheory` and every sentence in its analysis says "Active Theory". Only
  // the folder spelling was derived before, so the prose form was never matched and the brand
  // survived redaction in full. Splitting on the internal capitals recovers the other spellings.
  const camelParts = trimmed
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[\s-]+/)
    .filter(Boolean);
  const parts = camelParts.length > 1 ? camelParts : trimmed.split(/[\s-]+/).filter(Boolean);
  const variants = new Set<string>([trimmed]);
  if (parts.length > 1) {
    variants.add(parts.join(" "));
    variants.add(parts.join(""));
    variants.add(parts.join("-"));
    // Single-word fragments only when they are distinctive enough to not be English.
    for (const part of parts) if (part.length >= 5) variants.add(part);
  }
  return [...variants].sort((a, b) => b.length - a.length);
}
// [SCOPE 116 / T001] END

/** Split a font stack on commas that sit outside quotes. */
// [SCOPE 116 / T001] BEGIN — Catalog read routes (src/server/routes/designSystems.ts)
function splitFontStack(stack: string): string[] {
  const out: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (const ch of stack) {
    if (quote) {
      if (ch === quote) quote = null;
      current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === ",") {
      out.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}
// [SCOPE 116 / T001] END

// [SCOPE 116 / T001] BEGIN — Catalog read routes (src/server/routes/designSystems.ts)
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
// [SCOPE 116 / T001] END
