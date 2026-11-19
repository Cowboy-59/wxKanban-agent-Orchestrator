import { describe, it, expect } from "vitest";
import { NODE_REGISTRY, createNode, stackClasses, selfClasses, renderBlockCode } from "~/shared/block-model";

describe("SCOPE-107 alignment registry", () => {
  it("exposes an align segment field on heading", () => {
    const f = NODE_REGISTRY.heading.fields.find((x) => x.key === "align");
    expect(f?.type).toBe("segment");
    expect(f?.options?.map((o) => o.value)).toEqual(["left", "center", "right"]);
  });

  it("gives row a Spread horizontal option and a vertical field", () => {
    const align = NODE_REGISTRY.row.fields.find((x) => x.key === "align");
    expect(align?.options?.map((o) => o.value)).toEqual(["left", "center", "right", "spread"]);
    const v = NODE_REGISTRY.row.fields.find((x) => x.key === "valign");
    expect(v?.options?.map((o) => o.value)).toEqual(["top", "middle", "bottom"]);
  });

  it("gives panel an align-items field but no valign", () => {
    expect(NODE_REGISTRY.panel.fields.some((x) => x.key === "align")).toBe(true);
    expect(NODE_REGISTRY.panel.fields.some((x) => x.key === "valign")).toBe(false);
  });
});

describe("SCOPE-107 alignment helpers", () => {
  it("panel stack defaults to flex-col with no items class", () => {
    expect(stackClasses(createNode("panel"))).toBe("flex flex-col gap-4");
  });

  it("panel align center adds items-center", () => {
    const n = createNode("panel");
    n.props.align = "center";
    expect(stackClasses(n)).toBe("flex flex-col gap-4 items-center");
  });

  it("row defaults to justify-start items-center (matches today)", () => {
    expect(stackClasses(createNode("row"))).toBe("flex flex-wrap gap-4 justify-start items-center");
  });

  it("row spread + bottom maps to justify-between items-end", () => {
    const n = createNode("row");
    n.props.align = "spread";
    n.props.valign = "bottom";
    expect(stackClasses(n)).toBe("flex flex-wrap gap-4 justify-between items-end");
  });

  it("selfClasses centers a text node with self + text-align", () => {
    const n = createNode("heading");
    n.props.align = "center";
    expect(selfClasses(n)).toBe("self-center text-center");
  });

  it("selfClasses on a button is self-only (no text-align)", () => {
    const n = createNode("button");
    n.props.align = "right";
    expect(selfClasses(n)).toBe("self-end");
  });

  it("selfClasses is empty when align is unset", () => {
    expect(selfClasses(createNode("heading"))).toBe("");
  });
});

describe("SCOPE-107 alignment in generated code", () => {
  it("default heading emission is byte-unchanged", () => {
    const code = renderBlockCode({ id: "b", name: "T", nodes: [createNode("heading")] });
    expect(code).toContain('<h2 className="text-3xl font-bold tracking-tight text-foreground">');
  });

  it("centered heading appends self-center text-center", () => {
    const h = createNode("heading");
    h.props.align = "center";
    const code = renderBlockCode({ id: "b", name: "T", nodes: [h] });
    expect(code).toContain("text-foreground self-center text-center");
  });

  it("panel emits flex-col with items-center when aligned", () => {
    const panel = createNode("panel");
    panel.props.align = "center";
    const code = renderBlockCode({ id: "b", name: "T", nodes: [panel] });
    expect(code).toContain("flex flex-col gap-4 items-center");
  });

  it("root wrapper uses flex-col", () => {
    const code = renderBlockCode({ id: "b", name: "T", nodes: [] });
    expect(code).toContain('<div className="flex flex-col gap-4">');
  });
});

import { styleClasses } from "~/shared/block-model";

describe("SCOPE-107 styleClasses", () => {
  it("is empty when nothing set", () => {
    expect(styleClasses(createNode("heading"))).toBe("");
  });
  it("maps text + background colors to semantic classes", () => {
    const n = createNode("paragraph");
    n.props.textColor = "primary";
    n.props.bgColor = "accent";
    expect(styleClasses(n)).toBe("text-primary bg-accent");
  });
  it("maps muted text color to text-muted-foreground", () => {
    const n = createNode("paragraph");
    n.props.textColor = "muted";
    expect(styleClasses(n)).toBe("text-muted-foreground");
  });
  it("emits font size and bold", () => {
    const n = createNode("heading");
    n.props.fontSize = "xl";
    n.props.bold = true;
    expect(styleClasses(n)).toBe("text-xl font-bold");
  });
});

describe("SCOPE-107 style in generated code", () => {
  it("font size override beats the baked heading size", () => {
    const h = createNode("heading");
    h.props.fontSize = "xl";
    const code = renderBlockCode({ id: "b", name: "T", nodes: [h] });
    expect(code).toContain("text-xl");
    expect(code).not.toContain("text-3xl");
  });
  it("panel background override beats bg-card", () => {
    const panel = createNode("panel");
    panel.props.bgColor = "accent";
    const code = renderBlockCode({ id: "b", name: "T", nodes: [panel] });
    expect(code).toContain("bg-accent");
    expect(code).not.toContain("bg-card");
  });
  it("default heading emission has no style leakage", () => {
    const code = renderBlockCode({ id: "b", name: "T", nodes: [createNode("heading")] });
    expect(code).toContain("text-3xl font-bold tracking-tight text-foreground");
  });
});

import { clampImageWidth } from "~/shared/block-model";

describe("SCOPE-107 clampImageWidth (drag resize)", () => {
  it("adds the drag delta to the starting width", () => {
    expect(clampImageWidth(200, 50)).toBe(250);
  });
  it("rounds fractional deltas", () => {
    expect(clampImageWidth(200, 12.6)).toBe(213);
  });
  it("never goes below the minimum", () => {
    expect(clampImageWidth(200, -400)).toBe(24);
    expect(clampImageWidth(100, -90, 40)).toBe(40);
  });
});

describe("SCOPE-107 resized text emits width", () => {
  it("emits an explicit width for a resized heading", () => {
    const h = createNode("heading");
    h.props.width = 320;
    const code = renderBlockCode({ id: "b", name: "T", nodes: [h] });
    expect(code).toContain("style={{ width: 320 }}");
  });
  it("omits width style when unset", () => {
    const code = renderBlockCode({ id: "b", name: "T", nodes: [createNode("paragraph")] });
    expect(code).not.toContain("style={{ width:");
  });
});
