/**
 * Company Invariants
 * Spec 037 — Consultants Management (Engagement Core), FR-028
 *
 * Cross-cutting business invariants that span Companies. Currently:
 * at-least-one-active-ADMIN per Company. Surfaced through the consultant
 * onboarding flow but applies generally — both Client and Consulting
 * Companies must satisfy it.
 *
 * These helpers should be called from any path that could change a user's
 * role or active flag:
 *   - team-role.ts (role-change endpoints)
 *   - admin.ts user deactivation
 *   - any future user-management code
 *
 * They throw on violation; callers translate to HTTP 409.
 */

import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { userprofiles } from "../../db/schema/index.js";
import { sqlEqU } from "../lib/sqlHelpers.js";

// [SCOPE 037 / T034] BEGIN — InvariantViolationError
export class InvariantViolationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "InvariantViolationError";
    this.code = code;
  }
}
// [SCOPE 037 / T034] END

// [SCOPE 037 / T034] BEGIN — countActiveAdmins
/**
 * Count active ADMINs in a Company, optionally excluding one userId
 * (used when checking "would removing/demoting this user leave zero ADMINs?").
 */
export async function countActiveAdmins(
  companyId: string,
  excludingUserId?: string,
): Promise<number> {
  const baseConditions = [
    sqlEqU(userprofiles.companyid, companyId),
    eq(userprofiles.usertype, "ADMIN"),
    eq(userprofiles.active, true),
  ];
  if (excludingUserId) {
    baseConditions.push(sql`${userprofiles.id} != ${excludingUserId}::uuid`);
  }

  const rows = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(userprofiles)
    .where(and(...baseConditions));

  return rows[0]?.count ?? 0;
}
// [SCOPE 037 / T034] END

// [SCOPE 037 / T034] BEGIN — assertCompanyHasAtLeastOneAdmin
/**
 * Throws InvariantViolationError if removing/demoting/deactivating the given
 * user would leave the Company with zero active ADMINs. Call BEFORE applying
 * the change.
 *
 * Acceptable usage patterns:
 *   - role-change to non-ADMIN: pass userId of the user being demoted
 *   - deactivation: pass userId of the user being deactivated
 *   - bulk operations: call for each affected user before applying any
 */
export async function assertCompanyHasAtLeastOneAdmin(
  companyId: string,
  changingUserId: string,
): Promise<void> {
  const remaining = await countActiveAdmins(companyId, changingUserId);
  if (remaining < 1) {
    throw new InvariantViolationError(
      "LAST_ADMIN_REMOVAL_DENIED",
      "Cannot remove the last active ADMIN of this Company. Promote another member to ADMIN first.",
    );
  }
}
// [SCOPE 037 / T034] END
