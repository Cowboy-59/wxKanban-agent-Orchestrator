import { describe, expect, it } from "vitest";
import {
  codeFence,
  longestBacktickRun,
} from "../../_wxAI/skills/wxDBAnalyze/scripts/core/markdown.js";

describe("longestBacktickRun", () => {
  it("returns 0 when there are no backticks", () => {
    expect(longestBacktickRun("select 1")).toBe(0);
  });

  it("finds the longest run among several", () => {
    expect(longestBacktickRun("a `one` b ``two`` c ```three```")).toBe(3);
  });
});

describe("codeFence", () => {
  it("uses the minimum three backticks when content has none", () => {
    expect(codeFence("select 1")).toBe("```");
  });

  it("uses the minimum three backticks when content's longest run is under three", () => {
    expect(codeFence("default '`x`'")).toBe("```");
  });

  it("uses one more than the longest run when the run is three or more", () => {
    expect(codeFence("default '```evil```'")).toBe("````");
  });

  it("scales past four backticks for a longer embedded run", () => {
    expect(codeFence("default '`````deep`````'")).toBe("``````");
  });
});
