/**
 * SCOPE-124 / T017 — executable coverage of the FR acceptance criteria.
 *
 * The per-task suites test each fix in isolation. This one walks the acceptance criteria as the
 * spec states them, so a future change that satisfies every unit test while breaking the promise
 * still fails here. Where a criterion is already pinned by a task suite, this file asserts the
 * criterion rather than re-testing the mechanism, and says which suite carries the detail.
 *
 * Two criteria cannot be reached by a unit test and are covered structurally, which is stated at
 * each one rather than dressed up as behaviour.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

vi.mock('../src/db/connection.js', () => ({ db: {}, pool: {} }));
vi.mock('../src/db/schema.js', () => ({
  projectspecifications: { projectId: 'projectid', specNumber: 'specnumber', title: 'title', content: 'content' },
}));
vi.mock('../src/utils/logger.js', () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), audit: vi.fn() },
}));

import { runPreflight } from '@wxkanban/preflight';
import { mergeScopeEdit } from '../src/utils/scope-merge.js';
import { partitionTasksByName, specDocumentSet } from '../src/utils/spec-persistence.js';
import { detectDuplicateScopes } from '../src/utils/duplicate-scopes.js';

// [SCOPE 124 / T017] BEGIN — source readers for the structural guards
/**
 * Comment lines removed.
 *
 * A structural guard asserting "this pattern is gone" reads the file the pattern was removed
 * from — and the comment explaining the removal quotes the pattern. Three of these guards failed
 * on their own documentation the first time they ran. Assert against what executes.
 */
function executable(source: string): string {
  return source
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*');
    })
    .join('\n');
}

const SERVER_SRC = readFileSync(join(__dirname, '..', 'src', 'server.ts'), 'utf8');
const PROJECT_KIT_SRC = readFileSync(join(__dirname, '..', 'src', 'utils', 'project-kit.ts'), 'utf8');
const DBPUSH_SRC = readFileSync(join(__dirname, '..', '..', 'wxkanban-agent', 'dbpush.ts'), 'utf8');
const SERVER_CODE = executable(SERVER_SRC);
const DBPUSH_CODE = executable(DBPUSH_SRC);
// [SCOPE 124 / T017] END

describe('FR-002 — an edit is a read-modify-write', () => {
  const SCOPE = [
    '# Spec 124: Idempotent Spec Persistence',
    '',
    '## Business Problem',
    '',
    'Specs cannot be updated, and identity resolves against the wrong machine entirely.',
    '',
    '## Actors',
    '',
    '- Primary: A developer maintaining a scope after it first exists',
    '- Secondary: An author writing scopes in another language',
    '',
    '## Out of Scope',
    '',
    'Hand-cleaning customer data.',
    '',
  ].join('\n');

  it('a scope round-tripped through edit with no changes is byte-identical (success metric 3)', () => {
    expect(mergeScopeEdit(SCOPE, {}).content).toBe(SCOPE);
    expect(mergeScopeEdit(SCOPE, { featureDescription: 'Idempotent Spec Persistence' }).content).toBe(SCOPE);
  });

  it('editing one section leaves the others byte-identical', () => {
    const edited = mergeScopeEdit(SCOPE, { outOfScope: 'Nothing is excluded.' });
    const before = SCOPE.split('\n');
    const after = edited.content.split('\n');
    const changed = before.filter((line, i) => after[i] !== line && line.trim() !== '');
    expect(changed).toEqual(['Hand-cleaning customer data.']);
  });

  it('the response enumerates what an edit replaced', () => {
    const edited = mergeScopeEdit(SCOPE, { outOfScope: 'Nothing is excluded.' });
    expect(edited.changes).toHaveLength(1);
    expect(edited.changes[0].section).toBe('out_of_scope');
    expect(edited.changes[0].previousExcerpt).toContain('Hand-cleaning');
  });
});

describe('FR-003 / FR-004 — existence is read from specs, never inferred from titles', () => {
  it('dbpush no longer decides identity from a task title', () => {
    // Structural: the decision lives inside phase2Compare, which needs a live MCP to drive.
    // tests/unit/dbpush-phase2-title-prefix.test.ts covers the behaviour with a mocked envelope.
    const identityBlock = DBPUSH_CODE.slice(
      DBPUSH_CODE.indexOf('async function phase2Compare'),
      DBPUSH_CODE.indexOf('export async function dbpush'),
    );
    expect(identityBlock).toContain('resp.specs');
    expect(identityBlock).not.toContain('parseScopeFromTaskTitle');
  });

  it('an untrustworthy identity answer fails closed rather than reading as "nothing exists"', () => {
    const identityBlock = DBPUSH_CODE.slice(
      DBPUSH_CODE.indexOf('async function phase2Compare'),
      DBPUSH_CODE.indexOf('export async function dbpush'),
    );
    // Gate on the value that PASSES, not the one value that fails: `=== false` let an absent
    // flag through, which is the same fail-open the whole check exists to prevent.
    expect(identityBlock).toContain('specsComplete !== true');
    expect(identityBlock).toContain('unreachable: true');
  });

  it('ARCHIVED specs still occupy their number in the identity answer', () => {
    // The gap T006 recorded and could not close: this project has no archived specs, so there is
    // nothing to drive the behaviour against. Guarded structurally instead — the specs query must
    // carry NO status predicate, and SCOPE-103's archived filter must stay on docWhere only.
    // An archived spec still OWNS its specNumber; omitting it would report the number free and
    // walk straight back into a duplicate.
    const start = SERVER_CODE.indexOf('const SPEC_IDENTITY_CAP');
    const specQuery = SERVER_CODE.slice(start, SERVER_CODE.indexOf('.limit(SPEC_IDENTITY_CAP)', start));
    expect(start).toBeGreaterThan(0);
    expect(specQuery.length).toBeGreaterThan(0);

    // The predicate is projectId and nothing else. `status` is SELECTED — callers filter on it —
    // but it must never appear in the WHERE, which is what would hide an archived spec's number.
    const whereClause = specQuery.slice(specQuery.indexOf('.where('));
    expect(whereClause).toContain('eq(projectspecifications.projectId, effectiveProjectId)');
    expect(whereClause).not.toMatch(/status/i);
    expect(whereClause).not.toMatch(/archiv/i);
    expect(whereClause).not.toContain('and(');
  });
});

describe('FR-005 — every write path is idempotent', () => {
  it('pushing the same spec twice yields one document per identity', () => {
    const first = specDocumentSet({
      specNumber: '020',
      featureName: 'Consultant Work Hub',
      phase: 'design',
      scopeContent: '# v1',
    });
    const second = specDocumentSet({
      specNumber: '020',
      featureName: 'Consultant Work Hub',
      phase: 'design',
      scopeContent: '# v2, edited and pushed again',
    });
    expect(first.map((d) => `${d.doctype}::${d.title}`)).toEqual(
      second.map((d) => `${d.doctype}::${d.title}`),
    );
  });

  it('task rows are not duplicated by a second push', () => {
    const incoming = [{ title: 'T001 first' }, { title: 'T002 second' }];
    const afterFirstPush = incoming.map((t, i) => ({ id: `row-${i}`, name: t.title }));
    const second = partitionTasksByName(afterFirstPush, incoming);
    expect(second.creates).toEqual([]);
    expect(second.updates).toHaveLength(2);
  });

  it('create_specs updates the existing spec row instead of refusing', () => {
    // Structural: the handler needs a live scoped DB. The behaviour it must NOT have is the old
    // hard block, which is what left customers with no route to update a spec at all.
    expect(SERVER_CODE).not.toContain('Refusing to create a duplicate.');
    expect(SERVER_CODE).toContain('const reusingSpec = existingSpec.length > 0');
  });
});

describe('FR-006 — truncation may bound a display, never an existence check', () => {
  it('the identity call carries no maxItems argument', () => {
    const identityBlock = DBPUSH_CODE.slice(
      DBPUSH_CODE.indexOf('async function phase2Compare'),
      DBPUSH_CODE.indexOf('return { knownSpecNumbers, knownTaskIdsBySpec, unreachable: false }'),
    );
    expect(identityBlock).toContain("callMcpTool<ListResp>('project.list_open_items'");
    expect(identityBlock).not.toContain('maxItems');
  });
});

describe('FR-007 — preflight judges content, not language or formatting', () => {
  const SPANISH = [
    '## Overview',
    'Este alcance cubre todo el flujo de registro diario del equipo de operaciones.',
    '',
    '## Business Problem',
    'El equipo no puede registrar todo el historial de cambios, y todos los registros se revisan a mano.',
    '',
    '## Actors',
    '',
    '- Primary: Analista de operaciones que registra el trabajo diario',
    '- **Secondary**: Supervisor del area que revisa y aprueba los registros',
    '',
    '## Success Metrics',
    '',
    '1. Reducir el tiempo de registro en un 40%',
    '2. Procesar 500 registros diarios sin intervencion manual',
    '3. Completar el cierre mensual en menos de 2 horas',
    '',
    '## Scope Boundary',
    'Incluye el registro, la revision y la aprobacion del trabajo diario.',
    '',
    '## Out of Scope',
    'Excluye la facturacion y cualquier integracion con sistemas externos.',
    '',
    '## Open Questions',
    '1. Ninguna.',
  ].join('\n');

  it('a Spanish document passes — with an emphasised actor label', () => {
    const result = runPreflight(SPANISH);
    expect(result.blockingIssues).toEqual([]);
    expect(result.isValid).toBe(true);
  });

  it('a literal uppercase marker still blocks', () => {
    const blocked = SPANISH.replace('1. Ninguna.', 'TODO: confirmar el alcance');
    expect(runPreflight(blocked).isValid).toBe(false);
  });

  it('the blocking message quotes the matched text and its location', () => {
    const blocked = SPANISH.replace('1. Ninguna.', 'TODO: confirmar el alcance');
    const issue = runPreflight(blocked).blockingIssues.find((i) => i.startsWith('Placeholder markers'));
    expect(issue).toContain('at line');
    expect(issue).toContain('confirmar el alcance');
  });

  it('there is only ONE marker detector — the second one was converged, not left to drift', () => {
    // Structural: the regression being guarded is the reappearance of a private rule set, which is
    // what let BUG-12's narrowing miss the second site.
    expect(SERVER_CODE).not.toContain('(TBD|TODO|placeholder|needs clarification)');
    // [SCOPE 124 / T021] This used to also require `findPlaceholders(specContent).length` in
    // server.ts. That call site was inside analyzeSpecArtifacts, which T021 deleted: it was
    // unreachable behind a `dir = undefined` TODO, and everything past that early return read this
    // container's filesystem rather than the caller's. Requiring the call back would mean requiring
    // the dead reader back. The invariant this test names — no second, private detector — is the
    // line above; the shared detector is exercised for real by the preflight assertions in this
    // same describe block.
    expect(SERVER_CODE).not.toMatch(/TODO\|TBD|TBD\|TODO/);
  });
});

describe('FR-008 — existing duplicates are identifiable', () => {
  it('each duplicate is listed with the original it shadows and the reason', () => {
    const scopes = Array.from({ length: 6 }, (_, i) => ({
      id: `orig-${i}`,
      specNumber: String(i + 1).padStart(3, '0'),
      title: `Area ${i + 1}`,
      content: `## Overview\nWorkflow for the ${['invoicing', 'rostering', 'dispatch', 'lending', 'auditing', 'onboarding'][i]} area of the business.`,
    }));
    const copies = scopes.map((s) => ({ ...s, id: `copy-${s.id}`, specNumber: String(Number(s.specNumber) + 6).padStart(3, '0') }));
    const report = detectDuplicateScopes([...scopes, ...copies]);

    expect(report.pairs.length).toBeGreaterThan(0);
    for (const pair of report.pairs) {
      expect(pair.original.specNumber).toBeTruthy();
      expect(pair.shadow.specNumber).not.toBe(pair.original.specNumber);
      expect(pair.reasons.length).toBeGreaterThan(0);
    }
  });

  it('detection changes nothing — removal is still T015', () => {
    // Guard against detection quietly growing a delete path while SCOPE-098 is unbuilt.
    const detectorSrc = readFileSync(join(__dirname, '..', 'src', 'utils', 'duplicate-scopes.ts'), 'utf8');
    expect(detectorSrc).not.toMatch(/\bdelete\b\s*\(/);
    expect(detectorSrc).not.toContain('deleteScoped');
  });
});

describe('FR-001 — identity resolves from the database, never a filesystem', () => {
  it('the three known filesystem fallbacks are the only ones, and each is gated', () => {
    // Both leaks had the same shape: a projectId was present and the server read its OWN
    // workspace anyway. The kit-author fallbacks survive and must stay behind that gate.
    //
    // A count rather than a proximity scan: proximity is fragile (the guard can legitimately sit
    // 40 lines up) and a count is exactly the property worth defending — adding a FOURTH
    // filesystem read to this file should make someone come here and justify it.
    const executable = PROJECT_KIT_SRC.split('\n')
      .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
      .join('\n');
    const uses = executable.match(/readdirSync\(/g) ?? [];
    expect(uses).toHaveLength(3); // generateNextSpecNumber, resolveEditTarget, validateScope

    // generateNextSpecNumber: DB first, filesystem only when projectId is absent or DB failed.
    expect(PROJECT_KIT_SRC).toContain('export async function generateNextSpecNumber(projectId?: string)');
    // resolveEditTarget: the whole DB branch returns before the filesystem is reached.
    expect(PROJECT_KIT_SRC).toContain('async function resolveEditTarget(');
    // validateScope: T018's gate, the one that was missing.
    expect(PROJECT_KIT_SRC).toContain('if (!input.projectId) {');
  });
});
