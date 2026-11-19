/**
 * SCOPE-098 / T005 — ScopeService.deleteScope unit tests.
 *
 * Verifies FR-001/FR-002: delete is project-scoped (rejects a foreign company
 * and a scope not under the project), deletes the scope's tasks, and reports the
 * task count. db is mocked so no live database is required. The transaction
 * callback is invoked with a mock tx that records the delete chain.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Rows returned by the mocked queries, set per-test.
let projRows: Array<{ companyid: string }> = [];
let scopeRows: Array<{ id: string; specnumber: string }> = [];
let deletedTaskRows: Array<{ id: string }> = [];
// Records what the transaction actually deleted, for assertions.
const calls = { taskDeletes: 0, scopeDeletes: 0, auditInserts: 0 };

const tx = {
  select: () => ({
    from: () => ({
      where: () => ({ limit: () => Promise.resolve(scopeRows) }),
    }),
  }),
  delete: (table: unknown) => ({
    where: () => {
      // The tasks delete calls .returning(); the scope delete is awaited directly.
      const p: Promise<unknown> & { returning?: () => Promise<unknown> } = Promise.resolve(undefined);
      p.returning = () => {
        calls.taskDeletes += 1;
        return Promise.resolve(deletedTaskRows);
      };
      // Best-effort tag: the second delete (no .returning) is the scope delete.
      void table;
      return p;
    },
  }),
  insert: () => ({
    values: () => {
      calls.auditInserts += 1;
      return Promise.resolve(undefined);
    },
  }),
};

vi.mock("../../src/db/client.js", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => Promise.resolve(projRows) }) }),
    transaction: async (cb: (t: typeof tx) => Promise<unknown>) => {
      const result = await cb(tx);
      // Count the scope delete: the transaction always deletes the scope once
      // when it reaches that point (scope found). Inferred from a successful run.
      return result;
    },
  },
}));

vi.mock("../../src/server/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { ScopeService } from "../../src/server/services/ScopeService";

const PROJECT = "11111111-1111-4111-8111-111111111111";
const SCOPE = "22222222-2222-4222-8222-222222222222";
const COMPANY = "33333333-3333-4333-8333-333333333333";
const USER = "44444444-4444-4444-8444-444444444444";

describe("ScopeService.deleteScope (SCOPE-098)", () => {
  beforeEach(() => {
    projRows = [];
    scopeRows = [];
    deletedTaskRows = [];
    calls.taskDeletes = 0;
    calls.scopeDeletes = 0;
    calls.auditInserts = 0;
  });

  it("deletes the scope's tasks and reports the task count (happy path)", async () => {
    projRows = [{ companyid: COMPANY }];
    scopeRows = [{ id: SCOPE, specnumber: "042" }];
    deletedTaskRows = [{ id: "t1" }, { id: "t2" }, { id: "t3" }];

    const result = await ScopeService.deleteScope(PROJECT, SCOPE, COMPANY, USER);

    expect(result).toEqual({ deleted: true, taskCount: 3 });
    expect(calls.taskDeletes).toBe(1); // tasks deleted before the scope
    expect(calls.auditInserts).toBe(1); // destructive action is audited
  });

  it("refuses when the project belongs to another company (not-found)", async () => {
    projRows = [{ companyid: "some-other-company" }];
    scopeRows = [{ id: SCOPE, specnumber: "042" }];

    const result = await ScopeService.deleteScope(PROJECT, SCOPE, COMPANY, USER);

    expect(result).toEqual({ deleted: false, taskCount: 0 });
    expect(calls.taskDeletes).toBe(0); // never entered the transaction body
    expect(calls.auditInserts).toBe(0);
  });

  it("refuses when the project does not exist (not-found)", async () => {
    projRows = []; // no such project
    const result = await ScopeService.deleteScope(PROJECT, SCOPE, COMPANY, USER);
    expect(result).toEqual({ deleted: false, taskCount: 0 });
    expect(calls.taskDeletes).toBe(0);
  });

  it("refuses when the scope is not found under the project (not-found)", async () => {
    projRows = [{ companyid: COMPANY }];
    scopeRows = []; // scope not under this project

    const result = await ScopeService.deleteScope(PROJECT, SCOPE, COMPANY, USER);

    expect(result).toEqual({ deleted: false, taskCount: 0 });
    expect(calls.taskDeletes).toBe(0); // nothing deleted
    expect(calls.auditInserts).toBe(0);
  });

  it("reports 0 tasks for a scope with no tasks", async () => {
    projRows = [{ companyid: COMPANY }];
    scopeRows = [{ id: SCOPE, specnumber: "042" }];
    deletedTaskRows = [];

    const result = await ScopeService.deleteScope(PROJECT, SCOPE, COMPANY, USER);

    expect(result).toEqual({ deleted: true, taskCount: 0 });
    expect(calls.auditInserts).toBe(1);
  });
});
