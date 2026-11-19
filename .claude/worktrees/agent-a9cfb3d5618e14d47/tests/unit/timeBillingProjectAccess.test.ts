// SPEC-005 / T023, T024 — billable-project resolver and cross-tenant isolation (FR-002, FR-014).
// The db client is mocked; nothing opens a connection (the local .env points at production).
// The mock records every SQL text it is given, so the tests can assert WHICH tables a call
// reads and writes — the isolation promise of FR-014 is "never write the client's row".
import { describe, it, expect, vi, beforeEach } from "vitest";

const selectQueue: unknown[][] = [];
const executeQueue: unknown[][] = [];
const executed: string[] = [];
const writes: Array<{ op: "insert" | "update"; table: string; values: Record<string, unknown> }> = [];

// [SCOPE 005 / T024] BEGIN — mock helpers: read the table name and SQL text the resolver produces
function tableName(t: unknown): string {
  const sym = Object.getOwnPropertySymbols(t as object).find((s) => String(s) === "Symbol(drizzle:Name)");
  return sym ? String((t as Record<symbol, unknown>)[sym]) : "unknown";
}

function sqlText(q: unknown): string {
  const chunks = (q as { queryChunks?: unknown[] }).queryChunks ?? [];
  return chunks
    .map((c) => {
      if (typeof c === "string") return c;
      const v = (c as { value?: unknown }).value;
      if (Array.isArray(v)) return v.join("");
      if (c && typeof c === "object" && "queryChunks" in c) return sqlText(c);
      return "?";
    })
    .join("");
}
// [SCOPE 005 / T024] END

vi.mock("../../src/db/client.js", () => {
  const thenable = (rows: () => unknown[]): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    for (const m of ["from", "where", "limit", "orderBy", "leftJoin", "innerJoin"]) c[m] = () => c;
    c.then = (resolve: (v: unknown[]) => void) => resolve(rows());
    return c;
  };
  return {
    db: {
      select: () => thenable(() => selectQueue.shift() ?? []),
      execute: async (q: unknown) => {
        executed.push(sqlText(q));
        return { rows: executeQueue.shift() ?? [] };
      },
      update: (t: unknown) => ({
        set: (values: Record<string, unknown>) => {
          writes.push({ op: "update", table: tableName(t), values });
          return { where: () => Promise.resolve([]) };
        },
      }),
      insert: (t: unknown) => ({
        values: (values: Record<string, unknown>) => {
          writes.push({ op: "insert", table: tableName(t), values });
          return { onConflictDoUpdate: () => Promise.resolve([]) };
        },
      }),
    },
  };
});

import { TimeBillingProjectAccess, type BillableProject } from "../../src/server/services/TimeBillingProjectAccess.js";

// [SCOPE 005 / T023] BEGIN — unit tests for the billable-project resolver
const ME = "co-consultant";
const CLIENT = "co-client";

const engagedRow = (over: Record<string, unknown> = {}) => ({
  id: "p-client",
  name: "Client app",
  clientcompanyid: CLIENT,
  clientname: "Acme Inc",
  billed: null,
  storedcustomerid: null,
  hourlyrate: null,
  resourcerate: null,
  ...over,
});
const myCustomers = [
  { id: "cust-acme", name: "Acme", clientcompanyid: CLIENT },
  { id: "cust-other", name: "Other", clientcompanyid: null },
];

beforeEach(() => {
  selectQueue.length = 0;
  executeQueue.length = 0;
  executed.length = 0;
  writes.length = 0;
});

describe("TimeBillingProjectAccess.resolve (FR-002, FR-014)", () => {
  it("an own project resolves from companyprojects without touching engagements", async () => {
    selectQueue.push([{ id: "p-own", name: "Own", billed: true, customerid: "cust-acme", hourlyrate: "175.00", resourcerate: null }]);
    const p = await TimeBillingProjectAccess.resolve(ME, "p-own");
    expect(p).toMatchObject({ id: "p-own", engaged: false, billed: true, hourlyrate: "175.00" });
    expect(executed).toHaveLength(0);
  });

  it("an engaged client project resolves with the client's name and the pre-filled Customer", async () => {
    selectQueue.push([], myCustomers); // not own; then the caller's Customers
    executeQueue.push([engagedRow()]);
    const p = await TimeBillingProjectAccess.resolve(ME, "p-client");
    expect(p).toMatchObject({ id: "p-client", engaged: true, clientname: "Acme Inc", billed: false, customerid: "cust-acme", customername: "Acme" });
  });

  it("the engagement test requires a live, non-ended engagement of THIS company with a live assignment", async () => {
    selectQueue.push([]);
    executeQueue.push([]);
    await expect(TimeBillingProjectAccess.resolve(ME, "p-x")).rejects.toMatchObject({ statusCode: 404 });
    const q = executed[0] ?? "";
    expect(q).toContain("e.consultingcompanyid =");
    expect(q).toContain("e.clientcompanyid = p.companyid");
    expect(q).toContain("e.state <> 'ended'");
    expect(q).toContain("ea.removedat IS NULL");
    expect(q).toContain("pb.companyid =");
  });
});
// [SCOPE 005 / T023] END

// [SCOPE 005 / T024] BEGIN — cross-tenant isolation for engaged client projects
describe("cross-tenant isolation (FR-014, FR-013)", () => {
  it("another company's project with no live engagement is 404 — never 403, so ids reveal nothing", async () => {
    selectQueue.push([]);
    executeQueue.push([]);
    await expect(TimeBillingProjectAccess.resolve(ME, "p-stranger")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("a stored Customer that is not the caller's is ignored, not shown", async () => {
    selectQueue.push([], myCustomers);
    executeQueue.push([engagedRow({ storedcustomerid: "cust-of-someone-else" })]);
    const p = await TimeBillingProjectAccess.resolve(ME, "p-client");
    expect(p.customerid).toBe("cust-acme"); // falls back to the caller's linked Customer
    expect(p.customername).toBe("Acme");
  });

  const project: BillableProject = {
    id: "p-client", name: "Client app", engaged: true, clientname: "Acme Inc",
    billed: false, customerid: "cust-acme", customername: "Acme", hourlyrate: null, resourcerate: null,
  };

  it("ticking an engaged project writes projectbillings only — never the client's companyprojects row", async () => {
    selectQueue.push([]); // no billing row yet
    await TimeBillingProjectAccess.upsertEngaged(ME, "u-admin", project, { billed: true });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ op: "insert", table: "projectbillings" });
    expect(writes[0]?.values).toMatchObject({ companyid: ME, projectid: "p-client", billed: true, customerid: "cust-acme" });
    expect(writes.some((w) => w.table === "companyprojects")).toBe(false);
  });

  it("setting a Customer of another company is refused (404) and writes nothing", async () => {
    selectQueue.push([]); // the Customer lookup scoped to the caller finds nothing
    await expect(
      TimeBillingProjectAccess.upsertEngaged(ME, "u-admin", project, { customerid: "cust-of-someone-else" }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(writes).toHaveLength(0);
  });

  it("an existing billing row is updated in place, scoped to the caller", async () => {
    selectQueue.push([{ id: "pb1", customerid: "cust-acme" }]);
    await TimeBillingProjectAccess.upsertEngaged(ME, "u-admin", project, { hourlyrate: "200.00" });
    expect(writes).toEqual([{ op: "update", table: "projectbillings", values: expect.objectContaining({ hourlyrate: "200.00", updatedbyid: "u-admin" }) }]);
  });

  it("upsertEngaged refuses an own project (that flag lives on companyprojects)", async () => {
    await expect(TimeBillingProjectAccess.upsertEngaged(ME, "u", { ...project, engaged: false }, { billed: true })).rejects.toThrow();
    expect(writes).toHaveLength(0);
  });

  it("billedProjectIds unions own and engaged billed projects for the Customer, without duplicates", async () => {
    selectQueue.push([{ id: "p-own" }], [{ id: "p-client" }, { id: "p-own" }]);
    expect(await TimeBillingProjectAccess.billedProjectIds(ME, "cust-acme")).toEqual(["p-own", "p-client"]);
  });

  it("list returns own projects first, then engaged ones, each marked", async () => {
    selectQueue.push(myCustomers, [{ id: "p-own", name: "Own", billed: false, customerid: null, hourlyrate: null, resourcerate: null }]);
    executeQueue.push([engagedRow({ billed: true })]);
    const all = await TimeBillingProjectAccess.list(ME);
    expect(all.map((p) => [p.id, p.engaged])).toEqual([["p-own", false], ["p-client", true]]);
    expect(all[1]).toMatchObject({ billed: true, customerid: "cust-acme", clientname: "Acme Inc" });
  });
});
// [SCOPE 005 / T024] END
