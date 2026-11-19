/**
 * Engagement Visibility Service
 * Spec 037 — Consultants Management (Engagement Core), FR-011 / FR-013 / SC-3
 *
 * Pure-function helpers that determine whether a Consulting Member has access
 * to a specific Task or Scope through their Company's active Engagements.
 *
 * Designed to be called from existing endpoints (tasks.ts, lifecycle.ts,
 * notes.ts, etc.) when the caller's primary Company is a CONSULTANT-plan
 * tenant. Non-consultants follow normal team-member permission rules
 * (Engagements are irrelevant to them).
 *
 * Integration follow-ups (T036, T037):
 *   - tasks.ts: gate GET/PATCH/DELETE on tasks
 *   - timeTracking.ts: gate POST /time-entries on consulting members
 *   - lifecycle.ts: deny manual phase-advance for consultants on any path
 *
 * Both helpers fail-closed: if the user isn't a Consulting Member with an
 * active sub-assignment that covers the resource, access is denied.
 */

import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "../db/client.js";
import { sqlEqU } from "../lib/sqlHelpers.js";
import {
  engagements,
  engagementassignments,
  subassignments,
  projecttasks,
  projectspecifications,
  userprofiles,
  companies,
} from "../../db/schema/index.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("engagement-visibility");

// [SCOPE 037 / T035] BEGIN — isUserAConsultingMember
/**
 * Returns true if the user's primary Company is on the CONSULTANT plan.
 * Cheap check used to decide whether to apply consultant-visibility rules
 * vs. fall through to normal team-member rules.
 */
export async function isUserAConsultingMember(
  userId: string,
): Promise<boolean> {
  const rows = await db
    .select({
      companyid: userprofiles.companyid,
      billingplan: companies.billingplan,
    })
    .from(userprofiles)
    .innerJoin(companies, eq(companies.id, userprofiles.companyid))
    .where(sqlEqU(userprofiles.id, userId))
    .limit(1);
  if (rows.length === 0) return false;
  return rows[0].billingplan === "CONSULTANT";
}
// [SCOPE 037 / T035] END

// [SCOPE 037 / T035] BEGIN — canConsultantAccessTask
/**
 * Returns true if the Consulting Member has an active sub-assignment that
 * covers the given task — either directly (task-level grant) or transitively
 * through a scope-level grant on the task's scope.
 *
 * Rules (FR-011):
 *   1. Sub-assignment must be active (subassignments.removedat IS NULL).
 *   2. Its engagement-assignment must be active (engagementassignments.removedat IS NULL).
 *   3. The parent engagement must be in 'active' state (not paused/disabled/ended).
 *      Note: reads remain allowed in paused/disabled/ended per FR-004 AC2 — but
 *      this helper is for general "can they see/touch" so we restrict to active
 *      for write operations. Callers needing read-during-paused should use the
 *      `forRead=true` variant.
 *   4. Task-level match: subassignment → engagementassignment with taskid = X
 *   5. Scope-level match: subassignment → engagementassignment with scopeid = task.scopeid
 *
 * Caller should already have established the user is a Consulting Member via
 * isUserAConsultingMember; this function does NOT re-check that.
 */
export async function canConsultantAccessTask(
  userId: string,
  taskId: string,
  options: { forRead?: boolean } = {},
): Promise<boolean> {
  // Look up the task to get its project for project-level grant matching.
  const taskRows = await db
    .select({
      id: projecttasks.id,
      projectid: projecttasks.projectid,
    })
    .from(projecttasks)
    .where(sqlEqU(projecttasks.id, taskId))
    .limit(1);

  if (taskRows.length === 0) return false;
  const taskProjectId = taskRows[0].projectid;

  const stateFilter = options.forRead
    ? or(
        eq(engagements.state, "active"),
        eq(engagements.state, "paused"),
        eq(engagements.state, "disabled"),
        eq(engagements.state, "ended"),
      )
    : eq(engagements.state, "active");

  // Two grant paths give access:
  //   1. Task-level: engagementassignments.taskid = X
  //   2. Project-level: scopeid IS NULL AND taskid IS NULL AND projectid = task's project
  // (Scope-level match would be a third branch once projecttasks.scopeid is
  // first-class — see FR-027 caveat.)
  const matches = await db
    .select({ id: subassignments.id })
    .from(subassignments)
    .innerJoin(
      engagementassignments,
      eq(subassignments.engagementassignmentid, engagementassignments.id),
    )
    .innerJoin(engagements, eq(engagements.id, engagementassignments.engagementid))
    .where(
      and(
        sqlEqU(subassignments.consultingmemberid, userId),
        isNull(subassignments.removedat),
        isNull(engagementassignments.removedat),
        or(
          sqlEqU(engagementassignments.taskid, taskId),
          and(
            isNull(engagementassignments.scopeid),
            isNull(engagementassignments.taskid),
            sqlEqU(engagementassignments.projectid, taskProjectId),
          ),
        ),
        stateFilter,
      ),
    )
    .limit(1);

  return matches.length > 0;
}
// [SCOPE 037 / T035] END

// [SCOPE 037 / T035] BEGIN — canConsultantAccessScope
/**
 * Returns true if the Consulting Member has an active sub-assignment that
 * covers the given scope at scope-level. (Task-level grants for tasks within
 * the scope do NOT grant scope-document visibility — only scope-level grants do.)
 */
export async function canConsultantAccessScope(
  userId: string,
  scopeId: string,
  options: { forRead?: boolean } = {},
): Promise<boolean> {
  const stateFilter = options.forRead
    ? or(
        eq(engagements.state, "active"),
        eq(engagements.state, "paused"),
        eq(engagements.state, "disabled"),
        eq(engagements.state, "ended"),
      )
    : eq(engagements.state, "active");

  // Direct scope-level grant.
  const scopeMatches = await db
    .select({ id: subassignments.id })
    .from(subassignments)
    .innerJoin(
      engagementassignments,
      eq(subassignments.engagementassignmentid, engagementassignments.id),
    )
    .innerJoin(engagements, eq(engagements.id, engagementassignments.engagementid))
    .where(
      and(
        sqlEqU(subassignments.consultingmemberid, userId),
        isNull(subassignments.removedat),
        isNull(engagementassignments.removedat),
        eq(engagementassignments.scopeid, scopeId),
        stateFilter,
      ),
    )
    .limit(1);

  if (scopeMatches.length > 0) return true;

  // Project-level grant: the user's engagement has a project-level assignment
  // on a project that contains this scope (matched by specnumber).
  const projectMatches = await db
    .select({ id: subassignments.id })
    .from(subassignments)
    .innerJoin(
      engagementassignments,
      eq(subassignments.engagementassignmentid, engagementassignments.id),
    )
    .innerJoin(engagements, eq(engagements.id, engagementassignments.engagementid))
    .innerJoin(
      projectspecifications,
      and(
        eq(projectspecifications.projectid, engagementassignments.projectid),
        eq(projectspecifications.specnumber, scopeId),
      ),
    )
    .where(
      and(
        sqlEqU(subassignments.consultingmemberid, userId),
        isNull(subassignments.removedat),
        isNull(engagementassignments.removedat),
        isNull(engagementassignments.scopeid),
        isNull(engagementassignments.taskid),
        stateFilter,
      ),
    )
    .limit(1);

  return projectMatches.length > 0;
}
// [SCOPE 037 / T035] END

// [SCOPE 037 / T037] BEGIN — assertConsultantCannotAdvancePhase
/**
 * FR-013 AC2 / FR-014: Consulting Members are ALWAYS denied manual lifecycle
 * phase advancement. Auto-advance via existing automation (all tasks complete
 * → next phase) is the only path. Call from lifecycle.ts handlers.
 *
 * Throws with code 'CONSULTANT_PHASE_ADVANCE_DENIED' if the caller is a
 * Consulting Member; otherwise resolves silently.
 */
export async function assertConsultantCannotAdvancePhase(
  userId: string,
): Promise<void> {
  const isConsultant = await isUserAConsultingMember(userId);
  if (isConsultant) {
    logger.warn(
      { userId },
      "Consultant attempted manual lifecycle phase advancement — denied",
    );
    throw Object.assign(
      new Error("Consultants cannot manually advance lifecycle phases"),
      { code: "CONSULTANT_PHASE_ADVANCE_DENIED" },
    );
  }
}
// [SCOPE 037 / T037] END
