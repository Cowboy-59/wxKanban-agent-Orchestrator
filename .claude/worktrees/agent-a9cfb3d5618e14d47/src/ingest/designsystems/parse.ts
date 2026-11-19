// SCOPE-114 / T005 — parse a curated design-system analysis into structured tokens.
//
// WHY A PURPOSE-BUILT PARSER RATHER THAN A YAML LIBRARY.
// `js-yaml` is present in node_modules but is NOT a declared dependency of this project
// (it arrives transitively), and it ships no types here — so importing it would mean
// relying on something a dependency bump can remove, and either adding two new manifest
// entries or violating the no-`any` rule. Measured against that, the input is a very small
// and very regular subset: all 50 documents share the same nine top-level keys, use
// two-space block maps, and nest at most one level of single-line flow maps. Parsing that
// subset directly is a contained amount of code, needs no dependency, and — the deciding
// factor — lets every failure name the exact file and line, which is what makes a bad
// addition to the pack diagnosable in one read instead of surfacing as a downstream
// `undefined`. A general YAML parser reports "bad indentation at 77:51" and leaves you to
// find which of 50 folders it meant.
//
// Being strict is the point. Anything this parser does not recognise throws rather than
// being skipped, because a silently-dropped token group would produce a plausible-looking
// catalog entry with a missing type scale or no controls.
//
// TWO QUIRKS OF THE REAL DATA, both handled here rather than by editing the pack:
//   1. Two of the 50 documents write `button-secondary:{ … }` with no space after the
//      colon, which is not valid YAML mapping syntax at all. The pack is third-party
//      input, so the parser normalises it instead of us silently mutating source data
//      that could be re-supplied at any time.
//   2. `lineHeight: 1.0` parses as the NUMBER 1, losing the author's `.0`. Every metric
//      that `TypeRole` types as a string is coerced back to a string, so a numeric
//      literal cannot leak into a field the renderers will interpolate into CSS.

import type {
  ColorRamp,
  ControlSet,
  ControlSpec,
  DesignSystemTokens,
  ElevationScale,
  LengthScale,
  TypeRole,
  TypeScale,
} from "../../shared/design-system";

/** Everything one analysis document yields, before colour mapping or mode synthesis. */
export interface ParsedDesignDocument {
  /** The document's own `version` marker, e.g. `"alpha"`. */
  version: string;
  /** The document's own `name`, e.g. `"Linear Analysis"`. Not the customer-facing name. */
  name: string;
  /** The folded `description` prose, shown on the browse card. */
  description: string;
  /** The six token groups, verbatim. */
  tokens: DesignSystemTokens;
  /** The long-form analysis prose that follows the frontmatter. */
  analysis: string;
}

/** What the sibling showcase page tells us about fonts — the authoritative source. */
export interface ParsedShowcase {
  /** The resolved CSS font stack the showcase actually renders with (its `--font` value). */
  fontStack: string;
  /** The webfont stylesheet href, or null when the showcase declares none. */
  fontImportUrl: string | null;
}

/** A parse failure that names where it happened, so a bad pack addition is diagnosable. */
// [SCOPE 115 / T005] BEGIN — Frontmatter + showcase parser
export class DesignParseError extends Error {
  constructor(
    public readonly source: string,
    public readonly line: number,
    message: string,
  ) {
    super(`${source}:${line} — ${message}`);
    this.name = "DesignParseError";
  }
}
// [SCOPE 115 / T005] END

/** Metrics that `TypeRole` types as strings, and so must never stay numeric. */
const STRING_TYPE_METRICS = ["fontSize", "lineHeight", "letterSpacing"] as const;

/**
 * Parse one `DESIGN-*.md` into its frontmatter tokens plus the prose analysis below it.
 *
 * `source` is used only for error messages — pass the pack folder name so a failure reads
 * `Cohere:77 — …` rather than pointing at an anonymous buffer.
 */
// [SCOPE 115 / T005] BEGIN — Frontmatter + showcase parser
export function parseDesignDocument(raw: string, source: string): ParsedDesignDocument {
  const { frontmatter, body, offset } = splitFrontmatter(raw, source);
  const sections = parseTopLevel(frontmatter, source, offset);

  const version = requireScalar(sections, "version", source);
  const name = requireScalar(sections, "name", source);
  const description = requireScalar(sections, "description", source);

  const tokens: DesignSystemTokens = {
    colors: asColorRamp(requireBlock(sections, "colors", source), source),
    typography: asTypeScale(requireBlock(sections, "typography", source), source),
    rounded: asLengthScale(requireBlock(sections, "rounded", source), source, "rounded"),
    spacing: asLengthScale(requireBlock(sections, "spacing", source), source, "spacing"),
    elevation: asElevationScale(requireBlock(sections, "elevation", source), source),
    components: asControlSet(requireBlock(sections, "components", source), source),
  };

  return { version, name, description, tokens, analysis: body.trim() };
}
// [SCOPE 115 / T005] END

/**
 * Lift the font facts out of a showcase page.
 *
 * The showcase is authoritative rather than the frontmatter's `fontFamily`, which often
 * names a proprietary face the browser cannot load (`Aeonik`, `Söhne`, `Porsche Next`).
 * The showcase's `--font` custom property is the stack that page actually renders with —
 * substitutions already applied by the analysis author — and its stylesheet `<link>` is
 * the URL that makes it loadable. All 50 curated showcases carry both.
 */
// [SCOPE 115 / T005] BEGIN — Frontmatter + showcase parser
export function parseShowcase(html: string): ParsedShowcase {
  const fontVar = html.match(/--font\s*:\s*([^;\n}]+)/);
// [SCOPE 115 / T005] END
  const link = html.match(
    /<link[^>]+href\s*=\s*["']((?:https?:)?\/\/fonts\.googleapis\.com\/[^"']+)["']/i,
  );
  return {
    fontStack: fontVar ? collapseSpace(fontVar[1]) : "",
    fontImportUrl: link ? normalizeUrl(link[1]) : null,
  };
}

/**
 * The typeface the source system actually specifies, stripped of the pack's inline
 * substitution notes — `"Wise Sans (subst. Inter)"` becomes `Wise Sans`.
 *
 * Kept separate from the loadable stack on purpose: this is the name a customer needs in
 * order to license the real face, and the generated DESIGN.md cites it. No font binary is
 * ever shipped, so naming the intended face is the only honest way to convey it.
 */
// [SCOPE 115 / T005] BEGIN — Frontmatter + showcase parser
export function intendedFontFamily(tokens: DesignSystemTokens): string {
  const role =
    tokens.typography["body-md"] ??
    tokens.typography["display-1"] ??
    Object.values(tokens.typography)[0];
  if (!role) return "";
  return stripSubstitutionNote(role.fontFamily);
}
// [SCOPE 115 / T005] END

/**
 * Remove a substitution annotation from a declared family name.
 *
 * The pack writes these at least four ways — `(subst. Inter)`, `(substitute: Inter)`,
 * `(sub: Inter)`, `(→ Inter substitute)` — so the note is matched structurally, as a
 * trailing parenthesised group, rather than by enumerating the known variants, which would
 * quietly miss a fifth spelling in a future addition.
 */
// [SCOPE 115 / T005] BEGIN — Frontmatter + showcase parser
export function stripSubstitutionNote(family: string): string {
  return collapseSpace(family.replace(/\s*\([^)]*\)\s*$/, "")).replace(/^["']|["']$/g, "");
}
// [SCOPE 115 / T005] END

// ── frontmatter structure ────────────────────────────────────────────────────

interface ParsedSections {
  scalars: Map<string, string>;
  blocks: Map<string, BlockEntry[]>;
}

interface BlockEntry {
  key: string;
  value: string;
  line: number;
}

/** Split the `---` fenced frontmatter from the prose body, keeping the line offset. */
// [SCOPE 115 / T005] BEGIN — Frontmatter + showcase parser
function splitFrontmatter(
  raw: string,
  source: string,
): { frontmatter: string; body: string; offset: number } {
// [SCOPE 115 / T005] END
  const lines = raw.replace(/^﻿/, "").split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    throw new DesignParseError(source, 1, "expected a '---' frontmatter fence on line 1");
  }
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (end < 0) throw new DesignParseError(source, 1, "unterminated frontmatter fence");
  return {
    frontmatter: lines.slice(1, end).join("\n"),
    body: lines.slice(end + 1).join("\n"),
    offset: 2,
  };
}

/** Walk the frontmatter, collecting top-level scalars, folded scalars and block maps. */
// [SCOPE 115 / T005] BEGIN — Frontmatter + showcase parser
function parseTopLevel(frontmatter: string, source: string, offset: number): ParsedSections {
  const scalars = new Map<string, string>();
  const blocks = new Map<string, BlockEntry[]>();
  const lines = frontmatter.split("\n");

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i] ?? "";
    if (isSkippable(rawLine)) continue;

    const top = rawLine.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/);
    if (!top) {
      throw new DesignParseError(
        source,
        i + offset,
        `expected a top-level 'key:' at indent 0, got ${JSON.stringify(truncate(rawLine))}`,
      );
    }
    const key = top[1] ?? "";
    const inline = stripComment(top[2] ?? "").trim();

    // Folded / literal scalar: consume the indented continuation as one joined paragraph.
    if (inline === ">" || inline === "|" || inline === ">-" || inline === "|-") {
      const parts: string[] = [];
      while (i + 1 < lines.length && isIndentedOrBlank(lines[i + 1])) {
        i += 1;
        const text = (lines[i] ?? "").trim();
        if (text) parts.push(text);
      }
      scalars.set(key, collapseSpace(parts.join(" ")));
      continue;
    }

    // Plain scalar on the same line.
    if (inline !== "") {
      scalars.set(key, unquote(inline));
      continue;
    }

    // Block map: every indented `key: value` beneath this one.
    const entries: BlockEntry[] = [];
    while (i + 1 < lines.length && isIndentedOrBlank(lines[i + 1])) {
      i += 1;
      const line = lines[i] ?? "";
      if (isSkippable(line)) continue;
      // Quirk 1: two documents write `key:{ … }` with no space after the colon.
      const normalized = line.replace(/^(\s+[\w-]+):\{/, "$1: {");
      const entry = normalized.match(/^\s+([\w-]+)\s*:\s*(.*)$/);
      if (!entry) {
        throw new DesignParseError(
          source,
          i + offset,
          `expected an indented 'key: value' under '${key}', got ${JSON.stringify(truncate(line))}`,
        );
      }
      entries.push({
        key: entry[1] ?? "",
        value: (entry[2] ?? "").trim(),
        line: i + offset,
      });
    }
    if (entries.length === 0) {
      throw new DesignParseError(source, i + offset, `block '${key}' is empty`);
    }
    blocks.set(key, entries);
  }

  return { scalars, blocks };
}

/** A line that carries no data: blank, or a comment. Comment lines appear inside blocks. */
function isSkippable(line: string): boolean {
  const t = line.trim();
  return t === "" || t.startsWith("#");
}

/** True while a line still belongs to the block or folded scalar being consumed. */
function isIndentedOrBlank(line: string | undefined): boolean {
  if (line === undefined) return false;
  return line.trim() === "" || /^\s/.test(line);
}

// ── group coercion ───────────────────────────────────────────────────────────

function requireScalar(sections: ParsedSections, key: string, source: string): string {
  const value = sections.scalars.get(key);
  if (value === undefined || value === "") {
    throw new DesignParseError(source, 1, `missing required top-level key '${key}'`);
  }
  return value;
}

function requireBlock(sections: ParsedSections, key: string, source: string): BlockEntry[] {
  const block = sections.blocks.get(key);
  if (!block) {
    throw new DesignParseError(source, 1, `missing required token group '${key}'`);
  }
  return block;
}

function asColorRamp(entries: BlockEntry[], source: string): ColorRamp {
  const out: ColorRamp = {};
  for (const entry of entries) {
    const value = unquote(stripComment(entry.value).trim());
    if (value === "") {
      throw new DesignParseError(source, entry.line, `colors.${entry.key} is empty`);
    }
    out[entry.key] = value;
  }
  return out;
}

function asLengthScale(entries: BlockEntry[], source: string, group: string): LengthScale {
  const out: LengthScale = {};
  for (const entry of entries) {
    const value = unquote(stripComment(entry.value).trim());
    if (value === "") {
      throw new DesignParseError(source, entry.line, `${group}.${entry.key} is empty`);
    }
    out[entry.key] = value;
  }
  return out;
}

function asElevationScale(entries: BlockEntry[], source: string): ElevationScale {
  const out: ElevationScale = {};
  for (const entry of entries) {
    // Elevation values legitimately contain `#` only inside quotes, and several documents
    // annotate this group with comment-only lines, which parseTopLevel already skipped.
    out[entry.key] = unquote(stripComment(entry.value).trim());
  }
  return out;
}

function asTypeScale(entries: BlockEntry[], source: string): TypeScale {
  const out: TypeScale = {};
  for (const entry of entries) {
    const flow = parseFlowMap(entry.value, source, entry.line, `typography.${entry.key}`);
    const role: TypeRole = {
      fontFamily: flow["fontFamily"] ?? "",
      fontSize: flow["fontSize"] ?? "",
      // Weight is the one metric allowed to stay numeric — interpolated variable-font
      // weights like 510 are meaningful as numbers and several systems rely on them.
      fontWeight: numericOrString(flow["fontWeight"] ?? ""),
      lineHeight: flow["lineHeight"] ?? "",
      letterSpacing: flow["letterSpacing"] ?? "",
    };
    if (role.fontFamily === "") {
      throw new DesignParseError(
        source,
        entry.line,
        `typography.${entry.key} has no fontFamily`,
      );
    }
    // Quirk 2: keep every string-typed metric a string, so `lineHeight: 1.0` cannot
    // arrive as the number 1 and be interpolated into CSS as "1".
    for (const metric of STRING_TYPE_METRICS) {
      role[metric] = String(role[metric]);
    }
    out[entry.key] = role;
  }
  return out;
}

function asControlSet(entries: BlockEntry[], source: string): ControlSet {
  const out: ControlSet = {};
  for (const entry of entries) {
    const flow = parseFlowMap(entry.value, source, entry.line, `components.${entry.key}`);
    const spec: ControlSpec = {};
    for (const [k, v] of Object.entries(flow)) spec[k] = v;
    out[entry.key] = spec;
  }
  return out;
}

/** `510` → 510, anything else → the trimmed string. Keeps `fontWeight` honest. */
function numericOrString(value: string): number | string {
  const trimmed = value.trim();
  return /^-?\d+$/.test(trimmed) ? Number(trimmed) : trimmed;
}

// ── flow maps ────────────────────────────────────────────────────────────────

/**
 * Parse a single-line flow map: `{ fontFamily: Inter, fontSize: 64px }`.
 *
 * Splitting is quote-aware, which is not optional: one control spec's value is
 * `"linear-gradient(78deg, #ff7759 0%, #7670c5 60%, #4c6ee6 90%)"`. A naive split on `,`
 * would shred it into four bogus properties, and a naive `#` comment strip would truncate
 * it at the first colour stop.
 */
export function parseFlowMap(
  raw: string,
  source: string,
  line: number,
  context: string,
): Record<string, string> {
  // Strip a trailing `# note` BEFORE the brace check. Several documents annotate a type
  // role after its closing brace (`{ … }   # UPPERCASE`), so testing endsWith("}") on the
  // raw line rejects 11 of the 50 systems. The strip is quote-aware, so the `#` inside a
  // quoted `"linear-gradient(…, #ff7759 0%, …)"` value survives untouched.
  const text = stripComment(raw).trim();
  if (!text.startsWith("{") || !text.endsWith("}")) {
    throw new DesignParseError(
      source,
      line,
      `${context} must be a single-line { … } map, got ${JSON.stringify(truncate(text))}`,
    );
  }
  const inner = text.slice(1, -1);
  const out: Record<string, string> = {};
  for (const part of splitOutsideQuotes(inner, ",")) {
    const trimmed = part.trim();
    if (trimmed === "") continue;
    const colon = indexOutsideQuotes(trimmed, ":");
    if (colon < 0) {
      throw new DesignParseError(
        source,
        line,
        `${context}: property ${JSON.stringify(truncate(trimmed))} has no ':'`,
      );
    }
    const key = trimmed.slice(0, colon).trim();
    const value = unquote(trimmed.slice(colon + 1).trim());
    if (key === "") {
      throw new DesignParseError(source, line, `${context}: empty property name`);
    }
    out[key] = value;
  }
  return out;
}

/** Split on a delimiter that appears outside single or double quotes. */
function splitOutsideQuotes(text: string, delimiter: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (const ch of text) {
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
    if (ch === delimiter) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

/** Index of the first occurrence of `needle` outside quotes, or -1. */
function indexOutsideQuotes(text: string, needle: string): number {
  let quote: string | null = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] ?? "";
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === needle) return i;
  }
  return -1;
}

// ── scalars ──────────────────────────────────────────────────────────────────

/**
 * Remove a trailing `# comment`, but only when the `#` sits outside quotes.
 *
 * Load-bearing: every colour in the pack is a quoted hex like `"#5e6ad2"` followed by a
 * descriptive comment. Stripping from the first `#` unconditionally would erase the value
 * and leave the comment.
 */
export function stripComment(line: string): string {
  const hash = indexOutsideQuotes(line, "#");
  return hash < 0 ? line : line.slice(0, hash);
}

/** Strip one matching pair of surrounding quotes, leaving inner quotes untouched. */
export function unquote(value: string): string {
  const t = value.trim();
  if (t.length >= 2) {
    const first = t[0];
    const last = t[t.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return t.slice(1, -1);
    }
  }
  return t;
}

/** Collapse runs of whitespace to single spaces and trim. */
function collapseSpace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Promote a protocol-relative href to https so it is usable as a stored URL. */
function normalizeUrl(href: string): string {
  return href.startsWith("//") ? `https:${href}` : href;
}

/** Shorten a fragment for an error message without losing its beginning. */
function truncate(text: string): string {
  const t = text.trim();
  return t.length > 60 ? `${t.slice(0, 57)}...` : t;
}

// [SCOPE 115 / T005] END