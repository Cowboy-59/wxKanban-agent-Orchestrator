import { describe, it, expect } from "vitest";
import {
  ColorParseError,
  DARK_CANVAS_LUMINANCE_THRESHOLD,
  detectNativeMode,
  flattenAlpha,
  lightnessOf,
  mix,
  parseColor,
  parseHslTriplet,
  relativeLuminance,
  resolveCanvas,
  rgbToHslTriplet,
  toHslTriplet,
  withLightness,
} from "~/ingest/designsystems/color";
import { hslTripletToRgb } from "~/shared/theme-tokens";

// SCOPE-115 / T006 — inbound colour utilities. Two properties carry real risk and are
// pinned hard here: that alpha is COMPOSITED rather than dropped (several systems draw all
// their structure with translucent white over near-black, so dropping alpha would turn
// every hairline pure white and destroy the look), and that the triplet form round-trips
// losslessly through the shipped `hslTripletToRgb`. The mode threshold is also pinned,
// because it was placed wrong on the first attempt.

const WHITE = { r: 255, g: 255, b: 255 };
const NEAR_BLACK = { r: 8, g: 9, b: 10 };

describe("parseColor", () => {
  it("reads 6-digit hex", () => {
    expect(parseColor("#5e6ad2")).toEqual({ r: 94, g: 106, b: 210, a: 1 });
  });

  it("reads 3-digit hex by doubling each digit", () => {
    expect(parseColor("#333")).toEqual({ r: 51, g: 51, b: 51, a: 1 });
  });

  it("reads 8-digit hex as carrying alpha", () => {
    // Real value from one system: a fully transparent brand colour used as a glow start.
    const c = parseColor("#5865f200");
    expect(c?.r).toBe(88);
    expect(c?.a).toBe(0);
  });

  it("reads rgb() and rgba()", () => {
    expect(parseColor("rgb(255, 255, 255)")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor("rgba(255,255,255,0.08)")?.a).toBeCloseTo(0.08, 5);
  });

  it("is case- and whitespace-insensitive", () => {
    expect(parseColor("  #5E6AD2  ")).toEqual({ r: 94, g: 106, b: 210, a: 1 });
  });

  it("returns null for a gradient rather than guessing a colour", () => {
    // One system declares `primary-gradient` as a repeating-conic-gradient. It is not a
    // colour, it is not a required token, and inventing one would be worse than skipping.
    expect(
      parseColor("repeating-conic-gradient(#00B6FF 0deg, #00B6FF 18deg, transparent 30deg)"),
    ).toBeNull();
  });

  it("returns null for named and malformed values", () => {
    expect(parseColor("rebeccapurple")).toBeNull();
    expect(parseColor("#12")).toBeNull();
    expect(parseColor("rgb(1,2)")).toBeNull();
    expect(parseColor("")).toBeNull();
  });
});

describe("flattenAlpha", () => {
  it("returns an opaque colour untouched", () => {
    expect(flattenAlpha({ r: 94, g: 106, b: 210, a: 1 }, WHITE)).toEqual({
      r: 94,
      g: 106,
      b: 210,
    });
  });

  it("composites translucent white over a near-black canvas to a dark grey", () => {
    // The signature hairline of several dark systems. Dropping alpha would give pure
    // white — a visible, look-destroying bug.
    const out = flattenAlpha({ r: 255, g: 255, b: 255, a: 0.08 }, NEAR_BLACK);
    expect(out.r).toBe(28);
    expect(out.r).toBeLessThan(60);
    expect(out.r).toBeGreaterThan(NEAR_BLACK.r);
  });

  it("composites translucent black over white to a light grey", () => {
    const out = flattenAlpha({ r: 0, g: 0, b: 0, a: 0.1 }, WHITE);
    expect(out).toEqual({ r: 230, g: 230, b: 230 });
  });

  it("resolves a fully transparent colour to the backdrop exactly", () => {
    expect(flattenAlpha({ r: 88, g: 101, b: 242, a: 0 }, NEAR_BLACK)).toEqual(NEAR_BLACK);
  });
});

describe("rgbToHslTriplet", () => {
  it("emits the bare 'H S% L%' form the app stores", () => {
    expect(rgbToHslTriplet(WHITE)).toBe("0 0% 100%");
    expect(rgbToHslTriplet({ r: 0, g: 0, b: 0 })).toBe("0 0% 0%");
  });

  it("matches the precision style already in index.css", () => {
    expect(rgbToHslTriplet({ r: 94, g: 106, b: 210 })).toMatch(/^\d+(\.\d)? \d+(\.\d)?% \d+(\.\d)?%$/);
  });

  it("round-trips losslessly through the shipped hslTripletToRgb", () => {
    for (const rgb of [
      { r: 94, g: 106, b: 210 },
      { r: 8, g: 9, b: 10 },
      { r: 246, g: 245, b: 232 },
      { r: 160, g: 165, b: 177 },
      { r: 53, g: 237, b: 126 },
    ]) {
      const back = hslTripletToRgb(rgbToHslTriplet(rgb));
      expect(back).not.toBeNull();
      expect(Math.abs((back?.r ?? 0) - rgb.r)).toBeLessThanOrEqual(1);
      expect(Math.abs((back?.g ?? 0) - rgb.g)).toBeLessThanOrEqual(1);
      expect(Math.abs((back?.b ?? 0) - rgb.b)).toBeLessThanOrEqual(1);
    }
  });
});

describe("toHslTriplet", () => {
  it("parses, composites and converts in one step", () => {
    const out = toHslTriplet("rgba(255,255,255,0.08)", NEAR_BLACK, "test.hairline");
    const parsed = parseHslTriplet(out);
    expect(parsed).not.toBeNull();
    // Composited over near-black this must be dark, not the pure white the raw value names.
    expect(parsed?.l ?? 100).toBeLessThan(20);
  });

  it("never emits an alpha channel", () => {
    expect(toHslTriplet("#5865f280", NEAR_BLACK, "t")).toMatch(/^[\d.]+ [\d.]+% [\d.]+%$/);
  });

  it("throws naming the token path when the value is unparseable", () => {
    expect(() => toHslTriplet("chartreuse", WHITE, "Foo.colors.primary")).toThrow(ColorParseError);
    expect(() => toHslTriplet("chartreuse", WHITE, "Foo.colors.primary")).toThrow(
      /Foo\.colors\.primary/,
    );
  });
});

describe("mode classification", () => {
  it("uses a threshold centred in the pack's measured 8x gap", () => {
    // Measured: every dark canvas <= 0.046, every light canvas >= 0.376.
    expect(DARK_CANVAS_LUMINANCE_THRESHOLD).toBeGreaterThan(0.046);
    expect(DARK_CANVAS_LUMINANCE_THRESHOLD).toBeLessThan(0.376);
  });

  it("classifies the real near-black canvases as dark", () => {
    for (const hex of ["#000000", "#08090a", "#07080a", "#030712", "#121212", "#0a0a0a"]) {
      expect(detectNativeMode(resolveCanvas(hex, "t"))).toBe("dark");
    }
  });

  it("classifies a deep saturated indigo canvas as dark", () => {
    // This one defeats an ink-vs-canvas rule: its `ink` is #000000 because that token
    // means "text on white cards", while the page itself is dark.
    expect(detectNativeMode(resolveCanvas("#161cbb", "t"))).toBe("dark");
  });

  it("classifies a mid-tone grey-blue canvas as light", () => {
    // At luminance 0.376 this is what a 0.5 threshold got wrong.
    expect(detectNativeMode(resolveCanvas("#A0A5B1", "t"))).toBe("light");
  });

  it("classifies whites and warm off-whites as light", () => {
    for (const hex of ["#ffffff", "#faf9f5", "#F6F5E8", "#f4f3f0", "#f9f4f2", "#f6f8f7"]) {
      expect(detectNativeMode(resolveCanvas(hex, "t"))).toBe("light");
    }
  });

  it("agrees with the shipped contrast maths about what lightness means", () => {
    expect(relativeLuminance(WHITE)).toBeCloseTo(1, 3);
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5);
  });
});

describe("resolveCanvas", () => {
  it("flattens a translucent canvas over white, as a browser would", () => {
    expect(resolveCanvas("rgba(0,0,0,0.5)", "t")).toEqual({ r: 128, g: 128, b: 128 });
  });

  it("throws on an unparseable canvas, since everything composites against it", () => {
    expect(() => resolveCanvas("not-a-colour", "Foo.canvas")).toThrow(ColorParseError);
  });
});

describe("triplet helpers", () => {
  it("parses a well-formed triplet and rejects a malformed one", () => {
    expect(parseHslTriplet("222.2 47.4% 11.2%")).toEqual({ h: 222.2, s: 47.4, l: 11.2 });
    expect(parseHslTriplet("222.2 47.4 11.2")).toBeNull();
    expect(parseHslTriplet("nonsense")).toBeNull();
  });

  it("changes lightness while holding hue and saturation", () => {
    expect(withLightness("222.2 47.4% 11.2%", 90)).toBe("222.2 47.4% 90%");
  });

  it("clamps lightness into range", () => {
    expect(lightnessOf(withLightness("10 20% 50%", 140))).toBe(100);
    expect(lightnessOf(withLightness("10 20% 50%", -20))).toBe(0);
  });

  it("returns the input unchanged when the triplet is malformed", () => {
    expect(withLightness("garbage", 50)).toBe("garbage");
  });

  it("mixes two colours by weight", () => {
    expect(mix({ r: 0, g: 0, b: 0 }, WHITE, 0.5)).toEqual({ r: 128, g: 128, b: 128 });
    expect(mix({ r: 0, g: 0, b: 0 }, WHITE, 0)).toEqual({ r: 0, g: 0, b: 0 });
    expect(mix({ r: 0, g: 0, b: 0 }, WHITE, 1)).toEqual(WHITE);
  });
});
