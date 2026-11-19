import { Router, Response } from "express";
import { z } from "zod";
import {
  authenticateToken,
  requireAuth,
  AuthRequest,
} from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { validateBody } from "../middleware/validation.js";
import {
  getCompanySettings,
  addSetting,
  updateSetting,
  deleteSetting,
} from "../services/SettingsService.js";
import { createLogger } from "../lib/logger.js";

const router = Router();
const logger = createLogger("settings-routes");

const createSettingSchema = z.object({
  name: z
    .string()
    .regex(/^[a-z0-9_]{1,64}$/, "Name must be 1-64 lowercase alphanumeric/underscore chars"),
  type: z.enum(["boolean", "default", "report_header", "image"]),
  value: z.string().max(2048),
  description: z.string().max(255).optional(),
});

const updateSettingSchema = z.object({
  value: z.string().max(2048),
  description: z.string().max(255).optional(),
});

/**
 * GET /api/settings
 * List all company settings. Available to all authenticated users.
 */
router.get(
  "/",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.companyid) {
        return res.status(200).json({ settings: [] });
      }
      const settings = await getCompanySettings(req.companyid);
      return res.status(200).json({ settings });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load settings";
      logger.error({ error: message }, "Get settings error");
      return res.status(500).json({ error: message });
    }
  },
);

/**
 * POST /api/settings
 * Create a new setting. Admin only.
 */
router.post(
  "/",
  authenticateToken,
  requireAuth,
  requireAdmin,
  validateBody(createSettingSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.companyid) {
        return res.status(400).json({ error: "No company associated with this account." });
      }
      const setting = await addSetting(req.companyid, req.body);
      return res.status(201).json({ success: true, setting: setting[setting.length - 1] });
    } catch (error) {
      const err = error as Error & { code?: string };
      if (err.code === "SETTING_NAME_CONFLICT") {
        return res.status(409).json({ code: "SETTING_NAME_CONFLICT", error: err.message });
      }
      logger.error({ error: err.message }, "Create setting error");
      return res.status(500).json({ error: err.message });
    }
  },
);

/**
 * PATCH /api/settings/:name
 * Update setting value. Admin only.
 */
router.patch(
  "/:name",
  authenticateToken,
  requireAuth,
  requireAdmin,
  validateBody(updateSettingSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.companyid) {
        return res.status(400).json({ error: "No company associated with this account." });
      }
      const setting = await updateSetting(req.companyid, req.params.name, req.body);
      return res.status(200).json({ success: true, setting });
    } catch (error) {
      const err = error as Error & { code?: string };
      if (err.code === "SETTING_NOT_FOUND") {
        return res.status(404).json({ code: "SETTING_NOT_FOUND", error: err.message });
      }
      logger.error({ error: err.message }, "Update setting error");
      return res.status(500).json({ error: err.message });
    }
  },
);

/**
 * DELETE /api/settings/:name
 * Delete a setting. Admin only.
 */
router.delete(
  "/:name",
  authenticateToken,
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.companyid) {
        return res.status(400).json({ error: "No company associated with this account." });
      }
      await deleteSetting(req.companyid, req.params.name);
      return res.status(200).json({
        success: true,
        message: `Setting '${req.params.name}' deleted.`,
      });
    } catch (error) {
      const err = error as Error & { code?: string };
      if (err.code === "SETTING_NOT_FOUND") {
        return res.status(404).json({ code: "SETTING_NOT_FOUND", error: err.message });
      }
      logger.error({ error: err.message }, "Delete setting error");
      return res.status(500).json({ error: err.message });
    }
  },
);

export default router;
