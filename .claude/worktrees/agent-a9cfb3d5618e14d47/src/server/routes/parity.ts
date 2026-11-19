import { Router, type Response } from "express";
import { authenticateToken, type AuthRequest, requireAuth } from "../middleware/auth.js";
import { ParityGateService } from "~/server/services/parity/ParityGateService.js";

const router = Router();
const parityGateService = new ParityGateService();

function isAdmin(request: AuthRequest): boolean {
  return request.usertype === "ADMIN" || request.usertype === "SYSADMIN";
}

router.get("/config", authenticateToken, requireAuth, async (_req: AuthRequest, res: Response) => {
  return res.json(await parityGateService.getMode());
});

router.patch("/config", authenticateToken, requireAuth, async (req: AuthRequest, res: Response) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: "Admin access required", code: "PARITY_ADMIN_REQUIRED" });
  }

  const gateMode = typeof req.body?.gateMode === "string" ? req.body.gateMode : undefined;
  const rollback = req.body?.rollback === true;

  if (rollback) {
    return res.json(await parityGateService.rollback(req.userid!));
  }

  if (gateMode !== "advisory" && gateMode !== "mandatory") {
    return res.status(400).json({ error: "gateMode must be advisory or mandatory", code: "PARITY_INVALID_MODE" });
  }

  return res.json(await parityGateService.setMode(gateMode, req.userid!));
});

export default router;
