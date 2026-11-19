// SPEC-005 / T013 — Customer billing cycle. The db client and project access are mocked; nothing
// here opens a connection (the local .env points at production).
import { describe, it, expect, vi, beforeEach } from "vitest";

const selectQueue: unknown[][] = [];
const updates: Record<string, unknown>[] = [];
const projects: Array<{ id: string; billed: boolean; customerid: string | null }> = [];

vi.mock("../../src/db/client.js", () => {
  const thenable = (rows: () => unknown[]): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    for (const m of ["from", "where", "limit", "orderBy"]) c[m] = () => c;
    c.then = (resolve: (v: unknown[]) => void) => resolve(rows());
    return c;
  };
  return {
    db: {
      select: () => thenable(() => selectQueue.shift() ?? []),
      update: () => ({
        set: (v: Record<string, unknown>) => {
          updates.push(v);
          return { where: () => Promise.resolve([]) };
        },
      }),
    },
  };
});

vi.mock("../../src/server/services/TimeBillingProjectAccess.js", () => ({
  TimeBillingProjectAccess: { list: async () => projects },
}));

import {
  BILLING_CYCLES,
  TimeBillingCustomerService,
  isBillingCycle,
} from "../../src/server/services/TimeBillingCustomerService.js";

// [SCOPE 005 / T013] BEGIN — unit tests for the Customer billing cycle
beforeEach(() => {
  selectQueue.length = 0;
  updates.length = 0;
  projects.length = 0;
});

describe("isBillingCycle (FR-009)", () => {
  it("accepts weekly and biweekly only", () => {
    expect(BILLING_CYCLES).toEqual(["weekly", "biweekly"]);
    expect(isBillingCycle("weekly")).toBe(true);
    expect(isBillingCycle("biweekly")).toBe(true);
    expect(isBillingCycle("monthly")).toBe(false);
    expect(isBillingCycle(null)).toBe(false);
    expect(isBillingCycle(7)).toBe(false);
  });
});

describe("TimeBillingCustomerService.list (FR-009)", () => {
  it("counts only billed projects of that customer, own and engaged, and coerces an unknown cycle", async () => {
    selectQueue.push([
      { id: "c1", name: "Acme", billingcycle: "biweekly" },
      { id: "c2", name: "Zed", billingcycle: "quarterly" },
    ]);
    projects.push(
      { id: "p1", billed: true, customerid: "c1" },
      { id: "p2", billed: true, customerid: "c1" },
      { id: "p3", billed: false, customerid: "c1" },
      { id: "p4", billed: true, customerid: "c2" },
      { id: "p5", billed: true, customerid: null },
    );
    const out = await TimeBillingCustomerService.list("co1");
    expect(out).toEqual([
      { id: "c1", name: "Acme", billingcycle: "biweekly", billedProjects: 2 },
      { id: "c2", name: "Zed", billingcycle: "weekly", billedProjects: 1 },
    ]);
  });
});

describe("TimeBillingCustomerService.setBillingCycle (FR-009)", () => {
  it("updates and returns before/after for the audit record", async () => {
    selectQueue.push([{ name: "Acme", billingcycle: "weekly" }]);
    const out = await TimeBillingCustomerService.setBillingCycle("co1", "c1", "biweekly");
    expect(out).toEqual({ before: "weekly", after: "biweekly", name: "Acme" });
    expect(updates).toHaveLength(1);
    expect(updates[0].billingcycle).toBe("biweekly");
  });

  it("rejects an invalid cycle with 400 and no update", async () => {
    await expect(TimeBillingCustomerService.setBillingCycle("co1", "c1", "monthly")).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(updates).toHaveLength(0);
  });

  it("404 for another company's or an archived customer, with no update", async () => {
    selectQueue.push([]);
    await expect(TimeBillingCustomerService.setBillingCycle("co1", "other", "weekly")).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(updates).toHaveLength(0);
  });
});
// [SCOPE 005 / T013] END
