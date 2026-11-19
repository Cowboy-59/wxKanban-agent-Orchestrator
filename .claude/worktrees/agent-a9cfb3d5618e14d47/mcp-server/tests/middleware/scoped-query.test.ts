/**
 * Spec 028 / T012 — Scoped-query wrapper unit tests.
 *
 * The wrapper's job is to refuse cross-scope reads/writes. Tests focus on
 * the rejection paths since the happy paths just delegate to Drizzle.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/db/connection.js', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => []),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ returning: vi.fn(async () => [{ id: 'mock' }]) })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({ returning: vi.fn(async () => []) })),
      })),
    })),
  },
}));

const fakeTable = (() => {
  const t = {} as Record<string | symbol, unknown>;
  // Drizzle stores the SQL name on a Symbol whose description includes "Name".
  const sym = Symbol('drizzle:Name');
  t[sym] = 'projecttasks'; // a project-scoped table per PROJECT_SCOPED_TABLES
  t.projectid = { __column: 'projectid' };
  return t as unknown as never;
})();

describe('withScope', () => {
  it('rejects insert when scope is dev-bypass', async () => {
    const { withScope, ScopeViolationError } = await import('../../src/db/scoped-query.js');
    const scoped = withScope({
      tokenId: null,
      customerId: null,
      projectId: null,
      tokenPrefix: null,
      authMode: 'dev-bypass',
    });
    await expect(scoped.insertScoped(fakeTable, { foo: 'bar' })).rejects.toBeInstanceOf(
      ScopeViolationError,
    );
  });

  it('rejects insert when scope has no projectId', async () => {
    const { withScope, ScopeViolationError } = await import('../../src/db/scoped-query.js');
    const scoped = withScope({
      tokenId: 't',
      customerId: 'c',
      projectId: null,
      tokenPrefix: 'wxk',
      authMode: 'token',
    });
    await expect(scoped.insertScoped(fakeTable, {})).rejects.toBeInstanceOf(ScopeViolationError);
  });

  it('rejects insert when caller-supplied projectid disagrees with scope', async () => {
    const { withScope, ScopeViolationError } = await import('../../src/db/scoped-query.js');
    const scoped = withScope({
      tokenId: 't',
      customerId: 'c',
      projectId: 'proj-A',
      tokenPrefix: 'wxk',
      authMode: 'token',
    });
    await expect(
      scoped.insertScoped(fakeTable, { projectid: 'proj-B', body: 'x' }),
    ).rejects.toBeInstanceOf(ScopeViolationError);
  });

  it('allows insert when caller-supplied projectid matches scope', async () => {
    const { withScope } = await import('../../src/db/scoped-query.js');
    const scoped = withScope({
      tokenId: 't',
      customerId: 'c',
      projectId: 'proj-A',
      tokenPrefix: 'wxk',
      authMode: 'token',
    });
    const result = await scoped.insertScoped(fakeTable, { projectid: 'proj-A', body: 'x' });
    expect(result).toEqual([{ id: 'mock' }]);
  });

  it('PROJECT_SCOPED_TABLES contains the expected names', async () => {
    const { PROJECT_SCOPED_TABLES } = await import('../../src/db/scoped-query.js');
    expect(PROJECT_SCOPED_TABLES.has('events')).toBe(true);
    expect(PROJECT_SCOPED_TABLES.has('projecttasks')).toBe(true);
    expect(PROJECT_SCOPED_TABLES.has('mcpapitokens')).toBe(true);
    expect(PROJECT_SCOPED_TABLES.has('mcprequestaudit')).toBe(true);
  });
});
