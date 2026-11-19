// [SCOPE 135 / T020] BEGIN — every confirmed edit is logged in the scope's Amendment Log (FR-022)
/**
 * SCOPE-135 / FR-022 — a scope edit leaves a record inside the scope itself: when, which amendment,
 * why, which items, and the text it replaced, verbatim. Before this, an amendment's only trace was
 * whatever the author remembered to hand-write, and a replaced paragraph was simply gone.
 *
 * The replaced text comes from the same line diff the byte-identical check (T017) and the edit diff
 * (T018) use, so the log records exactly the lines that were verified and shown — not a second
 * account of the edit that could disagree with them.
 *
 * Entries are only ever appended. The byte-identical check is given the end of the log as the one
 * place this edit may insert, so an earlier entry that changed would refuse the edit.
 */

import { diffLines } from './scope-verify.js';

export interface AmendmentLogInput {
  /** ISO date. */
  date: string;
  /** Amendment letter, when supplied. */
  amendment?: string;
  /** Optional (Andy, 2026-10-28): absent or blank is logged as "No reason given", never refused. */
  reason?: string;
  /** What the edit touched, as the merge reports it (`business_problem`, `FR-003/AC2`, …). */
  items: string[];
  /** The kit wrote without asking (`--yes`). */
  unattended?: boolean;
}

const LOG_HEADING = /^##\s+Amendment\s+Log\b/i;

/** A fence longer than any backtick run in `text`, so verbatim text can never close it early. */
function fenceFor(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  return '`'.repeat(Math.max(3, longest + 1));
}

/** The entry's lines. `base` and `draft` are the document before and after the edit, log excluded. */
export function buildAmendmentLogEntry(input: AmendmentLogInput, base: string[], draft: string[]): string[] {
  const lines = [
    `### ${input.date}${input.amendment ? ` — Amendment ${input.amendment}` : ''}`,
    '',
    `- Reason: ${input.reason?.trim() ? input.reason.trim().replace(/\s*\r?\n\s*/g, ' ') : 'No reason given'}`,
    `- Items: ${input.items.join(', ')}`,
  ];
  if (input.unattended) {
    lines.push('- Written unattended (--yes), without an interactive confirm');
  }
  const replaced = diffLines(base, draft).filter((hunk) => hunk.aEnd > hunk.aStart);
  if (replaced.length === 0) {
    lines.push('- Replaced text: none (additions only)');
    return lines;
  }
  lines.push('- Replaced text, verbatim:');
  for (const hunk of replaced) {
    const text = base.slice(hunk.aStart, hunk.aEnd).join('\n');
    const fence = fenceFor(text);
    lines.push('', `Line ${hunk.aStart + 1}:`, '', `${fence}text`, ...base.slice(hunk.aStart, hunk.aEnd), fence);
  }
  return lines;
}

/**
 * Append `entry` at the end of `## Amendment Log`, creating the section at the end of the document
 * when it is absent. Returns where `base` may change: an insertion point (log exists) or the
 * document's tail (log created).
 */
export function appendAmendmentLog(
  lines: string[],
  entry: string[],
): { lines: string[]; insertAt: [number, number] | null } {
  let inFence = false;
  let logIndex = -1;
  let logEnd = lines.length;
  for (let idx = 0; idx < lines.length; idx += 1) {
    if (/^\s*(```|~~~)/.test(lines[idx])) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (logIndex === -1 && LOG_HEADING.test(lines[idx].trim())) {
      logIndex = idx;
      continue;
    }
    // Headings inside the log's verbatim fences are skipped above; a real `#`/`##` ends the log.
    if (logIndex !== -1 && /^#{1,2}\s+/.test(lines[idx].trim())) {
      logEnd = idx;
      break;
    }
  }

  if (logIndex === -1) {
    const tail = [...lines];
    while (tail.length > 0 && tail[tail.length - 1].trim() === '') tail.pop();
    return { lines: [...tail, '', '## Amendment Log', '', ...entry, ''], insertAt: null };
  }

  let at = logEnd;
  while (at > logIndex + 1 && lines[at - 1].trim() === '') at -= 1;
  return {
    lines: [...lines.slice(0, at), '', ...entry, ...lines.slice(at)],
    insertAt: [at, logEnd],
  };
}
// [SCOPE 135 / T020] END
