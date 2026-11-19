import { Router, type Response } from "express";
import { authenticateToken, type AuthRequest, requireAuth } from "../middleware/auth.js";
import { DriftEventService } from "~/server/services/drift/DriftEventService.js";
import type { GatewaySeverity } from "~/shared/types/gateway.js";

const router = Router();
const driftEventService = new DriftEventService();

function parseSeverities(value?: string): GatewaySeverity[] | undefined {
  if (!value) {
    return undefined;
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is GatewaySeverity => ["critical", "high", "medium", "low"].includes(item));
}

router.get("/events", authenticateToken, requireAuth, async (req: AuthRequest, res: Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
  if (projectId && !(await driftEventService.ensureProjectAccess(projectId, req.companyid))) {
    return res.status(403).json({ error: "Project access denied", code: "PROJECT_FORBIDDEN" });
  }

  const result = await driftEventService.list({
    projectid: projectId,
    severity: parseSeverities(typeof req.query.severity === "string" ? req.query.severity : undefined),
    status: typeof req.query.status === "string" ? req.query.status as "open" | "resolved" | "suppressed" : undefined,
    limit: typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : undefined,
    offset: typeof req.query.offset === "string" ? Number.parseInt(req.query.offset, 10) : undefined,
  });

  return res.json(result);
});

router.get("/events/:id", authenticateToken, requireAuth, async (req: AuthRequest, res: Response) => {
  const event = await driftEventService.getById(req.params.id);
  if (!event) {
    return res.status(404).json({ error: "Drift event not found", code: "DRIFT_NOT_FOUND" });
  }

  if (!(await driftEventService.ensureProjectAccess(event.projectId, req.companyid))) {
    return res.status(403).json({ error: "Project access denied", code: "PROJECT_FORBIDDEN" });
  }

  return res.json(event);
});

router.patch("/events/:id/resolve", authenticateToken, requireAuth, async (req: AuthRequest, res: Response) => {
  const event = await driftEventService.getById(req.params.id);
  if (!event) {
    return res.status(404).json({ error: "Drift event not found", code: "DRIFT_NOT_FOUND" });
  }

  if (!(await driftEventService.ensureProjectAccess(event.projectId, req.companyid))) {
    return res.status(403).json({ error: "Project access denied", code: "PROJECT_FORBIDDEN" });
  }

  const resolved = await driftEventService.resolve(req.params.id, typeof req.body?.note === "string" ? req.body.note : undefined);
  return res.json(resolved);
});

router.get("/summary", authenticateToken, requireAuth, async (req: AuthRequest, res: Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
  if (projectId && !(await driftEventService.ensureProjectAccess(projectId, req.companyid))) {
    return res.status(403).json({ error: "Project access denied", code: "PROJECT_FORBIDDEN" });
  }

  const summary = await driftEventService.aggregate({ projectid: projectId });
  return res.json(summary);
});

export default router;
