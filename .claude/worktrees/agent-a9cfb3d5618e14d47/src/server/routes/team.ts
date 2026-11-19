import { Router, Request, Response } from "express";
import { z } from "zod";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { db } from "../db/client.js";
import {
  userprofiles as users,
  userinvitations,
  companies,
  passwordresettokens,
} from "../../db/schema/index.js";

import { eq, and, sql } from "drizzle-orm";

import {
  authenticateToken,
  requireAuth,
  AuthRequest,
} from "../middleware/auth.js";
import { validateBody } from "../middleware/validation.js";
import * as CompanyService from "../services/CompanyService.js";
import { createLogger } from "../lib/logger.js";
import { sendEmail } from "../lib/email.js";
import {
  getInvitationEmailHTML,
  getInvitationEmailText,
  getPasswordResetEmailHTML,
  getPasswordResetEmailText,
} from "../lib/emailTemplates.js";
import { hashPassword } from "../lib/password.js";

const router = Router();
const logger = createLogger("team-routes");

// ─── Public routes (no auth required) ───────────────────────────────────────

const acceptInvitationSchema = z.object({
  fullname: z.string().min(1).max(80),
  password: z.string().min(8),
  timezone: z.string().default("UTC"),
});

/**
 * GET /api/team/invite/:token
 * Validate an invitation token and return company/email info.
 * Public — used by InviteAcceptPage to display company name before accepting.
 */
router.get("/invite/:token", async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.params;

    const invitation = await db
      .select({
        id: userinvitations.id,
        email: userinvitations.email,
        status: userinvitations.status,
        expiresat: userinvitations.expiresat,
        companyid: userinvitations.companyid,
      })
      .from(userinvitations)
      .where(and(eq(userinvitations.token, token), eq(userinvitations.status, "pending")))
      .limit(1);

    if (invitation.length === 0) {
      res.status(404).json({ code: "INVITATION_NOT_FOUND", error: "Invitation not found or already used" });
      return;
    }

    const inv = invitation[0];

    if (inv.expiresat && new Date(inv.expiresat) < new Date()) {
      res.status(410).json({ code: "INVITATION_EXPIRED", error: "Invitation has expired" });
      return;
    }

    const company = await db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(eq(companies.id, inv.companyid))
      .limit(1);

    res.json({
      email: inv.email,
      companyName: company[0]?.name ?? "Unknown Company",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to validate invitation";
    logger.error({ error: message }, "Validate invitation error");
    res.status(500).json({ code: "VALIDATE_INVITATION_ERROR", error: message });
  }
});

/**
 * POST /api/team/invite/:token/accept
 * Accept an invitation — create user account and mark invitation accepted.
 * Public — unauthenticated (invitee has no account yet).
 */
router.post(
  "/invite/:token/accept",
  validateBody(acceptInvitationSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { token } = req.params;
      const { fullname, password, timezone } = req.body as {
        fullname: string;
        password: string;
        timezone: string;
      };

      const invitation = await db
        .select()
        .from(userinvitations)
        .where(and(eq(userinvitations.token, token), eq(userinvitations.status, "pending")))
        .limit(1);

      if (invitation.length === 0) {
        res.status(404).json({ code: "INVITATION_NOT_FOUND", error: "Invitation not found or already used" });
        return;
      }

      const inv = invitation[0];

      if (inv.expiresat && new Date(inv.expiresat) < new Date()) {
        res.status(410).json({ code: "INVITATION_EXPIRED", error: "Invitation has expired" });
        return;
      }

      const existingUser = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.emailaddr, inv.email))
        .limit(1);

      if (existingUser.length > 0) {
        res.status(409).json({ code: "USER_EXISTS", error: "An account with this email already exists" });
        return;
      }

      const passwordHash = await hashPassword(password);
      const userId = crypto.randomUUID();

      await db.insert(users).values({
        id: userId,
        emailaddr: inv.email,
        password: passwordHash,
        fullname,
        companyid: inv.companyid,
        usertype: inv.usertype ?? "TEAM_MEMBER",
        active: true,
        securitylevel: 1,
        timezone,
        tracktime: true,
        joinedat: new Date(),
      });

      await db
        .update(userinvitations)
        .set({ status: "accepted", acceptedat: new Date() })
        .where(eq(userinvitations.id, inv.id));

      logger.info({ userId, companyId: inv.companyid, email: inv.email }, "Invitation accepted — user created");

      res.status(201).json({
        success: true,
        message: "Account created. You can now log in.",
        email: inv.email,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to accept invitation";
      logger.error({ error: message }, "Accept invitation error");
      res.status(500).json({ code: "ACCEPT_INVITATION_ERROR", error: message });
    }
  }
);

// ─── Authenticated routes ────────────────────────────────────────────────────

router.use(authenticateToken, requireAuth);

const inviteSchema = z.object({
  email: z.string().email("Invalid email"),
  message: z.string().optional(),
});

const inviteUserSchema = z.object({
  email: z.string().email("Invalid email format"),
  usertype: z.enum(["ADMIN", "TEAM_MANAGER", "TEAM_MEMBER"]).default("TEAM_MEMBER"),
});

const bulkInviteSchema = z.object({
  csv: z.string().min(1, "CSV data is required"),
  defaultUsertype: z.enum(["ADMIN", "TEAM_MANAGER", "TEAM_MEMBER"]).default("TEAM_MEMBER"),
});

const updateMemberSchema = z.object({
  fullname: z.string().min(1).max(80),
});



/**
 * POST /api/company/users/bulk
 * Bulk invite users via CSV upload.
 * CSV format: email,usertype (optional, uses defaultUsertype if not specified)
 * Requires ADMIN usertype.
 */
router.post(
  "/company/users/bulk",
  validateBody(bulkInviteSchema),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const companyId = req.companyid;
      const currentUserId = req.userid;
      const { csv, defaultUsertype } = req.body as { csv: string; defaultUsertype: "ADMIN" | "TEAM_MANAGER" | "TEAM_MEMBER" };

      if (!companyId || !currentUserId) {
        res.status(401).json({ code: "UNAUTHORIZED", error: "Not authenticated" });
        return;
      }

      // Verify current user is ADMIN
      const currentUser = await db
        .select({ usertype: users.usertype })
        .from(users)
        .where(eq(users.id, currentUserId))
        .limit(1);

      if (currentUser.length === 0 || currentUser[0].usertype !== "ADMIN") {
        res.status(403).json({ code: "FORBIDDEN", error: "Only ADMIN can bulk invite users" });
        return;
      }

      // Get company details
      const company = await db
        .select({
          billingplan: companies.billingplan,
          maxusers: companies.maxusers,
          name: companies.name,
        })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);

      if (company.length === 0) {
        res.status(404).json({ code: "COMPANY_NOT_FOUND", error: "Company not found" });
        return;
      }

      const { billingplan, maxusers, name: companyName } = company[0];

      // Count current users
      const userCountResult = await db
        .select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(users)
        .where(eq(users.companyid, companyId));

      const currentUserCount = userCountResult[0]?.count || 0;

      // Parse CSV
      const lines = csv.split(/\r?\n/).filter(line => line.trim());
      const results: Array<{
        email: string;
        usertype: string;
        status: "success" | "error";
        message?: string;
        invitationId?: string;
      }> = [];

      let successCount = 0;
      let errorCount = 0;
      let teamManagerBlocked = 0;

      // Check if we have enough seats for all valid invitations
      let validInvitations: Array<{ email: string; usertype: "ADMIN" | "TEAM_MANAGER" | "TEAM_MEMBER" }> = [];

      for (const line of lines) {
        const parts = line.split(",").map(p => p.trim());
        const email = parts[0];
        const usertype = (parts[1] as "ADMIN" | "TEAM_MANAGER" | "TEAM_MEMBER") || defaultUsertype;

        // Validate email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email)) {
          results.push({ email: email || "(empty)", usertype, status: "error", message: "Invalid email format" });
          errorCount++;
          continue;
        }

        // Check if TEAM_MANAGER requires CONSULTANT+
        if (usertype === "TEAM_MANAGER" && !["CONSULTANT", "ENTERPRISE"].includes(billingplan)) {
          results.push({ email, usertype, status: "error", message: "Team Manager role requires CONSULTANT plan" });
          errorCount++;
          teamManagerBlocked++;
          continue;
        }

        // Check if user already exists
        const existingUser = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.emailaddr, email), eq(users.companyid, companyId)))
          .limit(1);

        if (existingUser.length > 0) {
          results.push({ email, usertype, status: "error", message: "User already exists in company" });
          errorCount++;
          continue;
        }

        // Check for pending invitation
        const pendingInvitation = await db
          .select({ id: userinvitations.id })
          .from(userinvitations)
          .where(
            and(
              eq(userinvitations.companyid, companyId),
              eq(userinvitations.email, email),
              eq(userinvitations.status, "pending")
            )
          )
          .limit(1);

        if (pendingInvitation.length > 0) {
          results.push({ email, usertype, status: "error", message: "Invitation already pending" });
          errorCount++;
          continue;
        }

        validInvitations.push({ email, usertype });
      }

      // Check seat limit
      const availableSeats = maxusers - currentUserCount;
      if (validInvitations.length > availableSeats) {
        res.status(409).json({
          code: "SEAT_LIMIT_EXCEEDED",
          error: `Cannot invite ${validInvitations.length} users. Only ${availableSeats} seats available on your ${billingplan} plan.`,
          upgrade: true,
          currentSeats: currentUserCount,
          maxSeats: maxusers,
          requestedInvitations: validInvitations.length,
          billingplan,
        });
        return;
      }

      // Process valid invitations
      const sender = await db
        .select({ fullname: users.fullname })
        .from(users)
        .where(eq(users.id, currentUserId))
        .limit(1);

      const senderName = sender[0]?.fullname ?? "A team member";

      for (const { email, usertype } of validInvitations) {
        try {
          const invitationId = crypto.randomUUID();
          const invitationToken = crypto.randomBytes(32).toString("hex");
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

          await db.insert(userinvitations).values({
            id: invitationId,
            companyid: companyId,
            email,
            usertype,
            token: invitationToken,
            status: "pending",
            expiresat: expiresAt,
          });

          // Send invitation email
          const acceptLink = `${process.env.CLIENT_URL}/accept-invitation/${invitationToken}`;
          const htmlContent = getInvitationEmailHTML(email, senderName, companyName, usertype, null, acceptLink);
          const textContent = getInvitationEmailText(email, senderName, companyName, usertype, null, acceptLink);

          try {
            await sendEmail(email, `You're invited to join ${companyName}`, htmlContent, textContent);
          } catch (emailError) {
            logger.error({ error: emailError, email, companyId }, "Failed to send bulk invitation email");
          }

          results.push({ email, usertype, status: "success", invitationId });
          successCount++;
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to create invitation";
          results.push({ email, usertype, status: "error", message });
          errorCount++;
        }
      }

      logger.info(
        { companyId, successCount, errorCount, total: lines.length },
        "Bulk invitation processing complete"
      );

      res.status(201).json({
        success: true,
        summary: {
          total: lines.length,
          success: successCount,
          errors: errorCount,
          teamManagerBlocked,
        },
        results,
        seatsUsed: currentUserCount + successCount,
        seatsLimit: maxusers,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to process bulk invitations";
      logger.error({ error: message, companyId: req.companyid }, "Bulk invite error");
      res.status(500).json({ code: "BULK_INVITE_ERROR", error: message });
    }
  }
);

/**
 * POST /api/company/users
 * Invite a new user to the company with seat limit validation.
 * Requires ADMIN usertype.
 */
router.post(
  "/company/users",
  validateBody(inviteUserSchema),
  async (req: AuthRequest, res: Response): Promise<void> => {

    try {
      const companyId = req.companyid;
      const currentUserId = req.userid;
      const { email, usertype } = req.body as { email: string; usertype: "ADMIN" | "TEAM_MANAGER" | "TEAM_MEMBER" };

      if (!companyId || !currentUserId) {
        res.status(401).json({ code: "UNAUTHORIZED", error: "Not authenticated" });
        return;
      }

      // Verify current user is ADMIN
      const currentUser = await db
        .select({ usertype: users.usertype })
        .from(users)
        .where(eq(users.id, currentUserId))
        .limit(1);

      if (currentUser.length === 0 || currentUser[0].usertype !== "ADMIN") {
        res.status(403).json({ code: "FORBIDDEN", error: "Only ADMIN can invite users" });
        return;
      }

      // Get company details for seat limit check
      const company = await db
        .select({
          billingplan: companies.billingplan,
          maxusers: companies.maxusers,
        })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);

      if (company.length === 0) {
        res.status(404).json({ code: "COMPANY_NOT_FOUND", error: "Company not found" });
        return;
      }

      const { billingplan, maxusers } = company[0];

      // Check if TEAM_MANAGER role requires CONSULTANT+ plan
      if (usertype === "TEAM_MANAGER" && !["CONSULTANT", "ENTERPRISE"].includes(billingplan)) {
        res.status(403).json({
          code: "PLAN_UPGRADE_REQUIRED",
          error: "Team Manager role requires CONSULTANT plan or higher",
          upgrade: true,
          requiredPlan: "CONSULTANT",
        });
        return;
      }

      // Count current users for seat limit check
      const userCountResult = await db
        .select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(users)
        .where(eq(users.companyid, companyId));

      const currentUserCount = userCountResult[0]?.count || 0;

      // Check seat limit
      if (currentUserCount >= maxusers) {
        res.status(409).json({
          code: "SEAT_LIMIT_REACHED",
          error: `Team size limit (${maxusers}) reached for your ${billingplan} plan. Upgrade to CONSULTANT for unlimited members.`,
          upgrade: true,
          currentSeats: currentUserCount,
          maxSeats: maxusers,
          billingplan,
        });
        return;
      }

      // Check if email already exists in company
      const existingUser = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.emailaddr, email), eq(users.companyid, companyId)))
        .limit(1);

      if (existingUser.length > 0) {
        res.status(409).json({ code: "USER_EXISTS", error: "User with this email already exists in your company" });
        return;
      }

      // Check for pending invitation
      const pendingInvitation = await db
        .select({ id: userinvitations.id })
        .from(userinvitations)
        .where(
          and(
            eq(userinvitations.companyid, companyId),
            eq(userinvitations.email, email),
            eq(userinvitations.status, "pending")
          )
        )
        .limit(1);

      if (pendingInvitation.length > 0) {
        res.status(409).json({ code: "INVITATION_PENDING", error: "An invitation is already pending for this email" });
        return;
      }

      // Create invitation
      const invitationId = crypto.randomUUID();
      const invitationToken = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await db.insert(userinvitations).values({
        id: invitationId,
        companyid: companyId,
        email,
        usertype,
        token: invitationToken,
        status: "pending",
        expiresat: expiresAt,
      });

      // Send invitation email
      const companyDetails = await db
        .select({ name: companies.name })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);

      const sender = await db
        .select({ fullname: users.fullname })
        .from(users)
        .where(eq(users.id, currentUserId))
        .limit(1);

      const senderName = sender[0]?.fullname ?? "A team member";
      const companyName = companyDetails[0]?.name ?? "Our company";
      const acceptLink = `${process.env.CLIENT_URL}/accept-invitation/${invitationToken}`;

      const htmlContent = getInvitationEmailHTML(
        email,
        senderName,
        companyName,
        usertype,
        null,
        acceptLink
      );
      const textContent = getInvitationEmailText(
        email,
        senderName,
        companyName,
        usertype,
        null,
        acceptLink
      );

      try {
        await sendEmail(email, `You're invited to join ${companyName}`, htmlContent, textContent);
        logger.info({ companyId, email, usertype }, "Invitation email sent");
      } catch (emailError) {
        logger.error(
          { error: emailError, email, companyId },
          "Failed to send invitation email (invitation record still created)"
        );
      }

      res.status(201).json({
        success: true,
        invitationId,
        message: `Invitation sent to ${email}`,
        seatsUsed: currentUserCount + 1,
        seatsLimit: maxusers,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to invite user";
      logger.error({ error: message, companyId: req.companyid }, "Invite user error");
      res.status(500).json({ code: "INVITE_USER_ERROR", error: message });
    }
  }
);

/**
 * GET /api/company/users
 * Get paginated team members for the authenticated user's company.
 */
router.get("/company/users", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const companyId = req.companyid;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const status = req.query.status as string | undefined;
    const sortBy = (req.query.sortBy as string) || "joinedat";
    const sortOrder = (req.query.sortOrder as string) || "desc";

    if (!companyId) {
      res.status(401).json({ code: "UNAUTHORIZED", error: "Not authenticated" });
      return;
    }
    // Build query conditions - exclude SYSADMIN users from team member lists
    const conditions = [
      eq(users.companyid, companyId),
      sql`${users.usertype} != 'SYSADMIN'`
    ];
    if (status === "active") {
      conditions.push(eq(users.active, true));
    } else if (status === "inactive") {
      conditions.push(eq(users.active, false));
    }

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(users)
      .where(and(...conditions));

    const total = countResult[0]?.count || 0;

    // Get paginated members
    const members = await db
      .select({
        id: users.id,
        email: users.emailaddr,
        fullname: users.fullname,
        active: users.active,
        usertype: users.usertype,
        joinedat: users.joinedat,
        lastloginedat: users.lastloginedat,
        payrate: users.payrate,
        tracktime: users.tracktime,
      })
      .from(users)
      .where(and(...conditions))
      .orderBy(sortOrder === "asc" ? sql`${users[sortBy as keyof typeof users]} asc` : sql`${users[sortBy as keyof typeof users]} desc`)
      .limit(limit)
      .offset((page - 1) * limit);

    // Get pending invitations count
    const invitationsResult = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(userinvitations)
      .where(
        and(
          eq(userinvitations.companyid, companyId),
          eq(userinvitations.status, "pending")
        )
      );

    const pendingInvitations = invitationsResult[0]?.count || 0;

    res.json({
      members,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      pendingInvitations,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get team members";
    logger.error({ error: message, companyId: req.companyid }, "Get company users error");
    res.status(500).json({ code: "GET_COMPANY_USERS_ERROR", error: message });
  }
});

/**
 * GET /api/team
 * Get all team members and pending invitations for the authenticated user's company.
 */
router.get("/", async (req: AuthRequest, res: Response): Promise<void> => {

  try {
    const companyId = req.companyid;

    if (!companyId) {
      res.status(401).json({ code: "UNAUTHORIZED", error: "Not authenticated" });
      return;
    }

    const allMembers = await CompanyService.getCompanyTeamMembers(companyId);
    const members = allMembers
      .filter(m => m.usertype !== 'SYSADMIN')
      .map(m => ({ ...m, id: m.userid }));


    const invitations = await db
      .select()
      .from(userinvitations)
      .where(
        and(
          eq(userinvitations.companyid, companyId),
          eq(userinvitations.status, "pending")
        )
      );

    logger.info({ companyId }, "Team retrieved");

    res.json({ members, invitations });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get team";
    logger.error({ error: message, companyId: req.companyid }, "Get team error");
    res.status(500).json({ code: "GET_TEAM_ERROR", error: message });
  }
});

/**
 * POST /api/team/invite
 * Send invitation to user — scoped to authenticated user's company.
 */
router.post(
  "/invite",
  validateBody(inviteSchema),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const companyId = req.companyid;
      const { email, message } = req.body;

      if (!companyId) {
        res.status(401).json({ code: "UNAUTHORIZED", error: "Not authenticated" });
        return;
      }

      const pendingInvitation = await db
        .select()
        .from(userinvitations)
        .where(
          and(
            eq(userinvitations.companyid, companyId),
            eq(userinvitations.email, email),
            eq(userinvitations.status, "pending")
          )
        )
        .limit(1);

      if (pendingInvitation.length > 0) {
        await db
          .update(userinvitations)
          .set({ status: "cancelled" })
          .where(eq(userinvitations.id, pendingInvitation[0].id));

        logger.info({ companyId, email }, "Cancelled previous invitation");
      }

      const invitationId = crypto.randomUUID();
      const invitationToken = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await db.insert(userinvitations).values({
        id: invitationId,
        companyid: companyId,
        email,
        token: invitationToken,
        status: "pending",
        expiresat: expiresAt,
      });

      const company = await db
        .select()
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);

      if (company.length > 0) {
        const sender = await db
          .select()
          .from(users)
          .where(eq(users.id, req.userid ?? ""))
          .limit(1);

        const senderName = sender?.[0]?.fullname ?? "A team member";
        const companyName = company[0]?.name ?? "Our company";
        const acceptLink = `${process.env.CLIENT_URL}/accept-invitation/${invitationToken}`;

        const htmlContent = getInvitationEmailHTML(
          email,
          senderName,
          companyName,
          "Team Member",
          message ?? null,
          acceptLink
        );
        const textContent = getInvitationEmailText(
          email,
          senderName,
          companyName,
          "Team Member",
          message ?? null,
          acceptLink
        );

        try {
          await sendEmail(email, `You're invited to join ${companyName}`, htmlContent, textContent);
          logger.info({ companyId, email }, "Invitation email sent");
        } catch (emailError) {
          logger.error(
            { error: emailError, email, companyId },
            "Failed to send invitation email (invitation record still created)"
          );
        }
      } else {
        logger.warn({ companyId }, "Company not found for invitation email");
      }

      res.json({
        success: true,
        invitationId,
        message: `Invitation sent to ${email}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send invitation";
      logger.error({ error: message, companyId: req.companyid }, "Send invitation error");
      res.status(500).json({ code: "INVITE_ERROR", error: message });
    }
  }
);

/**
 * PATCH /api/team/:userId
 * Update team member fullname. Target user must belong to same company.
 */
router.patch(
  "/:userId",
  validateBody(updateMemberSchema),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const targetUserId = req.params.userId;
      const companyId = req.companyid;
      const { fullname } = req.body as { fullname: string };

      if (!companyId) {
        res.status(401).json({ code: "UNAUTHORIZED", error: "Not authenticated" });
        return;
      }

      const targetUser = await db
        .select()
        .from(users)
        .where(and(eq(users.id, targetUserId), eq(users.companyid, companyId)))
        .limit(1);

      if (targetUser.length === 0) {
        res.status(404).json({ code: "USER_NOT_FOUND", error: "User not found in your company" });
        return;
      }

      const updated = await db
        .update(users)
        .set({ fullname })
        .where(and(eq(users.id, targetUserId), eq(users.companyid, companyId)))
        .returning();

      logger.info({ targetUserId, updatedBy: req.userid, companyId }, "Team member updated");

      res.json({
        success: true,
        member: {
          id: updated[0].id,
          email: updated[0].emailaddr,
          fullname: updated[0].fullname,
          active: updated[0].active,
          usertype: updated[0].usertype,
          joinedat: updated[0].joinedat,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update member";
      logger.error({ error: message, targetUserId: req.params.userId }, "Update member error");
      res.status(500).json({ code: "UPDATE_MEMBER_ERROR", error: message });
    }
  }
);

/**
 * POST /api/team/:userId/remove
 * Deactivate (soft-delete) a team member. Requires ADMIN. Cannot remove self or other ADMINs.
 */
router.post("/:userId/remove", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const companyId = req.companyid;
    const currentUserId = req.userid;
    const currentUserType = req.usertype;
    const targetUserId = req.params.userId;

    if (!companyId || !currentUserId) {
      res.status(401).json({ code: "UNAUTHORIZED", error: "Not authenticated" });
      return;
    }

    if (currentUserType !== "ADMIN") {
      res.status(403).json({ code: "FORBIDDEN", error: "Only admins can remove team members." });
      return;
    }

    if (targetUserId === currentUserId) {
      res.status(400).json({ code: "CANNOT_REMOVE_SELF", error: "Cannot remove yourself." });
      return;
    }

    const targetUser = await db
      .select()
      .from(users)
      .where(and(eq(users.id, targetUserId), eq(users.companyid, companyId)))
      .limit(1);

    if (targetUser.length === 0) {
      res.status(404).json({ code: "USER_NOT_FOUND", error: "User not found in your company" });
      return;
    }

    if (targetUser[0].usertype === "ADMIN") {
      res.status(403).json({ code: "CANNOT_REMOVE_ADMIN", error: "Admin users cannot be removed." });
      return;
    }

    await db
      .update(users)
      .set({ active: false })
      .where(and(eq(users.id, targetUserId), eq(users.companyid, companyId)));

    logger.info({ companyId, removedUserId: targetUserId, adminUserId: currentUserId }, "Team member deactivated");

    res.json({ success: true, message: "Team member removed." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to remove user";
    logger.error({ error: message, companyId: req.companyid }, "Remove user error");
    res.status(500).json({ code: "REMOVE_USER_ERROR", error: message });
  }
});

/**
 * POST /api/team/:userId/status
 * Admin sets a team member's active status (spec 002 FR-069 deactivate / FR-070 reactivate).
 * Body: { active: boolean }. Requires ADMIN. Cannot change own status or deactivate an ADMIN.
 */
router.post("/:userId/status", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const companyId = req.companyid;
    const currentUserId = req.userid;
    const currentUserType = req.usertype;
    const targetUserId = req.params.userId;
    const { active } = req.body;

    if (!companyId || !currentUserId) {
      res.status(401).json({ code: "UNAUTHORIZED", error: "Not authenticated" });
      return;
    }

    if (currentUserType !== "ADMIN") {
      res.status(403).json({ code: "FORBIDDEN", error: "Only admins can change member status." });
      return;
    }

    if (typeof active !== "boolean") {
      res.status(400).json({ code: "INVALID_BODY", error: "Field 'active' must be a boolean." });
      return;
    }

    if (targetUserId === currentUserId) {
      res.status(400).json({ code: "CANNOT_CHANGE_SELF", error: "You cannot change your own status." });
      return;
    }

    const targetUser = await db
      .select()
      .from(users)
      .where(and(eq(users.id, targetUserId), eq(users.companyid, companyId)))
      .limit(1);

    if (targetUser.length === 0) {
      res.status(404).json({ code: "USER_NOT_FOUND", error: "User not found in your company" });
      return;
    }

    if (targetUser[0].usertype === "ADMIN" && !active) {
      res.status(403).json({ code: "CANNOT_DEACTIVATE_ADMIN", error: "Admin users cannot be deactivated." });
      return;
    }

    await db
      .update(users)
      .set({ active })
      .where(and(eq(users.id, targetUserId), eq(users.companyid, companyId)));

    logger.info(
      { companyId, targetUserId, adminUserId: currentUserId, active },
      "Team member status changed",
    );

    res.json({ success: true, message: active ? "Team member reactivated." : "Team member deactivated.", active });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to change member status";
    logger.error({ error: message, companyId: req.companyid }, "Change status error");
    res.status(500).json({ code: "CHANGE_STATUS_ERROR", error: message });
  }
});

/**
 * POST /api/team/:userId/role
 * Admin changes a team member's role (spec 003 FR-066 "Change Role"; FR-074 no self-change;
 * FR-069 cannot demote the last active admin). Body: { usertype }.
 */
const ASSIGNABLE_ROLES = ["ADMIN", "TEAM_MANAGER", "TEAM_MEMBER"];
router.post("/:userId/role", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const companyId = req.companyid;
    const currentUserId = req.userid;
    const currentUserType = req.usertype;
    const targetUserId = req.params.userId;
    const { usertype } = req.body;

    if (!companyId || !currentUserId) {
      res.status(401).json({ code: "UNAUTHORIZED", error: "Not authenticated" });
      return;
    }

    if (currentUserType !== "ADMIN") {
      res.status(403).json({ code: "FORBIDDEN", error: "Only admins can change member roles." });
      return;
    }

    if (!ASSIGNABLE_ROLES.includes(usertype)) {
      res.status(400).json({ code: "INVALID_ROLE", error: `Role must be one of: ${ASSIGNABLE_ROLES.join(", ")}` });
      return;
    }

    if (targetUserId === currentUserId) {
      res.status(400).json({ code: "CANNOT_CHANGE_SELF", error: "You cannot change your own role." });
      return;
    }

    const targetUser = await db
      .select()
      .from(users)
      .where(and(eq(users.id, targetUserId), eq(users.companyid, companyId)))
      .limit(1);

    if (targetUser.length === 0) {
      res.status(404).json({ code: "USER_NOT_FOUND", error: "User not found in your company" });
      return;
    }

    if (targetUser[0].usertype === "SYSADMIN") {
      res.status(403).json({ code: "CANNOT_CHANGE_SYSADMIN", error: "Platform admins cannot be changed here." });
      return;
    }

    // FR-069 — never demote the last active admin out of the ADMIN role.
    if (targetUser[0].usertype === "ADMIN" && usertype !== "ADMIN") {
      const activeAdmins = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.companyid, companyId), eq(users.usertype, "ADMIN"), eq(users.active, true)));
      const otherActiveAdmins = activeAdmins.filter((a) => a.id !== targetUserId).length;
      if (otherActiveAdmins === 0) {
        res.status(400).json({ code: "LAST_ADMIN", error: "Cannot demote the last active admin. Assign another admin first." });
        return;
      }
    }

    await db
      .update(users)
      .set({ usertype })
      .where(and(eq(users.id, targetUserId), eq(users.companyid, companyId)));

    logger.info(
      { companyId, targetUserId, adminUserId: currentUserId, usertype },
      "Team member role changed",
    );

    res.json({ success: true, message: "Member role updated.", usertype });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to change member role";
    logger.error({ error: message, companyId: req.companyid }, "Change role error");
    res.status(500).json({ code: "CHANGE_ROLE_ERROR", error: message });
  }
});

/**
 * POST /api/team/:userId/reinvite
 * Admin re-sends an invitation email to an existing team member.
 */
router.post("/:userId/reinvite", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const companyId = req.companyid;
    const currentUserId = req.userid;
    const currentUserType = req.usertype;
    const targetUserId = req.params.userId;

    if (!companyId || !currentUserId) {
      res.status(401).json({ code: "UNAUTHORIZED", error: "Not authenticated" });
      return;
    }

    if (currentUserType !== "ADMIN") {
      res.status(403).json({ code: "FORBIDDEN", error: "Only admins can re-invite team members." });
      return;
    }

    const targetUser = await db
      .select({ id: users.id, email: users.emailaddr, companyid: users.companyid })
      .from(users)
      .where(and(eq(users.id, targetUserId), eq(users.companyid, companyId)))
      .limit(1);

    if (targetUser.length === 0) {
      res.status(404).json({ code: "USER_NOT_FOUND", error: "User not found in your company" });
      return;
    }

    const email = targetUser[0].email;
    const steps: string[] = [];

    // Delete any existing invitation for this email — DB has UNIQUE(companyid, email)
    const deleted = await db
      .delete(userinvitations)
      .where(and(eq(userinvitations.companyid, companyId), eq(userinvitations.email, email)))
      .returning();
    if (deleted.length > 0) steps.push(`Removed ${deleted.length} previous invitation record`);

    const invitationToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.insert(userinvitations).values({
      id: crypto.randomUUID(),
      companyid: companyId,
      email,
      token: invitationToken,
      status: "pending",
      expiresat: expiresAt,
    });
    steps.push(`Generated new invitation token (expires ${expiresAt.toLocaleDateString()})`);

    const company = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
    const sender = await db.select().from(users).where(eq(users.id, currentUserId)).limit(1);
    const senderName = sender?.[0]?.fullname ?? "A team member";
    const companyName = company?.[0]?.name ?? "Our company";
    const acceptLink = `${process.env.CLIENT_URL}/accept-invitation/${invitationToken}`;

    const adminCc = process.env.ADMIN_CC_EMAIL;
    const emailResult = await sendEmail(
      email,
      `You're invited to join ${companyName}`,
      getInvitationEmailHTML(email, senderName, companyName, "Team Member", null, acceptLink),
      getInvitationEmailText(email, senderName, companyName, "Team Member", null, acceptLink),
      undefined,
      adminCc,
    );
    steps.push(`Invitation email sent to ${email}${adminCc ? ` (CC: ${adminCc})` : ''}`);
    steps.push(`Mail server status: ${emailResult.status} — ID: ${emailResult.messageId}`);

    logger.info({ companyId, targetUserId, adminUserId: currentUserId }, "Re-invite email sent");
    res.json({ success: true, message: "Invitation email resent.", steps });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to re-invite user";
    logger.error({ error: message, companyId: req.companyid }, "Re-invite error");
    res.status(500).json({ code: "REINVITE_ERROR", error: message });
  }
});

/**
 * POST /api/team/invitations/:invitationId/cancel
 * Admin cancels a PENDING invitation by id (spec 003 FR-066 "Cancel Invitation").
 * Sets status to "cancelled" — the row is kept, never hard-deleted, so the accept route rejects it.
 */
router.post("/invitations/:invitationId/cancel", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const companyId = req.companyid;
    const currentUserType = req.usertype;
    const invitationId = req.params.invitationId;

    if (!companyId) {
      res.status(401).json({ code: "UNAUTHORIZED", error: "Not authenticated" });
      return;
    }

    if (currentUserType !== "ADMIN") {
      res.status(403).json({ code: "FORBIDDEN", error: "Only admins can cancel invitations." });
      return;
    }

    const cancelled = await db
      .update(userinvitations)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(userinvitations.id, invitationId),
          eq(userinvitations.companyid, companyId),
          eq(userinvitations.status, "pending"),
        ),
      )
      .returning();

    if (cancelled.length === 0) {
      res.status(404).json({ code: "INVITATION_NOT_FOUND", error: "Pending invitation not found in your company." });
      return;
    }

    logger.info({ companyId, invitationId }, "Invitation cancelled");
    res.json({ success: true, message: "Invitation cancelled." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to cancel invitation";
    logger.error({ error: message, companyId: req.companyid }, "Cancel invitation error");
    res.status(500).json({ code: "CANCEL_INVITATION_ERROR", error: message });
  }
});

/**
 * POST /api/team/invitations/:invitationId/resend
 * Admin resends a PENDING/expired invitation by id (spec 003 FR-063/FR-066 "Resend").
 * Unlike /:userId/reinvite (which needs an existing user row), this works on an
 * invitation that has not yet been accepted: new token, fresh 7-day expiry, email re-sent.
 */
router.post("/invitations/:invitationId/resend", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const companyId = req.companyid;
    const currentUserId = req.userid;
    const currentUserType = req.usertype;
    const invitationId = req.params.invitationId;

    if (!companyId || !currentUserId) {
      res.status(401).json({ code: "UNAUTHORIZED", error: "Not authenticated" });
      return;
    }

    if (currentUserType !== "ADMIN") {
      res.status(403).json({ code: "FORBIDDEN", error: "Only admins can resend invitations." });
      return;
    }

    const existing = await db
      .select()
      .from(userinvitations)
      .where(and(eq(userinvitations.id, invitationId), eq(userinvitations.companyid, companyId)))
      .limit(1);

    if (existing.length === 0) {
      res.status(404).json({ code: "INVITATION_NOT_FOUND", error: "Invitation not found in your company." });
      return;
    }

    const email = existing[0].email;
    const steps: string[] = [];

    const invitationToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db
      .update(userinvitations)
      .set({ token: invitationToken, status: "pending", expiresat: expiresAt, invitedat: new Date() })
      .where(eq(userinvitations.id, invitationId));
    steps.push(`Generated new invitation token (expires ${expiresAt.toLocaleDateString()})`);

    const company = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
    const sender = await db.select().from(users).where(eq(users.id, currentUserId)).limit(1);
    const senderName = sender?.[0]?.fullname ?? "A team member";
    const companyName = company?.[0]?.name ?? "Our company";
    const acceptLink = `${process.env.CLIENT_URL}/accept-invitation/${invitationToken}`;

    const adminCc = process.env.ADMIN_CC_EMAIL;
    const emailResult = await sendEmail(
      email,
      `You're invited to join ${companyName}`,
      getInvitationEmailHTML(email, senderName, companyName, "Team Member", null, acceptLink),
      getInvitationEmailText(email, senderName, companyName, "Team Member", null, acceptLink),
      undefined,
      adminCc,
    );
    steps.push(`Invitation email sent to ${email}${adminCc ? ` (CC: ${adminCc})` : ''}`);
    steps.push(`Mail server status: ${emailResult.status} — ID: ${emailResult.messageId}`);

    logger.info({ companyId, invitationId, adminUserId: currentUserId }, "Invitation resent");
    res.json({ success: true, message: "Invitation email resent.", steps });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to resend invitation";
    logger.error({ error: message, companyId: req.companyid }, "Resend invitation error");
    res.status(500).json({ code: "RESEND_INVITATION_ERROR", error: message });
  }
});

/**
 * POST /api/team/:userId/reset-password
 * Admin-triggered password reset — sends a reset link to the user's email.
 */
router.post("/:userId/reset-password", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const companyId = req.companyid;
    const currentUserId = req.userid;
    const currentUserType = req.usertype;
    const targetUserId = req.params.userId;

    if (!companyId || !currentUserId) {
      res.status(401).json({ code: "UNAUTHORIZED", error: "Not authenticated" });
      return;
    }

    if (currentUserType !== "ADMIN") {
      res.status(403).json({ code: "FORBIDDEN", error: "Only admins can reset team member passwords." });
      return;
    }

    const targetUser = await db
      .select({ id: users.id, email: users.emailaddr, companyid: users.companyid })
      .from(users)
      .where(and(eq(users.id, targetUserId), eq(users.companyid, companyId)))
      .limit(1);

    if (targetUser.length === 0) {
      res.status(404).json({ code: "USER_NOT_FOUND", error: "User not found in your company" });
      return;
    }

    const steps: string[] = [];

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) throw new Error("JWT_SECRET environment variable is not set");

    const token = jwt.sign(
      { userid: targetUser[0].id, purpose: "password-reset" },
      jwtSecret,
      { expiresIn: "24h" },
    );
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db.insert(passwordresettokens).values({
      userid: targetUser[0].id,
      tokenhash: tokenHash,
      expiresat: expiresAt,
      attemptcount: 0,
    });
    steps.push(`Generated password reset token (expires ${expiresAt.toLocaleDateString()})`);

    const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
    const resetLink = `${clientUrl}/reset-password?token=${token}`;
    const adminCc = process.env.ADMIN_CC_EMAIL;
    const emailResult = await sendEmail(
      targetUser[0].email,
      "Your Password Has Been Reset - wxKanban",
      getPasswordResetEmailHTML(resetLink, targetUser[0].email),
      getPasswordResetEmailText(resetLink, targetUser[0].email),
      undefined,
      adminCc,
    );
    steps.push(`Reset email sent to ${targetUser[0].email}${adminCc ? ` (CC: ${adminCc})` : ''}`);
    steps.push(`Mail server status: ${emailResult.status} — ID: ${emailResult.messageId}`);

    logger.info({ companyId, targetUserId, adminUserId: currentUserId }, "Admin-triggered password reset sent");

    res.json({ success: true, message: "Password reset email sent.", steps });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send password reset";
    logger.error({ error: message, companyId: req.companyid }, "Reset password error");
    res.status(500).json({ code: "RESET_PASSWORD_ERROR", error: message });
  }
});

export default router;
