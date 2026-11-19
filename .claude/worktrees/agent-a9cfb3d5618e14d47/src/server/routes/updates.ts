import { Router, type Response } from "express";
import { authenticateToken, type AuthRequest, requireAuth } from "../middleware/auth.js";
import { UpdateAdoptionService } from "~/server/services/updates/UpdateAdoptionService.js";
import type { UpdateDecisionInput } from "~/shared/types/gateway.js";

const router = Router();
const updateAdoptionService = new UpdateAdoptionService();

router.get("/available", authenticateToken, requireAuth, async (req: AuthRequest, res: Response) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
  if (!projectId) {
    return res.status(400).json({ error: "projectId is required", code: "UPDATES_PROJECT_REQUIRED" });
  }

  if (!(await updateAdoptionService.ensureProjectAccess(projectId, req.companyid))) {
    return res.status(403).json({ error: "Project access denied", code: "PROJECT_FORBIDDEN" });
  }

  return res.json(await updateAdoptionService.checkAvailable(projectId));
});

router.get("/changelog/:version", authenticateToken, requireAuth, async (req: AuthRequest, res: Response) => {
  const changelog = await updateAdoptionService.presentToUser(req.companyid ?? "", req.params.version);
  if (!changelog) {
    return res.status(404).json({ error: "Version not found", code: "UPDATES_VERSION_NOT_FOUND" });
  }

  return res.json(changelog);
});

router.post("/decide", authenticateToken, requireAuth, async (req: AuthRequest, res: Response) => {
  const body = req.body as UpdateDecisionInput;
  if (!body?.projectId || !body?.version || !body?.decision) {
    return res.status(400).json({ error: "projectId, version, and decision are required", code: "UPDATES_INVALID_REQUEST" });
  }

  if (!(await updateAdoptionService.ensureProjectAccess(body.projectId, req.companyid))) {
    return res.status(403).json({ error: "Project access denied", code: "PROJECT_FORBIDDEN" });
  }

  try {
    return res.json(await updateAdoptionService.recordDecision(body));
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Invalid update decision",
      code: "UPDATES_INVALID_REQUEST",
    });
  }
});

router.post("/apply", authenticateToken, requireAuth, async (req: AuthRequest, res: Response) => {
  const projectId = typeof req.body?.projectId === "string" ? req.body.projectId : undefined;
  const version = typeof req.body?.version === "string" ? req.body.version : undefined;
  if (!projectId || !version) {
    return res.status(400).json({ error: "projectId and version are required", code: "UPDATES_INVALID_REQUEST" });
  }

  if (!(await updateAdoptionService.ensureProjectAccess(projectId, req.companyid))) {
    return res.status(403).json({ error: "Project access denied", code: "PROJECT_FORBIDDEN" });
  }

  return res.json(await updateAdoptionService.applyUpdate(projectId, version));
});

export default router;
