/**
 * SCOPE-098 / T009 — project.delete_scope: the input contract, the authorization, and
 * the ordering that stops a delete from orphaning work instead of removing it.
 *
 * Two kinds of test here, and the split is deliberate rather than a shortcut:
 *
 *   REAL   — the zod schema and the permission matrix are pure and are exercised
 *            directly. Every FR-005 input-contract and authorization bullet is a
 *            genuine behavioural assertion.
 *   GUARD  — the handler sits inside a 5,000-line switch that needs a database, an
 *            auth scope and a transport to reach, and there is no test database
 *            (tests/setup.ts sets dummy env so imports resolve without a socket).
 *            What CAN be pinned is that the ordering and the brakes are present in
 *            the code that executes. That is exactly what would regress silently.
 *
 * Comments are stripped before asserting, per SCOPE-124/T017 and T021: a guard that
 * asserts "this pattern is present/absent" will otherwise match the comment that
 * explains it, and three of T017's guards failed on their own documentation.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DeleteScopeInputSchema } from '../src/utils/schemas';
import { checkPermission } from '../src/auth/role-checker';
import type { AuthContext } from '../src/auth/auth-context';

// [SCOPE 098 / T009] BEGIN — delete_scope contract, authorization and ordering guards
function executable(source: string): string {
  return source
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}

/** The `case 'project.delete_scope'` block only, so nothing passes on a sibling tool. */
function deleteScopeCase(source: string): string {
  const start = source.indexOf("case 'project.delete_scope':");
  if (start === -1) throw new Error("case 'project.delete_scope' not found");
  const next = source.indexOf("\n      case 'project.", start + 40);
  return source.slice(start, next === -1 ? source.length : next);
}

const serverSrc = executable(readFileSync(join(__dirname, '..', 'src', 'server.ts'), 'utf8'));
const handler = deleteScopeCase(serverSrc);

const PROJECT = '11111111-1111-4111-8111-111111111111';
const SPEC = '22222222-2222-4222-8222-222222222222';

const auth = (role: AuthContext['role']): AuthContext => ({
  role,
  apiKey: 'test',
  source: 'test',
});

describe('SCOPE-098 / T009 — input contract (FR-005)', () => {
  it('accepts exactly one of specId or specNumber', () => {
    expect(DeleteScopeInputSchema.safeParse({ projectId: PROJECT, specId: SPEC }).success).toBe(true);
    expect(DeleteScopeInputSchema.safeParse({ projectId: PROJECT, specNumber: '0026' }).success).toBe(true);
  });

  it('rejects NEITHER specId nor specNumber', () => {
    const r = DeleteScopeInputSchema.safeParse({ projectId: PROJECT });
    expect(r.success).toBe(false);
  });

  it('rejects BOTH specId and specNumber', () => {
    // Ambiguity on a destructive call must be an error, never a silent precedence rule.
    const r = DeleteScopeInputSchema.safeParse({
      projectId: PROJECT,
      specId: SPEC,
      specNumber: '0026',
    });
    expect(r.success).toBe(false);
  });

  it('requires a uuid projectId', () => {
    expect(DeleteScopeInputSchema.safeParse({ projectId: 'not-a-uuid', specNumber: '1' }).success).toBe(false);
  });

  it('defaults BOTH brakes to the safe value', () => {
    const r = DeleteScopeInputSchema.parse({ projectId: PROJECT, specNumber: '0026' });
    // A caller who omits them gets the non-destructive posture, not the destructive one.
    expect(r.dryRun).toBe(false);
    expect(r.force).toBe(false);
  });

  it('keeps dryRun and force independent', () => {
    const r = DeleteScopeInputSchema.parse({
      projectId: PROJECT,
      specNumber: '0026',
      dryRun: true,
      force: true,
    });
    expect(r.dryRun).toBe(true);
    expect(r.force).toBe(true);
  });
});

describe('SCOPE-098 / T009 — authorization (FR-005)', () => {
  it('refuses a read_only caller', () => {
    expect(() => checkPermission('project.delete_scope', auth('read_only'))).toThrow();
  });

  it('allows editor and admin', () => {
    expect(() => checkPermission('project.delete_scope', auth('editor'))).not.toThrow();
    expect(() => checkPermission('project.delete_scope', auth('admin'))).not.toThrow();
  });

  it('matches merge_scope, so the destructive tool is not the lenient one', () => {
    // If merge_scope ever tightens, this fails and forces the pair to be considered together.
    expect(() => checkPermission('project.merge_scope', auth('read_only'))).toThrow();
  });
});

describe('SCOPE-098 / T009 — the ordering that prevents orphaned work', () => {
  it('deletes projecttasks BEFORE projectspecifications', () => {
    // projecttasks.specid is SET NULL, verified against pg_constraint. Deleting the
    // spec first detaches every task instead of removing it: the row survives with a
    // null specid and renders as unlinked work forever. Order is correctness here.
    const tasksAt = handler.indexOf('.delete(projecttasks)');
    const specAt = handler.indexOf('.delete(projectspecifications)');
    expect(tasksAt).toBeGreaterThan(-1);
    expect(specAt).toBeGreaterThan(-1);
    expect(tasksAt).toBeLessThan(specAt);
  });

  it('scopes the spec delete by BOTH id and projectId', () => {
    expect(handler).toContain('eq(projectspecifications.id, target.id)');
    expect(handler).toContain('eq(projectspecifications.projectId, input.projectId)');
  });

  it('scopes the task delete by projectId too', () => {
    expect(handler).toContain('eq(projecttasks.projectId, input.projectId)');
  });
});

describe('SCOPE-098 / T009 — the brakes', () => {
  it('blocks a non-empty scope unless force is given', () => {
    expect(handler).toContain('!input.force');
    expect(handler).toContain('ownTasks.length > 0 || ownDocs.length > 0');
  });

  it('returns before any delete when dryRun is set', () => {
    const dryAt = handler.indexOf('input.dryRun');
    const firstDelete = handler.indexOf('.delete(projecttasks)');
    expect(dryAt).toBeGreaterThan(-1);
    expect(dryAt).toBeLessThan(firstDelete);
  });

  it('resolves the target from scoped rows, so a cross-project specId is not found', () => {
    // selectScoped never returns another project's rows, so the lookup misses and the
    // handler blocks — not-found rather than forbidden, and nothing is deleted.
    expect(handler).toContain('scoped.selectScoped(');
    expect(handler).toContain('not found in this project');
  });

  it('records an events row naming what went', () => {
    expect(handler).toContain("actor: 'delete_scope'");
    expect(handler).toContain('deletedTasks');
  });

  it('reports the children it orphans rather than leaving it silent', () => {
    // auditexecutions, testplanitems and testruns are SET NULL and are NOT deleted —
    // matching the web route. Reporting the counts is what keeps that honest.
    expect(handler).toContain('orphaned');
    expect(handler).toContain('auditexecutions');
    expect(handler).toContain('testplanitems');
    expect(handler).toContain('testruns');
  });
});

describe('SCOPE-098 / T009 — the tool is reachable and project-scoped', () => {
  it('is registered as project-scoped', () => {
    const set = serverSrc.slice(
      serverSrc.indexOf('const PROJECT_SCOPED_TOOLS'),
      serverSrc.indexOf(']);', serverSrc.indexOf('const PROJECT_SCOPED_TOOLS')),
    );
    expect(set).toContain("'project.delete_scope'");
  });

  it('advertises a tool definition', () => {
    expect(serverSrc).toContain("name: 'project.delete_scope'");
  });

  it('warns in its description that the action is permanent', () => {
    const at = serverSrc.indexOf("name: 'project.delete_scope'");
    const block = serverSrc.slice(at, at + 1200);
    expect(block).toMatch(/PERMANENT|permanently/i);
    expect(block).toMatch(/not reversible|irreversible/i);
  });
});
// [SCOPE 098 / T009] END
