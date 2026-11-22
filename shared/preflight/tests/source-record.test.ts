// [SCOPE 135 / T027] BEGIN — source-record grammar, parser and expander (FR-023, FR-027, FR-028)
import { describe, it, expect } from 'vitest';
import {
  validateSourceRecord,
  formatSourceRecord,
  expandPointers,
  parseSourceRecord,
  sourceRecordApplied,
  createFenceTracker,
  isAmendmentLogHeading,
  endsAmendmentLog,
} from '../src/index.js';

const REC = 'docs/brainstorms/2026-11-20-agent-common-room.md';

describe('validateSourceRecord', () => {
  it.each(['none', REC, `${REC}#21`, `${REC}#3,7a,12`, 'a.md', 'specs/x/y.md#0', 'docs/god-scopes/a-b.md'])('accepts %s', (value) => {
    const result = validateSourceRecord(value);
    expect(result.ok).toBe(true);
    if (result.ok) expect(formatSourceRecord(result.pointer)).toBe(value);
  });

  it.each([
    '',
    ' none',
    'None',
    '/docs/x.md',
    '../x.md',
    'docs/../x.md',
    'docs/./x.md',
    'docs//x.md',
    'docs\\x.md',
    'C:/x.md',
    'docs/x.txt',
    '.md',
    'docs/.md',
    'docs/my file.md',
    '`docs/x.md`',
    'docs/x.md#',
    'docs/x.md#3-7',
    'docs/x.md#3,',
    'docs/x.md#7A',
    'docs/x.md#7ab',
    'docs/x.md#a',
    'docs/x.md#3#4',
    'docs/x.md;docs/y.md',
    `${REC}#21 `,
  ])('refuses %j', (value) => {
    expect(validateSourceRecord(value).ok).toBe(false);
  });
});

describe('expandPointers', () => {
  it('matches the ledger source field byte for byte', () => {
    const r = validateSourceRecord(`${REC}#21`);
    expect(r.ok && expandPointers(r.pointer)).toEqual(['docs/brainstorms/2026-11-20-agent-common-room.md#21']);
  });
  it('expands every row, in order', () => {
    const r = validateSourceRecord('docs/x.md#3,7a,12');
    expect(r.ok && expandPointers(r.pointer)).toEqual(['docs/x.md#3', 'docs/x.md#7a', 'docs/x.md#12']);
  });
  it('returns the path for a whole document and nothing for none', () => {
    expect(expandPointers({ path: 'docs/x.md', rows: [] })).toEqual(['docs/x.md']);
    expect(expandPointers('none')).toEqual([]);
  });
});

const SCOPE = [
  '<!-- wxkanban:synced sha256=' + 'a'.repeat(64) + ' -->',
  '# Scope: Thing',
  '',
  '**Source**: `specs/Project-Scope/200-thing.md`',
  `**Source Record**: ${REC}#21`,
  '',
  '## Overview',
  '',
  '**Source Record**: docs/other.md#9',
  '',
  '## Amendment Log',
  '',
  '### 2026-11-01',
  '',
  '- Items: Overview',
  '- Source Record: docs/dateonly.md#1',
  '',
  '### 2026-11-10 — Amendment A',
  '',
  '- Reason: first',
  '- Items: Overview',
  '',
  '````md',
  '### 2026-11-11 — Amendment Z',
  '- Source Record: docs/fenced.md#1',
  '```',
  'still fenced',
  '```',
  '````',
  '',
  '### 2026-11-22 — Amendment B',
  '',
  '- Reason: second',
  '- Items: Overview, Actors',
  `- Source Record: ${REC}#15`,
  '',
].join('\n');

describe('parseSourceRecord', () => {
  it('reads the header pointer from the header block only', () => {
    expect(parseSourceRecord(SCOPE).header).toEqual({ path: REC, rows: ['21'] });
  });

  it('lists lettered entries only, skipping fenced code and date-only entries', () => {
    expect(parseSourceRecord(SCOPE).amendments).toEqual([
      { letter: 'A', date: '2026-11-10', pointer: null },
      { letter: 'B', date: '2026-11-22', pointer: { path: REC, rows: ['15'] } },
    ]);
  });

  it('reads a missing line as null and an out-of-grammar line as unresolved', () => {
    expect(parseSourceRecord('# Scope\n\n**Source**: `x`\n\n## Overview\n').header).toBeNull();
    expect(parseSourceRecord('# Scope\n**Source Record**: `docs/x.md`\n## Overview\n').header).toBe('unresolved');
    expect(parseSourceRecord('# Scope\n**Source Record**: none\n').header).toBe('none');
  });

  it('handles CRLF', () => {
    expect(parseSourceRecord(SCOPE.replace(/\n/g, '\r\n')).header).toEqual({ path: REC, rows: ['21'] });
  });
});

describe('sourceRecordApplied', () => {
  it('checks the header on a create', () => {
    expect(sourceRecordApplied(SCOPE, { value: `${REC}#21`, edit: false })).toBe(true);
    expect(sourceRecordApplied(SCOPE, { value: `${REC}#22`, edit: false })).toBe(false);
    expect(sourceRecordApplied('# Scope\n\n## Overview\n', { value: 'none', edit: false })).toBe(false);
  });

  it('checks only the last lettered entry on an edit', () => {
    expect(sourceRecordApplied(SCOPE, { value: `${REC}#15`, amendment: 'B', edit: true })).toBe(true);
    expect(sourceRecordApplied(SCOPE, { value: `${REC}#15`, amendment: 'C', edit: true })).toBe(false);
    // An earlier entry with the same value does not count.
    const stale = SCOPE + '\n### 2026-11-23 — Amendment C\n\n- Items: Overview\n';
    expect(sourceRecordApplied(stale, { value: `${REC}#15`, amendment: 'C', edit: true })).toBe(false);
  });
});
// [SCOPE 135 / T027] END

// [SCOPE 135 / T029] BEGIN — review fixes: tighter grammar, shared fence tracker, entry-count guard
describe('validateSourceRecord — T029 grammar', () => {
  it.each(['docs/x.md#0', 'docs/x.md#10,2a', 'docs/v1.2/x.md', 'docs/a_b-c/x.y.md'])('accepts %s', (value) => {
    expect(validateSourceRecord(value).ok).toBe(true);
  });

  it.each([
    'docs/x.md#021',
    'docs/x.md#00',
    'docs/x.md#3,3',
    'docs/x.md#7a,7a',
    'docs./x.md',
    'a/b./c.md',
    'docs/x‮dm.txt.md',
    'docs/x\u0000.md',
    'docs/x​.md',
    'docs/café.md',
    'a<b.md',
    'a>b.md',
    'a|b.md',
    'a?.md',
    'a*.md',
    'a".md',
  ])('refuses %j', (value) => {
    expect(validateSourceRecord(value).ok).toBe(false);
  });

  it('names a repeated row in the reason', () => {
    const r = validateSourceRecord('docs/x.md#3,4,3');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('"3"');
  });
});

describe('createFenceTracker', () => {
  it('closes only on the same character, at least as long, with nothing after it', () => {
    const inFence = createFenceTracker();
    const lines = ['live', '````md', '```', 'inside', '~~~~', '```` trailing', '````', 'live again'];
    expect(lines.map((line) => inFence(line))).toEqual([false, true, true, true, true, true, true, false]);
  });

  it('starts fresh per call', () => {
    const a = createFenceTracker();
    a('```');
    expect(createFenceTracker()('plain')).toBe(false);
    expect(a('plain')).toBe(true);
  });
});

describe('sourceRecordApplied — T029 entry-count guard', () => {
  const base = SCOPE;
  const withC = `${SCOPE}\n### 2026-11-23 — Amendment C\n\n- Items: Overview\n- Source Record: ${REC}#15\n`;

  it('passes when the response holds exactly one more lettered entry than the base', () => {
    expect(sourceRecordApplied(withC, { value: `${REC}#15`, amendment: 'C', edit: true, base })).toBe(true);
  });

  it('fails when no entry was added, even though the last entry matches', () => {
    expect(sourceRecordApplied(withC, { value: `${REC}#15`, amendment: 'C', edit: true, base: withC })).toBe(false);
  });

  it('fails when two entries were added', () => {
    const twoMore = `${withC}\n### 2026-11-24 — Amendment D\n\n- Items: Overview\n- Source Record: ${REC}#15\n`;
    expect(sourceRecordApplied(twoMore, { value: `${REC}#15`, amendment: 'D', edit: true, base })).toBe(false);
  });

  it('ignores a blank base (no document was sent)', () => {
    expect(sourceRecordApplied(withC, { value: `${REC}#15`, amendment: 'C', edit: true, base: '   ' })).toBe(true);
  });
});

describe('T029 verify fixes — inline-code openers and indented headings', () => {
  it('does not open a backtick fence whose info string holds a backtick; a tilde opener still opens', () => {
    const t = createFenceTracker();
    expect(t('```npm run x``` starts it')).toBe(false);
    expect(t('## Amendment Log')).toBe(false);
    const tilde = createFenceTracker();
    expect(tilde('~~~ uses `x`')).toBe(true);
    expect(tilde('inside')).toBe(true);
    expect(tilde('~~~')).toBe(true);
    expect(tilde('after')).toBe(false);
  });

  it('keeps the log readable after an inline-code line that starts with three backticks', () => {
    const doc = [
      '# Scope: Thing',
      '',
      '## Overview',
      '',
      '```npm run x``` starts it',
      '',
      '## Amendment Log',
      '',
      '### 2026-11-22 — Amendment A',
      '',
      `- Source Record: ${REC}#15`,
      '',
    ].join('\n');
    expect(parseSourceRecord(doc).amendments).toEqual([{ letter: 'A', date: '2026-11-22', pointer: { path: REC, rows: ['15'] } }]);
  });

  it('reads a heading as an ATX heading indented at most 3 spaces', () => {
    expect(endsAmendmentLog('# Top')).toBe(true);
    expect(endsAmendmentLog('## Later')).toBe(true);
    expect(endsAmendmentLog('   ## Later')).toBe(true);
    expect(endsAmendmentLog('##')).toBe(true);
    expect(endsAmendmentLog('    # x')).toBe(false);
    expect(endsAmendmentLog('\t# x')).toBe(false);
    expect(endsAmendmentLog('### entry')).toBe(false);
    expect(endsAmendmentLog('#tag')).toBe(false);
    expect(isAmendmentLogHeading('## Amendment Log')).toBe(true);
    expect(isAmendmentLogHeading('  ## amendment  log')).toBe(true);
    expect(isAmendmentLogHeading('    ## Amendment Log')).toBe(false);
  });

  it('does not end the log at indented code, and does end it at an indented heading', () => {
    const entry = (letter: string, extra: string[]): string[] => [
      `### 2026-11-2${letter === 'A' ? '1' : '2'} — Amendment ${letter}`,
      '',
      ...extra,
      `- Source Record: ${REC}#${letter === 'A' ? '1' : '2'}`,
      '',
    ];
    const codeInEntry = ['# Scope', '', '## Overview', '', '## Amendment Log', '', ...entry('A', ['    # x', '']), ...entry('B', [])].join('\n');
    expect(parseSourceRecord(codeInEntry).amendments.map((a) => a.letter)).toEqual(['A', 'B']);
    const headingAfter = ['# Scope', '', '## Amendment Log', '', ...entry('A', []), '  ## Later', '', ...entry('B', [])].join('\n');
    expect(parseSourceRecord(headingAfter).amendments.map((a) => a.letter)).toEqual(['A']);
  });
});
// [SCOPE 135 / T029] END

// [SCOPE 135 / T030] BEGIN — amendment letters after Z: Z0001, Z0002, ... (FR-025)
describe('amendment letters after Z', () => {
  const pastZ = `${SCOPE}\n### 2026-11-23 — Amendment Z\n\n- Items: Overview\n\n### 2026-11-24 — Amendment Z0001\n\n- Items: Overview\n- Source Record: ${REC}#15\n`;

  it('parses Z0001 as the entry letter', () => {
    expect(parseSourceRecord(pastZ).amendments.slice(-2)).toEqual([
      { letter: 'Z', date: '2026-11-23', pointer: null },
      { letter: 'Z0001', date: '2026-11-24', pointer: { path: REC, rows: ['15'] } },
    ]);
  });

  it('passes the edit re-read check with amendment Z0001', () => {
    const base = `${SCOPE}\n### 2026-11-23 — Amendment Z\n\n- Items: Overview\n`;
    expect(sourceRecordApplied(pastZ, { value: `${REC}#15`, amendment: 'Z0001', edit: true, base })).toBe(true);
    expect(sourceRecordApplied(pastZ, { value: `${REC}#15`, amendment: 'Z', edit: true, base })).toBe(false);
  });
});
// [SCOPE 135 / T030] END

// [SCOPE 135 / T031] BEGIN — only the first `## Amendment Log` heading opens the log (FR-028)
describe('a second Amendment Log heading', () => {
  it('ends the log and its entries are not listed', () => {
    const doc = [
      '# Scope', '', '## Amendment Log', '',
      '### 2026-11-10 — Amendment A', '', '- Items: Overview', '',
      '## Notes', '', 'x', '',
      '## Amendment Log', '',
      '### 2026-11-11 — Amendment B', '', '- Items: Overview', '',
    ].join('\n');
    expect(parseSourceRecord(doc).amendments.map((a) => a.letter)).toEqual(['A']);
  });

  it('ends the log even when the second heading follows the first directly', () => {
    const doc = [
      '# Scope', '', '## Amendment Log', '', '### 2026-11-10 — Amendment A', '', '- Items: Overview', '',
      '## Amendment Log', '', '### 2026-11-11 — Amendment B', '', '- Items: Overview', '',
    ].join('\n');
    expect(parseSourceRecord(doc).amendments.map((a) => a.letter)).toEqual(['A']);
  });

  it('an indented `  ## Amendment Log` closes the header and opens the log, as the writer reads it', () => {
    const doc = `# T\n\n**Source Record**: ${REC}#1\n\n  ## Amendment Log\n\n### 2026-11-10 — Amendment A\n\n- Source Record: ${REC}#2\n`;
    const parsed = parseSourceRecord(doc);
    expect(parsed.header).toEqual({ path: REC, rows: ['1'] });
    expect(parsed.amendments).toEqual([{ letter: 'A', date: '2026-11-10', pointer: { path: REC, rows: ['2'] } }]);
    // A `####` line, or a `##` indented 4 spaces (indented code), does not close the header.
    const notHeadings = `# T\n\n    ## code\n#### deep\n**Source Record**: ${REC}#3\n\n## Overview\n`;
    expect(parseSourceRecord(notHeadings).header).toEqual({ path: REC, rows: ['3'] });
  });
});
// [SCOPE 135 / T031] END
