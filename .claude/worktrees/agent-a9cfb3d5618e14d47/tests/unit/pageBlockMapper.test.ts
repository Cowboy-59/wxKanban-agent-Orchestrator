import { describe, it, expect } from "vitest";
import { outlineToBlocks, outlineHasStructure, type PageOutline, type OutlineSection } from "~/server/services/pageBlockMapper";

// [SCOPE 108 / T012] — deterministic DOM-outline → BlockNode mapper

const sec = (over: Partial<OutlineSection>): OutlineSection => ({
  kind: "section",
  heading: null,
  subheading: null,
  paragraphs: [],
  images: [],
  links: [],
  ...over,
});
const outline = (sections: OutlineSection[]): PageOutline => ({ url: "https://x.test", title: "X", sections });

describe("outlineToBlocks", () => {
  it("maps a section to a panel with heading/subheading/paragraph/image/button children in order", () => {
    const blocks = outlineToBlocks(
      outline([
        sec({
          heading: "Hero",
          subheading: "Sub",
          paragraphs: ["p1"],
          images: [{ src: "https://x.test/a.png", alt: "a" }],
          links: [{ text: "Go", href: "https://x.test/go" }],
        }),
      ]),
    );
    expect(blocks).toHaveLength(1);
    const panel = blocks[0];
    expect(panel.type).toBe("panel");
    expect((panel.children ?? []).map((c) => c.type)).toEqual([
      "heading",
      "subheading",
      "paragraph",
      "image",
      "button",
    ]);
    expect(panel.children?.[0].props.text).toBe("Hero");
    expect(panel.children?.[3].props.src).toBe("https://x.test/a.png");
    expect(panel.children?.[4].props.label).toBe("Go");
    expect(panel.children?.[4].props.href).toBe("https://x.test/go");
  });

  it("centers a hero section but not a header", () => {
    const blocks = outlineToBlocks(outline([sec({ kind: "hero", heading: "H" }), sec({ kind: "header", heading: "top" })]));
    expect(blocks[0].props.align).toBe("center");
    expect(blocks[1].props.align).toBeUndefined();
  });

  it("produces one panel per section with fresh unique ids", () => {
    const blocks = outlineToBlocks(outline([sec({ heading: "a" }), sec({ heading: "b" })]));
    expect(blocks).toHaveLength(2);
    expect(blocks[0].id).not.toBe(blocks[1].id);
  });
});

describe("outlineHasStructure", () => {
  it("true when a section carries content", () => {
    expect(outlineHasStructure(outline([sec({ heading: "H" })]))).toBe(true);
    expect(outlineHasStructure(outline([sec({ paragraphs: ["x"] })]))).toBe(true);
  });
  it("false when there are no sections or they are empty", () => {
    expect(outlineHasStructure(outline([]))).toBe(false);
    expect(outlineHasStructure(outline([sec({})]))).toBe(false);
  });
});
