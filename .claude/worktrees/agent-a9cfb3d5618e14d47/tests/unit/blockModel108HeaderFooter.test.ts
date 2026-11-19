import { describe, it, expect } from "vitest";
import {
  seedChromeTrees,
  renderHeaderComponent,
  renderFooterComponent,
  DEFAULT_BUSINESS_CHROME,
  type BusinessChrome,
} from "~/shared/theme-template";
import { renderRegionComponent, createNode, type BlockNode } from "~/shared/block-model";
import type { ProjectTheme } from "~/shared/theme-tokens";

// [SCOPE 108 / T011] — header/footer trees: seed + emit + parity

const chrome = (patch: Partial<BusinessChrome>): BusinessChrome => ({ ...DEFAULT_BUSINESS_CHROME, ...patch });
// The renderers don't read the theme (shadcn semantic classes carry the look); a stub is fine.
const theme = {} as ProjectTheme;

describe("SCOPE-108 seedChromeTrees", () => {
  it("seeds a header row with the logo and app name from the flat fields", () => {
    const { headerNodes, footerNodes } = seedChromeTrees(chrome({ logoRef: "https://cdn/logo.png", appName: "Acme" }));
    expect(headerNodes).toHaveLength(1);
    expect(headerNodes[0].type).toBe("row");
    const kids = headerNodes[0].children ?? [];
    expect(kids.map((k) => k.type)).toEqual(["image", "subheading"]);
    expect(kids[0].props.src).toBe("https://cdn/logo.png");
    expect(kids[1].props.text).toBe("Acme");
    expect(footerNodes).toEqual([]); // no footerLine → empty footer
  });

  it("seeds a header with only the app name when there's no logo", () => {
    const { headerNodes } = seedChromeTrees(chrome({ appName: "JustName" }));
    const kids = headerNodes[0].children ?? [];
    expect(kids.map((k) => k.type)).toEqual(["subheading"]);
    expect(kids[0].props.text).toBe("JustName");
  });

  it("seeds a centered footer paragraph from the footer line", () => {
    const { footerNodes } = seedChromeTrees(chrome({ footerLine: "© 2026 Acme" }));
    expect(footerNodes).toHaveLength(1);
    expect(footerNodes[0].type).toBe("paragraph");
    expect(footerNodes[0].props.text).toBe("© 2026 Acme");
    expect(footerNodes[0].props.align).toBe("center");
  });

  it("returns empty regions for an empty chrome (zero-migration: nothing to seed)", () => {
    const { headerNodes, footerNodes } = seedChromeTrees(DEFAULT_BUSINESS_CHROME);
    expect(headerNodes).toEqual([]);
    expect(footerNodes).toEqual([]);
  });

  it("returns existing trees unchanged (no clobber)", () => {
    const h = [createNode("heading")];
    const f = [createNode("paragraph")];
    const { headerNodes, footerNodes } = seedChromeTrees(chrome({ headerNodes: h, footerNodes: f, appName: "ignored" }));
    expect(headerNodes).toBe(h);
    expect(footerNodes).toBe(f);
  });
});

describe("SCOPE-108 renderRegionComponent", () => {
  it("emits a no-op component (renders null) for an empty region — never broken code", () => {
    const code = renderRegionComponent("Header", "header", []);
    expect(code).toContain("export function Header()");
    expect(code).toContain("return null;");
    expect(code).not.toContain("<header");
  });

  it("wraps a header tree in a <header> landmark", () => {
    const node: BlockNode = { id: "n1", type: "heading", props: { text: "Hi" } };
    const code = renderRegionComponent("Header", "header", [node]);
    expect(code).toContain("<header className=");
    expect(code).toContain("</header>");
    expect(code).toContain('{"Hi"}');
  });

  it("wraps a footer tree in a <footer> landmark", () => {
    const node: BlockNode = { id: "n1", type: "paragraph", props: { text: "Bye" } };
    const code = renderRegionComponent("Footer", "footer", [node]);
    expect(code).toContain("<footer className=");
    expect(code).toContain("</footer>");
  });
});

describe("SCOPE-108 chrome renderers prefer the designed tree", () => {
  it("renderHeaderComponent emits from headerNodes when present", () => {
    const node: BlockNode = { id: "n1", type: "heading", props: { text: "Tree header" } };
    const code = renderHeaderComponent(chrome({ appName: "flat-name", headerNodes: [node] }), theme);
    expect(code).toContain("Theme Header & Footer Designer"); // tree-emit banner
    expect(code).toContain('{"Tree header"}');
    expect(code).not.toContain("const appName"); // did NOT take the legacy flat path
  });

  it("renderHeaderComponent falls back to the flat fields when there's no tree (back-compat)", () => {
    const code = renderHeaderComponent(chrome({ appName: "Flat Co" }), theme);
    expect(code).toContain("const appName");
    expect(code).toContain('"Flat Co"');
  });

  it("renderFooterComponent emits from footerNodes when present", () => {
    const node: BlockNode = { id: "n1", type: "paragraph", props: { text: "Tree footer" } };
    const code = renderFooterComponent(chrome({ footerLine: "flat", footerNodes: [node] }), theme);
    expect(code).toContain("<footer className=");
    expect(code).not.toContain("const footerLine");
  });
});
