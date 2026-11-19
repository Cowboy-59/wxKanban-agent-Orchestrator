import { describe, it, expect } from "vitest";
import { TestPlanService, normalizeSourcePath } from "../../../src/server/services/TestPlanService.js";
import { effectiveStatus, isNonProductionTarget, testTargetWarning, RUN_STALL_MS } from "../../../src/server/services/TestRunService.js";
import type { TestRun } from "../../../src/db/schema/testruns.js";

// [SCOPE 111 / T011..T017] BEGIN — Pure-logic coverage for the Test Suite Lifecycle
//
// These cover the decision rules that do not need a database. The behaviour that
// does — the two resets, the gate, impact marking — is covered by the route
// integration tests (T023), which exercise them end to end rather than through
// a mock that could drift from the real query.

describe("force resolution (FR-030)", () => {
  it("inherits the scope flag when the item has no override", () => {
    expect(TestPlanService.resolveForce(null, true)).toBe(true);
    expect(TestPlanService.resolveForce(null, false)).toBe(false);
  });

  it("lets an item override the scope flag in BOTH directions", () => {
    // Turning a single item OFF under a forced scope is the case that breaks if
    // anyone "simplifies" the null into a false.
    expect(TestPlanService.resolveForce(false, true)).toBe(false);
    expect(TestPlanService.resolveForce(true, false)).toBe(true);
  });

  it("treats false and null as genuinely different", () => {
    const planForced = true;
    expect(TestPlanService.resolveForce(false, planForced)).not.toBe(
      TestPlanService.resolveForce(null, planForced),
    );
  });
});

describe("subject path normalisation", () => {
  // Impact analysis matches these against the runner's graph. A mismatch reads
  // as "not reached", which silently leaves a stale signoff standing — the
  // dangerous direction — so normalisation has to be boring and total.
  it("strips line and column suffixes", () => {
    expect(normalizeSourcePath("src/server/routes/auth.ts:34")).toBe("src/server/routes/auth.ts");
    expect(normalizeSourcePath("src/server/routes/auth.ts:34:12")).toBe("src/server/routes/auth.ts");
  });

  it("normalises Windows separators and leading ./", () => {
    expect(normalizeSourcePath("src\\client\\pages\\InvoicePage.tsx")).toBe(
      "src/client/pages/InvoicePage.tsx",
    );
    expect(normalizeSourcePath("./src/db/client.ts")).toBe("src/db/client.ts");
  });

  it("is idempotent", () => {
    const once = normalizeSourcePath("./src\\a\\b.ts:10");
    expect(normalizeSourcePath(once)).toBe(once);
  });
});

describe("run stall detection (FR-015)", () => {
  const baseRun = (over: Partial<TestRun>): TestRun =>
    ({
      status: "running",
      lastheartbeatat: new Date("2026-07-25T12:00:00Z"),
      ...over,
    }) as TestRun;

  it("reports a silent run as stalled rather than running", () => {
    const now = new Date("2026-07-25T12:00:00Z").getTime() + RUN_STALL_MS + 1000;
    expect(effectiveStatus(baseRun({}), new Date(now))).toBe("stalled");
  });

  it("leaves a live run running", () => {
    const now = new Date("2026-07-25T12:00:00Z").getTime() + 1000;
    expect(effectiveStatus(baseRun({}), new Date(now))).toBe("running");
  });

  it("never overrides a closed run", () => {
    const now = new Date("2027-01-01T00:00:00Z");
    expect(effectiveStatus(baseRun({ status: "completed" }), now)).toBe("completed");
    expect(effectiveStatus(baseRun({ status: "cancelled" }), now)).toBe("cancelled");
  });

  it("is derived, so a recovered runner stops looking stalled", () => {
    const run = baseRun({});
    const late = new Date(run.lastheartbeatat.getTime() + RUN_STALL_MS + 1);
    expect(effectiveStatus(run, late)).toBe("stalled");
    const recovered = baseRun({ lastheartbeatat: late });
    expect(effectiveStatus(recovered, new Date(late.getTime() + 1000))).toBe("running");
  });
});

describe("non-production guard (FR-046)", () => {
  // The local environment points at the production database and the hosted
  // orchestrator shares it, so this must refuse by default rather than trust
  // the caller.
  const withoutTestDb = <T>(fn: () => T): T => {
    const prior = process.env.TEST_DATABASE_URL;
    delete process.env.TEST_DATABASE_URL;
    try {
      return fn();
    } finally {
      if (prior !== undefined) process.env.TEST_DATABASE_URL = prior;
    }
  };

  it("refuses an unspecified or local target", () => {
    withoutTestDb(() => {
      expect(isNonProductionTarget(undefined)).toBe(false);
      expect(isNonProductionTarget("local")).toBe(false);
      expect(isNonProductionTarget("production")).toBe(false);
    });
  });

  it("accepts an explicitly non-production environment", () => {
    withoutTestDb(() => {
      expect(isNonProductionTarget("uat")).toBe(true);
      expect(isNonProductionTarget("ci")).toBe(true);
    });
  });

  const withEnv = <T>(vars: Record<string, string | undefined>, fn: () => T): T => {
    const prior: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(vars)) {
      prior[k] = process.env[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    try {
      return fn();
    } finally {
      for (const [k, v] of Object.entries(prior)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  };

  it("accepts a test database on a different host", () => {
    withEnv(
      {
        DATABASE_URL: "postgres://u:p@prod.example.com:5432/wxKanban",
        TEST_DATABASE_URL: "postgres://u:p@localhost:5432/wxkanban_test",
      },
      () => expect(isNonProductionTarget("local")).toBe(true),
    );
  });

  it("accepts a different database on the SAME host", () => {
    // Writes cannot cross a database boundary in Postgres, so production data
    // is isolated even when the server is shared.
    withEnv(
      {
        DATABASE_URL: "postgres://u:p@pg.example.com:5432/wxKanban",
        TEST_DATABASE_URL: "postgres://u:p@pg.example.com:5432/tstwxKanban",
      },
      () => expect(isNonProductionTarget("local")).toBe(true),
    );
  });

  it("REFUSES when both variables point at the same database", () => {
    // The accident this guard exists for: a copy-paste that leaves the test
    // target aimed at production would otherwise read as "verified non-prod"
    // and run destructive tests against live data.
    withEnv(
      {
        DATABASE_URL: "postgres://u:p@pg.example.com:5432/wxKanban",
        TEST_DATABASE_URL: "postgres://u:p@pg.example.com:5432/wxKanban",
      },
      () => expect(isNonProductionTarget("local")).toBe(false),
    );
  });

  it("fails closed on an unparseable target", () => {
    withEnv(
      {
        DATABASE_URL: "postgres://u:p@pg.example.com:5432/wxKanban",
        TEST_DATABASE_URL: "not-a-url",
      },
      () => expect(isNonProductionTarget("local")).toBe(false),
    );
  });

  it("warns when the test database shares a host with production", () => {
    withEnv(
      {
        DATABASE_URL: "postgres://u:p@pg.example.com:5432/wxKanban",
        TEST_DATABASE_URL: "postgres://u:p@pg.example.com:5432/tstwxKanban",
      },
      () => {
        expect(testTargetWarning()).toMatch(/shares a host with production/);
        expect(testTargetWarning()).toMatch(/Data is isolated; server load is not/);
      },
    );
  });

  it("does not warn when the hosts genuinely differ", () => {
    withEnv(
      {
        DATABASE_URL: "postgres://u:p@prod.example.com:5432/wxKanban",
        TEST_DATABASE_URL: "postgres://u:p@localhost:5432/wxkanban_test",
      },
      () => expect(testTargetWarning()).toBeNull(),
    );
  });
});
// [SCOPE 111 / T011..T017] END
