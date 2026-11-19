import { db } from "~/db/client.js";
import { companies, userprofiles } from "~/db/schema/index.js";
import { eq, and, count } from "drizzle-orm";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("tier-enforcement");

export type SubscriptionTier = "FREE" | "SINGLE_USER" | "SMALL_BUSINESS" | "CONSULTANT" | "ENTERPRISE";

interface TierLimits {
  maxUsers: number;
  maxProjects: number;
  maxStorageGB: number;
  features: string[];
}

// [SCOPE 084 / T002] MODIFIED-BY — exported so the Help drift check can compare
// the customer-facing Help catalog against the canonical tier feature flags.
export const TIER_CONFIG: Record<SubscriptionTier, TierLimits> = {
  FREE: {
    maxUsers: 1,
    maxProjects: 3,
    maxStorageGB: 1,
    features: ["basic_kanban", "task_management"],
  },
  // Single User — entry-level paid tier (spec 023 §G, 2026-05-30): 1 seat,
  // unlimited projects, single PM integration; no time tracking.
  SINGLE_USER: {
    maxUsers: 1,
    maxProjects: 999,
    maxStorageGB: 5,
    features: ["basic_kanban", "task_management", "pm_integration"],
  },
  SMALL_BUSINESS: {
    maxUsers: 5,
    maxProjects: 10,
    maxStorageGB: 10,
    features: ["basic_kanban", "task_management", "time_tracking", "basic_reporting"],
  },
  CONSULTANT: {
    maxUsers: 999,
    maxProjects: 50,
    maxStorageGB: 100,
    features: [
      "basic_kanban",
      "task_management",
      "time_tracking",
      "advanced_reporting",
      "client_portal",
      "invoice_generation",
      "pm_integration",
    ],
  },
  ENTERPRISE: {
    maxUsers: 9999,
    maxProjects: 999,
    maxStorageGB: 1000,
    features: [
      "basic_kanban",
      "task_management",
      "time_tracking",
      "advanced_reporting",
      "client_portal",
      "invoice_generation",
      "pm_integration",
      "sso",
      "advanced_security",
      "dedicated_support",
      "custom_integrations",
    ],
  },
};

/**
 * Get tier configuration
 */
export function getTierConfig(tier: SubscriptionTier): TierLimits {
  return TIER_CONFIG[tier] || TIER_CONFIG.FREE;
}

/**
 * Check if company can add more users
 */
export async function canAddUser(companyId: string): Promise<{
  allowed: boolean;
  currentCount: number;
  maxAllowed: number;
  tier: SubscriptionTier;
}> {
  try {
    // Get company tier
    const [company] = await db
      .select({
        billingplan: companies.billingplan,
        maxusers: companies.maxusers,
      })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    if (!company) {
      throw new Error("Company not found");
    }

    const tier = (company.billingplan as SubscriptionTier) || "FREE";
    const config = getTierConfig(tier);
    const maxUsers = company.maxusers || config.maxUsers;

    // Count current users
    const [result] = await db
      .select({ count: count() })
      .from(userprofiles)
      .where(
        and(
          eq(userprofiles.companyid, companyId),
          eq(userprofiles.active, true)
        )
      );

    const currentCount = result?.count || 0;
    const allowed = currentCount < maxUsers;

    return {
      allowed,
      currentCount,
      maxAllowed: maxUsers,
      tier,
    };
  } catch (error) {
    logger.error({ error, companyId }, "Failed to check user limit");
    throw error;
  }
}

/**
 * Validate user can be added, throws if limit reached
 */
export async function validateUserLimit(companyId: string): Promise<void> {
  const check = await canAddUser(companyId);

  if (!check.allowed) {
    throw new TierLimitError(
      `User limit reached: ${check.currentCount}/${check.maxAllowed} users. Upgrade to ${getUpgradeSuggestion(check.tier)} to add more users.`,
      check.tier,
      "USER_LIMIT",
      check.currentCount,
      check.maxAllowed
    );
  }
}

/**
 * Check if feature is available for tier
 */
export function isFeatureAvailable(
  tier: SubscriptionTier,
  feature: string
): boolean {
  const config = getTierConfig(tier);
  return config.features.includes(feature);
}

/**
 * Validate feature access, throws if not available
 */
export function validateFeatureAccess(
  tier: SubscriptionTier,
  feature: string
): void {
  if (!isFeatureAvailable(tier, feature)) {
    throw new TierLimitError(
      `Feature '${feature}' is not available on ${tier} tier. Upgrade to access this feature.`,
      tier,
      "FEATURE_NOT_AVAILABLE",
      0,
      0,
      feature
    );
  }
}

/**
 * Get upgrade suggestion based on current tier
 */
function getUpgradeSuggestion(currentTier: SubscriptionTier): string {
  const upgrades: Record<SubscriptionTier, string> = {
    FREE: "SINGLE_USER",
    SINGLE_USER: "SMALL_BUSINESS",
    SMALL_BUSINESS: "CONSULTANT",
    CONSULTANT: "ENTERPRISE",
    ENTERPRISE: "ENTERPRISE",
  };
  return upgrades[currentTier];
}

/**
 * Custom error for tier limit violations
 */
export class TierLimitError extends Error {
  constructor(
    message: string,
    public readonly tier: SubscriptionTier,
    public readonly code: "USER_LIMIT" | "PROJECT_LIMIT" | "STORAGE_LIMIT" | "FEATURE_NOT_AVAILABLE",
    public readonly current: number,
    public readonly limit: number,
    public readonly feature?: string
  ) {
    super(message);
    this.name = "TierLimitError";
  }
}

/**
 * Middleware to check feature access
 */
export function requireFeature(feature: string) {
  return async (req: any, res: any, next: any) => {
    try {
      const companyId = req.companyid;

      if (!companyId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const [company] = await db
        .select({ billingplan: companies.billingplan })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);

      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }

      const tier = (company.billingplan as SubscriptionTier) || "FREE";

      if (!isFeatureAvailable(tier, feature)) {
        return res.status(403).json({
          error: "Feature not available",
          feature,
          currentTier: tier,
          upgradeRequired: true,
        });
      }

      next();
    } catch (error) {
      logger.error({ error, feature }, "Feature check failed");
      return res.status(500).json({ error: "Failed to check feature access" });
    }
  };
}

/**
 * Get company tier info with usage stats
 */
export async function getCompanyTierInfo(companyId: string): Promise<{
  tier: SubscriptionTier;
  limits: TierLimits;
  usage: {
    users: number;
    projects: number;
    storageGB: number;
  };
}> {
  const [company] = await db
    .select({
      billingplan: companies.billingplan,
      maxusers: companies.maxusers,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  if (!company) {
    throw new Error("Company not found");
  }

  const tier = (company.billingplan as SubscriptionTier) || "FREE";
  const config = getTierConfig(tier);

  // Get user count
  const [userResult] = await db
    .select({ count: count() })
    .from(userprofiles)
    .where(eq(userprofiles.companyid, companyId));

  return {
    tier,
    limits: config,
    usage: {
      users: userResult?.count || 0,
      projects: 0, // TODO: Query projects
      storageGB: 0, // TODO: Calculate storage
    },
  };
}
