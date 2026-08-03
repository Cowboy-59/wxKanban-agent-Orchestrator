// [SCOPE 121 / T013] BEGIN — Fence-safe code block helper
/**
 * Longest run of consecutive backticks anywhere in `text`, or 0 if none.
 * A fence opened with more backticks than this can never be closed early by
 * content that merely echoes a shorter run — the CommonMark-safe approach to
 * fencing arbitrary, potentially model-authored text.
 */
export function longestBacktickRun(text: string): number {
  const matches = text.match(/`+/g);
  return matches ? Math.max(...matches.map((run) => run.length)) : 0;
}

/**
 * The backtick fence to wrap `text` in so nothing inside it can close the
 * fence early: minimum three backticks (CommonMark's own minimum), or one
 * more than the longest backtick run found in `text` when that run is
 * already three or longer. Shared by every renderer that embeds
 * finding-derived or otherwise untrusted text in a markdown code block —
 * duplicating this logic per call site is how the same defect (an embedded
 * ``` closing a fence early and turning the rest of the document into live
 * markdown) reappears in each new renderer.
 */
export function codeFence(text: string): string {
  return "`".repeat(Math.max(3, longestBacktickRun(text) + 1));
}
// [SCOPE 121 / T013] END
