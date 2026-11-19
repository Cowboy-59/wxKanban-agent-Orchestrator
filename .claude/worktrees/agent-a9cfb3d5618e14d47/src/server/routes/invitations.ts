import { Router, Response, type Request } from "express";
import { z } from "zod";
import multer from "multer";
import Papa from "papaparse";
import {
  createInvitation,
  validateInvitation,
  acceptInvitation as acceptInvitationService,
  revokeInvitation,
  resendInvitation,
} from "../services/InvitationService";

import { authenticateToken, requireAuth, AuthRequest } from "../middleware/auth.js";
import { validateBody } from "../middleware/validation.js";
import { createLogger } from "../lib/logger.js";
import { sendEmail } from "../lib/email.js";
import { getInvitationEmailHTML, getInvitationEmailText } from "../lib/emailTemplates.js";
// Use the shared postgres-js client (prepare:false, pooler-safe) like every
// other route. The legacy lib/db.ts pool sets strict TLS (rejectUnauthorized)
// in production, which fails against the Supabase pooler and surfaced as a raw
// "Failed query: select billingplan, maxusers from companies..." in the Invite
// Team Member modal.
import { db } from "~/server/db/client.js";
import { userinvitations, invitationbatches, userprofiles, companies } from "~/db/schema/index.js";


import { eq, and, desc, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";


const router = Router();
const logger = createLogger("invitations-routes");

// Configure multer for CSV uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (
    _req: Request,
    file: { mimetype: string; originalname: string },
    cb: (error: Error | null, acceptFile?: boolean) => void
  ) => {
    if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV files are allowed"));
    }
  },
});

const sendInvitationSchema = z.object({
  emails: z.array(z.string().email()).min(1).max(50),
  usertype: z.enum(["TEAM_MEMBER", "TEAM_MANAGER", "ADMIN"]).default("TEAM_MEMBER"),
  message: z.string().max(500).optional(),
});

/**
 * Check seat limits and tier requirements for invitations
 */
async function validateInvitationConstraints(
  companyId: string,
  invitationCount: number,
  usertype: string
): Promise<{ valid: boolean; error?: string; code?: string; upgrade?: boolean; requiredPlan?: string }> {
  // Get company details
  const company = await db
    .select({
      billingplan: companies.billingplan,
      maxusers: companies.maxusers,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  if (company.length === 0) {
    return { valid: false, error: "Company not found", code: "COMPANY_NOT_FOUND" };
  }

  const { billingplan, maxusers } = company[0];

  // Check tier requirement for TEAM_MANAGER role
  if (usertype === "TEAM_MANAGER" && !["CONSULTANT", "ENTERPRISE"].includes(billingplan)) {
    return {
      valid: false,
      error: "Team Manager role requires CONSULTANT plan or higher",
      code: "PLAN_UPGRADE_REQUIRED",
      upgrade: true,
      requiredPlan: "CONSULTANT",
    };
  }

  // Count current users
  const userCountResult = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(userprofiles)
    .where(eq(userprofiles.companyid, companyId));

  const currentUserCount = userCountResult[0]?.count || 0;

  // Count pending invitations
  const pendingInvitationsResult = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(userinvitations)
    .where(
      and(
        eq(userinvitations.companyid, companyId),
        eq(userinvitations.status, "pending")
      )
    );

  const pendingInvitations = pendingInvitationsResult[0]?.count || 0;

  // Calculate total seats that would be used
  const totalSeatsNeeded = currentUserCount + pendingInvitations + invitationCount;
  const availableSeats = maxusers - currentUserCount - pendingInvitations;

  if (totalSeatsNeeded > maxusers) {
    return {
      valid: false,
      error: `Cannot invite ${invitationCount} user(s). Only ${availableSeats} seats available on your ${billingplan} plan.`,
      code: "SEAT_LIMIT_EXCEEDED",
      upgrade: true,
      requiredPlan: "CONSULTANT",
    };
  }

  return { valid: true };
}


const acceptInvitationSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().optional(),
});

/**
 * POST /api/invitations/send
 * Send invitations to one or more email addresses
 */
router.post(
  "/send",
  authenticateToken,
  requireAuth,
  validateBody(sendInvitationSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { emails, usertype, message } = req.body;
      const companyId = req.companyid;
      const invitedBy = req.userid;

      if (!companyId || !invitedBy) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Validate seat limits and tier requirements
      const validation = await validateInvitationConstraints(companyId, emails.length, usertype);
      if (!validation.valid) {
        return res.status(validation.code === "SEAT_LIMIT_EXCEEDED" ? 409 : 403).json({
          error: validation.error,
          code: validation.code,
          upgrade: validation.upgrade,
          requiredPlan: validation.requiredPlan,
        });
      }

      const results = {
        successful: [] as Array<{ email: string; invitationId: string }>,
        failed: [] as Array<{ email: string; error: string }>,
      };

      for (const email of emails) {
        try {
          const invitation = await createInvitation({
            email,
            usertype: usertype as any,
            companyId,
            invitedBy,
            message,
          });

          results.successful.push({
            email,
            invitationId: invitation.id,
          });

          // Send invitation email
          try {
            const company = await db
              .select({ name: companies.name })
              .from(companies)
              .where(eq(companies.id, companyId))
              .limit(1);

            const companyName = company[0]?.name || "Your Company";
            const inviter = await db
              .select({ fullname: userprofiles.fullname })
              .from(userprofiles)
              .where(eq(userprofiles.id, invitedBy))
              .limit(1);
            
            const inviterName = inviter[0]?.fullname || "A team member";
            const acceptLink = `${process.env.CLIENT_URL || 'http://localhost:5173'}/accept-invitation/${invitation.token}`;

            await sendEmail(
              email,
              `You've been invited to join ${companyName} on wxKanban`,
              getInvitationEmailHTML(email, inviterName, companyName, usertype, message || null, acceptLink),
              getInvitationEmailText(email, inviterName, companyName, usertype, message || null, acceptLink)
            );

            logger.info({ email, invitationId: invitation.id }, "Invitation email sent");
          } catch (emailError) {
            logger.error({ error: emailError, email, invitationId: invitation.id }, "Failed to send invitation email");
            // Don't fail the request if email fails - invitation is still created
          }
        } catch (error) {

          const errorMessage = error instanceof Error ? error.message : "Failed to send invitation";
          results.failed.push({ email, error: errorMessage });
          logger.warn({ email, error: errorMessage }, "Failed to send invitation");
        }
      }

      return res.status(200).json({
        success: true,
        message: `Sent ${results.successful.length} invitations, ${results.failed.length} failed`,
        results,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send invitations";
      logger.error({ error: message }, "Send invitations error");
      return res.status(500).json({ error: message });
    }
  }
);

/**
 * POST /api/invitations/send-bulk
 * Bulk invite users via CSV upload
 */
router.post(
  "/send-bulk",
  authenticateToken,
  requireAuth,
  upload.single("file"),
  async (req: AuthRequest, res: Response) => {
    try {
      const file = (req as AuthRequest & { file?: { buffer: Buffer } }).file;
      if (!file) {
        return res.status(400).json({ error: "CSV file is required" });
      }

      const companyId = req.companyid;
      const invitedBy = req.userid;

      if (!companyId || !invitedBy) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Parse CSV
      const csvContent = file.buffer.toString("utf-8");
      const parseResult = Papa.parse(csvContent, {
        header: true,
        skipEmptyLines: true,
      }) as {
        data: Array<Record<string, string>>;
        errors: Array<{ message: string; row?: number; type?: string; code?: string }>;
        meta: { fields?: string[] };
      };

      if (parseResult.errors.length > 0) {
        return res.status(400).json({
          error: "CSV parsing failed",
          details: parseResult.errors,
        });
      }

      // Validate required columns
      const requiredColumns = ["email"];
      const columns = parseResult.meta.fields || [];
      const missingColumns = requiredColumns.filter((col) => !columns.includes(col));

      if (missingColumns.length > 0) {
        return res.status(400).json({
          error: `Missing required columns: ${missingColumns.join(", ")}`,
        });
      }

      // Create batch record
      const batchId = uuidv7();
      const totalCount = parseResult.data.length;

      if (totalCount > 50) {
        return res.status(400).json({ error: "Maximum 50 invitations allowed per batch" });
      }

      await db.insert(invitationbatches).values({
        batchid: batchId,
        projectid: companyId,
        userid: invitedBy,
        totalcount: totalCount,
        successcount: 0,
        failedcount: 0,
        status: "queued",
      });

      // Process invitations
      const results = {
        successful: [] as Array<{ email: string; invitationId: string }>,
        failed: [] as Array<{ email: string; error: string }>,
      };

      // Pre-validate all rows for seat limits and tier requirements
      const validRows: Array<{ email: string; usertype: "TEAM_MEMBER" | "TEAM_MANAGER" | "ADMIN" }> = [];
      let teamManagerCount = 0;

      for (const row of parseResult.data) {
        const email = row.email?.trim();
        const rawUsertype = row.usertype || row.role || "TEAM_MEMBER";
        const usertype: "TEAM_MEMBER" | "TEAM_MANAGER" | "ADMIN" =
          rawUsertype === "TEAM_MANAGER" || rawUsertype === "ADMIN" ? rawUsertype : "TEAM_MEMBER";

        if (!email) {
          results.failed.push({ email: "unknown", error: "Email is required" });
          continue;
        }

        if (usertype === "TEAM_MANAGER") {
          teamManagerCount++;
        }

        validRows.push({ email, usertype });
      }

      // Check if any TEAM_MANAGER roles require upgrade
      if (teamManagerCount > 0) {
        const company = await db
          .select({ billingplan: companies.billingplan })
          .from(companies)
          .where(eq(companies.id, companyId))
          .limit(1);

        if (company.length > 0 && !["CONSULTANT", "ENTERPRISE"].includes(company[0].billingplan)) {
          return res.status(403).json({
            error: "Team Manager role requires CONSULTANT plan or higher",
            code: "PLAN_UPGRADE_REQUIRED",
            upgrade: true,
            requiredPlan: "CONSULTANT",
            teamManagerCount,
          });
        }
      }

      // Validate seat limits for total count
      const validation = await validateInvitationConstraints(companyId, validRows.length, "TEAM_MEMBER");
      if (!validation.valid) {
        return res.status(validation.code === "SEAT_LIMIT_EXCEEDED" ? 409 : 403).json({
          error: validation.error,
          code: validation.code,
          upgrade: validation.upgrade,
          requiredPlan: validation.requiredPlan,
        });
      }

      // Get company and inviter info once for all emails
      const company = await db
        .select({ name: companies.name })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);
      const companyName = company[0]?.name || "Your Company";

      const inviter = await db
        .select({ fullname: userprofiles.fullname })
        .from(userprofiles)
        .where(eq(userprofiles.id, invitedBy))
        .limit(1);
      const inviterName = inviter[0]?.fullname || "A team member";

      // Process invitations
      for (const { email, usertype } of validRows) {
        try {
          const invitation = await createInvitation({
            email,
            usertype,
            companyId,
            invitedBy,
          });

          results.successful.push({
            email,
            invitationId: invitation.id,
          });

          // Send invitation email
          try {
            const acceptLink = `${process.env.CLIENT_URL || 'http://localhost:5173'}/accept-invitation/${invitation.token}`;
            await sendEmail(
              email,
              `You've been invited to join ${companyName} on wxKanban`,
              getInvitationEmailHTML(email, inviterName, companyName, usertype, null, acceptLink),
              getInvitationEmailText(email, inviterName, companyName, usertype, null, acceptLink)
            );
          } catch (emailError) {
            logger.error({ error: emailError, email, invitationId: invitation.id }, "Failed to send bulk invitation email");
            // Don't fail the batch if one email fails
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Failed to create invitation";
          results.failed.push({ email, error: errorMessage });
        }
      }



      // Update batch status
      await db
        .update(invitationbatches)
        .set({
          status: "completed",
          successcount: results.successful.length,
          failedcount: results.failed.length,
          completedat: new Date(),
        })
        .where(eq(invitationbatches.batchid, batchId));

      return res.status(200).json({
        success: true,
        batchId,
        message: `Processed ${totalCount} invitations: ${results.successful.length} successful, ${results.failed.length} failed`,
        results,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bulk invitation failed";
      logger.error({ error: message }, "Bulk invitation error");
      return res.status(500).json({ error: message });
    }
  }
);

/**
 * GET /api/invitations/status/:batchId
 * Get batch progress and status
 */
router.get(
  "/status/:batchId",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const { batchId } = req.params;

      const batch = await db
        .select()
        .from(invitationbatches)
        .where(eq(invitationbatches.batchid, batchId))
        .then((rows) => rows[0]);

      if (!batch) {
        return res.status(404).json({ error: "Batch not found" });
      }

      // Check authorization
      if (batch.userid !== req.userid && req.usertype !== "ADMIN") {
        return res.status(403).json({ error: "Not authorized to view this batch" });
      }

      return res.json({
        batchId: batch.batchid,
        status: batch.status,
        total: batch.totalcount,
        successful: batch.successcount,
        failed: batch.failedcount,
        createdAt: batch.createdat,
        completedAt: batch.completedat,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to get batch status";
      logger.error({ error: message }, "Batch status error");
      return res.status(500).json({ error: message });
    }
  }
);

/**
 * POST /api/invitations/accept/:token
 * Accept an invitation and create user account
 */
router.post(
  "/accept/:token",
  validateBody(acceptInvitationSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { token } = req.params;
      const { password, firstName, lastName } = req.body;

      // Validate invitation
      const validation = await validateInvitation(token);
      
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error || 'Invalid invitation' });
      }

      // Accept invitation and create user
      const result = await acceptInvitationService({
        token,
        firstName,
        lastName,
        password,
      });

      if (!result.success) {

        return res.status(400).json({ error: result.error || 'Failed to accept invitation' });
      }

      // Update user profile with name
      if ((firstName || lastName) && result.userId) {
        await db
          .update(userprofiles)
          .set({
            fullname: `${firstName || ""} ${lastName || ""}`.trim(),
          })
          .where(eq(userprofiles.id, result.userId));
      }


      logger.info(
        { userId: result.userId },
        "Invitation accepted and user created"
      );

      return res.json({
        success: true,
        message: "Invitation accepted successfully",
        userId: result.userId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to accept invitation";
      logger.error({ error: message }, "Accept invitation error");
      return res.status(400).json({ error: message });
    }
  }
);

/**
 * GET /api/invitations
 * List all invitations for the company
 */
router.get(
  "/",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const companyId = req.companyid;
      const status = req.query.status as string | undefined;

      if (!companyId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const conditions = [eq(userinvitations.companyid, companyId)];
      
      if (status) {
        conditions.push(eq(userinvitations.status, status));
      }

      const invitations = await db
        .select({
          id: userinvitations.id,
          email: userinvitations.email,
          usertype: userinvitations.usertype,
          status: userinvitations.status,
          invitedAt: userinvitations.invitedat,
          acceptedAt: userinvitations.acceptedat,
          expiresAt: userinvitations.expiresat,
        })
        .from(userinvitations)
        .where(and(...conditions))
        .orderBy(desc(userinvitations.invitedat));


      return res.json({
        success: true,
        invitations,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to get invitations";
      logger.error({ error: message }, "Get invitations error");
      return res.status(500).json({ error: message });
    }
  }
);

/**
 * POST /api/invitations/:id/revoke
 * Revoke a pending invitation
 */
router.post(
  "/:id/revoke",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const cancelledBy = req.userid!;

      const success = await revokeInvitation(id, cancelledBy);

      if (!success) {
        return res.status(400).json({ error: "Failed to revoke invitation" });
      }

      logger.info({ invitationId: id, cancelledBy }, "Invitation revoked");

      return res.json({
        success: true,
        message: "Invitation revoked successfully",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to revoke invitation";
      logger.error({ error: message }, "Revoke invitation error");
      return res.status(400).json({ error: message });
    }
  }
);

/**
 * POST /api/invitations/:id/resend
 * Resend an invitation with new token
 */
router.post(
  "/:id/resend",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      const invitation = await resendInvitation(id);

      if (!invitation) {
        return res.status(404).json({ error: "Invitation not found or cannot be resent" });
      }

      // Send new invitation email
      try {
        const company = await db
          .select({ name: companies.name })
          .from(companies)
          .where(eq(companies.id, invitation.companyId))
          .limit(1);

        const inviter = await db
          .select({ fullname: userprofiles.fullname })
          .from(userprofiles)
          .where(eq(userprofiles.id, req.userid!))
          .limit(1);

        const companyName = company[0]?.name || "Your Company";
        const inviterName = inviter[0]?.fullname || "A team member";
        const acceptLink = `${process.env.CLIENT_URL || 'http://localhost:5173'}/accept-invitation/${invitation.token}`;

        await sendEmail(
          invitation.email,
          `Reminder: You've been invited to join ${companyName} on wxKanban`,
          getInvitationEmailHTML(invitation.email, inviterName, companyName, invitation.usertype, null, acceptLink),
          getInvitationEmailText(invitation.email, inviterName, companyName, invitation.usertype, null, acceptLink)
        );

        logger.info({ invitationId: id, email: invitation.email }, "Resent invitation email");
      } catch (emailError) {
        logger.error({ error: emailError, invitationId: id }, "Failed to resend invitation email");
        // Don't fail if email fails - invitation token was still updated
      }


      return res.json({
        success: true,
        message: "Invitation resent successfully",
        invitation,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to resend invitation";
      logger.error({ error: message }, "Resend invitation error");
      return res.status(400).json({ error: message });
    }
  }
);

export default router;
