/**
 * Engagement Context Resolver Middleware
 * Spec 037 — Consultants Management (Engagement Core)
 *
 * Determines whether the authenticated caller is acting from the Client side
 * or the Consulting Company side of a given Engagement, based on their
 * primary `companyid` and the engagement's two foreign keys.
 *
 * Attached after authenticateToken on any route that has `:id` as the
 * engagement identifier. Sets `req.engagementContext` for downstream handlers.
 *
 * Centralizing this resolution prevents the kind of role-mixing bug that
 * would otherwise have to be re-derived in every handler.
 */

import { Response, NextFunction } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { engagements, type Engagement } from "../../db/schema/index.js";
import { AuthRequest } from "./auth.js";
import { createLogger } from "../lib/logger.js";
import { expandError } from "../lib/sqlHelpers.js";

const logger = createLogger("engagement-context");

export type EngagementRole = "client" | "consulting";

export interface EngagementContext {
  role: EngagementRole;
  engagement: Engagement;
}

export interface EngagementAuthRequest extends AuthRequest {
  engagementContext?: EngagementContext;
}

// [SCOPE 037 / T010] BEGIN — resolveEngagementContext middleware
export async function resolveEngagementContext(
  req: EngagementAuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const engagementId = req.params.id;
  if (!engagementId) {
    res.status(400).json({
      code: "ENGAGEMENT_ID_REQUIRED",
      error: "Engagement id required in path",
    });
    return;
  }

  const userCompanyId = req.companyid;
  if (!userCompanyId) {
    res.status(401).json({
      code: "UNAUTHORIZED",
      error: "Not authenticated",
    });
    return;
  }

  try {
    // Explicit ::uuid cast — prod Postgres rejects `uuid = text` when the pg
    // driver sends the string param without OID info. Same fix pattern as
    // routes/engagements.ts T022.
    const rows = await db
      .select()
      .from(engagements)
      .where(sql`${engagements.id} = ${engagementId}::uuid`)
      .limit(1);

    if (rows.length === 0) {
      res.status(404).json({
        code: "ENGAGEMENT_NOT_FOUND",
        error: "Engagement not found",
      });
      return;
    }

    const engagement = rows[0];

    let role: EngagementRole;
    if (engagement.clientcompanyid === userCompanyId) {
      role = "client";
    } else if (engagement.consultingcompanyid === userCompanyId) {
      role = "consulting";
    } else {
      logger.warn(
        {
          engagementId,
          callerCompanyId: userCompanyId,
        },
        "Caller is not a party to this engagement",
      );
      res.status(403).json({
        code: "NOT_A_PARTY",
        error: "Your company is not a party to this engagement",
      });
      return;
    }

    req.engagementContext = { role, engagement };
    next();
  } catch (error) {
    const expanded = expandError(error);
    logger.error(
      { error: expanded, engagementId },
      "Engagement context error",
    );
    res.status(500).json({
      code: "ENGAGEMENT_CONTEXT_ERROR",
      error: expanded.message,
      details: expanded,
    });
  }
}
// [SCOPE 037 / T010] END

/**
 * Convenience guard: requires the caller is on the Client side of the engagement.
 * Use after resolveEngagementContext on Client-only endpoints (assignment add/remove,
 * lifecycle transitions, etc.).
 */
// [SCOPE 037 / T010] BEGIN — requireClientSide guard
export function requireClientSide(
  req: EngagementAuthRequest,
  res: Response,
  next: NextFunction,
): void {
  if (req.engagementContext?.role !== "client") {
    res.status(403).json({
      code: "CLIENT_SIDE_REQUIRED",
      error: "Only the Client Company can perform this action",
    });
    return;
  }
  next();
}
// [SCOPE 037 / T010] END

/**
 * Stricter guard: requires Client-side ADMIN of the Client Company. Used on
 * lifecycle transitions (FR-004 AC1) and assignment add/remove (FR-005 AC1) —
 * these are explicitly ADMIN-only operations, not just any Client member.
 */
// [SCOPE 037 / T010] BEGIN — requireClientAdmin guard
export function requireClientAdmin(
  req: EngagementAuthRequest,
  res: Response,
  next: NextFunction,
): void {
  if (req.engagementContext?.role !== "client") {
    res.status(403).json({
      code: "CLIENT_SIDE_REQUIRED",
      error: "Only the Client Company can perform this action",
    });
    return;
  }
  if (req.usertype !== "ADMIN") {
    res.status(403).json({
      code: "CLIENT_ADMIN_REQUIRED",
      error: "Only the Client Company's ADMIN can perform this action",
    });
    return;
  }
  next();
}
// [SCOPE 037 / T010] END

/**
 * Convenience guard: requires the caller is on the Consulting Co. side of the engagement.
 * Use after resolveEngagementContext on Consulting-only endpoints (sub-assignment,
 * invoice generation, etc.).
 */
// [SCOPE 037 / T010] BEGIN — requireConsultingSide guard
export function requireConsultingSide(
  req: EngagementAuthRequest,
  res: Response,
  next: NextFunction,
): void {
  if (req.engagementContext?.role !== "consulting") {
    res.status(403).json({
      code: "CONSULTING_SIDE_REQUIRED",
      error: "Only the Consulting Company can perform this action",
    });
    return;
  }
  next();
}
// [SCOPE 037 / T010] END

/**
 * Stricter guard: requires Consulting-side ADMIN or TEAM_MANAGER. Used for
 * sub-assignment operations (FR-009): only ADMIN or TEAM_MANAGER inside the
 * Consulting Company can distribute work to members.
 */
// [SCOPE 037 / T010] BEGIN — requireConsultingAdminOrManager guard
export function requireConsultingAdminOrManager(
  req: EngagementAuthRequest,
  res: Response,
  next: NextFunction,
): void {
  if (req.engagementContext?.role !== "consulting") {
    res.status(403).json({
      code: "CONSULTING_SIDE_REQUIRED",
      error: "Only the Consulting Company can perform this action",
    });
    return;
  }
  if (req.usertype !== "ADMIN" && req.usertype !== "TEAM_MANAGER") {
    res.status(403).json({
      code: "CONSULTING_LEAD_REQUIRED",
      error:
        "Only the Consulting Company's ADMIN or TEAM_MANAGER can perform this action",
    });
    return;
  }
  next();
}
// [SCOPE 037 / T010] END

/**
 * Write-block guard (FR-004 AC2 / FR-005 AC4): blocks writes when the
 * engagement is in `paused` or `disabled` state. Reads remain allowed.
 * Use after resolveEngagementContext on any endpoint that mutates engagement-
 * scoped data (task status, time entries, sub-assignments, file uploads).
 *
 * Apply at route level on POST/PATCH/DELETE handlers; GET handlers should NOT
 * use this guard.
 */
// [SCOPE 037 / T021] BEGIN — requireWriteAllowed guard
export function requireWriteAllowed(
  req: EngagementAuthRequest,
  res: Response,
  next: NextFunction,
): void {
  const state = req.engagementContext?.engagement?.state;
  if (state === "paused" || state === "disabled") {
    res.status(403).json({
      code: "ENGAGEMENT_WRITES_BLOCKED",
      error: `This engagement is ${state}; writes are not allowed. Reads still work.`,
      engagementState: state,
    });
    return;
  }
  if (state === "ended") {
    res.status(403).json({
      code: "ENGAGEMENT_ENDED",
      error:
        "This engagement has ended; only historical reads are available",
      engagementState: state,
    });
    return;
  }
  next();
}
// [SCOPE 037 / T021] END
