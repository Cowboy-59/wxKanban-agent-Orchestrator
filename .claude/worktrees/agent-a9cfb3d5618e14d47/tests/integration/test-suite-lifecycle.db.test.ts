// [SCOPE 111 / T023, T044] Integration + end-to-end verification against a real database.
//
// SAFETY: this file redirects DATABASE_URL to TEST_DATABASE_URL *before* any
// application module loads, and refuses to run at all if the two point at the
// same database. src/db/client.ts reads DATABASE_URL once at import time, so the
// redirect must happen here, at the top, before the dynamic imports below.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { config as loadEnv } from "dotenv";

loadEnv();

const TEST_URL = process.env.TEST_DATABASE_URL?.trim();
const PROD_URL = process.env.DATABASE_URL?.trim();

function target(url?: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return null;
  }
}

const sameTarget = target(TEST_URL) !== null && target(TEST_URL) === target(PROD_URL);
const runnable = Boolean(TEST_URL) && !sameTarget;

// Redirect BEFORE importing anything that touches the database.
if (runnable) process.env.DATABASE_URL = TEST_URL;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any, schema: any, services: any;

const suite = runnable ? describe : describe.skip;

suite("SCOPE-111 — lifecycle against a real database", () => {
  let projectid: string;
  let specid: string;
  let planid: string;
  let machineItemId: string;
  let humanItemId: string;
  let cycleA: string;
  let userid: string;

  beforeAll(async () => {
    const { eq, and, sql } = await import("drizzle-orm");
    db = (await import("../../src/db/client.js")).db;
    schema = {
      ...(await import("../../src/db/schema/testPlan.js")),
      ...(await import("../../src/db/schema/testplanitems.js")),
      ...(await import("../../src/db/schema/testitemsubjects.js")),
      ...(await import("../../src/db/schema/testcycles.js")),
      ...(await import("../../src/db/schema/testruns.js")),
      ...(await import("../../src/db/schema/testrunresults.js")),
      ...(await import("../../src/db/schema/testsignoffs.js")),
      ...(await import("../../src/db/schema/testretests.js")),
      companyprojects: (await import("../../src/db/schema/companyproject.js")).companyprojects,
      projectspecifications: (await import("../../src/db/schema/projectspecification.js"))
        .projectspecifications,
      userprofiles: (await import("../../src/db/schema/userprofiles.js")).userprofiles,
      eq,
      and,
      sql,
    };
    services = {
      TestPlanService: (await import("../../src/server/services/TestPlanService.js")).TestPlanService,
      TestCycleService: (await import("../../src/server/services/TestCycleService.js")).TestCycleService,
      TestRunService: (await import("../../src/server/services/TestRunService.js")).TestRunService,
      TestSignoffService: (await import("../../src/server/services/TestSignoffService.js")).TestSignoffService,
      TestImpactService: (await import("../../src/server/services/TestImpactService.js")).TestImpactService,
      TestGateService: (await import("../../src/server/services/TestGateService.js")).TestGateService,
      TestRegressionService: (await import("../../src/server/services/TestRegressionService.js")).TestRegressionService,
      SignoffError: (await import("../../src/server/services/TestSignoffService.js")).SignoffError,
      ImpactRequestError: (await import("../../src/server/services/TestImpactService.js")).ImpactRequestError,
      TestRunStartError: (await import("../../src/server/services/TestRunService.js")).TestRunStartError,
    };

    // Anchor to real rows in the clone rather than inventing tenancy. Pick the
    // SPEC first and derive the project from it — not every project has specs.
    const [spec] = await db
      .select()
      .from(schema.projectspecifications)
      .innerJoin(
        schema.companyprojects,
        schema.eq(schema.projectspecifications.projectid, schema.companyprojects.id),
      )
      .limit(1);
    const [user] = await db.select().from(schema.userprofiles).limit(1);
    projectid = spec.projectspecifications.projectid;
    specid = spec.projectspecifications.id;
    userid = user.id;

    // Isolate: this spec's plan is recreated from scratch for the run.
    await db.delete(schema.testplans).where(schema.eq(schema.testplans.specid, specid));
  });

  afterAll(async () => {
    if (!runnable || !db) return;
    // Cascades clear items, subjects, results, signoffs and retest marks.
    await db.delete(schema.testplans).where(schema.eq(schema.testplans.specid, specid));
    if (cycleA) await db.delete(schema.testcycles).where(schema.eq(schema.testcycles.id, cycleA));
    await db
      .delete(schema.testcycles)
      .where(schema.sql`version LIKE 'scope111-probe%'`);
  });

  it("files a suite with BOTH sets, releasing only the machine one", async () => {
    const detail = {
      preconditions: ["seeded"],
      testData: [],
      steps: [{ step: 1, action: "do the thing", expected: "status === 200" }],
      flow: null,
      postconditions: ["no rows changed"],
      exemptions: [],
    };

    const result = await services.TestPlanService.upsertPlan({
      projectid,
      specid,
      items: [
        {
          itemkey: "TC-PROBE-M1",
          title: "machine item",
          executor: "machine",
          gate: "smoke",
          detail,
          subjects: [{ sourcePath: "src/server/services/InvoiceService.ts" }].map((s) => ({
            sourcepath: s.sourcePath,
          })),
        },
        {
          itemkey: "TC-PROBE-H1",
          title: "human item",
          executor: "human",
          gate: "ui-flow",
          detail,
          subjects: [{ sourcepath: "src/client/pages/InvoicePage.tsx" }],
        },
        {
          itemkey: "TC-PROBE-H2",
          title: "unrelated human item",
          executor: "human",
          gate: "ui-flow",
          detail,
          subjects: [{ sourcepath: "src/client/pages/SettingsPage.tsx" }],
        },
      ],
    });

    planid = result.plan.id;
    expect(result.created).toBe(3);

    const items = await services.TestPlanService.listItems(planid);
    const machine = items.find((i: { itemkey: string }) => i.itemkey === "TC-PROBE-M1");
    const human = items.find((i: { itemkey: string }) => i.itemkey === "TC-PROBE-H1");
    machineItemId = machine.id;
    humanItemId = human.id;

    // The sequencing rule, in the data: machine runnable now, human withheld.
    expect(machine.released).toBe(true);
    expect(human.released).toBe(false);
  });

  it("refuses a run that includes a human item", async () => {
    await expect(
      services.TestRunService.start({
        projectid,
        cycleid: (await services.TestCycleService.resolveCurrent(projectid)).id,
        runnertype: "ai-agent",
        itemids: [humanItemId],
      }),
    ).rejects.toBeInstanceOf(services.TestRunStartError);
  });

  it("refuses a human signoff on a machine item, and vice versa", async () => {
    const cycle = await services.TestCycleService.resolveCurrent(projectid);
    cycleA = cycle.id;

    // A person cannot sign what a machine was supposed to prove.
    await expect(
      services.TestSignoffService.signHuman({
        itemid: machineItemId,
        cycleid: cycle.id,
        userid,
        passed: true,
      }),
    ).rejects.toBeInstanceOf(services.SignoffError);

    // And a run cannot sign what a person was supposed to do.
    await expect(
      services.TestSignoffService.signMachine({
        itemid: humanItemId,
        cycleid: cycle.id,
        runid: "00000000-0000-0000-0000-000000000000",
        label: "probe",
      }),
    ).rejects.toBeInstanceOf(services.SignoffError);
  });

  it("refuses an AI signoff for an item the run did not prove", async () => {
    const cycle = await services.TestCycleService.resolveCurrent(projectid);
    const { run } = await services.TestRunService.start({
      projectid,
      cycleid: cycle.id,
      gate: "smoke",
      runnertype: "ai-agent",
      itemids: [machineItemId],
    });
    // No result reported yet — a signoff here would be self-certifying.
    await expect(
      services.TestSignoffService.signMachine({
        itemid: machineItemId,
        cycleid: cycle.id,
        runid: run.id,
        label: "probe",
      }),
    ).rejects.toBeInstanceOf(services.SignoffError);

    await services.TestRunService.reportResult({
      runid: run.id,
      itemid: machineItemId,
      status: "pass",
    });
    const signoff = await services.TestSignoffService.signMachine({
      itemid: machineItemId,
      cycleid: cycle.id,
      runid: run.id,
      label: "probe",
    });
    expect(signoff.status).toBe("passed");
    await services.TestRunService.complete(run.id);
  });

  it("declares the ordered list at start and tracks the current item", async () => {
    const cycle = await services.TestCycleService.resolveCurrent(projectid);
    const { run, items } = await services.TestRunService.start({
      projectid,
      cycleid: cycle.id,
      gate: "smoke",
      runnertype: "ai-agent",
      itemids: [machineItemId],
    });
    expect(items).toHaveLength(1);

    await services.TestRunService.heartbeat(run.id, { currentitemid: machineItemId });
    const snap = await services.TestRunService.snapshot(run.id);
    expect(snap.currentitemid).toBe(machineItemId);
    expect(snap.items[0].status).toBe("pending"); // declared before executed
    await services.TestRunService.complete(run.id);
  });

  it("refuses a failure with no stated reason", async () => {
    // Release the human set so it can be signed at all.
    await services.TestPlanService.releaseHumanSet(projectid, specid);
    const cycle = await services.TestCycleService.resolveCurrent(projectid);
    await expect(
      services.TestSignoffService.signHuman({
        itemid: humanItemId,
        cycleid: cycle.id,
        userid,
        passed: false,
      }),
    ).rejects.toBeInstanceOf(services.SignoffError);
  });

  it("THE ASYMMETRIC RESET: machine signoffs do not carry, human ones do", async () => {
    const cycleOne = await services.TestCycleService.resolveCurrent(projectid);

    // Sign both kinds in cycle one.
    await services.TestSignoffService.signHuman({
      itemid: humanItemId,
      cycleid: cycleOne.id,
      userid,
      passed: true,
    });
    expect(
      await services.TestSignoffService.currentSignoff(
        { id: humanItemId, executor: "human" },
        cycleOne.id,
      ),
    ).not.toBeNull();
    expect(
      await services.TestSignoffService.currentSignoff(
        { id: machineItemId, executor: "machine" },
        cycleOne.id,
      ),
    ).not.toBeNull();

    // A new version opens a new cycle.
    const [cycleTwo] = await db
      .insert(schema.testcycles)
      .values({ projectid, version: "scope111-probe-2", status: "open" })
      .returning();

    // Machine: not found in the new cycle — reset by the KEY, with nothing deleted.
    expect(
      await services.TestSignoffService.currentSignoff(
        { id: machineItemId, executor: "machine" },
        cycleTwo.id,
      ),
    ).toBeNull();

    // Human: carries forward untouched. This is the expensive signoff.
    expect(
      await services.TestSignoffService.currentSignoff(
        { id: humanItemId, executor: "human" },
        cycleTwo.id,
      ),
    ).not.toBeNull();

    // The cycle-one machine signoff still EXISTS — proving the reset is a query
    // result, not a deletion.
    const rows = await db
      .select()
      .from(schema.testsignoffs)
      .where(schema.eq(schema.testsignoffs.itemid, machineItemId));
    expect(rows.length).toBeGreaterThan(0);

    await db.delete(schema.testcycles).where(schema.eq(schema.testcycles.id, cycleTwo.id));
  });

  it("IMPACT: marks only what the change reaches, and a dismissal restores the signoff", async () => {
    const [cycle] = await db
      .insert(schema.testcycles)
      .values({ projectid, version: "scope111-probe-3", status: "open", commitsha: "probe-sha" })
      .returning();

    // A change to the invoice service, reaching the invoice page transitively —
    // the case a direct-file match would miss entirely.
    const result = await services.TestImpactService.analyze(cycle.id, {
      commitsha: "probe-sha",
      changedFiles: ["src/server/services/InvoiceService.ts"],
      dependents: [
        {
          changedFile: "src/server/services/InvoiceService.ts",
          dependentPath: "src/client/pages/InvoicePage.tsx",
          path: [
            "src/server/services/InvoiceService.ts",
            "src/server/routes/invoices.ts",
            "src/client/pages/InvoicePage.tsx",
          ],
        },
      ],
    });

    const marked = result.marks.map((m: { itemkey: string }) => m.itemkey);
    expect(marked).toContain("TC-PROBE-H1"); // reached
    expect(marked).not.toContain("TC-PROBE-H2"); // untouched — signoff stands

    // The carried human signoff no longer counts while the mark is unanswered.
    expect(
      await services.TestSignoffService.currentSignoff(
        { id: humanItemId, executor: "human" },
        cycle.id,
      ),
    ).toBeNull();

    // Dismissal restores it WITHOUT creating a new signoff.
    const [mark] = await db
      .select()
      .from(schema.testretests)
      .where(
        schema.and(
          schema.eq(schema.testretests.cycleid, cycle.id),
          schema.eq(schema.testretests.itemid, humanItemId),
        ),
      );
    await services.TestImpactService.dismiss(mark.id, userid, "cannot affect what I verified");
    expect(
      await services.TestSignoffService.currentSignoff(
        { id: humanItemId, executor: "human" },
        cycle.id,
      ),
    ).not.toBeNull();

    await db.delete(schema.testcycles).where(schema.eq(schema.testcycles.id, cycle.id));
  });

  it("IMPACT: refuses a missing graph and a commit mismatch", async () => {
    const [cycle] = await db
      .insert(schema.testcycles)
      .values({ projectid, version: "scope111-probe-4", status: "open", commitsha: "real-sha" })
      .returning();

    await expect(services.TestImpactService.analyze(cycle.id, null)).rejects.toBeInstanceOf(
      services.ImpactRequestError,
    );

    await expect(
      services.TestImpactService.analyze(cycle.id, {
        commitsha: "WRONG-sha",
        changedFiles: ["src/a.ts"],
        dependents: [],
      }),
    ).rejects.toThrow(/computed against/i);

    await db.delete(schema.testcycles).where(schema.eq(schema.testcycles.id, cycle.id));
  });

  it("GATE: reports blocking items and passes once they are signed", async () => {
    // Force the whole scope, then read the gate.
    await db
      .update(schema.testplans)
      .set({ forcetest: true })
      .where(schema.eq(schema.testplans.id, planid));

    const verdict = await services.TestGateService.checkForcedCoverage(projectid, "user");
    // TC-PROBE-H2 was never signed, so it must be named.
    const keys = verdict.blocking.map((b: { itemkey: string }) => b.itemkey);
    expect(keys).toContain("TC-PROBE-H2");
    expect(verdict.passed).toBe(false);

    const cycle = await services.TestCycleService.resolveCurrent(projectid);
    const items = await services.TestPlanService.listItems(planid, { executor: "human" });
    for (const item of items) {
      const existing = await services.TestSignoffService.currentSignoff(item, cycle.id);
      if (!existing) {
        await services.TestSignoffService.signHuman({
          itemid: item.id,
          cycleid: cycle.id,
          userid,
          passed: true,
        });
      }
    }
    const after = await services.TestGateService.checkForcedCoverage(projectid, "user");
    expect(after.blocking.map((b: { itemkey: string }) => b.itemkey)).not.toContain("TC-PROBE-H2");
  });

  it("REGENERATION preserves signoffs and admin overrides", async () => {
    await services.TestPlanService.setItemForce(humanItemId, false, {
      userid,
      companyid: (await db.select().from(schema.companyprojects).limit(1))[0].companyid,
    });

    await services.TestPlanService.upsertPlan({
      projectid,
      specid,
      items: [
        {
          itemkey: "TC-PROBE-H1",
          title: "human item (retitled)",
          executor: "human",
          gate: "ui-flow",
          detail: {
            preconditions: [],
            testData: [],
            steps: [{ step: 1, action: "x", expected: "y" }],
            flow: null,
            postconditions: [],
            exemptions: [],
          },
        },
      ],
    });

    const item = await services.TestPlanService.getItem(humanItemId);
    expect(item.title).toBe("human item (retitled)"); // content refreshed
    expect(item.forcetest).toBe(false); // admin override survived
    expect(item.released).toBe(true); // not re-hidden from testers

    const cycle = await services.TestCycleService.resolveCurrent(projectid);
    expect(
      await services.TestSignoffService.currentSignoff(
        { id: humanItemId, executor: "human" },
        cycle.id,
      ),
    ).not.toBeNull(); // signoff survived
  });
});

// [SCOPE 111 / T045] BEGIN — Deployed-schema guard for the three-state force flag
//
// GAP-05. `testplanitems.forcetest` is a THREE-state column: null = inherit the
// plan's flag, true/false = override it in either direction (FR-030). Nothing in
// the database says so — there is no CHECK to express "null is meaningful", and
// the semantics live in four lines of TestPlanService.resolveForce that decide
// what can block a release.
//
// tests/schema/scope111-test-suite-lifecycle.test.ts already asserts the DRIZZLE
// DECLARATION stays nullable, which catches anyone editing src/db/schema/. This
// suite is the other half: it asserts the DEPLOYED column, because schema changes
// on this project are applied MANUALLY with no migration ledger (SCOPE-117), and
// `npm run db:drift` compares TABLES ONLY — it exits 0 while a column changes
// underneath it. A hand-applied
//
//     ALTER TABLE testplanitems ALTER COLUMN forcetest SET NOT NULL DEFAULT false;
//
// would leave the declaration untouched, keep every existing test green, and
// silently un-force every inheriting item. The failure is invisible and it fails
// OPEN: tests stop blocking the release rather than starting to.
//
// SCOPE NOTE: this runs against TEST_DATABASE_URL, so it catches the drift when
// the clone is next refreshed from production — not at the instant the ALTER is
// applied. The immediate deterrent is the column comment asserted below, which is
// what anyone inspecting the production column actually sees.
const FORCETEST_COMMENT_MARKER = "NULL = inherit";

suite("SCOPE-111 / GAP-05 — forcetest nullability is a deployed-schema invariant", () => {
  // Self-contained: does not depend on the lifecycle suite's beforeAll having run.
  let probeDb: typeof db;
  let raw: typeof import("drizzle-orm").sql;

  beforeAll(async () => {
    raw = (await import("drizzle-orm")).sql;
    probeDb = (await import("../../src/db/client.js")).db;
  });

  it("keeps the item-level flag nullable with NO default", async () => {
    const { rows } = await probeDb.execute(raw`
      select is_nullable, column_default
        from information_schema.columns
       where table_schema = 'public'
         and table_name = 'testplanitems'
         and column_name = 'forcetest'`);

    expect(rows).toHaveLength(1);
    // YES is the whole point: null has to remain expressible.
    expect(rows[0].is_nullable).toBe("YES");
    // A default is as destructive as NOT NULL here — it turns "inherit" into
    // "explicitly not forced" for every row inserted without the column.
    expect(rows[0].column_default).toBeNull();
  });

  it("keeps the plan-level flag NOT NULL, defaulting to off", async () => {
    // The plan flag is the opposite contract — it is the fallback resolveForce
    // coalesces to, so it must always have a value.
    const { rows } = await probeDb.execute(raw`
      select is_nullable, column_default
        from information_schema.columns
       where table_schema = 'public'
         and table_name = 'testplans'
         and column_name = 'forcetest'`);

    expect(rows).toHaveLength(1);
    expect(rows[0].is_nullable).toBe("NO");
    expect(String(rows[0].column_default)).toContain("false");
  });

  it("carries a column comment stating that null is meaningful", async () => {
    // The comment is the only thing in the database itself that explains the
    // three-state semantics to whoever is about to write DDL against this column.
    //
    // Applied to production 2026-08-03 by migration 0063.
    //
    // FAILING THIS TEST MEANS one of two things: either 0063 has not reached the
    // database this suite is pointed at, or someone has since stripped the
    // comment. Re-applying is not self-service — `COMMENT ON` requires table
    // ownership, and both credentials in .env (wxkanban_app,
    // wxkanban_ci_readonly) are deliberately non-owner under H-9
    // least-privilege, so it has to be run by the operator as the owning role.
    // See the schema-change-log entry for 2026-08-03.
    const { rows } = await probeDb.execute(raw`
      select col_description(c.oid, a.attnum) as comment
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a on a.attrelid = c.oid
       where n.nspname = 'public'
         and c.relname = 'testplanitems'
         and a.attname = 'forcetest'`);

    expect(rows).toHaveLength(1);
    expect(String(rows[0].comment)).toContain(FORCETEST_COMMENT_MARKER);
  });

  it("never stores a coerced value where the writer meant inherit", async () => {
    // Belt-and-braces on the OTHER half of GAP-05: a writer coercing null to
    // false. Any row that is explicitly false must be a deliberate override
    // under a plan that is actually forcing — otherwise false and inherit are
    // indistinguishable and the row is evidence of a coercion bug.
    const { rows } = await probeDb.execute(raw`
      select count(*)::int as suspect
        from testplanitems i
        join testplans p on p.id = i.testplanid
       where i.forcetest is false
         and p.forcetest is false`);

    // Not an assertion about intent — an explicit-false under a non-forcing plan
    // is a no-op that no UI path produces, so a non-zero count means something
    // wrote the column that should not have.
    expect(rows[0].suspect).toBe(0);
  });
});
// [SCOPE 111 / T045] END

if (!runnable) {
  // Loud, not silent: a skipped safety-critical suite must announce why.
  describe("SCOPE-111 database suite", () => {
    it("is skipped — no usable TEST_DATABASE_URL", () => {
      // eslint-disable-next-line no-console
      console.warn(
        sameTarget
          ? "SKIPPED: TEST_DATABASE_URL points at the SAME database as DATABASE_URL."
          : "SKIPPED: TEST_DATABASE_URL is not set.",
      );
      expect(runnable).toBe(false);
    });
  });
}
