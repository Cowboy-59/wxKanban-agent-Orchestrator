/**
 * SCOPE-124 / T003 (FR-002) — an edit reports what it replaced.
 *
 * T002 made the edit stop destroying sections it was not asked to touch. T003 makes it *say* what
 * it did touch, because "trust me, the rest is fine" is not a contract. The distinction that earns
 * its keep is substantial vs not: overwriting the generator's boilerplate is unremarkable,
 * overwriting a paragraph someone wrote is the blast radius. `substantial` is decided by preflight's
 * own isMeaningfulText, so it means the same thing here as everywhere else in the codebase.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let specRows: Array<{ title: string; content: string | null }> = [];

vi.mock('../src/db/connection.js', () => ({
  db: {
    select: () => ({
      // MODIFIED-BY: [SCOPE 135 / T019] — the stored scope document (projectdocuments) is looked up
      // on every edit; these tests have none, so that table answers with no rows.
      from: (table: { __table?: string }) => ({
        where: () => {
          const rows = table?.__table === 'projectdocuments' ? [] : specRows;
          const result = Promise.resolve(rows) as Promise<unknown> & { limit?: unknown; orderBy?: unknown };
          result.limit = () => Promise.resolve(rows);
          result.orderBy = () => ({ limit: () => Promise.resolve(rows) });
          return result;
        },
      }),
    }),
  },
  pool: {},
}));
vi.mock('../src/db/schema.js', () => ({
  projectspecifications: {
    projectId: 'projectid',
    specNumber: 'specnumber',
    title: 'title',
    content: 'content',
  },
  projectdocuments: { __table: 'projectdocuments', projectId: 'projectid', doctype: 'doctype', title: 'title', content: 'content', updatedAt: 'updatedat' },
}));
vi.mock('../src/utils/logger.js', () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), audit: vi.fn() },
}));

import { mergeScopeEdit } from '../src/utils/scope-merge.js';
import { buildScope } from '../src/utils/project-kit.js';

const PROJECT = 'caec1280-6dda-43a6-a0e1-10a21ccb8045';

// [SCOPE 124 / T003] BEGIN — fixtures: one authored scope, one still carrying generator defaults
/** Real prose in every section — replacing it anywhere is substantial. */
const AUTHORED = [
  '# Spec 124: Idempotent Spec Persistence',
  '',
  '## Business Problem',
  '',
  'Specs cannot be updated, and the identity of the spec being updated resolves against the wrong',
  'machine entirely. Customers with the most specs are hit hardest.',
  '',
  '## Actors',
  '',
  '- Primary: A developer maintaining a scope after it first exists',
  '- Secondary: An author writing scopes in a language other than English',
  '',
  '## Out of Scope',
  '',
  'Hand-cleaning customer data. The buildscope interview itself.',
  '',
  '## Notes',
  '',
  '- Integration context: aligns with the numbering correction already made.',
  '- Constraints and risks: production has no migration ledger.',
  '',
].join('\n');

/** Untouched generator output — the defaults it ships with are NOT substantial content. */
const BOILERPLATE = [
  '# Spec 077: Automated scope analysis',
  '',
  '## Business Problem',
  '',
  'Define the business value and outcome for this scope.',
  '',
  '### Core Design',
  '',
  '| Element | Value |',
  '| --- | --- |',
  '| **Primary Actor** | Primary user |',
  '| **Secondary Actors** | Stakeholders, supporting users |',
  '',
  '## Notes',
  '',
  '- Integration context: Existing systems, workflows, and documents that this scope must align with.',
  '',
].join('\n');
// [SCOPE 124 / T003] END

beforeEach(() => {
  specRows = [];
});

describe('SCOPE-124 T003 — the merge reports each region it changed', () => {
  it('reports nothing when nothing was supplied', () => {
    const result = mergeScopeEdit(AUTHORED, {});
    expect(result.changes).toEqual([]);
  });

  it('reports one change per region, in document order, matching replacedSections', () => {
    const result = mergeScopeEdit(AUTHORED, {
      businessProblem: 'A rewritten problem statement that is long enough to count.',
      outOfScope: 'Nothing is excluded now.',
    });

    expect(result.changes.map((c) => c.section)).toEqual(['business_problem', 'out_of_scope']);
    expect(result.changes.map((c) => c.section)).toEqual(result.replacedSections);
    expect(result.changes.every((c) => c.action === 'replaced')).toBe(true);
  });

  it('measures what it displaced', () => {
    const result = mergeScopeEdit(AUTHORED, {
      businessProblem: 'A rewritten problem statement that is long enough to count.',
    });

    const change = result.changes[0];
    expect(change.previousLines).toBe(2);
    expect(change.previousChars).toBeGreaterThan(100);
    expect(change.previousExcerpt).toContain('Specs cannot be updated');
  });

  it('truncates a long excerpt rather than echoing the whole section back', () => {
    const long = AUTHORED.replace(
      'Hand-cleaning customer data. The buildscope interview itself.',
      'x'.repeat(500),
    );
    const result = mergeScopeEdit(long, { outOfScope: 'Nothing is excluded now.' });

    expect(result.changes[0].previousChars).toBe(500);
    expect(result.changes[0].previousExcerpt).toHaveLength(118); // 117 + the ellipsis
    expect(result.changes[0].previousExcerpt.endsWith('…')).toBe(true);
  });

  it('marks a replacement of authored prose as substantial', () => {
    const result = mergeScopeEdit(AUTHORED, {
      businessProblem: 'A rewritten problem statement that is long enough to count.',
      primaryActor: 'A release engineer',
    });
    expect(result.changes.find((c) => c.section === 'business_problem')?.substantial).toBe(true);
    expect(result.changes.find((c) => c.section === 'actors')?.substantial).toBe(true);
  });

  it('does NOT mark a replacement of generator boilerplate as substantial', () => {
    const result = mergeScopeEdit(BOILERPLATE, {
      businessProblem: 'A real problem statement, written by a person this time.',
      primaryActor: 'A consultant',
      integrationContext: 'Aligns with the existing consultant dashboard.',
    });

    // All three overwrote the generator's own defaults — nothing of value was lost.
    expect(result.changes).toHaveLength(3);
    expect(result.changes.every((c) => c.substantial)).toBe(false);
    expect(result.changes.some((c) => c.substantial)).toBe(false);
  });

  it('never marks a created region as substantial, and records it as created', () => {
    const withoutOutOfScope = AUTHORED.replace(
      /## Out of Scope\n\nHand-cleaning customer data\. The buildscope interview itself\.\n\n/,
      '',
    );
    const result = mergeScopeEdit(withoutOutOfScope, { outOfScope: 'Nothing is excluded.' });

    expect(result.changes[0].action).toBe('created');
    expect(result.changes[0].substantial).toBe(false);
    expect(result.changes[0].previousChars).toBe(0);
    expect(result.changes[0].previousExcerpt).toBe('');
  });

  it('reports a retitle against the old title', () => {
    // [SCOPE 135 / T013] FR-011 — `title`, not featureDescription, retitles an edit.
    const result = mergeScopeEdit(AUTHORED, { title: 'A Different Title' });
    expect(result.changes).toEqual([
      {
        section: 'title',
        action: 'replaced',
        previousLines: 1,
        previousChars: 'Idempotent Spec Persistence'.length,
        previousExcerpt: 'Idempotent Spec Persistence',
        substantial: true,
      },
    ]);
  });
});

describe('SCOPE-124 T003 — buildScope surfaces the blast radius on the response', () => {
  it('returns sectionsChanged on an edit', async () => {
    specRows = [{ title: 'Idempotent Spec Persistence', content: AUTHORED }];

    const result = await buildScope({
      featureDescription: 'Idempotent Spec Persistence',
      projectId: PROJECT,
      editSpecNumber: '124',
      businessProblem: 'A rewritten problem statement that is long enough to count.',
    });

    expect(result.sectionsChanged).toHaveLength(1);
    expect(result.sectionsChanged?.[0].section).toBe('business_problem');
    expect(result.sectionsChanged?.[0].substantial).toBe(true);
  });

  it('names the sections whose existing content was replaced, in the message', async () => {
    specRows = [{ title: 'Idempotent Spec Persistence', content: AUTHORED }];

    const result = await buildScope({
      featureDescription: 'Idempotent Spec Persistence',
      projectId: PROJECT,
      editSpecNumber: '124',
      businessProblem: 'A rewritten problem statement that is long enough to count.',
    });

    expect(result.message).toContain('Existing content was replaced in: business_problem');
    expect(result.message).toContain('All other sections are unchanged');
  });

  it('stays quiet about blast radius when only boilerplate was overwritten', async () => {
    specRows = [{ title: 'Automated scope analysis', content: BOILERPLATE }];

    const result = await buildScope({
      featureDescription: 'Automated scope analysis',
      projectId: PROJECT,
      editSpecNumber: '077',
      businessProblem: 'A real problem statement, written by a person this time.',
    });

    // [SCOPE 124 / T020] 'edited', not 'updated' — the word no longer implies a stored change.
    expect(result.message).toContain('edited: business_problem');
    expect(result.message).not.toContain('Existing content was replaced in');
  });

  it('reports an empty edit as changing nothing at all', async () => {
    specRows = [{ title: 'Idempotent Spec Persistence', content: AUTHORED }];

    const result = await buildScope({
      featureDescription: 'Idempotent Spec Persistence',
      projectId: PROJECT,
      editSpecNumber: '124',
    });

    expect(result.sectionsChanged).toEqual([]);
    expect(result.sectionsCreated).toEqual([]);
    expect(result.scopeContent).toBe(AUTHORED);
  });

  it('no longer claims a create wrote seven sections when it was an edit', async () => {
    specRows = [{ title: 'Idempotent Spec Persistence', content: AUTHORED }];

    const result = await buildScope({
      featureDescription: 'Idempotent Spec Persistence',
      projectId: PROJECT,
      editSpecNumber: '124',
      businessProblem: 'A rewritten problem statement that is long enough to count.',
    });

    expect(result.sectionsCreated).not.toContain('overview');
    expect(result.sectionsCreated).toEqual([]);
  });
});
