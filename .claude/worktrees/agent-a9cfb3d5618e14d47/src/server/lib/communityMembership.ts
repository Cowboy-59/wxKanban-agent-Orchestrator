/**
 * Community session gate — SPEC-144 (SCOPE-144) T002, FR-009 / FR-010.
 *
 * Who may open a YappChatt session through POST /api/community/session with a company's
 * app token: an active user of that company, or a current consulting member (contract D2)
 * on one of its projects. Kept apart from the route so the route is tested with this
 * module stubbed — the repo `.env` points at production.
 *
 * Reads only columns that exist in production today, so it ships ahead of the rest of
 * SPEC-144 (release order 1).
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "~/db/client.js";
import { userprofiles } from "~/db/schema/userprofiles.js";
import { companyprojects } from "~/db/schema/companyproject.js";
import { companyauditlogs } from "~/db/schema/companyauditlog.js";
import { engagements } from "~/db/schema/engagement.js";
import { engagementassignments } from "~/db/schema/engagementassignment.js";
import { subassignments } from "~/db/schema/subassignment.js";
import { sqlEqU } from "~/server/lib/sqlHelpers.js";
import { createLogger } from "~/server/lib/logger.js";

const logger = createLogger("community-membership");

// [SCOPE 144 / T002] BEGIN — community session membership check (FR-009, contract C3 + D2)
export const NOT_COMPANY_MEMBER_MESSAGE = "This email isn't a member of your company";

/** Consulting-company roles that cover all of their company's assigned projects (D2, amended). */
export const CONSULTING_MANAGER_TYPES = ["ADMIN", "TEAM_MANAGER"];

/** `email` is already trimmed and lower-cased by the caller. */
export async function isCompanyMemberEmail(companyId: string, email: string): Promise<boolean> {
  const sameEmail = sql`lower(trim(${userprofiles.emailaddr})) = ${email}`;

  const [own] = await db
    .select({ id: userprofiles.id })
    .from(userprofiles)
    .where(and(sqlEqU(userprofiles.companyid, companyId), eq(userprofiles.active, true), sameEmail))
    .limit(1);
  if (own) return true;

  // D2 (1): an active subassignment on an active engagement assignment, on one of the
  // company's projects, under an engagement in state `active`.
  const [consultant] = await db
    .select({ id: userprofiles.id })
    .from(subassignments)
    .innerJoin(engagementassignments, eq(subassignments.engagementassignmentid, engagementassignments.id))
    .innerJoin(engagements, eq(engagements.id, engagementassignments.engagementid))
    .innerJoin(companyprojects, eq(companyprojects.id, engagementassignments.projectid))
    .innerJoin(userprofiles, eq(userprofiles.id, subassignments.consultingmemberid))
    .where(
      and(
        sqlEqU(engagements.clientcompanyid, companyId),
        sqlEqU(companyprojects.companyid, companyId),
        eq(engagements.state, "active"),
        isNull(subassignments.removedat),
        isNull(engagementassignments.removedat),
        eq(userprofiles.active, true),
        sameEmail,
      ),
    )
    .limit(1);
  if (consultant) return true;

  // D2 (2), amended: the consulting company's ADMINs and TEAM_MANAGERs cover every project
  // their company holds a live assignment on under an active engagement, no subassignment.
  const [manager] = await db
    .select({ id: userprofiles.id })
    .from(userprofiles)
    .innerJoin(engagements, eq(engagements.consultingcompanyid, userprofiles.companyid))
    .innerJoin(engagementassignments, eq(engagementassignments.engagementid, engagements.id))
    .innerJoin(companyprojects, eq(companyprojects.id, engagementassignments.projectid))
    .where(
      and(
        sqlEqU(engagements.clientcompanyid, companyId),
        sqlEqU(companyprojects.companyid, companyId),
        eq(engagements.state, "active"),
        isNull(engagementassignments.removedat),
        eq(userprofiles.active, true),
        inArray(userprofiles.usertype, CONSULTING_MANAGER_TYPES),
        sameEmail,
      ),
    )
    .limit(1);
  return Boolean(manager);
}
// [SCOPE 144 / T002] END

// [SCOPE 144 / T013] BEGIN — audit a refused community session (FR-010)
export interface RefusedSession {
  companyId: string;
  email: string;
  projectId: string;
  tokenId: string;
  ip: string;
}

/** One `yappchatt.session.refused` row. Never the token or the secret. A write failure is logged, not thrown. */
export async function auditRefusedSession(r: RefusedSession): Promise<void> {
  try {
    await db.insert(companyauditlogs).values({
      companyid: r.companyId,
      action: "yappchatt.session.refused",
      changedby: null,
      newvalue: { email: r.email, projectid: r.projectId, tokenid: r.tokenId, ip: r.ip },
      description: `Community session refused: ${r.email} is not a member of this company`,
    });
  } catch (err) {
    logger.error({ companyId: r.companyId, err: (err as Error).message }, "session-refused audit write failed");
  }
}
// [SCOPE 144 / T013] END
