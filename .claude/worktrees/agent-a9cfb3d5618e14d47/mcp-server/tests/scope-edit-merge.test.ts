/**
 * SCOPE-124 / T002 (FR-002) — an edit is a read-modify-write.
 *
 * `buildscope --edit` rebuilt the whole document from the caller's arguments, so every field they
 * did not supply came back as the generator's default. Two field reports describe the same thing:
 * a blank re-interview (ff0eb155) and an empty shell (a02e6ec5).
 *
 * The acceptance criteria are byte-level, and so are these tests: editing one section must leave
 * every other byte identical, and a no-change round-trip must return the input unchanged.
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

/** A hand-written scope: headings for everything, plus prose the generator cannot represent. */
const HANDWRITTEN = [
  '# Spec 124: Idempotent Spec Persistence',
  '',
  '**Spec Number**: 124',
  '**Status**: `draft`',
  '',
  '## Overview',
  '',
  'Eight reports from five projects describe a spec that cannot be updated. They are one defect:',
  'spec identity is inferred rather than read from the record that owns it.',
  '',
  '## Business Problem',
  '',
  'Specs cannot be updated, and the identity of the spec being updated resolves against the wrong',
  'machine entirely.',
  '',
  '## Actors',
  '',
  '- Primary: A developer maintaining a scope after it first exists',
  '- Secondary: An author writing scopes in a language other than English',
  '',
  '## Success Metrics',
  '',
  '1. 0 specs created by a second dbpush run on an unchanged project',
  '2. 0 cross-project identity resolutions across 2 projects at the same number',
  '3. 100% byte-identical round trip through edit',
  '',
  '## Scope Boundary',
  '',
  'Resolve spec identity from the database everywhere it is currently inferred.',
  '',
  '## Out of Scope',
  '',
  'Hand-cleaning customer data. The buildscope interview itself.',
  '',
  '## A Section The Generator Has No Concept Of',
  '',
  'This prose exists only because a human wrote it, and it must survive every edit.',
  '',
  '## Notes',
  '',
  '- Integration context: aligns with the numbering correction already made.',
  '- Constraints and risks: production has no migration ledger.',
  '',
  '## Open Questions',
  '',
  '1. How the listing tool exposes spec identity.',
  '',
].join('\n');

/** A generated scope: Core Design table instead of an Actors section, Notes bullets, no headings. */
const GENERATED = [
  '# Spec 077: Automated scope analysis',
  '',
  '**Spec Number**: 077',
  '**Status**: `draft`',
  '',
  '## Overview',
  'Automated scope analysis gives wxKanban a clearly defined business workflow.',
  '',
  '### Core Design',
  '',
  '| Element | Value |',
  '| --- | --- |',
  '| **Primary Actor** | Primary user |',
  '| **Secondary Actors** | Stakeholders, supporting users |',
  '| **Key Value** | Faster review |',
  '| **Scope Boundary** | Include the first working iteration. |',
  '',
  '',
  '## Success Criteria',
  '',
  '1. Users can complete the primary workflow without manual workarounds.',
  '2. The feature reduces execution time by a measurable amount.',
  '3. Stakeholders can verify outcomes through clear acceptance criteria.',
  '',
  '## Constraints',
  '',
  '- MUST deliver only the behavior described within the scope boundary.',
  '- MUST keep user-visible outcomes aligned with the measurable success criteria.',
  '',
  '## Notes',
  '',
  '- Integration context: aligns with the existing wxKanban workflow.',
  '- Constraints and risks: no additional delivery constraints were identified.',
  '',
].join('\n');

// [SCOPE 124 / T002] BEGIN — byte-level comparison helpers
/** Line numbers whose text differs between two documents. */
function changedLines(before: string, after: string): number[] {
  const a = before.split('\n');
  const b = after.split('\n');
  const changed: number[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) changed.push(i);
  }
  return changed;
}

/** Every line of `before` still present, in order, in `after`. */
function preservesAllLines(before: string, after: string, except: string[] = []): boolean {
  const kept = before.split('\n').filter((line) => !except.includes(line));
  const afterLines = after.split('\n');
  let cursor = 0;
  for (const line of kept) {
    const found = afterLines.indexOf(line, cursor);
    if (found === -1) return false;
    cursor = found + 1;
  }
  return true;
}
// [SCOPE 124 / T002] END

beforeEach(() => {
  specRows = [];
});

describe('SCOPE-124 T002 — mergeScopeEdit preserves what it was not asked to change', () => {
  it('returns the input byte-identical when no fields are supplied', () => {
    const result = mergeScopeEdit(HANDWRITTEN, {});
    expect(result.content).toBe(HANDWRITTEN);
    expect(result.replacedSections).toEqual([]);
  });

  it('is byte-identical when the description round-trips unchanged', () => {
    const result = mergeScopeEdit(HANDWRITTEN, {
      featureDescription: 'Idempotent Spec Persistence',
    });
    expect(result.content).toBe(HANDWRITTEN);
    expect(result.replacedSections).toEqual([]);
  });

  it('editing one section leaves every other line byte-identical', () => {
    const result = mergeScopeEdit(HANDWRITTEN, {
      businessProblem: 'A rewritten business problem, and nothing else.',
    });

    // The Business Problem body occupied two lines; the replacement occupies one.
    expect(result.replacedSections).toEqual(['business_problem']);
    expect(result.content).toContain('A rewritten business problem, and nothing else.');

    // Everything the edit did not own survives, including the hand-written section.
    expect(result.content).toContain('## A Section The Generator Has No Concept Of');
    expect(result.content).toContain('This prose exists only because a human wrote it');
    expect(result.content).toContain('- Primary: A developer maintaining a scope after it first exists');
    expect(result.content).toContain('1. 0 specs created by a second dbpush run on an unchanged project');
    expect(result.content).toContain('- Constraints and risks: production has no migration ledger.');
    expect(
      preservesAllLines(HANDWRITTEN, result.content, [
        'Specs cannot be updated, and the identity of the spec being updated resolves against the wrong',
        'machine entirely.',
      ]),
    ).toBe(true);
  });

  // [SCOPE 135 / T013] FR-011 — `title` is the only field that retitles. An edit's featureDescription
  // describes the change (ff0eb155 passed "four surgical edits"), so it must leave the H1 alone.
  it('changes only the title line when only the title changes', () => {
    const result = mergeScopeEdit(HANDWRITTEN, { title: 'A Different Title' });
    expect(changedLines(HANDWRITTEN, result.content)).toEqual([0]);
    expect(result.content.split('\n')[0]).toBe('# Spec 124: A Different Title');
    expect(result.replacedSections).toEqual(['title']);
  });

  it('never retitles from a featureDescription that describes the change', () => {
    const result = mergeScopeEdit(HANDWRITTEN, { featureDescription: 'Apply four surgical edits to the actors' });
    expect(result.content).toBe(HANDWRITTEN);
    expect(result.replacedSections).toEqual([]);
  });

  it('retitles the "# Scope NNN:" and "# SCOPE-NNN:" heading forms too', () => {
    const scopeForm = HANDWRITTEN.replace('# Spec 124: Idempotent Spec Persistence', '# SCOPE-124: Idempotent Spec Persistence');
    expect(mergeScopeEdit(scopeForm, { title: 'Renamed' }).content.split('\n')[0]).toBe('# SCOPE-124: Renamed');
    const newForm = HANDWRITTEN.replace('# Spec 124: Idempotent Spec Persistence', '# Scope 124: Idempotent Spec Persistence');
    expect(mergeScopeEdit(newForm, { title: 'Renamed' }).content.split('\n')[0]).toBe('# Scope 124: Renamed');
  });

  it('replaces the Primary actor line in place, leaving the Secondary line alone', () => {
    const result = mergeScopeEdit(HANDWRITTEN, { primaryActor: 'A release engineer' });
    const changed = changedLines(HANDWRITTEN, result.content);
    expect(changed).toHaveLength(1);
    expect(result.content.split('\n')[changed[0]]).toBe('- Primary: A release engineer');
    expect(result.content).toContain('- Secondary: An author writing scopes in a language other than English');
  });

  it('replaces the metric list wholesale without touching neighbouring sections', () => {
    const result = mergeScopeEdit(HANDWRITTEN, {
      successMetrics: ['0 duplicate documents per doctype', '1 spec row after two pushes'],
    });
    expect(result.content).toContain('1. 0 duplicate documents per doctype');
    expect(result.content).toContain('2. 1 spec row after two pushes');
    expect(result.content).not.toContain('100% byte-identical round trip through edit');
    expect(result.content).toContain('## Scope Boundary');
    expect(result.content).toContain('Resolve spec identity from the database everywhere it is currently inferred.');
  });

  it('preserves CRLF line endings', () => {
    const crlf = HANDWRITTEN.replace(/\n/g, '\r\n');
    const untouched = mergeScopeEdit(crlf, {});
    expect(untouched.content).toBe(crlf);

    const edited = mergeScopeEdit(crlf, { outOfScope: 'Nothing is out of scope.' });
    expect(edited.content).toContain('\r\n');
    expect(edited.content).not.toMatch(/[^\r]\n/);
  });

  it('does not swallow a ### subsection nested inside the section being replaced', () => {
    // Regression, found by T003's reporting: a Business-Problem edit displaced 8 lines instead of
    // 1, because the section body was bounded the way preflight bounds it for SCORING — stopping
    // only at `##`, reading straight through `### Core Design`. In a generated scope that table
    // sits inside `## Overview`, so an edit to the prose above it destroyed the whole table.
    const nested = [
      '# Spec 077: Automated scope analysis',
      '',
      '## Business Problem',
      '',
      'The original problem statement.',
      '',
      '### Core Design',
      '',
      '| Element | Value |',
      '| --- | --- |',
      '| **Primary Actor** | Primary user |',
      '',
      '## Out of Scope',
      '',
      'Nothing yet.',
      '',
    ].join('\n');

    const result = mergeScopeEdit(nested, { businessProblem: 'A replacement problem statement.' });

    expect(result.content).toContain('### Core Design');
    expect(result.content).toContain('| **Primary Actor** | Primary user |');
    expect(result.content).toContain('A replacement problem statement.');
    expect(result.content).not.toContain('The original problem statement.');
    expect(result.content).toContain('## Out of Scope');
    expect(result.changes[0].previousLines).toBe(1);
  });

  it('creates a missing section rather than overwriting a neighbour', () => {
    const withoutBusinessProblem = HANDWRITTEN.replace(
      /## Business Problem\n\nSpecs cannot be updated, and the identity of the spec being updated resolves against the wrong\nmachine entirely.\n\n/,
      '',
    );
    expect(withoutBusinessProblem).not.toContain('## Business Problem');

    const result = mergeScopeEdit(withoutBusinessProblem, { businessProblem: 'Newly stated problem.' });
    expect(result.createdSections).toContain('business_problem');
    expect(result.content).toContain('## Business Problem');
    expect(result.content).toContain('Newly stated problem.');
    // The Overview it falls back to for scoring is NOT repurposed.
    expect(result.content).toContain('Eight reports from five projects describe a spec that cannot be updated.');
  });
});

describe('SCOPE-124 T002 — generated scopes edit through the Core Design table', () => {
  it('updates the Primary Actor table cell, not a new Actors section', () => {
    const result = mergeScopeEdit(GENERATED, { primaryActor: 'A consultant' });
    expect(result.content).toContain('| **Primary Actor** | A consultant |');
    expect(result.content).not.toContain('## Actors');
    expect(changedLines(GENERATED, result.content)).toHaveLength(1);
  });

  it('updates the Scope Boundary table cell when no heading exists', () => {
    const result = mergeScopeEdit(GENERATED, { scopeBoundary: 'Only the first iteration.' });
    expect(result.content).toContain('| **Scope Boundary** | Only the first iteration. |');
    expect(changedLines(GENERATED, result.content)).toHaveLength(1);
  });

  it('writes constraints to the Notes bullet, never over the ## Constraints MUST list', () => {
    const result = mergeScopeEdit(GENERATED, { constraintsAndRisks: 'The database has no ledger.' });
    expect(result.content).toContain('- Constraints and risks: The database has no ledger.');
    expect(result.content).toContain('- MUST deliver only the behavior described within the scope boundary.');
    expect(changedLines(GENERATED, result.content)).toHaveLength(1);
  });

  it('replaces Success Criteria when that is the heading in use', () => {
    const result = mergeScopeEdit(GENERATED, { successMetrics: ['One measurable thing'] });
    expect(result.content).toContain('## Success Criteria');
    expect(result.content).toContain('1. One measurable thing');
    expect(result.content).not.toContain('2. The feature reduces execution time by a measurable amount.');
  });
});

describe('SCOPE-124 T002 — buildScope edit path reads before it writes', () => {
  it('returns the existing document unchanged when an edit supplies no new fields', async () => {
    specRows = [{ title: 'Idempotent Spec Persistence', content: HANDWRITTEN }];

    const result = await buildScope({
      featureDescription: 'Idempotent Spec Persistence',
      projectId: PROJECT,
      editSpecNumber: '124',
    });

    // [SCOPE 124 / T020] `draft_updated`: an edit returns a merged draft, it does not update
    // anything stored — nothing is written until the caller writes it and pushes.
    expect(result.status).toBe('draft_updated');
    expect(result.scopeContent).toBe(HANDWRITTEN);
    expect(result.message).toContain('unchanged');
  });

  it('does not send an edit back through the guided interview (ff0eb155)', async () => {
    specRows = [{ title: 'Idempotent Spec Persistence', content: HANDWRITTEN }];

    // One field supplied, six "missing" — exactly the shape that used to trigger a re-interview.
    const result = await buildScope({
      featureDescription: 'Idempotent Spec Persistence',
      projectId: PROJECT,
      editSpecNumber: '124',
      businessProblem: 'A rewritten business problem, and nothing else.',
    });

    expect(result.status).not.toBe('draft_interview');
    // [SCOPE 124 / T020] `draft_updated`: an edit returns a merged draft, it does not update
    // anything stored — nothing is written until the caller writes it and pushes.
    expect(result.status).toBe('draft_updated');
    expect(result.scopeContent).toBeDefined();
    expect(result.scopeContent).toContain('A rewritten business problem, and nothing else.');
    // and the sections it was not asked to touch are still there
    expect(result.scopeContent).toContain('## A Section The Generator Has No Concept Of');
    expect(result.scopeContent).toContain('- Secondary: An author writing scopes in a language other than English');
  });

  it('never returns an empty shell for an edit (a02e6ec5)', async () => {
    specRows = [{ title: 'Idempotent Spec Persistence', content: HANDWRITTEN }];

    const result = await buildScope({
      featureDescription: 'Idempotent Spec Persistence',
      projectId: PROJECT,
      editSpecNumber: '124',
      primaryActor: 'A release engineer',
    });

    // The generator's defaults are the tell-tale of a regenerated shell.
    expect(result.scopeContent).not.toContain('Define the business value and outcome for this scope.');
    expect(result.scopeContent).not.toContain('Stakeholders, supporting users');
    expect(result.scopeContent).not.toContain('[NEEDS CLARIFICATION]');
    expect(result.scopeContent).toContain('- Primary: A release engineer');
  });
});
