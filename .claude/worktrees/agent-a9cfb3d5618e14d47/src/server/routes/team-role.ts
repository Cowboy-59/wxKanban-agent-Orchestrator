import { Router, Response } from "express";
import { z } from "zod";
import { db } from "../db/client.js";
import { userprofiles, companies } from "../../db/schema/index.js";
import { eq, and, sql } from "drizzle-orm";
import { authenticateToken, requireAuth, AuthRequest } from "../middleware/auth.js";
import { validateBody } from "../middleware/validation.js";
import { createLogger } from "../lib/logger.js";
import { logAuditEvent } from "../services/AuditService.js";
import { DEFAULT_LOCALE, resolveSupportedLocale } from "../../shared/locales.js"; // [SCOPE 051]

const router = Router();
const logger = createLogger("team-role-routes");

const updateRoleSchema = z.object({
  usertype: z.enum(["ADMIN", "TEAM_MANAGER", "TEAM_MEMBER"]),
});

const updateLanguageSchema = z.object({
  language: z.string().max(10),
});

/**
 * Get security level for role
 */
function getSecurityLevelForRole(role: string): number {
  switch (role) {
    case "ADMIN":
      return 7;
    case "TEAM_MANAGER":
      return 5;
    case "TEAM_MEMBER":
      return 1;
    default:
      return 1;
  }
}

/**
 * POST /api/company/users/:userId/role
 * Update user role with validation and audit logging
 * Requires ADMIN usertype
 */
router.post(
  "/company/users/:userId/role",
  authenticateToken,
  requireAuth,
  validateBody(updateRoleSchema),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const companyId = req.companyid;
      const currentUserId = req.userid;
      const targetUserId = req.params.userId;
      const { usertype: newRole } = req.body as { usertype: "ADMIN" | "TEAM_MANAGER" | "TEAM_MEMBER" };

      if (!companyId || !currentUserId) {
        res.status(401).json({ code: "UNAUTHORIZED", error: "Not authenticated" });
        return;
      }

      // Prevent users from changing their own role
      if (targetUserId === currentUserId) {
        res.status(403).json({
          code: "CANNOT_CHANGE_OWN_ROLE",
          error: "You cannot change your own role. Contact another admin.",
        });
        return;
      }

      // Verify current user is ADMIN
      const currentUser = await db
        .select({ usertype: userprofiles.usertype })
        .from(userprofiles)
        .where(eq(userprofiles.id, currentUserId))
        .limit(1);

      if (currentUser.length === 0 || currentUser[0].usertype !== "ADMIN") {
        res.status(403).json({ code: "FORBIDDEN", error: "Only ADMIN can change user roles" });
        return;
      }

      // Get target user details
      const targetUser = await db
        .select({
          id: userprofiles.id,
          emailaddr: userprofiles.emailaddr,
          usertype: userprofiles.usertype,
          fullname: userprofiles.fullname,
        })
        .from(userprofiles)
        .where(and(eq(userprofiles.id, targetUserId), eq(userprofiles.companyid, companyId)))
        .limit(1);

      if (targetUser.length === 0) {
        res.status(404).json({ code: "USER_NOT_FOUND", error: "User not found in your company" });
        return;
      }

      const oldRole = targetUser[0].usertype;

      // If demoting from ADMIN, check if this is the last admin
      if (oldRole === "ADMIN" && newRole !== "ADMIN") {
        const adminCountResult = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(userprofiles)
          .where(
            and(
              eq(userprofiles.companyid, companyId),
              eq(userprofiles.usertype, "ADMIN"),
              eq(userprofiles.active, true)
            )
          );

        const adminCount = adminCountResult[0]?.count || 0;

        if (adminCount <= 1) {
          res.status(403).json({
            code: "CANNOT_REMOVE_LAST_ADMIN",
            error: "Cannot remove the last admin. Promote another user to admin first.",
          });
          return;
        }
      }

      // Check tier requirement for TEAM_MANAGER role
      if (newRole === "TEAM_MANAGER") {
        const company = await db
          .select({ billingplan: companies.billingplan })
          .from(companies)
          .where(eq(companies.id, companyId))
          .limit(1);

        if (company.length > 0 && !["CONSULTANT", "ENTERPRISE"].includes(company[0].billingplan)) {
          res.status(403).json({
            code: "PLAN_UPGRADE_REQUIRED",
            error: "Team Manager role requires CONSULTANT plan or higher",
            upgrade: true,
            requiredPlan: "CONSULTANT",
          });
          return;
        }
      }

      // Update user role and security level
      const updated = await db
        .update(userprofiles)
        .set({
          usertype: newRole,
          securitylevel: getSecurityLevelForRole(newRole),
        })
        .where(and(eq(userprofiles.id, targetUserId), eq(userprofiles.companyid, companyId)))
        .returning();

      // Log audit event
      await logAuditEvent({
        companyId,
        userId: currentUserId,
        action: "USER_ROLE_CHANGED",
        resourceType: "user",
        resourceId: targetUserId,
        details: {
          oldRole,
          newRole,
          targetUserEmail: targetUser[0].emailaddr,
          targetUserName: targetUser[0].fullname,
        },
        status: "success",
      });

      logger.info(
        {
          companyId,
          targetUserId,
          oldRole,
          newRole,
          changedBy: currentUserId,
        },
        "User role updated"
      );

      res.json({
        success: true,
        message: `User role updated from ${oldRole} to ${newRole}`,
        member: {
          id: updated[0].id,
          email: updated[0].emailaddr,
          fullname: updated[0].fullname,
          usertype: updated[0].usertype,
          securitylevel: updated[0].securitylevel,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update user role";
      logger.error({ error: message, targetUserId: req.params.userId }, "Update role error");
      res.status(500).json({ code: "UPDATE_ROLE_ERROR", error: message });
    }
  }
);

/**
 * POST /api/company/users/:userId/language
 * [SCOPE 051] Update a team member's preferred UI language. ADMIN only,
 * company-scoped (can only update users in the caller's company). The member can
 * also change their own language in Settings.
 */
router.post(
  "/company/users/:userId/language",
  authenticateToken,
  requireAuth,
  validateBody(updateLanguageSchema),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const companyId = req.companyid;
      const currentUserId = req.userid;
      const targetUserId = req.params.userId;
      const { language } = req.body as { language: string };

      if (!companyId || !currentUserId) {
        res.status(401).json({ code: "UNAUTHORIZED", error: "Not authenticated" });
        return;
      }

      const currentUser = await db
        .select({ usertype: userprofiles.usertype })
        .from(userprofiles)
        .where(eq(userprofiles.id, currentUserId))
        .limit(1);

      if (currentUser.length === 0 || currentUser[0].usertype !== "ADMIN") {
        res.status(403).json({ code: "FORBIDDEN", error: "Only ADMIN can change a member's language" });
        return;
      }

      const targetUser = await db
        .select({ id: userprofiles.id, emailaddr: userprofiles.emailaddr, language: userprofiles.language })
        .from(userprofiles)
        .where(and(eq(userprofiles.id, targetUserId), eq(userprofiles.companyid, companyId)))
        .limit(1);

      if (targetUser.length === 0) {
        res.status(404).json({ code: "USER_NOT_FOUND", error: "User not found in your company" });
        return;
      }

      const resolved = resolveSupportedLocale(language) ?? DEFAULT_LOCALE;

      const updated = await db
        .update(userprofiles)
        .set({ language: resolved })
        .where(and(eq(userprofiles.id, targetUserId), eq(userprofiles.companyid, companyId)))
        .returning();

      await logAuditEvent({
        companyId,
        userId: currentUserId,
        action: "USER_LANGUAGE_CHANGED",
        resourceType: "user",
        resourceId: targetUserId,
        details: { oldLanguage: targetUser[0].language, newLanguage: resolved, targetUserEmail: targetUser[0].emailaddr },
        status: "success",
      });

      res.json({
        success: true,
        member: { id: updated[0].id, email: updated[0].emailaddr, language: updated[0].language },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update language";
      logger.error({ error: message, targetUserId: req.params.userId }, "Update language error");
      res.status(500).json({ code: "UPDATE_LANGUAGE_ERROR", error: message });
    }
  }
);

export default router;
