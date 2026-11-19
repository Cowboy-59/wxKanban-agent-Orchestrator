// SPEC-128 / T001-T004, T006, T007 — emission.
//
// Every assertion here inspects the GENERATED OUTPUT rather than the renderer. A test that reads
// the renderer's intentions cannot catch the renderer being wrong, and the failures this scope
// exists to prevent — a token leaking to :root, a mode dropped between storage and output — are
// only visible in the artifact.
//
// Written directly: the fencer rejects test files with no top-level declaration.
import { describe, expect, it } from "vitest";

import type { BrandSchema, ModeTokenSet } from "../../src/shared/brand-schema.js";
import {
  MODE_ATTRIBUTE,
  SHELL_CLASS,
  modeSelector,
  modeTokensAtRoot,
  renderExtensionBlock,
  renderModeBlock,
  renderModeBlocks,
  renderRestingBlock,
} from "../../src/shared/brand-css.js";
import {
  facesWithoutFallback,
  renderFontLink,
  renderFontRequest,
  renderFontStack,
  requestableFamilies,
} from "../../src/shared/brand-fonts.js";
import {
  buildBrandStylesheet,
  renderBrandStylesheet,
  renderHumanChecklist,
  renderShellContract,
  renderShellOpenTag,
} from "../../src/shared/brand-stylesheet.js";
import { resolveMode, shouldAnnounce } from "../../src/shared/brand-mode-resolution.js";
import { renderBrandModesModule, renderBrandTailwindConfig, utilityName } from "../../src/shared/brand-tailwind.js";

function mode(name: string, resting: boolean, axis: ModeTokenSet["axis"], paper: string, accent: string): ModeTokenSet {
  return {
    name,
    axis,
    resting,
    tokens: {
      "--m-paper": paper,
      "--m-ink": "#111111",
      "--m-body": "#333333",
      "--m-accent": accent,
      "--m-radius": "8px",
      "--m-hazard": name === "workshop" ? "repeating-linear-gradient(45deg,#F5A524 0 8px,#0E1216 8px 16px)" : "#C2170F",
      "--m-font-body": "'Inter',system-ui,sans-serif",
    },
  };
}

function schema(): BrandSchema {
  return {
    name: "Test Brand",
    version: "1.0",
    source: "authored",
    sourceRef: "docs/test.md",
    base: {} as BrandSchema["base"],
    extensions: { "--brand": "47 100% 50%", "--rail": "213 33% 16%" },
    typefaces: {
      display: { family: "Lexend Deca", fallback: ["Inter", "sans-serif"] },
      body: { family: "Inter", fallback: ["system-ui", "sans-serif"] },
      data: { family: "JetBrains Mono", fallback: ["ui-monospace", "monospace"] },
      figure: { family: "Lexend Deca", fallback: ["Inter", "sans-serif"] },
    },
    contract: [
      { name: "--m-paper", kind: "color" },
      { name: "--m-ink", kind: "color" },
      { name: "--m-body", kind: "color" },
      { name: "--m-accent", kind: "color" },
      { name: "--m-radius", kind: "length" },
      { name: "--m-hazard", kind: "paint" },
      { name: "--m-font-body", kind: "fontstack" },
    ],
    roles: {
      surface: "--m-paper",
      body: "--m-body",
      ink: "--m-ink",
      accent: "--m-accent",
      identity: null,
      identitySurface: null,
      semantic: [],
    },
    modes: {
      standard: mode("standard", true, "light", "#EEF1F4", "#2563EB"),
      workshop: mode("workshop", false, "dark", "#0E1216", "#F5A524"),
      field: mode("field", false, "light", "#FFFFFF", "#D94F04"),
    },
    closed: true,
    rules: [],
    exceptions: [],
  };
}

describe("T001 — mode tokens never reach :root", () => {
  it("scopes every mode to the shell root", () => {
    const css = renderModeBlocks(schema());
    expect(css).toContain(`.${SHELL_CLASS}[${MODE_ATTRIBUTE}="standard"]`);
    expect(css).toContain(modeSelector("workshop"));
  });

  it("puts no contract token inside any :root block — checked on the OUTPUT", () => {
    const s = schema();
    const css = renderBrandStylesheet(s);
    expect(modeTokensAtRoot(css, s)).toEqual([]);
  });

  it("detects a violation when one is introduced, so the check is not vacuous", () => {
    const s = schema();
    const bad = renderBrandStylesheet(s) + "\n:root { --m-paper: #FF0000; }\n";
    expect(modeTokensAtRoot(bad, s)).toEqual(["--m-paper"]);
  });

  it("emits every declared mode — none dropped between storage and output", () => {
    const css = renderModeBlocks(schema());
    for (const name of ["standard", "workshop", "field"]) {
      expect(css, `${name} should appear in the output`).toContain(modeSelector(name));
    }
  });

  it("renders tokens in contract order, so two renders are byte-identical", () => {
    const s = schema();
    expect(renderBrandStylesheet(s)).toBe(renderBrandStylesheet(s));
    const block = renderModeBlock(s, s.modes.standard as ModeTokenSet);
    expect(block.indexOf("--m-paper")).toBeLessThan(block.indexOf("--m-ink"));
    expect(block.indexOf("--m-ink")).toBeLessThan(block.indexOf("--m-accent"));
  });

  it("keeps a gradient intact in a paint token", () => {
    const s = schema();
    const block = renderModeBlock(s, s.modes.workshop as ModeTokenSet);
    expect(block).toContain("repeating-linear-gradient");
  });

  it("puts extension tokens on :root, which is correct — they are base brand, not mode", () => {
    const block = renderExtensionBlock(schema());
    expect(block).toContain(":root");
    expect(block).toContain("--brand");
  });
});

describe("T003 — the resting mode survives a failed mode layer", () => {
  it("writes the resting mode onto the shell with NO mode selector", () => {
    const block = renderRestingBlock(schema());
    expect(block).toContain(`.${SHELL_CLASS} {`);
    expect(block).not.toContain(MODE_ATTRIBUTE);
    expect(block).toContain("#EEF1F4");
  });

  it("places the resting block BEFORE the mode blocks, so a mode can still override it", () => {
    const css = renderBrandStylesheet(schema());
    const restingAt = css.indexOf(`.${SHELL_CLASS} {\n  --m-paper`);
    const firstMode = css.indexOf(modeSelector("standard"));
    expect(restingAt).toBeGreaterThan(-1);
    expect(restingAt).toBeLessThan(firstMode);
  });

  it("emits nothing for a schema with no resting mode rather than guessing one", () => {
    const s = schema();
    for (const m of Object.values(s.modes)) m.resting = false;
    expect(renderRestingBlock(s)).toBe("");
  });
});

describe("T002 — one font request covers every face in every mode", () => {
  it("emits a single request covering every face, not one request per mode", () => {
    const href = renderFontRequest(schema());
    expect(href).toBeTruthy();
    // Three modes, four type roles, three distinct families — and exactly ONE request.
    expect((href?.match(/^https/g) ?? []).length).toBe(1);
    expect((href?.match(/family=/g) ?? []).length).toBe(3);
  });

  it("collapses a face reused across roles", () => {
    // Four roles, but display and figure both use Lexend Deca, so it is asked for once.
    expect(requestableFamilies(schema())).toEqual(["Inter", "JetBrains Mono", "Lexend Deca"]);
  });

  it("never requests a system family from a font host", () => {
    const s = schema();
    s.typefaces.body = { family: "system-ui", fallback: ["sans-serif"] };
    expect(requestableFamilies(s)).not.toContain("system-ui");
  });

  it("returns null rather than an empty request when every face is a system family", () => {
    const s = schema();
    s.typefaces.display = { family: "system-ui", fallback: ["sans-serif"] };
    s.typefaces.body = { family: "system-ui", fallback: ["sans-serif"] };
    s.typefaces.data = { family: "ui-monospace", fallback: ["monospace"] };
    s.typefaces.figure = { family: "system-ui", fallback: ["sans-serif"] };
    expect(renderFontRequest(s)).toBeNull();
    expect(renderFontLink(s)).toBe("");
  });

  it("renders a stack with its fallbacks, quoting families that need it", () => {
    expect(renderFontStack(schema().typefaces.display)).toBe("'Lexend Deca', Inter, sans-serif");
  });

  it("reports a face that would fall back to a browser default", () => {
    const s = schema();
    s.typefaces.data = { family: "JetBrains Mono", fallback: [] };
    expect(facesWithoutFallback(s)).toEqual(["data"]);
  });
});

describe("T004 — the mode is resolved server-side and never fails", () => {
  it("honours a declared mode", () => {
    const r = resolveMode(schema(), "workshop");
    expect(r.mode).toBe("workshop");
    expect(r.reason).toBe("requested");
    expect(shouldAnnounce(r)).toBe(false);
  });

  it("falls back to resting when nothing is requested, quietly", () => {
    const r = resolveMode(schema(), null);
    expect(r.mode).toBe("standard");
    expect(r.reason).toBe("resting");
    // Ordinary behaviour must not be announced, or people learn to ignore announcements.
    expect(shouldAnnounce(r)).toBe(false);
  });

  it("falls back for an unknown mode and SAYS SO", () => {
    const r = resolveMode(schema(), "nocturne");
    expect(r.mode).toBe("standard");
    expect(r.reason).toBe("unknown-mode-requested");
    expect(shouldAnnounce(r)).toBe(true);
    expect(r.message).toContain("nocturne");
    expect(r.message).toContain("standard");
  });

  it("reports a schema with no resting mode rather than picking one", () => {
    const s = schema();
    for (const m of Object.values(s.modes)) m.resting = false;
    const r = resolveMode(s, null);
    expect(r.mode).toBeNull();
    expect(r.reason).toBe("no-resting-mode");
    expect(shouldAnnounce(r)).toBe(true);
  });

  it("puts the resolved mode in the shell's opening tag", () => {
    expect(renderShellOpenTag("workshop")).toBe(`<div class="${SHELL_CLASS}" ${MODE_ATTRIBUTE}="workshop">`);
    expect(renderShellOpenTag(null)).toBe(`<div class="${SHELL_CLASS}">`);
  });

  it("documents the contract, including what happens when nothing sets the attribute", () => {
    const doc = renderShellContract(schema());
    expect(doc).toContain("Shell contract");
    expect(doc).toContain("do not set it from a client after paint");
    expect(doc).toContain("degrade to the brand rather than to unstyled markup");
  });
});

describe("T006 — the config agrees with the stylesheet", () => {
  it("exposes only colour and paint tokens as colour utilities", () => {
    const cfg = renderBrandTailwindConfig(schema());
    expect(cfg).toContain('"paper": "var(--m-paper)"');
    expect(cfg).toContain('"hazard": "var(--m-hazard)"');
    // A font stack or a length must not become a colour utility.
    expect(cfg).not.toContain('colors: {\n      "font-body"');
  });

  it("names every utility after a token the stylesheet actually emits", () => {
    const s = schema();
    const css = renderBrandStylesheet(s);
    for (const c of s.contract) {
      if (c.kind === "color" || c.kind === "paint" || c.kind === "length") {
        expect(css, `${c.name} must be emitted for its utility to resolve`).toContain(c.name);
      }
    }
  });

  it("strips the token prefix predictably", () => {
    expect(utilityName("--m-rail-bar")).toBe("rail-bar");
    expect(utilityName("--c-paper")).toBe("paper");
  });

  it("emits a typed mode list so a product cannot set an undeclared mode", () => {
    const mod = renderBrandModesModule(schema());
    expect(mod).toContain('BRAND_MODES = ["standard", "workshop", "field"]');
    expect(mod).toContain('RESTING_MODE: BrandMode = "standard"');
    expect(mod).toContain("isBrandMode");
  });
});

describe("T008 — checks a machine cannot decide are listed, not claimed", () => {
  it("lists the browser-dependent checks explicitly", () => {
    const list = renderHumanChecklist(schema());
    expect(list.length).toBeGreaterThanOrEqual(4);
    expect(list.join(" ")).toContain("Block the font host");
    expect(list.join(" ")).toContain("scripting disabled");
  });

  it("names the modes a person must switch between", () => {
    expect(renderHumanChecklist(schema()).join(" ")).toContain("standard, workshop, field");
  });

  it("is carried on the built stylesheet object", () => {
    const built = buildBrandStylesheet(schema());
    expect(built.humanChecklist.length).toBeGreaterThan(0);
    expect(built.shellExample).toContain("standard");
    expect(built.fontHref).toBeTruthy();
  });
});
