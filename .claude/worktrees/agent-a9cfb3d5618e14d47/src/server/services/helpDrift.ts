// [SCOPE 084 / T002] BEGIN — Help catalog ↔ tier-model drift check
//
// The Help catalog (src/shared/help/catalog.ts) is the CUSTOMER-FACING source of
// record for what each plan includes. This check compares it against the code's
// canonical tier feature flags (TierEnforcementService.TIER_CONFIG) and reports
// every divergence. Two divergences are KNOWN and ACCEPTED per SCOPE-084 (the
// code flags are the bug, not the catalog); any OTHER divergence is a real drift
// that must be reconciled — the T009 test fails on unexpected drift.

import { HELP_FEATURES, PLANS, type PlanId } from "../../shared/help/catalog.js";
import { TIER_CONFIG, type SubscriptionTier } from "./TierEnforcementService.js";

/** Maps a catalog feature id → the TierEnforcementService feature flag it mirrors
 *  (or null when the feature has no code-flag equivalent and is not drift-checked). */
export const FEATURE_FLAG_MAP: Record<string, string | null> = {
  tasks: "task_management",
  pmIntegrations: "pm_integration",
  timeTracking: "time_tracking",
  reports: "advanced_reporting",
  invoices: "invoice_generation",
  clientPortal: "client_portal",
  sso: "sso",
  advancedSecurity: "advanced_security",
  dedicatedSupport: "dedicated_support",
  customIntegrations: "custom_integrations",
};

export type DriftKind = "min_plan_mismatch" | "non_monotonic_flag";

export interface Drift {
  featureId: string;
  flag: string;
  kind: DriftKind;
  catalogMinPlan: PlanId;
  codeMinPlan: PlanId | null;
  detail: string;
  accepted: boolean;
  reason?: string;
}

/** Known, accepted divergences — the code flags are wrong, the catalog is right. */
const ACCEPTED: Array<{ featureId: string; kind: DriftKind; reason: string }> = [
  {
    featureId: "timeTracking",
    kind: "min_plan_mismatch",
    reason:
      "SCOPE-084: Time Tracking & Billing is Consultant+. TierEnforcementService wrongly flags time_tracking on SMALL_BUSINESS — a code bug to reconcile separately.",
  },
  {
    featureId: "pmIntegrations",
    kind: "non_monotonic_flag",
    reason:
      "SCOPE-084: TierEnforcementService omits pm_integration from SMALL_BUSINESS though it is present on SINGLE_USER (and Consultant+) — a code bug to reconcile separately.",
  },
];

// The four public plans in ascending order (FREE is internal and not shown).
const PUBLIC_TIERS_ASC: PlanId[] = [...PLANS].sort((a, b) => a.order - b.order).map((p) => p.id);
const ORDER: Record<PlanId, number> = Object.fromEntries(PLANS.map((p) => [p.id, p.order])) as Record<PlanId, number>;

function tierHasFlag(tier: PlanId, flag: string): boolean {
  const cfg = TIER_CONFIG[tier as SubscriptionTier];
  return !!cfg && cfg.features.includes(flag);
}

/** Lowest public plan whose TIER_CONFIG includes the flag, or null if none do. */
function codeMinPlanFor(flag: string): PlanId | null {
  for (const tier of PUBLIC_TIERS_ASC) {
    if (tierHasFlag(tier, flag)) return tier;
  }
  return null;
}

/** True when the flag is present at a lower plan but absent at a higher one. */
function isNonMonotonic(flag: string): boolean {
  let seen = false;
  for (const tier of PUBLIC_TIERS_ASC) {
    const has = tierHasFlag(tier, flag);
    if (seen && !has) return true;
    if (has) seen = true;
  }
  return false;
}

function acceptedFor(featureId: string, kind: DriftKind): { accepted: boolean; reason?: string } {
  const hit = ACCEPTED.find((a) => a.featureId === featureId && a.kind === kind);
  return hit ? { accepted: true, reason: hit.reason } : { accepted: false };
}

/** Compare the catalog to the code tier flags. Returns every divergence found. */
export function checkHelpDrift(): Drift[] {
  const drifts: Drift[] = [];

  for (const feature of HELP_FEATURES) {
    const flag = FEATURE_FLAG_MAP[feature.id];
    if (!flag) continue; // no code-flag equivalent → not drift-checked

    // 1) non-monotonic flag (present low, missing high) — a code anomaly
    if (isNonMonotonic(flag)) {
      const { accepted, reason } = acceptedFor(feature.id, "non_monotonic_flag");
      drifts.push({
        featureId: feature.id,
        flag,
        kind: "non_monotonic_flag",
        catalogMinPlan: feature.minPlan,
        codeMinPlan: codeMinPlanFor(flag),
        detail: `Flag "${flag}" is not monotonic across plans (present at a lower plan, absent at a higher one).`,
        accepted,
        reason,
      });
      continue;
    }

    // 2) min-plan mismatch — catalog's lowest plan differs from the code flag's
    const codeMin = codeMinPlanFor(flag);
    if (codeMin && ORDER[codeMin] !== ORDER[feature.minPlan]) {
      const { accepted, reason } = acceptedFor(feature.id, "min_plan_mismatch");
      drifts.push({
        featureId: feature.id,
        flag,
        kind: "min_plan_mismatch",
        catalogMinPlan: feature.minPlan,
        codeMinPlan: codeMin,
        detail: `Catalog minPlan is ${feature.minPlan}; code flag "${flag}" first appears at ${codeMin}.`,
        accepted,
        reason,
      });
    }
  }

  return drifts;
}

/** Only the divergences that are NOT accepted — these are real drift to fix. */
export function unexpectedHelpDrift(): Drift[] {
  return checkHelpDrift().filter((d) => !d.accepted);
}
// [SCOPE 084 / T002] END
