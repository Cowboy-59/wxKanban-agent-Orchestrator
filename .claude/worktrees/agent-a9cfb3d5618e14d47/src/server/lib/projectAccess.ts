/**
 * Project access helpers — spec 011 Access Control.
 *
 * "Assigned to a project" means either:
 *   - a row in `projectusers` with removedat IS NULL, OR
 *   - the user is listed as `assigneduserid` on at least one IN-PROGRESS phase
 *     of the project.
 *
 * The in-progress filter matches ProjectService.getUserProjects — the same
 * rule that controls whether the project shows up on the user's dashboard.
 * "I can see this project on my dashboard" ⇔ "I can build/download its kit".
 */

import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { projectusers } from '../../db/schema/projectuser.js';
import { projectphases } from '../../db/schema/projectphase.js';

export async function isUserAssignedToProject(
  userid: string,
  projectid: string
): Promise<boolean> {
  const [pu] = await db
    .select({ id: projectusers.id })
    .from(projectusers)
    .where(
      and(
        eq(projectusers.projectid, projectid),
        eq(projectusers.userid, userid),
        isNull(projectusers.removedat)
      )
    )
    .limit(1);
  if (pu) return true;

  const [ph] = await db
    .select({ id: projectphases.id })
    .from(projectphases)
    .where(
      and(
        eq(projectphases.projectid, projectid),
        eq(projectphases.assigneduserid, userid),
        eq(projectphases.status, 'in_progress')
      )
    )
    .limit(1);
  return !!ph;
}

// [SCOPE 143 / T031] BEGIN — a company reaches a project it owns or is engaged on (FR-019)
/**
 * True when `companyid` owns the project, or has a live engagement on it: an engagement between
 * the two companies that is not ended, with an assignment on this project that is not removed.
 * The same test as TimeBillingProjectAccess (SPEC-005 FR-014). Used by the kit routes so a
 * consultant can view, generate, download and upgrade an engaged client project's kit; every
 * other company is still answered 404 by the caller.
 */
export async function companyReachesProject(
  companyid: string | undefined,
  project: { id: string; companyid: string }
): Promise<boolean> {
  if (!companyid) return false;
  if (project.companyid === companyid) return true;
  const result = await db.execute(sql`
    SELECT 1
      FROM engagementassignments ea
      JOIN engagements e ON e.id = ea.engagementid
     WHERE ea.projectid = ${project.id}
       AND ea.removedat IS NULL
       AND e.consultingcompanyid = ${companyid}
       AND e.clientcompanyid = ${project.companyid}
       AND e.state <> 'ended'
     LIMIT 1
  `);
  return result.rows.length > 0;
}
// [SCOPE 143 / T031] END

/**
 * Spec 011 Access Control: ADMIN always allowed; others only when assigned.
 */
export async function canManageProjectKit(
  userid: string,
  projectid: string,
  isAdmin: boolean
): Promise<boolean> {
  if (isAdmin) return true;
  return isUserAssignedToProject(userid, projectid);
}
