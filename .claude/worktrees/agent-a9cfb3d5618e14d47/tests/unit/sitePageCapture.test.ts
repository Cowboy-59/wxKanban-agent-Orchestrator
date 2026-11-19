import { describe, it, expect } from "vitest";
import { parseHtmlToOutline } from "~/server/services/SitePageCaptureService";
import { outlineToBlocks } from "~/server/services/pageBlockMapper";

// [SCOPE 108 / T011] — static HTML → structural outline (cheerio), then → blocks

const HTML = `
<html><head><title>Acme</title><style>.x{}</style></head><body>
  <header><h1>Acme Co</h1><a class="btn" href="/signup">Sign up</a></header>
  <section><h2>Fast and simple</h2><h3>Do more</h3><p>Build faster with Acme.</p>
    <img src="/hero.png" alt="hero"><a class="button" href="/start">Get started</a></section>
  <section><h2>Features</h2><p>Feature one.</p><p>Feature two.</p></section>
  <footer><h2>Acme</h2><p>© Acme</p></footer>
</body></html>`;

describe("parseHtmlToOutline", () => {
  const outline = parseHtmlToOutline(HTML, "https://acme.test/");

  it("extracts the page title", () => {
    expect(outline.title).toBe("Acme");
  });

  it("finds semantic sections and marks the first content section as hero", () => {
    const kinds = outline.sections.map((s) => s.kind);
    expect(kinds).toContain("header");
    expect(kinds).toContain("footer");
    expect(kinds).toContain("hero");
  });

  it("resolves relative image and button URLs to absolute", () => {
    const withImg = outline.sections.find((s) => s.images.length > 0);
    expect(withImg?.images[0].src).toBe("https://acme.test/hero.png");
    const withBtn = outline.sections.find((s) => s.links.some((l) => l.href.includes("/start")));
    expect(withBtn?.links.some((l) => l.href === "https://acme.test/start")).toBe(true);
  });

  it("captures headings and paragraphs per section", () => {
    const feat = outline.sections.find((s) => s.heading === "Features");
    expect(feat?.paragraphs).toContain("Feature one.");
    const hero = outline.sections.find((s) => s.kind === "hero");
    expect(hero?.subheading).toBe("Do more");
  });

  it("maps end-to-end to valid panel blocks", () => {
    const blocks = outlineToBlocks(outline);
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.every((b) => b.type === "panel")).toBe(true);
  });

  it("returns no sections for structureless markup (SPA-like) → fail-open upstream", () => {
    const empty = parseHtmlToOutline("<html><body><div id='root'></div></body></html>", "https://spa.test/");
    expect(empty.sections).toHaveLength(0);
  });
});
