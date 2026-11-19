import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("tier-middleware");

/**
 * Billing plan tier hierarchy (ascending order of capability).
 * SMALL_BUSINESS uses underscore — enum values are exempt from the no-underscore naming rule.
 */
export type BillingPlan =
  | "FREE"
  | "SMALL_BUSINESS"
  | "CONSULTANT"
  | "ENTERPRISE";

const TIER_ORDER: Record<BillingPlan, number> = {
  FREE: 1,
  SMALL_BUSINESS: 2,
  CONSULTANT: 3,
  ENTERPRISE: 4,
};

/**
 * Returns middleware that enforces a minimum billing plan tier.
 * Responds with 403 + { error, upgrade: true } if the company plan is below the minimum.
 *
 * Usage: router.get("/invoices", authenticateToken, requireTier("CONSULTANT"), handler)
 */
export function requireTier(minPlan: BillingPlan) {
  return function tierGate(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): void {
    const plan = req.billingplan as BillingPlan | undefined;

    if (!plan) {
      logger.warn({ userid: req.userid }, "Tier check: no billingplan in token");
      res.status(403).json({
        error: "Subscription plan not available. Please sign in again.",
        upgrade: false,
      });
      return;
    }

    const currentTier = TIER_ORDER[plan] ?? 0;
    const requiredTier = TIER_ORDER[minPlan];

    if (currentTier < requiredTier) {
      logger.info(
        { userid: req.userid, plan, minPlan },
        "Tier gate: insufficient plan",
      );
      res.status(403).json({
        error: `This feature requires the ${minPlan} plan or higher.`,
        upgrade: true,
        requiredPlan: minPlan,
        currentPlan: plan,
      });
      return;
    }

    next();
  };
}
