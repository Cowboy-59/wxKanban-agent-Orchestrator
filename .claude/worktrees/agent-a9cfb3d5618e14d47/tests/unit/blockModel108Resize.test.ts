import { describe, it, expect } from "vitest";
import { clampDim, createNode, renderBlockCode, type BlockNode } from "~/shared/block-model";

// [SCOPE 108 / T004] clampDim + [SCOPE 108 / T005] container dimension emit

describe("SCOPE-108 clampDim", () => {
  it("adds the delta to the start", () => {
    expect(clampDim(200, 50)).toBe(250);
  });
  it("floors at the minimum", () => {
    expect(clampDim(200, -300, 24)).toBe(24);
  });
  it("rounds to whole pixels", () => {
    expect(clampDim(100.4, 0)).toBe(100);
  });
});

describe("SCOPE-108 container dimension emit", () => {
  const panelBlock = (props: Record<string, number>) => {
    const n = createNode("panel");
    n.props = { ...n.props, ...props };
    return { id: "b", name: "T", nodes: [n as BlockNode] };
  };

  it("emits no style when width/height are unset (byte-parity with today)", () => {
    const code = renderBlockCode(panelBlock({}));
    expect(code).toContain("<section className=");
    expect(code).not.toContain("style={{");
  });

  it("emits width only when width is set", () => {
    const code = renderBlockCode(panelBlock({ width: 300 }));
    expect(code).toContain("<section style={{ width: 300 }} className=");
  });

  it("emits width and height when both are set", () => {
    const code = renderBlockCode(panelBlock({ width: 300, height: 150 }));
    expect(code).toContain("<section style={{ width: 300, height: 150 }} className=");
  });

  it("applies to a row container too", () => {
    const n = createNode("row");
    n.props = { ...n.props, height: 120 };
    const code = renderBlockCode({ id: "b", name: "T", nodes: [n as BlockNode] });
    expect(code).toContain("style={{ height: 120 }}");
  });
});
