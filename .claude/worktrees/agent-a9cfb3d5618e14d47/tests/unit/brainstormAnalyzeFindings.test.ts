// [SCOPE 156 / T019] BEGIN — Unit tests for the analyze findings helper (FR-006, FR-008, FR-009, FR-011, FR-012)
// Pure tests: the helper is imported directly (its CLI is guarded behind an isMain check), and
// the only files touched are in a temp folder. No database, no network.
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildSitting,
  check,
  compare,
  crossApp,
  decide,
  fingerprintOf,
  guard,
  mergeFindings,
  run,
} from '../../.claude/skills/wxBrainstorm/scripts/analyze-findings.mjs';

interface RawFinding {
  rule: string;
  path?: string;
  line?: number;
  anchor?: string;
  snippet?: string;
  message?: string;
  list?: string;
  confidence?: string;
  feature?: string;
  table?: string;
  column?: string;
  count?: number;
  [extra: string]: unknown;
}

const file = (analyzer: string, findings: RawFinding[], extra: Record<string, unknown> = {}) => ({ analyzer, findings, ...extra });
const groups = ['Board', 'Billing'];
const emptyState: RawFinding = {
  rule: 'missing-empty-state',
  path: 'src\\client\\Board.tsx',
  line: 120,
  anchor: 'BoardPage',
  snippet: '{items.map(i => <Card />)}',
  message: 'List has no empty state',
  list: 'gap',
  confidence: 'Confirmed',
  feature: 'Board',
};

const sitting = (files: ReturnType<typeof file>[], date = '2026-11-08') =>
  buildSitting({ label: 'app-a', date, groups, files });

const tmp: string[] = [];
afterEach(() => {
  while (tmp.length) rmSync(tmp.pop() as string, { recursive: true, force: true });
});
const tmpDir = () => {
  const d = mkdtempSync(path.join(os.tmpdir(), 'wxk-analyze-'));
  tmp.push(d);
  return d;
};

describe('fingerprint and evidence hash (FR-009)', () => {
  it('is unchanged when the flagged block moves by N lines', () => {
    const a = sitting([file('wxUIUXCodeReview', [emptyState])]).findings[0];
    const b = sitting([file('wxUIUXCodeReview', [{ ...emptyState, line: 987 }])]).findings[0];
    expect(b.fingerprint).toBe(a.fingerprint);
    expect(b.evidenceHash).toBe(a.evidenceHash);
    expect(b.location).toBe('src/client/Board.tsx:987');
  });

  it('uses the collapsed snippet (max 120 chars) as anchor when none is given', () => {
    const noAnchor = { ...emptyState, anchor: undefined, snippet: `   ${'x'.repeat(200)}   ` };
    const f = sitting([file('a', [noAnchor])]).findings[0];
    expect(f.fingerprint).toBe(fingerprintOf('a', 'missing-empty-state', 'src/client/Board.tsx', 'x'.repeat(120)));
  });

  it('changes the evidence hash when the evidence changes, whitespace aside', () => {
    const a = sitting([file('a', [emptyState])]).findings[0];
    const spaced = sitting([file('a', [{ ...emptyState, message: '  List   has no\nempty state ' }])]).findings[0];
    const changed = sitting([file('a', [{ ...emptyState, snippet: '{items.length ? list : null}' }])]).findings[0];
    expect(spaced.evidenceHash).toBe(a.evidenceHash);
    expect(changed.evidenceHash).not.toBe(a.evidenceHash);
  });
});

describe('merge (FR-006)', () => {
  it('shows the same problem from two analyzers once, crediting both', () => {
    const findings = mergeFindings(
      [file('wxUIUXCodeReview', [emptyState]), file('analyzecode', [{ ...emptyState, list: 'must-fix', confidence: 'Likely' }])],
      groups,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].analyzers).toEqual(['analyzecode', 'wxUIUXCodeReview']);
    expect(findings[0].keys).toHaveLength(2);
    expect(findings[0].list).toBe('must-fix');
  });

  it('puts a finding with no matching feature under Unplaced, never dropping it', () => {
    const findings = mergeFindings([file('a', [{ ...emptyState, feature: 'Nowhere' }])], groups);
    expect(findings).toHaveLength(1);
    expect(findings[0].feature).toBe('Unplaced');
  });

  it('labels a finding with no confidence Assumed', () => {
    const findings = mergeFindings([file('panel', [{ rule: 'idea', path: 'x.ts', anchor: 'X' }])], groups);
    expect(findings[0].confidence).toBe('Assumed');
  });

  it('records a not-checked analyzer with its reason and takes none of its findings', () => {
    const s = sitting([file('a', [emptyState]), file('b', [emptyState], { checked: false, notCheckedReason: 'timed out after 30 min' })]);
    expect(s.analyzers).toEqual([
      { id: 'a', class: null, model: null, checked: true, notCheckedReason: null },
      { id: 'b', class: null, model: null, checked: false, notCheckedReason: 'timed out after 30 min' },
    ]);
    expect(s.findings[0].analyzers).toEqual(['a']);
  });

  it('keeps only names and counts from wxDBAnalyze and drops returned values (FR-011)', () => {
    const s = sitting([file('wxDBAnalyze', [{ rule: 'orphan-rows', table: 'orders', column: 'customerid', count: 12, message: 'Orphaned rows', sample: ['a', 'b'], values: [1] }])]);
    const f = s.findings[0];
    expect(f.location).toBe('orders.customerid');
    expect(f.evidence).toBe('Orphaned rows (count: 12)');
    expect(JSON.stringify(s)).not.toContain('sample');
    expect(guard(s).ok).toBe(true);
  });

  it('refuses a label that is not a short slug', () => {
    expect(() => buildSitting({ label: 'Acme Corp Ltd', date: '2026-11-08', groups, files: [] })).toThrow(/label/);
  });
});

describe('write guards (FR-008, FR-011)', () => {
  const withEvidence = (message: string) => sitting([file('a', [{ ...emptyState, message }])]);
  it.each([
    ['password=Hunter22x', 'credential'],
    ['Authorization: Bearer abcdefghijklmnop1234', 'credential'],
    ['key AKIAABCDEFGHIJKLMNOP', 'credential'],
    ['postgres://admin:s3cret@db.host/app', 'credential'],
    ['-----BEGIN RSA PRIVATE KEY-----', 'credential'],
    ['contact jane.doe@example.com', 'personal-data'],
    ['call (555) 123-4567', 'personal-data'],
    ['ssn 123-45-6789', 'personal-data'],
  ])('refuses %s', (message, kind) => {
    const r = guard(withEvidence(message));
    expect(r.ok).toBe(false);
    expect(r.problems[0].kind).toBe(kind);
  });

  it('allows existing redaction tokens and ordinary code', () => {
    expect(guard(withEvidence('password=[REDACTED:db-password] in config')).ok).toBe(true);
    expect(guard(withEvidence('connection uses ${DATABASE_URL}')).ok).toBe(true);
    expect(guard(withEvidence('password: z.string() has no min length')).ok).toBe(true);
  });

  it('refuses a database row value under any row-value key', () => {
    const s = sitting([file('a', [emptyState])]) as Record<string, unknown>;
    const r = guard({ ...s, extra: { rows: [{ id: 1 }] } });
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toEqual({ path: 'extra.rows', kind: 'row-value' });
  });

  it('merge CLI writes nothing and exits 2 when a value is refused', () => {
    const d = tmpDir();
    const inFile = path.join(d, 'f.json');
    const out = path.join(d, 'out', 'data.json');
    writeFileSync(inFile, JSON.stringify(file('a', [{ ...emptyState, message: 'mail jane@example.com' }])));
    const r = run(['merge', '--out', out, '--label', 'app-a', '--date', '2026-11-08', '--groups', 'Board', inFile]);
    expect(r.code).toBe(2);
    expect(existsSync(out)).toBe(false);
  });
});

describe('re-run comparison (FR-009)', () => {
  const declined = { ...emptyState, rule: 'no-aria-label', anchor: 'SaveButton', message: 'Button has no label' };
  const fixedLater = { ...emptyState, rule: 'contrast', anchor: 'Header', message: 'Low contrast' };
  const first = () => {
    const s = sitting([file('a', [emptyState, declined, fixedLater])]);
    const byRule = (r: string) => s.findings.find((f: { rule: string }) => f.rule === r).fingerprint;
    decide(s, { fingerprint: byRule('no-aria-label'), decision: 'not-needed', by: 'owner', reason: 'icon button has a tooltip' });
    decide(s, { fingerprint: byRule('missing-empty-state'), decision: 'keep', by: 'owner' });
    decide(s, { fingerprint: byRule('contrast'), decision: 'keep', by: 'owner' });
    return s;
  };

  it('marks new, fixed, still open and previously declined', () => {
    const added = { ...emptyState, rule: 'missing-loading-state', anchor: 'BoardPage', message: 'No spinner' };
    const second = sitting([file('a', [{ ...emptyState, line: 300 }, declined, added])], '2026-11-20');
    const { data, counts } = compare(first(), second);
    expect(counts).toEqual({ new: 1, stillOpen: 1, fixed: 1, previouslyDeclined: 1, resurfaced: 0 });
    const status = (r: string) => data.findings.find((f: { rule: string }) => f.rule === r).status;
    expect(status('missing-loading-state')).toBe('new');
    expect(status('missing-empty-state')).toBe('still-open');
    expect(status('contrast')).toBe('fixed');
    expect(status('no-aria-label')).toBe('previously-declined');
  });

  it('keeps a declined finding quiet while its evidence is unchanged, and brings it back when it changes', () => {
    const same = compare(first(), sitting([file('a', [declined])], '2026-11-20')).data.findings[0];
    expect(same.resurface).toBe(false);
    expect(same.decision).toBe('not-needed');
    expect(same.reason).toBe('icon button has a tooltip');

    const changed = compare(first(), sitting([file('a', [{ ...declined, snippet: '<button onClick={save} />' }])], '2026-11-20')).data.findings[0];
    expect(changed.resurface).toBe(true);
    expect(changed.decision).toBeNull();
    expect(changed.previous.reason).toBe('icon button has a tooltip');
  });
});

describe('check and close (FR-007)', () => {
  it('blocks close while a finding has no decision', () => {
    const s = sitting([file('a', [emptyState])]);
    const r = check(s);
    expect(r.closable).toBe(false);
    expect(r.undecided).toEqual([s.findings[0].fingerprint]);
  });

  it('refuses a decline with no reason, and records date and who decided', () => {
    const s = sitting([file('a', [emptyState])]);
    expect(() => decide(s, { fingerprint: s.findings[0].fingerprint, decision: 'not-needed', by: 'owner' })).toThrow(/reason/);
    const f = decide(s, { fingerprint: s.findings[0].fingerprint, decision: 'parked', by: 'owner', now: new Date('2026-11-08T12:00:00Z') });
    expect(f.decidedAt).toBe('2026-11-08T12:00:00.000Z');
    expect(f.decidedBy).toBe('owner');
    expect(check(s).closable).toBe(true);
  });

  it('close CLI exits 2 and leaves the sitting open when a finding is undecided', () => {
    const d = tmpDir();
    const p = path.join(d, 'data.json');
    writeFileSync(p, JSON.stringify(sitting([file('a', [emptyState])])));
    expect(run(['close', p]).code).toBe(2);
    expect(JSON.parse(readFileSync(p, 'utf8')).sittingClosed).toBe(false);
  });
});

describe('cross-app pass (FR-012)', () => {
  it('proposes a rule found in two or more apps, by label, and not a rule found in one', () => {
    const a = buildSitting({ label: 'app-a', date: '2026-11-08', groups, files: [file('wxConversionParity', [emptyState, { ...emptyState, rule: 'only-here' }])] });
    const b = buildSitting({ label: 'app-b', date: '2026-11-08', groups, files: [file('wxConversionParity', [{ ...emptyState, path: 'other/File.tsx' }])] });
    const { proposals } = crossApp([{ label: 'app-a', data: a }, { label: 'app-b', data: b }]);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({ analyzer: 'wxConversionParity', rule: 'missing-empty-state', apps: ['app-a', 'app-b'] });
  });

  it('never writes into the apps it reads', () => {
    const d = tmpDir();
    const pa = path.join(d, 'a.json');
    const pb = path.join(d, 'b.json');
    writeFileSync(pa, JSON.stringify(sitting([file('a', [emptyState])])));
    writeFileSync(pb, JSON.stringify(sitting([file('a', [emptyState])])));
    const before = [readFileSync(pa, 'utf8'), readFileSync(pb, 'utf8')];
    const r = run(['cross-app', '--app', `app-a=${pa}`, '--app', `app-b=${pb}`]);
    expect(r.code).toBe(0);
    expect([readFileSync(pa, 'utf8'), readFileSync(pb, 'utf8')]).toEqual(before);
  });
});
// [SCOPE 156 / T019] END
