/**
 * SPEC-056 / T001 — the single effective-stack resolution point.
 *
 * Pure resolver extracted from the project.get_stack handler so the priority
 * chain is unit-testable without a DB or HTTP layer (mirrors the cockpit-summary
 * pattern). The handler fetches the candidate documents (already scoped to the
 * token's project / company) and hands them here.
 *
 * Priority (FR-006): project `ProjectStack` doc -> company-wide profile (by app
 * type) -> null. A null result means "no stack" -> the kit built-in default,
 * which is today's behaviour (no-regression fallback, FR-006 / T005). The
 * company tier is supplied by SPEC-057; until it lands the handler passes null
 * for `companyProfile` and resolution falls straight through to the project tier.
 */

// [SCOPE 056 / T001] BEGIN — effective-stack resolver (project -> company -> built-in)
export type StackSource = "project" | "company";

/** A candidate stack/style document (the markdown is the source of truth). */
export interface StackDocInput {
  content: string;
  updatedAt: Date | string | null;
}

/** The resolved winning stack plus which tier it came from. */
export interface ResolvedStack {
  content: string;
  updatedAt: Date | string | null;
  source: StackSource;
}

/**
 * Resolve the effective stack from the candidate tiers in priority order.
 * Returns null when nothing resolves (caller falls back to today's behaviour).
 */
export function resolveEffectiveStack(
  projectDoc: StackDocInput | null | undefined,
  companyProfile: StackDocInput | null | undefined,
): ResolvedStack | null {
  if (projectDoc?.content) {
    return { content: projectDoc.content, updatedAt: projectDoc.updatedAt, source: "project" };
  }
  if (companyProfile?.content) {
    return { content: companyProfile.content, updatedAt: companyProfile.updatedAt, source: "company" };
  }
  return null;
}
// [SCOPE 056 / T001] END
