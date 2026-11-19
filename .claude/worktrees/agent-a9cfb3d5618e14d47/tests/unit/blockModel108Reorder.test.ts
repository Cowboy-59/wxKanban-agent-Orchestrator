import { describe, it, expect } from "vitest";
import {
  moveNodeTo,
  findNodeById,
  findParentAndIndex,
  ROOT_ID,
  type BlockNode,
} from "~/shared/block-model";

// [SCOPE 108 / T006] — precise reorder tree ops

const leaf = (id: string): BlockNode => ({ id, type: "paragraph", props: {} });
const panel = (id: string, children: BlockNode[]): BlockNode => ({ id, type: "panel", props: {}, children });

function tree(): BlockNode[] {
  return [leaf("a"), leaf("b"), panel("p", [leaf("c"), leaf("d")])];
}

describe("SCOPE-108 findNodeById / findParentAndIndex", () => {
  it("finds a top-level node and a nested node", () => {
    expect(findNodeById(tree(), "a")?.id).toBe("a");
    expect(findNodeById(tree(), "c")?.id).toBe("c");
    expect(findNodeById(tree(), "zzz")).toBeNull();
  });

  it("locates parent + index", () => {
    expect(findParentAndIndex(tree(), "b")).toEqual({ parentId: ROOT_ID, index: 1 });
    expect(findParentAndIndex(tree(), "d")).toEqual({ parentId: "p", index: 1 });
  });
});

describe("SCOPE-108 moveNodeTo", () => {
  const ids = (nodes: BlockNode[]): string[] => nodes.map((n) => n.id);

  it("reorders within the top level", () => {
    // move "a" to index 1 (after removal, "b" is at 0) → [b, a, p]
    const out = moveNodeTo(tree(), "a", ROOT_ID, 1);
    expect(ids(out)).toEqual(["b", "a", "p"]);
  });

  it("moves a top-level node into a container at an index", () => {
    const out = moveNodeTo(tree(), "a", "p", 1);
    const p = findNodeById(out, "p");
    expect(ids(out)).toEqual(["b", "p"]);
    expect(p?.children?.map((c) => c.id)).toEqual(["c", "a", "d"]);
  });

  it("moves a nested node out to the top level", () => {
    const out = moveNodeTo(tree(), "c", ROOT_ID, 0);
    expect(ids(out)).toEqual(["c", "a", "b", "p"]);
    expect(findNodeById(out, "p")?.children?.map((x) => x.id)).toEqual(["d"]);
  });

  it("rejects moving a container into its own descendant (no cycle)", () => {
    const out = moveNodeTo(tree(), "p", "p", 0); // into itself
    expect(out).toEqual(tree());
    const nested = [panel("outer", [panel("inner", [])])];
    expect(moveNodeTo(nested, "outer", "inner", 0)).toEqual(nested);
  });

  it("rejects moving a node into a non-container (leaf) target", () => {
    const out = moveNodeTo(tree(), "a", "b", 0); // "b" is a leaf paragraph
    expect(out).toEqual(tree());
  });

  it("returns the tree unchanged for an unknown node", () => {
    expect(moveNodeTo(tree(), "nope", ROOT_ID, 0)).toEqual(tree());
  });
});
