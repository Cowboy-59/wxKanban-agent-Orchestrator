/**
 * EngagementModificationQueue
 * Spec 037 — T028 / FR-005 AC4
 *
 * Queue assignment modifications attempted during paused/disabled state;
 * drain on resume/enable transitions. Pure functions over the
 * `engagementmodifications` table — no Express dependencies — so callers can
 * be route handlers OR the state-machine transition helper.
 *
 * Supported operation types:
 *   - ADD_ASSIGNMENT      → engagementassignments INSERT
 *   - REMOVE_ASSIGNMENT   → engagementassignments UPDATE (soft-delete)
 *   - SUBASSIGN           → subassignments INSERT
 *   - REMOVE_SUBASSIGNMENT→ subassignments UPDATE (soft-delete)
 *
 * On drain failure for a specific row: that row gets `failedat` + error
 * stamped, drain continues. Operator triages via the engagement audit log.
 */

import { and, eq, isNull } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { db } from "../db/client.js";
import { sqlEqU } from "../lib/sqlHelpers.js";
import {
  engagementmodifications,
  engagementassignments,
  subassignments,
  projecttasks,
  companyprojects,
} from "../../db/schema/index.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("engagement-modification-queue");

export type ModificationOp =
  | "ADD_ASSIGNMENT"
  | "REMOVE_ASSIGNMENT"
  | "SUBASSIGN"
  | "REMOVE_SUBASSIGNMENT";

export interface AddAssignmentPayload {
  scopeid: string | null;
  taskid: string | null;
  projectid: string;
}
export interface RemoveAssignmentPayload {
  assignmentId: string;
}
export interface SubassignPayload {
  engagementassignmentid: string;
  consultingmemberid: string;
}
export interface RemoveSubassignmentPayload {
  subassignmentId: string;
}

// [SCOPE 037 / T028] BEGIN — enqueue
export async function enqueueModification(params: {
  engagementId: string;
  operationType: ModificationOp;
  payload: object;
  queuedByUserId: string;
}): Promise<{ id: string; queuedAt: Date }> {
  const id = uuidv7();
  const queuedAt = new Date();
  await db.insert(engagementmodifications).values({
    id,
    engagementid: params.engagementId,
    operationtype: params.operationType,
    payload: params.payload,
    queuedat: queuedAt,
    queuedbyid: params.queuedByUserId,
  });
  logger.info(
    {
      modificationId: id,
      engagementId: params.engagementId,
      operationType: params.operationType,
    },
    "Engagement modification queued",
  );
  return { id, queuedAt };
}
// [SCOPE 037 / T028] END

// [SCOPE 037 / T028] BEGIN — drainPendingModifications
/**
 * Drain all pending (appliedat IS NULL AND failedat IS NULL) modifications
 * for an engagement, in queuedat order. Apply each against the live data
 * (engagementassignments / subassignments). Returns counts: { applied, failed }.
 *
 * Called from runStateTransition when transitioning TO 'active' (resume or enable).
 * If the engagement is no longer active by the time drain runs, no-ops (caller
 * shouldn't have invoked it).
 */
export async function drainPendingModifications(params: {
  engagementId: string;
  clientCompanyId: string;
}): Promise<{ applied: number; failed: number }> {
  const pending = await db
    .select()
    .from(engagementmodifications)
    .where(
      and(
        sqlEqU(engagementmodifications.engagementid, params.engagementId),
        isNull(engagementmodifications.appliedat),
        isNull(engagementmodifications.failedat),
      ),
    )
    .orderBy(engagementmodifications.queuedat);

  let applied = 0;
  let failed = 0;
  for (const m of pending) {
    try {
      switch (m.operationtype as ModificationOp) {
        case "ADD_ASSIGNMENT": {
          const p = m.payload as AddAssignmentPayload;
          // Re-validate at apply time — the project might have been deleted,
          // or the task might no longer belong to the project. Skip with
          // failedat in that case so the operator sees the error.
          const projRows = await db
            .select({ id: companyprojects.id, companyid: companyprojects.companyid })
            .from(companyprojects)
            .where(sqlEqU(companyprojects.id, p.projectid))
            .limit(1);
          if (projRows.length === 0) {
            throw new Error("project not found");
          }
          if (projRows[0].companyid !== params.clientCompanyId) {
            throw new Error("project no longer owned by Client Company");
          }
          if (p.taskid) {
            const taskRows = await db
              .select({ id: projecttasks.id, projectid: projecttasks.projectid })
              .from(projecttasks)
              .where(sqlEqU(projecttasks.id, p.taskid))
              .limit(1);
            if (taskRows.length === 0) throw new Error("task not found");
            if (taskRows[0].projectid !== p.projectid) {
              throw new Error("task no longer in project");
            }
          }
          await db.insert(engagementassignments).values({
            id: uuidv7(),
            engagementid: params.engagementId,
            scopeid: p.scopeid ?? null,
            taskid: p.taskid ?? null,
            projectid: p.projectid,
            addedat: new Date(),
            addedbyid: m.queuedbyid,
          });
          break;
        }
        case "REMOVE_ASSIGNMENT": {
          const p = m.payload as RemoveAssignmentPayload;
          await db
            .update(engagementassignments)
            .set({ removedat: new Date(), removedbyid: m.queuedbyid })
            .where(
              and(
                sqlEqU(engagementassignments.id, p.assignmentId),
                sqlEqU(engagementassignments.engagementid, params.engagementId),
                isNull(engagementassignments.removedat),
              ),
            );
          break;
        }
        case "SUBASSIGN": {
          const p = m.payload as SubassignPayload;
          await db.insert(subassignments).values({
            id: uuidv7(),
            engagementassignmentid: p.engagementassignmentid,
            consultingmemberid: p.consultingmemberid,
            assignedat: new Date(),
            assignedbyid: m.queuedbyid,
          });
          break;
        }
        case "REMOVE_SUBASSIGNMENT": {
          const p = m.payload as RemoveSubassignmentPayload;
          await db
            .update(subassignments)
            .set({ removedat: new Date(), removedbyid: m.queuedbyid })
            .where(
              and(
                sqlEqU(subassignments.id, p.subassignmentId),
                isNull(subassignments.removedat),
              ),
            );
          break;
        }
        default:
          throw new Error(`unknown operationtype: ${m.operationtype}`);
      }

      await db
        .update(engagementmodifications)
        .set({ appliedat: new Date() })
        .where(sqlEqU(engagementmodifications.id, m.id));
      applied += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db
        .update(engagementmodifications)
        .set({ failedat: new Date(), erroredwith: message })
        .where(sqlEqU(engagementmodifications.id, m.id));
      logger.error(
        {
          modificationId: m.id,
          engagementId: params.engagementId,
          operationType: m.operationtype,
          error: message,
        },
        "Engagement modification drain failed for row",
      );
      failed += 1;
    }
  }

  if (applied > 0 || failed > 0) {
    logger.info(
      {
        engagementId: params.engagementId,
        applied,
        failed,
        total: pending.length,
      },
      "Engagement modification queue drained",
    );
  }

  return { applied, failed };
}
// [SCOPE 037 / T028] END
