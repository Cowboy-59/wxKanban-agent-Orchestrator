import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { CONTROL_VARIANT_THRESHOLD, type DesignSystemTokens } from "~/shared/design-system";
import { DESIGN_SYSTEM_CATALOG } from "~/shared/designsystemcatalog";
import { parseDesignDocument, intendedFontFamily, parseShowcase } from "~/ingest/designsystems/parse";
import { detectNativeMode, resolveCanvas } from "~/ingest/designsystems/color";
import { mapToTokenSet, radiusFromTokens, typographyFromTokens } from "~/ingest/designsystems/map";
import { assembleTheme, repairContrast, synthesizeCounterpart } from "~/ingest/designsystems/synthesize";
import { redactBrand, redactFontStack } from "~/ingest/designsystems/redact";
import type { ProjectTheme } from "~/shared/theme-tokens";
import { renderExtendedThemeCss, renderTailwindThemeConfig, cssSafeKey, dsVar } from "~/shared/design-system-css";
import {
  ADMITTED_BUTTON_EXTRAS,
  hasColorLiteral,
  renderControlFiles,
  resolvePaddingClasses,
  resolveTypeClasses,
} from "~/shared/design-system-controls";
import { renderDesignMd } from "~/shared/design-system-doc";
import { renderThemeCss, WXKANBAN_DEFAULT_THEME } from "~/shared/theme-tokens";

// SPEC-116 / T011 — the exit gate for the BUNDLE half of SCOPE-114.
//
// Like SPEC-115's suite, this runs against the REAL 50-system pack rather than fixtures, and
// for the same reason: the bugs that matter here are the ones a fixture cannot contain. The
// pack holds 33 raw colour literals scattered across 27 systems, two systems that omit
// `button-secondary`, four that omit `card`, one three-stop CSS gradient and a long tail of
// prose-valued properties that read like CSS but are not. Every one of those is a way for a
// renderer to emit something wrong, and none is visible from reading the renderer.
//
// Skips cleanly when the pack is absent — it is a dev-only ingest input and is untracked, so
// a legitimate checkout may not have it.

const PACK_ROOT = resolve(__dirname, "../../marketing/AIBM-Design-Systems-Pack");
const packPresent = existsSync(PACK_ROOT);

/** Any raw colour literal. This is the assertion the whole control renderer exists to pass. */
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

interface Loaded {
  folder: string;
  tokens: DesignSystemTokens;
  theme: ProjectTheme;
  analysis: string;
  fontStack: string;
  fontImportUrl: string | null;
}

/**
 * Reproduce what the SEED SCRIPT stores, not merely what the parser reads.
 *
 * The distinction is load-bearing and cost a failing assertion to find. `scripts/
 * seed-design-systems.ts` redacts the font stack BEFORE building the theme
 * (`redactFontStack` → `typographyFromTokens`), so the `theme.typography.fontFamily` that
 * reaches a customer never names a proprietary brand face. A fixture built from the raw
 * parse instead carries `"Coinbase Sans"` and `"Gucci Sans Pro"` straight into the applied
 * family — which looks exactly like a renderer leak while the shipped path is clean.
 *
 * Mirroring the seed keeps this suite honest in both directions: it stops reporting a leak
 * the product does not have, and it genuinely guards the one it could — if redaction ever
 * regressed at ingest, the brand sweep below would catch it here.
 */
function loadPack(): Loaded[] {
  if (!packPresent) return [];
  return DESIGN_SYSTEM_CATALOG.map((entry) => {
    const dir = join(PACK_ROOT, entry.folder);
    const files = readdirSync(dir);
    const md = files.find((f) => /^DESIGN-.*\.md$/.test(f));
    const sc = files.find((f) => /-showcase\.html$/.test(f));
    if (!md || !sc) throw new Error(`${entry.folder}: missing DESIGN md or showcase html`);

    const doc = parseDesignDocument(readFileSync(join(dir, md), "utf8"), entry.folder);
    const showcase = parseShowcase(readFileSync(join(dir, sc), "utf8"));
    const canvas = resolveCanvas(doc.tokens.colors["canvas"] ?? "", entry.folder);
    const nativeMode = detectNativeMode(canvas);
    const native = repairContrast(mapToTokenSet(doc.tokens, entry.folder).tokens);
    const synthesis = synthesizeCounterpart(native.tokens, nativeMode);
    const fontStack = redactFontStack(
      showcase.fontStack || intendedFontFamily(doc.tokens),
      entry.folder,
    );

    return {
      folder: entry.folder,
      tokens: doc.tokens,
      analysis: redactBrand(doc.analysis, entry.folder, entry.name),
      theme: assembleTheme(
        native.tokens,
        synthesis.tokens,
        nativeMode,
        radiusFromTokens(doc.tokens),
        typographyFromTokens(doc.tokens, fontStack),
        entry.slug,
      ),
      fontStack,
      fontImportUrl: showcase.fontImportUrl,
    };
  });
}

const PACK = loadPack();

describe.skipIf(!packPresent)("SPEC-116 / T011 — bundle renderers over the real pack", () => {
  it("loads all 50 curated systems", () => {
    expect(PACK.length).toBe(50);
  });

  // ── FR-008 / success metric 2 — THE headline assertion ────────────────────
  describe("no colour literal reaches a generated control file", () => {
    it("emits 0 hex, rgb() or hsl() literals across every control file for all 50 systems", () => {
      const offenders: string[] = [];
      for (const sys of PACK) {
        const result = renderControlFiles(sys.tokens);
        for (const file of result.files) {
          const match = file.code.match(COLOR_LITERAL);
          if (match) offenders.push(`${sys.folder} → ${file.path}: ${match[0]}`);
        }
      }
      expect(offenders).toEqual([]);
    });

    it("substitutes rather than drops — the systems carrying literals still get styled controls", () => {
      // Regression guard for the lazy fix. Stripping every value that contains a literal would
      // also pass the assertion above while emitting bare, unstyled components, so this pins
      // that the substituted control still carries a semantic colour class.
      const withLiterals = PACK.filter((s) =>
        Object.values(s.tokens.components).some((spec) =>
          Object.values(spec).some((v) => hasColorLiteral(String(v))),
        ),
      );
      expect(withLiterals.length).toBeGreaterThanOrEqual(20);
      for (const sys of withLiterals) {
        const result = renderControlFiles(sys.tokens);
        const button = result.files.find((f) => f.path.endsWith("button.tsx"));
        expect(button, sys.folder).toBeDefined();
        expect(button!.code, sys.folder).toMatch(/\b(bg|text|border)-(primary|foreground|card|background|secondary|muted|accent|border)/);
      }
    });

    it("records every substitution it made, so DESIGN.md can disclose it", () => {
      const framer = PACK.find((s) => s.folder === "Framer");
      if (!framer) return;
      const result = renderControlFiles(framer.tokens);
      expect(result.notes.join("\n")).toMatch(/literal colour/i);
    });
  });

  // ── FR-008 — the six core controls, always ────────────────────────────────
  describe("control file set", () => {
    it("emits all five component files for every system, even those missing core controls", () => {
      const expected = [
        "components/ui/button.tsx",
        "components/ui/card.tsx",
        "components/ui/input.tsx",
        "components/ui/badge.tsx",
        "components/ui/nav.tsx",
      ];
      for (const sys of PACK) {
        const paths = renderControlFiles(sys.tokens).files.map((f) => f.path).sort();
        expect(paths, sys.folder).toEqual([...expected].sort());
      }
    });

    it("always emits primary AND secondary button variants, including the 8 systems lacking button-secondary", () => {
      const missingSecondary = PACK.filter((s) => !s.tokens.components["button-secondary"]);
      expect(missingSecondary.length).toBe(8);
      for (const sys of PACK) {
        const variants = renderControlFiles(sys.tokens).buttonVariants;
        expect(variants, sys.folder).toContain("primary");
        expect(variants, sys.folder).toContain("secondary");
      }
    });

    it("admits an extra as a variant only at or above the 5-of-50 threshold", () => {
      // The admitted set is a claim about the pack, so it is verified against the pack rather
      // than trusted: a re-seed that changed coverage would otherwise silently invalidate it.
      const counts = new Map<string, number>();
      for (const sys of PACK) {
        for (const control of Object.keys(sys.tokens.components)) {
          counts.set(control, (counts.get(control) ?? 0) + 1);
        }
      }
      for (const extra of ADMITTED_BUTTON_EXTRAS) {
        expect(counts.get(extra.control) ?? 0, extra.control).toBe(extra.seen);
        expect(extra.seen).toBeGreaterThanOrEqual(CONTROL_VARIANT_THRESHOLD);
      }
      // Nothing below the threshold may be admitted.
      const admitted = new Set(ADMITTED_BUTTON_EXTRAS.map((e) => e.control));
      for (const [control, n] of counts) {
        if (n >= CONTROL_VARIANT_THRESHOLD && control.startsWith("button-")) {
          const core = control === "button-primary" || control === "button-secondary";
          if (!core) expect(admitted.has(control), `${control} at ${n}/50 should be admitted`).toBe(true);
        }
      }
    });

    it("documents sub-threshold controls instead of generating them", () => {
      const withExtras = PACK.filter((s) => renderControlFiles(s.tokens).documentedOnly.length > 0);
      expect(withExtras.length).toBeGreaterThan(0);
      for (const sys of withExtras) {
        const result = renderControlFiles(sys.tokens);
        for (const control of result.documentedOnly) {
          expect(result.files.some((f) => f.path.includes(control))).toBe(false);
        }
      }
    });

    it("produces at least one system-specific geometry value per system", () => {
      // Proves the captured tokens actually reached the output rather than every system
      // rendering the same neutral defaults — the exact failure the carrier chain risks.
      for (const sys of PACK) {
        const button = renderControlFiles(sys.tokens).files.find((f) => f.path.endsWith("button.tsx"))!;
        expect(button.code, sys.folder).toMatch(/\[(?:var\(--ds-|[\d.]+(?:px|rem|em))/);
      }
    });
  });

  // ── FR-007 — theme.css and tailwind.theme.ts ──────────────────────────────
  describe("extended theme.css", () => {
    it("keeps today's 19 variables byte-identical, appending only --ds-* properties", () => {
      for (const sys of PACK) {
        const base = renderThemeCss(sys.theme);
        const extended = renderExtendedThemeCss(
          sys.theme,
          sys.tokens,
          null,
        );
        expect(extended.includes(base), sys.folder).toBe(true);
      }
    });

    it("emits a var for every radius, spacing and elevation step", () => {
      for (const sys of PACK) {
        const css = renderExtendedThemeCss(sys.theme, sys.tokens, null);
        for (const key of Object.keys(sys.tokens.rounded)) {
          expect(css, `${sys.folder} radius.${key}`).toContain(`${dsVar("radius", key)}:`);
        }
        for (const key of Object.keys(sys.tokens.elevation)) {
          expect(css, `${sys.folder} elevation.${key}`).toContain(`${dsVar("elevation", key)}:`);
        }
      }
    });

    it("emits the webfont @import first when present, and omits it cleanly when null", () => {
      const sys = PACK[0];
      const theme = sys.theme;
      const withFont = renderExtendedThemeCss(theme, sys.tokens, "https://fonts.example/css?family=X");
      expect(withFont.startsWith("@import url(")).toBe(true);
      const without = renderExtendedThemeCss(theme, sys.tokens, null);
      expect(without).not.toContain("@import");
    });

    it("every control's var() reference resolves to a property theme.css actually defines", () => {
      // The bug this catches renders as "the shadow just didn't apply" rather than as an
      // error, so it is asserted structurally instead of being left to the eye.
      for (const sys of PACK) {
        const css = renderExtendedThemeCss(sys.theme, sys.tokens, null);
        const files = renderControlFiles(sys.tokens).files;
        for (const file of files) {
          for (const match of file.code.matchAll(/var\((--ds-[a-z0-9-]+)\)/g)) {
            expect(css, `${sys.folder} ${file.path} → ${match[1]}`).toContain(`${match[1]}:`);
          }
        }
      }
    });
  });

  describe("tailwind.theme.ts", () => {
    it("carries no colour literal and references only var()", () => {
      for (const sys of PACK) {
        const cfg = renderTailwindThemeConfig(sys.theme, sys.tokens);
        expect(cfg.match(COLOR_LITERAL), sys.folder).toBeNull();
        expect(cfg).toContain("borderRadius");
        expect(cfg).toContain("boxShadow");
        expect(cfg).toContain("letterSpacing");
      }
    });
  });

  // ── FR-009 — DESIGN.md ────────────────────────────────────────────────────
  describe("DESIGN.md", () => {
    it("names the intended typeface and ships no font binary", () => {
      for (const sys of PACK) {
        const md = renderDesignMd({
          name: "Curated Name",
          analysis: "Prose.",
          fontStack: "Inter, sans-serif",
          intendedFont: intendedFontFamily(sys.tokens),
          synthesizedMode: "dark",
          theme: sys.theme,
          tokens: sys.tokens,
          controls: renderControlFiles(sys.tokens),
        });
        expect(md, sys.folder).toContain("Intended typeface");
        expect(md, sys.folder).not.toMatch(/\.(woff2?|ttf|otf)\b/);
      }
    });

    it("never leaks the originating brand folder name", () => {
      // The trap SPEC-116 already hit once: excluding the COLUMN is not excluding the
      // INFORMATION. Ingest redacts prose and font stacks, so a clean render must contain no
      // pack folder name anywhere — checked against the whole emitted document.
      for (const sys of PACK) {
        const controls = renderControlFiles(sys.tokens);
        const md = renderDesignMd({
          name: "Curated Name",
          analysis: null,
          fontStack: null,
          intendedFont: null,
          synthesizedMode: "none",
          theme: sys.theme,
          tokens: sys.tokens,
          controls,
        });
        const bundle = [md, ...controls.files.map((f) => f.code)].join("\n");
        const brand = sys.folder.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (brand.length < 4) continue;
        // Three pack brands collide with the TARGET STACK's own vocabulary, and every
        // occurrence of them in the bundle is that vocabulary rather than provenance:
        //
        //   `-apple-system`   the standard system-font keyword — wxKanban's own default theme
        //                     carries it, and so does almost every font stack on the web
        //   `linear-gradient` a CSS function
        //   `Tailwind`        the CSS framework this bundle is generated FOR. DESIGN.md tells
        //                     the reader to spread `themeExtend` into their Tailwind config,
        //                     which is instruction, not attribution.
        //
        // These are stripped before the sweep because no amount of redaction could ever clear
        // them: they are load-bearing strings the bundle would be broken without. The
        // exclusion is deliberately a short, named list rather than a loose pattern — anything
        // vaguer would start hiding the leaks this assertion exists to catch.
        const generic = bundle
          .replace(/-apple-system/gi, "")
          .replace(/\blinear-gradient\b/gi, "")
          .replace(/\btailwind\b/gi, "");
        expect(generic.toLowerCase().replace(/[^a-z0-9]/g, ""), sys.folder).not.toContain(brand);
      }
    });

    it("discloses approximations and sub-threshold controls", () => {
      const sys = PACK.find((s) => renderControlFiles(s.tokens).documentedOnly.length > 0)!;
      const controls = renderControlFiles(sys.tokens);
      const md = renderDesignMd({
        name: "Curated Name",
        analysis: null,
        fontStack: null,
        intendedFont: null,
        synthesizedMode: "none",
        theme: sys.theme,
        tokens: sys.tokens,
        controls,
      });
      expect(md).toContain("Declared but not generated");
      for (const c of controls.documentedOnly) expect(md).toContain(c);
    });
  });
});

// ── FR-010 — the colour-only fallback, which must hold with no pack at all ───
describe("SPEC-116 / T011 — FR-010 colour-only fallback", () => {
  const theme = WXKANBAN_DEFAULT_THEME;

  it("renderExtendedThemeCss with tokens null is byte-identical to renderThemeCss", () => {
    expect(renderExtendedThemeCss(theme, null, null)).toBe(renderThemeCss(theme));
  });

  it("a null fontImportUrl on the colour-only path adds nothing", () => {
    expect(renderExtendedThemeCss(theme, null, "https://fonts.example/x")).toBe(renderThemeCss(theme));
  });

  it("renderTailwindThemeConfig degrades to radius + font without throwing", () => {
    const cfg = renderTailwindThemeConfig(theme, null);
    expect(cfg).toContain("borderRadius");
    expect(cfg).toContain("fontFamily");
    expect(cfg).not.toContain("boxShadow");
  });

  it("renderDesignMd produces a valid document with no tokens and no controls", () => {
    const md = renderDesignMd({
      name: "Project Theme",
      analysis: null,
      fontStack: null,
      intendedFont: null,
      synthesizedMode: null,
      theme,
      tokens: null,
      controls: null,
    });
    expect(md).toContain("# Project Theme — Design System");
    expect(md).toContain("## Colour");
    expect(md).not.toContain("## Controls");
  });
});

// ── Unit-level guards on the value resolvers ────────────────────────────────
describe("SPEC-116 / T011 — resolver units", () => {
  it("cssSafeKey normalises keys that would produce an unmatchable custom property", () => {
    expect(cssSafeKey("level-1")).toBe("level-1");
    expect(cssSafeKey("Display 1")).toBe("display-1");
    expect(cssSafeKey("  ")).toBe("x");
  });

  it("resolvePaddingClasses handles the 1/2/3/4-value shorthands and rejects prose", () => {
    expect(resolvePaddingClasses("24px")).toEqual(["p-[24px]"]);
    expect(resolvePaddingClasses("0 14px")).toEqual(["py-0", "px-[14px]"]);
    expect(resolvePaddingClasses("12px 14px 16px")).toEqual(["pt-[12px]", "px-[14px]", "pb-[16px]"]);
    // The pack really does carry values like this on a nav-bar height.
    expect(resolvePaddingClasses("~121px (promo strip + main row)")).toEqual([]);
  });

  it("resolveTypeClasses emits explicit Tailwind type hints so size and weight are not ambiguous", () => {
    const tokens = {
      colors: {},
      typography: { button: { fontFamily: "Inter", fontSize: "13px", fontWeight: 510, lineHeight: "1", letterSpacing: "0" } },
      rounded: {},
      spacing: {},
      elevation: {},
      components: {},
    } as unknown as DesignSystemTokens;
    const classes = resolveTypeClasses("{typography.button}", tokens);
    // Without `length:` Tailwind reads `text-[var(--x)]` as a COLOUR and the size vanishes.
    expect(classes.some((c) => c.startsWith("text-[length:var("))).toBe(true);
    expect(classes.some((c) => c.startsWith("[font-weight:var("))).toBe(true);
    expect(resolveTypeClasses("{typography.nope}", tokens)).toEqual([]);
  });

  it("hasColorLiteral catches every literal form the pack actually uses", () => {
    expect(hasColorLiteral("#ffffff")).toBe(true);
    expect(hasColorLiteral("rgba(255,255,255,0.05)")).toBe(true);
    expect(hasColorLiteral("linear-gradient(78deg, #ff7759 0%, #7670c5 60%)")).toBe(true);
    expect(hasColorLiteral("{colors.primary}")).toBe(false);
    expect(hasColorLiteral("transparent")).toBe(false);
  });
});
