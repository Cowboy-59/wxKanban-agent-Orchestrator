import { Router, Response } from "express";
import { authenticateToken, requireAuth, AuthRequest } from "../middleware/auth.js";
import {
  getCompanyTierInfo,
  canAddUser,
  isFeatureAvailable,
  requireFeature,
} from "../services/TierEnforcementService.js";
import { createLogger } from "../lib/logger.js";

const router = Router();
const logger = createLogger("tier-routes");

/**
 * GET /api/tier/info
 * Get current company's tier information and usage
 */
router.get(
  "/info",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const companyId = req.companyid;

      if (!companyId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const tierInfo = await getCompanyTierInfo(companyId);
      return res.json(tierInfo);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to get tier info";
      logger.error({ error: message }, "Tier info error");
      return res.status(500).json({ error: message });
    }
  }
);

/**
 * GET /api/tier/check-user-limit
 * Check if company can add more users
 */
router.get(
  "/check-user-limit",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const companyId = req.companyid;

      if (!companyId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const check = await canAddUser(companyId);
      return res.json(check);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to check user limit";
      logger.error({ error: message }, "User limit check error");
      return res.status(500).json({ error: message });
    }
  }
);

/**
 * GET /api/tier/features
 * Get available features for current tier
 */
router.get(
  "/features",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const companyId = req.companyid;

      if (!companyId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const tierInfo = await getCompanyTierInfo(companyId);
      
      // Return features with availability status
      const allFeatures = [
        { id: "basic_kanban", name: "Basic Kanban", description: "Simple kanban board for task management" },
        { id: "task_management", name: "Task Management", description: "Create, assign, and track tasks" },
        { id: "time_tracking", name: "Time Tracking", description: "Log time spent on tasks" },
        { id: "basic_reporting", name: "Basic Reporting", description: "Simple progress reports" },
        { id: "advanced_reporting", name: "Advanced Reporting", description: "Detailed analytics and insights" },
        { id: "client_portal", name: "Client Portal", description: "Share progress with clients" },
        { id: "invoice_generation", name: "Invoice Generation", description: "Create invoices from time logs" },
        { id: "pm_integration", name: "PM Integration", description: "Connect to external PM systems" },
        { id: "sso", name: "Single Sign-On", description: "Enterprise SSO authentication" },
        { id: "advanced_security", name: "Advanced Security", description: "Enhanced security features" },
      ];

      const featuresWithStatus = allFeatures.map((feature) => ({
        ...feature,
        available: isFeatureAvailable(tierInfo.tier, feature.id),
      }));

      return res.json({
        tier: tierInfo.tier,
        features: featuresWithStatus,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to get features";
      logger.error({ error: message }, "Features error");
      return res.status(500).json({ error: message });
    }
  }
);

/**
 * POST /api/tier/validate-feature
 * Validate if a specific feature is available
 */
router.post(
  "/validate-feature",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const companyId = req.companyid;
      const { feature } = req.body;

      if (!companyId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (!feature) {
        return res.status(400).json({ error: "Feature ID required" });
      }

      const tierInfo = await getCompanyTierInfo(companyId);
      const available = isFeatureAvailable(tierInfo.tier, feature);

      return res.json({
        feature,
        available,
        tier: tierInfo.tier,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to validate feature";
      logger.error({ error: message }, "Feature validation error");
      return res.status(500).json({ error: message });
    }
  }
);

/**
 * Protected route example - requires specific feature
 * GET /api/tier/protected/advanced-reporting
 */
router.get(
  "/protected/advanced-reporting",
  authenticateToken,
  requireAuth,
  requireFeature("advanced_reporting"),
  async (_req: AuthRequest, res: Response) => {
    return res.json({ message: "Advanced reporting data", data: [] });
  }
);

export default router;
