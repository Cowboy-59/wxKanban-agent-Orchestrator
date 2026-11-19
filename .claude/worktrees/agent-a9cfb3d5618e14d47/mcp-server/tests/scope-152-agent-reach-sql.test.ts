// SPEC-152 (SCOPE-132 Amendment F) T007, review fix 2026-10-29 — the per-call reach check reads only
// the Project called, and compares uuid to uuid so the companyid and engagement indexes are used.
import { describe, expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { findInAgentReach, isDeviceLive, loadReachFacts } from '../src/utils/agent-reach.js';

// [SCOPE 152 / T007] BEGIN — reach SQL tests
const dialect = new PgDialect();
const USER = '0192f0a0-0000-7000-8000-0000000000aa';
const COMPANY = '0192f0a0-0000-7000-8000-0000000000cc';
const P1 = '0192f0a0-0000-7000-8000-000000000001';

function fakeDb(replies: unknown[][]) {
  const queries: { sql: string; params: unknown[] }[] = [];
  return {
    queries,
    db: {
      execute: async (q: SQL) => {
        const r = dialect.sqlToQuery(q);
        queries.push({ sql: r.sql.replace(/\s+/g, ' '), params: r.params });
        return { rows: replies.shift() ?? [] };
      },
    },
  };
}

const person = { id: USER, companyid: COMPANY, usertype: 'ADMIN', active: true };
const ownProject = { id: P1, name: 'Alpha', companyid: COMPANY, companyname: 'Own Co', allowremote: true, currentphase: 'DEV' };

describe('agent reach SQL', () => {
  it('the per-call check narrows every query to the one Project', async () => {
    const { db, queries } = fakeDb([[person], [ownProject], [], [], []]);
    const reached = await findInAgentReach(db, USER, P1);

    expect(reached).toMatchObject({ projectId: P1, via: 'own', companyName: 'Own Co' });
    // person, own projects, memberships, engagements, sub-assignments
    expect(queries).toHaveLength(5);
    for (const q of queries.slice(1, 4)) expect(q.params).toContain(P1);
    expect(queries[1].sql).toContain('p.id = $');
    expect(queries[3].sql).toContain('a.projectid = $');
  });

  it('compares uuid to uuid, never a column cast to text', async () => {
    const { db, queries } = fakeDb([[person], [], [], [], []]);
    await loadReachFacts(db, USER);
    for (const q of queries) expect(q.sql).not.toMatch(/::text\s*=/);
    expect(queries[1].sql).toContain('JOIN companies c ON c.id = p.companyid');
    expect(queries[3].sql).toContain('e.consultingcompanyid = $');
  });

  // [SCOPE 152 / T018] projectphases.assigneduserid is varchar(100): `varchar = uuid` has no
  // operator in Postgres (42883), which took the hosted MCP down on 2026-10-30.
  it('compares the varchar phase assignee as text, not uuid', async () => {
    const { db, queries } = fakeDb([[person], [], [], [], []]);
    await loadReachFacts(db, USER, P1);
    expect(queries[2].sql).toMatch(/ph\.assigneduserid = \$\d+ AND/);
    expect(queries[2].sql).not.toMatch(/ph\.assigneduserid = \$\d+::uuid/);
  });

  it('without a Project it reads the whole reach', async () => {
    const { db, queries } = fakeDb([[person], [], [], [], []]);
    await loadReachFacts(db, USER);
    for (const q of queries.slice(1)) expect(q.params).not.toContain(P1);
  });

  it('a malformed Project id reads nothing', async () => {
    const { db, queries } = fakeDb([]);
    expect(await findInAgentReach(db, USER, 'not-a-uuid')).toBeNull();
    expect(queries).toHaveLength(0);
  });
});
// [SCOPE 152 / T007] END

// [SCOPE 152 / T015] BEGIN — the per-call device check refuses a deactivated company (FR-065, FR-070)
describe('isDeviceLive and the device company', () => {
  const DEVICE = '0192f0a0-0000-7000-8000-0000000000dd';

  it('requires the company the device was issued in to be active', async () => {
    const { db, queries } = fakeDb([[{ id: DEVICE }]]);
    expect(await isDeviceLive(db, DEVICE, USER)).toBe(true);
    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toContain('JOIN companies c ON c.id = d.companyid');
    expect(queries[0].sql).toContain('c.activeflag = true');
  });

  it('no row (revoked, person gone, or company deactivated) is one refusal', async () => {
    const { db } = fakeDb([[]]);
    expect(await isDeviceLive(db, DEVICE, USER)).toBe(false);
  });
});
// [SCOPE 152 / T015] END
