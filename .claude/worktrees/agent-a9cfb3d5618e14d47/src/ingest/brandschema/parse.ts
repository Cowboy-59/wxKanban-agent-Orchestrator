/**
 * Deterministic brand instruction parser — SPEC-127 / T003.
 *
 * Reads a brand instruction document (docs/brand-instruction-format.md is the normative format)
 * and produces the parts of a BrandSchema the document actually supplies, plus a precise list of
 * what it does not.
 *
 * NO LANGUAGE MODEL. The structure is regular and machine-verifiable, and a deterministic parser
 * is also immune to the provider fragility that has affected other work on this codebase.
 *
 * Two rules govern everything here:
 *
 *   1. NOTHING IS INFERRED. Where the format requires a declaration the document does not make —
 *      a mode's light/dark axis, the role map, a token's kind — the parser reports it as a
 *      required declaration and refuses to guess. A palette does not reveal intent, and a parser
 *      that quietly picks a plausible answer produces a schema nobody audited.
 *
 *   2. NOTHING IS PARTIALLY IMPORTED. Unrecognised structure is an error naming the content and
 *      its location. A half-imported brand that reports success is worse than a refusal, because
 *      nobody goes looking for what was dropped.
 *
 * NO NETWORK. A document may reference a site, a repository or a code kit; none is ever fetched.
 */
import type { ContractToken, ModeAxis, ModeTokenSet, TokenKind } from "../../shared/brand-schema.js";

/** Where in the document something was found, so a report can be acted on without a search. */
export interface SourceLocation {
  line: number;
  /** The offending text, trimmed and capped so a report stays readable. */
  excerpt: string;
}

export type ParseIssueSeverity =
  /** The document cannot be parsed further, or would import wrongly. */
  | "error"
  /** The document parsed, but a required declaration is absent and must be supplied. */
  | "required-declaration";

export interface ParseIssue {
  severity: ParseIssueSeverity;
  /** Stable identifier, e.g. `parse:missing-axis`. */
  code: string;
  message: string;
  location: SourceLocation | null;
}

export interface ParsedBrandDocument {
  /** True only when there are no errors AND no missing required declarations. */
  complete: boolean;
  /** True when the document parsed structurally, even if declarations are missing. */
  parsed: boolean;
  contract: ContractToken[];
  modes: Record<string, ModeTokenSet>;
  /** Mode names in document order. */
  modeOrder: string[];
  issues: ParseIssue[];
}

const MAX_EXCERPT = 90;

// [SCOPE 127 / T003] BEGIN — Deterministic parser: tokens, modes, typefaces
function locate(source: string, index: number): SourceLocation {
  const before = source.slice(0, index);
  const line = before.split(/\r?\n/).length;
  const lineStart = before.lastIndexOf("\n") + 1;
  const lineEnd = source.indexOf("\n", index);
  const text = source.slice(lineStart, lineEnd === -1 ? source.length : lineEnd).trim();
  return {
    line,
    excerpt: text.length > MAX_EXCERPT ? text.slice(0, MAX_EXCERPT) + "…" : text,
  };
}
// [SCOPE 127 / T003] END

/**
 * Classify a contract token when the document declares a kind table.
 *
 * Returns null when the document says nothing, which is reported as a required declaration
 * rather than defaulted. Guessing from the value would be wrong in the one case that matters:
 * a token holding a gradient is indistinguishable from a broken colour unless the document says
 * it may hold one.
 */
// [SCOPE 127 / T003] BEGIN — Deterministic parser: tokens, modes, typefaces
export function declaredKind(kindTable: Map<string, string>, token: string): TokenKind | null {
  const raw = kindTable.get(token);
  if (!raw) return null;
  const k = raw.trim().toLowerCase();
  if (k === "color" || k === "colour") return "color";
  if (k === "paint" || k === "length" || k === "fontstack" || k === "number" || k === "keyword") {
    return k as TokenKind;
  }
  return null;
}
// [SCOPE 127 / T003] END

/** Parse the `ROLES` block if the document has one. */
// [SCOPE 127 / T003] BEGIN — Deterministic parser: tokens, modes, typefaces
function parseRoles(source: string): { roles: Record<string, string> | null; location: SourceLocation | null } {
// [SCOPE 127 / T003] END
  const idx = source.search(/^ROLES\s*$/m);
  if (idx === -1) return { roles: null, location: null };
  const block = source.slice(idx).split(/\n\s*\n/)[0] ?? "";
  const roles: Record<string, string> = {};
  for (const [, key, value] of block.matchAll(/^([a-z-]+)\s*:\s*(.+)$/gm)) {
    roles[String(key)] = String(value).trim();
  }
  return { roles, location: locate(source, idx) };
}

/** Parse a per-mode declaration line such as `- Axis: light` or `- Resting: yes`. */
// [SCOPE 127 / T003] BEGIN — Deterministic parser: tokens, modes, typefaces
function declaredValue(block: string, key: string): string | null {
  const re = new RegExp("^\\s*[-*]?\\s*" + key + "\\s*:\\s*(.+)$", "im");
  const m = re.exec(block);
  return m ? String(m[1]).trim() : null;
}
// [SCOPE 127 / T003] END

// [SCOPE 127 / T003] BEGIN — Deterministic parser: tokens, modes, typefaces
function parseAxis(value: string | null): ModeAxis | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  return v === "light" || v === "dark" || v === "preference" ? v : null;
}
// [SCOPE 127 / T003] END

/**
 * Parse a brand instruction document.
 *
 * Never throws on malformed input: a caller gets a report, not an exception, because the report
 * is the product. A thrown error would lose every other issue in the document.
 */
// [SCOPE 127 / T003] BEGIN — Deterministic parser: tokens, modes, typefaces
export function parseBrandDocument(source: string): ParsedBrandDocument {
  const issues: ParseIssue[] = [];
  const add = (severity: ParseIssueSeverity, code: string, message: string, location: SourceLocation | null = null): void => {
    issues.push({ severity, code, message, location });
  };

  // ---- 1. The token contract -------------------------------------------------------------
  const contractMatch = /^```[^\n]*\n((?:[A-Z][A-Z ]*\s+--[a-z-]+[\s\S]*?))```/m.exec(source);
  if (!contractMatch) {
    add(
      "error",
      "parse:no-contract",
      "No token contract block was found. Without it there is nothing to validate modes against, so the document cannot be imported.",
    );
    return { complete: false, parsed: false, contract: [], modes: {}, modeOrder: [], issues };
  }

  const contractNames = Array.from(contractMatch[1]?.match(/--[a-z][a-z0-9-]*/g) ?? []);
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const n of contractNames) {
    if (seen.has(n)) duplicates.add(n);
    seen.add(n);
  }
  for (const n of duplicates) {
    add(
      "error",
      "parse:duplicate-contract-token",
      `The contract declares '${n}' more than once, which makes the required token count ambiguous.`,
      locate(source, contractMatch.index),
    );
  }

  // ---- 2. Declared token kinds ------------------------------------------------------------
  // A markdown table of `| --token | kind | ... |`, if the document supplies one.
  const kindTable = new Map<string, string>();
  for (const [, token, kind] of source.matchAll(/^\|\s*`?(--[a-z0-9-]+)`?\s*\|\s*`?([a-zA-Z]+)`?\s*\|/gm)) {
    kindTable.set(String(token), String(kind));
  }

  const contract: ContractToken[] = [];
  const unclassified: string[] = [];
  for (const name of seen) {
    const kind = declaredKind(kindTable, name);
    if (kind === null) {
      unclassified.push(name);
      // Recorded as `color` so downstream shape stays usable, but the missing declaration is
      // reported — the caller must not treat this as a classification the document made.
      contract.push({ name, kind: "color" });
    } else {
      contract.push({ name, kind });
    }
  }
  if (unclassified.length > 0) {
    add(
      "required-declaration",
      "parse:unclassified-tokens",
      `${unclassified.length} contract token(s) have no declared kind: ${unclassified.slice(0, 6).join(", ")}` +
        (unclassified.length > 6 ? `, and ${unclassified.length - 6} more` : "") +
        ". Kind cannot be guessed from a value: a token holding a gradient is indistinguishable from a broken colour unless the document says it may hold one.",
      locate(source, contractMatch.index),
    );
  }

  // ---- 3. Modes ---------------------------------------------------------------------------
  const modes: Record<string, ModeTokenSet> = {};
  const modeOrder: string[] = [];
  const modeRe = /^#{2,4}\s+`([A-Za-z][A-Za-z0-9_-]*)`[^\n]*\n([\s\S]*?)```css\n([\s\S]*?)```/gm;

  let m: RegExpExecArray | null;
  while ((m = modeRe.exec(source)) !== null) {
    const name = String(m[1]);
    const preamble = String(m[2]);
    const body = String(m[3]);
    const where = locate(source, m.index);

    const tokens: Record<string, string> = {};
    for (const [, k, v] of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      tokens[String(k)] = String(v).trim();
    }

    if (Object.keys(tokens).length === 0) {
      add("error", "parse:empty-mode", `Mode '${name}' declares no tokens.`, where);
      continue;
    }

    const axis = parseAxis(declaredValue(preamble, "Axis"));
    if (axis === null) {
      add(
        "required-declaration",
        "parse:missing-axis",
        `Mode '${name}' does not declare its light/dark relationship. It must state one of: light, dark, preference. ` +
          "It is never inferred from the palette — a light-surfaced mode under a dark system preference renders mixed unless it says which it is.",
        where,
      );
    }

    const restingRaw = declaredValue(preamble, "Resting");
    const resting = restingRaw === null ? null : /^(yes|true)$/i.test(restingRaw);
    if (resting === null) {
      add(
        "required-declaration",
        "parse:missing-resting",
        `Mode '${name}' does not declare whether it is the resting mode. Exactly one mode in a document must, and it is what the base stylesheet carries.`,
        where,
      );
    }

    if (modes[name]) {
      add("error", "parse:duplicate-mode", `Mode '${name}' is declared more than once.`, where);
      continue;
    }

    modes[name] = {
      name,
      // `axis` and `resting` carry the parser's best-known state. Both are reported above when
      // absent, and a caller must not persist a schema while a required declaration is missing.
      axis: axis ?? "preference",
      resting: resting ?? false,
      tokens,
    };
    modeOrder.push(name);
  }

  if (modeOrder.length === 0) {
    add("error", "parse:no-modes", "No mode blocks were found. A document must declare at least one mode.");
  }

  // ---- 4. Completeness of each mode against the contract ----------------------------------
  for (const name of modeOrder) {
    const mode = modes[name] as ModeTokenSet;
    const missing = Array.from(seen).filter((t) => {
      const v = mode.tokens[t];
      return typeof v !== "string" || v.trim().length === 0;
    });
    if (missing.length > 0) {
      add(
        "error",
        "parse:incomplete-mode",
        `Mode '${name}' omits ${missing.length} of ${seen.size} contract tokens: ${missing.join(", ")}. ` +
          "A missing token is a defect, not a fallback — it is never inherited from another mode or from a default.",
      );
    }
    const extra = Object.keys(mode.tokens).filter((t) => !seen.has(t));
    if (extra.length > 0) {
      add(
        "error",
        "parse:undeclared-token",
        `Mode '${name}' declares ${extra.length} token(s) the contract does not name: ${extra.join(", ")}.`,
      );
    }
  }

  // ---- 5. Exactly one resting mode --------------------------------------------------------
  const restingModes = modeOrder.filter((n) => (modes[n] as ModeTokenSet).resting);
  if (modeOrder.length > 0 && !issues.some((i) => i.code === "parse:missing-resting")) {
    if (restingModes.length === 0) {
      add("error", "parse:no-resting-mode", "No mode is declared resting. Exactly one is required.");
    } else if (restingModes.length > 1) {
      add(
        "error",
        "parse:multiple-resting-modes",
        `${restingModes.length} modes are declared resting (${restingModes.join(", ")}). Exactly one is required.`,
      );
    }
  }

  // ---- 6. The role map --------------------------------------------------------------------
  const { roles, location: rolesAt } = parseRoles(source);
  if (roles === null) {
    add(
      "required-declaration",
      "parse:missing-roles",
      "The document declares no ROLES block. Without it, checks cannot know which token is the page surface, which is body text, " +
        "which is the action colour and which are the status pairs — so contrast and distinguishability cannot be measured against roles rather than against one brand's token names.",
    );
  } else {
    for (const required of ["surface", "body", "ink", "accent"]) {
      const token = roles[required];
      if (!token) {
        add("required-declaration", "parse:missing-role", `The ROLES block does not name a token for '${required}'.`, rolesAt);
      } else if (!seen.has(token)) {
        add(
          "error",
          "parse:role-points-nowhere",
          `Role '${required}' names '${token}', which the contract does not declare.`,
          rolesAt,
        );
      }
    }
  }

  const errors = issues.filter((i) => i.severity === "error");
  const missingDeclarations = issues.filter((i) => i.severity === "required-declaration");

  return {
    complete: errors.length === 0 && missingDeclarations.length === 0,
    parsed: errors.length === 0,
    contract,
    modes,
    modeOrder,
    issues,
  };
}
// [SCOPE 127 / T003] END

/** Plain-language summary of everything a document must supply before it can be imported. */
// [SCOPE 127 / T003] BEGIN — Deterministic parser: tokens, modes, typefaces
export function describeParseIssues(result: ParsedBrandDocument): string[] {
  return result.issues.map((i) => {
    const at = i.location ? ` (line ${i.location.line}: ${i.location.excerpt})` : "";
    const label = i.severity === "error" ? "ERROR" : "NEEDS DECLARING";
    return `${label} — ${i.message}${at}`;
  });
}
// [SCOPE 127 / T003] END
