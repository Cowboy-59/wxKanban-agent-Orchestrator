/**
 * SCOPE-090 / SPEC-090 — FR-005: no silently-dropped activation events.
 *
 * When handleStripeEvent receives an activation-relevant event (invoice.paid,
 * invoice.payment_succeeded, customer.subscription.created/updated) that resolves
 * to no companysubscriptions row (the registration race — event beat the insert),
 * it MUST emit a structured warn (event type + event/customer/subscription ids +
 * activationRelevant:true) instead of the generic skip log. Non-activation events
 * keep the generic warn.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted: StripeWebhookHandler calls createLogger() at module load (which is
// hoisted above const declarations), so the spies must be hoisted too.
const { warn, info } = vi.hoisted(() => ({ warn: vi.fn(), info: vi.fn() }));

// Every db.select(...).limit() resolves to [] → duplicate check passes AND
// resolveCompanySubscription finds no row (both sub-id and customer-id lookups empty).
const emptyChain = {
  from: () => emptyChain,
  where: () => emptyChain,
  orderBy: () => emptyChain,
  limit: () => Promise.resolve([]),
};

vi.mock("../../src/db/client.js", () => ({
  db: {
    select: () => emptyChain,
    insert: () => ({ values: () => Promise.resolve() }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  },
}));
vi.mock("../../src/db/schema/company.js", () => ({ companies: {} }));
vi.mock("../../src/db/schema/companysubscription.js", () => ({ companysubscriptions: { stripesubscriptionid: "x", stripecustomerid: "y", createdat: "c" } }));
vi.mock("../../src/db/schema/subscriptionbillingevent.js", () => ({ subscriptionbillingevents: { stripeeventid: "e", id: "id" } }));
vi.mock("../../src/db/schema/subscriptionbillinghistory.js", () => ({ subscriptionbillinghistory: {} }));
vi.mock("../../src/db/schema/notification.js", () => ({ notifications: {} }));
vi.mock("../../src/db/schema/userprofiles.js", () => ({ userprofiles: {} }));
vi.mock("../../src/server/lib/logger.js", () => ({ createLogger: () => ({ warn, info, error: vi.fn(), debug: vi.fn() }) }));
vi.mock("../../src/server/lib/stripe.js", () => ({ stripeConfig: {} }));
vi.mock("../../src/server/services/SubscriptionRecoveryService.js", () => ({ sendRestartLink: async () => ({ sent: false }) }));

import { handleStripeEvent } from "../../src/server/services/StripeWebhookHandler";

function invoicePaidEvent(): Record<string, unknown> {
  return {
    id: "evt_activation_1",
    type: "invoice.paid",
    data: { object: { customer: "cus_race", subscription: "sub_race", lines: { data: [] } } },
  };
}

beforeEach(() => {
  warn.mockClear();
  info.mockClear();
});

describe("SCOPE-090 FR-005 — unknown-subscription warn on activation events", () => {
  it("emits a structured activationRelevant warn for invoice.paid with no matching row", async () => {
    await handleStripeEvent(invoicePaidEvent() as never);
    expect(warn).toHaveBeenCalled();
    const call = warn.mock.calls.find((c) => (c[0] as { activationRelevant?: boolean })?.activationRelevant);
    expect(call).toBeDefined();
    expect(call![0]).toMatchObject({
      eventId: "evt_activation_1",
      eventType: "invoice.paid",
      stripeCustomerId: "cus_race",
      activationRelevant: true,
    });
  });

  it("keeps the generic (non-activation) warn for an unrelated event with no row", async () => {
    const ev = { id: "evt_other_1", type: "customer.subscription.deleted", data: { object: { id: "sub_x", customer: "cus_x" } } };
    await handleStripeEvent(ev as never);
    expect(warn).toHaveBeenCalled();
    // The deleted event is not activation-relevant → no activationRelevant flag.
    const activation = warn.mock.calls.find((c) => (c[0] as { activationRelevant?: boolean })?.activationRelevant);
    expect(activation).toBeUndefined();
  });
});
