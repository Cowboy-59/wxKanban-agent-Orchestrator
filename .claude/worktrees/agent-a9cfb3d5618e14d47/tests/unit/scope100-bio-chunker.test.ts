/**
 * Bio markdown chunker — unit tests for SCOPE-100 / T002 (FR-007).
 *
 * Pure functions: no db, no network. These guard the one failure mode that is
 * invisible to review — markdown structure destroyed by a naive paragraph split,
 * in five languages the author may not read.
 */

import { describe, it, expect } from "vitest";
import {
  splitMarkdownBlocks,
  packBlocks,
  chunkMarkdown,
  stitchChunks,
} from "../../src/shared/bio/chunker";

describe("splitMarkdownBlocks", () => {
  it("splits paragraphs on blank lines", () => {
    const md = "First para.\n\nSecond para.\n\nThird para.";
    expect(splitMarkdownBlocks(md)).toEqual([
      "First para.",
      "Second para.",
      "Third para.",
    ]);
  });

  it("treats consecutive blank lines as one boundary", () => {
    const md = "One.\n\n\n\nTwo.";
    expect(splitMarkdownBlocks(md)).toEqual(["One.", "Two."]);
  });

  it("keeps a fenced code block atomic even when it contains blank lines", () => {
    const md = "Intro.\n\n```ts\nconst a = 1;\n\nconst b = 2;\n```\n\nOutro.";
    const blocks = splitMarkdownBlocks(md);
    expect(blocks).toHaveLength(3);
    expect(blocks[1]).toBe("```ts\nconst a = 1;\n\nconst b = 2;\n```");
  });

  it("keeps a tilde-fenced block atomic", () => {
    const md = "A.\n\n~~~\nx\n\ny\n~~~\n\nB.";
    expect(splitMarkdownBlocks(md)[1]).toBe("~~~\nx\n\ny\n~~~");
  });

  it("returns an empty array for whitespace-only input", () => {
    expect(splitMarkdownBlocks("   \n\n  ")).toEqual([]);
  });

  it("preserves multi-line blocks such as lists", () => {
    const md = "- one\n- two\n- three\n\nAfter.";
    expect(splitMarkdownBlocks(md)[0]).toBe("- one\n- two\n- three");
  });

  it("does not let a ~~~ line inside a ```-fenced block close the wrong fence", () => {
    // Regression: FENCE_RE previously toggled inFence on ANY delimiter, so a literal
    // "~~~" line inside a ```-fenced block closed the fence early; the real closing
    // ``` then re-opened it, and everything to EOF (including "Outro.") was absorbed
    // into one block.
    const md = "```bash\necho '~~~ not a real fence'\n~~~\n```\n\nOutro.";
    const blocks = splitMarkdownBlocks(md);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toBe("```bash\necho '~~~ not a real fence'\n~~~\n```");
    expect(blocks[1]).toBe("Outro.");
  });

  it("does not let an unterminated fence swallow the rest of the document", () => {
    // Regression: an unclosed fence left inFence true to EOF, so every later blank
    // line was absorbed instead of acting as a paragraph boundary, collapsing the
    // whole remainder of the document into one oversized block.
    const md = "Para one.\n\n```\ntypo'd fence, never closes\n\nPara three.";
    const blocks = splitMarkdownBlocks(md);
    expect(blocks).toEqual([
      "Para one.",
      "```\ntypo'd fence, never closes",
      "Para three.",
    ]);
  });
});

describe("packBlocks", () => {
  it("packs several small blocks into one chunk under the limit", () => {
    expect(packBlocks(["aaa", "bbb", "ccc"], 100)).toEqual(["aaa\n\nbbb\n\nccc"]);
  });

  it("starts a new chunk when the limit would be exceeded", () => {
    // "aaaa" + "\n\n" + "bbbb" = 10 chars; limit 9 forces a split.
    expect(packBlocks(["aaaa", "bbbb"], 9)).toEqual(["aaaa", "bbbb"]);
  });

  it("gives an oversized single block its own chunk rather than dropping it", () => {
    const huge = "x".repeat(50);
    expect(packBlocks(["ok", huge, "ok2"], 20)).toEqual(["ok", huge, "ok2"]);
  });

  it("returns an empty array for no blocks", () => {
    expect(packBlocks([], 100)).toEqual([]);
  });

  it("does not silently drop a leading empty block", () => {
    // Regression: current === "" was overloaded as both "no chunk started yet" and a
    // possible real block value, so a leading "" block got overwritten by the next
    // block instead of packed — packBlocks(["", "abc", "def"], 100) used to return
    // ["abc\n\ndef"], quietly losing the empty block.
    expect(packBlocks(["", "abc", "def"], 100)).toEqual(["\n\nabc\n\ndef"]);
  });
});

describe("chunkMarkdown + stitchChunks", () => {
  it("returns a single chunk when the content fits", () => {
    const md = "One.\n\nTwo.";
    expect(chunkMarkdown(md, 10_000)).toEqual(["One.\n\nTwo."]);
  });

  it("round-trips normalized markdown through chunk + stitch", () => {
    const md = "Para one.\n\nPara two.\n\nPara three.";
    expect(stitchChunks(chunkMarkdown(md, 12))).toBe(md);
  });

  it("round-trips a fenced block without tearing it", () => {
    const md = "Intro.\n\n```ts\nconst a = 1;\n\nconst b = 2;\n```\n\nOutro.";
    expect(stitchChunks(chunkMarkdown(md, 5))).toBe(md);
  });

  it("normalizes runs of blank lines to a single blank line", () => {
    // Documented, deliberate: markdown treats 1+ blank lines identically, and the
    // chunker cannot preserve a separator it split on.
    expect(stitchChunks(chunkMarkdown("A.\n\n\n\nB.", 10_000))).toBe("A.\n\nB.");
  });
});
