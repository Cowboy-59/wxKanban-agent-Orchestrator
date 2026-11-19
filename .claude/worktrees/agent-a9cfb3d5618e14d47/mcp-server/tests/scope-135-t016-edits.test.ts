// [SCOPE 135 / T016] BEGIN — edits carry FRs and user scenarios, by named item
import { describe, it, expect } from 'vitest';
import { mergeScopeEdit } from '../src/utils/scope-merge.js';
import { ScopeEditRefusal } from '../src/utils/scope-edits.js';
import { BuildScopeInputSchema } from '../src/utils/schemas.js';

const DOC = [
  '# Scope 007: Sample',
  '',
  '## User Scenarios & Testing',
  '',
  '### US1 — First',
  '',
  'Body one.',
  '',
  '### US2 — Second',
  '',
  'Body two.',
  '',
  '## Functional Requirements',
  '',
  '### FR-001 — Alpha',
  '',
  'Alpha text.',
  '',
  '**Acceptance Criteria**:',
  '- [ ] a1',
  '- [ ] a2',
  '',
  '### FR-002 — Beta',
  '',
  'Beta text.',
  '',
  '**Acceptance Criteria**:',
  '- [ ] b1',
  '',
  '### FR-003 — Gamma',
  '',
  'Gamma text.',
  '',
  '**Acceptance Criteria**:',
  '- [ ] c1',
  '- [x] c2',
  '- [ ] c3',
  '',
  '## Data Requirements',
  '',
  'Old data.',
  '',
  '## Notes',
  '',
  'Keep me.',
  '',
].join('\n');

const lines = (content: string): string[] => content.split('\n');
const date = '2026-10-28';

describe('SPEC-135 T016 — whole-section fields on an edit (FR-017)', () => {
  it('functionalRequirements alone replaces the FR section including its ### items, nothing else', () => {
    const r = mergeScopeEdit(DOC, { functionalRequirements: ['### FR-001 — New', '', 'New text.'] });
    expect(r.replacedSections).toEqual(['functional_requirements']);
    expect(r.content).toContain('### FR-001 — New');
    expect(r.content).not.toContain('Gamma');
    expect(r.content).toContain('## Data Requirements\n\nOld data.');
    expect(r.content).toContain('### US2 — Second');
    expect(r.content.endsWith('Keep me.\n')).toBe(true);
  });

  it('userScenarios alone replaces only the scenarios', () => {
    const r = mergeScopeEdit(DOC, { userScenarios: ['### US1 — Only'] });
    expect(r.replacedSections).toEqual(['user_scenarios']);
    expect(r.content).not.toContain('US2');
    expect(r.content).toContain('### FR-003 — Gamma');
  });

  it('a technical section replaces just that section; None renders the standard sentence', () => {
    const r = mergeScopeEdit(DOC, { dataRequirements: 'None' });
    expect(r.replacedSections).toEqual(['data_requirements']);
    expect(r.content).toContain('## Data Requirements\n\nNone — not affected by this scope.\n\n## Notes');
  });

  it('creates a missing technical section instead of overwriting a neighbour', () => {
    const r = mergeScopeEdit(DOC, { apiRoutes: 'GET /x' });
    expect(r.createdSections).toEqual(['api_routes']);
    expect(r.content).toContain('Keep me.');
  });
});

describe('SPEC-135 T016 — edits by named item (FR-018)', () => {
  it('replace FR-003/AC2 changes exactly that line, keeping its checkbox state', () => {
    const r = mergeScopeEdit(DOC, { edits: [{ op: 'replace', target: 'FR-003/AC2', content: 'c2 revised' }] });
    const before = lines(DOC);
    const after = lines(r.content);
    const diff = after.map((l, i) => [l, before[i]]).filter(([a, b]) => a !== b);
    expect(diff).toEqual([['- [x] c2 revised', '- [x] c2']]);
    expect(after.length).toBe(before.length);
  });

  it('add FR to FR-001..FR-003 creates FR-004 after FR-003 and before the next section', () => {
    const r = mergeScopeEdit(DOC, { edits: [{ op: 'add', target: 'FR', content: 'Delta\n\nDelta text.' }] });
    expect(r.createdSections).toEqual(['FR-004']);
    const i = r.content.indexOf('### FR-004 — Delta');
    expect(i).toBeGreaterThan(r.content.indexOf('### FR-003'));
    expect(i).toBeLessThan(r.content.indexOf('## Data Requirements'));
    expect(r.content).toContain('## Data Requirements\n\nOld data.');
  });

  it('add US numbers past the highest US', () => {
    const r = mergeScopeEdit(DOC, { edits: [{ op: 'add', target: 'US', content: 'Third' }] });
    expect(r.content).toContain('### US3 — Third');
  });

  it('add FR-003/AC appends an acceptance line', () => {
    const r = mergeScopeEdit(DOC, { edits: [{ op: 'add', target: 'FR-003/AC', content: 'c4' }] });
    expect(r.content).toContain('- [ ] c3\n- [ ] c4\n');
  });

  it('remove FR-002 leaves the heading and number and a Removed stub; FR-003 stays numbered', () => {
    const r = mergeScopeEdit(DOC, { edits: [{ op: 'remove', target: 'FR-002', content: 'obsolete' }], amendment: 'B', date });
    expect(r.content).toContain('### FR-002 — Beta\n\nRemoved (Amendment B, 2026-10-28) — obsolete\n\n### FR-003 — Gamma');
    expect(r.content).not.toContain('Beta text.');
  });

  it('replace FR-001 body keeps the heading; a heading with another number is refused', () => {
    const r = mergeScopeEdit(DOC, { edits: [{ op: 'replace', target: 'FR-001', content: 'Fresh body.' }] });
    expect(r.content).toContain('### FR-001 — Alpha\n\nFresh body.\n\n### FR-002');
    expect(() => mergeScopeEdit(DOC, { edits: [{ op: 'replace', target: 'FR-001', content: '### FR-009 — x' }] })).toThrow(ScopeEditRefusal);
  });

  it('refuses an unknown target and lists the items that exist', () => {
    expect(() => mergeScopeEdit(DOC, { edits: [{ op: 'replace', target: 'FR-099', content: 'x' }] })).toThrow(
      /FR-099 does not exist\. Existing: FR-001, FR-002, FR-003/,
    );
    expect(() => mergeScopeEdit(DOC, { edits: [{ op: 'replace', target: 'FR-001/AC9', content: 'x' }] })).toThrow(/AC1\.\.AC2/);
  });

  it('refuses remove without a reason', () => {
    expect(() => mergeScopeEdit(DOC, { edits: [{ op: 'remove', target: 'US1' }] })).toThrow(/reason/);
  });

  it('preserves CRLF', () => {
    const crlf = DOC.replace(/\n/g, '\r\n');
    const r = mergeScopeEdit(crlf, { edits: [{ op: 'replace', target: 'FR-003/AC1', content: 'c1b' }] });
    expect(r.content).toContain('- [ ] c1b\r\n');
    expect(r.content.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('the input schema accepts edits and rejects a bad op', () => {
    const base = { featureDescription: 'x', editSpecNumber: '007' };
    expect(BuildScopeInputSchema.safeParse({ ...base, edits: [{ op: 'remove', target: 'FR-1', content: 'r' }] }).success).toBe(true);
    expect(BuildScopeInputSchema.safeParse({ ...base, edits: [{ op: 'delete', target: 'FR-1' }] }).success).toBe(false);
  });
});
// [SCOPE 135 / T016] END

// [SCOPE 135 / T017] BEGIN — the tool checks that an edit changed only what it named
import { verifyOnlyNamedChanged, diffLines } from '../src/utils/scope-verify.js';

describe('SPEC-135 T017 — byte-identical outside the named items (FR-019)', () => {
  it('diffLines reports exactly the changed hunks', () => {
    expect(diffLines(['a', 'b', 'c', 'd'], ['a', 'B', 'c', 'd', 'e'])).toEqual([
      { aStart: 1, aEnd: 2, bStart: 1, bEnd: 2 },
      { aStart: 4, aEnd: 4, bStart: 4, bEnd: 5 },
    ]);
  });

  it('a clean multi-edit merge passes the check', () => {
    expect(() =>
      mergeScopeEdit(DOC, {
        dataRequirements: 'None',
        edits: [
          { op: 'replace', target: 'FR-003/AC2', content: 'x' },
          { op: 'add', target: 'FR', content: 'Delta' },
        ],
      }),
    ).not.toThrow();
  });

  it('a forced merge defect (a stray change outside the named item) is refused, naming the line', () => {
    const merged = mergeScopeEdit(DOC, { edits: [{ op: 'replace', target: 'FR-003/AC2', content: 'x' }] });
    const corrupted = merged.content.replace('Keep me.', 'Kept me.');
    const line = DOC.split('\n').indexOf('Keep me.') + 1;
    expect(() => verifyOnlyNamedChanged(DOC, corrupted, merged.replacedSections, false)).toThrow(
      new RegExp(`line ${line} .*Keep me\.`),
    );
  });

  it('an unnamed insertion is refused too', () => {
    const merged = mergeScopeEdit(DOC, { edits: [{ op: 'replace', target: 'FR-003/AC2', content: 'x' }] });
    const corrupted = merged.content.replace('## Notes', 'Stray line\n\n## Notes');
    expect(() => verifyOnlyNamedChanged(DOC, corrupted, merged.replacedSections, false)).toThrow(/Stray line/);
  });

  it('refuses a draft whose line endings changed, and a mixed-ending base', () => {
    expect(() => verifyOnlyNamedChanged('a\r\nb\r\n', 'a\nb\n', [], false)).toThrow(/line endings/);
    expect(() => verifyOnlyNamedChanged('a\r\nb\n', 'a\r\nb\r\n', [], false)).toThrow(/mixed line endings/);
  });

  it('nothing changed is a pass', () => {
    expect(() => verifyOnlyNamedChanged(DOC, DOC, [], false)).not.toThrow();
  });
});
// [SCOPE 135 / T017] END

// [SCOPE 135 / T018] BEGIN — the before/after diff an edit response carries
import { formatEditDiff } from '../src/utils/scope-verify.js';

describe('SPEC-135 T018 — edit diff (FR-020)', () => {
  it('shows exactly the changed lines, with line numbers', () => {
    const merged = mergeScopeEdit(DOC, { edits: [{ op: 'replace', target: 'FR-003/AC2', content: 'c2 revised' }] });
    const diff = formatEditDiff(DOC, merged.content);
    const line = DOC.split('\n').indexOf('- [x] c2') + 1;
    expect(diff.hunks).toEqual([{ line, before: ['- [x] c2'], after: ['- [x] c2 revised'] }]);
    expect(diff.text).toBe(`@@ line ${line} @@\n- - [x] c2\n+ - [x] c2 revised`);
  });

  it('is empty when nothing changed', () => {
    expect(formatEditDiff(DOC, DOC)).toEqual({ hunks: [], text: '' });
  });
});
// [SCOPE 135 / T018] END

// [SCOPE 135 / T020] BEGIN — every edit that changes something is logged in the Amendment Log (FR-022)
describe('SPEC-135 T020 — Amendment Log (FR-022)', () => {
  const log = { reason: 'Clarify c2 after review' };

  it('US8: one entry carrying the replaced acceptance line verbatim', () => {
    const r = mergeScopeEdit(DOC, { edits: [{ op: 'replace', target: 'FR-003/AC2', content: 'c2 revised' }], amendment: 'B', date, log });
    const at = r.content.indexOf('## Amendment Log');
    expect(at).toBeGreaterThan(r.content.indexOf('Keep me.'));
    expect(r.content.slice(at)).toBe(
      [
        '## Amendment Log',
        '',
        '### 2026-10-28 — Amendment B',
        '',
        '- Reason: Clarify c2 after review',
        '- Items: FR-003/AC2',
        '- Replaced text, verbatim:',
        '',
        `Line ${DOC.split('\n').indexOf('- [x] c2') + 1}:`,
        '',
        '```text',
        '- [x] c2',
        '```',
        '',
      ].join('\n'),
    );
  });

  it('two successive edits leave two entries, the first byte-identical after the second', () => {
    const first = mergeScopeEdit(DOC, { edits: [{ op: 'replace', target: 'FR-003/AC2', content: 'x' }], date, log });
    const firstLog = first.content.slice(first.content.indexOf('## Amendment Log'));
    const second = mergeScopeEdit(first.content, { dataRequirements: 'None', date: '2026-10-29', log: { reason: 'second' } });
    const secondLog = second.content.slice(second.content.indexOf('## Amendment Log'));
    expect(secondLog.startsWith(firstLog.trimEnd())).toBe(true);
    expect(secondLog).toContain('### 2026-10-29\n\n- Reason: second\n- Items: data_requirements');
    expect(secondLog.match(/^### /gm)).toHaveLength(2);
  });

  it('no reason is logged as "No reason given", not refused', () => {
    const r = mergeScopeEdit(DOC, { dataRequirements: 'None', date, log: {} });
    expect(r.content).toContain('- Reason: No reason given');
  });

  it('records an unattended (--yes) write, and "additions only" when nothing was replaced', () => {
    const r = mergeScopeEdit(DOC, { edits: [{ op: 'add', target: 'FR', content: 'Delta' }], date, log: { unattended: true } });
    expect(r.content).toContain('- Written unattended (--yes), without an interactive confirm');
    expect(r.content).toContain('- Replaced text: none (additions only)');
  });

  it('verbatim text with a code fence in it gets a longer fence, so it cannot close early', () => {
    const withFence = DOC.replace('Old data.', '```sql\nselect 1\n```');
    const r = mergeScopeEdit(withFence, { dataRequirements: 'None', date, log });
    expect(r.content).toContain('````text\n```sql\nselect 1\n```\n````');
  });

  it('an edit that changes nothing writes no entry; no log option writes no entry', () => {
    expect(mergeScopeEdit(DOC, { date, log }).content).toBe(DOC);
    expect(mergeScopeEdit(DOC, { dataRequirements: 'None', date }).content).not.toContain('Amendment Log');
  });

  it('a merge that rewrote an earlier log entry would be refused by the byte-identical check', () => {
    const first = mergeScopeEdit(DOC, { dataRequirements: 'None', date, log }).content;
    const tampered = first.replace('- Reason: Clarify c2 after review', '- Reason: rewritten');
    expect(() => verifyOnlyNamedChanged(first, tampered, ['data_requirements'], false, [])).toThrow(/Reason: Clarify c2/);
  });
});
// [SCOPE 135 / T020] END
