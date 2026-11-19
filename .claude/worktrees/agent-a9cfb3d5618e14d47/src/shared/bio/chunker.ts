// [SCOPE 100 / T002] BEGIN — Markdown-safe chunking for bio translation (FR-007)
// Translation output runs 15-30% longer than English source, and the model's output
// cap truncates silently with no error. So content above a budget is split on
// paragraph boundaries, translated per chunk, and stitched back.
//
// Blank lines are the split points, EXCEPT inside a fenced code block — a fence torn
// in half translates as two unrelated fragments and the markdown never recovers.

/** Chunk budget in characters. Sits below the token cap to absorb translation expansion. */
export const BIO_CHUNK_MAX_CHARS = 3500;

const FENCE_RE = /^(```|~~~)/;

/**
 * Locate matched fence-delimiter pairs by line index: maps an opening line to its
 * closing line. Two rules keep this honest:
 *
 *  - A closing line must start with the SAME delimiter that opened the fence, so a
 *    literal `~~~` inside a ```-fenced block cannot close it early (and vice versa).
 *  - A delimiter line with no matching close anywhere later in the document is not
 *    treated as a fence at all — it is left as plain text and scanning resumes on the
 *    very next line. Otherwise a single unterminated/typo'd fence would swallow every
 *    blank-line paragraph boundary from that point to EOF.
 *
 * Because a matched pair causes scanning to jump past its interior, delimiter-looking
 * lines *inside* a real fence are never independently evaluated — they can't spuriously
 * open or close anything.
 */
function findFencePairs(lines: readonly string[]): Map<number, number> {
  const pairs = new Map<number, number>();
  let i = 0;
  while (i < lines.length) {
    const match = FENCE_RE.exec(lines[i].trim());
    if (!match) {
      i++;
      continue;
    }
    const delim = match[1];
    let closeIdx = -1;
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim().startsWith(delim)) {
        closeIdx = j;
        break;
      }
    }
    if (closeIdx === -1) {
      // Unterminated: not a real fence. Treat this line as plain text and keep
      // scanning from the next line so paragraph boundaries still work.
      i++;
      continue;
    }
    pairs.set(i, closeIdx);
    i = closeIdx + 1;
  }
  return pairs;
}

/**
 * Split markdown into blocks on blank lines, keeping fenced code blocks atomic.
 * Whitespace-only input yields no blocks.
 */
export function splitMarkdownBlocks(md: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  let fenceCloseAt: number | null = null;

  const flush = (): void => {
    if (current.length === 0) return;
    const text = current.join("\n").trim();
    if (text) blocks.push(text);
    current = [];
  };

  const lines = md.split("\n");
  const fencePairs = findFencePairs(lines);

  lines.forEach((line, index) => {
    if (fenceCloseAt !== null) {
      current.push(line);
      if (index === fenceCloseAt) fenceCloseAt = null;
      return;
    }
    const pairedClose = fencePairs.get(index);
    if (pairedClose !== undefined) {
      fenceCloseAt = pairedClose;
      current.push(line);
      return;
    }
    if (line.trim() === "") {
      flush();
      return;
    }
    current.push(line);
  });
  flush();
  return blocks;
}

/**
 * Greedily pack blocks into chunks no larger than maxChars.
 * A single block larger than maxChars gets its own chunk — there is no paragraph
 * boundary left to cut on, so it is sent whole and its truncation is caught by the caller.
 */
export function packBlocks(blocks: string[], maxChars: number): string[] {
  const chunks: string[] = [];
  // An array (rather than a string) tracks "no chunk started yet" via .length === 0 —
  // an empty-string BLOCK is a legitimate value and must not be confused with that
  // sentinel, or it silently vanishes instead of being packed like any other block.
  let current: string[] = [];
  let currentLength = 0;

  for (const block of blocks) {
    if (current.length === 0) {
      current = [block];
      currentLength = block.length;
      continue;
    }
    const candidateLength = currentLength + 2 + block.length; // + "\n\n"
    if (candidateLength <= maxChars) {
      current.push(block);
      currentLength = candidateLength;
    } else {
      chunks.push(current.join("\n\n"));
      current = [block];
      currentLength = block.length;
    }
  }
  if (current.length > 0) chunks.push(current.join("\n\n"));
  return chunks;
}

/** Split markdown into translation-sized chunks. */
export function chunkMarkdown(md: string, maxChars: number): string[] {
  return packBlocks(splitMarkdownBlocks(md), maxChars);
}

/**
 * Reassemble translated chunks in order.
 * Note: runs of blank lines normalize to one — markdown treats them identically,
 * and the separator we split on is not recoverable.
 */
export function stitchChunks(chunks: string[]): string {
  return chunks.join("\n\n");
}
// [SCOPE 100 / T002] END
