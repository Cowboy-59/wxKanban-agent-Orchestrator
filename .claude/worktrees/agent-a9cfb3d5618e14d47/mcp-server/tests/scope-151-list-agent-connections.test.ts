// SPEC-151 (SCOPE-132 Amendment D) T005 — project.list_agent_connections: the token decides the reach.
import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

// [SCOPE 152 / T007] A K.A.I.N. token's projects come from agentReach (tested on its own); the name parser stays real.
const reach = vi.hoisted(() => ({ agentReach: vi.fn() }));
vi.mock('../src/utils/agent-reach.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/utils/agent-reach.js')>();
  return { ...actual, agentReach: reach.agentReach };
});

import { handleListAgentConnections } from '../src/tools/agent-connections.js';
import type { ScopedDb } from '../src/db/scoped-query.js';

const dialect = new PgDialect();
const P1 = '0192f0a0-0000-7000-8000-000000000001';
const P2 = '0192f0a0-0000-7000-8000-000000000002';

function fakeScoped(tokenName: string | null, replies: unknown[][], userId: string | null = null) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const scoped = {
    scope: { tokenId: 't1', customerId: null, projectId: P1, tokenPrefix: null, userId, tokenName, authMode: 'token' },
    raw: {
      execute: async (q: SQL) => {
        const rendered = dialect.sqlToQuery(q);
        queries.push({ sql: rendered.sql.replace(/\s+/g, ' '), params: rendered.params });
        return { rows: replies.shift() ?? [] };
      },
    },
  } as unknown as ScopedDb;
  return { scoped, queries };
}

const conn = (projectid: string, live: boolean, extra: Record<string, unknown> = {}) => ({
  projectid,
  id: `c-${projectid.slice(-1)}`,
  agenttag: 'wxKanban',
  machine: 'LAPTOP',
  repo: 'wxKanban',
  kitversion: '1.7.90',
  state: 'working',
  connectedat: new Date('2026-10-28T11:00:00Z'),
  lastseenat: '2026-10-28T11:59:30Z',
  disconnectedat: null,
  endreason: null,
  live,
  ...extra,
});

describe('project.list_agent_connections (FR-062)', () => {
  // MODIFIED-BY: [SCOPE 152 / T007] — a K.A.I.N. token lists its person's reach, across companies
  it("a KAIN token lists its person's reach across companies, rooms filtered to its agent", async () => {
    const DEVICE = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
    reach.agentReach.mockResolvedValue([
      { projectId: P1, projectName: 'Alpha', companyId: 'c-own', companyName: 'Own Co', via: 'own', engagementId: null },
      { projectId: P2, projectName: 'Beta', companyId: 'c-cli', companyName: 'Client Co', via: 'engagement', engagementId: 'e-1' },
    ]);
    const { scoped, queries } = fakeScoped(
      `agent-grant:KAIN:${DEVICE}`,
      [[{ projectid: P1, conversationid: 'conv-1' }], [conn(P1, true)]],
      'user-1',
    );
    const out = await handleListAgentConnections({}, scoped);

    expect(out.scope).toBe('reach');
    expect(reach.agentReach).toHaveBeenCalledWith(scoped.raw, 'user-1');
    expect(queries[0].sql).toContain('r.agentname =');
    expect(queries[0].params).toContain('KAIN');
    expect(out.counts).toEqual({ projects: 2, live: 1 });
    expect(out.projects[1]).toMatchObject({ projectId: P2, companyName: 'Client Co', via: 'engagement' });
    expect(out.projects[0]).toMatchObject({
      projectId: P1,
      projectName: 'Alpha',
      companyName: 'Own Co',
      via: 'own',
      conversationId: 'conv-1',
      live: true,
      connection: { machine: 'LAPTOP', state: 'working', lastSeenAt: '2026-10-28T11:59:30.000Z', connectedAt: '2026-10-28T11:00:00.000Z' },
    });
    expect(out.projects[1]).toMatchObject({ projectId: P2, conversationId: null, live: false, connection: null });
  });

  it('any other token lists its own project only, with no company query', async () => {
    const { scoped, queries } = fakeScoped('project-agent:KAIN', [[{ id: P1, name: 'Alpha' }], [], []]);
    const out = await handleListAgentConnections({}, scoped);
    expect(out.scope).toBe('project');
    expect(queries[0].sql).not.toContain('companyid');
    expect(queries[0].params).toEqual([P1]);
    expect(queries[1].sql).not.toContain('agentname');
    expect(out.projects).toHaveLength(1);
  });

  it('accepts both spellings the server resolver adds, when they are the token project', async () => {
    const { scoped } = fakeScoped('agent-grant:KAIN', [[{ id: P1, name: 'Alpha' }], [], []]);
    const out = await handleListAgentConnections({ projectId: P1, projectid: P1 }, scoped);
    expect(out.projects).toHaveLength(1);
  });

  it("refuses a lowercase projectid that is not the token's", async () => {
    const { scoped, queries } = fakeScoped('agent-grant:KAIN', []);
    await expect(handleListAgentConnections({ projectId: P1, projectid: P2 }, scoped)).rejects.toThrow(/token's own project/);
    expect(queries).toHaveLength(0);
  });

  it("refuses a projectId that is not the token's", async () => {
    const { scoped, queries } = fakeScoped('agent-grant:KAIN', []);
    await expect(handleListAgentConnections({ projectId: P2 }, scoped)).rejects.toThrow(/token's own project/);
    expect(queries).toHaveLength(0);
  });

  it('includeHistory adds closed rows per project, bounded by historyHours', async () => {
    const closed = conn(P1, false, { id: 'old', disconnectedat: '2026-10-28T09:00:00Z', endreason: 'stopped' });
    const { scoped, queries } = fakeScoped('agent-grant:KAIN', [[{ id: P1, name: 'Alpha' }], [], [], [closed]]);
    const out = await handleListAgentConnections({ includeHistory: true, historyHours: 6 }, scoped);
    expect(queries[3].sql).toContain('c.disconnectedat IS NOT NULL');
    expect(queries[3].params).toContain(6);
    expect(out.projects[0].history).toEqual([expect.objectContaining({ connectionId: 'old', endReason: 'stopped', live: false })]);
  });

  it('a company with no allow-remote project returns an empty list and reads nothing else', async () => {
    const { scoped, queries } = fakeScoped('agent-grant:KAIN', [[]]);
    const out = await handleListAgentConnections({}, scoped);
    expect(out.projects).toEqual([]);
    expect(queries).toHaveLength(1);
  });
});
