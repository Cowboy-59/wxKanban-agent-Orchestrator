import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  DESIGN_SYSTEM_CATALOG,
  catalogEntryForFolder,
  validateCatalogMap,
} from "~/shared/designsystemcatalog";
import { THEME_TOKEN_KEYS, contrastRatio, themePassesAA } from "~/shared/theme-tokens";
import { isDesignSystemTokens, missingRequiredKeys } from "~/shared/design-system";
import { intendedFontFamily, parseDesignDocument, parseShowcase } from "~/ingest/designsystems/parse";
import { detectNativeMode, parseColor, resolveCanvas } from "~/ingest/designsystems/color";
import { mapToTokenSet, radiusFromTokens, typographyFromTokens } from "~/ingest/designsystems/map";
import { assembleTheme, repairContrast, synthesizeCounterpart } from "~/ingest/designsystems/synthesize";

// SCOPE-115 / T010 — the exit gate for the ingest half of SCOPE-114.
//
// Every assertion here runs against the REAL pack rather than a fixture, because the whole
// value of this suite is catching what fixtures cannot: four separate bugs in the earlier
// tasks surfaced only when all 50 systems were run at once, and none of them were visible
// from reading the code. It is table-driven per folder so a failure names the offending
// system, which is what makes a bad pack addition diagnosable in one read instead of
// appearing as an anonymous `undefined` downstream.
//
// Skips cleanly when the pack is absent — it is a dev-only ingest input and is currently
// untracked, so a checkout legitimately may not have it.

const PACK_ROOT = resolve(__dirname, "../../marketing/AIBM-Design-Systems-Pack");
const packPresent = existsSync(PACK_ROOT);

interface Ingested {
  folder: string;
  slug: string;
  tokensOk: boolean;
  gaps: string[];
  nativeMode: "light" | "dark";
  theme: ReturnType<typeof assembleTheme>;
  fontStack: string;
  fontImportUrl: string | null;
  synthesisFellBack: boolean;
  radius: string;
}

/** Run the pipeline exactly as the seed script does, so the gate tests what actually ships. */
function ingestAll(): Ingested[] {
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
    const fontStack = showcase.fontStack || intendedFontFamily(doc.tokens);
    const radius = radiusFromTokens(doc.tokens);

    return {
      folder: entry.folder,
      slug: entry.slug,
      tokensOk: isDesignSystemTokens(doc.tokens),
      gaps: missingRequiredKeys(doc.tokens),
      nativeMode,
      theme: assembleTheme(
        native.tokens,
        synthesis.tokens,
        nativeMode,
        radius,
        typographyFromTokens(doc.tokens, fontStack),
        entry.slug,
      ),
      fontStack,
      fontImportUrl: showcase.fontImportUrl,
      synthesisFellBack: synthesis.fellBack,
      radius,
    };
  });
}

describe.skipIf(!packPresent)("SCOPE-114 ingest exit gate", () => {
  const all = packPresent ? ingestAll() : [];

  it("the curated map is structurally valid", () => {
    expect(validateCatalogMap()).toEqual([]);
  });

  it("ingests all 50 systems with no failures", () => {
    expect(all).toHaveLength(50);
  });

  it("every system yields a structurally complete rich token set", () => {
    const bad = all.filter((s) => !s.tokensOk).map((s) => s.folder);
    expect(bad).toEqual([]);
  });

  it("no system is missing a required token — failures name the folder", () => {
    const withGaps = all.filter((s) => s.gaps.length > 0).map((s) => `${s.folder}: ${s.gaps.join(",")}`);
    expect(withGaps).toEqual([]);
  });

  it("every assembled theme populates all 19 tokens in BOTH modes", () => {
    const bad: string[] = [];
    for (const s of all) {
      for (const mode of ["light", "dark"] as const) {
        for (const key of THEME_TOKEN_KEYS) {
          const value = s.theme[mode][key];
          if (!value || !/^-?[\d.]+ -?[\d.]+% -?[\d.]+%$/.test(value)) {
            bad.push(`${s.folder}.${mode}.${key}=${String(value)}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("no token retains an alpha channel after compositing", () => {
    const bad: string[] = [];
    for (const s of all) {
      for (const mode of ["light", "dark"] as const) {
        for (const key of THEME_TOKEN_KEYS) {
          if (/rgba|,\s*0?\.\d+\)/.test(s.theme[mode][key])) bad.push(`${s.folder}.${mode}.${key}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("every assembled theme passes AA on the shipped gate", () => {
    const failing = all
      .filter((s) => !themePassesAA(s.theme))
      .map((s) => {
        const fg = contrastRatio(s.theme.light.foreground, s.theme.light.background).toFixed(2);
        return `${s.folder} (light fg/bg=${fg})`;
      });
    expect(failing).toEqual([]);
  });

  it("records ZERO silent synthesis failures", () => {
    // The metric that matters: a fallback is acceptable, an UNRECORDED one is not.
    const fellBack = all.filter((s) => s.synthesisFellBack).map((s) => s.folder);
    const aaFailed = all.filter((s) => !themePassesAA(s.theme)).map((s) => s.folder);
    const unrecorded = aaFailed.filter((f) => !fellBack.includes(f));
    expect(unrecorded).toEqual([]);
  });

  it("splits 10 dark / 40 light, and every computed mode matches its curated tag", () => {
    expect(all.filter((s) => s.nativeMode === "dark")).toHaveLength(10);
    expect(all.filter((s) => s.nativeMode === "light")).toHaveLength(40);
    const disagree = all
      .filter((s) => catalogEntryForFolder(s.folder)?.tags[0] !== s.nativeMode)
      .map((s) => s.folder);
    expect(disagree).toEqual([]);
  });

  it("resolves a loadable font stack and webfont URL for every system", () => {
    const bad = all
      .filter((s) => !s.fontStack || !s.fontImportUrl?.includes("fonts.googleapis.com"))
      .map((s) => s.folder);
    expect(bad).toEqual([]);
  });

  it("resolves every radius to a rem value", () => {
    const bad = all.filter((s) => !/^[\d.]+rem$/.test(s.radius)).map((s) => `${s.folder}=${s.radius}`);
    expect(bad).toEqual([]);
  });

  it("keeps light and dark genuinely distinct in every theme", () => {
    // A synthesized counterpart identical to the native set would mean the customer's
    // dark-mode toggle does nothing — the exact failure this scope exists to avoid.
    const identical = all
      .filter((s) => s.theme.light.background === s.theme.dark.background)
      .map((s) => s.folder);
    expect(identical).toEqual([]);
  });

  it("puts the light mode lighter than the dark mode, in every theme", () => {
    const inverted: string[] = [];
    for (const s of all) {
      const lightL = Number(s.theme.light.background.split(" ")[2]?.replace("%", "") ?? 0);
      const darkL = Number(s.theme.dark.background.split(" ")[2]?.replace("%", "") ?? 0);
      if (lightL <= darkL) inverted.push(`${s.folder} light=${lightL}% dark=${darkL}%`);
    }
    expect(inverted).toEqual([]);
  });

  it("never leaks the originating brand into a slug", () => {
    // Word-boundary, not substring: one folder is the common English word "On", and
    // "swiss-monochrome-with-seafoam" contains "on" inside "monochrome". A substring check
    // reports that as a brand leak, which is a false positive on a real entry.
    const leaked = all
      .filter((s) => {
        const brand = s.folder.toLowerCase().replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
        return new RegExp(`\\b${brand}\\b`).test(s.slug.replace(/-/g, " ").toLowerCase());
      })
      .map((s) => s.folder);
    expect(leaked).toEqual([]);
  });
});

describe("ingest pipeline has no AI dependency", () => {
  // Success metric: 0 LLM calls anywhere in ingest. Asserted structurally rather than trusted,
  // because a provider import added later would be invisible in a passing test suite otherwise.
  const SOURCES = [
    "src/ingest/designsystems/parse.ts",
    "src/ingest/designsystems/color.ts",
    "src/ingest/designsystems/map.ts",
    "src/ingest/designsystems/synthesize.ts",
    "src/shared/design-system.ts",
    "src/shared/designsystemcatalog.ts",
    "scripts/seed-design-systems.ts",
  ];
  const PROVIDER = /\b(openai|anthropic|@google\/gener|generativeai|groq|gemini|llm[-_]?provider|ThemeDeriveService)\b/i;

  it.each(SOURCES)("%s imports no LLM provider", (relative) => {
    const path = resolve(__dirname, "../..", relative);
    const source = readFileSync(path, "utf8");
    const imports = source
      .split(/\r?\n/)
      .filter((l) => /^\s*import\b|require\(/.test(l))
      .join("\n");
    expect(imports).not.toMatch(PROVIDER);
  });

  it("confines all filesystem access to the seed script", () => {
    // The real property is that the src/ modules are PURE — they receive file contents as
    // arguments and never touch the disk, so after seeding the database is the only source of
    // truth and no runtime path can depend on a dev-only folder being present.
    //
    // Asserted as "imports no fs module" rather than "does not mention the pack path", because
    // the curated map legitimately names the pack directory in its documentation. Grepping for
    // the string flags a doc comment and proves nothing about behaviour.
    const seed = readFileSync(resolve(__dirname, "../../scripts/seed-design-systems.ts"), "utf8");
    expect(seed).toContain("node:fs");

    for (const relative of SOURCES.filter((s) => s.startsWith("src/"))) {
      const source = readFileSync(resolve(__dirname, "../..", relative), "utf8");
      const imports = source
        .split(/\r?\n/)
        .filter((l) => /^\s*import\b|require\(/.test(l))
        .join("\n");
      expect(imports, `${relative} must not read the filesystem`).not.toMatch(
        /["']node:fs["']|["']fs["']|["']node:path["']/,
      );
    }
  });
});

describe("colour parsing rejects rather than guesses", () => {
  it("returns null for the one non-colour value in the pack", () => {
    expect(
      parseColor("repeating-conic-gradient(#00B6FF 0deg, #00B6FF 18deg, transparent 30deg)"),
    ).toBeNull();
  });
});
