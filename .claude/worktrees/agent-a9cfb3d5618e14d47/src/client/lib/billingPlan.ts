/**
 * Billing plan display helpers.
 * Raw `billingplan` values in the DB are SCREAMING_SNAKE_CASE
 * ('FREE', 'SMALL_BUSINESS', 'CONSULTANT', 'ENTERPRISE').
 * The UI shows them in Title Case.
 */

const LABELS: Record<string, string> = {
  FREE: "Free",
  SINGLE_USER: "Single User",
  CONSULTANT: "Consultant",
  SMALL_BUSINESS: "Small Business",
  ENTERPRISE: "Enterprise",
};

export function formatBillingPlan(raw: string | null | undefined): string {
  if (!raw) return "Free";
  return LABELS[raw] ?? raw;
}
