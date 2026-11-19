/**
 * SCOPE-124 / T008 (FR-005) — every write path is idempotent.
 *
 * `create_specs` inserted a new row per call, so a re-pushed spec grew a parallel set instead of
 * being updated (975ada4a). Production held 115 excess document rows across 83
 * (project, title, doctype) groups when this was written — six copies each of one scope's spec,
 * plan and lifecycle documents.
 *
 * The document titles are a contract between TWO writers: this server, and `dbpush`'s
 * pushExistingSpec, which upserts the same rows through project.upsert_document keyed on
 * (doctype, title). BUG-2026-07-18 was those two disagreeing about a title. The last describe
 * block pins that agreement against the kit's actual source, so it cannot drift again silently.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  specDocumentSet,
  specDocumentTitle,
  planDocumentTitle,
  lifecycleDocumentTitle,
  partitionTasksByName,
  type IncomingTask,
} from '../src/utils/spec-persistence.js';

const FEATURE = 'Consultant Work Hub';
const SPEC_NUMBER = '020';

describe('SCOPE-124 T008 — document identity is stable across pushes', () => {
  it('produces the same title and doctype for the same spec every time', () => {
    const first = specDocumentSet({
      specNumber: SPEC_NUMBER,
      featureName: FEATURE,
      phase: 'design',
      scopeContent: '# original',
    });
    const second = specDocumentSet({
      specNumber: SPEC_NUMBER,
      featureName: FEATURE,
      phase: 'design',
      scopeContent: '# edited, pushed again',
    });

    expect(first.map((d) => [d.doctype, d.title])).toEqual(second.map((d) => [d.doctype, d.title]));
    // Content differs; identity does not. That is what makes the second write an update.
    expect(first[0].content).not.toBe(second[0].content);
  });

  it('keeps spec and plan distinct even though they share doctype "specs"', () => {
    const docs = specDocumentSet({
      specNumber: SPEC_NUMBER,
      featureName: FEATURE,
      phase: 'design',
      scopeContent: '# scope',
    });
    const specs = docs.filter((d) => d.doctype === 'specs');
    expect(specs).toHaveLength(2);
    expect(new Set(specs.map((d) => d.title)).size).toBe(2);
  });

  it('omits the lifecycle document unless lifecycle content was generated', () => {
    const without = specDocumentSet({
      specNumber: SPEC_NUMBER,
      featureName: FEATURE,
      phase: 'design',
      scopeContent: '# scope',
    });
    expect(without.map((d) => d.kind)).toEqual(['spec', 'plan']);

    const with_ = specDocumentSet({
      specNumber: SPEC_NUMBER,
      featureName: FEATURE,
      phase: 'design',
      scopeContent: '# scope',
      lifecycleContent: '{}',
    });
    expect(with_.map((d) => d.kind)).toEqual(['spec', 'plan', 'lifecycle']);
    expect(with_[2].doctype).toBe('lifecycle');
  });

  it('every document in the set is uniquely addressed by (doctype, title)', () => {
    const docs = specDocumentSet({
      specNumber: SPEC_NUMBER,
      featureName: FEATURE,
      phase: 'design',
      scopeContent: '# scope',
      lifecycleContent: '{}',
    });
    const keys = docs.map((d) => `${d.doctype}::${d.title}`);
    expect(new Set(keys).size).toBe(docs.length);
  });
});

describe('SCOPE-124 T008 — task rows are matched, not duplicated', () => {
  const incoming: IncomingTask[] = [
    { title: 'T001 Resolve identity from the database', status: 'done' },
    { title: 'T002 Make an edit a read-modify-write', status: 'todo' },
    { title: 'T008 Make every write path idempotent', status: 'todo' },
  ];

  it('creates every task on a first push', () => {
    const plan = partitionTasksByName([], incoming);
    expect(plan.creates).toHaveLength(3);
    expect(plan.updates).toHaveLength(0);
  });

  it('creates nothing on an identical second push', () => {
    const existing = incoming.map((t, i) => ({ id: `row-${i}`, name: t.title }));
    const plan = partitionTasksByName(existing, incoming);
    expect(plan.creates).toHaveLength(0);
    expect(plan.updates).toHaveLength(3);
    expect(plan.updates.map((u) => u.existing.id)).toEqual(['row-0', 'row-1', 'row-2']);
  });

  it('creates only the genuinely new task when a spec gains one', () => {
    const existing = [
      { id: 'row-0', name: 'T001 Resolve identity from the database' },
      { id: 'row-1', name: 'T002 Make an edit a read-modify-write' },
    ];
    const plan = partitionTasksByName(existing, incoming);
    expect(plan.creates.map((t) => t.title)).toEqual(['T008 Make every write path idempotent']);
    expect(plan.updates).toHaveLength(2);
  });

  it('does not create two rows when one push repeats a title', () => {
    const repeated: IncomingTask[] = [
      { title: 'T001 Resolve identity from the database' },
      { title: 'T001 Resolve identity from the database' },
    ];
    const plan = partitionTasksByName([], repeated);
    expect(plan.creates).toHaveLength(1);
    expect(plan.duplicateTitles).toEqual(['T001 Resolve identity from the database']);
  });

  it('collapses onto the first row when the DB already holds a duplicate pair', () => {
    // One project already carries duplicates. A re-push must adopt one of them, never add a third.
    const existing = [
      { id: 'row-a', name: 'T001 Resolve identity from the database' },
      { id: 'row-b', name: 'T001 Resolve identity from the database' },
    ];
    const plan = partitionTasksByName(existing, [{ title: 'T001 Resolve identity from the database' }]);
    expect(plan.creates).toHaveLength(0);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].existing.id).toBe('row-a');
  });

  it('matches exactly — near-miss titles are different tasks, not the same one', () => {
    const existing = [{ id: 'row-0', name: 'T002 Make an edit a read-modify-write' }];
    const plan = partitionTasksByName(existing, [
      { title: 't002 make an edit a read-modify-write' },
      { title: ' T002 Make an edit a read-modify-write ' },
    ]);
    expect(plan.updates).toHaveLength(0);
    expect(plan.creates).toHaveLength(2);
  });
});

describe('SCOPE-124 T008 — the kit and the server agree on document titles', () => {
  // dbpush builds these titles itself and upserts by (doctype, title). If either side changes the
  // format, dbpush stops matching create_specs' rows and builds a parallel set — BUG-2026-07-18.
  const dbpushSource = readFileSync(
    join(__dirname, '..', '..', 'wxkanban-agent', 'dbpush.ts'),
    'utf8',
  );

  it('dbpush still builds the spec title as `Spec {N}: {name}`', () => {
    expect(dbpushSource).toContain('`Spec ${artifact.scope}: ${featureName}`');
    expect(specDocumentTitle('020', 'Consultant Work Hub')).toBe('Spec 020: Consultant Work Hub');
  });

  it('dbpush still builds the plan title as `Plan: {name}`', () => {
    expect(dbpushSource).toContain('`Plan: ${featureName}`');
    expect(planDocumentTitle('Consultant Work Hub')).toBe('Plan: Consultant Work Hub');
  });

  it('dbpush still upserts these documents under doctype "specs"', () => {
    expect(dbpushSource).toContain("doctype: 'specs'");
    const docs = specDocumentSet({
      specNumber: '020',
      featureName: 'Consultant Work Hub',
      phase: 'design',
      scopeContent: '# scope',
    });
    expect(docs.filter((d) => d.kind === 'spec' || d.kind === 'plan').every((d) => d.doctype === 'specs')).toBe(true);
  });

  it('lifecycle stays server-owned — dbpush opts out of generating it and never titles one', () => {
    expect(dbpushSource).toContain('generateLifecycle: false');
    expect(dbpushSource).not.toContain('`Lifecycle: ${');
    expect(lifecycleDocumentTitle('Consultant Work Hub')).toBe('Lifecycle: Consultant Work Hub');
  });
});
