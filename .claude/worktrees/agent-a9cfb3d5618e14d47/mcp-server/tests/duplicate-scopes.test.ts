/**
 * SCOPE-124 / T014 (FR-008) — detect the duplicates already written.
 *
 * The shape being detected is real: one project carries 29 shadow scopes numbered 030–058 copying
 * 001–029. The tests below build that shape and assert it is found as ONE cluster, not 29
 * unrelated coincidences — and, just as importantly, that a project of ordinary consecutive scopes
 * produces nothing.
 */
import { describe, it, expect } from 'vitest';
import {
  detectDuplicateScopes,
  formatDuplicateReport,
  type ScopeRecord,
} from '../src/utils/duplicate-scopes.js';

// [SCOPE 124 / T014] BEGIN — fixtures
/**
 * Distinct scope bodies, with genuinely different vocabulary per topic.
 *
 * The first version of this fixture varied only the number in an otherwise identical sentence —
 * which made every "different" scope score a perfect similarity match and turned the healthy
 * project into a false-positive farm. Real projects do not repeat one sentence 12 times, and a
 * fixture that does tests nothing. (It did surface a real weakness in `tokenize`, which was
 * discarding short numeric tokens; fixed there.)
 */
const TOPICS = [
  'invoicing customers reconciling payments against outstanding balances',
  'onboarding new employees issuing equipment and granting system access',
  'scheduling maintenance windows for factory machinery and logging downtime',
  'tracking laboratory samples through collection analysis and disposal',
  'managing freight shipments customs paperwork and delivery confirmation',
  'publishing marketing campaigns approving copy and measuring engagement',
  'handling insurance claims from first notice through settlement',
  'rostering nursing shifts across wards while honouring leave requests',
  'cataloguing museum artefacts their provenance and conservation history',
  'processing grant applications through review panels and disbursement',
  'monitoring irrigation across orchards and scheduling water allocation',
  'administering examinations marking scripts and releasing results',
  'coordinating fleet vehicle servicing licensing and driver assignment',
  'recording livestock movements vaccinations and veterinary inspections',
  'operating a lending library reservations renewals and overdue notices',
  'planning conference sessions speakers rooms and attendee registration',
  'auditing retail stock counts shrinkage investigations and write offs',
  'routing helpdesk tickets by skill queue and escalation policy',
  'reviewing planning applications objections and council determinations',
  'managing rental properties tenancies inspections and bond returns',
  'dispatching emergency crews by proximity availability and equipment',
  'tracking clinical trial participants dosing and adverse event reports',
  'organising volunteer rosters for community food distribution',
  'processing payroll deductions superannuation and leave accrual',
  'certifying electrical installations inspections and compliance notices',
  'managing subscription billing upgrades downgrades and dunning',
  'coordinating film production call sheets locations and equipment hire',
  'operating a boat harbour berth allocation and mooring fees',
  'tracking parliamentary correspondence referrals and ministerial replies',
  'managing apprenticeship placements assessments and employer sign off',
];

function body(seed: number): string {
  const topic = TOPICS[(seed - 1) % TOPICS.length];
  return [
    `# Spec ${seed}: Feature area ${seed}`,
    '',
    '## Overview',
    `This scope covers ${topic}.`,
    '',
    '## Business Problem',
    `The team handles ${topic} by hand today, and nothing records why a decision was made.`,
  ].join('\n');
}

/** 29 originals at 001–029, each shadowed by an identical copy 29 numbers higher. */
function shadowedProject(): ScopeRecord[] {
  const scopes: ScopeRecord[] = [];
  for (let i = 1; i <= 29; i += 1) {
    scopes.push({
      id: `orig-${i}`,
      specNumber: String(i).padStart(3, '0'),
      title: `Feature area ${i}`,
      content: body(i),
      createdAt: new Date(Date.UTC(2026, 0, 1)),
    });
  }
  for (let i = 1; i <= 29; i += 1) {
    scopes.push({
      id: `copy-${i}`,
      specNumber: String(i + 29).padStart(3, '0'),
      title: `Feature area ${i}`,
      content: body(i),
      createdAt: new Date(Date.UTC(2026, 5, 1)),
    });
  }
  return scopes;
}

/** An ordinary project: consecutive numbers, genuinely different scopes. */
function healthyProject(): ScopeRecord[] {
  return Array.from({ length: 12 }, (_, i) => ({
    id: `spec-${i + 1}`,
    specNumber: String(i + 1).padStart(3, '0'),
    title: `Feature area ${i + 1}`,
    content: body(i + 1),
    createdAt: new Date(Date.UTC(2026, 0, i + 1)),
  }));
}
// [SCOPE 124 / T014] END

describe('SCOPE-124 T014 — the reported shape is found', () => {
  it('finds all 29 shadows and recognises them as ONE bulk copy', () => {
    const report = detectDuplicateScopes(shadowedProject());

    expect(report.examined).toBe(58);
    expect(report.pairs).toHaveLength(29);
    expect(report.clusters[0].offset).toBe(29);
    expect(report.clusters[0].pairCount).toBe(29);
  });

  it('names the original each shadow copies, and points removal at the copy', () => {
    const report = detectDuplicateScopes(shadowedProject());
    const pair = report.pairs.find((p) => p.shadow.specNumber === '030');

    expect(pair).toBeDefined();
    expect(pair?.original.specNumber).toBe('001');
    expect(pair?.shadow.id).toBe('copy-1');
    expect(pair?.original.id).toBe('orig-1');
    expect(pair?.numericOffset).toBe(29);
    expect(pair?.confidence).toBe('high');
  });

  it('gives a reason for every pair, including the offset evidence', () => {
    const report = detectDuplicateScopes(shadowedProject());
    for (const pair of report.pairs) {
      expect(pair.reasons.length).toBeGreaterThan(0);
    }
    expect(report.pairs[0].reasons.join(' ')).toContain('content is identical');
    expect(report.pairs[0].reasons.join(' ')).toContain('offset of +29 is shared by 29 pairs');
  });
});

describe('SCOPE-124 T014 — it does not cry wolf', () => {
  it('reports nothing for a project of ordinary consecutive scopes', () => {
    const report = detectDuplicateScopes(healthyProject());
    expect(report.pairs).toEqual([]);
    expect(report.clusters).toEqual([]);
    expect(report.examined).toBe(12);
  });

  it('does not treat two similar-but-distinct scopes as a bulk copy', () => {
    const scopes: ScopeRecord[] = [
      { id: 'a', specNumber: '001', title: 'Intake', content: body(1) },
      { id: 'b', specNumber: '002', title: 'Intake revised', content: `${body(1)}\n\nAdditional section.` },
    ];
    const report = detectDuplicateScopes(scopes);

    // Reported, because they genuinely are near-identical — but with no offset cluster behind it,
    // and the caller is told exactly that.
    expect(report.clusters).toEqual([]);
    if (report.pairs.length > 0) {
      expect(report.pairs[0].confidence).not.toBe('high');
      expect(report.pairs[0].reasons.join(' ')).toContain('no repeated numbering offset');
    }
  });

  it('ignores scopes with no content rather than guessing from numbering', () => {
    const scopes: ScopeRecord[] = [
      { id: 'a', specNumber: '001', title: 'Empty', content: '' },
      { id: 'b', specNumber: '002', title: 'Empty too', content: null },
    ];
    expect(detectDuplicateScopes(scopes).pairs).toEqual([]);
  });

  it('needs three pairs before calling an offset a cluster', () => {
    const scopes: ScopeRecord[] = [
      { id: 'o1', specNumber: '001', title: 'A', content: body(1) },
      { id: 'o2', specNumber: '002', title: 'B', content: body(2) },
      { id: 'c1', specNumber: '011', title: 'A', content: body(1) },
      { id: 'c2', specNumber: '012', title: 'B', content: body(2) },
    ];
    // Two pairs at offset +10 is a coincidence worth reporting, not a bulk copy worth naming.
    expect(detectDuplicateScopes(scopes).clusters).toEqual([]);
  });
});

describe('SCOPE-124 T014 — it states what it is unsure about', () => {
  it('flags a pair whose copy direction contradicts the timestamps', () => {
    const scopes: ScopeRecord[] = [
      {
        id: 'lower',
        specNumber: '001',
        title: 'Intake',
        content: body(1),
        createdAt: new Date(Date.UTC(2026, 6, 1)), // created LATER despite the lower number
      },
      {
        id: 'higher',
        specNumber: '030',
        title: 'Intake',
        content: body(1),
        createdAt: new Date(Date.UTC(2026, 0, 1)),
      },
    ];
    const report = detectDuplicateScopes(scopes);

    expect(report.pairs[0].reasons.join(' ')).toContain('CAUTION');
    expect(report.pairs[0].confidence).not.toBe('high');
  });

  it('warns that a diverged copy may have been edited since', () => {
    const scopes: ScopeRecord[] = [
      { id: 'a', specNumber: '001', title: 'Intake', content: body(1) },
      {
        id: 'b',
        specNumber: '030',
        title: 'Intake',
        content: `${body(1)}\n\nThis copy gained a paragraph after it was made.`,
      },
    ];
    const report = detectDuplicateScopes(scopes);
    expect(report.pairs[0].reasons.join(' ')).toContain('may have been edited since');
  });
});

describe('SCOPE-124 T014 — the report reads as a report', () => {
  it('renders the cluster, the pairs and the fact that nothing was changed', () => {
    const text = formatDuplicateReport(detectDuplicateScopes(shadowedProject()));

    expect(text).toContain('Examined 58 scope(s).');
    expect(text).toContain('offset +29: 29 pairs');
    expect(text).toContain('shadows 001');
    expect(text).toContain('This report changed nothing.');
  });

  it('says so plainly when there is nothing to report', () => {
    const text = formatDuplicateReport(detectDuplicateScopes(healthyProject()));
    expect(text).toContain('Examined 12 scope(s).');
    expect(text).toContain('No duplicate scopes detected.');
  });
});
