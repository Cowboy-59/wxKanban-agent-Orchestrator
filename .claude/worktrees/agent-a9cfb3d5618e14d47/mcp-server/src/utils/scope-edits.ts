// [SCOPE 135 / T016] BEGIN — edits by named item: add / replace / remove one FR, one US, or one AC line
/**
 * SCOPE-135 / FR-018 — a scope edit that names ONE item.
 *
 * Whole-section replacement (functionalRequirements as an array) is the right tool for a rewrite
 * and the wrong one for "change acceptance line 2 of FR-003". These operations touch exactly the
 * lines they name and nothing else:
 *
 *   - `replace FR-003`      swaps the item (body only, or heading and body when `content` opens
 *                           with the same heading)
 *   - `replace FR-003/AC2`  swaps exactly one acceptance line, keeping its bullet and checkbox
 *   - `add FR`              appends FR-<next free number> after the last FR
 *   - `add FR-003/AC`       appends an acceptance line to FR-003
 *   - `remove FR-004`       keeps the heading and number, body becomes a "Removed" stub, so every
 *                           reference from specs, tasks and code fences stays valid
 *
 * Items are located with the FR / US heading rules of `@wxkanban/preflight` (completeness.ts), the
 * same rules the gate counts with. A second parser would eventually disagree with it about what an
 * FR is.
 */

import { FR_HEADING, SCENARIO_HEADING, HEADING } from '@wxkanban/preflight';

export type ScopeItemOp = 'add' | 'replace' | 'remove';

export interface ScopeItemEdit {
  op: ScopeItemOp;
  /** `FR-003`, `US2`, `FR-003/AC2`; `add` also takes a bare kind (`FR`, `US`) or `FR-003/AC`. */
  target: string;
  /** New text for add / replace; the reason for remove. */
  content?: string;
}

export interface ScopeItemEditContext {
  /** ISO date stamped into "Removed" stubs. */
  date: string;
  /** Amendment letter, when the caller supplied one. */
  amendment?: string;
}

export interface ScopeItemChange {
  /** The target as it now reads, e.g. `FR-003/AC2`, or `FR-009` for an add. */
  target: string;
  action: 'replaced' | 'created';
  /** The displaced text, verbatim. Empty for an add. */
  previous: string;
}

/** A refused edit. Carries a message the caller can act on; no draft is produced. */
export class ScopeEditRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScopeEditRefusal';
  }
}

type Kind = 'FR' | 'US';

export interface Item {
  kind: Kind;
  number: number;
  start: number;
  /** Exclusive. */
  end: number;
  level: number;
}

const LIST_LINE = /^(\s*[-*]\s+(?:\[[ xX]\]\s*)?)(.*)$/;

function label(kind: Kind, number: number): string {
  return kind === 'FR' ? `FR-${String(number).padStart(3, '0')}` : `US${number}`;
}

/** Heading lines inside code fences are not items — the gate blanks them the same way. */
function fencedMask(lines: string[]): boolean[] {
  let inFence = false;
  return lines.map((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return true;
    }
    return inFence;
  });
}

export function parseScopeItems(lines: string[]): Item[] {
  const fenced = fencedMask(lines);
  const items: Item[] = [];
  for (let idx = 0; idx < lines.length; idx += 1) {
    if (fenced[idx]) continue;
    const line = lines[idx];
    const kind: Kind | null = FR_HEADING.test(line) ? 'FR' : SCENARIO_HEADING.test(line) ? 'US' : null;
    if (!kind) continue;
    const number = Number((kind === 'FR' ? line.match(/FR-(\d+)/i) : line.match(/(\d+)/))?.[1]);
    if (!Number.isFinite(number)) continue;
    const level = (line.match(HEADING) as RegExpMatchArray)[1].length;
    let end = lines.length;
    for (let next = idx + 1; next < lines.length; next += 1) {
      const heading = !fenced[next] ? lines[next].match(HEADING) : null;
      if (heading && heading[1].length <= level) {
        end = next;
        break;
      }
    }
    items.push({ kind, number, start: idx, end, level });
  }
  return items;
}

/** Indexes of an item's acceptance lines, in order. */
function acceptanceLines(lines: string[], item: Item): number[] {
  let from = -1;
  for (let idx = item.start + 1; idx < item.end; idx += 1) {
    if (/acceptance\s+criteria/i.test(lines[idx])) {
      from = idx;
      break;
    }
  }
  const found: number[] = [];
  for (let idx = from === -1 ? item.start + 1 : from + 1; idx < item.end; idx += 1) {
    const match = lines[idx].match(LIST_LINE);
    if (!match) continue;
    if (from === -1 && !/^\s*[-*]\s+\[[ xX]\]/.test(lines[idx])) continue;
    found.push(idx);
  }
  return found;
}

function trailingBlanks(lines: string[], start: number, end: number): number {
  let count = 0;
  while (end - count - 1 > start && lines[end - count - 1].trim() === '') count += 1;
  return count;
}

function bodyOf(text: string | undefined): string[] {
  const lines = (text ?? '').replace(/\r\n/g, '\n').split('\n');
  while (lines.length > 0 && lines[0].trim() === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  return lines;
}

function stub(reason: string, ctx: ScopeItemEditContext): string {
  const who = ctx.amendment ? `Amendment ${ctx.amendment}, ${ctx.date}` : ctx.date;
  return `Removed (${who}) — ${reason.trim()}`;
}

function existing(items: Item[], kind: Kind): string {
  const ofKind = items.filter((item) => item.kind === kind);
  return ofKind.length === 0 ? `no ${kind} items exist in this scope` : ofKind.map((item) => label(kind, item.number)).join(', ');
}

interface ParsedTarget {
  kind: Kind;
  number?: number;
  ac: boolean;
  acNumber?: number;
}

function parseTarget(raw: string): ParsedTarget {
  const match = raw.trim().match(/^(FR|US)(?:-?\s?(\d+))?(?:\/AC(\d+)?)?$/i);
  if (!match) {
    throw new ScopeEditRefusal(`Edit target "${raw}" is not understood. Use FR-003, US2, or FR-003/AC2 (add also takes a bare FR or US).`);
  }
  return {
    kind: match[1].toUpperCase() as Kind,
    number: match[2] ? Number(match[2]) : undefined,
    ac: /\/AC/i.test(raw),
    acNumber: match[3] ? Number(match[3]) : undefined,
  };
}

function applyOne(
  lines: string[],
  edit: ScopeItemEdit,
  ctx: ScopeItemEditContext,
): { lines: string[]; change: ScopeItemChange } {
  const target = parseTarget(edit.target);
  const items = parseScopeItems(lines);
  const content = edit.content?.trim() ?? '';

  if (edit.op === 'add' && !target.ac) {
    const ofKind = items.filter((item) => item.kind === target.kind);
    if (content === '') throw new ScopeEditRefusal(`add ${target.kind} needs content: the title on the first line, the body after it.`);
    if (ofKind.length === 0) {
      throw new ScopeEditRefusal(`Cannot add a ${target.kind}: ${existing(items, target.kind)}. Supply ${target.kind === 'FR' ? 'functionalRequirements' : 'userScenarios'} to create the section first.`);
    }
    const last = ofKind.reduce((a, b) => (b.start > a.start ? b : a));
    const number = Math.max(...ofKind.map((item) => item.number)) + 1;
    const [first, ...rest] = bodyOf(content);
    const title = first.replace(/^#{1,6}\s*/, '').replace(/^(?:FR-\d+|US-?\s?\d+)\s*[—–:-]?\s*/i, '').trim();
    const insertAt = last.end - trailingBlanks(lines, last.start, last.end);
    const added = ['', `${'#'.repeat(last.level)} ${label(target.kind, number)} — ${title}`, ...(rest.length ? ['', ...bodyOf(rest.join('\n'))] : [])];
    return {
      lines: [...lines.slice(0, insertAt), ...added, ...lines.slice(insertAt)],
      change: { target: label(target.kind, number), action: 'created', previous: '' },
    };
  }

  if (target.number === undefined) {
    throw new ScopeEditRefusal(`${edit.op} needs a numbered target (e.g. ${label(target.kind, 1)}); got "${edit.target}".`);
  }
  const item = items.find((candidate) => candidate.kind === target.kind && candidate.number === target.number);
  const name = label(target.kind, target.number);
  if (!item) {
    throw new ScopeEditRefusal(`Edit target ${name} does not exist. Existing: ${existing(items, target.kind)}.`);
  }

  if (target.ac) {
    const acs = acceptanceLines(lines, item);
    if (edit.op === 'add') {
      if (content === '') throw new ScopeEditRefusal(`add ${name}/AC needs content.`);
      if (acs.length === 0) throw new ScopeEditRefusal(`${name} has no acceptance lines to extend.`);
      const lastAc = acs[acs.length - 1];
      const prefix = (lines[lastAc].match(LIST_LINE) as RegExpMatchArray)[1];
      const text = bodyOf(content)[0].replace(/^\s*[-*]\s*(?:\[[ xX]\]\s*)?/, '');
      const next = [...lines.slice(0, lastAc + 1), `${prefix}${text}`, ...lines.slice(lastAc + 1)];
      return { lines: next, change: { target: `${name}/AC${acs.length + 1}`, action: 'created', previous: '' } };
    }
    if (target.acNumber === undefined || target.acNumber < 1 || target.acNumber > acs.length) {
      throw new ScopeEditRefusal(
        `Edit target ${name}/AC${target.acNumber ?? ''} does not exist. ${name} has ${acs.length === 0 ? 'no acceptance lines' : `AC1..AC${acs.length}`}.`,
      );
    }
    const at = acs[target.acNumber - 1];
    const match = lines[at].match(LIST_LINE) as RegExpMatchArray;
    let text: string;
    if (edit.op === 'remove') {
      if (content === '') throw new ScopeEditRefusal(`remove ${name}/AC${target.acNumber} needs a reason in content.`);
      text = stub(content, ctx);
    } else {
      if (content === '') throw new ScopeEditRefusal(`replace ${name}/AC${target.acNumber} needs content.`);
      text = bodyOf(content)[0].replace(/^\s*[-*]\s*(?:\[[ xX]\]\s*)?/, '');
    }
    const next = [...lines];
    next[at] = `${match[1]}${text}`;
    return { lines: next, change: { target: `${name}/AC${target.acNumber}`, action: 'replaced', previous: match[2] } };
  }

  const blanks = trailingBlanks(lines, item.start, item.end);
  const previous = lines.slice(item.start + 1, item.end - blanks).join('\n').trim();
  const tail = Array<string>(blanks).fill('');
  let replacement: string[];
  if (edit.op === 'remove') {
    if (content === '') throw new ScopeEditRefusal(`remove ${name} needs a reason in content.`);
    replacement = [lines[item.start], '', stub(content, ctx)];
  } else if (edit.op === 'replace') {
    if (content === '') throw new ScopeEditRefusal(`replace ${name} needs content.`);
    const body = bodyOf(content);
    if (/^#{1,6}\s/.test(body[0])) {
      const claimed = body[0].match(target.kind === 'FR' ? /FR-(\d+)/i : /(\d+)/);
      if (!claimed || Number(claimed[1]) !== target.number) {
        throw new ScopeEditRefusal(`replace ${name}: content opens with a heading that is not ${name}. A replace never renumbers.`);
      }
      replacement = body;
    } else {
      replacement = [lines[item.start], '', ...body];
    }
  } else {
    throw new ScopeEditRefusal(`add takes a bare ${target.kind} or ${name}/AC, not ${name}.`);
  }
  return {
    lines: [...lines.slice(0, item.start), ...replacement, ...tail, ...lines.slice(item.end)],
    change: { target: name, action: 'replaced', previous },
  };
}

/** Apply edits in order; each sees the document the previous one left. Throws on the first refusal. */
export function applyItemEdits(
  lines: string[],
  edits: ScopeItemEdit[],
  ctx: ScopeItemEditContext,
): { lines: string[]; changes: ScopeItemChange[] } {
  let current = lines;
  const changes: ScopeItemChange[] = [];
  for (const edit of edits) {
    const applied = applyOne(current, edit, ctx);
    current = applied.lines;
    changes.push(applied.change);
  }
  return { lines: current, changes };
}
// [SCOPE 135 / T016] END
