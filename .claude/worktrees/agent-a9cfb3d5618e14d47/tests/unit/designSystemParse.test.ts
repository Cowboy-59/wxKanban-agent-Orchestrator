import { describe, it, expect } from "vitest";
import {
  DesignParseError,
  intendedFontFamily,
  parseDesignDocument,
  parseFlowMap,
  parseShowcase,
  stripComment,
  stripSubstitutionNote,
  unquote,
} from "~/ingest/designsystems/parse";

// SCOPE-115 / T005 — the frontmatter and showcase parser. The cases below are not
// hypothetical: each one is a shape that actually appears in the 50 curated documents and
// broke an earlier version of this parser. Two are outright defects in the source data —
// a missing space after a colon, and a comment placed after a flow map's closing brace —
// which the parser absorbs rather than us silently editing third-party input.

const MINIMAL = `---
version: alpha
name: Test Analysis
description: >
  A short summary that folds
  across two source lines.

colors:
  canvas: "#08090a"            # page background
  surface: "#101113"
  ink: "#f7f8f8"
  ink-secondary: "#d0d6e0"
  ink-faint: "#62666d"
  hairline: "rgba(255,255,255,0.08)"
  primary: "#5e6ad2"
  on-primary: "#ffffff"

typography:
  display-1: { fontFamily: Inter, fontSize: 64px, fontWeight: 510, lineHeight: 1.0, letterSpacing: -1.41px }
  body-md:   { fontFamily: Inter, fontSize: 16px, fontWeight: 400, lineHeight: 1.5, letterSpacing: normal }
  button:    { fontFamily: Inter, fontSize: 13px, fontWeight: 510, lineHeight: 1.0, letterSpacing: normal }   # UPPERCASE

rounded:
  sm: 6px
  full: 9999px

spacing:
  xs: 8px

elevation:
  level-0: "none"
  level-1: "0 2px 4px rgba(0,0,0,0.4)"
  # signature: raised controls add an inset top highlight —
  # "inset 0 1px 0 rgba(255,255,255,0.04)"

components:
  nav-bar:         { backgroundColor: "{colors.canvas}", padding: 0 12px }
  button-primary:  { background: "{colors.primary}", rounded: "{rounded.sm}", height: 32px }
  button-secondary:{ background: transparent, border: "1px solid {colors.hairline}" }
  text-input:      { backgroundColor: "{colors.surface}", padding: 12px 14px }
---

# Test — Design Language Analysis

The prose body begins here and is captured as the analysis.

## Colour

More prose.
`;

describe("parseDesignDocument", () => {
  it("reads the top-level scalars", () => {
    const doc = parseDesignDocument(MINIMAL, "Test");
    expect(doc.version).toBe("alpha");
    expect(doc.name).toBe("Test Analysis");
  });

  it("folds a multi-line description into one line", () => {
    const doc = parseDesignDocument(MINIMAL, "Test");
    expect(doc.description).toBe("A short summary that folds across two source lines.");
  });

  it("captures the prose body as the analysis", () => {
    const doc = parseDesignDocument(MINIMAL, "Test");
    expect(doc.analysis.startsWith("# Test — Design Language Analysis")).toBe(true);
    expect(doc.analysis).toContain("## Colour");
    // the frontmatter must not bleed into the analysis
    expect(doc.analysis).not.toContain("fontFamily");
  });

  it("strips a trailing comment without eating the quoted hex value", () => {
    const doc = parseDesignDocument(MINIMAL, "Test");
    expect(doc.tokens.colors["canvas"]).toBe("#08090a");
  });

  it("keeps a translucent rgba value verbatim", () => {
    const doc = parseDesignDocument(MINIMAL, "Test");
    expect(doc.tokens.colors["hairline"]).toBe("rgba(255,255,255,0.08)");
  });

  it("tolerates a comment AFTER a flow map's closing brace", () => {
    // Real quirk: 11 of the 50 documents annotate a type role like `{ … }   # UPPERCASE`.
    const doc = parseDesignDocument(MINIMAL, "Test");
    expect(doc.tokens.typography["button"]).toMatchObject({
      fontFamily: "Inter",
      fontSize: "13px",
      fontWeight: 510,
    });
  });

  it("tolerates a missing space after the colon on a flow map", () => {
    // Real quirk: 2 of the 50 documents write `button-secondary:{ … }`, which is not
    // valid YAML mapping syntax and defeats a general YAML parser outright.
    const doc = parseDesignDocument(MINIMAL, "Test");
    expect(doc.tokens.components["button-secondary"]?.background).toBe("transparent");
  });

  it("keeps lineHeight a string so `1.0` cannot become the number 1", () => {
    const doc = parseDesignDocument(MINIMAL, "Test");
    expect(doc.tokens.typography["display-1"]?.lineHeight).toBe("1.0");
    expect(typeof doc.tokens.typography["display-1"]?.lineHeight).toBe("string");
  });

  it("keeps fontWeight numeric for interpolated variable-font weights", () => {
    const doc = parseDesignDocument(MINIMAL, "Test");
    expect(doc.tokens.typography["display-1"]?.fontWeight).toBe(510);
  });

  it("preserves negative letter-spacing with its unit", () => {
    const doc = parseDesignDocument(MINIMAL, "Test");
    expect(doc.tokens.typography["display-1"]?.letterSpacing).toBe("-1.41px");
  });

  it("skips comment-only lines inside a block", () => {
    const doc = parseDesignDocument(MINIMAL, "Test");
    expect(Object.keys(doc.tokens.elevation).sort()).toEqual(["level-0", "level-1"]);
  });

  it("keeps unquoted multi-word values whole", () => {
    const doc = parseDesignDocument(MINIMAL, "Test");
    expect(doc.tokens.components["text-input"]?.padding).toBe("12px 14px");
    expect(doc.tokens.components["nav-bar"]?.padding).toBe("0 12px");
  });

  it("preserves token references for the emitter to resolve", () => {
    const doc = parseDesignDocument(MINIMAL, "Test");
    expect(doc.tokens.components["button-primary"]?.background).toBe("{colors.primary}");
  });

  it("names the source and line when frontmatter is absent", () => {
    expect(() => parseDesignDocument("# no frontmatter\n", "Broken")).toThrow(DesignParseError);
    expect(() => parseDesignDocument("# no frontmatter\n", "Broken")).toThrow(/Broken:1/);
  });

  it("throws when the fence is never closed", () => {
    expect(() => parseDesignDocument("---\nversion: a\n", "Broken")).toThrow(/unterminated/);
  });

  it("throws naming the group when a required token group is absent", () => {
    const stripped = MINIMAL.replace(/\ncomponents:[\s\S]*?\n---/, "\n---");
    expect(() => parseDesignDocument(stripped, "Broken")).toThrow(/token group 'components'/);
  });
});

describe("parseFlowMap", () => {
  it("splits on commas outside quotes only", () => {
    // Real value from one document — a naive comma split shreds it into four properties.
    const gradient =
      '{ background: "linear-gradient(78deg, #ff7759 0%, #7670c5 60%, #4c6ee6 90%)", rounded: "{rounded.full}" }';
    const out = parseFlowMap(gradient, "Test", 1, "components.button-gradient");
    expect(Object.keys(out)).toEqual(["background", "rounded"]);
    expect(out["background"]).toBe(
      "linear-gradient(78deg, #ff7759 0%, #7670c5 60%, #4c6ee6 90%)",
    );
  });

  it("does not treat a quoted # as a comment", () => {
    const out = parseFlowMap('{ background: "#ff7759", height: 32px }', "Test", 1, "ctx");
    expect(out["background"]).toBe("#ff7759");
    expect(out["height"]).toBe("32px");
  });

  it("keeps a prose note property intact", () => {
    const out = parseFlowMap(
      '{ background: transparent, note: "coral-red, reserved for brand moments" }',
      "Test",
      1,
      "ctx",
    );
    expect(out["note"]).toBe("coral-red, reserved for brand moments");
  });

  it("throws with context when the value is not a flow map", () => {
    expect(() => parseFlowMap("Inter, 64px", "Test", 7, "typography.display-1")).toThrow(
      /Test:7 — typography.display-1/,
    );
  });
});

describe("parseShowcase", () => {
  const HTML = `<!DOCTYPE html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300..700&display=swap" rel="stylesheet">
<style>:root{ --primary:#5e6ad2; --font:"Inter","SF Pro Display",-apple-system,sans-serif; }</style>
</head><body></body></html>`;

  it("lifts the resolved font stack from the --font custom property", () => {
    expect(parseShowcase(HTML).fontStack).toBe(
      '"Inter","SF Pro Display",-apple-system,sans-serif',
    );
  });

  it("lifts the webfont stylesheet href", () => {
    expect(parseShowcase(HTML).fontImportUrl).toContain("fonts.googleapis.com/css2?family=Inter");
  });

  it("returns null when no webfont link is declared", () => {
    expect(parseShowcase("<html><head></head></html>").fontImportUrl).toBeNull();
  });

  it("promotes a protocol-relative href to https", () => {
    const html = '<link href="//fonts.googleapis.com/css2?family=Inter" rel="stylesheet">';
    expect(parseShowcase(html).fontImportUrl).toBe(
      "https://fonts.googleapis.com/css2?family=Inter",
    );
  });
});

describe("font family resolution", () => {
  it("strips every spelling of the pack's substitution note", () => {
    expect(stripSubstitutionNote("Wise Sans (subst. Inter)")).toBe("Wise Sans");
    expect(stripSubstitutionNote("Graphik Web (→ Inter substitute)")).toBe("Graphik Web");
    expect(stripSubstitutionNote("Söhne (sub: Inter)")).toBe("Söhne");
    expect(stripSubstitutionNote("CoinbaseSans (substitute: Inter)")).toBe("CoinbaseSans");
  });

  it("leaves a plain family untouched", () => {
    expect(stripSubstitutionNote("Inter")).toBe("Inter");
  });

  it("reports the intended family from the body role", () => {
    const doc = parseDesignDocument(MINIMAL, "Test");
    expect(intendedFontFamily(doc.tokens)).toBe("Inter");
  });
});

describe("scalar helpers", () => {
  it("strips a comment outside quotes and keeps one inside", () => {
    expect(stripComment('primary: "#5e6ad2"   # brand indigo').trim()).toBe('primary: "#5e6ad2"');
    expect(stripComment('a: "x # y"')).toBe('a: "x # y"');
  });

  it("removes only one matching pair of quotes", () => {
    expect(unquote('"#08090a"')).toBe("#08090a");
    expect(unquote("'none'")).toBe("none");
    expect(unquote("bare")).toBe("bare");
    expect(unquote('"outer \'inner\'"')).toBe("outer 'inner'");
  });
});
