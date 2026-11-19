/**
 * SCOPE-090 / SPEC-090 — Registration Activation Race
 *
 * Unit tests for the inline reconcile machinery (resyncSubscriptionFromStripe)
 * the registration flow calls, covering FR-001..FR-004:
 *   (a) a paid signup whose Stripe payment succeeded reaches ACTIVE + one audit row
 *   (b) a Stripe error is fail-open (resolves, never throws — so it can't fail registration)
 *   (c) an already-ACTIVE company is a no-op with NO duplicate company_status_history row
 *   (d) an incomplete Stripe subscription does NOT activate the company
 *
 * db + Stripe + email are mocked (same approach as resolveReferredBy.test).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Queue of results for each db.select(...).limit() call, in call order.
let selectResults: unknown[][] = [];
const insertCalls: { table: unknown; values: Record<string, unknown> }[] = [];
const companyUpdates: Record<string, unknown>[] = [];

const selectChain = {
  from: () => selectChain,
  where: () => selectChain,
  orderBy: () => selectChain,
  limit: () => Promise.resolve(selectResults.shift() ?? []),
};

vi.mock("../../src/db/client.js", () => ({
  db: {
    select: () => selectChain,
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: () => {
          // Only record companies updates (the ones that carry subscriptionstatus).
          if (values && "subscriptionstatus" in values) companyUpdates.push(values);
          return Promise.resolve();
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        insertCalls.push({ table, values });
        return Promise.resolve();
      },
    }),
  },
}));

vi.mock("../../src/db/schema/company.js", () => ({ companies: { id: "id", subscriptionstatus: "subscriptionstatus" } }));
vi.mock("../../src/db/schema/companysubscription.js", () => ({ companysubscriptions: { id: "id", companyid: "companyid", createdat: "createdat" } }));
vi.mock("../../src/db/schema/companyStatus.js", () => ({ companyStatusHistory: { __name: "company_status_history" } }));
vi.mock("../../src/db/schema/userprofiles.js", () => ({ userprofiles: {} }));

let stripeStatus = "active";
let stripeThrows = false;
vi.mock("../../src/server/lib/stripe.js", () => ({
  isStripeCcProcessingEnabled: () => true,
  getStripe: () => ({
    subscriptions: {
      retrieve: async () => {
        if (stripeThrows) throw new Error("stripe boom");
        return { status: stripeStatus, items: { data: [{ current_period_end: 1893456000 }] } };
      },
    },
  }),
  createBillingPortalSession: async () => ({ url: "https://portal" }),
}));
vi.mock("../../src/server/lib/email.js", () => ({ sendEmail: async () => true }));
vi.mock("../../src/server/lib/emailTemplates.js", () => ({
  getSubscriptionRestartEmailHTML: () => "", getSubscriptionRestartEmailText: () => "",
}));
vi.mock("../../src/server/lib/logger.js", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { resyncSubscriptionFromStripe } from "../../src/server/services/SubscriptionRecoveryService";

const COMPANY_ID = "019f38d8-0000-7000-8000-000000000001";

function queue(companyStatus: string, subStatus: string) {
  selectResults = [
    [{ name: "Test GmbH", status: companyStatus }],                                  // company lookup
    [{ id: "sub-row-uuid", stripesubscriptionid: "sub_123", status: subStatus }],    // subscription lookup
  ];
}

beforeEach(() => {
  selectResults = [];
  insertCalls.length = 0;
  companyUpdates.length = 0;
  stripeStatus = "active";
  stripeThrows = false;
});

describe("SCOPE-090 inline registration activation (resyncSubscriptionFromStripe)", () => {
  it("(a) activates a paid PENDING signup to ACTIVE and writes exactly one audit row with the inline reason/source", async () => {
    queue("PENDING", "incomplete");
    const res = await resyncSubscriptionFromStripe(COMPANY_ID, {
      reason: "Auto-activate at registration (inline Stripe reconcile)",
      source: "registration-inline",
    });

    expect(res.changed).toBe(true);
    expect(res.toCompanyStatus).toBe("ACTIVE");
    expect(companyUpdates).toEqual([{ subscriptionstatus: "ACTIVE", activeflag: true }]);

    const history = insertCalls.filter((c) => (c.table as { __name?: string }).__name === "company_status_history");
    expect(history).toHaveLength(1);
    expect(history[0].values).toMatchObject({
      previousStatus: "PENDING",
      newStatus: "ACTIVE",
      reason: "Auto-activate at registration (inline Stripe reconcile)",
      changedByType: "SYSADMIN",
      changedBy: null,
      metadata: { stripeStatus: "active", source: "registration-inline" },
    });
  });

  it("(b) is fail-open — a Stripe error resolves (never throws) so registration can't fail", async () => {
    queue("PENDING", "incomplete");
    stripeThrows = true;
    const res = await resyncSubscriptionFromStripe(COMPANY_ID, { source: "registration-inline" });
    expect(res.changed).toBe(false);
    expect(res.note).toBe("stripe_error");
    // no activation, no audit row
    expect(companyUpdates).toHaveLength(0);
    expect(insertCalls).toHaveLength(0);
  });

  it("(c) already-ACTIVE company is a no-op with NO duplicate audit row (webhook won the race)", async () => {
    queue("ACTIVE", "active");
    const res = await resyncSubscriptionFromStripe(COMPANY_ID, { source: "registration-inline" });
    expect(res.changed).toBe(false);
    expect(companyUpdates).toHaveLength(0);
    const history = insertCalls.filter((c) => (c.table as { __name?: string }).__name === "company_status_history");
    expect(history).toHaveLength(0);
  });

  it("(d) an incomplete Stripe subscription does NOT activate the company", async () => {
    queue("PENDING", "incomplete");
    stripeStatus = "incomplete";
    const res = await resyncSubscriptionFromStripe(COMPANY_ID, { source: "registration-inline" });
    expect(res.toCompanyStatus).toBeNull();
    expect(companyUpdates).toHaveLength(0);
    const history = insertCalls.filter((c) => (c.table as { __name?: string }).__name === "company_status_history");
    expect(history).toHaveLength(0);
  });

  it("default (sysadmin) reason/source is preserved when no override is passed", async () => {
    queue("PENDING", "incomplete");
    await resyncSubscriptionFromStripe(COMPANY_ID);
    const history = insertCalls.filter((c) => (c.table as { __name?: string }).__name === "company_status_history");
    expect(history[0].values).toMatchObject({
      reason: "Manual reconcile from Stripe",
      metadata: { stripeStatus: "active", source: "resync" },
    });
  });
});
