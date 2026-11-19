import { describe, it, expect } from "vitest";
import {
  CONTROL_VARIANT_THRESHOLD,
  CORE_CONTROLS,
  OPTIONAL_COLOR_KEYS,
  REQUIRED_COLOR_KEYS,
  REQUIRED_CONTROLS,
  REQUIRED_TYPE_ROLES,
  isDesignSystemTokens,
  missingRequiredKeys,
  type DesignSystemTokens,
} from "~/shared/design-system";
import { THEME_TOKEN_KEYS, WXKANBAN_DEFAULT_THEME } from "~/shared/theme-tokens";

// SCOPE-115 / T001 — the rich design-system token model. These tests pin the two
// properties the model exists to guarantee: that a curated system's own vocabulary
// survives ingest verbatim (including the per-system tail that a closed interface
// would silently drop), and that gaps are reported as named paths rather than
// surfacing later as an undefined. The fixture mirrors the real shape of a pack
// entry — a dark system with translucent hairlines, interpolated variable-font
// weights, and token references inside its control specs.

// [SCOPE 115 / T001] BEGIN — Rich token model (src/shared/design-system.ts)
function darkSystemFixture(): DesignSystemTokens {
  return {
    colors: {
      canvas: "#08090a",
      "canvas-soft": "#0f1011",
      surface: "#101113",
      "surface-alt": "rgba(255,255,255,0.05)",
      ink: "#f7f8f8",
      "ink-secondary": "#d0d6e0",
      "ink-muted": "#8a8f98",
      "ink-faint": "#62666d",
      hairline: "rgba(255,255,255,0.08)",
      "hairline-soft": "rgba(255,255,255,0.05)",
      primary: "#5e6ad2",
      "primary-active": "#6d78d5",
      "on-primary": "#ffffff",
      error: "#f34f52",
      // per-system decorative tail — the detail a closed interface would drop
      "accent-lavender": "#8fa6ff",
      "accent-peach": "#f7bf8b",
    },
    typography: {
      "display-1": {
        fontFamily: "Inter",
        fontSize: "64px",
        fontWeight: 510,
        lineHeight: "1.0",
        letterSpacing: "-1.41px",
      },
      "body-md": {
        fontFamily: "Inter",
        fontSize: "16px",
        fontWeight: 400,
        lineHeight: "1.5",
        letterSpacing: "normal",
      },
      button: {
        fontFamily: "Inter",
        fontSize: "13px",
        fontWeight: 510,
        lineHeight: "1.0",
        letterSpacing: "normal",
      },
    },
    rounded: { xs: "2px", sm: "6px", md: "8px", lg: "12px", full: "9999px" },
    spacing: { xxs: "4px", xs: "8px", md: "16px", xl: "32px" },
    elevation: { "level-0": "none", "level-1": "0 2px 4px rgba(0,0,0,0.4)" },
    components: {
      "button-primary": { background: "{colors.primary}", rounded: "{rounded.sm}", height: "32px" },
      "button-secondary": { background: "transparent", border: "1px solid {colors.hairline}" },
      card: { backgroundColor: "{colors.surface}", rounded: "{rounded.lg}" },
      "text-input": { backgroundColor: "{colors.surface-alt}", padding: "12px 14px" },
      "badge-pill": { rounded: "{rounded.full}" },
      "nav-bar": { backgroundColor: "{colors.canvas}", padding: "0 12px" },
      // per-system one-off control — below CONTROL_VARIANT_THRESHOLD, must still persist
      "segmented-pill": { background: "{colors.surface-alt}", rounded: "{rounded.full}" },
    },
  };
}
// [SCOPE 115 / T001] END

describe("DesignSystemTokens shape", () => {
  it("carries all six token groups", () => {
    const tokens = darkSystemFixture();
    expect(Object.keys(tokens).sort()).toEqual([
      "colors",
      "components",
      "elevation",
      "rounded",
      "spacing",
      "typography",
    ]);
  });

  it("round-trips an unrecognised colour key intact through JSON", () => {
    const tokens = darkSystemFixture();
    const revived = JSON.parse(JSON.stringify(tokens)) as DesignSystemTokens;
    expect(revived.colors["accent-lavender"]).toBe("#8fa6ff");
    expect(revived.colors["accent-peach"]).toBe("#f7bf8b");
    // and the whole ramp is preserved, not just the keys we happen to name
    expect(Object.keys(revived.colors)).toEqual(Object.keys(tokens.colors));
  });

  it("round-trips an unrecognised control key intact through JSON", () => {
    const revived = JSON.parse(JSON.stringify(darkSystemFixture())) as DesignSystemTokens;
    expect(revived.components["segmented-pill"]).toEqual({
      background: "{colors.surface-alt}",
      rounded: "{rounded.full}",
    });
  });

  it("preserves translucent colour values verbatim rather than pre-flattening them", () => {
    const tokens = darkSystemFixture();
    expect(tokens.colors["hairline"]).toBe("rgba(255,255,255,0.08)");
  });

  it("preserves interpolated variable-font weights as numbers", () => {
    const tokens = darkSystemFixture();
    expect(tokens.typography["display-1"]?.fontWeight).toBe(510);
  });

  it("preserves token references inside control specs for the emitter to resolve", () => {
    const tokens = darkSystemFixture();
    expect(tokens.components["button-primary"]?.background).toBe("{colors.primary}");
  });
});

describe("missingRequiredKeys", () => {
  it("returns an empty array for a complete token set", () => {
    expect(missingRequiredKeys(darkSystemFixture())).toEqual([]);
  });

  it("names a missing colour as a dotted path", () => {
    const tokens = darkSystemFixture();
    delete tokens.colors["canvas"];
    expect(missingRequiredKeys(tokens)).toContain("colors.canvas");
  });

  it("treats an empty-string colour as missing", () => {
    const tokens = darkSystemFixture();
    tokens.colors["primary"] = "   ";
    expect(missingRequiredKeys(tokens)).toContain("colors.primary");
  });

  it("names a missing type role and a missing REQUIRED control", () => {
    const tokens = darkSystemFixture();
    delete tokens.typography["body-md"];
    delete tokens.components["nav-bar"];
    const missing = missingRequiredKeys(tokens);
    expect(missing).toContain("typography.body-md");
    expect(missing).toContain("components.nav-bar");
  });

  it("does NOT require the three non-universal core controls", () => {
    // Measured over the real pack: card and badge-pill appear in 46 of 50 systems,
    // button-secondary in only 42. Requiring all six CORE_CONTROLS rejected 6 valid
    // systems as malformed — caught by the first full run over the pack. An absent
    // non-universal control is a gap the emitter fills, not an ingest error.
    const tokens = darkSystemFixture();
    delete tokens.components["card"];
    delete tokens.components["badge-pill"];
    delete tokens.components["button-secondary"];
    expect(missingRequiredKeys(tokens)).toEqual([]);
  });

  it("does not report an absent optional key", () => {
    const tokens = darkSystemFixture();
    delete tokens.colors["hairline-soft"];
    delete tokens.colors["error"];
    expect(missingRequiredKeys(tokens)).toEqual([]);
  });
});

describe("isDesignSystemTokens", () => {
  it("accepts a well-formed token set", () => {
    expect(isDesignSystemTokens(darkSystemFixture())).toBe(true);
  });

  it("accepts a token set with gaps — completeness is a separate concern", () => {
    const tokens = darkSystemFixture();
    delete tokens.colors["canvas"];
    expect(isDesignSystemTokens(tokens)).toBe(true);
    expect(missingRequiredKeys(tokens)).not.toEqual([]);
  });

  it("rejects non-objects and arrays", () => {
    expect(isDesignSystemTokens(null)).toBe(false);
    expect(isDesignSystemTokens("dark")).toBe(false);
    expect(isDesignSystemTokens([])).toBe(false);
  });

  it("rejects a set missing a whole group", () => {
    const tokens = darkSystemFixture() as unknown as Record<string, unknown>;
    delete tokens["elevation"];
    expect(isDesignSystemTokens(tokens)).toBe(false);
  });

  it("rejects a type role missing its metrics", () => {
    const tokens = darkSystemFixture() as unknown as {
      typography: Record<string, unknown>;
    };
    tokens.typography["body-md"] = { fontFamily: "Inter" };
    expect(isDesignSystemTokens(tokens)).toBe(false);
  });

  it("rejects a colour ramp with a non-string leaf", () => {
    const tokens = darkSystemFixture() as unknown as { colors: Record<string, unknown> };
    tokens.colors["primary"] = 0x5e6ad2;
    expect(isDesignSystemTokens(tokens)).toBe(false);
  });
});

describe("measured constants", () => {
  it("requires only colour keys present in all 50 curated systems", () => {
    expect(REQUIRED_COLOR_KEYS).toEqual([
      "canvas",
      "surface",
      "ink",
      "ink-secondary",
      "ink-faint",
      "hairline",
      "primary",
      "on-primary",
    ]);
  });

  it("keeps required and optional colour keys disjoint", () => {
    const overlap = REQUIRED_COLOR_KEYS.filter((k) => OPTIONAL_COLOR_KEYS.includes(k));
    expect(overlap).toEqual([]);
  });

  it("requires only the three universal type roles", () => {
    expect(REQUIRED_TYPE_ROLES).toEqual(["display-1", "body-md", "button"]);
  });

  it("names the six controls the bundle emits as files", () => {
    expect(CORE_CONTROLS).toHaveLength(6);
    expect(CORE_CONTROLS).toContain("button-primary");
    expect(CORE_CONTROLS).toContain("nav-bar");
  });

  it("requires only the three controls universal across the pack", () => {
    expect(REQUIRED_CONTROLS).toEqual(["button-primary", "text-input", "nav-bar"]);
  });

  it("keeps every required control inside the emitted core set", () => {
    for (const control of REQUIRED_CONTROLS) expect(CORE_CONTROLS).toContain(control);
  });

  it("sets the variant threshold low enough to admit button-outline (6 of 50)", () => {
    expect(CONTROL_VARIANT_THRESHOLD).toBeLessThanOrEqual(6);
    expect(CONTROL_VARIANT_THRESHOLD).toBeGreaterThan(1);
  });
});

describe("ProjectTheme is untouched by this spec", () => {
  it("still exposes exactly 19 semantic colour tokens", () => {
    expect(THEME_TOKEN_KEYS).toHaveLength(19);
  });

  it("still resolves a light and a dark set on the built-in default", () => {
    expect(WXKANBAN_DEFAULT_THEME.light.background).toBeTruthy();
    expect(WXKANBAN_DEFAULT_THEME.dark.background).toBeTruthy();
  });
});
