import { Router, Response } from "express";
import { authenticateToken, requireAuth, AuthRequest } from "../middleware/auth.js";
import { projectInCompany } from "./projectTheme.js";
import { TestPlanService } from "../services/TestPlanService.js";
import { TestCycleService, ClosedCycleError } from "../services/TestCycleService.js";
import { TestRunService, TestRunStartError } from "../services/TestRunService.js";
import { TestRegressionService } from "../services/TestRegressionService.js";
import {
  TestImpactService,
  ImpactRequestError,
  RetestNotFoundError,
} from "../services/TestImpactService.js";
import { TestSignoffService, SignoffError } from "../services/TestSignoffService.js";
import { TestGateService } from "../services/TestGateService.js";
import { TestFailureReportService } from "../services/TestFailureReportService.js";
import { createLogger } from "../lib/logger.js";
import type { GateRequirement } from "~/shared/types/tests.js";

const router = Router();
const logger = createLogger("testplan-routes");

// [SCOPE 111 / T018..T021] BEGIN — Test Suite Lifecycle API
//
// Thin over the services. Everything interesting here is a REFUSAL: the shapes
// this scope exists to prevent are all rejected at this boundary with a reason
// the caller can act on, rather than being absorbed into a permissive default.

/** Tenant guard — mirrors the SCOPE-063 bug-report routes. */
async function guardProject(req: AuthRequest, res: Response, projectId: string): Promise<boolean> {
  const companyId = req.companyid;
  if (!companyId) {
    res.status(401).json({ error: "Authentication required" });
    return false;
  }
  if (!(await projectInCompany(projectId, companyId))) {
    res.status(404).json({ error: "Project not found" });
    return false;
  }
  return true;
}

function isAdmin(req: AuthRequest): boolean {
  return req.usertype === "ADMIN";
}

function fail(res: Response, err: unknown, fallback = "Request failed"): void {
  // A retest mark in another company is reported as missing, never as forbidden,
  // so the status cannot be used to confirm an id exists elsewhere.
  if (err instanceof RetestNotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }
  // FR-050 — the payload is fine and the caller is authorised; the CYCLE's state
  // refuses the write, and the fix is to retry against the current cycle.
  if (err instanceof ClosedCycleError) {
    res.status(409).json({ error: err.message });
    return;
  }
  if (err instanceof ImpactRequestError || err instanceof SignoffError || err instanceof TestRunStartError) {
    res.status(400).json({ error: err.message });
    return;
  }
  logger.error({ err }, fallback);
  res.status(500).json({ error: fallback });
}

// ---------------------------------------------------------------------------
// Suite (T018)
// ---------------------------------------------------------------------------

router.get(
  "/api/projects/:projectId/testplans",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const projectId = String(req.params.projectId);
    if (!(await guardProject(req, res, projectId))) return;
    try {
      const specId = typeof req.query.specId === "string" ? req.query.specId : undefined;
      // The scope picker needs number + title + counts; the plain list is kept
      // for callers that only want the rows.
      const plans = specId
        ? await TestPlanService.listPlans(projectId, specId)
        : await TestPlanService.listPlansWithScope(projectId);
      res.json({ plans });
    } catch (err) {
      fail(res, err, "Failed to list test plans");
    }
  },
);

router.get(
  "/api/testplans/:id/items",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const plan = await TestPlanService.getPlan(String(req.params.id));
      if (!plan?.projectid) {
        res.status(404).json({ error: "Test plan not found" });
        return;
      }
      if (!(await guardProject(req, res, plan.projectid))) return;

      const items = await TestPlanService.listItems(String(req.params.id), {
        executor: req.query.executor as "machine" | "human" | undefined,
        released:
          req.query.released === undefined ? undefined : req.query.released === "true",
        gate: typeof req.query.gate === "string" ? req.query.gate : undefined,
        origin: req.query.origin as "ai" | "user" | undefined,
        forcedOnly: req.query.forced === "true",
      });

      // The resolved force value is what the UI badges as binding — never the
      // raw nullable column, which means "inherit" rather than "not forced".
      const withForce = items.map((item) => ({
        ...item,
        forceresolved: TestPlanService.resolveForce(item.forcetest, plan.forcetest),
      }));

      res.json({ plan, items: withForce });
    } catch (err) {
      fail(res, err, "Failed to list test items");
    }
  },
);

router.get(
  "/api/testplanitems/:id",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const item = await TestPlanService.getItem(String(req.params.id));
      if (!item) {
        res.status(404).json({ error: "Test item not found" });
        return;
      }
      if (!(await guardProject(req, res, item.projectid))) return;

      const [subjects, cycle] = await Promise.all([
        TestPlanService.listSubjects([item.id]),
        TestCycleService.resolveCurrent(item.projectid),
      ]);
      const signoff = await TestSignoffService.currentSignoff(item, cycle.id);

      res.json({ item, subjects, signoff, cycle });
    } catch (err) {
      fail(res, err, "Failed to load test item");
    }
  },
);

/** The tester-authored path (FR-026) — live on creation, no release needed. */
router.post(
  "/api/testplans/:id/items",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const plan = await TestPlanService.getPlan(String(req.params.id));
      if (!plan?.projectid) {
        res.status(404).json({ error: "Test plan not found" });
        return;
      }
      if (!(await guardProject(req, res, plan.projectid))) return;

      const body = req.body as { itemkey?: string; title?: string; gate?: string; detail?: unknown };
      if (!body.title?.trim()) {
        res.status(400).json({ error: "A test needs a title" });
        return;
      }
      const detail = (body.detail ?? {}) as { steps?: Array<{ expected?: string }> };
      if (!detail.steps?.length) {
        res.status(400).json({ error: "A test needs at least one step" });
        return;
      }
      if (detail.steps.some((s) => !s.expected?.trim())) {
        res.status(400).json({
          error: "Every step needs an expected result stating a value, count, status, or absence",
        });
        return;
      }

      const item = await TestPlanService.addUserItem(plan.id, {
        projectid: plan.projectid,
        specid: plan.specid,
        itemkey: body.itemkey?.trim() || `TC-USER-${Date.now().toString(36).toUpperCase()}`,
        title: body.title.trim(),
        gate: body.gate ?? "ui-flow",
        detail: body.detail as never,
      });
      res.status(201).json({ item });
    } catch (err) {
      fail(res, err, "Failed to add test item");
    }
  },
);

/** Force flags — administrator only, audited (FR-031, FR-032). */
router.patch(
  "/api/testplans/:id",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const plan = await TestPlanService.getPlan(String(req.params.id));
      if (!plan?.projectid) {
        res.status(404).json({ error: "Test plan not found" });
        return;
      }
      if (!(await guardProject(req, res, plan.projectid))) return;
      if (!isAdmin(req)) {
        res.status(403).json({ error: "Only an administrator can change the force-test flag" });
        return;
      }
      const forcetest = Boolean((req.body as { forcetest?: boolean }).forcetest);
      const updated = await TestPlanService.setPlanForce(plan.id, forcetest, {
        userid: req.userid as string,
        companyid: req.companyid as string,
      });
      res.json({ plan: updated });
    } catch (err) {
      fail(res, err, "Failed to update test plan");
    }
  },
);

router.patch(
  "/api/testplanitems/:id",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const item = await TestPlanService.getItem(String(req.params.id));
      if (!item) {
        res.status(404).json({ error: "Test item not found" });
        return;
      }
      if (!(await guardProject(req, res, item.projectid))) return;

      const body = req.body as { forcetest?: boolean | null };
      if (body.forcetest !== undefined) {
        if (!isAdmin(req)) {
          res.status(403).json({ error: "Only an administrator can change the force-test flag" });
          return;
        }
        // null is meaningful — it clears the override back to inherit.
        const updated = await TestPlanService.setItemForce(item.id, body.forcetest, {
          userid: req.userid as string,
          companyid: req.companyid as string,
        });
        res.json({ item: updated });
        return;
      }
      res.status(400).json({ error: "Nothing to update" });
    } catch (err) {
      fail(res, err, "Failed to update test item");
    }
  },
);

// ---------------------------------------------------------------------------
// Runs (T019)
// ---------------------------------------------------------------------------

router.post("/api/testruns", authenticateToken, requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body as {
      projectId?: string;
      testplanId?: string | null;
      specId?: string | null;
      gate?: string | null;
      runnertype?: string;
      runnerref?: string | null;
      environment?: string;
      isregression?: boolean;
      itemIds?: string[];
    };
    if (!body.projectId) {
      res.status(400).json({ error: "projectId is required" });
      return;
    }
    if (!(await guardProject(req, res, body.projectId))) return;

    const cycle = await TestCycleService.resolveCurrent(body.projectId);
    const { run, items } = await TestRunService.start({
      projectid: body.projectId,
      cycleid: cycle.id,
      testplanid: body.testplanId ?? null,
      specid: body.specId ?? null,
      gate: body.gate ?? null,
      runnertype: body.runnertype ?? "ai-agent",
      runnerref: body.runnerref ?? null,
      environment: body.environment ?? "local",
      isregression: body.isregression ?? false,
      itemids: body.itemIds ?? [],
      triggeredbyid: req.userid ?? null,
    });

    // The ordered list is returned at START — this is what the runner narrates
    // and what the QA view shows before anything has executed (FR-010).
    res.status(201).json({ run, items, cycle });
  } catch (err) {
    fail(res, err, "Failed to start test run");
  }
});

router.get("/api/testruns/:id", authenticateToken, requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const run = await TestRunService.getRun(String(req.params.id));
    if (!run) {
      res.status(404).json({ error: "Test run not found" });
      return;
    }
    if (!(await guardProject(req, res, run.projectid))) return;
    res.json({ snapshot: await TestRunService.snapshot(run.id) });
  } catch (err) {
    fail(res, err, "Failed to load test run");
  }
});

router.get(
  "/api/projects/:projectId/testruns",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const projectId = String(req.params.projectId);
    if (!(await guardProject(req, res, projectId))) return;
    try {
      res.json({ runs: await TestRunService.listRuns(projectId) });
    } catch (err) {
      fail(res, err, "Failed to list test runs");
    }
  },
);

router.patch("/api/testruns/:id", authenticateToken, requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const run = await TestRunService.getRun(String(req.params.id));
    if (!run) {
      res.status(404).json({ error: "Test run not found" });
      return;
    }
    if (!(await guardProject(req, res, run.projectid))) return;
    const body = req.body as { currentItemId?: string | null; status?: "running" | "completed" };
    const updated = await TestRunService.heartbeat(run.id, {
      currentitemid: body.currentItemId,
      status: body.status,
    });
    res.json({ run: updated });
  } catch (err) {
    fail(res, err, "Failed to update test run");
  }
});

router.post(
  "/api/testruns/:id/results",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const run = await TestRunService.getRun(String(req.params.id));
      if (!run) {
        res.status(404).json({ error: "Test run not found" });
        return;
      }
      if (!(await guardProject(req, res, run.projectid))) return;

      const body = req.body as {
        itemId?: string;
        status?: string;
        bucket?: string | null;
        evidence?: string | null;
        durationMs?: number | null;
      };
      if (!body.itemId || !body.status) {
        res.status(400).json({ error: "itemId and status are required" });
        return;
      }

      await TestRunService.reportResult({
        runid: run.id,
        itemid: body.itemId,
        status: body.status as never,
        bucket: body.bucket ?? null,
        evidence: body.evidence ?? null,
        durationms: body.durationMs ?? null,
      });

      // FR-021a — a failing result withdraws whatever signoff was standing.
      if (body.status === "fail") {
        await TestSignoffService.supersedeOnFailure(body.itemId);
      }

      res.status(201).json({ ok: true });
    } catch (err) {
      fail(res, err, "Failed to record test result");
    }
  },
);

router.post(
  "/api/testruns/:id/complete",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const run = await TestRunService.getRun(String(req.params.id));
      if (!run) {
        res.status(404).json({ error: "Test run not found" });
        return;
      }
      if (!(await guardProject(req, res, run.projectid))) return;
      const status = (req.body as { status?: "completed" | "failed" | "cancelled" }).status;
      res.json({ run: await TestRunService.complete(run.id, status ?? "completed") });
    } catch (err) {
      fail(res, err, "Failed to complete test run");
    }
  },
);

// ---------------------------------------------------------------------------
// Cycles, regression, impact (T020)
// ---------------------------------------------------------------------------

router.get(
  "/api/projects/:projectId/testcycles",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const projectId = String(req.params.projectId);
    if (!(await guardProject(req, res, projectId))) return;
    try {
      const [cycles, current] = await Promise.all([
        TestCycleService.list(projectId),
        TestCycleService.resolveCurrent(projectId),
      ]);
      res.json({ cycles, current });
    } catch (err) {
      fail(res, err, "Failed to list test cycles");
    }
  },
);

router.get(
  "/api/testcycles/:id/regression",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const cycle = await TestCycleService.getById(String(req.params.id));
      if (!cycle) {
        res.status(404).json({ error: "Test cycle not found" });
        return;
      }
      if (!(await guardProject(req, res, cycle.projectid))) return;
      res.json({ regression: await TestRegressionService.compare(cycle.id) });
    } catch (err) {
      fail(res, err, "Failed to compute regression comparison");
    }
  },
);

router.get(
  "/api/testcycles/:id/retests",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const cycle = await TestCycleService.getById(String(req.params.id));
      if (!cycle) {
        res.status(404).json({ error: "Test cycle not found" });
        return;
      }
      if (!(await guardProject(req, res, cycle.projectid))) return;
      res.json({ retests: await TestImpactService.listForCycle(cycle.id) });
    } catch (err) {
      fail(res, err, "Failed to list retest marks");
    }
  },
);

router.post(
  "/api/testcycles/:id/analyze-impact",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const cycle = await TestCycleService.getById(String(req.params.id));
      if (!cycle) {
        res.status(404).json({ error: "Test cycle not found" });
        return;
      }
      if (!(await guardProject(req, res, cycle.projectid))) return;

      const body = req.body as { graph?: unknown; preview?: boolean };
      const result = await TestImpactService.analyze(cycle.id, body.graph as never, {
        apply: !body.preview,
      });
      res.json({ impact: result });
    } catch (err) {
      fail(res, err, "Failed to analyze change impact");
    }
  },
);

router.post(
  "/api/testretests/:id/dismiss",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const reason = (req.body as { reason?: string }).reason;
      if (!reason?.trim()) {
        res.status(400).json({ error: "A dismissal requires a stated reason" });
        return;
      }
      // companyid is what scopes the dismissal to the caller's tenant, so it is
      // passed through as-is; the service refuses a null rather than treating it
      // as "unscoped", which is how the audit record used to be skipped.
      await TestImpactService.dismiss(
        String(req.params.id),
        req.userid as string,
        reason,
        req.companyid ?? null,
      );
      res.json({ ok: true });
    } catch (err) {
      fail(res, err, "Failed to dismiss retest mark");
    }
  },
);

// ---------------------------------------------------------------------------
// Signoff, waiver, gate (T021)
// ---------------------------------------------------------------------------

router.post(
  "/api/testplanitems/:id/signoff",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const item = await TestPlanService.getItem(String(req.params.id));
      if (!item) {
        res.status(404).json({ error: "Test item not found" });
        return;
      }
      if (!(await guardProject(req, res, item.projectid))) return;

      const body = req.body as { passed?: boolean; notes?: string };
      if (typeof body.passed !== "boolean") {
        res.status(400).json({ error: "passed must be true or false" });
        return;
      }
      // FR-024 — a failure without a reason is refused, because the moment the
      // tester has the detail is the only moment it can be captured.
      if (!body.passed && !body.notes?.trim()) {
        res.status(400).json({
          error: "Recording a failure requires a stated reason describing what actually happened",
        });
        return;
      }

      const cycle = await TestCycleService.resolveCurrent(item.projectid);

      let bugreportid: string | null = null;
      if (!body.passed) {
        bugreportid = await TestFailureReportService.fileFromFailedTest({
          item,
          projectid: item.projectid,
          companyid: req.companyid ?? null,
          userid: req.userid as string,
          actualResult: body.notes as string,
          cycleVersion: cycle.version,
        });
      }

      const signoff = await TestSignoffService.signHuman({
        itemid: item.id,
        cycleid: cycle.id,
        userid: req.userid as string,
        passed: body.passed,
        notes: body.notes ?? null,
        version: cycle.version,
        buildref: cycle.buildref,
      });

      res.status(201).json({ signoff, bugreportid });
    } catch (err) {
      fail(res, err, "Failed to record signoff");
    }
  },
);

router.post(
  "/api/testplanitems/:id/waive",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const item = await TestPlanService.getItem(String(req.params.id));
      if (!item) {
        res.status(404).json({ error: "Test item not found" });
        return;
      }
      if (!(await guardProject(req, res, item.projectid))) return;
      if (!isAdmin(req)) {
        res.status(403).json({ error: "Only an administrator can waive a forced test" });
        return;
      }
      const reason = (req.body as { reason?: string }).reason;
      if (!reason?.trim()) {
        res.status(400).json({ error: "A waiver requires a stated reason" });
        return;
      }
      const cycle = await TestCycleService.resolveCurrent(item.projectid);
      const signoff = await TestSignoffService.waive({
        itemid: item.id,
        cycleid: cycle.id,
        actor: { userid: req.userid as string, companyid: req.companyid as string },
        reason,
      });
      res.status(201).json({ signoff });
    } catch (err) {
      fail(res, err, "Failed to waive test");
    }
  },
);

/**
 * [SCOPE 111 / Amendment A] Project-level testing opt-out.
 * Administrator only and audited — it disables a release gate, which is exactly
 * the kind of decision that must leave a trace with a name on it.
 */
router.patch(
  "/api/projects/:projectId/testing-settings",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const projectId = String(req.params.projectId);
    if (!(await guardProject(req, res, projectId))) return;
    if (!isAdmin(req)) {
      res.status(403).json({ error: "Only an administrator can change testing settings" });
      return;
    }
    try {
      const skip = Boolean((req.body as { skiptesting?: boolean }).skiptesting);
      const updated = await TestPlanService.setProjectSkipTesting(projectId, skip, {
        userid: req.userid as string,
        companyid: req.companyid as string,
      });
      res.json({ project: updated });
    } catch (err) {
      fail(res, err, "Failed to update testing settings");
    }
  },
);

router.get(
  "/api/projects/:projectId/testing-settings",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const projectId = String(req.params.projectId);
    if (!(await guardProject(req, res, projectId))) return;
    try {
      res.json({ skiptesting: await TestPlanService.getProjectSkipTesting(projectId) });
    } catch (err) {
      fail(res, err, "Failed to read testing settings");
    }
  },
);

router.get(
  "/api/projects/:projectId/testgate",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const projectId = String(req.params.projectId);
    if (!(await guardProject(req, res, projectId))) return;
    try {
      const requirement = (req.query.requirement as GateRequirement) ?? "all";
      if (!["ai", "user", "all"].includes(requirement)) {
        res.status(400).json({ error: "requirement must be ai, user, or all" });
        return;
      }
      res.json({ verdict: await TestGateService.checkForcedCoverage(projectId, requirement) });
    } catch (err) {
      fail(res, err, "Failed to evaluate the test gate");
    }
  },
);

export default router;
// [SCOPE 111 / T018..T021] END
