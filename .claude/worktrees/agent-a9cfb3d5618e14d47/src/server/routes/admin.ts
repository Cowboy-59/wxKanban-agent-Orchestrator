import { Router, Response } from "express";
import { db } from "../../db/client.js";
import { companies } from "../../db/schema/company.js";
import { userprofiles } from "../../db/schema/userprofiles.js";
import { userinvitations } from "../../db/schema/userinvitation.js";
import { companyprojects } from "../../db/schema/companyproject.js";
import { projecttasks } from "../../db/schema/projecttask.js";
import { projectdocuments } from "../../db/schema/projectdocuments.js";
import { wxkanbandocuments } from "../../db/schema/wxkanbandocuments.js"; // [SCOPE 021 / T016]
import { eq, and, sql, count, inArray } from "drizzle-orm";
import { authenticateToken, requireAuth, AuthRequest } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js"; // [SCOPE 002 / T073] FR-012c
import { createLogger } from "../lib/logger.js";
import { v7 as uuidv7 } from "uuid";
import bcrypt from "bcryptjs";


const router = Router();
const logger = createLogger("admin-routes");

/**
 * GET /api/admin/dashboard
 * Get admin dashboard data including company info, metrics, and onboarding status
 */
router.get(
  "/dashboard",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const companyId = req.companyid;
      const userId = req.userid;

      if (!companyId || !userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Get company info
      const [company] = await db
        .select({
          id: companies.id,
          name: companies.name,
          billingplan: companies.billingplan,
          subscriptionstatus: companies.subscriptionstatus,
          maxusers: companies.maxusers,
        })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);

      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }

      // Get team members count
      const [membersResult] = await db
        .select({ count: count() })
        .from(userprofiles)
        .where(eq(userprofiles.companyid, companyId));

      // Get pending invitations count
      const [invitationsResult] = await db
        .select({ count: count() })
        .from(userinvitations)
        .where(
          and(
            eq(userinvitations.companyid, companyId),
            eq(userinvitations.status, "pending")
          )
        );

      // Get active projects count
      const [projectsResult] = await db
        .select({ count: count() })
        .from(companyprojects)
        .where(eq(companyprojects.companyid, companyId));

      // Get completed tasks count (join with companyprojects to filter by company)
      const completedTasksQuery = await db
        .select({ count: count() })
        .from(projecttasks)
        .innerJoin(companyprojects, eq(projecttasks.projectid, companyprojects.id))
        .where(
          and(
            eq(companyprojects.companyid, companyId),
            eq(projecttasks.status, "completed")
          )
        );

      const completedTasksResult = completedTasksQuery[0];

      // Get uncompleted tasks count (join with companyprojects to filter by company)
      const uncompletedTasksQuery = await db
        .select({ count: count() })
        .from(projecttasks)
        .innerJoin(companyprojects, eq(projecttasks.projectid, companyprojects.id))
        .where(
          and(
            eq(companyprojects.companyid, companyId),
            sql`${projecttasks.status} != 'completed'`
          )
        );

      const uncompletedTasksResult = uncompletedTasksQuery[0];


      // Get current user info for onboarding status
      const [currentUser] = await db
        .select({
          active: userprofiles.active,
        })
        .from(userprofiles)
        .where(eq(userprofiles.id, userId))
        .limit(1);

      // Check if any projects exist
      const hasProjects = (projectsResult?.count || 0) > 0;

      // Check if team has been invited
      const hasInvitedTeam = (invitationsResult?.count || 0) > 0 || (membersResult?.count || 0) > 1;

      const dashboardData = {
        company: {
          name: company.name,
          subscriptionTier: company.billingplan || "FREE",
          subscriptionStatus: company.subscriptionstatus || "ACTIVE",
          maxUsers: company.maxusers || 5,
        },
        metrics: {
          totalMembers: membersResult?.count || 0,
          pendingInvitations: invitationsResult?.count || 0,
          activeProjects: projectsResult?.count || 0,
          completedTasks: completedTasksResult?.count || 0,
          uncompletedTasks: uncompletedTasksResult?.count || 0,
        },
        onboardingStatus: {
          emailVerified: currentUser?.active || false,
          teamInvited: hasInvitedTeam,
          projectCreated: hasProjects,
        },
      };


      logger.info({ companyId, userId }, "Admin dashboard data retrieved");
      return res.json(dashboardData);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load dashboard";
      logger.error({ error: message }, "Admin dashboard error");
      return res.status(500).json({ error: message });
    }
  }
);

/**
 * GET /api/admin/team
 * Get team members list
 */
router.get(
  "/team",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const companyId = req.companyid;

      if (!companyId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Get team members - filter by company and exclude SYSADMIN users
      const members = await db
        .select({
          id: userprofiles.id,
          email: userprofiles.emailaddr,
          fullname: userprofiles.fullname,
          usertype: userprofiles.usertype,
          active: userprofiles.active,
          joinedat: userprofiles.joinedat,
          lastloginedat: userprofiles.lastloginedat,

        })
        .from(userprofiles)
        .where(
          and(
            eq(userprofiles.companyid, companyId),
            sql`${userprofiles.usertype} != 'SYSADMIN'`
          )
        )
        .orderBy(sql`${userprofiles.joinedat} DESC`);



      // Get pending invitations
      const invitations = await db
        .select({
          id: userinvitations.id,
          email: userinvitations.email,
          usertype: userinvitations.usertype,
          status: userinvitations.status,
          invitedat: userinvitations.invitedat,
          expiresat: userinvitations.expiresat,
        })
        .from(userinvitations)
        .where(
          and(
            eq(userinvitations.companyid, companyId),
            eq(userinvitations.status, "pending")
          )
        )
        .orderBy(sql`${userinvitations.invitedat} DESC`);

      return res.json({
        members,
        invitations,
        totalMembers: members.length,
        pendingInvitations: invitations.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load team";
      logger.error({ error: message }, "Team list error");
      return res.status(500).json({ error: message });
    }
  }
);

/**
 * POST /api/admin/users
 * Create a new team member directly (bypasses email invitation)
 */
router.post(
  "/users",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const companyId = req.companyid;
      const createdBy = req.userid;

      if (!companyId || !createdBy) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { email, firstName, lastName, usertype, requirePasswordChange } = req.body;

      // Validate required fields
      if (!email || !firstName || !usertype) {
        return res.status(400).json({ error: "Email, first name, and role are required" });
      }

      // Check if user already exists
      const existingUser = await db
        .select({ id: userprofiles.id })
        .from(userprofiles)
        .where(eq(userprofiles.emailaddr, email))
        .limit(1);

      if (existingUser.length > 0) {
        return res.status(409).json({ error: "User with this email already exists" });
      }

      // Check seat limits
      const [company] = await db
        .select({ maxusers: companies.maxusers, billingplan: companies.billingplan })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);

      const currentUserCount = await db
        .select({ count: count() })
        .from(userprofiles)
        .where(eq(userprofiles.companyid, companyId));

      const maxUsers = company?.maxusers || 5;
      const currentCount = currentUserCount[0]?.count || 0;

      if (currentCount >= maxUsers) {
        return res.status(409).json({ 
          error: "Seat limit reached. Upgrade your plan to add more members.",
          code: "SEAT_LIMIT_EXCEEDED",
          upgrade: true,
          requiredPlan: "CONSULTANT",
        });
      }

      // Check tier requirement for TEAM_MANAGER
      if (usertype === "TEAM_MANAGER" && !["CONSULTANT", "ENTERPRISE"].includes(company?.billingplan || "")) {
        return res.status(403).json({
          error: "Team Manager role requires CONSULTANT plan or higher",
          code: "PLAN_UPGRADE_REQUIRED",
          upgrade: true,
          requiredPlan: "CONSULTANT",
        });
      }

      // Generate a temporary password
      const tempPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12).toUpperCase();
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      // Create the user
      const userId = uuidv7();
      const fullName = lastName ? `${firstName} ${lastName}` : firstName;

      await db.insert(userprofiles).values({
        id: userId,
        emailaddr: email,
        fullname: fullName,
        usertype: usertype,
        companyid: companyId,
        active: true,
        joinedat: new Date(),
        password: hashedPassword,
        requirepasswordchange: requirePasswordChange || false,
      });


      logger.info({ 
        userId, 
        email, 
        companyId, 
        createdBy,
        requirePasswordChange: requirePasswordChange || false,
      }, "New team member created directly");

      return res.status(201).json({
        success: true,
        message: "Team member created successfully",
        tempPassword, // Include temp password so admin can share it
        user: {
          id: userId,
          email,
          fullname: fullName,
          usertype,
          requirePasswordChange: requirePasswordChange || false,
        },
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create user";
      logger.error({ error: message }, "Create user error");
      return res.status(500).json({ error: message });
    }
  }
);

/**
 * GET /api/admin/settings
 * Get company settings
 */
router.get(
  "/settings",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const companyId = req.companyid;

      if (!companyId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const [company] = await db
        .select({
          name: companies.name,
          contactemail: companies.contactemail,
          billingemail: companies.billingemail,
          address: companies.address,
          phone: companies.phone,
          vatnumber: companies.vatnumber, // [SCOPE 002 / T073] FR-012a
        })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);

      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }

      return res.json({
        name: company.name || "",
        billingEmail: company.contactemail || "",
        // Spec 037 / T061 — separate field for B2B engagement invoice delivery.
        invoiceBillingEmail: company.billingemail || "",
        billingAddress: company.address || "",
        billingPhone: company.phone || "",
        vatNumber: company.vatnumber || "", // [SCOPE 002 / T073] FR-012a
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load settings";
      logger.error({ error: message }, "Settings error");
      return res.status(500).json({ error: message });
    }
  }
);

/**
 * PUT /api/admin/settings
 * Update company settings
 */
router.put(
  "/settings",
  authenticateToken,
  requireAuth,
  requireAdmin, // [SCOPE 002 / T073] FR-012c — company profile edits are ADMIN-only (FR-012, FR-057)
  async (req: AuthRequest, res: Response) => {
    try {
      const companyId = req.companyid;
      const { name, billingEmail, invoiceBillingEmail, billingAddress, billingPhone, vatNumber } = req.body;

      if (!companyId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // [SCOPE 002 / T073] FR-012a — vatNumber absent = leave the stored value alone (an older
      // cached client never sends it, and must not wipe it); "" or null = clear; else trimmed, max 50.
      let vatnumber: string | null | undefined;
      if (vatNumber === undefined) {
        vatnumber = undefined;
      } else if (vatNumber === null || (typeof vatNumber === "string" && vatNumber.trim() === "")) {
        vatnumber = null;
      } else if (typeof vatNumber === "string" && vatNumber.trim().length <= 50) {
        vatnumber = vatNumber.trim();
      } else {
        return res.status(400).json({ error: "VAT number must be at most 50 characters" });
      }

      // Spec 037 / T061 — invoiceBillingEmail maps to companies.billingemail
      // for B2B engagement invoice delivery. Empty string → null so the
      // backend fail-fast check (POST /:id/invoice) triggers correctly.
      const normalizedInvoiceEmail =
        typeof invoiceBillingEmail === "string" && invoiceBillingEmail.trim().length > 0
          ? invoiceBillingEmail.trim()
          : null;

      await db
        .update(companies)
        .set({
          name,
          contactemail: billingEmail,
          billingemail: normalizedInvoiceEmail,
          address: billingAddress,
          phone: billingPhone,
          ...(vatnumber !== undefined && { vatnumber }), // [SCOPE 002 / T073] FR-012a
          updatedat: new Date(),
        })
        .where(eq(companies.id, companyId));


      logger.info({ companyId }, "Company settings updated");
      return res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update settings";
      logger.error({ error: message }, "Settings update error");
      return res.status(500).json({ error: message });
    }
  }
);

/**
 * PUT /api/admin/users/:id/role
 * Update user role with tier-gating check
 */
router.put(
  "/users/:id/role",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const companyId = req.companyid;
      const userId = req.params.id;
      const { usertype } = req.body;

      if (!companyId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (!usertype || !["ADMIN", "TEAM_MANAGER", "TEAM_MEMBER"].includes(usertype)) {
        return res.status(400).json({ error: "Valid role is required (ADMIN, TEAM_MANAGER, or TEAM_MEMBER)" });
      }

      // Check if user exists and belongs to the company
      const [user] = await db
        .select({
          id: userprofiles.id,
          emailaddr: userprofiles.emailaddr,
          usertype: userprofiles.usertype,
          companyid: userprofiles.companyid,
        })
        .from(userprofiles)
        .where(
          and(
            eq(userprofiles.id, userId),
            eq(userprofiles.companyid, companyId)
          )
        )
        .limit(1);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Check tier requirement for TEAM_MANAGER
      if (usertype === "TEAM_MANAGER") {
        const [company] = await db
          .select({ billingplan: companies.billingplan })
          .from(companies)
          .where(eq(companies.id, companyId))
          .limit(1);

        if (!["CONSULTANT", "ENTERPRISE"].includes(company?.billingplan || "")) {
          return res.status(403).json({
            error: "Team Manager role requires CONSULTANT plan or higher",
            code: "PLAN_UPGRADE_REQUIRED",
            upgrade: true,
            requiredPlan: "CONSULTANT",
          });
        }
      }

      // Prevent changing own role (safety measure)
      if (userId === req.userid) {
        return res.status(403).json({ error: "Cannot change your own role" });
      }

      // Update user role
      await db
        .update(userprofiles)
        .set({
          usertype: usertype,
          securitylevel: usertype === "ADMIN" ? 7 : usertype === "TEAM_MANAGER" ? 5 : 1,
        })
        .where(eq(userprofiles.id, userId));

      logger.info({ 
        userId, 
        companyId, 
        oldRole: user.usertype,
        newRole: usertype,
      }, "User role updated");

      return res.json({
        success: true,
        message: "User role updated successfully",
        user: {
          id: userId,
          email: user.emailaddr,
          usertype: usertype,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update user role";
      logger.error({ error: message }, "Update role error");
      return res.status(500).json({ error: message });
    }
  }
);

/**
 * DELETE /api/admin/users/:id
 * Deactivate/remove a team member (soft delete)
 */
router.delete(
  "/users/:id",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const companyId = req.companyid;
      const userId = req.params.id;

      if (!companyId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Check if user exists and belongs to the company
      const [user] = await db
        .select({
          id: userprofiles.id,
          emailaddr: userprofiles.emailaddr,
          usertype: userprofiles.usertype,
          active: userprofiles.active,
        })
        .from(userprofiles)
        .where(
          and(
            eq(userprofiles.id, userId),
            eq(userprofiles.companyid, companyId)
          )
        )
        .limit(1);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Prevent self-deletion
      if (userId === req.userid) {
        return res.status(403).json({ error: "Cannot deactivate your own account" });
      }

      // Check if this is the last admin
      if (user.usertype === "ADMIN") {
        const [adminCount] = await db
          .select({ count: count() })
          .from(userprofiles)
          .where(
            and(
              eq(userprofiles.companyid, companyId),
              eq(userprofiles.usertype, "ADMIN"),
              eq(userprofiles.active, true)
            )
          );

        if ((adminCount?.count || 0) <= 1) {
          return res.status(403).json({ 
            error: "Cannot remove the last admin. Promote another user to admin first." 
          });
        }
      }

      // Soft delete - set active to false
      await db
        .update(userprofiles)
        .set({
          active: false,
        })
        .where(eq(userprofiles.id, userId));

      logger.info({ 
        userId, 
        companyId,
        email: user.emailaddr,
      }, "User deactivated");

      return res.json({
        success: true,
        message: "User deactivated successfully",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to deactivate user";
      logger.error({ error: message }, "Deactivate user error");
      return res.status(500).json({ error: message });
    }
  }
);

export default router;

// --- STUBS FOR MISSING ADMIN ENDPOINTS ---
/**
 * GET /api/admin/diagnostics
 * Returns placeholder diagnostics data
 */
router.get(
  "/diagnostics",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const uptime = process.uptime();
    const mem = process.memoryUsage();
    const start = Date.now();
    try {
      await db.execute(sql`SELECT 1`);
    } catch {
      return res.json({
        status: "error",
        timestamp: new Date().toISOString(),
        server: {
          uptimeSeconds: Math.floor(uptime),
          uptimeHuman: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
          memoryMB: Math.round(mem.rss / 1024 / 1024),
          nodeVersion: process.version,
          env: process.env.NODE_ENV ?? "development",
          diagLatencyMs: Date.now() - start,
        },
        database: { status: "error", latencyMs: 0, error: "Database unreachable", tables: {}, missingTables: [], rowCounts: {} },
        schema: { drift: [], driftCount: 0, healthy: false },
        integrations: { pmConnected: 0 },
      });
    }
    const latencyMs = Date.now() - start;
    return res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      server: {
        uptimeSeconds: Math.floor(uptime),
        uptimeHuman: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
        memoryMB: Math.round(mem.rss / 1024 / 1024),
        nodeVersion: process.version,
        env: process.env.NODE_ENV ?? "development",
        diagLatencyMs: latencyMs,
      },
      database: { status: "ok", latencyMs, error: null, tables: {}, missingTables: [], rowCounts: {} },
      schema: { drift: [], driftCount: 0, healthy: true },
      integrations: { pmConnected: 0 },
    });
  }
);

/**
 * GET /api/admin/doc-status
 * Returns per-project document status for dashboard report links.
 * Response: { projects: { [projectId]: { projectOverview, projectLifecycle, auditReport } } }
 * Values are ISO timestamps (updatedat) or null.
 */
router.get(
  "/doc-status",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const companyId = req.companyid;
    if (!companyId) {
      return res.json({ projects: {} });
    }

    // Get all project IDs for this company
    const companyProjectRows = await db
      .select({ id: companyprojects.id })
      .from(companyprojects)
      .where(eq(companyprojects.companyid, companyId));

    const projectIds = companyProjectRows.map((r) => r.id);
    if (projectIds.length === 0) {
      return res.json({ projects: {} });
    }

    // Query project-level documents for the 4 report types
    const docs = await db
      .select({
        projectid: projectdocuments.projectid,
        doctype: projectdocuments.doctype,
        updatedat: projectdocuments.updatedat,
      })
      .from(projectdocuments)
      .where(
        and(
          inArray(projectdocuments.projectid, projectIds),
          sql`${projectdocuments.specid} IS NULL`,
          sql`${projectdocuments.doctype} IN ('ProjectOverview', 'ProjectLifecycle', 'AuditReport', 'CompoundLearning', 'ProjectScopeAnalysis', 'DevelopmentPlan')`
        )
      );

    // Count outstanding (non-completed) tasks per project
    const taskCounts = await db
      .select({
        projectid: projecttasks.projectid,
        outstanding: count(),
      })
      .from(projecttasks)
      .where(
        and(
          inArray(projecttasks.projectid, projectIds),
          sql`${projecttasks.status} != 'completed'`,
        ),
      )
      .groupBy(projecttasks.projectid);
    const outstandingMap = new Map<string, number>();
    for (const row of taskCounts) {
      outstandingMap.set(row.projectid, Number(row.outstanding));
    }

    // Build per-project status map
    const projects: Record<string, { projectOverview: string | null; projectLifecycle: string | null; auditReport: string | null; compoundLearning: string | null; projectScopeAnalysis: string | null; developmentPlan: string | null; outstandingTaskCount: number }> = {};
    for (const pid of projectIds) {
      projects[pid] = {
        projectOverview: null,
        projectLifecycle: null,
        auditReport: null,
        compoundLearning: null,
        projectScopeAnalysis: null,
        developmentPlan: null, // [SCOPE 081 / T008]
        outstandingTaskCount: outstandingMap.get(pid) ?? 0,
      };
    }
    for (const doc of docs) {
      const entry = projects[doc.projectid];
      if (!entry) continue;
      const ts = doc.updatedat ? doc.updatedat.toISOString() : null;
      if (doc.doctype === "ProjectOverview") entry.projectOverview = ts;
      else if (doc.doctype === "ProjectLifecycle") entry.projectLifecycle = ts;
      else if (doc.doctype === "AuditReport") entry.auditReport = ts;
      else if (doc.doctype === "CompoundLearning") entry.compoundLearning = ts;
      else if (doc.doctype === "ProjectScopeAnalysis") entry.projectScopeAnalysis = ts;
      else if (doc.doctype === "DevelopmentPlan") entry.developmentPlan = ts; // [SCOPE 081 / T008]
    }

    // [SCOPE 021 / T016] Platform-wide ER diagram is a single global doc (not per-project).
    const erdRows = await db
      .select({ generatedat: wxkanbandocuments.pdfgeneratedat })
      .from(wxkanbandocuments)
      .where(eq(wxkanbandocuments.documenttype, "erdiagram"))
      .limit(1);
    const databaseErd =
      erdRows.length && erdRows[0].generatedat ? erdRows[0].generatedat.toISOString() : null;

    return res.json({ projects, databaseErd });
  }
);
