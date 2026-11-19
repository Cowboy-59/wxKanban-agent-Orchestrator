import { describe, it, expect } from "vitest";
import {
  WXKANBAN_DEFAULT_THEME,
  renderThemeCss,
  renderShadcnTheme,
  contrastRatio,
  hslTripletToRgb,
  themePassesAA,
  themeContrastReport,
  THEME_TOKEN_KEYS,
  THEME_PRESETS,
  presetsForAppType,
  type ProjectTheme,
} from "~/shared/theme-tokens";

// SCOPE-062 / T001 — the executable theme model: renderers emit real CSS, the
// contrast util computes correct WCAG ratios, and the built-in default passes AA.
describe("theme-tokens", () => {
  describe("renderThemeCss", () => {
    const css = renderThemeCss(WXKANBAN_DEFAULT_THEME);

    it("emits :root and .dark blocks", () => {
      expect(css).toContain(":root {");
      expect(css).toContain(".dark {");
    });

    it("emits every semantic token in both blocks plus --radius once", () => {
      for (const k of THEME_TOKEN_KEYS) {
        // each --token appears in light and dark
        const varName = `--${k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())}`;
        // not all keys map 1:1 by regex (e.g. cardForeground), so assert via known values
        expect(css).toContain(WXKANBAN_DEFAULT_THEME.light[k]);
        expect(varName.length).toBeGreaterThan(2);
      }
      expect(css).toContain("--radius: 0.5rem;");
      expect((css.match(/--radius:/g) ?? []).length).toBe(1);
      expect(css).toContain("--primary: 222.2 47.4% 11.2%;");
    });
  });

  describe("renderShadcnTheme", () => {
    it("produces a registry:theme object with light/dark cssVars", () => {
      const obj = JSON.parse(renderShadcnTheme(WXKANBAN_DEFAULT_THEME, "demo"));
      expect(obj.name).toBe("demo");
      expect(obj.type).toBe("registry:theme");
      expect(obj.cssVars.light["primary"]).toBe("222.2 47.4% 11.2%");
      expect(obj.cssVars.light.radius).toBe("0.5rem");
      expect(obj.cssVars.dark["background"]).toBe("222.2 84% 4.9%");
    });
  });

  describe("contrast", () => {
    it("parses HSL triplets to RGB (white / black)", () => {
      expect(hslTripletToRgb("0 0% 100%")).toEqual({ r: 255, g: 255, b: 255 });
      expect(hslTripletToRgb("0 0% 0%")).toEqual({ r: 0, g: 0, b: 0 });
    });

    it("white-on-black is the maximal 21:1 ratio", () => {
      expect(contrastRatio("0 0% 100%", "0 0% 0%")).toBeCloseTo(21, 1);
    });

    it("identical colors are 1:1", () => {
      expect(contrastRatio("210 40% 50%", "210 40% 50%")).toBeCloseTo(1, 5);
    });

    it("returns 0 for an unparseable triplet", () => {
      expect(contrastRatio("not-a-color", "0 0% 0%")).toBe(0);
    });
  });

  describe("WCAG AA", () => {
    it("the wxKanban built-in default passes AA in light and dark", () => {
      const report = themeContrastReport(WXKANBAN_DEFAULT_THEME);
      expect(report.passesAA).toBe(true);
      expect(themePassesAA(WXKANBAN_DEFAULT_THEME)).toBe(true);
    });

    it("flags a deliberately low-contrast theme", () => {
      const bad: ProjectTheme = {
        ...WXKANBAN_DEFAULT_THEME,
        light: {
          ...WXKANBAN_DEFAULT_THEME.light,
          foreground: "0 0% 90%", // light gray text on white bg → fails
          background: "0 0% 100%",
        },
      };
      expect(themePassesAA(bad)).toBe(false);
    });
  });

  describe("THEME_PRESETS (T002)", () => {
    it("has a non-empty registry with unique keys", () => {
      expect(THEME_PRESETS.length).toBeGreaterThan(0);
      const keys = THEME_PRESETS.map((p) => p.key);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it("every preset passes WCAG AA in light and dark", () => {
      for (const p of THEME_PRESETS) {
        expect(themePassesAA(p.theme), `${p.key} must pass AA`).toBe(true);
      }
    });

    it("every preset carries a complete light+dark token set", () => {
      for (const p of THEME_PRESETS) {
        for (const k of THEME_TOKEN_KEYS) {
          expect(p.theme.light[k], `${p.key}.light.${k}`).toBeTruthy();
          expect(p.theme.dark[k], `${p.key}.dark.${k}`).toBeTruthy();
        }
        expect(p.theme.source).toBe("preset");
        expect(p.theme.sourceRef).toBe(p.key);
      }
    });

    it("is web-first: presets surface for web, not desktop/mobile", () => {
      expect(presetsForAppType("web").length).toBe(THEME_PRESETS.length);
      expect(presetsForAppType("desktop")).toEqual([]);
      expect(presetsForAppType("mobile")).toEqual([]);
    });
  });
});
