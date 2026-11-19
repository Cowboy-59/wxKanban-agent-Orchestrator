/**
 * K.A.I.N. devices in the web app — SPEC-152 (SCOPE-132 Amendment F) T009, FR-071 / FR-073.
 *
 *   GET  /api/agent/devices                    the signed-in person's own K.A.I.N. devices
 *   POST /api/agent/devices/:deviceId/revoke   the owner, or an ADMIN of the owner's company
 *   GET  /api/company/agent-devices            every member's devices, for a company ADMIN
 *
 * Web-session routes (not device-token): this is where a person or their admin signs a lost
 * phone out. A device of another company is missing, never forbidden, so an id cannot be probed.
 */
import { Router, Response } from "express";
import { z } from "zod";
import { authenticateToken, requireAuth, AuthRequest } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { agentDeviceTokenService, recordAgentAudit } from "../services/AgentDeviceTokenService.js";
import { createLogger } from "../lib/logger.js";

const router = Router();
const logger = createLogger("agent-device-routes");

// [SCOPE 152 / T009] BEGIN — device lists and revoke (FR-071, FR-073)
router.get("/agent/devices", authenticateToken, requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const devices = await agentDeviceTokenService.listForUser(req.userid as string);
    return res.json({ devices, count: devices.length });
  } catch (err) {
    logger.error({ err }, "failed to list own K.A.I.N. devices");
    return res.status(500).json({ error: "failed to list devices" });
  }
});

router.get(
  "/company/agent-devices",
  authenticateToken,
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    if (!req.companyid) return res.status(400).json({ error: "no company on this session" });
    try {
      const devices = await agentDeviceTokenService.listForCompany(req.companyid);
      return res.json({ devices, count: devices.length });
    } catch (err) {
      logger.error({ err }, "failed to list company K.A.I.N. devices");
      return res.status(500).json({ error: "failed to list devices" });
    }
  },
);

router.post(
  "/agent/devices/:deviceId/revoke",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const deviceId = String(req.params.deviceId);
    if (!z.string().uuid().safeParse(deviceId).success) {
      return res.status(400).json({ error: "invalid device id" });
    }
    try {
      const device = await agentDeviceTokenService.getLive(deviceId);
      const isOwner = device?.userid === req.userid;
      const isCompanyAdmin = device !== null && req.usertype === "ADMIN" && device.companyid === req.companyid;
      if (!device || (!isOwner && !isCompanyAdmin)) {
        return res.status(404).json({ error: "Device not found" });
      }

      const revoked = await agentDeviceTokenService.revoke(deviceId, req.userid as string, "revoked");
      if (!revoked) return res.status(404).json({ error: "Device not found" });

      await recordAgentAudit({
        companyid: revoked.companyid,
        action: "agent.device.revoked",
        changedby: req.userid as string,
        newvalue: { deviceId, deviceName: revoked.devicename, userId: revoked.userid, by: isOwner ? "owner" : "admin" },
        description: `K.A.I.N. device "${revoked.devicename}" signed out by ${isOwner ? "its owner" : "a company ADMIN"}.`,
      });
      return res.json({ revoked: true, deviceId });
    } catch (err) {
      logger.error({ err, deviceId }, "failed to revoke K.A.I.N. device");
      return res.status(500).json({ error: "failed to revoke device" });
    }
  },
);
// [SCOPE 152 / T009] END

export default router;
